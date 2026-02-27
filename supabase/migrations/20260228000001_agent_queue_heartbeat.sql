-- ============================================================================
-- Agent Queue Heartbeat + Stale Job Recovery
-- ============================================================================
-- Phase 1 of long-running agent infrastructure.
--
-- Problem: Lambda kills agents at 90s. Jobs stay stuck in 'running' forever.
--
-- Solution:
--   1. heartbeat_at column — running agents UPDATE this every 30s
--   2. update_job_heartbeat() RPC — called by job-heartbeat.ts utility
--   3. recover_stale_jobs() RPC — called by process-jobs cron every 10 min
--      Marks jobs with stale heartbeats as 'failed' so they can be retried.
-- ============================================================================

-- Add heartbeat_at to agent_queue for stale job detection
ALTER TABLE agent_queue
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

-- Index for stale job watchdog query (only index running rows)
CREATE INDEX IF NOT EXISTS idx_agent_queue_stale
  ON agent_queue (status, heartbeat_at)
  WHERE status = 'running';

-- ── update_job_heartbeat ──────────────────────────────────────────────────
-- Called every 30s by a running job to prove it's still alive.
-- SECURITY DEFINER so the service_role caller can update without RLS friction.
CREATE OR REPLACE FUNCTION update_job_heartbeat(job_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE agent_queue
  SET heartbeat_at = NOW()
  WHERE id = job_id AND status = 'running';
END;
$$;

-- ── recover_stale_jobs ────────────────────────────────────────────────────
-- Marks jobs stuck in 'running' as 'failed' when their heartbeat has not
-- been updated in > stale_threshold_seconds.
--
-- Logic:
--   - If heartbeat_at IS NULL: use started_at (pre-heartbeat jobs or very
--     old jobs that were running before this migration was deployed).
--   - If heartbeat_at IS NOT NULL: use heartbeat_at (normal case).
--
-- Returns: number of jobs recovered.
CREATE OR REPLACE FUNCTION recover_stale_jobs(stale_threshold_seconds INTEGER DEFAULT 120)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recovered_count INTEGER;
BEGIN
  WITH stale_jobs AS (
    UPDATE agent_queue
    SET
      status        = 'failed',
      error_message = 'Job timed out — Lambda killed (no heartbeat for '
                      || stale_threshold_seconds
                      || 's). Will be retried on next cron tick.',
      completed_at  = NOW()
    WHERE
      status = 'running'
      AND (
        -- No heartbeat yet (pre-heartbeat jobs): use started_at
        (heartbeat_at IS NULL
          AND started_at < NOW() - (stale_threshold_seconds || ' seconds')::INTERVAL)
        OR
        -- Has heartbeat: check heartbeat freshness
        (heartbeat_at IS NOT NULL
          AND heartbeat_at < NOW() - (stale_threshold_seconds || ' seconds')::INTERVAL)
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO recovered_count FROM stale_jobs;

  RETURN recovered_count;
END;
$$;

-- Grant execute to service_role (cron runs as service_role)
GRANT EXECUTE ON FUNCTION update_job_heartbeat(UUID)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION recover_stale_jobs(INTEGER)         TO service_role;
