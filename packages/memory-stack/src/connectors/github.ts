/**
 * GitHub Connector
 *
 * Syncs engineering signals from GitHub repositories:
 *   - Pull requests (opened, merged, changes_requested)
 *   - PR reviews (approved, changes_requested, commented) with sentiment
 *   - PR file changes (file paths, directories changed)
 *   - Issues (opened, closed, labeled as bug)
 *   - CI/CD workflow runs (passed, failed) + per-job signals
 *   - Deployments (success, failure, rollback detection)
 *   - Commits (volume, frequency)
 *
 * These signals feed into the causal graph engine to discover
 * relationships like: deploy_failures → support_ticket_spikes,
 * or pr_review_time → shipping_velocity.
 *
 * Enhanced signals also feed the Contributor Expertise Graph:
 *   - PR file paths → code_change expertise
 *   - PR reviews → review expertise
 *   - CI job failures → infrastructure expertise
 *
 * @example
 * ```typescript
 * const github = createGitHubConnector({
 *   token: process.env.GITHUB_TOKEN!,
 *   owner: 'myorg',
 *   repo: 'myapp',
 * });
 * const result = await github.fullSync(supabase, 'org_123');
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';
import { analyzeSentiment } from '../core/nlp/sentiment-analyzer';
import { extractTopics } from '../core/nlp/topic-extractor';

// ============================================================================
// TYPES
// ============================================================================

export interface GitHubConnectorConfig {
  /** GitHub personal access token or app token */
  token: string;
  /** Repository owner (org or user) */
  owner: string;
  /** Repository name */
  repo: string;
  /** GitHub API base URL (default: https://api.github.com) */
  baseUrl?: string;
  /**
   * Branch names to track for SE-aaS release analysis.
   * Supports glob-style patterns: ["release/*", "main", "develop"].
   * When specified, PRs/commits/workflows are filtered to these branches only.
   * Signals get branch_name + release_version metadata for release tracking.
   * When absent (undefined/empty), ALL branches are synced (default behaviour).
   */
  trackedBranches?: string[];
  /**
   * How far back to pull data on the first full sync.
   * Format: "30d", "90d", "6m", "1y", "all" (default: "90d")
   */
  dataLookback?: string;
  /** Which data to sync (default: all true) */
  syncScope?: {
    pulls?: boolean;
    issues?: boolean;
    commits?: boolean;
    workflows?: boolean;
    /** Fetch PR reviews — approved, changes_requested, commented (default: true) */
    reviews?: boolean;
    /** Fetch per-PR file change lists (default: true) */
    fileChanges?: boolean;
    /** Fetch per-workflow job details for failures (default: true) */
    jobDetails?: boolean;
  };
}

interface GitHubPR {
  id: number;
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
  user?: { login: string };
  labels?: Array<{ name: string }>;
  requested_reviewers?: Array<{ login: string }>;
  /** Source branch (feature → this branch) */
  head?: { ref: string; sha: string };
  /** Target/base branch (PR merges INTO this branch) */
  base?: { ref: string; sha: string };
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  labels?: Array<{ name: string }>;
  user?: { login: string };
}

interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  head_branch: string;
  head_sha?: string;
  event: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  stats?: { additions: number; deletions: number; total: number };
}

interface GitHubPRReview {
  id: number;
  user: { login: string };
  state: string; // 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED'
  body: string;
  submitted_at: string;
}

interface GitHubPRFile {
  filename: string;
  status: string; // 'added' | 'removed' | 'modified' | 'renamed'
  additions: number;
  deletions: number;
}

interface GitHubWorkflowJob {
  id: number;
  name: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string;
  steps: Array<{ name: string; conclusion: string | null }>;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert a dataLookback string ("30d", "90d", "6m", "1y", "all") to a Date cutoff.
 * Returns undefined when lookback is "all" (no time filter).
 */
function lookbackToDate(lookback?: string): Date | undefined {
  if (!lookback || lookback === "all") return undefined;
  const now = Date.now();
  const match = lookback.match(/^(\d+)(d|m|y)$/);
  if (!match) return new Date(now - 90 * 24 * 60 * 60 * 1000); // default 90d
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const ms =
    unit === "d" ? n * 24 * 60 * 60 * 1000 :
    unit === "m" ? n * 30 * 24 * 60 * 60 * 1000 :
    /* y */        n * 365 * 24 * 60 * 60 * 1000;
  return new Date(now - ms);
}

/**
 * Test whether a branch name matches a pattern list.
 * Supports glob wildcards: "release/*" matches "release/1.2.3".
 * An empty/undefined pattern list means "match everything".
 */
function branchMatchesPatterns(branch: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return true; // no filter → all branches
  return patterns.some((pattern) => {
    if (pattern === branch) return true;
    // Glob-style: "release/*" → regex /^release\/.+$/
    const regexSrc = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".+");
    return new RegExp(`^${regexSrc}$`).test(branch);
  });
}

/**
 * Extract a release version string from a branch name.
 * "release/1.2.3" → "1.2.3", "v1.2.3" → "1.2.3", "main" → null
 */
function extractReleaseVersion(branch: string): string | null {
  const m = branch.match(/(?:release\/|v)([\d]+\.[\d]+(?:\.[\d]+)?(?:[-\w.]+)?)/i);
  return m ? m[1] : null;
}

/** Extract unique parent directories from file paths */
function extractDirectories(files: GitHubPRFile[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.filename.split('/');
    if (parts.length > 1) {
      // Add all ancestor directories: src/auth/oauth.ts → "src", "src/auth"
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }
  }
  return [...dirs];
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a GitHub connector that syncs engineering signals.
 */
export function createGitHubConnector(config: GitHubConnectorConfig): NexusConnector {
  const {
    token,
    owner,
    repo,
    baseUrl = 'https://api.github.com',
    trackedBranches,   // undefined → all branches; ["release/*","main"] → filter
    dataLookback,      // "30d" / "90d" / "6m" / "1y" / "all"
    syncScope = {
      pulls: true, issues: true, commits: true, workflows: true,
      reviews: true, fileChanges: true, jobDetails: true,
    },
  } = config;

  // Convert dataLookback string to a cutoff Date (undefined = fetch all history)
  const sinceCutoff: Date | undefined = lookbackToDate(dataLookback);

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Track recent deploy failures per branch for rollback detection
  const recentDeployFailures = new Map<string, number>(); // branch → timestamp

  // OOM PREVENTION: Hard caps on array sizes to prevent unbounded memory growth.
  // At 10M signals scale, repos can have 50K+ PRs, 100K+ commits, etc.
  // Without caps, fullSync() would accumulate GB of data in memory.
  //
  // AWS ECS Fargate (4GB RAM per task) — raised caps significantly:
  //   Each PR/issue/commit in memory ≈ ~2KB (with JSON detail payload)
  //   20K PRs × 2KB = ~40MB — well within 4GB budget.
  //   The signals written to DB are much smaller (~450 bytes each).
  //
  // These caps control the connector fetch, not the brain cycle.
  // The brain cycle streams from DB in pages — fully independent.
  const MAX_PRS = 20000;
  const MAX_ISSUES = 20000;
  const MAX_WORKFLOW_RUNS = 10000;
  const MAX_COMMITS = 20000;

  // ── Fetch helpers ────────────────────────────────────────────────

  async function fetchJSON<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async function fetchPullRequests(since?: Date): Promise<GitHubPR[]> {
    // Use sinceCutoff from dataLookback if no explicit since date provided
    const effectiveSince = since ?? sinceCutoff;
    const allPRs: GitHubPR[] = [];
    let page = 1;

    while (allPRs.length < MAX_PRS) {
      const params: Record<string, string> = {
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: '100',
        page: String(page),
      };
      // Note: GitHub pulls API does not support `since` param directly;
      // we filter by updated_at after fetch. The `base` param filters by target branch.
      // When tracking specific branches, we fetch per-branch to maximise accuracy.

      const prs = await fetchJSON<GitHubPR[]>(`/repos/${owner}/${repo}/pulls`, params);
      if (!prs || prs.length === 0) break;

      // Fetch detailed stats for each PR (additions/deletions + head/base branch)
      for (const pr of prs) {
        if (allPRs.length >= MAX_PRS) break;
        if (effectiveSince && new Date(pr.updated_at) < effectiveSince) {
          // PRs are sorted by updated desc — once we hit one older than cutoff, stop
          return allPRs;
        }
        try {
          const detail = await fetchJSON<GitHubPR>(`/repos/${owner}/${repo}/pulls/${pr.number}`);
          // Branch filter: keep PR if its BASE (target) branch matches trackedBranches
          // OR if its HEAD (source) branch matches (captures PRs going INTO tracked branches)
          const baseBranch = detail.base?.ref || '';
          const headBranch = detail.head?.ref || '';
          const tracked =
            branchMatchesPatterns(baseBranch, trackedBranches) ||
            branchMatchesPatterns(headBranch, trackedBranches);
          if (tracked) allPRs.push(detail);
        } catch {
          // Use basic data if detail fetch fails (no branch info available for filtering)
          if (!trackedBranches || trackedBranches.length === 0) {
            allPRs.push(pr); // Only include if no branch filter active
          }
        }
      }

      if (prs.length < 100) break; // Last page
      page++;
      await new Promise(r => setTimeout(r, 50)); // Rate limit courtesy
    }
    return allPRs;
  }

  async function fetchIssues(since?: Date): Promise<GitHubIssue[]> {
    const allIssues: GitHubIssue[] = [];
    let page = 1;

    while (allIssues.length < MAX_ISSUES) {
      const params: Record<string, string> = {
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: '100',
        filter: 'all',
        page: String(page),
      };
      if (since) {
        params.since = since.toISOString();
      }

      const items = await fetchJSON<GitHubIssue[]>(`/repos/${owner}/${repo}/issues`, params);
      if (!items || items.length === 0) break;

      // Filter out pull requests (GitHub API includes PRs in issues endpoint)
      const filtered = items.filter((i) => !(i as any).pull_request);
      for (const issue of filtered) {
        if (allIssues.length >= MAX_ISSUES) break;
        allIssues.push(issue);
      }

      if (items.length < 100) break; // Last page
      page++;
      await new Promise(r => setTimeout(r, 50)); // Rate limit courtesy
    }
    return allIssues;
  }

  async function fetchWorkflowRuns(since?: Date): Promise<GitHubWorkflowRun[]> {
    const effectiveSince = since ?? sinceCutoff;
    const allRuns: GitHubWorkflowRun[] = [];

    // If trackedBranches with literal names specified, fetch per-branch for accuracy
    const literalBranches =
      trackedBranches && trackedBranches.length > 0
        ? trackedBranches.filter((b) => !b.includes('*'))
        : [];

    const branchesToFetch = literalBranches.length > 0 ? literalBranches : [undefined];

    for (const branch of branchesToFetch) {
      let page = 1;
      while (allRuns.length < MAX_WORKFLOW_RUNS) {
        const params: Record<string, string> = {
          per_page: '100',
          page: String(page),
        };
        if (effectiveSince) {
          params.created = `>=${effectiveSince.toISOString().split('T')[0]}`;
        }
        if (branch) {
          params.branch = branch; // GitHub API: filter runs by branch name
        }

        const data = await fetchJSON<{ workflow_runs: GitHubWorkflowRun[] }>(
          `/repos/${owner}/${repo}/actions/runs`,
          params
        );
        const runs = data.workflow_runs || [];
        if (runs.length === 0) break;

        for (const run of runs) {
          if (allRuns.length >= MAX_WORKFLOW_RUNS) break;
          // For glob patterns (no literal branch filter), apply post-fetch filter
          if (trackedBranches && trackedBranches.length > 0 && literalBranches.length === 0) {
            if (!branchMatchesPatterns(run.head_branch, trackedBranches)) continue;
          }
          allRuns.push(run);
        }

        if (runs.length < 100) break; // Last page
        page++;
        await new Promise(r => setTimeout(r, 50)); // Rate limit courtesy
      }
    }

    return allRuns;
  }

  async function fetchCommitsForBranch(branch: string, since?: Date): Promise<GitHubCommit[]> {
    const effectiveSince = since ?? sinceCutoff;
    const branchCommits: GitHubCommit[] = [];
    let page = 1;

    while (branchCommits.length < MAX_COMMITS) {
      const params: Record<string, string> = {
        sha: branch,         // GitHub commits API: sha = branch name
        per_page: '100',
        page: String(page),
      };
      if (effectiveSince) {
        params.since = effectiveSince.toISOString();
      }

      const commits = await fetchJSON<GitHubCommit[]>(`/repos/${owner}/${repo}/commits`, params);
      if (!commits || commits.length === 0) break;

      for (const commit of commits) {
        if (branchCommits.length >= MAX_COMMITS) break;
        // Annotate with branch name for downstream signal enrichment
        (commit as any)._branch = branch;
        branchCommits.push(commit);
      }

      if (commits.length < 100) break;
      page++;
      await new Promise(r => setTimeout(r, 50));
    }
    return branchCommits;
  }

  async function fetchCommits(since?: Date): Promise<GitHubCommit[]> {
    const effectiveSince = since ?? sinceCutoff;

    // If trackedBranches specified, fetch per branch (accurate branch attribution)
    if (trackedBranches && trackedBranches.length > 0) {
      // Expand glob patterns: "release/*" needs the actual branch list from API
      // For simplicity, fetch commits per literal branch name (non-glob patterns)
      // and fall back to default fetch for glob patterns.
      const literalBranches = trackedBranches.filter((b) => !b.includes('*'));
      if (literalBranches.length > 0) {
        const perBranchCommits = await Promise.all(
          literalBranches.map((b) => fetchCommitsForBranch(b, effectiveSince))
        );
        // Deduplicate by SHA (a commit can appear on multiple branches)
        const seen = new Set<string>();
        const allCommits: GitHubCommit[] = [];
        for (const branchCommits of perBranchCommits) {
          for (const c of branchCommits) {
            if (!seen.has(c.sha)) {
              seen.add(c.sha);
              allCommits.push(c);
              if (allCommits.length >= MAX_COMMITS) return allCommits;
            }
          }
        }
        return allCommits;
      }
      // Glob-only patterns: fall through to default (all-branch) fetch
    }

    // Default: fetch from default branch (all commits)
    const allCommits: GitHubCommit[] = [];
    let page = 1;

    while (allCommits.length < MAX_COMMITS) {
      const params: Record<string, string> = {
        per_page: '100',
        page: String(page),
      };
      if (effectiveSince) {
        params.since = effectiveSince.toISOString();
      }

      const commits = await fetchJSON<GitHubCommit[]>(`/repos/${owner}/${repo}/commits`, params);
      if (!commits || commits.length === 0) break;

      for (const commit of commits) {
        if (allCommits.length >= MAX_COMMITS) break;
        allCommits.push(commit);
      }

      if (commits.length < 100) break; // Last page
      page++;
      await new Promise(r => setTimeout(r, 50)); // Rate limit courtesy
    }
    return allCommits;
  }

  async function fetchPRReviews(prNumber: number): Promise<GitHubPRReview[]> {
    try {
      return await fetchJSON<GitHubPRReview[]>(
        `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`
      );
    } catch {
      return []; // Non-fatal: reviews are enrichment
    }
  }

  async function fetchPRFiles(prNumber: number): Promise<GitHubPRFile[]> {
    try {
      const allFiles: GitHubPRFile[] = [];
      let page = 1;
      while (true) {
        const files = await fetchJSON<GitHubPRFile[]>(
          `/repos/${owner}/${repo}/pulls/${prNumber}/files`,
          { per_page: '100', page: String(page) }
        );
        if (!files || files.length === 0) break;
        allFiles.push(...files);
        if (files.length < 100) break;
        page++;
      }
      return allFiles;
    } catch {
      return []; // Non-fatal: file list is enrichment
    }
  }

  async function fetchWorkflowJobs(runId: number): Promise<GitHubWorkflowJob[]> {
    try {
      const data = await fetchJSON<{ jobs: GitHubWorkflowJob[] }>(
        `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`
      );
      return data.jobs || [];
    } catch {
      return []; // Non-fatal: job details are enrichment
    }
  }

  // ── Signal transformers ──────────────────────────────────────────

  async function prsToSignals(prs: GitHubPR[], orgId: string): Promise<ConnectorSignal[]> {
    const signals: ConnectorSignal[] = [];

    for (const pr of prs) {
      const linesChanged = (pr.additions || 0) + (pr.deletions || 0);
      const isBug = pr.labels?.some((l) => l.name.toLowerCase().includes('bug'));

      // ── Branch + release metadata for SE-aaS release tracking ──────────
      const headBranch = pr.head?.ref || '';
      const baseBranch = pr.base?.ref || '';
      // Use base branch (target) as the "release branch" for tracking purposes
      const releaseBranch = baseBranch || headBranch;
      const releaseVersion = extractReleaseVersion(releaseBranch) || extractReleaseVersion(headBranch);
      const branchMeta = {
        branch_name: releaseBranch || undefined,
        head_branch: headBranch || undefined,
        release_version: releaseVersion || undefined,
      };

      // Fetch file changes for this PR
      let filePaths: string[] = [];
      let directoriesChanged: string[] = [];
      if (syncScope.fileChanges !== false) {
        const files = await fetchPRFiles(pr.number);
        filePaths = files.map((f) => f.filename);
        directoriesChanged = extractDirectories(files);

        // Emit pr_files_changed signal (with branch context)
        if (files.length > 0) {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.github',
            signal_type: 'pr_files_changed',
            signal_value: Math.min(files.length / 20, 1), // Normalized by 20 files
            entity_type: 'pull_request',
            entity_id: `pr_${pr.number}`,
            signal_timestamp: pr.updated_at,
            metadata: {
              pr_number: pr.number,
              author: pr.user?.login,
              file_count: files.length,
              file_paths: filePaths,
              directories_changed: directoriesChanged,
              additions: files.reduce((sum, f) => sum + f.additions, 0),
              deletions: files.reduce((sum, f) => sum + f.deletions, 0),
              ...branchMeta,
            },
          });
        }
      }

      // PR opened
      // NOTE: file_paths excluded from pr_opened to prevent 6-8x metadata duplication.
      // File paths are already emitted in the dedicated pr_files_changed signal above.
      signals.push({
        organization_id: orgId,
        source_domain: 'engineering.github',
        signal_type: 'pr_opened',
        signal_value: 1,
        entity_type: 'pull_request',
        entity_id: `pr_${pr.number}`,
        signal_timestamp: pr.created_at,
        metadata: {
          title: pr.title,
          author: pr.user?.login,
          lines_changed: linesChanged,
          files_changed: pr.changed_files,
          is_bug_fix: isBug,
          created_at: pr.created_at,
          directory_count: directoriesChanged.length,
          reviewers_requested: pr.requested_reviewers?.map((r) => r.login) || [],
          ...branchMeta,
        },
      });

      // Fetch reviews for this PR
      let reviewersWhoApproved: string[] = [];
      if (syncScope.reviews !== false) {
        const reviews = await fetchPRReviews(pr.number);
        reviewersWhoApproved = reviews
          .filter((r) => r.state === 'APPROVED')
          .map((r) => r.user.login);

        // Emit per-review signals
        for (const review of reviews) {
          const reviewValue =
            review.state === 'APPROVED' ? 1 :
            review.state === 'CHANGES_REQUESTED' ? -0.3 :
            0.5; // COMMENTED

          const sentiment = review.body ? analyzeSentiment(review.body) : null;
          const topics = review.body ? extractTopics(review.body) : null;

          // NOTE: file_paths excluded — already in pr_files_changed signal
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.github',
            signal_type: 'pr_review_submitted',
            signal_value: reviewValue,
            entity_type: 'pull_request',
            entity_id: `pr_${pr.number}`,
            signal_timestamp: review.submitted_at,
            metadata: {
              pr_number: pr.number,
              reviewer: review.user.login,
              state: review.state,
              review_body_length: review.body?.length || 0,
              sentiment_score: sentiment?.score ?? 0,
              sentiment_label: sentiment?.label ?? 'neutral',
              topics: topics?.keywords.map((k) => k.word) || [],
              ...branchMeta, // branch_name + release_version for SE-aaS
            },
          });
        }
      }

      // PR merged
      if (pr.merged_at) {
        const reviewDays =
          (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) /
          (1000 * 60 * 60 * 24);

        // NOTE: file_paths excluded — already in pr_files_changed signal
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.github',
          signal_type: 'pr_merged',
          signal_value: Math.min(linesChanged / 500, 1), // Normalized by 500 lines
          entity_type: 'pull_request',
          entity_id: `pr_${pr.number}`,
          signal_timestamp: pr.merged_at,
          metadata: {
            title: pr.title,
            author: pr.user?.login,
            lines_changed: linesChanged,
            review_time_days: Math.round(reviewDays * 10) / 10,
            is_bug_fix: isBug,
            directory_count: directoriesChanged.length,
            reviewers_who_approved: reviewersWhoApproved,
            review_rounds: reviewersWhoApproved.length,
            ...branchMeta, // branch_name + release_version for SE-aaS release tracker
          },
        });
      }

      // PR closed without merge (abandoned)
      if (pr.state === 'closed' && !pr.merged_at) {
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.github',
          signal_type: 'pr_abandoned',
          signal_value: -0.3,
          entity_type: 'pull_request',
          entity_id: `pr_${pr.number}`,
          metadata: {
            title: pr.title,
            author: pr.user?.login,
            ...branchMeta,
          },
        });
      }
    }

    return signals;
  }

  function issuesToSignals(issues: GitHubIssue[], orgId: string): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const issue of issues) {
      const isBug = issue.labels?.some((l) =>
        ['bug', 'defect', 'incident', 'p0', 'p1', 'critical'].includes(
          l.name.toLowerCase()
        )
      );

      // Issue opened
      signals.push({
        organization_id: orgId,
        source_domain: 'engineering.github',
        signal_type: isBug ? 'bug_opened' : 'issue_opened',
        signal_value: isBug ? -0.5 : 0.5,
        entity_type: 'issue',
        entity_id: `issue_${issue.number}`,
        signal_timestamp: issue.created_at,
        metadata: {
          title: issue.title,
          author: issue.user?.login,
          labels: issue.labels?.map((l) => l.name),
          is_bug: isBug,
          created_at: issue.created_at,
        },
      });

      // Issue closed
      if (issue.closed_at) {
        const resolutionDays =
          (new Date(issue.closed_at).getTime() - new Date(issue.created_at).getTime()) /
          (1000 * 60 * 60 * 24);

        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.github',
          signal_type: isBug ? 'bug_closed' : 'issue_closed',
          signal_value: 1,
          entity_type: 'issue',
          entity_id: `issue_${issue.number}`,
          signal_timestamp: issue.closed_at,
          metadata: {
            title: issue.title,
            assignee: issue.user?.login,
            labels: issue.labels?.map((l) => l.name),
            resolution_time_days: Math.round(resolutionDays * 10) / 10,
            is_bug: isBug,
          },
        });
      }
    }

    return signals;
  }

  async function workflowsToSignals(runs: GitHubWorkflowRun[], orgId: string): Promise<ConnectorSignal[]> {
    const signals: ConnectorSignal[] = [];

    for (const run of runs) {
      if (run.status !== 'completed') continue;

      const isSuccess = run.conclusion === 'success';
      const isFailure = run.conclusion === 'failure';
      const isDeploy = run.name.toLowerCase().includes('deploy') ||
                        run.event === 'deployment' ||
                        run.event === 'release';

      if (isDeploy) {
        if (isFailure) {
          // Track deploy failure for rollback detection
          recentDeployFailures.set(run.head_branch, new Date(run.created_at).getTime());
        }

        // Rollback detection: deploy_success after recent deploy_failure on same branch
        if (isSuccess) {
          const lastFailureTs = recentDeployFailures.get(run.head_branch);
          const runTs = new Date(run.created_at).getTime();
          const fourHoursMs = 4 * 60 * 60 * 1000;

          if (lastFailureTs && (runTs - lastFailureTs) < fourHoursMs) {
            signals.push({
              organization_id: orgId,
              source_domain: 'engineering.github',
              signal_type: 'deploy_rollback',
              signal_value: -1,
              entity_type: 'deployment',
              entity_id: `rollback_${run.id}`,
              signal_timestamp: run.created_at,
              metadata: {
                workflow: run.name,
                branch: run.head_branch,
                event: run.event,
                time_since_failure_minutes: Math.round((runTs - lastFailureTs) / 60000),
              },
            });
            recentDeployFailures.delete(run.head_branch);
          }
        }

        // Standard deployment signal
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.github',
          signal_type: isSuccess ? 'deploy_success' : 'deploy_failure',
          signal_value: isSuccess ? 1 : -1,
          entity_type: 'deployment',
          entity_id: `deploy_${run.id}`,
          signal_timestamp: run.created_at,
          metadata: {
            workflow: run.name,
            branch: run.head_branch,
            ...(run.head_sha && { head_sha: run.head_sha }),
            conclusion: run.conclusion,
            event: run.event,
            created_at: run.created_at,
          },
        });
      } else {
        // Fetch per-job details for failed CI runs
        let failedJobNames: string[] = [];
        let stepThatFailed: string | undefined;

        if (isFailure && syncScope.jobDetails !== false) {
          const jobs = await fetchWorkflowJobs(run.id);

          for (const job of jobs) {
            const jobSignalValue = job.conclusion === 'success' ? 1 : -1;
            const jobSignalType = job.conclusion === 'success' ? 'ci_job_passed' : 'ci_job_failed';

            if (job.conclusion === 'failure') {
              failedJobNames.push(job.name);
              const failedStep = job.steps?.find((s) => s.conclusion === 'failure');
              if (failedStep && !stepThatFailed) {
                stepThatFailed = failedStep.name;
              }
            }

            signals.push({
              organization_id: orgId,
              source_domain: 'engineering.github',
              signal_type: jobSignalType,
              signal_value: jobSignalValue,
              entity_type: 'ci_job',
              entity_id: `job_${job.id}`,
              signal_timestamp: job.completed_at || run.created_at,
              metadata: {
                workflow: run.name,
                job_name: job.name,
                branch: run.head_branch,
                ...(run.head_sha && { head_sha: run.head_sha }),
                conclusion: job.conclusion,
                duration_seconds: job.started_at && job.completed_at
                  ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)
                  : undefined,
              },
            });
          }
        }

        // Overall CI run signal
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.github',
          signal_type: isFailure ? 'ci_failed' : 'ci_passed',
          signal_value: isFailure ? -1 : 1,
          entity_type: 'ci_run',
          entity_id: `ci_${run.id}`,
          signal_timestamp: run.created_at,
          metadata: {
            workflow: run.name,
            branch: run.head_branch,
            ...(run.head_sha && { head_sha: run.head_sha }),
            conclusion: run.conclusion,
            event: run.event,
            ...(failedJobNames.length > 0 && { failed_job_names: failedJobNames }),
            ...(stepThatFailed && { step_that_failed: stepThatFailed }),
          },
        });
      }
    }

    return signals;
  }

  function commitsToSignals(commits: GitHubCommit[], orgId: string): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    // Aggregate commits by day (and branch when available) for volume signals
    // Commits annotated with _branch by fetchCommitsForBranch get per-branch breakdown
    const commitsByDayBranch = new Map<string, { count: number; branch?: string }>();
    for (const commit of commits) {
      const day = commit.commit.author.date.split('T')[0];
      const branch = (commit as any)._branch as string | undefined;
      const key = branch ? `${day}::${branch}` : day;
      const existing = commitsByDayBranch.get(key);
      if (existing) {
        existing.count++;
      } else {
        commitsByDayBranch.set(key, { count: 1, branch });
      }
    }

    for (const [key, { count, branch }] of commitsByDayBranch) {
      const day = key.split('::')[0];
      const releaseVersion = branch ? extractReleaseVersion(branch) : null;
      signals.push({
        organization_id: orgId,
        source_domain: 'engineering.github',
        signal_type: 'commit_volume',
        signal_value: Math.min(count / 20, 1), // Normalized by 20 commits/day
        entity_type: 'metric',
        entity_id: branch ? `commits_${day}_${branch.replace(/[^a-zA-Z0-9]/g, '_')}` : `commits_${day}`,
        metadata: {
          date: day,
          commit_count: count,
          // Branch metadata for SE-aaS release tracking
          ...(branch ? { branch_name: branch } : {}),
          ...(releaseVersion ? { release_version: releaseVersion } : {}),
        },
      });
    }

    return signals;
  }

  // ── Connector Interface ──────────────────────────────────────────

  return {
    id: 'github',
    name: 'GitHub',
    domain: 'engineering',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];
      const allSignals: ConnectorSignal[] = [];
      let recordsProcessed = 0;

      try {
        if (syncScope.pulls) {
          const prs = await fetchPullRequests();
          const prSignals = await prsToSignals(prs, organizationId);
          allSignals.push(...prSignals);
          recordsProcessed += prs.length;
        }

        if (syncScope.issues) {
          const issues = await fetchIssues();
          allSignals.push(...issuesToSignals(issues, organizationId));
          recordsProcessed += issues.length;
        }

        if (syncScope.workflows) {
          const runs = await fetchWorkflowRuns();
          const wfSignals = await workflowsToSignals(runs, organizationId);
          allSignals.push(...wfSignals);
          recordsProcessed += runs.length;
        }

        if (syncScope.commits) {
          const commits = await fetchCommits();
          allSignals.push(...commitsToSignals(commits, organizationId));
          recordsProcessed += commits.length;
        }

        await storeConnectorSignals(supabase, allSignals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: allSignals.length,
          recordsProcessed,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        // Record sync result (non-fatal — signals are already stored)
        try {
          await recordSyncResult(supabase, 'github', organizationId, result);
        } catch (recordErr: any) {
          errors.push(`Sync recording non-fatal: ${recordErr.message}`);
        }
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    async incrementalSync(
      supabase: SupabaseClient,
      organizationId: string,
      since: Date
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];
      const allSignals: ConnectorSignal[] = [];
      let recordsProcessed = 0;

      try {
        if (syncScope.pulls) {
          const prs = await fetchPullRequests(since);
          const prSignals = await prsToSignals(prs, organizationId);
          allSignals.push(...prSignals);
          recordsProcessed += prs.length;
        }

        if (syncScope.issues) {
          const issues = await fetchIssues(since);
          allSignals.push(...issuesToSignals(issues, organizationId));
          recordsProcessed += issues.length;
        }

        if (syncScope.workflows) {
          const runs = await fetchWorkflowRuns(since);
          const wfSignals = await workflowsToSignals(runs, organizationId);
          allSignals.push(...wfSignals);
          recordsProcessed += runs.length;
        }

        if (syncScope.commits) {
          const commits = await fetchCommits(since);
          allSignals.push(...commitsToSignals(commits, organizationId));
          recordsProcessed += commits.length;
        }

        await storeConnectorSignals(supabase, allSignals);

        const result: ConnectorSyncResult = {
          success: true,
          signalsGenerated: allSignals.length,
          recordsProcessed,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        // Record sync result (non-fatal — signals are already stored)
        try {
          await recordSyncResult(supabase, 'github', organizationId, result);
        } catch (recordErr: any) {
          errors.push(`Sync recording non-fatal: ${recordErr.message}`);
        }
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    handleWebhook(payload: unknown): ConnectorSignal[] {
      const event = payload as any;
      if (!event) return [];

      const signals: ConnectorSignal[] = [];
      const orgId = event.organization?.id?.toString() || '';

      // Pull request events
      if (event.pull_request && event.action !== 'review_requested') {
        const pr = event.pull_request;
        const action = event.action;

        if (action === 'opened') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.github',
            signal_type: 'pr_opened',
            signal_value: 1,
            entity_type: 'pull_request',
            entity_id: `pr_${pr.number}`,
            metadata: {
              title: pr.title,
              author: pr.user?.login,
              action,
              reviewers_requested: pr.requested_reviewers?.map((r: any) => r.login) || [],
            },
          });
        }

        if (action === 'closed' && pr.merged) {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.github',
            signal_type: 'pr_merged',
            signal_value: 1,
            entity_type: 'pull_request',
            entity_id: `pr_${pr.number}`,
            metadata: { title: pr.title, author: pr.user?.login },
          });
        }
      }

      // Pull request review events (new)
      if (event.review && event.pull_request) {
        const review = event.review;
        const pr = event.pull_request;
        const reviewValue =
          review.state === 'approved' ? 1 :
          review.state === 'changes_requested' ? -0.3 :
          0.5;

        const sentiment = review.body ? analyzeSentiment(review.body) : null;
        const topics = review.body ? extractTopics(review.body) : null;

        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.github',
          signal_type: 'pr_review_submitted',
          signal_value: reviewValue,
          entity_type: 'pull_request',
          entity_id: `pr_${pr.number}`,
          metadata: {
            pr_number: pr.number,
            reviewer: review.user?.login,
            state: review.state,
            review_body_length: review.body?.length || 0,
            sentiment_score: sentiment?.score ?? 0,
            sentiment_label: sentiment?.label ?? 'neutral',
            topics: topics?.keywords.map((k: any) => k.word) || [],
          },
        });
      }

      // Issue events
      if (event.issue && !event.pull_request) {
        const issue = event.issue;
        const action = event.action;
        const isBug = issue.labels?.some((l: any) =>
          ['bug', 'defect', 'incident'].includes(l.name?.toLowerCase())
        );

        if (action === 'opened') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.github',
            signal_type: isBug ? 'bug_opened' : 'issue_opened',
            signal_value: isBug ? -0.5 : 0.5,
            entity_type: 'issue',
            entity_id: `issue_${issue.number}`,
            metadata: { title: issue.title, is_bug: isBug },
          });
        }

        if (action === 'closed') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.github',
            signal_type: isBug ? 'bug_closed' : 'issue_closed',
            signal_value: 1,
            entity_type: 'issue',
            entity_id: `issue_${issue.number}`,
            metadata: {
              title: issue.title,
              assignee: issue.assignee?.login,
              labels: issue.labels?.map((l: any) => l.name),
            },
          });
        }
      }

      // Workflow/check suite events
      if (event.check_suite) {
        const suite = event.check_suite;
        if (suite.conclusion) {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.github',
            signal_type: suite.conclusion === 'success' ? 'ci_passed' : 'ci_failed',
            signal_value: suite.conclusion === 'success' ? 1 : -1,
            entity_type: 'ci_run',
            entity_id: `ci_${suite.id}`,
            metadata: { conclusion: suite.conclusion, branch: suite.head_branch },
          });
        }
      }

      // Workflow job events (new — individual job completion)
      if (event.workflow_job) {
        const job = event.workflow_job;
        if (job.conclusion) {
          const isJobSuccess = job.conclusion === 'success';
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering.github',
            signal_type: isJobSuccess ? 'ci_job_passed' : 'ci_job_failed',
            signal_value: isJobSuccess ? 1 : -1,
            entity_type: 'ci_job',
            entity_id: `job_${job.id}`,
            metadata: {
              job_name: job.name,
              conclusion: job.conclusion,
              workflow_name: job.workflow_name,
              branch: job.head_branch,
            },
          });
        }
      }

      // Deployment events
      if (event.deployment_status) {
        const status = event.deployment_status;
        const isSuccess = status.state === 'success';
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering.github',
          signal_type: isSuccess ? 'deploy_success' : 'deploy_failure',
          signal_value: isSuccess ? 1 : -1,
          entity_type: 'deployment',
          entity_id: `deploy_${event.deployment?.id}`,
          metadata: { state: status.state, environment: status.environment },
        });
      }

      return signals;
    },
  };
}
