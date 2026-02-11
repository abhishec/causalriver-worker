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
 *   4. TRAIN → Brain Trainer loads structured knowledge
 *   5. LEARN → Autonomous learner runs causal discovery on all data
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
  });

  const dataLearner = createPublicDataLearner({
    supabase,
    organizationId,
    fredApiKey,
    enabledSources: dataSources,
    verbose,
  });

  /**
   * Store a distilled training pack's causal knowledge in the database.
   *
   * Brain Analog: Writing new memories to long-term storage.
   * The hippocampus has processed the information; now it's being
   * transferred to the neocortex for permanent storage.
   */
  async function storeDistilledKnowledge(pack: DistilledTrainingPack): Promise<number> {
    let stored = 0;

    // Store causal chains as cross-domain signals
    for (const chain of pack.causalChains) {
      try {
        const { error } = await supabase
          .from('cross_domain_signals')
          .insert({
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

        if (!error) stored++;
      } catch {
        // Non-critical
      }
    }

    // Store distillation as an AI memory for narrative retrieval
    try {
      const { error } = await supabase
        .from('ai_memory')
        .insert({
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

      if (!error) stored++;
    } catch {
      // Non-critical
    }

    return stored;
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

      // ── Phase 4: STORE — Persist distilled knowledge ────────────
      if (trainingPack && trainingPack.causalChains.length > 0) {
        log('Phase 4: STORE — Persisting distilled knowledge...');
        try {
          const stored = await storeDistilledKnowledge(trainingPack);
          narrativeParts.push(`Stored ${stored} knowledge items to long-term memory.`);
          log(`Stored ${stored} knowledge items`);
        } catch (err: any) {
          errors.push(`Knowledge storage failed: ${err.message}`);
          log(`Knowledge storage FAILED: ${err.message}`);
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
