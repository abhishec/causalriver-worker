/**
 * Nexus Memory Stack - Prediction Tracker Tests
 *
 * Tests for prediction recording, outcome tracking, matching,
 * grouping, filtering, and summary statistics.
 */

import { describe, it, expect } from 'vitest';
import {
  recordPrediction,
  recordOutcome,
  getPendingPredictions,
  matchPredictionsToOutcomes,
  groupPredictionsByType,
  filterByTimeWindow,
  getPredictionStats,
  type PredictionRecord,
  type OutcomeRecord,
  type MatchedPrediction,
} from '../learning/prediction-tracker';

// ============================================================================
// HELPERS
// ============================================================================

/** Build a PredictionRecord with sensible defaults and a deterministic id. */
function makePrediction(overrides: Partial<PredictionRecord> & { id: string }): PredictionRecord {
  return {
    organizationId: 'org-1',
    predictionType: 'churn',
    entityType: 'client',
    entityId: 'client-1',
    predictedProbability: 0.5,
    predictedAt: new Date('2025-01-15'),
    predictionWindowDays: 30,
    ...overrides,
  };
}

/** Build an OutcomeRecord with sensible defaults. */
function makeOutcome(overrides: Partial<OutcomeRecord> & { predictionId: string }): OutcomeRecord {
  return {
    outcomeOccurred: true,
    outcomeDate: new Date('2025-02-10'),
    recordedAt: new Date('2025-02-10'),
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Prediction Tracker', () => {
  // ==========================================================================
  // recordPrediction
  // ==========================================================================

  describe('recordPrediction', () => {
    it('should create a prediction record with a unique id and all provided fields', () => {
      const result = recordPrediction({
        organizationId: 'org-123',
        predictionType: 'churn',
        entityType: 'client',
        entityId: 'client-456',
        predictedProbability: 0.75,
        predictionWindowDays: 30,
        modelVersion: 'v2.1',
        confidenceLower: 0.6,
        confidenceUpper: 0.9,
        featureSnapshot: { revenue: 50000 },
      });

      expect(result.id).toMatch(/^pred_/);
      expect(result.organizationId).toBe('org-123');
      expect(result.predictionType).toBe('churn');
      expect(result.entityType).toBe('client');
      expect(result.entityId).toBe('client-456');
      expect(result.predictedProbability).toBe(0.75);
      expect(result.predictionWindowDays).toBe(30);
      expect(result.modelVersion).toBe('v2.1');
      expect(result.confidenceLower).toBe(0.6);
      expect(result.confidenceUpper).toBe(0.9);
      expect(result.featureSnapshot).toEqual({ revenue: 50000 });
      expect(result.predictedAt).toBeInstanceOf(Date);
    });

    it('should clamp predictedProbability above 1 down to 1', () => {
      const result = recordPrediction({
        organizationId: 'org-1',
        predictionType: 'churn',
        entityType: 'client',
        entityId: 'c-1',
        predictedProbability: 1.5,
        predictionWindowDays: 7,
      });

      expect(result.predictedProbability).toBe(1);
    });

    it('should clamp predictedProbability below 0 up to 0', () => {
      const result = recordPrediction({
        organizationId: 'org-1',
        predictionType: 'churn',
        entityType: 'client',
        entityId: 'c-1',
        predictedProbability: -0.3,
        predictionWindowDays: 7,
      });

      expect(result.predictedProbability).toBe(0);
    });
  });

  // ==========================================================================
  // recordOutcome
  // ==========================================================================

  describe('recordOutcome', () => {
    it('should create an outcome record with all provided fields', () => {
      const outcomeDate = new Date('2025-03-01');
      const result = recordOutcome('pred-abc', true, outcomeDate, { reason: 'contract ended' });

      expect(result.predictionId).toBe('pred-abc');
      expect(result.outcomeOccurred).toBe(true);
      expect(result.outcomeDate).toEqual(outcomeDate);
      expect(result.recordedAt).toBeInstanceOf(Date);
      expect(result.metadata).toEqual({ reason: 'contract ended' });
    });

    it('should default outcomeDate to now when not supplied', () => {
      const before = new Date();
      const result = recordOutcome('pred-xyz', false);
      const after = new Date();

      expect(result.outcomeDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.outcomeDate.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(result.outcomeOccurred).toBe(false);
      expect(result.metadata).toBeUndefined();
    });
  });

  // ==========================================================================
  // getPendingPredictions
  // ==========================================================================

  describe('getPendingPredictions', () => {
    it('should return predictions that have no matching outcome', () => {
      const predictions: PredictionRecord[] = [
        makePrediction({ id: 'p1' }),
        makePrediction({ id: 'p2' }),
        makePrediction({ id: 'p3' }),
      ];
      const outcomes: OutcomeRecord[] = [
        makeOutcome({ predictionId: 'p2' }),
      ];

      const pending = getPendingPredictions(predictions, outcomes, new Date('2025-01-20'));

      const pendingIds = pending.map(p => p.id);
      expect(pendingIds).toContain('p1');
      expect(pendingIds).toContain('p3');
      expect(pendingIds).not.toContain('p2');
    });

    it('should calculate daysRemaining and isExpired correctly', () => {
      const predictions: PredictionRecord[] = [
        // predictedAt = Jan 15, window = 30 days => expires Feb 14
        makePrediction({ id: 'p1', predictedAt: new Date('2025-01-15'), predictionWindowDays: 30 }),
      ];

      // Check when still within window (Jan 20 => 25 days remaining)
      const pendingActive = getPendingPredictions(predictions, [], new Date('2025-01-20'));
      expect(pendingActive).toHaveLength(1);
      expect(pendingActive[0].daysRemaining).toBe(25);
      expect(pendingActive[0].isExpired).toBe(false);

      // Check when past window (Mar 1 => expired)
      const pendingExpired = getPendingPredictions(predictions, [], new Date('2025-03-01'));
      expect(pendingExpired).toHaveLength(1);
      expect(pendingExpired[0].daysRemaining).toBe(0);
      expect(pendingExpired[0].isExpired).toBe(true);
    });

    it('should return an empty array when all predictions have outcomes', () => {
      const predictions: PredictionRecord[] = [
        makePrediction({ id: 'p1' }),
      ];
      const outcomes: OutcomeRecord[] = [
        makeOutcome({ predictionId: 'p1' }),
      ];

      const pending = getPendingPredictions(predictions, outcomes);
      expect(pending).toHaveLength(0);
    });

    it('should return an empty array when given no predictions', () => {
      const pending = getPendingPredictions([], []);
      expect(pending).toEqual([]);
    });
  });

  // ==========================================================================
  // matchPredictionsToOutcomes
  // ==========================================================================

  describe('matchPredictionsToOutcomes', () => {
    it('should pair predictions with their outcomes and compute error metrics', () => {
      const predictions: PredictionRecord[] = [
        makePrediction({ id: 'p1', predictedProbability: 0.8 }),
      ];
      const outcomes: OutcomeRecord[] = [
        makeOutcome({ predictionId: 'p1', outcomeOccurred: true }),
      ];

      const matched = matchPredictionsToOutcomes(predictions, outcomes);

      expect(matched).toHaveLength(1);
      expect(matched[0].prediction.id).toBe('p1');
      expect(matched[0].outcome.predictionId).toBe('p1');
      // actual=1, predicted=0.8 => absoluteError=0.2, squaredError=0.04
      expect(matched[0].absoluteError).toBeCloseTo(0.2);
      expect(matched[0].squaredError).toBeCloseTo(0.04);
    });

    it('should compute correct error when outcome did not occur', () => {
      const predictions: PredictionRecord[] = [
        makePrediction({ id: 'p1', predictedProbability: 0.7 }),
      ];
      const outcomes: OutcomeRecord[] = [
        makeOutcome({ predictionId: 'p1', outcomeOccurred: false }),
      ];

      const matched = matchPredictionsToOutcomes(predictions, outcomes);

      // actual=0, predicted=0.7 => absoluteError=0.7, squaredError=0.49
      expect(matched[0].absoluteError).toBeCloseTo(0.7);
      expect(matched[0].squaredError).toBeCloseTo(0.49);
    });

    it('should exclude predictions without a matching outcome', () => {
      const predictions: PredictionRecord[] = [
        makePrediction({ id: 'p1' }),
        makePrediction({ id: 'p2' }),
      ];
      const outcomes: OutcomeRecord[] = [
        makeOutcome({ predictionId: 'p1' }),
      ];

      const matched = matchPredictionsToOutcomes(predictions, outcomes);
      expect(matched).toHaveLength(1);
      expect(matched[0].prediction.id).toBe('p1');
    });

    it('should return an empty array when there are no matching pairs', () => {
      const predictions: PredictionRecord[] = [
        makePrediction({ id: 'p1' }),
      ];
      const outcomes: OutcomeRecord[] = [
        makeOutcome({ predictionId: 'p-other' }),
      ];

      const matched = matchPredictionsToOutcomes(predictions, outcomes);
      expect(matched).toEqual([]);
    });
  });

  // ==========================================================================
  // groupPredictionsByType
  // ==========================================================================

  describe('groupPredictionsByType', () => {
    it('should group matched predictions by their predictionType', () => {
      const matched: MatchedPrediction[] = [
        {
          prediction: makePrediction({ id: 'p1', predictionType: 'churn' }),
          outcome: makeOutcome({ predictionId: 'p1' }),
          absoluteError: 0.2,
          squaredError: 0.04,
        },
        {
          prediction: makePrediction({ id: 'p2', predictionType: 'conversion' }),
          outcome: makeOutcome({ predictionId: 'p2' }),
          absoluteError: 0.3,
          squaredError: 0.09,
        },
        {
          prediction: makePrediction({ id: 'p3', predictionType: 'churn' }),
          outcome: makeOutcome({ predictionId: 'p3' }),
          absoluteError: 0.1,
          squaredError: 0.01,
        },
      ];

      const groups = groupPredictionsByType(matched);

      expect(groups.size).toBe(2);
      expect(groups.get('churn')).toHaveLength(2);
      expect(groups.get('conversion')).toHaveLength(1);
    });

    it('should return an empty map for an empty array', () => {
      const groups = groupPredictionsByType([]);
      expect(groups.size).toBe(0);
    });
  });

  // ==========================================================================
  // filterByTimeWindow
  // ==========================================================================

  describe('filterByTimeWindow', () => {
    it('should include only predictions within the specified date range (inclusive)', () => {
      const predictions: PredictionRecord[] = [
        makePrediction({ id: 'p1', predictedAt: new Date('2025-01-10') }),
        makePrediction({ id: 'p2', predictedAt: new Date('2025-01-20') }),
        makePrediction({ id: 'p3', predictedAt: new Date('2025-02-05') }),
        makePrediction({ id: 'p4', predictedAt: new Date('2025-03-01') }),
      ];

      const result = filterByTimeWindow(
        predictions,
        new Date('2025-01-15'),
        new Date('2025-02-15'),
      );

      const ids = result.map(p => p.id);
      expect(ids).toEqual(['p2', 'p3']);
    });

    it('should return an empty array when no predictions fall within the window', () => {
      const predictions: PredictionRecord[] = [
        makePrediction({ id: 'p1', predictedAt: new Date('2025-06-01') }),
      ];

      const result = filterByTimeWindow(
        predictions,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result).toEqual([]);
    });

    it('should return an empty array when given no predictions', () => {
      const result = filterByTimeWindow([], new Date('2025-01-01'), new Date('2025-12-31'));
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // getPredictionStats
  // ==========================================================================

  describe('getPredictionStats', () => {
    it('should compute correct summary statistics', () => {
      const predictions: PredictionRecord[] = [
        makePrediction({ id: 'p1', predictedProbability: 0.8, predictedAt: new Date('2025-01-01'), predictionWindowDays: 10 }),
        makePrediction({ id: 'p2', predictedProbability: 0.4, predictedAt: new Date('2025-01-01'), predictionWindowDays: 10 }),
        makePrediction({ id: 'p3', predictedProbability: 0.6, predictedAt: new Date('2025-01-01'), predictionWindowDays: 90 }),
      ];
      const outcomes: OutcomeRecord[] = [
        makeOutcome({ predictionId: 'p1', outcomeOccurred: true }),
        makeOutcome({ predictionId: 'p2', outcomeOccurred: false }),
      ];

      const stats = getPredictionStats(predictions, outcomes);

      expect(stats.totalPredictions).toBe(3);
      expect(stats.withOutcomes).toBe(2);
      // p3 has no outcome; whether it is pending or expired depends on "now"
      // but pending + expired should sum to 1 (the unmatched count)
      expect(stats.pending + stats.expired).toBe(1);
      // avgProbability = (0.8 + 0.4 + 0.6) / 3 = 0.6
      expect(stats.avgProbability).toBeCloseTo(0.6);
      // 1 positive outcome out of 2 matched => outcomeRate = 0.5
      expect(stats.outcomeRate).toBeCloseTo(0.5);
    });

    it('should handle empty inputs gracefully', () => {
      const stats = getPredictionStats([], []);

      expect(stats.totalPredictions).toBe(0);
      expect(stats.withOutcomes).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.expired).toBe(0);
      expect(stats.avgProbability).toBe(0);
      expect(stats.outcomeRate).toBe(0);
    });
  });
});
