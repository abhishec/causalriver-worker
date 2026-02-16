-- ============================================================================
-- Emergence & Continuous Learning — The Brain That Grows Itself
-- ============================================================================
-- Phase 5 of Brain Evolution: "Emergence & Continuous Learning"
--
-- Problem: The brain has all the engines built (autonomous learner, deep
--          dreaming, brain evolution, closed-loop learning) but they run
--          in isolation with no shared observability. We can't see:
--            - Whether autonomous learning is actually discovering patterns
--            - Whether dream insights are being encoded into long-term memory
--            - Whether the brain's intelligence is trending up or down
--            - Whether reactive signal processing is triggering correctly
--
-- Solution: A brain_emergence_log table that records each emergence event
--           (autonomous learning cycle, dream insight, evolution milestone,
--           reactive trigger). This is the brain's "consciousness journal" —
--           a record of its own growth over time.
--
-- Part of the "Emergence & Continuous Learning" initiative.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- TABLE: Brain emergence log — records each self-improvement event
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brain_emergence_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What type of emergence event occurred
  event_type TEXT NOT NULL CHECK (event_type IN (
    'autonomous_learning',   -- 9-step autonomous learner cycle completed
    'dream_insight',         -- Deep dreaming surfaced a cross-domain insight
    'evolution_milestone',   -- Intelligence score crossed a threshold
    'reactive_trigger',      -- onSignalsIngested triggered reactive processing
    'pattern_promoted',      -- Pattern auto-promoted to rule
    'self_modification',     -- Brain modified its own causal model
    'calibration_shift'      -- Brier score significantly changed
  )),

  -- Summary of what happened
  summary TEXT NOT NULL,

  -- Quantitative metrics for this event
  metrics JSONB NOT NULL DEFAULT '{}',

  -- Intelligence score at time of event (for trend tracking)
  intelligence_score NUMERIC(5,1),

  -- How long the event took
  duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient queries: recent emergence events for an org
CREATE INDEX IF NOT EXISTS idx_brain_emergence_log_org_recent
  ON brain_emergence_log (organization_id, created_at DESC);

-- Index for event type filtering (e.g., "show me all dream insights")
CREATE INDEX IF NOT EXISTS idx_brain_emergence_log_type
  ON brain_emergence_log (organization_id, event_type, created_at DESC);

-- Cleanup index: sorted by created_at for efficient DELETE WHERE created_at < threshold
-- (Actual cleanup is done by data retention job, not a partial index with NOW())
CREATE INDEX IF NOT EXISTS idx_brain_emergence_log_cleanup
  ON brain_emergence_log (created_at ASC);

-- ─────────────────────────────────────────────────────────────
-- TABLE: Brain intelligence snapshots — daily intelligence score history
-- ─────────────────────────────────────────────────────────────
-- One row per org per day. Used for the intelligence trend dashboard
-- and to detect if the brain is getting smarter or dumber over time.

CREATE TABLE IF NOT EXISTS brain_intelligence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- Core intelligence metrics
  intelligence_score NUMERIC(5,1) NOT NULL,
  prediction_accuracy NUMERIC(5,4),
  brier_score NUMERIC(5,4),
  calibration_quality NUMERIC(5,4),

  -- Knowledge metrics
  causal_edges_total INTEGER NOT NULL DEFAULT 0,
  memories_total INTEGER NOT NULL DEFAULT 0,
  rules_total INTEGER NOT NULL DEFAULT 0,
  patterns_total INTEGER NOT NULL DEFAULT 0,

  -- Learning activity (that day)
  predictions_verified INTEGER NOT NULL DEFAULT 0,
  feedback_processed INTEGER NOT NULL DEFAULT 0,
  anomalies_detected INTEGER NOT NULL DEFAULT 0,
  packs_trained INTEGER NOT NULL DEFAULT 0,

  -- Sleep cycle metrics (from that night's sleep)
  dream_insights_surfaced INTEGER NOT NULL DEFAULT 0,
  autonomous_cycles_run INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, snapshot_date)
);

-- Index for efficient trend queries
CREATE INDEX IF NOT EXISTS idx_brain_intelligence_snapshots_trend
  ON brain_intelligence_snapshots (organization_id, snapshot_date DESC);

-- ─────────────────────────────────────────────────────────────
-- RLS: Service role only (brain runtime writes these)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE brain_emergence_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_intelligence_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brain_emergence_log_service_role" ON brain_emergence_log;
CREATE POLICY "brain_emergence_log_service_role"
  ON brain_emergence_log FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "brain_intelligence_snapshots_service_role" ON brain_intelligence_snapshots;
CREATE POLICY "brain_intelligence_snapshots_service_role"
  ON brain_intelligence_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- Allow org members to READ emergence logs (for dashboard)
DROP POLICY IF EXISTS "brain_emergence_log_read" ON brain_emergence_log;
CREATE POLICY "brain_emergence_log_read"
  ON brain_emergence_log FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "brain_intelligence_snapshots_read" ON brain_intelligence_snapshots;
CREATE POLICY "brain_intelligence_snapshots_read"
  ON brain_intelligence_snapshots FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM org_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- VIEW: Intelligence trend (last 30 days) for dashboard
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW brain_intelligence_trend AS
SELECT
  organization_id,
  snapshot_date,
  intelligence_score,
  prediction_accuracy,
  brier_score,
  causal_edges_total,
  memories_total,
  predictions_verified,
  feedback_processed,
  dream_insights_surfaced,
  autonomous_cycles_run,
  -- Compute 7-day moving average of intelligence score
  AVG(intelligence_score) OVER (
    PARTITION BY organization_id
    ORDER BY snapshot_date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS intelligence_7d_avg,
  -- Trend direction (current vs 7 days ago)
  intelligence_score - LAG(intelligence_score, 7) OVER (
    PARTITION BY organization_id
    ORDER BY snapshot_date
  ) AS intelligence_7d_delta
FROM brain_intelligence_snapshots
WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days';
