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
import {
  createSchemaValidator,
  type SchemaValidationResult,
} from '../persistence/schema-validator';

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
  /** Optional brain knowledge context provider for copilot queries */
  brainKnowledgeProvider?: {
    queryBrainKnowledge: (question: string, entityState?: Record<string, unknown>) => import('./brain-knowledge-context').BrainKnowledgeContext;
    formatBrainKnowledgeForPrompt: (context: import('./brain-knowledge-context').BrainKnowledgeContext) => string;
  };
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
  /** Brain knowledge context (if brain knowledge provider is configured) */
  brainKnowledge?: import('./brain-knowledge-context').BrainKnowledgeContext;
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

  // DAG readiness gate: resolves when DAG is loaded (or fails gracefully).
  // Used by ask() to wait for the brain to be ready before answering.
  let resolveDagReady: () => void;
  const dagReadyPromise = new Promise<void>((resolve) => {
    resolveDagReady = resolve;
  });

  // DAG readiness timeout — don't block ask() forever (max 10 seconds)
  const DAG_READY_TIMEOUT_MS = 10_000;
  const dagReadyWithTimeout = Promise.race([
    dagReadyPromise,
    new Promise<void>((resolve) =>
      setTimeout(() => {
        if (!dagLoaded) {
          dagLoaded = true; // Mark as loaded to unblock — empty DAG is better than hanging
        }
        resolve();
      }, DAG_READY_TIMEOUT_MS)
    ),
  ]);

  // Bootstrap DAG from existing relationships in background
  if (shouldLoadDAG) {
    loadDAGFromDatabase(supabase, organizationId, { includeCoreDAG: true })
      .then((dag) => {
        // Load the database DAG into the existing learner instance.
        // The bridge holds a reference to this learner, so updating in-place
        // ensures the entire pipeline sees the loaded graph.
        continuousLearner.loadGraph(dag);
        dagLoaded = true;
        resolveDagReady!();

        // Inject federated context (core brain relationships) into bridge cache
        // so domain agents see universal knowledge alongside org-specific data.
        if (config.repository?.getFederatedRelationships) {
          config.repository.getFederatedRelationships().then((rels) => {
            const coreRels = rels
              .filter((r: any) => r._source === 'core')
              .map((r: any) => ({
                sourceDomain: r.source_domain,
                targetDomain: r.target_domain,
                effectSize: r.effect_size ?? 0,
                pValue: r.granger_p_value ?? 0.05,
                fStatistic: r.granger_f_statistic ?? 0,
                lagDays: r.optimal_lag_days ?? 0,
                naturalLanguage: r.natural_language || '',
                discoveredAt: new Date(r.last_computed_at || Date.now()),
                _source: 'core' as const,
              }));
            if (coreRels.length > 0) {
              contextEnricher.injectFederatedContext(organizationId, coreRels, []);
            }
          }).catch(() => { /* Non-critical */ });
        }
      })
      .catch(() => {
        // No existing DAG — that's fine, start from scratch
        dagLoaded = true;
        resolveDagReady!();
      });
  } else {
    // DAG loading disabled — mark as ready immediately
    dagLoaded = true;
    resolveDagReady!();
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

  // Initialize semantic search with federated causal edge fetcher for reranking
  const semanticSearch = createSemanticSearch({
    ...config.search,
    organizationId,
    causalEdgeFetcher: config.repository?.getFederatedRelationships
      ? async () => {
          const rels = await config.repository!.getFederatedRelationships!();
          return rels.map((r: any) => ({
            sourceDomain: r.source_domain,
            targetDomain: r.target_domain,
            effectSize: r.effect_size ?? 0,
            isSignificant: r.is_significant ?? true,
            naturalLanguage: r.natural_language || '',
          }));
        }
      : config.search?.causalEdgeFetcher,
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
      // 1. Semantic search — with graceful degradation
      let searchResults: any[] = [];
      try {
        searchResults = await semanticSearch.search(supabase, queryText, {
          organizationId,
          limit: 5,
        });
      } catch (searchError: any) {
        // Graceful degradation: if search fails (missing table/RPC), continue without it
        // The brain can still answer from causal context and patterns
        const message = searchError?.message || '';
        if (message.includes('does not exist') || message.includes('42P01') || message.includes('42883')) {
          // Missing table or RPC — this is a setup issue, not a crash
          console.warn(
            `[NexusBrain] Semantic search unavailable: ${message}. ` +
            `Run migrations with 'supabase db push' to enable search.`
          );
        } else {
          // Re-throw unexpected errors
          throw searchError;
        }
      }

      // 2. Get causal context from bridge cache (in-memory, never fails)
      const agentContext = contextEnricher.getContextForAgent(
        organizationId,
        domain
      );

      // 2b. Supplement with federated DB data (org + core brain)
      let federatedRelationships = [...agentContext.causalRelationships];
      if (config.repository?.getFederatedRelationships) {
        try {
          const dbRels = await config.repository.getFederatedRelationships();
          const cacheKeys = new Set(federatedRelationships.map(
            r => `${r.sourceDomain}::${r.targetDomain}`
          ));
          for (const dbRel of dbRels) {
            const key = `${dbRel.source_domain}::${dbRel.target_domain}`;
            if (!cacheKeys.has(key)) {
              federatedRelationships.push({
                sourceDomain: dbRel.source_domain,
                targetDomain: dbRel.target_domain,
                effectSize: dbRel.effect_size ?? 0,
                pValue: dbRel.granger_p_value ?? 0.05,
                fStatistic: dbRel.granger_f_statistic ?? 0,
                lagDays: dbRel.optimal_lag_days ?? 0,
                naturalLanguage: dbRel.natural_language || '',
                confidenceIntervalLower: dbRel.confidence_interval_lower,
                confidenceIntervalUpper: dbRel.confidence_interval_upper,
                sampleSize: dbRel.sample_size,
                discoveredAt: new Date(dbRel.last_computed_at || Date.now()),
                _source: dbRel._source === 'core' ? 'core' : undefined,
              });
              cacheKeys.add(key);
            }
          }
        } catch {
          // Non-critical: fall back to cache-only
        }
      }

      // 2c. Supplement with federated patterns (org + core brain)
      let federatedPatterns = [...agentContext.patterns];
      if (config.repository?.getFederatedRules) {
        try {
          const dbRules = await config.repository.getFederatedRules();
          const patternKeys = new Set(federatedPatterns.map(
            p => `${p.domain}::${p.type}::${(p.payload.naturalLanguage || '').toString().substring(0, 50)}`
          ));
          for (const dbRule of dbRules) {
            const key = `${dbRule.domain}::${dbRule.rule_type}::${(dbRule.natural_language || '').substring(0, 50)}`;
            if (!patternKeys.has(key)) {
              federatedPatterns.push({
                id: dbRule.id || '',
                domain: dbRule.domain || '',
                type: dbRule.rule_type || 'learned',
                payload: {
                  naturalLanguage: dbRule.natural_language || '',
                  conditions: dbRule.conditions,
                  actions: dbRule.actions,
                },
                confidence: dbRule.confidence || 0,
                discoveredAt: new Date(dbRule.created_at || Date.now()),
              });
              patternKeys.add(key);
            }
          }
        } catch {
          // Non-critical: fall back to cache-only patterns
        }
      }

      // 2d. Supplement RAG with federated memories
      if (config.repository?.getFederatedMemories) {
        try {
          const dbMems = await config.repository.getFederatedMemories(domain, 5);
          const existingContent = new Set(searchResults.map((r: any) => (r.content || r.text || '').substring(0, 80)));
          for (const mem of dbMems) {
            if (!existingContent.has((mem.content || '').substring(0, 80))) {
              searchResults.push({
                content: mem.content,
                similarity: 0.5,
                metadata: { _source: mem._source, domain: mem.domain },
              });
            }
          }
        } catch {
          // Non-critical: fall back to search-only results
        }
      }

      // 3. Format for LLM
      const causalContext = formatCausalForPrompt(federatedRelationships);
      const patternContext = formatPatternsForPrompt(federatedPatterns);

      const ragText = searchResults
        .map((r: any) => r.content || r.text || '')
        .filter(Boolean)
        .join('\n---\n');

      // 3b. Brain knowledge context (if provider is configured)
      let brainKnowledge: import('./brain-knowledge-context').BrainKnowledgeContext | undefined;
      let brainKnowledgeText = '';
      if (config.brainKnowledgeProvider) {
        try {
          brainKnowledge = config.brainKnowledgeProvider.queryBrainKnowledge(queryText);
          brainKnowledgeText = config.brainKnowledgeProvider.formatBrainKnowledgeForPrompt(brainKnowledge);
        } catch {
          // Non-critical: fall back to standard context
        }
      }

      const assembledContext = assembleContextPrompt({
        rag: ragText || undefined,
        causal: causalContext || undefined,
        patterns: patternContext || undefined,
        cascades: brainKnowledgeText || undefined,
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
        brainKnowledge,
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

      // DAG readiness gate: wait for causal graph to load before answering.
      // This prevents early queries from getting zero causal context.
      // Times out after DAG_READY_TIMEOUT_MS to avoid hanging indefinitely.
      if (!dagLoaded) {
        await dagReadyWithTimeout;
      }

      try {
        // 1. Query the brain for context
        const nexusContext = await this.query(question, domain);

        // 2. Cold-start detection: if no context found at all, inject indicator
        const hasContext =
          nexusContext.searchResults.length > 0 ||
          nexusContext.causalContext.length > 0 ||
          nexusContext.patternContext.length > 0;

        if (!hasContext) {
          // Inject cold-start hint into assembled context so LLM knows it's working with limited data
          nexusContext.assembledContext =
            `⚠️ COLD START: The organizational brain has limited data for this query. ` +
            `Answers may be less specific until more signals are ingested and patterns are discovered.\n\n` +
            nexusContext.assembledContext;
        }

        // 3. Pass to LLM layer with context
        return await llmLayer.query(question, nexusContext, {
          domain,
          ...options,
        });
      } catch (error: any) {
        // Structured error handling for the ask() path
        const errorMessage = error?.message || 'Unknown error';

        // Differentiate LLM errors from context/search errors
        if (errorMessage.includes('fetch') || errorMessage.includes('network') ||
            errorMessage.includes('ECONNREFUSED') || errorMessage.includes('timeout')) {
          throw new Error(
            `Brain LLM call failed (network): ${errorMessage}. ` +
            `Check your LLM API key and network connectivity.`
          );
        }

        if (errorMessage.includes('401') || errorMessage.includes('403') ||
            errorMessage.includes('api_key') || errorMessage.includes('authentication')) {
          throw new Error(
            `Brain LLM authentication failed: ${errorMessage}. ` +
            `Verify your API key is valid and has sufficient permissions.`
          );
        }

        if (errorMessage.includes('429') || errorMessage.includes('rate_limit')) {
          throw new Error(
            `Brain LLM rate limited: ${errorMessage}. ` +
            `Reduce query frequency or upgrade your API plan.`
          );
        }

        // Re-throw with brain context
        throw new Error(`Brain ask() failed: ${errorMessage}`);
      }
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

    // ── Readiness & Health ────────────────────────────────────────────

    /**
     * Check if the brain is ready to answer questions.
     * Returns true when the DAG has been loaded (or timed out).
     */
    isReady(): boolean {
      return dagLoaded;
    },

    /**
     * Wait for the brain to be fully ready.
     * Resolves when DAG is loaded or timeout is reached.
     */
    async waitForReady(): Promise<void> {
      await dagReadyWithTimeout;
    },

    /**
     * Run a health check to validate all critical subsystems.
     * Call this on startup to catch configuration issues early.
     *
     * @param options.validateSchema - Also check that all required tables/RPCs exist (slower but thorough)
     * @returns Health status with details per subsystem
     */
    async healthCheck(options?: {
      validateSchema?: boolean;
    }): Promise<{
      healthy: boolean;
      subsystems: Record<string, { ok: boolean; message: string }>;
      schema?: SchemaValidationResult;
    }> {
      const subsystems: Record<string, { ok: boolean; message: string }> = {};

      // Check Supabase connectivity
      try {
        const { error } = await supabase
          .from('cross_domain_signals')
          .select('id')
          .limit(1);
        subsystems.supabase = error
          ? { ok: false, message: `Supabase query failed: ${error.message}` }
          : { ok: true, message: 'Connected' };
      } catch (e: any) {
        subsystems.supabase = { ok: false, message: `Supabase unreachable: ${e.message}` };
      }

      // Check search RPC exists with correct parameter names
      try {
        const { error } = await supabase.rpc('search_embeddings', {
          query_embedding: `[${new Array(384).fill(0).join(',')}]`,
          match_threshold: 0.99,
          match_count: 1,
          filter_entity_types: null,
          filter_organization_id: organizationId,
        });
        subsystems.searchRpc = error
          ? { ok: false, message: `search_embeddings RPC failed: ${error.message}. Run migration 20250209000001_fix_rpc_parameter_names.sql` }
          : { ok: true, message: 'Available' };
      } catch (e: any) {
        subsystems.searchRpc = { ok: false, message: `search_embeddings RPC error: ${e.message}` };
      }

      // Check DAG loaded
      subsystems.dag = dagLoaded
        ? { ok: true, message: 'Loaded' }
        : { ok: false, message: 'Still loading — queries may have limited causal context' };

      // Check event bus
      subsystems.eventBus = { ok: true, message: `Active with ${eventBus.getStats().totalEventsProcessed} events processed` };

      // Check LLM layer
      subsystems.llm = llmLayer
        ? { ok: true, message: `Configured (${config.llm?.provider || 'unknown'} provider)` }
        : { ok: false, message: 'Not configured — ask() will fail' };

      // Optional: full schema validation (checks all 26 tables + 6 RPCs)
      let schema: SchemaValidationResult | undefined;
      if (options?.validateSchema) {
        const validator = createSchemaValidator(supabase);
        schema = await validator.validateAll();
        subsystems.schema = schema.valid
          ? { ok: true, message: `All ${schema.existingTables.length} tables and ${schema.existingRpcs.length} RPCs present` }
          : {
              ok: false,
              message: `Missing: ${Object.values(schema.missingTables).flat().length} tables, ${schema.missingRpcs.length} RPCs. Run: supabase db push`,
            };
      }

      const healthy = Object.values(subsystems).every((s) => s.ok);

      return { healthy, subsystems, schema };
    },

    /**
     * Run full schema validation and return detailed results.
     * Use this during deployment/setup to verify database is properly configured.
     *
     * @returns Full schema validation report with setup instructions if anything is missing
     */
    async validateSchema(): Promise<SchemaValidationResult> {
      const validator = createSchemaValidator(supabase);
      return validator.validateAll();
    },
  };
}
