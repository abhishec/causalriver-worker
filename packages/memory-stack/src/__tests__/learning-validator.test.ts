/**
 * Learning Validator Tests — Proof of Learning Verification
 *
 * Brain Analog: Testing the neurological exam system — making sure
 * the doctor's instruments can actually detect whether new connections
 * formed, not just whether the patient showed up for therapy.
 *
 * Tests verify:
 * - Snapshot captures brain state accurately
 * - Validation detects real learning (posterior shifts, new edges, etc.)
 * - Validation detects no-change (data moved but nothing learned)
 * - Validation detects degradation
 * - End-to-end: train → validate → proof
 */

import { describe, it, expect } from 'vitest';
import {
  takeBrainSnapshot,
  validateLearning,
  formatLearningProof,
  didAnythingChange,
  snapshotToSummary,
  type BrainSnapshot,
} from '../learning/learning-validator';
import { createBayesianUpdater } from '../learning/bayesian-updater';
import { createContrastiveCausalLearner } from '../learning/contrastive-causal-learner';
import { createBrainTrainer } from '../learning/brain-trainer';

// ============================================================================
// HELPERS
// ============================================================================

function createMockSupabase() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ data: [], error: null }) }),
      insert: () => ({ error: null }),
      upsert: () => ({ error: null }),
      update: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }),
    }),
  } as any;
}

function createEmptySnapshot(): BrainSnapshot {
  return {
    timestamp: new Date().toISOString(),
    posteriors: new Map(),
    contrastiveAccuracy: 0,
    contrastiveExamples: 0,
    embeddingLoss: 1.0,
    graphEdgeCount: 0,
    knownDomains: new Set(),
    totalEvidence: 0,
  };
}

function createTrainedSnapshot(): BrainSnapshot {
  const posteriors = new Map();
  posteriors.set('marketing→revenue', {
    alpha: 5.5,
    beta: 1.3,
    mean: 0.809,
    evidenceCount: 4.8,
    credibleIntervalWidth: 0.35,
  });
  posteriors.set('engineering→product', {
    alpha: 3.2,
    beta: 2.1,
    mean: 0.604,
    evidenceCount: 3.3,
    credibleIntervalWidth: 0.48,
  });
  posteriors.set('support→churn', {
    alpha: 4.0,
    beta: 1.5,
    mean: 0.727,
    evidenceCount: 3.5,
    credibleIntervalWidth: 0.40,
  });

  return {
    timestamp: new Date().toISOString(),
    posteriors,
    contrastiveAccuracy: 0.72,
    contrastiveExamples: 15,
    embeddingLoss: 0.45,
    graphEdgeCount: 3,
    knownDomains: new Set(['marketing', 'revenue', 'engineering', 'product', 'support', 'churn']),
    totalEvidence: 11.6,
  };
}

// ============================================================================
// TESTS: SNAPSHOT
// ============================================================================

describe('Learning Validator — Snapshot', () => {
  it('takes a snapshot from real modules', () => {
    const bayesian = createBayesianUpdater({
      supabase: createMockSupabase(),
      organizationId: 'test',
    });
    const contrastive = createContrastiveCausalLearner({});
    const trainer = createBrainTrainer();

    const snapshot = takeBrainSnapshot({
      bayesianUpdater: bayesian,
      contrastiveLearner: contrastive,
      brainTrainer: trainer,
    });

    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.posteriors).toBeInstanceOf(Map);
    expect(snapshot.posteriors.size).toBe(0); // Fresh — no training yet
    expect(snapshot.contrastiveAccuracy).toBe(0);
    expect(snapshot.contrastiveExamples).toBe(0);
    expect(snapshot.graphEdgeCount).toBe(0);
    expect(snapshot.knownDomains.size).toBe(0);
  });

  it('captures state after training', () => {
    const bayesian = createBayesianUpdater({
      supabase: createMockSupabase(),
      organizationId: 'test',
    });
    const contrastive = createContrastiveCausalLearner({});
    const trainer = createBrainTrainer();

    // Train something
    bayesian.update({
      sourceDomain: 'marketing',
      targetDomain: 'revenue',
      wasCorrect: true,
      predictionConfidence: 0.85,
    });

    contrastive.trainOnExample({
      sourceDomain: 'marketing',
      targetDomain: 'revenue',
      label: 1,
      labelConfidence: 0.85,
    });

    trainer.trainInMemory({
      id: 'test-pack',
      title: 'Test',
      source: 'test',
      industry: 'SaaS',
      domains: ['marketing', 'revenue'],
      causalChains: [{ source: 'marketing', target: 'revenue', metric: 'spend', effectSize: 0.6, lagDays: 14 }],
      businessRules: [],
      cascades: [],
      patterns: [],
      outcomes: [],
      confidence: 0.8,
    });

    const snapshot = takeBrainSnapshot({
      bayesianUpdater: bayesian,
      contrastiveLearner: contrastive,
      brainTrainer: trainer,
    });

    expect(snapshot.posteriors.size).toBe(1);
    expect(snapshot.posteriors.get('marketing→revenue')).toBeDefined();
    expect(snapshot.posteriors.get('marketing→revenue')!.alpha).toBeGreaterThan(1); // α increased
    expect(snapshot.contrastiveExamples).toBe(1);
    expect(snapshot.graphEdgeCount).toBe(1);
    expect(snapshot.knownDomains.has('marketing')).toBe(true);
    expect(snapshot.knownDomains.has('revenue')).toBe(true);
    expect(snapshot.totalEvidence).toBeGreaterThan(0);
  });

  it('converts snapshot to summary', () => {
    const snapshot = createTrainedSnapshot();
    const summary = snapshotToSummary(snapshot);

    expect(summary.posteriorCount).toBe(3);
    expect(summary.contrastiveAccuracy).toBe(0.72);
    expect(summary.contrastiveExamples).toBe(15);
    expect(summary.graphEdgeCount).toBe(3);
    expect(summary.knownDomainCount).toBe(6);
    expect(summary.totalEvidence).toBeCloseTo(11.6, 1);
    expect(summary.avgPosteriorMean).toBeGreaterThan(0.5);
  });
});

// ============================================================================
// TESTS: VALIDATION — LEARNING DETECTED
// ============================================================================

describe('Learning Validator — Learning Detected', () => {
  it('detects learning when posteriors shift', () => {
    const before = createEmptySnapshot();
    const after = createTrainedSnapshot();

    const proof = validateLearning(before, after);

    expect(proof.verdict).toBe('learned');
    expect(proof.confidence).toBeGreaterThan(0.5);
    expect(proof.evidence.some(e => e.level === 'L1' && e.passed)).toBe(true);
    expect(proof.deltas.newEdges).toBeGreaterThan(0);
    expect(proof.deltas.newDomains.length).toBeGreaterThan(0);
  });

  it('detects learning from contrastive training', () => {
    const before = createEmptySnapshot();
    const after: BrainSnapshot = {
      ...createEmptySnapshot(),
      contrastiveAccuracy: 0.65,
      contrastiveExamples: 10,
    };

    const proof = validateLearning(before, after);

    expect(proof.evidence.some(e => e.level === 'L2' && e.passed)).toBe(true);
    expect(proof.deltas.newContrastiveExamples).toBe(10);
  });

  it('detects new domain coverage', () => {
    const before = createEmptySnapshot();
    const after: BrainSnapshot = {
      ...createEmptySnapshot(),
      knownDomains: new Set(['marketing', 'revenue', 'finance']),
    };

    const proof = validateLearning(before, after);

    expect(proof.evidence.some(e => e.level === 'L5' && e.passed)).toBe(true);
    expect(proof.deltas.newDomains).toContain('marketing');
    expect(proof.deltas.newDomains).toContain('revenue');
    expect(proof.deltas.newDomains).toContain('finance');
  });

  it('detects graph edge growth', () => {
    const before: BrainSnapshot = { ...createEmptySnapshot(), graphEdgeCount: 2 };
    const after: BrainSnapshot = { ...createEmptySnapshot(), graphEdgeCount: 8 };

    const proof = validateLearning(before, after);

    expect(proof.evidence.some(e => e.level === 'L4' && e.passed)).toBe(true);
    // L4 evidence delta should show graph grew by 6
    const l4 = proof.evidence.find(e => e.level === 'L4')!;
    expect(l4.delta).toBe(6);
    expect(proof.deltas.newEdges).toBe(6); // Max of posterior new edges and graph edge growth
  });

  it('detects embedding loss improvement', () => {
    const before: BrainSnapshot = { ...createEmptySnapshot(), embeddingLoss: 1.0 };
    const after: BrainSnapshot = { ...createEmptySnapshot(), embeddingLoss: 0.45 };

    const proof = validateLearning(before, after);

    expect(proof.evidence.some(e => e.level === 'L3' && e.passed)).toBe(true);
    expect(proof.deltas.embeddingLossDelta).toBeLessThan(0);
  });
});

// ============================================================================
// TESTS: VALIDATION — NO CHANGE
// ============================================================================

describe('Learning Validator — No Change', () => {
  it('detects no change when snapshots are identical', () => {
    const snapshot = createEmptySnapshot();

    const proof = validateLearning(snapshot, snapshot);

    expect(proof.verdict).toBe('no_change');
    expect(proof.evidence.every(e => !e.passed)).toBe(true);
    expect(proof.summary).toContain('NO LEARNING DETECTED');
  });

  it('detects no change when only minor noise differs', () => {
    const before = createEmptySnapshot();
    const after = createEmptySnapshot();
    // Tiny perturbation that's below threshold
    after.embeddingLoss = 0.9999;

    const proof = validateLearning(before, after);

    expect(proof.verdict).toBe('no_change');
  });
});

// ============================================================================
// TESTS: didAnythingChange
// ============================================================================

describe('Learning Validator — didAnythingChange', () => {
  it('returns false for identical snapshots', () => {
    const s = createEmptySnapshot();
    expect(didAnythingChange(s, s)).toBe(false);
  });

  it('returns true when posteriors differ', () => {
    const before = createEmptySnapshot();
    const after = createTrainedSnapshot();
    expect(didAnythingChange(before, after)).toBe(true);
  });

  it('returns true when contrastive examples increase', () => {
    const before = createEmptySnapshot();
    const after = { ...createEmptySnapshot(), contrastiveExamples: 5 };
    expect(didAnythingChange(before, after)).toBe(true);
  });

  it('returns true when graph edges increase', () => {
    const before = createEmptySnapshot();
    const after = { ...createEmptySnapshot(), graphEdgeCount: 3 };
    expect(didAnythingChange(before, after)).toBe(true);
  });

  it('returns true when new domains learned', () => {
    const before = createEmptySnapshot();
    const after = { ...createEmptySnapshot(), knownDomains: new Set(['marketing']) };
    expect(didAnythingChange(before, after)).toBe(true);
  });
});

// ============================================================================
// TESTS: END-TO-END — Real modules, real training, real validation
// ============================================================================

describe('Learning Validator — End-to-End with Real Modules', () => {
  it('proves learning when training real modules', () => {
    const supabase = createMockSupabase();
    const bayesian = createBayesianUpdater({ supabase, organizationId: 'test' });
    const contrastive = createContrastiveCausalLearner({});
    const trainer = createBrainTrainer();

    // BEFORE snapshot
    const before = takeBrainSnapshot({
      bayesianUpdater: bayesian,
      contrastiveLearner: contrastive,
      brainTrainer: trainer,
    });

    // Train with real data
    const edges = [
      { source: 'marketing', target: 'revenue', effectSize: 0.65, lagDays: 14, pValue: 0.01 },
      { source: 'engineering', target: 'product', effectSize: 0.55, lagDays: 7, pValue: 0.02 },
      { source: 'support', target: 'churn', effectSize: -0.45, lagDays: 30, pValue: 0.03 },
      { source: 'finance', target: 'marketing', effectSize: 0.35, lagDays: 7, pValue: 0.04 },
      { source: 'product', target: 'support', effectSize: 0.40, lagDays: 21, pValue: 0.02 },
    ];

    // Train brain trainer (graph structure)
    trainer.trainInMemory({
      id: 'e2e-test',
      title: 'E2E Test Pack',
      source: 'test',
      industry: 'SaaS',
      domains: [...new Set(edges.flatMap(e => [e.source, e.target]))],
      causalChains: edges.map(e => ({ ...e, metric: `${e.source}_to_${e.target}` })),
      businessRules: [],
      cascades: [],
      patterns: [],
      outcomes: [],
      confidence: 0.8,
    });

    // Train Bayesian updater (posterior updates)
    for (const edge of edges) {
      bayesian.update({
        sourceDomain: edge.source,
        targetDomain: edge.target,
        wasCorrect: edge.pValue < 0.05,
        predictionConfidence: 1 - edge.pValue,
      });
    }

    // Train contrastive learner (neural net)
    for (const edge of edges) {
      contrastive.trainOnExample({
        sourceDomain: edge.source,
        targetDomain: edge.target,
        label: edge.pValue < 0.05 ? 1 : 0,
        labelConfidence: 1 - edge.pValue,
      });
    }

    // AFTER snapshot
    const after = takeBrainSnapshot({
      bayesianUpdater: bayesian,
      contrastiveLearner: contrastive,
      brainTrainer: trainer,
    });

    // VALIDATE
    const proof = validateLearning(before, after);

    // ── HARD ASSERTIONS — These are the PROOF ──

    // 1. Verdict must be "learned"
    expect(proof.verdict).toBe('learned');

    // 2. Confidence must be reasonable
    expect(proof.confidence).toBeGreaterThan(0.5);

    // 3. L1 evidence must pass (Bayesian posteriors changed)
    const l1Evidence = proof.evidence.filter(e => e.level === 'L1');
    expect(l1Evidence.some(e => e.passed)).toBe(true);

    // 4. New edges were created
    expect(proof.deltas.newEdges).toBeGreaterThanOrEqual(5);

    // 5. New domains were learned
    expect(proof.deltas.newDomains.length).toBeGreaterThan(0);

    // 6. Contrastive training happened
    expect(proof.deltas.newContrastiveExamples).toBe(5);

    // 7. Total evidence accumulated
    expect(proof.deltas.newEvidence).toBeGreaterThan(0);

    // 8. Before and after summaries are different
    expect(proof.after.posteriorCount).toBeGreaterThan(proof.before.posteriorCount);
    expect(proof.after.graphEdgeCount).toBeGreaterThan(proof.before.graphEdgeCount);
    expect(proof.after.knownDomainCount).toBeGreaterThan(proof.before.knownDomainCount);

    // 9. Summary describes what happened
    expect(proof.summary).toContain('LEARNING CONFIRMED');
  });

  it('proves multiple training rounds accumulate evidence', () => {
    const supabase = createMockSupabase();
    const bayesian = createBayesianUpdater({ supabase, organizationId: 'test' });

    // Round 1: Initial training
    bayesian.update({
      sourceDomain: 'marketing',
      targetDomain: 'revenue',
      wasCorrect: true,
      predictionConfidence: 0.8,
    });

    const afterRound1 = bayesian.getPosterior('marketing', 'revenue');
    expect(afterRound1.alpha).toBeGreaterThan(1); // Prior + 0.8
    expect(afterRound1.mean).toBeGreaterThan(0.5); // Shifted toward causal

    // Round 2: More evidence
    bayesian.update({
      sourceDomain: 'marketing',
      targetDomain: 'revenue',
      wasCorrect: true,
      predictionConfidence: 0.9,
    });

    const afterRound2 = bayesian.getPosterior('marketing', 'revenue');
    expect(afterRound2.alpha).toBeGreaterThan(afterRound1.alpha); // More evidence
    expect(afterRound2.mean).toBeGreaterThan(afterRound1.mean); // More confident
    expect(afterRound2.evidenceCount).toBeGreaterThan(afterRound1.evidenceCount);

    // Round 3: Contradicting evidence
    bayesian.update({
      sourceDomain: 'marketing',
      targetDomain: 'revenue',
      wasCorrect: false,
      predictionConfidence: 0.7,
    });

    const afterRound3 = bayesian.getPosterior('marketing', 'revenue');
    expect(afterRound3.beta).toBeGreaterThan(afterRound2.beta); // β increased
    expect(afterRound3.mean).toBeLessThan(afterRound2.mean); // Mean pulled back
    expect(afterRound3.evidenceCount).toBeGreaterThan(afterRound2.evidenceCount); // More total evidence

    // CI should be narrower than at start (more data = less uncertainty)
    const ciWidth3 = afterRound3.credibleInterval[1] - afterRound3.credibleInterval[0];
    const ciWidth1 = afterRound1.credibleInterval[1] - afterRound1.credibleInterval[0];
    expect(ciWidth3).toBeLessThanOrEqual(ciWidth1);
  });
});

// ============================================================================
// TESTS: PRETTY PRINT
// ============================================================================

describe('Learning Validator — Pretty Print', () => {
  it('formats a learning proof as readable text', () => {
    const before = createEmptySnapshot();
    const after = createTrainedSnapshot();
    const proof = validateLearning(before, after);
    const output = formatLearningProof(proof);

    expect(output).toContain('LEARNING VALIDATION REPORT');
    expect(output).toContain('Verdict');
    expect(output).toContain('Before');
    expect(output).toContain('After');
    expect(output).toContain('Evidence Checks');
    expect(output.length).toBeGreaterThan(500); // Meaningful output
  });

  it('formats a no-change proof', () => {
    const snapshot = createEmptySnapshot();
    const proof = validateLearning(snapshot, snapshot);
    const output = formatLearningProof(proof);

    expect(output).toContain('NO_CHANGE');
  });
});
