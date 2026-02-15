-- ============================================================================
-- FINAL STEP: Set Service Role Key for Automatic Cron Triggers
-- ============================================================================
--
-- This enables automatic cron job execution (hourly/daily)
-- Without this: Manual triggers work, but automatic scheduling won't trigger
-- With this: Full autonomous operation - brain learns automatically
--
-- ============================================================================

-- Set the service role key as a database-level setting
-- This allows pg_cron jobs to authenticate with Edge Functions
ALTER DATABASE postgres SET app.supabase_service_role_key =
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Reload configuration
SELECT pg_reload_conf();

-- Verify the setting was applied
DO $$
DECLARE
    key_value TEXT;
BEGIN
    key_value := current_setting('app.supabase_service_role_key', true);

    IF key_value IS NOT NULL AND length(key_value) > 100 THEN
        RAISE NOTICE '✅ Service role key configured successfully';
        RAISE NOTICE '   Key length: % characters', length(key_value);
    ELSE
        RAISE WARNING '⚠️  Service role key may not be set correctly';
    END IF;
END $$;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 AUTONOMOUS LEARNING ACTIVATED!';
    RAISE NOTICE '';
    RAISE NOTICE '   Your NexusBrain will now:';
    RAISE NOTICE '   - Verify predictions every hour';
    RAISE NOTICE '   - Optimize thresholds daily at 3 AM UTC';
    RAISE NOTICE '   - Apply evidence decay daily at 4 AM UTC';
    RAISE NOTICE '   - Run full maintenance daily at 5 AM UTC';
    RAISE NOTICE '   - Clean up old data daily at 2 AM UTC';
    RAISE NOTICE '';
    RAISE NOTICE '   Next steps:';
    RAISE NOTICE '   1. Wait for top of hour for first automatic job';
    RAISE NOTICE '   2. Check results: SELECT * FROM ai_agent_activity WHERE agent_type = ''cron'' ORDER BY created_at DESC LIMIT 5;';
    RAISE NOTICE '   3. Monitor for 24 hours';
    RAISE NOTICE '';
    RAISE NOTICE '🧠❤️  The brain is now autonomous!';
END $$;
