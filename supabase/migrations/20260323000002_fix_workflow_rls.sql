-- ============================================================================
-- Fix workflow tables RLS: Restrict USING(true) to service_role only
-- ============================================================================
-- HIGH SEVERITY: The workflow tables (workflows, workflow_runs,
-- workflow_run_steps) had USING(true) policies without TO service_role
-- restriction. Any authenticated user could read/write ALL orgs' workflow
-- data — a cross-tenant data leak.
--
-- Fix: Same pattern applied in 20260220000010 for brain_agent_tasks:
--   1. Drop overly permissive policies
--   2. Re-create with TO service_role restriction
--   3. Add org-scoped SELECT for authenticated users
-- ============================================================================

-- ── 1. Drop overly permissive policies ────────────────────────────────────

DROP POLICY IF EXISTS "workflows_service_full_access" ON workflows;
DROP POLICY IF EXISTS "workflow_runs_service_full_access" ON workflow_runs;
DROP POLICY IF EXISTS "workflow_run_steps_service_full_access" ON workflow_run_steps;

-- ── 2. Re-create with TO service_role restriction ─────────────────────────

CREATE POLICY "workflows_service_role"
  ON workflows FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "workflow_runs_service_role"
  ON workflow_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "workflow_run_steps_service_role"
  ON workflow_run_steps FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 3. Add org-scoped read policies for authenticated users ───────────────

CREATE POLICY "workflows_org_read"
  ON workflows FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workflow_runs_org_read"
  ON workflow_runs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workflow_run_steps_org_read"
  ON workflow_run_steps FOR SELECT
  TO authenticated
  USING (
    workflow_run_id IN (
      SELECT id FROM workflow_runs
      WHERE organization_id IN (
        SELECT organization_id FROM org_members
        WHERE user_id = auth.uid()
      )
    )
  );
