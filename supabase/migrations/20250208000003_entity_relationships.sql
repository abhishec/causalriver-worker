-- =============================================================================
-- Entity Relationships Table
--
-- Stores extracted entity-to-entity relationships across all domains.
-- E.g. "Person X works at Company Y", "Product A depends on Technology B"
-- =============================================================================

CREATE TABLE IF NOT EXISTS entity_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_entity_type TEXT NOT NULL DEFAULT 'unknown',
  target_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL DEFAULT 'unknown',
  relationship_type TEXT NOT NULL,
  context TEXT,
  confidence NUMERIC DEFAULT 0.8,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_rel_org
  ON entity_relationships (organization_id);
CREATE INDEX IF NOT EXISTS idx_entity_rel_source
  ON entity_relationships (organization_id, source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_rel_target
  ON entity_relationships (organization_id, target_entity_type, target_entity_id);
