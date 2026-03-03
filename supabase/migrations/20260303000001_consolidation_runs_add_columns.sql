-- Migration: add patterns_promoted / signals_scanned / triggered_by columns
-- to consolidation_runs for the Mar-2026 3-tier schema.
--
-- The original Feb-2025 CREATE TABLE didn't include these columns.
-- The Mar-2026 "CREATE TABLE IF NOT EXISTS" silently skipped them
-- because the table already existed. This migration adds them safely.

DO $$ BEGIN
  ALTER TABLE consolidation_runs
    ADD COLUMN patterns_promoted INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consolidation_runs
    ADD COLUMN signals_scanned INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consolidation_runs
    ADD COLUMN triggered_by TEXT NOT NULL DEFAULT 'cron';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consolidation_runs
    ADD COLUMN run_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
