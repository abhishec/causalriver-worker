-- ADR-029: Trained Capability Agents — agent_sessions + agent_session_turns
--
-- Links sequential agent invocations into interactive sessions.
-- Critical for use cases where the agent goes through multiple rounds
-- of user feedback (e.g., Product Analyst writing user stories).
--
-- Sessions accumulate context across turns and maintain per-agent knowledge scope.

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ai_worker_id UUID,

  -- Session identity
  agent_type TEXT NOT NULL,       -- 'product-analyst' | 'competitor-intel' | custom
  session_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),

  -- Knowledge scope: constrains RAG retrieval to only this agent's corpus
  knowledge_scope JSONB DEFAULT '{}',
  -- { documentIds: [...], ingestionJobIds: [...] }

  -- Accumulated context across turns
  session_context JSONB DEFAULT '{}',
  -- { turnCount, lastUserInput, learnedPreferences, styleGuide, ... }

  turn_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Per-session turns: records each interaction
CREATE TABLE IF NOT EXISTS agent_session_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,

  -- Content
  user_input TEXT,
  agent_output TEXT,

  -- Feedback loop
  user_feedback TEXT,    -- 'approved' | 'rejected' | 'revised'
  revision_notes TEXT,   -- what the user changed/requested

  -- Optional link to brain_agent_tasks
  task_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_sessions_org_status
  ON agent_sessions (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_worker
  ON agent_sessions (ai_worker_id, status)
  WHERE ai_worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_session_turns_session
  ON agent_session_turns (session_id, turn_number);

-- RLS
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_session_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_sessions_select_own_org" ON agent_sessions
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agent_sessions_insert_own_org" ON agent_sessions
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agent_session_turns_select_via_session" ON agent_session_turns
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM agent_sessions WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "agent_session_turns_insert_via_session" ON agent_session_turns
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT id FROM agent_sessions WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

-- Grants
GRANT SELECT, INSERT ON agent_sessions TO authenticated;
GRANT SELECT, INSERT ON agent_session_turns TO authenticated;
GRANT ALL ON agent_sessions TO service_role;
GRANT ALL ON agent_session_turns TO service_role;
