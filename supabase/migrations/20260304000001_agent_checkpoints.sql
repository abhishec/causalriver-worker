-- ============================================================================
-- Agent Checkpoints — Durable state for agent resumability (Week 4)
-- ============================================================================
--
-- Each checkpoint captures the FULL serialized state of an agent execution
-- at a given step. If the agent crashes or times out, it can resume from
-- the last checkpoint instead of restarting from scratch.
--
-- Checkpoint types:
--   iteration       — after each Think/Act/Observe step
--   pre_action      — before executing a motor command (reversible point)
--   post_action     — after motor command succeeds (commit point)
--   approval_gate   — when awaiting user approval (pause point)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES brain_agent_tasks(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  agent_state JSONB NOT NULL,  -- {messages, toolResults, brainContext, motorCommandQueue, metadata}
  checkpoint_type TEXT NOT NULL DEFAULT 'iteration'
    CHECK (checkpoint_type IN ('iteration', 'pre_action', 'post_action', 'approval_gate')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, step_number)
);

-- Fast lookup: "give me the latest checkpoint for task X"
CREATE INDEX IF NOT EXISTS idx_checkpoints_task
  ON agent_checkpoints(task_id, step_number DESC);

-- Cleanup old checkpoints (keep last 20 per task to avoid unbounded growth)
-- This is done via application logic, not a trigger, to avoid perf overhead.

COMMENT ON TABLE agent_checkpoints IS 'Durable checkpoints for agent execution resumability. Each row captures serialized agent state at a step boundary.';
COMMENT ON COLUMN agent_checkpoints.agent_state IS 'Full serialized state: {messages, toolResults, brainContext, motorCommandQueue, stepOutputs, metadata}';
COMMENT ON COLUMN agent_checkpoints.checkpoint_type IS 'iteration=after each step, pre_action=before motor cmd, post_action=after motor cmd, approval_gate=awaiting approval';
