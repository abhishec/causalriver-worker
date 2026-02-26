-- Agent Orchestration Table
-- ===========================
-- Tracks job dependencies between AI worker agents.
-- When a job depends on another (e.g. a delivery-intelligence job waiting
-- for brain-population to finish), a row is inserted here with status='waiting'.
-- The job worker calls checkAndStartWaitingJobs() after every job completion
-- to auto-start any unblocked waiting jobs.

CREATE TABLE IF NOT EXISTS agent_orchestration (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL,
  job_id              UUID        REFERENCES agent_queue(id) ON DELETE CASCADE,
  depends_on_job_id   UUID        REFERENCES agent_queue(id) ON DELETE CASCADE,
  depends_on_type     TEXT        NOT NULL,           -- e.g. 'brain-population', 'connector-sync'
  status              TEXT        NOT NULL DEFAULT 'waiting',  -- waiting | ready | started | cancelled
  auto_start          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ
);

-- Index for efficient lookup by org + status (poll loop)
CREATE INDEX IF NOT EXISTS idx_agent_orchestration_org_status
  ON agent_orchestration(organization_id, status);

-- Index for efficient lookup when a blocking job completes
CREATE INDEX IF NOT EXISTS idx_agent_orchestration_depends_on
  ON agent_orchestration(depends_on_job_id);

-- RLS — org-scoped access only
ALTER TABLE agent_orchestration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_orchestration"
  ON agent_orchestration FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_insert_orchestration"
  ON agent_orchestration FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_update_orchestration"
  ON agent_orchestration FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Service role can do everything (used by job workers + orchestrator)
GRANT SELECT, INSERT, UPDATE ON agent_orchestration TO service_role;
