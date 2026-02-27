-- Migration: Add metadata JSONB column to agent_queue
-- Purpose: Persist ProcessFSM state across Lambda cold starts.
-- The ProcessFSM.save() method writes fsm_state + fsm_history here.
-- The ProcessFSM.restore() method reads from here on resume.

ALTER TABLE agent_queue ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Partial GIN index: only indexes rows that actually have fsm_state set,
-- keeping the index small and fast for the cold-start restore query.
CREATE INDEX IF NOT EXISTS idx_agent_queue_metadata_fsm
  ON agent_queue USING gin(metadata)
  WHERE metadata ? 'fsm_state';
