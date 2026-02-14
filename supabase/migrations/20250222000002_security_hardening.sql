-- ============================================================================
-- SECURITY HARDENING MIGRATION (idempotent)
--
-- 1. RLS on embedding_cache_state + temporal_memory_state
-- 2. Memory eviction function (TTL + max per org)
-- 3. Calibration metrics table
-- 4. Performance indexes
-- ============================================================================

-- ═══ PART 1: ENABLE RLS ON MISSING TABLES ═══

ALTER TABLE IF EXISTS embedding_cache_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'embedding_cache_service_all' AND tablename = 'embedding_cache_state') THEN
    EXECUTE 'CREATE POLICY embedding_cache_service_all ON embedding_cache_state FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'embedding_cache_read_org' AND tablename = 'embedding_cache_state') THEN
    EXECUTE 'CREATE POLICY embedding_cache_read_org ON embedding_cache_state FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'embedding_cache_admin_all' AND tablename = 'embedding_cache_state') THEN
    EXECUTE 'CREATE POLICY embedding_cache_admin_all ON embedding_cache_state FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true
    ))';
  END IF;
END $$;

ALTER TABLE IF EXISTS temporal_memory_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'temporal_memory_service_all' AND tablename = 'temporal_memory_state') THEN
    EXECUTE 'CREATE POLICY temporal_memory_service_all ON temporal_memory_state FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'temporal_memory_read_org' AND tablename = 'temporal_memory_state') THEN
    EXECUTE 'CREATE POLICY temporal_memory_read_org ON temporal_memory_state FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'temporal_memory_admin_all' AND tablename = 'temporal_memory_state') THEN
    EXECUTE 'CREATE POLICY temporal_memory_admin_all ON temporal_memory_state FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true
    ))';
  END IF;
END $$;


-- ═══ PART 2: MEMORY EVICTION FUNCTION ═══

CREATE OR REPLACE FUNCTION evict_stale_memories(
  p_max_memories_per_org INTEGER DEFAULT 50000,
  p_ttl_days INTEGER DEFAULT 365,
  p_batch_size INTEGER DEFAULT 5000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org RECORD;
  v_evicted_ttl INTEGER := 0;
  v_evicted_overflow INTEGER := 0;
  v_evicted_temporal INTEGER := 0;
  v_org_count INTEGER;
  v_deleted INTEGER;
BEGIN
  -- 1. TTL-based eviction
  DELETE FROM ai_memory
    WHERE created_at < NOW() - (p_ttl_days || ' days')::INTERVAL
      AND importance < 0.3;
  GET DIAGNOSTICS v_evicted_ttl = ROW_COUNT;

  -- 2. Per-org overflow eviction
  FOR v_org IN SELECT DISTINCT organization_id FROM ai_memory LOOP
    SELECT count(*) INTO v_org_count
      FROM ai_memory WHERE organization_id = v_org.organization_id;

    IF v_org_count > p_max_memories_per_org THEN
      DELETE FROM ai_memory
        WHERE id IN (
          SELECT id FROM ai_memory
            WHERE organization_id = v_org.organization_id
            ORDER BY importance ASC, created_at ASC
            LIMIT LEAST(v_org_count - p_max_memories_per_org, p_batch_size)
        );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_evicted_overflow := v_evicted_overflow + v_deleted;
    END IF;
  END LOOP;

  -- 3. Temporal memory state cleanup
  DELETE FROM temporal_memory_state
    WHERE updated_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS v_evicted_temporal = ROW_COUNT;

  -- 4. Embedding cache cleanup (uses created_at)
  DELETE FROM embedding_cache_state
    WHERE created_at < NOW() - INTERVAL '90 days';

  RETURN jsonb_build_object(
    'evicted_ttl', v_evicted_ttl,
    'evicted_overflow', v_evicted_overflow,
    'evicted_temporal', v_evicted_temporal,
    'max_per_org', p_max_memories_per_org,
    'ttl_days', p_ttl_days,
    'executed_at', NOW()
  );
END;
$$;


-- ═══ PART 3: CALIBRATION METRICS TABLE ═══

CREATE TABLE IF NOT EXISTS calibration_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  domain TEXT NOT NULL DEFAULT 'all',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_predictions INTEGER NOT NULL DEFAULT 0,
  resolved_predictions INTEGER NOT NULL DEFAULT 0,
  brier_score NUMERIC,
  expected_calibration_error NUMERIC,
  calibration_bias TEXT,
  average_confidence NUMERIC,
  accuracy NUMERIC,
  calibration_buckets JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS calibration_metrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'calibration_service_all' AND tablename = 'calibration_metrics') THEN
    EXECUTE 'CREATE POLICY calibration_service_all ON calibration_metrics FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'calibration_read_org' AND tablename = 'calibration_metrics') THEN
    EXECUTE 'CREATE POLICY calibration_read_org ON calibration_metrics FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_calibration_org_domain
  ON calibration_metrics (organization_id, domain, period_end DESC);


-- ═══ PART 4: PERFORMANCE INDEXES ═══

CREATE INDEX IF NOT EXISTS idx_memory_org_importance
  ON ai_memory (organization_id, importance ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_temporal_memory_updated
  ON temporal_memory_state (updated_at);

CREATE INDEX IF NOT EXISTS idx_embedding_cache_created
  ON embedding_cache_state (created_at);
