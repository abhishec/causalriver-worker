/**
 * Git Code Trainer — GitHub Data Fetcher
 * 
 * Pulls PRs, issues, commits, and workflow runs from public GitHub repos
 * using the GitHub REST API. Supports pagination and rate limiting.
 * 
 * Uses native fetch() — no gh CLI required.
 * Set GITHUB_TOKEN env var for 5000 req/hr (vs 60 unauthenticated).
 */

// ============================================================================
// TYPES
// ============================================================================

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  user: { login: string };
  labels: Array<{ name: string }>;
  review_comments: number;
  comments: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  created_at: string;
  closed_at: string | null;
  labels: Array<{ name: string }>;
  user: { login: string };
  comments: number;
  pull_request?: any; // present if this is a PR (we filter these out)
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  head_branch: string;
  event: string;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string } | null;
  stats?: { additions: number; deletions: number; total: number };
}

export interface GitHubReview {
  id: number;
  user: { login: string };
  state: string; // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED
  body: string;
  submitted_at: string;
}

export interface GitHubFile {
  filename: string;
  status: string; // added, removed, modified, renamed
  additions: number;
  deletions: number;
  changes: number;
}

export interface RepoData {
  owner: string;
  repo: string;
  pulls: GitHubPR[];
  issues: GitHubIssue[];
  workflowRuns: GitHubWorkflowRun[];
  commits: GitHubCommit[];
  reviews: Map<number, GitHubReview[]>;
  fileChanges: Map<number, GitHubFile[]>;
  fetchedAt: Date;
}

export interface FetchOptions {
  /** Max PRs to fetch per repo (default: 200) */
  maxPRs?: number;
  /** Max issues to fetch per repo (default: 200) */
  maxIssues?: number;
  /** Max commits to fetch per repo (default: 200) */
  maxCommits?: number;
  /** Max workflow runs to fetch per repo (default: 100) */
  maxWorkflowRuns?: number;
  /** Fetch PR reviews (adds 1 API call per PR, default: true for first 50 PRs) */
  fetchReviews?: boolean;
  /** Max PRs to fetch reviews for (default: 50) */
  maxReviewPRs?: number;
  /** Fetch PR file changes (adds 1 API call per PR, default: true for first 50 PRs) */
  fetchFileChanges?: boolean;
  /** Max PRs to fetch file changes for (default: 50) */
  maxFileChangePRs?: number;
  /** Only fetch data since this date (ISO string) */
  since?: string;
  /** Rate limit delay between requests in ms (default: 100) */
  rateLimitDelay?: number;
}

// ============================================================================
// GITHUB API HELPER
// ============================================================================

const GITHUB_API = 'https://api.github.com';

async function githubFetch(endpoint: string, token?: string, _retryCount: number = 0): Promise<any> {
  const MAX_RETRIES = 3;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'NexusBrain-GitTrainer/1.0',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${GITHUB_API}${endpoint}`, { headers });

  if (response.status === 403) {
    if (_retryCount >= MAX_RETRIES) {
      throw new Error(`GitHub API 403 after ${MAX_RETRIES} retries: rate limit not recovering`);
    }
    // Check for primary rate limiting
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAt = response.headers.get('x-ratelimit-reset');
    if (remaining === '0' && resetAt) {
      const resetDate = new Date(parseInt(resetAt) * 1000);
      const waitMs = Math.max(0, resetDate.getTime() - Date.now()) + 1000;
      console.log(`[GitFetcher] Primary rate limit hit. Waiting ${(waitMs / 1000).toFixed(0)}s until reset...`);
      if (waitMs < 600000) { // Wait up to 10 minutes
        await sleep(waitMs);
        return githubFetch(endpoint, token, _retryCount + 1);
      }
      throw new Error(`GitHub rate limit exceeded. Resets at ${resetDate.toISOString()}`);
    }
    // Secondary rate limit (abuse detection) — wait and retry
    const retryAfter = response.headers.get('retry-after');
    const waitSec = retryAfter ? parseInt(retryAfter) : 60;
    console.log(`[GitFetcher] Secondary rate limit hit (attempt ${_retryCount + 1}/${MAX_RETRIES}). Waiting ${waitSec}s...`);
    await sleep(waitSec * 1000);
    return githubFetch(endpoint, token, _retryCount + 1);
  }

  if (response.status === 429) {
    // Too many requests — back off
    if (_retryCount >= MAX_RETRIES) {
      throw new Error(`GitHub API 429 after ${MAX_RETRIES} retries`);
    }
    const retryAfter = response.headers.get('retry-after');
    const waitSec = retryAfter ? parseInt(retryAfter) : 30 * (_retryCount + 1);
    console.log(`[GitFetcher] 429 Too Many Requests (attempt ${_retryCount + 1}/${MAX_RETRIES}). Waiting ${waitSec}s...`);
    await sleep(waitSec * 1000);
    return githubFetch(endpoint, token, _retryCount + 1);
  }

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

/**
 * Paginate through GitHub API results.
 * Returns up to maxItems results.
 */
async function paginatedFetch<T>(
  endpoint: string,
  maxItems: number,
  token?: string,
  delay: number = 100,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const perPage = Math.min(100, maxItems);

  while (results.length < maxItems) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const data = await githubFetch(
      `${endpoint}${separator}per_page=${perPage}&page=${page}`,
      token,
    );

    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    page++;

    if (data.length < perPage) break; // Last page
    if (delay > 0) await sleep(delay);
  }

  return results.slice(0, maxItems);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MAIN FETCH FUNCTION
// ============================================================================

/**
 * Fetch comprehensive data for a single GitHub repository.
 */
export async function fetchRepoData(
  owner: string,
  repo: string,
  opts: FetchOptions = {},
): Promise<RepoData> {
  const {
    maxPRs = 200,
    maxIssues = 200,
    maxCommits = 200,
    maxWorkflowRuns = 100,
    fetchReviews = true,
    maxReviewPRs = 50,
    fetchFileChanges = true,
    maxFileChangePRs = 50,
    since,
    rateLimitDelay = 100,
  } = opts;

  const token = process.env.GITHUB_TOKEN;
  const log = (msg: string) => console.log(`[GitFetcher] [${owner}/${repo}] ${msg}`);

  log(`Fetching data (token: ${token ? 'YES' : 'NO'})...`);

  // Fetch PRs, issues, commits, and workflow runs in parallel
  const sinceParam = since ? `&since=${since}` : '';
  const [pulls, rawIssues, commits, workflowRuns] = await Promise.all([
    paginatedFetch<GitHubPR>(
      `/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc${sinceParam}`,
      maxPRs, token, rateLimitDelay,
    ).then(data => {
      log(`  PRs: ${data.length}`);
      return data;
    }).catch(err => {
      log(`  PRs: FAILED (${err.message})`);
      return [] as GitHubPR[];
    }),

    paginatedFetch<GitHubIssue>(
      `/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc${sinceParam}`,
      maxIssues + maxPRs, // Issues endpoint includes PRs, we filter later
      token, rateLimitDelay,
    ).then(data => {
      // Filter out pull requests (they have a pull_request key)
      const issues = data.filter(i => !i.pull_request);
      log(`  Issues: ${issues.length} (filtered from ${data.length} including PRs)`);
      return issues;
    }).catch(err => {
      log(`  Issues: FAILED (${err.message})`);
      return [] as GitHubIssue[];
    }),

    paginatedFetch<GitHubCommit>(
      `/repos/${owner}/${repo}/commits?${sinceParam ? `since=${since}&` : ''}per_page=100`,
      maxCommits, token, rateLimitDelay,
    ).then(data => {
      log(`  Commits: ${data.length}`);
      return data;
    }).catch(err => {
      log(`  Commits: FAILED (${err.message})`);
      return [] as GitHubCommit[];
    }),

    paginatedFetch<any>(
      `/repos/${owner}/${repo}/actions/runs?per_page=100`,
      maxWorkflowRuns, token, rateLimitDelay,
    ).then(data => {
      // Workflow runs are nested under .workflow_runs
      const runs = Array.isArray(data) ? data : [];
      log(`  Workflow runs: ${runs.length}`);
      return runs as GitHubWorkflowRun[];
    }).catch(err => {
      log(`  Workflow runs: FAILED (${err.message})`);
      return [] as GitHubWorkflowRun[];
    }),
  ]);

  // Issues are already filtered above
  const issues = rawIssues.slice(0, maxIssues);

  // Fetch reviews for recent PRs (most recent first)
  const reviews = new Map<number, GitHubReview[]>();
  if (fetchReviews && pulls.length > 0) {
    const prsForReviews = pulls.slice(0, maxReviewPRs);
    log(`  Fetching reviews for ${prsForReviews.length} PRs...`);
    let reviewCount = 0;
    for (const pr of prsForReviews) {
      try {
        const prReviews = await githubFetch(
          `/repos/${owner}/${repo}/pulls/${pr.number}/reviews`,
          token,
        );
        if (Array.isArray(prReviews) && prReviews.length > 0) {
          reviews.set(pr.number, prReviews);
          reviewCount += prReviews.length;
        }
        if (rateLimitDelay > 0) await sleep(rateLimitDelay);
      } catch {
        // Skip individual PR review failures
      }
    }
    log(`  Reviews: ${reviewCount} across ${reviews.size} PRs`);
  }

  // Fetch file changes for recent PRs
  const fileChanges = new Map<number, GitHubFile[]>();
  if (fetchFileChanges && pulls.length > 0) {
    const prsForFiles = pulls.slice(0, maxFileChangePRs);
    log(`  Fetching file changes for ${prsForFiles.length} PRs...`);
    let fileCount = 0;
    for (const pr of prsForFiles) {
      try {
        const files = await githubFetch(
          `/repos/${owner}/${repo}/pulls/${pr.number}/files`,
          token,
        );
        if (Array.isArray(files) && files.length > 0) {
          fileChanges.set(pr.number, files);
          fileCount += files.length;
        }
        if (rateLimitDelay > 0) await sleep(rateLimitDelay);
      } catch {
        // Skip individual PR file failures
      }
    }
    log(`  File changes: ${fileCount} across ${fileChanges.size} PRs`);
  }

  const result: RepoData = {
    owner, repo, pulls, issues, workflowRuns, commits,
    reviews, fileChanges,
    fetchedAt: new Date(),
  };

  const total = pulls.length + issues.length + commits.length + workflowRuns.length;
  log(`DONE: ${total} total records (${pulls.length} PRs, ${issues.length} issues, ${commits.length} commits, ${workflowRuns.length} workflows)`);

  return result;
}

/**
 * Fetch data for multiple repos with overall progress tracking.
 * Includes retry logic for repos that return 0 records (rate-limit recovery).
 */
export async function fetchAllRepos(
  repos: string[],
  opts: FetchOptions = {},
): Promise<RepoData[]> {
  const results: RepoData[] = [];
  const failedRepos: string[] = [];
  const startTime = Date.now();
  const token = process.env.GITHUB_TOKEN;

  console.log(`\n[GitFetcher] Fetching data from ${repos.length} repositories...\n`);

  // Check remaining rate limit before starting
  try {
    const rlResponse = await fetch('https://api.github.com/rate_limit', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    const rl = await rlResponse.json();
    console.log(`[GitFetcher] Rate limit: ${rl.rate?.remaining}/${rl.rate?.limit} remaining, resets at ${new Date((rl.rate?.reset || 0) * 1000).toISOString()}\n`);
  } catch { /* non-fatal */ }

  for (let i = 0; i < repos.length; i++) {
    const [owner, repo] = repos[i].split('/');
    const progress = `[${i + 1}/${repos.length}]`;

    console.log(`\n${progress} ── ${owner}/${repo} ──`);

    try {
      const data = await fetchRepoData(owner, repo, opts);
      const totalRecords = data.pulls.length + data.issues.length + data.commits.length + data.workflowRuns.length;

      if (totalRecords === 0) {
        console.log(`${progress} WARNING: 0 records — likely rate-limited, queuing for retry`);
        failedRepos.push(repos[i]);
      } else {
        results.push(data);
      }
    } catch (err) {
      console.error(`${progress} FAILED: ${err instanceof Error ? err.message : String(err)}`);
      failedRepos.push(repos[i]);
    }

    // Longer delay between repos to avoid secondary rate limiting (3s with token, 10s without)
    if (i < repos.length - 1) {
      const delay = token ? 3000 : 10000;
      await sleep(delay);
    }
  }

  // ── Retry failed repos with longer backoff ──
  if (failedRepos.length > 0) {
    console.log(`\n[GitFetcher] Retrying ${failedRepos.length} failed repos after 60s cooldown...\n`);
    await sleep(60000); // 60-second cooldown before retries

    for (let i = 0; i < failedRepos.length; i++) {
      const [owner, repo] = failedRepos[i].split('/');
      const progress = `[retry ${i + 1}/${failedRepos.length}]`;

      console.log(`\n${progress} ── ${owner}/${repo} ──`);

      try {
        const data = await fetchRepoData(owner, repo, opts);
        const totalRecords = data.pulls.length + data.issues.length + data.commits.length + data.workflowRuns.length;

        if (totalRecords > 0) {
          results.push(data);
          console.log(`${progress} SUCCESS on retry: ${totalRecords} records`);
        } else {
          console.log(`${progress} Still 0 records on retry — skipping`);
        }
      } catch (err) {
        console.error(`${progress} RETRY FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Longer delay between retries (5s)
      if (i < failedRepos.length - 1) {
        await sleep(5000);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[GitFetcher] Complete: ${results.length}/${repos.length} repos fetched in ${elapsed}s\n`);

  return results;
}
