-- ============================================================================
-- Connector Write-Back Infrastructure
-- ============================================================================
-- Closes the Brain → Action → World loop.
-- Previously BrainOS could only READ from connectors (senses).
-- This migration adds the WRITE side: the "Voice" of the AI Worker.
--
-- Flow:
--   Domain executes → Artifact saved → Dispatcher checks rules →
--   writeback_queue populated → Cron processes queue →
--   Slack/Jira/GitHub updated → agent_writeback_log recorded
--
-- Tables:
--   connector_writeback_rules  — per-org rules: domain → connector → action
--   writeback_queue            — pending write-back items with retry
--   agent_writeback_log        — immutable audit trail
-- ============================================================================

-- ── connector_writeback_rules ─────────────────────────────────────────────
-- Each row = "when domain X succeeds for org Y, post to connector Z"
CREATE TABLE IF NOT EXISTS connector_writeback_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,

  -- Trigger: which SE-aaS domain output activates this rule
  domain_type     TEXT NOT NULL,  -- 'pod-match', 'scope-creep', 'early-warning', etc.

  -- Target: which connector + what action
  connector_type  TEXT NOT NULL,  -- 'slack', 'jira', 'github'
  action_type     TEXT NOT NULL,  -- 'post_message' | 'create_ticket' | 'create_issue' | 'add_pr_comment'

  -- action_config: connector-specific settings
  --   Slack: { channel_id, message_template }
  --   Jira:  { project_key, issue_type, summary_template, description_template }
  --   GitHub:{ owner, repo, title_template, body_template, labels }
  action_config   JSONB NOT NULL DEFAULT '{}',

  -- Optional: only dispatch if artifact_data matches these conditions
  -- e.g. { "confidence": { "gte": 0.7 } } or { "alert_count": { "gt": 0 } }
  condition_filter JSONB DEFAULT NULL,

  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── writeback_queue ───────────────────────────────────────────────────────
-- Populated by writeback-dispatcher after every successful domain execution.
-- Processed by cron/process-writeback (max 3 attempts, exponential backoff).
CREATE TABLE IF NOT EXISTS writeback_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Source references (soft FKs to avoid cascades breaking the queue)
  rule_id         UUID REFERENCES connector_writeback_rules(id) ON DELETE SET NULL,
  artifact_id     UUID,   -- references se_aas_artifacts(id) — soft ref
  job_id          UUID,   -- references agent_queue(id) — soft ref

  -- What to do
  connector_type  TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  action_payload  JSONB NOT NULL DEFAULT '{}',  -- pre-rendered, ready to send

  -- Execution state
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INT  NOT NULL DEFAULT 0,
  last_error      TEXT,

  -- Result from the external system after successful dispatch
  -- e.g. { slack_ts: "1234.5678", jira_key: "ENG-42", github_issue: 99 }
  external_ref    JSONB DEFAULT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS writeback_queue_pending
  ON writeback_queue(organization_id, status, created_at)
  WHERE status = 'pending';

-- ── agent_writeback_log ───────────────────────────────────────────────────
-- Immutable audit trail. One row per write-back attempt.
CREATE TABLE IF NOT EXISTS agent_writeback_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  writeback_queue_id UUID REFERENCES writeback_queue(id) ON DELETE SET NULL,
  connector_type     TEXT NOT NULL,
  action_type        TEXT NOT NULL,
  domain_type        TEXT,
  success            BOOLEAN NOT NULL,
  external_ref       JSONB,
  error_message      TEXT,
  execution_ms       INT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ai_workspace: add writeback_enabled ──────────────────────────────────
ALTER TABLE ai_workspace
  ADD COLUMN IF NOT EXISTS writeback_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ai_workspace.writeback_enabled IS
  'When true, the AI Worker automatically dispatches results to connected systems '
  '(Slack, Jira, GitHub) after domain execution. Requires connector_writeback_rules.';

-- ── RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE connector_writeback_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE writeback_queue           ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_writeback_log       ENABLE ROW LEVEL SECURITY;

-- connector_writeback_rules: org members can read; service_role manages
CREATE POLICY "Org members can read writeback rules"
  ON connector_writeback_rules FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can insert writeback rules"
  ON connector_writeback_rules FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update own writeback rules"
  ON connector_writeback_rules FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can delete own writeback rules"
  ON connector_writeback_rules FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- writeback_queue: service_role only (cron worker)
CREATE POLICY "Service role manages writeback queue"
  ON writeback_queue FOR ALL
  USING (true)
  WITH CHECK (true);

-- agent_writeback_log: org members can read audit trail
CREATE POLICY "Org members can read writeback log"
  ON agent_writeback_log FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- ── GRANTs ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON connector_writeback_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON writeback_queue            TO service_role;
GRANT SELECT                          ON writeback_queue            TO authenticated;
GRANT SELECT, INSERT                  ON agent_writeback_log        TO service_role;
GRANT SELECT                          ON agent_writeback_log        TO authenticated;

-- ── Comments ─────────────────────────────────────────────────────────────
COMMENT ON TABLE connector_writeback_rules IS
  'Per-org rules that auto-dispatch write-back actions after domain execution. '
  'Each rule maps a domain type to a connector action (Slack message, Jira ticket, GitHub issue).';

COMMENT ON TABLE writeback_queue IS
  'Queue of pending write-back actions. Populated by writeback-dispatcher, '
  'processed by cron/process-writeback. Max 3 attempts with exponential backoff.';

COMMENT ON TABLE agent_writeback_log IS
  'Immutable audit trail of all write-back executions. One row per attempt.';
