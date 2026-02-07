/**
 * Nexus Memory Stack - Anomaly Detector Module Tests
 *
 * Comprehensive tests for statistical anomaly detection including
 * z-score, IQR, and MAD methods, unified detection, explanation
 * generation, entity-level detection, and summary utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  computeStatistics,
  zScoreDetection,
  iqrDetection,
  madDetection,
  detectAnomalies,
  explainAnomaly,
  detectEntityAnomalies,
  summarizeAnomalies,
} from '../learning/anomaly-detector';

// ============================================================================
// COMPUTE STATISTICS
// ============================================================================

describe('computeStatistics', () => {
  it('should return all zeros for an empty array', () => {
    const stats = computeStatistics([]);
    expect(stats.mean).toBe(0);
    expect(stats.median).toBe(0);
    expect(stats.std).toBe(0);
    expect(stats.mad).toBe(0);
    expect(stats.q1).toBe(0);
    expect(stats.q3).toBe(0);
    expect(stats.iqr).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.count).toBe(0);
  });

  it('should compute correct statistics for a single value', () => {
    const stats = computeStatistics([42]);
    expect(stats.mean).toBe(42);
    expect(stats.median).toBe(42);
    expect(stats.std).toBe(0);
    expect(stats.mad).toBe(0);
    expect(stats.min).toBe(42);
    expect(stats.max).toBe(42);
    expect(stats.count).toBe(1);
  });

  it('should compute correct mean for a known dataset', () => {
    const stats = computeStatistics([2, 4, 6, 8, 10]);
    expect(stats.mean).toBeCloseTo(6, 10);
  });

  it('should compute correct median for an odd-length dataset', () => {
    const stats = computeStatistics([3, 1, 4, 1, 5]);
    // sorted: [1, 1, 3, 4, 5] => median = 3
    expect(stats.median).toBe(3);
  });

  it('should compute correct median for an even-length dataset', () => {
    const stats = computeStatistics([1, 2, 3, 4]);
    // sorted: [1, 2, 3, 4] => median = (2+3)/2 = 2.5
    expect(stats.median).toBe(2.5);
  });

  it('should compute correct standard deviation (population)', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] => mean=5, variance=4, std=2
    const stats = computeStatistics([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats.mean).toBe(5);
    expect(stats.std).toBeCloseTo(2, 5);
  });

  it('should compute correct quartiles and IQR', () => {
    // 12 values: [1,2,3,4,5,6,7,8,9,10,11,12]
    const stats = computeStatistics([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // q1 = sorted[floor(12*0.25)] = sorted[3] = 4
    expect(stats.q1).toBe(4);
    // q3 = sorted[floor(12*0.75)] = sorted[9] = 10
    expect(stats.q3).toBe(10);
    expect(stats.iqr).toBe(6);
  });

  it('should compute min and max correctly', () => {
    const stats = computeStatistics([5, -3, 12, 0, 7]);
    expect(stats.min).toBe(-3);
    expect(stats.max).toBe(12);
  });

  it('should return zero std and mad for constant values', () => {
    const stats = computeStatistics([7, 7, 7, 7, 7]);
    expect(stats.std).toBe(0);
    expect(stats.mad).toBe(0);
    expect(stats.iqr).toBe(0);
  });
});

// ============================================================================
// Z-SCORE DETECTION
// ============================================================================

describe('zScoreDetection', () => {
  const normalData = [1, 2, 3, 2, 1, 3, 2, 1, 3, 2];
  const stats = computeStatistics(normalData);

  it('should not flag a value within the normal range', () => {
    const result = zScoreDetection(2, stats);
    expect(result.isAnomaly).toBe(false);
    expect(result.severity).toBe('low');
  });

  it('should flag a value far from the mean as anomaly', () => {
    // stats: mean=2, std~0.77; value=100 => z ~127 >> 3
    const result = zScoreDetection(100, stats);
    expect(result.isAnomaly).toBe(true);
    expect(Math.abs(result.zScore)).toBeGreaterThan(3);
  });

  it('should return isAnomaly=false when std is 0', () => {
    const constantStats = computeStatistics([5, 5, 5, 5]);
    const result = zScoreDetection(5, constantStats);
    expect(result.isAnomaly).toBe(false);
    expect(result.zScore).toBe(0);
    expect(result.severity).toBe('low');
  });

  it('should assign medium severity just above threshold', () => {
    // threshold=3 by default, medium is for absZ > threshold but <= threshold*1.5
    const mockStats = computeStatistics([0, 0, 0, 0, 0, 0, 0, 0, 10, 10]);
    // Use a custom value that yields absZ slightly > 3
    const result = zScoreDetection(mockStats.mean + mockStats.std * 3.2, mockStats, 3);
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe('medium');
  });

  it('should assign critical severity for extreme values', () => {
    // threshold=3, critical is absZ > threshold*2 = 6
    const result = zScoreDetection(stats.mean + stats.std * 7, stats, 3);
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe('critical');
  });

  it('should respect a custom threshold', () => {
    // With threshold=1, more values become anomalies
    const result = zScoreDetection(stats.mean + stats.std * 1.5, stats, 1);
    expect(result.isAnomaly).toBe(true);
  });
});

// ============================================================================
// IQR DETECTION
// ============================================================================

describe('iqrDetection', () => {
  // Dataset with a clear outlier
  const data = [1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 1, 3];
  const stats = computeStatistics(data);

  it('should not flag values within the IQR bounds', () => {
    const result = iqrDetection(2, stats);
    expect(result.isAnomaly).toBe(false);
  });

  it('should flag a value far above Q3 + k*IQR', () => {
    const result = iqrDetection(100, stats);
    expect(result.isAnomaly).toBe(true);
  });

  it('should flag a value far below Q1 - k*IQR', () => {
    const result = iqrDetection(-100, stats);
    expect(result.isAnomaly).toBe(true);
  });

  it('should return isAnomaly=false when IQR is 0', () => {
    const constantStats = computeStatistics([5, 5, 5, 5]);
    const result = iqrDetection(5, constantStats);
    expect(result.isAnomaly).toBe(false);
    expect(result.zScore).toBe(0);
    expect(result.severity).toBe('low');
  });

  it('should assign higher severity for more extreme outliers', () => {
    // Create a dataset with known spread
    const spreadData = Array.from({ length: 100 }, (_, i) => i);
    const spreadStats = computeStatistics(spreadData);
    const mildResult = iqrDetection(spreadStats.q3 + 2 * spreadStats.iqr, spreadStats);
    const extremeResult = iqrDetection(spreadStats.q3 + 10 * spreadStats.iqr, spreadStats);
    const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    expect(severityOrder[extremeResult.severity]).toBeGreaterThanOrEqual(severityOrder[mildResult.severity]);
  });
});

// ============================================================================
// MAD DETECTION
// ============================================================================

describe('madDetection', () => {
  const data = [1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 1];
  const stats = computeStatistics(data);

  it('should not flag a value near the median', () => {
    const result = madDetection(2, stats);
    expect(result.isAnomaly).toBe(false);
  });

  it('should flag a value far from the median as anomaly', () => {
    const result = madDetection(100, stats);
    expect(result.isAnomaly).toBe(true);
    expect(Math.abs(result.zScore)).toBeGreaterThan(3);
  });

  it('should return isAnomaly=false when MAD is 0', () => {
    const constantStats = computeStatistics([5, 5, 5, 5]);
    const result = madDetection(5, constantStats);
    expect(result.isAnomaly).toBe(false);
    expect(result.zScore).toBe(0);
    expect(result.severity).toBe('low');
  });

  it('should assign critical severity for extreme values (absZ > multiplier*2)', () => {
    // multiplier=3 default, critical requires absZ > 6
    // modifiedZ = 0.6745 * (value - median) / mad
    // We need |modifiedZ| > 6 => value very far from median
    const result = madDetection(1000, stats);
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe('critical');
  });

  it('should respect a custom multiplier', () => {
    // Very low multiplier makes more values anomalous
    const result = madDetection(stats.median + stats.mad * 2, stats, 0.5);
    expect(result.isAnomaly).toBe(true);
  });
});

// ============================================================================
// DETECT ANOMALIES (UNIFIED)
// ============================================================================

describe('detectAnomalies', () => {
  // Helper: create observations for a single metric with a clear outlier
  function makeObservations(values: number[], metricName = 'revenue') {
    return values.map((value, i) => ({
      entityId: `entity_${i}`,
      entityType: 'client',
      metricName,
      value,
    }));
  }

  it('should skip metrics with fewer observations than minSampleSize', () => {
    const obs = makeObservations([1, 2, 3]); // only 3 values, default minSampleSize=10
    const result = detectAnomalies(obs);
    expect(result).toHaveLength(0);
  });

  it('should detect an obvious outlier in a dataset of 10+ values', () => {
    const values = [1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 100];
    const obs = makeObservations(values);
    const result = detectAnomalies(obs, { method: 'zscore', minSampleSize: 5 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    const outlier = result.find(a => a.observedValue === 100);
    expect(outlier).toBeDefined();
  });

  it('should detect anomalies with the IQR method', () => {
    const values = [1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 1, 50];
    const obs = makeObservations(values);
    const result = detectAnomalies(obs, { method: 'iqr', minSampleSize: 5 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].detectionMethod).toBe('iqr');
  });

  it('should detect anomalies with the MAD method', () => {
    const values = [1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 1, 50];
    const obs = makeObservations(values);
    const result = detectAnomalies(obs, { method: 'mad', minSampleSize: 5 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].detectionMethod).toBe('mad');
  });

  it('should auto-select a method when config.method is auto', () => {
    const values = [1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 1, 100];
    const obs = makeObservations(values);
    const result = detectAnomalies(obs, { method: 'auto', minSampleSize: 5 });
    // auto should pick either 'mad' or 'zscore' depending on skewness/sample size
    if (result.length > 0) {
      expect(['mad', 'zscore']).toContain(result[0].detectionMethod);
    }
  });

  it('should return no anomalies for a uniform dataset', () => {
    const values = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    const obs = makeObservations(values);
    const result = detectAnomalies(obs, { method: 'zscore', minSampleSize: 5 });
    expect(result).toHaveLength(0);
  });

  it('should sort results by severity then by absolute z-score', () => {
    // Two metrics: one with mild outlier, one with extreme outlier
    const obs = [
      ...makeObservations([1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 1, 50], 'metric_a'),
      ...makeObservations([1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 1, 500], 'metric_b'),
    ];
    const result = detectAnomalies(obs, { method: 'zscore', minSampleSize: 5 });
    if (result.length >= 2) {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 0; i < result.length - 1; i++) {
        const sevDiff = severityOrder[result[i].severity] - severityOrder[result[i + 1].severity];
        if (sevDiff === 0) {
          expect(Math.abs(result[i].zScore)).toBeGreaterThanOrEqual(Math.abs(result[i + 1].zScore));
        } else {
          expect(sevDiff).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('should populate all fields in the returned AnomalyEvent', () => {
    const values = [1, 2, 3, 2, 1, 3, 2, 1, 3, 2, 1, 100];
    const obs = makeObservations(values);
    const result = detectAnomalies(obs, { method: 'zscore', minSampleSize: 5 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    const event = result[0];
    expect(event.entityType).toBe('client');
    expect(event.entityId).toBeDefined();
    expect(event.metricName).toBe('revenue');
    expect(typeof event.observedValue).toBe('number');
    expect(typeof event.expectedValue).toBe('number');
    expect(typeof event.zScore).toBe('number');
    expect(typeof event.explanation).toBe('string');
    expect(event.explanation.length).toBeGreaterThan(0);
    expect(['low', 'medium', 'high', 'critical']).toContain(event.severity);
    expect(event.detectedAt).toBeInstanceOf(Date);
    expect(typeof event.percentile).toBe('number');
  });
});

// ============================================================================
// EXPLAIN ANOMALY
// ============================================================================

describe('explainAnomaly', () => {
  const stats = computeStatistics([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  it('should mention standard deviations for zscore method', () => {
    const explanation = explainAnomaly(100, stats, 10, 'zscore');
    expect(explanation).toContain('standard deviations');
    expect(explanation).toContain('above');
  });

  it('should mention MADs for mad method', () => {
    const explanation = explainAnomaly(100, stats, 10, 'mad');
    expect(explanation).toContain('MADs');
  });

  it('should mention IQR bounds for iqr method', () => {
    const explanation = explainAnomaly(100, stats, 10, 'iqr');
    expect(explanation).toContain('IQR bounds');
  });

  it('should indicate "below" for values below the mean', () => {
    const explanation = explainAnomaly(-100, stats, -10, 'zscore');
    expect(explanation).toContain('below');
  });

  it('should include "extreme outlier" context for very high z-scores', () => {
    const explanation = explainAnomaly(1000, stats, 5, 'zscore');
    expect(explanation).toContain('extreme outlier');
  });

  it('should include "significant outlier" context for moderate z-scores', () => {
    const explanation = explainAnomaly(50, stats, 3.5, 'zscore');
    expect(explanation).toContain('significant outlier');
  });

  it('should always include the normal range in the explanation', () => {
    const explanation = explainAnomaly(100, stats, 10, 'zscore');
    expect(explanation).toContain('Normal range:');
  });
});

// ============================================================================
// DETECT ENTITY ANOMALIES
// ============================================================================

describe('detectEntityAnomalies', () => {
  it('should detect anomalous metrics for a specific entity', () => {
    const historicalData = Array.from({ length: 15 }, () => ({
      revenue: 100 + Math.random() * 10,
      orders: 50 + Math.random() * 5,
    }));
    // Current metrics with an extreme revenue value
    const currentMetrics = { revenue: 500, orders: 52 };
    const result = detectEntityAnomalies(
      'client_1',
      'client',
      currentMetrics,
      historicalData,
      { method: 'zscore', minSampleSize: 5 },
    );
    // Should flag revenue=500 but probably not orders=52
    const revenueAnomaly = result.find(a => a.metricName === 'revenue');
    expect(revenueAnomaly).toBeDefined();
    expect(revenueAnomaly!.entityId).toBe('client_1');
  });

  it('should return only anomalies for the specified entity, not historical entries', () => {
    const historicalData = Array.from({ length: 15 }, () => ({
      metric_a: 10 + Math.random(),
    }));
    const currentMetrics = { metric_a: 1000 };
    const result = detectEntityAnomalies(
      'entity_x',
      'widget',
      currentMetrics,
      historicalData,
      { method: 'zscore', minSampleSize: 5 },
    );
    for (const anomaly of result) {
      expect(anomaly.entityId).toBe('entity_x');
    }
  });

  it('should return empty array when current metrics are within normal range', () => {
    const historicalData = Array.from({ length: 15 }, () => ({
      metric_a: 50,
    }));
    const currentMetrics = { metric_a: 50 };
    const result = detectEntityAnomalies(
      'entity_y',
      'device',
      currentMetrics,
      historicalData,
      { method: 'zscore', minSampleSize: 5 },
    );
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// SUMMARIZE ANOMALIES
// ============================================================================

describe('summarizeAnomalies', () => {
  it('should return correct totals for an empty list', () => {
    const summary = summarizeAnomalies([]);
    expect(summary.total).toBe(0);
    expect(summary.bySeverity.critical).toBe(0);
    expect(summary.bySeverity.high).toBe(0);
    expect(summary.bySeverity.medium).toBe(0);
    expect(summary.bySeverity.low).toBe(0);
    expect(Object.keys(summary.byMetric)).toHaveLength(0);
    expect(summary.topAnomalies).toHaveLength(0);
  });

  it('should correctly count anomalies by severity and metric', () => {
    const anomalies = [
      makeMockAnomaly('revenue', 'critical'),
      makeMockAnomaly('revenue', 'high'),
      makeMockAnomaly('orders', 'medium'),
      makeMockAnomaly('orders', 'medium'),
      makeMockAnomaly('churn', 'low'),
    ];
    const summary = summarizeAnomalies(anomalies);
    expect(summary.total).toBe(5);
    expect(summary.bySeverity.critical).toBe(1);
    expect(summary.bySeverity.high).toBe(1);
    expect(summary.bySeverity.medium).toBe(2);
    expect(summary.bySeverity.low).toBe(1);
    expect(summary.byMetric['revenue']).toBe(2);
    expect(summary.byMetric['orders']).toBe(2);
    expect(summary.byMetric['churn']).toBe(1);
  });

  it('should return at most 5 topAnomalies', () => {
    const anomalies = Array.from({ length: 10 }, (_, i) =>
      makeMockAnomaly(`metric_${i}`, 'medium'),
    );
    const summary = summarizeAnomalies(anomalies);
    expect(summary.topAnomalies).toHaveLength(5);
  });

  it('should preserve original anomaly order in topAnomalies', () => {
    const anomalies = [
      makeMockAnomaly('a', 'critical'),
      makeMockAnomaly('b', 'high'),
      makeMockAnomaly('c', 'medium'),
    ];
    const summary = summarizeAnomalies(anomalies);
    expect(summary.topAnomalies[0].metricName).toBe('a');
    expect(summary.topAnomalies[1].metricName).toBe('b');
    expect(summary.topAnomalies[2].metricName).toBe('c');
  });
});

// ============================================================================
// HELPERS
// ============================================================================

function makeMockAnomaly(
  metricName: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
): {
  entityType: string;
  entityId: string;
  metricName: string;
  observedValue: number;
  expectedValue: number;
  zScore: number;
  detectionMethod: 'zscore';
  explanation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  percentile: number;
} {
  return {
    entityType: 'client',
    entityId: 'e_1',
    metricName,
    observedValue: 999,
    expectedValue: 10,
    zScore: 5,
    detectionMethod: 'zscore',
    explanation: 'test anomaly',
    severity,
    detectedAt: new Date(),
    percentile: 99,
  };
}
