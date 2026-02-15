-- Configure Service Role Key for Cron Jobs
--
-- This sets up the database setting that allows cron jobs to authenticate
-- with the Edge Functions using the service role key.
--
-- ⚠️ SECURITY: This stores the service role key in a database setting.
-- Only users with SUPERUSER privileges can read this setting.
-- The key is used by pg_cron jobs to call Edge Functions.

-- Set the service role key as a database setting
-- Replace 'your_service_role_key_here' with your actual service role key
ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';

-- Verify the setting was applied
SELECT
  name,
  setting,
  category,
  short_desc
FROM pg_settings
WHERE name = 'app.supabase_service_role_key';

-- Check all NexusBrain cron jobs are scheduled
SELECT * FROM public.get_nexusbrain_cron_status();

-- Alternative: View directly from pg_cron
SELECT
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active,
  jobname
FROM cron.job
WHERE jobname LIKE 'nexusbrain-%'
ORDER BY jobname;

-- Test: Manually trigger the hourly verification job
-- (This will call the nexus-cron Edge Function with prediction_verification task)
SELECT
  net.http_post(
    url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := jsonb_build_object(
      'tasks', ARRAY['prediction_verification']
    )
  ) as http_response;

-- Check the most recent execution results from ai_agent_activity
-- (nexus-cron logs all executions here)
SELECT
  created_at,
  agent_type,
  action_type,
  input_summary,
  output_summary,
  metadata
FROM ai_agent_activity
WHERE agent_type = 'cron'
  AND action_type = 'scheduled_run'
ORDER BY created_at DESC
LIMIT 10;
