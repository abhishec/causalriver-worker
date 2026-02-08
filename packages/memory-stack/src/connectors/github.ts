/**
 * GitHub Connector
 *
 * Syncs engineering signals from GitHub repositories:
 *   - Pull requests (opened, merged, changes_requested)
 *   - Issues (opened, closed, labeled as bug)
 *   - CI/CD workflow runs (passed, failed)
 *   - Deployments (success, failure)
 *   - Commits (volume, frequency)
 *
 * These signals feed into the causal graph engine to discover
 * relationships like: deploy_failures → support_ticket_spikes,
 * or pr_review_time → shipping_velocity.
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
  /** Which data to sync (default: all true) */
  syncScope?: {
    pulls?: boolean;
    issues?: boolean;
    commits?: boolean;
    workflows?: boolean;
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
    syncScope = { pulls: true, issues: true, commits: true, workflows: true },
  } = config;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

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
    const params: Record<string, string> = {
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: '100',
    };
    if (since) {
      params.since = since.toISOString();
    }

    const prs = await fetchJSON<GitHubPR[]>(`/repos/${owner}/${repo}/pulls`, params);

    // Fetch detailed stats for each PR (additions/deletions)
    const detailed: GitHubPR[] = [];
    for (const pr of prs) {
      if (since && new Date(pr.updated_at) < since) continue;
      try {
        const detail = await fetchJSON<GitHubPR>(`/repos/${owner}/${repo}/pulls/${pr.number}`);
        detailed.push(detail);
      } catch {
        detailed.push(pr); // Use basic data if detail fetch fails
      }
    }
    return detailed;
  }

  async function fetchIssues(since?: Date): Promise<GitHubIssue[]> {
    const params: Record<string, string> = {
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: '100',
      filter: 'all',
    };
    if (since) {
      params.since = since.toISOString();
    }

    const items = await fetchJSON<GitHubIssue[]>(`/repos/${owner}/${repo}/issues`, params);
    // Filter out pull requests (GitHub API includes PRs in issues endpoint)
    return items.filter((i) => !(i as any).pull_request);
  }

  async function fetchWorkflowRuns(since?: Date): Promise<GitHubWorkflowRun[]> {
    const params: Record<string, string> = {
      per_page: '100',
    };
    if (since) {
      params.created = `>=${since.toISOString().split('T')[0]}`;
    }

    const data = await fetchJSON<{ workflow_runs: GitHubWorkflowRun[] }>(
      `/repos/${owner}/${repo}/actions/runs`,
      params
    );
    return data.workflow_runs || [];
  }

  async function fetchCommits(since?: Date): Promise<GitHubCommit[]> {
    const params: Record<string, string> = {
      per_page: '100',
    };
    if (since) {
      params.since = since.toISOString();
    }

    return fetchJSON<GitHubCommit[]>(`/repos/${owner}/${repo}/commits`, params);
  }

  // ── Signal transformers ──────────────────────────────────────────

  function prsToSignals(prs: GitHubPR[], orgId: string): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const pr of prs) {
      const linesChanged = (pr.additions || 0) + (pr.deletions || 0);
      const isBug = pr.labels?.some((l) => l.name.toLowerCase().includes('bug'));

      // PR opened
      signals.push({
        organization_id: orgId,
        source_domain: 'engineering',
        signal_type: 'pr_opened',
        signal_value: 1,
        entity_type: 'pull_request',
        entity_id: `pr_${pr.number}`,
        metadata: {
          title: pr.title,
          author: pr.user?.login,
          lines_changed: linesChanged,
          files_changed: pr.changed_files,
          is_bug_fix: isBug,
          created_at: pr.created_at,
        },
      });

      // PR merged
      if (pr.merged_at) {
        const reviewDays =
          (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) /
          (1000 * 60 * 60 * 24);

        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: 'pr_merged',
          signal_value: Math.min(linesChanged / 500, 1), // Normalized by 500 lines
          entity_type: 'pull_request',
          entity_id: `pr_${pr.number}`,
          metadata: {
            title: pr.title,
            author: pr.user?.login,
            lines_changed: linesChanged,
            review_time_days: Math.round(reviewDays * 10) / 10,
            is_bug_fix: isBug,
          },
        });
      }

      // PR closed without merge (abandoned)
      if (pr.state === 'closed' && !pr.merged_at) {
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: 'pr_abandoned',
          signal_value: -0.3,
          entity_type: 'pull_request',
          entity_id: `pr_${pr.number}`,
          metadata: {
            title: pr.title,
            author: pr.user?.login,
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
        source_domain: 'engineering',
        signal_type: isBug ? 'bug_opened' : 'issue_opened',
        signal_value: isBug ? -0.5 : 0.5,
        entity_type: 'issue',
        entity_id: `issue_${issue.number}`,
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
          source_domain: 'engineering',
          signal_type: isBug ? 'bug_closed' : 'issue_closed',
          signal_value: 1,
          entity_type: 'issue',
          entity_id: `issue_${issue.number}`,
          metadata: {
            title: issue.title,
            resolution_time_days: Math.round(resolutionDays * 10) / 10,
            is_bug: isBug,
          },
        });
      }
    }

    return signals;
  }

  function workflowsToSignals(runs: GitHubWorkflowRun[], orgId: string): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const run of runs) {
      if (run.status !== 'completed') continue;

      const isSuccess = run.conclusion === 'success';
      const isFailure = run.conclusion === 'failure';
      const isDeploy = run.name.toLowerCase().includes('deploy') ||
                        run.event === 'deployment' ||
                        run.event === 'release';

      if (isDeploy) {
        // Deployment signals
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: isSuccess ? 'deploy_success' : 'deploy_failure',
          signal_value: isSuccess ? 1 : -1,
          entity_type: 'deployment',
          entity_id: `deploy_${run.id}`,
          metadata: {
            workflow: run.name,
            branch: run.head_branch,
            conclusion: run.conclusion,
            event: run.event,
            created_at: run.created_at,
          },
        });
      } else {
        // CI signals
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
          signal_type: isFailure ? 'ci_failed' : 'ci_passed',
          signal_value: isFailure ? -1 : 1,
          entity_type: 'ci_run',
          entity_id: `ci_${run.id}`,
          metadata: {
            workflow: run.name,
            branch: run.head_branch,
            conclusion: run.conclusion,
            event: run.event,
          },
        });
      }
    }

    return signals;
  }

  function commitsToSignals(commits: GitHubCommit[], orgId: string): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    // Aggregate commits by day for volume signal
    const commitsByDay = new Map<string, number>();
    for (const commit of commits) {
      const day = commit.commit.author.date.split('T')[0];
      commitsByDay.set(day, (commitsByDay.get(day) || 0) + 1);
    }

    for (const [day, count] of commitsByDay) {
      signals.push({
        organization_id: orgId,
        source_domain: 'engineering',
        signal_type: 'commit_volume',
        signal_value: Math.min(count / 20, 1), // Normalized by 20 commits/day
        entity_type: 'metric',
        entity_id: `commits_${day}`,
        metadata: {
          date: day,
          commit_count: count,
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
          allSignals.push(...prsToSignals(prs, organizationId));
          recordsProcessed += prs.length;
        }

        if (syncScope.issues) {
          const issues = await fetchIssues();
          allSignals.push(...issuesToSignals(issues, organizationId));
          recordsProcessed += issues.length;
        }

        if (syncScope.workflows) {
          const runs = await fetchWorkflowRuns();
          allSignals.push(...workflowsToSignals(runs, organizationId));
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

        await recordSyncResult(supabase, 'github', organizationId, result);
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
          allSignals.push(...prsToSignals(prs, organizationId));
          recordsProcessed += prs.length;
        }

        if (syncScope.issues) {
          const issues = await fetchIssues(since);
          allSignals.push(...issuesToSignals(issues, organizationId));
          recordsProcessed += issues.length;
        }

        if (syncScope.workflows) {
          const runs = await fetchWorkflowRuns(since);
          allSignals.push(...workflowsToSignals(runs, organizationId));
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

        await recordSyncResult(supabase, 'github', organizationId, result);
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
      if (event.pull_request) {
        const pr = event.pull_request;
        const action = event.action;

        if (action === 'opened') {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering',
            signal_type: 'pr_opened',
            signal_value: 1,
            entity_type: 'pull_request',
            entity_id: `pr_${pr.number}`,
            metadata: { title: pr.title, author: pr.user?.login, action },
          });
        }

        if (action === 'closed' && pr.merged) {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering',
            signal_type: 'pr_merged',
            signal_value: 1,
            entity_type: 'pull_request',
            entity_id: `pr_${pr.number}`,
            metadata: { title: pr.title, author: pr.user?.login },
          });
        }
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
            source_domain: 'engineering',
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
            source_domain: 'engineering',
            signal_type: isBug ? 'bug_closed' : 'issue_closed',
            signal_value: 1,
            entity_type: 'issue',
            entity_id: `issue_${issue.number}`,
            metadata: { title: issue.title },
          });
        }
      }

      // Workflow/check suite events
      if (event.check_suite) {
        const suite = event.check_suite;
        if (suite.conclusion) {
          signals.push({
            organization_id: orgId,
            source_domain: 'engineering',
            signal_type: suite.conclusion === 'success' ? 'ci_passed' : 'ci_failed',
            signal_value: suite.conclusion === 'success' ? 1 : -1,
            entity_type: 'ci_run',
            entity_id: `ci_${suite.id}`,
            metadata: { conclusion: suite.conclusion, branch: suite.head_branch },
          });
        }
      }

      // Deployment events
      if (event.deployment_status) {
        const status = event.deployment_status;
        const isSuccess = status.state === 'success';
        signals.push({
          organization_id: orgId,
          source_domain: 'engineering',
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
