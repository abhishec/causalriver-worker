/**
 * Embedding Fine-Tuner — Domain-Adaptive Representation Learning
 *
 * Unlike LLM fine-tuning (which requires GPU clusters), this module
 * does something practical for a laptop: it learns DOMAIN TRANSFORMS
 * that adjust generic embeddings to match organizational semantics.
 *
 * How it works:
 *   1. Causal discovery finds that "marketing spend" → "lead volume"
 *   2. This creates a POSITIVE training pair: these concepts should be
 *      closer together in embedding space
 *   3. "marketing spend" and "cafeteria menu" should be FAR APART
 *      (negative pair)
 *   4. We learn a lightweight linear transform W that adjusts the
 *      embedding space: adjusted = W × original
 *   5. Over time, the embedding space becomes aligned with the
 *      organization's actual causal structure
 *
 * Why this is real learning:
 *   - We're fitting a matrix W via gradient descent
 *   - The loss function is contrastive: pull causal pairs together,
 *     push non-causal pairs apart
 *   - The transform improves with every consolidation cycle
 *   - Embeddings become organization-specific, not generic
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding, cosineSimilarity } from '../core/embeddings';

// ============================================================================
// TYPES
// ============================================================================

/** A training pair for contrastive learning */
export interface EmbeddingTrainingPair {
  /** Anchor text (the source concept) */
  anchor: string;
  /** Positive text (causally related) */
  positive: string;
  /** Negative text (unrelated) */
  negative: string;
  /** Strength of the causal relationship (0-1) */
  causalStrength: number;
}

/** The learned domain transform */
export interface DomainTransform {
  /** Transform matrix (flattened, dimension × dimension) */
  weights: number[];
  /** Embedding dimension */
  dimension: number;
  /** Training loss history */
  lossHistory: number[];
  /** Number of pairs trained on */
  pairsProcessed: number;
  /** When last trained */
  trainedAt: string;
  /** Organization ID */
  organizationId: string;
}

/** Fine-tuning configuration */
export interface EmbeddingTunerConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Learning rate (default: 0.01) */
  learningRate?: number;
  /** Contrastive margin (default: 0.3) */
  margin?: number;
  /** Number of epochs per training round (default: 5) */
  epochs?: number;
  /** Embedding dimension (default: 384) */
  embeddingDimension?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** Training result */
export interface TuningResult {
  /** Final loss */
  finalLoss: number;
  /** Starting loss */
  initialLoss: number;
  /** Improvement percentage */
  improvement: number;
  /** Number of pairs used */
  pairsUsed: number;
  /** Epochs completed */
  epochsCompleted: number;
  /** Duration in ms */
  durationMs: number;
}

// ============================================================================
// EMBEDDING FINE-TUNER
// ============================================================================

export function createEmbeddingTuner(config: EmbeddingTunerConfig) {
  const {
    supabase,
    organizationId,
    learningRate = 0.01,
    margin = 0.3,
    epochs = 5,
    embeddingDimension = 384,
    verbose = false,
  } = config;

  // The domain transform — starts as identity matrix
  let transform: number[] = createIdentityMatrix(embeddingDimension);
  let lossHistory: number[] = [];
  let totalPairsProcessed = 0;

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [TUNER] ${msg}`);
    }
  }

  // ── Linear Algebra Helpers ────────────────────────────────────────

  function createIdentityMatrix(dim: number): number[] {
    const m = new Array(dim * dim).fill(0);
    for (let i = 0; i < dim; i++) {
      m[i * dim + i] = 1;
    }
    return m;
  }

  function applyTransform(embedding: number[], W: number[], dim: number): number[] {
    const result = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        result[i] += W[i * dim + j] * embedding[j];
      }
    }
    return result;
  }

  function dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  function l2Norm(v: number[]): number {
    return Math.sqrt(dotProduct(v, v));
  }

  function normalize(v: number[]): number[] {
    const norm = l2Norm(v);
    if (norm === 0) return v;
    return v.map(x => x / norm);
  }

  function cosine(a: number[], b: number[]): number {
    const normA = l2Norm(a);
    const normB = l2Norm(b);
    if (normA === 0 || normB === 0) return 0;
    return dotProduct(a, b) / (normA * normB);
  }

  // ── Contrastive Loss ──────────────────────────────────────────────

  /**
   * Triplet margin loss:
   *   L = max(0, d(anchor, positive) - d(anchor, negative) + margin)
   *
   * Where d() is 1 - cosine_similarity
   */
  function tripletLoss(
    anchorT: number[],
    positiveT: number[],
    negativeT: number[],
  ): number {
    const posDist = 1 - cosine(anchorT, positiveT);
    const negDist = 1 - cosine(anchorT, negativeT);
    return Math.max(0, posDist - negDist + margin);
  }

  // ── Gradient Step ─────────────────────────────────────────────────

  /**
   * Approximate gradient via finite differences.
   * For a production system we'd use autograd, but this works
   * for a lightweight laptop-scale fine-tuner.
   */
  function gradientStep(
    anchor: number[],
    positive: number[],
    negative: number[],
  ): void {
    const dim = embeddingDimension;
    const epsilon = 1e-4;

    // Current loss
    const anchorT = applyTransform(anchor, transform, dim);
    const positiveT = applyTransform(positive, transform, dim);
    const negativeT = applyTransform(negative, transform, dim);
    const currentLoss = tripletLoss(anchorT, positiveT, negativeT);

    if (currentLoss === 0) return; // Already satisfied margin

    // Update only diagonal + near-diagonal elements for efficiency
    // Full matrix gradient is O(dim²) which is too slow for 384-dim
    // We approximate with a band matrix update
    const bandWidth = Math.min(10, dim);

    for (let i = 0; i < dim; i++) {
      for (let dj = -bandWidth; dj <= bandWidth; dj++) {
        const j = i + dj;
        if (j < 0 || j >= dim) continue;

        const idx = i * dim + j;
        const original = transform[idx];

        // Perturb
        transform[idx] = original + epsilon;
        const aT = applyTransform(anchor, transform, dim);
        const pT = applyTransform(positive, transform, dim);
        const nT = applyTransform(negative, transform, dim);
        const perturbedLoss = tripletLoss(aT, pT, nT);

        // Gradient
        const grad = (perturbedLoss - currentLoss) / epsilon;

        // Update
        transform[idx] = original - learningRate * grad;
      }
    }
  }

  // ── Training Pair Generation ──────────────────────────────────────

  async function generateTrainingPairs(): Promise<EmbeddingTrainingPair[]> {
    const pairs: EmbeddingTrainingPair[] = [];

    // Get significant causal relationships → positive pairs
    const { data: relationships } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, effect_size, natural_language')
      .eq('organization_id', organizationId)
      .eq('is_significant', true)
      .order('effect_size', { ascending: false })
      .limit(50);

    if (!relationships || relationships.length < 3) return pairs;

    // Get all domains for negative sampling
    const allDomains = [...new Set(
      relationships.map(r => r.source_domain)
        .concat(relationships.map(r => r.target_domain))
    )];

    for (const rel of relationships) {
      // Find a domain NOT causally connected to this source
      const connectedTargets = new Set(
        relationships
          .filter(r => r.source_domain === rel.source_domain)
          .map(r => r.target_domain)
      );

      const negativeDomains = allDomains.filter(d =>
        d !== rel.source_domain &&
        d !== rel.target_domain &&
        !connectedTargets.has(d)
      );

      if (negativeDomains.length === 0) continue;

      const negativeDomain = negativeDomains[Math.floor(Math.random() * negativeDomains.length)];

      pairs.push({
        anchor: rel.source_domain,
        positive: rel.target_domain,
        negative: negativeDomain,
        causalStrength: Math.abs(rel.effect_size || 0.5),
      });
    }

    log(`Generated ${pairs.length} training pairs from causal graph`);
    return pairs;
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Fine-tune embeddings using the current causal graph.
     * Call this during consolidation.
     */
    async tune(): Promise<TuningResult> {
      const start = Date.now();

      // Generate training pairs from causal discoveries
      const pairs = await generateTrainingPairs();
      if (pairs.length < 3) {
        log('Not enough training pairs — skipping fine-tuning');
        return {
          finalLoss: 0,
          initialLoss: 0,
          improvement: 0,
          pairsUsed: 0,
          epochsCompleted: 0,
          durationMs: Date.now() - start,
        };
      }

      // Generate embeddings for all unique concepts
      const uniqueTexts = [...new Set(
        pairs.map(p => p.anchor)
          .concat(pairs.map(p => p.positive))
          .concat(pairs.map(p => p.negative))
      )];

      const embeddingCache = new Map<string, number[]>();
      for (const text of uniqueTexts) {
        embeddingCache.set(text, generateEmbedding(text));
      }

      // Measure initial loss
      let initialLoss = 0;
      for (const pair of pairs) {
        const a = applyTransform(embeddingCache.get(pair.anchor)!, transform, embeddingDimension);
        const p = applyTransform(embeddingCache.get(pair.positive)!, transform, embeddingDimension);
        const n = applyTransform(embeddingCache.get(pair.negative)!, transform, embeddingDimension);
        initialLoss += tripletLoss(a, p, n);
      }
      initialLoss /= pairs.length;

      // Train for N epochs
      let finalLoss = initialLoss;
      for (let epoch = 0; epoch < epochs; epoch++) {
        let epochLoss = 0;

        // Shuffle pairs
        for (let i = pairs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = pairs[i];
          pairs[i] = pairs[j];
          pairs[j] = tmp;
        }

        for (const pair of pairs) {
          const anchor = embeddingCache.get(pair.anchor)!;
          const positive = embeddingCache.get(pair.positive)!;
          const negative = embeddingCache.get(pair.negative)!;

          gradientStep(anchor, positive, negative);

          const aT = applyTransform(anchor, transform, embeddingDimension);
          const pT = applyTransform(positive, transform, embeddingDimension);
          const nT = applyTransform(negative, transform, embeddingDimension);
          epochLoss += tripletLoss(aT, pT, nT);
        }

        epochLoss /= pairs.length;
        lossHistory.push(epochLoss);
        finalLoss = epochLoss;

        log(`Epoch ${epoch + 1}/${epochs}: loss=${epochLoss.toFixed(4)}`);
      }

      totalPairsProcessed += pairs.length * epochs;

      const improvement = initialLoss > 0
        ? ((initialLoss - finalLoss) / initialLoss) * 100
        : 0;

      log(`Fine-tuning complete: loss ${initialLoss.toFixed(4)} → ${finalLoss.toFixed(4)} (${improvement.toFixed(1)}% improvement)`);

      return {
        finalLoss,
        initialLoss,
        improvement,
        pairsUsed: pairs.length,
        epochsCompleted: epochs,
        durationMs: Date.now() - start,
      };
    },

    /**
     * Apply the learned transform to an embedding.
     */
    transformEmbedding(embedding: number[]): number[] {
      if (embedding.length !== embeddingDimension) return embedding;
      return normalize(applyTransform(embedding, transform, embeddingDimension));
    },

    /**
     * Get the current transform state (for persistence).
     */
    getTransform(): DomainTransform {
      return {
        weights: [...transform],
        dimension: embeddingDimension,
        lossHistory: [...lossHistory],
        pairsProcessed: totalPairsProcessed,
        trainedAt: new Date().toISOString(),
        organizationId,
      };
    },

    /**
     * Load a previously saved transform.
     */
    loadTransform(saved: DomainTransform): void {
      if (saved.dimension === embeddingDimension) {
        transform = [...saved.weights];
        lossHistory = [...saved.lossHistory];
        totalPairsProcessed = saved.pairsProcessed;
        log(`Loaded transform: ${totalPairsProcessed} pairs processed`);
      }
    },

    /**
     * Persist the transform to Supabase — stores FULL weights.
     * Uses dedicated embedding_transforms table for the actual matrix,
     * and ai_memory for human-readable metadata.
     */
    async persistTransform(): Promise<void> {
      const state = this.getTransform();

      // 1. Store full weights in dedicated table (the actual learned parameters)
      const { error: weightsError } = await supabase
        .from('embedding_transforms')
        .upsert({
          organization_id: organizationId,
          dimension: state.dimension,
          weights: state.weights,
          loss_history: state.lossHistory.slice(-50),
          pairs_processed: state.pairsProcessed,
          epochs_completed: state.lossHistory.length,
          final_loss: state.lossHistory.length > 0 ? state.lossHistory[state.lossHistory.length - 1] : null,
        }, { onConflict: 'organization_id' });

      if (!weightsError) {
        log(`Transform weights persisted (${state.weights.length} floats, ${state.pairsProcessed} pairs)`);
      } else {
        log(`Warning: Could not persist transform weights: ${weightsError.message}`);
      }

      // 2. Also store human-readable summary in ai_memory
      await supabase
        .from('ai_memory')
        .upsert({
          organization_id: organizationId,
          memory_type: 'domain_transform',
          domain: 'cross_domain',
          content: `Domain embedding transform: ${totalPairsProcessed} training pairs, loss ${lossHistory.length > 0 ? lossHistory[lossHistory.length - 1].toFixed(4) : 'N/A'}`,
          importance: 0.9,
          metadata: {
            dimension: state.dimension,
            pairsProcessed: state.pairsProcessed,
            lossHistory: state.lossHistory.slice(-20),
            trainedAt: state.trainedAt,
          },
        }, { onConflict: 'organization_id,memory_type,domain' });
    },

    /**
     * Load a previously saved transform from database.
     */
    async loadFromDatabase(): Promise<boolean> {
      const { data } = await supabase
        .from('embedding_transforms')
        .select('weights, dimension, loss_history, pairs_processed')
        .eq('organization_id', organizationId)
        .single();

      if (data && data.dimension === embeddingDimension && Array.isArray(data.weights)) {
        transform = [...data.weights];
        lossHistory = Array.isArray(data.loss_history) ? [...data.loss_history] : [];
        totalPairsProcessed = data.pairs_processed || 0;
        log(`Loaded transform from DB: ${totalPairsProcessed} pairs, ${lossHistory.length} epochs`);
        return true;
      }
      return false;
    },
  };
}
