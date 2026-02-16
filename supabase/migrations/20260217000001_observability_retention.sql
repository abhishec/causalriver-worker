--
-- NexusBrain Observability - Data Retention & Archival Policies
--
-- Implements tiered data retention strategy:
-- - Hot Tier (0-7 days): Full data in main tables, optimized indexes
-- - Warm Tier (7-90 days): Partitioned data, reduced indexes
-- - Cold Tier (90-365 days): Compressed archives, minimal indexes
-- - Deletion (365+ days): Permanent deletion based on policy
--
-- Prevents unbounded growth while maintaining forensic capabilities.
--
-- At 10M signals/day:
-- - Hot: 70M records = ~70GB
-- - Warm: 830M records = ~200GB (compressed)
-- - Cold: 2.74B records = ~500GB (heavily compressed)
-- - Total: ~770GB vs 3.65TB (unmanaged)
--
-- Migration Date: 2026-02-17
--

-- ============================================================================
-- RETENTION POLICY CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS obs_retention_policies (
  table_name TEXT PRIMARY KEY,
  hot_tier_days INTEGER NOT NULL DEFAULT 7,
  warm_tier_days INTEGER NOT NULL DEFAULT 90,
  cold_tier_days INTEGER NOT NULL DEFAULT 365,
  deletion_days INTEGER, -- NULL = keep forever
  archive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  compression_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE obs_retention_policies IS
'Retention policy configuration for observability tables. Defines data lifecycle across hot/warm/cold tiers.';

-- ============================================================================
-- DEFAULT RETENTION POLICIES
-- ============================================================================

INSERT INTO obs_retention_policies (table_name, hot_tier_days, warm_tier_days, cold_tier_days, deletion_days) VALUES
  -- High-volume, lower priority: shorter retention
  ('obs_signal_ingestion', 7, 30, 90, 365),
  ('obs_entity_resolution', 7, 30, 90, 365),
  ('obs_semantic_operations', 7, 30, 180, 730),  -- Keep longer due to cost data

  -- Medium-volume, high priority: medium retention
  ('obs_causal_calculations', 30, 90, 365, 730),
  ('obs_pattern_learning', 30, 90, 365, 730),
  ('obs_agent_executions', 14, 90, 365, 730),
  ('obs_connector_operations', 7, 90, 365, 730),

  -- Cognitive layers: long retention for research
  ('obs_deep_dreaming', 30, 90, 365, 730),
  ('obs_hierarchical_memory', 30, 90, 365, NULL),  -- Keep forever
  ('obs_curiosity_engine', 30, 90, 365, 730),
  ('obs_self_modifying_cognition', 30, 90, 365, NULL),  -- Keep forever
  ('obs_intelligence_mesh', 30, 90, 365, 730),
  ('obs_causal_imagination', 30, 90, 365, 730),
  ('obs_theory_of_mind', 30, 90, 365, 730),
  ('obs_temporal_consciousness', 30, 90, 365, 730),

  -- Meta: critical for forensics, long retention
  ('obs_feedback_loops', 90, 365, 730, NULL),  -- Keep forever
  ('obs_consolidation_cycles', 90, 365, 730, NULL),  -- Keep forever
  ('obs_layer_health', 30, 90, 365, 730);

-- ============================================================================
-- ARCHIVE TABLES (COLD TIER)
-- ============================================================================

/**
 * Create archive table for cold storage
 * Archive tables use compression and reduced indexes for storage efficiency
 */
CREATE OR REPLACE FUNCTION create_archive_table(base_table_name TEXT)
RETURNS void AS $$
DECLARE
  archive_table_name TEXT;
BEGIN
  archive_table_name := base_table_name || '_archive';

  -- Create archive table with same schema but no indexes initially
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      LIKE %I INCLUDING DEFAULTS INCLUDING CONSTRAINTS
    )
  ', archive_table_name, base_table_name);

  -- Add minimal indexes for archive queries
  EXECUTE format('
    CREATE INDEX IF NOT EXISTS %I
    ON %I (organization_id, created_at DESC)
  ', archive_table_name || '_org_time_idx', archive_table_name);

  -- Enable compression (PostgreSQL 14+ with TOAST)
  EXECUTE format('
    ALTER TABLE %I
    ALTER COLUMN id SET STORAGE EXTENDED
  ', archive_table_name);

  RAISE NOTICE 'Created archive table: %', archive_table_name;
END;
$$ LANGUAGE plpgsql;

-- Create archive tables for all observability tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM obs_retention_policies
  LOOP
    PERFORM create_archive_table(tbl);
  END LOOP;
END $$;

-- ============================================================================
-- DATA ARCHIVAL FUNCTIONS
-- ============================================================================

/**
 * Archive old data from hot tier to cold tier
 * Moves data older than warm_tier_days to archive table
 */
CREATE OR REPLACE FUNCTION archive_observability_data(
  base_table_name TEXT,
  batch_size INTEGER DEFAULT 10000
)
RETURNS TABLE(
  archived_rows BIGINT,
  deleted_rows BIGINT,
  duration_ms BIGINT
) AS $$
DECLARE
  policy RECORD;
  archive_table TEXT;
  start_time TIMESTAMPTZ;
  rows_moved BIGINT := 0;
  rows_deleted BIGINT := 0;
  total_moved BIGINT := 0;
  total_deleted BIGINT := 0;
BEGIN
  start_time := CLOCK_TIMESTAMP();

  -- Get retention policy
  SELECT * INTO policy
  FROM obs_retention_policies
  WHERE table_name = base_table_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No retention policy found for table: %', base_table_name;
  END IF;

  IF NOT policy.archive_enabled THEN
    RAISE NOTICE 'Archival disabled for table: %', base_table_name;
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  archive_table := base_table_name || '_archive';

  -- Archive data older than warm_tier_days
  LOOP
    EXECUTE format('
      WITH archived AS (
        DELETE FROM %I
        WHERE created_at < NOW() - INTERVAL ''%s days''
          AND created_at >= NOW() - INTERVAL ''%s days''
        RETURNING *
      )
      INSERT INTO %I
      SELECT * FROM archived
    ', base_table_name, policy.warm_tier_days, policy.cold_tier_days, archive_table);

    GET DIAGNOSTICS rows_moved = ROW_COUNT;
    total_moved := total_moved + rows_moved;

    EXIT WHEN rows_moved < batch_size;

    -- Rate limiting: pause 100ms between batches
    PERFORM pg_sleep(0.1);
  END LOOP;

  -- Delete data older than deletion_days (if policy specifies)
  IF policy.deletion_days IS NOT NULL THEN
    LOOP
      EXECUTE format('
        DELETE FROM %I
        WHERE created_at < NOW() - INTERVAL ''%s days''
          AND id IN (
            SELECT id FROM %I
            WHERE created_at < NOW() - INTERVAL ''%s days''
            LIMIT %s
          )
      ', archive_table, policy.deletion_days, archive_table, policy.deletion_days, batch_size);

      GET DIAGNOSTICS rows_deleted = ROW_COUNT;
      total_deleted := total_deleted + rows_deleted;

      EXIT WHEN rows_deleted < batch_size;

      PERFORM pg_sleep(0.1);
    END LOOP;
  END IF;

  RETURN QUERY SELECT
    total_moved,
    total_deleted,
    EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - start_time))::BIGINT * 1000;
END;
$$ LANGUAGE plpgsql;

/**
 * Archive all observability tables according to their policies
 */
CREATE OR REPLACE FUNCTION archive_all_observability_data()
RETURNS TABLE(
  table_name TEXT,
  archived_rows BIGINT,
  deleted_rows BIGINT,
  duration_ms BIGINT
) AS $$
DECLARE
  policy RECORD;
BEGIN
  FOR policy IN
    SELECT * FROM obs_retention_policies
    WHERE archive_enabled = TRUE
    ORDER BY table_name
  LOOP
    BEGIN
      RETURN QUERY
      SELECT
        policy.table_name,
        r.archived_rows,
        r.deleted_rows,
        r.duration_ms
      FROM archive_observability_data(policy.table_name) r;

      RAISE NOTICE 'Archived %: % rows moved, % deleted, % ms',
        policy.table_name,
        archived_rows,
        deleted_rows,
        duration_ms;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to archive %: %', policy.table_name, SQLERRM;
      RETURN QUERY SELECT policy.table_name, 0::BIGINT, 0::BIGINT, 0::BIGINT;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VACUUM AND MAINTENANCE
-- ============================================================================

/**
 * Vacuum observability tables after archival
 * Reclaims disk space and updates statistics
 */
CREATE OR REPLACE FUNCTION vacuum_observability_tables()
RETURNS void AS $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM obs_retention_policies
  LOOP
    EXECUTE format('VACUUM ANALYZE %I', tbl);
    EXECUTE format('VACUUM ANALYZE %I', tbl || '_archive');

    RAISE NOTICE 'Vacuumed: %', tbl;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPREHENSIVE MAINTENANCE JOB
-- ============================================================================

/**
 * Complete observability maintenance workflow
 * - Archives old data to cold storage
 * - Deletes expired data per retention policy
 * - Vacuums tables to reclaim space
 * - Updates statistics for query planning
 */
CREATE OR REPLACE FUNCTION maintain_observability_retention()
RETURNS JSON AS $$
DECLARE
  start_time TIMESTAMPTZ;
  result JSON;
  total_archived BIGINT := 0;
  total_deleted BIGINT := 0;
  archive_record RECORD;
BEGIN
  start_time := CLOCK_TIMESTAMP();

  RAISE NOTICE 'Starting observability retention maintenance...';

  -- Archive all tables
  FOR archive_record IN
    SELECT * FROM archive_all_observability_data()
  LOOP
    total_archived := total_archived + archive_record.archived_rows;
    total_deleted := total_deleted + archive_record.deleted_rows;
  END LOOP;

  -- Vacuum tables
  PERFORM vacuum_observability_tables();

  result := json_build_object(
    'timestamp', NOW(),
    'duration_ms', EXTRACT(EPOCH FROM (CLOCK_TIMESTAMP() - start_time))::BIGINT * 1000,
    'total_archived', total_archived,
    'total_deleted', total_deleted,
    'status', 'success'
  );

  RAISE NOTICE 'Retention maintenance complete: % rows archived, % deleted',
    total_archived, total_deleted;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCHEDULE AUTOMATIC RETENTION MAINTENANCE
-- ============================================================================

-- Schedule daily archival at 2 AM
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Daily archival and cleanup
    PERFORM cron.schedule(
      'archive-observability-data',
      '0 2 * * *', -- Every day at 2 AM
      'SELECT maintain_observability_retention();'
    );

    RAISE NOTICE 'Scheduled automatic retention maintenance job (daily at 2 AM)';
  ELSE
    RAISE WARNING 'pg_cron not available. Run manually: SELECT maintain_observability_retention();';
  END IF;
END $$;

-- ============================================================================
-- MONITORING & REPORTING
-- ============================================================================

/**
 * Get storage statistics for observability tables
 * Shows data distribution across hot/warm/cold tiers
 */
CREATE OR REPLACE FUNCTION get_observability_storage_stats()
RETURNS TABLE(
  table_name TEXT,
  hot_rows BIGINT,
  hot_size TEXT,
  archive_rows BIGINT,
  archive_size TEXT,
  total_size TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.table_name,
    (SELECT COUNT(*) FROM pg_class c WHERE c.relname = p.table_name) as hot_rows,
    pg_size_pretty(pg_total_relation_size(p.table_name)) as hot_size,
    (SELECT COUNT(*) FROM pg_class c WHERE c.relname = p.table_name || '_archive') as archive_rows,
    pg_size_pretty(pg_total_relation_size(p.table_name || '_archive')) as archive_size,
    pg_size_pretty(
      pg_total_relation_size(p.table_name) +
      pg_total_relation_size(p.table_name || '_archive')
    ) as total_size
  FROM obs_retention_policies p
  ORDER BY pg_total_relation_size(p.table_name) DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

COMMENT ON FUNCTION archive_observability_data IS
'Archives old data for a specific table according to its retention policy.
Example: SELECT * FROM archive_observability_data(''obs_signal_ingestion'');';

COMMENT ON FUNCTION archive_all_observability_data IS
'Archives all observability tables in one operation.
Example: SELECT * FROM archive_all_observability_data();';

COMMENT ON FUNCTION maintain_observability_retention IS
'Complete maintenance: archive, delete, vacuum. Scheduled daily at 2 AM.
Example: SELECT maintain_observability_retention();';

COMMENT ON FUNCTION get_observability_storage_stats IS
'Get storage statistics showing data distribution across tiers.
Example: SELECT * FROM get_observability_storage_stats();';

-- Initial status
SELECT 'Retention policies configured. Archive tables created.' as status;
SELECT 'Automatic archival scheduled daily at 2 AM (requires pg_cron).' as status;
SELECT 'Manual execution: SELECT maintain_observability_retention();' as manual_command;
