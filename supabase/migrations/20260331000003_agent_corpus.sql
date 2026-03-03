-- ADR-029: Trained Capability Agents — agent_corpus table
--
-- Links specific documents/chunks to a specific agent session or worker.
-- Instead of the global document_chunks pool, an agent can have its own
-- scoped corpus with accumulated few-shot examples and extracted style profiles.
--
-- Enables: per-agent training, style-matched output, improving over time via feedback.

CREATE TABLE IF NOT EXISTS agent_corpus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Ownership (at least one should be set)
  agent_session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  ai_worker_id UUID,

  -- Identity
  corpus_name TEXT NOT NULL,

  -- Which document_chunks belong to this corpus
  document_filter JSONB NOT NULL DEFAULT '{}',
  -- { sourceTypes: [...], documentIds: [...], ingestionJobIds: [...] }

  -- Few-shot examples (user-approved outputs from previous turns)
  few_shot_examples JSONB DEFAULT '[]',
  -- [{ input, output, quality, turn_id, created_at }]

  -- Style profile (extracted from corpus by Haiku)
  style_profile JSONB DEFAULT '{}',
  -- { avgSentenceLength, vocabulary, patterns, formatting, templates }

  -- Stats
  total_documents INTEGER DEFAULT 0,
  total_examples INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_corpus_session
  ON agent_corpus (agent_session_id)
  WHERE agent_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_corpus_worker
  ON agent_corpus (ai_worker_id)
  WHERE ai_worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_corpus_org
  ON agent_corpus (organization_id);

-- RLS
ALTER TABLE agent_corpus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_corpus_select_own_org" ON agent_corpus
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agent_corpus_insert_own_org" ON agent_corpus
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Grants
GRANT SELECT, INSERT ON agent_corpus TO authenticated;
GRANT ALL ON agent_corpus TO service_role;
