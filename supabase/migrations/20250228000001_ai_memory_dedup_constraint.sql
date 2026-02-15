-- ============================================================================
-- 10M SCALE FIX: ai_memory dedup constraint
-- ============================================================================
--
-- Problem: Every consolidation cycle INSERTs new ai_memory rows for the
-- same memory_type + domain, causing unbounded growth. After 100 cycles
-- at 10M signals/org, ai_memory can reach 100K+ rows of duplicates.
--
-- Solution: Add a UNIQUE constraint on (organization_id, memory_type, domain)
-- so that upsertMemory() can use ON CONFLICT to update existing memories
-- instead of creating new ones. Growth is bounded to O(types × domains).
--
-- Safety: Before creating the constraint, we deduplicate existing rows
-- by keeping the most recently updated row for each (org, type, domain).
-- ============================================================================

-- Step 1: Deduplicate existing rows (keep most recent per org+type+domain)
DELETE FROM ai_memory
WHERE id NOT IN (
  SELECT DISTINCT ON (organization_id, memory_type, domain) id
  FROM ai_memory
  ORDER BY organization_id, memory_type, domain, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
);

-- Step 2: Create the unique constraint for UPSERT support
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_org_type_domain_unique
  ON ai_memory (organization_id, memory_type, domain);
