-- ============================================================================
-- Update Cron Jobs to Use Table-Based Authentication
-- ============================================================================
-- Replaces current_setting('app.supabase_service_role_key') with
-- get_system_config('supabase_service_role_key') which reads from table.
-- ============================================================================

-- Drop existing cron jobs
SELECT cron.unschedule('nexusbrain-hourly-verification');
SELECT cron.unschedule('nexusbrain-daily-retention');
SELECT cron.unschedule('nexusbrain-daily-threshold');
SELECT cron.unschedule('nexusbrain-daily-decay');
SELECT cron.unschedule('nexusbrain-daily-all');

-- Recreate cron jobs with table-based auth

-- 1. Hourly: Prediction Verification
SELECT cron.schedule(
  'nexusbrain-hourly-verification',
  '0 * * * *',  -- Every hour at :00
  $$
    SELECT net.http_post(
      url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
      headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
            ),
      body := jsonb_build_object('tasks', ARRAY['prediction_verification'])
    );
  $$
);

-- 2. Daily 2 AM: Data Retention Cleanup
SELECT cron.schedule(
  'nexusbrain-daily-retention',
  '0 2 * * *',  -- 2 AM UTC
  $$
    SELECT net.http_post(
      url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
      headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
            ),
      body := jsonb_build_object('tasks', ARRAY['data_retention_cleanup'])
    );
  $$
);

-- 3. Daily 3 AM: Threshold Optimization
SELECT cron.schedule(
  'nexusbrain-daily-threshold',
  '0 3 * * *',  -- 3 AM UTC
  $$
    SELECT net.http_post(
      url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
      headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
            ),
      body := jsonb_build_object('tasks', ARRAY['threshold_optimization'])
    );
  $$
);

-- 4. Daily 4 AM: Evidence Decay
SELECT cron.schedule(
  'nexusbrain-daily-decay',
  '0 4 * * *',  -- 4 AM UTC
  $$
    SELECT net.http_post(
      url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
      headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
            ),
      body := jsonb_build_object('tasks', ARRAY['evidence_decay'])
    );
  $$
);

-- 5. Daily 5 AM: All Tasks Combined
SELECT cron.schedule(
  'nexusbrain-daily-all',
  '0 5 * * *',  -- 5 AM UTC
  $$
    SELECT net.http_post(
      url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
      headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || get_system_config('supabase_service_role_key')
            ),
      body := jsonb_build_object(
        'tasks', ARRAY['prediction_verification', 'threshold_optimization', 'evidence_decay']
      )
    );
  $$
);

COMMENT ON FUNCTION public.get_system_config(TEXT) IS 
  'Used by cron jobs to retrieve service role key for Edge Function authentication.';
