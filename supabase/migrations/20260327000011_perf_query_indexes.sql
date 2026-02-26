-- =============================================================================
-- Performance: Missing indexes identified in DB query pattern audit (2026-02-27)
--
-- Issues fixed:
--   1. health_alert_log: retryFailedDeliveries() queries by (delivery_error IS NOT NULL,
--      created_at DESC) with no org filter. The existing idx_health_alert_log_org_dim
--      is (org, dimension, created_at) — unhelpful for cross-org delivery retry scan.
--      Add a partial index covering only rows with delivery errors (sparse — fast).
--
--   2. health_alert_log: cooldown dedup query uses (organization_id, created_at DESC).
--      Existing index covers (org, dimension, created_at) which works, but explicit
--      covering index on (org, created_at) allows index-only scan for the dimension
--      projection used in the dedup check.
--
--   3. cascade_alerts: insert + select(id, trigger_domain) in batch alert creation
--      path. Existing idx_cascade_alerts_org is on (organization_id) alone.
--      Add (organization_id, trigger_domain) for fast lookup in alertIdByDimension map.
-- =============================================================================

-- 1. health_alert_log partial index for delivery retry scan
--    Covers: .not("delivery_error", "is", null) + .gte("created_at", cutoff)
CREATE INDEX IF NOT EXISTS idx_health_alert_log_failed_delivery
  ON health_alert_log (created_at DESC)
  WHERE delivery_error IS NOT NULL;

-- 2. health_alert_log covering index for org + time dedup check
--    Covers: .eq("organization_id", orgId) + .gte("created_at", cooldownCutoff) + .select("dimension")
CREATE INDEX IF NOT EXISTS idx_health_alert_log_org_time
  ON health_alert_log (organization_id, created_at DESC)
  INCLUDE (dimension);

-- 3. cascade_alerts compound index for (org, trigger_domain) batch lookup
--    Covers: batch select after insert to build alertIdByDimension map
CREATE INDEX IF NOT EXISTS idx_cascade_alerts_org_domain
  ON cascade_alerts (organization_id, trigger_domain);
