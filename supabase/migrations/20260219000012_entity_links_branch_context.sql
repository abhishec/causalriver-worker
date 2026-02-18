-- ============================================================================
-- entity_links: Add branch_name + release_version columns
-- ============================================================================
-- Fixes Bug 1+2: cross-domain-linker.ts writes these fields on every EntityLink
-- but the table schema was missing them, causing silent data loss on upsert.
--
-- With these columns:
--   - linkPRToJira() can tag every PR→Jira link with which branch it came from
--   - linkCommitToJira() can tag every commit→Jira link with branch context
--   - getLinkedEntitiesForBranch() can filter by branch_name to isolate Team A/B
--   - Two-branch isolation is complete end-to-end (not just in release_entity_links)
-- ============================================================================

-- Wrap in DO block so this migration is safe to run before or after
-- 20260221000001_entity_links.sql (which creates the table). If the table
-- does not exist yet, this migration is a no-op; the columns will be added
-- by 20260221000001 which already includes them via CREATE TABLE.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entity_links' AND table_schema = 'public') THEN
    ALTER TABLE entity_links
      ADD COLUMN IF NOT EXISTS branch_name     TEXT,
      ADD COLUMN IF NOT EXISTS release_version TEXT;

    CREATE INDEX IF NOT EXISTS entity_links_branch_idx
      ON entity_links (organization_id, branch_name, target_type)
      WHERE branch_name IS NOT NULL;

    CREATE INDEX IF NOT EXISTS entity_links_release_version_idx
      ON entity_links (organization_id, release_version, target_type)
      WHERE release_version IS NOT NULL;
  END IF;
END $$;
