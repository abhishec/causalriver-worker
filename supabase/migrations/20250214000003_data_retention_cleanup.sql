-- Data Retention & Automated Cleanup
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Implements GDPR-compliant data retention policies
-- Automatically deletes old data based on retention periods
-- Runs daily via pg_cron
--
-- Migration: 20250214_data_retention_cleanup
-- Created: 2025-02-14
--
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ───────────────────────────────────────────────────────────────────────────
-- FUNCTION: cleanup_old_data()
-- ───────────────────────────────────────────────────────────────────────────
--
-- Deletes old data according to retention policies:
-- - User data: 30 days after account deletion
-- - Cost logs: 12 months
-- - Cache data: 7 days
-- - Snapshots: 90 days
--
-- Returns: JSONB summary of deleted records
--

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(deleted_records JSONB) AS $$
DECLARE
  v_deleted JSONB;
  v_deleted_ai_memory INTEGER := 0;
  v_deleted_causal_edges INTEGER := 0;
  v_deleted_learning_state INTEGER := 0;
  v_deleted_cost_logs INTEGER := 0;
  v_deleted_embedding_cache INTEGER := 0;
  v_deleted_temporal_cache INTEGER := 0;
  v_deleted_fast_cache INTEGER := 0;
  v_deleted_snapshots INTEGER := 0;
  v_deleted_old_signals INTEGER := 0;
BEGIN
  RAISE NOTICE '[Cleanup] Starting automated data cleanup...';

  -- ─────────────────────────────────────────────────────────────────────────
  -- 1. Delete user data 30 days after account deletion
  -- ─────────────────────────────────────────────────────────────────────────

  -- AI Memory
  DELETE FROM ai_memory
  WHERE organization_id IN (
    SELECT id FROM organizations
    WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days'
  );
  GET DIAGNOSTICS v_deleted_ai_memory = ROW_COUNT;
  RAISE NOTICE '[Cleanup] Deleted % ai_memory records', v_deleted_ai_memory;

  -- Brain Causal Edges
  DELETE FROM brain_causal_edges
  WHERE organization_id IN (
    SELECT id FROM organizations
    WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days'
  );
  GET DIAGNOSTICS v_deleted_causal_edges = ROW_COUNT;
  RAISE NOTICE '[Cleanup] Deleted % brain_causal_edges records', v_deleted_causal_edges;

  -- Learning State
  DELETE FROM learning_state
  WHERE organization_id IN (
    SELECT id FROM organizations
    WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days'
  );
  GET DIAGNOSTICS v_deleted_learning_state = ROW_COUNT;
  RAISE NOTICE '[Cleanup] Deleted % learning_state records', v_deleted_learning_state;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 2. Delete old cost logs (12 months)
  -- ─────────────────────────────────────────────────────────────────────────

  DELETE FROM llm_cost_log
  WHERE "timestamp" < NOW() - INTERVAL '12 months';
  GET DIAGNOSTICS v_deleted_cost_logs = ROW_COUNT;
  RAISE NOTICE '[Cleanup] Deleted % llm_cost_log records', v_deleted_cost_logs;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 3. Delete old cache entries (7 days TTL)
  -- ─────────────────────────────────────────────────────────────────────────

  -- Embedding cache
  DELETE FROM embedding_cache_state
  WHERE last_accessed < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_deleted_embedding_cache = ROW_COUNT;
  RAISE NOTICE '[Cleanup] Deleted % embedding_cache_state records', v_deleted_embedding_cache;

  -- Temporal memory cache
  DELETE FROM temporal_memory_state
  WHERE last_accessed < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_deleted_temporal_cache = ROW_COUNT;
  RAISE NOTICE '[Cleanup] Deleted % temporal_memory_state records', v_deleted_temporal_cache;

  -- Fast path cache
  DELETE FROM fast_path_cache
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_deleted_fast_cache = ROW_COUNT;
  RAISE NOTICE '[Cleanup] Deleted % fast_path_cache records', v_deleted_fast_cache;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 4. Delete old snapshots (90 days)
  -- ─────────────────────────────────────────────────────────────────────────

  DELETE FROM brain_daily_snapshots
  WHERE snapshot_date < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted_snapshots = ROW_COUNT;
  RAISE NOTICE '[Cleanup] Deleted % brain_daily_snapshots records', v_deleted_snapshots;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 5. Delete old connector signals (12 months)
  -- ─────────────────────────────────────────────────────────────────────────

  DELETE FROM connector_signals
  WHERE "timestamp" < NOW() - INTERVAL '12 months';
  GET DIAGNOSTICS v_deleted_old_signals = ROW_COUNT;
  RAISE NOTICE '[Cleanup] Deleted % connector_signals records', v_deleted_old_signals;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Build and return summary
  -- ─────────────────────────────────────────────────────────────────────────

  v_deleted := jsonb_build_object(
    'ai_memory', v_deleted_ai_memory,
    'brain_causal_edges', v_deleted_causal_edges,
    'learning_state', v_deleted_learning_state,
    'llm_cost_log', v_deleted_cost_logs,
    'embedding_cache_state', v_deleted_embedding_cache,
    'temporal_memory_state', v_deleted_temporal_cache,
    'fast_path_cache', v_deleted_fast_cache,
    'brain_daily_snapshots', v_deleted_snapshots,
    'connector_signals', v_deleted_old_signals,
    'total_deleted', (
      v_deleted_ai_memory +
      v_deleted_causal_edges +
      v_deleted_learning_state +
      v_deleted_cost_logs +
      v_deleted_embedding_cache +
      v_deleted_temporal_cache +
      v_deleted_fast_cache +
      v_deleted_snapshots +
      v_deleted_old_signals
    ),
    'timestamp', NOW()
  );

  RAISE NOTICE '[Cleanup] Total deleted: % records', v_deleted->>'total_deleted';
  RAISE NOTICE '[Cleanup] Cleanup complete!';

  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION cleanup_old_data() TO service_role;

-- Add comment
COMMENT ON FUNCTION cleanup_old_data() IS 'Automated data cleanup according to GDPR retention policies. Runs daily at 3 AM UTC via pg_cron.';

-- ───────────────────────────────────────────────────────────────────────────
-- SCHEDULE: Daily cleanup at 3 AM UTC
-- ───────────────────────────────────────────────────────────────────────────

-- Remove existing schedule if it exists, then re-create
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-data-daily') THEN
    PERFORM cron.unschedule('cleanup-old-data-daily');
  END IF;
END $$;

-- Schedule daily cleanup at 3 AM UTC
SELECT cron.schedule(
  'cleanup-old-data-daily',
  '0 3 * * *',  -- Every day at 3:00 AM UTC
  $$SELECT cleanup_old_data()$$
);

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ───────────────────────────────────────────────────────────────────────────

-- Check if cleanup is scheduled
-- SELECT * FROM cron.job WHERE jobname = 'cleanup-old-data-daily';

-- View recent cleanup runs
-- SELECT * FROM cron.job_run_details
-- WHERE jobname = 'cleanup-old-data-daily'
-- ORDER BY start_time DESC
-- LIMIT 10;

-- Manual test (doesn't actually delete, just shows what would be deleted)
-- SELECT * FROM cleanup_old_data();

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
