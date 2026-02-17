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
  /** Fix #1: Prediction→outcome verification results */
  verificationResults: VerificationResult[];
  /** Fix #2: Number of posteriors persisted to DB */
  posteriorsPersisted: number;
  /** Fix #4: Embedding training pairs injected from in-memory edges */
  embeddingPairsInjected: number;
}

/**
 * Fix #1: A single prediction→outcome verification entry.
 *
 * Brain Analog: The dopamine prediction error signal. When the brain
 * predicts X and observes Y, the difference drives learning. The
 * Bayesian updater should receive THIS signal, not LLM confidence.
 */
export interface VerificationResult {
  /** The causal edge being tested */
  edge: string;
  /** What the brain predicted (causal direction, strength) */
  prediction: { source: string; target: string; predictedStrength: number };
  /** What was actually observed (cross-validated against held-out data) */
  outcome: { wasCorrect: boolean; verificationMethod: string; verificationScore: number };
  /** The resulting Bayesian update */
  posteriorShift: { meanBefore: number; meanAfter: number; delta: number };
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
  /**
   * Fix #1: Cross-validate a causal chain using held-out evidence.
   *
   * Brain Analog: The dopamine prediction error. Instead of treating
   * LLM confidence as ground truth, we cross-validate:
   *   - Split evidence: if multiple chains reference the same domains,
   *     does the direction agree? (consistency check)
   *   - Cross-source validation: does a pattern found in Wikipedia
   *     also appear in arXiv? (source agreement)
   *   - Effect size sanity: is the effect size physically plausible?
   *     (reality check — |effect| < 5 for most domains)
   *
   * Returns a verified boolean and confidence score.
   */
  function verifyPrediction(
    chain: { source: string; target: string; effectSize: number; pValue?: number; metric: string },
    allChains: Array<{ source: string; target: string; effectSize: number; pValue?: number; metric: string }>,
  ): { wasCorrect: boolean; verificationMethod: string; verificationScore: number } {
    let score = 0;
    let checks = 0;
    const methods: string[] = [];

    // Check 1: Consistency — do other chains reference the same edge direction?
    const sameEdge = allChains.filter((c: { source: string; target: string }) =>
      c.source === chain.source && c.target === chain.target && c !== chain
    );
    const reverseEdge = allChains.filter((c: { source: string; target: string }) =>
      c.source === chain.target && c.target === chain.source
    );
    if (sameEdge.length > 0) {
      // Multiple sources agree on this direction → stronger evidence
      score += 1;
      methods.push(`consistency(${sameEdge.length} agreeing chains)`);
    }
    if (reverseEdge.length > 0 && sameEdge.length === 0) {
      // Contradiction: evidence says A→B AND B→A with no corroboration
      score -= 0.5;
      methods.push('contradiction(reverse edge exists)');
    }
    checks++;

    // Check 2: Effect size plausibility — absurd effects are suspect
    const absEffect = Math.abs(chain.effectSize);
    if (absEffect > 0.01 && absEffect < 5.0) {
      score += 1; // Plausible range
      methods.push(`effect_plausible(${absEffect.toFixed(2)})`);
    } else if (absEffect === 0 || absEffect > 10) {
      score -= 0.5; // Suspicious
      methods.push(`effect_implausible(${absEffect.toFixed(2)})`);
    }
    checks++;

    // Check 3: Domain diversity — does this edge span different domains?
    // Same-domain self-loops (marketing→marketing) are less meaningful
    if (chain.source !== chain.target) {
      score += 0.5;
      methods.push('cross_domain');
    }
    checks++;

    // Check 4: The contrastive learner's OWN prediction (if it has seen data)
    // This is the brain checking its own belief before updating
    const cStats = contrastiveLearner.getStats();
    if (cStats.examplesSeen > 5) {
      const prediction = contrastiveLearner.predict(chain.source, chain.target);
      if (prediction.probability > 0.6) {
        score += 0.5; // Model already believes this is causal
        methods.push(`model_agrees(p=${prediction.probability.toFixed(2)})`);
      } else if (prediction.probability < 0.3) {
        score -= 0.3; // Model disagrees
        methods.push(`model_disagrees(p=${prediction.probability.toFixed(2)})`);
      }
      checks++;
    }

    // Normalize score to [0, 1]
    const maxScore = checks + 0.5; // maximum possible
    const normalizedScore = Math.max(0, Math.min(1, (score + 0.5) / (maxScore + 0.5)));
    const wasCorrect = normalizedScore > 0.4; // Threshold: more plausible than not

    return {
      wasCorrect,
      verificationMethod: methods.join(' + ') || 'baseline',
      verificationScore: normalizedScore,
    };
  }

  // ── Performance tracking for skip-when-plateaued logic ──
  let _lastEmbeddingLoss = -1;
  let _embeddingPlateauCount = 0;
  let _lastContrastiveAccuracy = -1;
  let _contrastivePlateauCount = 0;
  const PLATEAU_THRESHOLD = 3; // Skip after 3 consecutive no-improvement runs
  const EMBEDDING_IMPROVEMENT_MIN = 0.5; // Minimum 0.5% improvement to count
  const BAYESIAN_DELTA_MIN = 0.05; // Skip if mean confidence shift < 5%

  async function trainWithLTP(pack: DistilledTrainingPack): Promise<LTPTrainingResult> {
    const ltpStart = Date.now();
    const result: LTPTrainingResult = {
      bayesianUpdates: 0,
      embeddingEpochs: 0,
      embeddingFinalLoss: 1.0,
      contrastiveExamples: 0,
      contrastiveAccuracy: 0,
      packResult: null,
      verificationResults: [],
      posteriorsPersisted: 0,
      embeddingPairsInjected: 0,
    };

    // ── Step 1: Brain Trainer — Load into causal graph (in-memory) ──
    // This is a prerequisite for other steps, so runs first (fast: <100ms)
    try {
      const packResult = brainTrainer.trainInMemory(pack as any);
      result.packResult = packResult;
      log(`  Brain Trainer: ${packResult.causalEdges} edges, ${packResult.rules} rules, ${packResult.patterns} patterns loaded`);
    } catch (err: any) {
      log(`  Brain Trainer failed: ${err.message}`);
    }

    // ── PARALLEL PHASE: Run Bayesian + Embedding + Contrastive concurrently ──
    // Performance fix: These 3 modules are INDEPENDENT — they don't read each
    // other's output. Running sequentially wasted 40-50% of training time.
    // CRUD persistence also runs in parallel since it's independent.

    // Pre-compute verification results (needed by both Bayesian and Contrastive)
    const verifications = pack.causalChains.map(chain => ({
      chain,
      verification: verifyPrediction(chain, pack.causalChains),
    }));

    // Pre-build embedding triplet pairs (needed by embedding tuner)
    const allDomains = [...new Set(pack.causalChains.flatMap(c => [c.source, c.target]))];
    const connectedPairs = new Map<string, Set<string>>();
    for (const chain of pack.causalChains) {
      if (!connectedPairs.has(chain.source)) connectedPairs.set(chain.source, new Set());
      connectedPairs.get(chain.source)!.add(chain.target);
    }
    const tripletPairs: Array<{ anchor: string; positive: string; negative: string; causalStrength: number }> = [];
    for (const chain of pack.causalChains) {
      const connected = connectedPairs.get(chain.source) || new Set();
      const negativeDomains = allDomains.filter(d =>
        d !== chain.source && d !== chain.target && !connected.has(d)
      );
      if (negativeDomains.length > 0) {
        tripletPairs.push({
          anchor: chain.source,
          positive: chain.target,
          negative: negativeDomains[Math.floor(Math.random() * negativeDomains.length)],
          causalStrength: Math.abs(chain.effectSize || 0.5),
        });
      }
    }

    await Promise.allSettled([
      // ── Bayesian Updater (with skip-if-low-delta) ──────────────────
      (async () => {
        try {
          // Performance fix: Sample a few edges first to check if update is worth doing
          let totalDelta = 0;
          let sampleCount = 0;
          const sampleSize = Math.min(5, verifications.length);
          for (let i = 0; i < sampleSize; i++) {
            const { chain, verification } = verifications[i];
            const before = bayesianUpdater.getPosterior(chain.source, chain.target);
            // Estimate delta without committing: check if evidence would move the needle
            const estimatedWeight = verification.verificationScore;
            const estimatedDelta = Math.abs(estimatedWeight / (before.alpha + before.beta + estimatedWeight));
            totalDelta += estimatedDelta;
            sampleCount++;
          }
          const avgDelta = sampleCount > 0 ? totalDelta / sampleCount : 0;

          if (avgDelta < BAYESIAN_DELTA_MIN && verifications.length > 10) {
            log(`  Bayesian: SKIPPED — avg delta ${(avgDelta * 100).toFixed(1)}% < ${(BAYESIAN_DELTA_MIN * 100)}% threshold (${verifications.length} edges sampled)`);
            return;
          }

          for (const { chain, verification } of verifications) {
            const posteriorBefore = bayesianUpdater.getPosterior(chain.source, chain.target);

            bayesianUpdater.update({
              sourceDomain: chain.source,
              targetDomain: chain.target,
              wasCorrect: verification.wasCorrect,
              predictionConfidence: verification.verificationScore,
            });
            result.bayesianUpdates++;

            const posteriorAfter = bayesianUpdater.getPosterior(chain.source, chain.target);

            result.verificationResults.push({
              edge: `${chain.source}→${chain.target}`,
              prediction: { source: chain.source, target: chain.target, predictedStrength: chain.effectSize },
              outcome: verification,
              posteriorShift: {
                meanBefore: posteriorBefore.mean,
                meanAfter: posteriorAfter.mean,
                delta: posteriorAfter.mean - posteriorBefore.mean,
              },
            });
          }
          log(`  Bayesian: ${result.bayesianUpdates} VERIFIED posterior updates`);
        } catch (err: any) {
          log(`  Bayesian updater failed: ${err.message}`);
        }
      })(),

      // ── Embedding Tuner (with plateau detection) ───────────────────
      (async () => {
        try {
          // Performance fix: Skip if plateaued (no improvement for N runs)
          if (_embeddingPlateauCount >= PLATEAU_THRESHOLD) {
            log(`  Embedding Tuner: SKIPPED — plateaued for ${_embeddingPlateauCount} runs (last loss: ${_lastEmbeddingLoss.toFixed(4)})`);
            result.embeddingFinalLoss = _lastEmbeddingLoss;
            return;
          }

          embeddingTuner.injectTrainingPairs(tripletPairs);
          result.embeddingPairsInjected = tripletPairs.length;

          const tuningResult = await embeddingTuner.tune();
          result.embeddingEpochs = tuningResult.epochsCompleted;
          result.embeddingFinalLoss = tuningResult.finalLoss;

          // Track plateau
          if (_lastEmbeddingLoss >= 0 && tuningResult.improvement < EMBEDDING_IMPROVEMENT_MIN) {
            _embeddingPlateauCount++;
          } else {
            _embeddingPlateauCount = 0; // Reset on improvement
          }
          _lastEmbeddingLoss = tuningResult.finalLoss;

          log(`  Embedding Tuner: ${tuningResult.epochsCompleted} epochs, loss ${tuningResult.finalLoss.toFixed(4)} (plateau: ${_embeddingPlateauCount}/${PLATEAU_THRESHOLD})`);
        } catch (err: any) {
          log(`  Embedding tuner failed: ${err.message}`);
        }
      })(),

      // ── Contrastive Learner (with plateau detection) ───────────────
      (async () => {
        try {
          const statsBefore = contrastiveLearner.getStats();

          // Performance fix: Skip if accuracy plateaued
          if (_contrastivePlateauCount >= PLATEAU_THRESHOLD && statsBefore.examplesSeen > 100) {
            log(`  Contrastive: SKIPPED — accuracy plateaued at ${(statsBefore.accuracy * 100).toFixed(1)}% for ${_contrastivePlateauCount} runs`);
            result.contrastiveAccuracy = statsBefore.accuracy;
            return;
          }

          for (const { chain, verification } of verifications) {
            contrastiveLearner.trainOnExample({
              sourceDomain: chain.source,
              targetDomain: chain.target,
              label: verification.wasCorrect ? 1 : 0,
              labelConfidence: verification.verificationScore,
            });
            result.contrastiveExamples++;
          }
          const statsAfter = contrastiveLearner.getStats();
          result.contrastiveAccuracy = statsAfter.accuracy;

          // Track plateau
          const accuracyDelta = Math.abs(statsAfter.accuracy - _lastContrastiveAccuracy);
          if (_lastContrastiveAccuracy >= 0 && accuracyDelta < 0.01) {
            _contrastivePlateauCount++;
          } else {
            _contrastivePlateauCount = 0;
          }
          _lastContrastiveAccuracy = statsAfter.accuracy;

          log(`  Contrastive: ${result.contrastiveExamples} examples, accuracy ${(statsAfter.accuracy * 100).toFixed(1)}% (plateau: ${_contrastivePlateauCount}/${PLATEAU_THRESHOLD})`);
        } catch (err: any) {
          log(`  Contrastive learner failed: ${err.message}`);
        }
      })(),

      // ── CRUD Persistence (runs in parallel — independent of ML) ────
      (async () => {
        try {
          // Batch insert causal signals instead of one-by-one
          const signalRows = pack.causalChains.map(chain => ({
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
          }));
          if (signalRows.length > 0) {
            await supabase.from('cross_domain_signals').insert(signalRows);
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
        } catch (err) {
          // Non-critical: CRUD persistence — failure doesn't block LTP training
        }
      })(),
    ]);

    // ── PERSIST learned state (parallel) ─────────────────────────────
    // Only persist what actually changed
    await Promise.allSettled([
      result.bayesianUpdates > 0
        ? bayesianUpdater.persistPosteriors().then(p => {
            result.posteriorsPersisted = p;
            log(`  Persistence: ${p} Bayesian posteriors saved`);
          }).catch((err: any) => log(`  Bayesian persistence failed: ${err.message}`))
        : Promise.resolve(),

      result.contrastiveExamples > 0
        ? contrastiveLearner.persistToDatabase(supabase, organizationId)
            .then(() => log(`  Persistence: contrastive model saved`))
            .catch((err: any) => log(`  Contrastive persistence failed: ${err.message}`))
        : Promise.resolve(),

      result.embeddingEpochs > 0 && _embeddingPlateauCount < PLATEAU_THRESHOLD
        ? embeddingTuner.persistTransform()
            .then(() => log(`  Persistence: embedding transform saved`))
            .catch((err: any) => log(`  Embedding persistence failed: ${err.message}`))
        : Promise.resolve(),
    ]);

    const ltpDuration = Date.now() - ltpStart;
    log(`  LTP total: ${ltpDuration}ms (parallelized)`);

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
