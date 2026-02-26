-- ============================================================================
-- Fix 1: connector_signals INSERT RLS — org-scoped
-- ============================================================================
-- Previous policy allowed any authenticated user to INSERT signals with ANY
-- organization_id (WITH CHECK (true)). This migration scopes INSERT to the
-- caller's own org memberships only. Service role bypasses RLS by default.

DROP POLICY IF EXISTS "connector_signals_insert_service_role" ON connector_signals;
DROP POLICY IF EXISTS "connector_signals_insert_authenticated" ON connector_signals;
DROP POLICY IF EXISTS "connector_signals_insert_org_scoped" ON connector_signals;

CREATE POLICY "connector_signals_insert_org_scoped"
  ON connector_signals
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Fix 3: se_aas_artifacts INSERT RLS — org-scoped
-- ============================================================================
-- Previous migrations only created a SELECT policy for authenticated users
-- and a service_role ALL policy. There was no authenticated INSERT policy,
-- causing "new row violates row-level security" errors when the platform
-- tried to save artifacts via the user-scoped client.

DROP POLICY IF EXISTS "se_aas_artifacts_insert" ON se_aas_artifacts;
DROP POLICY IF EXISTS "se_aas_artifacts_insert_org_scoped" ON se_aas_artifacts;

CREATE POLICY "se_aas_artifacts_insert_org_scoped"
  ON se_aas_artifacts
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Grant INSERT to authenticated so the RLS policy can apply
GRANT INSERT ON se_aas_artifacts TO authenticated;
