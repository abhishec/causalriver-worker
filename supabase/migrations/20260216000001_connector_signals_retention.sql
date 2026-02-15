-- ============================================================================
-- Connector Signals Retention Policy (Fix #2)
-- ============================================================================
--
-- Problem: connector_signals will grow unbounded (10M+ rows)
-- Solution: Archive signals >90 days to cold tier, delete from hot tier
--
-- Architecture:
-- - Hot tier (connector_signals): Last 90 days (fast queries)
-- - Cold tier (cold_tier_connector_signals): >90 days (archive access)
--
-- Scheduled via pg_cron: Daily at 3 AM
-- ============================================================================

-- 1. Create cold tier table for connector signals
CREATE TABLE IF NOT EXISTS public.cold_tier_connector_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  source TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value NUMERIC DEFAULT 0,
  signal_timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for archive queries (org + time range)
CREATE INDEX IF NOT EXISTS idx_cold_connector_signals_org_time
  ON public.cold_tier_connector_signals (organization_id, signal_timestamp DESC);

-- Index for source-specific archive queries
CREATE INDEX IF NOT EXISTS idx_cold_connector_signals_source
  ON public.cold_tier_connector_signals (organization_id, source, signal_timestamp DESC);

-- RLS policies
ALTER TABLE public.cold_tier_connector_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cold_connector_signals_select_own_org" ON public.cold_tier_connector_signals
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Grant access
GRANT SELECT ON public.cold_tier_connector_signals TO authenticated;
GRANT ALL ON public.cold_tier_connector_signals TO service_role;

-- 2. Archive function
CREATE OR REPLACE FUNCTION archive_old_connector_signals()
RETURNS TABLE(archived_count BIGINT, deleted_count BIGINT) AS $$
DECLARE
  v_archived_count BIGINT;
  v_deleted_count BIGINT;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  -- Archive signals older than 90 days
  v_cutoff_date := NOW() - INTERVAL '90 days';

  -- Step 1: Copy to cold tier
  INSERT INTO cold_tier_connector_signals (
    id, organization_id, source, signal_type, signal_value,
    signal_timestamp, metadata, created_at, archived_at
  )
  SELECT
    id, organization_id, source, signal_type, signal_value,
    signal_timestamp, metadata, created_at, NOW()
  FROM connector_signals
  WHERE signal_timestamp < v_cutoff_date;

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  -- Step 2: Delete from hot tier
  DELETE FROM connector_signals
  WHERE signal_timestamp < v_cutoff_date;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Return counts
  archived_count := v_archived_count;
  deleted_count := v_deleted_count;

  RAISE NOTICE 'Archived % connector signals, deleted % from hot tier', v_archived_count, v_deleted_count;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Schedule daily archival via pg_cron (if extension is enabled)
-- Run at 3 AM daily
DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old job if exists (ignore error if doesn't exist)
    BEGIN
      PERFORM cron.unschedule('archive-connector-signals');
    EXCEPTION WHEN OTHERS THEN
      -- Job doesn't exist, ignore
      NULL;
    END;

    -- Schedule new job: Daily at 3 AM
    PERFORM cron.schedule(
      'archive-connector-signals',
      '0 3 * * *',  -- 3 AM daily
      'SELECT archive_old_connector_signals();'
    );

    RAISE NOTICE 'Scheduled connector_signals archival job (daily 3 AM)';
  ELSE
    RAISE NOTICE 'pg_cron not available — manual archival required';
  END IF;
END $$;

-- 4. Manual archival function for on-demand cleanup
CREATE OR REPLACE FUNCTION cleanup_connector_signals_now()
RETURNS TABLE(archived_count BIGINT, deleted_count BIGINT) AS $$
BEGIN
  RETURN QUERY SELECT * FROM archive_old_connector_signals();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION archive_old_connector_signals() IS 'Archive connector_signals >90 days to cold tier. Runs daily via pg_cron.';
COMMENT ON FUNCTION cleanup_connector_signals_now() IS 'On-demand archival of old connector signals. Safe to run anytime.';
COMMENT ON TABLE cold_tier_connector_signals IS 'Archived connector signals (>90 days). Read-only access for historical analysis.';
