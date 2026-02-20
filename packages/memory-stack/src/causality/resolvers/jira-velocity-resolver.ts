/**
 * Jira Velocity Resolver
 * =======================
 *
 * Fetches ACTUAL sprint velocity/completion data from Jira API to verify
 * predictions made by early-warning and scope-creep domains.
 *
 * Instead of asking the brain "did velocity drop?" (circular), this
 * queries Jira's sprint reports for real completion percentages.
 *
 * Covers domains: early-warning, scope-creep, delivery-intelligence
 * Metrics: sprint_velocity, velocity_change, scope_change, completion_rate
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

interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

interface SprintData {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  velocity?: number;
  completedIssues: number;
  totalIssues: number;
  puntedIssues: number;
  completionRate: number;
}

// ============================================================================
// HELPER: Fetch Jira Credentials from Connector Settings
// ============================================================================

async function getJiraCredentials(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<JiraCredentials | null> {
  const { data } = await supabase
    .from('connector_settings')
    .select('config')
    .eq('organization_id', organizationId)
    .eq('connector_type', 'jira')
    .eq('is_active', true)
    .single();

  if (!data?.config) return null;

  const config = data.config as Record<string, string>;
  if (!config.baseUrl || !config.email || !config.apiToken) return null;

  return {
    baseUrl: config.baseUrl,
    email: config.email,
    apiToken: config.apiToken,
  };
}

// ============================================================================
// HELPER: Fetch Sprint Data from Jira API
// ============================================================================

async function fetchRecentSprints(
  creds: JiraCredentials,
  boardId: number,
  limit = 3,
): Promise<SprintData[]> {
  const auth = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: 'application/json',
  };

  // Fetch closed sprints
  const sprintUrl = `${creds.baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=closed&maxResults=${limit}`;
  const sprintRes = await fetch(sprintUrl, { headers });
  if (!sprintRes.ok) return [];

  const sprintData = await sprintRes.json() as { values?: Array<{
    id: number;
    name: string;
    state: string;
    startDate?: string;
    endDate?: string;
    completeDate?: string;
  }> };
  const sprints = sprintData.values || [];

  const results: SprintData[] = [];

  for (const sprint of sprints) {
    try {
      // Fetch sprint report for velocity data
      const reportUrl = `${creds.baseUrl}/rest/agile/1.0/sprint/${sprint.id}/issue?maxResults=200`;
      const reportRes = await fetch(reportUrl, { headers });

      if (reportRes.ok) {
        const report = await reportRes.json() as { issues?: Array<{ fields?: { status?: { statusCategory?: { key?: string } }; story_points?: number } }> };
        const issues = report.issues || [];
        const completed = issues.filter(
          (i: { fields?: { status?: { statusCategory?: { key?: string } } } }) =>
            i.fields?.status?.statusCategory?.key === 'done',
        );

        const totalPoints = issues.reduce(
          (sum: number, i: { fields?: { story_points?: number } }) =>
            sum + (i.fields?.story_points || 0),
          0,
        );
        const completedPoints = completed.reduce(
          (sum: number, i: { fields?: { story_points?: number } }) =>
            sum + (i.fields?.story_points || 0),
          0,
        );

        results.push({
          id: sprint.id,
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          completeDate: sprint.completeDate,
          velocity: completedPoints,
          completedIssues: completed.length,
          totalIssues: issues.length,
          puntedIssues: issues.length - completed.length,
          completionRate:
            issues.length > 0 ? completed.length / issues.length : 0,
        });
      }
    } catch {
      // Skip sprint if report fetch fails
    }
  }

  return results;
}

// ============================================================================
// HELPER: Extract Board ID from Entity
// ============================================================================

async function findBoardId(
  supabase: SupabaseClient,
  organizationId: string,
  entityId: string,
): Promise<number | null> {
  // Try to find board ID from connector sync metadata
  const { data } = await supabase
    .from('cross_domain_signals')
    .select('metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'sprint_completed')
    .order('signal_timestamp', { ascending: false })
    .limit(1);

  if (data?.[0]?.metadata?.board_id) {
    return Number(data[0].metadata.board_id);
  }

  // Try entity_id as project key → look up boards
  // For now, try parsing from stored signals
  const { data: signals } = await supabase
    .from('cross_domain_signals')
    .select('metadata')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .ilike('signal_type', '%sprint%')
    .order('signal_timestamp', { ascending: false })
    .limit(5);

  for (const sig of signals || []) {
    const meta = sig.metadata as Record<string, unknown> | null;
    if (meta?.board_id) return Number(meta.board_id);
  }

  return null;
}

// ============================================================================
// RESOLVER
// ============================================================================

export const jiraVelocityResolver: OutcomeResolver = {
  id: 'jira-velocity',
  name: 'Jira Sprint Velocity Resolver',
  supportedDomains: ['early-warning', 'scope-creep', 'delivery-intelligence'],
  supportedMetrics: [
    'sprint_velocity',
    'velocity_change',
    'scope_change',
    'completion_rate',
    'velocity_ratio',
    'sprint_completed',
    'health_score',
  ],

  async resolve(
    ctx: PredictionContext,
    supabase: SupabaseClient,
  ): Promise<ResolverResult | null> {
    // 1. Get Jira credentials
    const creds = await getJiraCredentials(supabase, ctx.organizationId);
    if (!creds) {
      console.debug(
        '[JiraVelocityResolver] No Jira credentials for org',
        ctx.organizationId,
      );
      return null; // No Jira configured → fall through to user verification
    }

    // 2. Find the board ID
    const boardId = await findBoardId(supabase, ctx.organizationId, ctx.entityId);
    if (!boardId) {
      console.debug('[JiraVelocityResolver] Could not determine board ID');
      return null;
    }

    // 3. Fetch recent sprints
    const sprints = await fetchRecentSprints(creds, boardId, 3);
    if (sprints.length < 2) {
      console.debug('[JiraVelocityResolver] Insufficient sprint data');
      return null;
    }

    // 4. Compare velocity/completion between sprints
    const latest = sprints[0];
    const previous = sprints[1];

    let actualValue: number;
    let previousValue: number;

    if (
      ctx.targetMetric === 'completion_rate' ||
      ctx.targetMetric === 'velocity_ratio'
    ) {
      actualValue = latest.completionRate;
      previousValue = previous.completionRate;
    } else if (ctx.targetMetric === 'scope_change') {
      actualValue = latest.puntedIssues;
      previousValue = previous.puntedIssues;
    } else {
      // Default: velocity (story points completed)
      actualValue = latest.velocity || 0;
      previousValue = previous.velocity || 0;
    }

    const change =
      previousValue !== 0
        ? (actualValue - previousValue) / Math.abs(previousValue)
        : actualValue > 0
          ? 1
          : 0;

    const stableThreshold = 0.05;
    const direction: 'increase' | 'decrease' | 'stable' =
      change > stableThreshold
        ? 'increase'
        : change < -stableThreshold
          ? 'decrease'
          : 'stable';

    return {
      actualDirection: direction,
      actualMagnitude: change,
      actualValue,
      source: 'jira_api',
      confidence: 1.0, // Hard API data — maximum confidence
      measuredAt: latest.completeDate
        ? new Date(latest.completeDate)
        : new Date(),
      metadata: {
        latestSprint: latest.name,
        previousSprint: previous.name,
        latestVelocity: latest.velocity,
        previousVelocity: previous.velocity,
        latestCompletionRate: latest.completionRate,
        previousCompletionRate: previous.completionRate,
        boardId,
      },
    };
  },
};
