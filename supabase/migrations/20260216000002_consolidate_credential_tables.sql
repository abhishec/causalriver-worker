-- ============================================================================
-- Consolidate Duplicate Credential Tables
-- ============================================================================
-- Problem: Two tables store the same service role key:
--   1. system_credentials (migration 20250226000005) + get_system_credential()
--   2. nexus_system_config (migration 20260215000007) + get_system_config()
--
-- Active cron jobs use get_system_config() from nexus_system_config.
-- This migration consolidates to nexus_system_config as the single source
-- and creates a compatibility wrapper for get_system_credential().
-- ============================================================================

-- Step 1: Migrate values from system_credentials → nexus_system_config (if the old table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_credentials') THEN
    INSERT INTO public.nexus_system_config (key, value, description)
    SELECT credential_type, credential_value, description
    FROM public.system_credentials
    WHERE credential_type NOT IN (
      SELECT key FROM public.nexus_system_config
    )
    ON CONFLICT (key) DO NOTHING;
    RAISE NOTICE 'Migrated values from system_credentials → nexus_system_config';
  ELSE
    RAISE NOTICE 'system_credentials table does not exist — nothing to migrate';
  END IF;
END $$;

-- Step 2: Replace get_system_credential() with a wrapper that reads from nexus_system_config
CREATE OR REPLACE FUNCTION public.get_system_credential(cred_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Redirect to consolidated get_system_config()
  RETURN get_system_config(cred_type);
END;
$$;

COMMENT ON FUNCTION public.get_system_credential(TEXT) IS
  'Compatibility wrapper — redirects to get_system_config(). Use get_system_config() directly for new code.';

-- Step 3: Drop the old system_credentials table (no longer needed)
-- First drop policies, then the table
DROP POLICY IF EXISTS "service_role_read_credentials" ON public.system_credentials;
DROP POLICY IF EXISTS "service_role_insert_credentials" ON public.system_credentials;
DROP POLICY IF EXISTS "service_role_update_credentials" ON public.system_credentials;
DROP TABLE IF EXISTS public.system_credentials;

-- Step 4: Verification
DO $$
DECLARE
  config_works BOOLEAN;
  credential_works BOOLEAN;
  test_val_1 TEXT;
  test_val_2 TEXT;
BEGIN
  test_val_1 := get_system_config('supabase_service_role_key');
  test_val_2 := get_system_credential('supabase_service_role_key');

  config_works := test_val_1 IS NOT NULL;
  credential_works := test_val_2 IS NOT NULL;

  RAISE NOTICE '';
  RAISE NOTICE '=== Credential Table Consolidation ===';
  RAISE NOTICE '';
  RAISE NOTICE '  get_system_config():     %', CASE WHEN config_works THEN 'Working' ELSE 'FAILED' END;
  RAISE NOTICE '  get_system_credential(): %', CASE WHEN credential_works THEN 'Working (wrapper)' ELSE 'FAILED' END;
  RAISE NOTICE '  Both return same value:  %', CASE WHEN test_val_1 = test_val_2 THEN 'Yes' ELSE 'NO - MISMATCH' END;
  RAISE NOTICE '  system_credentials:      Dropped (consolidated into nexus_system_config)';
  RAISE NOTICE '';

  IF NOT config_works OR NOT credential_works THEN
    RAISE WARNING 'Credential consolidation verification FAILED';
  END IF;
END $$;
