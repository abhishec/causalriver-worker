-- Writeback audit log for compliance + RBAC enforcement
-- Every write-back attempt (allowed or denied) is logged here for security review.
CREATE TABLE IF NOT EXISTS writeback_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL,           -- 'allowed' | 'denied'
  connector_type TEXT NOT NULL,   -- 'jira' | 'github' | 'slack' | 'linear'
  write_type TEXT NOT NULL,       -- 'create_issue' | 'update_ticket' | etc
  entity_id TEXT,                 -- the external entity being written
  denial_reason TEXT,             -- why it was denied (if action = 'denied')
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE writeback_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (write-back runs as service)
CREATE POLICY "service_insert_writeback_audit" ON writeback_audit_log
  FOR INSERT TO service_role WITH CHECK (true);

-- Org members can read their own org's audit log
CREATE POLICY "org_members_read_audit" ON writeback_audit_log
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_writeback_audit_org ON writeback_audit_log(organization_id, created_at DESC);
CREATE INDEX idx_writeback_audit_user ON writeback_audit_log(user_id, created_at DESC);
