-- ============================================================================
-- Process Engine RLS Hardening — Round 4 CTO Audit
-- ============================================================================
-- Issues found:
--   1. process_templates: service_role_write uses FOR ALL WITH CHECK only
--      (missing USING clause) — service_role deletes/updates silently denied.
--   2. process_state_rl_params: only SELECT policy exists — INSERT and UPDATE
--      from service-role (gradient descent upsert) silently fails under RLS.
--   3. process_state_rl_params: no service_role bypass policy — authenticated
--      role is not service_role, so worker upserts are blocked.
-- ============================================================================

-- ── process_templates: fix service_role_write policy (add USING clause) ──────
-- Drop the old policy that was missing the USING clause for UPDATE/DELETE
DROP POLICY IF EXISTS "service_role_write" ON process_templates;

-- Re-create with both USING and WITH CHECK so all DML operations work
CREATE POLICY "service_role_all" ON process_templates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── process_state_rl_params: add INSERT + UPDATE + service_role policies ──────
-- The existing SELECT policy stays (org-scoped read for authenticated users).
-- Add service_role bypass for all operations (gradient descent upsert + reads).
CREATE POLICY IF NOT EXISTS "service_role_all" ON process_state_rl_params
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Org members can INSERT their own state RL params (needed for first-time upsert)
CREATE POLICY IF NOT EXISTS "org_members_insert" ON process_state_rl_params
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Org members can UPDATE their own state RL params
CREATE POLICY IF NOT EXISTS "org_members_update" ON process_state_rl_params
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- ── Ensure GRANT INSERT/UPDATE so service_role upserts succeed ──────────────
-- service_role already has broad grants in Supabase hosted, but be explicit.
GRANT INSERT, UPDATE ON process_state_rl_params TO service_role;
GRANT INSERT, UPDATE, DELETE ON process_templates TO service_role;
