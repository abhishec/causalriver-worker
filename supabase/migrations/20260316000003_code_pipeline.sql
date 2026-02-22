-- ============================================================================
-- Code Application Pipeline
--
-- Tracks end-to-end automated code fix runs:
-- detect -> generate fix -> branch -> test -> PR -> monitor
-- ============================================================================

CREATE TABLE IF NOT EXISTS code_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  issue_type TEXT NOT NULL,        -- 'tech_debt', 'vulnerability', 'test_coverage', 'performance', 'lint'
  issue_severity TEXT NOT NULL,    -- 'critical', 'high', 'medium', 'low'
  issue_description TEXT NOT NULL,
  issue_source TEXT NOT NULL,      -- 'health_monitor', 'ci_failure', 'agent_detection', 'user_request'
  stage TEXT NOT NULL DEFAULT 'detected', -- Pipeline stage
  -- Git/PR data
  branch_name TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  -- Agent execution data
  agent_task_id UUID,
  fix_artifacts JSONB,
  test_results JSONB,
  confidence FLOAT,
  -- PR outcome
  pr_status TEXT,                  -- 'open', 'merged', 'closed'
  rejection_reason TEXT,
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_code_pipeline_org_stage
  ON code_pipeline_runs(organization_id, stage);
CREATE INDEX IF NOT EXISTS idx_code_pipeline_created
  ON code_pipeline_runs(organization_id, created_at DESC);

-- RLS
ALTER TABLE code_pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_pipeline" ON code_pipeline_runs FOR ALL
  USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_pipeline" ON code_pipeline_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.organization_id = code_pipeline_runs.organization_id
      AND org_members.user_id = auth.uid()
    )
  );
