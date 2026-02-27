-- ============================================================================
-- Agent Queue: Lambda Chain Pattern
-- ============================================================================
-- Adds chain_parent_id and chain_depth to agent_queue so that
-- long-running jobs can be split across multiple Lambda invocations.
--
-- How it works:
--   1. Parent Lambda runs for ~75s, saves a deep checkpoint to checkpoint_data
--   2. Parent creates a child job with chain_parent_id = parent.id and
--      chain_depth = parent.chain_depth + 1
--   3. Parent status → 'paused' (NOT terminal)
--   4. Next process-jobs tick picks up the child, resumes from checkpoint
--   5. Repeat until job is complete — no Lambda time limit applies
--
-- heartbeat_at already exists (migration 20260228000001). This migration
-- only adds the two chain-tracking columns.
-- ============================================================================

ALTER TABLE agent_queue
  ADD COLUMN IF NOT EXISTS chain_parent_id UUID REFERENCES agent_queue(id),
  ADD COLUMN IF NOT EXISTS chain_depth     INT  NOT NULL DEFAULT 0;

-- Index for chain traversal: find all children of a parent
CREATE INDEX IF NOT EXISTS idx_agent_queue_chain_parent
  ON agent_queue(chain_parent_id)
  WHERE chain_parent_id IS NOT NULL;

-- Index for watchdog: re-queue paused chain continuations
CREATE INDEX IF NOT EXISTS idx_agent_queue_paused_chains
  ON agent_queue(status, chain_parent_id)
  WHERE status = 'paused' AND chain_parent_id IS NOT NULL;

COMMENT ON COLUMN agent_queue.chain_parent_id IS
  'For Lambda-chained jobs: references the parent job whose execution was split.';
COMMENT ON COLUMN agent_queue.chain_depth IS
  'How many Lambda hops deep this job is (0 = original job, 1 = first continuation, etc.).';
