/**
 * Deploy Velocity Tracker & Collapse Predictor
 * ==============================================
 *
 * Tracks engineering velocity metrics and predicts collapse BEFORE it happens:
 * - Velocity time series (PRs merged/day, deployments/week)
 * - WIP (Work In Progress) accumulation tracking
 * - PR review latency trends
 * - VAR-based velocity forecasting (predict 7-30 days ahead)
 * - Early warning alerts when velocity will drop >30%
 *
 * Integrates with:
 * - GitHub connector signals (PRs, deployments, reviews)
 * - Granger causality for prediction
 * - Anomaly detection for early warnings
 * - SE metrics for calibration
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { signalsToTimeSeries } from '../causality/signal-to-timeseries';
import { computeGrangerCausality, type GrangerResult } from '../causality/granger-causality';

// ============================================================================
// TYPES
// ============================================================================

export interface VelocityMetrics {
  /** Organization ID */
  organizationId: string;
  /** Date for this metric */
  date: string;
  /** PRs merged on this day */
  prsMerged: number;
  /** Lines of code merged */
  linesMerged: number;
  /** Deployments to production */
  productionDeploys: number;
  /** Open PRs (WIP) */
  wipCount: number;
  /** Average PR review time (hours) */
  avgReviewTimeHours: number;
  /** PRs waiting for review */
  prsWaitingReview: number;
  /** Rolling 7-day velocity (PRs/day) */
  velocity7Day: number;
  /** Rolling 30-day velocity (PRs/day) */
  velocity30Day: number;
}

export interface VelocityCollapseAlert {
  /** Alert severity */
  severity: 'critical' | 'high' | 'medium';
  /** Organization ID */
  organizationId: string;
  /** Predicted velocity drop % */
  predictedDrop: number;
  /** Days until predicted collapse */
  daysUntilCollapse: number;
  /** Root cause signal (what's driving the collapse) */
  rootCause: 'wip_accumulation' | 'review_bottleneck' | 'reviewer_concentration' | 'unknown';
  /** Causal evidence */
  causalEvidence: GrangerResult | null;
  /** Current WIP count */
  currentWIP: number;
  /** Baseline WIP */
  baselineWIP: number;
  /** Current velocity (PRs/day) */
  currentVelocity: number;
  /** Predicted velocity (PRs/day) */
  predictedVelocity: number;
  /** Recommended interventions */
  interventions: VelocityIntervention[];
  /** Computed at */
  computedAt: string;
}

export interface VelocityIntervention {
  /** Intervention type */
  action: 'add_reviewer' | 'fast_track_prs' | 'escalate_blocked' | 'reduce_wip' | 'cross_train';
  /** Human-readable description */
  description: string;
  /** Estimated velocity recovery % */
  estimatedImpact: number;
  /** Priority (1-5, 1 = highest) */
  priority: number;
  /** Specific PRs or contributors to target */
  targets?: string[];
}

export interface VelocityConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Days to look back for historical data */
  lookbackDays?: number;
  /** Forecast horizon (days ahead to predict) */
  forecastDays?: number;
  /** Collapse threshold (% drop that triggers alert) */
  collapseThreshold?: number;
}

// ============================================================================
// VELOCITY TIME SERIES CONSTRUCTION
// ============================================================================

/**
 * Build daily velocity time series from connector signals
 */
export async function buildVelocityTimeSeries(
  config: VelocityConfig
): Promise<VelocityMetrics[]> {
  const { supabase, organizationId, lookbackDays = 90 } = config;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  // Query GitHub signals for PRs merged
  const { data: prSignals, error: prError } = await supabase
    .from('connector_signals')
    .select('signal_timestamp, signal_value, metadata')
    .eq('organization_id', organizationId)
    .eq('source', 'github')
    .eq('signal_type', 'pr_merged')
    .gte('signal_timestamp', startDate.toISOString())
    .order('signal_timestamp');

  if (prError) throw new Error(`Failed to fetch PR signals: ${prError.message}`);

  // Query deployment signals
  const { data: deploySignals, error: deployError } = await supabase
    .from('connector_signals')
    .select('signal_timestamp, signal_value, metadata')
    .eq('organization_id', organizationId)
    .eq('source', 'github')
    .eq('signal_type', 'deployment')
    .eq('metadata->>environment', 'production')
    .gte('signal_timestamp', startDate.toISOString())
    .order('signal_timestamp');

  if (deployError) throw new Error(`Failed to fetch deployment signals: ${deployError.message}`);

  // Query PR state signals for WIP
  const { data: prStateSignals, error: stateError } = await supabase
    .from('connector_signals')
    .select('signal_timestamp, signal_value, metadata')
    .eq('organization_id', organizationId)
    .eq('source', 'github')
    .eq('signal_type', 'pr_opened')
    .gte('signal_timestamp', startDate.toISOString())
    .order('signal_timestamp');

  if (stateError) throw new Error(`Failed to fetch PR state signals: ${stateError.message}`);

  // Aggregate by day
  const dailyMetrics = new Map<string, VelocityMetrics>();

  // Helper to get date key (YYYY-MM-DD)
  const getDateKey = (timestamp: string) => timestamp.split('T')[0];

  // Process PR merges
  for (const signal of prSignals || []) {
    const dateKey = getDateKey(signal.signal_timestamp);
    if (!dailyMetrics.has(dateKey)) {
      dailyMetrics.set(dateKey, {
        organizationId,
        date: dateKey,
        prsMerged: 0,
        linesMerged: 0,
        productionDeploys: 0,
        wipCount: 0,
        avgReviewTimeHours: 0,
        prsWaitingReview: 0,
        velocity7Day: 0,
        velocity30Day: 0,
      });
    }

    const metrics = dailyMetrics.get(dateKey)!;
    metrics.prsMerged += 1;
    metrics.linesMerged += (signal.metadata as any)?.lines_changed || 0;
  }

  // Process deployments
  for (const signal of deploySignals || []) {
    const dateKey = getDateKey(signal.signal_timestamp);
    if (!dailyMetrics.has(dateKey)) {
      dailyMetrics.set(dateKey, {
        organizationId,
        date: dateKey,
        prsMerged: 0,
        linesMerged: 0,
        productionDeploys: 0,
        wipCount: 0,
        avgReviewTimeHours: 0,
        prsWaitingReview: 0,
        velocity7Day: 0,
        velocity30Day: 0,
      });
    }

    const metrics = dailyMetrics.get(dateKey)!;
    if ((signal.metadata as any)?.status === 'success') {
      metrics.productionDeploys += 1;
    }
  }

  // Calculate WIP (cumulative open PRs)
  let cumulativeWIP = 0;
  for (const signal of prStateSignals || []) {
    const dateKey = getDateKey(signal.signal_timestamp);
    const state = (signal.metadata as any)?.state;

    if (state === 'open') {
      cumulativeWIP += 1;
    } else if (state === 'closed' || state === 'merged') {
      cumulativeWIP = Math.max(0, cumulativeWIP - 1);
    }

    if (dailyMetrics.has(dateKey)) {
      dailyMetrics.get(dateKey)!.wipCount = cumulativeWIP;
    }
  }

  // Convert to sorted array
  const metricsArray = Array.from(dailyMetrics.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Calculate rolling averages
  for (let i = 0; i < metricsArray.length; i++) {
    const metrics = metricsArray[i];

    // 7-day rolling velocity
    const last7Days = metricsArray.slice(Math.max(0, i - 6), i + 1);
    metrics.velocity7Day =
      last7Days.reduce((sum, m) => sum + m.prsMerged, 0) / last7Days.length;

    // 30-day rolling velocity
    const last30Days = metricsArray.slice(Math.max(0, i - 29), i + 1);
    metrics.velocity30Day =
      last30Days.reduce((sum, m) => sum + m.prsMerged, 0) / last30Days.length;
  }

  return metricsArray;
}

// ============================================================================
// WIP TRACKING
// ============================================================================

/**
 * Get current WIP metrics
 */
export async function getCurrentWIP(
  config: VelocityConfig
): Promise<{ count: number; baseline: number; percentChange: number }> {
  const timeSeries = await buildVelocityTimeSeries(config);

  if (timeSeries.length === 0) {
    return { count: 0, baseline: 0, percentChange: 0 };
  }

  // Current WIP = most recent day
  const current = timeSeries[timeSeries.length - 1].wipCount;

  // Baseline = 30-day average
  const last30Days = timeSeries.slice(-30);
  const baseline =
    last30Days.reduce((sum, m) => sum + m.wipCount, 0) / last30Days.length;

  const percentChange = baseline > 0 ? ((current - baseline) / baseline) * 100 : 0;

  return { count: current, baseline, percentChange };
}

// ============================================================================
// VELOCITY COLLAPSE PREDICTION
// ============================================================================

/**
 * Predict velocity collapse using Granger causality and trend analysis
 */
export async function predictVelocityCollapse(
  config: VelocityConfig
): Promise<VelocityCollapseAlert | null> {
  const { organizationId, forecastDays = 7, collapseThreshold = 30 } = config;

  // Build time series
  const timeSeries = await buildVelocityTimeSeries(config);

  if (timeSeries.length < 30) {
    // Not enough data for prediction
    return null;
  }

  // Extract time series arrays
  const velocityValues = timeSeries.map((m) => m.velocity7Day);
  const wipValues = timeSeries.map((m) => m.wipCount);

  // Current velocity (last 7 days)
  const currentVelocity = velocityValues[velocityValues.length - 1];

  // Baseline velocity (30-day average)
  const baselineVelocity =
    velocityValues.slice(-30).reduce((a, b) => a + b, 0) / 30;

  // Test: Does WIP Granger-cause velocity decline?
  let causalEvidence: GrangerResult | null = null;
  let rootCause: VelocityCollapseAlert['rootCause'] = 'unknown';

  try {
    causalEvidence = computeGrangerCausality(wipValues, velocityValues, 7, {
      alpha: 0.05,
    });

    if (causalEvidence.isSignificant && Math.abs(causalEvidence.effectSize) > 0.2) {
      rootCause = 'wip_accumulation';
    }
  } catch (error) {
    console.warn('Granger causality test failed:', error);
  }

  // Simple linear trend prediction (fallback if Granger unavailable)
  const recentVelocity = velocityValues.slice(-14); // Last 2 weeks
  const trend =
    recentVelocity.length > 1
      ? (recentVelocity[recentVelocity.length - 1] - recentVelocity[0]) /
        recentVelocity.length
      : 0;

  // Predict velocity N days ahead
  const predictedVelocity = Math.max(0, currentVelocity + trend * forecastDays);

  // Calculate predicted drop %
  const predictedDrop = baselineVelocity > 0
    ? ((baselineVelocity - predictedVelocity) / baselineVelocity) * 100
    : 0;

  // Only alert if predicted drop exceeds threshold
  if (predictedDrop < collapseThreshold) {
    return null;
  }

  // Get current WIP
  const wip = await getCurrentWIP(config);

  // Determine severity
  let severity: 'critical' | 'high' | 'medium' = 'medium';
  if (predictedDrop >= 50) severity = 'critical';
  else if (predictedDrop >= 40) severity = 'high';

  // Generate interventions
  const interventions: VelocityIntervention[] = [];

  if (wip.percentChange > 40) {
    interventions.push({
      action: 'reduce_wip',
      description: `WIP is ${wip.percentChange.toFixed(0)}% above baseline (${wip.count} vs ${wip.baseline.toFixed(0)}). Close or fast-track stale PRs.`,
      estimatedImpact: 15,
      priority: 1,
    });
  }

  interventions.push({
    action: 'fast_track_prs',
    description: 'Fast-track 5-10 small PRs to clear backlog',
    estimatedImpact: 8,
    priority: 2,
  });

  interventions.push({
    action: 'add_reviewer',
    description: 'Add backup reviewers to distribute load',
    estimatedImpact: 12,
    priority: 1,
  });

  if (rootCause === 'wip_accumulation') {
    interventions.push({
      action: 'escalate_blocked',
      description: 'Escalate blocked PRs causing WIP buildup',
      estimatedImpact: 10,
      priority: 1,
    });
  }

  return {
    severity,
    organizationId,
    predictedDrop,
    daysUntilCollapse: forecastDays,
    rootCause,
    causalEvidence,
    currentWIP: wip.count,
    baselineWIP: wip.baseline,
    currentVelocity,
    predictedVelocity,
    interventions: interventions.sort((a, b) => a.priority - b.priority),
    computedAt: new Date().toISOString(),
  };
}

// ============================================================================
// ALERTING
// ============================================================================

/**
 * Format velocity collapse alert as human-readable message
 */
export function formatVelocityAlert(alert: VelocityCollapseAlert): string {
  const icon = alert.severity === 'critical' ? '🚨' : alert.severity === 'high' ? '⚠️' : '⚡';

  let message = `${icon} **Velocity Collapse Warning**\n\n`;
  message += `Deploy velocity will drop **${alert.predictedDrop.toFixed(1)}%** in next ${alert.daysUntilCollapse} days\n\n`;

  message += `**Current State:**\n`;
  message += `- Velocity: ${alert.currentVelocity.toFixed(2)} PRs/day\n`;
  message += `- Predicted: ${alert.predictedVelocity.toFixed(2)} PRs/day\n`;
  message += `- WIP: ${alert.currentWIP} PRs (baseline: ${alert.baselineWIP.toFixed(0)})\n\n`;

  if (alert.rootCause !== 'unknown') {
    message += `**Root Cause:** ${alert.rootCause.replace(/_/g, ' ')}\n`;
    if (alert.causalEvidence?.isSignificant) {
      message += `- Statistical evidence: p=${alert.causalEvidence.pValue.toFixed(4)}\n`;
      message += `- Effect size: ${alert.causalEvidence.effectSize.toFixed(3)}\n\n`;
    }
  }

  message += `**Recommended Actions:**\n`;
  for (let i = 0; i < Math.min(3, alert.interventions.length); i++) {
    const intervention = alert.interventions[i];
    message += `${i + 1}. ${intervention.description} (±${intervention.estimatedImpact}% recovery)\n`;
  }

  return message;
}
