-- ============================================================================
-- Conversation persistence for NexusBrain Copilot
-- ============================================================================

-- Conversations table — stores chat sessions per user per org
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT 'New conversation',
  service_mode    TEXT NOT NULL DEFAULT 'general'
                  CHECK (service_mode IN ('general', 'aas', 'seaas')),
  messages        JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link artifacts to conversations (guard: se_aas_artifacts may not exist yet in all envs)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'se_aas_artifacts') THEN
    ALTER TABLE se_aas_artifacts
      ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_org_user
  ON conversations(org_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_updated
  ON conversations(updated_at DESC);

-- Guard: only create if se_aas_artifacts exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'se_aas_artifacts') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_se_aas_artifacts_conversation') THEN
      CREATE INDEX idx_se_aas_artifacts_conversation
        ON se_aas_artifacts(conversation_id)
        WHERE conversation_id IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ── Auto-update updated_at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_conversations_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_org_isolation ON conversations
  FOR ALL USING (
    org_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );
