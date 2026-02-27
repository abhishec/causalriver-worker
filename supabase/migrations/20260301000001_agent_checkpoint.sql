-- True pause + resume for AI worker agents
-- Converts awaiting_approval from terminal to suspended-with-checkpoint state

ALTER TABLE agent_queue
  ADD COLUMN IF NOT EXISTS checkpoint_data JSONB,           -- full investigation state
  ADD COLUMN IF NOT EXISTS checkpoint_phase TEXT,            -- which phase paused at
  ADD COLUMN IF NOT EXISTS resume_prompt TEXT,               -- what to tell next Lambda
  ADD COLUMN IF NOT EXISTS escalation_question TEXT,         -- the specific question asked to human
  ADD COLUMN IF NOT EXISTS human_response TEXT,              -- filled when human answers
  ADD COLUMN IF NOT EXISTS resumed_from UUID REFERENCES agent_queue(id), -- parent job
  ADD COLUMN IF NOT EXISTS escalation_sent_at TIMESTAMPTZ;  -- when notification was sent

-- Index for finding jobs awaiting human response
CREATE INDEX IF NOT EXISTS idx_agent_queue_awaiting
  ON agent_queue (organization_id, status, escalation_sent_at)
  WHERE status = 'awaiting_approval';

-- Function: resume a paused job with human response
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
  -- Mark original job as resumed (not completed, not failed)
  UPDATE agent_queue
  SET
    human_response = p_human_response,
    status = 'resumed'
  WHERE id = p_job_id AND status = 'awaiting_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % is not in awaiting_approval status', p_job_id;
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
