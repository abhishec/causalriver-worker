-- ============================================================================
-- Remediation: Recreate se_aas_artifacts if missing from production
-- ============================================================================
-- The original migration 20260218000001 was recorded as applied but the
-- table appears absent from the PostgREST schema cache (PGRST205). This
-- idempotent migration ensures the table exists.
-- ============================================================================

CREATE TABLE IF NOT EXISTS se_aas_artifacts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id           UUID         REFERENCES agent_queue(id) ON DELETE SET NULL,
  domain_type      TEXT         NOT NULL,
  artifact_data    JSONB        NOT NULL DEFAULT '{}',
  metadata         JSONB        DEFAULT '{}',
  created_by       UUID,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_se_aas_artifacts_org
  ON se_aas_artifacts (organization_id, domain_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_se_aas_artifacts_job
  ON se_aas_artifacts (job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_se_aas_artifacts_created
  ON se_aas_artifacts (created_at DESC);

-- RLS
ALTER TABLE se_aas_artifacts ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies (idempotent pattern)
DROP POLICY IF EXISTS "org_members_read_artifacts"   ON se_aas_artifacts;
DROP POLICY IF EXISTS "service_role_all_artifacts"   ON se_aas_artifacts;

CREATE POLICY "org_members_read_artifacts" ON se_aas_artifacts
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_all_artifacts" ON se_aas_artifacts
  FOR ALL USING (auth.role() = 'service_role');

GRANT ALL   ON se_aas_artifacts TO service_role;
GRANT SELECT ON se_aas_artifacts TO authenticated;
