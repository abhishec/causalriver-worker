-- ============================================================================
-- Federation Validation Metrics
-- ============================================================================
-- Phase 3 of Brain Evolution: "Federation Validation"
--
-- Problem: The brain uses CORE knowledge from federated learning but never
--          validates whether that knowledge actually helps or hurts accuracy.
--          Like a student who memorizes textbook answers without checking
--          if they work in practice.
--
-- Solution: Track CORE-sourced vs ORG-only prediction accuracy per org.
--           This table stores rolling accuracy metrics that Loop 7
--           (Federation Validation) computes each learning cycle.
--
-- Part of the "Federation" initiative to make collective intelligence accountable.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- TABLE: federation_validation_metrics
-- One row per organization — updated each learning cycle.
-- Tracks whether CORE knowledge improves or degrades org accuracy.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS federation_validation_metrics (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- CORE-sourced prediction stats
  core_predictions_total INTEGER NOT NULL DEFAULT 0,
  core_predictions_correct INTEGER NOT NULL DEFAULT 0,
  core_accuracy REAL NOT NULL DEFAULT 0.0,

  -- ORG-only prediction stats
  org_predictions_total INTEGER NOT NULL DEFAULT 0,
  org_predictions_correct INTEGER NOT NULL DEFAULT 0,
  org_accuracy REAL NOT NULL DEFAULT 0.0,

  -- Comparison
  core_helpful BOOLEAN NOT NULL DEFAULT true,
  accuracy_delta REAL NOT NULL DEFAULT 0.0,  -- core_accuracy - org_accuracy

  -- Timestamps
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE federation_validation_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fed_validation_org_read" ON federation_validation_metrics;
CREATE POLICY "fed_validation_org_read"
  ON federation_validation_metrics FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fed_validation_service_role" ON federation_validation_metrics;
CREATE POLICY "fed_validation_service_role"
  ON federation_validation_metrics FOR ALL
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────
-- TABLE: percolation_metrics
-- Tracks CORE brain growth over time.
-- One row per percolation run per org.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS percolation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What was percolated
  relationships_promoted INTEGER NOT NULL DEFAULT 0,
  memories_promoted INTEGER NOT NULL DEFAULT 0,
  rules_promoted INTEGER NOT NULL DEFAULT 0,
  items_skipped_pii INTEGER NOT NULL DEFAULT 0,
  items_skipped_duplicate INTEGER NOT NULL DEFAULT 0,

  -- CORE brain size snapshot
  core_total_relationships INTEGER,
  core_total_memories INTEGER,
  core_total_rules INTEGER,

  -- Timestamps
  percolated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_percolation_metrics_org_date
  ON percolation_metrics (organization_id, percolated_at DESC);

-- RLS
ALTER TABLE percolation_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "percolation_metrics_service_role" ON percolation_metrics;
CREATE POLICY "percolation_metrics_service_role"
  ON percolation_metrics FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "percolation_metrics_org_read" ON percolation_metrics;
CREATE POLICY "percolation_metrics_org_read"
  ON percolation_metrics FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );
