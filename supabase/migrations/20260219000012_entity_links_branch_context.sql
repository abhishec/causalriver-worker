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

ALTER TABLE entity_links
  ADD COLUMN IF NOT EXISTS branch_name     TEXT,
  ADD COLUMN IF NOT EXISTS release_version TEXT;

-- Index for branch-scoped cross-domain queries
-- e.g. "All Jira tickets linked from PRs on release/6.3.4"
CREATE INDEX IF NOT EXISTS entity_links_branch_idx
  ON entity_links (organization_id, branch_name, target_type)
  WHERE branch_name IS NOT NULL;

-- Index for release-version-scoped queries
CREATE INDEX IF NOT EXISTS entity_links_release_version_idx
  ON entity_links (organization_id, release_version, target_type)
  WHERE release_version IS NOT NULL;

COMMENT ON COLUMN entity_links.branch_name IS
  'Git branch that produced this link, e.g. "release/6.3.4". '
  'Enables branch-scoped cross-domain queries to isolate Team A from Team B.';

COMMENT ON COLUMN entity_links.release_version IS
  'Release version string matching jira_fix_version, e.g. "6.3.4". '
  'Set from GitHubConnector releaseVersionMap at ingestion time.';
