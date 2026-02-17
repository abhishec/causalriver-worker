/**
 * OutcomeOracle Tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tests the autonomous prediction verification system (Gap 4).
 *
 * The OutcomeOracle closes the feedback loop WITHOUT human input:
 *   - Brain predicts "support escalations will increase 48h from now"
 *   - Oracle registers prediction + baseline
 *   - 48h later, connector sync brings new Slack signals
 *   - Oracle autonomously compares actual vs predicted
 *   - Oracle rewards/penalizes the bandit arm that made the prediction
 *   - Feedback loop adjusts causal edge weights
 *
 * The brain learns from its OWN signals — fully autonomous.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  createOutcomeOracle,
  computeActualOutcome,
  evaluatePrediction,
  computeBanditReward,
  findMatchingSignals,
  buildWatchedPrediction,
  type WatchedPrediction,
  type IncomingSignal,
} from '../causality/outcome-oracle';

import {
  createCausalMethodBandit,
  BANDIT_ARMS,
  type BanditArm,
} from '../causality/causal-method-bandit';

// ============================================================================
// CONSTANTS
// ============================================================================

const ORG_ID = 'org_oracle_test_001';

// ============================================================================
// SIGNAL HELPERS
// ============================================================================

function makeSignal(overrides: Partial<IncomingSignal> = {}): IncomingSignal {
  return {
    source_domain: 'support',
    signal_type: 'escalation_volume',
    signal_value: 0.6,
    signal_timestamp: new Date(Date.now() + 1000).toISOString(), // 1s in future
    organization_id: ORG_ID,
    ...overrides,
  };
}

function makePrediction(overrides: Partial<WatchedPrediction> = {}): WatchedPrediction {
  const now = new Date();
  return {
    predictionId: 'pred_001',
    organizationId: ORG_ID,
    sourceDomain: 'engineering',
    targetDomain: 'support',
    watchMetric: 'support.escalation_volume',
    watchSignalType: 'escalation_volume',
    watchDomain: 'support',
    baselineValue: 0.3,
    baselineTimestamp: new Date(now.getTime() - 1000), // 1s ago
    predictedDirection: 'increase',
    predictedMagnitude: 0.5,
    confidence: 0.72,
    verifyAfter: new Date(now.getTime() - 1000), // already past (ready to verify)
    expiresAt: new Date(now.getTime() + 24 * 3600 * 1000), // 24h from now
    discoveryMethod: 'transfer_entropy',
    status: 'pending',
    ...overrides,
  };
}

// ============================================================================
// TEST SUITE 1: PURE MATH FUNCTIONS
// ============================================================================

describe('🔢 OutcomeOracle — Core Math Functions', () => {
  describe('computeActualOutcome', () => {
    it('returns stable for signals within ±5% of baseline', () => {
      const baseline = 0.50;
      const signals = [
        makeSignal({ signal_value: 0.51 }),
        makeSignal({ signal_value: 0.49 }),
        makeSignal({ signal_value: 0.50 }),
      ];
      const result = computeActualOutcome(signals, baseline, 0.05);
      expect(result.direction).toBe('stable');
      expect(Math.abs(result.magnitude)).toBeLessThanOrEqual(0.05);
    });

    it('returns increase when signals are significantly above baseline', () => {
      const baseline = 0.30;
      const signals = [
        makeSignal({ signal_value: 0.65 }),
        makeSignal({ signal_value: 0.70 }),
        makeSignal({ signal_value: 0.68 }),
      ];
      const result = computeActualOutcome(signals, baseline, 0.05);
      expect(result.direction).toBe('increase');
      expect(result.magnitude).toBeGreaterThan(0);
    });

    it('returns decrease when signals are significantly below baseline', () => {
      const baseline = 0.70;
      const signals = [
        makeSignal({ signal_value: 0.30 }),
        makeSignal({ signal_value: 0.25 }),
        makeSignal({ signal_value: 0.28 }),
      ];
      const result = computeActualOutcome(signals, baseline, 0.05);
      expect(result.direction).toBe('decrease');
      expect(result.magnitude).toBeLessThan(0);
    });

    it('returns actualValue as mean of signal values', () => {
      const signals = [
        makeSignal({ signal_value: 0.4 }),
        makeSignal({ signal_value: 0.6 }),
        makeSignal({ signal_value: 0.5 }),
      ];
      const result = computeActualOutcome(signals, 0.3, 0.05);
      expect(result.actualValue).toBeCloseTo(0.5, 5);
    });

    it('clamps magnitude to [-1, 1]', () => {
      const baseline = 0.01; // Very small baseline
      const signals = [makeSignal({ signal_value: 1.0 })];
      const result = computeActualOutcome(signals, baseline, 0.05);
      expect(result.magnitude).toBeLessThanOrEqual(1);
      expect(result.magnitude).toBeGreaterThanOrEqual(-1);
    });

    it('returns stable with magnitude=0 for empty signals', () => {
      const result = computeActualOutcome([], 0.5, 0.05);
      expect(result.direction).toBe('stable');
      expect(result.magnitude).toBe(0);
      expect(result.actualValue).toBe(0.5); // Returns baseline
    });

    it('handles zero baseline correctly (no division by zero)', () => {
      const signals = [makeSignal({ signal_value: 0.3 })];
      // Should use (actualValue - baseline) when baseline === 0
      expect(() => computeActualOutcome(signals, 0, 0.05)).not.toThrow();
    });
  });

  describe('evaluatePrediction', () => {
    it('wasCorrect=true when direction matches AND magnitudeError ≤ 0.3', () => {
      const result = evaluatePrediction(
        { direction: 'increase', magnitude: 0.5 },
        { direction: 'increase', magnitude: 0.6 },
      );
      expect(result.directionCorrect).toBe(true);
      expect(result.magnitudeError).toBeCloseTo(0.1, 5);
      expect(result.wasCorrect).toBe(true);
    });

    it('wasCorrect=false when direction is wrong', () => {
      const result = evaluatePrediction(
        { direction: 'increase', magnitude: 0.5 },
        { direction: 'decrease', magnitude: -0.4 },
      );
      expect(result.directionCorrect).toBe(false);
      expect(result.wasCorrect).toBe(false);
    });

    it('wasCorrect=false when direction right but magnitude error > 0.3', () => {
      const result = evaluatePrediction(
        { direction: 'increase', magnitude: 0.2 },
        { direction: 'increase', magnitude: 0.8 }, // magnitudeError = 0.6
      );
      expect(result.directionCorrect).toBe(true);
      expect(result.magnitudeError).toBeCloseTo(0.6, 5);
      expect(result.wasCorrect).toBe(false);
    });

    it('computes magnitudeError = |predicted - actual|', () => {
      const result = evaluatePrediction(
        { direction: 'stable', magnitude: 0.0 },
        { direction: 'stable', magnitude: 0.05 },
      );
      expect(result.magnitudeError).toBeCloseTo(0.05, 5);
    });

    it('stable matching stable = wasCorrect=true', () => {
      const result = evaluatePrediction(
        { direction: 'stable', magnitude: 0.0 },
        { direction: 'stable', magnitude: 0.02 },
      );
      expect(result.directionCorrect).toBe(true);
      expect(result.wasCorrect).toBe(true);
    });
  });

  describe('computeBanditReward', () => {
    it('returns 0.0 for wrong prediction', () => {
      expect(computeBanditReward({ wasCorrect: false, magnitudeError: 0.5 })).toBe(0.0);
    });

    it('returns 1.0 for perfect prediction (no magnitude error)', () => {
      expect(computeBanditReward({ wasCorrect: true, magnitudeError: 0.0 })).toBe(1.0);
    });

    it('returns 0.6 for correct direction but maximal magnitude error (1.0)', () => {
      expect(computeBanditReward({ wasCorrect: true, magnitudeError: 1.0 })).toBeCloseTo(0.6, 5);
    });

    it('returns value in [0.6, 1.0] for correct predictions', () => {
      for (const error of [0, 0.1, 0.2, 0.3]) {
        const reward = computeBanditReward({ wasCorrect: true, magnitudeError: error });
        expect(reward).toBeGreaterThanOrEqual(0.6);
        expect(reward).toBeLessThanOrEqual(1.0);
      }
    });

    it('reward formula: 0.6 + 0.4 × (1 - magnitudeError)', () => {
      const reward = computeBanditReward({ wasCorrect: true, magnitudeError: 0.25 });
      // 0.6 + 0.4 × (1 - 0.25) = 0.6 + 0.4 × 0.75 = 0.6 + 0.30 = 0.90
      expect(reward).toBeCloseTo(0.90, 5);
    });
  });

  describe('findMatchingSignals', () => {
    const basePrediction = makePrediction();

    it('matches signals with correct domain and signal_type', () => {
      const signals: IncomingSignal[] = [
        makeSignal({ source_domain: 'support', signal_type: 'escalation_volume', signal_value: 0.7 }),
        makeSignal({ source_domain: 'engineering', signal_type: 'ci_failed', signal_value: -1 }), // different domain
      ];
      const matches = findMatchingSignals(basePrediction, signals);
      expect(matches).toHaveLength(1);
      expect(matches[0].signal_type).toBe('escalation_volume');
    });

    it('filters out signals from wrong organization', () => {
      const signals: IncomingSignal[] = [
        makeSignal({ organization_id: 'other_org_999' }),
      ];
      const matches = findMatchingSignals(basePrediction, signals);
      expect(matches).toHaveLength(0);
    });

    it('filters out signals with timestamp BEFORE baseline (pre-prediction signals)', () => {
      const predBaseline = new Date('2024-10-15T10:00:00Z');
      const pred = makePrediction({ baselineTimestamp: predBaseline });

      const signals: IncomingSignal[] = [
        makeSignal({ signal_timestamp: '2024-10-15T09:59:00Z' }), // Before baseline
        makeSignal({ signal_timestamp: '2024-10-15T10:01:00Z' }), // After baseline
      ];

      const matches = findMatchingSignals(pred, signals);
      expect(matches).toHaveLength(1);
      expect(matches[0].signal_timestamp).toBe('2024-10-15T10:01:00Z');
    });

    it('matches wildcard domain (*) against any domain', () => {
      const wildcardPred = makePrediction({ watchDomain: '*', watchSignalType: 'escalation_volume' });
      const signals: IncomingSignal[] = [
        makeSignal({ source_domain: 'support' }),
        makeSignal({ source_domain: 'product' }),  // Different domain, but wildcard matches
        makeSignal({ source_domain: 'engineering' }),
      ];

      // All signals match wildcard
      const matches = findMatchingSignals(wildcardPred, signals);
      expect(matches).toHaveLength(3);
    });

    it('returns empty array when no signals match', () => {
      const signals: IncomingSignal[] = [
        makeSignal({ signal_type: 'ci_failed', source_domain: 'engineering' }),
      ];
      const matches = findMatchingSignals(basePrediction, signals);
      expect(matches).toHaveLength(0);
    });
  });
});

// ============================================================================
// TEST SUITE 2: ORACLE FACTORY
// ============================================================================

describe('🔮 OutcomeOracle — Factory & Core Behavior', () => {
  it('creates oracle with all required methods', () => {
    const oracle = createOutcomeOracle({});
    expect(typeof oracle.registerPrediction).toBe('function');
    expect(typeof oracle.processBatch).toBe('function');
    expect(typeof oracle.getPredictions).toBe('function');
    expect(typeof oracle.getPendingPredictions).toBe('function');
    expect(typeof oracle.getAccuracyStats).toBe('function');
    expect(typeof oracle.cancelPrediction).toBe('function');
    expect(typeof oracle.pruneCompleted).toBe('function');
    expect(typeof oracle.loadFromSupabase).toBe('function');
  });

  it('registerPrediction stores prediction in pending state', () => {
    const oracle = createOutcomeOracle({});
    oracle.registerPrediction(makePrediction());

    const pending = oracle.getPendingPredictions();
    expect(pending).toHaveLength(1);
    expect(pending[0].predictionId).toBe('pred_001');
    expect(pending[0].status).toBe('pending');
  });

  it('processBatch with no pending predictions returns zero verifications', async () => {
    const oracle = createOutcomeOracle({});
    const result = await oracle.processBatch([makeSignal()]);
    expect(result.predictionsVerified).toBe(0);
    expect(result.predictionsChecked).toBe(0);
  });

  it('processBatch verifies prediction when matching signals arrive', async () => {
    const oracle = createOutcomeOracle({
      minSignalsForVerification: 1, // Only need 1 signal for test
    });

    oracle.registerPrediction(makePrediction({
      baselineValue: 0.30,
      predictedDirection: 'increase',
      predictedMagnitude: 0.50,
    }));

    // Signals showing escalation increased from baseline 0.30 to ~0.60
    const signals = [
      makeSignal({ signal_value: 0.60 }),
      makeSignal({ signal_value: 0.62 }),
      makeSignal({ signal_value: 0.58 }),
    ];

    const result = await oracle.processBatch(signals);

    expect(result.predictionsVerified).toBe(1);
    expect(result.predictionsChecked).toBe(1);
    expect(result.verifications).toHaveLength(1);

    const v = result.verifications[0];
    expect(v.predictionId).toBe('pred_001');
    expect(v.actualDirection).toBe('increase'); // 0.60 vs baseline 0.30 = +100%
    expect(v.directionCorrect).toBe(true);
    expect(typeof v.banditReward).toBe('number');
    expect(v.banditReward).toBeGreaterThanOrEqual(0);
    expect(v.banditReward).toBeLessThanOrEqual(1);
  });

  it('processBatch marks prediction as verified (removed from pending)', async () => {
    const oracle = createOutcomeOracle({ minSignalsForVerification: 1 });
    oracle.registerPrediction(makePrediction());

    expect(oracle.getPendingPredictions()).toHaveLength(1);

    await oracle.processBatch([makeSignal({ signal_value: 0.7 })]);

    expect(oracle.getPendingPredictions()).toHaveLength(0);
    expect(oracle.getPredictions()).toHaveLength(1); // Still tracked, but status=verified
    expect(oracle.getPredictions()[0].status).toBe('verified');
  });

  it('processBatch skips predictions not yet due (verifyAfter in future)', async () => {
    const oracle = createOutcomeOracle({ minSignalsForVerification: 1 });
    oracle.registerPrediction(makePrediction({
      verifyAfter: new Date(Date.now() + 48 * 3600 * 1000), // 48h in future
    }));

    const result = await oracle.processBatch([makeSignal()]);
    expect(result.predictionsVerified).toBe(0);
    expect(result.predictionsPending).toBe(1);
  });

  it('processBatch expires predictions past expiresAt', async () => {
    const oracle = createOutcomeOracle({ minSignalsForVerification: 1 });
    oracle.registerPrediction(makePrediction({
      verifyAfter: new Date(Date.now() - 2 * 3600 * 1000), // 2h ago
      expiresAt: new Date(Date.now() - 1000), // Already expired (1s ago)
    }));

    // No matching signals needed — it should expire
    const result = await oracle.processBatch([]);
    expect(result.predictionsExpired).toBe(1);
    expect(result.predictionsVerified).toBe(0);
  });

  it('processBatch stays pending when signals < minSignalsForVerification', async () => {
    const oracle = createOutcomeOracle({ minSignalsForVerification: 5 });
    oracle.registerPrediction(makePrediction());

    // Only 2 signals, need 5
    const signals = [makeSignal(), makeSignal()];
    const result = await oracle.processBatch(signals);

    expect(result.predictionsVerified).toBe(0);
    expect(result.predictionsPending).toBe(1);
  });
});

// ============================================================================
// TEST SUITE 3: BANDIT INTEGRATION
// ============================================================================

describe('🎰 OutcomeOracle × UCB1 Bandit — Autonomous Learning', () => {
  it('rewards bandit arm when prediction is correct', async () => {
    const bandit = createCausalMethodBandit({ minPullsForTrust: 1 });
    const oracle = createOutcomeOracle({
      bandit,
      minSignalsForVerification: 1,
      updateFeedbackLoop: false, // Disable feedback loop for isolated bandit test
    });

    // Predict: escalation_volume will increase by ~0.5 from baseline 0.30
    // Signals will show: 0.43 (which is +43% relative change, magnitude ≈ 0.43)
    // predicted magnitude = 0.43 → error = |0.43 - 0.43| = 0.0 → reward = 1.0
    const actualSignalValue = 0.30 * (1 + 0.43); // = 0.429 → relative change = 0.43
    oracle.registerPrediction(makePrediction({
      discoveryMethod: 'transfer_entropy',
      baselineValue: 0.30,
      predictedDirection: 'increase',
      predictedMagnitude: 0.43, // matches what oracle will compute
    }));

    const signals = [makeSignal({ signal_value: actualSignalValue })];
    await oracle.processBatch(signals);

    // Bandit should have been rewarded for 'transfer_entropy'
    const state = bandit.getPairState('engineering', 'support');
    expect(state).toBeDefined();
    const te = state!.arms.get('transfer_entropy');
    expect(te).toBeDefined();
    expect(te!.pulls).toBe(1); // Got one reward update
    expect(te!.empiricalMean).toBeGreaterThan(0); // Non-zero reward (correct prediction)
  });

  it('penalizes bandit arm with reward=0 when prediction expires', async () => {
    const bandit = createCausalMethodBandit({ minPullsForTrust: 1 });
    const oracle = createOutcomeOracle({
      bandit,
      minSignalsForVerification: 1,
      updateFeedbackLoop: false,
    });

    oracle.registerPrediction(makePrediction({
      discoveryMethod: 'apex',
      verifyAfter: new Date(Date.now() - 2 * 3600 * 1000),
      expiresAt: new Date(Date.now() - 1000), // expired
    }));

    await oracle.processBatch([]);

    // 'apex' should have received reward=0 (expiry = failed prediction)
    const state = bandit.getPairState('engineering', 'support');
    expect(state).toBeDefined();
    const apexArm = state!.arms.get('apex');
    expect(apexArm).toBeDefined();
    expect(apexArm!.pulls).toBe(1);
    expect(apexArm!.empiricalMean).toBe(0); // reward=0
  });

  it('bandit learns over multiple oracle verification cycles', async () => {
    const bandit = createCausalMethodBandit({ minPullsForTrust: 2, explorationConstant: 0.5 });
    const oracle = createOutcomeOracle({
      bandit,
      minSignalsForVerification: 1,
      updateFeedbackLoop: false,
    });

    // Simulate 20 verification cycles
    // 'transfer_entropy' predictions are consistently correct
    // 'apex' predictions are consistently wrong
    for (let cycle = 0; cycle < 20; cycle++) {
      const predId = `pred_te_${cycle}`;
      const now = new Date();

      oracle.registerPrediction({
        predictionId: predId,
        organizationId: ORG_ID,
        sourceDomain: 'engineering',
        targetDomain: 'support',
        watchMetric: 'support.escalation_volume',
        watchSignalType: 'escalation_volume',
        watchDomain: 'support',
        baselineValue: 0.30,
        baselineTimestamp: new Date(now.getTime() - 1000),
        predictedDirection: 'increase',
        predictedMagnitude: 0.5,
        confidence: 0.75,
        verifyAfter: new Date(now.getTime() - 500), // ready to verify
        expiresAt: new Date(now.getTime() + 24 * 3600 * 1000),
        discoveryMethod: 'transfer_entropy',
        status: 'pending',
      });
    }

    // All predictions confirmed: escalation increased ~50% from baseline (matches predictedMagnitude=0.5)
    // baseline=0.30, want 50% increase relative: 0.30 * 1.50 = 0.45 → relative = 0.50 → magnitude=0.50, error≈0
    for (let i = 0; i < 20; i++) {
      await oracle.processBatch([
        makeSignal({ signal_value: 0.45 }), // +50% from baseline 0.30, matches predicted magnitude 0.50
      ]);
    }

    // Also give 'apex' some wrong predictions (decrease predicted, increase happened)
    for (let i = 0; i < 10; i++) {
      bandit.updateArm('engineering', 'support', 'apex', 0.0);
    }

    // 'transfer_entropy' should now be best arm for this pair
    const best = bandit.getBestMethod('engineering', 'support');
    expect(best).toBe('transfer_entropy');
  });

  it('different domain pairs have independent oracle learning', async () => {
    const bandit = createCausalMethodBandit({ minPullsForTrust: 1 });
    const oracle = createOutcomeOracle({
      bandit,
      minSignalsForVerification: 1,
      updateFeedbackLoop: false,
    });

    const now = new Date();

    // Prediction for engineering → support pair (uses transfer_entropy, correct)
    oracle.registerPrediction(makePrediction({
      predictionId: 'pred_eng_sup',
      sourceDomain: 'engineering',
      targetDomain: 'support',
      watchDomain: 'support',
      watchSignalType: 'escalation_volume',
      discoveryMethod: 'transfer_entropy',
      predictedDirection: 'increase',
      baselineValue: 0.3,
      baselineTimestamp: new Date(now.getTime() - 1000),
      verifyAfter: new Date(now.getTime() - 500),
    }));

    // Prediction for product → revenue pair (uses pc_structural, correct)
    oracle.registerPrediction(makePrediction({
      predictionId: 'pred_prod_rev',
      sourceDomain: 'product',
      targetDomain: 'revenue',
      watchDomain: 'revenue',
      watchSignalType: 'revenue_rate',
      discoveryMethod: 'pc_structural',
      predictedDirection: 'increase',
      baselineValue: 0.5,
      baselineTimestamp: new Date(now.getTime() - 1000),
      verifyAfter: new Date(now.getTime() - 500),
    }));

    await oracle.processBatch([
      makeSignal({ source_domain: 'support', signal_type: 'escalation_volume', signal_value: 0.7 }),
      makeSignal({ source_domain: 'revenue', signal_type: 'revenue_rate', signal_value: 0.8, organization_id: ORG_ID }),
    ]);

    // engineering→support: transfer_entropy was rewarded
    const engState = bandit.getPairState('engineering', 'support');
    const prodState = bandit.getPairState('product', 'revenue');

    expect(engState?.arms.get('transfer_entropy')?.pulls).toBe(1);
    expect(prodState?.arms.get('pc_structural')?.pulls).toBe(1);

    // They are independent — transfer_entropy was NOT rewarded for product→revenue pair
    expect(prodState?.arms.get('transfer_entropy')?.pulls ?? 0).toBe(0);
  });
});

// ============================================================================
// TEST SUITE 4: buildWatchedPrediction HELPER
// ============================================================================

describe('🏗️ buildWatchedPrediction — Convenience Helper', () => {
  it('creates a WatchedPrediction from a causal relationship', () => {
    const relationship = {
      organization_id: ORG_ID,
      source_domain: 'engineering',
      target_domain: 'support',
      effect_size: 0.65,
      optimal_lag_days: 2,
      natural_language: 'engineering Granger-causes support',
    };

    const pred = buildWatchedPrediction(
      relationship,
      0.30, // current metric value
      'escalation_volume',
      'transfer_entropy',
    );

    expect(pred.organizationId).toBe(ORG_ID);
    expect(pred.sourceDomain).toBe('engineering');
    expect(pred.targetDomain).toBe('support');
    expect(pred.watchSignalType).toBe('escalation_volume');
    expect(pred.watchDomain).toBe('support');
    expect(pred.baselineValue).toBe(0.30);
    expect(pred.discoveryMethod).toBe('transfer_entropy');
    expect(pred.status).toBe('pending');
  });

  it('sets predicted direction to increase for positive effect_size', () => {
    const pred = buildWatchedPrediction(
      { organization_id: ORG_ID, source_domain: 'a', target_domain: 'b', effect_size: 0.5, optimal_lag_days: 1, natural_language: 'a→b' },
      0.3, 'metric',
    );
    expect(pred.predictedDirection).toBe('increase');
  });

  it('sets predicted direction to decrease for negative effect_size', () => {
    const pred = buildWatchedPrediction(
      { organization_id: ORG_ID, source_domain: 'a', target_domain: 'b', effect_size: -0.5, optimal_lag_days: 1, natural_language: 'a→b' },
      0.3, 'metric',
    );
    expect(pred.predictedDirection).toBe('decrease');
  });

  it('sets predicted direction to stable for near-zero effect_size (|x| < 0.05)', () => {
    const pred = buildWatchedPrediction(
      { organization_id: ORG_ID, source_domain: 'a', target_domain: 'b', effect_size: 0.02, optimal_lag_days: 1, natural_language: 'a→b' },
      0.3, 'metric',
    );
    expect(pred.predictedDirection).toBe('stable');
  });

  it('verifyAfter is set to baseline + optimal_lag_days', () => {
    const before = new Date();
    const pred = buildWatchedPrediction(
      { organization_id: ORG_ID, source_domain: 'a', target_domain: 'b', effect_size: 0.5, optimal_lag_days: 2, natural_language: 'a→b' },
      0.3, 'metric',
    );
    const after = new Date();

    const expectedLagMs = 2 * 24 * 3600 * 1000;
    const verifyAfterMs = pred.verifyAfter.getTime();

    // Should be approximately now + 2 days
    expect(verifyAfterMs).toBeGreaterThanOrEqual(before.getTime() + expectedLagMs - 100);
    expect(verifyAfterMs).toBeLessThanOrEqual(after.getTime() + expectedLagMs + 100);
  });

  it('expiresAt is set to 3x lag by default', () => {
    const pred = buildWatchedPrediction(
      { organization_id: ORG_ID, source_domain: 'a', target_domain: 'b', effect_size: 0.5, optimal_lag_days: 2, natural_language: 'a→b' },
      0.3, 'metric',
    );
    const lagMs = 2 * 24 * 3600 * 1000;
    const expectedExpiryMs = pred.verifyAfter.getTime() + 2 * lagMs; // verifyAfter + remaining 2x lag

    // expiresAt should be approximately 3x lag from now
    // (verifyAfter is 1x lag, expiresAt is 3x lag → gap is 2x lag)
    const gap = pred.expiresAt.getTime() - pred.verifyAfter.getTime();
    expect(gap).toBeCloseTo(2 * lagMs, -3); // Within ±1000ms
  });

  it('uses custom predictionId when provided', () => {
    const pred = buildWatchedPrediction(
      { organization_id: ORG_ID, source_domain: 'a', target_domain: 'b', effect_size: 0.5, optimal_lag_days: 1, natural_language: 'a→b' },
      0.3, 'metric', undefined,
      { predictionId: 'custom_pred_xyz' },
    );
    expect(pred.predictionId).toBe('custom_pred_xyz');
  });

  it('clamps predictedMagnitude to [-1, 1]', () => {
    const pred = buildWatchedPrediction(
      { organization_id: ORG_ID, source_domain: 'a', target_domain: 'b', effect_size: 1.5, optimal_lag_days: 1, natural_language: 'a→b' },
      0.3, 'metric',
    );
    expect(pred.predictedMagnitude).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// TEST SUITE 5: ORACLE MANAGEMENT
// ============================================================================

describe('🛠️ OutcomeOracle — Management Operations', () => {
  it('cancelPrediction marks prediction as expired', () => {
    const oracle = createOutcomeOracle({});
    oracle.registerPrediction(makePrediction());

    const cancelled = oracle.cancelPrediction('pred_001');
    expect(cancelled).toBe(true);
    expect(oracle.getPendingPredictions()).toHaveLength(0);
    // Status changed to expired
    const preds = oracle.getPredictions();
    expect(preds[0].status).toBe('expired');
  });

  it('cancelPrediction returns false for unknown prediction', () => {
    const oracle = createOutcomeOracle({});
    expect(oracle.cancelPrediction('nonexistent_pred')).toBe(false);
  });

  it('pruneCompleted removes verified/expired predictions, keeps pending', async () => {
    const oracle = createOutcomeOracle({ minSignalsForVerification: 1 });

    // Register 3 predictions: 1 pending, 1 to be verified, 1 to be cancelled
    oracle.registerPrediction(makePrediction({
      predictionId: 'pred_pending',
      verifyAfter: new Date(Date.now() + 24 * 3600 * 1000), // future
    }));
    oracle.registerPrediction(makePrediction({
      predictionId: 'pred_verify',
      verifyAfter: new Date(Date.now() - 1000),
    }));
    oracle.registerPrediction(makePrediction({
      predictionId: 'pred_cancel',
    }));
    oracle.cancelPrediction('pred_cancel');

    // Verify one
    await oracle.processBatch([makeSignal()]);

    // Before prune: 3 predictions total
    expect(oracle.getPredictions().length).toBe(3);

    const pruned = oracle.pruneCompleted();
    // Should have pruned pred_verify (verified) and pred_cancel (expired)
    expect(pruned).toBe(2);

    // Only pred_pending remains
    expect(oracle.getPredictions().length).toBe(1);
    expect(oracle.getPredictions()[0].predictionId).toBe('pred_pending');
  });

  it('getAccuracyStats returns correct structure', () => {
    const oracle = createOutcomeOracle({});
    const stats = oracle.getAccuracyStats();

    expect(stats).toHaveProperty('totalVerified');
    expect(stats).toHaveProperty('correctCount');
    expect(stats).toHaveProperty('accuracyRate');
    expect(stats).toHaveProperty('directionAccuracy');
    expect(stats).toHaveProperty('meanMagnitudeError');
    expect(stats).toHaveProperty('byMethod');
    expect(Array.isArray(stats.byMethod)).toBe(true);
  });

  it('processBatch result includes duration and signal count', async () => {
    const oracle = createOutcomeOracle({});
    const signals = [makeSignal(), makeSignal(), makeSignal()];
    const result = await oracle.processBatch(signals);

    expect(result.signalsProcessed).toBe(3);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('processBatch handles multiple predictions simultaneously', async () => {
    const oracle = createOutcomeOracle({ minSignalsForVerification: 1 });

    const now = new Date();
    for (let i = 0; i < 5; i++) {
      oracle.registerPrediction(makePrediction({
        predictionId: `pred_${i}`,
        predictedDirection: 'increase',
      }));
    }

    const signals = [makeSignal({ signal_value: 0.8 })]; // All should verify as correct
    const result = await oracle.processBatch(signals);

    expect(result.predictionsVerified).toBe(5);
    expect(result.verifications).toHaveLength(5);
  });

  it('loadFromSupabase returns 0 when no supabase configured', async () => {
    const oracle = createOutcomeOracle({}); // No supabase
    const result = await oracle.loadFromSupabase('any_org');
    expect(result.loaded).toBe(0);
  });

  it('loadFromSupabase loads predictions from Supabase when configured', async () => {
    const mockRows = [
      {
        id: 'persisted_pred_001',
        organization_id: ORG_ID,
        source_domain: 'engineering',
        target_domain: 'support',
        watch_metric: 'support.escalation_volume',
        watch_signal_type: 'escalation_volume',
        watch_domain: 'support',
        baseline_value: 0.35,
        baseline_timestamp: new Date().toISOString(),
        predicted_direction: 'increase',
        predicted_magnitude: 0.4,
        confidence: 0.70,
        verify_after: new Date(Date.now() + 3600_000).toISOString(),
        expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
        discovery_method: 'apex',
        relationship_id: null,
        status: 'pending',
      },
    ];

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              data: mockRows,
              error: null,
            }),
          }),
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as any;

    const oracle = createOutcomeOracle({ supabase, organizationId: ORG_ID });
    const result = await oracle.loadFromSupabase(ORG_ID);

    expect(result.loaded).toBe(1);
    expect(oracle.getPendingPredictions()).toHaveLength(1);
    expect(oracle.getPendingPredictions()[0].predictionId).toBe('persisted_pred_001');
  });
});

// ============================================================================
// TEST SUITE 6: END-TO-END BRAIN LEARNING LOOP (FULL AUTONOMOUS CYCLE)
// ============================================================================

describe('🔄 End-to-End: Fully Autonomous Brain Learning Loop', () => {
  it('complete cycle: causal discovery → register → signal arrives → verify → bandit rewarded', async () => {
    // ── Setup ──────────────────────────────────────────────────────────────
    const bandit = createCausalMethodBandit({ minPullsForTrust: 1 });
    const oracle = createOutcomeOracle({
      bandit,
      minSignalsForVerification: 2,
      updateFeedbackLoop: false,
      stableThreshold: 0.05,
    });

    // ── Step 1: Discovery found a relationship ─────────────────────────────
    const discoveredRelationship = {
      organization_id: ORG_ID,
      source_domain: 'engineering',
      target_domain: 'support',
      effect_size: 0.65,   // positive → predicts support will increase when engineering drops
      optimal_lag_days: 2,
      natural_language: 'Engineering CI failures Granger-cause support escalations',
    };

    // ── Step 2: Register prediction with current baseline ──────────────────
    const prediction = buildWatchedPrediction(
      discoveredRelationship,
      0.25, // current support escalation baseline
      'escalation_volume',
      'transfer_entropy', // this method made the discovery
      { predictionId: 'e2e_pred_001', confidence: 0.72 },
    );

    // Override timing for test (set verifyAfter to past)
    prediction.verifyAfter = new Date(Date.now() - 1000);
    prediction.expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    prediction.baselineTimestamp = new Date(Date.now() - 2000);

    oracle.registerPrediction(prediction);

    expect(oracle.getPendingPredictions()).toHaveLength(1);

    // ── Step 3: 48 hours later, connector sync brings new signals ──────────
    // Escalation DID increase ~65% from baseline 0.25 (matching predicted magnitude 0.65)
    // target: 0.25 * (1 + 0.65) = 0.4125 → relativeChange = (0.4125 - 0.25) / 0.25 = 0.65 → magnitude=0.65
    // magnitudeError = |0.65 - 0.65| = 0.0 → wasCorrect=true, reward=1.0
    const newSignals: IncomingSignal[] = [
      { source_domain: 'support', signal_type: 'escalation_volume', signal_value: 0.41, signal_timestamp: new Date().toISOString(), organization_id: ORG_ID },
      { source_domain: 'support', signal_type: 'escalation_volume', signal_value: 0.42, signal_timestamp: new Date().toISOString(), organization_id: ORG_ID },
      { source_domain: 'support', signal_type: 'escalation_volume', signal_value: 0.41, signal_timestamp: new Date().toISOString(), organization_id: ORG_ID },
    ];

    // ── Step 4: Oracle autonomously verifies ─────────────────────────────
    const result = await oracle.processBatch(newSignals);

    expect(result.predictionsVerified).toBe(1);
    expect(result.verifications[0].directionCorrect).toBe(true); // increase predicted + actual
    expect(result.verifications[0].banditReward).toBeGreaterThan(0.6);

    // ── Step 5: Bandit was automatically rewarded ─────────────────────────
    expect(result.banditRewardsGiven).toBe(1);
    expect(result.verifications[0].discoveryMethod).toBe('transfer_entropy');

    const state = bandit.getPairState('engineering', 'support');
    expect(state?.arms.get('transfer_entropy')?.pulls).toBe(1);
    expect(state?.arms.get('transfer_entropy')?.empiricalMean).toBeGreaterThan(0.6);

    // ── Step 6: Brain learns — prediction no longer pending ───────────────
    expect(oracle.getPendingPredictions()).toHaveLength(0);
    expect(oracle.getPredictions()[0].status).toBe('verified');

    // ── Conclusion: FULLY AUTONOMOUS — no human called verifyPrediction() ──
    // The oracle watched incoming signals and self-verified, updating the bandit.
    // This is what makes the brain truly "self-improving" with no human in the loop.
  });

  it('wrong prediction → bandit arm penalized (reward=0)', async () => {
    const bandit = createCausalMethodBandit({ minPullsForTrust: 1 });
    const oracle = createOutcomeOracle({
      bandit,
      minSignalsForVerification: 1,
      updateFeedbackLoop: false,
    });

    // Prediction: support escalations will DECREASE
    oracle.registerPrediction(makePrediction({
      predictedDirection: 'decrease',
      predictedMagnitude: -0.4,
      baselineValue: 0.7,
      discoveryMethod: 'pc_structural',
    }));

    // Actual: support escalations INCREASED
    const signals = [makeSignal({ signal_value: 0.95 })]; // way up from 0.7 baseline

    const result = await oracle.processBatch(signals);

    expect(result.predictionsVerified).toBe(1);
    expect(result.verifications[0].directionCorrect).toBe(false);
    expect(result.verifications[0].wasCorrect).toBe(false);
    expect(result.verifications[0].banditReward).toBe(0.0);

    // pc_structural was penalized (reward=0)
    const state = bandit.getPairState('engineering', 'support');
    expect(state?.arms.get('pc_structural')?.empiricalMean).toBe(0);
  });

  it('over 10 cycles, oracle-driven bandit converges to correct method', async () => {
    const bandit = createCausalMethodBandit({ minPullsForTrust: 2, explorationConstant: 1.0 });
    const oracle = createOutcomeOracle({
      bandit,
      minSignalsForVerification: 1,
      updateFeedbackLoop: false,
    });

    const now = new Date();
    let predCounter = 0;

    // Simulate 10 cycles where 'transfer_entropy' predictions are always correct
    // Baseline=0.30, predicted magnitude=0.50, need signal at 0.30*(1+0.50)=0.45
    for (let cycle = 0; cycle < 10; cycle++) {
      oracle.registerPrediction({
        predictionId: `cycle_pred_${predCounter++}`,
        organizationId: ORG_ID,
        sourceDomain: 'engineering',
        targetDomain: 'support',
        watchMetric: 'support.escalation_volume',
        watchSignalType: 'escalation_volume',
        watchDomain: 'support',
        baselineValue: 0.30,
        baselineTimestamp: new Date(now.getTime() - 2000),
        predictedDirection: 'increase',
        predictedMagnitude: 0.50, // target: signal at 0.30*(1+0.50)=0.45
        confidence: 0.75,
        verifyAfter: new Date(now.getTime() - 1000),
        expiresAt: new Date(now.getTime() + 24 * 3600 * 1000),
        discoveryMethod: 'transfer_entropy',
        status: 'pending',
      });

      // Signal at exactly 0.45 → relativeChange=(0.45-0.30)/0.30=0.50 → magnitude=0.50 → error=0
      await oracle.processBatch([makeSignal({ signal_value: 0.45 })]);
    }

    // Also give 'apex' bad rewards explicitly
    for (let i = 0; i < 10; i++) {
      bandit.updateArm('engineering', 'support', 'apex', 0.0);
    }

    // After 10 cycles, transfer_entropy should be the best arm
    const best = bandit.getBestMethod('engineering', 'support');
    expect(best).toBe('transfer_entropy');

    // And its empirical mean should be well above 0.6 (reward=1.0 each cycle)
    const state = bandit.getPairState('engineering', 'support');
    const te = state!.arms.get('transfer_entropy')!;
    expect(te.empiricalMean).toBeGreaterThan(0.6);
  });
});
