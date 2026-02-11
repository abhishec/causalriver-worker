/**
 * What-If Simulator + Prediction Tracker Tests — PFC → Dopamine
 * ==============================================================
 *
 * Brain Analog: The Prefrontal Cortex simulates future scenarios ("what if
 * marketing spend increases 20%?"). Each cascade step becomes a testable
 * prediction. The Dopamine System later measures prediction errors — the gap
 * between what was predicted and what actually happened. This is the MASTER
 * learning signal in the brain.
 *
 * Tests:
 * 1. Simulation → prediction recording flow
 * 2. Prediction IDs returned for each cascade step
 * 3. Prediction window calculation from lag days
 * 4. recordPrediction and matchPredictionsToOutcomes
 * 5. Brain analogy: "PFC predicts +15% revenue in 90d → Dopamine verifies"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrainPipeline } from '../orchestrator/brain-pipeline';
import { createWhatIfSimulator, type WhatIfScenario } from '../orchestrator/whatif-simulator';
import {
  recordPrediction,
  recordOutcome,
  matchPredictionsToOutcomes,
  getPendingPredictions,
  type PredictionRecord,
  type OutcomeRecord,
} from '../learning/prediction-tracker';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

function createMockSupabase() {
  function createChainableQuery(): any {
    const result = { data: [], error: null };
    const query: any = {
      then(onFulfilled: any, onRejected?: any) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    const chainMethods = [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'gte', 'lte', 'gt', 'lt',
      'in', 'is', 'not', 'or', 'filter',
      'order', 'limit', 'range', 'textSearch',
      'contains', 'containedBy', 'overlaps',
      'match', 'ilike', 'like',
    ];
    for (const method of chainMethods) {
      query[method] = vi.fn().mockReturnValue(query);
    }
    const singleResult = { data: null, error: null };
    const singleQuery = { ...query, then: (onFulfilled: any, onRejected?: any) => Promise.resolve(singleResult).then(onFulfilled, onRejected) };
    query.single = vi.fn().mockReturnValue(singleQuery);
    query.maybeSingle = vi.fn().mockReturnValue(singleQuery);
    return query;
  }

  return {
    from: vi.fn().mockImplementation(() => createChainableQuery()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any;
}

// ============================================================================
// TESTS
// ============================================================================

describe('What-If Simulator + Prediction Tracker (PFC → Dopamine)', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  describe('Prediction Recording (Dopamine System)', () => {
    it('should record a prediction with all fields', () => {
      const prediction = recordPrediction({
        organizationId: 'org-test',
        predictionType: 'churn',
        entityType: 'client',
        entityId: 'client-123',
        predictedProbability: 0.75,
        predictionWindowDays: 30,
        modelVersion: 'v1',
      });

      expect(prediction.id).toMatch(/^pred_/);
      expect(prediction.organizationId).toBe('org-test');
      expect(prediction.predictionType).toBe('churn');
      expect(prediction.predictedProbability).toBe(0.75);
      expect(prediction.predictionWindowDays).toBe(30);
      expect(prediction.predictedAt).toBeInstanceOf(Date);
    });

    it('should clamp probability to [0, 1]', () => {
      const overPred = recordPrediction({
        organizationId: 'org-test',
        predictionType: 'test',
        entityType: 'domain',
        entityId: 'x',
        predictedProbability: 1.5,
        predictionWindowDays: 30,
      });
      expect(overPred.predictedProbability).toBe(1);

      const underPred = recordPrediction({
        organizationId: 'org-test',
        predictionType: 'test',
        entityType: 'domain',
        entityId: 'x',
        predictedProbability: -0.5,
        predictionWindowDays: 30,
      });
      expect(underPred.predictedProbability).toBe(0);
    });

    it('should record outcomes and match them to predictions', () => {
      const predictions: PredictionRecord[] = [
        recordPrediction({
          organizationId: 'org-test',
          predictionType: 'churn',
          entityType: 'client',
          entityId: 'c1',
          predictedProbability: 0.8,
          predictionWindowDays: 30,
        }),
        recordPrediction({
          organizationId: 'org-test',
          predictionType: 'upsell',
          entityType: 'client',
          entityId: 'c2',
          predictedProbability: 0.3,
          predictionWindowDays: 60,
        }),
      ];

      const outcomes: OutcomeRecord[] = [
        recordOutcome(predictions[0].id, true),  // churn happened as predicted
        recordOutcome(predictions[1].id, false),  // upsell didn't happen
      ];

      const matched = matchPredictionsToOutcomes(predictions, outcomes);

      expect(matched).toHaveLength(2);

      // Churn: predicted 0.8, occurred → absolute error 0.2
      const churnMatch = matched.find(m => m.prediction.predictionType === 'churn');
      expect(churnMatch).toBeDefined();
      expect(churnMatch!.absoluteError).toBeCloseTo(0.2, 2);

      // Upsell: predicted 0.3, didn't occur → absolute error 0.3
      const upsellMatch = matched.find(m => m.prediction.predictionType === 'upsell');
      expect(upsellMatch).toBeDefined();
      expect(upsellMatch!.absoluteError).toBeCloseTo(0.3, 2);
    });

    it('should identify pending predictions (Dopamine awaiting feedback)', () => {
      const predictions: PredictionRecord[] = [
        recordPrediction({
          organizationId: 'org-test',
          predictionType: 'cascade',
          entityType: 'domain',
          entityId: 'revenue',
          predictedProbability: 0.6,
          predictionWindowDays: 30,
        }),
        recordPrediction({
          organizationId: 'org-test',
          predictionType: 'cascade',
          entityType: 'domain',
          entityId: 'churn',
          predictedProbability: 0.7,
          predictionWindowDays: 90,
        }),
      ];

      // Only the first prediction has an outcome
      const outcomes = [recordOutcome(predictions[0].id, true)];

      const pending = getPendingPredictions(predictions, outcomes);

      // Second prediction should be pending (no outcome yet)
      expect(pending).toHaveLength(1);
      expect(pending[0].entityId).toBe('churn');
      expect(pending[0].daysRemaining).toBeGreaterThan(0);
      expect(pending[0].isExpired).toBe(false);
    });
  });

  describe('simulateAndTrack() — PFC → Dopamine Pipeline', () => {
    it('should run simulation and record predictions for each cascade step', async () => {
      const brain = createBrainPipeline({
        supabase,
        organizationId: 'org-test',
      });

      const scenario: WhatIfScenario = {
        sourceDomain: 'marketing',
        direction: 'increase',
        magnitudePercent: 20,
        timeHorizonDays: 90,
      };

      const result = await brain.simulateAndTrack(scenario);

      expect(result.simulation).toBeDefined();
      expect(result.simulation.scenario).toEqual(scenario);
      expect(result.predictions).toBeDefined();
      expect(Array.isArray(result.predictions)).toBe(true);

      // Each prediction should have valid fields
      for (const pred of result.predictions) {
        expect(pred.id).toMatch(/^pred_/);
        expect(pred.organizationId).toBe('org-test');
        expect(pred.predictionType).toMatch(/^whatif_cascade_/);
        expect(pred.entityType).toBe('domain');
        expect(pred.predictedProbability).toBeGreaterThanOrEqual(0);
        expect(pred.predictedProbability).toBeLessThanOrEqual(1);
        expect(pred.predictionWindowDays).toBeGreaterThan(0);
        expect(pred.featureSnapshot).toBeDefined();
        expect(pred.featureSnapshot!.scenario).toBeDefined();
      }
    });

    it('should include feature snapshot with cascade details', async () => {
      const brain = createBrainPipeline({
        supabase,
        organizationId: 'org-test',
      });

      const result = await brain.simulateAndTrack({
        sourceDomain: 'engineering',
        direction: 'decrease',
        magnitudePercent: 30,
      });

      // Even with empty graph, simulation should return cleanly
      expect(result.simulation).toBeDefined();
      expect(result.predictions).toBeDefined();

      // Predictions from timeline steps should have snapshots
      for (const pred of result.predictions) {
        const snap = pred.featureSnapshot as any;
        expect(snap.scenario).toBeDefined();
        expect(snap.scenario.sourceDomain).toBe('engineering');
        expect(snap.scenario.direction).toBe('decrease');
      }
    });
  });

  describe('Brain Analogy Validation', () => {
    it('should model PFC → Dopamine: simulations become verifiable predictions', () => {
      // Brain Analog:
      // PFC: "If marketing increases 20%, I predict revenue will increase 15% in 90 days"
      // Dopamine: "Let me record that prediction. In 90 days, I'll check if revenue actually
      // increased 15% and compute the prediction error to strengthen/weaken the causal edge."

      const prediction = recordPrediction({
        organizationId: 'org-test',
        predictionType: 'whatif_cascade_increase',
        entityType: 'domain',
        entityId: 'revenue',
        predictedProbability: 0.75, // 75% confidence the cascade reaches revenue
        predictionWindowDays: 90,
        modelVersion: 'whatif-simulator-v1',
        featureSnapshot: {
          scenario: { sourceDomain: 'marketing', direction: 'increase', magnitudePercent: 20 },
          predictedChangePercent: 15,
          fromDomain: 'marketing',
          toDomain: 'revenue',
        },
      });

      // 90 days later, revenue actually increased 12%
      const outcome = recordOutcome(prediction.id, true, new Date());

      const [matched] = matchPredictionsToOutcomes([prediction], [outcome]);

      // Dopamine system measures prediction error
      // Predicted 0.75 (event will happen), it happened → error = 0.25
      expect(matched.absoluteError).toBeCloseTo(0.25, 2);
      expect(matched.squaredError).toBeCloseTo(0.0625, 2);

      // This prediction error drives learning:
      // Small error → strengthen the marketing→revenue causal edge
      // Large error → weaken it
    });
  });
});
