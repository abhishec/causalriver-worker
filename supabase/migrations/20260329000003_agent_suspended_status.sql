-- Agent 'suspended' status — Human-in-the-Loop true pause
-- =========================================================
-- Introduces 'suspended' as the canonical status for jobs that need human
-- review before continuing. Replaces the looser 'awaiting_approval' used in
-- the original checkpoint migration (20260301000001_agent_checkpoint.sql).
--
-- agent_queue.status is TEXT (not an enum), so no DDL change is needed.
-- This migration:
--   1. Adds a compound index for 'suspended' jobs (mirrors idx_agent_queue_awaiting)
--   2. Updates the resume_agent_job() RPC to accept both statuses
--   3. Adds an RLS UPDATE policy so org members can unblock suspended jobs

-- Index: find suspended jobs quickly (used by AgentLiveMonitor + resume endpoint)
CREATE INDEX IF NOT EXISTS idx_agent_queue_suspended
  ON agent_queue (organization_id, status, escalation_sent_at)
  WHERE status = 'suspended';

-- Update resume_agent_job() to accept 'suspended' as well as 'awaiting_approval'
CREATE OR REPLACE FUNCTION resume_agent_job(
  p_job_id UUID,
  p_human_response TEXT,
  p_new_job_id UUID DEFAULT gen_random_uuid()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark original job as 'resumed' (not completed, not failed)
  -- Accepts both 'awaiting_approval' (legacy) and 'suspended' (new canonical)
  UPDATE agent_queue
  SET
    human_response = p_human_response,
    status = 'resumed'
  WHERE id = p_job_id
    AND status IN ('awaiting_approval', 'suspended');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % is not in a resumable status (awaiting_approval or suspended)', p_job_id;
  END IF;

  -- Create new continuation job with checkpoint payload
  INSERT INTO agent_queue (
    id,
    organization_id,
    agent_type,
    task_type,
    priority,
    payload,
    status,
    resumed_from
  )
  SELECT
    p_new_job_id,
    organization_id,
    agent_type,
    task_type,
    priority,
    jsonb_build_object(
      'original_payload', payload,
      'checkpoint_data', checkpoint_data,
      'checkpoint_phase', checkpoint_phase,
      'resume_prompt', resume_prompt,
      'human_response', p_human_response,
      'resumed_from_job_id', p_job_id
    ),
    'pending',
    p_job_id
  FROM agent_queue
  WHERE id = p_job_id;

  RETURN p_new_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION resume_agent_job TO authenticated, service_role;

-- RLS: org members may change a suspended job back to pending (i.e. unblock it)
-- This is the equivalent of clicking "Resume" in AgentLiveMonitor.
-- Note: the actual atomic resume goes through resume_agent_job() (SECURITY DEFINER),
-- so this policy is belt-and-suspenders for direct UPDATE calls.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_queue'
      AND policyname = 'org_members_resume_suspended_jobs'
  ) THEN
    CREATE POLICY org_members_resume_suspended_jobs
      ON agent_queue
      FOR UPDATE
      USING (
        status IN ('awaiting_approval', 'suspended')
        AND organization_id IN (
          SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        status = 'pending'
        AND organization_id IN (
          SELECT organization_id FROM org_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
