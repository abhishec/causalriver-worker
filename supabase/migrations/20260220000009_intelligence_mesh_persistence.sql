-- ============================================================================
-- Intelligence Mesh State Persistence
-- ============================================================================
-- Persists L7 Intelligence Mesh state to survive process restarts.
--
-- PROBLEM: The intelligence mesh (trust scores, collective patterns, conflict
-- resolution history, org topology) lives entirely in-memory. Every server
-- restart rebuilds from scratch — trust scores reset to 0.5, collective
-- patterns vanish, learned routing preferences disappear.
--
-- SOLUTION: Two-table architecture:
--   1. brain_layer_state — Generic layer state persistence (used by L3-L30)
--   2. intelligence_mesh_trust — Dedicated table for org trust profiles
--      (enables SQL-level trust queries, cross-org analytics, audit trails)
--
-- The generic table stores the full mesh snapshot (patterns, conflicts,
-- contributions). The dedicated table provides queryable trust data
-- for federation decisions and approval workflows.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BRAIN LAYER STATE TABLE (Generic — serves ALL cognitive layers L3-L30)
--
-- This is the table referenced by brain-layer-persistence.ts.
-- Stores serialized layer state as JSONB with org+layer+key uniqueness.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brain_layer_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  layer_id INTEGER NOT NULL CHECK (layer_id BETWEEN 1 AND 30),
  state_key TEXT NOT NULL,
  state_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, layer_id, state_key)
);

-- Index for fast loads: "give me all state for this org"
CREATE INDEX IF NOT EXISTS idx_brain_layer_state_org
  ON brain_layer_state (organization_id, layer_id);

-- RLS
ALTER TABLE brain_layer_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_layer_state_service_role" ON brain_layer_state;
CREATE POLICY "brain_layer_state_service_role"
  ON brain_layer_state FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "brain_layer_state_org_read" ON brain_layer_state;
CREATE POLICY "brain_layer_state_org_read"
  ON brain_layer_state FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );

COMMENT ON TABLE brain_layer_state IS
  'Persists cognitive layer state (L3-L30) across process restarts. '
  'Each row is a serialized snapshot of one layer''s state for one org.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. INTELLIGENCE MESH TRUST TABLE (Dedicated — queryable trust profiles)
--
-- While brain_layer_state stores the full mesh snapshot for restoration,
-- this table provides SQL-queryable trust data for:
--   - Federation approval decisions (is this org trusted enough?)
--   - Cross-org analytics dashboards (who are the top contributors?)
--   - Trust trend monitoring (is any org's trust score declining?)
--   - Audit trail for trust changes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intelligence_mesh_trust (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- The org whose trust is being tracked
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Overall trust score (0-1)
  trust_score NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  -- Per-domain trust breakdown
  domain_trust JSONB NOT NULL DEFAULT '{}',
  -- Contribution counts
  contributions_accepted INTEGER NOT NULL DEFAULT 0,
  contributions_rejected INTEGER NOT NULL DEFAULT 0,
  -- Accuracy tracking
  avg_accuracy NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  -- Reputation trend
  trend TEXT NOT NULL DEFAULT 'stable' CHECK (trend IN ('rising', 'stable', 'falling')),
  -- Last contribution timestamp
  last_contribution_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One row per org
  UNIQUE(org_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_intelligence_mesh_trust_score
  ON intelligence_mesh_trust (trust_score DESC);

CREATE INDEX IF NOT EXISTS idx_intelligence_mesh_trust_trend
  ON intelligence_mesh_trust (trend) WHERE trend != 'stable';

-- RLS
ALTER TABLE intelligence_mesh_trust ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intelligence_mesh_trust_service_role" ON intelligence_mesh_trust;
CREATE POLICY "intelligence_mesh_trust_service_role"
  ON intelligence_mesh_trust FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "intelligence_mesh_trust_read" ON intelligence_mesh_trust;
CREATE POLICY "intelligence_mesh_trust_read"
  ON intelligence_mesh_trust FOR SELECT
  USING (true);  -- Trust scores are public within the mesh (needed for federation decisions)

COMMENT ON TABLE intelligence_mesh_trust IS
  'L7 Intelligence Mesh: Queryable trust profiles for each org in the collective. '
  'Enables SQL-level trust queries for federation approval, cross-org analytics, and audit.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INTELLIGENCE MESH COLLECTIVE PATTERNS TABLE
--
-- Persists collectively-discovered patterns from multi-org consensus.
-- These are the brain's "collective memories" — insights that emerge
-- only when multiple orgs independently discover the same thing.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intelligence_mesh_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Pattern identifier (from mesh engine, e.g., "cp_42")
  pattern_id TEXT NOT NULL UNIQUE,
  -- The pattern description
  pattern_text TEXT NOT NULL,
  -- Domain
  domain TEXT NOT NULL,
  -- Number of orgs that independently discovered this
  org_count INTEGER NOT NULL DEFAULT 0,
  -- Contributing org IDs (anonymized in some contexts)
  contributor_ids UUID[] NOT NULL DEFAULT '{}',
  -- Trust-weighted confidence
  collective_confidence NUMERIC(5,4) NOT NULL,
  -- Is this an emergent pattern? (visible only collectively)
  emergent BOOLEAN NOT NULL DEFAULT false,
  -- Total evidence across all orgs
  total_evidence INTEGER NOT NULL DEFAULT 0,
  -- When first observed
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Last updated
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intelligence_mesh_patterns_domain
  ON intelligence_mesh_patterns (domain);

CREATE INDEX IF NOT EXISTS idx_intelligence_mesh_patterns_emergent
  ON intelligence_mesh_patterns (emergent) WHERE emergent = true;

CREATE INDEX IF NOT EXISTS idx_intelligence_mesh_patterns_confidence
  ON intelligence_mesh_patterns (collective_confidence DESC);

-- RLS
ALTER TABLE intelligence_mesh_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intelligence_mesh_patterns_service_role" ON intelligence_mesh_patterns;
CREATE POLICY "intelligence_mesh_patterns_service_role"
  ON intelligence_mesh_patterns FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "intelligence_mesh_patterns_read" ON intelligence_mesh_patterns;
CREATE POLICY "intelligence_mesh_patterns_read"
  ON intelligence_mesh_patterns FOR SELECT
  USING (true);  -- Collective patterns are shared across the mesh

COMMENT ON TABLE intelligence_mesh_patterns IS
  'L7 Intelligence Mesh: Collectively-discovered patterns from multi-org consensus. '
  'Emergent patterns are insights visible only at the collective level.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INTELLIGENCE MESH DASHBOARD VIEW
--
-- Aggregated view for monitoring mesh health, trust distribution,
-- and collective intelligence effectiveness.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW intelligence_mesh_dashboard AS
SELECT
  -- Trust distribution
  COUNT(*) AS total_orgs,
  AVG(trust_score) AS avg_trust_score,
  MIN(trust_score) AS min_trust_score,
  MAX(trust_score) AS max_trust_score,
  COUNT(*) FILTER (WHERE trend = 'rising') AS orgs_rising,
  COUNT(*) FILTER (WHERE trend = 'stable') AS orgs_stable,
  COUNT(*) FILTER (WHERE trend = 'falling') AS orgs_falling,
  SUM(contributions_accepted) AS total_contributions_accepted,
  SUM(contributions_rejected) AS total_contributions_rejected,
  CASE
    WHEN SUM(contributions_accepted) + SUM(contributions_rejected) > 0
    THEN ROUND(
      SUM(contributions_accepted)::NUMERIC /
      (SUM(contributions_accepted) + SUM(contributions_rejected)) * 100, 1
    )
    ELSE NULL
  END AS acceptance_rate_pct,
  -- Collective patterns
  (SELECT COUNT(*) FROM intelligence_mesh_patterns) AS total_collective_patterns,
  (SELECT COUNT(*) FROM intelligence_mesh_patterns WHERE emergent = true) AS total_emergent_patterns,
  (SELECT AVG(collective_confidence) FROM intelligence_mesh_patterns) AS avg_pattern_confidence
FROM intelligence_mesh_trust;
