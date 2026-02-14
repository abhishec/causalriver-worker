-- =============================================================================
-- Warm Tier Partitioning (Bottleneck #6 Fix)
--
-- Creates partitioned tables for warm-tier signal storage.
-- Partition strategy: range by created_at (monthly), with org_id index.
--
-- This replaces the Redis-only mock in data-tier-manager.ts with real
-- PostgreSQL native partitioning for 10M+ signals.
--
-- Hot tier: Redis (< 24h, sub-ms reads)
-- Warm tier: PG partitioned tables (1-90 days, <10ms reads)
-- Cold tier: PG compressed archive (>90 days, archive access)
-- =============================================================================

-- 1. Create the partitioned warm-tier signals table
CREATE TABLE IF NOT EXISTS warm_tier_signals (
  id UUID DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  domain TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value NUMERIC,
  metadata JSONB DEFAULT '{}',
  embedding extensions.vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 2. Create monthly partitions for the next 12 months (auto-extend via cron)
DO $$
DECLARE
  start_date DATE := DATE_TRUNC('month', CURRENT_DATE);
  partition_date DATE;
  partition_name TEXT;
  next_date DATE;
BEGIN
  FOR i IN 0..11 LOOP
    partition_date := start_date + (i || ' months')::INTERVAL;
    next_date := partition_date + '1 month'::INTERVAL;
    partition_name := 'warm_tier_signals_' || TO_CHAR(partition_date, 'YYYY_MM');

    -- Create partition if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF warm_tier_signals
         FOR VALUES FROM (%L) TO (%L)',
        partition_name, partition_date, next_date
      );

      RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
  END LOOP;
END $$;

-- 3. Create indexes on partitioned table (automatically applied to all partitions)
CREATE INDEX IF NOT EXISTS idx_warm_signals_org_domain
  ON warm_tier_signals (organization_id, domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warm_signals_entity
  ON warm_tier_signals (organization_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warm_signals_type
  ON warm_tier_signals (organization_id, signal_type, created_at DESC);

-- 4. Create the cold-tier archive table (unpartitioned, compressed)
CREATE TABLE IF NOT EXISTS cold_tier_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  domain TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value NUMERIC,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cold_signals_org
  ON cold_tier_signals (organization_id, created_at DESC);

-- 5. RLS policies for warm tier
ALTER TABLE warm_tier_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY warm_signals_org_isolation ON warm_tier_signals
  FOR ALL
  USING (organization_id = (current_setting('app.current_org_id', true))::UUID);

ALTER TABLE cold_tier_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY cold_signals_org_isolation ON cold_tier_signals
  FOR ALL
  USING (organization_id = (current_setting('app.current_org_id', true))::UUID);

-- 6. Function to auto-create future partitions (call monthly via pg_cron)
CREATE OR REPLACE FUNCTION create_warm_tier_partition()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  next_month DATE := DATE_TRUNC('month', CURRENT_DATE + '1 month'::INTERVAL);
  month_after DATE := next_month + '1 month'::INTERVAL;
  partition_name TEXT := 'warm_tier_signals_' || TO_CHAR(next_month, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF warm_tier_signals
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, next_month, month_after
    );
    RAISE NOTICE 'Auto-created partition: %', partition_name;
  END IF;
END $$;

-- 7. Function to archive old warm-tier data to cold tier
CREATE OR REPLACE FUNCTION archive_warm_to_cold(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff_date TIMESTAMPTZ := NOW() - (retention_days || ' days')::INTERVAL;
  archived_count INTEGER;
BEGIN
  -- Move old data to cold tier
  WITH moved AS (
    DELETE FROM warm_tier_signals
    WHERE created_at < cutoff_date
    RETURNING *
  )
  INSERT INTO cold_tier_signals (
    id, organization_id, domain, entity_type, entity_id,
    signal_type, signal_value, metadata, created_at
  )
  SELECT
    id, organization_id, domain, entity_type, entity_id,
    signal_type, signal_value, metadata, created_at
  FROM moved;

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RAISE NOTICE 'Archived % signals from warm to cold tier (cutoff: %)', archived_count, cutoff_date;

  RETURN archived_count;
END $$;

-- 8. Grant permissions for service role
GRANT ALL ON warm_tier_signals TO service_role;
GRANT ALL ON cold_tier_signals TO service_role;
