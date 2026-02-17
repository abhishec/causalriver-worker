-- =============================================================================
-- Track 2 — Full Release Tracking
-- =============================================================================
--
-- Adds two new tables:
--   release_entities       — one row per release (6.3.4, 5.11.5-enterprise)
--   release_entity_links   — links a release to commits, PRs, Jira tickets
--
-- These enable SE-aaS to answer:
--   "What Jira tickets are in the 5.11.5 Drop 1?"
--   "What changed between 5.11.4.3 and 5.11.5?"
--   "What is the release readiness score for 6.3.4?"
--   "Show me Team B's velocity per drop"
--
-- Safe to run multiple times (all IF NOT EXISTS).
-- =============================================================================

-- ── 1. release_entities ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS release_entities (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL,

  -- Identity
  release_name      TEXT        NOT NULL,   -- '6.3.4', '5.11.5-enterprise'
  release_type      TEXT        NOT NULL DEFAULT 'patch',
                                            -- 'major' | 'minor' | 'patch' | 'enterprise'
  -- Lineage
  base_version      TEXT,                   -- '6.3.3', '5.11.4.3'
  branch_name       TEXT        NOT NULL,   -- 'release/6.3.4'

  -- Schedule
  target_date       DATE,                   -- 2026-04-07
  drop_number       INTEGER,               -- 1 or 2 (for enterprise drops)
  drop_date         DATE,                   -- 2026-02-26, 2026-03-15

  -- Team
  team_label        TEXT,                   -- 'team-634', 'team-5115'
  team_members      JSONB       DEFAULT '[]',
                                            -- ['Bao','Ravi','Mayank','Nitish','Ganesh']
  -- Source links
  github_repo       TEXT,                   -- 'tookitaki/aml-engine'
  jira_project_key  TEXT,                   -- 'TM'
  jira_fix_version  TEXT,                   -- maps to Jira fixVersion field name

  -- Status
  status            TEXT        NOT NULL DEFAULT 'in_progress',
                                            -- 'planned' | 'in_progress' | 'released'

  metadata          JSONB       DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, release_name, drop_number)
);

COMMENT ON TABLE release_entities
  IS 'One row per software release. Connects branch, team, Jira fixVersion, and schedule.';

CREATE INDEX IF NOT EXISTS idx_release_entities_org
  ON release_entities (organization_id);

CREATE INDEX IF NOT EXISTS idx_release_entities_branch
  ON release_entities (organization_id, branch_name);

CREATE INDEX IF NOT EXISTS idx_release_entities_status
  ON release_entities (organization_id, status)
  WHERE status = 'in_progress';

-- ── 2. release_entity_links ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS release_entity_links (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID    NOT NULL,
  release_id        UUID    NOT NULL REFERENCES release_entities(id) ON DELETE CASCADE,

  entity_type       TEXT    NOT NULL,   -- 'commit' | 'pull_request' | 'jira_issue' | 'git_tag'
  entity_id         TEXT    NOT NULL,   -- matches cross_domain_signals.entity_id

  -- How this link was discovered
  link_source       TEXT    NOT NULL,   -- 'git_tag' | 'jira_fixversion' | 'branch_merge' | 'github_compare' | 'manual'
  confidence        NUMERIC DEFAULT 1.0,

  metadata          JSONB   DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, release_id, entity_type, entity_id)
);

COMMENT ON TABLE release_entity_links
  IS 'Links releases to their constituent commits, PRs, and Jira tickets.';

CREATE INDEX IF NOT EXISTS idx_release_links_release
  ON release_entity_links (release_id);

CREATE INDEX IF NOT EXISTS idx_release_links_entity
  ON release_entity_links (organization_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_release_links_type
  ON release_entity_links (organization_id, link_source);

-- ── 3. RLS policies ──────────────────────────────────────────────────────

ALTER TABLE release_entities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_entity_links  ENABLE ROW LEVEL SECURITY;

-- Read: org members only
CREATE POLICY "org_members_read_release_entities" ON release_entities
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_read_release_entity_links" ON release_entity_links
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Write: service role only (connector writes, not direct user writes)
CREATE POLICY "service_role_all_release_entities" ON release_entities
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_release_entity_links" ON release_entity_links
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON release_entities      TO service_role;
GRANT ALL ON release_entity_links  TO service_role;
GRANT SELECT ON release_entities      TO authenticated;
GRANT SELECT ON release_entity_links  TO authenticated;
