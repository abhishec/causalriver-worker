-- =============================================================================
-- Contributor Expertise Graph
-- =============================================================================
-- Generic expertise tracking that maps contributors to topics/code areas.
-- Fed by ANY connector: GitHub (PRs, reviews), Slack (discussions),
-- Jira (issue resolution), PagerDuty (incident response), etc.
--
-- Enables: "Who knows about X?", "Who should review this PR?",
-- "Who is the expert on the authentication system?"

CREATE TABLE IF NOT EXISTS contributor_expertise (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  -- Canonical contributor ID (from resolved_entities or external ID)
  contributor_id TEXT NOT NULL,
  -- Display name for the contributor
  contributor_name TEXT,
  -- What they have expertise in: code path, technology, domain area
  -- e.g., "src/auth/", "react", "payment-service", "incident-response"
  topic TEXT NOT NULL,
  -- How the expertise was evidenced
  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'code_change', 'review', 'issue_resolution',
    'discussion', 'documentation', 'incident_response'
  )),
  -- Expertise strength: 0 (none) to 1 (strong expert), decays over time
  strength NUMERIC NOT NULL DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),
  -- Number of evidence instances
  evidence_count INTEGER NOT NULL DEFAULT 1,
  -- When this contributor last had activity on this topic
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- One expertise edge per contributor + topic + evidence type per org
  UNIQUE (organization_id, contributor_id, topic, evidence_type)
);

-- Find experts for a topic within an org
CREATE INDEX idx_expertise_org_topic ON contributor_expertise (organization_id, topic);
-- Find all expertise for a contributor
CREATE INDEX idx_expertise_org_contributor ON contributor_expertise (organization_id, contributor_id);
-- Find top experts (sorted by strength)
CREATE INDEX idx_expertise_org_strength ON contributor_expertise (organization_id, strength DESC);
-- Find stale expertise for decay
CREATE INDEX idx_expertise_last_activity ON contributor_expertise (last_activity_at);

-- RLS: service role has full access
ALTER TABLE contributor_expertise ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on contributor_expertise"
  ON contributor_expertise FOR ALL
  USING (auth.role() = 'service_role');


-- =============================================================================
-- Alert Routing Rules
-- =============================================================================
-- Configurable rules for routing cascade alerts to the right channels
-- and people. Supports expertise-based routing (auto-mention domain experts).

CREATE TABLE IF NOT EXISTS alert_routing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  -- Which domains trigger this route
  trigger_domains TEXT[] NOT NULL,
  -- Minimum severity to trigger: 'low', 'medium', 'high', 'critical'
  min_severity TEXT NOT NULL DEFAULT 'medium',
  -- Where to send: [{"type": "slack", "target": "#incidents"}, ...]
  channels JSONB NOT NULL DEFAULT '[]',
  -- Optional keyword filter
  keywords TEXT[],
  -- Whether to auto-mention the top expert from the expertise graph
  mention_experts BOOLEAN DEFAULT false,
  -- Whether this rule is active
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_routing_org ON alert_routing_rules (organization_id);

ALTER TABLE alert_routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on alert_routing_rules"
  ON alert_routing_rules FOR ALL
  USING (auth.role() = 'service_role');
