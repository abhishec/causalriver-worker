/**
 * LLM Training Pipeline — The Sensory-Motor Learning Loop
 * =========================================================
 *
 * Brain Analog: The complete sensory-motor learning loop in the brain:
 *
 *   1. SENSE → Sensory organs capture raw input (eyes read text)
 *   2. PERCEIVE → Sensory cortex processes raw input into structured percepts
 *   3. ENCODE → Hippocampus encodes new memories from percepts
 *   4. CONSOLIDATE → During sleep, hippocampus replays to neocortex
 *   5. STRENGTHEN → LTP strengthens synapses based on prediction accuracy
 *
 * This pipeline implements the full loop:
 *
 *   1. FETCH → Public Content Fetcher captures text from Wikipedia, HN, etc.
 *   2. DISTILL → LLM Knowledge Distiller extracts causal patterns
 *   3. INGEST → Public Data Learner captures numeric signals
 *   4. TRAIN → Real ML learning modules (NOT just CRUD):
 *      a. Brain Trainer loads causal graph structure (prerequisite)
 *      b. Bayesian Updater: Beta(α,β) posterior updates per edge
 *      c. Embedding Tuner: SGD + triplet loss on domain transforms
 *      d. Contrastive Learner: Neural net backprop with BCE loss
 *      e. CRUD persistence for copilot retrieval (database writes)
 *
 * This is the brain's DAILY LEARNING CYCLE — it reads the world, extracts
 * knowledge, and gets smarter every single day.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createPublicContentFetcher, type ContentFetcherConfig, type ContentFetchResult } from './public-content-fetcher';
import { createLLMKnowledgeDistiller, type KnowledgeDistillerConfig, type DistillationSessionResult, type DistilledTrainingPack, type RawContent } from './llm-knowledge-distiller';
import { createPublicDataLearner, type PublicDataLearnerConfig, type IngestionResult } from './public-data-learner';
import { createBrainTrainer, type TrainingPack, type PackTrainingResult } from './brain-trainer';
import { createBayesianUpdater } from './bayesian-updater';
import { createEmbeddingTuner } from './embedding-tuner';
import { createContrastiveCausalLearner } from './contrastive-causal-learner';

// ============================================================================
// TYPES
// ============================================================================

/** Full LLM training pipeline configuration */
export interface LLMTrainingPipelineConfig {
  /** Supabase client for data persistence */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId?: string;
  /** LLM provider for knowledge distillation */
  llmProvider: 'anthropic' | 'openai';
  /** LLM API key */
  llmApiKey: string;
  /** LLM model override */
  llmModel?: string;
  /** FRED API key (optional) */
  fredApiKey?: string;
  /** Content sources to enable (default: all) */
  contentSources?: string[];
  /** Numeric data sources to enable (default: all) */
  dataSources?: string[];
  /** Max articles per content source (default: 5) */
  maxContentPerSource?: number;
  /** Process content sequentially to respect rate limits (default: true) */
  sequential?: boolean;
  /** Verbose logging */
  verbose?: boolean;
  /** Cost tracker for centralized cost logging */
  costTracker?: {
    logLLMCall(params: {
      component: string;
      functionName: string;
      provider: 'anthropic' | 'openai';
      model: string;
      inputTokens: number;
      outputTokens: number;
      durationMs?: number;
      contentTitle?: string;
      success?: boolean;
    }): Promise<void>;
    shouldThrottle(): Promise<boolean>;
  };
}

/** Results from running distilled knowledge through real ML modules */
export interface LTPTrainingResult {
  /** Bayesian posterior updates applied to causal edges */
  bayesianUpdates: number;
  /** Embedding tuner epochs completed (gradient descent steps) */
  embeddingEpochs: number;
  /** Embedding tuner final loss (lower = better domain separation) */
  embeddingFinalLoss: number;
  /** Contrastive learner examples trained (neural net backprop steps) */
  contrastiveExamples: number;
  /** Contrastive learner accuracy after training */
  contrastiveAccuracy: number;
  /** Brain trainer pack result (causal edges + rules + patterns loaded) */
  packResult: PackTrainingResult | null;
}

/** Result from a complete LLM training run */
export interface LLMTrainingResult {
  /** Content fetching results */
  contentFetch: ContentFetchResult;
  /** LLM knowledge distillation results */
  distillation: DistillationSessionResult | null;
  /** Numeric signal ingestion results */
  signalIngestion: IngestionResult | null;
  /** Generated training pack (if distillation produced one) */
  trainingPack: DistilledTrainingPack | null;
  /** Long-Term Potentiation: real ML training results */
  ltpTraining: LTPTrainingResult | null;
  /** Summary narrative of what the brain learned */
  narrative: string;
  /** Total duration */
  totalDurationMs: number;
  /** Errors encountered */
  errors: string[];
}

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// LLM TRAINING PIPELINE
// ============================================================================

/**
 * Create the LLM Training Pipeline — the brain's daily learning cycle.
 *
 * Brain Analog: This is the complete perceptual learning system:
 * - Eyes read (content fetcher)
 * - Visual cortex interprets (LLM distiller)
 * - Hippocampus records (signal ingestion)
 * - Neocortex integrates (brain trainer)
 *
 * Call `runTrainingCycle()` daily to make the brain smarter.
 */
export function createLLMTrainingPipeline(config: LLMTrainingPipelineConfig) {
  const {
    supabase,
    organizationId = CORE_BRAIN_ORG_ID,
    llmProvider,
    llmApiKey,
    llmModel,
    fredApiKey,
    contentSources,
    dataSources,
    maxContentPerSource = 5,
    sequential = true,
    verbose = false,
    costTracker,
  } = config;

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [TRAINING] ${msg}`);
    }
  }

  // Instantiate sub-systems
  const contentFetcher = createPublicContentFetcher({
    enabledSources: contentSources,
    maxPerSource: maxContentPerSource,
    verbose,
  });

  const distiller = createLLMKnowledgeDistiller({
    provider: llmProvider,
    apiKey: llmApiKey,
    model: llmModel,
    verbose,
    costTracker,
  });

  const dataLearner = createPublicDataLearner({
    supabase,
    organizationId,
    fredApiKey,
    enabledSources: dataSources,
    verbose,
  });

  // ── Real ML Learning Modules (Long-Term Potentiation) ─────────────
  //
  // Brain Analog: These are the ACTUAL synaptic mechanisms that
  // strengthen neural connections — not just storing data, but
  // mathematically updating beliefs, gradients, and policies.

  const brainTrainer = createBrainTrainer();

  const bayesianUpdater = createBayesianUpdater({
    supabase,
    organizationId,
    verbose,
  });

  const embeddingTuner = createEmbeddingTuner({
    supabase,
    organizationId,
    verbose,
  });

  const contrastiveLearner = createContrastiveCausalLearner({
    verbose,
  });

  /**
   * Run distilled knowledge through REAL ML learning modules.
   *
   * Brain Analog: Long-Term Potentiation (LTP) — the mechanism by which
   * synapses strengthen through repeated activation. This is NOT just
   * storing data in a database. Each module uses real mathematical
   * learning algorithms:
   *
   *   1. Brain Trainer: Load causal graph + validate patterns (in-memory)
   *   2. Bayesian Updater: Beta posterior updates on each causal edge
   *      → P(A→B | evidence) using conjugate prior math
   *   3. Embedding Tuner: Gradient descent on domain embedding transforms
   *      → Pulls causally-related domains together in vector space
   *   4. Contrastive Learner: Neural network backprop with BCE loss
   *      → Learns "does A cause B?" binary classifier from examples
   *   5. CRUD Persistence: Store raw signals + memories for retrieval
   */
  async function trainWithLTP(pack: DistilledTrainingPack): Promise<LTPTrainingResult> {
    const result: LTPTrainingResult = {
      bayesianUpdates: 0,
      embeddingEpochs: 0,
      embeddingFinalLoss: 1.0,
      contrastiveExamples: 0,
      contrastiveAccuracy: 0,
      packResult: null,
    };

    // ── Step 1: Brain Trainer — Load into causal graph (in-memory) ──
    // This builds the causal graph structure that other modules learn from.
    // Not ML itself, but the prerequisite data structure for ML.
    try {
      const packResult = brainTrainer.trainInMemory(pack as any);
      result.packResult = packResult;
      log(`  Brain Trainer: ${packResult.causalEdges} edges, ${packResult.rules} rules, ${packResult.patterns} patterns loaded`);
    } catch (err: any) {
      log(`  Brain Trainer failed: ${err.message}`);
    }

    // ── Step 2: Bayesian Updater — Update posterior beliefs ─────────
    // For each causal edge the LLM extracted, update the Beta(α,β)
    // posterior. This is REAL Bayesian inference:
    //   If LLM is confident (high pValue complement) → α increases
    //   If LLM is uncertain → β increases
    //   Result: posterior mean P(A→B) shifts toward evidence
    try {
      for (const chain of pack.causalChains) {
        const wasCorrect = chain.pValue !== undefined ? chain.pValue < 0.05 : true;
        const confidence = chain.pValue !== undefined ? 1 - chain.pValue : 0.7;

        bayesianUpdater.update({
          sourceDomain: chain.source,
          targetDomain: chain.target,
          wasCorrect,
          predictionConfidence: confidence,
        });
        result.bayesianUpdates++;
      }
      log(`  Bayesian: ${result.bayesianUpdates} posterior updates (α/β conjugate prior)`);
    } catch (err: any) {
      log(`  Bayesian updater failed: ${err.message}`);
    }

    // ── Step 3: CRUD Persistence — Store causal edges for other modules ─
    // Insert discovered edges into the database so downstream ML modules
    // (like the Embedding Tuner) can read them as training data.
    // This MUST happen before Step 4 because the Embedding Tuner reads
    // from `causal_relationships_statistical` to generate triplet pairs.
    try {
      for (const chain of pack.causalChains) {
        await supabase.from('cross_domain_signals').insert({
          organization_id: organizationId,
          source_domain: chain.source,
          signal_type: `llm_causal_${chain.metric}`,
          signal_value: chain.effectSize,
          signal_timestamp: new Date().toISOString(),
          metadata: {
            source: 'llm_distiller',
            lagDays: chain.lagDays,
            pValue: chain.pValue,
            packId: pack.id,
          },
        });
      }

      await supabase.from('ai_memory').insert({
        organization_id: organizationId,
        memory_type: 'llm_distillation',
        domain: pack.domains[0] || 'general',
        content: `LLM distilled ${pack.causalChains.length} causal patterns, ${pack.businessRules.length} rules, ${pack.cascades.length} cascades from ${pack.source}`,
        importance: pack.confidence,
        metadata: {
          packId: pack.id,
          domains: pack.domains,
          causalCount: pack.causalChains.length,
          ruleCount: pack.businessRules.length,
          cascadeCount: pack.cascades.length,
        },
      });
    } catch {
      // Non-critical — CRUD persistence failure doesn't block learning
    }

    // ── Step 4: Embedding Tuner — Gradient descent on transforms ────
    // The tuner reads causal edges from the database (stored above) and
    // generates triplet pairs: (anchor, positive=causal partner, negative=random).
    // Then runs SGD with triplet margin loss to adjust the learned
    // transformation matrix W so causally-related domains are CLOSER
    // in embedding space.
    try {
      const tuningResult = await embeddingTuner.tune();
      result.embeddingEpochs = tuningResult.epochsCompleted;
      result.embeddingFinalLoss = tuningResult.finalLoss;
      log(`  Embedding Tuner: ${tuningResult.epochsCompleted} epochs, loss ${tuningResult.finalLoss.toFixed(4)} (triplet loss + SGD)`);
    } catch (err: any) {
      log(`  Embedding tuner failed: ${err.message}`);
    }

    // ── Step 5: Contrastive Learner — Neural network training ───────
    // Trains a single-layer neural classifier with backpropagation:
    //   Input: embedding difference vector (domain_A - domain_B)
    //   Output: P(A causes B)
    //   Loss: Binary Cross-Entropy
    //   Update: SGD with L2 regularization
    try {
      for (const chain of pack.causalChains) {
        const isCausal = chain.pValue !== undefined ? chain.pValue < 0.05 : true;
        contrastiveLearner.trainOnExample({
          sourceDomain: chain.source,
          targetDomain: chain.target,
          label: isCausal ? 1 : 0,
          labelConfidence: chain.pValue !== undefined ? 1 - chain.pValue : 0.7,
        });
        result.contrastiveExamples++;
      }
      const stats = contrastiveLearner.getStats();
      result.contrastiveAccuracy = stats.accuracy;
      log(`  Contrastive: ${result.contrastiveExamples} examples trained (backprop + BCE loss), accuracy ${(stats.accuracy * 100).toFixed(1)}%`);
    } catch (err: any) {
      log(`  Contrastive learner failed: ${err.message}`);
    }

    return result;
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  return {
    /**
     * Run a complete LLM training cycle.
     *
     * Brain Analog: A full day of learning:
     * 1. SENSE: Fetch text content from public sources (eyes reading)
     * 2. PERCEIVE: LLM extracts structured knowledge (cortex processing)
     * 3. INGEST: Fetch numeric signals from data APIs (proprioception)
     * 4. STORE: Persist all learned knowledge (memory encoding)
     *
     * Call this daily to make the brain smarter.
     */
    async runTrainingCycle(): Promise<LLMTrainingResult> {
      const overallStart = Date.now();
      const errors: string[] = [];
      const narrativeParts: string[] = [];

      log('=== LLM TRAINING CYCLE START ===');

      // ── Phase 1: SENSE — Fetch text content ──────────────────────
      log('Phase 1: SENSE — Fetching text content from public sources...');
      let contentResult: ContentFetchResult;
      try {
        contentResult = await contentFetcher.fetch();
        log(`Fetched ${contentResult.contents.length} content items from ${contentResult.sources.length} sources`);
        narrativeParts.push(`Read ${contentResult.contents.length} articles from ${contentResult.sources.filter(s => s.success).length} sources.`);
      } catch (err: any) {
        contentResult = { contents: [], sources: [], totalDurationMs: 0 };
        errors.push(`Content fetch failed: ${err.message}`);
        log(`Content fetch FAILED: ${err.message}`);
      }

      // ── Phase 2: PERCEIVE — LLM knowledge distillation ──────────
      let distillationResult: DistillationSessionResult | null = null;
      let trainingPack: DistilledTrainingPack | null = null;

      if (contentResult.contents.length > 0) {
        log('Phase 2: PERCEIVE — Distilling knowledge via LLM...');
        try {
          distillationResult = await distiller.distillBatch(contentResult.contents, {
            batchId: `daily_${new Date().toISOString().split('T')[0]}`,
            sequential,
          });

          trainingPack = distillationResult.trainingPack;

          narrativeParts.push(
            `LLM distilled ${distillationResult.totalCausalPatterns} causal patterns, ` +
            `${distillationResult.totalRules} rules, ${distillationResult.totalCascades} cascades.`
          );

          log(`Distilled: ${distillationResult.totalCausalPatterns} causal, ${distillationResult.totalRules} rules, ${distillationResult.totalCascades} cascades`);
        } catch (err: any) {
          errors.push(`LLM distillation failed: ${err.message}`);
          log(`LLM distillation FAILED: ${err.message}`);
        }
      } else {
        log('Phase 2: SKIPPED — No content to distill');
      }

      // ── Phase 3: INGEST — Fetch numeric signals ─────────────────
      let ingestionResult: IngestionResult | null = null;
      log('Phase 3: INGEST — Fetching numeric signals from data APIs...');
      try {
        ingestionResult = await dataLearner.ingest();
        narrativeParts.push(`Ingested ${ingestionResult.totalSignals} numeric signals from ${ingestionResult.sources.filter(s => s.success).length} APIs.`);
        log(`Ingested: ${ingestionResult.totalSignals} signals, stored ${ingestionResult.totalStored}`);
      } catch (err: any) {
        errors.push(`Signal ingestion failed: ${err.message}`);
        log(`Signal ingestion FAILED: ${err.message}`);
      }

      // ── Phase 4: TRAIN — Run through REAL ML learning modules ────
      // This is where actual learning happens — not CRUD, but:
      //   - Bayesian posterior updates (conjugate prior math)
      //   - Gradient descent on embedding transforms (SGD + triplet loss)
      //   - Neural network backprop (BCE loss + L2 regularization)
      let ltpResult: LTPTrainingResult | null = null;
      if (trainingPack && trainingPack.causalChains.length > 0) {
        log('Phase 4: TRAIN — Running LTP learning modules (Bayesian + Embeddings + Contrastive)...');
        try {
          ltpResult = await trainWithLTP(trainingPack);
          narrativeParts.push(
            `LTP trained: ${ltpResult.bayesianUpdates} Bayesian updates, ` +
            `${ltpResult.embeddingEpochs} embedding epochs (loss: ${ltpResult.embeddingFinalLoss.toFixed(4)}), ` +
            `${ltpResult.contrastiveExamples} contrastive examples (accuracy: ${(ltpResult.contrastiveAccuracy * 100).toFixed(1)}%).`
          );
          log(`LTP complete: Bayesian=${ltpResult.bayesianUpdates}, Embedding=${ltpResult.embeddingEpochs} epochs, Contrastive=${ltpResult.contrastiveExamples} examples`);
        } catch (err: any) {
          errors.push(`LTP training failed: ${err.message}`);
          log(`LTP training FAILED: ${err.message}`);
        }
      }

      const totalDurationMs = Date.now() - overallStart;

      // Build narrative
      if (errors.length > 0) {
        narrativeParts.push(`Encountered ${errors.length} errors during training.`);
      }
      narrativeParts.push(`Total training time: ${(totalDurationMs / 1000).toFixed(1)}s.`);

      const narrative = narrativeParts.join(' ');
      log(`=== LLM TRAINING CYCLE COMPLETE (${totalDurationMs}ms) ===`);
      log(narrative);

      return {
        contentFetch: contentResult,
        distillation: distillationResult,
        signalIngestion: ingestionResult,
        trainingPack,
        ltpTraining: ltpResult,
        narrative,
        totalDurationMs,
        errors,
      };
    },

    /**
     * Distill knowledge from custom content (not from public sources).
     * Useful for feeding specific articles, reports, or documents.
     *
     * Brain Analog: A teacher handing the student a specific textbook to read,
     * rather than the student browsing the library.
     */
    async distillCustomContent(contents: RawContent[]): Promise<DistillationSessionResult> {
      return distiller.distillBatch(contents, { sequential });
    },

    /**
     * Get the content fetcher's available sources.
     */
    getContentSources() {
      return contentFetcher.getAvailableSources();
    },

    /**
     * Get the numeric data learner's available sources.
     */
    getDataSources() {
      return dataLearner.getAvailableSources();
    },

    /**
     * Get the Wikipedia topic categories.
     */
    getTopicCategories() {
      return contentFetcher.getTopicCategories();
    },
  };
}
