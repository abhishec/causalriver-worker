-- =============================================================================
-- Migration: Add CausalRivers APEX confounder metadata columns
-- Purpose:   Enable end-to-end federation of counterfactual knockout scores,
--            confounding flags, coefficient signs, and discovery method
--            through all 7 NexusBrain layers (L1-L7).
--
-- Without these columns, the TypeScript code computes confounder metadata
-- in L4 (APEX method) but silently loses it at the persistence boundary.
-- =============================================================================

-- Add confounder metadata columns to causal_relationships_statistical
ALTER TABLE causal_relationships_statistical
  ADD COLUMN IF NOT EXISTS knockout_score NUMERIC,
  ADD COLUMN IF NOT EXISTS is_likely_confounded BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS coefficient_sign NUMERIC,
  ADD COLUMN IF NOT EXISTS discovery_method TEXT;

-- Partial index: quickly find confounded relationships for anomaly detection
-- and feedback loop confounder-aware weight adjustment
CREATE INDEX IF NOT EXISTS idx_causal_confounded
  ON causal_relationships_statistical (organization_id, is_likely_confounded)
  WHERE is_likely_confounded = true;

-- Index: filter by discovery method (world_class, apex, calibrated_ensemble, etc.)
CREATE INDEX IF NOT EXISTS idx_causal_discovery_method
  ON causal_relationships_statistical (organization_id, discovery_method)
  WHERE discovery_method IS NOT NULL;
