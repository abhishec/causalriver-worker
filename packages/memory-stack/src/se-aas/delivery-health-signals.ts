/**
 * SE-aaS Delivery Health Signal Aggregation Engine
 * ===================================================
 *
 * Computes derived health signals from raw connector signals (pr_merged,
 * pr_reviewed, jira_issue_created, jira_comment, slack_message) and
 * writes them back into the dual-write pipeline so the causal brain
 * can discover delivery intelligence patterns automatically.
 *
 * Called from onSignalsIngested() hook after every connector sync.
 *
 * Signals emitted:
 *   engineer_review_burden  — PRs reviewed per engineer per week (metric)
 *   engineer_velocity_index — PRs merged per engineer per week (metric)
 *   ticket_response_lag     — Hours from ticket create → first comment (metric)
 *   engagement_scope_velocity — Rate of story point addition per sprint (outcome)
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { storeDualWriteConnectorSignals } from '../ingestion/connector-signal-bridge';
import type { ConnectorSignal } from '../connectors/connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface DeliveryHealthConfig {
  supabase: SupabaseClient;
  organizationId: string;
  /** Lookback window in days. Defaults to 7 (one sprint week). */
  lookbackDays?: number;
}

export interface EngagementRef {
  id: string;
  jira_projects: string[];
  jira_labels: string[];
  github_repos: string[];
}

export interface AggregationResult {
  signalsEmitted: number;
  engineersProcessed: number;
  engagementsProcessed: number;
  errors: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

function isoWeekMonday(d: Date = new Date()): string {
  const date = new Date(d);
  const day = date.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().split('T')[0];
}

function lookbackCutoff(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ============================================================================
// GAP 1A: REVIEW BURDEN — PRs reviewed per engineer per week
// ============================================================================

/**
 * Reads pr_reviewed signals from connector_signals, groups by reviewer,
 * and emits an engineer_review_burden signal per reviewer.
 * Also writes engineer_health_snapshots rows.
 */
export async function computeReviewBurden(
  config: DeliveryHealthConfig
): Promise<number> {
  const { supabase, organizationId, lookbackDays = 7 } = config;
  const cutoff = lookbackCutoff(lookbackDays);
  const weekStart = isoWeekMonday();

  const { data: rows, error } = await supabase
    .from('connector_signals')
    .select('metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'pr_reviewed')
    .gte('created_at', cutoff);

  if (error || !rows?.length) return 0;

  // Group by reviewer login
  const reviewerCounts: Record<string, number> = {};
  for (const row of rows) {
    const meta = row.metadata as Record<string, unknown> | null;
    const reviewer = (meta?.reviewer as string) || (meta?.reviewer_login as string) || null;
    if (reviewer) {
      reviewerCounts[reviewer] = (reviewerCounts[reviewer] || 0) + 1;
    }
  }

  const signals: ConnectorSignal[] = Object.entries(reviewerCounts).map(([login, count]) => ({
    organization_id: organizationId,
    source_domain: 'engineering.github',
    signal_type: 'engineer_review_burden',
    signal_value: count,
    signal_category: 'metric' as const,
    signal_timestamp: new Date().toISOString(),
    entity_type: 'engineer',
    entity_id: `github#${login}`,
    metadata: {
      github_login: login,
      week_start: weekStart,
      lookback_days: lookbackDays,
    },
  }));

  if (signals.length > 0) {
    await storeDualWriteConnectorSignals(supabase, signals.map(s => ({ source: s.source_domain, signal_type: s.signal_type, signal_value: s.signal_value, signal_timestamp: s.signal_timestamp, metadata: s.metadata as Record<string, unknown> | undefined })), organizationId);

    // Upsert engineer_health_snapshots
    const snapshots = Object.entries(reviewerCounts).map(([login, count]) => ({
      organization_id: organizationId,
      github_login: login,
      week_start: weekStart,
      review_burden: count,
      overallocation_flag: count > 10, // heuristic: >10 PRs reviewed = overloaded
      computed_at: new Date().toISOString(),
    }));

    await supabase
      .from('engineer_health_snapshots')
      .upsert(snapshots, { onConflict: 'organization_id,github_login,week_start', ignoreDuplicates: false });
  }

  return signals.length;
}

// ============================================================================
// GAP 1B: VELOCITY INDEX — PRs merged per engineer per week
// ============================================================================

/**
 * Reads pr_merged signals, groups by author, emits engineer_velocity_index.
 * Detects week-over-week drop >50% as a flight risk signal.
 */
export async function computeVelocityIndex(
  config: DeliveryHealthConfig
): Promise<number> {
  const { supabase, organizationId, lookbackDays = 7 } = config;
  const cutoff = lookbackCutoff(lookbackDays);
  const prevCutoff = lookbackCutoff(lookbackDays * 2);
  const weekStart = isoWeekMonday();

  const { data: thisWeek } = await supabase
    .from('connector_signals')
    .select('metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'pr_merged')
    .gte('created_at', cutoff);

  const { data: lastWeek } = await supabase
    .from('connector_signals')
    .select('metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'pr_merged')
    .gte('created_at', prevCutoff)
    .lt('created_at', cutoff);

  if (!thisWeek?.length && !lastWeek?.length) return 0;

  const countByAuthor = (rows: typeof thisWeek): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const row of (rows || [])) {
      const meta = row.metadata as Record<string, unknown> | null;
      const author = (meta?.author as string) || (meta?.author_login as string) || null;
      if (author) counts[author] = (counts[author] || 0) + 1;
    }
    return counts;
  };

  const thisCounts = countByAuthor(thisWeek);
  const lastCounts = countByAuthor(lastWeek);

  const allAuthors = new Set([...Object.keys(thisCounts), ...Object.keys(lastCounts)]);
  const signals: ConnectorSignal[] = [];
  const snapshotUpdates: Array<Record<string, unknown>> = [];

  for (const login of allAuthors) {
    const thisCount = thisCounts[login] || 0;
    const lastCount = lastCounts[login] || 0;
    const velocityDrop = lastCount > 0 ? (lastCount - thisCount) / lastCount : 0;
    const flightRisk = velocityDrop > 0.5 ? Math.min(100, velocityDrop * 100) : 0;

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering.github',
      signal_type: 'engineer_velocity_index',
      signal_value: thisCount,
      signal_category: 'metric' as const,
      signal_timestamp: new Date().toISOString(),
      entity_type: 'engineer',
      entity_id: `github#${login}`,
      metadata: {
        github_login: login,
        week_start: weekStart,
        prev_week_count: lastCount,
        velocity_drop_pct: Math.round(velocityDrop * 100),
      },
    });

    snapshotUpdates.push({
      organization_id: organizationId,
      github_login: login,
      week_start: weekStart,
      velocity_index: thisCount,
      flight_risk_score: flightRisk,
      computed_at: new Date().toISOString(),
    });
  }

  if (signals.length > 0) {
    await storeDualWriteConnectorSignals(supabase, signals.map(s => ({ source: s.source_domain, signal_type: s.signal_type, signal_value: s.signal_value, signal_timestamp: s.signal_timestamp, metadata: s.metadata as Record<string, unknown> | undefined })), organizationId);
    await supabase
      .from('engineer_health_snapshots')
      .upsert(snapshotUpdates, { onConflict: 'organization_id,github_login,week_start', ignoreDuplicates: false });
  }

  return signals.length;
}

// ============================================================================
// GAP 1C: TICKET RESPONSE LAG — Hours from ticket created to first comment
// ============================================================================

/**
 * For each jira_issue_created signal, finds the first jira_comment signal
 * matching the same issue_key. Emits ticket_response_lag per assignee.
 */
export async function computeTicketResponseLag(
  config: DeliveryHealthConfig
): Promise<number> {
  const { supabase, organizationId, lookbackDays = 14 } = config;
  const cutoff = lookbackCutoff(lookbackDays);
  const weekStart = isoWeekMonday();

  const { data: creations } = await supabase
    .from('connector_signals')
    .select('metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'jira_issue_created')
    .gte('created_at', cutoff);

  const { data: comments } = await supabase
    .from('connector_signals')
    .select('metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'jira_comment')
    .gte('created_at', cutoff);

  if (!creations?.length) return 0;

  // Index comments by issue_key for O(1) lookup
  const firstCommentByIssue: Record<string, Date> = {};
  for (const c of (comments || [])) {
    const meta = c.metadata as Record<string, unknown> | null;
    const key = meta?.issue_key as string | null;
    if (!key) continue;
    const ts = new Date(c.created_at as string);
    if (!firstCommentByIssue[key] || ts < firstCommentByIssue[key]) {
      firstCommentByIssue[key] = ts;
    }
  }

  // Compute lag per assignee
  const lagByAssignee: Record<string, number[]> = {};
  for (const row of creations) {
    const meta = row.metadata as Record<string, unknown> | null;
    const issueKey = meta?.issue_key as string | null;
    const assignee = meta?.assignee as string | null;
    if (!issueKey || !assignee) continue;

    const firstComment = firstCommentByIssue[issueKey];
    if (!firstComment) continue;

    const created = new Date(row.created_at as string);
    const lagHours = (firstComment.getTime() - created.getTime()) / 3_600_000;
    if (lagHours >= 0) {
      if (!lagByAssignee[assignee]) lagByAssignee[assignee] = [];
      lagByAssignee[assignee].push(lagHours);
    }
  }

  const signals: ConnectorSignal[] = [];
  const snapshotUpdates: Array<Record<string, unknown>> = [];

  for (const [assignee, lags] of Object.entries(lagByAssignee)) {
    const avgLag = lags.reduce((a, b) => a + b, 0) / lags.length;

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering.jira',
      signal_type: 'ticket_response_lag',
      signal_value: avgLag,
      signal_category: 'metric' as const,
      signal_timestamp: new Date().toISOString(),
      entity_type: 'engineer',
      entity_id: `jira#${assignee}`,
      metadata: {
        assignee,
        week_start: weekStart,
        sample_count: lags.length,
      },
    });

    snapshotUpdates.push({
      organization_id: organizationId,
      github_login: assignee, // best-effort; may not match GitHub login
      week_start: weekStart,
      ticket_response_lag: avgLag,
      computed_at: new Date().toISOString(),
    });
  }

  if (signals.length > 0) {
    await storeDualWriteConnectorSignals(supabase, signals.map(s => ({ source: s.source_domain, signal_type: s.signal_type, signal_value: s.signal_value, signal_timestamp: s.signal_timestamp, metadata: s.metadata as Record<string, unknown> | undefined })), organizationId);
    await supabase
      .from('engineer_health_snapshots')
      .upsert(snapshotUpdates, { onConflict: 'organization_id,github_login,week_start', ignoreDuplicates: false });
  }

  return signals.length;
}

// ============================================================================
// GAP 1D: ENGAGEMENT SCOPE VELOCITY — Rate of story point addition per sprint
// ============================================================================

/**
 * For a given engagement, sums story_point_delta signals per sprint
 * and computes the week-over-week growth rate. Emits engagement_scope_velocity.
 */
export async function computeEngagementScopeVelocity(
  config: DeliveryHealthConfig,
  engagementId: string,
  engagement: EngagementRef
): Promise<number> {
  const { supabase, organizationId, lookbackDays = 14 } = config;
  const cutoff = lookbackCutoff(lookbackDays);
  const halfCutoff = lookbackCutoff(Math.floor(lookbackDays / 2));

  const jiraFilter = engagement.jira_projects.length > 0
    ? engagement.jira_projects
    : null;

  const baseQuery = supabase
    .from('connector_signals')
    .select('signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'story_point_delta')
    .gte('created_at', cutoff);

  const { data: allDeltas } = await baseQuery;
  if (!allDeltas?.length) return 0;

  // Filter by engagement Jira projects if specified
  const filtered = jiraFilter
    ? allDeltas.filter(row => {
        const meta = row.metadata as Record<string, unknown> | null;
        const project = meta?.project as string | null;
        return project && jiraFilter.some(p => project.toUpperCase().startsWith(p.toUpperCase()));
      })
    : allDeltas;

  if (!filtered.length) return 0;

  const thisWeekSum = filtered
    .filter(r => new Date(r.created_at as string) >= new Date(halfCutoff))
    .reduce((acc, r) => acc + (Number(r.signal_value) || 0), 0);

  const lastWeekSum = filtered
    .filter(r => new Date(r.created_at as string) < new Date(halfCutoff))
    .reduce((acc, r) => acc + (Number(r.signal_value) || 0), 0);

  const velocityRate = lastWeekSum > 0
    ? ((thisWeekSum - lastWeekSum) / lastWeekSum) * 100
    : 0;

  const signal: ConnectorSignal = {
    organization_id: organizationId,
    source_domain: 'engineering.jira',
    signal_type: 'engagement_scope_velocity',
    signal_value: velocityRate,
    signal_category: 'outcome' as const,
    signal_timestamp: new Date().toISOString(),
    entity_type: 'engagement',
    entity_id: `engagement#${engagementId}`,
    metadata: {
      engagement_id: engagementId,
      this_week_points: thisWeekSum,
      last_week_points: lastWeekSum,
      velocity_rate_pct: velocityRate,
      watch_anomaly: true,
      anomaly_threshold_pct: 20,
      cognitive_module: 'L10', // Temporal Consciousness
    },
  };

  await storeDualWriteConnectorSignals(supabase, [{ source: signal.source_domain, signal_type: signal.signal_type, signal_value: signal.signal_value, signal_timestamp: signal.signal_timestamp, metadata: signal.metadata as Record<string, unknown> | undefined }], organizationId);
  return 1;
}

// ============================================================================
// MASTER ORCHESTRATOR
// ============================================================================

/**
 * Runs all delivery health aggregators after every connector sync.
 * Registered via onSignalsIngested() in connector-signal-bridge.ts.
 */
export async function runDeliveryHealthAggregation(
  config: DeliveryHealthConfig
): Promise<AggregationResult> {
  const result: AggregationResult = {
    signalsEmitted: 0,
    engineersProcessed: 0,
    engagementsProcessed: 0,
    errors: [],
  };

  // 1. Engineer-level aggregations (always run)
  try {
    const [reviewCount, velocityCount, lagCount] = await Promise.all([
      computeReviewBurden(config),
      computeVelocityIndex(config),
      computeTicketResponseLag(config),
    ]);
    result.signalsEmitted += reviewCount + velocityCount + lagCount;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Engineer health aggregation failed: ${msg}`);
    console.warn('[delivery-health] Engineer aggregation error:', err);
  }

  // 2. Engagement-level scope velocity (per engagement)
  try {
    const { data: engagements } = await config.supabase
      .from('engagements')
      .select('id, jira_projects, jira_labels, github_repos')
      .eq('organization_id', config.organizationId)
      .eq('status', 'active');

    for (const eng of (engagements || [])) {
      try {
        const emitted = await computeEngagementScopeVelocity(
          config,
          eng.id,
          { id: eng.id, jira_projects: eng.jira_projects || [], jira_labels: eng.jira_labels || [], github_repos: eng.github_repos || [] }
        );
        result.signalsEmitted += emitted;
        result.engagementsProcessed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Scope velocity failed for engagement ${eng.id}: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Engagement scope velocity failed: ${msg}`);
  }

  return result;
}
