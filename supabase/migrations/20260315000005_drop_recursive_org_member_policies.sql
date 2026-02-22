-- =============================================================================
-- Fix: Drop remaining self-referencing org_members policies
-- =============================================================================
-- Migration 20260315000003 only dropped member_read_own but missed these
-- additional policies that also contain self-referencing subqueries on
-- org_members, causing PostgreSQL infinite recursion (42P17):
--
--   platform_admin_read_all_members  — SELECT with EXISTS(SELECT FROM org_members)
--   member_insert_by_org_admin       — INSERT with subquery on org_members
--   member_update_by_org_admin       — UPDATE with subquery on org_members
--   member_delete_by_org_admin       — DELETE with subquery on org_members
--   admin_update_members             — UPDATE with EXISTS(SELECT FROM org_members)
--   member_insert_by_trigger         — overly permissive (FOR INSERT WITH CHECK true)
--   service_full_access_org_members  — overly permissive (FOR ALL USING true)
--
-- After this migration, org_members has ONLY these non-recursive policies:
--   member_read_own    — SELECT WHERE user_id = auth.uid()
--   member_insert_own  — INSERT WHERE user_id = auth.uid()
--   member_update_own  — UPDATE WHERE user_id = auth.uid()
--
-- All admin operations (cross-org reads, adding/removing members, role changes)
-- go through the service_role client which has BYPASSRLS privilege.
-- =============================================================================

DROP POLICY IF EXISTS "platform_admin_read_all_members" ON org_members;
DROP POLICY IF EXISTS "member_insert_by_org_admin" ON org_members;
DROP POLICY IF EXISTS "member_update_by_org_admin" ON org_members;
DROP POLICY IF EXISTS "member_delete_by_org_admin" ON org_members;
DROP POLICY IF EXISTS "admin_update_members" ON org_members;
DROP POLICY IF EXISTS "member_insert_by_trigger" ON org_members;
DROP POLICY IF EXISTS "service_full_access_org_members" ON org_members;
