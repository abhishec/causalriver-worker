-- Fix: brain_daily_snapshots RLS policy not scoped to service_role
-- ================================================================
-- VULNERABILITY: "service_role_brain_snapshots" policy had no TO clause,
-- meaning it applied to ALL roles (including authenticated users).
-- This allowed any logged-in user to insert/update/delete snapshots for
-- any organization — cross-tenant write exposure.
--
-- FIX: Scope write policy to service_role only. Add org-scoped SELECT
-- for authenticated users so they can still read their own org's snapshots.

-- Drop the unscoped policy
DROP POLICY IF EXISTS "service_role_brain_snapshots" ON brain_daily_snapshots;

-- Re-create scoped to service_role only
CREATE POLICY "service_role_brain_snapshots"
  ON brain_daily_snapshots
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Allow authenticated users to read snapshots for their own orgs
-- (The public_read_core_brain_snapshots policy already covers anon reads)
DROP POLICY IF EXISTS "authenticated_read_own_org_snapshots" ON brain_daily_snapshots;

CREATE POLICY "authenticated_read_own_org_snapshots"
  ON brain_daily_snapshots
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );
