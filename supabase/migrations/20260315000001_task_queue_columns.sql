-- Task Queue: extend brain_agent_tasks for workflow + task queue features
-- =========================================================================
-- Migrated from platform/supabase/migrations/20260222000001_task_queue_columns.sql

ALTER TABLE brain_agent_tasks
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  ADD COLUMN IF NOT EXISTS workflow_run_id UUID,
  ADD COLUMN IF NOT EXISTS workflow_step_order INTEGER,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'copilot'
    CHECK (source IN ('copilot', 'studio-test', 'workflow', 'scheduled', 'api')),
  ADD COLUMN IF NOT EXISTS conversation_id UUID;

-- Index for Task Queue queries (filter by org + status, sort by created)
CREATE INDEX IF NOT EXISTS idx_brain_agent_tasks_queue
  ON brain_agent_tasks(organization_id, status, created_at DESC);

-- Index for workflow step lookups
CREATE INDEX IF NOT EXISTS idx_brain_agent_tasks_workflow
  ON brain_agent_tasks(workflow_run_id) WHERE workflow_run_id IS NOT NULL;
