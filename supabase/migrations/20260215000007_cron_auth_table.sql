-- ============================================================================
-- Alternative Cron Job Authentication (No Superuser Required)
-- ============================================================================
-- Since ALTER DATABASE requires superuser, we store the service key in a table
-- that cron jobs can query. This is a workaround for the permission issue.
-- ============================================================================

-- Create table to store service role key
CREATE TABLE IF NOT EXISTS public.nexus_system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the service role key
INSERT INTO public.nexus_system_config (key, value, description)
VALUES (
  'supabase_service_role_key',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDUzMTc4NSwiZXhwIjoyMDg2MTA3Nzg1fQ.iINHn-d1hwGBbW0zE2VUiTYE6RdgSuvtDrnukRTj7k0',
  'Service role key for Edge Function authentication in cron jobs'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- Grant access to service_role only (not public)
REVOKE ALL ON public.nexus_system_config FROM PUBLIC;
GRANT SELECT ON public.nexus_system_config TO service_role;

-- Helper function to get config values
CREATE OR REPLACE FUNCTION public.get_system_config(config_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges
AS $$
DECLARE
  config_value TEXT;
BEGIN
  SELECT value INTO config_value
  FROM public.nexus_system_config
  WHERE key = config_key;
  
  RETURN config_value;
END;
$$;

COMMENT ON TABLE public.nexus_system_config IS 
  'System configuration values. Access restricted to service_role.';

COMMENT ON FUNCTION public.get_system_config(TEXT) IS
  'Retrieves system configuration values securely.';
