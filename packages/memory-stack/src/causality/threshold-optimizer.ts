/**
 * Nexus Memory Stack - Adaptive Threshold Optimizer
 *
 * L5: Feedback Learning - Signal Threshold Optimization
 *
 * Problem: Hard-coded thresholds like "signal_value > 0.5 = risk" are
 * suboptimal. Different organizations have different baselines, and
 * optimal thresholds should be learned from outcomes.
 *
 * This module:
 * 1. Collects signal-outcome pairs
 * 2. Uses ROC analysis to find optimal cutoffs
 * 3. Cross-validates to avoid overfitting
 * 4. Recommends threshold updates with confidence bounds
 */

import { type SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface ThresholdOptimizationResult {
  /** Signal type being optimized */
  signalType: string;
  /** Domain this signal belongs to */
  domain: string;
  /** Computed optimal threshold */
  optimalThreshold: number;
  /** Confidence interval for optimal threshold */
  thresholdCI: { lower: number; upper: number };
  /** Precision at optimal threshold */
  precision: number;
  /** Recall at optimal threshold */
  recall: number;
  /** F1 score at optimal threshold */
  f1Score: number;
  /** Area under ROC curve */
  auc: number;
  /** Current threshold in production */
  currentThreshold: number;
  /** Improvement metrics */
  improvement: {
    precisionGain: number;
    recallGain: number;
    f1Gain: number;
  };
  /** Whether we recommend updating */
  shouldUpdate: boolean;
  /** Confidence in recommendation */
  confidence: 'high' | 'medium' | 'low';
  /** Sample size used */
  sampleSize: number;
  /** Cross-validation score */
  cvScore: number;
  /** Standard deviation across CV folds */
  cvStdDev: number;
}

export interface ThresholdOptimizerConfig {
  /** Minimum samples required before optimization */
  minSamplesForUpdate: number;
  /** Minimum precision gain to recommend update (percentage) */
  minPrecisionGainPct: number;
  /** Minimum F1 gain to recommend update (percentage) */
  minF1GainPct: number;
  /** Days of data to use for optimization */
  evaluationWindowDays: number;
  /** Number of cross-validation folds */
  crossValidationFolds: number;
  /** Candidate thresholds to evaluate */
  thresholdCandidates: number[];
  /** Weighting between precision and recall (0 = all precision, 1 = all recall) */
  recallWeight: number;
}

export interface SignalOutcomePair {
  signalValue: number;
  outcomeOccurred: boolean;
  signalTimestamp: Date;
  outcomeTimestamp?: Date;
}

export interface OutcomeDefinition {
  /** What counts as a positive outcome */
  outcomeType: string;
  /** Prediction window in days */
  windowDays: number;
  /** Entity type to match */
  entityType: string;
}

export interface ThresholdUpdate {
  signalType: string;
  domain: string;
  oldThreshold: number;
  newThreshold: number;
  expectedImprovement: {
    precision: number;
    recall: number;
    f1: number;
  };
  confidence: 'high' | 'medium' | 'low';
  appliedAt?: Date;
}

export interface ROCPoint {
  threshold: number;
  tpr: number; // True Positive Rate (Recall)
  fpr: number; // False Positive Rate
  precision: number;
  f1: number;
}

// ============================================================================
// THRESHOLD OPTIMIZER FACTORY
// ============================================================================

const DEFAULT_CONFIG: ThresholdOptimizerConfig = {
  minSamplesForUpdate: 100,
  minPrecisionGainPct: 5,
  minF1GainPct: 3,
  evaluationWindowDays: 90,
  crossValidationFolds: 5,
  thresholdCandidates: [
    -0.9, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3, -0.2, -0.1, 0,
    0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9
  ],
  recallWeight: 0.5
};

/**
 * Create a threshold optimizer for learning optimal signal cutoffs
 *
 * @example
 * ```typescript
 * const optimizer = createThresholdOptimizer({
 *   minSamplesForUpdate: 100,
 *   minF1GainPct: 5
 * });
 *
 * // Optimize a single signal type
 * const result = optimizer.optimizeThreshold(
 *   signalOutcomePairs,
 *   { outcomeType: 'churn', windowDays: 90, entityType: 'client' },
 *   0.5 // current threshold
 * );
 *
 * // Optimize all signal types for an organization
 * const allResults = await optimizer.optimizeAllThresholds(supabase, orgId);
 * ```
 */
export function createThresholdOptimizer(
  config: Partial<ThresholdOptimizerConfig> = {}
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const {
    minSamplesForUpdate,
    minPrecisionGainPct,
    minF1GainPct,
    crossValidationFolds,
    thresholdCandidates,
    recallWeight
  } = mergedConfig;

  return {
    /**
     * Optimize threshold for a single signal type
     */
    optimizeThreshold(
      signals: SignalOutcomePair[],
      outcomeDefinition: OutcomeDefinition,
      currentThreshold: number,
      signalType: string = 'unknown',
      domain: string = 'unknown'
    ): ThresholdOptimizationResult {
      // Check minimum sample size
      if (signals.length < minSamplesForUpdate) {
        return createInsufficientDataResult(
          signalType, domain, currentThreshold, signals.length
        );
      }

      // Compute ROC curve
      const rocCurve = computeROCCurve(signals, thresholdCandidates);

      // Find optimal threshold using F1 or weighted precision-recall
      const optimalPoint = findOptimalThreshold(rocCurve, recallWeight);

      // Compute AUC
      const auc = computeAUC(rocCurve);

      // Cross-validate
      const cvResult = crossValidate(
        signals,
        optimalPoint.threshold,
        crossValidationFolds
      );

      // Compute current performance
      const currentPoint = rocCurve.find(p => p.threshold === currentThreshold) ||
        evaluateThreshold(signals, currentThreshold);

      // Calculate improvement
      const precisionGain = ((optimalPoint.precision - currentPoint.precision) /
        Math.max(currentPoint.precision, 0.01)) * 100;
      const recallGain = ((optimalPoint.tpr - currentPoint.tpr) /
        Math.max(currentPoint.tpr, 0.01)) * 100;
      const f1Gain = ((optimalPoint.f1 - currentPoint.f1) /
        Math.max(currentPoint.f1, 0.01)) * 100;

      // Determine if we should update
      const shouldUpdate = (
        precisionGain >= minPrecisionGainPct ||
        f1Gain >= minF1GainPct
      ) && cvResult.mean >= optimalPoint.f1 * 0.9;

      // Determine confidence
      const confidence = determineConfidence(
        signals.length,
        auc,
        cvResult.stdDev,
        f1Gain
      );

      // Compute confidence interval for threshold (bootstrap would be better but expensive)
      const thresholdCI = {
        lower: Math.max(-1, optimalPoint.threshold - cvResult.stdDev),
        upper: Math.min(1, optimalPoint.threshold + cvResult.stdDev)
      };

      return {
        signalType,
        domain,
        optimalThreshold: optimalPoint.threshold,
        thresholdCI,
        precision: optimalPoint.precision,
        recall: optimalPoint.tpr,
        f1Score: optimalPoint.f1,
        auc,
        currentThreshold,
        improvement: {
          precisionGain,
          recallGain,
          f1Gain
        },
        shouldUpdate,
        confidence,
        sampleSize: signals.length,
        cvScore: cvResult.mean,
        cvStdDev: cvResult.stdDev
      };
    },

    /**
     * Optimize all signal types for an organization
     */
    async optimizeAllThresholds(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ThresholdOptimizationResult[]> {
      const results: ThresholdOptimizationResult[] = [];

      // Get distinct signal types
      const { data: signalTypes, error: signalTypesError } = await supabase
        .from('cross_domain_signals')
        .select('source_domain, signal_type')
        .eq('organization_id', organizationId)
        .limit(1000);

      if (signalTypesError || !signalTypes) {
        console.error('Failed to fetch signal types:', signalTypesError);
        return [];
      }

      // Get unique combinations
      const uniqueCombinations = new Map<string, { domain: string; signalType: string }>();
      for (const row of signalTypes) {
        const key = `${row.source_domain}:${row.signal_type}`;
        uniqueCombinations.set(key, {
          domain: row.source_domain,
          signalType: row.signal_type
        });
      }

      // Optimize each combination
      for (const { domain, signalType } of uniqueCombinations.values()) {
        try {
          // Fetch signal-outcome pairs
          const pairs = await fetchSignalOutcomePairs(
            supabase,
            organizationId,
            domain,
            signalType,
            mergedConfig.evaluationWindowDays
          );

          if (pairs.length < minSamplesForUpdate) {
            results.push(createInsufficientDataResult(
              signalType, domain, 0.5, pairs.length
            ));
            continue;
          }

          // Get current threshold (default to 0.5 if not set)
          const currentThreshold = await getCurrentThreshold(
            supabase,
            organizationId,
            domain,
            signalType
          );

          // Optimize
          const result = this.optimizeThreshold(
            pairs,
            { outcomeType: 'negative_outcome', windowDays: 90, entityType: 'client' },
            currentThreshold,
            signalType,
            domain
          );

          results.push(result);
        } catch (error) {
          console.error(`Failed to optimize ${domain}:${signalType}:`, error);
        }
      }

      return results;
    },

    /**
     * Apply threshold updates to database
     */
    async applyUpdates(
      supabase: SupabaseClient,
      organizationId: string,
      updates: ThresholdOptimizationResult[]
    ): Promise<ThresholdUpdate[]> {
      const appliedUpdates: ThresholdUpdate[] = [];

      for (const result of updates) {
        if (!result.shouldUpdate) continue;

        const update: ThresholdUpdate = {
          signalType: result.signalType,
          domain: result.domain,
          oldThreshold: result.currentThreshold,
          newThreshold: result.optimalThreshold,
          expectedImprovement: {
            precision: result.improvement.precisionGain,
            recall: result.improvement.recallGain,
            f1: result.improvement.f1Gain
          },
          confidence: result.confidence,
          appliedAt: new Date()
        };

        // Store threshold update in database
        const { error } = await supabase
          .from('signal_thresholds')
          .upsert({
            organization_id: organizationId,
            domain: result.domain,
            signal_type: result.signalType,
            threshold_value: result.optimalThreshold,
            threshold_ci_lower: result.thresholdCI.lower,
            threshold_ci_upper: result.thresholdCI.upper,
            auc: result.auc,
            f1_score: result.f1Score,
            sample_size: result.sampleSize,
            confidence: result.confidence,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'organization_id,domain,signal_type'
          });

        if (!error) {
          appliedUpdates.push(update);
        } else {
          console.error(`Failed to apply update for ${result.domain}:${result.signalType}:`, error);
        }
      }

      return appliedUpdates;
    },

    /**
     * Get optimization history for a signal
     */
    async getOptimizationHistory(
      supabase: SupabaseClient,
      organizationId: string,
      domain: string,
      signalType: string
    ): Promise<ThresholdUpdate[]> {
      const { data, error } = await supabase
        .from('threshold_optimization_history')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('domain', domain)
        .eq('signal_type', signalType)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error || !data) {
        return [];
      }

      return data.map(row => ({
        signalType: row.signal_type,
        domain: row.domain,
        oldThreshold: row.old_threshold,
        newThreshold: row.new_threshold,
        expectedImprovement: row.expected_improvement,
        confidence: row.confidence,
        appliedAt: new Date(row.created_at)
      }));
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Compute ROC curve points
 */
function computeROCCurve(
  signals: SignalOutcomePair[],
  thresholds: number[]
): ROCPoint[] {
  return thresholds.map(threshold => evaluateThreshold(signals, threshold));
}

/**
 * Evaluate a single threshold
 */
function evaluateThreshold(
  signals: SignalOutcomePair[],
  threshold: number
): ROCPoint {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const signal of signals) {
    const predicted = signal.signalValue >= threshold;
    const actual = signal.outcomeOccurred;

    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && actual) fn++;
    else tn++;
  }

  const tpr = tp + fn > 0 ? tp / (tp + fn) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const f1 = precision + tpr > 0 ? 2 * (precision * tpr) / (precision + tpr) : 0;

  return { threshold, tpr, fpr, precision, f1 };
}

/**
 * Find optimal threshold using weighted F1
 */
function findOptimalThreshold(rocCurve: ROCPoint[], recallWeight: number): ROCPoint {
  let best = rocCurve[0];
  let bestScore = -Infinity;

  for (const point of rocCurve) {
    // Weighted combination of precision and recall
    const weightedScore = (1 - recallWeight) * point.precision + recallWeight * point.tpr;

    if (weightedScore > bestScore) {
      bestScore = weightedScore;
      best = point;
    }
  }

  return best;
}

/**
 * Compute Area Under ROC Curve using trapezoidal rule
 */
function computeAUC(rocCurve: ROCPoint[]): number {
  // Sort by FPR
  const sorted = [...rocCurve].sort((a, b) => a.fpr - b.fpr);

  let auc = 0;
  for (let i = 1; i < sorted.length; i++) {
    const width = sorted[i].fpr - sorted[i - 1].fpr;
    const height = (sorted[i].tpr + sorted[i - 1].tpr) / 2;
    auc += width * height;
  }

  return auc;
}

/**
 * Cross-validate threshold using k-fold
 */
function crossValidate(
  signals: SignalOutcomePair[],
  threshold: number,
  folds: number
): { mean: number; stdDev: number } {
  const shuffled = [...signals].sort(() => Math.random() - 0.5);
  const foldSize = Math.floor(shuffled.length / folds);
  const f1Scores: number[] = [];

  for (let i = 0; i < folds; i++) {
    const testStart = i * foldSize;
    const testEnd = testStart + foldSize;
    const testSet = shuffled.slice(testStart, testEnd);

    const result = evaluateThreshold(testSet, threshold);
    f1Scores.push(result.f1);
  }

  const mean = f1Scores.reduce((sum, s) => sum + s, 0) / f1Scores.length;
  const variance = f1Scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / f1Scores.length;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}

/**
 * Determine confidence level
 */
function determineConfidence(
  sampleSize: number,
  auc: number,
  cvStdDev: number,
  f1Gain: number
): 'high' | 'medium' | 'low' {
  // High confidence: large sample, good AUC, low variance, significant gain
  if (sampleSize >= 500 && auc >= 0.75 && cvStdDev < 0.1 && f1Gain >= 10) {
    return 'high';
  }

  // Medium confidence: reasonable sample, decent AUC, moderate variance
  if (sampleSize >= 200 && auc >= 0.65 && cvStdDev < 0.15) {
    return 'medium';
  }

  return 'low';
}

/**
 * Create result for insufficient data
 */
function createInsufficientDataResult(
  signalType: string,
  domain: string,
  currentThreshold: number,
  sampleSize: number
): ThresholdOptimizationResult {
  return {
    signalType,
    domain,
    optimalThreshold: currentThreshold,
    thresholdCI: { lower: currentThreshold, upper: currentThreshold },
    precision: 0,
    recall: 0,
    f1Score: 0,
    auc: 0.5,
    currentThreshold,
    improvement: { precisionGain: 0, recallGain: 0, f1Gain: 0 },
    shouldUpdate: false,
    confidence: 'low',
    sampleSize,
    cvScore: 0,
    cvStdDev: 0
  };
}

/**
 * Fetch signal-outcome pairs from database
 */
async function fetchSignalOutcomePairs(
  supabase: SupabaseClient,
  organizationId: string,
  domain: string,
  signalType: string,
  windowDays: number
): Promise<SignalOutcomePair[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - windowDays);

  // Get signals with their outcomes
  const { data, error } = await supabase
    .from('cross_domain_signals')
    .select(`
      signal_value,
      signal_timestamp,
      entity_id,
      entity_type,
      prediction_outcomes!inner (
        outcome_occurred,
        outcome_date
      )
    `)
    .eq('organization_id', organizationId)
    .eq('source_domain', domain)
    .eq('signal_type', signalType)
    .gte('signal_timestamp', startDate.toISOString())
    .not('prediction_outcomes.outcome_occurred', 'is', null);

  if (error || !data) {
    console.error('Failed to fetch signal-outcome pairs:', error);
    return [];
  }

  return data.map(row => ({
    signalValue: row.signal_value,
    outcomeOccurred: (row.prediction_outcomes as unknown as { outcome_occurred: boolean }[])[0]?.outcome_occurred ?? false,
    signalTimestamp: new Date(row.signal_timestamp),
    outcomeTimestamp: (row.prediction_outcomes as unknown as { outcome_date?: string }[])[0]?.outcome_date
      ? new Date((row.prediction_outcomes as unknown as { outcome_date: string }[])[0].outcome_date)
      : undefined
  }));
}

/**
 * Get current threshold from database
 */
async function getCurrentThreshold(
  supabase: SupabaseClient,
  organizationId: string,
  domain: string,
  signalType: string
): Promise<number> {
  const { data, error } = await supabase
    .from('signal_thresholds')
    .select('threshold_value')
    .eq('organization_id', organizationId)
    .eq('domain', domain)
    .eq('signal_type', signalType)
    .single();

  if (error || !data) {
    return 0.5; // Default threshold
  }

  return data.threshold_value;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ThresholdOptimizer = {
  createThresholdOptimizer
};
