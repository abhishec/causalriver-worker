-- ============================================================================
-- Create 4 Missing Observability Tables
-- ============================================================================
-- These tables were defined in 20260215000010_brain_observability_framework.sql
-- but were NOT created in the remote DB (migration partially applied or the
-- tables were appended after the migration had already been applied).
--
-- Missing tables:
--   obs_deep_dreaming       — L8: Subconscious pattern replay
--   obs_hierarchical_memory — L9: Working/episodic/semantic memory ops
--   obs_curiosity_engine    — L10: Active learning, hypothesis generation
--   obs_intelligence_mesh   — L12: Cross-org learning, collective intelligence
--
-- @migration 20260222000002
-- @date 2026-02-22
-- ============================================================================

-- ============================================================================
-- L8: DEEP DREAMING OBSERVABILITY
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_deep_dreaming (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  cycle_id TEXT NOT NULL,
  cycle_type TEXT,
  signals_replayed INTEGER,
  patterns_discovered INTEGER,
  associations_formed INTEGER,
  weak_associations_pruned INTEGER,
  coherence_score NUMERIC,
  novelty_score NUMERIC,
  dream_duration_ms INTEGER,
  memory_peak_mb NUMERIC,
  dream_started_at TIMESTAMPTZ NOT NULL,
  dream_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_dreaming_org_time
  ON obs_deep_dreaming(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_dreaming_cycle
  ON obs_deep_dreaming(cycle_id);

ALTER TABLE obs_deep_dreaming ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_obs_deep_dreaming" ON obs_deep_dreaming
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- L9: HIERARCHICAL MEMORY OBSERVABILITY
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_hierarchical_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  operation_type TEXT NOT NULL,
  memory_layer TEXT NOT NULL,
  working_items_count INTEGER,
  working_capacity_used NUMERIC,
  episodes_created INTEGER,
  episodes_recalled INTEGER,
  episode_compression_ratio NUMERIC,
  facts_extracted INTEGER,
  facts_stored INTEGER,
  facts_updated INTEGER,
  consolidation_efficiency NUMERIC,
  information_preserved NUMERIC,
  operation_latency_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_memory_org_time
  ON obs_hierarchical_memory(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_memory_type
  ON obs_hierarchical_memory(operation_type, memory_layer);

ALTER TABLE obs_hierarchical_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_obs_hierarchical_memory" ON obs_hierarchical_memory
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- L10: CURIOSITY ENGINE OBSERVABILITY
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_curiosity_engine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  operation_type TEXT NOT NULL,
  gaps_detected INTEGER,
  gap_severity JSONB,
  hypotheses_generated INTEGER,
  hypotheses_tested INTEGER,
  hypotheses_confirmed INTEGER,
  hypotheses_rejected INTEGER,
  experiments_designed INTEGER,
  experiments_executed INTEGER,
  new_knowledge_acquired BOOLEAN,
  knowledge_gap_filled BOOLEAN,
  operation_latency_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_curiosity_org_time
  ON obs_curiosity_engine(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_curiosity_type
  ON obs_curiosity_engine(operation_type);

ALTER TABLE obs_curiosity_engine ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_obs_curiosity_engine" ON obs_curiosity_engine
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- L12: INTELLIGENCE MESH OBSERVABILITY
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_intelligence_mesh (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  operation_type TEXT NOT NULL,
  patterns_contributed INTEGER,
  knowledge_shared BOOLEAN,
  trust_score NUMERIC,
  patterns_adopted INTEGER,
  knowledge_received BOOLEAN,
  validation_status TEXT,
  collective_pattern_id TEXT,
  collective_confidence NUMERIC,
  participating_orgs_count INTEGER,
  conflicts_detected INTEGER,
  conflicts_resolved INTEGER,
  operation_latency_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_mesh_org_time
  ON obs_intelligence_mesh(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_mesh_type
  ON obs_intelligence_mesh(operation_type);

ALTER TABLE obs_intelligence_mesh ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_obs_intelligence_mesh" ON obs_intelligence_mesh
  FOR ALL USING (auth.role() = 'service_role');
