-- Brain Nutrition: Scale Retention Policies
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds data retention for tables that grow unbounded at design partner scale:
-- - cross_domain_signals: 180-day retention (was: unlimited)
-- - prediction_records: verified 365d, unverified 90d (was: unlimited)
-- - ai_memory LEAP entries: keep 10 most recent per type per org (was: unlimited)
--
-- At design partner scale (2-3M LOC, 5K+ Jira items):
--   cross_domain_signals grows ~15K-30K rows/month/org
--   prediction_records grows ~10K-50K rows/month
--   ai_memory LEAP entries grow ~9 rows per sleep cycle
--
-- Without these policies, after 12 months:
--   cross_domain_signals: 200K-400K rows per org
--   prediction_records: 50K-100K rows
--   ai_memory LEAP: 3K+ stale entries per org
--
-- Migration: 20260222000004_brain_nutrition_scale_retention
-- Created: 2026-02-22
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- FUNCTION: cleanup_brain_nutrition_tables()
-- ───────────────────────────────────────────────────────────────────────────
--
-- Separate function from cleanup_old_data() to keep concerns isolated.
-- Runs daily at 4 AM UTC (1 hour after the main cleanup).
--

CREATE OR REPLACE FUNCTION cleanup_brain_nutrition_tables()
RETURNS TABLE(deleted_records JSONB) AS $$
DECLARE
  v_deleted JSONB;
  v_deleted_signals INTEGER := 0;
  v_deleted_predictions_verified INTEGER := 0;
  v_deleted_predictions_unverified INTEGER := 0;
  v_deleted_leap_entries INTEGER := 0;
BEGIN
  RAISE NOTICE '[BrainNutritionCleanup] Starting brain nutrition retention cleanup...';

  -- ─────────────────────────────────────────────────────────────────────────
  -- 1. cross_domain_signals: Keep 180 days
  -- ─────────────────────────────────────────────────────────────────────────
  -- This is the highest-volume brain table. Without cleanup it grows 15K-30K/month/org.
  -- 180 days gives ~6 months of history for trend analysis while keeping table manageable.

  DELETE FROM cross_domain_signals
  WHERE created_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS v_deleted_signals = ROW_COUNT;
  RAISE NOTICE '[BrainNutritionCleanup] Deleted % cross_domain_signals records (>180 days)', v_deleted_signals;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 2. prediction_records: verified 365d, unverified 90d
  -- ─────────────────────────────────────────────────────────────────────────
  -- Verified predictions are valuable for calibration history: keep 1 year.
  -- Unverified predictions that are 90+ days old will never be verified: clean up.

  DELETE FROM prediction_records
  WHERE was_correct IS NOT NULL
    AND verified_at < NOW() - INTERVAL '365 days';
  GET DIAGNOSTICS v_deleted_predictions_verified = ROW_COUNT;
  RAISE NOTICE '[BrainNutritionCleanup] Deleted % verified prediction_records (>365 days)', v_deleted_predictions_verified;

  DELETE FROM prediction_records
  WHERE was_correct IS NULL
    AND created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted_predictions_unverified = ROW_COUNT;
  RAISE NOTICE '[BrainNutritionCleanup] Deleted % unverified prediction_records (>90 days)', v_deleted_predictions_unverified;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 3. ai_memory LEAP entries: Keep 10 most recent per type per org
  -- ─────────────────────────────────────────────────────────────────────────
  -- LEAP types accumulate one entry per sleep cycle per type.
  -- The query path only uses the MOST RECENT per type.
  -- Keeping 10 per type gives enough history for debugging while preventing unbounded growth.

  DELETE FROM ai_memory
  WHERE memory_type IN (
    'curiosity_hypothesis', 'self_model', 'mesh_pattern',
    'imagination_hypothesis', 'red_team_audit', 'immune_audit',
    'experiment', 'goal_plan', 'narrative'
  )
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY organization_id, memory_type
        ORDER BY updated_at DESC
      ) as rn
      FROM ai_memory
      WHERE memory_type IN (
        'curiosity_hypothesis', 'self_model', 'mesh_pattern',
        'imagination_hypothesis', 'red_team_audit', 'immune_audit',
        'experiment', 'goal_plan', 'narrative'
      )
    ) ranked
    WHERE rn <= 10
  );
  GET DIAGNOSTICS v_deleted_leap_entries = ROW_COUNT;
  RAISE NOTICE '[BrainNutritionCleanup] Deleted % stale LEAP ai_memory entries', v_deleted_leap_entries;

  -- ─────────────────────────────────────────────────────────────────────────
  -- Build and return summary
  -- ─────────────────────────────────────────────────────────────────────────

  v_deleted := jsonb_build_object(
    'cross_domain_signals', v_deleted_signals,
    'prediction_records_verified', v_deleted_predictions_verified,
    'prediction_records_unverified', v_deleted_predictions_unverified,
    'ai_memory_leap', v_deleted_leap_entries,
    'total_deleted', (
      v_deleted_signals +
      v_deleted_predictions_verified +
      v_deleted_predictions_unverified +
      v_deleted_leap_entries
    ),
    'timestamp', NOW()
  );

  RAISE NOTICE '[BrainNutritionCleanup] Total deleted: % records', v_deleted->>'total_deleted';
  RAISE NOTICE '[BrainNutritionCleanup] Cleanup complete!';

  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION cleanup_brain_nutrition_tables() TO service_role;

-- Add comment
COMMENT ON FUNCTION cleanup_brain_nutrition_tables() IS
  'Brain nutrition scale retention. Cleans cross_domain_signals (180d), prediction_records (verified 365d, unverified 90d), ai_memory LEAP (10 per type per org). Runs daily at 4 AM UTC.';

-- ───────────────────────────────────────────────────────────────────────────
-- SCHEDULE: Daily cleanup at 4 AM UTC (1 hour after main cleanup)
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'brain-nutrition-cleanup-daily') THEN
    PERFORM cron.unschedule('brain-nutrition-cleanup-daily');
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- pg_cron not installed, skip scheduling
    RAISE NOTICE 'pg_cron not available, skipping schedule creation';
END $$;

DO $outer$
BEGIN
  PERFORM cron.schedule(
    'brain-nutrition-cleanup-daily',
    '0 4 * * *',  -- Every day at 4:00 AM UTC
    'SELECT cleanup_brain_nutrition_tables()'
  );
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron not available, skipping schedule creation';
END $outer$;

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
