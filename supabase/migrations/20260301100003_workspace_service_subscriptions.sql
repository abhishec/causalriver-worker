-- Tracks which services a workspace has purchased
-- ADR-006: Billing is workspace-level. Assignment is worker-level.

CREATE TABLE IF NOT EXISTS workspace_service_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_type      text NOT NULL CHECK (service_type IN ('se-aas', 'aas', 'pm-aas')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'inactive')),
  activated_at      timestamptz NOT NULL DEFAULT now(),
  activated_by      uuid REFERENCES auth.users(id),
  UNIQUE(organization_id, service_type)
);

CREATE INDEX IF NOT EXISTS idx_workspace_services_org ON workspace_service_subscriptions(organization_id);

ALTER TABLE workspace_service_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_services_select" ON workspace_service_subscriptions
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_services_insert" ON workspace_service_subscriptions
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON workspace_service_subscriptions TO authenticated;

-- Seed subscriptions from existing agent_queue data (infer what's in use)
INSERT INTO workspace_service_subscriptions (organization_id, service_type, status)
SELECT DISTINCT organization_id, agent_type, 'active'
FROM agent_queue
WHERE agent_type IN ('se-aas', 'aas', 'pm-aas')
ON CONFLICT (organization_id, service_type) DO NOTHING;
