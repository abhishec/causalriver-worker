-- Fix connector_signals INSERT RLS policy (cross-tenant write injection risk)
--
-- Previous policy: WITH CHECK (true) + GRANT ALL TO authenticated
-- This allowed any authenticated user to INSERT signals with ANY organization_id.
--
-- Fix: Scope INSERT to the caller's org memberships only.
-- Service role (used by connectors + cron) retains full access.

-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "connector_signals_insert_service_role" ON connector_signals;
DROP POLICY IF EXISTS "connector_signals_insert" ON connector_signals;

-- Recreate org-scoped INSERT policy for authenticated users
CREATE POLICY "connector_signals_insert_org_scoped"
  ON connector_signals
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Ensure service role can still write without RLS (already granted via service client)
-- No change needed — service_role bypasses RLS by default in Supabase.
