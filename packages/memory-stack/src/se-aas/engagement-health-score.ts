/**
 * Engagement Health Score Computation
 * =====================================
 *
 * Computes a composite 0-100 health score per client engagement,
 * persists it to engagement_health_scores, and emits it as a
 * cross_domain_signal so the Outcome Oracle can verify predictions.
 *
 * Score Components (weights sum to 1.0):
 *   deliveryVelocity    0.30  — avg pr_merged cycle time, normalized
 *   jiraResolutionRate  0.25  — resolved / (resolved + open) tickets
 *   scopeDrift          0.20  — 100 - clamp(story_point_delta_pct, 0, 100)
 *   teamConcentration   0.15  — (1 - HHI_of_pr_authorship) * 100
 *   slackSentiment      0.10  — (avg_sentiment + 1) / 2 * 100
 *
 * Delivery Forecast (WOW artifact #2):
 *   Linear regression on resolved-tickets-per-day trend.
 *   Predicts when remaining_story_points / avg_daily_resolution_rate ≈ 0.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { storeDualWriteConnectorSignals } from '../ingestion/connector-signal-bridge';
import type { ConnectorSignal } from '../connectors/connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementRow {
  id: string;
  organization_id: string;
  jira_projects: string[];
  jira_labels: string[];
  github_repos: string[];
  slack_channels: string[];
  target_end_date: string | null;
}

export interface EngagementHealthComponents {
  /** 0-100, lower cycle time → higher score */
  deliveryVelocity: number;
  /** 0-100, resolved / (resolved + open) * 100 */
  jiraResolutionRate: number;
  /** 0-100, 0% drift = 100, 100% drift = 0 */
  scopeDrift: number;
  /** 0-100, perfectly distributed authorship = 100 */
  teamConcentration: number;
  /** 0-100, from -1..+1 Slack sentiment */
  slackSentiment: number;
}

export interface DeliveryForecast {
  predictedDate: Date | null;
  daysRemaining: number | null;
  confidence: number;
  atRisk: boolean;
}

export interface EngagementHealthResult {
  score: number;
  components: EngagementHealthComponents;
  forecast: DeliveryForecast;
  prCount: number;
  ticketCount: number;
  messageCount: number;
  storyPointsBaseline: number;
  storyPointsCurrent: number;
  storyPointDeltaPct: number;
}

// ============================================================================
// WEIGHTS
// ============================================================================

const WEIGHTS = {
  deliveryVelocity:   0.30,
  jiraResolutionRate: 0.25,
  scopeDrift:         0.20,
  teamConcentration:  0.15,
  slackSentiment:     0.10,
} as const;

// P50 cycle time baseline (hours) — below this = perfect score, 4× this = 0
const P50_CYCLE_TIME_HOURS = 24;
const MAX_CYCLE_TIME_HOURS = P50_CYCLE_TIME_HOURS * 4;

// ============================================================================
// PURE COMPUTATION FUNCTIONS
// ============================================================================

/**
 * Compute Herfindahl-Hirschman Index of PR authorship.
 * Returns 0 (perfectly distributed) to 1 (one person does all PRs).
 * Reuses the same math as P0 bottleneck detection (reviewer_hhi column).
 */
export function computeAuthorshipHHI(prCounts: Record<string, number>): number {
  const total = Object.values(prCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return Object.values(prCounts)
    .map(count => Math.pow(count / total, 2))
    .reduce((a, b) => a + b, 0);
}

/**
 * Compute the composite engagement health score from components.
 */
export function computeEngagementHealthScore(
  components: EngagementHealthComponents
): number {
  const raw =
    components.deliveryVelocity    * WEIGHTS.deliveryVelocity +
    components.jiraResolutionRate  * WEIGHTS.jiraResolutionRate +
    components.scopeDrift          * WEIGHTS.scopeDrift +
    components.teamConcentration   * WEIGHTS.teamConcentration +
    components.slackSentiment      * WEIGHTS.slackSentiment;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

/**
 * Normalize average cycle time to a 0-100 score.
 * P50 or below = 100. 4× P50 or above = 0. Linear between.
 */
function normalizeVelocity(avgCycleTimeHours: number): number {
  if (avgCycleTimeHours <= 0) return 100;
  if (avgCycleTimeHours <= P50_CYCLE_TIME_HOURS) return 100;
  if (avgCycleTimeHours >= MAX_CYCLE_TIME_HOURS) return 0;
  const range = MAX_CYCLE_TIME_HOURS - P50_CYCLE_TIME_HOURS;
  return Math.round(100 * (1 - (avgCycleTimeHours - P50_CYCLE_TIME_HOURS) / range));
}

/**
 * Simple linear regression on y[] over x = [0, 1, 2, ...n-1].
 * Returns slope (points resolved per day).
 */
function linearRegressionSlope(y: number[]): number {
  const n = y.length;
  if (n < 2) return y[0] ?? 0;
  const xMean = (n - 1) / 2;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let numerator = 0, denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (y[i] - yMean);
    denominator += Math.pow(i - xMean, 2);
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Forecast delivery completion.
 * Uses linear regression on daily resolved ticket counts.
 */
export function forecastDeliveryCompletion(
  resolvedPerDay: number[],
  remainingPoints: number,
  targetDate: Date | null
): DeliveryForecast {
  if (!resolvedPerDay.length || remainingPoints <= 0) {
    return { predictedDate: null, daysRemaining: null, confidence: 0, atRisk: false };
  }

  const avgResolutionRate = resolvedPerDay.reduce((a, b) => a + b, 0) / resolvedPerDay.length;
  const slope = linearRegressionSlope(resolvedPerDay);

  // If trend is declining, use conservative (lower) estimate
  const effectiveRate = slope < 0
    ? Math.max(0.1, avgResolutionRate + slope * 3)  // 3-day extrapolation
    : avgResolutionRate;

  if (effectiveRate <= 0) {
    return { predictedDate: null, daysRemaining: null, confidence: 0.2, atRisk: true };
  }

  const daysRemaining = Math.ceil(remainingPoints / effectiveRate);
  const predictedDate = new Date();
  predictedDate.setDate(predictedDate.getDate() + daysRemaining);

  // Confidence: based on data recency and trend stability
  const sampleConfidence = Math.min(1, resolvedPerDay.length / 14); // 2 weeks = full confidence
  const trendConfidence = slope >= 0 ? 1.0 : Math.max(0.3, 1 + slope * 0.1); // declining slope → lower conf
  const confidence = Math.round(sampleConfidence * trendConfidence * 100) / 100;

  const atRisk = targetDate != null
    ? predictedDate > targetDate
    : daysRemaining > 60; // heuristic: >60 days = at risk

  return { predictedDate, daysRemaining, confidence, atRisk };
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

function lookbackCutoff(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Fetch all signals for an engagement, compute health score + forecast,
 * persist to engagement_health_scores, emit engagement_health_score signal,
 * and raise scope_creep_alerts if needed.
 */
export async function computeAndPersistEngagementHealth(
  supabase: SupabaseClient,
  organizationId: string,
  engagementId: string,
  engagement: EngagementRow,
  lookbackDays = 30
): Promise<EngagementHealthResult> {
  const cutoff = lookbackCutoff(lookbackDays);
  const jiraProjects = engagement.jira_projects || [];
  const githubRepos = engagement.github_repos || [];

  // ── 1. Fetch PR signals (delivery velocity + team concentration) ────────────
  const { data: prSignals } = await supabase
    .from('connector_signals')
    .select('signal_value, metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'pr_merged')
    .gte('created_at', cutoff);

  const engagementPRs = (prSignals || []).filter(row => {
    if (!githubRepos.length) return true;
    const meta = row.metadata as Record<string, unknown> | null;
    const repo = meta?.repo_name as string | null;
    return repo && githubRepos.some(r => repo.toLowerCase().includes(r.toLowerCase()));
  });

  const avgCycleTime = engagementPRs.length > 0
    ? engagementPRs.reduce((acc, r) => acc + (Number(r.signal_value) || 0), 0) / engagementPRs.length
    : P50_CYCLE_TIME_HOURS; // fallback to P50 (neutral)

  const prCounts: Record<string, number> = {};
  for (const row of engagementPRs) {
    const meta = row.metadata as Record<string, unknown> | null;
    const author = (meta?.author as string) || 'unknown';
    prCounts[author] = (prCounts[author] || 0) + 1;
  }
  const hhi = computeAuthorshipHHI(prCounts);

  // ── 2. Fetch Jira signals (resolution rate + scope tracking) ───────────────
  const { data: jiraResolved } = await supabase
    .from('connector_signals')
    .select('signal_value, metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'jira_issue_resolved')
    .gte('created_at', cutoff);

  const { data: jiraCreated } = await supabase
    .from('connector_signals')
    .select('signal_value, metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'jira_issue_created')
    .gte('created_at', cutoff);

  const { data: storyPointSignals } = await supabase
    .from('connector_signals')
    .select('signal_value, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'story_point_delta')
    .gte('created_at', cutoff);

  const matchesEngagement = (meta: Record<string, unknown> | null) => {
    if (!jiraProjects.length) return true;
    const project = meta?.project as string | null;
    return project && jiraProjects.some(p => project.toUpperCase().startsWith(p.toUpperCase()));
  };

  const resolvedTickets = (jiraResolved || []).filter(r => matchesEngagement(r.metadata as Record<string, unknown> | null));
  const createdTickets  = (jiraCreated  || []).filter(r => matchesEngagement(r.metadata as Record<string, unknown> | null));
  const spDeltas        = (storyPointSignals || []).filter(r => matchesEngagement(r.metadata as Record<string, unknown> | null));

  const totalTickets   = createdTickets.length;
  const resolvedCount  = resolvedTickets.length;
  const resolutionRate = totalTickets > 0 ? (resolvedCount / totalTickets) * 100 : 50; // 50 if no data

  // Story points: first batch = baseline, current = total sum
  const spByDate = spDeltas.sort((a, b) =>
    new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
  );
  const storyPointsCurrent = spByDate.reduce((acc, r) => acc + (Number(r.signal_value) || 0), 0);
  // Baseline: assume first 20% of signals were the sprint start
  const baselineWindow = Math.max(1, Math.floor(spByDate.length * 0.2));
  const storyPointsBaseline = spByDate
    .slice(0, baselineWindow)
    .reduce((acc, r) => acc + (Number(r.signal_value) || 0), 0);

  const storyPointDeltaPct = storyPointsBaseline > 0
    ? ((storyPointsCurrent - storyPointsBaseline) / storyPointsBaseline) * 100
    : 0;

  // ── 3. Fetch Slack sentiment ────────────────────────────────────────────────
  const { data: sentimentSignals } = await supabase
    .from('connector_signals')
    .select('signal_value, metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'slack_sentiment_index')
    .gte('created_at', cutoff);

  const engagementSlack = engagement.slack_channels.length > 0
    ? (sentimentSignals || []).filter(r => {
        const meta = r.metadata as Record<string, unknown> | null;
        const ch = meta?.channel_name as string | null;
        return ch && engagement.slack_channels.some(s => ch.includes(s.replace('#', '')));
      })
    : (sentimentSignals || []);

  const avgSentiment = engagementSlack.length > 0
    ? engagementSlack.reduce((acc, r) => acc + (Number(r.signal_value) || 0), 0) / engagementSlack.length
    : 0; // neutral

  // ── 4. Compute components ───────────────────────────────────────────────────
  const components: EngagementHealthComponents = {
    deliveryVelocity:   normalizeVelocity(avgCycleTime),
    jiraResolutionRate: clamp(resolutionRate, 0, 100),
    scopeDrift:         clamp(100 - storyPointDeltaPct, 0, 100),
    teamConcentration:  clamp((1 - hhi) * 100, 0, 100),
    slackSentiment:     clamp(((avgSentiment + 1) / 2) * 100, 0, 100),
  };

  const healthScore = computeEngagementHealthScore(components);

  // ── 5. Delivery forecast ────────────────────────────────────────────────────
  // Build daily resolved-ticket series over the lookback window
  const dayBuckets: Record<string, number> = {};
  for (const t of resolvedTickets) {
    const day = (t.metadata as Record<string, unknown> | null)?.resolution_date?.toString()?.split('T')[0]
      || new Date().toISOString().split('T')[0];
    dayBuckets[day] = (dayBuckets[day] || 0) + 1;
  }
  const resolvedPerDay = Object.values(dayBuckets);
  const remainingPoints = Math.max(0, storyPointsCurrent - (spByDate.slice(-resolvedCount).reduce((a, r) => a + (Number(r.signal_value) || 0), 0)));

  const targetDate = engagement.target_end_date ? new Date(engagement.target_end_date) : null;
  const forecast = forecastDeliveryCompletion(resolvedPerDay, remainingPoints || storyPointsCurrent, targetDate);

  // ── 6. Persist to engagement_health_scores ──────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const { data: scoreRow } = await supabase
    .from('engagement_health_scores')
    .upsert({
      organization_id:          organizationId,
      engagement_id:            engagementId,
      health_score:             healthScore,
      delivery_velocity:        components.deliveryVelocity,
      jira_resolution_rate:     components.jiraResolutionRate,
      scope_drift:              components.scopeDrift,
      team_concentration:       components.teamConcentration,
      slack_sentiment:          components.slackSentiment,
      pr_count:                 engagementPRs.length,
      ticket_count:             totalTickets,
      message_count:            engagementSlack.length,
      story_points_baseline:    storyPointsBaseline,
      story_points_current:     storyPointsCurrent,
      story_point_delta_pct:    storyPointDeltaPct,
      predicted_completion_date: forecast.predictedDate?.toISOString().split('T')[0] || null,
      forecast_confidence:       forecast.confidence,
      forecast_days_remaining:   forecast.daysRemaining,
      forecast_at_risk:          forecast.atRisk,
      computed_at:               new Date().toISOString(),
    }, { onConflict: 'organization_id,engagement_id,(computed_at::DATE)' })
    .select('id')
    .single();

  // ── 7. Emit engagement_health_score cross-domain signal (Oracle watches) ───
  const healthSignal: ConnectorSignal = {
    organization_id: organizationId,
    source_domain:   'engineering.se-aas',
    signal_type:     'engagement_health_score',
    signal_value:    healthScore,
    signal_category: 'outcome' as const,
    signal_timestamp: new Date().toISOString(),
    entity_type:     'engagement',
    entity_id:       `engagement#${engagementId}`,
    metadata: {
      engagement_id:         engagementId,
      health_score:          healthScore,
      components,
      forecast_days:         forecast.daysRemaining,
      forecast_at_risk:      forecast.atRisk,
      score_row_id:          scoreRow?.id,
    },
  };
  await storeDualWriteConnectorSignals(supabase, [{ source: healthSignal.source_domain, signal_type: healthSignal.signal_type, signal_value: healthSignal.signal_value, signal_timestamp: healthSignal.signal_timestamp, metadata: healthSignal.metadata as Record<string, unknown> | undefined }], organizationId);

  // ── 8. Scope creep alert if delta_pct > 20% ─────────────────────────────────
  if (storyPointDeltaPct > 20 && storyPointsBaseline > 0) {
    const severity = storyPointDeltaPct > 50 ? 'critical' : 'warning';
    const sprintName = (spByDate[spByDate.length - 1]?.metadata as Record<string, unknown> | null)?.sprint_name as string | undefined;

    // Only insert if no unacknowledged alert exists for today
    const { data: existingAlert } = await supabase
      .from('scope_creep_alerts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('engagement_id', engagementId)
      .eq('acknowledged', false)
      .gte('created_at', `${today}T00:00:00Z`)
      .maybeSingle();

    if (!existingAlert) {
      await supabase.from('scope_creep_alerts').insert({
        organization_id: organizationId,
        engagement_id:   engagementId,
        severity,
        delta_pct:       storyPointDeltaPct,
        baseline_pts:    storyPointsBaseline,
        current_pts:     storyPointsCurrent,
        sprint_name:     sprintName,
        alert_message:   `Sprint scope grew ${storyPointDeltaPct.toFixed(1)}% above baseline (${storyPointsBaseline} → ${storyPointsCurrent} pts). Overrun risk if addition rate continues.`,
      });

      // Also register with Outcome Oracle (prediction_records)
      await supabase.from('prediction_records').upsert({
        organization_id:    organizationId,
        domain:             'engagement.scope_creep',
        predicted_outcome:  `Engagement scope overrun — ${storyPointDeltaPct.toFixed(1)}% above baseline`,
        predicted_value:    storyPointDeltaPct,
        confidence:         Math.min(0.9, 0.5 + (storyPointDeltaPct - 20) / 100),
        entity_type:        'engagement',
        entity_id:          engagementId,
        created_at:         new Date().toISOString(),
      }).select('id');
    }
  }

  return {
    score: healthScore,
    components,
    forecast,
    prCount: engagementPRs.length,
    ticketCount: totalTickets,
    messageCount: engagementSlack.length,
    storyPointsBaseline,
    storyPointsCurrent,
    storyPointDeltaPct,
  };
}

/**
 * Run health score computation for all active engagements in an org.
 * Called from the delivery health aggregation pipeline.
 */
export async function runAllEngagementHealthScores(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ processed: number; errors: string[] }> {
  const { data: engagements, error } = await supabase
    .from('engagements')
    .select('id, organization_id, jira_projects, jira_labels, github_repos, slack_channels, target_end_date')
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  if (error || !engagements?.length) return { processed: 0, errors: [] };

  const errors: string[] = [];
  let processed = 0;

  for (const eng of engagements) {
    try {
      await computeAndPersistEngagementHealth(
        supabase,
        organizationId,
        eng.id,
        eng as EngagementRow
      );
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Engagement ${eng.id}: ${msg}`);
      console.warn('[engagement-health] Score computation failed:', err);
    }
  }

  return { processed, errors };
}
