-- BPaaS: Process Mutations audit log
-- Records every business entity change made during MUTATE state execution.
-- Non-fatal in domain-executor — table may not exist in older deployments.

CREATE TABLE IF NOT EXISTS bpaas_process_mutations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  process_instance_id UUID NOT NULL,  -- FK to bpaas_process_instances.id
  process_type TEXT NOT NULL,         -- 'hr_offboarding', 'procurement', etc.
  mutation_data JSONB NOT NULL DEFAULT '{}',
  -- mutation_data shape: { field: value, ... } — the computed values applied
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bpaas_process_mutations_org
  ON bpaas_process_mutations(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bpaas_process_mutations_instance
  ON bpaas_process_mutations(process_instance_id);

CREATE INDEX IF NOT EXISTS idx_bpaas_process_mutations_type
  ON bpaas_process_mutations(process_type, organization_id);

-- RLS
ALTER TABLE bpaas_process_mutations ENABLE ROW LEVEL SECURITY;

CREATE POLICY bpaas_process_mutations_org_select ON bpaas_process_mutations FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

CREATE POLICY bpaas_process_mutations_service_all ON bpaas_process_mutations FOR ALL USING (
  auth.role() = 'service_role'
);
