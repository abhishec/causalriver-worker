-- Add compound partial index for agent_type + pending jobs hot path (audit H7)
-- The job-worker queries: status='pending' AND agent_type='se-aas' ORDER BY priority DESC, created_at ASC
-- Existing idx_agent_queue_pending_priority doesn't filter by agent_type, causing a post-index scan.
-- This partial index (status='pending') + compound (agent_type, org, priority, created_at) enables
-- index-only access for the worker's batch-fetch query.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_queue_pending_agent_type_priority
  ON agent_queue (agent_type, organization_id, priority DESC, created_at ASC)
  WHERE status = 'pending';

COMMENT ON INDEX idx_agent_queue_pending_agent_type_priority IS
  'job-worker hot path: agent_type + pending filter + priority ordering — audit H7';
