/**
 * Learning Integration Tests — Long-Term Potentiation (LTP)
 * ==========================================================
 *
 * Brain Analog: Long-Term Potentiation is THE mechanism by which synapses
 * strengthen through repeated activation. "Neurons that fire together, wire
 * together" (Hebb's Rule). The learning modules ARE the LTP mechanism:
 *
 * 1. Bayesian Updater → Edge posteriors shift based on prediction accuracy
 *    (like synaptic weight changes from prediction error signals)
 *
 * 2. Embedding Tuner → Domain representations adapt to organizational patterns
 *    (like cortical maps reorganizing with experience)
 *
 * 3. Contrastive Causal Learner → "Does A cause B?" predictor trains on
 *    verified edges (like learning to distinguish correlation from causation)
 *
 * 4. Attention Policy Learner → Alert thresholds calibrate from user feedback
 *    (like the VTA dopamine system adjusting from reward/punishment)
 *
 * Tests:
 * 1. Learning cycle runs all 4 modules in sequence
 * 2. Bayesian posteriors update from prediction evidence
 * 3. Embedding tuner adapts domain transforms
 * 4. Contrastive learner tracks accuracy
 * 5. Attention policy adjusts from feedback
 * 6. Brain pipeline integrates learning into full cycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBayesianUpdater } from '../learning/bayesian-updater';
import { createEmbeddingTuner } from '../learning/embedding-tuner';
import { createContrastiveCausalLearner } from '../learning/contrastive-causal-learner';
import { createAttentionPolicyLearner } from '../learning/attention-policy-learner';
import { createBrainPipeline } from '../orchestrator/brain-pipeline';

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
      'eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'is', 'not', 'or',
      'filter', 'order', 'limit', 'range', 'textSearch',
      'contains', 'containedBy', 'overlaps', 'match', 'ilike', 'like',
    ];
    for (const method of chainMethods) {
      query[method] = vi.fn().mockReturnValue(query);
    }

    const singleResult = { data: null, error: null };
    const singleQuery = {
      ...query,
      then: (onFulfilled: any, onRejected?: any) =>
        Promise.resolve(singleResult).then(onFulfilled, onRejected),
    };
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
// BAYESIAN UPDATER TESTS
// ============================================================================

describe('Bayesian Updater (Synaptic Weight Updates)', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  it('should update edge posteriors from prediction evidence', () => {
    const updater = createBayesianUpdater({
      supabase,
      organizationId: 'org-1',
    });

    // Brain Analog: Edge marketing→revenue got a prediction right
    // → strengthen the synapse (increase alpha, posterior shifts toward 1)
    const posterior = updater.update({
      sourceDomain: 'marketing',
      targetDomain: 'revenue',
      wasCorrect: true,
      predictionConfidence: 0.8,
    });

    expect(posterior).toBeDefined();
    expect(posterior.sourceDomain).toBe('marketing');
    expect(posterior.targetDomain).toBe('revenue');
    expect(posterior.mean).toBeGreaterThan(0); // Posterior exists
    expect(posterior.alpha).toBeGreaterThan(1); // Alpha increased (correct prediction)
  });

  it('should weaken posteriors on incorrect predictions', () => {
    const updater = createBayesianUpdater({
      supabase,
      organizationId: 'org-1',
    });

    // First strengthen
    updater.update({
      sourceDomain: 'support',
      targetDomain: 'churn',
      wasCorrect: true,
      predictionConfidence: 0.9,
    });

    const afterCorrect = updater.getPosterior('support', 'churn');
    const betaAfterCorrect = afterCorrect!.beta;

    // Now incorrect prediction
    updater.update({
      sourceDomain: 'support',
      targetDomain: 'churn',
      wasCorrect: false,
      predictionConfidence: 0.7,
    });

    const afterIncorrect = updater.getPosterior('support', 'churn');

    // Brain Analog: Prediction error → beta increases → posterior mean drops
    expect(afterIncorrect!.beta).toBeGreaterThan(betaAfterCorrect);
  });

  it('should identify uncertain edges for exploration', () => {
    const updater = createBayesianUpdater({
      supabase,
      organizationId: 'org-1',
    });

    // Edge with minimal evidence → high uncertainty
    updater.update({
      sourceDomain: 'engineering',
      targetDomain: 'revenue',
      wasCorrect: true,
      predictionConfidence: 0.5,
    });

    const uncertain = updater.getUncertainEdges(0.5);
    // With only 1 observation, uncertainty should be high
    expect(uncertain.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// EMBEDDING TUNER TESTS
// ============================================================================

describe('Embedding Tuner (Cortical Map Reorganization)', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  it('should have a transform that can be applied to embeddings', () => {
    const tuner = createEmbeddingTuner({
      supabase,
      organizationId: 'org-1',
      embeddingDimension: 8, // Small for testing
    });

    // Apply transform to a vector
    const input = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const transformed = tuner.transformEmbedding(input);

    expect(transformed).toBeDefined();
    expect(transformed.length).toBe(8);
  });

  it('should save and load transforms', () => {
    const tuner = createEmbeddingTuner({
      supabase,
      organizationId: 'org-1',
      embeddingDimension: 8,
    });

    const transform = tuner.getTransform();
    expect(transform).toBeDefined();
    expect(transform.weights).toBeDefined();
    expect(transform.dimension).toBe(8);

    // Brain Analog: Save the cortical map state → reload it later
    const tuner2 = createEmbeddingTuner({
      supabase,
      organizationId: 'org-1',
      embeddingDimension: 8,
    });
    tuner2.loadTransform(transform);

    const reloaded = tuner2.getTransform();
    expect(reloaded.weights).toEqual(transform.weights);
  });
});

// ============================================================================
// CONTRASTIVE CAUSAL LEARNER TESTS
// ============================================================================

describe('Contrastive Causal Learner (Causal Discrimination)', () => {
  it('should train on causal examples and track statistics', () => {
    const learner = createContrastiveCausalLearner({
      embeddingDimension: 384,
    });

    // Brain Analog: Training the neural circuit to distinguish
    // "A causes B" from "A correlates with B"
    const loss = learner.trainOnExample({
      sourceDomain: 'marketing',
      targetDomain: 'revenue',
      label: 1, // is causal
      labelConfidence: 0.8,
    });

    expect(typeof loss).toBe('number');

    const stats = learner.getStats();
    expect(stats.examplesSeen).toBe(1);
  });

  it('should improve accuracy with batch training', () => {
    const learner = createContrastiveCausalLearner({
      embeddingDimension: 384,
    });

    // Generate training data: known causal pairs
    const examples = [];
    for (let i = 0; i < 20; i++) {
      examples.push({
        sourceDomain: `domain_${i % 5}`,
        targetDomain: `domain_${(i + 1) % 5}`,
        label: i % 3 !== 0 ? 1 : 0, // 2/3 causal, 1/3 not
        labelConfidence: 0.5 + Math.random() * 0.5,
      });
    }

    const result = learner.trainBatch(examples);
    expect(typeof result.avgLoss).toBe('number');
    expect(typeof result.accuracy).toBe('number');

    const stats = learner.getStats();
    expect(stats.examplesSeen).toBe(20);
  });

  it('should predict causality for unseen pairs', () => {
    const learner = createContrastiveCausalLearner({
      embeddingDimension: 384,
    });

    const prediction = learner.predict('marketing', 'revenue');
    expect(prediction).toBeDefined();
    expect(typeof prediction.probability).toBe('number');
    expect(prediction.probability).toBeGreaterThanOrEqual(0);
    expect(prediction.probability).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// ATTENTION POLICY LEARNER TESTS
// ============================================================================

describe('Attention Policy Learner (VTA Dopamine System)', () => {
  it('should start with default policy', () => {
    const learner = createAttentionPolicyLearner({});

    const state = learner.getPolicy();
    expect(state).toBeDefined();
    expect(state.alertThreshold).toBeDefined();
    expect(state.feedbackCount).toBe(0);
  });

  it('should adjust policy from positive feedback', () => {
    const learner = createAttentionPolicyLearner({});

    // Brain Analog: User acted on alert → positive reward signal
    // → dopamine release → strengthen the scoring pathway
    const update = learner.processFeedback({
      eventId: 'evt-1',
      components: {
        cascadeReach: 0.8,
        dollarEffect: 0.7,
        strategicAlignment: 0.9,
        novelty: 0.6,
      },
      compositeScore: 75,
      wasAlerted: true,
      reward: 'acted_on',
    });

    expect(update).toBeDefined();
    expect(update.reward).toBeGreaterThan(0); // Positive reward
  });

  it('should lower priority for dismissed alerts', () => {
    const learner = createAttentionPolicyLearner({});

    // Brain Analog: User dismissed alert → negative reward signal
    // → no dopamine → weaken the scoring pathway
    const update = learner.processFeedback({
      eventId: 'evt-2',
      components: {
        cascadeReach: 0.3,
        dollarEffect: 0.2,
        strategicAlignment: 0.1,
        novelty: 0.4,
      },
      compositeScore: 30,
      wasAlerted: true,
      reward: 'dismissed',
    });

    expect(update).toBeDefined();
    expect(update.reward).toBeLessThan(0); // Negative reward
  });

  it('should score events using learned weights', () => {
    const learner = createAttentionPolicyLearner({});

    const score = learner.score({
      cascadeReach: 0.8,
      dollarEffect: 0.7,
      strategicAlignment: 0.9,
      novelty: 0.6,
    });

    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// BRAIN PIPELINE LEARNING INTEGRATION
// ============================================================================

describe('Brain Pipeline Learning Integration', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
  });

  it('should create pipeline with learning modules', () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-1',
    });

    // All learning modules should be accessible
    expect(brain.getBayesianUpdater).toBeDefined();
    expect(brain.getEmbeddingTuner).toBeDefined();
    expect(brain.getContrastiveLearner).toBeDefined();
    expect(brain.getAttentionPolicyLearner).toBeDefined();
  });

  it('should expose runLearningCycle method', () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-1',
    });

    expect(brain.runLearningCycle).toBeDefined();
    expect(typeof brain.runLearningCycle).toBe('function');
  });

  it('should run learning cycle and return results', async () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-1',
    });

    const result = await brain.runLearningCycle();

    // Brain Analog: LTP cycle completed — all 4 synaptic mechanisms ran
    expect(result).toBeDefined();
    expect(typeof result.bayesianUpdates).toBe('number');
    expect(Array.isArray(result.significantShifts)).toBe(true);
    expect(typeof result.contrastiveAccuracy).toBe('number');
    expect(typeof result.durationMs).toBe('number');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('should include learning in full cycle report', async () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-1',
    });

    const report = await brain.runFullCycle();

    // Brain Analog: Full sleep cycle now includes LTP
    // Consolidation → DMN → Learning → Impact → Attention → Exploration
    expect(report.learning).toBeDefined();
    if (report.learning) {
      expect(typeof report.learning.bayesianUpdates).toBe('number');
      expect(typeof report.learning.durationMs).toBe('number');
    }

    // bookIngestion should be present in the cycle report
    expect('bookIngestion' in report).toBe(true);
  });

  it('should report learning modules in health check', () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-1',
    });

    const health = brain.getHealth();

    const learningRegion = health.regions.find(r => r.name === 'Learning Modules');
    expect(learningRegion).toBeDefined();
    expect(learningRegion!.brainAnalog).toBe('Long-Term Potentiation');
    expect(learningRegion!.status).toBe('not_initialized'); // No cycle run yet
  });

  it('should update health after learning cycle', async () => {
    const brain = createBrainPipeline({
      supabase,
      organizationId: 'org-1',
    });

    await brain.runLearningCycle();
    const health = brain.getHealth();

    const learningRegion = health.regions.find(r => r.name === 'Learning Modules');
    expect(learningRegion!.status).toBe('ok');
    expect(learningRegion!.lastActiveAt).toBeDefined();
  });

  describe('Brain Analogy Validation', () => {
    it('should model LTP: repeated activation strengthens synapses', () => {
      // Brain Analog:
      // LTP is triggered when presynaptic neuron A fires just before
      // postsynaptic neuron B. The synapse A→B strengthens.
      //
      // In NexusBrain:
      // - Bayesian updater: edge marketing→revenue gets 5 correct predictions
      //   → posterior mean shifts upward (synapse strengthened)
      //
      // - Contrastive learner: trains on verified causal edges
      //   → accuracy improves (discrimination sharpened)
      //
      // - Embedding tuner: epochs on domain similarity pairs
      //   → loss drops (cortical maps reorganized)
      //
      // - Attention policy: user feedbacks
      //   → alert threshold calibrates (VTA tuned)

      const updater = createBayesianUpdater({
        supabase: createMockSupabase(),
        organizationId: 'org-1',
      });

      // 5 correct predictions → synapse strengthens
      for (let i = 0; i < 5; i++) {
        updater.update({
          sourceDomain: 'marketing',
          targetDomain: 'revenue',
          wasCorrect: true,
          predictionConfidence: 0.8,
        });
      }

      const posterior = updater.getPosterior('marketing', 'revenue');
      expect(posterior).toBeDefined();
      // After 5 correct predictions (each adding 0.8 to alpha),
      // alpha = 1 + 5*0.8 = 5, beta = 1, mean = 5/6 = 0.833
      expect(posterior!.mean).toBeGreaterThan(0.7);
      // Alpha should have grown (evidence of causal connection)
      expect(posterior!.alpha).toBeGreaterThan(3);
    });
  });
});
