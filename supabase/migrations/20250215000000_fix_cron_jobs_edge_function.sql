-- Fix Cron Jobs to Use Working Edge Function
--
-- Problem: The scheduled-jobs Edge Function has import issues with @nexus-ai/memory-stack
-- Solution: Use the nexus-cron Edge Function which implements tasks directly in Deno/SQL
--
-- The nexus-cron function already handles:
-- - prediction_verification → verifies pending predictions
-- - threshold_optimization → adjusts signal thresholds
-- - evidence_decay → reduces confidence in stale relationships
--
-- This migration updates all cron jobs to call nexus-cron instead of scheduled-jobs.

-- First, drop all existing NexusBrain cron jobs if they exist
DO $$
DECLARE
    job_record RECORD;
BEGIN
    FOR job_record IN
        SELECT jobid FROM cron.job
        WHERE jobname LIKE 'nexusbrain-%'
    LOOP
        PERFORM cron.unschedule(job_record.jobid);
    END LOOP;
END $$;

-- Get the project URL for the Edge Function
-- Replace this with your actual Supabase project URL
-- Format: https://YOUR_PROJECT_REF.supabase.co
DO $$
DECLARE
    project_url text := 'https://zmlqvuzoodcgmkgkivfw.supabase.co';
    service_key text;
BEGIN
    -- Note: The service key should be retrieved from vault or set as a database setting
    -- For now, this migration sets up the jobs structure, but you'll need to configure
    -- the authorization header with your actual service role key

    -- Job 1: Hourly Verification (runs every hour)
    -- Checks pending predictions and verifies them against actual outcomes
    PERFORM cron.schedule(
        'nexusbrain-hourly-verification',
        '0 * * * *',  -- Every hour at :00
        $sql$
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
        $sql$
    );

    -- Job 2: Daily Retention Cleanup (2 AM UTC)
    -- This is a lightweight task - just update old records
    PERFORM cron.schedule(
        'nexusbrain-daily-retention',
        '0 2 * * *',  -- Daily at 2 AM UTC
        $sql$
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
        $sql$
    );

    -- Job 3: Daily Threshold Optimization (3 AM UTC - moved from Sunday)
    -- Runs threshold optimization more frequently for better adaptation
    PERFORM cron.schedule(
        'nexusbrain-daily-threshold',
        '0 3 * * *',  -- Daily at 3 AM UTC
        $sql$
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
        $sql$
    );

    -- Job 4: Daily Evidence Decay (4 AM UTC)
    -- Reduces confidence in relationships not recently validated
    PERFORM cron.schedule(
        'nexusbrain-daily-decay',
        '0 4 * * *',  -- Daily at 4 AM UTC
        $sql$
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
        $sql$
    );

    -- Job 5: Daily All Tasks (5 AM UTC)
    -- Runs all maintenance tasks together once per day
    PERFORM cron.schedule(
        'nexusbrain-daily-all',
        '0 5 * * *',  -- Daily at 5 AM UTC
        $sql$
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
        $sql$
    );

END $$;

-- Create a function to check cron job status
CREATE OR REPLACE FUNCTION public.get_nexusbrain_cron_status()
RETURNS TABLE (
  job_name text,
  schedule text,
  is_active boolean,
  last_run timestamptz,
  next_run timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    jobname::text as job_name,
    schedule::text,
    active as is_active,
    NULL::timestamptz as last_run,  -- pg_cron doesn't track this
    NULL::timestamptz as next_run    -- Would need to calculate from schedule
  FROM cron.job
  WHERE jobname LIKE 'nexusbrain-%'
  ORDER BY jobname;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_nexusbrain_cron_status() TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.get_nexusbrain_cron_status() IS
'Returns the status of all NexusBrain cron jobs. Use this to verify that jobs are scheduled and active.';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE '✅ Cron jobs updated to use nexus-cron Edge Function';
  RAISE NOTICE '   - nexusbrain-hourly-verification (every hour)';
  RAISE NOTICE '   - nexusbrain-daily-retention (2 AM UTC)';
  RAISE NOTICE '   - nexusbrain-daily-threshold (3 AM UTC)';
  RAISE NOTICE '   - nexusbrain-daily-decay (4 AM UTC)';
  RAISE NOTICE '   - nexusbrain-daily-all (5 AM UTC)';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Configure the service role key';
  RAISE NOTICE '   Run this SQL in Supabase SQL Editor:';
  RAISE NOTICE '   ALTER DATABASE postgres SET app.supabase_service_role_key = ''your_service_role_key_here'';';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Check job status with:';
  RAISE NOTICE '   SELECT * FROM public.get_nexusbrain_cron_status();';
END $$;
