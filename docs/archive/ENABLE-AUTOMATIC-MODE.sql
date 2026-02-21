-- ============================================================================
-- ENABLE AUTOMATIC MODE - Run this in Supabase SQL Editor
-- ============================================================================
--
-- Copy this entire file and paste it into:
-- https://supabase.com/dashboard/project/zmlqvuzoodcgmkgkivfw/sql/new
--
-- Then click "RUN"
--
-- This will enable automatic hourly learning for your NexusBrain
-- ============================================================================

ALTER DATABASE postgres SET app.supabase_service_role_key =
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';

-- Verification
SELECT
  CASE
    WHEN current_setting('app.supabase_service_role_key', true) IS NOT NULL
    THEN '✅ SUCCESS: Automatic mode enabled!'
    ELSE '❌ ERROR: Service key not set'
  END AS status;

-- ============================================================================
-- AFTER RUNNING THIS SQL:
-- ============================================================================
--
-- 1. You should see: "✅ SUCCESS: Automatic mode enabled!"
--
-- 2. Verify in your terminal:
--    npm run check:production
--    (Should show 5/5 ready!)
--
-- 3. Your brain will now learn automatically:
--    - Every hour at :00 - Prediction verification
--    - Daily 2 AM UTC - Data retention cleanup
--    - Daily 3 AM UTC - Threshold optimization
--    - Daily 4 AM UTC - Evidence decay
--    - Daily 5 AM UTC - All maintenance tasks
--
-- 4. Next automatic trigger: Top of next hour
--
-- ============================================================================
