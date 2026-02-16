/**
 * Brain Observability Bridge — THE MISSING WIRE
 * ==============================================
 *
 * This module CONNECTS three previously disconnected systems:
 *
 *   1. OBSERVABILITY (17 obs_* tables, 18 record types)
 *      → Already built, fully typed, but SILENT (no data flowing)
 *
 *   2. BRAIN EVOLUTION ENGINE (Intelligence Score, Bayesian updates)
 *      → Already built, but doesn't emit observability records
 *
 *   3. FEDERATION (CORE brain, percolation, mesh)
 *      → Already built, but not tracked in observability or evolution
 *
 * Without this bridge, the Brain operates in the dark:
 *   - 15 cognitive layers run but produce no audit trail
 *   - Evolution engine learns but doesn't record what it learned
 *   - Federation shares knowledge but nobody tracks what was shared
 *
 * WITH this bridge:
 *   - Every cognitive layer execution → obs_* record
 *   - Every evolution cycle → obs_feedback_loops + obs_consolidation_cycles
 *   - Every federation operation → obs_connector_operations + signals
 *   - Full forensic audit trail: who learned what, when, with what accuracy
 *
 * ARCHITECTURE:
 *   BrainObservabilityBridge (this file)
 *     ├── recordCognitiveLayerExecution(layer, result, timing)
 *     ├── recordEvolutionCycle(state, mode)
 *     ├── recordFederationOperation(type, result)
 *     ├── recordDomainExecution(domain, result, brainContext)
 *     ├── emitLayerSignals(layer, outputs)
 *     └── snapshotFullBrainHealth()
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrainObservability, type BrainObservability } from '../observability/brain-observability';
import { getDefaultLogger, type NexusLogger } from '../observability/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface BrainObservabilityBridgeConfig {
  supabase: SupabaseClient;
  organizationId: string;
  logger?: NexusLogger;
}

/** Cognitive layer execution result (from cognitive-stack.ts) */
export interface CognitiveLayerOutput {
  layerNumber: number;
  layerName: string;
  durationMs: number;
  /** Did this layer produce meaningful output? */
  didProduce: boolean;
  /** Key outputs for observability */
  outputs?: {
    predictionsGenerated?: number;
    insightsSurfaced?: number;
    hypothesesCreated?: number;
    edgesDiscovered?: number;
    memoriesEncoded?: number;
    conflictsDetected?: number;
    experimentsProposed?: number;
    robustnessScore?: number;
    qualityScore?: number;
    empathyScore?: number;
    creativityScore?: number;
    coherenceScore?: number;
    narrativeGenerated?: boolean;
  };
  /** Layer-specific metadata */
  metadata?: Record<string, unknown>;
}

/** Evolution cycle result for observability */
export interface EvolutionObservabilityData {
  mode: 'lightweight' | 'full';
  intelligenceScore: number;
  accuracy: number;
  brierScore: number;
  predictionsVerified: number;
  predictionsCorrect: number;
  weightUpdates: number;
  totalEdges: number;
  totalEvidence: number;
  durationMs: number;
}

/** Federation operation result for observability */
export interface FederationObservabilityData {
  operationType: 'upstream_promotion' | 'downstream_query' | 'percolation' | 'approval' | 'mesh_sync';
  itemsProcessed: number;
  itemsPromoted?: number;
  itemsRejected?: number;
  itemsSanitized?: number;
  piiRedacted?: number;
  durationMs: number;
  coreEdgesAbsorbed?: number;
  corePatternsAbsorbed?: number;
  meshConsensusStrength?: number;
}

/** Full brain health snapshot */
export interface BrainHealthReport {
  organizationId: string;
  timestamp: string;
  /** 0-100 overall health */
  overallHealth: number;
  /** Per-layer health */
  layers: Array<{
    layerNumber: number;
    name: string;
    isActive: boolean;
    lastExecutionMs?: number;
    healthScore: number;
  }>;
  /** Evolution state */
  evolution: {
    intelligenceScore: number;
    accuracy: number;
    brierScore: number;
    isLearning: boolean;
  };
  /** Federation state */
  federation: {
    isContributing: boolean;
    itemsPromoted: number;
    coreEdgesAvailable: number;
    meshActive: boolean;
  };
  /** Signal health */
  signals: {
    totalSignals7d: number;
    signalQualityAvg: number;
    domainsActive: number;
  };
}

// ============================================================================
// LAYER NAME MAPPING
// ============================================================================

const LAYER_NAMES: Record<number, string> = {
  1: 'Episodic Memory',
  2: 'LLM Reasoner',
  3: 'Deep Dreaming',
  4: 'Hierarchical Memory',
  5: 'Curiosity Engine',
  6: 'Self-Modifying Cognition',
  7: 'Intelligence Mesh',
  8: 'Causal Imagination',
  9: 'Theory of Mind',
  10: 'Temporal Consciousness',
  11: 'Red Team',
  12: 'Experimentation',
  13: 'Immune System',
  14: 'Goal-Backward Planning',
  15: 'Narrative Intelligence',
};

// Layer → observability table mapping
const LAYER_OBS_TABLE: Record<number, string> = {
  1: 'obs_signal_ingestion',
  2: 'obs_entity_resolution',
  3: 'obs_deep_dreaming',
  4: 'obs_hierarchical_memory',
  5: 'obs_curiosity_engine',
  6: 'obs_self_modifying_cognition',
  7: 'obs_intelligence_mesh',
  8: 'obs_causal_imagination',
  9: 'obs_theory_of_mind',
  10: 'obs_temporal_consciousness',
  11: 'obs_causal_calculations', // Red team tests causal predictions
  12: 'obs_pattern_learning',     // Experimentation discovers patterns
  13: 'obs_signal_ingestion',     // Immune system filters signals
  14: 'obs_agent_executions',     // Goal planning executes agent logic
  15: 'obs_semantic_operations',  // Narrative uses LLM/semantic ops
};

// ============================================================================
// BRIDGE IMPLEMENTATION
// ============================================================================

/**
 * Create the Brain Observability Bridge.
 *
 * This is the SINGLE entry point that wires:
 *   Cognitive Layers → Observability Tables
 *   Evolution Engine → Observability + Signals
 *   Federation → Observability + Signals
 *   All → cross_domain_signals (Brain learns from everything)
 *   All → brain_health_history (dashboard visualization)
 */
export function createBrainObservabilityBridge(config: BrainObservabilityBridgeConfig) {
  const { supabase, organizationId } = config;
  const logger = config.logger ?? getDefaultLogger();

  // Create the underlying observability instance
  const obs: BrainObservability = createBrainObservability({
    supabase,
    organizationId,
    batchMode: true,
    batchIntervalMs: 3000,
    maxBatchSize: 50,
  });

  // Collision-safe ID generator — Date.now() can collide at high throughput (10M signals/day)
  // Uses timestamp + 6-char random suffix for ~2 billion combinations per millisecond
  let _idCounter = 0;
  function obsId(prefix: string): string {
    return `${prefix}_${Date.now()}_${(++_idCounter).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ============================================================================
  // 1. COGNITIVE LAYER RECORDING
  // ============================================================================

  /**
   * Record a cognitive layer execution to observability.
   *
   * Called by brain-pipeline.ts after each layer in the cognitive stack runs.
   * Writes to the appropriate obs_* table AND emits a cross_domain_signal
   * so the Brain Evolution Engine can track layer activity.
   */
  async function recordCognitiveLayerExecution(layer: CognitiveLayerOutput): Promise<void> {
    try {
      const table = LAYER_OBS_TABLE[layer.layerNumber];
      if (!table) return;

      // Write layer-specific observability record
      switch (layer.layerNumber) {
        case 1: // Episodic Memory (Signal Ingestion)
          await obs.recordSignalIngestion({
            source_domain: 'cognitive_stack',
            signal_type: 'episodic_memory',
            entity_type: 'cognitive_cycle',
            entity_id: obsId('L1_cycle'),
            quality_score: layer.outputs?.qualityScore ?? 0,
            is_quarantined: false,
            ingestion_latency_ms: layer.durationMs,
            ingested_at: new Date().toISOString(),
          });
          break;

        case 2: // LLM Reasoner (Entity Resolution / Causal Discovery)
          await obs.recordEntityResolution({
            input_entity_type: 'causal_discovery',
            input_entity_id: obsId('L2_cycle'),
            canonical_name: 'causal_ensemble',
            confidence: layer.outputs?.robustnessScore ?? 0,
            resolution_latency_ms: layer.durationMs,
            resolved_at: new Date().toISOString(),
          });
          break;

        case 3: // Deep Dreaming
          await obs.recordDeepDreaming({
            cycle_id: obsId('dream'),
            cycle_type: 'association',
            signals_replayed: layer.outputs?.insightsSurfaced ?? 0,
            patterns_discovered: layer.outputs?.hypothesesCreated ?? 0,
            coherence_score: layer.outputs?.coherenceScore ?? 0,
            dream_duration_ms: layer.durationMs,
            dream_started_at: new Date().toISOString(),
          });
          break;

        case 4: // Hierarchical Memory
          await obs.recordHierarchicalMemory({
            memory_layer: 'episodic',
            operation_type: 'store_working',
            episodes_created: layer.outputs?.memoriesEncoded ?? 0,
            facts_stored: layer.outputs?.edgesDiscovered ?? 0,
            consolidation_efficiency: layer.didProduce ? 1 : 0,
            operation_latency_ms: layer.durationMs,
            executed_at: new Date().toISOString(),
          });
          break;

        case 5: // Curiosity Engine
          await obs.recordCuriosityEngine({
            operation_type: 'detect_gap',
            gaps_detected: layer.outputs?.hypothesesCreated ?? 0,
            hypotheses_tested: layer.outputs?.predictionsGenerated ?? 0,
            new_knowledge_acquired: (layer.outputs?.edgesDiscovered ?? 0) > 0,
            operation_latency_ms: layer.durationMs,
            executed_at: new Date().toISOString(),
          });
          break;

        case 6: // Self-Modifying Cognition
          await obs.recordSelfModifyingCognition({
            operation_type: 'assess_performance',
            blind_spots_identified: layer.outputs?.conflictsDetected ?? 0,
            strategies_adjusted: layer.outputs?.predictionsGenerated ?? 0,
            self_awareness_score: layer.outputs?.robustnessScore ?? 0,
            operation_latency_ms: layer.durationMs,
            executed_at: new Date().toISOString(),
          });
          break;

        case 7: // Intelligence Mesh
          await obs.recordIntelligenceMesh({
            operation_type: 'contribute',
            patterns_contributed: layer.outputs?.insightsSurfaced ?? 0,
            trust_score: layer.outputs?.qualityScore ?? 0.5,
            conflicts_resolved: layer.outputs?.conflictsDetected ?? 0,
            operation_latency_ms: layer.durationMs,
            executed_at: new Date().toISOString(),
          });
          break;

        case 8: // Causal Imagination
          await obs.recordCausalImagination({
            operation_type: 'generate_scenario',
            scenarios_generated: layer.outputs?.hypothesesCreated ?? 0,
            hypotheses_synthesized: layer.outputs?.predictionsGenerated ?? 0,
            creativity_score: layer.outputs?.creativityScore ?? 0,
            operation_latency_ms: layer.durationMs,
            executed_at: new Date().toISOString(),
          });
          break;

        case 9: // Theory of Mind
          await obs.recordTheoryOfMind({
            operation_type: 'model_user',
            user_id: 'cognitive_cycle',
            intent_predicted: layer.didProduce ? 'inferred' : 'none',
            response_adapted: layer.didProduce,
            empathy_score: layer.outputs?.empathyScore ?? 0,
            operation_latency_ms: layer.durationMs,
            executed_at: new Date().toISOString(),
          });
          break;

        case 10: // Temporal Consciousness
          await obs.recordTemporalConsciousness({
            operation_type: 'detect_rhythm',
            rhythms_detected: layer.outputs?.insightsSurfaced ?? 0,
            goals_set: layer.outputs?.predictionsGenerated ?? 0,
            time_perception_accuracy: layer.outputs?.robustnessScore ?? 0,
            operation_latency_ms: layer.durationMs,
            executed_at: new Date().toISOString(),
          });
          break;

        case 11: // Red Team
          await obs.recordCausalCalculation({
            calculation_type: 'discovery',
            source_domain: 'red_team',
            target_domain: 'predictions',
            granger_p_value: 0,
            is_significant: (layer.outputs?.robustnessScore ?? 0) > 0.5,
            calculation_latency_ms: layer.durationMs,
            calculated_at: new Date().toISOString(),
          });
          break;

        case 12: // Experimentation
          await obs.recordPatternLearning({
            operation_type: 'discover',
            pattern_type: 'association',
            support: layer.outputs?.experimentsProposed ?? 0,
            confidence: layer.outputs?.robustnessScore ?? 0,
            lift: 0,
            significance_p_value: 0,
            operation_latency_ms: layer.durationMs,
            executed_at: new Date().toISOString(),
          });
          break;

        case 13: // Immune System
          await obs.recordSignalIngestion({
            source_domain: 'immune_system',
            signal_type: 'quality_check',
            entity_type: 'cognitive_cycle',
            entity_id: obsId('cycle'),
            quality_score: layer.outputs?.qualityScore ?? 0,
            is_quarantined: false,
            ingestion_latency_ms: layer.durationMs,
            ingested_at: new Date().toISOString(),
          });
          break;

        case 14: // Goal-Backward Planning
          await obs.recordAgentExecution({
            agent_type: 'goal_backward_planner',
            agent_run_id: obsId('goal_planner'),
            trigger_type: 'event',
            causal_edges_used: layer.outputs?.edgesDiscovered ?? 0,
            status: layer.didProduce ? 'success' : 'partial',
            execution_latency_ms: layer.durationMs,
            started_at: new Date().toISOString(),
          });
          break;

        case 15: // Narrative Intelligence
          await obs.recordSemanticOperation({
            operation_type: 'embed',
            entity_type: 'narrative',
            entity_id: obsId('narrative'),
            operation_latency_ms: layer.durationMs,
            executed_at: new Date().toISOString(),
          });
          break;
      }

      // Emit cross_domain_signal for EVERY layer execution
      // → Brain Evolution Engine tracks layer activity
      await supabase.from('cross_domain_signals').insert({
        organization_id: organizationId,
        source_domain: `brain.layer.${layer.layerNumber}`,
        signal_type: 'cognitive_layer_execution',
        signal_value: layer.didProduce ? 1 : 0,
        entity_type: 'cognitive_layer',
        entity_id: `L${layer.layerNumber}_${LAYER_NAMES[layer.layerNumber]?.replace(/\s+/g, '_') ?? 'unknown'}`,
        signal_metadata: {
          layerNumber: layer.layerNumber,
          layerName: layer.layerName,
          durationMs: layer.durationMs,
          didProduce: layer.didProduce,
          ...layer.outputs,
        },
      });

    } catch (err) {
      logger.warn('obs:bridge:cognitive-layer-failed', { layer: layer.layerNumber, error: String(err) });
    }
  }

  // ============================================================================
  // 1b. L1 SIGNAL INGESTION RECORDING (Bulk / Real-time)
  // ============================================================================

  /**
   * Record L1 signal ingestion operations.
   *
   * Called from:
   *   - consolidation-engine.ts → fetchSignals() (bulk ingestion during sleep)
   *   - brain-pipeline.ts → onSignalsInserted (real-time signal intake)
   *   - brain-pipeline.ts → scoreAndRoute() (real-time event scoring)
   *
   * L1 does NOT run inside cognitive-stack.ts — it runs at the ingestion layer.
   * This method ensures L1 is fully observed even though it's not in the L3-L15 flow.
   */
  async function recordSignalIngestionBatch(data: {
    source: 'consolidation' | 'realtime' | 'score_and_route';
    signalsIngested: number;
    domainsActive: number;
    durationMs: number;
    qualityScore?: number;
    quarantinedCount?: number;
  }): Promise<void> {
    // Real-time sampling: At 10M signals/day, recording every batch creates 100K+ obs records.
    // Sample 1-in-10 for real-time, record everything for consolidation and score_and_route.
    if (data.source === 'realtime' && Math.random() > 0.1) return;

    try {
      await obs.recordSignalIngestion({
        source_domain: `brain.L1.${data.source}`,
        signal_type: 'signal_ingestion_batch',
        entity_type: 'ingestion_pipeline',
        entity_id: obsId('L1_' + data.source),
        quality_score: data.qualityScore ?? 0.8,
        is_quarantined: (data.quarantinedCount ?? 0) > 0,
        ingestion_latency_ms: data.durationMs,
        ingested_at: new Date().toISOString(),
      });

      // Emit cross_domain_signal for L1 — same as L3-L15
      await supabase.from('cross_domain_signals').insert({
        organization_id: organizationId,
        source_domain: 'brain.layer.1',
        signal_type: 'cognitive_layer_execution',
        signal_value: data.signalsIngested > 0 ? 1 : 0,
        entity_type: 'cognitive_layer',
        entity_id: 'L1_Episodic_Memory',
        signal_metadata: {
          layerNumber: 1,
          layerName: 'Episodic Memory',
          source: data.source,
          signalsIngested: data.signalsIngested,
          domainsActive: data.domainsActive,
          durationMs: data.durationMs,
          qualityScore: data.qualityScore,
          quarantinedCount: data.quarantinedCount,
        },
      });

    } catch (err) {
      logger.warn('obs:bridge:L1-signal-ingestion-failed', { source: data.source, error: String(err) });
    }
  }

  // ============================================================================
  // 1c. L2 CAUSAL DISCOVERY / ENTITY RESOLUTION RECORDING
  // ============================================================================

  /**
   * Record L2 causal discovery operations.
   *
   * Called from:
   *   - consolidation-engine.ts → discoverCausalRelationships() (batch ensemble)
   *   - brain-pipeline.ts → IncrementalGranger in onSignalsInserted (real-time)
   *
   * L2 does NOT run inside cognitive-stack.ts — it runs at the discovery layer.
   * This method ensures L2 is fully observed.
   */
  async function recordCausalDiscoveryBatch(data: {
    source: 'consolidation_ensemble' | 'realtime_granger' | 'multi_hop_reasoning';
    edgesDiscovered: number;
    newEdges: number;
    lostEdges: number;
    domainsAnalyzed: number;
    signalsProcessed: number;
    durationMs: number;
    dagQuality?: number;
  }): Promise<void> {
    try {
      await obs.recordEntityResolution({
        input_entity_type: 'causal_discovery',
        input_entity_id: obsId('L2_' + data.source),
        canonical_name: data.source,
        confidence: data.dagQuality ?? (data.edgesDiscovered > 0 ? 0.7 : 0),
        resolution_latency_ms: data.durationMs,
        resolved_at: new Date().toISOString(),
      });

      // Emit cross_domain_signal for L2 — same as L3-L15
      await supabase.from('cross_domain_signals').insert({
        organization_id: organizationId,
        source_domain: 'brain.layer.2',
        signal_type: 'cognitive_layer_execution',
        signal_value: data.edgesDiscovered > 0 ? 1 : 0,
        entity_type: 'cognitive_layer',
        entity_id: 'L2_LLM_Reasoner',
        signal_metadata: {
          layerNumber: 2,
          layerName: 'LLM Reasoner',
          source: data.source,
          edgesDiscovered: data.edgesDiscovered,
          newEdges: data.newEdges,
          lostEdges: data.lostEdges,
          domainsAnalyzed: data.domainsAnalyzed,
          signalsProcessed: data.signalsProcessed,
          durationMs: data.durationMs,
          dagQuality: data.dagQuality,
        },
      });

    } catch (err) {
      logger.warn('obs:bridge:L2-causal-discovery-failed', { source: data.source, error: String(err) });
    }
  }

  // ============================================================================
  // 2. EVOLUTION ENGINE RECORDING
  // ============================================================================

  /**
   * Record a Brain Evolution cycle to observability.
   *
   * Called by brain-evolution-engine.ts after each cycle completes.
   * Writes to obs_feedback_loops + obs_consolidation_cycles + brain_health_history.
   */
  async function recordEvolutionCycle(data: EvolutionObservabilityData): Promise<void> {
    try {
      // Record as feedback loop (prediction → outcome verification)
      await obs.recordFeedbackLoop({
        prediction_id: obsId('evolution_' + data.mode),
        prediction_type: 'brain_evolution',
        domain: 'brain',
        predicted_value: data.accuracy,
        actual_value: data.predictionsCorrect / Math.max(1, data.predictionsVerified),
        was_correct: data.accuracy >= 0.5,
        confidence: data.accuracy,
        calibration_bucket: getBrierBucket(data.brierScore),
        predicted_at: new Date().toISOString(),
      });

      // Record as consolidation cycle
      await obs.recordConsolidationCycle({
        consolidation_run_id: obsId('evolution_' + data.mode),
        is_core_brain: false,
        signals_in_window: data.predictionsVerified,
        causal_edges_discovered: data.weightUpdates,
        status: 'success',
        total_duration_ms: data.durationMs,
        started_at: new Date().toISOString(),
      });

      // Update brain_health_history (dashboard table)
      await supabase.from('brain_health_history').insert({
        organization_id: organizationId,
        total_signals: data.totalEvidence,
        total_relationships: data.totalEdges,
        total_memories: 0,
        active_agents: 0,
        learning_cycles_completed: 1,
        average_brier_score: data.brierScore,
        prediction_accuracy: data.accuracy,
        error_count: 0,
        warning_count: data.brierScore > 0.25 ? 1 : 0,
        recorded_at: new Date().toISOString(),
      });

      // Emit evolution observability signal
      await supabase.from('cross_domain_signals').insert({
        organization_id: organizationId,
        source_domain: 'brain.observability',
        signal_type: 'evolution_cycle_observed',
        signal_value: data.intelligenceScore,
        entity_type: 'brain_evolution',
        entity_id: `evolution_${data.mode}_${new Date().toISOString().split('T')[0]}`,
        signal_metadata: {
          mode: data.mode,
          accuracy: data.accuracy,
          brierScore: data.brierScore,
          predictionsVerified: data.predictionsVerified,
          weightUpdates: data.weightUpdates,
          durationMs: data.durationMs,
        },
      });

    } catch (err) {
      logger.warn('obs:bridge:evolution-cycle-failed', { error: String(err) });
    }
  }

  // ============================================================================
  // 3. FEDERATION RECORDING
  // ============================================================================

  /**
   * Record a federation operation to observability.
   *
   * Called by:
   *   - upstream-promoter.ts after promoting knowledge to CORE
   *   - federated-brain.ts after querying CORE
   *   - federation-approval-manager.ts after approval decisions
   *   - leap-intelligence-mesh.ts after mesh sync
   */
  async function recordFederationOperation(data: FederationObservabilityData): Promise<void> {
    try {
      // Record as connector operation (federation IS a connector to CORE brain)
      await obs.recordConnectorOperation({
        connector_type: 'federation',
        connector_id: `federation_${data.operationType}`,
        operation_type: mapFedOperationType(data.operationType),
        records_fetched: data.itemsProcessed,
        signals_generated: data.itemsPromoted ?? 0,
        errors_count: data.itemsRejected ?? 0,
        data_quality_score: data.piiRedacted != null
          ? Math.max(0, 1 - (data.piiRedacted / Math.max(1, data.itemsProcessed)))
          : 1,
        operation_latency_ms: data.durationMs,
        started_at: new Date().toISOString(),
      });

      // Emit federation signal → Evolution Engine can track collective learning
      await supabase.from('cross_domain_signals').insert({
        organization_id: organizationId,
        source_domain: 'brain.federation',
        signal_type: `federation_${data.operationType}`,
        signal_value: data.itemsPromoted ?? data.itemsProcessed,
        entity_type: 'federation_operation',
        entity_id: obsId('fed_' + data.operationType),
        signal_metadata: {
          operationType: data.operationType,
          itemsProcessed: data.itemsProcessed,
          itemsPromoted: data.itemsPromoted,
          itemsRejected: data.itemsRejected,
          piiRedacted: data.piiRedacted,
          coreEdgesAbsorbed: data.coreEdgesAbsorbed,
          corePatternsAbsorbed: data.corePatternsAbsorbed,
          meshConsensusStrength: data.meshConsensusStrength,
          durationMs: data.durationMs,
        },
      });

    } catch (err) {
      logger.warn('obs:bridge:federation-failed', { error: String(err) });
    }
  }

  // ============================================================================
  // 4. SE-aaS DOMAIN RECORDING (Enhanced)
  // ============================================================================

  /**
   * Record an SE-aaS domain execution with observability metadata.
   *
   * This AUGMENTS the existing feedBrainFromExecution() in domain-executor.ts
   * by also writing to observability tables.
   */
  async function recordDomainExecution(
    domainType: string,
    durationMs: number,
    claudePowered: boolean,
    brainAugmented: boolean,
    causalEdgesUsed: number,
    patternsUsed: number
  ): Promise<void> {
    try {
      await obs.recordAgentExecution({
        agent_type: `se-aas.${domainType}`,
        agent_run_id: obsId('seaas_' + domainType),
        trigger_type: 'event',
        causal_edges_used: causalEdgesUsed,
        status: 'success',
        execution_latency_ms: durationMs,
        cost_usd: claudePowered ? 0.01 : 0, // Estimate per Claude call
        started_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn('obs:bridge:domain-execution-failed', { domainType, error: String(err) });
    }
  }

  // ============================================================================
  // 5. FULL BRAIN HEALTH SNAPSHOT
  // ============================================================================

  /**
   * Comprehensive brain health snapshot for dashboard.
   *
   * Queries ALL observability tables + evolution + federation state.
   * Returns a single BrainHealthReport for visualization.
   */
  async function snapshotFullBrainHealth(): Promise<BrainHealthReport> {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

      const [
        evolutionRes,
        signalsRes,
        layerHealthRes,
        federationRes,
      ] = await Promise.all([
        // Latest evolution snapshot
        supabase
          .from('brain_evolution_snapshots')
          .select('intelligence_score, accuracy, brier_score, total_edges, total_evidence')
          .eq('organization_id', organizationId)
          .order('snapshot_date', { ascending: false })
          .limit(1),

        // Signal count last 7 days
        supabase
          .from('cross_domain_signals')
          .select('source_domain', { count: 'exact', head: false })
          .eq('organization_id', organizationId)
          .gte('created_at', sevenDaysAgo),

        // Layer health snapshots
        supabase
          .from('obs_layer_health')
          .select('layer_number, health_score, is_healthy, health_trend')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(15),

        // Federation settings
        supabase
          .from('organization_federation_settings')
          .select('contribute_to_core_brain, upstream_items_contributed')
          .eq('organization_id', organizationId)
          .limit(1),
      ]);

      const evolution = evolutionRes.data?.[0];
      const signals = signalsRes.data ?? [];
      const layerHealth = layerHealthRes.data ?? [];
      const federation = federationRes.data?.[0];

      // Compute unique active domains
      const activeDomains = new Set(signals.map((s: any) => s.source_domain));

      // Build per-layer health
      const layers = Object.entries(LAYER_NAMES).map(([num, name]) => {
        const ln = parseInt(num);
        const health = layerHealth.find((h: any) => h.layer_number === ln);
        return {
          layerNumber: ln,
          name,
          isActive: health?.is_healthy ?? false,
          healthScore: health?.health_score ?? 0,
        };
      });

      // Compute overall health: avg of layer health scores + evolution intelligence
      const avgLayerHealth = layers.length > 0
        ? layers.reduce((sum, l) => sum + l.healthScore, 0) / layers.length
        : 0;
      const evolutionScore = evolution?.intelligence_score ?? 0;
      const overallHealth = Math.round((avgLayerHealth * 0.4 + evolutionScore * 0.6));

      return {
        organizationId,
        timestamp: now.toISOString(),
        overallHealth,
        layers,
        evolution: {
          intelligenceScore: evolution?.intelligence_score ?? 0,
          accuracy: evolution?.accuracy ?? 0,
          brierScore: evolution?.brier_score ?? 0.25,
          isLearning: (evolution?.total_evidence ?? 0) > 0,
        },
        federation: {
          isContributing: federation?.contribute_to_core_brain ?? false,
          itemsPromoted: federation?.upstream_items_contributed ?? 0,
          coreEdgesAvailable: 0, // Would need federated query
          meshActive: false,
        },
        signals: {
          totalSignals7d: signals.length,
          signalQualityAvg: 0.8, // Default; would compute from obs_signal_ingestion
          domainsActive: activeDomains.size,
        },
      };
    } catch (err) {
      logger.warn('obs:bridge:snapshot-health-failed', { error: String(err) });
      return {
        organizationId,
        timestamp: new Date().toISOString(),
        overallHealth: 0,
        layers: [],
        evolution: { intelligenceScore: 0, accuracy: 0, brierScore: 0.25, isLearning: false },
        federation: { isContributing: false, itemsPromoted: 0, coreEdgesAvailable: 0, meshActive: false },
        signals: { totalSignals7d: 0, signalQualityAvg: 0, domainsActive: 0 },
      };
    }
  }

  // ============================================================================
  // 6. LAYER SIGNAL EMITTER — Records layer predictions for Evolution
  // ============================================================================

  /**
   * Emit cognitive layer outputs as predictions to prediction_records.
   *
   * This is THE critical missing wire: layers generate predictions/hypotheses
   * but they were never recorded. Now they are, and the Brain Evolution Engine
   * can verify them against actual outcomes.
   */
  async function emitLayerPredictions(
    layerNumber: number,
    predictions: Array<{
      description: string;
      confidence: number;
      domain?: string;
    }>
  ): Promise<void> {
    try {
      for (const pred of predictions.slice(0, 5)) {
        await supabase.from('prediction_records').insert({
          organization_id: organizationId,
          domain: pred.domain ?? `layer_${layerNumber}`,
          predicted_outcome: `[L${layerNumber} ${LAYER_NAMES[layerNumber] ?? 'Unknown'}] ${pred.description}`,
          predicted_value: null,
          confidence: pred.confidence,
          entity_type: 'cognitive_layer_prediction',
          entity_id: obsId('L' + layerNumber),
          source_rule_id: null,
        });
      }
    } catch (err) {
      logger.warn('obs:bridge:layer-predictions-failed', { layerNumber, error: String(err) });
    }
  }

  // ============================================================================
  // 7. FLUSH & CLEANUP
  // ============================================================================

  async function flush(): Promise<void> {
    await obs.flush();
  }

  function getStats() {
    return obs.getStats();
  }

  // ============================================================================
  // RETURN PUBLIC API
  // ============================================================================

  return {
    // Core recording (L3-L15 via cognitive stack callback)
    recordCognitiveLayerExecution,

    // L1 & L2 recording (separate execution paths — NOT in cognitive stack)
    recordSignalIngestionBatch,   // L1: consolidation-engine + brain-pipeline ingestion
    recordCausalDiscoveryBatch,   // L2: consolidation-engine discovery + real-time Granger

    // Evolution + Federation + Domain recording
    recordEvolutionCycle,
    recordFederationOperation,
    recordDomainExecution,

    // Signal & prediction emission
    emitLayerPredictions,

    // Health & reporting
    snapshotFullBrainHealth,

    // Lifecycle
    flush,
    getStats,

    // Expose underlying observability for direct access
    obs,
  };
}

// ============================================================================
// TYPE EXPORT
// ============================================================================

export type BrainObservabilityBridge = ReturnType<typeof createBrainObservabilityBridge>;

// ============================================================================
// HELPERS
// ============================================================================

function getBrierBucket(brierScore: number): string {
  if (brierScore < 0.05) return 'excellent';
  if (brierScore < 0.15) return 'good';
  if (brierScore < 0.25) return 'fair';
  return 'poor';
}

function mapFedOperationType(opType: string): 'sync' | 'fetch' | 'push' | 'auth' | 'healthcheck' {
  switch (opType) {
    case 'upstream_promotion':
    case 'percolation':
      return 'push';
    case 'downstream_query':
      return 'fetch';
    case 'approval':
      return 'auth';
    case 'mesh_sync':
      return 'sync';
    default:
      return 'sync';
  }
}
