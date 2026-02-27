-- supabase/migrations/20260228000004_process_templates.sql
-- Process Template Library: successful domain sequences become reusable institutional knowledge.
-- Sequences used 3+ times with >70% success rate are auto-discovered by extractProcessTemplates().
-- is_public = true templates are shared across all orgs (the process marketplace).

CREATE TABLE IF NOT EXISTS process_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,           -- NULL = global/core template (cross-org)
  name TEXT NOT NULL,
  description TEXT,
  domain_sequence TEXT[] NOT NULL,  -- e.g. ['pod-match', 'early-warning', 'delivery-intelligence']
  trigger_conditions JSONB DEFAULT '{}', -- when to apply this template
  success_rate NUMERIC DEFAULT 0.0,   -- 0-1, computed from outcomes
  avg_confidence NUMERIC DEFAULT 0.0,
  usage_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT false,    -- cross-org sharing
  source TEXT DEFAULT 'discovered',   -- 'discovered' | 'manual' | 'imported'
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_process_templates_org ON process_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_process_templates_public ON process_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_process_templates_sequence ON process_templates USING GIN(domain_sequence);

-- Unique constraint to support upsert by (organization_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_process_templates_org_name
  ON process_templates(organization_id, name)
  WHERE organization_id IS NOT NULL;

-- Unique constraint for global templates (organization_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_process_templates_global_name
  ON process_templates(name)
  WHERE organization_id IS NULL;

ALTER TABLE process_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_own_and_public" ON process_templates
  FOR SELECT USING (
    is_public = true OR
    organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "service_role_write" ON process_templates
  FOR ALL WITH CHECK (auth.role() = 'service_role');
