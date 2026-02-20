/**
 * Composite Health Resolver
 * ==========================
 *
 * Combines signals from multiple connectors (Jira + GitHub) to verify
 * composite predictions made by delivery-intelligence and pod-match domains.
 *
 * These domains predict team/engagement health scores that depend on
 * multiple data sources — no single API has the answer.
 *
 * Covers domains: delivery-intelligence, pod-match
 * Metrics: health_score, team_velocity, engagement_risk, pod_fit_score
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

interface HealthComponents {
  /** Sprint velocity ratio (completed/committed) */
  velocityRatio: number | null;
  /** CI pass rate */
  ciPassRate: number | null;
  /** PR merge time (avg days) */
  prMergeTimeDays: number | null;
  /** Bug ratio (bugs/total issues) */
  bugRatio: number | null;
  /** Incident frequency per week */
  incidentFrequency: number | null;
  /** Data source count (how many components had data) */
  dataSourceCount: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute health score from cross_domain_signals.
 * This uses the SAME signals that connectors already emit — no extra API calls.
 * The health score is a composite of engineering health indicators.
 */
async function computeHealthFromSignals(
  supabase: SupabaseClient,
  organizationId: string,
  entityId: string,
  windowDays = 14,
): Promise<HealthComponents> {
  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const components: HealthComponents = {
    velocityRatio: null,
    ciPassRate: null,
    prMergeTimeDays: null,
    bugRatio: null,
    incidentFrequency: null,
    dataSourceCount: 0,
  };

  // 1. Sprint velocity from Jira signals
  const { data: sprintSignals } = await supabase
    .from('cross_domain_signals')
    .select('signal_value, metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'sprint_completed')
    .gte('signal_timestamp', since)
    .order('signal_timestamp', { ascending: false })
    .limit(3);

  if (sprintSignals && sprintSignals.length > 0) {
    const avgVelocityRatio =
      sprintSignals.reduce(
        (sum: number, s: { signal_value: number }) => sum + s.signal_value,
        0,
      ) / sprintSignals.length;
    components.velocityRatio = avgVelocityRatio;
    components.dataSourceCount++;
  }

  // 2. CI pass rate from GitHub signals
  const { data: ciSignals } = await supabase
    .from('cross_domain_signals')
    .select('signal_type')
    .eq('organization_id', organizationId)
    .in('signal_type', ['ci_passed', 'ci_failed'])
    .gte('signal_timestamp', since);

  if (ciSignals && ciSignals.length > 0) {
    const passed = ciSignals.filter(
      (s: { signal_type: string }) => s.signal_type === 'ci_passed',
    ).length;
    components.ciPassRate = passed / ciSignals.length;
    components.dataSourceCount++;
  }

  // 3. PR merge time from GitHub signals
  const { data: prSignals } = await supabase
    .from('cross_domain_signals')
    .select('metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'pr_merged')
    .gte('signal_timestamp', since)
    .limit(20);

  if (prSignals && prSignals.length > 0) {
    const mergeTimes = prSignals
      .map(
        (s: { metadata: Record<string, unknown> | null }) =>
          s.metadata?.review_time_days as number | undefined,
      )
      .filter((t): t is number => typeof t === 'number' && t > 0);

    if (mergeTimes.length > 0) {
      components.prMergeTimeDays =
        mergeTimes.reduce((sum, t) => sum + t, 0) / mergeTimes.length;
      components.dataSourceCount++;
    }
  }

  // 4. Bug ratio from Jira/GitHub signals
  const { data: issueSignals } = await supabase
    .from('cross_domain_signals')
    .select('signal_type')
    .eq('organization_id', organizationId)
    .in('signal_type', ['bug_opened', 'issue_opened', 'issue_created'])
    .gte('signal_timestamp', since);

  if (issueSignals && issueSignals.length > 0) {
    const bugs = issueSignals.filter(
      (s: { signal_type: string }) => s.signal_type === 'bug_opened',
    ).length;
    components.bugRatio = bugs / issueSignals.length;
    components.dataSourceCount++;
  }

  // 5. Incident frequency from PagerDuty signals
  const { data: incidentSignals } = await supabase
    .from('cross_domain_signals')
    .select('signal_timestamp')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'incident_triggered')
    .gte('signal_timestamp', since);

  if (incidentSignals) {
    components.incidentFrequency =
      incidentSignals.length / (windowDays / 7); // Per week
    components.dataSourceCount++;
  }

  return components;
}

/**
 * Calculate a composite health score (0-1) from individual components.
 */
function calculateHealthScore(components: HealthComponents): number {
  const scores: number[] = [];
  const weights: number[] = [];

  // Velocity: higher is better (0-1 scale, cap at 1)
  if (components.velocityRatio !== null) {
    scores.push(Math.min(components.velocityRatio, 1.0));
    weights.push(0.25);
  }

  // CI pass rate: higher is better
  if (components.ciPassRate !== null) {
    scores.push(components.ciPassRate);
    weights.push(0.20);
  }

  // PR merge time: lower is better (1/log scale, cap at 0-1)
  if (components.prMergeTimeDays !== null) {
    const prScore = Math.max(
      0,
      1 - Math.log2(Math.max(components.prMergeTimeDays, 0.5)) / 5,
    );
    scores.push(Math.min(prScore, 1.0));
    weights.push(0.20);
  }

  // Bug ratio: lower is better
  if (components.bugRatio !== null) {
    scores.push(1 - components.bugRatio);
    weights.push(0.15);
  }

  // Incident frequency: lower is better (0 incidents = 1.0)
  if (components.incidentFrequency !== null) {
    const incScore = Math.max(0, 1 - components.incidentFrequency / 5);
    scores.push(incScore);
    weights.push(0.20);
  }

  if (scores.length === 0) return 0.5; // No data → neutral

  // Weighted average
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  return scores.reduce((sum, s, i) => sum + s * weights[i], 0) / totalWeight;
}

// ============================================================================
// RESOLVER
// ============================================================================

export const compositeHealthResolver: OutcomeResolver = {
  id: 'composite-health',
  name: 'Composite Health Score Resolver',
  supportedDomains: ['delivery-intelligence', 'pod-match'],
  supportedMetrics: [
    'health_score',
    'team_velocity',
    'engagement_risk',
    'pod_fit_score',
    'delivery_health',
    'team_health',
  ],

  async resolve(
    ctx: PredictionContext,
    supabase: SupabaseClient,
  ): Promise<ResolverResult | null> {
    // 1. Compute current health from ingested signals
    const components = await computeHealthFromSignals(
      supabase,
      ctx.organizationId,
      ctx.entityId,
      14, // 2-week window
    );

    // Need at least 2 data sources for a meaningful composite score
    if (components.dataSourceCount < 2) {
      console.debug(
        `[CompositeHealthResolver] Insufficient data sources (${components.dataSourceCount})`,
      );
      return null; // Fall through to user verification
    }

    // 2. Calculate composite health score
    const currentHealth = calculateHealthScore(components);

    // 3. Get baseline health from prediction context
    const baselineHealth =
      ctx.featureSnapshot?.health_score ||
      ctx.featureSnapshot?.delivery_health ||
      ctx.predictedValue;

    if (baselineHealth === undefined) {
      // No baseline — return absolute score
      return {
        actualDirection: currentHealth > 0.6 ? 'increase' : 'decrease',
        actualMagnitude: currentHealth - 0.5, // Relative to neutral
        actualValue: currentHealth,
        source: 'composite_signals',
        confidence: Math.min(0.5 + components.dataSourceCount * 0.1, 0.9),
        measuredAt: new Date(),
        metadata: {
          ...components,
          compositeScore: currentHealth,
        },
      };
    }

    // 4. Compare with baseline
    const change = currentHealth - baselineHealth;
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
      actualValue: currentHealth,
      source: 'composite_signals',
      confidence: Math.min(0.5 + components.dataSourceCount * 0.1, 0.9),
      measuredAt: new Date(),
      metadata: {
        ...components,
        compositeScore: currentHealth,
        baselineScore: baselineHealth,
        changePercent: Math.round(
          (change / Math.max(baselineHealth, 0.01)) * 100,
        ),
      },
    };
  },
};
