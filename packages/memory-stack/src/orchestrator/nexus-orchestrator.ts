/**
 * Nexus Orchestrator
 *
 * The product layer that ties everything together.
 * Provides a single entry point for:
 *   - Querying organizational memory with causal context
 *   - Ingesting signals from external systems
 *   - Recording outcomes for feedback loop closure
 *   - Prediction recording + verification (via feedback-loop.ts)
 *   - Continuous causal graph learning (via continuous-learner.ts)
 *   - Threshold optimization (via threshold-optimizer.ts)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createEventBus, createOutcomeEvent } from '../causality/event-bus';
import { createSemanticSearch, type SemanticSearchConfig } from '../core/search';
import { wireNexusBridges, type BridgeConfig } from '../bridges';
import {
  formatCausalForPrompt,
  formatPatternsForPrompt,
  formatCascadesForPrompt,
  formatBrainRulesForPrompt,
  assembleContextPrompt,
} from './context-formatters';
import { createFeedbackLoop, type FeedbackLoopConfig } from '../causality/feedback-loop';
import {
  createContinuousLearner,
  loadDAGFromDatabase,
  createEmptyDAG,
} from '../causality/continuous-learner';
import { createThresholdOptimizer, type ThresholdOptimizerConfig } from '../causality/threshold-optimizer';
import {
  createLLMResponseLayer,
  type LLMResponseConfig,
  type LLMResponseResult,
} from './llm-response-layer';
import {
  createResponseFeedbackLoop,
  type ResponseFeedback,
  type FeedbackLearningResult,
} from './response-feedback';
import type { NexusRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

export interface NexusOrchestratorConfig {
  /** Supabase client for persistence */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Bridge wiring configuration */
  bridges?: BridgeConfig;
  /** Semantic search configuration */
  search?: Partial<SemanticSearchConfig>;
  /** Feedback loop configuration */
  feedbackLoop?: Partial<FeedbackLoopConfig>;
  /** Threshold optimizer configuration */
  thresholdOptimizer?: Partial<ThresholdOptimizerConfig>;
  /** Load existing causal DAG from database on startup (default: true) */
  loadExistingDAG?: boolean;
  /** LLM configuration for the ask() method (optional) */
  llm?: LLMResponseConfig;
  /** NexusRepository for centralized persistence (optional) */
  repository?: NexusRepository;
}

export interface NexusQueryResult {
  /** Semantic search results */
  searchResults: Array<{
    content: string;
    similarity: number;
    metadata: Record<string, unknown>;
  }>;
  /** Causal relationships relevant to the query domain */
  causalContext: string;
  /** Discovered patterns */
  patternContext: string;
  /** Full assembled prompt context */
  assembledContext: string;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * Create the Nexus Orchestrator - the main entry point for the brain.
 *
 * Now wires ALL modules:
 * - Event Bus (spine)
 * - 5 Bridges (nervous system)
 * - Feedback Loop (prediction → verification → weight adjustment)
 * - Continuous Learner (real-time causal graph evolution)
 * - Threshold Optimizer (adaptive signal thresholds)
 *
 * @example
 * ```typescript
 * const nexus = createNexusOrchestrator({
 *   supabase,
 *   organizationId: 'org_123',
 * });
 *
 * // Query with full causal context
 * const result = await nexus.query('Why is churn increasing?', 'cs');
 *
 * // Ingest a signal
 * nexus.ingest([{ source_domain: 'finance', signal_type: 'payment_delay', ... }]);
 *
 * // Record prediction + verify later
 * const predId = await nexus.recordPrediction({ ... });
 * await nexus.verifyPrediction(predId, { direction: 'decrease', magnitude: -0.25 });
 * ```
 */
export function createNexusOrchestrator(config: NexusOrchestratorConfig) {
  const {
    supabase,
    organizationId,
    bridges: bridgeConfig,
    loadExistingDAG: shouldLoadDAG = true,
  } = config;

  // Initialize event bus
  const eventBus = createEventBus();

  // Initialize continuous learner with empty DAG
  // (will be bootstrapped from DB asynchronously if loadExistingDAG=true)
  const continuousLearner = createContinuousLearner(createEmptyDAG([]));
  let dagLoaded = false;

  // Bootstrap DAG from existing relationships in background
  if (shouldLoadDAG) {
    loadDAGFromDatabase(supabase, organizationId)
      .then((dag) => {
        // Load the database DAG into the existing learner instance.
        // The bridge holds a reference to this learner, so updating in-place
        // ensures the entire pipeline sees the loaded graph.
        continuousLearner.loadGraph(dag);
        dagLoaded = true;
      })
      .catch(() => {
        // No existing DAG — that's fine, start from scratch
        dagLoaded = true;
      });
  }

  // Wire all bridges WITH continuous learner
  const {
    signalBridge,
    contextEnricher,
    feedbackBridge,
    getStats: getBridgeStats,
  } = wireNexusBridges(eventBus, {
    ...bridgeConfig,
    continuousLearner,
  });

  // Initialize semantic search
  const semanticSearch = createSemanticSearch({
    ...config.search,
    organizationId,
  });

  // Initialize feedback loop (Supabase-backed prediction tracking)
  const feedbackLoop = createFeedbackLoop(config.feedbackLoop);

  // Initialize threshold optimizer
  const thresholdOptimizer = createThresholdOptimizer(config.thresholdOptimizer);

  // Initialize LLM response layer (optional — only if LLM config is provided)
  const llmLayer = config.llm
    ? createLLMResponseLayer({
        ...config.llm,
        repository: config.llm.repository || config.repository,
      })
    : null;

  // Initialize response feedback loop (optional — only if repository is provided)
  const responseFeedback = config.repository
    ? createResponseFeedbackLoop(config.repository)
    : null;

  return {
    /**
     * Query organizational memory with causal context enrichment
     */
    async query(
      queryText: string,
      domain?: string
    ): Promise<NexusQueryResult> {
      // 1. Semantic search
      const searchResults = await semanticSearch.search(supabase, queryText, {
        organizationId,
        limit: 5,
      });

      // 2. Get causal context from bridge cache
      const agentContext = contextEnricher.getContextForAgent(
        organizationId,
        domain
      );

      // 3. Format for LLM
      const causalContext = formatCausalForPrompt(
        agentContext.causalRelationships
      );
      const patternContext = formatPatternsForPrompt(agentContext.patterns);

      const ragText = searchResults
        .map((r: any) => r.content || r.text || '')
        .filter(Boolean)
        .join('\n---\n');

      const assembledContext = assembleContextPrompt({
        rag: ragText || undefined,
        causal: causalContext || undefined,
        patterns: patternContext || undefined,
      });

      return {
        searchResults: searchResults.map((r: any) => ({
          content: r.content || r.text || '',
          similarity: r.similarity || 0,
          metadata: r.metadata || {},
        })),
        causalContext,
        patternContext,
        assembledContext,
      };
    },

    /**
     * Ingest signals from external systems
     */
    ingest(signals: Array<{
      organization_id?: string;
      source_domain: string;
      signal_type: string;
      signal_value: number;
      entity_type?: string;
      entity_id?: string;
      client_id?: string;
      metadata?: Record<string, unknown>;
    }>) {
      signalBridge.onSignalsCollected(signals);
    },

    /**
     * Record an outcome for feedback loop closure.
     * Emits outcome event to the event bus AND records in the feedback bridge.
     */
    recordOutcome(outcome: {
      entityType: string;
      entityId: string;
      metricValue: number;
      domain: string;
      metadata?: Record<string, unknown>;
    }) {
      const event = createOutcomeEvent(organizationId, {
        entity_type: outcome.entityType,
        entity_id: outcome.entityId,
        metric_name: outcome.entityType,
        metric_value: outcome.metricValue,
      });
      eventBus.emit(event);
    },

    // ── Feedback Loop (wired to feedback-loop.ts) ─────────────────────

    /**
     * Record a prediction for later verification.
     * Persists to Supabase via the feedback loop module.
     */
    async recordPrediction(input: {
      relationshipId: string;
      sourceDomain: string;
      targetDomain: string;
      entityType: string;
      entityId: string;
      prediction: {
        targetMetric: string;
        direction: 'increase' | 'decrease' | 'stable';
        magnitude: number;
        timeframeHours: number;
        confidence: number;
      };
      featureSnapshot: Record<string, number>;
    }): Promise<string> {
      return feedbackLoop.recordPrediction(supabase, organizationId, input);
    },

    /**
     * Verify a prediction with actual outcome.
     * Adjusts relationship weights automatically.
     */
    async verifyPrediction(
      predictionId: string,
      actualOutcome: {
        direction: 'increase' | 'decrease' | 'stable';
        magnitude: number;
      }
    ) {
      return feedbackLoop.verifyPrediction(supabase, predictionId, actualOutcome);
    },

    /**
     * Process all pending verifications (call from scheduled job).
     */
    async processPendingVerifications() {
      return feedbackLoop.processPendingVerifications(supabase, organizationId);
    },

    /**
     * Update all relationship weights based on prediction accuracy.
     */
    async updateWeights() {
      return feedbackLoop.updateAllWeights(supabase, organizationId);
    },

    /**
     * Find relationships whose accuracy is degrading.
     */
    async findDegradingRelationships() {
      return feedbackLoop.findDegradingRelationships(supabase, organizationId);
    },

    // ── Continuous Learner ────────────────────────────────────────────

    /**
     * Get the continuous learner for direct access.
     */
    getContinuousLearner() {
      return continuousLearner;
    },

    /**
     * Apply evidence decay to the causal graph.
     * Weakens old evidence to keep the graph fresh.
     */
    applyEvidenceDecay() {
      return continuousLearner.applyEvidenceDecay();
    },

    // ── Threshold Optimizer ──────────────────────────────────────────

    /**
     * Get the threshold optimizer for direct access.
     */
    getThresholdOptimizer() {
      return thresholdOptimizer;
    },

    // ── Core Access ──────────────────────────────────────────────────

    /** Get the event bus instance for direct access */
    getEventBus() {
      return eventBus;
    },

    /** Get context enricher for domain agents */
    getContextEnricher() {
      return contextEnricher;
    },

    /** Get the feedback loop instance */
    getFeedbackLoop() {
      return feedbackLoop;
    },

    /** Get stats from all layers */
    getStats() {
      return {
        bridges: getBridgeStats(),
        eventBus: eventBus.getStats(),
        continuousLearner: {
          dagLoaded,
          graphStats: continuousLearner.getGraph(),
        },
      };
    },

    // ── LLM Response Layer (ask + feedback) ───────────────────────

    /**
     * Ask the brain a question and get an LLM-generated answer
     * enriched with causal context, patterns, and organizational memory.
     *
     * This is the highest-level API — combines query() + LLM response.
     * Requires `llm` config to be set in the orchestrator config.
     *
     * @example
     * ```typescript
     * const answer = await nexus.ask('Why is churn increasing?', 'cs');
     * console.log(answer.text);
     * console.log(`Used ${answer.contextUsed.causalRelationships} causal relationships`);
     * ```
     */
    async ask(
      question: string,
      domain?: string,
      options?: {
        conversationId?: string;
        includeHistory?: boolean;
        maxHistoryMessages?: number;
      }
    ): Promise<LLMResponseResult> {
      if (!llmLayer) {
        throw new Error(
          'LLM layer not configured. Provide `llm` config when creating the orchestrator.'
        );
      }

      // 1. Query the brain for context
      const nexusContext = await this.query(question, domain);

      // 2. Pass to LLM layer with context
      return llmLayer.query(question, nexusContext, {
        domain,
        ...options,
      });
    },

    /**
     * Continue a multi-turn conversation with the brain.
     * Requires `llm` config to be set.
     */
    async continueConversation(
      conversationId: string,
      question: string,
      domain?: string
    ): Promise<LLMResponseResult> {
      if (!llmLayer) {
        throw new Error(
          'LLM layer not configured. Provide `llm` config when creating the orchestrator.'
        );
      }

      const nexusContext = await this.query(question, domain);
      return llmLayer.continueConversation(conversationId, question, nexusContext);
    },

    /**
     * Record feedback about an LLM response.
     * When feedback includes a correction, it becomes organizational memory.
     * Requires `repository` to be set.
     */
    async recordResponseFeedback(feedback: ResponseFeedback): Promise<void> {
      if (!responseFeedback) {
        throw new Error(
          'Repository not configured. Provide `repository` config when creating the orchestrator.'
        );
      }
      await responseFeedback.recordFeedback(feedback);
    },

    /**
     * Process pending response feedback and create organizational memories.
     * Incorrect answers with corrections become new ai_memory entries.
     * Requires `repository` to be set.
     */
    async learnFromResponseFeedback(): Promise<FeedbackLearningResult> {
      if (!responseFeedback) {
        throw new Error(
          'Repository not configured. Provide `repository` config when creating the orchestrator.'
        );
      }
      return responseFeedback.learnFromFeedback();
    },

    // ── Layer Access ──────────────────────────────────────────────

    /** Get the LLM response layer for direct access (null if not configured) */
    getLLMLayer() {
      return llmLayer;
    },

    /** Get the NexusRepository for direct access (null if not configured) */
    getRepository() {
      return config.repository || null;
    },

    /** Get the response feedback loop for direct access (null if not configured) */
    getResponseFeedback() {
      return responseFeedback;
    },
  };
}
