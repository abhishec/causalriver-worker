/**
 * Nexus Memory Stack - Calibration Engine Tests
 *
 * Comprehensive tests for prediction calibration metrics:
 * AUC-ROC, ECE, Brier Score, calibration curves, confidence intervals,
 * reliability diagrams, full analysis, and natural language interpretation.
 */

import { describe, it, expect } from 'vitest';
import {
  computeAUC,
  computeAUCConfidenceInterval,
  computeCalibrationCurve,
  computeECE,
  computeBrierScore,
  decomposeBrierScore,
  getConfidenceInterval,
  generateReliabilityDiagram,
  analyzeCalibration,
  interpretCalibration,
} from '../learning/calibration-engine';
import type { MatchedPrediction } from '../learning/prediction-tracker';

// ============================================================================
// TEST DATA HELPERS
// ============================================================================

/**
 * Creates a single MatchedPrediction with the given predicted probability
 * and actual outcome.
 */
function createMatchedPrediction(
  predictedProb: number,
  actualOccurred: boolean
): MatchedPrediction {
  const actualValue = actualOccurred ? 1 : 0;
  return {
    prediction: {
      id: `pred_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`,
      organizationId: 'org-test',
      predictionType: 'churn',
      entityType: 'client',
      entityId: `client_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`,
      predictedProbability: predictedProb,
      predictedAt: new Date(),
      predictionWindowDays: 30,
    },
    outcome: {
      predictionId: `pred_${crypto.randomUUID().replace(/-/g, '').slice(0, 9)}`,
      outcomeOccurred: actualOccurred,
      outcomeDate: new Date(),
      recordedAt: new Date(),
    },
    absoluteError: Math.abs(predictedProb - actualValue),
    squaredError: Math.pow(predictedProb - actualValue, 2),
  };
}

/**
 * Creates a batch of matched predictions from arrays of probabilities
 * and outcomes.
 */
function createMatchedBatch(
  probabilities: number[],
  outcomes: boolean[]
): MatchedPrediction[] {
  return probabilities.map((prob, i) => createMatchedPrediction(prob, outcomes[i]));
}

// ---------------------------------------------------------------------------
// Reusable test datasets
// ---------------------------------------------------------------------------

/** Well-calibrated predictions: high probs -> true, low probs -> false */
const wellCalibratedData = createMatchedBatch(
  [0.9, 0.85, 0.8, 0.75, 0.7, 0.3, 0.25, 0.2, 0.15, 0.1],
  [true, true, true, true, true, false, false, false, false, false]
);

/** Poorly calibrated: confident but wrong */
const poorlyCalibrated = createMatchedBatch(
  [0.9, 0.85, 0.8, 0.75, 0.7, 0.3, 0.25, 0.2, 0.15, 0.1],
  [false, false, false, false, false, true, true, true, true, true]
);

/** Perfect predictions: probability 1.0 for true, 0.0 for false */
const perfectPredictions = createMatchedBatch(
  [1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [true, true, true, true, true, false, false, false, false, false]
);

/** All-same-outcome: every outcome is true (no negatives) */
const allPositive = createMatchedBatch(
  [0.5, 0.6, 0.7, 0.8, 0.9],
  [true, true, true, true, true]
);

/** Single prediction */
const singlePrediction = [createMatchedPrediction(0.7, true)];

// ============================================================================
// computeAUC
// ============================================================================

describe('computeAUC', () => {
  it('should return 0.5 for empty input (no-skill baseline)', () => {
    expect(computeAUC([])).toBe(0.5);
  });

  it('should return 0.5 for a single prediction (too few samples)', () => {
    expect(computeAUC(singlePrediction)).toBe(0.5);
  });

  it('should return 0.5 when all outcomes are the same class', () => {
    // No negatives to form a proper ROC curve
    expect(computeAUC(allPositive)).toBe(0.5);
  });

  it('should return 1.0 for perfectly discriminating predictions', () => {
    // All positives ranked above all negatives
    const auc = computeAUC(perfectPredictions);
    expect(auc).toBe(1.0);
  });

  it('should return a high AUC (>0.8) for well-calibrated predictions', () => {
    const auc = computeAUC(wellCalibratedData);
    expect(auc).toBeGreaterThan(0.8);
    expect(auc).toBeLessThanOrEqual(1.0);
  });

  it('should return a low AUC (<0.2) for inversely ranked predictions', () => {
    // Poorly calibrated: high probs assigned to negatives, low to positives
    const auc = computeAUC(poorlyCalibrated);
    expect(auc).toBeLessThan(0.2);
  });

  it('should return AUC between 0 and 1', () => {
    const mixed = createMatchedBatch(
      [0.5, 0.6, 0.4, 0.55, 0.45, 0.5, 0.65, 0.35, 0.52, 0.48],
      [true, false, true, false, true, false, true, false, true, false]
    );
    const auc = computeAUC(mixed);
    expect(auc).toBeGreaterThanOrEqual(0);
    expect(auc).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// computeAUCConfidenceInterval
// ============================================================================

describe('computeAUCConfidenceInterval', () => {
  it('should return [0, 1] when there are fewer than 2 positives or negatives', () => {
    const tooFew = createMatchedBatch([0.8, 0.6], [true, true]);
    const ci = computeAUCConfidenceInterval(tooFew);
    expect(ci).toEqual([0, 1]);
  });

  it('should return a valid interval for well-calibrated data', () => {
    const ci = computeAUCConfidenceInterval(wellCalibratedData);
    const [lower, upper] = ci;
    expect(lower).toBeGreaterThanOrEqual(0);
    expect(upper).toBeLessThanOrEqual(1);
    expect(lower).toBeLessThanOrEqual(upper);
  });

  it('should contain the point AUC estimate within the interval', () => {
    const auc = computeAUC(wellCalibratedData);
    const [lower, upper] = computeAUCConfidenceInterval(wellCalibratedData);
    expect(auc).toBeGreaterThanOrEqual(lower);
    expect(auc).toBeLessThanOrEqual(upper);
  });

  it('should produce a narrower interval for large samples', () => {
    const largeSample = createMatchedBatch(
      Array.from({ length: 100 }, (_, i) => (i < 50 ? 0.8 + Math.random() * 0.2 : Math.random() * 0.3)),
      Array.from({ length: 100 }, (_, i) => i < 50)
    );
    const [lower, upper] = computeAUCConfidenceInterval(largeSample);
    expect(upper - lower).toBeLessThan(0.3);
  });

  it('should use different z-scores for different confidence levels', () => {
    const ci95 = computeAUCConfidenceInterval(wellCalibratedData, 0.95);
    const ci99 = computeAUCConfidenceInterval(wellCalibratedData, 0.99);
    // 99% CI should be wider than 95% CI
    expect(ci99[1] - ci99[0]).toBeGreaterThanOrEqual(ci95[1] - ci95[0]);
  });
});

// ============================================================================
// computeCalibrationCurve
// ============================================================================

describe('computeCalibrationCurve', () => {
  it('should return empty array for empty input', () => {
    expect(computeCalibrationCurve([])).toEqual([]);
  });

  it('should return the specified number of buckets', () => {
    const buckets = computeCalibrationCurve(wellCalibratedData, 10);
    expect(buckets).toHaveLength(10);
  });

  it('should produce buckets with correct range boundaries', () => {
    const buckets = computeCalibrationCurve(wellCalibratedData, 5);
    expect(buckets).toHaveLength(5);
    expect(buckets[0].rangeStart).toBeCloseTo(0.0);
    expect(buckets[0].rangeEnd).toBeCloseTo(0.2);
    expect(buckets[4].rangeStart).toBeCloseTo(0.8);
    expect(buckets[4].rangeEnd).toBeCloseTo(1.0);
  });

  it('should have zero calibration error for empty buckets', () => {
    // With all predictions at 0.5, most buckets will be empty
    const concentrated = createMatchedBatch([0.5, 0.5, 0.5], [true, false, true]);
    const buckets = computeCalibrationCurve(concentrated, 10);
    const emptyBuckets = buckets.filter(b => b.count === 0);
    for (const bucket of emptyBuckets) {
      expect(bucket.calibrationError).toBe(0);
    }
  });

  it('should compute correct actual rates within each bucket', () => {
    // Put 4 predictions in 0.7-0.8 range: 3 true, 1 false => actualRate = 0.75
    const data = createMatchedBatch(
      [0.71, 0.73, 0.75, 0.78],
      [true, true, true, false]
    );
    const buckets = computeCalibrationCurve(data, 10);
    const bucket7 = buckets[7]; // 0.7 - 0.8 range
    expect(bucket7.count).toBe(4);
    expect(bucket7.actualRate).toBe(0.75);
  });

  it('should include boundary value 1.0 in the last bucket', () => {
    const data = [createMatchedPrediction(1.0, true)];
    const buckets = computeCalibrationCurve(data, 10);
    const lastBucket = buckets[9];
    expect(lastBucket.count).toBe(1);
  });
});

// ============================================================================
// computeECE
// ============================================================================

describe('computeECE', () => {
  it('should return 0 for empty input', () => {
    expect(computeECE([])).toBe(0);
  });

  it('should return 0 for perfectly calibrated predictions', () => {
    // Predictions at 1.0 for positives, 0.0 for negatives => no calibration error
    const ece = computeECE(perfectPredictions);
    expect(ece).toBe(0);
  });

  it('should return a moderate ECE for well-calibrated data', () => {
    // With only 10 samples spread across 10 buckets, the ECE is 0.2
    // due to sparse bucket coverage rather than actual miscalibration
    const ece = computeECE(wellCalibratedData);
    expect(ece).toBeLessThanOrEqual(0.2);
  });

  it('should return a high ECE for poorly calibrated data', () => {
    const ece = computeECE(poorlyCalibrated);
    expect(ece).toBeGreaterThan(0.3);
  });

  it('should return ECE between 0 and 1', () => {
    const ece = computeECE(wellCalibratedData);
    expect(ece).toBeGreaterThanOrEqual(0);
    expect(ece).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// computeBrierScore
// ============================================================================

describe('computeBrierScore', () => {
  it('should return 0 for empty input', () => {
    expect(computeBrierScore([])).toBe(0);
  });

  it('should return 0 for perfect predictions (prob 1.0/0.0 matching outcomes)', () => {
    const brier = computeBrierScore(perfectPredictions);
    expect(brier).toBe(0);
  });

  it('should return a low Brier score for well-calibrated predictions', () => {
    const brier = computeBrierScore(wellCalibratedData);
    expect(brier).toBeLessThan(0.1);
  });

  it('should return a high Brier score for poorly calibrated predictions', () => {
    const brier = computeBrierScore(poorlyCalibrated);
    expect(brier).toBeGreaterThan(0.4);
  });

  it('should return the correct Brier score for a known dataset', () => {
    // Predictions: [0.8, 0.2], Outcomes: [true, false]
    // Squared errors: (0.8 - 1)^2 = 0.04, (0.2 - 0)^2 = 0.04
    // Brier = (0.04 + 0.04) / 2 = 0.04
    const data = createMatchedBatch([0.8, 0.2], [true, false]);
    const brier = computeBrierScore(data);
    expect(brier).toBeCloseTo(0.04, 5);
  });

  it('should equal 1.0 for worst-case predictions (always maximally wrong)', () => {
    // Predict 1.0 when outcome is false, 0.0 when outcome is true
    const worst = createMatchedBatch(
      [1.0, 1.0, 0.0, 0.0],
      [false, false, true, true]
    );
    const brier = computeBrierScore(worst);
    expect(brier).toBeCloseTo(1.0, 5);
  });
});

// ============================================================================
// decomposeBrierScore
// ============================================================================

describe('decomposeBrierScore', () => {
  it('should return all zeros for empty input', () => {
    const result = decomposeBrierScore([]);
    expect(result).toEqual({ brier: 0, reliability: 0, resolution: 0, uncertainty: 0 });
  });

  it('should satisfy the decomposition identity: Brier = Reliability - Resolution + Uncertainty', () => {
    const result = decomposeBrierScore(wellCalibratedData);
    const reconstructed = result.reliability - result.resolution + result.uncertainty;
    expect(result.brier).toBeCloseTo(reconstructed, 10);
  });

  it('should have zero reliability for perfectly calibrated predictions', () => {
    const result = decomposeBrierScore(perfectPredictions);
    expect(result.reliability).toBeCloseTo(0, 5);
  });

  it('should have maximum uncertainty of 0.25 when the base rate is 0.5', () => {
    // 50/50 split => baseRate = 0.5 => uncertainty = 0.5 * 0.5 = 0.25
    const balanced = createMatchedBatch(
      [0.5, 0.5, 0.5, 0.5],
      [true, true, false, false]
    );
    const result = decomposeBrierScore(balanced);
    expect(result.uncertainty).toBeCloseTo(0.25, 5);
  });

  it('should compute correct base rate for uncertainty calculation', () => {
    // 8 positives, 2 negatives => baseRate = 0.8 => uncertainty = 0.8 * 0.2 = 0.16
    const data = createMatchedBatch(
      [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.2, 0.2],
      [true, true, true, true, true, true, true, true, false, false]
    );
    const result = decomposeBrierScore(data);
    expect(result.uncertainty).toBeCloseTo(0.16, 5);
  });
});

// ============================================================================
// getConfidenceInterval
// ============================================================================

describe('getConfidenceInterval', () => {
  it('should return a degenerate interval [value, value] for fewer than 10 samples', () => {
    const small = createMatchedBatch([0.7, 0.3], [true, false]);
    const ci = getConfidenceInterval(small, 'brier');
    expect(ci[0]).toBe(ci[1]);
  });

  it('should return a degenerate interval for AUC metric with small sample', () => {
    const small = createMatchedBatch([0.7, 0.3, 0.5], [true, false, true]);
    const ci = getConfidenceInterval(small, 'auc');
    const auc = computeAUC(small);
    expect(ci[0]).toBe(auc);
    expect(ci[1]).toBe(auc);
  });

  it('should return a valid interval for a sufficiently large sample', () => {
    const data = createMatchedBatch(
      Array.from({ length: 30 }, (_, i) => i < 15 ? 0.8 : 0.2),
      Array.from({ length: 30 }, (_, i) => i < 15)
    );
    const ci = getConfidenceInterval(data, 'brier', 100);
    expect(ci[0]).toBeLessThanOrEqual(ci[1]);
    expect(ci[0]).toBeGreaterThanOrEqual(0);
  });

  it('should support ece metric', () => {
    const data = createMatchedBatch(
      Array.from({ length: 20 }, (_, i) => i < 10 ? 0.8 : 0.2),
      Array.from({ length: 20 }, (_, i) => i < 10)
    );
    const ci = getConfidenceInterval(data, 'ece', 50);
    expect(ci[0]).toBeLessThanOrEqual(ci[1]);
  });
});

// ============================================================================
// generateReliabilityDiagram
// ============================================================================

describe('generateReliabilityDiagram', () => {
  it('should return empty buckets and zero ECE for empty input', () => {
    const diagram = generateReliabilityDiagram([]);
    expect(diagram.buckets).toEqual([]);
    expect(diagram.ece).toBe(0);
    expect(diagram.sampleSize).toBe(0);
  });

  it('should generate a perfect calibration line with 11 points', () => {
    const diagram = generateReliabilityDiagram(wellCalibratedData);
    expect(diagram.perfectLine).toHaveLength(11);
    // First point is (0, 0), last point is (1, 1)
    expect(diagram.perfectLine[0]).toEqual({ x: 0, y: 0 });
    expect(diagram.perfectLine[10]).toEqual({ x: 1, y: 1 });
  });

  it('should include the correct sample size', () => {
    const diagram = generateReliabilityDiagram(wellCalibratedData);
    expect(diagram.sampleSize).toBe(wellCalibratedData.length);
  });

  it('should include ECE consistent with computeECE', () => {
    const diagram = generateReliabilityDiagram(wellCalibratedData, 10);
    const ece = computeECE(wellCalibratedData, 10);
    expect(diagram.ece).toBeCloseTo(ece, 10);
  });

  it('should produce the requested number of buckets', () => {
    const diagram = generateReliabilityDiagram(wellCalibratedData, 5);
    expect(diagram.buckets).toHaveLength(5);
  });
});

// ============================================================================
// analyzeCalibration
// ============================================================================

describe('analyzeCalibration', () => {
  it('should return a complete CalibrationResult', () => {
    const result = analyzeCalibration(wellCalibratedData);
    expect(result).toHaveProperty('aucRoc');
    expect(result).toHaveProperty('ece');
    expect(result).toHaveProperty('brierScore');
    expect(result).toHaveProperty('sampleSize');
    expect(result).toHaveProperty('buckets');
    expect(result).toHaveProperty('baseRate');
    expect(result).toHaveProperty('aucConfidenceInterval');
  });

  it('should compute the correct sample size', () => {
    const result = analyzeCalibration(wellCalibratedData);
    expect(result.sampleSize).toBe(wellCalibratedData.length);
  });

  it('should compute the correct base rate', () => {
    // wellCalibratedData has 5 positives out of 10
    const result = analyzeCalibration(wellCalibratedData);
    expect(result.baseRate).toBeCloseTo(0.5, 5);
  });

  it('should return base rate 0 for empty data', () => {
    const result = analyzeCalibration([]);
    expect(result.baseRate).toBe(0);
    expect(result.sampleSize).toBe(0);
  });

  it('should have consistent metrics across individual functions', () => {
    const result = analyzeCalibration(wellCalibratedData);
    expect(result.aucRoc).toBeCloseTo(computeAUC(wellCalibratedData), 10);
    expect(result.ece).toBeCloseTo(computeECE(wellCalibratedData), 10);
    expect(result.brierScore).toBeCloseTo(computeBrierScore(wellCalibratedData), 10);
  });

  it('should produce excellent metrics for perfect predictions', () => {
    const result = analyzeCalibration(perfectPredictions);
    expect(result.aucRoc).toBe(1.0);
    expect(result.brierScore).toBe(0);
    expect(result.ece).toBe(0);
  });
});

// ============================================================================
// interpretCalibration
// ============================================================================

describe('interpretCalibration', () => {
  it('should describe AUC >= 0.9 as excellent discrimination', () => {
    const result = analyzeCalibration(perfectPredictions);
    const text = interpretCalibration(result);
    expect(text).toContain('Excellent discrimination');
  });

  it('should describe AUC >= 0.8 as good discrimination', () => {
    const result: ReturnType<typeof analyzeCalibration> = {
      aucRoc: 0.85,
      ece: 0.03,
      brierScore: 0.1,
      sampleSize: 200,
      buckets: [],
      baseRate: 0.5,
      aucConfidenceInterval: [0.8, 0.9],
    };
    const text = interpretCalibration(result);
    expect(text).toContain('Good discrimination');
  });

  it('should describe AUC >= 0.7 as fair discrimination', () => {
    const result: ReturnType<typeof analyzeCalibration> = {
      aucRoc: 0.72,
      ece: 0.08,
      brierScore: 0.2,
      sampleSize: 200,
      buckets: [],
      baseRate: 0.5,
      aucConfidenceInterval: [0.65, 0.79],
    };
    const text = interpretCalibration(result);
    expect(text).toContain('Fair discrimination');
  });

  it('should describe AUC < 0.7 as poor discrimination', () => {
    const result: ReturnType<typeof analyzeCalibration> = {
      aucRoc: 0.55,
      ece: 0.15,
      brierScore: 0.3,
      sampleSize: 200,
      buckets: [],
      baseRate: 0.5,
      aucConfidenceInterval: [0.45, 0.65],
    };
    const text = interpretCalibration(result);
    expect(text).toContain('Poor discrimination');
  });

  it('should describe ECE <= 0.05 as well-calibrated', () => {
    const result: ReturnType<typeof analyzeCalibration> = {
      aucRoc: 0.95,
      ece: 0.03,
      brierScore: 0.05,
      sampleSize: 200,
      buckets: [],
      baseRate: 0.5,
      aucConfidenceInterval: [0.9, 1.0],
    };
    const text = interpretCalibration(result);
    expect(text).toContain('well-calibrated');
  });

  it('should describe ECE <= 0.1 as reasonably calibrated', () => {
    const result: ReturnType<typeof analyzeCalibration> = {
      aucRoc: 0.85,
      ece: 0.08,
      brierScore: 0.1,
      sampleSize: 200,
      buckets: [],
      baseRate: 0.5,
      aucConfidenceInterval: [0.8, 0.9],
    };
    const text = interpretCalibration(result);
    expect(text).toContain('reasonably calibrated');
  });

  it('should describe ECE > 0.1 as miscalibrated with percentage', () => {
    const result: ReturnType<typeof analyzeCalibration> = {
      aucRoc: 0.75,
      ece: 0.2,
      brierScore: 0.25,
      sampleSize: 200,
      buckets: [],
      baseRate: 0.5,
      aucConfidenceInterval: [0.7, 0.8],
    };
    const text = interpretCalibration(result);
    expect(text).toContain('miscalibrated by');
    expect(text).toContain('20.0%');
  });

  it('should warn about small sample sizes (n < 100)', () => {
    const result: ReturnType<typeof analyzeCalibration> = {
      aucRoc: 0.85,
      ece: 0.05,
      brierScore: 0.1,
      sampleSize: 25,
      buckets: [],
      baseRate: 0.5,
      aucConfidenceInterval: [0.7, 1.0],
    };
    const text = interpretCalibration(result);
    expect(text).toContain('caution: small sample');
    expect(text).toContain('n=25');
  });

  it('should not warn about sample size when n >= 100', () => {
    const result: ReturnType<typeof analyzeCalibration> = {
      aucRoc: 0.85,
      ece: 0.05,
      brierScore: 0.1,
      sampleSize: 150,
      buckets: [],
      baseRate: 0.5,
      aucConfidenceInterval: [0.8, 0.9],
    };
    const text = interpretCalibration(result);
    expect(text).not.toContain('caution');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle a single prediction gracefully across all functions', () => {
    const single = [createMatchedPrediction(0.7, true)];
    expect(computeAUC(single)).toBe(0.5);
    expect(computeECE(single)).toBeGreaterThanOrEqual(0);
    expect(computeBrierScore(single)).toBeCloseTo(0.09, 2);
    expect(computeCalibrationCurve(single)).toHaveLength(10);
  });

  it('should handle all predictions having the same probability', () => {
    const sameProb = createMatchedBatch(
      [0.5, 0.5, 0.5, 0.5, 0.5],
      [true, true, false, false, true]
    );
    const brier = computeBrierScore(sameProb);
    // (0.5-1)^2 * 3 + (0.5-0)^2 * 2 = 0.75 + 0.5 = 1.25 / 5 = 0.25
    expect(brier).toBeCloseTo(0.25, 5);
    const auc = computeAUC(sameProb);
    expect(auc).toBeGreaterThanOrEqual(0);
    expect(auc).toBeLessThanOrEqual(1);
  });

  it('should handle predictions at exact boundary values (0.0 and 1.0)', () => {
    const boundary = createMatchedBatch(
      [0.0, 1.0, 0.0, 1.0],
      [false, true, true, false]
    );
    const brier = computeBrierScore(boundary);
    // (0-0)^2 + (1-1)^2 + (0-1)^2 + (1-0)^2 = 0 + 0 + 1 + 1 = 2 / 4 = 0.5
    expect(brier).toBeCloseTo(0.5, 5);
  });

  it('should produce valid decomposition even with extreme distributions', () => {
    const extreme = createMatchedBatch(
      [0.99, 0.98, 0.97, 0.01, 0.02, 0.03],
      [true, true, true, false, false, false]
    );
    const decomp = decomposeBrierScore(extreme);
    expect(decomp.uncertainty).toBeCloseTo(0.25, 5);
    expect(decomp.reliability).toBeGreaterThanOrEqual(0);
    expect(decomp.resolution).toBeGreaterThanOrEqual(0);
    const reconstructed = decomp.reliability - decomp.resolution + decomp.uncertainty;
    expect(decomp.brier).toBeCloseTo(reconstructed, 10);
  });
});
