/**
 * Nexus Memory Stack - Intervention Effects Module Tests
 *
 * Comprehensive tests for tracking interventions, recording outcomes,
 * computing Average Treatment Effects, Difference-in-Differences,
 * propensity score matching, and matched ATE estimation.
 */

import { describe, it, expect } from 'vitest';
import {
  trackIntervention,
  recordInterventionOutcome,
  computeATE,
  computeDifferenceInDifferences,
  computePropensityScores,
  matchByPropensityScore,
  computeATEWithMatching,
} from '../causality/intervention-effects';

// ============================================================================
// INTERVENTION TRACKING
// ============================================================================

describe('trackIntervention', () => {
  it('should create an intervention record with correct fields', () => {
    const record = trackIntervention(
      'sig_001',
      'account',
      'acct_42',
      'outreach_call',
      { revenue: 5000, engagement: 0.7 },
      30
    );

    expect(record.signalId).toBe('sig_001');
    expect(record.entityType).toBe('account');
    expect(record.entityId).toBe('acct_42');
    expect(record.interventionType).toBe('outreach_call');
    expect(record.outcomeRecorded).toBe(false);
    expect(record.postMetrics).toBeUndefined();
    expect(record.outcomeDate).toBeUndefined();
  });

  it('should generate a unique id starting with "int_"', () => {
    const record = trackIntervention(
      'sig_002',
      'deal',
      'deal_7',
      'escalation',
      { amount: 10000 }
    );

    expect(record.id).toMatch(/^int_\d+_[a-z0-9]+$/);
  });

  it('should store pre-metrics with provided values and aggregation period', () => {
    const preMetrics = { revenue: 1200, nps: 8 };
    const record = trackIntervention(
      'sig_003',
      'customer',
      'cust_1',
      'meeting_scheduled',
      preMetrics,
      60
    );

    expect(record.preMetrics.values).toEqual({ revenue: 1200, nps: 8 });
    expect(record.preMetrics.aggregationPeriodDays).toBe(60);
    expect(record.preMetrics.timestamp).toBeInstanceOf(Date);
  });

  it('should default aggregation period to 30 days', () => {
    const record = trackIntervention(
      'sig_004',
      'account',
      'acct_99',
      'alert_created',
      { score: 0.5 }
    );

    expect(record.preMetrics.aggregationPeriodDays).toBe(30);
  });

  it('should set interventionDate to a recent Date', () => {
    const before = Date.now();
    const record = trackIntervention(
      'sig_005',
      'account',
      'acct_1',
      'action_completed',
      { value: 100 }
    );
    const after = Date.now();

    expect(record.interventionDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(record.interventionDate.getTime()).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// RECORDING OUTCOMES
// ============================================================================

describe('recordInterventionOutcome', () => {
  it('should mark outcomeRecorded as true and attach post-metrics', () => {
    const record = trackIntervention(
      'sig_010',
      'account',
      'acct_50',
      'outreach_call',
      { revenue: 5000, engagement: 0.7 },
      30
    );

    const updated = recordInterventionOutcome(record, {
      revenue: 6500,
      engagement: 0.85,
    });

    expect(updated.outcomeRecorded).toBe(true);
    expect(updated.postMetrics).toBeDefined();
    expect(updated.postMetrics!.values).toEqual({
      revenue: 6500,
      engagement: 0.85,
    });
    expect(updated.outcomeDate).toBeInstanceOf(Date);
  });

  it('should preserve the original pre-metrics aggregation period in post-metrics', () => {
    const record = trackIntervention(
      'sig_011',
      'deal',
      'deal_3',
      'contract_modification',
      { amount: 20000 },
      90
    );

    const updated = recordInterventionOutcome(record, { amount: 25000 });

    expect(updated.postMetrics!.aggregationPeriodDays).toBe(90);
  });

  it('should not mutate the original intervention record', () => {
    const record = trackIntervention(
      'sig_012',
      'account',
      'acct_7',
      'alert_dismissed',
      { risk: 0.3 }
    );

    const updated = recordInterventionOutcome(record, { risk: 0.1 });

    expect(record.outcomeRecorded).toBe(false);
    expect(record.postMetrics).toBeUndefined();
    expect(updated.outcomeRecorded).toBe(true);
  });
});

// ============================================================================
// AVERAGE TREATMENT EFFECT (ATE)
// ============================================================================

describe('computeATE', () => {
  it('should detect a significant positive treatment effect', () => {
    // Treated group has clearly higher outcomes
    const treated = [12, 14, 13, 15, 11, 14, 16, 13, 15, 12];
    const control = [8, 7, 9, 6, 8, 7, 10, 6, 9, 7];

    const effect = computeATE(treated, control);

    expect(effect.averageTreatmentEffect).toBeCloseTo(5.8, 1);
    expect(effect.treatedMean).toBeGreaterThan(effect.controlMean);
    expect(effect.isSignificant).toBe(true);
    expect(effect.pValue).toBeLessThan(0.05);
    expect(effect.sampleSize).toBe(20);
    expect(effect.treatedCount).toBe(10);
    expect(effect.controlCount).toBe(10);
  });

  it('should return a non-significant result for similar groups', () => {
    const treated = [10, 11, 9, 10, 12, 10, 11, 9, 10, 11];
    const control = [10, 9, 11, 10, 10, 11, 9, 10, 11, 10];

    const effect = computeATE(treated, control);

    expect(Math.abs(effect.averageTreatmentEffect)).toBeLessThan(2);
    expect(effect.isSignificant).toBe(false);
    expect(effect.pValue).toBeGreaterThan(0.05);
  });

  it('should compute correct confidence interval that brackets the ATE', () => {
    const treated = [20, 22, 21, 23, 19, 24, 20, 22, 21, 23];
    const control = [15, 14, 16, 13, 17, 14, 15, 16, 13, 15];

    const effect = computeATE(treated, control);
    const ci = effect.ateConfidenceInterval;

    expect(ci.lower).toBeLessThan(effect.averageTreatmentEffect);
    expect(ci.upper).toBeGreaterThan(effect.averageTreatmentEffect);
    expect(ci.level).toBe(0.95);
  });

  it('should include an effect size interpretation', () => {
    const treated = [50, 55, 52, 48, 53, 51, 54, 49, 56, 50];
    const control = [30, 32, 28, 31, 29, 33, 27, 30, 34, 31];

    const effect = computeATE(treated, control);

    expect(effect.effectSize.effectType).toBe('cohens_d');
    expect(['small', 'medium', 'large', 'very_large']).toContain(
      effect.effectSize.interpretation
    );
  });

  it('should generate a natural language narrative for significant results', () => {
    const treated = [100, 110, 105, 108, 102, 107, 112, 103, 109, 106];
    const control = [80, 78, 82, 79, 81, 77, 83, 80, 78, 82];

    const effect = computeATE(treated, control);

    expect(effect.naturalLanguage).toContain('increase');
    expect(effect.naturalLanguage).toContain('95% CI');
  });

  it('should generate a narrative mentioning no significant effect when p > 0.05', () => {
    const treated = [10.0, 10.1, 9.9, 10.2, 9.8];
    const control = [10.0, 9.9, 10.1, 9.8, 10.2];

    const effect = computeATE(treated, control);

    expect(effect.naturalLanguage).toContain('No significant treatment effect');
  });

  it('should detect a significant negative treatment effect (decrease)', () => {
    const treated = [5, 6, 4, 5, 7, 4, 6, 5, 3, 5];
    const control = [12, 14, 13, 11, 15, 12, 14, 13, 11, 15];

    const effect = computeATE(treated, control);

    expect(effect.averageTreatmentEffect).toBeLessThan(0);
    expect(effect.isSignificant).toBe(true);
    expect(effect.naturalLanguage).toContain('decrease');
  });
});

// ============================================================================
// DIFFERENCE-IN-DIFFERENCES
// ============================================================================

describe('computeDifferenceInDifferences', () => {
  it('should detect a significant causal effect when treatment group improves more', () => {
    // Treatment group improves from ~50 to ~70, control from ~50 to ~55
    const treatPre  = [48, 52, 50, 49, 51, 50, 48, 52, 50, 49];
    const treatPost = [68, 72, 70, 69, 71, 70, 68, 72, 70, 69];
    const ctrlPre   = [48, 52, 50, 49, 51, 50, 48, 52, 50, 49];
    const ctrlPost  = [53, 57, 55, 54, 56, 55, 53, 57, 55, 54];

    const did = computeDifferenceInDifferences(treatPre, treatPost, ctrlPre, ctrlPost);

    // Treatment change ~20, control change ~5, so DiD ~15
    expect(did.didEstimate).toBeCloseTo(15, 0);
    expect(did.treatmentGroup.change).toBeCloseTo(20, 0);
    expect(did.controlGroup.change).toBeCloseTo(5, 0);
    expect(did.isSignificant).toBe(true);
    expect(did.pValue).toBeLessThan(0.05);
  });

  it('should return non-significant when treatment and control improve similarly', () => {
    const treatPre  = [50, 52, 48, 51, 49, 50, 52, 48, 51, 49];
    const treatPost = [55, 57, 53, 56, 54, 55, 57, 53, 56, 54];
    const ctrlPre   = [50, 52, 48, 51, 49, 50, 52, 48, 51, 49];
    const ctrlPost  = [55, 57, 53, 56, 54, 55, 57, 53, 56, 54];

    const did = computeDifferenceInDifferences(treatPre, treatPost, ctrlPre, ctrlPost);

    expect(did.didEstimate).toBeCloseTo(0, 1);
    expect(did.isSignificant).toBe(false);
  });

  it('should compute correct group-level pre and post means', () => {
    const treatPre  = [10, 20, 30];
    const treatPost = [40, 50, 60];
    const ctrlPre   = [10, 20, 30];
    const ctrlPost  = [15, 25, 35];

    const did = computeDifferenceInDifferences(treatPre, treatPost, ctrlPre, ctrlPost);

    expect(did.treatmentGroup.preMean).toBeCloseTo(20, 5);
    expect(did.treatmentGroup.postMean).toBeCloseTo(50, 5);
    expect(did.treatmentGroup.change).toBeCloseTo(30, 5);
    expect(did.controlGroup.preMean).toBeCloseTo(20, 5);
    expect(did.controlGroup.postMean).toBeCloseTo(25, 5);
    expect(did.controlGroup.change).toBeCloseTo(5, 5);
    expect(did.didEstimate).toBeCloseTo(25, 5);
  });

  it('should include a confidence interval at the requested level', () => {
    const treatPre  = [100, 102, 98, 101, 99];
    const treatPost = [120, 122, 118, 121, 119];
    const ctrlPre   = [100, 102, 98, 101, 99];
    const ctrlPost  = [105, 107, 103, 106, 104];

    const did = computeDifferenceInDifferences(
      treatPre, treatPost, ctrlPre, ctrlPost, 0.99
    );

    expect(did.confidenceInterval.level).toBe(0.99);
    expect(did.confidenceInterval.lower).toBeLessThan(did.didEstimate);
    expect(did.confidenceInterval.upper).toBeGreaterThan(did.didEstimate);
  });

  it('should produce a narrative about causal improvement for significant results', () => {
    const treatPre  = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
    const treatPost = [80, 80, 80, 80, 80, 80, 80, 80, 80, 80];
    const ctrlPre   = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50];
    const ctrlPost  = [55, 55, 55, 55, 55, 55, 55, 55, 55, 55];

    const did = computeDifferenceInDifferences(treatPre, treatPost, ctrlPre, ctrlPost);

    expect(did.naturalLanguage).toContain('causal');
    expect(did.naturalLanguage).toContain('improvement');
  });
});

// ============================================================================
// PROPENSITY SCORE COMPUTATION
// ============================================================================

describe('computePropensityScores', () => {
  it('should return one propensity score per observation', () => {
    const features = [
      { size: 100, age: 5 },
      { size: 200, age: 10 },
      { size: 150, age: 7 },
      { size: 300, age: 12 },
    ];
    const treatment = [true, false, true, false];

    const scores = computePropensityScores(features, treatment);

    expect(scores).toHaveLength(4);
  });

  it('should produce scores between 0 and 1 (inclusive)', () => {
    const features = [
      { revenue: 1000, employees: 50 },
      { revenue: 5000, employees: 200 },
      { revenue: 2000, employees: 80 },
      { revenue: 8000, employees: 500 },
      { revenue: 1500, employees: 60 },
      { revenue: 6000, employees: 300 },
    ];
    const treatment = [true, false, true, false, true, false];

    const scores = computePropensityScores(features, treatment);

    for (const s of scores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it('should assign entityId in the format entity_<index>', () => {
    const features = [
      { x: 1 },
      { x: 2 },
      { x: 3 },
    ];
    const treatment = [true, false, true];

    const scores = computePropensityScores(features, treatment);

    expect(scores[0].entityId).toBe('entity_0');
    expect(scores[1].entityId).toBe('entity_1');
    expect(scores[2].entityId).toBe('entity_2');
  });

  it('should preserve receivedTreatment flag on each score', () => {
    const features = [
      { x: 10 },
      { x: 20 },
    ];
    const treatment = [true, false];

    const scores = computePropensityScores(features, treatment);

    expect(scores[0].receivedTreatment).toBe(true);
    expect(scores[1].receivedTreatment).toBe(false);
  });

  it('should assign higher scores to units with features correlated to treatment', () => {
    // Treatment is strongly correlated with high "x"
    const features = Array.from({ length: 20 }, (_, i) => ({ x: i }));
    const treatment = features.map(f => f.x >= 10);

    const scores = computePropensityScores(features, treatment);

    const avgHighX = scores.filter(s => s.features.x >= 15)
      .reduce((s, p) => s + p.score, 0) / 5;
    const avgLowX = scores.filter(s => s.features.x < 5)
      .reduce((s, p) => s + p.score, 0) / 5;

    // Entities with higher x (treated) should have higher propensity scores
    expect(avgHighX).toBeGreaterThan(avgLowX);
  });
});

// ============================================================================
// PROPENSITY SCORE MATCHING
// ============================================================================

describe('matchByPropensityScore', () => {
  it('should match treated units to closest control units within caliper', () => {
    const scores = [
      { entityId: 'e_0', score: 0.50, features: {}, receivedTreatment: true },
      { entityId: 'e_1', score: 0.52, features: {}, receivedTreatment: false },
      { entityId: 'e_2', score: 0.80, features: {}, receivedTreatment: true },
      { entityId: 'e_3', score: 0.78, features: {}, receivedTreatment: false },
    ];

    const matches = matchByPropensityScore(scores, 0.1);

    expect(matches).toHaveLength(2);
    // e_0 (0.50) should match with e_1 (0.52)
    expect(matches[0].treated.entityId).toBe('e_0');
    expect(matches[0].control.entityId).toBe('e_1');
    // e_2 (0.80) should match with e_3 (0.78)
    expect(matches[1].treated.entityId).toBe('e_2');
    expect(matches[1].control.entityId).toBe('e_3');
  });

  it('should not match when all controls are outside the caliper', () => {
    const scores = [
      { entityId: 'e_0', score: 0.20, features: {}, receivedTreatment: true },
      { entityId: 'e_1', score: 0.90, features: {}, receivedTreatment: false },
    ];

    const matches = matchByPropensityScore(scores, 0.1);

    expect(matches).toHaveLength(0);
  });

  it('should not reuse the same control unit for multiple treated units', () => {
    const scores = [
      { entityId: 'e_0', score: 0.50, features: {}, receivedTreatment: true },
      { entityId: 'e_1', score: 0.51, features: {}, receivedTreatment: true },
      { entityId: 'e_2', score: 0.50, features: {}, receivedTreatment: false },
    ];

    const matches = matchByPropensityScore(scores, 0.1);

    // Only one control available so only one match possible
    expect(matches).toHaveLength(1);
  });

  it('should respect a tight caliper and exclude distant matches', () => {
    const scores = [
      { entityId: 'e_0', score: 0.50, features: {}, receivedTreatment: true },
      { entityId: 'e_1', score: 0.54, features: {}, receivedTreatment: false },
      { entityId: 'e_2', score: 0.56, features: {}, receivedTreatment: false },
    ];

    // caliper = 0.03 means only e_1 (distance 0.04) and e_2 (distance 0.06) are too far
    const matches = matchByPropensityScore(scores, 0.03);
    expect(matches).toHaveLength(0);
  });
});

// ============================================================================
// ATE WITH PROPENSITY SCORE MATCHING
// ============================================================================

describe('computeATEWithMatching', () => {
  it('should compute ATE on matched pairs and note propensity-matching in narrative', () => {
    const scores = [
      { entityId: 'e_0', score: 0.50, features: {}, receivedTreatment: true },
      { entityId: 'e_1', score: 0.52, features: {}, receivedTreatment: false },
      { entityId: 'e_2', score: 0.70, features: {}, receivedTreatment: true },
      { entityId: 'e_3', score: 0.71, features: {}, receivedTreatment: false },
      { entityId: 'e_4', score: 0.30, features: {}, receivedTreatment: true },
      { entityId: 'e_5', score: 0.31, features: {}, receivedTreatment: false },
    ];

    const outcomes = new Map<string, number>([
      ['e_0', 80],
      ['e_1', 60],
      ['e_2', 90],
      ['e_3', 65],
      ['e_4', 75],
      ['e_5', 55],
    ]);

    const effect = computeATEWithMatching(scores, outcomes, 0.1);

    // treated outcomes: [80, 90, 75], control outcomes: [60, 65, 55]
    // ATE should be about 21.67
    expect(effect.averageTreatmentEffect).toBeCloseTo(21.67, 0);
    expect(effect.naturalLanguage).toContain('propensity-matched');
    expect(effect.naturalLanguage).toContain('n=3 pairs');
  });

  it('should use default outcome of 0 for missing entityIds in outcomes map', () => {
    const scores = [
      { entityId: 'e_0', score: 0.50, features: {}, receivedTreatment: true },
      { entityId: 'e_1', score: 0.52, features: {}, receivedTreatment: false },
    ];

    // Only provide outcome for treated, not control
    const outcomes = new Map<string, number>([
      ['e_0', 100],
    ]);

    const effect = computeATEWithMatching(scores, outcomes, 0.1);

    // treated: [100], control: [0] => ATE = 100
    expect(effect.averageTreatmentEffect).toBe(100);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('computeATE should handle identical treated and control groups (zero effect)', () => {
    const data = [10, 12, 11, 13, 10, 12, 11, 13, 10, 12];

    const effect = computeATE(data, data);

    expect(effect.averageTreatmentEffect).toBeCloseTo(0, 10);
    expect(effect.isSignificant).toBe(false);
  });

  it('computeATE should handle two-element arrays (minimum for variance)', () => {
    const treated = [100, 110];
    const control = [50, 60];

    const effect = computeATE(treated, control);

    expect(effect.averageTreatmentEffect).toBeCloseTo(50, 5);
    expect(effect.treatedCount).toBe(2);
    expect(effect.controlCount).toBe(2);
    expect(effect.sampleSize).toBe(4);
  });

  it('computeATE should handle large values without overflow', () => {
    const treated = [1e8, 1.1e8, 1.05e8, 1.02e8, 0.98e8];
    const control = [5e7, 5.5e7, 5.2e7, 5.1e7, 4.9e7];

    const effect = computeATE(treated, control);

    expect(effect.averageTreatmentEffect).toBeGreaterThan(4e7);
    expect(Number.isFinite(effect.averageTreatmentEffect)).toBe(true);
    expect(Number.isFinite(effect.pValue)).toBe(true);
  });

  it('computeDifferenceInDifferences with no change in either group yields DiD near zero', () => {
    const pre  = [100, 100, 100, 100, 100];
    const post = [100, 100, 100, 100, 100];

    const did = computeDifferenceInDifferences(pre, post, pre, post);

    expect(did.didEstimate).toBeCloseTo(0, 5);
    expect(did.treatmentGroup.change).toBeCloseTo(0, 5);
    expect(did.controlGroup.change).toBeCloseTo(0, 5);
  });

  it('matchByPropensityScore with no treated units returns empty matches', () => {
    const scores = [
      { entityId: 'e_0', score: 0.5, features: {}, receivedTreatment: false },
      { entityId: 'e_1', score: 0.6, features: {}, receivedTreatment: false },
    ];

    const matches = matchByPropensityScore(scores, 0.2);
    expect(matches).toHaveLength(0);
  });

  it('matchByPropensityScore with no control units returns empty matches', () => {
    const scores = [
      { entityId: 'e_0', score: 0.5, features: {}, receivedTreatment: true },
      { entityId: 'e_1', score: 0.6, features: {}, receivedTreatment: true },
    ];

    const matches = matchByPropensityScore(scores, 0.2);
    expect(matches).toHaveLength(0);
  });
});
