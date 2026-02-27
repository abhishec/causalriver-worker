-- Write-back Approvals: enterprise gate before agents execute connector actions
-- Orgs with require_writeback_approval=true in metadata get a human approval step

CREATE TABLE writeback_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id UUID REFERENCES agent_queue(id),
  connector_type TEXT NOT NULL, -- 'github', 'jira', 'slack', 'linear'
  action_type TEXT NOT NULL,    -- 'create_pr', 'create_ticket', 'send_message', 'create_branch'
  action_payload JSONB NOT NULL, -- the full write-back payload (PR title, body, target repo, etc.)
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  requested_by TEXT,            -- agent type that requested it
  reviewed_by UUID REFERENCES auth.users(id),
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE writeback_approvals ENABLE ROW LEVEL SECURITY;

-- Members can read their org's approvals
CREATE POLICY "org_read" ON writeback_approvals FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

-- Members can update status (approve/reject) — admin/owner enforcement done in API layer
CREATE POLICY "org_update" ON writeback_approvals FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

-- Service role inserts approvals (agents create approval requests)
-- No INSERT policy needed for authenticated users — only service role creates rows

GRANT SELECT, UPDATE ON writeback_approvals TO authenticated;

-- Index for fast pending-approvals query per org
CREATE INDEX idx_writeback_approvals_org_status
  ON writeback_approvals (organization_id, status, created_at DESC);
