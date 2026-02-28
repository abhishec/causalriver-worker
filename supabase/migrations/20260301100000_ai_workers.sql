-- AI Workers table — permanent entities, not jobs
-- ADR-001: AI Worker is a permanent entity with identity, copilot, agents

CREATE TABLE IF NOT EXISTS ai_workers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  service_type      text CHECK (service_type IN ('se-aas', 'aas', 'pm-aas')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'provisioning', 'paused', 'archived')),
  config            jsonb DEFAULT '{}',
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_workers_org ON ai_workers(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_workers_status ON ai_workers(organization_id, status);

ALTER TABLE ai_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_workers_select" ON ai_workers
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_workers_insert" ON ai_workers
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_workers_update" ON ai_workers
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON ai_workers TO authenticated;
