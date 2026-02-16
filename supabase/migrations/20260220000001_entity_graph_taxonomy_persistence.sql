/**
 * Entity Graph + Domain Taxonomy Persistence
 * ============================================
 *
 * Flaw 8: cross-system-entity-graph.ts is 1113 lines of in-memory code.
 * Server restart = lose all entity links. This adds DB-backed persistence.
 *
 * Flaw 9: domain-taxonomy.ts classifications live in memory.
 * Admin overrides, learned sub-domains — all lost on restart.
 *
 * Tables:
 * 1. entity_graph_nodes — Artifacts/entities discovered across connectors
 * 2. entity_graph_edges — Relationships between entities (cross-system links)
 * 3. domain_taxonomy_state — Persisted taxonomy classifications and overrides
 *
 * All tables are org-scoped with RLS.
 */

-- ============================================================================
-- 1. Entity Graph: Nodes (Artifacts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS entity_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  entity_type TEXT NOT NULL,         -- 'developer', 'pr', 'ticket', 'file', 'channel', etc.
  entity_id TEXT NOT NULL,           -- Unique within org+type: 'github#org/repo#PR_123'
  display_name TEXT,                 -- Human-readable: 'Fix auth bug (#123)'
  source_connector TEXT NOT NULL,    -- 'github', 'jira', 'slack', 'pagerduty', etc.
  source_domain TEXT NOT NULL,       -- 'engineering.github', 'support.freshdesk', etc.
  metadata JSONB DEFAULT '{}'::jsonb, -- Connector-specific data
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signal_count INT DEFAULT 1,        -- How many signals reference this entity
  importance REAL DEFAULT 0.5,       -- 0-1 learned importance score

  CONSTRAINT uq_entity_graph_node UNIQUE (organization_id, entity_type, entity_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_entity_nodes_org ON entity_graph_nodes (organization_id);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_type ON entity_graph_nodes (organization_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_connector ON entity_graph_nodes (organization_id, source_connector);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_domain ON entity_graph_nodes (organization_id, source_domain);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_importance ON entity_graph_nodes (organization_id, importance DESC);

-- RLS
ALTER TABLE entity_graph_nodes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'entity_nodes_service_all' AND tablename = 'entity_graph_nodes') THEN
    EXECUTE 'CREATE POLICY entity_nodes_service_all ON entity_graph_nodes FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'entity_nodes_read_org' AND tablename = 'entity_graph_nodes') THEN
    EXECUTE 'CREATE POLICY entity_nodes_read_org ON entity_graph_nodes FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;


-- ============================================================================
-- 2. Entity Graph: Edges (Relationships)
-- ============================================================================
CREATE TABLE IF NOT EXISTS entity_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  source_node_id UUID NOT NULL REFERENCES entity_graph_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES entity_graph_nodes(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,   -- 'authored', 'reviewed', 'references', 'blocks', 'resolves', etc.
  weight REAL DEFAULT 1.0,           -- Relationship strength (0-10)
  confidence REAL DEFAULT 0.5,       -- How confident is this link (0-1)
  evidence_count INT DEFAULT 1,      -- How many signals support this link
  metadata JSONB DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_entity_graph_edge UNIQUE (organization_id, source_node_id, target_node_id, relationship_type)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_entity_edges_org ON entity_graph_edges (organization_id);
CREATE INDEX IF NOT EXISTS idx_entity_edges_source ON entity_graph_edges (source_node_id);
CREATE INDEX IF NOT EXISTS idx_entity_edges_target ON entity_graph_edges (target_node_id);
CREATE INDEX IF NOT EXISTS idx_entity_edges_type ON entity_graph_edges (organization_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_entity_edges_weight ON entity_graph_edges (organization_id, weight DESC);

-- RLS
ALTER TABLE entity_graph_edges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'entity_edges_service_all' AND tablename = 'entity_graph_edges') THEN
    EXECUTE 'CREATE POLICY entity_edges_service_all ON entity_graph_edges FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'entity_edges_read_org' AND tablename = 'entity_graph_edges') THEN
    EXECUTE 'CREATE POLICY entity_edges_read_org ON entity_graph_edges FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;


-- ============================================================================
-- 3. Domain Taxonomy State (Persisted Classifications + Overrides)
-- ============================================================================
CREATE TABLE IF NOT EXISTS domain_taxonomy_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  source_connector TEXT NOT NULL,    -- 'slack', 'github', 'jira', etc.
  source_identifier TEXT NOT NULL,   -- Channel name, repo name, project key, etc.
  resolved_domain TEXT NOT NULL,     -- 'engineering.backend', 'support.tier1', etc.
  confidence REAL NOT NULL DEFAULT 0.5,
  resolution_method TEXT NOT NULL,   -- 'admin_override', 'pattern_match', 'ml_classification', 'default'
  admin_override BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb, -- Extra context (channel topic, repo description, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_taxonomy_state UNIQUE (organization_id, source_connector, source_identifier)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_taxonomy_org ON domain_taxonomy_state (organization_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_connector ON domain_taxonomy_state (organization_id, source_connector);
CREATE INDEX IF NOT EXISTS idx_taxonomy_domain ON domain_taxonomy_state (organization_id, resolved_domain);
CREATE INDEX IF NOT EXISTS idx_taxonomy_admin ON domain_taxonomy_state (organization_id, admin_override) WHERE admin_override = TRUE;

-- RLS
ALTER TABLE domain_taxonomy_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'taxonomy_service_all' AND tablename = 'domain_taxonomy_state') THEN
    EXECUTE 'CREATE POLICY taxonomy_service_all ON domain_taxonomy_state FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'taxonomy_read_org' AND tablename = 'domain_taxonomy_state') THEN
    EXECUTE 'CREATE POLICY taxonomy_read_org ON domain_taxonomy_state FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

-- Allow org members to create admin overrides via the UI
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'taxonomy_write_org' AND tablename = 'domain_taxonomy_state') THEN
    EXECUTE 'CREATE POLICY taxonomy_write_org ON domain_taxonomy_state FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'taxonomy_update_org' AND tablename = 'domain_taxonomy_state') THEN
    EXECUTE 'CREATE POLICY taxonomy_update_org ON domain_taxonomy_state FOR UPDATE TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;


-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE entity_graph_nodes IS 'Cross-system entity graph nodes. Persists artifact/entity discovery from all connectors. Flaw 8 fix.';
COMMENT ON TABLE entity_graph_edges IS 'Cross-system entity relationships. Enables graph traversal for impact analysis, bottleneck detection.';
COMMENT ON TABLE domain_taxonomy_state IS 'Persisted domain classifications and admin overrides. Flaw 9 fix. Survives server restarts.';
