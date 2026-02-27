-- =============================================================================
-- Hot-path compound indexes for agent_queue, cross_domain_signals,
-- prediction_records (2026-03-30 audit).
--
-- Context:
--   - agent_queue: process-jobs cron queries by (status, organization_id) and
--     (organization_id, status) — existing idx_agent_queue_org_type_status covers
--     (org, type, status, created_at) but a focused (status, org) partial index
--     speeds the scheduled process-jobs query that scans all pending jobs.
--
--   - cross_domain_signals: the copilot chat route fires a COUNT(*) query on
--     (organization_id) at every message to gauge brain readiness. The existing
--     idx_cross_domain_signals_org index covers this, but the domain-executor
--     also queries (org, source_domain, signal_type, signal_value) for domain
--     filtering. signal_value queries are not currently indexed.
--
--   - prediction_records: the RL status endpoint and cognitive planner query
--     (organization_id, domain, created_at DESC) — there is an existing
--     (org, domain) index from nexus_brain_core but no composite with created_at
--     for descending time-ordered scans. Adding it here.
--
-- All indexes use CONCURRENTLY so no table locks are acquired.
-- IF NOT EXISTS guards make every statement idempotent.
-- =============================================================================

-- ── 1. agent_queue: pending-jobs index for process-jobs cron ─────────────────
-- The scheduled process-jobs route queries: .eq('status', 'pending').order('priority')
-- A partial index on pending rows reduces the scan to only actionable jobs.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_queue_pending_priority
  ON agent_queue (organization_id, priority DESC, created_at ASC)
  WHERE status = 'pending';

-- ── 2. agent_queue: compound (status, organization_id) for cross-org queries ─
-- Admin queries that filter by status across all orgs benefit from a leading
-- status column. Complements the existing org-leading index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_queue_status_org
  ON agent_queue (status, organization_id, created_at DESC);

-- ── 3. cross_domain_signals: signal_value + signal_strength filter ────────────
-- domain-executor and recovery-agent query:
--   .eq('organization_id', org).gte('signal_value', threshold).order('signal_strength')
-- The existing org index doesn't cover signal_value or signal_strength filters.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cross_domain_signals_org_value_strength
  ON cross_domain_signals (organization_id, signal_value DESC, signal_strength DESC)
  WHERE signal_value IS NOT NULL;

-- ── 4. prediction_records: (org, domain, created_at) for RL status queries ───
-- getLearningStats() and /api/brain/rl-status query:
--   .eq('organization_id', org).eq('domain', dom).order('created_at', desc).limit(N)
-- The existing (org, domain) index from nexus_brain_core is prefix-compatible,
-- but appending created_at makes sort + limit queries index-only.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prediction_records_org_domain_created
  ON prediction_records (organization_id, domain, created_at DESC);

-- ── 5. ai_memory: (org, memory_type, created_at) for correction queries ───────
-- The corrections cache queries:
--   .eq('organization_id', org).eq('memory_type', 'correction').order('importance').order('created_at')
-- The existing idx_ai_memory_org_domain_type covers (org, domain, memory_type).
-- A (org, memory_type, created_at) index speeds the time-ordered correction fetch.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_memory_org_type_created
  ON ai_memory (organization_id, memory_type, created_at DESC);
