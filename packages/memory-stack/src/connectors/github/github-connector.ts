/**
 * GitHub Connector
 * ================
 * Ingests repositories, files, commits, pull requests, and issues.
 * Optimized for 10M+ files with streaming and smart filtering.
 *
 * Track 1 MVP — Multi-Branch + Release Tracking
 * ─────────────────────────────────────────────
 * Configure `branches` to ingest specific release branches (e.g. 'release/6.3.4').
 * Configure `releaseVersionMap` to assign a clean version label to each branch.
 * Configure `teamBranchMap` to assign a logical team label to each branch.
 * All signals emitted will carry branch_name, release_version, team_label fields
 * so SE-aaS can answer branch-scoped and team-scoped queries.
 */

import { ConnectorBase, IngestionResult, IngestionOptions } from '../base/connector-base.js';
import { RateLimitConfig } from '../base/rate-limiter.js';
import { Signal } from '../base/stream-processor.js';
import { Checkpoint } from '../base/checkpoint-manager.js';
import { linkPRToJira, linkCommitToJira } from '../cross-domain-linker.js';
import { createCodeParser } from '../../code-indexing/code-parser.js';
import { createCodeEmbedder } from '../../code-indexing/code-embedder.js';
import { generateEmbedding, hashContent } from '../../core/embeddings/embedding-engine.js';

interface GitHubCredentials {
  accessToken: string;
  githubLogin?: string;
  /**
   * Specific branches to ingest. If omitted, falls back to each repo's default branch.
   * Example: ['release/6.3.4', 'release/5.11.5-enterprise']
   */
  branches?: string[];
  /**
   * Maps branch name → normalised release version label.
   * Example: { 'release/6.3.4': '6.3.4', 'release/5.11.5-enterprise': '5.11.5' }
   */
  releaseVersionMap?: Record<string, string>;
  /**
   * Maps branch name → logical team label.
   * Example: { 'release/6.3.4': 'team-634', 'release/5.11.5-enterprise': 'team-5115' }
   */
  teamBranchMap?: Record<string, string>;
}

interface Repository {
  id: number;
  full_name: string;
  name: string;
  description: string;
  language: string;
  default_branch: string;
  size: number;
  stargazers_count: number;
  private: boolean;
  updated_at: string;
}

interface TreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export class GitHubConnector extends ConnectorBase {
  readonly connectorType = 'github';

  // Singletons: factories are stateless, create once per connector instance
  private readonly codeParser = createCodeParser();
  private readonly codeEmbedder = createCodeEmbedder();

  constructor(
    organizationId: string,
    private githubCreds: GitHubCredentials,
    supabase: any,
    redis?: any
  ) {
    super(organizationId, githubCreds, supabase, redis);
  }

  protected getRateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 5000, // GitHub authenticated rate limit
      backoffMultiplier: 2,
      maxRetries: 5,
      initialBackoffMs: 2000,
    };
  }

  /**
   * Initial load: Fetch all repos, files, commits, PRs, issues
   */
  protected async initialLoad(): Promise<IngestionResult> {
    console.log('[GitHub] Starting initial load...');
    let totalSignals = 0;

    try {
      // 1. Get all accessible repositories
      const repos = await this.getRepositories();
      console.log(`[GitHub] Found ${repos.length} repositories`);

      for (let i = 0; i < repos.length; i++) {
        const repo = repos[i];
        console.log(`[GitHub] Processing ${repo.full_name} (${i + 1}/${repos.length})`);

        // 2. Ingest repository metadata (branch-agnostic)
        await this.ingestRepoMetadata(repo);
        totalSignals++;

        // ── Multi-Branch: determine which branches to ingest ──────────────────
        // If the connector was configured with explicit `branches`, use those.
        // Otherwise fall back to the repo's default_branch (original behaviour).
        const targetBranches: string[] =
          this.githubCreds.branches && this.githubCreds.branches.length > 0
            ? this.githubCreds.branches
            : [repo.default_branch];

        console.log(`[GitHub] ${repo.full_name}: ingesting branches → [${targetBranches.join(', ')}]`);

        for (const branch of targetBranches) {
          const releaseVersion = this.resolveReleaseVersion(branch);
          const teamLabel = this.resolveTeamLabel(branch);

          console.log(`[GitHub]   branch="${branch}" version="${releaseVersion ?? 'n/a'}" team="${teamLabel ?? 'n/a'}"`);

          // 3. Ingest file tree for this branch
          const fileSignals = await this.ingestFileTree(repo, branch, releaseVersion, teamLabel);
          totalSignals += fileSignals;

          // 4. Ingest recent commits (last 100) for this branch
          const commitSignals = await this.ingestRecentCommits(repo, 100, branch, releaseVersion, teamLabel);
          totalSignals += commitSignals;

          // 5. Ingest open pull requests targeting this branch
          const prSignals = await this.ingestPullRequests(repo, 'open', branch, releaseVersion, teamLabel);
          totalSignals += prSignals;

          // 6. Ingest open issues (issues are not branch-specific, ingest once per repo on first branch)
          if (branch === targetBranches[0]) {
            const issueSignals = await this.ingestIssues(repo, 'open');
            totalSignals += issueSignals;
          }
        }

        // Save checkpoint after each repo
        const progress = ((i + 1) / repos.length) * 100;
        await this.saveCheckpoint(
          {
            lastRepo: repo.full_name,
            reposProcessed: i + 1,
            totalRepos: repos.length,
            branches: targetBranches,
          },
          Math.floor(progress)
        );
      }

      console.log(`[GitHub] Initial load complete: ${totalSignals} signals`);
      return { success: true, signalsIngested: totalSignals };
    } catch (error: any) {
      console.error('[GitHub] Initial load failed:', error);
      return { success: false, signalsIngested: totalSignals, errors: [error.message] };
    }
  }

  /**
   * Incremental sync: Only new commits/PRs/issues since last sync
   */
  protected async incrementalSync(): Promise<IngestionResult> {
    console.log('[GitHub] Starting incremental sync...');
    let totalSignals = 0;

    try {
      const checkpoint = await this.checkpointManager.getCheckpoint(
        this.organizationId,
        this.connectorType
      );

      const since = checkpoint?.updated_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const repos = await this.getRepositories();

      for (const repo of repos) {
        // Determine target branches (same logic as initialLoad)
        const targetBranches: string[] =
          this.githubCreds.branches && this.githubCreds.branches.length > 0
            ? this.githubCreds.branches
            : [repo.default_branch];

        for (const branch of targetBranches) {
          const releaseVersion = this.resolveReleaseVersion(branch);
          const teamLabel = this.resolveTeamLabel(branch);

          // New commits on this branch since last sync
          const commits = await this.getCommitsSince(repo, since, branch);
          for (const commit of commits) {
            const signal = this.transformCommitToSignal(repo, commit, branch, releaseVersion, teamLabel);
            await this.streamProcessor.addSignal(signal);
            totalSignals++;

            const commitMsg = commit.commit?.message || '';
            if (commitMsg.length > 0) {
              try {
                await linkCommitToJira(this.supabase, this.organizationId, repo.name, {
                  sha: commit.sha,
                  message: commitMsg,
                }, { branch_name: branch, release_version: releaseVersion });
              } catch { /* non-critical */ }
            }
          }

          // Updated PRs targeting this branch
          const prs = await this.getPullRequestsUpdatedSince(repo, since, branch);
          for (const pr of prs) {
            const signal = this.transformPRToSignal(repo, pr, branch, releaseVersion, teamLabel);
            await this.streamProcessor.addSignal(signal);
            totalSignals++;

            try {
              await linkPRToJira(this.supabase, this.organizationId, repo.name, {
                number: pr.number,
                title: pr.title,
                body: pr.body,
                head: { ref: pr.head?.ref },
              }, { branch_name: branch, release_version: releaseVersion });
            } catch { /* non-critical */ }

            // Reviews for each PR
            try {
              const reviews = await this.rateLimiter.throttle(() =>
                this.githubFetch(`/repos/${repo.full_name}/pulls/${pr.number}/reviews`)
              );
              for (const review of reviews) {
                if (review.user && new Date(review.submitted_at) > new Date(since)) {
                  const reviewSignal = this.transformReviewToSignal(repo, pr, review, branch, releaseVersion, teamLabel);
                  await this.streamProcessor.addSignal(reviewSignal);
                  totalSignals++;
                }
              }
            } catch { /* continue */ }
          }
        }

        // Issues are not branch-specific — sync once per repo
        const issues = await this.getIssuesUpdatedSince(repo, since);
        for (const issue of issues) {
          const signal = this.transformIssueToSignal(repo, issue);
          await this.streamProcessor.addSignal(signal);
          totalSignals++;
        }
      }

      await this.streamProcessor.flush();

      console.log(`[GitHub] Incremental sync complete: ${totalSignals} signals`);
      return { success: true, signalsIngested: totalSignals };
    } catch (error: any) {
      console.error('[GitHub] Incremental sync failed:', error);
      return { success: false, signalsIngested: totalSignals, errors: [error.message] };
    }
  }

  /**
   * Resume from checkpoint
   */
  protected async resumeIngestion(checkpoint: Checkpoint): Promise<IngestionResult> {
    console.log('[GitHub] Resuming from checkpoint:', checkpoint.state);

    // Resume by continuing from lastRepo
    const lastRepo = checkpoint.state.lastRepo;
    const repos = await this.getRepositories();
    const resumeIndex = repos.findIndex((r) => r.full_name === lastRepo) + 1;

    console.log(`[GitHub] Resuming from repo ${resumeIndex}/${repos.length}`);

    // Continue initial load from resume point
    let totalSignals = checkpoint.signals_ingested || 0;

    for (let i = resumeIndex; i < repos.length; i++) {
      const repo = repos[i];
      const fileSignals = await this.ingestFileTree(repo);
      totalSignals += fileSignals;

      const progress = ((i + 1) / repos.length) * 100;
      await this.saveCheckpoint(
        {
          lastRepo: repo.full_name,
          reposProcessed: i + 1,
          totalRepos: repos.length,
        },
        Math.floor(progress)
      );
    }

    return { success: true, signalsIngested: totalSignals };
  }

  /**
   * Get all accessible repositories
   */
  private async getRepositories(): Promise<Repository[]> {
    const repos: Repository[] = [];
    let page = 1;

    while (true) {
      const response = await this.rateLimiter.throttle(() =>
        this.githubFetch(`/user/repos?per_page=100&page=${page}&sort=updated`)
      );

      if (response.length === 0) break;

      repos.push(...response);
      page++;

      if (response.length < 100) break; // Last page
    }

    return repos;
  }

  /**
   * Ingest repository metadata
   */
  private async ingestRepoMetadata(repo: Repository): Promise<void> {
    const eventTime = repo.updated_at;
    const signal: Signal = {
      organization_id: this.organizationId,
      source_domain: 'engineering.github',
      signal_type: 'repository_metadata',
      signal_value: repo.size || 0,
      entity_type: 'repository',
      entity_id: repo.full_name,
      signal_metadata: {
        repo_id: repo.id,
        repo_name: repo.full_name,
        language: repo.language,
        stars: repo.stargazers_count,
        is_private: repo.private,
        default_branch: repo.default_branch,
        size: repo.size,
        description: repo.description || '',
      },
      created_at: eventTime,
      signal_timestamp: eventTime,
    };

    await this.streamProcessor.addSignal(signal);
  }

  // ── Branch & Release Resolver Helpers ──────────────────────────────────────

  /**
   * Returns the normalised release version label for a branch, or the branch
   * name itself as a fallback.
   * e.g. 'release/6.3.4' → '6.3.4'  (if configured)
   */
  private resolveReleaseVersion(branch: string): string | undefined {
    return this.githubCreds.releaseVersionMap?.[branch];
  }

  /**
   * Returns the logical team label for a branch.
   * e.g. 'release/5.11.5-enterprise' → 'team-5115'  (if configured)
   */
  private resolveTeamLabel(branch: string): string | undefined {
    return this.githubCreds.teamBranchMap?.[branch];
  }

  // ── Ingestion Methods (branch-aware) ───────────────────────────────────────

  /**
   * Ingest file tree (streaming, skip binaries)
   */
  private async ingestFileTree(
    repo: Repository,
    branch?: string,
    releaseVersion?: string,
    teamLabel?: string,
  ): Promise<number> {
    let filesIngested = 0;
    const targetBranch = branch ?? repo.default_branch;

    // Get git tree recursively for the target branch
    const tree = await this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/git/trees/${targetBranch}?recursive=1`)
    );

    if (!tree.tree) return 0;

    // Filter: only code files, skip binaries/node_modules/vendor
    const codeFiles = tree.tree.filter((file: TreeItem) => {
      if (file.type !== 'blob') return false;
      if (file.size && file.size > 1_000_000) return false; // Skip files > 1MB
      if (this.isBinaryFile(file.path)) return false;
      if (this.isIgnoredPath(file.path)) return false;
      return true;
    });

    console.log(`[GitHub] ${repo.full_name}: Processing ${codeFiles.length} code files`);

    // Process in batches of 50 files
    for (let i = 0; i < codeFiles.length; i += 50) {
      const batch = codeFiles.slice(i, i + 50);

      // Parallel fetch with rate limiting
      const fileContents = await Promise.all(
        batch.map((file: TreeItem) =>
          this.rateLimiter.throttle(() => this.getFileContent(repo, file.path))
        )
      );

      // Transform to signals (carry branch context)
      const signals = fileContents
        .map((content, idx) => {
          if (!content) return null;
          return this.transformFileToSignal(repo, batch[idx], content, targetBranch, releaseVersion, teamLabel);
        })
        .filter((s): s is Signal => s !== null);

      // Batch insert signals
      await this.batchInsertSignals(signals);
      filesIngested += signals.length;

      // Parse symbols + emit dependency signals (NB-017 + NB-018)
      // Run after signal insert so a parse failure never blocks file ingestion.
      // Parallelise within each batch of 50 — each file is independent.
      await Promise.allSettled(
        fileContents.map((content, idx) => {
          if (!content) return Promise.resolve();
          return this.parseAndEmbedFile(
            content,
            batch[idx].path,
            repo.full_name,
            targetBranch,
            releaseVersion,
            teamLabel,
          );
        })
      );

      // Save checkpoint every 500 files
      if (filesIngested % 500 === 0) {
        await this.saveCheckpoint({
          lastRepo: repo.full_name,
          lastFile: batch[batch.length - 1].path,
          filesProcessed: filesIngested,
        });
      }
    }

    return filesIngested;
  }

  /**
   * Ingest recent commits on a specific branch
   */
  private async ingestRecentCommits(
    repo: Repository,
    count: number,
    branch?: string,
    releaseVersion?: string,
    teamLabel?: string,
  ): Promise<number> {
    const targetBranch = branch ?? repo.default_branch;
    const commits = await this.rateLimiter.throttle(() =>
      this.githubFetch(
        `/repos/${repo.full_name}/commits?sha=${encodeURIComponent(targetBranch)}&per_page=${Math.min(count, 100)}`
      )
    );

    const signals = commits.map((commit: any) =>
      this.transformCommitToSignal(repo, commit, targetBranch, releaseVersion, teamLabel)
    );
    await this.batchInsertSignals(signals);

    // Cross-domain linking: parse commit messages for Jira ticket references
    for (const commit of commits) {
      const message = commit.commit?.message || '';
      if (message.length > 0) {
        try {
          await linkCommitToJira(this.supabase, this.organizationId, repo.name, {
            sha: commit.sha,
            message,
          }, { branch_name: targetBranch, release_version: releaseVersion });
        } catch {
          // Non-critical: continue even if linking fails
        }
      }
    }

    return signals.length;
  }

  /**
   * Ingest pull requests targeting a specific base branch.
   * GitHub's PR list API supports filtering by `base` (the target branch).
   */
  private async ingestPullRequests(
    repo: Repository,
    state: 'open' | 'closed' | 'all',
    branch?: string,
    releaseVersion?: string,
    teamLabel?: string,
  ): Promise<number> {
    // If a branch is specified, filter PRs that target that branch (base=branch).
    // This ensures we only pull PRs going INTO the release branch, not unrelated work.
    const branchFilter = branch ? `&base=${encodeURIComponent(branch)}` : '';
    const prs = await this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/pulls?state=${state}&per_page=100${branchFilter}`)
    );

    const signals: Signal[] = [];
    const targetBranch = branch ?? repo.default_branch;

    // Process each PR and fetch its reviews
    for (const pr of prs) {
      // Add PR signal with branch context
      signals.push(this.transformPRToSignal(repo, pr, targetBranch, releaseVersion, teamLabel));

      // Cross-domain linking: parse PR title/branch/body for Jira ticket references
      try {
        await linkPRToJira(this.supabase, this.organizationId, repo.name, {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          head: { ref: pr.head?.ref },
        }, { branch_name: targetBranch, release_version: releaseVersion });
      } catch (linkErr) {
        console.warn(`[GitHub] Cross-domain link failed for PR #${pr.number}:`, linkErr);
      }

      // Fetch and add review signals (critical for P0 Bottleneck Detection)
      try {
        const reviews = await this.rateLimiter.throttle(() =>
          this.githubFetch(`/repos/${repo.full_name}/pulls/${pr.number}/reviews`)
        );

        for (const review of reviews) {
          if (review.user) {
            signals.push(this.transformReviewToSignal(repo, pr, review, targetBranch, releaseVersion, teamLabel));
          }
        }
      } catch (error) {
        console.warn(`[GitHub] Failed to fetch reviews for PR #${pr.number}:`, error);
      }
    }

    await this.batchInsertSignals(signals);

    return signals.length;
  }

  /**
   * Ingest issues
   */
  private async ingestIssues(repo: Repository, state: 'open' | 'closed' | 'all'): Promise<number> {
    const issues = await this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/issues?state=${state}&per_page=100`)
    );

    const signals = issues.map((issue: any) => this.transformIssueToSignal(repo, issue));
    await this.batchInsertSignals(signals);

    return signals.length;
  }

  /**
   * Get commits since timestamp on a specific branch
   */
  private async getCommitsSince(repo: Repository, since: string, branch?: string): Promise<any[]> {
    const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : '';
    return this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/commits?since=${since}&per_page=100${branchParam}`)
    );
  }

  /**
   * Get PRs targeting a specific base branch, updated since timestamp
   */
  private async getPullRequestsUpdatedSince(repo: Repository, since: string, branch?: string): Promise<any[]> {
    const branchFilter = branch ? `&base=${encodeURIComponent(branch)}` : '';
    const prs = await this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/pulls?state=all&sort=updated&per_page=100${branchFilter}`)
    );
    return prs.filter((pr: any) => new Date(pr.updated_at) > new Date(since));
  }

  /**
   * Get issues updated since timestamp
   */
  private async getIssuesUpdatedSince(repo: Repository, since: string): Promise<any[]> {
    return this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/issues?since=${since}&per_page=100`)
    );
  }

  /**
   * Get file content
   */
  private async getFileContent(repo: Repository, path: string): Promise<string | null> {
    try {
      const response = await this.githubFetch(`/repos/${repo.full_name}/contents/${path}`);
      if (response.content) {
        return Buffer.from(response.content, 'base64').toString('utf-8');
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse file content into symbols and embed them into entity_embeddings.
   * Runs synchronously after file content is fetched — NB-017 + NB-018 fix.
   *
   * Symbol entity_id is branch-scoped so Team 6.3.4 and Team 5.11.5 symbols
   * never collide in the same org's entity_embeddings table.
   */
  private async parseAndEmbedFile(
    content: string,
    filePath: string,
    repoFullName: string,
    branchName?: string,
    releaseVersion?: string,
    teamLabel?: string,
  ): Promise<void> {
    try {
      const fileIndex = this.codeParser.parseSource(content, filePath);

      if (fileIndex.symbols.length === 0 && fileIndex.imports.length === 0) return;

      // Embed symbols — override entity_id to be branch-scoped
      for (const symbol of fileIndex.symbols) {
        try {
          const { formatSymbolForEmbedding } = this.codeEmbedder;
          const contentText = formatSymbolForEmbedding(symbol);

          // Import hashContent from embedding-engine via embedder internals is not
          // exposed, so compute a simple hash inline for branch-scoped entity_id.
          const branchSuffix = branchName ? `@${branchName}` : '';
          const entityId = symbol.parentSymbol
            ? `${repoFullName}:${filePath}::${symbol.parentSymbol}.${symbol.name}${branchSuffix}`
            : `${repoFullName}:${filePath}::${symbol.name}${branchSuffix}`;

          const embedding = generateEmbedding(contentText);
          const contentHashVal = hashContent(contentText);

          await this.supabase.from('entity_embeddings').upsert(
            {
              organization_id: this.organizationId,
              entity_type: 'code_symbol',
              entity_id: entityId,
              content: contentText,
              content_hash: contentHashVal,
              embedding: JSON.stringify(embedding),
              metadata: {
                kind: symbol.kind,
                filePath: symbol.filePath,
                name: symbol.name,
                parentSymbol: symbol.parentSymbol,
                startLine: symbol.startLine,
                endLine: symbol.endLine,
                isExported: symbol.isExported,
                language: fileIndex.language,
                repo: repoFullName,
                branch: branchName,
                release_version: releaseVersion,
                team_label: teamLabel,
              },
              importance_score: symbol.isExported ? 0.8 : 0.5,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'organization_id,entity_type,entity_id' }
          );
        } catch {
          // Non-critical: skip failed symbols, continue with rest
        }
      }

      // Emit code_dependency signals from import graph (enables real impact analysis)
      const now = new Date().toISOString();
      for (const importedModule of fileIndex.imports) {
        // Only track relative imports (intra-repo dependencies, not npm packages)
        if (!importedModule.startsWith('.')) continue;

        const depSignal: Signal = {
          organization_id: this.organizationId,
          source_domain: 'engineering.github',
          signal_type: 'code_dependency',
          signal_value: 1,
          entity_type: 'code_file',
          entity_id: branchName
            ? `${repoFullName}:${filePath}@${branchName}`
            : `${repoFullName}:${filePath}`,
          branch_name: branchName,
          release_version: releaseVersion,
          team_label: teamLabel,
          signal_metadata: {
            repo: repoFullName,
            importer: filePath,
            importee: importedModule,
            language: fileIndex.language,
            branch: branchName,
            release_version: releaseVersion,
            team_label: teamLabel,
          },
          created_at: now,
          signal_timestamp: now,
        };

        await this.streamProcessor.addSignal(depSignal);
      }
    } catch {
      // Non-critical: parsing failures must never break file ingestion
    }
  }

  /**
   * Transform file to signal — carries branch + release context
   */
  private transformFileToSignal(
    repo: Repository,
    file: TreeItem,
    content: string,
    branchName?: string,
    releaseVersion?: string,
    teamLabel?: string,
  ): Signal {
    const now = new Date().toISOString();
    const language = this.detectLanguage(file.path);

    // Store full content for files < 100KB (critical for SE-aaS code analysis)
    const MAX_FULL_CONTENT = 100_000;
    const MAX_TRUNCATED = 50_000;
    let storedContent: string;
    let contentTruncated = false;

    if (content.length <= MAX_FULL_CONTENT) {
      storedContent = content;
    } else {
      storedContent = content.substring(0, MAX_TRUNCATED) + '\n\n... [truncated] ...\n\n' + content.substring(content.length - 1000);
      contentTruncated = true;
    }

    return {
      organization_id: this.organizationId,
      source_domain: 'engineering.github',
      signal_type: 'code_file_ingested',
      signal_value: file.size || content.length,
      entity_type: 'code_file',
      // Include branch in entity_id so files from different branches are distinct signals
      entity_id: branchName
        ? `${repo.full_name}:${file.path}@${branchName}`
        : `${repo.full_name}:${file.path}`,
      branch_name: branchName,
      release_version: releaseVersion,
      team_label: teamLabel,
      signal_metadata: {
        repo: repo.full_name,
        path: file.path,
        language,
        size: file.size,
        sha: file.sha,
        branch: branchName,
        release_version: releaseVersion,
        team_label: teamLabel,
        content: storedContent,
        content_length: content.length,
        content_truncated: contentTruncated,
        content_preview: content.substring(0, 500),
      },
      created_at: now,
      signal_timestamp: now,
    };
  }

  /**
   * Transform commit to signal — carries branch + release context
   */
  private transformCommitToSignal(
    repo: Repository,
    commit: any,
    branchName?: string,
    releaseVersion?: string,
    teamLabel?: string,
  ): Signal {
    const eventTime = commit.commit?.author?.date || new Date().toISOString();
    return {
      organization_id: this.organizationId,
      source_domain: 'engineering.github',
      signal_type: 'commit_pushed',
      signal_value: 1,
      entity_type: 'commit',
      entity_id: `${repo.name}:${commit.sha}`,
      branch_name: branchName,
      release_version: releaseVersion,
      team_label: teamLabel,
      signal_metadata: {
        repo: repo.full_name,
        sha: commit.sha,
        message: commit.commit?.message,
        author: commit.commit?.author?.name,
        author_email: commit.commit?.author?.email,
        committer: commit.commit?.committer?.name,
        files_changed: commit.files?.length || 0,
        url: commit.html_url,
        branch: branchName,
        release_version: releaseVersion,
        team_label: teamLabel,
      },
      created_at: eventTime,
      signal_timestamp: eventTime,
    };
  }

  /**
   * Transform PR to signal — carries branch + release context
   */
  private transformPRToSignal(
    repo: Repository,
    pr: any,
    branchName?: string,
    releaseVersion?: string,
    teamLabel?: string,
  ): Signal {
    let signalType: string;
    let signalValue: number;

    if (pr.merged_at) {
      signalType = 'pr_merged';
      signalValue = (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3600000;
    } else if (pr.state === 'open') {
      signalType = 'pr_opened';
      signalValue = 1;
    } else {
      signalType = 'pr_closed_unmerged';
      signalValue = 1;
    }

    const eventTime = pr.merged_at || pr.created_at;
    return {
      organization_id: this.organizationId,
      source_domain: 'engineering.github',
      signal_type: signalType,
      signal_value: signalValue,
      entity_type: 'pull_request',
      entity_id: `${repo.name}#${pr.number}`,
      branch_name: branchName,
      release_version: releaseVersion,
      team_label: teamLabel,
      signal_metadata: {
        repo: repo.full_name,
        pr_number: pr.number,
        title: pr.title,
        body: pr.body || '',
        author: pr.user?.login,
        author_id: pr.user?.id,
        state: pr.state,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changed_files: pr.changed_files || 0,
        merged_at: pr.merged_at,
        url: pr.html_url,
        is_draft: pr.draft || false,
        base_branch: pr.base?.ref,        // target branch from GitHub (what we're merging into)
        head_branch: pr.head?.ref,        // source branch (feature branch)
        branch: branchName,               // our configured release branch
        release_version: releaseVersion,
        team_label: teamLabel,
      },
      created_at: eventTime,
      signal_timestamp: eventTime,
    };
  }

  /**
   * Transform PR review to signal — carries branch + release context
   * Critical for P0 Bottleneck Detection (branch-scoped)
   */
  private transformReviewToSignal(
    repo: Repository,
    pr: any,
    review: any,
    branchName?: string,
    releaseVersion?: string,
    teamLabel?: string,
  ): Signal {
    const reviewLatencyHours =
      (new Date(review.submitted_at).getTime() - new Date(pr.created_at).getTime()) / 3600000;

    const eventTime = review.submitted_at;
    return {
      organization_id: this.organizationId,
      source_domain: 'engineering.github',
      signal_type: 'pr_reviewed',
      signal_value: reviewLatencyHours,
      entity_type: 'review',
      entity_id: `${repo.name}#${pr.number}:review:${review.id}`,
      branch_name: branchName,
      release_version: releaseVersion,
      team_label: teamLabel,
      signal_metadata: {
        repo: repo.full_name,
        pr_number: pr.number,
        pr_author: pr.user?.login,
        reviewer: review.user?.login,
        reviewer_id: review.user?.id,
        review_state: review.state,
        review_latency_hours: reviewLatencyHours,
        submitted_at: review.submitted_at,
        branch: branchName,
        release_version: releaseVersion,
        team_label: teamLabel,
      },
      created_at: eventTime,
      signal_timestamp: eventTime,
    };
  }

  /**
   * Transform issue to signal (Brain L1 spec)
   */
  private transformIssueToSignal(repo: Repository, issue: any): Signal {
    // Skip PRs (issues API includes PRs)
    if (issue.pull_request) return null as any;

    const signalType = issue.state === 'open' ? 'issue_opened' : 'issue_closed';

    const eventTime = issue.state === 'closed' ? issue.closed_at : issue.created_at;
    return {
      organization_id: this.organizationId,
      source_domain: 'engineering.github',
      signal_type: signalType,
      signal_value: 1,
      entity_type: 'issue',
      entity_id: `${repo.name}#${issue.number}`,
      signal_metadata: {
        repo: repo.full_name,
        issue_number: issue.number,
        title: issue.title,
        body: issue.body || '',
        author: issue.user?.login,
        state: issue.state,
        labels: issue.labels?.map((l: any) => l.name) || [],
        assignees: issue.assignees?.map((a: any) => a.login) || [],
        url: issue.html_url,
      },
      created_at: eventTime,
      signal_timestamp: eventTime,
    };
  }

  /**
   * GitHub API fetch helper
   */
  private async githubFetch(endpoint: string): Promise<any> {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.githubCreds.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'NexusBrain-Connector',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check if file is binary
   */
  private isBinaryFile(path: string): boolean {
    const binaryExts = [
      '.jpg', '.jpeg', '.png', '.gif', '.pdf', '.zip', '.tar', '.gz',
      '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite',
      '.woff', '.woff2', '.ttf', '.eot', '.ico', '.svg', '.mp4', '.mp3',
    ];
    return binaryExts.some((ext) => path.toLowerCase().endsWith(ext));
  }

  /**
   * Check if path should be ignored
   */
  private isIgnoredPath(path: string): boolean {
    const ignoredPaths = [
      'node_modules/', 'vendor/', 'dist/', 'build/', '.next/', 'coverage/',
      '__pycache__/', '.git/', '.vscode/', '.idea/', 'tmp/', 'cache/',
    ];
    return ignoredPaths.some((p) => path.includes(p));
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript', js: 'javascript', tsx: 'typescript', jsx: 'javascript',
      py: 'python', rb: 'ruby', go: 'go', java: 'java', rs: 'rust',
      cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp', cs: 'csharp',
      php: 'php', swift: 'swift', kt: 'kotlin', scala: 'scala',
      md: 'markdown', json: 'json', yaml: 'yaml', yml: 'yaml',
      sql: 'sql', sh: 'shell', bash: 'shell',
    };
    return langMap[ext || ''] || 'unknown';
  }

  protected transformToSignal(rawData: any): Signal {
    throw new Error('Use specific transform methods');
  }
}
