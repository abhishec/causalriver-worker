-- Fix: service_health RLS — scope bypass policy to service_role only
-- =======================================================================
-- Problem: The original "service role bypass service_health" policy uses
-- FOR ALL USING (true) WITH CHECK (true) with no role restriction.
-- This means any authenticated user can INSERT/UPDATE/DELETE any org's
-- service health rows — a cross-tenant write vulnerability.
--
-- Fix: Drop the unscoped policy. Add:
--   1. A service_role-only bypass (for server-side brain writers)
--   2. A scoped write policy for the server API (uses service_role via admin client)
--
-- Also: expand service_type CHECK constraint to include pm-aas (was missing).
-- ============================================================================

-- Step 1: Drop the unscoped bypass policy
DROP POLICY IF EXISTS "service role bypass service_health" ON service_health;

-- Step 2: Add properly scoped service_role bypass
CREATE POLICY "service_role_full_access_service_health"
  ON service_health
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Step 3: Allow authenticated users to write service_health for their own org
-- (needed for any UI-triggered health writes; server API uses service_role)
CREATE POLICY "members_insert_own_service_health"
  ON service_health
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "members_update_own_service_health"
  ON service_health
  FOR UPDATE
  TO authenticated
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

-- Step 4: Expand service_type CHECK constraint to include pm-aas
-- (original only had 'se-aas', 'aas', 'process-engine')
ALTER TABLE service_health
  DROP CONSTRAINT IF EXISTS service_health_service_type_check;

ALTER TABLE service_health
  ADD CONSTRAINT service_health_service_type_check
  CHECK (service_type IN ('se-aas', 'aas', 'process-engine', 'pm-aas', 'process-intelligence'));
