-- ============================================================================
-- CALIBRATION LOOP TABLES
-- ============================================================================
-- Tracks predictions made by the brain and their actual outcomes for calibration.
-- This enables:
--   1. Recording predictions with confidence scores
--   2. Matching predictions to actual outcomes
--   3. Computing Brier scores and calibration metrics
--   4. Triggering recalibration when accuracy degrades
--
-- Used by:
--   - calibration-feedback-loop.ts (recordPrediction, recordOutcome)
--   - outcome-resolver-agent.ts (matches predictions to outcomes daily)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prediction_tracker (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,

  -- Prediction details
  domain TEXT NOT NULL,                     -- domain this prediction is about
  action_type TEXT NOT NULL,                -- action that made the prediction
  prediction TEXT NOT NULL,                 -- natural language prediction
  confidence NUMERIC NOT NULL,              -- confidence score (0-1)
  review_date TIMESTAMPTZ NOT NULL,         -- when to check if prediction came true

  -- Outcome resolution
  resolved BOOLEAN DEFAULT FALSE,           -- has the outcome been determined?
  actual_outcome BOOLEAN,                   -- did the prediction come true?
  brier_score NUMERIC,                      -- Brier score for this prediction
  resolved_at TIMESTAMPTZ,                  -- when outcome was resolved

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,       -- additional context (baseline, thresholds, etc.)

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT valid_brier_score CHECK (brier_score IS NULL OR (brier_score >= 0 AND brier_score <= 1))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prediction_tracker_org_domain
  ON prediction_tracker (organization_id, domain);

CREATE INDEX IF NOT EXISTS idx_prediction_tracker_pending
  ON prediction_tracker (organization_id, resolved, review_date)
  WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_prediction_tracker_resolved
  ON prediction_tracker (organization_id, domain, resolved)
  WHERE resolved = TRUE;

-- Auto-update timestamp trigger
DROP TRIGGER IF EXISTS set_prediction_tracker_updated_at ON prediction_tracker;
CREATE TRIGGER set_prediction_tracker_updated_at
  BEFORE UPDATE ON prediction_tracker
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE prediction_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON prediction_tracker FOR ALL
  USING (auth.role() = 'service_role');


-- ============================================================================
-- BRAIN HEALTH HISTORY TABLE
-- ============================================================================
-- Stores historical brain health reports for trend analysis.
-- Enables tracking of brain health metrics over time.
--
-- Used by:
--   - brain-pipeline.ts (after each action execution)
--   - health monitoring agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS brain_health_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,

  -- Health metrics snapshot
  total_signals BIGINT DEFAULT 0,
  total_relationships BIGINT DEFAULT 0,
  total_memories BIGINT DEFAULT 0,
  active_agents INTEGER DEFAULT 0,

  -- Learning metrics
  learning_cycles_completed INTEGER DEFAULT 0,
  last_learning_cycle_at TIMESTAMPTZ,

  -- Calibration metrics
  average_brier_score NUMERIC,
  prediction_accuracy NUMERIC,
  total_predictions INTEGER DEFAULT 0,
  resolved_predictions INTEGER DEFAULT 0,

  -- System health
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,

  -- Snapshot metadata
  snapshot_type TEXT DEFAULT 'daily',      -- 'daily', 'hourly', 'on_demand'
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_accuracy CHECK (prediction_accuracy IS NULL OR (prediction_accuracy >= 0 AND prediction_accuracy <= 1)),
  CONSTRAINT valid_brier CHECK (average_brier_score IS NULL OR (average_brier_score >= 0 AND average_brier_score <= 1))
);

-- Indexes for trend analysis
CREATE INDEX IF NOT EXISTS idx_brain_health_history_org_time
  ON brain_health_history (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brain_health_history_snapshot_type
  ON brain_health_history (organization_id, snapshot_type, created_at DESC);

-- RLS
ALTER TABLE brain_health_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON brain_health_history FOR ALL
  USING (auth.role() = 'service_role');


-- ============================================================================
-- CALIBRATION METRICS VIEW
-- ============================================================================
-- Pre-computed calibration metrics by domain for fast lookups.
-- ============================================================================

CREATE OR REPLACE VIEW calibration_metrics_by_domain AS
SELECT
  organization_id,
  domain,
  COUNT(*) FILTER (WHERE resolved = TRUE) AS total_resolved,
  COUNT(*) FILTER (WHERE resolved = FALSE) AS total_pending,
  COUNT(*) FILTER (WHERE actual_outcome = TRUE) AS correct_predictions,
  COUNT(*) FILTER (WHERE actual_outcome = FALSE) AS incorrect_predictions,
  AVG(brier_score) FILTER (WHERE brier_score IS NOT NULL) AS avg_brier_score,
  CASE
    WHEN COUNT(*) FILTER (WHERE resolved = TRUE) > 0 THEN
      COUNT(*) FILTER (WHERE actual_outcome = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE resolved = TRUE)
    ELSE NULL
  END AS accuracy,
  MAX(resolved_at) AS last_resolution_at
FROM prediction_tracker
GROUP BY organization_id, domain;
