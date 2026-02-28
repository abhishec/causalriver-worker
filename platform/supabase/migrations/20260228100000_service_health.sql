-- Service Health Table
-- ====================
-- Decouples domain tables from brain-context.ts.
-- Services write here; brain reads from here (with fallback to direct queries).
-- L26 (SE-aaS), L27 (AaaS), L28 (Process Engine) each get one row per org.

CREATE TABLE IF NOT EXISTS service_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES ai_workspace(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL CHECK (service_type IN ('se-aas', 'aas', 'process-engine')),
  summary JSONB NOT NULL DEFAULT '{}',
  context_string TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, service_type)
);

ALTER TABLE service_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read service_health"
  ON service_health FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service role bypass service_health"
  ON service_health FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_service_health_org_service
  ON service_health(organization_id, service_type);
