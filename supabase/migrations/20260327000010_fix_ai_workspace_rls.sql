-- =============================================================================
-- Fix: ai_workspace RLS — scope service_role policy to service_role only
-- =============================================================================
-- The original migration created a "service role full access" policy with
-- USING (true) WITH CHECK (true) — this incorrectly applies to ALL roles
-- (authenticated users included), allowing any user to INSERT or UPDATE any
-- org's workspace row via the user-scoped client.
--
-- Fix: Drop the permissive policy and recreate it scoped to service_role.
-- Authenticated users retain SELECT via "members can view own workspace".
-- All writes (INSERT/UPDATE/DELETE) are service_role only — workspace config
-- is managed by the backend worker, never directly by the user client.
-- =============================================================================

-- Drop the over-permissive policy
DROP POLICY IF EXISTS "service role full access" ON ai_workspace;

-- Recreate scoped to service_role only (FOR ALL = SELECT + INSERT + UPDATE + DELETE)
CREATE POLICY "service_role_full_access" ON ai_workspace
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Grant to service_role explicitly (authenticated already has SELECT via other policy)
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_workspace TO service_role;
