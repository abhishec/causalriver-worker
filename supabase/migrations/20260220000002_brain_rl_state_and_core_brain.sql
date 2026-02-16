-- ============================================================================
-- Brain RL State Persistence + CORE Brain Seed
-- ============================================================================
-- Phase 1 of Brain Evolution: "Wire the Loops"
--
-- This migration creates:
--   1. brain_rl_state — Persists reinforcement learning state across restarts
--      Without this table, the brain forgets its learned scheduling multipliers,
--      compute budgets, and exploration rates every time the server restarts.
--
--   2. CORE Brain organization — Seeds the federated CORE brain (org_id = 00000000...)
--      Without this row, federation queries fail because the CORE org doesn't exist.
--
-- Part of the "Wire the Loops" initiative to make the 30-layer brain actually learn.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- TABLE: brain_rl_state
-- Persists per-layer reinforcement learning parameters.
-- One row per (organization_id, layer_id) — 30 rows per org.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brain_rl_state (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  layer_id INTEGER NOT NULL CHECK (layer_id >= 1 AND layer_id <= 30),

  -- Policy parameters (what RL adjusts)
  scheduling_multiplier REAL NOT NULL DEFAULT 1.0,
  compute_budget_multiplier REAL NOT NULL DEFAULT 1.0,
  exploration_rate REAL NOT NULL DEFAULT 0.3,
  output_threshold REAL NOT NULL DEFAULT 0.5,

  -- Reward tracking
  cumulative_reward REAL NOT NULL DEFAULT 0.0,
  reward_trend TEXT NOT NULL DEFAULT 'stable' CHECK (reward_trend IN ('improving', 'stable', 'declining')),

  -- Utilization counters
  utilization_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  novelty_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite primary key
  PRIMARY KEY (organization_id, layer_id)
);

-- Index for fast org-level queries
CREATE INDEX IF NOT EXISTS idx_brain_rl_state_org
  ON brain_rl_state (organization_id);

-- RLS
ALTER TABLE brain_rl_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_rl_state_org_read" ON brain_rl_state;
CREATE POLICY "brain_rl_state_org_read"
  ON brain_rl_state FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "brain_rl_state_org_write" ON brain_rl_state;
CREATE POLICY "brain_rl_state_org_write"
  ON brain_rl_state FOR ALL
  USING (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Service role bypass for cron/background jobs
DROP POLICY IF EXISTS "brain_rl_state_service_role" ON brain_rl_state;
CREATE POLICY "brain_rl_state_service_role"
  ON brain_rl_state FOR ALL
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────
-- SEED: CORE Brain Organization
-- The CORE brain is the collective intelligence hub.
-- org_id = 00000000-0000-0000-0000-000000000000
-- All orgs can READ from CORE, only percolation can WRITE.
-- ─────────────────────────────────────────────────────────────

INSERT INTO organizations (id, name, slug, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'CORE Brain (Federated Collective Intelligence)',
  'core-brain',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- TABLE: outcome_observation_windows (if not exists)
-- Used by Loop 4 (Intervention Outcome Tracking).
-- The closed-loop-learning-engine already references this table;
-- ensure it exists.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outcome_observation_windows (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  observation_type TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_end TIMESTAMPTZ NOT NULL,
  baseline_value REAL,
  current_value REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcome_windows_org_status
  ON outcome_observation_windows (organization_id, status)
  WHERE status = 'active';

-- RLS for outcome_observation_windows
ALTER TABLE outcome_observation_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outcome_windows_org_read" ON outcome_observation_windows;
CREATE POLICY "outcome_windows_org_read"
  ON outcome_observation_windows FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "outcome_windows_service_role" ON outcome_observation_windows;
CREATE POLICY "outcome_windows_service_role"
  ON outcome_observation_windows FOR ALL
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────
-- TABLE: weight_update_history (if not exists)
-- Used by Loop 2 health check. Tracks causal weight changes.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weight_update_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_domain TEXT NOT NULL,
  target_domain TEXT NOT NULL,
  old_weight REAL,
  new_weight REAL,
  evidence_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weight_updates_org_date
  ON weight_update_history (organization_id, created_at DESC);

-- RLS
ALTER TABLE weight_update_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weight_updates_service_role" ON weight_update_history;
CREATE POLICY "weight_updates_service_role"
  ON weight_update_history FOR ALL
  USING (auth.role() = 'service_role');
