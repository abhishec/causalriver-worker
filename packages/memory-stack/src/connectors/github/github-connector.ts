/**
 * GitHub Connector
 * ================
 * Ingests repositories, files, commits, pull requests, and issues.
 * Optimized for 10M+ files with streaming and smart filtering.
 */

import { ConnectorBase, IngestionResult, IngestionOptions } from '../base/connector-base.js';
import { RateLimitConfig } from '../base/rate-limiter.js';
import { Signal } from '../base/stream-processor.js';
import { Checkpoint } from '../base/checkpoint-manager.js';

interface GitHubCredentials {
  accessToken: string;
  githubLogin?: string;
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

        // 2. Ingest repository metadata
        await this.ingestRepoMetadata(repo);
        totalSignals++;

        // 3. Ingest file tree (streaming, with filters)
        const fileSignals = await this.ingestFileTree(repo);
        totalSignals += fileSignals;

        // 4. Ingest recent commits (last 100)
        const commitSignals = await this.ingestRecentCommits(repo, 100);
        totalSignals += commitSignals;

        // 5. Ingest open pull requests
        const prSignals = await this.ingestPullRequests(repo, 'open');
        totalSignals += prSignals;

        // 6. Ingest open issues
        const issueSignals = await this.ingestIssues(repo, 'open');
        totalSignals += issueSignals;

        // Save checkpoint after each repo
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
        // Only new commits
        const commits = await this.getCommitsSince(repo, since);
        for (const commit of commits) {
          const signal = this.transformCommitToSignal(repo, commit);
          await this.streamProcessor.addSignal(signal);
          totalSignals++;
        }

        // Updated PRs
        const prs = await this.getPullRequestsUpdatedSince(repo, since);
        for (const pr of prs) {
          const signal = this.transformPRToSignal(repo, pr);
          await this.streamProcessor.addSignal(signal);
          totalSignals++;
        }

        // Updated issues
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
    const signal: Signal = {
      organization_id: this.organizationId,
      source_domain: 'engineering',
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
      created_at: repo.updated_at,
    };

    await this.streamProcessor.addSignal(signal);
  }

  /**
   * Ingest file tree (streaming, skip binaries)
   */
  private async ingestFileTree(repo: Repository): Promise<number> {
    let filesIngested = 0;

    // Get git tree recursively
    const tree = await this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`)
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

      // Transform to signals
      const signals = fileContents
        .map((content, idx) => {
          if (!content) return null;
          return this.transformFileToSignal(repo, batch[idx], content);
        })
        .filter((s): s is Signal => s !== null);

      // Batch insert
      await this.batchInsertSignals(signals);
      filesIngested += signals.length;

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
   * Ingest recent commits
   */
  private async ingestRecentCommits(repo: Repository, count: number): Promise<number> {
    const commits = await this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/commits?per_page=${Math.min(count, 100)}`)
    );

    const signals = commits.map((commit: any) => this.transformCommitToSignal(repo, commit));
    await this.batchInsertSignals(signals);

    return signals.length;
  }

  /**
   * Ingest pull requests
   */
  private async ingestPullRequests(repo: Repository, state: 'open' | 'closed' | 'all'): Promise<number> {
    const prs = await this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/pulls?state=${state}&per_page=100`)
    );

    const signals: Signal[] = [];

    // Process each PR and fetch its reviews
    for (const pr of prs) {
      // Add PR signal
      signals.push(this.transformPRToSignal(repo, pr));

      // Fetch and add review signals (critical for P0 Bottleneck Detection)
      try {
        const reviews = await this.rateLimiter.throttle(() =>
          this.githubFetch(`/repos/${repo.full_name}/pulls/${pr.number}/reviews`)
        );

        for (const review of reviews) {
          if (review.user) {  // Skip reviews without user (bots, etc.)
            signals.push(this.transformReviewToSignal(repo, pr, review));
          }
        }
      } catch (error) {
        console.warn(`[GitHub] Failed to fetch reviews for PR #${pr.number}:`, error);
        // Continue processing other PRs even if reviews fail
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
   * Get commits since timestamp
   */
  private async getCommitsSince(repo: Repository, since: string): Promise<any[]> {
    return this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/commits?since=${since}&per_page=100`)
    );
  }

  /**
   * Get PRs updated since timestamp
   */
  private async getPullRequestsUpdatedSince(repo: Repository, since: string): Promise<any[]> {
    // GitHub doesn't support since for PRs, fetch all and filter
    const prs = await this.rateLimiter.throttle(() =>
      this.githubFetch(`/repos/${repo.full_name}/pulls?state=all&sort=updated&per_page=100`)
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
   * Transform file to signal
   */
  private transformFileToSignal(repo: Repository, file: TreeItem, content: string): Signal {
    return {
      organization_id: this.organizationId,
      source_domain: 'engineering',
      signal_type: 'code_file_ingested',
      signal_value: file.size || content.length,
      entity_type: 'code_file',
      entity_id: `${repo.full_name}:${file.path}`,
      signal_metadata: {
        repo: repo.full_name,
        path: file.path,
        language: this.detectLanguage(file.path),
        size: file.size,
        sha: file.sha,
        content_preview: content.substring(0, 500),
        content_length: content.length,
      },
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Transform commit to signal (Brain L1 spec)
   */
  private transformCommitToSignal(repo: Repository, commit: any): Signal {
    return {
      organization_id: this.organizationId,
      source_domain: 'engineering',
      signal_type: 'commit_pushed',
      signal_value: 1,
      entity_type: 'commit',
      entity_id: `${repo.name}:${commit.sha}`,
      signal_metadata: {
        repo: repo.full_name,
        sha: commit.sha,
        message: commit.commit?.message,
        author: commit.commit?.author?.name,
        author_email: commit.commit?.author?.email,
        committer: commit.commit?.committer?.name,
        files_changed: commit.files?.length || 0,
        url: commit.html_url,
      },
      created_at: commit.commit?.author?.date || new Date().toISOString(),
    };
  }

  /**
   * Transform PR to signal (Brain L1 spec)
   */
  private transformPRToSignal(repo: Repository, pr: any): Signal {
    // Determine signal type and value based on PR state
    let signalType: string;
    let signalValue: number;

    if (pr.merged_at) {
      signalType = 'pr_merged';
      // Signal value = cycle time in hours
      signalValue = (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3600000;
    } else if (pr.state === 'open') {
      signalType = 'pr_opened';
      signalValue = 1;
    } else {
      signalType = 'pr_closed_unmerged';
      signalValue = 1;
    }

    return {
      organization_id: this.organizationId,
      source_domain: 'engineering',
      signal_type: signalType,
      signal_value: signalValue,
      entity_type: 'pull_request',
      entity_id: `${repo.name}#${pr.number}`,
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
      },
      created_at: pr.merged_at || pr.created_at,
    };
  }

  /**
   * Transform PR review to signal (Brain L1 spec)
   * Critical for P0 Bottleneck Detection
   */
  private transformReviewToSignal(repo: Repository, pr: any, review: any): Signal {
    const reviewLatencyHours =
      (new Date(review.submitted_at).getTime() - new Date(pr.created_at).getTime()) / 3600000;

    return {
      organization_id: this.organizationId,
      source_domain: 'engineering',
      signal_type: 'pr_reviewed',
      signal_value: reviewLatencyHours,
      entity_type: 'review',
      entity_id: `${repo.name}#${pr.number}:review:${review.id}`,
      signal_metadata: {
        repo: repo.full_name,
        pr_number: pr.number,
        pr_author: pr.user?.login,
        reviewer: review.user?.login,
        reviewer_id: review.user?.id,
        review_state: review.state,
        review_latency_hours: reviewLatencyHours,
        submitted_at: review.submitted_at,
      },
      created_at: review.submitted_at,
    };
  }

  /**
   * Transform issue to signal (Brain L1 spec)
   */
  private transformIssueToSignal(repo: Repository, issue: any): Signal {
    // Skip PRs (issues API includes PRs)
    if (issue.pull_request) return null as any;

    const signalType = issue.state === 'open' ? 'issue_opened' : 'issue_closed';

    return {
      organization_id: this.organizationId,
      source_domain: 'engineering',
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
      created_at: issue.state === 'closed' ? issue.closed_at : issue.created_at,
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
