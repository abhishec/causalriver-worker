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
// GAP 1E: THROUGHPUT FORECAST — estimated completion based on open ticket count
//          and actual weekly resolution rate
// ============================================================================

export interface ThroughputForecastResult {
  /** Open ticket count at time of forecast */
  openTickets: number;
  /** Resolved tickets in lookback window */
  resolvedTickets: number;
  /** Average weekly resolution rate (tickets/week) */
  avgWeeklyThroughput: number;
  /** Estimated weeks to clear the backlog */
  estimatedWeeksRemaining: number | null;
  /** ISO date of estimated completion (null if throughput is zero) */
  estimatedCompletionDate: string | null;
  /** Per-project breakdown */
  byProject: Array<{
    project: string;
    openTickets: number;
    resolvedTickets: number;
    avgWeeklyThroughput: number;
    estimatedCompletionDate: string | null;
    /** Earliest effective deadline across open issues in this project */
    earliestDeadline: string | null;
    /** Whether estimated completion is past the earliest deadline */
    atRisk: boolean;
  }>;
  /** Deadline-bearing open issues that are at risk */
  atRiskIssues: Array<{
    issueKey: string;
    effectiveDeadline: string;
    project: string;
    estimatedCompletionDate: string | null;
    daysAtRisk: number | null;
  }>;
  computedAt: string;
}

/**
 * Throughput-based delivery forecast.
 *
 * Formula: estimated_completion = today + (open_tickets / avg_weekly_throughput) weeks
 *
 * Sources:
 *   - open_tickets:          jira_issue_created signals without a matching jira_issue_resolved
 *   - resolved_tickets:      jira_issue_resolved signals in the lookback window
 *   - avg_weekly_throughput: resolved / (lookback_days / 7)
 *   - deadline tracking:     jira_issue_due_date signals on open issues
 *
 * Emits:
 *   - throughput_forecast     — overall org forecast signal (outcome)
 *   - throughput_at_risk      — per-issue at-risk signal when estimated > deadline
 */
export async function computeThroughputForecast(
  config: DeliveryHealthConfig,
  opts: {
    /** JQL-style Jira project filter (e.g. ['NEXUS', 'BRAIN']). Empty = all projects. */
    jiraProjects?: string[];
    /** Lookback window for computing throughput. Defaults to config.lookbackDays or 28 days. */
    lookbackDays?: number;
  } = {}
): Promise<ThroughputForecastResult> {
  const { supabase, organizationId } = config;
  const lookbackDays = opts.lookbackDays ?? config.lookbackDays ?? 28;
  const cutoff = lookbackCutoff(lookbackDays);
  const now = new Date();

  // ── 1. Fetch created + resolved + due-date signals ────────────────────────
  const [createdRes, resolvedRes, dueDateRes] = await Promise.all([
    supabase
      .from('connector_signals')
      .select('metadata')
      .eq('organization_id', organizationId)
      .eq('signal_type', 'jira_issue_created'),
    supabase
      .from('connector_signals')
      .select('metadata, signal_value, created_at')
      .eq('organization_id', organizationId)
      .eq('signal_type', 'jira_issue_resolved')
      .gte('created_at', cutoff),
    supabase
      .from('connector_signals')
      .select('metadata')
      .eq('organization_id', organizationId)
      .eq('signal_type', 'jira_issue_due_date'),
  ]);

  const createdRows: any[] = createdRes.data || [];
  const resolvedRows: any[] = resolvedRes.data || [];
  const dueDateRows: any[] = dueDateRes.data || [];

  // ── 2. Build resolved-issue lookup (key → true) ───────────────────────────
  const resolvedKeys = new Set<string>();
  for (const row of resolvedRows) {
    const meta = row.metadata as Record<string, unknown> | null;
    const key = meta?.issue_key as string | null;
    if (key) resolvedKeys.add(key);
  }

  // ── 3. Identify open tickets (created but NOT resolved) ───────────────────
  const projectFilter = (opts.jiraProjects?.length ?? 0) > 0
    ? (p: string) => opts.jiraProjects!.some(f => p.toUpperCase().startsWith(f.toUpperCase()))
    : () => true;

  const openByProject: Record<string, number> = {};
  for (const row of createdRows) {
    const meta = row.metadata as Record<string, unknown> | null;
    const key = meta?.issue_key as string | null;
    const project = meta?.project as string | null;
    if (!key || resolvedKeys.has(key)) continue;
    if (!project || !projectFilter(project)) continue;
    openByProject[project] = (openByProject[project] || 0) + 1;
  }

  // ── 4. Count resolved by project in the lookback window ──────────────────
  const resolvedByProject: Record<string, number> = {};
  for (const row of resolvedRows) {
    const meta = row.metadata as Record<string, unknown> | null;
    const project = meta?.project as string | null;
    if (!project || !projectFilter(project)) continue;
    resolvedByProject[project] = (resolvedByProject[project] || 0) + 1;
  }

  // ── 5. Build deadline lookup per project ─────────────────────────────────
  interface DueDateEntry {
    issueKey: string;
    effectiveDeadline: string;
    project: string;
  }
  const dueDateEntries: DueDateEntry[] = [];
  for (const row of dueDateRows) {
    const meta = row.metadata as Record<string, unknown> | null;
    const key = meta?.issue_key as string | null;
    const deadline = meta?.effective_deadline as string | null;
    const project = meta?.project as string | null;
    if (!key || !deadline || !project) continue;
    if (resolvedKeys.has(key)) continue; // already resolved — skip
    if (!projectFilter(project)) continue;
    dueDateEntries.push({ issueKey: key, effectiveDeadline: deadline, project });
  }

  const earliestDeadlineByProject: Record<string, string> = {};
  for (const entry of dueDateEntries) {
    const prev = earliestDeadlineByProject[entry.project];
    if (!prev || entry.effectiveDeadline < prev) {
      earliestDeadlineByProject[entry.project] = entry.effectiveDeadline;
    }
  }

  // ── 6. Compute per-project forecast ──────────────────────────────────────
  const weeksInWindow = lookbackDays / 7;
  const allProjects = new Set([
    ...Object.keys(openByProject),
    ...Object.keys(resolvedByProject),
  ]);

  const byProject: ThroughputForecastResult['byProject'] = [];

  for (const project of allProjects) {
    const open = openByProject[project] || 0;
    const resolved = resolvedByProject[project] || 0;
    const weeklyRate = resolved / weeksInWindow;
    const weeksToComplete = weeklyRate > 0 ? open / weeklyRate : null;
    const completionDate = weeksToComplete != null
      ? new Date(now.getTime() + weeksToComplete * 7 * 86_400_000).toISOString().split('T')[0]
      : null;
    const earliestDeadline = earliestDeadlineByProject[project] ?? null;
    const atRisk = !!(completionDate && earliestDeadline && completionDate > earliestDeadline);

    byProject.push({
      project,
      openTickets: open,
      resolvedTickets: resolved,
      avgWeeklyThroughput: Math.round(weeklyRate * 10) / 10,
      estimatedCompletionDate: completionDate,
      earliestDeadline,
      atRisk,
    });
  }

  // ── 7. Overall org-level forecast ─────────────────────────────────────────
  const totalOpen = Object.values(openByProject).reduce((a, b) => a + b, 0);
  const totalResolved = Object.values(resolvedByProject).reduce((a, b) => a + b, 0);
  const orgWeeklyRate = totalResolved / weeksInWindow;
  const orgWeeksToComplete = orgWeeklyRate > 0 ? totalOpen / orgWeeklyRate : null;
  const orgCompletionDate = orgWeeksToComplete != null
    ? new Date(now.getTime() + orgWeeksToComplete * 7 * 86_400_000).toISOString().split('T')[0]
    : null;

  // ── 8. Identify at-risk issues (deadline < estimated completion) ───────────
  const atRiskIssues: ThroughputForecastResult['atRiskIssues'] = [];
  for (const entry of dueDateEntries) {
    const projectForecast = byProject.find(p => p.project === entry.project);
    const estimatedCompletion = projectForecast?.estimatedCompletionDate ?? orgCompletionDate;
    if (estimatedCompletion && estimatedCompletion > entry.effectiveDeadline) {
      const daysAtRisk = Math.round(
        (new Date(estimatedCompletion).getTime() - new Date(entry.effectiveDeadline).getTime()) / 86_400_000
      );
      atRiskIssues.push({
        issueKey: entry.issueKey,
        effectiveDeadline: entry.effectiveDeadline,
        project: entry.project,
        estimatedCompletionDate: estimatedCompletion,
        daysAtRisk,
      });
    }
  }

  const result: ThroughputForecastResult = {
    openTickets: totalOpen,
    resolvedTickets: totalResolved,
    avgWeeklyThroughput: Math.round(orgWeeklyRate * 10) / 10,
    estimatedWeeksRemaining: orgWeeksToComplete != null ? Math.round(orgWeeksToComplete * 10) / 10 : null,
    estimatedCompletionDate: orgCompletionDate,
    byProject,
    atRiskIssues,
    computedAt: now.toISOString(),
  };

  // ── 9. Emit signals into the brain dual-write pipeline ────────────────────
  const forecastSignals: Parameters<typeof storeDualWriteConnectorSignals>[1] = [];

  // Overall throughput forecast signal
  forecastSignals.push({
    source: 'engineering.jira',
    signal_type: 'throughput_forecast',
    signal_value: orgWeeklyRate,
    signal_timestamp: now.toISOString(),
    metadata: {
      open_tickets: totalOpen,
      resolved_tickets: totalResolved,
      avg_weekly_throughput: result.avgWeeklyThroughput,
      estimated_weeks_remaining: result.estimatedWeeksRemaining,
      estimated_completion_date: orgCompletionDate,
      lookback_days: lookbackDays,
      at_risk_count: atRiskIssues.length,
      cognitive_module: 'L10', // Temporal Consciousness
    },
  });

  // Per at-risk issue signals (Brain can discover causal patterns)
  for (const risk of atRiskIssues.slice(0, 50)) { // cap at 50 to avoid signal flood
    forecastSignals.push({
      source: 'engineering.jira',
      signal_type: 'throughput_at_risk',
      signal_value: risk.daysAtRisk ?? 0,
      signal_timestamp: now.toISOString(),
      metadata: {
        issue_key: risk.issueKey,
        project: risk.project,
        effective_deadline: risk.effectiveDeadline,
        estimated_completion_date: risk.estimatedCompletionDate,
        days_at_risk: risk.daysAtRisk,
        cognitive_module: 'L14', // Goal-Backward Planning
      },
    });
  }

  if (forecastSignals.length > 0) {
    await storeDualWriteConnectorSignals(supabase, forecastSignals, organizationId);
  }

  return result;
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

  // 2. Org-level throughput delivery forecast (always run — core SE-aaS capability)
  try {
    const forecast = await computeThroughputForecast(config, {
      lookbackDays: config.lookbackDays ?? 28,
    });
    // Count emitted signals: 1 forecast + N at-risk signals
    result.signalsEmitted += 1 + Math.min(forecast.atRiskIssues.length, 50);
    console.log(
      `[delivery-health] Throughput forecast: ${forecast.openTickets} open tickets, ` +
      `${forecast.avgWeeklyThroughput} tickets/week, ETA: ${forecast.estimatedCompletionDate ?? 'unknown'}, ` +
      `${forecast.atRiskIssues.length} at-risk issues`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Throughput forecast failed: ${msg}`);
    console.warn('[delivery-health] Throughput forecast error:', err);
  }

  // 3. Engagement-level scope velocity (per engagement)
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
