-- Dead-letter queue for write-back failures
-- After 3 failed write-back attempts, items are moved here for manual review
-- and a Slack notification is sent to the workspace admin.

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  job_type        TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  failure_reason  TEXT,
  attempt_count   INT DEFAULT 3,
  -- Source writeback context for traceability
  writeback_queue_id UUID,
  connector_type  TEXT,
  action_type     TEXT,
  rule_id         UUID,
  -- Notification status
  slack_notified  BOOLEAN DEFAULT FALSE,
  slack_notified_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE dead_letter_queue IS
  'Write-back items that failed 3 times and require manual intervention. '
  'A Slack notification is sent to the workspace admin on insert.';

-- Index for ops monitoring and cleanup
CREATE INDEX IF NOT EXISTS dead_letter_queue_org_created
  ON dead_letter_queue(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dead_letter_queue_unnotified
  ON dead_letter_queue(organization_id, slack_notified)
  WHERE slack_notified = FALSE;

-- RLS: org members can read their own dead letters; only service role can insert
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dead_letter_queue_select_own_org"
  ON dead_letter_queue FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Service role bypass (used by writeback-dispatcher cron)
CREATE POLICY "dead_letter_queue_service_role_all"
  ON dead_letter_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
