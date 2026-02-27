-- Enable parent/child job relationships for overnight agent orchestration
ALTER TABLE agent_queue ADD COLUMN IF NOT EXISTS parent_job_id UUID REFERENCES agent_queue(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agent_queue_parent_job ON agent_queue(parent_job_id) WHERE parent_job_id IS NOT NULL;
