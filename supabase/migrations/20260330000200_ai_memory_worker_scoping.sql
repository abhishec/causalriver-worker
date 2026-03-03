-- ============================================================================
-- ai_memory Worker Scoping (ADR-027)
-- ============================================================================
-- Adds ai_worker_id column to ai_memory for per-worker memory isolation.
-- Two workers in the same org should have independent episodic memories.
--
-- The column is NULLABLE: NULL = workspace-wide memory (connector syncs, config).
-- Non-NULL = worker-specific memory (structured-outcome, episodic, entity).
--
-- The existing unique constraint on (organization_id, memory_type, domain)
-- is replaced with a partial constraint that includes ai_worker_id.
-- ============================================================================

-- Step 1: Add nullable column
ALTER TABLE ai_memory ADD COLUMN IF NOT EXISTS ai_worker_id UUID;

-- Step 2: Drop old unique constraint (blocks per-worker differentiation)
DROP INDEX IF EXISTS ai_memory_dedup;

-- Step 3: Create new unique constraint including ai_worker_id
-- For rows WITH ai_worker_id: unique per (org, worker, type, domain)
CREATE UNIQUE INDEX IF NOT EXISTS ai_memory_worker_dedup
  ON ai_memory(organization_id, COALESCE(ai_worker_id, '00000000-0000-0000-0000-000000000000'::uuid), memory_type, domain);

-- Step 4: Index for worker-scoped queries
CREATE INDEX IF NOT EXISTS idx_ai_memory_worker
  ON ai_memory(organization_id, ai_worker_id)
  WHERE ai_worker_id IS NOT NULL;

-- Step 5: Update compound index to include ai_worker_id
DROP INDEX IF EXISTS idx_ai_memory_compound;
CREATE INDEX IF NOT EXISTS idx_ai_memory_compound_v2
  ON ai_memory(organization_id, domain, memory_type, ai_worker_id);
