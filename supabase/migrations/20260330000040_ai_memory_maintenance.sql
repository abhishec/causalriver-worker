-- Maintenance function to prune stale ai_memory rows
-- Called by the cognitive-cycle cron every 30 minutes.
--
-- Prunes three categories of stale rows:
--   1. working   — short-lived planner context; safe to delete after 24h
--   2. dedup     — 2h TTL cooldown markers; safe to delete after 3h (2h TTL + 1h buffer)
--   3. episodic  — bounded at 10 per (org, domain); excess rows beyond the cap
--
-- Returns the total number of rows deleted.

CREATE OR REPLACE FUNCTION prune_ai_memory(p_organization_id UUID)
RETURNS INT AS $$
DECLARE
  deleted_count INT := 0;
  step_count    INT;
BEGIN
  -- 1. Prune working memory older than 24h
  DELETE FROM ai_memory
  WHERE organization_id = p_organization_id
    AND memory_type = 'working'
    AND created_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS step_count = ROW_COUNT;
  deleted_count := deleted_count + step_count;

  -- 2. Cap working memory at 50 rows per org (safety net for high-frequency writes)
  DELETE FROM ai_memory
  WHERE id IN (
    SELECT id FROM ai_memory
    WHERE organization_id = p_organization_id
      AND memory_type = 'working'
    ORDER BY created_at DESC
    OFFSET 50
  );
  GET DIAGNOSTICS step_count = ROW_COUNT;
  deleted_count := deleted_count + step_count;

  -- 3. Prune dedup markers older than 3h (2h TTL + 1h buffer)
  DELETE FROM ai_memory
  WHERE organization_id = p_organization_id
    AND memory_type = 'dedup'
    AND created_at < NOW() - INTERVAL '3 hours';
  GET DIAGNOSTICS step_count = ROW_COUNT;
  deleted_count := deleted_count + step_count;

  -- 4. Enforce episodic memory bound: keep only the 10 most-recent rows per
  --    (organization_id, domain) pair.  The cognitive planner inserts a bound
  --    check inline, but this function acts as an out-of-band safety net for
  --    any path that skips the inline check.
  DELETE FROM ai_memory
  WHERE id IN (
    SELECT id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY organization_id, domain
          ORDER BY created_at DESC
        ) AS rn
      FROM ai_memory
      WHERE organization_id = p_organization_id
        AND memory_type = 'episodic'
    ) ranked
    WHERE rn > 10
  );
  GET DIAGNOSTICS step_count = ROW_COUNT;
  deleted_count := deleted_count + step_count;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to the service role so the cron can call it
GRANT EXECUTE ON FUNCTION prune_ai_memory(UUID) TO service_role;
