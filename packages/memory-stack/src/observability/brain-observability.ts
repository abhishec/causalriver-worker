/**
 * Brain Observability Framework — "The Black Box Recorder"
 *
 * This module provides comprehensive observability across all 7 brain layers,
 * enabling forensic analysis, gap detection, performance optimization, and
 * compliance auditing. Every signal, calculation, decision, and outcome is
 * tracked with timestamp precision.
 *
 * Architecture:
 * - Layer-specific recorders for each brain layer (L1-L7)
 * - Meta recorders for feedback loops, consolidation, and health
 * - Async batch writing for performance (don't block brain operations)
 * - Automatic partitioning and archival for scale
 *
 * Usage:
 * ```ts
 * const obs = createBrainObservability({ supabase, organizationId });
 *
 * // Record signal ingestion
 * await obs.recordSignalIngestion({
 *   signal_id: signal.id,
 *   source_domain: 'revenue',
 *   signal_type: 'mrr_change',
 *   signal_value: 12500,
 *   ingestion_latency_ms: 45
 * });
 *
 * // Record causal calculation
 * await obs.recordCausalCalculation({
 *   calculation_type: 'granger',
 *   source_domain: 'marketing_spend',
 *   target_domain: 'revenue',
 *   granger_p_value: 0.003,
 *   is_significant: true
 * });
 *
 * // Query layer health
 * const health = await obs.getLayerHealth(4); // L4: Causal
 * console.log(`Causal layer health: ${health.health_score}/100`);
 * ```
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getDefaultLogger, type NexusLogger } from './index';
import { createRetry } from '../infra/retry';
import { createCircuitBreaker, CircuitOpenError } from '../infra/circuit-breaker';

// ============================================================================
// TYPES
// ============================================================================

export interface BrainObservabilityConfig {
  supabase: SupabaseClient;
  organizationId: string;
  /** Enable async batch writing (default: true) */
  batchMode?: boolean;
  /** Batch write interval in ms (default: 5000) */
  batchIntervalMs?: number;
  /** Max batch size (default: 100) */
  maxBatchSize?: number;
  /** Verbose logging (default: false) */
  verbose?: boolean;
  /** Custom logger */
  logger?: NexusLogger;
}

// L1: Signal Ingestion
export interface SignalIngestionRecord {
  signal_id?: string;
  source_domain: string;
  signal_type: string;
  entity_type: string;
  entity_id: string;
  signal_value?: number;
  signal_metadata?: Record<string, unknown>;
  nlp_enriched?: boolean;
  nlp_sentiment?: number;
  nlp_topics?: string[];
  knowledge_enriched?: boolean;
  knowledge_entities?: string[];
  ingestion_latency_ms?: number;
  enrichment_latency_ms?: number;
  total_latency_ms?: number;
  quality_score?: number;
  quality_flags?: string[];
  is_quarantined?: boolean;
  ingested_at: string; // ISO timestamp
  processed_at?: string;
}

// L2: Entity Resolution
export interface EntityResolutionRecord {
  input_entity_type: string;
  input_entity_id: string;
  input_name?: string;
  input_aliases?: string[];
  resolved_entity_id?: string;
  canonical_name: string;
  resolution_method?: 'exact_match' | 'fuzzy_match' | 'ml_match' | 'manual';
  confidence: number;
  matched_fields?: Record<string, unknown>;
  similarity_score?: number;
  alternative_matches?: unknown[];
  resolution_latency_ms?: number;
  resolved_at: string;
}

// L3: Semantic Operations
export interface SemanticOperationRecord {
  operation_type: 'embed' | 'search' | 'similarity' | 'cluster';
  embedding_id?: string;
  entity_type?: string;
  entity_id?: string;
  content_hash?: string;
  embedding_model?: string;
  embedding_dimensions?: number;
  search_query?: string;
  search_results_count?: number;
  search_max_distance?: number;
  search_top_k?: number;
  cache_hit?: boolean;
  cache_key?: string;
  operation_latency_ms?: number;
  tokens_consumed?: number;
  cost_usd?: number;
  executed_at: string;
}

// L4: Causal Calculations
export interface CausalCalculationRecord {
  calculation_type: 'granger' | 'pc_algorithm' | 'var' | 'incremental' | 'discovery';
  source_domain?: string;
  target_domain?: string;
  time_series_length?: number;
  lag_days?: number;
  observations_count?: number;
  relationship_id?: string;
  granger_f_statistic?: number;
  granger_p_value?: number;
  effect_size?: number;
  is_significant?: boolean;
  confidence_interval_lower?: number;
  confidence_interval_upper?: number;
  discovery_run_id?: string;
  method_votes?: Record<string, string>;
  bayesian_judgment?: string;
  old_weight?: number;
  new_weight?: number;
  weight_update_reason?: string;
  calculation_latency_ms?: number;
  memory_mb?: number;
  calculated_at: string;
}

// L5: Pattern Learning
export interface PatternLearningRecord {
  operation_type: 'discover' | 'evaluate' | 'train' | 'validate';
  pattern_id?: string;
  pattern_type?: 'association' | 'sequential' | 'temporal' | 'cascade';
  domain?: string;
  support?: number;
  confidence?: number;
  lift?: number;
  significance_p_value?: number;
  rule_evaluated?: boolean;
  condition_expression?: Record<string, unknown>;
  input_signals?: Record<string, unknown>;
  evaluation_result?: 'fired' | 'skipped' | 'error';
  actions_taken?: unknown[];
  training_pack_id?: string;
  training_examples_count?: number;
  training_accuracy?: number;
  operation_latency_ms?: number;
  executed_at: string;
}

// L6: Agent Executions
export interface AgentExecutionRecord {
  agent_type: string;
  agent_level?: 'primary' | 'secondary' | 'tertiary';
  agent_run_id: string;
  trigger_type?: 'scheduled' | 'event' | 'manual' | 'cascade';
  trigger_event_id?: string;
  input_context?: Record<string, unknown>;
  causal_edges_used?: number;
  patterns_used?: number;
  memories_retrieved?: number;
  actions_generated?: number;
  motor_commands_issued?: number;
  predictions_made?: number;
  status: 'success' | 'partial' | 'failed';
  output_summary?: string;
  output_artifacts?: Record<string, unknown>;
  error_message?: string;
  execution_latency_ms?: number;
  tokens_consumed?: number;
  llm_calls_made?: number;
  cost_usd?: number;
  started_at: string;
  completed_at?: string;
}

// L7: Connector Operations
export interface ConnectorOperationRecord {
  connector_type: string;
  connector_id: string;
  operation_type: 'sync' | 'fetch' | 'push' | 'auth' | 'healthcheck';
  sync_type?: 'full' | 'incremental';
  records_fetched?: number;
  signals_generated?: number;
  entities_resolved?: number;
  errors_count?: number;
  error_types?: Record<string, number>;
  error_messages?: string[];
  duplicate_records?: number;
  invalid_records?: number;
  data_quality_score?: number;
  operation_latency_ms?: number;
  api_calls_made?: number;
  rate_limit_remaining?: number;
  started_at: string;
  completed_at?: string;
}

// META: Feedback Loops
export interface FeedbackLoopRecord {
  prediction_id?: string;
  prediction_type: string;
  domain: string;
  predicted_value?: number;
  predicted_outcome?: string;
  confidence: number;
  prediction_horizon_days?: number;
  source_rule_id?: string;
  source_agent?: string;
  actual_value?: number;
  actual_outcome?: string;
  was_correct?: boolean;
  absolute_error?: number;
  squared_error?: number;
  calibration_bucket?: string;
  is_calibrated?: boolean;
  weight_adjusted?: boolean;
  weight_old?: number;
  weight_new?: number;
  bayesian_update_applied?: boolean;
  predicted_at: string;
  verified_at?: string;
  feedback_processed_at?: string;
}

// META: Consolidation Cycles
export interface ConsolidationCycleRecord {
  consolidation_run_id: string;
  is_core_brain: boolean;
  lookback_hours?: number;
  prune_after_days?: number;
  min_edge_weight?: number;
  signals_in_window?: number;
  domains_active?: number;
  existing_edges_count?: number;
  causal_edges_discovered?: number;
  new_relationships?: number;
  lost_relationships?: number;
  anomalies_detected?: number;
  patterns_found?: number;
  training_packs_generated?: number;
  edges_pruned?: number;
  edges_strengthened?: number;
  edges_decayed?: number;
  memories_created?: number;
  total_duration_ms?: number;
  step_durations?: Record<string, number>;
  memory_peak_mb?: number;
  narrative?: string;
  discoveries?: string[];
  warnings?: string[];
  status: 'success' | 'partial' | 'failed';
  started_at: string;
  completed_at?: string;
}

// L8: Deep Dreaming (Subconscious Processing)
export interface DeepDreamingRecord {
  cycle_id: string;
  cycle_type?: 'replay' | 'association' | 'consolidation';
  signals_replayed?: number;
  patterns_discovered?: number;
  associations_formed?: number;
  weak_associations_pruned?: number;
  coherence_score?: number;
  novelty_score?: number;
  dream_duration_ms?: number;
  memory_peak_mb?: number;
  dream_started_at: string;
  dream_completed_at?: string;
}

// L9: Hierarchical Memory (Working/Episodic/Semantic)
export interface HierarchicalMemoryRecord {
  operation_type: 'store_working' | 'consolidate_episodic' | 'extract_semantic';
  memory_layer: 'working' | 'episodic' | 'semantic';
  working_items_count?: number;
  working_capacity_used?: number;
  episodes_created?: number;
  episodes_recalled?: number;
  episode_compression_ratio?: number;
  facts_extracted?: number;
  facts_stored?: number;
  facts_updated?: number;
  consolidation_efficiency?: number;
  information_preserved?: number;
  operation_latency_ms?: number;
  executed_at: string;
}

// L10: Curiosity Engine (Active Learning)
export interface CuriosityEngineRecord {
  operation_type: 'detect_gap' | 'generate_hypothesis' | 'design_experiment' | 'evaluate_result';
  gaps_detected?: number;
  gap_severity?: Record<string, number>;
  hypotheses_generated?: number;
  hypotheses_tested?: number;
  hypotheses_confirmed?: number;
  hypotheses_rejected?: number;
  experiments_designed?: number;
  experiments_executed?: number;
  new_knowledge_acquired?: boolean;
  knowledge_gap_filled?: boolean;
  operation_latency_ms?: number;
  executed_at: string;
}

// L11: Self-Modifying Cognition (Metacognition)
export interface SelfModifyingCognitionRecord {
  operation_type: 'assess_performance' | 'identify_blind_spot' | 'adjust_strategy' | 'update_belief';
  performance_assessment?: Record<string, unknown>;
  blind_spots_identified?: number;
  calibration_drift?: number;
  strategies_adjusted?: number;
  strategy_change_type?: 'parameter_tune' | 'algorithm_swap' | 'resource_reallocation';
  beliefs_updated?: number;
  belief_revision_magnitude?: number;
  learning_velocity?: number;
  self_awareness_score?: number;
  operation_latency_ms?: number;
  executed_at: string;
}

// L12: Intelligence Mesh (Collective Intelligence)
export interface IntelligenceMeshRecord {
  operation_type: 'contribute' | 'consume' | 'validate' | 'conflict_resolve';
  patterns_contributed?: number;
  knowledge_shared?: boolean;
  trust_score?: number;
  patterns_adopted?: number;
  knowledge_received?: boolean;
  validation_status?: 'validated' | 'rejected' | 'pending';
  collective_pattern_id?: string;
  collective_confidence?: number;
  participating_orgs_count?: number;
  conflicts_detected?: number;
  conflicts_resolved?: number;
  operation_latency_ms?: number;
  executed_at: string;
}

// L13: Causal Imagination (Creativity)
export interface CausalImaginationRecord {
  operation_type: 'generate_scenario' | 'synthesize_hypothesis' | 'simulate_intervention';
  scenarios_generated?: number;
  scenario_novelty_score?: number;
  scenario_plausibility_score?: number;
  hypotheses_synthesized?: number;
  synthesis_method?: 'analogy' | 'combination' | 'extrapolation';
  interventions_simulated?: number;
  simulation_horizon_days?: number;
  simulation_confidence?: number;
  creativity_score?: number;
  analogies_drawn?: number;
  operation_latency_ms?: number;
  executed_at: string;
}

// L14: Theory of Mind (Empathy)
export interface TheoryOfMindRecord {
  operation_type: 'model_user' | 'predict_intent' | 'adapt_response' | 'perspective_take';
  user_id?: string;
  user_model_updated?: boolean;
  cognitive_state_inferred?: Record<string, unknown>;
  intent_predicted?: string;
  intent_confidence?: number;
  intent_actual?: string;
  intent_prediction_correct?: boolean;
  response_adapted?: boolean;
  adaptation_type?: 'tone' | 'detail_level' | 'explanation_style';
  perspectives_considered?: number;
  empathy_score?: number;
  operation_latency_ms?: number;
  executed_at: string;
}

// L15: Temporal Consciousness (Time Sense)
export interface TemporalConsciousnessRecord {
  operation_type: 'detect_rhythm' | 'set_goal' | 'track_progress' | 'adjust_timeline';
  rhythms_detected?: number;
  rhythm_type?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  rhythm_strength?: number;
  goals_set?: number;
  goals_on_track?: number;
  goals_behind_schedule?: number;
  goals_completed?: number;
  timeline_adjusted?: boolean;
  timeline_adjustment_reason?: string;
  time_perception_accuracy?: number;
  temporal_horizon_days?: number;
  operation_latency_ms?: number;
  executed_at: string;
}

// META: Layer Health
export interface LayerHealthSnapshot {
  layer_number: number;
  layer_name: string;
  health_score: number;
  is_healthy: boolean;
  metrics: Record<string, unknown>;
  gaps_detected: unknown[];
  gaps_count: number;
  health_trend?: 'improving' | 'stable' | 'degrading';
  health_delta?: number;
  snapshot_at: string;
}

export interface BrainObservability {
  // L1-L7: Core Brain Layer Recorders
  recordSignalIngestion: (record: SignalIngestionRecord) => Promise<void>;
  recordEntityResolution: (record: EntityResolutionRecord) => Promise<void>;
  recordSemanticOperation: (record: SemanticOperationRecord) => Promise<void>;
  recordCausalCalculation: (record: CausalCalculationRecord) => Promise<void>;
  recordPatternLearning: (record: PatternLearningRecord) => Promise<void>;
  recordAgentExecution: (record: AgentExecutionRecord) => Promise<void>;
  recordConnectorOperation: (record: ConnectorOperationRecord) => Promise<void>;

  // L8-L15: Cognitive Layer Recorders
  recordDeepDreaming: (record: DeepDreamingRecord) => Promise<void>;
  recordHierarchicalMemory: (record: HierarchicalMemoryRecord) => Promise<void>;
  recordCuriosityEngine: (record: CuriosityEngineRecord) => Promise<void>;
  recordSelfModifyingCognition: (record: SelfModifyingCognitionRecord) => Promise<void>;
  recordIntelligenceMesh: (record: IntelligenceMeshRecord) => Promise<void>;
  recordCausalImagination: (record: CausalImaginationRecord) => Promise<void>;
  recordTheoryOfMind: (record: TheoryOfMindRecord) => Promise<void>;
  recordTemporalConsciousness: (record: TemporalConsciousnessRecord) => Promise<void>;

  // Meta recorders
  recordFeedbackLoop: (record: FeedbackLoopRecord) => Promise<void>;
  recordConsolidationCycle: (record: ConsolidationCycleRecord) => Promise<void>;

  // Health snapshots
  snapshotLayerHealth: () => Promise<void>;
  getLayerHealth: (layerNumber: number) => Promise<LayerHealthSnapshot | null>;
  getAllLayersHealth: () => Promise<LayerHealthSnapshot[]>;

  // Forensic queries
  getSignalHistory: (entityType: string, entityId: string, hours?: number) => Promise<SignalIngestionRecord[]>;
  getCausalCalculationHistory: (sourceDomain: string, targetDomain: string, hours?: number) => Promise<CausalCalculationRecord[]>;
  getAgentExecutionHistory: (agentType: string, hours?: number) => Promise<AgentExecutionRecord[]>;

  // Performance analysis
  getSlowestOperations: (layer: number, limit?: number) => Promise<unknown[]>;
  getCostAnalysis: (hours?: number) => Promise<{
    total_cost: number;
    semantic_cost: number;
    agent_cost: number;
    by_operation: Record<string, number>;
  }>;

  // Batch management
  flush: () => Promise<void>;
  getStats: () => {
    pending_writes: number;
    total_writes: number;
    last_flush: string | null;
    failed_writes: number;
    circuit_breaker: {
      state: string;
      failures: number;
      total_trips: number;
    };
    retry: {
      total_attempts: number;
      total_retries: number;
      total_failures: number;
    };
  };
  getFailedWrites: () => Array<{
    table: string;
    records: any[];
    error: string;
    timestamp: string;
  }>;
  retryFailedWrites: () => Promise<{ succeeded: number; failed: number }>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createBrainObservability(
  config: BrainObservabilityConfig
): BrainObservability {
  const {
    supabase,
    organizationId,
    batchMode = true,
    batchIntervalMs = 5000,
    maxBatchSize = 100,
    verbose = false,
  } = config;

  const logger = config.logger || getDefaultLogger();

  // Retry and circuit breaker for resilient writes
  const retry = createRetry({
    maxRetries: 3,
    baseDelayMs: 1000,
    backoffMultiplier: 2,
    retryOn: (error: Error) => {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('timeout') ||
        msg.includes('connection') ||
        msg.includes('network') ||
        msg.includes('temporary')
      );
    },
  });

  const circuitBreaker = createCircuitBreaker({
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    label: 'observability-writes',
  });

  // Failed writes dead letter queue
  const failedWrites: Array<{
    table: string;
    records: any[];
    error: string;
    timestamp: string;
  }> = [];

  // Batch queues
  const batches = {
    signal_ingestion: [] as SignalIngestionRecord[],
    entity_resolution: [] as EntityResolutionRecord[],
    semantic_operations: [] as SemanticOperationRecord[],
    causal_calculations: [] as CausalCalculationRecord[],
    pattern_learning: [] as PatternLearningRecord[],
    agent_executions: [] as AgentExecutionRecord[],
    connector_operations: [] as ConnectorOperationRecord[],
    feedback_loops: [] as FeedbackLoopRecord[],
    consolidation_cycles: [] as ConsolidationCycleRecord[],
    // Cognitive layers
    deep_dreaming: [] as DeepDreamingRecord[],
    hierarchical_memory: [] as HierarchicalMemoryRecord[],
    curiosity_engine: [] as CuriosityEngineRecord[],
    self_modifying_cognition: [] as SelfModifyingCognitionRecord[],
    intelligence_mesh: [] as IntelligenceMeshRecord[],
    causal_imagination: [] as CausalImaginationRecord[],
    theory_of_mind: [] as TheoryOfMindRecord[],
    temporal_consciousness: [] as TemporalConsciousnessRecord[],
  };

  let totalWrites = 0;
  let lastFlush: Date | null = null;

  // Auto-flush timer
  let flushTimer: NodeJS.Timeout | null = null;
  if (batchMode) {
    flushTimer = setInterval(() => {
      void flush();
    }, batchIntervalMs);
  }

  // ──────────────────────────────────────────────────────────
  // BATCH MANAGEMENT
  // ──────────────────────────────────────────────────────────

  async function flush(): Promise<void> {
    const start = Date.now();
    let writeCount = 0;

    for (const [table, records] of Object.entries(batches)) {
      if (records.length === 0) continue;

      const tableName = `obs_${table}`;
      const toWrite = records.splice(0, maxBatchSize);

      try {
        // Use circuit breaker + retry for resilient writes
        await circuitBreaker.execute(async () => {
          await retry.execute(async () => {
            const { error } = await supabase
              .from(tableName)
              .insert(toWrite.map(r => ({ ...r, organization_id: organizationId })));

            if (error) {
              throw new Error(`${tableName}: ${error.message}`);
            }

            writeCount += toWrite.length;
            totalWrites += toWrite.length;
          }, `flush:${tableName}`);
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Handle circuit open gracefully
        if (err instanceof CircuitOpenError) {
          logger.warn('obs:flush:circuit-open', {
            table: tableName,
            records: toWrite.length,
            circuitState: circuitBreaker.getState(),
          });

          // Add to dead letter queue
          failedWrites.push({
            table: tableName,
            records: toWrite,
            error: 'Circuit breaker open',
            timestamp: new Date().toISOString(),
          });
        } else {
          // Log failure and add to dead letter queue
          logger.error('obs:flush:failed', {
            table: tableName,
            records: toWrite.length,
            error: error.message,
            retryStats: retry.getStats(),
          });

          failedWrites.push({
            table: tableName,
            records: toWrite,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    lastFlush = new Date();

    if (verbose && writeCount > 0) {
      logger.info('obs:flush', {
        writes: writeCount,
        failed: failedWrites.length,
        duration_ms: Date.now() - start,
        pending: Object.values(batches).reduce((sum, arr) => sum + arr.length, 0),
        circuitState: circuitBreaker.getState(),
      });
    }
  }

  function enqueue<T>(queue: T[], record: T): void {
    queue.push(record);

    // Auto-flush if batch is full (even in batch mode)
    if (queue.length >= maxBatchSize) {
      void flush();
    }
  }

  // ──────────────────────────────────────────────────────────
  // LAYER RECORDERS
  // ──────────────────────────────────────────────────────────

  async function recordSignalIngestion(record: SignalIngestionRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.signal_ingestion, record);
    } else {
      const { error } = await supabase
        .from('obs_signal_ingestion')
        .insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:signal_ingestion:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordEntityResolution(record: EntityResolutionRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.entity_resolution, record);
    } else {
      const { error } = await supabase
        .from('obs_entity_resolution')
        .insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:entity_resolution:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordSemanticOperation(record: SemanticOperationRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.semantic_operations, record);
    } else {
      const { error } = await supabase
        .from('obs_semantic_operations')
        .insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:semantic_operations:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordCausalCalculation(record: CausalCalculationRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.causal_calculations, record);
    } else {
      const { error } = await supabase
        .from('obs_causal_calculations')
        .insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:causal_calculations:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordPatternLearning(record: PatternLearningRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.pattern_learning, record);
    } else {
      const { error } = await supabase
        .from('obs_pattern_learning')
        .insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:pattern_learning:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordAgentExecution(record: AgentExecutionRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.agent_executions, record);
    } else {
      const { error } = await supabase
        .from('obs_agent_executions')
        .insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:agent_executions:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordConnectorOperation(record: ConnectorOperationRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.connector_operations, record);
    } else {
      const { error } = await supabase
        .from('obs_connector_operations')
        .insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:connector_operations:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordFeedbackLoop(record: FeedbackLoopRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.feedback_loops, record);
    } else {
      const { error } = await supabase
        .from('obs_feedback_loops')
        .insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:feedback_loops:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordConsolidationCycle(record: ConsolidationCycleRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.consolidation_cycles, record);
    } else {
      const { error } = await supabase
        .from('obs_consolidation_cycles')
        .insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:consolidation_cycles:error', { error: error.message });
      else totalWrites++;
    }
  }

  // ──────────────────────────────────────────────────────────
  // HEALTH SNAPSHOTS
  // ──────────────────────────────────────────────────────────

  async function snapshotLayerHealth(): Promise<void> {
    const { error } = await supabase.rpc('snapshot_layer_health', {
      p_organization_id: organizationId,
    });

    if (error) {
      logger.error('obs:snapshot_layer_health:error', { error: error.message });
    }
  }

  async function getLayerHealth(layerNumber: number): Promise<LayerHealthSnapshot | null> {
    const { data, error } = await supabase
      .from('obs_layer_health')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('layer_number', layerNumber)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      logger.error('obs:get_layer_health:error', { error: error.message });
      return null;
    }

    return data as LayerHealthSnapshot;
  }

  async function getAllLayersHealth(): Promise<LayerHealthSnapshot[]> {
    // Get latest snapshot for each layer
    const { data, error } = await supabase
      .from('obs_layer_health')
      .select('*')
      .eq('organization_id', organizationId)
      .order('snapshot_at', { ascending: false });

    if (error) {
      logger.error('obs:get_all_layers_health:error', { error: error.message });
      return [];
    }

    // Deduplicate to get latest per layer
    const latest = new Map<number, LayerHealthSnapshot>();
    for (const snapshot of (data || []) as LayerHealthSnapshot[]) {
      if (!latest.has(snapshot.layer_number)) {
        latest.set(snapshot.layer_number, snapshot);
      }
    }

    return Array.from(latest.values()).sort((a, b) => a.layer_number - b.layer_number);
  }

  // ──────────────────────────────────────────────────────────
  // FORENSIC QUERIES
  // ──────────────────────────────────────────────────────────

  async function getSignalHistory(
    entityType: string,
    entityId: string,
    hours = 24
  ): Promise<SignalIngestionRecord[]> {
    const { data, error } = await supabase
      .from('obs_signal_ingestion')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('obs:get_signal_history:error', { error: error.message });
      return [];
    }

    return (data || []) as SignalIngestionRecord[];
  }

  async function getCausalCalculationHistory(
    sourceDomain: string,
    targetDomain: string,
    hours = 168 // 7 days
  ): Promise<CausalCalculationRecord[]> {
    const { data, error } = await supabase
      .from('obs_causal_calculations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('source_domain', sourceDomain)
      .eq('target_domain', targetDomain)
      .gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('obs:get_causal_calculation_history:error', { error: error.message });
      return [];
    }

    return (data || []) as CausalCalculationRecord[];
  }

  async function getAgentExecutionHistory(
    agentType: string,
    hours = 24
  ): Promise<AgentExecutionRecord[]> {
    const { data, error } = await supabase
      .from('obs_agent_executions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('agent_type', agentType)
      .gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('obs:get_agent_execution_history:error', { error: error.message });
      return [];
    }

    return (data || []) as AgentExecutionRecord[];
  }

  // ──────────────────────────────────────────────────────────
  // PERFORMANCE ANALYSIS
  // ──────────────────────────────────────────────────────────

  async function getSlowestOperations(layer: number, limit = 10): Promise<unknown[]> {
    const tables = {
      1: 'obs_signal_ingestion',
      2: 'obs_entity_resolution',
      3: 'obs_semantic_operations',
      4: 'obs_causal_calculations',
      5: 'obs_pattern_learning',
      6: 'obs_agent_executions',
      7: 'obs_connector_operations',
    };

    const table = tables[layer as keyof typeof tables];
    if (!table) return [];

    const latencyColumn = table.includes('semantic')
      ? 'operation_latency_ms'
      : table.includes('causal')
      ? 'calculation_latency_ms'
      : table.includes('agent')
      ? 'execution_latency_ms'
      : 'operation_latency_ms';

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('organization_id', organizationId)
      .order(latencyColumn, { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('obs:get_slowest_operations:error', { error: error.message });
      return [];
    }

    return data || [];
  }

  async function getCostAnalysis(hours = 24): Promise<{
    total_cost: number;
    semantic_cost: number;
    agent_cost: number;
    by_operation: Record<string, number>;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Semantic operations cost
    const { data: semanticData } = await supabase
      .from('obs_semantic_operations')
      .select('cost_usd, operation_type')
      .eq('organization_id', organizationId)
      .gte('created_at', since)
      .not('cost_usd', 'is', null);

    // Agent executions cost
    const { data: agentData } = await supabase
      .from('obs_agent_executions')
      .select('cost_usd, agent_type')
      .eq('organization_id', organizationId)
      .gte('created_at', since)
      .not('cost_usd', 'is', null);

    const semanticCost = (semanticData || []).reduce((sum, r: any) => sum + (r.cost_usd || 0), 0);
    const agentCost = (agentData || []).reduce((sum, r: any) => sum + (r.cost_usd || 0), 0);

    const byOperation: Record<string, number> = {};
    for (const r of semanticData || []) {
      const key = `semantic:${r.operation_type}`;
      byOperation[key] = (byOperation[key] || 0) + (r.cost_usd || 0);
    }
    for (const r of agentData || []) {
      const key = `agent:${r.agent_type}`;
      byOperation[key] = (byOperation[key] || 0) + (r.cost_usd || 0);
    }

    return {
      total_cost: semanticCost + agentCost,
      semantic_cost: semanticCost,
      agent_cost: agentCost,
      by_operation: byOperation,
    };
  }

  // ──────────────────────────────────────────────────────────
  // STATS
  // ──────────────────────────────────────────────────────────

  function getStats() {
    const pendingWrites = Object.values(batches).reduce((sum, arr) => sum + arr.length, 0);
    const circuitStats = circuitBreaker.getStats();
    const retryStats = retry.getStats();

    return {
      pending_writes: pendingWrites,
      total_writes: totalWrites,
      last_flush: lastFlush ? lastFlush.toISOString() : null,
      failed_writes: failedWrites.length,
      circuit_breaker: {
        state: circuitStats.state,
        failures: circuitStats.failureCount,
        total_trips: circuitStats.totalTrips,
      },
      retry: {
        total_attempts: retryStats.totalAttempts,
        total_retries: retryStats.totalRetries,
        total_failures: retryStats.totalFailures,
      },
    };
  }

  function getFailedWrites() {
    return [...failedWrites];
  }

  async function retryFailedWrites(): Promise<{ succeeded: number; failed: number }> {
    if (failedWrites.length === 0) {
      return { succeeded: 0, failed: 0 };
    }

    logger.info('obs:retry-failed-writes', { count: failedWrites.length });

    let succeeded = 0;
    let failed = 0;

    // Retry each failed batch
    const toRetry = failedWrites.splice(0); // Clear the queue

    for (const item of toRetry) {
      try {
        const { error } = await supabase
          .from(item.table)
          .insert(item.records.map(r => ({ ...r, organization_id: organizationId })));

        if (error) {
          failed++;
          failedWrites.push(item); // Re-add to queue
          logger.error('obs:retry-failed-writes:still-failing', {
            table: item.table,
            error: error.message,
          });
        } else {
          succeeded++;
          totalWrites += item.records.length;
          logger.info('obs:retry-failed-writes:recovered', {
            table: item.table,
            records: item.records.length,
          });
        }
      } catch (err) {
        failed++;
        failedWrites.push(item);
        logger.error('obs:retry-failed-writes:exception', {
          table: item.table,
          error: String(err),
        });
      }
    }

    return { succeeded, failed };
  }

  // ──────────────────────────────────────────────────────────
  // COGNITIVE LAYER RECORDERS (L8-L15)
  // ──────────────────────────────────────────────────────────

  async function recordDeepDreaming(record: DeepDreamingRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.deep_dreaming, record);
    } else {
      const { error } = await supabase.from('obs_deep_dreaming').insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:deep_dreaming:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordHierarchicalMemory(record: HierarchicalMemoryRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.hierarchical_memory, record);
    } else {
      const { error } = await supabase.from('obs_hierarchical_memory').insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:hierarchical_memory:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordCuriosityEngine(record: CuriosityEngineRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.curiosity_engine, record);
    } else {
      const { error } = await supabase.from('obs_curiosity_engine').insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:curiosity_engine:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordSelfModifyingCognition(record: SelfModifyingCognitionRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.self_modifying_cognition, record);
    } else {
      const { error } = await supabase.from('obs_self_modifying_cognition').insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:self_modifying_cognition:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordIntelligenceMesh(record: IntelligenceMeshRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.intelligence_mesh, record);
    } else {
      const { error } = await supabase.from('obs_intelligence_mesh').insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:intelligence_mesh:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordCausalImagination(record: CausalImaginationRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.causal_imagination, record);
    } else {
      const { error} = await supabase.from('obs_causal_imagination').insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:causal_imagination:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordTheoryOfMind(record: TheoryOfMindRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.theory_of_mind, record);
    } else {
      const { error } = await supabase.from('obs_theory_of_mind').insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:theory_of_mind:error', { error: error.message });
      else totalWrites++;
    }
  }

  async function recordTemporalConsciousness(record: TemporalConsciousnessRecord): Promise<void> {
    if (batchMode) {
      enqueue(batches.temporal_consciousness, record);
    } else {
      const { error } = await supabase.from('obs_temporal_consciousness').insert({ ...record, organization_id: organizationId });
      if (error) logger.error('obs:temporal_consciousness:error', { error: error.message });
      else totalWrites++;
    }
  }

  // ──────────────────────────────────────────────────────────
  // CLEANUP
  // ──────────────────────────────────────────────────────────

  // Auto-flush on process exit
  if (typeof process !== 'undefined') {
    const cleanup = () => {
      if (flushTimer) clearInterval(flushTimer);
      void flush();
    };
    process.on('beforeExit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  return {
    // L1-L7: Core Brain Layers
    recordSignalIngestion,
    recordEntityResolution,
    recordSemanticOperation,
    recordCausalCalculation,
    recordPatternLearning,
    recordAgentExecution,
    recordConnectorOperation,
    // L8-L15: Cognitive Layers
    recordDeepDreaming,
    recordHierarchicalMemory,
    recordCuriosityEngine,
    recordSelfModifyingCognition,
    recordIntelligenceMesh,
    recordCausalImagination,
    recordTheoryOfMind,
    recordTemporalConsciousness,
    // META
    recordFeedbackLoop,
    recordConsolidationCycle,
    snapshotLayerHealth,
    getLayerHealth,
    getAllLayersHealth,
    getSignalHistory,
    getCausalCalculationHistory,
    getAgentExecutionHistory,
    getSlowestOperations,
    getCostAnalysis,
    flush,
    getStats,
    getFailedWrites,
    retryFailedWrites,
  };
}
