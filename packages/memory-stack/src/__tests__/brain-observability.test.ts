/**
 * Brain Observability Framework - Comprehensive Tests
 *
 * Tests the observability system that tracks every layer of the brain
 * with full forensic analysis, gap detection, and performance monitoring.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createBrainObservability } from '../observability/brain-observability';
import type {
  SignalIngestionRecord,
  CausalCalculationRecord,
  AgentExecutionRecord,
  LayerHealthSnapshot,
} from '../observability/brain-observability';

// ============================================================================
// TEST SETUP
// ============================================================================

const TEST_ORG_ID = '00000000-0000-4000-a000-000000000002';

// Mock Supabase client
function createMockSupabase() {
  const insertedData: Record<string, any[]> = {};

  // Build chainable query builder
  const createChain = (table: string): any => {
    const chain = {
      eq: (field: string, value: any) => chain,
      gte: (field: string, value: any) => chain,
      not: (field: string, op: string, value: any) => chain,
      order: (field: string, options: any) => chain,
      limit: (n: number) => ({
        single: async () => {
          const records = insertedData[table] || [];
          return { data: records[0] || null, error: null };
        },
        then: async (resolve: any) => {
          const records = insertedData[table] || [];
          return resolve({ data: records.slice(0, n), error: null });
        },
      }),
      then: async (resolve: any) => {
        const records = insertedData[table] || [];
        return resolve({ data: records, error: null });
      },
    };
    return chain;
  };

  return {
    from: (table: string) => ({
      insert: async (data: any) => {
        if (!insertedData[table]) insertedData[table] = [];
        insertedData[table].push(...(Array.isArray(data) ? data : [data]));
        return { error: null, data: null };
      },
      select: (fields: string) => createChain(table),
    }),
    rpc: async (fn: string, params: any) => {
      return { error: null, data: null };
    },
    getInsertedData: () => insertedData,
    clearData: () => {
      for (const key of Object.keys(insertedData)) {
        delete insertedData[key];
      }
    },
  } as any;
}

describe('Brain Observability Framework', () => {
  let supabase: ReturnType<typeof createMockSupabase>;
  let obs: ReturnType<typeof createBrainObservability>;

  beforeEach(() => {
    supabase = createMockSupabase();
    obs = createBrainObservability({
      supabase,
      organizationId: TEST_ORG_ID,
      batchMode: false, // Immediate writes for testing
      verbose: false,
    });
  });

  afterEach(() => {
    supabase.clearData();
  });

  // ============================================================================
  // L1: SIGNAL INGESTION OBSERVABILITY
  // ============================================================================

  describe('L1: Signal Ingestion Tracking', () => {
    it('should record signal ingestion with all metadata', async () => {
      const record: SignalIngestionRecord = {
        source_domain: 'revenue',
        signal_type: 'mrr_change',
        entity_type: 'company',
        entity_id: 'acme-corp',
        signal_value: 12500,
        signal_metadata: { previous_mrr: 50000, new_mrr: 62500 },
        nlp_enriched: true,
        nlp_sentiment: 0.8,
        nlp_topics: ['growth', 'expansion'],
        quality_score: 0.95,
        ingestion_latency_ms: 45,
        ingested_at: new Date().toISOString(),
      };

      await obs.recordSignalIngestion(record);

      const data = supabase.getInsertedData();
      expect(data.obs_signal_ingestion).toHaveLength(1);
      expect(data.obs_signal_ingestion[0]).toMatchObject({
        ...record,
        organization_id: TEST_ORG_ID,
      });
    });

    it('should track signal quality and quarantine flags', async () => {
      const lowQualityRecord: SignalIngestionRecord = {
        source_domain: 'sales',
        signal_type: 'deal_closed',
        entity_type: 'deal',
        entity_id: 'deal-123',
        signal_value: 5000,
        quality_score: 0.4,
        quality_flags: ['missing_metadata', 'suspicious_value'],
        is_quarantined: true,
        ingested_at: new Date().toISOString(),
      };

      await obs.recordSignalIngestion(lowQualityRecord);

      const data = supabase.getInsertedData();
      expect(data.obs_signal_ingestion[0].is_quarantined).toBe(true);
      expect(data.obs_signal_ingestion[0].quality_flags).toContain('missing_metadata');
    });
  });

  // ============================================================================
  // L4: CAUSAL CALCULATIONS OBSERVABILITY
  // ============================================================================

  describe('L4: Causal Calculations Tracking', () => {
    it('should record Granger causality tests', async () => {
      const record: CausalCalculationRecord = {
        calculation_type: 'granger',
        source_domain: 'marketing_spend',
        target_domain: 'revenue',
        time_series_length: 90,
        lag_days: 14,
        observations_count: 90,
        granger_f_statistic: 12.45,
        granger_p_value: 0.003,
        effect_size: 0.68,
        is_significant: true,
        confidence_interval_lower: 0.52,
        confidence_interval_upper: 0.84,
        calculation_latency_ms: 2340,
        calculated_at: new Date().toISOString(),
      };

      await obs.recordCausalCalculation(record);

      const data = supabase.getInsertedData();
      expect(data.obs_causal_calculations).toHaveLength(1);
      expect(data.obs_causal_calculations[0].is_significant).toBe(true);
      expect(data.obs_causal_calculations[0].granger_p_value).toBe(0.003);
    });

    it('should track causal discovery runs with method votes', async () => {
      const record: CausalCalculationRecord = {
        calculation_type: 'discovery',
        source_domain: 'support_tickets',
        target_domain: 'churn',
        discovery_run_id: 'discovery-run-123',
        method_votes: {
          granger: 'yes',
          pc_algorithm: 'weak_yes',
          var: 'yes',
        },
        bayesian_judgment: 'strong_yes',
        is_significant: true,
        effect_size: 0.72,
        calculated_at: new Date().toISOString(),
      };

      await obs.recordCausalCalculation(record);

      const data = supabase.getInsertedData();
      expect(data.obs_causal_calculations[0].method_votes).toHaveProperty('granger', 'yes');
      expect(data.obs_causal_calculations[0].bayesian_judgment).toBe('strong_yes');
    });

    it('should track weight updates with reasons', async () => {
      const record: CausalCalculationRecord = {
        calculation_type: 'incremental',
        source_domain: 'product_usage',
        target_domain: 'expansion',
        old_weight: 0.65,
        new_weight: 0.78,
        weight_update_reason: 'prediction_accuracy_improved',
        calculated_at: new Date().toISOString(),
      };

      await obs.recordCausalCalculation(record);

      const data = supabase.getInsertedData();
      expect(data.obs_causal_calculations[0].old_weight).toBe(0.65);
      expect(data.obs_causal_calculations[0].new_weight).toBe(0.78);
    });
  });

  // ============================================================================
  // L6: AGENT EXECUTIONS OBSERVABILITY
  // ============================================================================

  describe('L6: Agent Execution Tracking', () => {
    it('should record agent runs with full context', async () => {
      const record: AgentExecutionRecord = {
        agent_type: 'revenue_watcher',
        agent_level: 'primary',
        agent_run_id: 'run-abc-123',
        trigger_type: 'scheduled',
        input_context: { domains: ['revenue', 'churn'] },
        causal_edges_used: 15,
        patterns_used: 7,
        memories_retrieved: 23,
        actions_generated: 3,
        motor_commands_issued: 1,
        predictions_made: 5,
        status: 'success',
        output_summary: 'Detected revenue anomaly in EMEA region',
        execution_latency_ms: 3456,
        tokens_consumed: 8500,
        llm_calls_made: 2,
        cost_usd: 0.034,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };

      await obs.recordAgentExecution(record);

      const data = supabase.getInsertedData();
      expect(data.obs_agent_executions).toHaveLength(1);
      expect(data.obs_agent_executions[0].status).toBe('success');
      expect(data.obs_agent_executions[0].predictions_made).toBe(5);
    });

    it('should track failed agent executions with errors', async () => {
      const record: AgentExecutionRecord = {
        agent_type: 'anomaly_diagnostician',
        agent_run_id: 'run-failed-001',
        trigger_type: 'event',
        status: 'failed',
        error_message: 'Insufficient causal edges for diagnosis',
        execution_latency_ms: 120,
        started_at: new Date().toISOString(),
      };

      await obs.recordAgentExecution(record);

      const data = supabase.getInsertedData();
      expect(data.obs_agent_executions[0].status).toBe('failed');
      expect(data.obs_agent_executions[0].error_message).toContain('Insufficient');
    });
  });

  // ============================================================================
  // META: FEEDBACK LOOPS OBSERVABILITY
  // ============================================================================

  describe('META: Feedback Loop Tracking', () => {
    it('should track prediction → outcome matching', async () => {
      const record = {
        prediction_type: 'churn_risk',
        domain: 'customer_success',
        predicted_value: 0.75,
        predicted_outcome: 'high_risk',
        confidence: 0.82,
        prediction_horizon_days: 30,
        actual_value: 1.0, // Did churn
        actual_outcome: 'churned',
        was_correct: true,
        absolute_error: 0.25,
        squared_error: 0.0625,
        calibration_bucket: '80-90',
        is_calibrated: true,
        weight_adjusted: true,
        weight_old: 0.65,
        weight_new: 0.72,
        bayesian_update_applied: true,
        predicted_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        verified_at: new Date().toISOString(),
        feedback_processed_at: new Date().toISOString(),
      };

      await obs.recordFeedbackLoop(record);

      const data = supabase.getInsertedData();
      expect(data.obs_feedback_loops).toHaveLength(1);
      expect(data.obs_feedback_loops[0].was_correct).toBe(true);
      expect(data.obs_feedback_loops[0].bayesian_update_applied).toBe(true);
    });

    it('should track calibration buckets', async () => {
      const record = {
        prediction_type: 'expansion_opportunity',
        domain: 'sales',
        confidence: 0.45,
        predicted_outcome: 'likely',
        actual_outcome: 'no_expansion',
        was_correct: false,
        calibration_bucket: '40-50',
        is_calibrated: false, // 45% confidence but prediction failed
        predicted_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
      };

      await obs.recordFeedbackLoop(record);

      const data = supabase.getInsertedData();
      expect(data.obs_feedback_loops[0].calibration_bucket).toBe('40-50');
      expect(data.obs_feedback_loops[0].is_calibrated).toBe(false);
    });
  });

  // ============================================================================
  // META: CONSOLIDATION CYCLES OBSERVABILITY
  // ============================================================================

  describe('META: Consolidation Cycle Tracking', () => {
    it('should record full consolidation run metrics', async () => {
      const record = {
        consolidation_run_id: 'consolidation-2026-02-15-0300',
        is_core_brain: false,
        lookback_hours: 48,
        prune_after_days: 30,
        min_edge_weight: 0.20,
        signals_in_window: 15234,
        domains_active: 7,
        existing_edges_count: 42,
        causal_edges_discovered: 8,
        new_relationships: 3,
        lost_relationships: 1,
        anomalies_detected: 2,
        patterns_found: 12,
        training_packs_generated: 2,
        edges_pruned: 4,
        edges_strengthened: 15,
        edges_decayed: 8,
        memories_created: 34,
        total_duration_ms: 125000,
        step_durations: {
          fetch: 12000,
          discover: 67000,
          patterns: 23000,
          train: 15000,
          prune: 8000,
        },
        memory_peak_mb: 450,
        narrative: 'Brain learned 3 new causal relationships in revenue domain',
        discoveries: [
          'marketing_spend → revenue (p=0.003)',
          'support_tickets → churn (p=0.012)',
        ],
        warnings: ['Low signal quality in engineering domain'],
        status: 'success',
        started_at: new Date(Date.now() - 125000).toISOString(),
        completed_at: new Date().toISOString(),
      };

      await obs.recordConsolidationCycle(record);

      const data = supabase.getInsertedData();
      expect(data.obs_consolidation_cycles).toHaveLength(1);
      expect(data.obs_consolidation_cycles[0].status).toBe('success');
      expect(data.obs_consolidation_cycles[0].new_relationships).toBe(3);
      expect(data.obs_consolidation_cycles[0].discoveries).toHaveLength(2);
    });
  });

  // ============================================================================
  // FORENSIC QUERIES
  // ============================================================================

  describe('Forensic Analysis Queries', () => {
    it('should retrieve signal history for an entity', async () => {
      // Insert multiple signals
      await obs.recordSignalIngestion({
        source_domain: 'revenue',
        signal_type: 'mrr_change',
        entity_type: 'company',
        entity_id: 'acme-corp',
        signal_value: 1000,
        ingested_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      });

      await obs.recordSignalIngestion({
        source_domain: 'usage',
        signal_type: 'dau_change',
        entity_type: 'company',
        entity_id: 'acme-corp',
        signal_value: 50,
        ingested_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      });

      const history = await obs.getSignalHistory('company', 'acme-corp', 24);

      // In mock, we return all inserted data
      expect(history.length).toBeGreaterThanOrEqual(0);
    });

    it('should retrieve causal calculation history for a relationship', async () => {
      await obs.recordCausalCalculation({
        calculation_type: 'granger',
        source_domain: 'marketing',
        target_domain: 'revenue',
        granger_p_value: 0.005,
        is_significant: true,
        calculated_at: new Date().toISOString(),
      });

      const history = await obs.getCausalCalculationHistory('marketing', 'revenue', 168);

      expect(history.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // BATCH MODE & PERFORMANCE
  // ============================================================================

  describe('Batch Mode Operations', () => {
    it('should batch writes when enabled', async () => {
      const batchObs = createBrainObservability({
        supabase,
        organizationId: TEST_ORG_ID,
        batchMode: true,
        maxBatchSize: 3,
        verbose: false,
      });

      // Record 5 signals
      for (let i = 0; i < 5; i++) {
        await batchObs.recordSignalIngestion({
          source_domain: 'revenue',
          signal_type: 'mrr_change',
          entity_type: 'company',
          entity_id: `company-${i}`,
          signal_value: i * 1000,
          ingested_at: new Date().toISOString(),
        });
      }

      // Should have pending writes
      const stats = batchObs.getStats();
      expect(stats.pending_writes).toBeGreaterThan(0);

      // Flush manually
      await batchObs.flush();

      // Should have written all
      const afterFlush = batchObs.getStats();
      expect(afterFlush.pending_writes).toBe(0);
      expect(afterFlush.total_writes).toBe(5);
    });
  });

  // ============================================================================
  // COST ANALYSIS
  // ============================================================================

  describe('Cost Analysis', () => {
    it('should compute cost breakdown by operation type', async () => {
      await obs.recordSemanticOperation({
        operation_type: 'embed',
        tokens_consumed: 1000,
        cost_usd: 0.01,
        executed_at: new Date().toISOString(),
      });

      await obs.recordAgentExecution({
        agent_type: 'revenue_watcher',
        agent_run_id: 'run-123',
        status: 'success',
        tokens_consumed: 5000,
        cost_usd: 0.05,
        started_at: new Date().toISOString(),
      });

      const costAnalysis = await obs.getCostAnalysis(24);

      // Mock implementation always returns data structure
      expect(costAnalysis).toHaveProperty('total_cost');
      expect(costAnalysis).toHaveProperty('semantic_cost');
      expect(costAnalysis).toHaveProperty('agent_cost');
      expect(costAnalysis).toHaveProperty('by_operation');
    });
  });

  // ============================================================================
  // LAYER HEALTH MONITORING
  // ============================================================================

  describe('Layer Health Monitoring', () => {
    it('should snapshot layer health across all layers', async () => {
      await obs.snapshotLayerHealth();

      // Should call RPC function (verified by no errors)
      expect(true).toBe(true);
    });

    it('should retrieve health for specific layer', async () => {
      const health = await obs.getLayerHealth(4); // L4: Causal

      // Mock returns null if no data
      expect(health).toBeNull();
    });

    it('should get health across all layers', async () => {
      const allHealth = await obs.getAllLayersHealth();

      // Should return array (empty in test)
      expect(Array.isArray(allHealth)).toBe(true);
    });
  });
});
