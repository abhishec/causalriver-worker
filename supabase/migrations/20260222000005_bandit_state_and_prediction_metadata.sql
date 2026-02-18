-- ============================================================================
-- Migration: Bandit State Persistence + Prediction Records Metadata
-- ============================================================================
--
-- Fixes two non-fatal errors found during stress testing:
--
--   1. [CausalMethodBandit] Persist batch error:
--      "Could not find table 'public.causal_method_bandit_state'"
--      → Creates the UCB1 bandit state persistence table
--        (per org, per domain pair, per causal method)
--
--   2. [NeuralCortex] Prediction persistence non-fatal:
--      "Could not find the 'metadata' column of 'prediction_records'"
--      → Adds JSONB metadata column to prediction_records
--
-- Impact:
--   Without this migration:
--     - Bandit UCB1 state is ephemeral (lost on process restart)
--     - Brain cannot learn which causal discovery method works best
--       across restarts → slower convergence per org
--     - Prediction metadata (discovery_method, context) is not persisted
--
--   After this migration:
--     - Bandit state survives restarts → org-specific UCB1 policies retained
--     - Predictions store full audit context
-- ============================================================================

-- ── 1. UCB1 Bandit State Persistence ────────────────────────────────────────
--
-- Per (org, domain-pair, method) row: one arm per causal discovery method.
-- Updated after each oracle verification reward in outcome-oracle.ts.
-- Loaded at startup by causal-method-bandit.ts so UCB1 policies survive restarts.
--
-- Schema matches causal-method-bandit.ts _persistStateInternal() upsert:
--   organization_id, pair_key, source_domain, target_domain, method,
--   pulls, total_reward, empirical_mean, ucb_score,
--   last_pulled_at, last_reward, total_pair_pulls, updated_at

CREATE TABLE IF NOT EXISTS causal_method_bandit_state (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID        NOT NULL,
  pair_key           TEXT        NOT NULL,           -- "sourceDomain->targetDomain"
  source_domain      TEXT        NOT NULL,
  target_domain      TEXT        NOT NULL,
  method             TEXT        NOT NULL,           -- BanditArm value
  pulls              INTEGER     NOT NULL DEFAULT 0,
  total_reward       NUMERIC     NOT NULL DEFAULT 0,
  empirical_mean     NUMERIC     NOT NULL DEFAULT 0,
  ucb_score          NUMERIC,                        -- NULL = Infinity (unexplored)
  last_pulled_at     TIMESTAMPTZ,
  last_reward        NUMERIC,
  total_pair_pulls   INTEGER     NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, pair_key, method)
);

CREATE INDEX IF NOT EXISTS idx_bandit_state_org
  ON causal_method_bandit_state (organization_id);

CREATE INDEX IF NOT EXISTS idx_bandit_state_pair
  ON causal_method_bandit_state (organization_id, pair_key);

CREATE INDEX IF NOT EXISTS idx_bandit_state_updated
  ON causal_method_bandit_state (updated_at DESC);

ALTER TABLE causal_method_bandit_state ENABLE ROW LEVEL SECURITY;

-- Org-scoped read (users see their own org's bandit state)
CREATE POLICY "org_read_bandit_state" ON causal_method_bandit_state
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_bandit_state" ON causal_method_bandit_state
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON causal_method_bandit_state TO service_role;
GRANT SELECT ON causal_method_bandit_state TO authenticated;


-- ── 2. Add metadata column to prediction_records ────────────────────────────
--
-- NeuralCortexController.persistPrediction() tries to store:
--   { discoveryMethod, signalType, watchDomain, confidence, context }
-- as JSONB. The base migration (20250207000001_nexus_brain_core.sql) omitted
-- this column. Safe to add IF NOT EXISTS — no existing data is affected.

ALTER TABLE prediction_records
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- GIN index for metadata queries (filter by discovery_method, etc.)
CREATE INDEX IF NOT EXISTS idx_prediction_records_metadata
  ON prediction_records USING gin(metadata)
  WHERE metadata IS NOT NULL;
