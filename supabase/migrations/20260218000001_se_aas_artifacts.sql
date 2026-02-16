-- ============================================================================
-- SE-aaS Artifacts Table
-- ============================================================================
-- Stores generated artifacts from SE-aaS domain executions:
-- test data, SQL analysis reports, test cases, TDD code, incident diagnoses,
-- impact analysis, data lineage maps, log query results.
--
-- Linked to agent_queue for async job tracking.
-- ============================================================================

CREATE TABLE IF NOT EXISTS se_aas_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id UUID REFERENCES agent_queue(id) ON DELETE SET NULL,
  domain_type TEXT NOT NULL,
  artifact_data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_se_aas_artifacts_org
  ON se_aas_artifacts (organization_id, domain_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_se_aas_artifacts_job
  ON se_aas_artifacts (job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_se_aas_artifacts_created
  ON se_aas_artifacts (created_at DESC);

-- RLS
ALTER TABLE se_aas_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_artifacts" ON se_aas_artifacts
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_artifacts" ON se_aas_artifacts
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL ON se_aas_artifacts TO service_role;
GRANT SELECT ON se_aas_artifacts TO authenticated;
