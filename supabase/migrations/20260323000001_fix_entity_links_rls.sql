-- ============================================================================
-- Fix entity_links RLS: organization_members -> org_members
-- ============================================================================
-- CRITICAL BUG: The entity_links_org_isolation policy references
-- 'organization_members' which does NOT exist. The correct table is 'org_members'.
-- This caused the policy to error on evaluation, returning zero rows for
-- authenticated users — breaking copilot cross-domain queries.
--
-- SAFETY: Only runs if entity_links table exists (may not in all environments).
-- ============================================================================

DO $$
BEGIN
  -- Only fix the policy if the table actually exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entity_links' AND table_schema = 'public') THEN
    -- Drop the broken policy
    EXECUTE 'DROP POLICY IF EXISTS "entity_links_org_isolation" ON entity_links';

    -- Re-create with correct table name (org_members)
    EXECUTE '
      CREATE POLICY "entity_links_org_isolation"
        ON entity_links
        FOR ALL
        TO authenticated
        USING (
          organization_id IN (
            SELECT organization_id FROM org_members
            WHERE user_id = auth.uid()
          )
        )';

    RAISE NOTICE 'Fixed entity_links_org_isolation policy: organization_members -> org_members';
  ELSE
    RAISE NOTICE 'entity_links table does not exist — skipping RLS fix (will be created with correct policy later)';
  END IF;
END;
$$;
