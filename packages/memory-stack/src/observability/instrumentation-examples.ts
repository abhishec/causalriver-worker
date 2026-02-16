/**
 * NexusBrain Observability - Instrumentation Examples
 *
 * Real-world examples showing how to integrate observability into brain components.
 * Copy these patterns when instrumenting consolidation engine, agents, and other modules.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrainObservability } from './brain-observability';
import { getDefaultLogger } from './index';

// ============================================================================
// EXAMPLE 1: INSTRUMENTING CONSOLIDATION ENGINE
// ============================================================================

/**
 * Example: Full consolidation cycle instrumentation
 *
 * This shows how to wrap the consolidation engine's runFullCycle() method
 * with comprehensive observability tracking.
 */
export async function exampleConsolidationInstrumentation(
  supabase: SupabaseClient,
  organizationId: string
) {
  const logger = getDefaultLogger();
  const obs = createBrainObservability({ supabase, organizationId });

  const consolidationRunId = `consolidation-${Date.now()}`;
  const startTime = Date.now();

  try {
    // Step 1: FETCH - Collect signals
    logger.info('consolidation:fetch:start', { runId: consolidationRunId });

    const signals = await fetchSignalsFromDB(supabase, organizationId, 48); // 48h lookback

    // Track each signal ingestion
    for (const signal of signals) {
      await obs.recordSignalIngestion({
        signal_id: signal.id,
        source_domain: signal.source_domain,
        signal_type: signal.signal_type,
        entity_type: signal.entity_type,
        entity_id: signal.entity_id,
        signal_value: signal.value,
        signal_metadata: signal.metadata,
        nlp_enriched: signal.nlp_enriched || false,
        nlp_sentiment: signal.nlp_sentiment,
        nlp_topics: signal.nlp_topics,
        ingestion_latency_ms: signal.ingestion_latency_ms,
        quality_score: signal.quality_score,
        ingested_at: signal.created_at,
        processed_at: new Date().toISOString(),
      });
    }

    logger.info('consolidation:fetch:complete', {
      runId: consolidationRunId,
      signalCount: signals.length,
    });

    // Step 2: DISCOVER - Run causal discovery
    logger.info('consolidation:discover:start', { runId: consolidationRunId });

    const causalEdges = await runCausalDiscovery(signals);

    // Track each causal calculation
    for (const edge of causalEdges) {
      await obs.recordCausalCalculation({
        discovery_run_id: consolidationRunId,
        calculation_type: edge.method, // 'granger', 'ccm', 'pc_algorithm'
        source_domain: edge.source,
        target_domain: edge.target,
        granger_p_value: edge.granger_p_value,
        granger_f_stat: edge.granger_f_stat,
        ccm_rho: edge.ccm_rho,
        pc_algorithm_score: edge.pc_score,
        bayesian_confidence: edge.bayesian_confidence,
        is_significant: edge.is_significant,
        effect_size: edge.effect_size,
        calculation_duration_ms: edge.calculation_time_ms,
        calculated_at: new Date().toISOString(),
      });
    }

    logger.info('consolidation:discover:complete', {
      runId: consolidationRunId,
      edgesFound: causalEdges.length,
    });

    // Step 3: PATTERNS - Mine patterns
    logger.info('consolidation:patterns:start', { runId: consolidationRunId });

    const patterns = await minePatterns(signals);

    for (const pattern of patterns) {
      await obs.recordPatternLearning({
        discovery_run_id: consolidationRunId,
        pattern_type: pattern.type, // 'association', 'sequential', 'temporal'
        pattern_signature: pattern.signature,
        support: pattern.support,
        confidence: pattern.confidence,
        lift: pattern.lift,
        items: pattern.items,
        discovered_at: new Date().toISOString(),
      });
    }

    logger.info('consolidation:patterns:complete', {
      runId: consolidationRunId,
      patternsFound: patterns.length,
    });

    // Step 4: AGENTS - Execute agents
    const agentResults = await runAgents(supabase, organizationId, signals);

    for (const result of agentResults) {
      await obs.recordAgentExecution({
        agent_run_id: result.run_id,
        agent_type: result.agent_type,
        input_context: result.input_context,
        output_result: result.output_result,
        status: result.status,
        error_message: result.error,
        tokens_used: result.tokens_used,
        cost_usd: result.cost_usd,
        started_at: result.started_at,
        completed_at: result.completed_at,
        duration_ms: result.duration_ms,
      });
    }

    // Step 5: Record consolidation cycle
    const endTime = Date.now();
    const predictions = await generatePredictions(causalEdges);

    await obs.recordConsolidationCycle({
      consolidation_run_id: consolidationRunId,
      is_core_brain: organizationId === '00000000-0000-4000-a000-000000000001',
      signals_in_window: signals.length,
      causal_edges_discovered: causalEdges.filter(e => e.is_significant).length,
      patterns_found: patterns.length,
      agents_executed: agentResults.length,
      predictions_made: predictions.length,
      accuracy_score: calculateAccuracy(predictions),
      total_duration_ms: endTime - startTime,
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date(endTime).toISOString(),
    });

    // Flush all observability writes
    await obs.flush();

    logger.info('consolidation:complete', {
      runId: consolidationRunId,
      duration: endTime - startTime,
    });

    return { success: true, runId: consolidationRunId };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Record failed consolidation cycle
    await obs.recordConsolidationCycle({
      consolidation_run_id: consolidationRunId,
      is_core_brain: organizationId === '00000000-0000-4000-a000-000000000001',
      signals_in_window: 0,
      causal_edges_discovered: 0,
      patterns_found: 0,
      status: 'failed',
      error_message: err.message,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
    });

    await obs.flush();

    logger.error('consolidation:failed', {
      runId: consolidationRunId,
      error: err.message,
    });

    throw error;
  }
}

// ============================================================================
// EXAMPLE 2: INSTRUMENTING AGENT EXECUTION
// ============================================================================

/**
 * Example: Agent execution with observability
 */
export async function exampleAgentInstrumentation(
  supabase: SupabaseClient,
  organizationId: string,
  agentType: string,
  inputContext: Record<string, unknown>
) {
  const obs = createBrainObservability({ supabase, organizationId });
  const logger = getDefaultLogger();

  const agentRunId = `agent-${agentType}-${Date.now()}`;
  const startTime = Date.now();

  try {
    logger.info('agent:start', { agentType, runId: agentRunId });

    // Execute agent (example: OpenAI call)
    const result = await executeAgent(agentType, inputContext);

    const endTime = Date.now();

    // Record successful execution
    await obs.recordAgentExecution({
      agent_run_id: agentRunId,
      agent_type: agentType,
      input_context: inputContext,
      output_result: result.output,
      status: 'success',
      tokens_used: result.tokens,
      cost_usd: result.cost,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date(endTime).toISOString(),
      duration_ms: endTime - startTime,
    });

    await obs.flush();

    logger.info('agent:complete', {
      agentType,
      runId: agentRunId,
      duration: endTime - startTime,
    });

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Record failed execution
    await obs.recordAgentExecution({
      agent_run_id: agentRunId,
      agent_type: agentType,
      input_context: inputContext,
      status: 'failed',
      error_message: err.message,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    });

    await obs.flush();

    logger.error('agent:failed', {
      agentType,
      runId: agentRunId,
      error: err.message,
    });

    throw error;
  }
}

// ============================================================================
// EXAMPLE 3: INSTRUMENTING CONNECTOR OPERATIONS
// ============================================================================

/**
 * Example: Connector sync with observability
 */
export async function exampleConnectorInstrumentation(
  supabase: SupabaseClient,
  organizationId: string,
  connectorType: string
) {
  const obs = createBrainObservability({ supabase, organizationId });
  const logger = getDefaultLogger();

  const syncId = `sync-${connectorType}-${Date.now()}`;
  const startTime = Date.now();

  try {
    logger.info('connector:sync:start', { connectorType, syncId });

    // Sync connector
    const result = await syncConnector(connectorType);

    const endTime = Date.now();

    // Record successful sync
    await obs.recordConnectorOperation({
      sync_id: syncId,
      connector_type: connectorType,
      operation_type: 'full_sync',
      records_fetched: result.recordsFetched,
      records_processed: result.recordsProcessed,
      records_failed: result.recordsFailed,
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date(endTime).toISOString(),
      duration_ms: endTime - startTime,
    });

    await obs.flush();

    logger.info('connector:sync:complete', {
      connectorType,
      syncId,
      recordsFetched: result.recordsFetched,
    });

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Record failed sync
    await obs.recordConnectorOperation({
      sync_id: syncId,
      connector_type: connectorType,
      operation_type: 'full_sync',
      status: 'failed',
      error_message: err.message,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    });

    await obs.flush();

    logger.error('connector:sync:failed', {
      connectorType,
      syncId,
      error: err.message,
    });

    throw error;
  }
}

// ============================================================================
// EXAMPLE 4: INSTRUMENTING FEEDBACK LOOPS
// ============================================================================

/**
 * Example: Tracking prediction accuracy with feedback loops
 */
export async function exampleFeedbackLoopInstrumentation(
  supabase: SupabaseClient,
  organizationId: string,
  predictionId: string,
  actualOutcome: number
) {
  const obs = createBrainObservability({ supabase, organizationId });
  const logger = getDefaultLogger();

  try {
    // Fetch original prediction
    const prediction = await fetchPrediction(supabase, predictionId);

    if (!prediction) {
      throw new Error(`Prediction not found: ${predictionId}`);
    }

    // Calculate accuracy
    const error = Math.abs(prediction.predicted_value - actualOutcome);
    const percentError = (error / Math.abs(actualOutcome)) * 100;
    const isAccurate = percentError < 10; // 10% threshold

    // Record feedback loop
    await obs.recordFeedbackLoop({
      prediction_id: predictionId,
      source_domain: prediction.source_domain,
      target_domain: prediction.target_domain,
      predicted_value: prediction.predicted_value,
      actual_value: actualOutcome,
      prediction_error: error,
      is_accurate: isAccurate,
      confidence_at_prediction: prediction.confidence,
      predicted_at: prediction.created_at,
      actual_observed_at: new Date().toISOString(),
    });

    await obs.flush();

    logger.info('feedback-loop:recorded', {
      predictionId,
      isAccurate,
      percentError,
    });

    return { isAccurate, error, percentError };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('feedback-loop:failed', {
      predictionId,
      error: err.message,
    });

    throw error;
  }
}

// ============================================================================
// EXAMPLE 5: HEALTH MONITORING
// ============================================================================

/**
 * Example: Periodic health snapshot (run every 5 minutes)
 */
export async function exampleHealthMonitoring(
  supabase: SupabaseClient,
  organizationId: string
) {
  const obs = createBrainObservability({ supabase, organizationId });
  const logger = getDefaultLogger();

  try {
    logger.info('health:snapshot:start', { organizationId });

    // Take snapshot of all layers
    await obs.snapshotLayerHealth();

    // Get current health
    const health = await obs.getAllLayersHealth();

    // Check for degraded layers
    const degradedLayers = health.filter(h => h.health_score < 50);

    if (degradedLayers.length > 0) {
      logger.warn('health:degraded-layers', {
        organizationId,
        degradedCount: degradedLayers.length,
        layers: degradedLayers.map(l => ({
          layer: l.layer_name,
          score: l.health_score,
          gaps: l.gaps_detected,
        })),
      });
    }

    logger.info('health:snapshot:complete', {
      organizationId,
      avgHealth: health.reduce((sum, h) => sum + h.health_score, 0) / health.length,
    });

    return health;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error('health:snapshot:failed', {
      organizationId,
      error: err.message,
    });

    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS (Stubs for examples)
// ============================================================================

async function fetchSignalsFromDB(
  supabase: SupabaseClient,
  organizationId: string,
  hours: number
): Promise<any[]> {
  // Implementation: Query signals table
  return [];
}

async function runCausalDiscovery(signals: any[]): Promise<any[]> {
  // Implementation: Run causal discovery
  return [];
}

async function minePatterns(signals: any[]): Promise<any[]> {
  // Implementation: Pattern mining
  return [];
}

async function runAgents(
  supabase: SupabaseClient,
  organizationId: string,
  signals: any[]
): Promise<any[]> {
  // Implementation: Agent execution
  return [];
}

async function generatePredictions(causalEdges: any[]): Promise<any[]> {
  // Implementation: Generate predictions
  return [];
}

function calculateAccuracy(predictions: any[]): number {
  // Implementation: Calculate accuracy score
  return 0.75;
}

async function executeAgent(
  agentType: string,
  inputContext: Record<string, unknown>
): Promise<any> {
  // Implementation: Execute agent
  return {
    output: {},
    tokens: 1000,
    cost: 0.02,
  };
}

async function syncConnector(connectorType: string): Promise<any> {
  // Implementation: Sync connector
  return {
    recordsFetched: 100,
    recordsProcessed: 95,
    recordsFailed: 5,
  };
}

async function fetchPrediction(
  supabase: SupabaseClient,
  predictionId: string
): Promise<any> {
  // Implementation: Fetch prediction
  return null;
}
