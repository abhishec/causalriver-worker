-- =============================================================================
-- CRITICAL INDEX FIX: Query Performance (30-50x Slowdown)
-- =============================================================================
--
-- Issue: Consolidation engine and causal discovery queries are 30-50x slower
-- than targets (p50: 145ms vs target <5ms, p95: 357ms vs target <10ms)
--
-- Root Cause: Missing composite indexes on cross_domain_signals for:
-- 1. Pagination by ID after org+timestamp filtering
-- 2. Domain-scoped causal discovery with timestamp ranges
--
-- Also: Agent queue missing FIFO ordering index for job workers
-- =============================================================================

-- Index 1: Consolidation Engine Pagination (CRITICAL)
-- Supports: SELECT ... WHERE organization_id = ? ORDER BY id LIMIT ?
-- Without this, PostgreSQL does a full table sort on every batch fetch
CREATE INDEX IF NOT EXISTS idx_signals_org_id
  ON cross_domain_signals (organization_id, id);

COMMENT ON INDEX idx_signals_org_id IS
  'Consolidation engine pagination: cursor-based streaming by ID after org filtering';

-- Index 2: Causal Discovery Domain+Time Filtering (HIGH)
-- Supports: WHERE organization_id = ? AND source_domain = ? AND signal_timestamp BETWEEN ? AND ?
-- The existing idx_signals_org_domain only covers (org, domain) without timestamp ordering
CREATE INDEX IF NOT EXISTS idx_signals_org_domain_timestamp
  ON cross_domain_signals (organization_id, source_domain, signal_timestamp DESC);

COMMENT ON INDEX idx_signals_org_domain_timestamp IS
  'Causal discovery: domain-scoped time-range queries with timestamp ordering';

-- Index 3: Agent Queue FIFO Processing (MEDIUM)
-- Supports: WHERE org = ? AND agent_type = ? AND status = 'pending' ORDER BY created_at
-- This SUPERSEDES idx_queue_pending which lacked created_at for ordered retrieval.
-- The new index covers all columns of the old index plus created_at for FIFO ordering.
CREATE INDEX IF NOT EXISTS idx_queue_pending_fifo
  ON agent_queue (organization_id, agent_type, status, created_at)
  WHERE status = 'pending';

COMMENT ON INDEX idx_queue_pending_fifo IS
  'Agent job workers: FIFO job retrieval with proper ordering (supersedes idx_queue_pending)';

-- Drop the old redundant index (idx_queue_pending_fifo is a superset)
DROP INDEX IF EXISTS idx_queue_pending;

-- Index 4: Write-Path Optimization (MEDIUM)
-- Supports faster INSERT lookups for dedup and constraint checking on hot write path
CREATE INDEX IF NOT EXISTS idx_signals_org_source_type_ts
  ON cross_domain_signals (organization_id, source_domain, signal_type, created_at DESC);

COMMENT ON INDEX idx_signals_org_source_type_ts IS
  'Write-path optimization: composite index for signal dedup and constraint checks';
