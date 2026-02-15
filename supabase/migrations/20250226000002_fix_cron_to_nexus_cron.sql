-- ============================================================================
-- FIX: Point Cron Jobs to Working nexus-cron Edge Function
-- ============================================================================
--
-- Problem: Migration 20250223 created jobs that call the broken scheduled-jobs
--          function, which has import errors with @nexus-ai/memory-stack.
--
-- Solution: Unschedule all nexusbrain jobs and reschedule them to call the
--           working nexus-cron Edge Function.
--
-- The nexus-cron function (already deployed and tested) handles:
--   - prediction_verification
--   - threshold_optimization
--   - evidence_decay
--
-- This migration ensures cron jobs call the correct endpoint.
-- ============================================================================

-- First, unschedule ALL existing nexusbrain cron jobs
DO $$
DECLARE
    job_record RECORD;
BEGIN
    FOR job_record IN
        SELECT jobid, jobname FROM cron.job
        WHERE jobname LIKE 'nexusbrain-%'
    LOOP
        RAISE NOTICE 'Unscheduling: %', job_record.jobname;
        PERFORM cron.unschedule(job_record.jobid);
    END LOOP;
END $$;

-- Now reschedule with correct nexus-cron endpoint
-- All jobs use the same pattern: call nexus-cron with different tasks

-- ──────────────────────────────────────────────────────────────────────────
-- Job 1: Hourly Verification (every hour)
-- ──────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
    'nexusbrain-hourly-verification',
    '0 * * * *',  -- Every hour at :00
    $$
    SELECT
      net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'tasks', ARRAY['prediction_verification']
        )
      );
    $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 2: Daily Retention Cleanup (2 AM UTC) - Direct SQL
-- ──────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
    'nexusbrain-daily-retention',
    '0 2 * * *',  -- Daily at 2 AM UTC
    $$
    UPDATE causal_event_stream
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{archived}',
      'true'
    )
    WHERE organization_id IN (
      SELECT id FROM organizations WHERE created_at < NOW() - INTERVAL '90 days'
    )
    AND created_at < NOW() - INTERVAL '90 days'
    AND (metadata->>'archived')::boolean IS NOT TRUE;
    $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 3: Daily Threshold Optimization (3 AM UTC)
-- ──────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
    'nexusbrain-daily-threshold',
    '0 3 * * *',  -- Daily at 3 AM UTC
    $$
    SELECT
      net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'tasks', ARRAY['threshold_optimization']
        )
      );
    $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 4: Daily Evidence Decay (4 AM UTC)
-- ──────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
    'nexusbrain-daily-decay',
    '0 4 * * *',  -- Daily at 4 AM UTC
    $$
    SELECT
      net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'tasks', ARRAY['evidence_decay']
        )
      );
    $$
);

-- ──────────────────────────────────────────────────────────────────────────
-- Job 5: Daily All Tasks (5 AM UTC)
-- ──────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
    'nexusbrain-daily-all',
    '0 5 * * *',  -- Daily at 5 AM UTC
    $$
    SELECT
      net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'tasks', ARRAY['prediction_verification', 'threshold_optimization', 'evidence_decay']
        )
      );
    $$
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check that all jobs are now scheduled correctly
DO $$
DECLARE
    job_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO job_count
    FROM cron.job
    WHERE jobname LIKE 'nexusbrain-%';

    IF job_count = 5 THEN
        RAISE NOTICE '✅ SUCCESS: All 5 cron jobs scheduled';
    ELSE
        RAISE WARNING '⚠️  Expected 5 jobs, found %', job_count;
    END IF;
END $$;

-- Log the migration success
COMMENT ON EXTENSION pg_cron IS 'Last updated: 2026-02-15 - Fixed cron jobs to call nexus-cron';

-- ============================================================================
-- NEXT STEPS
-- ============================================================================
/*
1. ✅ Run this migration: supabase db push
2. ⬜ Verify jobs: SELECT * FROM cron.job WHERE jobname LIKE 'nexusbrain-%';
3. ⬜ Wait for next hour mark
4. ⬜ Check results: SELECT * FROM scheduled_job_runs ORDER BY created_at DESC LIMIT 5;
5. ⬜ Monitor for 24 hours

Expected: All jobs should now succeed with status='success'
*/
