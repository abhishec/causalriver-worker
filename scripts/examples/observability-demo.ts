/**
 * Brain Observability Framework - Live Demonstration
 *
 * This script demonstrates the complete observability framework in action,
 * showing how every layer of the brain is tracked with full forensic capabilities.
 *
 * Usage:
 *   pnpm tsx scripts/examples/observability-demo.ts
 */

import { createClient } from '@supabase/supabase-js';
import { createBrainObservability } from '../../packages/memory-stack/src/observability/brain-observability';
import type {
  SignalIngestionRecord,
  CausalCalculationRecord,
  PatternLearningRecord,
  AgentExecutionRecord,
  FeedbackLoopRecord,
  ConsolidationCycleRecord,
} from '../../packages/memory-stack/src/observability/brain-observability';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const ORG_ID = process.env.ORG_ID || '00000000-0000-4000-a000-000000000002';

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

// ============================================================================
// SIMULATION
// ============================================================================

async function runObservabilityDemo() {
  console.log('🧠 Brain Observability Framework - Live Demo\n');

  // Initialize
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const obs = createBrainObservability({
    supabase,
    organizationId: ORG_ID,
    batchMode: true,
    batchIntervalMs: 2000,
    maxBatchSize: 50,
    verbose: true,
  });

  console.log('✅ Observability framework initialized');
  console.log(`📍 Organization: ${ORG_ID.substring(0, 8)}...\n`);

  // ─────────────────────────────────────────────────────────────────────
  // STEP 1: Simulate Signal Ingestion (L1)
  // ─────────────────────────────────────────────────────────────────────

  console.log('▶️  Step 1: Simulating signal ingestion...');

  const signalStart = Date.now();
  const signals: SignalIngestionRecord[] = [
    {
      source_domain: 'revenue',
      signal_type: 'mrr_change',
      entity_type: 'company',
      entity_id: 'acme-corp',
      signal_value: 12500,
      signal_metadata: { previous_mrr: 50000, new_mrr: 62500, growth_rate: 0.25 },
      nlp_enriched: true,
      nlp_sentiment: 0.85,
      nlp_topics: ['revenue_growth', 'expansion', 'product_adoption'],
      knowledge_enriched: true,
      knowledge_entities: ['acme-corp', 'enterprise-plan'],
      quality_score: 0.95,
      ingestion_latency_ms: 45,
      enrichment_latency_ms: 120,
      total_latency_ms: 165,
      ingested_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    },
    {
      source_domain: 'engineering',
      signal_type: 'deployment_frequency',
      entity_type: 'team',
      entity_id: 'backend-team',
      signal_value: 0.6, // 6 deploys in last 10 days
      quality_score: 0.88,
      ingestion_latency_ms: 32,
      ingested_at: new Date().toISOString(),
    },
    {
      source_domain: 'customer_success',
      signal_type: 'nps_score',
      entity_type: 'company',
      entity_id: 'acme-corp',
      signal_value: 0.72, // NPS 72 = 0.72 normalized
      nlp_enriched: true,
      nlp_sentiment: 0.75,
      quality_score: 0.92,
      ingestion_latency_ms: 28,
      ingested_at: new Date().toISOString(),
    },
  ];

  for (const signal of signals) {
    await obs.recordSignalIngestion(signal);
  }

  console.log(`   ✓ Recorded ${signals.length} signals (${Date.now() - signalStart}ms)`);
  console.log(`   📊 Domains: revenue, engineering, customer_success\n`);

  // ─────────────────────────────────────────────────────────────────────
  // STEP 2: Simulate Causal Discovery (L4)
  // ─────────────────────────────────────────────────────────────────────

  console.log('▶️  Step 2: Simulating causal discovery...');

  const causalStart = Date.now();
  const causalCalculations: CausalCalculationRecord[] = [
    {
      calculation_type: 'granger',
      source_domain: 'engineering',
      target_domain: 'revenue',
      time_series_length: 90,
      lag_days: 14,
      observations_count: 90,
      granger_f_statistic: 8.42,
      granger_p_value: 0.012,
      effect_size: 0.56,
      is_significant: true,
      confidence_interval_lower: 0.38,
      confidence_interval_upper: 0.74,
      calculation_latency_ms: 1850,
      calculated_at: new Date().toISOString(),
    },
    {
      calculation_type: 'discovery',
      source_domain: 'customer_success',
      target_domain: 'revenue',
      discovery_run_id: `discovery-${Date.now()}`,
      method_votes: {
        granger: 'yes',
        pc_algorithm: 'weak_yes',
        var: 'yes',
      },
      bayesian_judgment: 'strong_yes',
      is_significant: true,
      effect_size: 0.68,
      granger_p_value: 0.003,
      calculation_latency_ms: 4200,
      calculated_at: new Date().toISOString(),
    },
    {
      calculation_type: 'incremental',
      source_domain: 'engineering',
      target_domain: 'revenue',
      old_weight: 0.52,
      new_weight: 0.56,
      weight_update_reason: 'new_evidence_from_recent_signals',
      calculation_latency_ms: 320,
      calculated_at: new Date().toISOString(),
    },
  ];

  for (const calc of causalCalculations) {
    await obs.recordCausalCalculation(calc);
  }

  console.log(`   ✓ Discovered ${causalCalculations.length} causal relationships (${Date.now() - causalStart}ms)`);
  console.log(`   🔗 engineering → revenue (p=0.012, effect=0.56)`);
  console.log(`   🔗 customer_success → revenue (p=0.003, effect=0.68)\n`);

  // ─────────────────────────────────────────────────────────────────────
  // STEP 3: Simulate Pattern Learning (L5)
  // ─────────────────────────────────────────────────────────────────────

  console.log('▶️  Step 3: Simulating pattern learning...');

  const patternStart = Date.now();
  const patterns: PatternLearningRecord[] = [
    {
      operation_type: 'discover',
      pattern_type: 'association',
      domain: 'revenue',
      support: 0.45,
      confidence: 0.82,
      lift: 2.1,
      significance_p_value: 0.001,
      operation_latency_ms: 890,
      executed_at: new Date().toISOString(),
    },
    {
      operation_type: 'evaluate',
      pattern_type: 'cascade',
      rule_evaluated: true,
      condition_expression: { domain: 'engineering', threshold: 0.5 },
      evaluation_result: 'fired',
      actions_taken: [{ type: 'alert', target: 'revenue_team' }],
      operation_latency_ms: 45,
      executed_at: new Date().toISOString(),
    },
  ];

  for (const pattern of patterns) {
    await obs.recordPatternLearning(pattern);
  }

  console.log(`   ✓ Learned ${patterns.length} patterns (${Date.now() - patternStart}ms)`);
  console.log(`   📈 Association rule: support=0.45, confidence=0.82\n`);

  // ─────────────────────────────────────────────────────────────────────
  // STEP 4: Simulate Agent Execution (L6)
  // ─────────────────────────────────────────────────────────────────────

  console.log('▶️  Step 4: Simulating agent execution...');

  const agentStart = Date.now();
  const agentRun: AgentExecutionRecord = {
    agent_type: 'revenue_watcher',
    agent_level: 'primary',
    agent_run_id: `run-${Date.now()}`,
    trigger_type: 'scheduled',
    input_context: { domains: ['revenue', 'engineering', 'customer_success'] },
    causal_edges_used: 15,
    patterns_used: 7,
    memories_retrieved: 23,
    actions_generated: 3,
    motor_commands_issued: 1,
    predictions_made: 5,
    status: 'success',
    output_summary: 'Detected positive revenue momentum driven by engineering velocity',
    output_artifacts: {
      predictions: [
        { domain: 'revenue', horizon_days: 30, confidence: 0.78 },
        { domain: 'expansion', horizon_days: 60, confidence: 0.65 },
      ],
      insights: [
        'Engineering deployment frequency correlates with revenue growth (p=0.012)',
        'Customer satisfaction (NPS 72) signals expansion opportunity',
      ],
    },
    execution_latency_ms: 3456,
    tokens_consumed: 8500,
    llm_calls_made: 2,
    cost_usd: 0.034,
    started_at: new Date(Date.now() - 3456).toISOString(),
    completed_at: new Date().toISOString(),
  };

  await obs.recordAgentExecution(agentRun);

  console.log(`   ✓ Agent execution completed (${Date.now() - agentStart}ms)`);
  console.log(`   🤖 Agent: revenue_watcher (${agentRun.execution_latency_ms}ms)`);
  console.log(`   🔍 Context: 15 edges, 7 patterns, 23 memories`);
  console.log(`   💰 Cost: $${agentRun.cost_usd} (${agentRun.tokens_consumed} tokens)\n`);

  // ─────────────────────────────────────────────────────────────────────
  // STEP 5: Simulate Feedback Loop (META)
  // ─────────────────────────────────────────────────────────────────────

  console.log('▶️  Step 5: Simulating prediction feedback...');

  const feedbackStart = Date.now();
  const feedback: FeedbackLoopRecord = {
    prediction_type: 'revenue_growth',
    domain: 'revenue',
    predicted_value: 0.20, // Predicted 20% growth
    predicted_outcome: 'growth',
    confidence: 0.78,
    prediction_horizon_days: 30,
    source_agent: 'revenue_watcher',
    // 30 days later...
    actual_value: 0.25, // Actual 25% growth
    actual_outcome: 'strong_growth',
    was_correct: true,
    absolute_error: 0.05,
    squared_error: 0.0025,
    calibration_bucket: '70-80',
    is_calibrated: true, // 78% confidence, was correct
    weight_adjusted: true,
    weight_old: 0.56,
    weight_new: 0.62,
    bayesian_update_applied: true,
    predicted_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    verified_at: new Date().toISOString(),
    feedback_processed_at: new Date().toISOString(),
  };

  await obs.recordFeedbackLoop(feedback);

  console.log(`   ✓ Feedback loop closed (${Date.now() - feedbackStart}ms)`);
  console.log(`   ✅ Prediction correct: predicted 20%, actual 25%`);
  console.log(`   📊 Weight adjusted: 0.56 → 0.62 (Bayesian update)\n`);

  // ─────────────────────────────────────────────────────────────────────
  // STEP 6: Simulate Consolidation Cycle (META)
  // ─────────────────────────────────────────────────────────────────────

  console.log('▶️  Step 6: Simulating consolidation cycle...');

  const consolidationStart = Date.now();
  const consolidation: ConsolidationCycleRecord = {
    consolidation_run_id: `consolidation-${new Date().toISOString().split('T')[0]}-0300`,
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
    narrative: 'Brain learned 3 new causal relationships connecting engineering velocity to revenue growth',
    discoveries: [
      'engineering.deployment_frequency → revenue.mrr (p=0.012, effect=0.56)',
      'customer_success.nps → revenue.expansion (p=0.003, effect=0.68)',
      'product_usage.dau → customer_success.retention (p=0.008, effect=0.45)',
    ],
    warnings: ['Low signal quality in marketing domain (avg=0.62)'],
    status: 'success',
    started_at: new Date(Date.now() - 125000).toISOString(),
    completed_at: new Date().toISOString(),
  };

  await obs.recordConsolidationCycle(consolidation);

  console.log(`   ✓ Consolidation complete (${Date.now() - consolidationStart}ms)`);
  console.log(`   🌙 Brain sleep processed 15,234 signals`);
  console.log(`   🔬 Discovered 3 new relationships, pruned 4 weak edges`);
  console.log(`   💾 Peak memory: 450 MB\n`);

  // ─────────────────────────────────────────────────────────────────────
  // STEP 7: Flush and Show Stats
  // ─────────────────────────────────────────────────────────────────────

  console.log('▶️  Step 7: Flushing batched writes...');

  const flushStart = Date.now();
  await obs.flush();
  const stats = obs.getStats();

  console.log(`   ✓ Flushed to database (${Date.now() - flushStart}ms)`);
  console.log(`   📝 Total writes: ${stats.total_writes}`);
  console.log(`   ⏰ Last flush: ${stats.last_flush}\n`);

  // ─────────────────────────────────────────────────────────────────────
  // STEP 8: Demonstrate Forensic Queries
  // ─────────────────────────────────────────────────────────────────────

  console.log('▶️  Step 8: Running forensic queries...\n');

  // Query signal history
  console.log('   🔍 Signal history for acme-corp:');
  const signalHistory = await obs.getSignalHistory('company', 'acme-corp', 24);
  console.log(`      Found ${signalHistory.length} signals in last 24h`);
  for (const s of signalHistory.slice(0, 3)) {
    console.log(`      - ${s.source_domain}.${s.signal_type} = ${s.signal_value}`);
  }
  console.log('');

  // Query causal history
  console.log('   🔍 Causal calculation history:');
  const causalHistory = await obs.getCausalCalculationHistory('engineering', 'revenue', 168);
  console.log(`      Found ${causalHistory.length} calculations for engineering → revenue`);
  for (const c of causalHistory.slice(0, 2)) {
    console.log(`      - ${c.calculation_type}: p=${c.granger_p_value}, effect=${c.effect_size}`);
  }
  console.log('');

  // Query agent execution history
  console.log('   🔍 Agent execution history:');
  const agentHistory = await obs.getAgentExecutionHistory('revenue_watcher', 24);
  console.log(`      Found ${agentHistory.length} runs in last 24h`);
  for (const a of agentHistory.slice(0, 2)) {
    console.log(`      - ${a.agent_run_id}: ${a.status} (${a.execution_latency_ms}ms)`);
  }
  console.log('');

  // Cost analysis
  console.log('   🔍 Cost analysis (last 24h):');
  const costAnalysis = await obs.getCostAnalysis(24);
  console.log(`      Total cost: $${costAnalysis.total_cost.toFixed(4)}`);
  console.log(`      Semantic operations: $${costAnalysis.semantic_cost.toFixed(4)}`);
  console.log(`      Agent executions: $${costAnalysis.agent_cost.toFixed(4)}`);
  console.log('      By operation:');
  for (const [op, cost] of Object.entries(costAnalysis.by_operation).slice(0, 3)) {
    console.log(`      - ${op}: $${cost.toFixed(4)}`);
  }
  console.log('');

  // Layer health
  console.log('   🔍 Layer health snapshot:');
  await obs.snapshotLayerHealth();
  const allHealth = await obs.getAllLayersHealth();
  console.log(`      Monitoring ${allHealth.length} layers:`);
  for (const health of allHealth) {
    const status = health.is_healthy ? '✓' : '✗';
    console.log(`      ${status} L${health.layer_number} ${health.layer_name}: ${health.health_score}/100 (${health.gaps_count} gaps)`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────

  console.log('\n🎉 Observability Demo Complete!\n');
  console.log('📋 Summary:');
  console.log(`   • Tracked ${signals.length} signal ingestions (L1)`);
  console.log(`   • Tracked ${causalCalculations.length} causal calculations (L4)`);
  console.log(`   • Tracked ${patterns.length} pattern learnings (L5)`);
  console.log(`   • Tracked 1 agent execution (L6)`);
  console.log(`   • Tracked 1 feedback loop (META)`);
  console.log(`   • Tracked 1 consolidation cycle (META)`);
  console.log(`   • Total database writes: ${stats.total_writes}\n`);

  console.log('💡 Next Steps:');
  console.log('   1. Query obs_signal_ingestion for forensic signal analysis');
  console.log('   2. Query obs_causal_calculations for causal discovery history');
  console.log('   3. Query obs_feedback_loops for prediction calibration');
  console.log('   4. Query obs_layer_health for gap detection');
  console.log('   5. Set up automated alerts on health degradation\n');
}

// ============================================================================
// RUN
// ============================================================================

runObservabilityDemo()
  .then(() => {
    console.log('✅ Demo completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Demo failed:', err);
    process.exit(1);
  });
