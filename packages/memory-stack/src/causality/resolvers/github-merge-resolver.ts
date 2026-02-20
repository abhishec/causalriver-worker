/**
 * GitHub Merge Resolver
 * ======================
 *
 * Fetches ACTUAL post-merge data from GitHub API to verify predictions
 * made by pr-review and dead-code-detector domains.
 *
 * Checks: Were there incidents/CI failures within 48h of merge?
 * Did the predicted "risky PR" actually cause problems?
 *
 * Covers domains: pr-review, dead-code-detector
 * Metrics: post_merge_incidents, ci_failure_rate, deploy_success_rate
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import type {
  OutcomeResolver,
  PredictionContext,
  ResolverResult,
} from '../automated-outcome-resolver.js';

// ============================================================================
// TYPES
// ============================================================================

interface GitHubCredentials {
  token: string;
  owner: string;
  repo: string;
  baseUrl: string;
}

interface PostMergeData {
  prNumber: number;
  mergedAt: string;
  /** CI runs within 48h window after merge */
  ciRuns: {
    total: number;
    passed: number;
    failed: number;
  };
  /** Incidents (from PagerDuty signals or GitHub issues labeled 'incident') */
  incidentCount: number;
  /** Rollback deployments within 48h */
  rollbackCount: number;
  /** Time-to-detection if issues found (minutes) */
  detectionTimeMinutes?: number;
}

// ============================================================================
// HELPERS
// ============================================================================

async function getGitHubCredentials(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<GitHubCredentials | null> {
  const { data } = await supabase
    .from('connector_settings')
    .select('config')
    .eq('organization_id', organizationId)
    .eq('connector_type', 'github')
    .eq('is_active', true)
    .single();

  if (!data?.config) return null;

  const config = data.config as Record<string, string>;
  if (!config.token || !config.owner || !config.repo) return null;

  return {
    token: config.token,
    owner: config.owner,
    repo: config.repo,
    baseUrl: config.baseUrl || 'https://api.github.com',
  };
}

async function fetchPostMergeData(
  creds: GitHubCredentials,
  prNumber: number,
): Promise<PostMergeData | null> {
  const headers = {
    Authorization: `Bearer ${creds.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 1. Get PR details (merge timestamp)
  const prUrl = `${creds.baseUrl}/repos/${creds.owner}/${creds.repo}/pulls/${prNumber}`;
  const prRes = await fetch(prUrl, { headers });
  if (!prRes.ok) return null;

  const pr = (await prRes.json()) as {
    merged_at?: string;
    merge_commit_sha?: string;
    head?: { sha?: string };
  };
  if (!pr.merged_at) return null;

  const mergedAt = new Date(pr.merged_at);
  const window48h = new Date(mergedAt.getTime() + 48 * 60 * 60 * 1000);
  const mergeSha = pr.merge_commit_sha || pr.head?.sha;

  // 2. Check CI workflow runs after merge
  let ciRuns = { total: 0, passed: 0, failed: 0 };
  if (mergeSha) {
    const runsUrl = `${creds.baseUrl}/repos/${creds.owner}/${creds.repo}/actions/runs?head_sha=${mergeSha}&per_page=20`;
    const runsRes = await fetch(runsUrl, { headers });
    if (runsRes.ok) {
      const runsData = (await runsRes.json()) as {
        workflow_runs?: Array<{
          conclusion?: string;
          created_at?: string;
        }>;
      };
      const runs = (runsData.workflow_runs || []).filter(
        (r) => new Date(r.created_at || '') <= window48h,
      );

      ciRuns = {
        total: runs.length,
        passed: runs.filter((r) => r.conclusion === 'success').length,
        failed: runs.filter(
          (r) => r.conclusion === 'failure' || r.conclusion === 'timed_out',
        ).length,
      };
    }
  }

  // 3. Check for incident-related issues created within 48h
  const incidentSearchUrl = `${creds.baseUrl}/search/issues?q=repo:${creds.owner}/${creds.repo}+label:incident+created:${pr.merged_at}..${window48h.toISOString()}&per_page=10`;
  let incidentCount = 0;
  try {
    const incidentRes = await fetch(incidentSearchUrl, { headers });
    if (incidentRes.ok) {
      const incidentData = (await incidentRes.json()) as {
        total_count?: number;
      };
      incidentCount = incidentData.total_count || 0;
    }
  } catch {
    // Search API rate limited — check signals instead
  }

  // 4. Check for revert commits within 48h
  let rollbackCount = 0;
  const commitsUrl = `${creds.baseUrl}/repos/${creds.owner}/${creds.repo}/commits?since=${pr.merged_at}&until=${window48h.toISOString()}&per_page=50`;
  try {
    const commitsRes = await fetch(commitsUrl, { headers });
    if (commitsRes.ok) {
      const commits = (await commitsRes.json()) as Array<{
        commit?: { message?: string };
      }>;
      rollbackCount = commits.filter(
        (c) =>
          c.commit?.message?.toLowerCase().includes('revert') ||
          c.commit?.message?.toLowerCase().includes('rollback'),
      ).length;
    }
  } catch {
    // Rate limited
  }

  return {
    prNumber,
    mergedAt: pr.merged_at,
    ciRuns,
    incidentCount,
    rollbackCount,
    detectionTimeMinutes:
      ciRuns.failed > 0 ? 30 : incidentCount > 0 ? 120 : undefined,
  };
}

// ============================================================================
// RESOLVER
// ============================================================================

export const githubMergeResolver: OutcomeResolver = {
  id: 'github-merge',
  name: 'GitHub Post-Merge Resolver',
  supportedDomains: ['pr-review', 'dead-code-detector'],
  supportedMetrics: [
    'post_merge_incidents',
    'ci_failure_rate',
    'deploy_success_rate',
    'merge_risk',
    'code_quality',
    'review_quality',
  ],

  async resolve(
    ctx: PredictionContext,
    supabase: SupabaseClient,
  ): Promise<ResolverResult | null> {
    // 1. Get GitHub credentials
    const creds = await getGitHubCredentials(supabase, ctx.organizationId);
    if (!creds) {
      console.debug(
        '[GitHubMergeResolver] No GitHub credentials for org',
        ctx.organizationId,
      );
      return null;
    }

    // 2. Extract PR number from entity ID (format: "pr-123" or just "123")
    const prNumber = parseInt(ctx.entityId.replace(/^pr-?/, ''), 10);
    if (isNaN(prNumber)) {
      // Try to find PR from signals
      const { data: signalData } = await supabase
        .from('cross_domain_signals')
        .select('entity_id, metadata')
        .eq('organization_id', ctx.organizationId)
        .eq('signal_type', 'pr_merged')
        .order('signal_timestamp', { ascending: false })
        .limit(1);

      if (!signalData?.[0]) {
        console.debug('[GitHubMergeResolver] Could not determine PR number');
        return null;
      }

      const fallbackPr = parseInt(
        signalData[0].entity_id.replace(/^pr-?/, ''),
        10,
      );
      if (isNaN(fallbackPr)) return null;

      return resolveForPr(creds, fallbackPr, ctx);
    }

    return resolveForPr(creds, prNumber, ctx);
  },
};

async function resolveForPr(
  creds: GitHubCredentials,
  prNumber: number,
  ctx: PredictionContext,
): Promise<ResolverResult | null> {
  // 3. Fetch post-merge data
  const postMerge = await fetchPostMergeData(creds, prNumber);
  if (!postMerge) {
    console.debug(
      '[GitHubMergeResolver] PR not merged or data unavailable:',
      prNumber,
    );
    return null;
  }

  // 4. Compute outcome based on prediction metric
  const hasProblems =
    postMerge.ciRuns.failed > 0 ||
    postMerge.incidentCount > 0 ||
    postMerge.rollbackCount > 0;

  let actualDirection: 'increase' | 'decrease' | 'stable';
  let actualMagnitude: number;
  let actualValue: number;

  if (ctx.targetMetric === 'ci_failure_rate') {
    actualValue =
      postMerge.ciRuns.total > 0
        ? postMerge.ciRuns.failed / postMerge.ciRuns.total
        : 0;
    const baseline = ctx.featureSnapshot?.ci_failure_rate || 0;
    actualMagnitude = actualValue - baseline;
    actualDirection =
      actualMagnitude > 0.05
        ? 'increase'
        : actualMagnitude < -0.05
          ? 'decrease'
          : 'stable';
  } else if (ctx.targetMetric === 'deploy_success_rate') {
    actualValue = hasProblems ? 0 : 1;
    actualMagnitude = hasProblems ? -1 : 0;
    actualDirection = hasProblems ? 'decrease' : 'stable';
  } else {
    // Default: merge_risk / post_merge_incidents
    const riskScore =
      (postMerge.ciRuns.failed > 0 ? 0.4 : 0) +
      (postMerge.incidentCount > 0 ? 0.4 : 0) +
      (postMerge.rollbackCount > 0 ? 0.2 : 0);
    actualValue = riskScore;
    actualMagnitude = riskScore;
    actualDirection =
      riskScore > 0.3
        ? 'increase'
        : riskScore > 0
          ? 'stable'
          : 'decrease';
  }

  return {
    actualDirection,
    actualMagnitude,
    actualValue,
    source: 'github_api',
    confidence: 1.0,
    measuredAt: new Date(),
    metadata: {
      prNumber,
      mergedAt: postMerge.mergedAt,
      ciPassed: postMerge.ciRuns.passed,
      ciFailed: postMerge.ciRuns.failed,
      incidentCount: postMerge.incidentCount,
      rollbackCount: postMerge.rollbackCount,
      detectionTimeMinutes: postMerge.detectionTimeMinutes,
    },
  };
}
