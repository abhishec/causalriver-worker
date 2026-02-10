-- =============================================================================
-- Federation Settings & Audit Log
--
-- Supports bidirectional federation:
--   1. org_federation_settings: per-org flag controlling upstream contribution
--   2. federation_upstream_log: audit trail of anonymized knowledge promotions
-- =============================================================================

-- Per-org federation settings (controls upstream knowledge flow)
CREATE TABLE IF NOT EXISTS organization_federation_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL UNIQUE,
  contribute_to_core_brain BOOLEAN DEFAULT true,
  anonymization_level TEXT DEFAULT 'standard',
  excluded_domains TEXT[] DEFAULT '{}',
  last_upstream_at TIMESTAMPTZ,
  upstream_items_contributed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_federation_settings_org
  ON organization_federation_settings (organization_id);

-- Audit log for upstream federation (tracks what was promoted and when)
CREATE TABLE IF NOT EXISTS federation_upstream_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_organization_id UUID NOT NULL,
  data_type TEXT NOT NULL,  -- 'relationship', 'memory', 'rule'
  original_record_id UUID,
  sanitization_report JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_federation_log_org
  ON federation_upstream_log (source_organization_id, created_at DESC);
