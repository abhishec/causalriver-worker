-- ============================================================================
-- entity_links: Cross-Domain Entity Relationship Store
-- ============================================================================
-- This table is THE CRITICAL piece for NexusBrain cross-domain intelligence.
-- Without it, GitHub, Jira, and Slack are isolated silos.
-- With it, the Brain can answer:
--   "What Jira tickets are linked to the velocity collapse?"
--   "Which Slack channels discussed PR #456?"
--   "Show me everything related to PROJ-1234 — PRs, commits, conversations"
--
-- Populated by: cross-domain-linker.ts (called during connector ingestion)
-- Queried by: Copilot, SE-aaS domains, Early Warning System
-- ============================================================================

CREATE TABLE IF NOT EXISTS entity_links (
  id                  UUID            DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     UUID            NOT NULL,

  -- Source entity (e.g. GitHub PR, Slack message, GitHub commit)
  source_entity_id    TEXT            NOT NULL,   -- e.g. "backend#456" or "slack#C01234_ts#1234"
  source_domain       TEXT            NOT NULL,   -- 'engineering' | 'communication' | 'product'
  source_type         TEXT            NOT NULL,   -- 'pull_request' | 'slack_message' | 'commit'

  -- Target entity (e.g. Jira ticket, GitHub PR)
  target_entity_id    TEXT            NOT NULL,   -- e.g. "jira#PROJ-1234" or "backend#456"
  target_domain       TEXT            NOT NULL,   -- 'product' | 'engineering'
  target_type         TEXT            NOT NULL,   -- 'jira_issue' | 'pull_request'

  -- Link metadata
  link_type           TEXT            NOT NULL,   -- 'pr_references_ticket' | 'slack_mentions_pr' | 'commit_references_ticket'
  confidence          FLOAT           NOT NULL DEFAULT 0.8,  -- 0.0-1.0
  evidence            TEXT            NOT NULL DEFAULT '',   -- Human-readable explanation

  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Prevent duplicate links for the same relationship
  UNIQUE (organization_id, source_entity_id, target_entity_id, link_type)
);

-- ============================================================================
-- INDEXES — optimized for the query patterns in cross-domain-linker.ts
-- ============================================================================

-- Fast lookup: "What is linked to this Jira ticket?"
CREATE INDEX IF NOT EXISTS entity_links_target_idx
  ON entity_links (organization_id, target_entity_id, target_type);

-- Fast lookup: "What Jira tickets does this PR reference?"
CREATE INDEX IF NOT EXISTS entity_links_source_idx
  ON entity_links (organization_id, source_entity_id, source_type);

-- Fast lookup: "All links of a specific type in this org"
CREATE INDEX IF NOT EXISTS entity_links_type_idx
  ON entity_links (organization_id, link_type, created_at DESC);

-- Fast lookup: "All cross-domain links in a time window (sprint report)"
CREATE INDEX IF NOT EXISTS entity_links_created_idx
  ON entity_links (organization_id, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE entity_links ENABLE ROW LEVEL SECURITY;

-- Only users in the same organization can see entity links
CREATE POLICY "entity_links_org_isolation"
  ON entity_links
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role can read/write all (for connector ingestion)
CREATE POLICY "entity_links_service_role"
  ON entity_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_entity_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_links_updated_at
  BEFORE UPDATE ON entity_links
  FOR EACH ROW
  EXECUTE FUNCTION update_entity_links_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE entity_links IS
  'Cross-domain entity relationships — the connective tissue linking GitHub PRs, Jira tickets, and Slack messages. '
  'Populated by cross-domain-linker.ts during connector ingestion. '
  'Queried by Copilot to answer multi-domain questions.';

COMMENT ON COLUMN entity_links.source_entity_id IS
  'ID of the entity that REFERENCES or MENTIONS the target. Format: "{domain_prefix}#{id}" e.g. "backend#456"';

COMMENT ON COLUMN entity_links.target_entity_id IS
  'ID of the entity being referenced. Format: "jira#{ticket_key}" or "{repo}#{pr_number}"';

COMMENT ON COLUMN entity_links.link_type IS
  'Type of relationship: pr_references_ticket | slack_mentions_pr | slack_mentions_ticket | commit_references_ticket';

COMMENT ON COLUMN entity_links.confidence IS
  '0.0-1.0 confidence score. 0.95 = found in PR title. 0.80 = found in PR body/branch. 0.70 = weak text match.';

COMMENT ON COLUMN entity_links.evidence IS
  'Human-readable string explaining WHY this link was created, e.g. "Ticket PROJ-1234 found in PR title"';
