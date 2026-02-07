/**
 * Nexus Memory Stack - Outcome Tracker Tests
 *
 * Tests for Brain rule prediction recording, prediction-type inference,
 * outcome matching, resolution, accuracy computation, grouping by rule,
 * and minimum sample size checks.
 */

import { describe, it, expect } from 'vitest';
import {
  createBrainPrediction,
  inferPredictionType,
  findPredictionsAwaitingOutcome,
  matchOutcomeToPredictons,
  resolvePrediction,
  computePredictionAccuracy,
  computeAccuracyByRule,
  hasMinimumSampleSize,
} from '../learning/outcome-tracker';
import type { BrainPrediction, PredictionAccuracy } from '../learning/outcome-tracker';

// ============================================================================
// HELPERS
// ============================================================================

/** Build a BrainPrediction with sensible defaults. */
function makePrediction(overrides: Partial<BrainPrediction> = {}): BrainPrediction {
  return {
    organization_id: 'org-1',
    rule_id: 'rule-1',
    rule_title: 'Test Rule',
    prediction_type: 'churn_risk',
    entity_type: 'client',
    entity_id: 'client-1',
    predicted_outcome: true,
    confidence_at_prediction: 0.8,
    outcome_window_days: 30,
    outcome_deadline: new Date('2025-03-01'),
    created_at: new Date('2025-01-30'),
    ...overrides,
  };
}

/** Build a resolved prediction (outcome already applied). */
function makeResolved(
  predicted: boolean,
  occurred: boolean,
  confidence: number = 0.8,
  overrides: Partial<BrainPrediction> = {},
): BrainPrediction {
  return makePrediction({
    predicted_outcome: predicted,
    outcome_occurred: occurred,
    confidence_at_prediction: confidence,
    outcome_date: new Date('2025-02-15'),
    ...overrides,
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('Outcome Tracker', () => {
  // ==========================================================================
  // createBrainPrediction
  // ==========================================================================

  describe('createBrainPrediction', () => {
    it('should create a prediction record with all provided fields and correct defaults', () => {
      const before = new Date();
      const result = createBrainPrediction({
        organizationId: 'org-123',
        ruleId: 'rule-abc',
        ruleTitle: 'High Churn Risk',
        predictionType: 'churn_risk',
        entityType: 'client',
        entityId: 'client-456',
        predictedOutcome: true,
        confidence: 0.85,
        outcomeWindowDays: 45,
        featureSnapshot: { revenue: 50000, healthScore: 30 },
        executionId: 'exec-789',
      });
      const after = new Date();

      expect(result.organization_id).toBe('org-123');
      expect(result.rule_id).toBe('rule-abc');
      expect(result.rule_title).toBe('High Churn Risk');
      expect(result.prediction_type).toBe('churn_risk');
      expect(result.entity_type).toBe('client');
      expect(result.entity_id).toBe('client-456');
      expect(result.predicted_outcome).toBe(true);
      expect(result.confidence_at_prediction).toBe(0.85);
      expect(result.outcome_window_days).toBe(45);
      expect(result.feature_snapshot).toEqual({ revenue: 50000, healthScore: 30 });
      expect(result.execution_id).toBe('exec-789');

      // created_at should be approximately now
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.created_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.created_at!.getTime()).toBeLessThanOrEqual(after.getTime());

      // outcome_deadline should be ~45 days from now
      expect(result.outcome_deadline).toBeInstanceOf(Date);
      const expectedDeadlineMs = before.getTime() + 45 * 24 * 60 * 60 * 1000;
      expect(result.outcome_deadline!.getTime()).toBeGreaterThanOrEqual(expectedDeadlineMs - 2000);
      expect(result.outcome_deadline!.getTime()).toBeLessThanOrEqual(expectedDeadlineMs + 2000);

      // outcome fields should not be set
      expect(result.outcome_occurred).toBeUndefined();
      expect(result.outcome_date).toBeUndefined();
    });

    it('should default outcomeWindowDays to 30 when not provided', () => {
      const result = createBrainPrediction({
        organizationId: 'org-1',
        ruleId: 'rule-1',
        predictionType: 'general',
        entityType: 'account',
        entityId: 'acc-1',
        predictedOutcome: false,
        confidence: 0.5,
      });

      expect(result.outcome_window_days).toBe(30);

      // Deadline should be ~30 days from now
      const now = new Date();
      const expectedDeadlineMs = now.getTime() + 30 * 24 * 60 * 60 * 1000;
      expect(result.outcome_deadline!.getTime()).toBeGreaterThanOrEqual(expectedDeadlineMs - 2000);
      expect(result.outcome_deadline!.getTime()).toBeLessThanOrEqual(expectedDeadlineMs + 2000);
    });

    it('should pass through optional fields as undefined when not provided', () => {
      const result = createBrainPrediction({
        organizationId: 'org-1',
        ruleId: 'rule-1',
        predictionType: 'general',
        entityType: 'account',
        entityId: 'acc-1',
        predictedOutcome: true,
        confidence: 0.6,
      });

      expect(result.rule_title).toBeUndefined();
      expect(result.feature_snapshot).toBeUndefined();
      expect(result.execution_id).toBeUndefined();
    });
  });

  // ==========================================================================
  // inferPredictionType
  // ==========================================================================

  describe('inferPredictionType', () => {
    it('should return churn_risk when an action type includes "churn"', () => {
      expect(inferPredictionType('rule-1', 'any', [{ type: 'flag_churn_risk' }])).toBe('churn_risk');
      expect(inferPredictionType('rule-1', 'any', [{ type: 'CHURN_ALERT' }])).toBe('churn_risk');
    });

    it('should return collection_delay when an action type includes "collection" or "overdue"', () => {
      expect(inferPredictionType('rule-1', 'any', [{ type: 'send_collection_notice' }])).toBe('collection_delay');
      expect(inferPredictionType('rule-1', 'any', [{ type: 'overdue_warning' }])).toBe('collection_delay');
    });

    it('should return escalation when an action type includes "escalat"', () => {
      expect(inferPredictionType('rule-1', 'any', [{ type: 'escalate_ticket' }])).toBe('escalation');
      expect(inferPredictionType('rule-1', 'any', [{ type: 'auto_escalation' }])).toBe('escalation');
    });

    it('should return upsell_opportunity when an action type includes "upsell" or "expansion"', () => {
      expect(inferPredictionType('rule-1', 'any', [{ type: 'trigger_upsell' }])).toBe('upsell_opportunity');
      expect(inferPredictionType('rule-1', 'any', [{ type: 'expansion_signal' }])).toBe('upsell_opportunity');
    });

    it('should return renewal_risk when an action type includes "renewal"', () => {
      expect(inferPredictionType('rule-1', 'any', [{ type: 'renewal_reminder' }])).toBe('renewal_risk');
    });

    it('should prioritise action-type matches over domain fallback', () => {
      // Action says upsell, domain says finance => action wins
      expect(inferPredictionType('rule-1', 'finance', [{ type: 'upsell_check' }])).toBe('upsell_opportunity');
    });

    it('should fall back to domain mapping when no actions match', () => {
      expect(inferPredictionType('rule-1', 'client_success')).toBe('churn_risk');
      expect(inferPredictionType('rule-1', 'finance')).toBe('collection_delay');
      expect(inferPredictionType('rule-1', 'support')).toBe('escalation');
      expect(inferPredictionType('rule-1', 'sales')).toBe('deal_outcome');
    });

    it('should be case-insensitive for domain matching', () => {
      expect(inferPredictionType('rule-1', 'CLIENT_SUCCESS')).toBe('churn_risk');
      expect(inferPredictionType('rule-1', 'Finance')).toBe('collection_delay');
      expect(inferPredictionType('rule-1', 'SUPPORT')).toBe('escalation');
    });

    it('should return "general" for unknown domains with no matching actions', () => {
      expect(inferPredictionType('rule-1', 'unknown_domain')).toBe('general');
      expect(inferPredictionType('rule-1', 'marketing', [])).toBe('general');
    });
  });

  // ==========================================================================
  // findPredictionsAwaitingOutcome
  // ==========================================================================

  describe('findPredictionsAwaitingOutcome', () => {
    it('should return predictions whose deadline has passed and have no outcome', () => {
      const predictions: BrainPrediction[] = [
        makePrediction({ entity_id: 'c-1', outcome_deadline: new Date('2025-02-01') }),
        makePrediction({ entity_id: 'c-2', outcome_deadline: new Date('2025-03-01') }),
        makePrediction({ entity_id: 'c-3', outcome_deadline: new Date('2025-01-15') }),
      ];

      const now = new Date('2025-02-15');
      const awaiting = findPredictionsAwaitingOutcome(predictions, now);

      expect(awaiting).toHaveLength(2);
      const ids = awaiting.map(p => p.entity_id);
      expect(ids).toContain('c-1');
      expect(ids).toContain('c-3');
      expect(ids).not.toContain('c-2');
    });

    it('should exclude predictions that already have an outcome resolved', () => {
      const predictions: BrainPrediction[] = [
        makePrediction({
          entity_id: 'c-1',
          outcome_deadline: new Date('2025-01-01'),
          outcome_occurred: true,  // already resolved
        }),
        makePrediction({
          entity_id: 'c-2',
          outcome_deadline: new Date('2025-01-01'),
          // not resolved
        }),
      ];

      const awaiting = findPredictionsAwaitingOutcome(predictions, new Date('2025-02-01'));
      expect(awaiting).toHaveLength(1);
      expect(awaiting[0].entity_id).toBe('c-2');
    });

    it('should use created_at + outcome_window_days if outcome_deadline is not set', () => {
      const predictions: BrainPrediction[] = [
        makePrediction({
          entity_id: 'c-1',
          outcome_deadline: undefined,
          created_at: new Date('2025-01-01'),
          outcome_window_days: 10,  // expires Jan 11
        }),
      ];

      // Jan 10: not yet expired
      expect(findPredictionsAwaitingOutcome(predictions, new Date('2025-01-10'))).toHaveLength(0);

      // Jan 15: expired
      expect(findPredictionsAwaitingOutcome(predictions, new Date('2025-01-15'))).toHaveLength(1);
    });

    it('should return an empty array when no predictions are awaiting outcome', () => {
      const predictions: BrainPrediction[] = [
        makePrediction({ outcome_deadline: new Date('2099-12-31') }),
      ];

      const awaiting = findPredictionsAwaitingOutcome(predictions, new Date('2025-06-01'));
      expect(awaiting).toEqual([]);
    });

    it('should return an empty array for empty input', () => {
      expect(findPredictionsAwaitingOutcome([])).toEqual([]);
    });
  });

  // ==========================================================================
  // matchOutcomeToPredictons
  // ==========================================================================

  describe('matchOutcomeToPredictons', () => {
    it('should match predictions by entity type, entity id, and prediction type', () => {
      const predictions: BrainPrediction[] = [
        makePrediction({ entity_type: 'client', entity_id: 'c-1', prediction_type: 'churn_risk' }),
        makePrediction({ entity_type: 'client', entity_id: 'c-1', prediction_type: 'upsell_opportunity' }),
        makePrediction({ entity_type: 'client', entity_id: 'c-2', prediction_type: 'churn_risk' }),
        makePrediction({ entity_type: 'invoice', entity_id: 'c-1', prediction_type: 'churn_risk' }),
      ];

      const matched = matchOutcomeToPredictons(predictions, {
        entityType: 'client',
        entityId: 'c-1',
        outcomeType: 'churn_risk',
        occurredAt: new Date('2025-02-15'),
      });

      expect(matched).toHaveLength(1);
      expect(matched[0].entity_type).toBe('client');
      expect(matched[0].entity_id).toBe('c-1');
      expect(matched[0].prediction_type).toBe('churn_risk');
    });

    it('should exclude already-resolved predictions', () => {
      const predictions: BrainPrediction[] = [
        makePrediction({
          entity_type: 'client',
          entity_id: 'c-1',
          prediction_type: 'churn_risk',
          outcome_occurred: true,  // already resolved
        }),
        makePrediction({
          entity_type: 'client',
          entity_id: 'c-1',
          prediction_type: 'churn_risk',
          // not resolved
        }),
      ];

      const matched = matchOutcomeToPredictons(predictions, {
        entityType: 'client',
        entityId: 'c-1',
        outcomeType: 'churn_risk',
        occurredAt: new Date('2025-02-15'),
      });

      expect(matched).toHaveLength(1);
      expect(matched[0].outcome_occurred).toBeUndefined();
    });

    it('should return an empty array when nothing matches', () => {
      const predictions: BrainPrediction[] = [
        makePrediction({ entity_type: 'client', entity_id: 'c-1', prediction_type: 'churn_risk' }),
      ];

      const matched = matchOutcomeToPredictons(predictions, {
        entityType: 'client',
        entityId: 'c-999',
        outcomeType: 'churn_risk',
        occurredAt: new Date(),
      });

      expect(matched).toEqual([]);
    });

    it('should return an empty array for empty predictions', () => {
      const matched = matchOutcomeToPredictons([], {
        entityType: 'client',
        entityId: 'c-1',
        outcomeType: 'churn_risk',
        occurredAt: new Date(),
      });

      expect(matched).toEqual([]);
    });
  });

  // ==========================================================================
  // resolvePrediction
  // ==========================================================================

  describe('resolvePrediction', () => {
    it('should apply a positive outcome to a prediction (immutably)', () => {
      const original = makePrediction({ entity_id: 'c-1' });
      const outcomeDate = new Date('2025-02-20');

      const resolved = resolvePrediction(original, true, outcomeDate);

      // The resolved prediction should have the outcome set
      expect(resolved.outcome_occurred).toBe(true);
      expect(resolved.outcome_date).toEqual(outcomeDate);

      // All other fields should be preserved
      expect(resolved.entity_id).toBe('c-1');
      expect(resolved.organization_id).toBe(original.organization_id);
      expect(resolved.rule_id).toBe(original.rule_id);
      expect(resolved.predicted_outcome).toBe(original.predicted_outcome);
      expect(resolved.confidence_at_prediction).toBe(original.confidence_at_prediction);

      // Original should remain unmodified (immutability check)
      expect(original.outcome_occurred).toBeUndefined();
      expect(original.outcome_date).toBeUndefined();
    });

    it('should apply a negative outcome to a prediction', () => {
      const original = makePrediction();
      const outcomeDate = new Date('2025-03-01');

      const resolved = resolvePrediction(original, false, outcomeDate);

      expect(resolved.outcome_occurred).toBe(false);
      expect(resolved.outcome_date).toEqual(outcomeDate);
    });

    it('should default outcomeDate to now when not provided', () => {
      const before = new Date();
      const resolved = resolvePrediction(makePrediction(), true);
      const after = new Date();

      expect(resolved.outcome_date!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resolved.outcome_date!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ==========================================================================
  // computePredictionAccuracy
  // ==========================================================================

  describe('computePredictionAccuracy', () => {
    it('should compute TP/TN/FP/FN and derived metrics correctly', () => {
      const predictions: BrainPrediction[] = [
        // True Positive: predicted true, occurred true
        makeResolved(true, true, 0.9, { rule_id: 'r1', prediction_type: 'churn_risk', created_at: new Date('2025-01-01') }),
        // True Negative: predicted false, occurred false
        makeResolved(false, false, 0.7, { rule_id: 'r1', prediction_type: 'churn_risk', created_at: new Date('2025-01-10') }),
        // False Positive: predicted true, occurred false
        makeResolved(true, false, 0.8, { rule_id: 'r1', prediction_type: 'churn_risk', created_at: new Date('2025-01-20') }),
        // False Negative: predicted false, occurred true
        makeResolved(false, true, 0.6, { rule_id: 'r1', prediction_type: 'churn_risk', created_at: new Date('2025-01-30') }),
      ];

      const accuracy = computePredictionAccuracy(predictions, 'r1', 'churn_risk');

      expect(accuracy.rule_id).toBe('r1');
      expect(accuracy.prediction_type).toBe('churn_risk');
      expect(accuracy.total_predictions).toBe(4);
      expect(accuracy.true_positives).toBe(1);
      expect(accuracy.true_negatives).toBe(1);
      expect(accuracy.false_positives).toBe(1);
      expect(accuracy.false_negatives).toBe(1);

      // accuracy = (TP + TN) / total = 2/4 = 0.5
      expect(accuracy.accuracy).toBeCloseTo(0.5);
      // precision = TP / (TP + FP) = 1/2 = 0.5
      expect(accuracy.precision).toBeCloseTo(0.5);
      // recall = TP / (TP + FN) = 1/2 = 0.5
      expect(accuracy.recall).toBeCloseTo(0.5);
      // F1 = 2 * (0.5 * 0.5) / (0.5 + 0.5) = 0.5
      expect(accuracy.f1_score).toBeCloseTo(0.5);

      // avg_confidence = (0.9 + 0.7 + 0.8 + 0.6) / 4 = 0.75
      expect(accuracy.avg_confidence).toBeCloseTo(0.75);

      // sample_period_days = ceil((Jan 30 - Jan 01) / day_ms) = 29
      expect(accuracy.sample_period_days).toBe(29);
    });

    it('should return zeroed metrics when no resolved predictions match', () => {
      const predictions: BrainPrediction[] = [
        // Unresolved prediction (no outcome_occurred)
        makePrediction({ rule_id: 'r1', prediction_type: 'churn_risk' }),
        // Different rule
        makeResolved(true, true, 0.8, { rule_id: 'r2', prediction_type: 'churn_risk' }),
        // Different prediction type
        makeResolved(true, true, 0.8, { rule_id: 'r1', prediction_type: 'escalation' }),
      ];

      const accuracy = computePredictionAccuracy(predictions, 'r1', 'churn_risk');

      expect(accuracy.total_predictions).toBe(0);
      expect(accuracy.true_positives).toBe(0);
      expect(accuracy.true_negatives).toBe(0);
      expect(accuracy.false_positives).toBe(0);
      expect(accuracy.false_negatives).toBe(0);
      expect(accuracy.accuracy).toBe(0);
      expect(accuracy.precision).toBe(0);
      expect(accuracy.recall).toBe(0);
      expect(accuracy.f1_score).toBe(0);
      expect(accuracy.avg_confidence).toBe(0);
      expect(accuracy.sample_period_days).toBe(0);
    });

    it('should compute perfect accuracy when all predictions are correct', () => {
      const predictions: BrainPrediction[] = [
        makeResolved(true, true, 0.95, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        makeResolved(true, true, 0.90, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        makeResolved(false, false, 0.85, { rule_id: 'r1', prediction_type: 'churn_risk' }),
      ];

      const accuracy = computePredictionAccuracy(predictions, 'r1', 'churn_risk');

      expect(accuracy.total_predictions).toBe(3);
      expect(accuracy.true_positives).toBe(2);
      expect(accuracy.true_negatives).toBe(1);
      expect(accuracy.false_positives).toBe(0);
      expect(accuracy.false_negatives).toBe(0);
      expect(accuracy.accuracy).toBeCloseTo(1.0);
      expect(accuracy.precision).toBeCloseTo(1.0);
      expect(accuracy.recall).toBeCloseTo(1.0);
      expect(accuracy.f1_score).toBeCloseTo(1.0);
    });

    it('should compute zero precision/recall when all predictions are wrong', () => {
      const predictions: BrainPrediction[] = [
        // All false positives: predicted true, but outcome false
        makeResolved(true, false, 0.8, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        makeResolved(true, false, 0.7, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        // All false negatives: predicted false, but outcome true
        makeResolved(false, true, 0.6, { rule_id: 'r1', prediction_type: 'churn_risk' }),
      ];

      const accuracy = computePredictionAccuracy(predictions, 'r1', 'churn_risk');

      expect(accuracy.total_predictions).toBe(3);
      expect(accuracy.true_positives).toBe(0);
      expect(accuracy.true_negatives).toBe(0);
      expect(accuracy.false_positives).toBe(2);
      expect(accuracy.false_negatives).toBe(1);
      expect(accuracy.accuracy).toBeCloseTo(0);
      expect(accuracy.precision).toBe(0);
      expect(accuracy.recall).toBe(0);
      expect(accuracy.f1_score).toBe(0);
    });

    it('should handle precision edge case when only TN (no TP or FP)', () => {
      const predictions: BrainPrediction[] = [
        makeResolved(false, false, 0.5, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        makeResolved(false, false, 0.4, { rule_id: 'r1', prediction_type: 'churn_risk' }),
      ];

      const accuracy = computePredictionAccuracy(predictions, 'r1', 'churn_risk');

      // TP + FP = 0, so precision = 0
      expect(accuracy.precision).toBe(0);
      // TP + FN = 0, so recall = 0
      expect(accuracy.recall).toBe(0);
      // F1 = 0 (no precision or recall)
      expect(accuracy.f1_score).toBe(0);
      // accuracy = (0 + 2) / 2 = 1.0
      expect(accuracy.accuracy).toBeCloseTo(1.0);
    });

    it('should return sample_period_days of 0 for a single resolved prediction', () => {
      const predictions: BrainPrediction[] = [
        makeResolved(true, true, 0.9, { rule_id: 'r1', prediction_type: 'churn_risk', created_at: new Date('2025-01-15') }),
      ];

      const accuracy = computePredictionAccuracy(predictions, 'r1', 'churn_risk');
      expect(accuracy.sample_period_days).toBe(0);
    });

    it('should handle empty predictions array', () => {
      const accuracy = computePredictionAccuracy([], 'r1', 'churn_risk');

      expect(accuracy.total_predictions).toBe(0);
      expect(accuracy.accuracy).toBe(0);
      expect(accuracy.precision).toBe(0);
      expect(accuracy.recall).toBe(0);
      expect(accuracy.f1_score).toBe(0);
    });
  });

  // ==========================================================================
  // computeAccuracyByRule
  // ==========================================================================

  describe('computeAccuracyByRule', () => {
    it('should group predictions by rule and compute accuracy for each', () => {
      const predictions: BrainPrediction[] = [
        makeResolved(true, true, 0.9, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        makeResolved(true, false, 0.8, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        makeResolved(true, true, 0.7, { rule_id: 'r2', prediction_type: 'escalation' }),
        makeResolved(true, true, 0.6, { rule_id: 'r2', prediction_type: 'escalation' }),
      ];

      const results = computeAccuracyByRule(predictions);

      expect(results.size).toBe(2);

      const r1 = results.get('r1')!;
      expect(r1.rule_id).toBe('r1');
      expect(r1.prediction_type).toBe('churn_risk');
      expect(r1.total_predictions).toBe(2);
      expect(r1.true_positives).toBe(1);
      expect(r1.false_positives).toBe(1);

      const r2 = results.get('r2')!;
      expect(r2.rule_id).toBe('r2');
      expect(r2.prediction_type).toBe('escalation');
      expect(r2.total_predictions).toBe(2);
      expect(r2.true_positives).toBe(2);
      expect(r2.accuracy).toBeCloseTo(1.0);
    });

    it('should use the most frequent prediction type as the primary type per rule', () => {
      const predictions: BrainPrediction[] = [
        makeResolved(true, true, 0.9, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        makeResolved(true, true, 0.8, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        makeResolved(true, true, 0.7, { rule_id: 'r1', prediction_type: 'escalation' }),
      ];

      const results = computeAccuracyByRule(predictions);

      const r1 = results.get('r1')!;
      // churn_risk appears 2 times vs escalation 1 time, so churn_risk is primary
      expect(r1.prediction_type).toBe('churn_risk');
      // Only 2 resolved predictions match rule_id='r1' AND prediction_type='churn_risk'
      expect(r1.total_predictions).toBe(2);
    });

    it('should return an empty map for empty predictions', () => {
      const results = computeAccuracyByRule([]);
      expect(results.size).toBe(0);
    });

    it('should handle rules with only unresolved predictions', () => {
      const predictions: BrainPrediction[] = [
        makePrediction({ rule_id: 'r1', prediction_type: 'churn_risk' }),  // no outcome
      ];

      const results = computeAccuracyByRule(predictions);

      expect(results.size).toBe(1);
      const r1 = results.get('r1')!;
      expect(r1.total_predictions).toBe(0);
      expect(r1.accuracy).toBe(0);
    });
  });

  // ==========================================================================
  // hasMinimumSampleSize
  // ==========================================================================

  describe('hasMinimumSampleSize', () => {
    it('should return true when total predictions meets default minimum of 10', () => {
      const accuracy: PredictionAccuracy = {
        rule_id: 'r1',
        prediction_type: 'churn_risk',
        total_predictions: 10,
        true_positives: 5,
        true_negatives: 3,
        false_positives: 1,
        false_negatives: 1,
        accuracy: 0.8,
        precision: 0.83,
        recall: 0.83,
        f1_score: 0.83,
        avg_confidence: 0.75,
        sample_period_days: 30,
      };

      expect(hasMinimumSampleSize(accuracy)).toBe(true);
    });

    it('should return false when total predictions is below default minimum of 10', () => {
      const accuracy: PredictionAccuracy = {
        rule_id: 'r1',
        prediction_type: 'churn_risk',
        total_predictions: 9,
        true_positives: 5,
        true_negatives: 2,
        false_positives: 1,
        false_negatives: 1,
        accuracy: 0.78,
        precision: 0.83,
        recall: 0.83,
        f1_score: 0.83,
        avg_confidence: 0.7,
        sample_period_days: 15,
      };

      expect(hasMinimumSampleSize(accuracy)).toBe(false);
    });

    it('should respect a custom minimum sample size', () => {
      const accuracy: PredictionAccuracy = {
        rule_id: 'r1',
        prediction_type: 'churn_risk',
        total_predictions: 5,
        true_positives: 3,
        true_negatives: 1,
        false_positives: 1,
        false_negatives: 0,
        accuracy: 0.8,
        precision: 0.75,
        recall: 1.0,
        f1_score: 0.86,
        avg_confidence: 0.7,
        sample_period_days: 10,
      };

      expect(hasMinimumSampleSize(accuracy, 5)).toBe(true);
      expect(hasMinimumSampleSize(accuracy, 6)).toBe(false);
    });

    it('should return false when total predictions is 0', () => {
      const accuracy: PredictionAccuracy = {
        rule_id: 'r1',
        prediction_type: 'churn_risk',
        total_predictions: 0,
        true_positives: 0,
        true_negatives: 0,
        false_positives: 0,
        false_negatives: 0,
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1_score: 0,
        avg_confidence: 0,
        sample_period_days: 0,
      };

      expect(hasMinimumSampleSize(accuracy)).toBe(false);
      expect(hasMinimumSampleSize(accuracy, 0)).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle the full lifecycle: create -> match -> resolve -> compute accuracy', () => {
      // Step 1: Create predictions
      const pred1 = createBrainPrediction({
        organizationId: 'org-1',
        ruleId: 'churn-rule',
        predictionType: 'churn_risk',
        entityType: 'client',
        entityId: 'c-100',
        predictedOutcome: true,
        confidence: 0.85,
        outcomeWindowDays: 30,
      });
      const pred2 = createBrainPrediction({
        organizationId: 'org-1',
        ruleId: 'churn-rule',
        predictionType: 'churn_risk',
        entityType: 'client',
        entityId: 'c-200',
        predictedOutcome: true,
        confidence: 0.75,
        outcomeWindowDays: 30,
      });

      // Step 2: Match an outcome to predictions
      const matched = matchOutcomeToPredictons([pred1, pred2], {
        entityType: 'client',
        entityId: 'c-100',
        outcomeType: 'churn_risk',
        occurredAt: new Date('2025-03-01'),
      });
      expect(matched).toHaveLength(1);
      expect(matched[0].entity_id).toBe('c-100');

      // Step 3: Resolve matched predictions
      const resolved1 = resolvePrediction(matched[0], true, new Date('2025-03-01'));
      const resolved2 = resolvePrediction(pred2, false, new Date('2025-03-15'));

      // Step 4: Compute accuracy
      const accuracy = computePredictionAccuracy(
        [resolved1, resolved2],
        'churn-rule',
        'churn_risk',
      );

      expect(accuracy.total_predictions).toBe(2);
      expect(accuracy.true_positives).toBe(1);   // pred1: predicted true, occurred true
      expect(accuracy.false_positives).toBe(1);   // pred2: predicted true, occurred false
      expect(accuracy.accuracy).toBeCloseTo(0.5);
    });

    it('should handle outcome_occurred being explicitly false (not just undefined)', () => {
      const prediction = makePrediction({
        outcome_occurred: false,  // explicitly resolved as false
      });

      // Should NOT appear in awaiting (it is resolved)
      const awaiting = findPredictionsAwaitingOutcome(
        [prediction],
        new Date('2099-01-01'),
      );
      expect(awaiting).toHaveLength(0);

      // Should NOT appear in outcome matching (already resolved)
      const matched = matchOutcomeToPredictons([prediction], {
        entityType: prediction.entity_type,
        entityId: prediction.entity_id,
        outcomeType: prediction.prediction_type,
        occurredAt: new Date(),
      });
      expect(matched).toHaveLength(0);
    });

    it('should filter by both rule_id and prediction_type in computePredictionAccuracy', () => {
      const predictions: BrainPrediction[] = [
        makeResolved(true, true, 0.9, { rule_id: 'r1', prediction_type: 'churn_risk' }),
        makeResolved(true, true, 0.8, { rule_id: 'r1', prediction_type: 'escalation' }),
        makeResolved(true, true, 0.7, { rule_id: 'r2', prediction_type: 'churn_risk' }),
      ];

      const accuracy = computePredictionAccuracy(predictions, 'r1', 'churn_risk');
      // Only 1 prediction matches both rule_id=r1 AND prediction_type=churn_risk
      expect(accuracy.total_predictions).toBe(1);
      expect(accuracy.true_positives).toBe(1);
    });
  });
});
