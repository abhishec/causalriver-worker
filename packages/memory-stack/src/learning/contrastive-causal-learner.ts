/**
 * Contrastive Causal Learner — "Does A cause B?" Predictor
 *
 * A lightweight model that learns to predict WHETHER a causal relationship
 * exists between two domains, using verified predictions as training data.
 *
 * Unlike the statistical Granger test (which needs time-series data),
 * this model learns from the PATTERN of successful/failed predictions:
 *   - If predictions about "marketing → sales" keep coming true → model
 *     learns to predict this pair as causal
 *   - If predictions about "weather → revenue" keep failing → model
 *     learns to predict this pair as non-causal
 *
 * Architecture:
 *   Input:  Domain pair embeddings (concat or diff)
 *   Model:  Single-layer linear classifier with sigmoid output
 *   Output: P(causal | domain_a, domain_b) ∈ [0, 1]
 *   Loss:   Binary cross-entropy
 *   Update: Online gradient descent (one sample at a time)
 *
 * This is the simplest possible neural model that does REAL learning:
 *   - It has trainable weights
 *   - It uses gradient descent
 *   - It improves with more data
 *   - It generalizes to unseen domain pairs
 *
 * @packageDocumentation
 */

import { generateEmbedding, cosineSimilarity } from '../core/embeddings';

// ============================================================================
// TYPES
// ============================================================================

/** Training example for the causal predictor */
export interface CausalTrainingExample {
  /** Source domain */
  sourceDomain: string;
  /** Target domain */
  targetDomain: string;
  /** Label: 1 = causal relationship exists, 0 = no relationship */
  label: number;
  /** Confidence in this label (0-1) */
  labelConfidence: number;
}

/** Prediction output */
export interface CausalPrediction {
  /** Source domain */
  sourceDomain: string;
  /** Target domain */
  targetDomain: string;
  /** Predicted probability that A causes B */
  probability: number;
  /** Confidence in this prediction (based on training data density) */
  confidence: number;
  /** Whether the model predicts a causal relationship */
  isCausal: boolean;
}

/** Model state for persistence */
export interface CausalModelState {
  /** Weight vector */
  weights: number[];
  /** Bias term */
  bias: number;
  /** Input dimension */
  inputDimension: number;
  /** Training examples seen */
  examplesSeen: number;
  /** Running average loss */
  avgLoss: number;
  /** Training accuracy */
  accuracy: number;
}

/** Learner configuration */
export interface ContrastiveLearnerConfig {
  /** Embedding dimension (default: 384) */
  embeddingDimension?: number;
  /** Learning rate (default: 0.005) */
  learningRate?: number;
  /** L2 regularization strength (default: 0.001) */
  l2Regularization?: number;
  /** Threshold for causal prediction (default: 0.5) */
  causalThreshold?: number;
  /** Verbose logging */
  verbose?: boolean;
}

// ============================================================================
// CONTRASTIVE CAUSAL LEARNER
// ============================================================================

export function createContrastiveCausalLearner(config: ContrastiveLearnerConfig = {}) {
  const {
    embeddingDimension = 384,
    learningRate = 0.005,
    l2Regularization = 0.001,
    causalThreshold = 0.5,
    verbose = false,
  } = config;

  // Model parameters
  // Input = concat(embedding_a, embedding_b, element-wise diff, element-wise product)
  // But for efficiency, we use: concat(embedding_a, embedding_b) = 2 * dim
  const inputDim = embeddingDimension * 2;
  let weights = new Array(inputDim).fill(0).map(() => (Math.random() - 0.5) * 0.01);
  let bias = 0;

  // Training stats
  let examplesSeen = 0;
  let runningLoss = 0;
  let correctPredictions = 0;
  let totalPredictions = 0;

  // Embedding cache
  const embeddingCache = new Map<string, number[]>();

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [CONTRASTIVE] ${msg}`);
    }
  }

  // ── Model Operations ──────────────────────────────────────────────

  function sigmoid(x: number): number {
    if (x > 500) return 1;
    if (x < -500) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function getEmbedding(text: string): number[] {
    if (embeddingCache.has(text)) return embeddingCache.get(text)!;
    const emb = generateEmbedding(text);
    embeddingCache.set(text, emb);
    return emb;
  }

  function forward(embA: number[], embB: number[]): number {
    // Input = [embA; embB]
    let z = bias;
    for (let i = 0; i < embeddingDimension; i++) {
      z += weights[i] * embA[i];
    }
    for (let i = 0; i < embeddingDimension; i++) {
      z += weights[embeddingDimension + i] * embB[i];
    }
    return sigmoid(z);
  }

  function backwardAndUpdate(
    embA: number[],
    embB: number[],
    prediction: number,
    label: number,
    sampleWeight: number,
  ): number {
    // Binary cross-entropy gradient
    // dL/dz = prediction - label (for sigmoid + BCE)
    const error = (prediction - label) * sampleWeight;

    // Update weights with gradient descent + L2 regularization
    for (let i = 0; i < embeddingDimension; i++) {
      const grad = error * embA[i] + l2Regularization * weights[i];
      weights[i] -= learningRate * grad;
    }
    for (let i = 0; i < embeddingDimension; i++) {
      const grad = error * embB[i] + l2Regularization * weights[embeddingDimension + i];
      weights[embeddingDimension + i] -= learningRate * grad;
    }

    // Update bias
    bias -= learningRate * error;

    // Binary cross-entropy loss
    const eps = 1e-7;
    const loss = -(label * Math.log(prediction + eps) + (1 - label) * Math.log(1 - prediction + eps));
    return loss;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Train on a single example (online learning).
     */
    trainOnExample(example: CausalTrainingExample): number {
      const embA = getEmbedding(example.sourceDomain);
      const embB = getEmbedding(example.targetDomain);

      const prediction = forward(embA, embB);
      const loss = backwardAndUpdate(embA, embB, prediction, example.label, example.labelConfidence);

      examplesSeen++;
      runningLoss = runningLoss * 0.95 + loss * 0.05; // Exponential moving average

      const correct = (prediction >= causalThreshold) === (example.label >= 0.5);
      if (correct) correctPredictions++;
      totalPredictions++;

      if (examplesSeen % 50 === 0) {
        log(`Examples: ${examplesSeen}, loss: ${runningLoss.toFixed(4)}, accuracy: ${((correctPredictions / totalPredictions) * 100).toFixed(1)}%`);
      }

      return loss;
    },

    /**
     * Train on a batch of examples.
     */
    trainBatch(examples: CausalTrainingExample[]): { avgLoss: number; accuracy: number } {
      let totalLoss = 0;
      let batchCorrect = 0;

      for (const example of examples) {
        const loss = this.trainOnExample(example);
        totalLoss += loss;

        const embA = getEmbedding(example.sourceDomain);
        const embB = getEmbedding(example.targetDomain);
        const pred = forward(embA, embB);
        if ((pred >= causalThreshold) === (example.label >= 0.5)) batchCorrect++;
      }

      const avgLoss = examples.length > 0 ? totalLoss / examples.length : 0;
      const accuracy = examples.length > 0 ? batchCorrect / examples.length : 0;

      log(`Batch: ${examples.length} examples, loss: ${avgLoss.toFixed(4)}, accuracy: ${(accuracy * 100).toFixed(1)}%`);

      return { avgLoss, accuracy };
    },

    /**
     * Predict whether a causal relationship exists.
     */
    predict(sourceDomain: string, targetDomain: string): CausalPrediction {
      const embA = getEmbedding(sourceDomain);
      const embB = getEmbedding(targetDomain);
      const probability = forward(embA, embB);

      // Confidence based on how much training data we've seen
      const confidence = Math.min(1.0, examplesSeen / 100);

      return {
        sourceDomain,
        targetDomain,
        probability,
        confidence,
        isCausal: probability >= causalThreshold,
      };
    },

    /**
     * Predict for all possible domain pairs (for exploration).
     */
    predictAllPairs(domains: string[]): CausalPrediction[] {
      const predictions: CausalPrediction[] = [];

      for (const a of domains) {
        for (const b of domains) {
          if (a === b) continue;
          predictions.push(this.predict(a, b));
        }
      }

      predictions.sort((a, b) => b.probability - a.probability);
      return predictions;
    },

    /**
     * Get model state for persistence.
     */
    getState(): CausalModelState {
      return {
        weights: [...weights],
        bias,
        inputDimension: inputDim,
        examplesSeen,
        avgLoss: runningLoss,
        accuracy: totalPredictions > 0 ? correctPredictions / totalPredictions : 0,
      };
    },

    /**
     * Load model state from persistence.
     */
    loadState(state: CausalModelState): void {
      if (state.inputDimension === inputDim) {
        weights = [...state.weights];
        bias = state.bias;
        examplesSeen = state.examplesSeen;
        runningLoss = state.avgLoss;
        log(`Loaded model: ${examplesSeen} examples, loss: ${runningLoss.toFixed(4)}`);
      }
    },

    /**
     * Get training stats.
     */
    getStats(): { examplesSeen: number; avgLoss: number; accuracy: number } {
      return {
        examplesSeen,
        avgLoss: runningLoss,
        accuracy: totalPredictions > 0 ? correctPredictions / totalPredictions : 0,
      };
    },
  };
}
