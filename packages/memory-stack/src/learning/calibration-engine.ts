/**
 * Calibration Engine
 * 
 * Computes calibration metrics to evaluate prediction quality:
 * - AUC-ROC: Discrimination ability
 * - ECE: Expected Calibration Error
 * - Brier Score: Mean squared probability error
 * - Calibration Curves: Visual reliability diagrams
 * 
 * @packageDocumentation
 */

import { MatchedPrediction } from './prediction-tracker';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A bucket in the calibration curve
 */
export interface CalibrationBucket {
  /** Bucket range (e.g., 0.0-0.1) */
  rangeStart: number;
  rangeEnd: number;
  /** Number of predictions in this bucket */
  count: number;
  /** Average predicted probability */
  avgPredicted: number;
  /** Actual outcome rate */
  actualRate: number;
  /** Calibration error for this bucket */
  calibrationError: number;
}

/**
 * Complete calibration analysis result
 */
export interface CalibrationResult {
  /** Area Under ROC Curve (0-1, higher is better) */
  aucRoc: number;
  /** Expected Calibration Error (0-1, lower is better) */
  ece: number;
  /** Brier Score (0-1, lower is better) */
  brierScore: number;
  /** Number of predictions analyzed */
  sampleSize: number;
  /** Calibration buckets for visualization */
  buckets: CalibrationBucket[];
  /** Base rate of positive outcomes */
  baseRate: number;
  /** 95% confidence interval for AUC */
  aucConfidenceInterval: [number, number];
}

/**
 * ROC curve point
 */
interface RocPoint {
  threshold: number;
  tpr: number; // True Positive Rate (Sensitivity)
  fpr: number; // False Positive Rate (1 - Specificity)
}

// ============================================================================
// AUC-ROC COMPUTATION
// ============================================================================

/**
 * Computes Area Under the ROC Curve using the trapezoidal rule
 * 
 * AUC measures discrimination: the probability that a randomly chosen
 * positive example is ranked higher than a randomly chosen negative example.
 * 
 * @param matched - Predictions matched with their outcomes
 * @returns AUC value between 0 and 1
 */
export function computeAUC(matched: MatchedPrediction[]): number {
  if (matched.length < 2) return 0.5;
  
  const positives = matched.filter(m => m.outcome.outcomeOccurred);
  const negatives = matched.filter(m => !m.outcome.outcomeOccurred);
  
  if (positives.length === 0 || negatives.length === 0) return 0.5;
  
  // Sort by predicted probability descending
  const sorted = [...matched].sort(
    (a, b) => b.prediction.predictedProbability - a.prediction.predictedProbability
  );
  
  // Compute ROC curve points
  const rocPoints: RocPoint[] = [];
  let tp = 0;
  let fp = 0;
  
  const totalPositives = positives.length;
  const totalNegatives = negatives.length;
  
  // Add origin point
  rocPoints.push({ threshold: 1.0, tpr: 0, fpr: 0 });
  
  for (const m of sorted) {
    if (m.outcome.outcomeOccurred) {
      tp++;
    } else {
      fp++;
    }
    
    rocPoints.push({
      threshold: m.prediction.predictedProbability,
      tpr: tp / totalPositives,
      fpr: fp / totalNegatives,
    });
  }
  
  // Compute AUC using trapezoidal rule
  let auc = 0;
  for (let i = 1; i < rocPoints.length; i++) {
    const width = rocPoints[i].fpr - rocPoints[i - 1].fpr;
    const avgHeight = (rocPoints[i].tpr + rocPoints[i - 1].tpr) / 2;
    auc += width * avgHeight;
  }
  
  return Math.max(0, Math.min(1, auc));
}

/**
 * Computes confidence interval for AUC using DeLong method approximation
 */
export function computeAUCConfidenceInterval(
  matched: MatchedPrediction[],
  confidenceLevel: number = 0.95
): [number, number] {
  const auc = computeAUC(matched);
  const positives = matched.filter(m => m.outcome.outcomeOccurred).length;
  const negatives = matched.filter(m => !m.outcome.outcomeOccurred).length;
  
  if (positives < 2 || negatives < 2) {
    return [0, 1];
  }
  
  // Hanley-McNeil approximation for standard error
  const q1 = auc / (2 - auc);
  const q2 = (2 * auc * auc) / (1 + auc);
  const se = Math.sqrt(
    (auc * (1 - auc) + (positives - 1) * (q1 - auc * auc) + (negatives - 1) * (q2 - auc * auc)) /
    (positives * negatives)
  );
  
  // Z-score for confidence level
  const zScore = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.99 ? 2.576 : 1.645;
  
  return [
    Math.max(0, auc - zScore * se),
    Math.min(1, auc + zScore * se),
  ];
}

// ============================================================================
// CALIBRATION CURVE
// ============================================================================

/**
 * Computes calibration curve by bucketing predictions
 * 
 * @param matched - Predictions matched with outcomes
 * @param numBuckets - Number of buckets (default 10 for deciles)
 */
export function computeCalibrationCurve(
  matched: MatchedPrediction[],
  numBuckets: number = 10
): CalibrationBucket[] {
  if (matched.length === 0) return [];
  
  const bucketSize = 1 / numBuckets;
  const buckets: CalibrationBucket[] = [];
  
  for (let i = 0; i < numBuckets; i++) {
    const rangeStart = i * bucketSize;
    const rangeEnd = (i + 1) * bucketSize;
    
    const inBucket = matched.filter(m => {
      const prob = m.prediction.predictedProbability;
      return prob >= rangeStart && (prob < rangeEnd || (i === numBuckets - 1 && prob <= rangeEnd));
    });
    
    if (inBucket.length === 0) {
      buckets.push({
        rangeStart,
        rangeEnd,
        count: 0,
        avgPredicted: (rangeStart + rangeEnd) / 2,
        actualRate: 0,
        calibrationError: 0,
      });
      continue;
    }
    
    const avgPredicted = inBucket.reduce((sum, m) => sum + m.prediction.predictedProbability, 0) / inBucket.length;
    const positiveCount = inBucket.filter(m => m.outcome.outcomeOccurred).length;
    const actualRate = positiveCount / inBucket.length;
    
    buckets.push({
      rangeStart,
      rangeEnd,
      count: inBucket.length,
      avgPredicted,
      actualRate,
      calibrationError: Math.abs(avgPredicted - actualRate),
    });
  }
  
  return buckets;
}

// ============================================================================
// EXPECTED CALIBRATION ERROR
// ============================================================================

/**
 * Computes Expected Calibration Error (ECE)
 * 
 * ECE is the weighted average of calibration errors across buckets,
 * weighted by the number of samples in each bucket.
 * 
 * Perfect calibration = 0, worst = 1
 */
export function computeECE(matched: MatchedPrediction[], numBuckets: number = 10): number {
  if (matched.length === 0) return 0;
  
  const buckets = computeCalibrationCurve(matched, numBuckets);
  const totalSamples = matched.length;
  
  let ece = 0;
  for (const bucket of buckets) {
    if (bucket.count > 0) {
      ece += (bucket.count / totalSamples) * bucket.calibrationError;
    }
  }
  
  return ece;
}

// ============================================================================
// BRIER SCORE
// ============================================================================

/**
 * Computes Brier Score - mean squared error of probability predictions
 * 
 * Brier = (1/n) * Σ(predicted - actual)²
 * 
 * Perfect predictions = 0, worst = 1
 */
export function computeBrierScore(matched: MatchedPrediction[]): number {
  if (matched.length === 0) return 0;
  
  const totalSquaredError = matched.reduce((sum, m) => sum + m.squaredError, 0);
  return totalSquaredError / matched.length;
}

/**
 * Decomposes Brier Score into reliability, resolution, and uncertainty
 * 
 * Brier = Reliability - Resolution + Uncertainty
 */
export function decomposeBrierScore(matched: MatchedPrediction[], numBuckets: number = 10): {
  brier: number;
  reliability: number;
  resolution: number;
  uncertainty: number;
} {
  if (matched.length === 0) {
    return { brier: 0, reliability: 0, resolution: 0, uncertainty: 0 };
  }
  
  const n = matched.length;
  const buckets = computeCalibrationCurve(matched, numBuckets);
  const baseRate = matched.filter(m => m.outcome.outcomeOccurred).length / n;
  
  // Uncertainty: base rate variance
  const uncertainty = baseRate * (1 - baseRate);
  
  // Reliability: weighted calibration error squared
  let reliability = 0;
  for (const bucket of buckets) {
    if (bucket.count > 0) {
      reliability += (bucket.count / n) * Math.pow(bucket.avgPredicted - bucket.actualRate, 2);
    }
  }
  
  // Resolution: how much predictions deviate from base rate
  let resolution = 0;
  for (const bucket of buckets) {
    if (bucket.count > 0) {
      resolution += (bucket.count / n) * Math.pow(bucket.actualRate - baseRate, 2);
    }
  }
  
  const brier = reliability - resolution + uncertainty;
  
  return { brier, reliability, resolution, uncertainty };
}

// ============================================================================
// CONFIDENCE INTERVALS
// ============================================================================

/**
 * Computes confidence interval for a metric using bootstrap
 */
export function getConfidenceInterval(
  matched: MatchedPrediction[],
  metric: 'auc' | 'ece' | 'brier',
  numBootstrap: number = 1000,
  confidenceLevel: number = 0.95
): [number, number] {
  if (matched.length < 10) {
    const value = metric === 'auc' 
      ? computeAUC(matched)
      : metric === 'ece'
        ? computeECE(matched)
        : computeBrierScore(matched);
    return [value, value];
  }
  
  const bootstrapValues: number[] = [];
  
  for (let i = 0; i < numBootstrap; i++) {
    // Sample with replacement
    const sample: MatchedPrediction[] = [];
    for (let j = 0; j < matched.length; j++) {
      const idx = Math.floor(Math.random() * matched.length);
      sample.push(matched[idx]);
    }
    
    const value = metric === 'auc'
      ? computeAUC(sample)
      : metric === 'ece'
        ? computeECE(sample)
        : computeBrierScore(sample);
    
    bootstrapValues.push(value);
  }
  
  bootstrapValues.sort((a, b) => a - b);
  
  const alpha = 1 - confidenceLevel;
  const lowerIdx = Math.floor((alpha / 2) * numBootstrap);
  const upperIdx = Math.floor((1 - alpha / 2) * numBootstrap);
  
  return [bootstrapValues[lowerIdx], bootstrapValues[upperIdx]];
}

// ============================================================================
// RELIABILITY DIAGRAM
// ============================================================================

/**
 * Generates data for a reliability diagram visualization
 */
export function generateReliabilityDiagram(matched: MatchedPrediction[], numBuckets: number = 10): {
  buckets: CalibrationBucket[];
  perfectLine: Array<{ x: number; y: number }>;
  ece: number;
  sampleSize: number;
} {
  const buckets = computeCalibrationCurve(matched, numBuckets);
  const ece = computeECE(matched, numBuckets);
  
  // Perfect calibration line
  const perfectLine = Array.from({ length: 11 }, (_, i) => ({
    x: i / 10,
    y: i / 10,
  }));
  
  return {
    buckets,
    perfectLine,
    ece,
    sampleSize: matched.length,
  };
}

// ============================================================================
// FULL CALIBRATION ANALYSIS
// ============================================================================

/**
 * Performs complete calibration analysis
 */
export function analyzeCalibration(
  matched: MatchedPrediction[],
  numBuckets: number = 10
): CalibrationResult {
  const auc = computeAUC(matched);
  const ece = computeECE(matched, numBuckets);
  const brier = computeBrierScore(matched);
  const buckets = computeCalibrationCurve(matched, numBuckets);
  const baseRate = matched.length > 0
    ? matched.filter(m => m.outcome.outcomeOccurred).length / matched.length
    : 0;
  const aucCI = computeAUCConfidenceInterval(matched);
  
  return {
    aucRoc: auc,
    ece,
    brierScore: brier,
    sampleSize: matched.length,
    buckets,
    baseRate,
    aucConfidenceInterval: aucCI,
  };
}

/**
 * Generates natural language interpretation of calibration results
 */
export function interpretCalibration(result: CalibrationResult): string {
  const parts: string[] = [];
  
  // AUC interpretation
  if (result.aucRoc >= 0.9) {
    parts.push(`Excellent discrimination (AUC ${result.aucRoc.toFixed(2)})`);
  } else if (result.aucRoc >= 0.8) {
    parts.push(`Good discrimination (AUC ${result.aucRoc.toFixed(2)})`);
  } else if (result.aucRoc >= 0.7) {
    parts.push(`Fair discrimination (AUC ${result.aucRoc.toFixed(2)})`);
  } else {
    parts.push(`Poor discrimination (AUC ${result.aucRoc.toFixed(2)})`);
  }
  
  // ECE interpretation
  if (result.ece <= 0.05) {
    parts.push('well-calibrated predictions');
  } else if (result.ece <= 0.1) {
    parts.push('reasonably calibrated');
  } else {
    parts.push(`miscalibrated by ${(result.ece * 100).toFixed(1)}%`);
  }
  
  // Sample size note
  if (result.sampleSize < 100) {
    parts.push(`(caution: small sample n=${result.sampleSize})`);
  }
  
  return parts.join(', ');
}
