-- =============================================================================
-- NexusBrain Core Schema Migration
--
-- Creates all tables required by the 7-layer organizational memory system:
--   L1 Ingestion  → cross_domain_signals, signal_thresholds
--   L2 Entity     → resolved_entities
--   L3 Semantic   → entity_embeddings, ai_memory
--   L4 Causal     → causal_event_stream, causal_relationships_statistical,
--                    prediction_records, scheduled_verifications, weight_update_history,
--                    threshold_optimization_history
--   L5 Pattern    → brain_grammar_rules, ai_causal_chains, pattern_feedback_log,
--                    brain_execution_log, cascade rules
--   L6 Agents     → agent_registry, agent_queue, ai_agent_activity
--   L7 Connectors → connector_sync_log
--
-- Prerequisites: pgvector extension enabled, organizations table exists
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgvector" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- L1: SIGNAL INGESTION
-- =============================================================================

-- Cross-domain signals collected from all sources
CREATE TABLE IF NOT EXISTS cross_domain_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  source_domain TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value NUMERIC NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'unknown',
  entity_id TEXT NOT NULL,
  client_id TEXT,
  feature_vector JSONB DEFAULT '{}',
  signal_metadata JSONB DEFAULT '{}',
  lookback_window_days INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_org_domain
  ON cross_domain_signals (organization_id, source_domain);
CREATE INDEX IF NOT EXISTS idx_signals_entity
  ON cross_domain_signals (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_signals_client
  ON cross_domain_signals (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_created
  ON cross_domain_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_type
  ON cross_domain_signals (signal_type);

-- Signal threshold configuration per org/domain
CREATE TABLE IF NOT EXISTS signal_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  domain TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  threshold_value NUMERIC NOT NULL,
  direction TEXT NOT NULL DEFAULT 'above', -- 'above' or 'below'
  confidence NUMERIC DEFAULT 0.5,
  last_optimized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, domain, signal_type)
);

-- Threshold optimization history
CREATE TABLE IF NOT EXISTS threshold_optimization_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  domain TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  old_threshold NUMERIC,
  new_threshold NUMERIC,
  optimization_method TEXT,
  improvement_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- L2: ENTITY RESOLUTION
-- =============================================================================

-- Resolved entities from multi-source identity resolution
CREATE TABLE IF NOT EXISTS resolved_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  canonical_name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'company',
  external_ids JSONB DEFAULT '{}',
  email_domains JSONB DEFAULT '[]',
  aliases JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  confidence NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resolved_org
  ON resolved_entities (organization_id);
CREATE INDEX IF NOT EXISTS idx_resolved_name
  ON resolved_entities (organization_id, canonical_name);
CREATE INDEX IF NOT EXISTS idx_resolved_type
  ON resolved_entities (entity_type);

-- =============================================================================
-- L3: SEMANTIC MEMORY
-- =============================================================================

-- Entity embeddings for vector similarity search
CREATE TABLE IF NOT EXISTS entity_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding extensions.vector(1536),
  metadata JSONB DEFAULT '{}',
  importance_score NUMERIC DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_org_entity
  ON entity_embeddings (organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON entity_embeddings USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- AI memory entries (long-term organizational knowledge)
CREATE TABLE IF NOT EXISTS ai_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  domain TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'observation',
  content TEXT NOT NULL,
  importance NUMERIC DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_org_domain
  ON ai_memory (organization_id, domain);
CREATE INDEX IF NOT EXISTS idx_memory_importance
  ON ai_memory (importance DESC);

-- =============================================================================
-- L4: CAUSAL GRAPH ENGINE
-- =============================================================================

-- Real-time causal event stream (the spine of the system)
CREATE TABLE IF NOT EXISTS causal_event_stream (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  domain TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  client_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  vector_clock INTEGER NOT NULL,
  priority INTEGER DEFAULT 5,
  processing_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_org_type
  ON causal_event_stream (organization_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_domain
  ON causal_event_stream (domain);
CREATE INDEX IF NOT EXISTS idx_events_entity
  ON causal_event_stream (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_events_status
  ON causal_event_stream (processing_status)
  WHERE processing_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_events_created
  ON causal_event_stream (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_priority
  ON causal_event_stream (priority, created_at);

-- Statistical causal relationships discovered by Granger analysis
CREATE TABLE IF NOT EXISTS causal_relationships_statistical (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  source_domain TEXT NOT NULL,
  target_domain TEXT NOT NULL,
  granger_f_statistic NUMERIC,
  granger_p_value NUMERIC,
  optimal_lag_days INTEGER DEFAULT 7,
  effect_size NUMERIC,
  sample_size INTEGER,
  confidence_interval_lower NUMERIC,
  confidence_interval_upper NUMERIC,
  is_significant BOOLEAN DEFAULT false,
  natural_language TEXT,
  evidence_weight NUMERIC DEFAULT 1.0,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, source_domain, target_domain)
);

CREATE INDEX IF NOT EXISTS idx_causal_org
  ON causal_relationships_statistical (organization_id);
CREATE INDEX IF NOT EXISTS idx_causal_significant
  ON causal_relationships_statistical (organization_id, is_significant)
  WHERE is_significant = true;

-- Prediction records for tracking forecast accuracy
CREATE TABLE IF NOT EXISTS prediction_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  domain TEXT NOT NULL,
  prediction_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  predicted_value NUMERIC,
  predicted_outcome TEXT,
  confidence NUMERIC DEFAULT 0.5,
  actual_value NUMERIC,
  actual_outcome TEXT,
  was_correct BOOLEAN,
  verified_at TIMESTAMPTZ,
  source_rule_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_org
  ON prediction_records (organization_id, domain);
CREATE INDEX IF NOT EXISTS idx_predictions_entity
  ON prediction_records (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_predictions_unverified
  ON prediction_records (organization_id)
  WHERE verified_at IS NULL;

-- Scheduled verifications for prediction follow-up
CREATE TABLE IF NOT EXISTS scheduled_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  prediction_id UUID NOT NULL REFERENCES prediction_records(id),
  verification_type TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  result JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verifications_pending
  ON scheduled_verifications (scheduled_for)
  WHERE status = 'pending';

-- Weight update history for causal relationship strength tracking
CREATE TABLE IF NOT EXISTS weight_update_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  relationship_id UUID REFERENCES causal_relationships_statistical(id),
  old_weight NUMERIC,
  new_weight NUMERIC,
  update_reason TEXT,
  prediction_accuracy NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Outcome observation windows for tracking intervention effectiveness
CREATE TABLE IF NOT EXISTS outcome_observation_windows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  observation_type TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  baseline_value NUMERIC,
  current_value NUMERIC,
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observation_active
  ON outcome_observation_windows (organization_id, status)
  WHERE status = 'active';

-- =============================================================================
-- L5: PATTERN MEMORY
-- =============================================================================

-- Brain grammar rules (learned business logic patterns)
CREATE TABLE IF NOT EXISTS brain_grammar_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  domain TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  condition_expression JSONB NOT NULL,
  action_expression JSONB NOT NULL,
  confidence NUMERIC DEFAULT 0.5,
  support NUMERIC DEFAULT 0,
  lift NUMERIC DEFAULT 1.0,
  natural_language TEXT,
  is_active BOOLEAN DEFAULT true,
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rules_org_domain
  ON brain_grammar_rules (organization_id, domain);
CREATE INDEX IF NOT EXISTS idx_rules_active
  ON brain_grammar_rules (organization_id, is_active)
  WHERE is_active = true;

-- AI causal chains (multi-hop causal reasoning chains)
CREATE TABLE IF NOT EXISTS ai_causal_chains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  chain_type TEXT NOT NULL,
  domains JSONB NOT NULL DEFAULT '[]',
  hops JSONB NOT NULL DEFAULT '[]',
  total_effect_size NUMERIC,
  confidence NUMERIC DEFAULT 0.5,
  natural_language TEXT,
  is_validated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chains_org
  ON ai_causal_chains (organization_id);

-- Pattern feedback log (human corrections to learned patterns)
CREATE TABLE IF NOT EXISTS pattern_feedback_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  pattern_type TEXT NOT NULL, -- 'rule', 'chain', 'memory'
  pattern_id UUID NOT NULL,
  feedback_type TEXT NOT NULL, -- 'confirm', 'reject', 'modify'
  feedback_value JSONB DEFAULT '{}',
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_pattern
  ON pattern_feedback_log (pattern_type, pattern_id);

-- Brain execution log (audit trail of rule evaluations)
CREATE TABLE IF NOT EXISTS brain_execution_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  rule_id UUID REFERENCES brain_grammar_rules(id),
  rule_type TEXT,
  input_signals JSONB DEFAULT '{}',
  output_actions JSONB DEFAULT '{}',
  execution_result TEXT, -- 'fired', 'skipped', 'error'
  confidence_at_execution NUMERIC,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_org
  ON brain_execution_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_rule
  ON brain_execution_log (rule_id);

-- Causal chain outcomes (tracking cascade rule results)
CREATE TABLE IF NOT EXISTS causal_chain_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  chain_id UUID REFERENCES ai_causal_chains(id),
  trigger_signal_id UUID,
  predicted_outcome JSONB,
  actual_outcome JSONB,
  was_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI domain relationships (legacy format, used by cascade detection hook)
CREATE TABLE IF NOT EXISTS ai_domain_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  source_domain TEXT NOT NULL,
  target_domain TEXT NOT NULL,
  relationship_type TEXT DEFAULT 'causal',
  strength NUMERIC DEFAULT 0.5,
  lag_days INTEGER DEFAULT 7,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, source_domain, target_domain)
);

-- Cascade rules (organization-level and platform-level)
CREATE TABLE IF NOT EXISTS org_cascade_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  rule_name TEXT NOT NULL,
  trigger_domain TEXT NOT NULL,
  trigger_signal_type TEXT NOT NULL,
  trigger_threshold NUMERIC NOT NULL,
  propagation_chain JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_cascade_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_name TEXT NOT NULL,
  trigger_domain TEXT NOT NULL,
  trigger_signal_type TEXT NOT NULL,
  trigger_threshold NUMERIC NOT NULL,
  propagation_chain JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- L6: DOMAIN AGENTS
-- =============================================================================

-- Agent registry (which agents are available per org)
CREATE TABLE IF NOT EXISTS agent_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, agent_type)
);

-- Agent task queue
CREATE TABLE IF NOT EXISTS agent_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  task_type TEXT NOT NULL,
  priority INTEGER DEFAULT 5,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  result JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_pending
  ON agent_queue (organization_id, agent_type, status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_queue_priority
  ON agent_queue (priority, created_at)
  WHERE status = 'pending';

-- AI agent activity log
CREATE TABLE IF NOT EXISTS ai_agent_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  run_id TEXT,
  action_type TEXT NOT NULL,
  input_summary TEXT,
  output_summary TEXT,
  tokens_used INTEGER DEFAULT 0,
  duration_ms INTEGER,
  status TEXT DEFAULT 'success',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_org_agent
  ON ai_agent_activity (organization_id, agent_type, created_at DESC);

-- =============================================================================
-- L7: CONNECTOR SYNC
-- =============================================================================

-- Connector sync log (tracks connector health and sync history)
CREATE TABLE IF NOT EXISTS connector_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  connector_id TEXT NOT NULL,
  sync_type TEXT NOT NULL DEFAULT 'full', -- 'full' or 'incremental'
  status TEXT NOT NULL DEFAULT 'running',
  signals_generated INTEGER DEFAULT 0,
  records_processed INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_org_connector
  ON connector_sync_log (organization_id, connector_id, started_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE cross_domain_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolved_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE causal_event_stream ENABLE ROW LEVEL SECURITY;
ALTER TABLE causal_relationships_statistical ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_grammar_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_causal_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_feedback_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_sync_log ENABLE ROW LEVEL SECURITY;

-- Service role can access everything (for edge functions and server-side operations)
-- Individual user policies should be added per-deployment based on auth strategy
CREATE POLICY "service_role_all" ON cross_domain_signals FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON signal_thresholds FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON resolved_entities FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON entity_embeddings FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON ai_memory FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON causal_event_stream FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON causal_relationships_statistical FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON prediction_records FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON scheduled_verifications FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON brain_grammar_rules FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON ai_causal_chains FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON pattern_feedback_log FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON brain_execution_log FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON agent_registry FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON agent_queue FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON ai_agent_activity FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON connector_sync_log FOR ALL
  USING (auth.role() = 'service_role');
