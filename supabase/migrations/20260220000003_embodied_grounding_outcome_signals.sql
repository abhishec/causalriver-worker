-- ============================================================================
-- Embodied Grounding: Outcome Signal Classification
-- ============================================================================
-- Phase 2 of Brain Evolution: "Embodied Grounding"
--
-- Problem: The brain treats all signals identically. A PR merge and a
--          payment failure have the same "weight" in the learning system.
--          The brain cannot distinguish activities from outcomes.
--
-- Solution: Add signal_category to cross_domain_signals metadata (via JSONB)
--           and create a GIN index for fast outcome queries.
--
-- The brain now has "interoception" — the ability to feel revenue changes,
-- incident resolution, and customer satisfaction as distinct from raw activity.
--
-- Part of the "Embodied Grounding" initiative to connect the brain to reality.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- INDEX: Fast outcome/metric signal queries
-- Loop 1B (Embodied Grounding) queries signals by signal_category
-- from signal_metadata JSONB. GIN index on the JSONB enables fast
-- filtering without a full table scan.
-- ─────────────────────────────────────────────────────────────

-- GIN index on signal_metadata for fast JSONB queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_cross_domain_signals_metadata_gin
  ON cross_domain_signals USING gin (signal_metadata jsonb_path_ops);

-- Partial index for outcome signals specifically (most common query pattern)
-- Loop 1B queries: WHERE signal_metadata->>'signal_category' IN ('outcome', 'metric')
CREATE INDEX IF NOT EXISTS idx_cross_domain_signals_outcome_category
  ON cross_domain_signals (organization_id, signal_timestamp DESC)
  WHERE signal_metadata->>'signal_category' IN ('outcome', 'metric');

-- ─────────────────────────────────────────────────────────────
-- INDEX: prediction_records for Loop 1 verification
-- The closed-loop engine queries unverified predictions frequently.
-- Without this index, it does a sequential scan on the entire table.
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_prediction_records_unverified
  ON prediction_records (organization_id, created_at ASC)
  WHERE was_correct IS NULL;

-- ─────────────────────────────────────────────────────────────
-- VIEW: Outcome signal dashboard (for observability)
-- Makes it easy to see what outcome signals the brain is receiving.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW brain_outcome_signals AS
SELECT
  organization_id,
  source_domain,
  signal_type,
  signal_metadata->>'signal_category' AS signal_category,
  COUNT(*) AS signal_count,
  AVG(signal_value) AS avg_value,
  MIN(signal_timestamp) AS first_seen,
  MAX(signal_timestamp) AS last_seen
FROM cross_domain_signals
WHERE signal_metadata->>'signal_category' IN ('outcome', 'metric')
GROUP BY organization_id, source_domain, signal_type, signal_metadata->>'signal_category';
