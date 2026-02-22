-- =============================================================================
-- Fix: org_members RLS infinite recursion (definitive)
-- =============================================================================
-- Multiple policies on org_members contain self-referencing subqueries
-- (SELECT ... FROM org_members inside a policy ON org_members).
-- PostgreSQL evaluates ALL policies for a given operation (OR'd together),
-- so even one self-referencing policy causes infinite recursion (42P17).
--
-- Policies that cause recursion:
--   - platform_admin_read_all_members  (SELECT, from 20260221000002)
--   - member_insert_by_org_admin       (INSERT, from 20250219000001)
--   - member_update_by_org_admin       (UPDATE, from 20250219000001)
--   - member_delete_by_org_admin       (DELETE, from 20250219000001)
--   - admin_update_members             (UPDATE, from 20250218000002)
--
-- Fix: Drop ALL self-referencing policies. Keep only simple user_id = auth.uid()
-- policies. Admin/owner operations go through service_role client which
-- bypasses RLS entirely (service_role has BYPASSRLS privilege in Supabase).
-- =============================================================================

-- ── Drop ALL self-referencing policies ──────────────────────────────────────
DROP POLICY IF EXISTS "member_read_own" ON org_members;
DROP POLICY IF EXISTS "platform_admin_read_all_members" ON org_members;
DROP POLICY IF EXISTS "member_insert_by_org_admin" ON org_members;
DROP POLICY IF EXISTS "member_update_by_org_admin" ON org_members;
DROP POLICY IF EXISTS "member_delete_by_org_admin" ON org_members;
DROP POLICY IF EXISTS "admin_update_members" ON org_members;
DROP POLICY IF EXISTS "member_insert_by_trigger" ON org_members;
DROP POLICY IF EXISTS "service_full_access_org_members" ON org_members;

-- ── Simple, non-recursive policies ──────────────────────────────────────────
-- Users can read their own memberships only.
CREATE POLICY "member_read_own" ON org_members
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own membership (signup flow).
CREATE POLICY "member_insert_own" ON org_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own membership (e.g. display preferences).
CREATE POLICY "member_update_own" ON org_members
  FOR UPDATE USING (user_id = auth.uid());

-- All admin operations (adding/removing members, changing roles, cross-org
-- visibility) are handled by the service_role client in API routes, which
-- bypasses RLS entirely. No additional policies needed.
