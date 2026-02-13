-- ============================================================================
-- FIX: Integer overflow in check_system_health()
--
-- The comparison `180 * 1024 * 1024 * 1024` overflows PostgreSQL INTEGER.
-- Fix: Cast first value to BIGINT with `180::BIGINT`.
-- ============================================================================

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

  -- Table sizes (top 15 largest)
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

  -- Build health response (use BIGINT casts to avoid integer overflow)
  v_health := jsonb_build_object(
    'status', CASE
      WHEN v_db_size_bytes > 180::BIGINT * 1024 * 1024 * 1024 THEN 'critical'
      WHEN v_db_size_bytes > 100::BIGINT * 1024 * 1024 * 1024 THEN 'warning'
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
