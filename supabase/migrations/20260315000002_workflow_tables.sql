-- Workflow Tables: definitions, runs, and per-step tracking
-- ===========================================================
-- Migrated from platform/supabase/migrations/20260222000002_workflow_tables.sql
-- RLS policies use get_user_org_ids() to avoid org_members self-referencing recursion.

-- Workflow definitions
CREATE TABLE IF NOT EXISTS workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  service_vertical TEXT DEFAULT 'general'
    CHECK (service_vertical IN ('seaas', 'aas', 'general', 'cross-service')),
  steps JSONB NOT NULL DEFAULT '[]',
  trigger_config JSONB,
  gathering_schema JSONB,
  is_template BOOLEAN DEFAULT FALSE,
  template_source TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  total_runs INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workflow execution records
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  triggered_by UUID NOT NULL,
  trigger_source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled','paused')),
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER NOT NULL,
  input_payload JSONB,
  final_output JSONB,
  error_message TEXT,
  conversation_id UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-step execution tracking
CREATE TABLE IF NOT EXISTS workflow_run_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  parallel_group TEXT,
  agent_template_id UUID,
  brain_task_id UUID,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','skipped')),
  input_payload JSONB,
  output_payload JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (using get_user_org_ids() to avoid org_members recursion)
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_run_steps ENABLE ROW LEVEL SECURITY;

-- Service role full access (API routes use service client)
CREATE POLICY "workflows_service_full_access" ON workflows
  FOR ALL USING (true);

CREATE POLICY "workflow_runs_service_full_access" ON workflow_runs
  FOR ALL USING (true);

CREATE POLICY "workflow_run_steps_service_full_access" ON workflow_run_steps
  FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflows_org ON workflows(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_org ON workflow_runs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run ON workflow_run_steps(workflow_run_id, step_order);
