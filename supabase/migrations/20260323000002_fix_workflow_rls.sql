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
--
-- SAFETY: Only runs if each table exists (may not in all environments).
-- ============================================================================

DO $$
BEGIN
  -- ── Fix workflows table ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflows' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "workflows_service_full_access" ON workflows';
    EXECUTE '
      CREATE POLICY "workflows_service_role"
        ON workflows FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)';
    EXECUTE '
      CREATE POLICY "workflows_org_read"
        ON workflows FOR SELECT
        TO authenticated
        USING (
          organization_id IN (
            SELECT organization_id FROM org_members
            WHERE user_id = auth.uid()
          )
        )';
    RAISE NOTICE 'Fixed workflows RLS policies';
  ELSE
    RAISE NOTICE 'workflows table does not exist — skipping RLS fix';
  END IF;

  -- ── Fix workflow_runs table ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_runs' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "workflow_runs_service_full_access" ON workflow_runs';
    EXECUTE '
      CREATE POLICY "workflow_runs_service_role"
        ON workflow_runs FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)';
    EXECUTE '
      CREATE POLICY "workflow_runs_org_read"
        ON workflow_runs FOR SELECT
        TO authenticated
        USING (
          organization_id IN (
            SELECT organization_id FROM org_members
            WHERE user_id = auth.uid()
          )
        )';
    RAISE NOTICE 'Fixed workflow_runs RLS policies';
  ELSE
    RAISE NOTICE 'workflow_runs table does not exist — skipping RLS fix';
  END IF;

  -- ── Fix workflow_run_steps table ──
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workflow_run_steps' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "workflow_run_steps_service_full_access" ON workflow_run_steps';
    EXECUTE '
      CREATE POLICY "workflow_run_steps_service_role"
        ON workflow_run_steps FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)';
    EXECUTE '
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
        )';
    RAISE NOTICE 'Fixed workflow_run_steps RLS policies';
  ELSE
    RAISE NOTICE 'workflow_run_steps table does not exist — skipping RLS fix';
  END IF;
END;
$$;
