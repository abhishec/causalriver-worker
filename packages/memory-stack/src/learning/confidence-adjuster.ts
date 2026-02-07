/**
 * Confidence Adjuster - Bayesian confidence updates for Brain rules
 *
 * This module implements learning by adjusting rule confidence based on
 * observed accuracy. Rules that consistently predict correctly gain confidence;
 * rules that make mistakes lose it.
 *
 * Algorithm: Bayesian update with configurable learning rate
 *
 * newConfidence = currentConfidence + learningRate * (accuracy - currentConfidence)
 *
 * This smoothly moves confidence toward actual observed accuracy while
 * preventing wild swings from small samples.
 */

import type { PredictionAccuracy } from './outcome-tracker';

// ============================================================================
// TYPES
// ============================================================================

export interface ConfidenceUpdate {
  rule_id: string;
  old_confidence: number;
  new_confidence: number;
  accuracy_observed: number;
  sample_size: number;
  learning_rate_used: number;
  adjustment_reason: string;
}

export interface CalibrationConfig {
  /** Base learning rate (default 0.1) */
  baseLearningRate: number;
  
  /** Minimum samples before any adjustment (default 5) */
  minimumSamples: number;
  
  /** Samples needed for full learning rate (default 30) */
  fullConfidenceSamples: number;
  
  /** Minimum confidence floor (default 0.1) */
  minConfidence: number;
  
  /** Maximum confidence ceiling (default 0.95) */
  maxConfidence: number;
  
  /** Days of data to consider (default 90) */
  lookbackDays: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  baseLearningRate: 0.1,
  minimumSamples: 5,
  fullConfidenceSamples: 30,
  minConfidence: 0.1,
  maxConfidence: 0.95,
  lookbackDays: 90,
};

// ============================================================================
// LEARNING RATE COMPUTATION
// ============================================================================

/**
 * Compute adaptive learning rate based on sample size
 * 
 * With few samples, we're uncertain about accuracy, so learn slowly.
 * With many samples, we can trust the data more, so learn faster.
 */
export function computeAdaptiveLearningRate(
  sampleSize: number,
  config: CalibrationConfig = DEFAULT_CALIBRATION_CONFIG
): number {
  if (sampleSize < config.minimumSamples) {
    return 0; // Don't adjust with too few samples
  }
  
  // Linear ramp from 0 to baseLearningRate
  const rampProgress = Math.min(
    1,
    (sampleSize - config.minimumSamples) / 
    (config.fullConfidenceSamples - config.minimumSamples)
  );
  
  return config.baseLearningRate * rampProgress;
}

/**
 * Compute confidence update multiplier based on calibration error
 * 
 * If a rule claims 90% confidence but only achieves 50% accuracy,
 * it's severely miscalibrated and needs a larger adjustment.
 */
export function computeCalibrationPenalty(
  currentConfidence: number,
  observedAccuracy: number
): number {
  const calibrationError = Math.abs(currentConfidence - observedAccuracy);
  
  // Larger errors → faster correction
  if (calibrationError > 0.3) return 1.5; // Severely miscalibrated
  if (calibrationError > 0.2) return 1.2; // Moderately miscalibrated
  return 1.0; // Well calibrated
}

// ============================================================================
// CONFIDENCE ADJUSTMENT
// ============================================================================

/**
 * Compute new confidence for a rule based on observed accuracy
 */
export function computeNewConfidence(
  currentConfidence: number,
  accuracy: PredictionAccuracy,
  config: CalibrationConfig = DEFAULT_CALIBRATION_CONFIG
): ConfidenceUpdate {
  const learningRate = computeAdaptiveLearningRate(accuracy.total_predictions, config);
  
  if (learningRate === 0) {
    return {
      rule_id: accuracy.rule_id,
      old_confidence: currentConfidence,
      new_confidence: currentConfidence,
      accuracy_observed: accuracy.accuracy,
      sample_size: accuracy.total_predictions,
      learning_rate_used: 0,
      adjustment_reason: `Insufficient samples (${accuracy.total_predictions} < ${config.minimumSamples})`,
    };
  }
  
  const calibrationPenalty = computeCalibrationPenalty(currentConfidence, accuracy.accuracy);
  const effectiveLearningRate = learningRate * calibrationPenalty;
  
  // Bayesian-style update: move toward observed accuracy
  const adjustment = effectiveLearningRate * (accuracy.accuracy - currentConfidence);
  let newConfidence = currentConfidence + adjustment;
  
  // Clamp to valid range
  newConfidence = Math.max(config.minConfidence, Math.min(config.maxConfidence, newConfidence));
  
  // Determine adjustment reason
  let reason: string;
  if (adjustment > 0.05) {
    reason = `Increased confidence: rule is more accurate than expected (${(accuracy.accuracy * 100).toFixed(0)}% vs ${(currentConfidence * 100).toFixed(0)}%)`;
  } else if (adjustment < -0.05) {
    reason = `Decreased confidence: rule is less accurate than expected (${(accuracy.accuracy * 100).toFixed(0)}% vs ${(currentConfidence * 100).toFixed(0)}%)`;
  } else {
    reason = `Minor adjustment: rule is well-calibrated`;
  }
  
  return {
    rule_id: accuracy.rule_id,
    old_confidence: currentConfidence,
    new_confidence: newConfidence,
    accuracy_observed: accuracy.accuracy,
    sample_size: accuracy.total_predictions,
    learning_rate_used: effectiveLearningRate,
    adjustment_reason: reason,
  };
}

/**
 * Apply confidence update with F1-weighted adjustment
 * 
 * Rewards rules with high precision AND recall, not just accuracy.
 * This prevents rules that "always predict positive" from getting high confidence.
 */
export function computeF1WeightedConfidence(
  currentConfidence: number,
  accuracy: PredictionAccuracy,
  config: CalibrationConfig = DEFAULT_CALIBRATION_CONFIG
): ConfidenceUpdate {
  const learningRate = computeAdaptiveLearningRate(accuracy.total_predictions, config);
  
  if (learningRate === 0) {
    return {
      rule_id: accuracy.rule_id,
      old_confidence: currentConfidence,
      new_confidence: currentConfidence,
      accuracy_observed: accuracy.f1_score,
      sample_size: accuracy.total_predictions,
      learning_rate_used: 0,
      adjustment_reason: `Insufficient samples for F1-weighted update`,
    };
  }
  
  // Use F1 score as the target instead of raw accuracy
  const targetScore = accuracy.f1_score;
  
  const adjustment = learningRate * (targetScore - currentConfidence);
  let newConfidence = currentConfidence + adjustment;
  
  // Clamp
  newConfidence = Math.max(config.minConfidence, Math.min(config.maxConfidence, newConfidence));
  
  return {
    rule_id: accuracy.rule_id,
    old_confidence: currentConfidence,
    new_confidence: newConfidence,
    accuracy_observed: accuracy.f1_score,
    sample_size: accuracy.total_predictions,
    learning_rate_used: learningRate,
    adjustment_reason: `F1-weighted adjustment (F1=${(accuracy.f1_score * 100).toFixed(0)}%, P=${(accuracy.precision * 100).toFixed(0)}%, R=${(accuracy.recall * 100).toFixed(0)}%)`,
  };
}

// ============================================================================
// BATCH CALIBRATION
// ============================================================================

/**
 * Process all rules and compute confidence updates
 */
export function calibrateAllRules(
  rules: Array<{ id: string; confidence: number }>,
  accuracyByRule: Map<string, PredictionAccuracy>,
  config: CalibrationConfig = DEFAULT_CALIBRATION_CONFIG
): ConfidenceUpdate[] {
  const updates: ConfidenceUpdate[] = [];
  
  for (const rule of rules) {
    const accuracy = accuracyByRule.get(rule.id);
    
    if (!accuracy) {
      // No predictions for this rule yet
      continue;
    }
    
    const update = computeNewConfidence(rule.confidence, accuracy, config);
    updates.push(update);
  }
  
  return updates;
}

/**
 * Generate natural language summary of calibration run
 */
export function summarizeCalibration(updates: ConfidenceUpdate[]): string {
  const adjusted = updates.filter(u => u.old_confidence !== u.new_confidence);
  const increased = adjusted.filter(u => u.new_confidence > u.old_confidence);
  const decreased = adjusted.filter(u => u.new_confidence < u.old_confidence);
  const noData = updates.filter(u => u.sample_size < 5);
  
  const lines = [
    `## Brain Calibration Summary`,
    ``,
    `**${updates.length} rules evaluated**`,
    `- ${increased.length} rules increased confidence (performing better than expected)`,
    `- ${decreased.length} rules decreased confidence (performing worse than expected)`,
    `- ${updates.length - adjusted.length} rules unchanged`,
    `- ${noData.length} rules with insufficient data`,
  ];
  
  if (increased.length > 0) {
    lines.push(``, `### Top Performers:`);
    for (const u of increased.slice(0, 3)) {
      lines.push(`- Rule ${u.rule_id}: ${(u.old_confidence * 100).toFixed(0)}% → ${(u.new_confidence * 100).toFixed(0)}% (${(u.accuracy_observed * 100).toFixed(0)}% accurate over ${u.sample_size} samples)`);
    }
  }
  
  if (decreased.length > 0) {
    lines.push(``, `### Needs Improvement:`);
    for (const u of decreased.slice(0, 3)) {
      lines.push(`- Rule ${u.rule_id}: ${(u.old_confidence * 100).toFixed(0)}% → ${(u.new_confidence * 100).toFixed(0)}% (${(u.accuracy_observed * 100).toFixed(0)}% accurate over ${u.sample_size} samples)`);
    }
  }
  
  return lines.join('\n');
}
