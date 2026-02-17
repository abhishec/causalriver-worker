-- ============================================================================
-- Create Remaining Missing Tables (P0 Production Fix)
-- ============================================================================
-- Found during deep validation of brain cycle code paths.
-- These tables are referenced in:
--   - brain-observability.ts (obs writes)
--   - brain-observability-bridge.ts (LAYER_OBS_TABLE mapping)
--   - brain-evolution-engine.ts (cascade rules check)
--   - domain-executor.ts (cascade rules query)
--
-- @migration 20260222000003
-- @date 2026-02-22
-- ============================================================================

-- ============================================================================
-- brain_cascade_rules — Referenced by brain-evolution-engine.ts and domain-executor.ts
-- This is the brain-specific cascade rules table (separate from org_cascade_rules)
-- ============================================================================
CREATE TABLE IF NOT EXISTS brain_cascade_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  source_domain TEXT NOT NULL,
  target_domain TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'causal',
  effect_size NUMERIC,
  lag_days INTEGER,
  confidence NUMERIC,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_cascade_rules_org
  ON brain_cascade_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_brain_cascade_rules_domains
  ON brain_cascade_rules(source_domain, target_domain);

ALTER TABLE brain_cascade_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_brain_cascade_rules" ON brain_cascade_rules
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- obs_self_modifying_cognition — L6/L27: Metacognition tracking
-- Referenced by brain-observability.ts and brain-observability-bridge.ts
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_self_modifying_cognition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  operation_type TEXT NOT NULL,
  performance_assessment JSONB,
  blind_spots_identified INTEGER,
  calibration_drift NUMERIC,
  strategies_adjusted INTEGER,
  strategy_change_type TEXT,
  beliefs_updated INTEGER,
  belief_revision_magnitude NUMERIC,
  learning_velocity NUMERIC,
  self_awareness_score NUMERIC,
  operation_latency_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_selfmod_org_time
  ON obs_self_modifying_cognition(organization_id, created_at DESC);

ALTER TABLE obs_self_modifying_cognition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_obs_self_modifying" ON obs_self_modifying_cognition
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- obs_causal_imagination — L8: Counterfactual reasoning tracking
-- Referenced by brain-observability.ts and brain-observability-bridge.ts
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_causal_imagination (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  scenario_type TEXT NOT NULL,
  counterfactuals_generated INTEGER,
  interventions_simulated INTEGER,
  outcomes_predicted INTEGER,
  prediction_confidence NUMERIC,
  imagination_depth INTEGER,
  operation_latency_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_imagination_org_time
  ON obs_causal_imagination(organization_id, created_at DESC);

ALTER TABLE obs_causal_imagination ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_obs_causal_imagination" ON obs_causal_imagination
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- obs_theory_of_mind — L9: Perspective-taking tracking
-- Referenced by brain-observability.ts and brain-observability-bridge.ts
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_theory_of_mind (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  perspective_type TEXT NOT NULL,
  stakeholders_modeled INTEGER,
  belief_states_inferred INTEGER,
  empathy_score NUMERIC,
  perspective_accuracy NUMERIC,
  conflict_points_detected INTEGER,
  operation_latency_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_tom_org_time
  ON obs_theory_of_mind(organization_id, created_at DESC);

ALTER TABLE obs_theory_of_mind ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_obs_theory_of_mind" ON obs_theory_of_mind
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- obs_temporal_consciousness — L10/L24: Time-awareness tracking
-- Referenced by brain-observability.ts and brain-observability-bridge.ts
-- ============================================================================
CREATE TABLE IF NOT EXISTS obs_temporal_consciousness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  temporal_operation TEXT NOT NULL,
  time_horizons_modeled INTEGER,
  temporal_patterns_detected INTEGER,
  prediction_windows JSONB,
  temporal_coherence NUMERIC,
  future_states_simulated INTEGER,
  operation_latency_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obs_temporal_org_time
  ON obs_temporal_consciousness(organization_id, created_at DESC);

ALTER TABLE obs_temporal_consciousness ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_obs_temporal" ON obs_temporal_consciousness
  FOR ALL USING (auth.role() = 'service_role');
