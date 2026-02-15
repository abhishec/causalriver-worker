-- Data Partitioning for 10M+ Signals
-- =====================================
--
-- Implement org_id x time-based partitioning for scalability.
-- This enables efficient queries and data management at scale.
--
-- Tables to partition:
-- - connector_signals (highest volume)
-- - agent_activity_log (high volume)
-- - ai_memory (grows continuously)

-- ============================================================================
-- 1. Partition connector_signals by organization_id + timestamp
-- ============================================================================

-- Create partitioned table (if starting fresh, otherwise use ALTER TABLE)
-- For existing table, we need to create new partitioned table and migrate data

CREATE TABLE IF NOT EXISTS connector_signals_partitioned (
  id BIGSERIAL,
  organization_id TEXT NOT NULL,
  source TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  data JSONB NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, timestamp, id)
) PARTITION BY RANGE (timestamp);

-- Create partitions for current and future months
-- This should be automated via pg_cron or maintenance script
CREATE TABLE IF NOT EXISTS connector_signals_2026_02 
  PARTITION OF connector_signals_partitioned
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE IF NOT EXISTS connector_signals_2026_03
  PARTITION OF connector_signals_partitioned
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS connector_signals_2026_04
  PARTITION OF connector_signals_partitioned
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Create indexes on partitions for performance
CREATE INDEX IF NOT EXISTS idx_signals_2026_02_org_source 
  ON connector_signals_2026_02(organization_id, source);

CREATE INDEX IF NOT EXISTS idx_signals_2026_03_org_source
  ON connector_signals_2026_03(organization_id, source);

CREATE INDEX IF NOT EXISTS idx_signals_2026_04_org_source
  ON connector_signals_2026_04(organization_id, source);

-- ============================================================================
-- 2. Partition agent_activity_log by timestamp
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_activity_log_partitioned (
  id BIGSERIAL,
  organization_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (timestamp, id)
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE IF NOT EXISTS agent_activity_2026_02
  PARTITION OF agent_activity_log_partitioned
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE IF NOT EXISTS agent_activity_2026_03
  PARTITION OF agent_activity_log_partitioned
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS agent_activity_2026_04
  PARTITION OF agent_activity_log_partitioned
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_2026_02_org_agent
  ON agent_activity_2026_02(organization_id, agent_name);

CREATE INDEX IF NOT EXISTS idx_activity_2026_03_org_agent
  ON agent_activity_2026_03(organization_id, agent_name);

CREATE INDEX IF NOT EXISTS idx_activity_2026_04_org_agent
  ON agent_activity_2026_04(organization_id, agent_name);

-- ============================================================================
-- 3. Data Retention Policy (TTL)
-- ============================================================================

-- Function to archive old signal data
CREATE OR REPLACE FUNCTION archive_old_signals()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Archive signals older than 90 days to cold storage table
  INSERT INTO connector_signals_archive
  SELECT * FROM connector_signals_partitioned
  WHERE timestamp < now() - interval '90 days';

  -- Delete archived signals
  DELETE FROM connector_signals_partitioned
  WHERE timestamp < now() - interval '90 days';

  RAISE NOTICE 'Archived signals older than 90 days';
END;
$$;

-- Function to delete very old data (>1 year)
CREATE OR REPLACE FUNCTION delete_old_signals()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM connector_signals_archive
  WHERE timestamp < now() - interval '1 year';

  RAISE NOTICE 'Deleted signals older than 1 year';
END;
$$;

-- ============================================================================
-- 4. Partition Maintenance Functions
-- ============================================================================

-- Function to create next month's partition
CREATE OR REPLACE FUNCTION create_next_partition()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  next_month DATE;
  month_after DATE;
  partition_name TEXT;
BEGIN
  next_month := date_trunc('month', now() + interval '1 month');
  month_after := next_month + interval '1 month';
  partition_name := 'connector_signals_' || to_char(next_month, 'YYYY_MM');

  -- Create partition if it doesn't exist
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF connector_signals_partitioned FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    next_month,
    month_after
  );

  -- Create index
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_%I_org_source ON %I(organization_id, source)',
    partition_name,
    partition_name
  );

  RAISE NOTICE 'Created partition: %', partition_name;
END;
$$;

-- ============================================================================
-- 5. Comments for Documentation
-- ============================================================================

COMMENT ON TABLE connector_signals_partitioned IS 
  'Partitioned table for connector signals - enables efficient queries at 10M+ scale';

COMMENT ON FUNCTION create_next_partition IS
  'Creates next month partition - should be called monthly via pg_cron';

COMMENT ON FUNCTION archive_old_signals IS
  'Archives signals older than 90 days - run weekly via pg_cron';

COMMENT ON FUNCTION delete_old_signals IS
  'Deletes signals older than 1 year - run monthly via pg_cron';

-- ============================================================================
-- 6. Enable RLS on Partitioned Tables
-- ============================================================================

ALTER TABLE connector_signals_partitioned ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_activity_log_partitioned ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS org_isolation_signals ON connector_signals_partitioned;
DROP POLICY IF EXISTS org_isolation_activity ON agent_activity_log_partitioned;

-- Policies will be inherited by partitions
CREATE POLICY org_isolation_signals ON connector_signals_partitioned
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_activity ON agent_activity_log_partitioned
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true));
