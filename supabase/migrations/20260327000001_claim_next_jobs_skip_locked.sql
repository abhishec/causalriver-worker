-- ============================================================================
-- Atomic job claiming with SKIP LOCKED
-- ============================================================================
-- Fixes the race condition where two concurrent Lambda workers could both
-- SELECT the same pending job and double-execute it.
--
-- Two functions:
-- 1. claim_job(p_job_id) — single-job atomic claim used by executeAndCompleteJob
-- 2. claim_next_jobs(...)  — batch atomic claim for future batch workers
--
-- Both use SELECT ... FOR UPDATE SKIP LOCKED inside a transaction.
-- SKIP LOCKED: if the row is already locked by another transaction, skip it
-- rather than waiting — so concurrent workers never claim the same job.
-- ============================================================================

-- Single-job atomic claim
-- Returns the claimed row, or NULL if the job is already claimed/running.
CREATE OR REPLACE FUNCTION claim_job(p_job_id UUID)
RETURNS SETOF agent_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE agent_queue
  SET
    status     = 'running',
    started_at = now()
  WHERE id IN (
    SELECT id
    FROM   agent_queue
    WHERE  id     = p_job_id
      AND  status = 'pending'
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Batch atomic claim (for future batch workers / cron optimization)
-- Returns up to p_limit rows, all atomically claimed as 'running'.
-- Worker type filter: 'light', 'heavy', or 'mixed'.
CREATE OR REPLACE FUNCTION claim_next_jobs(
  p_agent_type  TEXT,
  p_limit       INT     DEFAULT 5,
  p_worker_type TEXT    DEFAULT 'mixed'
)
RETURNS SETOF agent_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  heavy_domains TEXT[] := ARRAY[
    'incident-diagnosis',
    'tdd-code-generator',
    'design-doc-generator',
    'architecture-extractor',
    'codebase-qa',
    'pr-review'
  ];
BEGIN
  RETURN QUERY
  UPDATE agent_queue
  SET
    status     = 'running',
    started_at = now()
  WHERE id IN (
    SELECT id
    FROM   agent_queue
    WHERE  status     = 'pending'
      AND  agent_type = p_agent_type
      AND (
        p_worker_type = 'mixed'
        OR (p_worker_type = 'heavy' AND task_type = ANY(heavy_domains))
        OR (p_worker_type = 'light' AND task_type != ALL(heavy_domains))
      )
    ORDER BY priority DESC, created_at ASC
    LIMIT  p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION claim_job(UUID)                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION claim_next_jobs(TEXT, INT, TEXT)          TO authenticated, service_role;
