-- Unified conversations table — per AI Worker thread tracking
-- ADR-007: Conversations scoped per Worker

CREATE TABLE IF NOT EXISTS conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ai_worker_id      uuid REFERENCES ai_workers(id) ON DELETE CASCADE,
  context_id        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  title             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_message_at   timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_conversations_worker ON conversations(ai_worker_id) WHERE ai_worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_context ON conversations(context_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_worker ON conversations(organization_id, ai_worker_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select" ON conversations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "conversations_insert" ON conversations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON conversations TO authenticated;
