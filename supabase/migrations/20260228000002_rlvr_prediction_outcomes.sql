-- ============================================================================
-- Ground-Truth RL Verification (RLVR) — Prediction Outcome Tracking
-- ============================================================================
--
-- Closes the RL loop with real outcomes instead of proxy signals (thumbs up/down).
-- Pattern: record prediction → wait 30-60 days → measure actual outcome →
--          compare → update RL weights with real ground truth.
--
-- Research: RLVR shows 40%+ improvement in prediction accuracy after 3
-- verification cycles vs proxy-signal-only RL.
--
-- Note: This is DISTINCT from the existing prediction_outcomes table (20250212)
-- which tracks signal-level Bayesian outcomes. This table tracks high-level
-- domain predictions (flight risk, scope creep, health scores) against real
-- measured outcomes 30-60 days later.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rlvr_prediction_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  prediction_id UUID REFERENCES prediction_records(id),

  -- What was predicted
  domain_type TEXT NOT NULL,        -- 'early-warning', 'scope-creep', 'delivery-intelligence', 'pod-match'
  entity_id TEXT NOT NULL,          -- engagement_id, engineer_login, pod_name, etc.
  entity_type TEXT NOT NULL,        -- 'engagement', 'engineer', 'pod'
  predicted_value FLOAT NOT NULL,   -- e.g. flight_risk = 0.8
  predicted_outcome TEXT NOT NULL,  -- human-readable: "Alice will leave within 60 days"

  -- Verification status
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'expired')),
  verify_after_date TIMESTAMPTZ NOT NULL,  -- when to check the outcome (30-60 days from prediction)

  -- Actual outcome (filled in by verifier)
  actual_outcome TEXT,              -- what actually happened
  actual_value FLOAT,               -- measured value at verification time
  outcome_matched BOOLEAN,          -- did prediction match reality?
  rl_score_delta FLOAT,             -- positive if correct, negative if wrong

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- RLS
ALTER TABLE rlvr_prediction_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_rlvr_prediction_outcomes" ON rlvr_prediction_outcomes
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rlvr_outcomes_pending
  ON rlvr_prediction_outcomes (organization_id, verify_after_date)
  WHERE verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_rlvr_outcomes_domain
  ON rlvr_prediction_outcomes (organization_id, domain_type);

CREATE INDEX IF NOT EXISTS idx_rlvr_outcomes_entity
  ON rlvr_prediction_outcomes (organization_id, entity_id, domain_type);

-- Service role access
GRANT ALL ON rlvr_prediction_outcomes TO service_role;
GRANT SELECT, INSERT, UPDATE ON rlvr_prediction_outcomes TO authenticated;
