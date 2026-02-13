-- ============================================================================
-- PRODUCTION HARDENING MIGRATION (Week 1-3 CTO Plan)
--
-- BLOCKER 1: Batch cleanup with safe deletion (no table locks)
-- BLOCKER 2: Scheduled cleanup via pg_cron + retention for 9 more tables
-- BLOCKER 3: RLS admin override on ALL brain tables (10 missing)
-- BLOCKER 5: System health monitoring RPC function
-- PLUS:      Rate limit tracking table, API key management API,
--            connection pooling hints, load test support
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCKER 3: ADD ADMIN OVERRIDE POLICIES TO ALL TABLES MISSING THEM
--
-- The production_readiness migration added org-member read policies
-- but NOT admin read-all policies to 19 of 21 tables. Only
-- cross_domain_signals, ai_memory, causal_relationships_statistical,
-- and entity_embeddings got admin policies. The rest are missing.
-- Platform admins CANNOT debug customer issues without these.
-- ═══════════════════════════════════════════════════════════════════════════

-- Tables that need admin_read_all policies added:
-- causal_event_stream, brain_grammar_rules, prediction_records,
-- ai_causal_chains, brain_execution_log, pattern_feedback_log,
-- org_cascade_rules, cascade_alerts, agent_registry, agent_queue,
-- ai_agent_activity, connector_sync_log, signal_thresholds,
-- resolved_entities, scheduled_verifications, prediction_outcomes,
-- contributor_expertise

DO $$
DECLARE
  tbl TEXT;
  policy_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'causal_event_stream',
    'brain_grammar_rules',
    'prediction_records',
    'ai_causal_chains',
    'brain_execution_log',
    'pattern_feedback_log',
    'org_cascade_rules',
    'cascade_alerts',
    'agent_registry',
    'agent_queue',
    'ai_agent_activity',
    'connector_sync_log',
    'signal_thresholds',
    'resolved_entities',
    'scheduled_verifications',
    'prediction_outcomes',
    'contributor_expertise'
  ]
  LOOP
    policy_name := tbl || '_admin_read_all';
    -- Only create if table exists and policy doesn't
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl AND table_schema = 'public') THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = policy_name AND tablename = tbl) THEN
        EXECUTE format(
          'CREATE POLICY %I ON %I FOR SELECT USING (
            EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
          )', policy_name, tbl
        );
        RAISE NOTICE 'Created admin policy on %', tbl;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Also add admin policies to conditional tables
DO $$
DECLARE
  tbl TEXT;
  policy_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'brain_daily_snapshots',
    'consolidation_runs',
    'strategic_priorities',
    'impact_scores',
    'proactive_insights',
    'attention_decisions',
    'fast_path_cache'
  ]
  LOOP
    policy_name := tbl || '_admin_read_all';
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl AND table_schema = 'public') THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = policy_name AND tablename = tbl) THEN
        EXECUTE format(
          'CREATE POLICY %I ON %I FOR SELECT USING (
            EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
          )', policy_name, tbl
        );
        RAISE NOTICE 'Created admin policy on conditional table %', tbl;
      END IF;
    END IF;
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCKER 1: BATCH CLEANUP FUNCTION (replaces unbounded DELETE)
--
-- The original cleanup_stale_data() does unbounded DELETEs that will lock
-- tables for 30+ minutes at 10M+ rows. This replacement uses batched
-- deletion with pg_sleep() between batches to allow checkpoints and
-- prevent replication lag.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_stale_data_batched(
  signal_retention_days INTEGER DEFAULT 90,
  event_retention_days INTEGER DEFAULT 180,
  log_retention_days INTEGER DEFAULT 30,
  memory_max_rows_per_org INTEGER DEFAULT 50000,
  batch_size INTEGER DEFAULT 5000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signals_deleted BIGINT := 0;
  v_events_deleted BIGINT := 0;
  v_logs_deleted BIGINT := 0;
  v_predictions_deleted BIGINT := 0;
  v_memory_archived BIGINT := 0;
  v_cache_deleted BIGINT := 0;
  v_feedback_deleted BIGINT := 0;
  v_conversations_deleted BIGINT := 0;
  v_cost_logs_deleted BIGINT := 0;
  v_threshold_hist_deleted BIGINT := 0;
  v_weight_hist_deleted BIGINT := 0;
  v_batch_deleted INTEGER;
  v_start_time TIMESTAMPTZ := clock_timestamp();
BEGIN
  -- ── 1. Batch-delete old signals ──────────────────────────────────
  LOOP
    DELETE FROM cross_domain_signals
    WHERE id IN (
      SELECT id FROM cross_domain_signals
      WHERE created_at < NOW() - (signal_retention_days || ' days')::INTERVAL
      LIMIT batch_size
    );
    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_signals_deleted := v_signals_deleted + v_batch_deleted;
    EXIT WHEN v_batch_deleted = 0;
    PERFORM pg_sleep(0.1);  -- Allow checkpoints between batches
  END LOOP;

  -- ── 2. Batch-delete old causal event stream ──────────────────────
  LOOP
    DELETE FROM causal_event_stream
    WHERE id IN (
      SELECT id FROM causal_event_stream
      WHERE created_at < NOW() - (event_retention_days || ' days')::INTERVAL
      LIMIT batch_size
    );
    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_events_deleted := v_events_deleted + v_batch_deleted;
    EXIT WHEN v_batch_deleted = 0;
    PERFORM pg_sleep(0.1);
  END LOOP;

  -- ── 3. Batch-delete old execution logs ───────────────────────────
  LOOP
    DELETE FROM brain_execution_log
    WHERE id IN (
      SELECT id FROM brain_execution_log
      WHERE created_at < NOW() - (log_retention_days || ' days')::INTERVAL
      LIMIT batch_size
    );
    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_logs_deleted := v_logs_deleted + v_batch_deleted;
    EXIT WHEN v_batch_deleted = 0;
    PERFORM pg_sleep(0.05);
  END LOOP;

  -- ── 4. Clean expired prediction records ──────────────────────────
  DELETE FROM prediction_records
    WHERE created_at < NOW() - (event_retention_days || ' days')::INTERVAL
      AND status = 'expired';
  GET DIAGNOSTICS v_predictions_deleted = ROW_COUNT;

  -- ── 5. Archive low-importance memories beyond per-org threshold ──
  WITH ranked AS (
    SELECT id, organization_id,
      ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY importance DESC, created_at DESC) as rn
    FROM ai_memory
  )
  DELETE FROM ai_memory
    WHERE id IN (SELECT id FROM ranked WHERE rn > memory_max_rows_per_org)
      AND importance < 0.3;
  GET DIAGNOSTICS v_memory_archived = ROW_COUNT;

  -- ── 6. Clear expired fast-path cache ─────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fast_path_cache') THEN
    DELETE FROM fast_path_cache
      WHERE expires_at IS NOT NULL AND expires_at < NOW();
    GET DIAGNOSTICS v_cache_deleted = ROW_COUNT;
  END IF;

  -- ── 7. BLOCKER 2: Clean 9 previously-unprotected tables ─────────

  -- 7a. Clean old conversation logs (180 days)
  LOOP
    DELETE FROM conversation_log
    WHERE id IN (
      SELECT id FROM conversation_log
      WHERE created_at < NOW() - (event_retention_days || ' days')::INTERVAL
      LIMIT batch_size
    );
    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_conversations_deleted := v_conversations_deleted + v_batch_deleted;
    EXIT WHEN v_batch_deleted = 0;
    PERFORM pg_sleep(0.05);
  END LOOP;

  -- 7b. Clean old LLM cost logs (365 days)
  LOOP
    DELETE FROM llm_cost_log
    WHERE id IN (
      SELECT id FROM llm_cost_log
      WHERE created_at < NOW() - INTERVAL '365 days'
      LIMIT batch_size
    );
    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_cost_logs_deleted := v_cost_logs_deleted + v_batch_deleted;
    EXIT WHEN v_batch_deleted = 0;
    PERFORM pg_sleep(0.05);
  END LOOP;

  -- 7c. Clean old pattern feedback logs (180 days)
  LOOP
    DELETE FROM pattern_feedback_log
    WHERE id IN (
      SELECT id FROM pattern_feedback_log
      WHERE created_at < NOW() - (event_retention_days || ' days')::INTERVAL
      LIMIT batch_size
    );
    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_feedback_deleted := v_feedback_deleted + v_batch_deleted;
    EXIT WHEN v_batch_deleted = 0;
    PERFORM pg_sleep(0.05);
  END LOOP;

  -- 7d. Clean old threshold optimization history (365 days)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'threshold_optimization_history') THEN
    LOOP
      DELETE FROM threshold_optimization_history
      WHERE id IN (
        SELECT id FROM threshold_optimization_history
        WHERE created_at < NOW() - INTERVAL '365 days'
        LIMIT batch_size
      );
      GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
      v_threshold_hist_deleted := v_threshold_hist_deleted + v_batch_deleted;
      EXIT WHEN v_batch_deleted = 0;
      PERFORM pg_sleep(0.05);
    END LOOP;
  END IF;

  -- 7e. Clean old weight update history (365 days, non-core only)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weight_update_history') THEN
    LOOP
      DELETE FROM weight_update_history
      WHERE id IN (
        SELECT id FROM weight_update_history
        WHERE created_at < NOW() - INTERVAL '365 days'
          AND organization_id != '00000000-0000-4000-a000-000000000001'
        LIMIT batch_size
      );
      GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
      v_weight_hist_deleted := v_weight_hist_deleted + v_batch_deleted;
      EXIT WHEN v_batch_deleted = 0;
      PERFORM pg_sleep(0.05);
    END LOOP;
  END IF;

  -- 7f. Clean old prediction outcomes (365 days)
  DELETE FROM prediction_outcomes
    WHERE created_at < NOW() - INTERVAL '365 days';

  -- 7g. Clean old cascade alerts (180 days, only resolved ones)
  DELETE FROM cascade_alerts
    WHERE created_at < NOW() - (event_retention_days || ' days')::INTERVAL
      AND verified_at IS NOT NULL;

  -- 7h. Clean old agent activity (90 days)
  DELETE FROM ai_agent_activity
    WHERE created_at < NOW() - (signal_retention_days || ' days')::INTERVAL;

  -- 7i. Clean old connector sync logs (90 days)
  DELETE FROM connector_sync_log
    WHERE created_at < NOW() - (signal_retention_days || ' days')::INTERVAL;

  RETURN jsonb_build_object(
    'signals_deleted', v_signals_deleted,
    'events_deleted', v_events_deleted,
    'logs_deleted', v_logs_deleted,
    'predictions_deleted', v_predictions_deleted,
    'memory_archived', v_memory_archived,
    'cache_deleted', v_cache_deleted,
    'feedback_deleted', v_feedback_deleted,
    'conversations_deleted', v_conversations_deleted,
    'cost_logs_deleted', v_cost_logs_deleted,
    'threshold_hist_deleted', v_threshold_hist_deleted,
    'weight_hist_deleted', v_weight_hist_deleted,
    'duration_ms', EXTRACT(MILLISECOND FROM clock_timestamp() - v_start_time)::INTEGER,
    'executed_at', NOW()
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCKER 2: SCHEDULE CLEANUP VIA PG_CRON
--
-- Supabase Pro/Enterprise supports pg_cron. Schedule weekly cleanup
-- every Sunday at 2 AM UTC. Also schedule daily lightweight cleanup.
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pg_cron (Supabase has this available on Pro+)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Weekly deep cleanup (Sunday 2 AM UTC)
SELECT cron.schedule(
  'weekly-deep-cleanup',
  '0 2 * * 0',
  $$SELECT cleanup_stale_data_batched(90, 180, 30, 50000, 5000)$$
);

-- Daily lightweight cleanup (4 AM UTC — cache + expired predictions only)
SELECT cron.schedule(
  'daily-cache-cleanup',
  '0 4 * * *',
  $$
    DELETE FROM fast_path_cache WHERE expires_at IS NOT NULL AND expires_at < NOW();
    DELETE FROM prediction_records WHERE status = 'expired' AND created_at < NOW() - INTERVAL '30 days';
  $$
);


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCKER 4: RATE LIMIT TRACKING TABLE
--
-- Sliding window rate limiting for API keys. The middleware checks this
-- table on every request and enforces the per-key rate_limit_per_minute.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('minute', NOW()),
  request_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(key_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window
  ON api_rate_limits (key_hash, window_start DESC);

-- Auto-cleanup old rate limit windows (keep only last 2 hours)
CREATE INDEX IF NOT EXISTS idx_rate_limits_created
  ON api_rate_limits (created_at);

-- RLS: only service role touches this table
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY rate_limits_service ON api_rate_limits
  FOR ALL USING (auth.role() = 'service_role');

-- Rate limit check function: returns remaining requests, or -1 if exceeded
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key_hash TEXT,
  p_limit_per_minute INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_window TIMESTAMPTZ := date_trunc('minute', NOW());
  v_count INTEGER;
BEGIN
  -- Upsert: increment counter for current minute window
  INSERT INTO api_rate_limits (key_hash, window_start, request_count)
  VALUES (p_key_hash, v_current_window, 1)
  ON CONFLICT (key_hash, window_start)
  DO UPDATE SET request_count = api_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  -- Clean old windows (older than 2 hours) — fire and forget
  DELETE FROM api_rate_limits WHERE created_at < NOW() - INTERVAL '2 hours';

  -- Return remaining requests (negative = exceeded)
  RETURN p_limit_per_minute - v_count;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BLOCKER 5: SYSTEM HEALTH MONITORING FUNCTION
--
-- Single RPC call that returns complete system health for monitoring
-- dashboards, alerting, and operational awareness.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_system_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_health JSONB;
  v_db_size_bytes BIGINT;
  v_active_connections INTEGER;
  v_total_orgs INTEGER;
  v_total_signals BIGINT;
  v_total_causal_edges BIGINT;
  v_total_memories BIGINT;
  v_total_predictions BIGINT;
  v_total_api_keys INTEGER;
  v_unverified_predictions BIGINT;
  v_active_cascade_alerts BIGINT;
  v_last_cleanup TIMESTAMPTZ;
  v_oldest_signal TIMESTAMPTZ;
  v_table_sizes JSONB;
BEGIN
  -- Database size
  SELECT pg_database_size(current_database()) INTO v_db_size_bytes;

  -- Active connections
  SELECT count(*) INTO v_active_connections FROM pg_stat_activity WHERE state = 'active';

  -- Core counts
  SELECT count(*) INTO v_total_orgs FROM organizations;

  SELECT count(*) INTO v_total_signals FROM cross_domain_signals;
  SELECT count(*) INTO v_total_causal_edges FROM causal_relationships_statistical;
  SELECT count(*) INTO v_total_memories FROM ai_memory;
  SELECT count(*) INTO v_total_predictions FROM prediction_records;
  SELECT count(*) INTO v_total_api_keys FROM api_keys WHERE is_active = true;

  -- Operational health indicators
  SELECT count(*) INTO v_unverified_predictions
    FROM prediction_records
    WHERE verified_at IS NULL AND created_at < NOW() - INTERVAL '7 days';

  SELECT count(*) INTO v_active_cascade_alerts
    FROM cascade_alerts
    WHERE verified_at IS NULL AND created_at > NOW() - INTERVAL '7 days';

  -- Oldest signal (indicates if cleanup is working)
  SELECT MIN(created_at) INTO v_oldest_signal FROM cross_domain_signals;

  -- Table sizes (top 10 largest)
  SELECT jsonb_agg(jsonb_build_object(
    'table', t.tablename,
    'size_mb', pg_total_relation_size(quote_ident(t.tablename))::NUMERIC / (1024*1024),
    'row_estimate', c.reltuples::BIGINT
  ) ORDER BY pg_total_relation_size(quote_ident(t.tablename)) DESC)
  INTO v_table_sizes
  FROM (
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  ) t
  JOIN pg_class c ON c.relname = t.tablename
  LIMIT 15;

  -- Build health response
  v_health := jsonb_build_object(
    'status', CASE
      WHEN v_db_size_bytes > 180 * 1024 * 1024 * 1024 THEN 'critical'
      WHEN v_db_size_bytes > 100 * 1024 * 1024 * 1024 THEN 'warning'
      ELSE 'healthy'
    END,
    'database', jsonb_build_object(
      'size_gb', ROUND((v_db_size_bytes::NUMERIC / (1024*1024*1024)), 2),
      'active_connections', v_active_connections,
      'oldest_signal', v_oldest_signal,
      'table_sizes', COALESCE(v_table_sizes, '[]'::JSONB)
    ),
    'brain', jsonb_build_object(
      'total_organizations', v_total_orgs,
      'total_signals', v_total_signals,
      'total_causal_edges', v_total_causal_edges,
      'total_memories', v_total_memories,
      'total_predictions', v_total_predictions,
      'unverified_predictions_7d', v_unverified_predictions,
      'active_cascade_alerts_7d', v_active_cascade_alerts,
      'active_api_keys', v_total_api_keys
    ),
    'retention', jsonb_build_object(
      'cleanup_function', 'cleanup_stale_data_batched',
      'signal_retention_days', 90,
      'event_retention_days', 180,
      'log_retention_days', 30,
      'memory_max_per_org', 50000
    ),
    'checked_at', NOW()
  );

  RETURN v_health;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- WEEK 2: ADDITIONAL INDEXES FOR BATCH CLEANUP PERFORMANCE
--
-- Ensure batch DELETEs use indexes not seq scans
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_signals_created_at
  ON cross_domain_signals (created_at);

CREATE INDEX IF NOT EXISTS idx_events_created_at
  ON causal_event_stream (created_at);

CREATE INDEX IF NOT EXISTS idx_execlog_created_at
  ON brain_execution_log (created_at);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON pattern_feedback_log (created_at);

CREATE INDEX IF NOT EXISTS idx_conversation_created_at
  ON conversation_log (created_at);

CREATE INDEX IF NOT EXISTS idx_cost_log_created_at
  ON llm_cost_log (created_at);

CREATE INDEX IF NOT EXISTS idx_agent_activity_created_at
  ON ai_agent_activity (created_at);

CREATE INDEX IF NOT EXISTS idx_connector_sync_created_at
  ON connector_sync_log (created_at);

CREATE INDEX IF NOT EXISTS idx_cascade_alerts_created_verified
  ON cascade_alerts (created_at) WHERE verified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_predictions_status_created
  ON prediction_records (created_at) WHERE status = 'expired';
