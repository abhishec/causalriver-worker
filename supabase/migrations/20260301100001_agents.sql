-- Agents table — task-scoped entities under AI Workers
-- ADR-002: Agent is task-scoped, lives under a Worker, persists as history

CREATE TABLE IF NOT EXISTS agents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_worker_id      uuid NOT NULL REFERENCES ai_workers(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              text NOT NULL,
  purpose           text,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'archived')),
  created_by        text NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'planner', 'orchestrator')),
  result            jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agents_worker ON agents(ai_worker_id);
CREATE INDEX IF NOT EXISTS idx_agents_org ON agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(ai_worker_id, status);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_select" ON agents
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agents_insert" ON agents
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agents_update" ON agents
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON agents TO authenticated;
