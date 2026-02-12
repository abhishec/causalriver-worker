-- ============================================================================
-- Data Retention: Indexes + Cleanup Function
--
-- Prevents unbounded table growth in production.
-- Adds created_at indexes for efficient cleanup queries and a reusable
-- cleanup_stale_data() function callable from pg_cron or application code.
-- ============================================================================

-- Indexes to speed up retention cleanup queries
CREATE INDEX IF NOT EXISTS idx_cross_domain_signals_created_at
  ON cross_domain_signals (created_at);

CREATE INDEX IF NOT EXISTS idx_causal_event_stream_created_at
  ON causal_event_stream (created_at);

-- Conditional indexes (tables may not exist in all deployments)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prediction_records') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_prediction_records_created_at ON prediction_records (created_at)';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'weight_update_history') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_weight_update_history_created_at ON weight_update_history (created_at)';
  END IF;
END $$;

-- Composite index for ai_memory retention (low-importance + old)
CREATE INDEX IF NOT EXISTS idx_ai_memory_created_importance
  ON ai_memory (created_at, importance);

-- Index for consolidation race lock queries
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consolidation_runs') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_consolidation_runs_org_status ON consolidation_runs (organization_id, status) WHERE status = ''running''';
  END IF;
END $$;
