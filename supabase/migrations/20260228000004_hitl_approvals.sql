-- Human-in-the-Loop (HITL) approval gates
-- Configurable per-org gates that pause agent execution and wait for human approval.

CREATE TABLE IF NOT EXISTS hitl_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  job_id UUID,                          -- FK to agent_queue (nullable — gate can exist without a job)
  gate_type TEXT NOT NULL,              -- 'high_confidence_action' | 'overnight_agent' | 'policy_override' | 'low_confidence'
  summary TEXT NOT NULL,                -- human-readable: "Early warning suggests 3 engineers at flight risk"
  details JSONB DEFAULT '{}',           -- full context for the human reviewer
  status TEXT DEFAULT 'pending',        -- pending | approved | rejected | expired
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,                     -- user_id who approved/rejected
  resolution_note TEXT,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Index for fast pending lookups per org
CREATE INDEX IF NOT EXISTS hitl_approvals_org_status_idx
  ON hitl_approvals (organization_id, status, expires_at);

-- Index for job_id lookups (resume a blocked job after approval)
CREATE INDEX IF NOT EXISTS hitl_approvals_job_id_idx
  ON hitl_approvals (job_id)
  WHERE job_id IS NOT NULL;

ALTER TABLE hitl_approvals ENABLE ROW LEVEL SECURITY;

-- Org members can read and write their own org's approvals
CREATE POLICY "org_members_read_write" ON hitl_approvals
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );
