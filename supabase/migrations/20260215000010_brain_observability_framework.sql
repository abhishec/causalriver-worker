-- ============================================================================
-- NexusBrain Observability Framework — "The Brain's Black Box Recorder"
-- ============================================================================
-- Strategic Purpose:
--   Track EVERY element in EVERY layer with timestamp-precision traceability.
--   Enables forensic analysis, gap detection, performance optimization, and
--   provides the foundation for "replaying" the brain's cognitive history.
--
-- Design Principles:
--   1. Capture everything: signals, calculations, decisions, feedback
--   2. Timestamp everything: nanosecond-level precision where possible
--   3. Link everything: trace from signal → causal edge → prediction → outcome
--   4. Compress intelligently: use partitioning + archival for scale
--   5. Make it queryable: optimized indexes for common forensic queries
--
-- Tables (10):
--   L1: obs_signal_ingestion       — Every signal that enters the brain
--   L2: obs_entity_resolution       — Every entity resolution decision
--   L3: obs_semantic_operations     — Embedding generation, search queries
--   L4: obs_causal_calculations     — Every causal discovery run, Granger test
--   L5: obs_pattern_learning        — Pattern discoveries, rule evaluations
--   L6: obs_agent_executions        — Agent runs, decisions, outcomes
--   L7: obs_connector_operations    — Connector sync operations, errors
--   META: obs_feedback_loops        — Prediction → outcome tracking
--   META: obs_consolidation_cycles  — Nightly brain sleep summaries
--   META: obs_layer_health          — Per-layer health metrics over time
--
-- Partitioning Strategy:
--   - Partition by (organization_id, created_at) for query performance
--   - Monthly partitions for hot data (last 3 months)
--   - Quarterly partitions for warm data (3-12 months)
--   - Annual partitions for cold data (12+ months)
--
-- @migration 20260215000010
-- @author NexusBrain Core Team
-- @date 2026-02-15
-- ============================================================================

-- ============================================================================
-- EXTENSION: timescaledb for time-series optimization (optional but recommended)
-- ============================================================================
-- If TimescaleDB is available, uncomment to enable hypertables
-- CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================================
-- L1: SIGNAL INGESTION OBSERVABILITY
-- Tracks every signal that enters the brain from any connector
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_signal_ingestion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Signal identity
  signal_id UUID REFERENCES cross_domain_signals(id) ON DELETE SET NULL,
  source_domain TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,

  -- Signal content snapshot
  signal_value NUMERIC,
  signal_metadata JSONB DEFAULT '{}',

  -- Enrichment tracking
  nlp_enriched BOOLEAN DEFAULT false,
  nlp_sentiment NUMERIC,
  nlp_topics JSONB,
  knowledge_enriched BOOLEAN DEFAULT false,
  knowledge_entities JSONB,

  -- Performance metrics
  ingestion_latency_ms INTEGER,
  enrichment_latency_ms INTEGER,
  total_latency_ms INTEGER,

  -- Data quality
  quality_score NUMERIC,
  quality_flags JSONB DEFAULT '[]',
  is_quarantined BOOLEAN DEFAULT false,

  -- Timestamps
  ingested_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_signal_org_time
  ON obs_signal_ingestion(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_signal_domain
  ON obs_signal_ingestion(source_domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_signal_entity
  ON obs_signal_ingestion(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_obs_signal_quality
  ON obs_signal_ingestion(quality_score DESC) WHERE quality_score < 0.7;

-- ============================================================================
-- L2: ENTITY RESOLUTION OBSERVABILITY
-- Tracks every entity resolution decision and confidence
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_entity_resolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Resolution input
  input_entity_type TEXT NOT NULL,
  input_entity_id TEXT NOT NULL,
  input_name TEXT,
  input_aliases JSONB DEFAULT '[]',

  -- Resolution output
  resolved_entity_id UUID REFERENCES resolved_entities(id) ON DELETE SET NULL,
  canonical_name TEXT NOT NULL,
  resolution_method TEXT, -- 'exact_match', 'fuzzy_match', 'ml_match', 'manual'
  confidence NUMERIC NOT NULL,

  -- Matching details
  matched_fields JSONB, -- Which fields matched (email, domain, alias, etc.)
  similarity_score NUMERIC,
  alternative_matches JSONB, -- Other candidates considered

  -- Performance
  resolution_latency_ms INTEGER,

  -- Timestamps
  resolved_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_entity_org_time
  ON obs_entity_resolution(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_entity_confidence
  ON obs_entity_resolution(confidence DESC) WHERE confidence < 0.8;

-- ============================================================================
-- L3: SEMANTIC OPERATIONS OBSERVABILITY
-- Tracks embedding generation, semantic search, vector operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_semantic_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Operation type
  operation_type TEXT NOT NULL, -- 'embed', 'search', 'similarity', 'cluster'

  -- Embedding operations
  embedding_id UUID REFERENCES entity_embeddings(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id TEXT,
  content_hash TEXT, -- Hash of content for dedup tracking
  embedding_model TEXT, -- 'openai-small', 'voyage-large', etc.
  embedding_dimensions INTEGER,

  -- Search operations
  search_query TEXT,
  search_results_count INTEGER,
  search_max_distance NUMERIC,
  search_top_k INTEGER,

  -- Cache performance
  cache_hit BOOLEAN DEFAULT false,
  cache_key TEXT,

  -- Performance metrics
  operation_latency_ms INTEGER,
  tokens_consumed INTEGER,
  cost_usd NUMERIC,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_semantic_org_time
  ON obs_semantic_operations(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_semantic_type
  ON obs_semantic_operations(operation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_semantic_cache
  ON obs_semantic_operations(cache_hit, operation_type);

-- ============================================================================
-- L4: CAUSAL CALCULATIONS OBSERVABILITY
-- Tracks every causal discovery run, Granger test, relationship update
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_causal_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Calculation type
  calculation_type TEXT NOT NULL, -- 'granger', 'pc_algorithm', 'var', 'incremental', 'discovery'

  -- Input data
  source_domain TEXT,
  target_domain TEXT,
  time_series_length INTEGER,
  lag_days INTEGER,
  observations_count INTEGER,

  -- Calculation results
  relationship_id UUID REFERENCES causal_relationships_statistical(id) ON DELETE SET NULL,
  granger_f_statistic NUMERIC,
  granger_p_value NUMERIC,
  effect_size NUMERIC,
  is_significant BOOLEAN,
  confidence_interval_lower NUMERIC,
  confidence_interval_upper NUMERIC,

  -- Discovery metadata (for full discovery runs)
  discovery_run_id UUID, -- Links to consolidation_runs or discovery jobs
  method_votes JSONB, -- {'granger': 'yes', 'pc': 'no', 'var': 'yes'}
  bayesian_judgment TEXT, -- 'strong_yes', 'weak_yes', 'uncertain', etc.

  -- Evidence updates
  old_weight NUMERIC,
  new_weight NUMERIC,
  weight_update_reason TEXT,

  -- Performance metrics
  calculation_latency_ms INTEGER,
  memory_mb NUMERIC,

  -- Timestamps
  calculated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_causal_org_time
  ON obs_causal_calculations(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_causal_type
  ON obs_causal_calculations(calculation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_causal_relationship
  ON obs_causal_calculations(source_domain, target_domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_causal_discovery
  ON obs_causal_calculations(discovery_run_id) WHERE discovery_run_id IS NOT NULL;

-- ============================================================================
-- L5: PATTERN LEARNING OBSERVABILITY
-- Tracks pattern discovery, rule generation, rule evaluations
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_pattern_learning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Pattern operation type
  operation_type TEXT NOT NULL, -- 'discover', 'evaluate', 'train', 'validate'

  -- Pattern discovery
  pattern_id UUID REFERENCES brain_grammar_rules(id) ON DELETE SET NULL,
  pattern_type TEXT, -- 'association', 'sequential', 'temporal', 'cascade'
  domain TEXT,

  -- Discovery metrics
  support NUMERIC,
  confidence NUMERIC,
  lift NUMERIC,
  significance_p_value NUMERIC,

  -- Rule evaluation
  rule_evaluated BOOLEAN DEFAULT false,
  condition_expression JSONB,
  input_signals JSONB,
  evaluation_result TEXT, -- 'fired', 'skipped', 'error'
  actions_taken JSONB,

  -- Training
  training_pack_id TEXT,
  training_examples_count INTEGER,
  training_accuracy NUMERIC,

  -- Performance
  operation_latency_ms INTEGER,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_pattern_org_time
  ON obs_pattern_learning(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_pattern_type
  ON obs_pattern_learning(operation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_pattern_rule
  ON obs_pattern_learning(pattern_id) WHERE pattern_id IS NOT NULL;

-- ============================================================================
-- L6: AGENT EXECUTIONS OBSERVABILITY
-- Tracks every agent run with full context and results
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Agent identity
  agent_type TEXT NOT NULL,
  agent_level TEXT, -- 'primary', 'secondary', 'tertiary'
  agent_run_id TEXT NOT NULL,

  -- Execution context
  trigger_type TEXT, -- 'scheduled', 'event', 'manual', 'cascade'
  trigger_event_id TEXT,
  input_context JSONB,

  -- Brain context used
  causal_edges_used INTEGER,
  patterns_used INTEGER,
  memories_retrieved INTEGER,

  -- Agent decisions
  actions_generated INTEGER,
  motor_commands_issued INTEGER,
  predictions_made INTEGER,

  -- Execution results
  status TEXT NOT NULL, -- 'success', 'partial', 'failed'
  output_summary TEXT,
  output_artifacts JSONB,
  error_message TEXT,

  -- Performance metrics
  execution_latency_ms INTEGER,
  tokens_consumed INTEGER,
  llm_calls_made INTEGER,
  cost_usd NUMERIC,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_agent_org_time
  ON obs_agent_executions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_agent_type
  ON obs_agent_executions(agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_agent_run
  ON obs_agent_executions(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_obs_agent_status
  ON obs_agent_executions(status) WHERE status != 'success';

-- ============================================================================
-- L7: CONNECTOR OPERATIONS OBSERVABILITY
-- Tracks connector sync operations, errors, data quality
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_connector_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Connector identity
  connector_type TEXT NOT NULL, -- 'hubspot', 'stripe', 'github', 'slack', etc.
  connector_id TEXT NOT NULL,

  -- Operation details
  operation_type TEXT NOT NULL, -- 'sync', 'fetch', 'push', 'auth', 'healthcheck'
  sync_type TEXT, -- 'full', 'incremental'

  -- Sync results
  records_fetched INTEGER,
  signals_generated INTEGER,
  entities_resolved INTEGER,
  errors_count INTEGER,

  -- Error details
  error_types JSONB, -- {'rate_limit': 3, 'auth_failure': 1}
  error_messages JSONB,

  -- Data quality
  duplicate_records INTEGER,
  invalid_records INTEGER,
  data_quality_score NUMERIC,

  -- Performance metrics
  operation_latency_ms INTEGER,
  api_calls_made INTEGER,
  rate_limit_remaining INTEGER,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_connector_org_time
  ON obs_connector_operations(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_connector_type
  ON obs_connector_operations(connector_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_connector_errors
  ON obs_connector_operations(errors_count DESC) WHERE errors_count > 0;

-- ============================================================================
-- META: FEEDBACK LOOPS OBSERVABILITY
-- Tracks prediction → outcome matching across ALL brain predictions
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_feedback_loops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Prediction identity
  prediction_id UUID REFERENCES prediction_records(id) ON DELETE SET NULL,
  prediction_type TEXT NOT NULL,
  domain TEXT NOT NULL,

  -- Prediction details
  predicted_value NUMERIC,
  predicted_outcome TEXT,
  confidence NUMERIC NOT NULL,
  prediction_horizon_days INTEGER,
  source_rule_id UUID,
  source_agent TEXT,

  -- Outcome details
  actual_value NUMERIC,
  actual_outcome TEXT,
  was_correct BOOLEAN,
  absolute_error NUMERIC,
  squared_error NUMERIC,

  -- Calibration
  calibration_bucket TEXT, -- '0-10', '10-20', ..., '90-100'
  is_calibrated BOOLEAN, -- Was confidence close to actual accuracy?

  -- Learning applied
  weight_adjusted BOOLEAN DEFAULT false,
  weight_old NUMERIC,
  weight_new NUMERIC,
  bayesian_update_applied BOOLEAN DEFAULT false,

  -- Timestamps
  predicted_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  feedback_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_feedback_org_time
  ON obs_feedback_loops(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_feedback_domain
  ON obs_feedback_loops(domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_feedback_accuracy
  ON obs_feedback_loops(was_correct, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_obs_feedback_calibration
  ON obs_feedback_loops(calibration_bucket, was_correct);

-- ============================================================================
-- META: CONSOLIDATION CYCLES OBSERVABILITY
-- Tracks nightly brain sleep consolidation runs with full metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_consolidation_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Consolidation identity
  consolidation_run_id TEXT NOT NULL UNIQUE,
  is_core_brain BOOLEAN NOT NULL,

  -- Cycle configuration
  lookback_hours INTEGER,
  prune_after_days INTEGER,
  min_edge_weight NUMERIC,

  -- Input metrics
  signals_in_window INTEGER,
  domains_active INTEGER,
  existing_edges_count INTEGER,

  -- Discovery results
  causal_edges_discovered INTEGER,
  new_relationships INTEGER,
  lost_relationships INTEGER,
  anomalies_detected INTEGER,
  patterns_found INTEGER,

  -- Learning results
  training_packs_generated INTEGER,
  edges_pruned INTEGER,
  edges_strengthened INTEGER,
  edges_decayed INTEGER,
  memories_created INTEGER,

  -- Performance metrics
  total_duration_ms INTEGER,
  step_durations JSONB, -- {'fetch': 1234, 'discover': 5678, ...}
  memory_peak_mb NUMERIC,

  -- Report summary
  narrative TEXT,
  discoveries JSONB,
  warnings JSONB,
  status TEXT NOT NULL, -- 'success', 'partial', 'failed'

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_consolidation_org_time
  ON obs_consolidation_cycles(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_consolidation_status
  ON obs_consolidation_cycles(status) WHERE status != 'success';

-- ============================================================================
-- META: LAYER HEALTH OBSERVABILITY
-- Tracks per-layer health metrics over time for gap detection
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_layer_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Layer identity
  layer_number INTEGER NOT NULL, -- 1-7
  layer_name TEXT NOT NULL, -- 'ingestion', 'entity', 'semantic', etc.

  -- Health metrics
  health_score NUMERIC NOT NULL, -- 0-100
  is_healthy BOOLEAN NOT NULL,

  -- Layer-specific metrics (JSON for flexibility)
  metrics JSONB NOT NULL,
  -- Examples per layer:
  -- L1: {signals_ingested: 1234, domains_active: 5, avg_quality: 0.85}
  -- L2: {entities_resolved: 567, avg_confidence: 0.82}
  -- L3: {embeddings_generated: 890, cache_hit_rate: 0.65}
  -- L4: {causal_edges: 42, avg_weight: 0.68, significant_edges: 23}
  -- L5: {patterns_active: 12, rules_fired: 234, avg_confidence: 0.71}
  -- L6: {agents_active: 5, runs_success_rate: 0.88}
  -- L7: {connectors_active: 3, sync_success_rate: 0.94}

  -- Gap detection
  gaps_detected JSONB, -- ['no_edges_for_sales', 'entity_resolution_low']
  gaps_count INTEGER DEFAULT 0,

  -- Trends
  health_trend TEXT, -- 'improving', 'stable', 'degrading'
  health_delta NUMERIC, -- Change from previous snapshot

  -- Timestamps
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_layer_org_time
  ON obs_layer_health(organization_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_layer_health
  ON obs_layer_health(layer_number, health_score DESC);
CREATE INDEX IF NOT EXISTS idx_obs_layer_gaps
  ON obs_layer_health(gaps_count DESC) WHERE gaps_count > 0;

-- ============================================================================
-- PERFORMANCE: Composite Indexes for Common Queries
-- ============================================================================

-- Cross-layer forensic analysis: "What happened to entity X at time T?"
CREATE INDEX IF NOT EXISTS idx_obs_entity_forensic
  ON obs_signal_ingestion(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_causal_forensic
  ON obs_causal_calculations(source_domain, target_domain, created_at DESC);

-- Performance analysis: "What are the slowest operations?"
CREATE INDEX IF NOT EXISTS idx_obs_slow_semantic
  ON obs_semantic_operations(operation_latency_ms DESC)
  WHERE operation_latency_ms > 1000;
CREATE INDEX IF NOT EXISTS idx_obs_slow_causal
  ON obs_causal_calculations(calculation_latency_ms DESC)
  WHERE calculation_latency_ms > 5000;

-- Cost analysis: "What's burning our LLM budget?"
CREATE INDEX IF NOT EXISTS idx_obs_cost_semantic
  ON obs_semantic_operations(cost_usd DESC, created_at DESC)
  WHERE cost_usd > 0;
CREATE INDEX IF NOT EXISTS idx_obs_cost_agent
  ON obs_agent_executions(cost_usd DESC, created_at DESC)
  WHERE cost_usd > 0;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE obs_signal_ingestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_entity_resolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_semantic_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_causal_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_pattern_learning ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_connector_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_feedback_loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_consolidation_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_layer_health ENABLE ROW LEVEL SECURITY;

-- Service role can access everything (for edge functions)
CREATE POLICY "service_role_all" ON obs_signal_ingestion FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_entity_resolution FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_semantic_operations FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_causal_calculations FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_pattern_learning FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_agent_executions FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_connector_operations FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_feedback_loops FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_consolidation_cycles FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_layer_health FOR ALL USING (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate layer health score
CREATE OR REPLACE FUNCTION calculate_layer_health_score(
  p_organization_id UUID,
  p_layer_number INTEGER,
  p_lookback_hours INTEGER DEFAULT 24
)
RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC := 50.0; -- Start at neutral
BEGIN
  -- This is a placeholder - implement layer-specific logic
  -- Each layer will have custom health calculation based on its metrics

  -- Example for L4 (Causal):
  IF p_layer_number = 4 THEN
    SELECT CASE
      WHEN COUNT(*) = 0 THEN 0
      WHEN AVG(CASE WHEN is_significant THEN 1 ELSE 0 END) > 0.5 THEN 80
      ELSE 50
    END INTO v_score
    FROM obs_causal_calculations
    WHERE organization_id = p_organization_id
      AND created_at > NOW() - (p_lookback_hours || ' hours')::INTERVAL;
  END IF;

  RETURN COALESCE(v_score, 50.0);
END;
$$ LANGUAGE plpgsql;

-- Function to detect gaps in a layer
CREATE OR REPLACE FUNCTION detect_layer_gaps(
  p_organization_id UUID,
  p_layer_number INTEGER,
  p_lookback_hours INTEGER DEFAULT 24
)
RETURNS JSONB AS $$
DECLARE
  v_gaps JSONB := '[]'::JSONB;
BEGIN
  -- This is a placeholder - implement layer-specific gap detection

  -- Example for L4 (Causal): Check if any domains have no edges
  IF p_layer_number = 4 THEN
    SELECT JSONB_AGG(gap)
    INTO v_gaps
    FROM (
      SELECT JSONB_BUILD_OBJECT(
        'type', 'no_causal_edges',
        'domain', source_domain,
        'severity', 'high'
      ) AS gap
      FROM cross_domain_signals
      WHERE organization_id = p_organization_id
        AND created_at > NOW() - (p_lookback_hours || ' hours')::INTERVAL
      GROUP BY source_domain
      HAVING COUNT(*) > 100 -- Has enough data
        AND source_domain NOT IN (
          SELECT DISTINCT source_domain
          FROM causal_relationships_statistical
          WHERE organization_id = p_organization_id
            AND is_significant = true
        )
      LIMIT 10
    ) gaps;
  END IF;

  RETURN COALESCE(v_gaps, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCHEDULED SNAPSHOTS (to be called by cron/consolidation)
-- ============================================================================

-- Function to snapshot layer health (called every hour)
CREATE OR REPLACE FUNCTION snapshot_layer_health(
  p_organization_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_layer_number INTEGER;
  v_layer_name TEXT;
  v_health_score NUMERIC;
  v_gaps JSONB;
BEGIN
  -- Snapshot health for each layer
  FOR v_layer_number, v_layer_name IN VALUES
    (1, 'ingestion'),
    (2, 'entity'),
    (3, 'semantic'),
    (4, 'causal'),
    (5, 'pattern'),
    (6, 'agent'),
    (7, 'connector')
  LOOP
    -- Calculate health score
    v_health_score := calculate_layer_health_score(p_organization_id, v_layer_number);

    -- Detect gaps
    v_gaps := detect_layer_gaps(p_organization_id, v_layer_number);

    -- Insert snapshot
    INSERT INTO obs_layer_health (
      organization_id,
      layer_number,
      layer_name,
      health_score,
      is_healthy,
      metrics,
      gaps_detected,
      gaps_count,
      snapshot_at
    ) VALUES (
      p_organization_id,
      v_layer_number,
      v_layer_name,
      v_health_score,
      v_health_score >= 70.0,
      '{}'::JSONB, -- To be filled by layer-specific logic
      v_gaps,
      JSONB_ARRAY_LENGTH(v_gaps),
      NOW()
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE obs_signal_ingestion IS 'L1: Tracks every signal entering the brain with quality metrics and performance';
COMMENT ON TABLE obs_entity_resolution IS 'L2: Tracks every entity resolution decision with confidence and matching details';
COMMENT ON TABLE obs_semantic_operations IS 'L3: Tracks embedding generation, semantic search, and vector operations';
COMMENT ON TABLE obs_causal_calculations IS 'L4: Tracks every causal discovery run and relationship calculation';
COMMENT ON TABLE obs_pattern_learning IS 'L5: Tracks pattern discovery, rule evaluations, and training';
COMMENT ON TABLE obs_agent_executions IS 'L6: Tracks agent runs with full context, decisions, and outcomes';
COMMENT ON TABLE obs_connector_operations IS 'L7: Tracks connector sync operations, errors, and data quality';
COMMENT ON TABLE obs_feedback_loops IS 'META: Tracks prediction → outcome matching for calibration';
COMMENT ON TABLE obs_consolidation_cycles IS 'META: Tracks nightly consolidation runs with full metrics';
COMMENT ON TABLE obs_layer_health IS 'META: Tracks per-layer health scores and gap detection over time';

-- ============================================================================
-- COGNITIVE LAYERS (L8-L15): ADVANCED MIND OPERATIONS
-- ============================================================================
-- Extend observability to cover all 15+ cognitive layers including:
-- L8: Deep Dreaming (Subconscious Processing)
-- L9: Hierarchical Memory (Working/Episodic/Semantic)
-- L10: Curiosity Engine (Active Learning)
-- L11: Self-Modifying Cognition (Metacognition)
-- L12: Intelligence Mesh (Collective Intelligence)
-- L13: Causal Imagination (Creativity)
-- L14: Theory of Mind (Empathy)
-- L15: Temporal Consciousness (Time Sense)
-- ============================================================================

-- ============================================================================
-- L8: DEEP DREAMING OBSERVABILITY
-- Tracks subconscious pattern replay and association discovery
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_deep_dreaming (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Dream cycle identity
  cycle_id TEXT NOT NULL,
  cycle_type TEXT, -- 'replay', 'association', 'consolidation'

  -- Dream content
  signals_replayed INTEGER,
  patterns_discovered INTEGER,
  associations_formed INTEGER,
  weak_associations_pruned INTEGER,

  -- Dream quality
  coherence_score NUMERIC, -- How coherent were the associations
  novelty_score NUMERIC, -- How novel were the discoveries

  -- Performance
  dream_duration_ms INTEGER,
  memory_peak_mb NUMERIC,

  -- Timestamps
  dream_started_at TIMESTAMPTZ NOT NULL,
  dream_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_dreaming_org_time
  ON obs_deep_dreaming(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_dreaming_cycle
  ON obs_deep_dreaming(cycle_id);

-- ============================================================================
-- L9: HIERARCHICAL MEMORY OBSERVABILITY
-- Tracks working memory, episodic memory, and semantic memory operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_hierarchical_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Memory operation type
  operation_type TEXT NOT NULL, -- 'store_working', 'consolidate_episodic', 'extract_semantic'
  memory_layer TEXT NOT NULL, -- 'working', 'episodic', 'semantic'

  -- Working memory
  working_items_count INTEGER,
  working_capacity_used NUMERIC, -- 0-1

  -- Episodic memory
  episodes_created INTEGER,
  episodes_recalled INTEGER,
  episode_compression_ratio NUMERIC,

  -- Semantic memory
  facts_extracted INTEGER,
  facts_stored INTEGER,
  facts_updated INTEGER,

  -- Consolidation metrics
  consolidation_efficiency NUMERIC, -- 0-1
  information_preserved NUMERIC, -- 0-1

  -- Performance
  operation_latency_ms INTEGER,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_memory_org_time
  ON obs_hierarchical_memory(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_memory_type
  ON obs_hierarchical_memory(operation_type, memory_layer);

-- ============================================================================
-- L10: CURIOSITY ENGINE OBSERVABILITY
-- Tracks active learning, hypothesis generation, and knowledge gap detection
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_curiosity_engine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Curiosity operation
  operation_type TEXT NOT NULL, -- 'detect_gap', 'generate_hypothesis', 'design_experiment', 'evaluate_result'

  -- Knowledge gaps
  gaps_detected INTEGER,
  gap_severity JSONB, -- {'high': 3, 'medium': 5, 'low': 12}

  -- Hypotheses
  hypotheses_generated INTEGER,
  hypotheses_tested INTEGER,
  hypotheses_confirmed INTEGER,
  hypotheses_rejected INTEGER,

  -- Experiments
  experiments_designed INTEGER,
  experiments_executed INTEGER,

  -- Learning outcomes
  new_knowledge_acquired BOOLEAN,
  knowledge_gap_filled BOOLEAN,

  -- Performance
  operation_latency_ms INTEGER,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_curiosity_org_time
  ON obs_curiosity_engine(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_curiosity_type
  ON obs_curiosity_engine(operation_type);

-- ============================================================================
-- L11: SELF-MODIFYING COGNITION OBSERVABILITY
-- Tracks metacognition, self-assessment, and adaptive strategy changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_self_modifying_cognition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Self-modification operation
  operation_type TEXT NOT NULL, -- 'assess_performance', 'identify_blind_spot', 'adjust_strategy', 'update_belief'

  -- Self-assessment
  performance_assessment JSONB, -- Domain-wise performance scores
  blind_spots_identified INTEGER,
  calibration_drift NUMERIC, -- How far off is self-assessment from reality

  -- Strategy modifications
  strategies_adjusted INTEGER,
  strategy_change_type TEXT, -- 'parameter_tune', 'algorithm_swap', 'resource_reallocation'

  -- Belief updates
  beliefs_updated INTEGER,
  belief_revision_magnitude NUMERIC, -- How big was the belief change

  -- Meta-learning
  learning_velocity NUMERIC, -- How fast is the brain improving
  self_awareness_score NUMERIC, -- 0-1

  -- Performance
  operation_latency_ms INTEGER,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_metacog_org_time
  ON obs_self_modifying_cognition(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_metacog_type
  ON obs_self_modifying_cognition(operation_type);

-- ============================================================================
-- L12: INTELLIGENCE MESH OBSERVABILITY
-- Tracks cross-org learning and collective intelligence operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_intelligence_mesh (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Mesh operation
  operation_type TEXT NOT NULL, -- 'contribute', 'consume', 'validate', 'conflict_resolve'

  -- Contribution to collective
  patterns_contributed INTEGER,
  knowledge_shared BOOLEAN,
  trust_score NUMERIC, -- 0-1, this org's trustworthiness

  -- Consumption from collective
  patterns_adopted INTEGER,
  knowledge_received BOOLEAN,
  validation_status TEXT, -- 'validated', 'rejected', 'pending'

  -- Collective sensing
  collective_pattern_id TEXT,
  collective_confidence NUMERIC,
  participating_orgs_count INTEGER,

  -- Conflict resolution
  conflicts_detected INTEGER,
  conflicts_resolved INTEGER,

  -- Performance
  operation_latency_ms INTEGER,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_mesh_org_time
  ON obs_intelligence_mesh(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_mesh_type
  ON obs_intelligence_mesh(operation_type);

-- ============================================================================
-- L13: CAUSAL IMAGINATION OBSERVABILITY
-- Tracks creative scenario generation and novel hypothesis synthesis
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_causal_imagination (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Imagination operation
  operation_type TEXT NOT NULL, -- 'generate_scenario', 'synthesize_hypothesis', 'simulate_intervention'

  -- Scenario generation
  scenarios_generated INTEGER,
  scenario_novelty_score NUMERIC, -- 0-1, how novel vs derivative
  scenario_plausibility_score NUMERIC, -- 0-1, how plausible

  -- Hypothesis synthesis
  hypotheses_synthesized INTEGER,
  synthesis_method TEXT, -- 'analogy', 'combination', 'extrapolation'

  -- Counterfactual simulation
  interventions_simulated INTEGER,
  simulation_horizon_days INTEGER,
  simulation_confidence NUMERIC,

  -- Creativity metrics
  creativity_score NUMERIC, -- 0-1
  analogies_drawn INTEGER,

  -- Performance
  operation_latency_ms INTEGER,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_imagination_org_time
  ON obs_causal_imagination(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_imagination_type
  ON obs_causal_imagination(operation_type);

-- ============================================================================
-- L14: THEORY OF MIND OBSERVABILITY
-- Tracks user modeling, intent prediction, and empathetic responses
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_theory_of_mind (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Theory of mind operation
  operation_type TEXT NOT NULL, -- 'model_user', 'predict_intent', 'adapt_response', 'perspective_take'

  -- User modeling
  user_id TEXT,
  user_model_updated BOOLEAN,
  cognitive_state_inferred JSONB, -- {'goal': 'X', 'emotion': 'Y', 'knowledge_level': Z}

  -- Intent prediction
  intent_predicted TEXT,
  intent_confidence NUMERIC,
  intent_actual TEXT, -- After verification
  intent_prediction_correct BOOLEAN,

  -- Response adaptation
  response_adapted BOOLEAN,
  adaptation_type TEXT, -- 'tone', 'detail_level', 'explanation_style'

  -- Perspective taking
  perspectives_considered INTEGER,
  empathy_score NUMERIC, -- 0-1

  -- Performance
  operation_latency_ms INTEGER,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_tom_org_time
  ON obs_theory_of_mind(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_tom_user
  ON obs_theory_of_mind(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obs_tom_type
  ON obs_theory_of_mind(operation_type);

-- ============================================================================
-- L15: TEMPORAL CONSCIOUSNESS OBSERVABILITY
-- Tracks time perception, rhythm detection, and temporal goal management
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_temporal_consciousness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,

  -- Temporal operation
  operation_type TEXT NOT NULL, -- 'detect_rhythm', 'set_goal', 'track_progress', 'adjust_timeline'

  -- Rhythm detection
  rhythms_detected INTEGER,
  rhythm_type TEXT, -- 'daily', 'weekly', 'monthly', 'quarterly'
  rhythm_strength NUMERIC, -- 0-1

  -- Temporal goals
  goals_set INTEGER,
  goals_on_track INTEGER,
  goals_behind_schedule INTEGER,
  goals_completed INTEGER,

  -- Timeline management
  timeline_adjusted BOOLEAN,
  timeline_adjustment_reason TEXT,

  -- Temporal awareness
  time_perception_accuracy NUMERIC, -- 0-1
  temporal_horizon_days INTEGER,

  -- Performance
  operation_latency_ms INTEGER,

  -- Timestamps
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_temporal_org_time
  ON obs_temporal_consciousness(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_temporal_type
  ON obs_temporal_consciousness(operation_type);

-- ============================================================================
-- ROW LEVEL SECURITY FOR COGNITIVE LAYERS
-- ============================================================================
ALTER TABLE obs_deep_dreaming ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_hierarchical_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_curiosity_engine ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_self_modifying_cognition ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_intelligence_mesh ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_causal_imagination ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_theory_of_mind ENABLE ROW LEVEL SECURITY;
ALTER TABLE obs_temporal_consciousness ENABLE ROW LEVEL SECURITY;

-- Service role can access everything
CREATE POLICY "service_role_all" ON obs_deep_dreaming FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_hierarchical_memory FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_curiosity_engine FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_self_modifying_cognition FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_intelligence_mesh FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_causal_imagination FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_theory_of_mind FOR ALL USING (true);
CREATE POLICY "service_role_all" ON obs_temporal_consciousness FOR ALL USING (true);

-- ============================================================================
-- DOCUMENTATION FOR COGNITIVE LAYERS
-- ============================================================================
COMMENT ON TABLE obs_deep_dreaming IS 'L8: Tracks subconscious pattern replay and association discovery';
COMMENT ON TABLE obs_hierarchical_memory IS 'L9: Tracks working/episodic/semantic memory operations';
COMMENT ON TABLE obs_curiosity_engine IS 'L10: Tracks active learning and knowledge gap detection';
COMMENT ON TABLE obs_self_modifying_cognition IS 'L11: Tracks metacognition and adaptive strategy changes';
COMMENT ON TABLE obs_intelligence_mesh IS 'L12: Tracks cross-org learning and collective intelligence';
COMMENT ON TABLE obs_causal_imagination IS 'L13: Tracks creative scenario generation and novel hypotheses';
COMMENT ON TABLE obs_theory_of_mind IS 'L14: Tracks user modeling and empathetic responses';
COMMENT ON TABLE obs_temporal_consciousness IS 'L15: Tracks time perception and temporal goal management';
