-- =============================================================================
-- Branch & Release Tracking — Track 1 MVP
-- =============================================================================
--
-- Adds three columns to cross_domain_signals so every GitHub commit, PR,
-- review, and code-file signal carries branch and release context.
-- Also extends entity_links with the same context so cross-domain links
-- (PR ↔ Jira ticket) can be scoped to a specific release branch.
--
-- Zero breaking changes: all new columns are nullable with no defaults.
-- Safe to apply against existing data — old rows will have NULLs.
--
-- Enables queries like:
--   SELECT * FROM cross_domain_signals
--   WHERE branch_name = 'release/6.3.4' AND signal_type = 'pr_merged';
--
--   SELECT * FROM cross_domain_signals
--   WHERE release_version = '5.11.5' AND team_label = 'team-5115';
-- =============================================================================

-- ── 1. cross_domain_signals ────────────────────────────────────────────────

ALTER TABLE cross_domain_signals
  ADD COLUMN IF NOT EXISTS branch_name     TEXT,
  ADD COLUMN IF NOT EXISTS release_version TEXT,
  ADD COLUMN IF NOT EXISTS team_label      TEXT;

COMMENT ON COLUMN cross_domain_signals.branch_name
  IS 'Git branch this signal originated from, e.g. ''release/6.3.4''';
COMMENT ON COLUMN cross_domain_signals.release_version
  IS 'Normalised release version label, e.g. ''6.3.4'', ''5.11.5''';
COMMENT ON COLUMN cross_domain_signals.team_label
  IS 'Logical team identifier, e.g. ''team-634'', ''team-5115''';

-- Sparse indexes — only created for rows that have these values (partial index).
-- Keeps index size minimal since most historical signals will have NULLs.
CREATE INDEX IF NOT EXISTS idx_signals_branch_name
  ON cross_domain_signals (organization_id, branch_name)
  WHERE branch_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signals_release_version
  ON cross_domain_signals (organization_id, release_version)
  WHERE release_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signals_team_label
  ON cross_domain_signals (organization_id, team_label)
  WHERE team_label IS NOT NULL;

-- Composite index for the most common SE-aaS query pattern:
-- "show me all merged PRs on release/6.3.4"
CREATE INDEX IF NOT EXISTS idx_signals_branch_type
  ON cross_domain_signals (organization_id, branch_name, signal_type)
  WHERE branch_name IS NOT NULL;

-- ── 2. entity_links ────────────────────────────────────────────────────────
-- entity_links connects PRs ↔ Jira tickets. Adding branch context lets us
-- answer: "which Jira tickets are linked to PRs on release/6.3.4?"

ALTER TABLE entity_links
  ADD COLUMN IF NOT EXISTS branch_name     TEXT,
  ADD COLUMN IF NOT EXISTS release_version TEXT;

COMMENT ON COLUMN entity_links.branch_name
  IS 'Branch context for this cross-domain link, e.g. ''release/6.3.4''';
COMMENT ON COLUMN entity_links.release_version
  IS 'Release version context for this link, e.g. ''6.3.4''';

CREATE INDEX IF NOT EXISTS idx_entity_links_branch
  ON entity_links (organization_id, branch_name)
  WHERE branch_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entity_links_release
  ON entity_links (organization_id, release_version)
  WHERE release_version IS NOT NULL;
