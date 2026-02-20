-- =============================================================================
-- Fix v2: Nuclear cleanup of brain_daily_snapshots RLS
-- =============================================================================
-- Previous fix dropped snapshots_read_org_members but recursion persists.
-- Strategy: Drop ALL existing policies, then recreate only safe ones.
-- This table contains non-sensitive public dashboard data (aggregate stats).
-- =============================================================================

-- Drop every policy on brain_daily_snapshots
DROP POLICY IF EXISTS "snapshots_read_org_members" ON brain_daily_snapshots;
DROP POLICY IF EXISTS "service_role_brain_snapshots" ON brain_daily_snapshots;
DROP POLICY IF EXISTS "public_read_core_brain_snapshots" ON brain_daily_snapshots;
DROP POLICY IF EXISTS "service_role_all" ON brain_daily_snapshots;
DROP POLICY IF EXISTS "authenticated_read" ON brain_daily_snapshots;

-- Recreate with only 2 clean policies:

-- 1. Service role can do anything (inserts from nightly pipeline)
CREATE POLICY "service_role_full_access" ON brain_daily_snapshots
  FOR ALL USING (auth.role() = 'service_role');

-- 2. Public website can read core brain snapshots (no org_members dependency)
CREATE POLICY "anon_read_core_brain" ON brain_daily_snapshots
  FOR SELECT USING (
    organization_id = '00000000-0000-4000-a000-000000000001'::uuid
  );
