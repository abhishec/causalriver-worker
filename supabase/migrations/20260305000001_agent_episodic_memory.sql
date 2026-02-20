-- ============================================================================
-- Agent Episodic Memory — Persistent Identity & Learning (Week 5)
-- ============================================================================
--
-- Gives agents persistent memory across runs. After each execution, a summary
-- is stored here. Before the next run, the agent loads its top memories by
-- importance to maintain continuity (e.g., "Last run I flagged Client X as
-- high risk — this week they've paid 2/3 invoices").
--
-- Memory types:
--   run_summary     — post-execution summary of what the agent did/found
--   learned_pattern — pattern the agent discovered and should remember
--   user_feedback   — corrections/preferences from user ratings
--   context_anchor  — key facts that anchor future reasoning
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_episodic_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  episode_type TEXT NOT NULL DEFAULT 'run_summary'
    CHECK (episode_type IN ('run_summary', 'learned_pattern', 'user_feedback', 'context_anchor')),
  content TEXT NOT NULL,
  embedding VECTOR(1536),  -- optional: for semantic recall via pgvector
  metadata JSONB DEFAULT '{}',
  importance NUMERIC(4,3) DEFAULT 0.500,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Primary lookup: "give me top memories for this org's code-review agent"
CREATE INDEX IF NOT EXISTS idx_episodic_org_agent
  ON agent_episodic_memory(organization_id, agent_type, importance DESC);

-- Recency-based pruning: find old, low-importance memories to clean up
CREATE INDEX IF NOT EXISTS idx_episodic_created
  ON agent_episodic_memory(created_at);

COMMENT ON TABLE agent_episodic_memory IS 'Persistent agent memory across runs. Stores run summaries, learned patterns, user feedback, and context anchors for agent continuity.';
COMMENT ON COLUMN agent_episodic_memory.importance IS 'Importance score 0.000-1.000. Run summaries start at 0.5, user feedback at 0.9, learned patterns at 0.7. Decays over time if not accessed.';
COMMENT ON COLUMN agent_episodic_memory.embedding IS 'Optional 1536-dim embedding for semantic recall via pgvector similarity search.';
COMMENT ON COLUMN agent_episodic_memory.access_count IS 'Number of times this memory was loaded into agent context. Used for importance scoring.';
