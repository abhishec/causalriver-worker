-- ============================================================
-- NexusBrain Daily Snapshot Table
-- ============================================================
-- Written by the consolidation runner after each nightly cycle.
-- Powers the public website's live brain dashboard — showing
-- how the brain evolves, what it discovers, and how it improves.
--
-- One row per day per organization. The website reads the
-- core brain's snapshots (org 00000000-0000-4000-a000-000000000001).
-- ============================================================

CREATE TABLE IF NOT EXISTS brain_daily_snapshots (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,

  -- Snapshot date (one per day per org)
  snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Aggregate counts
  total_connections     INTEGER NOT NULL DEFAULT 0,
  new_connections       INTEGER NOT NULL DEFAULT 0,
  total_signals         INTEGER NOT NULL DEFAULT 0,
  signals_processed     INTEGER NOT NULL DEFAULT 0,

  -- Quality metrics
  prediction_accuracy   DOUBLE PRECISION DEFAULT NULL,   -- 0-100
  confidence_mean       DOUBLE PRECISION DEFAULT NULL,   -- avg edge confidence

  -- Activity metrics
  edges_strengthened    INTEGER NOT NULL DEFAULT 0,
  edges_pruned          INTEGER NOT NULL DEFAULT 0,
  edges_decayed         INTEGER NOT NULL DEFAULT 0,
  anomalies_detected    INTEGER NOT NULL DEFAULT 0,
  patterns_found        INTEGER NOT NULL DEFAULT 0,
  memories_created      INTEGER NOT NULL DEFAULT 0,

  -- Brain regions that were active
  regions_active        TEXT[] DEFAULT '{}',

  -- Top discoveries (human-readable strings)
  top_discoveries       JSONB DEFAULT '[]'::jsonb,

  -- Full stats from consolidation report
  consolidation_stats   JSONB DEFAULT '{}'::jsonb,

  -- Narrative summary
  narrative             TEXT DEFAULT NULL,

  -- Run metadata
  run_duration_ms       INTEGER DEFAULT NULL,
  run_status            TEXT DEFAULT 'completed',

  created_at            TIMESTAMPTZ DEFAULT now(),

  -- One snapshot per org per day
  UNIQUE(organization_id, snapshot_date)
);

-- Fast lookups: latest N snapshots for an org (website dashboard)
CREATE INDEX IF NOT EXISTS idx_brain_snapshots_org_date
  ON brain_daily_snapshots(organization_id, snapshot_date DESC);

-- Fast lookups: recent snapshots across all orgs
CREATE INDEX IF NOT EXISTS idx_brain_snapshots_date
  ON brain_daily_snapshots(snapshot_date DESC);

-- ──────────────────────────────────────────────────────────
-- RLS — service role full access, anon read for core brain
-- ──────────────────────────────────────────────────────────
ALTER TABLE brain_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role (consolidation runner) can do everything
CREATE POLICY "service_role_brain_snapshots" ON brain_daily_snapshots
  FOR ALL USING (true) WITH CHECK (true);

-- Anonymous/public read access for core brain snapshots only
-- This powers the public website dashboard
CREATE POLICY "public_read_core_brain_snapshots" ON brain_daily_snapshots
  FOR SELECT USING (
    organization_id = '00000000-0000-4000-a000-000000000001'::uuid
  );
