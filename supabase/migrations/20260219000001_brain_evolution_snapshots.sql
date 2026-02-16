-- Brain Evolution Snapshots — Track the Brain getting smarter over time
-- =====================================================================
-- THE MISSING TABLE: This enables users to SEE the Brain's intelligence
-- score improving day over day. Nobody has ever built this.

-- Daily intelligence snapshots
CREATE TABLE IF NOT EXISTS brain_evolution_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  intelligence_score NUMERIC NOT NULL DEFAULT 0,
  accuracy NUMERIC DEFAULT 0,
  brier_score NUMERIC DEFAULT 0.25,
  total_edges INTEGER DEFAULT 0,
  total_evidence INTEGER DEFAULT 0,
  total_patterns INTEGER DEFAULT 0,
  total_predictions INTEGER DEFAULT 0,
  learning_velocity_score NUMERIC DEFAULT 0,
  calibration_quality TEXT DEFAULT 'uncalibrated',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, snapshot_date)
);

-- Intervention tracking — did the Brain's advice actually work?
CREATE TABLE IF NOT EXISTS brain_intervention_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  intervention_type TEXT NOT NULL,
  description TEXT,
  suggested_by TEXT NOT NULL,       -- Which Brain layer suggested this
  suggested_at TIMESTAMPTZ DEFAULT NOW(),
  target_metric TEXT NOT NULL,
  baseline_value NUMERIC,
  target_value NUMERIC,
  actual_value NUMERIC,
  acted_on BOOLEAN DEFAULT false,
  acted_at TIMESTAMPTZ,
  outcome_observed BOOLEAN DEFAULT false,
  outcome_observed_at TIMESTAMPTZ,
  was_effective BOOLEAN,
  effect_size NUMERIC,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Copilot feedback — every response can be rated
CREATE TABLE IF NOT EXISTS copilot_response_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  conversation_id TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful', 'incorrect')),
  correction TEXT,
  domain TEXT,
  user_id UUID,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_evolution_snapshots_org_date
  ON brain_evolution_snapshots(organization_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_intervention_records_org
  ON brain_intervention_records(organization_id, suggested_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_feedback_org
  ON copilot_response_feedback(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_feedback_unprocessed
  ON copilot_response_feedback(processed, created_at)
  WHERE processed = false;

-- RLS policies
ALTER TABLE brain_evolution_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_intervention_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_response_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on brain_evolution_snapshots"
  ON brain_evolution_snapshots FOR ALL USING (true);

CREATE POLICY "Service role full access on brain_intervention_records"
  ON brain_intervention_records FOR ALL USING (true);

CREATE POLICY "Service role full access on copilot_response_feedback"
  ON copilot_response_feedback FOR ALL USING (true);
