-- =============================================================================
-- RL Quality + Query Index Fixes — Round 2 CTO Audit (2026-02-28)
-- =============================================================================
--
-- Issues fixed:
--
--   1. cross_domain_signals: brain-context L5 (48h signal stream) and L23 (24h
--      cross-domain landscape) query (org, created_at) with no domain filter.
--      The existing idx_signals_org_source_type_ts covers (org, source_domain,
--      signal_type, created_at) but a leading org+created_at index is needed for
--      queries without a source_domain filter.
--
--   2. bpaas_process_instances: process-predictor queries (org, process_type,
--      created_at DESC) for recent failure streak detection.  The existing
--      idx_bpaas_process_instances_type covers (process_type, org) but no
--      created_at column — ORDER BY created_at DESC LIMIT 5 forces a filesort.
--
--   3. prediction_records: getDomainThreshold() queries
--      (org, domain, created_at >= 30d, not null confidence) — the existing
--      idx_prediction_records_org_domain_created covers (org, domain, created_at)
--      but was added CONCURRENTLY in hot_path_indexes.  Verify it exists and add
--      a complementary partial index for agent_task_outcome queries used by
--      checkDomainDrift() and getRecentQualityPatterns().
--
--   4. cross_domain_signals: rlvr-verifier emits signals with signal_value as
--      string ('rl_verified_correct'|'rl_verified_incorrect').  A targeted index
--      on (org, source_domain, signal_timestamp) for RLVR domain reads.
--
--   5. process_state_rl_params: updateStateParams uses upsert ON CONFLICT
--      (organization_id, process_type, state_name).  The UNIQUE constraint covers
--      this, but an explicit index helps sequential scans in state-rl audit queries.
--      (Already covered by UNIQUE — adding comment only, no new index needed.)
--
-- All indexes use CONCURRENTLY to avoid table locks.
-- IF NOT EXISTS guards make every statement idempotent.
-- =============================================================================

-- ── 1. cross_domain_signals: (org, created_at) for time-window scans ─────────
-- Covers L5/L23 brain-context queries:
--   .eq("organization_id", org).gte("created_at", since).order("signal_strength").limit(N)
-- These do NOT filter on source_domain or signal_type, so the existing compound
-- indexes are not used optimally. A leading (org, created_at) allows a fast
-- range scan before sorting by signal_strength.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cross_domain_signals_org_created
  ON cross_domain_signals (organization_id, created_at DESC);

COMMENT ON INDEX idx_cross_domain_signals_org_created IS
  'brain-context L5/L23: time-window signal scans without domain filter';

-- ── 2. bpaas_process_instances: (org, process_type, created_at) ──────────────
-- Covers process-predictor recent failure streak query:
--   .eq("organization_id", org).eq("process_type", pt).order("created_at", desc).limit(5)
-- Also covers process-evolver batch instance load:
--   .eq("organization_id", org).in("process_type", [...]).gte("created_at", 30d)
-- The existing idx_bpaas_process_instances_type covers (process_type, org) but
-- leads with process_type and lacks created_at for ORDER BY / range filters.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bpaas_instances_org_type_created
  ON bpaas_process_instances (organization_id, process_type, created_at DESC);

COMMENT ON INDEX idx_bpaas_instances_org_type_created IS
  'process-predictor streak detection + process-evolver batch load: org+type+time';

-- ── 3. prediction_records: partial index for agent_task_outcome rows ──────────
-- checkDomainDrift() and getRecentQualityPatterns() filter on prediction_type =
-- 'agent_task_outcome' in addition to (org, domain, created_at).
-- A partial index on this subset makes both queries index-only scans on the
-- agent outcomes partition of the table, skipping predictor records entirely.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prediction_records_agent_outcome
  ON prediction_records (organization_id, domain, created_at DESC)
  WHERE prediction_type = 'agent_task_outcome';

COMMENT ON INDEX idx_prediction_records_agent_outcome IS
  'checkDomainDrift + getRecentQualityPatterns: partial index on agent_task_outcome rows';

-- ── 4. cross_domain_signals: RLVR domain source index ────────────────────────
-- rlvr-verifier emits signals with source_domain = 'rlvr.<domain_type>'.
-- brain-context L14 reads from rlvr_prediction_outcomes directly (not signals),
-- but future signal-based RLVR queries need a fast (org, source_domain, signal_timestamp).
-- The existing idx_signals_org_domain_timestamp covers (org, source_domain, signal_timestamp).
-- No new index needed — covered.

-- ── 5. agent_queue: (org, agent_type, created_at) for L28b brain-context query ─
-- brain-context L28b queries:
--   .eq("organization_id", org).eq("agent_type", "bpaas").gte("created_at", 7d)
-- The existing idx_queue_pending_fifo is partial (WHERE status='pending').
-- The existing idx_agent_queue_org_type_status covers (org, agent_type, status, created_at).
-- L28b does NOT filter on status — it wants ALL bpaas jobs in 7d regardless of status.
-- A non-partial (org, agent_type, created_at) index covers this pattern.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_queue_org_agent_type_created
  ON agent_queue (organization_id, agent_type, created_at DESC);

COMMENT ON INDEX idx_agent_queue_org_agent_type_created IS
  'brain-context L28b + L27b: agent_type-scoped time-window queries (all statuses)';
