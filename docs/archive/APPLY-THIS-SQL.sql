-- ============================================================================
-- FINAL CONFIGURATION: Set Service Role Key for Automatic Cron Triggers
-- ============================================================================
--
-- Run this SQL in Supabase Dashboard → SQL Editor
-- This enables automatic cron job execution (hourly/daily)
--
-- Without this: Manual triggers work, but automatic scheduling won't trigger
-- With this: Full autonomous operation - brain learns automatically
--
-- ============================================================================

-- Set the service role key as a database-level setting
-- This allows pg_cron jobs to authenticate with Edge Functions
ALTER DATABASE postgres SET app.supabase_service_role_key =
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';

-- ============================================================================
-- VERIFICATION QUERIES (run these to confirm it worked)
-- ============================================================================

-- 1. Check the setting was applied
SELECT
  name,
  setting,
  category,
  short_desc
FROM pg_settings
WHERE name = 'app.supabase_service_role_key';

-- 2. Check all cron jobs are configured
SELECT * FROM public.get_nexusbrain_cron_status();

-- 3. View cron jobs directly
SELECT
  jobid,
  jobname,
  schedule,
  active,
  database,
  username
FROM cron.job
WHERE jobname LIKE 'nexusbrain-%'
ORDER BY jobname;

-- 4. Test manual trigger (this will create an entry in ai_agent_activity)
SELECT net.http_post(
  url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
  ),
  body := jsonb_build_object(
    'tasks', ARRAY['prediction_verification']
  )
) as test_result;

-- 5. Check recent activity (should show the test above)
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
LIMIT 5;

-- ============================================================================
-- SUCCESS INDICATORS
-- ============================================================================
--
-- ✅ Query 1 should return 1 row with the setting
-- ✅ Query 2 should return 5 cron jobs
-- ✅ Query 3 should show all jobs as active=true
-- ✅ Query 4 should return HTTP 200 response
-- ✅ Query 5 should show the recent test execution
--
-- Once all pass: Your NexusBrain is 100% autonomous! 🎉
-- ============================================================================
