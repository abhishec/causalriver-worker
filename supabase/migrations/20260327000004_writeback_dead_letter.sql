-- Add dead_letter status to writeback_queue
-- Items that fail 3 times become dead_letter for manual review

-- Add dead_letter_at timestamp column
ALTER TABLE writeback_queue
  ADD COLUMN IF NOT EXISTS dead_letter_at TIMESTAMPTZ;

COMMENT ON COLUMN writeback_queue.dead_letter_at IS
  'Set when item reaches max attempts (3). Requires manual intervention.';

-- Index for ops monitoring
CREATE INDEX IF NOT EXISTS writeback_queue_dead_letter
  ON writeback_queue(organization_id, dead_letter_at)
  WHERE dead_letter_at IS NOT NULL;
