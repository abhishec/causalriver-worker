/**
 * Nexus Memory Stack - Confidence Adjuster Tests
 *
 * Tests for Bayesian confidence updates, adaptive learning rates,
 * calibration penalties, F1-weighted adjustments, batch calibration,
 * and natural-language calibration summaries.
 */

import { describe, it, expect } from 'vitest';
import {
  computeAdaptiveLearningRate,
  computeCalibrationPenalty,
  computeNewConfidence,
  computeF1WeightedConfidence,
  calibrateAllRules,
  summarizeCalibration,
  DEFAULT_CALIBRATION_CONFIG,
} from '../learning/confidence-adjuster';
import type { PredictionAccuracy } from '../learning/outcome-tracker';

// ============================================================================
// HELPERS
// ============================================================================

/** Build a PredictionAccuracy record with sensible defaults. */
function makeAccuracy(
  overrides: Partial<PredictionAccuracy> & { rule_id: string },
): PredictionAccuracy {
  return {
    prediction_type: 'churn',
    total_predictions: 50,
    true_positives: 30,
    true_negatives: 10,
    false_positives: 5,
    false_negatives: 5,
    accuracy: 0.8,
    precision: 0.86,
    recall: 0.86,
    f1_score: 0.86,
    avg_confidence: 0.7,
    sample_period_days: 90,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Confidence Adjuster', () => {
  // ==========================================================================
  // DEFAULT_CALIBRATION_CONFIG
  // ==========================================================================

  describe('DEFAULT_CALIBRATION_CONFIG', () => {
    it('should expose sensible default values', () => {
      expect(DEFAULT_CALIBRATION_CONFIG).toEqual({
        baseLearningRate: 0.1,
        minimumSamples: 5,
        fullConfidenceSamples: 30,
        minConfidence: 0.1,
        maxConfidence: 0.95,
        lookbackDays: 90,
      });
    });
  });

  // ==========================================================================
  // computeAdaptiveLearningRate
  // ==========================================================================

  describe('computeAdaptiveLearningRate', () => {
    it('should return 0 when sample size is below the minimum threshold', () => {
      // Below the default minimumSamples of 5
      expect(computeAdaptiveLearningRate(0)).toBe(0);
      expect(computeAdaptiveLearningRate(1)).toBe(0);
      expect(computeAdaptiveLearningRate(4)).toBe(0);
    });

    it('should linearly ramp from 0 to baseLearningRate between minimumSamples and fullConfidenceSamples', () => {
      const config = DEFAULT_CALIBRATION_CONFIG;

      // At exactly minimumSamples (5), ramp progress = 0/(30-5) = 0
      expect(computeAdaptiveLearningRate(5)).toBe(0);

      // Midpoint: sampleSize = 5 + (30-5)/2 = 17.5 -> use 17 and 18
      // At 17: (17-5)/(30-5) = 12/25 = 0.48 -> 0.1 * 0.48 = 0.048
      const midRate = computeAdaptiveLearningRate(17);
      expect(midRate).toBeCloseTo(0.048, 4);

      // At fullConfidenceSamples (30), ramp progress = 25/25 = 1.0 -> full LR
      expect(computeAdaptiveLearningRate(30)).toBeCloseTo(config.baseLearningRate, 6);

      // Beyond fullConfidenceSamples (e.g. 100), should cap at baseLearningRate
      expect(computeAdaptiveLearningRate(100)).toBeCloseTo(config.baseLearningRate, 6);
    });

    it('should respect a custom config for learning rate ramp', () => {
      const custom = {
        ...DEFAULT_CALIBRATION_CONFIG,
        baseLearningRate: 0.2,
        minimumSamples: 10,
        fullConfidenceSamples: 50,
      };

      // Below custom minimum
      expect(computeAdaptiveLearningRate(9, custom)).toBe(0);

      // At minimum boundary
      expect(computeAdaptiveLearningRate(10, custom)).toBe(0);

      // Halfway: (30-10)/(50-10) = 20/40 = 0.5 -> 0.2 * 0.5 = 0.1
      expect(computeAdaptiveLearningRate(30, custom)).toBeCloseTo(0.1, 6);

      // At full
      expect(computeAdaptiveLearningRate(50, custom)).toBeCloseTo(0.2, 6);

      // Beyond full
      expect(computeAdaptiveLearningRate(200, custom)).toBeCloseTo(0.2, 6);
    });
  });

  // ==========================================================================
  // computeCalibrationPenalty
  // ==========================================================================

  describe('computeCalibrationPenalty', () => {
    it('should return 1.0 for well-calibrated rules (error <= 0.2)', () => {
      // Exact match
      expect(computeCalibrationPenalty(0.8, 0.8)).toBe(1.0);
      // Small error within 0.2 threshold
      expect(computeCalibrationPenalty(0.7, 0.85)).toBe(1.0);
      // Use 0.61 to avoid floating-point boundary issue (|0.8 - 0.6| = 0.20000000000000007 in JS)
      expect(computeCalibrationPenalty(0.8, 0.61)).toBe(1.0);
    });

    it('should return 1.2 for moderately miscalibrated rules (0.2 < error <= 0.3)', () => {
      // |0.8 - 0.55| = 0.25 -> moderately miscalibrated
      expect(computeCalibrationPenalty(0.8, 0.55)).toBe(1.2);
      // |0.9 - 0.65| = 0.25
      expect(computeCalibrationPenalty(0.9, 0.65)).toBe(1.2);
      // Use 0.51 to avoid floating-point boundary issue (|0.8 - 0.5| = 0.30000000000000004 in JS)
      expect(computeCalibrationPenalty(0.8, 0.51)).toBe(1.2);
    });

    it('should return 1.5 for severely miscalibrated rules (error > 0.3)', () => {
      // |0.9 - 0.5| = 0.4 -> severe
      expect(computeCalibrationPenalty(0.9, 0.5)).toBe(1.5);
      // |0.9 - 0.2| = 0.7 -> severe
      expect(computeCalibrationPenalty(0.9, 0.2)).toBe(1.5);
      // Works in the other direction too: accuracy > confidence
      // |0.3 - 0.8| = 0.5 -> severe
      expect(computeCalibrationPenalty(0.3, 0.8)).toBe(1.5);
    });
  });

  // ==========================================================================
  // computeNewConfidence
  // ==========================================================================

  describe('computeNewConfidence', () => {
    it('should return unchanged confidence when samples are insufficient', () => {
      const accuracy = makeAccuracy({
        rule_id: 'rule-1',
        total_predictions: 3,
        accuracy: 0.9,
      });
      const result = computeNewConfidence(0.5, accuracy);

      expect(result.rule_id).toBe('rule-1');
      expect(result.old_confidence).toBe(0.5);
      expect(result.new_confidence).toBe(0.5);
      expect(result.learning_rate_used).toBe(0);
      expect(result.adjustment_reason).toContain('Insufficient samples');
      expect(result.adjustment_reason).toContain('3');
    });

    it('should increase confidence when observed accuracy exceeds current confidence', () => {
      const accuracy = makeAccuracy({
        rule_id: 'rule-up',
        total_predictions: 50,
        accuracy: 0.9,
      });
      const result = computeNewConfidence(0.5, accuracy);

      expect(result.new_confidence).toBeGreaterThan(0.5);
      expect(result.learning_rate_used).toBeGreaterThan(0);
      expect(result.accuracy_observed).toBe(0.9);
      expect(result.adjustment_reason).toContain('Increased confidence');
    });

    it('should decrease confidence when observed accuracy is below current confidence', () => {
      const accuracy = makeAccuracy({
        rule_id: 'rule-down',
        total_predictions: 50,
        accuracy: 0.3,
      });
      const result = computeNewConfidence(0.8, accuracy);

      expect(result.new_confidence).toBeLessThan(0.8);
      expect(result.adjustment_reason).toContain('Decreased confidence');
    });

    it('should report minor adjustment when accuracy is close to current confidence', () => {
      const accuracy = makeAccuracy({
        rule_id: 'rule-stable',
        total_predictions: 50,
        accuracy: 0.71,
      });
      // With accuracy=0.71 and confidence=0.7, adjustment is very small
      const result = computeNewConfidence(0.7, accuracy);

      expect(result.adjustment_reason).toContain('Minor adjustment');
    });

    it('should clamp confidence to minConfidence and maxConfidence', () => {
      // Clamp to floor: very bad accuracy should not push below minConfidence
      const lowAccuracy = makeAccuracy({
        rule_id: 'rule-floor',
        total_predictions: 50,
        accuracy: 0.0,
      });
      const floorResult = computeNewConfidence(0.15, lowAccuracy);
      expect(floorResult.new_confidence).toBeGreaterThanOrEqual(
        DEFAULT_CALIBRATION_CONFIG.minConfidence,
      );

      // Clamp to ceiling: very high accuracy should not push above maxConfidence
      const highAccuracy = makeAccuracy({
        rule_id: 'rule-ceil',
        total_predictions: 50,
        accuracy: 1.0,
      });
      const ceilResult = computeNewConfidence(0.94, highAccuracy);
      expect(ceilResult.new_confidence).toBeLessThanOrEqual(
        DEFAULT_CALIBRATION_CONFIG.maxConfidence,
      );
    });

    it('should apply a larger effective learning rate for severely miscalibrated rules', () => {
      // Severely miscalibrated: confidence=0.9, accuracy=0.4 -> |diff|=0.5 -> penalty=1.5
      const severeAccuracy = makeAccuracy({
        rule_id: 'rule-severe',
        total_predictions: 50,
        accuracy: 0.4,
      });
      const severeResult = computeNewConfidence(0.9, severeAccuracy);

      // Well-calibrated: confidence=0.9, accuracy=0.85 -> |diff|=0.05 -> penalty=1.0
      const mildAccuracy = makeAccuracy({
        rule_id: 'rule-mild',
        total_predictions: 50,
        accuracy: 0.85,
      });
      const mildResult = computeNewConfidence(0.9, mildAccuracy);

      // The severe case should have a larger effective learning rate
      expect(severeResult.learning_rate_used).toBeGreaterThan(mildResult.learning_rate_used);
      // Specifically: severe uses LR * 1.5, mild uses LR * 1.0
      expect(severeResult.learning_rate_used / mildResult.learning_rate_used).toBeCloseTo(1.5, 2);
    });
  });

  // ==========================================================================
  // computeF1WeightedConfidence
  // ==========================================================================

  describe('computeF1WeightedConfidence', () => {
    it('should return unchanged confidence with insufficient samples', () => {
      const accuracy = makeAccuracy({
        rule_id: 'rule-f1-low',
        total_predictions: 2,
        f1_score: 0.9,
      });
      const result = computeF1WeightedConfidence(0.5, accuracy);

      expect(result.new_confidence).toBe(0.5);
      expect(result.learning_rate_used).toBe(0);
      expect(result.adjustment_reason).toContain('Insufficient samples');
    });

    it('should use F1 score as the target rather than raw accuracy', () => {
      const accuracy = makeAccuracy({
        rule_id: 'rule-f1',
        total_predictions: 50,
        accuracy: 0.9,
        f1_score: 0.6,
        precision: 0.7,
        recall: 0.52,
      });

      const result = computeF1WeightedConfidence(0.8, accuracy);

      // Should move toward F1 (0.6), not raw accuracy (0.9)
      // Since F1 < current confidence, new confidence should decrease
      expect(result.new_confidence).toBeLessThan(0.8);
      expect(result.accuracy_observed).toBe(0.6); // Reports F1 as the observed metric
      expect(result.adjustment_reason).toContain('F1-weighted');
      expect(result.adjustment_reason).toContain('F1=60%');
      expect(result.adjustment_reason).toContain('P=70%');
      expect(result.adjustment_reason).toContain('R=52%');
    });

    it('should clamp F1-weighted confidence within min/max bounds', () => {
      const lowF1 = makeAccuracy({
        rule_id: 'rule-f1-low-score',
        total_predictions: 50,
        f1_score: 0.0,
      });
      const result = computeF1WeightedConfidence(0.15, lowF1);
      expect(result.new_confidence).toBeGreaterThanOrEqual(DEFAULT_CALIBRATION_CONFIG.minConfidence);
    });
  });

  // ==========================================================================
  // calibrateAllRules
  // ==========================================================================

  describe('calibrateAllRules', () => {
    it('should return confidence updates only for rules that have accuracy data', () => {
      const rules = [
        { id: 'rule-a', confidence: 0.7 },
        { id: 'rule-b', confidence: 0.5 },
        { id: 'rule-c', confidence: 0.9 },
      ];

      const accuracyMap = new Map<string, PredictionAccuracy>();
      accuracyMap.set('rule-a', makeAccuracy({ rule_id: 'rule-a', accuracy: 0.85, total_predictions: 40 }));
      // rule-b has no accuracy data - should be skipped
      accuracyMap.set('rule-c', makeAccuracy({ rule_id: 'rule-c', accuracy: 0.5, total_predictions: 30 }));

      const updates = calibrateAllRules(rules, accuracyMap);

      expect(updates).toHaveLength(2);
      expect(updates.map(u => u.rule_id)).toEqual(['rule-a', 'rule-c']);

      // rule-a should see confidence increase (accuracy 0.85 > confidence 0.7)
      const ruleA = updates.find(u => u.rule_id === 'rule-a')!;
      expect(ruleA.new_confidence).toBeGreaterThan(ruleA.old_confidence);

      // rule-c should see confidence decrease (accuracy 0.5 < confidence 0.9)
      const ruleC = updates.find(u => u.rule_id === 'rule-c')!;
      expect(ruleC.new_confidence).toBeLessThan(ruleC.old_confidence);
    });

    it('should return an empty array when no rules have accuracy data', () => {
      const rules = [{ id: 'rule-x', confidence: 0.6 }];
      const emptyMap = new Map<string, PredictionAccuracy>();

      const updates = calibrateAllRules(rules, emptyMap);
      expect(updates).toEqual([]);
    });
  });

  // ==========================================================================
  // summarizeCalibration
  // ==========================================================================

  describe('summarizeCalibration', () => {
    it('should produce a markdown summary with correct counts and top performers / needs improvement', () => {
      const updates = [
        {
          rule_id: 'rule-up-1',
          old_confidence: 0.5,
          new_confidence: 0.65,
          accuracy_observed: 0.85,
          sample_size: 50,
          learning_rate_used: 0.1,
          adjustment_reason: 'Increased confidence',
        },
        {
          rule_id: 'rule-up-2',
          old_confidence: 0.6,
          new_confidence: 0.7,
          accuracy_observed: 0.9,
          sample_size: 40,
          learning_rate_used: 0.1,
          adjustment_reason: 'Increased confidence',
        },
        {
          rule_id: 'rule-down-1',
          old_confidence: 0.8,
          new_confidence: 0.65,
          accuracy_observed: 0.4,
          sample_size: 30,
          learning_rate_used: 0.1,
          adjustment_reason: 'Decreased confidence',
        },
        {
          // Unchanged rule
          rule_id: 'rule-same',
          old_confidence: 0.7,
          new_confidence: 0.7,
          accuracy_observed: 0.71,
          sample_size: 20,
          learning_rate_used: 0.1,
          adjustment_reason: 'Minor adjustment',
        },
        {
          // Insufficient data rule (sample_size < 5, unchanged)
          rule_id: 'rule-nodata',
          old_confidence: 0.5,
          new_confidence: 0.5,
          accuracy_observed: 0.0,
          sample_size: 3,
          learning_rate_used: 0,
          adjustment_reason: 'Insufficient samples',
        },
      ];

      const summary = summarizeCalibration(updates);

      // Header
      expect(summary).toContain('## Brain Calibration Summary');
      expect(summary).toContain('**5 rules evaluated**');

      // Counts
      expect(summary).toContain('2 rules increased confidence');
      expect(summary).toContain('1 rules decreased confidence');
      expect(summary).toContain('2 rules unchanged');
      expect(summary).toContain('1 rules with insufficient data');

      // Top Performers section includes at least the first increased rule
      expect(summary).toContain('### Top Performers:');
      expect(summary).toContain('rule-up-1');

      // Needs Improvement section includes the decreased rule
      expect(summary).toContain('### Needs Improvement:');
      expect(summary).toContain('rule-down-1');
    });

    it('should omit Top Performers and Needs Improvement sections when there are none', () => {
      const updates = [
        {
          rule_id: 'rule-stable',
          old_confidence: 0.7,
          new_confidence: 0.7,
          accuracy_observed: 0.7,
          sample_size: 50,
          learning_rate_used: 0.1,
          adjustment_reason: 'Minor adjustment',
        },
      ];

      const summary = summarizeCalibration(updates);

      expect(summary).toContain('**1 rules evaluated**');
      expect(summary).toContain('0 rules increased confidence');
      expect(summary).toContain('0 rules decreased confidence');
      expect(summary).not.toContain('### Top Performers:');
      expect(summary).not.toContain('### Needs Improvement:');
    });
  });
});
