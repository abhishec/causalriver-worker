-- Add ai_worker_id and agent_id FKs to agent_queue
-- ADR-003: Job = agent_queue row, links to Worker + Agent. Null = legacy.

ALTER TABLE agent_queue
  ADD COLUMN IF NOT EXISTS ai_worker_id uuid REFERENCES ai_workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_id      uuid REFERENCES agents(id)     ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_queue_worker ON agent_queue(ai_worker_id) WHERE ai_worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_queue_agent  ON agent_queue(agent_id)     WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_queue_worker_status ON agent_queue(ai_worker_id, status) WHERE ai_worker_id IS NOT NULL;

-- Existing rows: ai_worker_id = NULL (pre-worker-era legacy, never shown on worker pages)
-- No backfill needed.
