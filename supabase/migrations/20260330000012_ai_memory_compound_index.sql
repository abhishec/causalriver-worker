-- Add compound index on ai_memory(organization_id, domain, memory_type).
--
-- Why: 14+ queries per copilot request filter ai_memory by org + domain + memory_type.
-- Individual column indexes are less efficient than a compound index that covers
-- the actual query pattern. CONCURRENTLY avoids table lock on existing data.
--
-- This index also benefits:
--   - Cognitive planner domain scoping
--   - Brain context mesh domain lookups
--   - Memory dedup checks (domain + memory_type = 'dedup')

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_memory_org_domain_type
  ON public.ai_memory(organization_id, domain, memory_type);
