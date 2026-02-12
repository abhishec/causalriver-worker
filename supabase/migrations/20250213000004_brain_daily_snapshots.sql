-- ============================================================================
-- Brain Daily Snapshots Table
--
-- Stores one row per organization per day, written by the consolidation runner.
-- Powers the live brain dashboard at usebrainos.com.
-- Upserted on (organization_id, snapshot_date) so re-runs overwrite gracefully.
-- ============================================================================

CREATE TABLE IF NOT EXISTS brain_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  -- Cumulative counts
  total_connections INTEGER DEFAULT 0,
  new_connections INTEGER DEFAULT 0,
  total_signals INTEGER DEFAULT 0,
  signals_processed INTEGER DEFAULT 0,
  -- Metrics
  prediction_accuracy NUMERIC,
  edges_strengthened INTEGER DEFAULT 0,
  edges_pruned INTEGER DEFAULT 0,
  edges_decayed INTEGER DEFAULT 0,
  anomalies_detected INTEGER DEFAULT 0,
  patterns_found INTEGER DEFAULT 0,
  memories_created INTEGER DEFAULT 0,
  -- Brain region activity
  regions_active TEXT[] DEFAULT '{}',
  top_discoveries TEXT[] DEFAULT '{}',
  -- Full consolidation stats
  consolidation_stats JSONB DEFAULT '{}',
  narrative TEXT,
  -- Run metadata
  run_duration_ms INTEGER,
  run_status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- One snapshot per org per day
  UNIQUE (organization_id, snapshot_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brain_snapshots_org
  ON brain_daily_snapshots (organization_id);
CREATE INDEX IF NOT EXISTS idx_brain_snapshots_date
  ON brain_daily_snapshots (organization_id, snapshot_date DESC);

-- RLS
ALTER TABLE brain_daily_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON brain_daily_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- Allow authenticated users to read (for dashboard)
CREATE POLICY "authenticated_read" ON brain_daily_snapshots FOR SELECT
  USING (auth.role() = 'authenticated');
