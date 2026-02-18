-- ============================================================================
-- Migration: Bandit State Persistence + Prediction Records Metadata
-- ============================================================================
--
-- Fixes two non-fatal errors found during stress testing:
--   1. [CausalMethodBandit] Persist batch error: Could not find table 'public.causal_method_bandit_state'
--      → Creates the UCB1 bandit state persistence table (per org, per domain pair, per method)
--
--   2. [NeuralCortex] Prediction persistence non-fatal: Could not find 'metadata' column
--      → Adds JSONB metadata column to prediction_records
--
-- Without this migration:
--   - Bandit state is ephemeral (lost on process restart) → slower learning convergence
--   - Prediction metadata (discovery_method, signal details) is not persisted
--
-- After this migration:
--   - Bandit state survives restarts → brain retains learned UCB1 policies
--   - Predictions store full metadata for debugging and audit
-- ============================================================================

-- ── 1. UCB1 Bandit State Persistence ────────────────────────────────────────
--
-- Stores per-domain-pair, per-method bandit arm statistics.
-- Updated after each oracle verification reward.
-- Restored at startup so brain retains learned causal discovery policies.
--
-- Schema matches causal-method-bandit.ts _persistStateInternal():
--   { organization_id, pair_key, source_domain, target_domain, method,
--     pulls, total_reward, empirical_mean, ucb_score, last_pulled_at,
--     last_reward, total_pair_pulls, updated_at }

CREATE TABLE IF NOT EXISTS causal_method_bandit_state (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id    UUID        NOT NULL,
  pair_key           TEXT        NOT NULL,           -- "{sourceDomain}->{targetDomain}"
  source_domain      TEXT        NOT NULL,
  target_domain      TEXT        NOT NULL,
  method             TEXT        NOT NULL,           -- BanditArm value
  pulls              INTEGER     NOT NULL DEFAULT 0, -- total arm pulls
  total_reward       NUMERIC     NOT NULL DEFAULT 0, -- accumulated (discounted) reward
  empirical_mean     NUMERIC     NOT NULL DEFAULT 0, -- total_reward / pulls
  ucb_score          NUMERIC,                        -- UCB1 score (NULL = Infinity/unexplored)
  last_pulled_at     TIMESTAMPTZ,
  last_reward        NUMERIC,                        -- most recent reward value
  total_pair_pulls   INTEGER     NOT NULL DEFAULT 0, -- total pulls across all methods for this pair
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique: one row per (org, domain pair, method)
  UNIQUE (organization_id, pair_key, method)
);

-- Indexes for efficient reads on startup (loadState) and writes (persistState)
CREATE INDEX IF NOT EXISTS idx_bandit_state_org
  ON causal_method_bandit_state (organization_id);

CREATE INDEX IF NOT EXISTS idx_bandit_state_pair
  ON causal_method_bandit_state (organization_id, pair_key);

CREATE INDEX IF NOT EXISTS idx_bandit_state_updated
  ON causal_method_bandit_state (updated_at DESC);

-- RLS: org-scoped (same pattern as all other brain tables)
ALTER TABLE causal_method_bandit_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_read_bandit_state" ON causal_method_bandit_state
  FOR SELECT USING (
    organization_id = (
      SELECT organization_id FROM user_organization_memberships
      WHERE user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "service_role_all_bandit_state" ON causal_method_bandit_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. Add metadata column to prediction_records ────────────────────────────
--
-- NeuralCortexController.persistPrediction() tries to store discovery_method,
-- signal details, confidence context, and other metadata as JSONB.
-- The base migration (20250207000001_nexus_brain_core.sql) omitted this column.

ALTER TABLE prediction_records
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Index for metadata queries (e.g. filter by discovery_method)
CREATE INDEX IF NOT EXISTS idx_prediction_records_metadata
  ON prediction_records USING gin(metadata)
  WHERE metadata IS NOT NULL;

-- ── 3. Backfill: set metadata = '{}' for existing rows ───────────────────────
UPDATE prediction_records SET metadata = '{}'::jsonb WHERE metadata IS NULL;
