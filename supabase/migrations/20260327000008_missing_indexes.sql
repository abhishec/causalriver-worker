-- Missing indexes for hot query paths identified in CTO audit (2026-02-27)
--
-- 1. prediction_records: getLearningStats() filters by (organization_id, prediction_type)
--    and orders by created_at DESC — no compound index existed.
--
-- 2. agent_queue: getOrgAgentState() queries by (organization_id, status='running')
--    but the existing idx_queue_pending only covers status='pending'.
--    A partial index for running jobs prevents a full scan on every orchestrator call.
--
-- 3. cross_domain_signals: brain-context.ts COUNT(*) query only has an org+signal_ts
--    index from add_signal_timestamp migration. The pure COUNT(*) per org query
--    (used for brainIq derivation) benefits from a dedicated covering index.

-- ── 1. prediction_records compound index ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_prediction_records_org_type_created
  ON prediction_records (organization_id, prediction_type, created_at DESC);

-- ── 2. agent_queue partial index for running jobs ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_queue_running
  ON agent_queue (organization_id, status)
  WHERE status = 'running';

-- ── 3. cross_domain_signals covering index for COUNT per org ──────────────────
-- Allows the brainIq COUNT query to use index-only scan
CREATE INDEX IF NOT EXISTS idx_cds_org_id_covering
  ON cross_domain_signals (organization_id)
  INCLUDE (id);
