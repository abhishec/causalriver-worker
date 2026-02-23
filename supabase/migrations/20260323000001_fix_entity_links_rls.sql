-- ============================================================================
-- Fix entity_links RLS: organization_members -> org_members
-- ============================================================================
-- CRITICAL BUG: The entity_links_org_isolation policy references
-- 'organization_members' which does NOT exist. The correct table is 'org_members'.
-- This caused the policy to error on evaluation, returning zero rows for
-- authenticated users — breaking copilot cross-domain queries.
-- ============================================================================

-- Drop the broken policy
DROP POLICY IF EXISTS "entity_links_org_isolation" ON entity_links;

-- Re-create with correct table name (org_members)
CREATE POLICY "entity_links_org_isolation"
  ON entity_links
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid()
    )
  );
