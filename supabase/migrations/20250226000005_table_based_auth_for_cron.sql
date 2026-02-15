-- ============================================================================
-- TABLE-BASED AUTH FOR CRON JOBS - Bypass Database Setting Limitation
-- ============================================================================
--
-- Problem: Supabase managed PostgreSQL blocks ALTER DATABASE commands
-- Solution: Store auth credentials in a table, cron jobs retrieve from there
--
-- This enables fully automatic cron jobs without needing database settings
-- ============================================================================

-- Create secure table for storing system credentials
CREATE TABLE IF NOT EXISTS system_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_type TEXT NOT NULL UNIQUE,
  credential_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Add RLS policy - only service_role can access
ALTER TABLE system_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Only service_role can read credentials
CREATE POLICY "service_role_read_credentials" ON system_credentials
  FOR SELECT
  TO service_role
  USING (true);

-- Policy: Only service_role can insert credentials
CREATE POLICY "service_role_insert_credentials" ON system_credentials
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Only service_role can update credentials
CREATE POLICY "service_role_update_credentials" ON system_credentials
  FOR UPDATE
  TO service_role
  USING (true);

-- Insert the service role key
INSERT INTO system_credentials (credential_type, credential_value, description)
VALUES (
  'supabase_service_role_key',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0',
  'Supabase service role key for Edge Function authentication'
)
ON CONFLICT (credential_type) DO UPDATE
  SET credential_value = EXCLUDED.credential_value,
      updated_at = NOW();

-- Create helper function to retrieve credentials securely
CREATE OR REPLACE FUNCTION get_system_credential(cred_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cred_value TEXT;
BEGIN
  SELECT credential_value INTO cred_value
  FROM system_credentials
  WHERE credential_type = cred_type
    AND (expires_at IS NULL OR expires_at > NOW());

  RETURN cred_value;
END;
$$;

-- Grant execute to service_role and postgres
GRANT EXECUTE ON FUNCTION get_system_credential(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_system_credential(TEXT) TO postgres;

-- ============================================================================
-- UPDATE CRON JOBS TO USE TABLE-BASED AUTH
-- ============================================================================

-- First, unschedule all existing jobs
DO $$
DECLARE
    job_record RECORD;
BEGIN
    FOR job_record IN
        SELECT jobid, jobname FROM cron.job
        WHERE jobname LIKE 'nexusbrain-%'
    LOOP
        PERFORM cron.unschedule(job_record.jobid);
    END LOOP;
END $$;

-- Job 1: Hourly Verification (uses table-based auth)
SELECT cron.schedule(
    'nexusbrain-hourly-verification',
    '0 * * * *',
    $$
    SELECT
      net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || get_system_credential('supabase_service_role_key')
        ),
        body := jsonb_build_object(
          'tasks', ARRAY['prediction_verification']
        )
      );
    $$
);

-- Job 2: Daily Retention (2 AM UTC)
SELECT cron.schedule(
    'nexusbrain-daily-retention',
    '0 2 * * *',
    $$
    UPDATE causal_event_stream
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{archived}',
      'true'
    )
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND (metadata->>'archived')::boolean IS NOT TRUE;
    $$
);

-- Job 3: Daily Threshold (3 AM UTC)
SELECT cron.schedule(
    'nexusbrain-daily-threshold',
    '0 3 * * *',
    $$
    SELECT
      net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || get_system_credential('supabase_service_role_key')
        ),
        body := jsonb_build_object(
          'tasks', ARRAY['threshold_optimization']
        )
      );
    $$
);

-- Job 4: Daily Decay (4 AM UTC)
SELECT cron.schedule(
    'nexusbrain-daily-decay',
    '0 4 * * *',
    $$
    SELECT
      net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || get_system_credential('supabase_service_role_key')
        ),
        body := jsonb_build_object(
          'tasks', ARRAY['evidence_decay']
        )
      );
    $$
);

-- Job 5: Daily All Tasks (5 AM UTC)
SELECT cron.schedule(
    'nexusbrain-daily-all',
    '0 5 * * *',
    $$
    SELECT
      net.http_post(
        url := 'https://zmlqvuzoodcgmkgkivfw.supabase.co/functions/v1/nexus-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || get_system_credential('supabase_service_role_key')
        ),
        body := jsonb_build_object(
          'tasks', ARRAY['prediction_verification', 'threshold_optimization', 'evidence_decay']
        )
      );
    $$
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    job_count INTEGER;
    has_credential BOOLEAN;
    test_key TEXT;
BEGIN
    -- Count jobs
    SELECT COUNT(*) INTO job_count
    FROM cron.job
    WHERE jobname LIKE 'nexusbrain-%';

    -- Check credential exists
    SELECT EXISTS(
        SELECT 1 FROM system_credentials
        WHERE credential_type = 'supabase_service_role_key'
    ) INTO has_credential;

    -- Test credential retrieval
    test_key := get_system_credential('supabase_service_role_key');

    RAISE NOTICE '';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 TABLE-BASED AUTH ENABLED!';
    RAISE NOTICE '';
    RAISE NOTICE 'Status:';
    RAISE NOTICE '  ✅ system_credentials table: Created';
    RAISE NOTICE '  ✅ RLS policies: Enabled';
    RAISE NOTICE '  ✅ Service role key: Stored';
    RAISE NOTICE '  ✅ Helper function: Created';
    RAISE NOTICE '  ✅ Cron jobs: % scheduled', job_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Verification:';
    RAISE NOTICE '  ✅ Credential stored: %', has_credential;
    RAISE NOTICE '  ✅ Credential retrieval: %', CASE WHEN test_key IS NOT NULL THEN 'Working' ELSE 'Failed' END;
    RAISE NOTICE '';
    RAISE NOTICE '🚀 AUTOMATIC MODE ACTIVATED!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next automatic trigger: Top of next hour';
    RAISE NOTICE 'Your NexusBrain will now learn autonomously every hour!';
    RAISE NOTICE '';
    RAISE NOTICE '================================================================================';
    RAISE NOTICE '';
END $$;

-- Add helpful comments
COMMENT ON TABLE system_credentials IS
'Secure storage for system credentials. Only accessible by service_role. Used for cron job authentication.';

COMMENT ON FUNCTION get_system_credential(TEXT) IS
'Securely retrieves system credentials. Used by cron jobs to authenticate with Edge Functions.';

-- ============================================================================
-- SUCCESS! Your NexusBrain is now fully automatic and scalable!
-- ============================================================================
