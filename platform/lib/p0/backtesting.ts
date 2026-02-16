/**
 * Backtesting Framework for P0 Early Warning System
 * ====================================================
 *
 * WEEK 3: P0 Spec Compliance (85% → 95%)
 *
 * Evaluates prediction accuracy by replaying historical data:
 * - Walk-forward validation (train on past, predict next window, slide forward)
 * - Metrics: MAE, RMSE, Precision@collapse, Recall@collapse, F1
 * - Generates backtest reports for model confidence assessment
 *
 * USAGE:
 *   const report = await runBacktest(supabase, organizationId, {
 *     lookbackMonths: 6,
 *     trainWindowWeeks: 8,
 *     testWindowWeeks: 1,
 *   });
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface BacktestConfig {
  /** Total lookback period in months (default: 6) */
  lookbackMonths?: number;
  /** Training window size in weeks (default: 8) */
  trainWindowWeeks?: number;
  /** Test window size in weeks (default: 1 = 7 days) */
  testWindowWeeks?: number;
  /** Collapse threshold: z-score below this = collapse (default: -1.0) */
  collapseZScoreThreshold?: number;
  /** Collapse threshold: % drop (default: -25) */
  collapsePercentDropThreshold?: number;
}

export interface BacktestResult {
  /** Number of walk-forward steps */
  totalSteps: number;
  /** Mean Absolute Error */
  mae: number;
  /** Root Mean Square Error */
  rmse: number;
  /** Precision: of predicted collapses, how many were actual? */
  collapsePrecision: number;
  /** Recall: of actual collapses, how many did we predict? */
  collapseRecall: number;
  /** F1 score (harmonic mean of precision and recall) */
  collapseF1: number;
  /** Per-step details */
  steps: BacktestStep[];
  /** Overall model assessment */
  assessment: 'excellent' | 'good' | 'fair' | 'poor';
  /** Human-readable summary */
  summary: string;
}

export interface BacktestStep {
  /** Step index */
  step: number;
  /** Training period end date */
  trainEnd: string;
  /** Test period (prediction target) */
  testDate: string;
  /** Actual velocity */
  actual: number;
  /** Predicted velocity (simple model) */
  predicted: number;
  /** Absolute error */
  absoluteError: number;
  /** Was actual collapse? */
  actualCollapse: boolean;
  /** Did model predict collapse? */
  predictedCollapse: boolean;
  /** Z-score at prediction time */
  zScore: number;
}

// ============================================================================
// BACKTESTING ENGINE
// ============================================================================

/**
 * Run walk-forward backtesting on historical velocity data.
 *
 * Walk-forward protocol:
 * 1. Start at week (trainWindowWeeks + 1)
 * 2. Train on the previous trainWindowWeeks
 * 3. Predict the next week
 * 4. Record actual vs predicted
 * 5. Slide forward by 1 week
 * 6. Repeat until data exhausted
 */
export async function runBacktest(
  supabase: SupabaseClient,
  organizationId: string,
  config: BacktestConfig = {}
): Promise<BacktestResult> {
  const {
    lookbackMonths = 6,
    trainWindowWeeks = 8,
    testWindowWeeks = 1,
    collapseZScoreThreshold = -1.0,
    collapsePercentDropThreshold = -25,
  } = config;

  // Load all velocity snapshots
  const since = new Date();
  since.setMonth(since.getMonth() - lookbackMonths);

  const { data: snapshots } = await supabase
    .from('velocity_snapshots')
    .select('snapshot_date, prs_merged, mean_pr_cycle_time_hours, pr_cycle_time_variance, open_pr_count, prs_per_engineer')
    .eq('organization_id', organizationId)
    .gte('snapshot_date', since.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (!snapshots || snapshots.length < trainWindowWeeks + 2) {
    return {
      totalSteps: 0,
      mae: 0,
      rmse: 0,
      collapsePrecision: 0,
      collapseRecall: 0,
      collapseF1: 0,
      steps: [],
      assessment: 'poor',
      summary: `Insufficient data: ${snapshots?.length || 0} snapshots found, need at least ${trainWindowWeeks + 2}. Run data sync first.`,
    };
  }

  const velocities = snapshots.map((s) => s.prs_merged || 0);
  const steps: BacktestStep[] = [];

  // Walk-forward loop
  for (let i = trainWindowWeeks; i < velocities.length - testWindowWeeks; i++) {
    const trainVelocities = velocities.slice(i - trainWindowWeeks, i);
    const actual = velocities[i + testWindowWeeks - 1];

    // Simple prediction model: exponentially weighted moving average (EWMA)
    // More recent weeks have higher weight
    const alpha = 0.3; // Smoothing factor
    let ewma = trainVelocities[0];
    for (let j = 1; j < trainVelocities.length; j++) {
      ewma = alpha * trainVelocities[j] + (1 - alpha) * ewma;
    }
    const predicted = Math.round(ewma);

    // Z-score based on training window
    const trainMean = trainVelocities.reduce((s, v) => s + v, 0) / trainVelocities.length;
    const trainStd = Math.sqrt(
      trainVelocities.reduce((s, v) => s + Math.pow(v - trainMean, 2), 0) / trainVelocities.length
    );
    const zScore = trainStd > 0 ? (actual - trainMean) / trainStd : 0;

    // Collapse detection
    const prevVelocity = velocities[i - 1] || 1;
    const percentDrop = prevVelocity > 0 ? ((actual - prevVelocity) / prevVelocity) * 100 : 0;
    const actualCollapse = zScore < collapseZScoreThreshold || percentDrop < collapsePercentDropThreshold;

    // Predicted collapse: check if prediction suggests drop
    const predictedZScore = trainStd > 0 ? (predicted - trainMean) / trainStd : 0;
    const predictedDrop = prevVelocity > 0 ? ((predicted - prevVelocity) / prevVelocity) * 100 : 0;
    const predictedCollapse = predictedZScore < collapseZScoreThreshold || predictedDrop < collapsePercentDropThreshold;

    steps.push({
      step: steps.length + 1,
      trainEnd: snapshots[i - 1]?.snapshot_date || '',
      testDate: snapshots[i + testWindowWeeks - 1]?.snapshot_date || '',
      actual,
      predicted,
      absoluteError: Math.abs(actual - predicted),
      actualCollapse,
      predictedCollapse,
      zScore,
    });
  }

  if (steps.length === 0) {
    return {
      totalSteps: 0,
      mae: 0,
      rmse: 0,
      collapsePrecision: 0,
      collapseRecall: 0,
      collapseF1: 0,
      steps: [],
      assessment: 'poor',
      summary: 'No walk-forward steps could be completed. Need more historical data.',
    };
  }

  // ── METRICS ──────────────────────────────────────────────────────────────

  // MAE
  const mae = steps.reduce((s, step) => s + step.absoluteError, 0) / steps.length;

  // RMSE
  const mse = steps.reduce((s, step) => s + Math.pow(step.absoluteError, 2), 0) / steps.length;
  const rmse = Math.sqrt(mse);

  // Collapse Precision / Recall / F1
  const truePositives = steps.filter((s) => s.actualCollapse && s.predictedCollapse).length;
  const falsePositives = steps.filter((s) => !s.actualCollapse && s.predictedCollapse).length;
  const falseNegatives = steps.filter((s) => s.actualCollapse && !s.predictedCollapse).length;

  const collapsePrecision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;
  const collapseRecall =
    truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0;
  const collapseF1 =
    collapsePrecision + collapseRecall > 0
      ? (2 * collapsePrecision * collapseRecall) / (collapsePrecision + collapseRecall)
      : 0;

  // ── ASSESSMENT ───────────────────────────────────────────────────────────

  const meanVelocity =
    velocities.reduce((s, v) => s + v, 0) / velocities.length;
  const normalizedMAE = meanVelocity > 0 ? mae / meanVelocity : 1;

  let assessment: BacktestResult['assessment'];
  if (normalizedMAE < 0.15 && collapseF1 > 0.7) assessment = 'excellent';
  else if (normalizedMAE < 0.25 && collapseF1 > 0.5) assessment = 'good';
  else if (normalizedMAE < 0.4) assessment = 'fair';
  else assessment = 'poor';

  const summary = [
    `Backtested ${steps.length} walk-forward steps over ${lookbackMonths} months.`,
    `MAE: ${mae.toFixed(1)} PRs (${(normalizedMAE * 100).toFixed(1)}% of mean velocity).`,
    `RMSE: ${rmse.toFixed(1)} PRs.`,
    `Collapse detection — Precision: ${(collapsePrecision * 100).toFixed(0)}%, Recall: ${(collapseRecall * 100).toFixed(0)}%, F1: ${(collapseF1 * 100).toFixed(0)}%.`,
    `Assessment: ${assessment.toUpperCase()}.`,
    truePositives > 0
      ? `Correctly predicted ${truePositives} out of ${truePositives + falseNegatives} actual collapses.`
      : 'No collapse events in test period (or no collapses occurred).',
  ].join(' ');

  return {
    totalSteps: steps.length,
    mae,
    rmse,
    collapsePrecision,
    collapseRecall,
    collapseF1,
    steps,
    assessment,
    summary,
  };
}

// ============================================================================
// BACKTEST API ROUTE HELPER
// ============================================================================

/**
 * Run backtest and save report to ai_memory for Brain to reference.
 */
export async function runAndSaveBacktest(
  supabase: SupabaseClient,
  organizationId: string,
  config: BacktestConfig = {}
): Promise<BacktestResult> {
  const result = await runBacktest(supabase, organizationId, config);

  // Save backtest report as Brain memory for future reference
  if (result.totalSteps > 0) {
    await supabase.from('ai_memory').insert({
      organization_id: organizationId,
      memory_type: 'insight',
      cognitive_layer: 'L4',
      content: JSON.stringify({
        type: 'backtest_report',
        summary: result.summary,
        mae: result.mae,
        rmse: result.rmse,
        collapseF1: result.collapseF1,
        assessment: result.assessment,
        totalSteps: result.totalSteps,
      }),
      metadata: {
        source: 'velocity_backtest',
        assessment: result.assessment,
      },
    });
  }

  return result;
}
