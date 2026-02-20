-- =============================================================================
-- Fix: brain_daily_snapshots RLS infinite recursion
-- =============================================================================
-- Problem: The `snapshots_read_org_members` policy queries `org_members`,
-- which has a self-referencing RLS policy (`member_read_own`) that queries
-- `org_members` itself, causing PostgreSQL error 42P17 (infinite recursion).
-- This blocks ALL anon reads, including the public website at usebrainos.com.
--
-- Fix: Drop the redundant policy. The existing `public_read_core_brain_snapshots`
-- policy already allows anonymous reads for the core brain org, which is the
-- only data the public website needs. Authenticated platform users access
-- snapshots via the service role (which bypasses RLS entirely).
-- =============================================================================

DROP POLICY IF EXISTS "snapshots_read_org_members" ON brain_daily_snapshots;

-- Also fix the org_members self-referencing RLS to prevent future recursion.
-- Replace the recursive subquery with a SECURITY DEFINER function in public schema.

CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT organization_id
  FROM public.org_members
  WHERE user_id = auth.uid()
$$;

-- Recreate the org_members read policy using the safe function
DROP POLICY IF EXISTS "member_read_own" ON org_members;
CREATE POLICY "member_read_own" ON org_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT public.get_user_org_ids())
  );
