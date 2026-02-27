-- ============================================================================
-- Agent Queue: Add 'cancelled' status (kill switch support)
-- ============================================================================
-- Problem: No formal status for jobs stopped by the kill switch API.
--          Jobs killed by operators need to be distinguishable from naturally
--          failed jobs so audit logs can differentiate user-triggered stops
--          from transient / infrastructure failures.
--
-- Solution:
--   1. Add 'cancelled' to the status CHECK constraint (also formalises all
--      existing valid statuses in one constraint so they are self-documenting)
--
-- Note: agent_queue.status is TEXT (not an enum), so this is a non-breaking
-- ADD CONSTRAINT — existing rows are unaffected unless they hold a value not
-- in the list.  All currently used values are included.
-- ============================================================================

-- Drop any pre-existing status check (e.g. from an earlier migration attempt)
ALTER TABLE agent_queue
  DROP CONSTRAINT IF EXISTS agent_queue_status_check;

-- Add formal constraint covering every status value in use + 'cancelled'
ALTER TABLE agent_queue
  ADD CONSTRAINT agent_queue_status_check
    CHECK (status IN (
      'pending',
      'running',
      'completed',
      'failed',
      'blocked',
      'paused',
      'suspended',
      'awaiting_approval',
      'resumed',
      'cancelled'
    ));

-- Index for kill-switch monitoring: quickly find cancelled jobs per org
CREATE INDEX IF NOT EXISTS idx_agent_queue_cancelled
  ON agent_queue (organization_id, status, completed_at)
  WHERE status = 'cancelled';
