-- ============================================================================
-- PREDICTION OUTCOMES TABLE
-- ============================================================================
-- Tracks actual outcomes for signals, enabling:
--   1. Threshold optimizer to correlate signals → outcomes
--   2. Bayesian updater to compute posterior probabilities
--   3. Autonomous learner to evaluate prediction accuracy
--
-- The FK to cross_domain_signals allows Supabase PostgREST to resolve
-- the join: cross_domain_signals → prediction_outcomes!inner(...)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prediction_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,

  -- FK to the signal that generated this prediction
  signal_id UUID NOT NULL REFERENCES cross_domain_signals(id) ON DELETE CASCADE,

  -- What was predicted
  prediction_type TEXT NOT NULL,        -- e.g. 'threshold_breach', 'cascade', 'anomaly'
  predicted_value NUMERIC,              -- predicted outcome value
  confidence NUMERIC,                   -- prediction confidence (0-1)

  -- What actually happened
  outcome_occurred BOOLEAN,             -- did the predicted outcome happen?
  actual_value NUMERIC,                 -- actual observed value
  outcome_date TIMESTAMPTZ,             -- when the outcome was observed

  -- Metadata
  domain TEXT NOT NULL,                 -- source domain
  entity_type TEXT,                     -- entity type (optional)
  entity_id TEXT,                       -- entity id (optional)
  edge_id UUID,                         -- causal edge that made the prediction (if applicable)

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Index-friendly lookups
  CONSTRAINT valid_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_org
  ON prediction_outcomes (organization_id, domain);

CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_signal
  ON prediction_outcomes (signal_id);

CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_pending
  ON prediction_outcomes (organization_id)
  WHERE outcome_occurred IS NULL;

CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_verified
  ON prediction_outcomes (organization_id, outcome_date)
  WHERE outcome_occurred IS NOT NULL;

-- Auto-update timestamp function (create if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_prediction_outcomes_updated_at
  BEFORE UPDATE ON prediction_outcomes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE prediction_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON prediction_outcomes FOR ALL
  USING (auth.role() = 'service_role');
