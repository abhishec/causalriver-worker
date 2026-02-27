-- ============================================================================
-- Agent Queue: Retry Logic (retry_count + max_retries)
-- ============================================================================
-- Problem: Transient failures (DB hiccup, LLM 429, timeout) permanently leave
--   jobs in 'failed' status. No automatic recovery for transient errors.
--
-- Solution:
--   1. retry_count INT DEFAULT 0  — how many times this job has been attempted
--   2. max_retries INT DEFAULT 3  — cap on automatic retries before final failure
--
-- Behavior change in job-queue.ts (executeAndCompleteJob on error):
--   IF retry_count < max_retries:
--     SET status = 'pending', retry_count = retry_count + 1
--     (job will be re-picked on the next cron tick)
--   ELSE:
--     SET status = 'error'  (permanent failure, surfaced to user)
--
-- Also updates recover_stale_jobs() to re-queue timed-out jobs that haven't
-- exhausted max_retries, instead of always marking them 'failed'.
-- ============================================================================

-- Add columns to agent_queue
ALTER TABLE agent_queue
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3;

-- Index for the retry-pending query (same as normal pending index, but now
-- includes jobs re-queued after a retry which have retry_count > 0)
-- The existing idx_queue_pending covers this case — no new index needed.

-- ── Update recover_stale_jobs() to respect max_retries ────────────────────
-- Before this migration: all timed-out jobs went to 'failed' permanently.
-- After: if retry_count < max_retries, re-queue as 'pending' with increment.
--        Only jobs that have exhausted retries go to 'failed'.
CREATE OR REPLACE FUNCTION recover_stale_jobs(stale_threshold_seconds INTEGER DEFAULT 120)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recovered_count INTEGER;
BEGIN
  -- Re-queue timed-out jobs that still have retries left
  WITH retryable_jobs AS (
    UPDATE agent_queue
    SET
      status        = 'pending',
      retry_count   = retry_count + 1,
      error_message = 'Job timed out (no heartbeat for '
                      || stale_threshold_seconds
                      || 's). Auto-retrying (attempt '
                      || (retry_count + 1)::TEXT || '/' || max_retries::TEXT || ').',
      started_at    = NULL,
      heartbeat_at  = NULL
    WHERE
      status = 'running'
      AND retry_count < max_retries
      AND (
        (heartbeat_at IS NULL
          AND started_at < NOW() - (stale_threshold_seconds || ' seconds')::INTERVAL)
        OR
        (heartbeat_at IS NOT NULL
          AND heartbeat_at < NOW() - (stale_threshold_seconds || ' seconds')::INTERVAL)
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO recovered_count FROM retryable_jobs;

  -- Permanently fail timed-out jobs that have exhausted retries
  UPDATE agent_queue
  SET
    status        = 'failed',
    error_message = 'Job timed out after ' || max_retries::TEXT
                    || ' retries — Lambda Lambda kill (no heartbeat for '
                    || stale_threshold_seconds || 's). No more retries.',
    completed_at  = NOW()
  WHERE
    status = 'running'
    AND retry_count >= max_retries
    AND (
      (heartbeat_at IS NULL
        AND started_at < NOW() - (stale_threshold_seconds || ' seconds')::INTERVAL)
      OR
      (heartbeat_at IS NOT NULL
        AND heartbeat_at < NOW() - (stale_threshold_seconds || ' seconds')::INTERVAL)
    );

  RETURN recovered_count;
END;
$$;

GRANT EXECUTE ON FUNCTION recover_stale_jobs(INTEGER) TO service_role;
