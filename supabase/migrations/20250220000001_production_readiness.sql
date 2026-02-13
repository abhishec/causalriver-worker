-- ============================================================================
-- PRODUCTION READINESS MIGRATION
--
-- This is the critical migration that makes NexusBrain multi-tenant safe.
--
-- 1. Org-scoped RLS policies on ALL 21 brain data tables
-- 2. Data retention cleanup function (callable via pg_cron)
-- 3. Performance indexes for RLS subqueries
-- 4. API key table for external agent authentication
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: ORG-SCOPED RLS POLICIES ON ALL BRAIN DATA TABLES
--
-- Pattern: Users can READ data from orgs they belong to.
--          Service role can do everything (for backend operations).
--          Platform admins can read all orgs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: Performance index for RLS subqueries ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_org_members_user_org
  ON org_members (user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_org_members_user_admin
  ON org_members (user_id) WHERE is_platform_admin = true;

-- ── 1. cross_domain_signals ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'signals_read_org_members' AND tablename = 'cross_domain_signals') THEN
    EXECUTE 'CREATE POLICY signals_read_org_members ON cross_domain_signals
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'signals_admin_read_all' AND tablename = 'cross_domain_signals') THEN
    EXECUTE 'CREATE POLICY signals_admin_read_all ON cross_domain_signals
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
      )';
  END IF;
END $$;

-- ── 2. ai_memory ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'memory_read_org_members' AND tablename = 'ai_memory') THEN
    EXECUTE 'CREATE POLICY memory_read_org_members ON ai_memory
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'memory_admin_read_all' AND tablename = 'ai_memory') THEN
    EXECUTE 'CREATE POLICY memory_admin_read_all ON ai_memory
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
      )';
  END IF;
END $$;

-- ── 3. causal_relationships_statistical ──────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'causal_read_org_members' AND tablename = 'causal_relationships_statistical') THEN
    EXECUTE 'CREATE POLICY causal_read_org_members ON causal_relationships_statistical
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'causal_admin_read_all' AND tablename = 'causal_relationships_statistical') THEN
    EXECUTE 'CREATE POLICY causal_admin_read_all ON causal_relationships_statistical
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
      )';
  END IF;
END $$;

-- ── 4. entity_embeddings ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'embeddings_read_org_members' AND tablename = 'entity_embeddings') THEN
    EXECUTE 'CREATE POLICY embeddings_read_org_members ON entity_embeddings
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'embeddings_admin_read_all' AND tablename = 'entity_embeddings') THEN
    EXECUTE 'CREATE POLICY embeddings_admin_read_all ON entity_embeddings
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
      )';
  END IF;
END $$;

-- ── 5. causal_event_stream ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'events_read_org_members' AND tablename = 'causal_event_stream') THEN
    EXECUTE 'CREATE POLICY events_read_org_members ON causal_event_stream
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 6. brain_grammar_rules ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rules_read_org_members' AND tablename = 'brain_grammar_rules') THEN
    EXECUTE 'CREATE POLICY rules_read_org_members ON brain_grammar_rules
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 7. prediction_records ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'predictions_read_org_members' AND tablename = 'prediction_records') THEN
    EXECUTE 'CREATE POLICY predictions_read_org_members ON prediction_records
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 8. ai_causal_chains ─────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chains_read_org_members' AND tablename = 'ai_causal_chains') THEN
    EXECUTE 'CREATE POLICY chains_read_org_members ON ai_causal_chains
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 9. brain_execution_log ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'execlog_read_org_members' AND tablename = 'brain_execution_log') THEN
    EXECUTE 'CREATE POLICY execlog_read_org_members ON brain_execution_log
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 10. pattern_feedback_log ─────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'feedback_read_org_members' AND tablename = 'pattern_feedback_log') THEN
    EXECUTE 'CREATE POLICY feedback_read_org_members ON pattern_feedback_log
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 11. org_cascade_rules ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cascade_rules_read_org' AND tablename = 'org_cascade_rules') THEN
    EXECUTE 'CREATE POLICY cascade_rules_read_org ON org_cascade_rules
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 12. cascade_alerts ───────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'alerts_read_org_members' AND tablename = 'cascade_alerts') THEN
    EXECUTE 'CREATE POLICY alerts_read_org_members ON cascade_alerts
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 13. agent_registry ───────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agents_read_org_members' AND tablename = 'agent_registry') THEN
    EXECUTE 'CREATE POLICY agents_read_org_members ON agent_registry
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 14. agent_queue ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'queue_read_org_members' AND tablename = 'agent_queue') THEN
    EXECUTE 'CREATE POLICY queue_read_org_members ON agent_queue
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 15. ai_agent_activity ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'activity_read_org_members' AND tablename = 'ai_agent_activity') THEN
    EXECUTE 'CREATE POLICY activity_read_org_members ON ai_agent_activity
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 16. connector_sync_log ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'synclog_read_org_members' AND tablename = 'connector_sync_log') THEN
    EXECUTE 'CREATE POLICY synclog_read_org_members ON connector_sync_log
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 17. signal_thresholds ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'thresholds_read_org_members' AND tablename = 'signal_thresholds') THEN
    EXECUTE 'CREATE POLICY thresholds_read_org_members ON signal_thresholds
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 18. resolved_entities ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'entities_read_org_members' AND tablename = 'resolved_entities') THEN
    EXECUTE 'CREATE POLICY entities_read_org_members ON resolved_entities
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 19. scheduled_verifications ──────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'verifications_read_org' AND tablename = 'scheduled_verifications') THEN
    EXECUTE 'CREATE POLICY verifications_read_org ON scheduled_verifications
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 20. prediction_outcomes ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'outcomes_read_org_members' AND tablename = 'prediction_outcomes') THEN
    EXECUTE 'CREATE POLICY outcomes_read_org_members ON prediction_outcomes
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── 21. contributor_expertise ────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expertise_read_org_members' AND tablename = 'contributor_expertise') THEN
    EXECUTE 'CREATE POLICY expertise_read_org_members ON contributor_expertise
      FOR SELECT USING (
        organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
      )';
  END IF;
END $$;

-- ── Conditional tables (may not exist in all deployments) ────────────────

-- brain_daily_snapshots (already has authenticated_read but only for core brain)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'brain_daily_snapshots') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'snapshots_read_org_members' AND tablename = 'brain_daily_snapshots') THEN
      EXECUTE 'CREATE POLICY snapshots_read_org_members ON brain_daily_snapshots
        FOR SELECT USING (
          organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
        )';
    END IF;
  END IF;
END $$;

-- consolidation_runs
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consolidation_runs') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'consolidation_read_org' AND tablename = 'consolidation_runs') THEN
      EXECUTE 'CREATE POLICY consolidation_read_org ON consolidation_runs
        FOR SELECT USING (
          organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
        )';
    END IF;
  END IF;
END $$;

-- strategic_priorities
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'strategic_priorities') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'priorities_read_org' AND tablename = 'strategic_priorities') THEN
      EXECUTE 'CREATE POLICY priorities_read_org ON strategic_priorities
        FOR SELECT USING (
          organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
        )';
    END IF;
  END IF;
END $$;

-- impact_scores
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'impact_scores') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'impact_read_org' AND tablename = 'impact_scores') THEN
      EXECUTE 'CREATE POLICY impact_read_org ON impact_scores
        FOR SELECT USING (
          organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
        )';
    END IF;
  END IF;
END $$;

-- proactive_insights
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proactive_insights') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'insights_read_org' AND tablename = 'proactive_insights') THEN
      EXECUTE 'CREATE POLICY insights_read_org ON proactive_insights
        FOR SELECT USING (
          organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
        )';
    END IF;
  END IF;
END $$;

-- attention_decisions
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attention_decisions') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'attention_read_org' AND tablename = 'attention_decisions') THEN
      EXECUTE 'CREATE POLICY attention_read_org ON attention_decisions
        FOR SELECT USING (
          organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
        )';
    END IF;
  END IF;
END $$;

-- fast_path_cache
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fast_path_cache') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cache_read_org' AND tablename = 'fast_path_cache') THEN
      EXECUTE 'CREATE POLICY cache_read_org ON fast_path_cache
        FOR SELECT USING (
          organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
        )';
    END IF;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: DATA RETENTION CLEANUP FUNCTION
--
-- Prevents unbounded table growth. Call from pg_cron or application code.
-- Default: 90 days for signals, 180 days for event stream, 30 days for logs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_stale_data(
  signal_retention_days INTEGER DEFAULT 90,
  event_retention_days INTEGER DEFAULT 180,
  log_retention_days INTEGER DEFAULT 30,
  memory_max_rows_per_org INTEGER DEFAULT 50000
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
BEGIN
  -- 1. Clean old signals (keep recent for causal discovery)
  DELETE FROM cross_domain_signals
    WHERE created_at < NOW() - (signal_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_signals_deleted = ROW_COUNT;

  -- 2. Clean old causal event stream
  DELETE FROM causal_event_stream
    WHERE created_at < NOW() - (event_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

  -- 3. Clean old execution logs
  DELETE FROM brain_execution_log
    WHERE created_at < NOW() - (log_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_logs_deleted = ROW_COUNT;

  -- 4. Clean old prediction records (keep verified ones longer)
  DELETE FROM prediction_records
    WHERE created_at < NOW() - (event_retention_days || ' days')::INTERVAL
      AND status = 'expired';
  GET DIAGNOSTICS v_predictions_deleted = ROW_COUNT;

  -- 5. Archive low-importance memories beyond threshold
  -- (Keep high-importance memories forever, prune low-importance ones)
  WITH ranked AS (
    SELECT id, organization_id,
      ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY importance DESC, created_at DESC) as rn
    FROM ai_memory
  )
  DELETE FROM ai_memory
    WHERE id IN (SELECT id FROM ranked WHERE rn > memory_max_rows_per_org)
      AND importance < 0.3;
  GET DIAGNOSTICS v_memory_archived = ROW_COUNT;

  -- 6. Clear expired fast-path cache
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fast_path_cache') THEN
    DELETE FROM fast_path_cache
      WHERE expires_at IS NOT NULL AND expires_at < NOW();
    GET DIAGNOSTICS v_cache_deleted = ROW_COUNT;
  END IF;

  -- 7. Clean old conversation logs
  DELETE FROM conversation_log
    WHERE created_at < NOW() - (event_retention_days || ' days')::INTERVAL;

  -- 8. Clean old LLM cost logs (keep 1 year for billing)
  DELETE FROM llm_cost_log
    WHERE created_at < NOW() - INTERVAL '365 days';

  RETURN jsonb_build_object(
    'signals_deleted', v_signals_deleted,
    'events_deleted', v_events_deleted,
    'logs_deleted', v_logs_deleted,
    'predictions_deleted', v_predictions_deleted,
    'memory_archived', v_memory_archived,
    'cache_deleted', v_cache_deleted,
    'executed_at', NOW()
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: API KEYS TABLE FOR EXTERNAL AGENT AUTHENTICATION
--
-- Allows external agents (OpenAI, Claude, custom) to authenticate via
-- API key instead of Supabase session cookies.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,                             -- "My Agent Key", "Slack Bot"
  key_hash TEXT NOT NULL,                         -- SHA-256 hash of the actual key
  key_prefix TEXT NOT NULL,                       -- First 8 chars for identification: "nxb_abc1..."
  permissions TEXT[] NOT NULL DEFAULT '{read}',   -- read, write, execute
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys (organization_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix) WHERE is_active = true;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Org owners/admins can manage their API keys
CREATE POLICY api_keys_read_org ON api_keys
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY api_keys_insert_org ON api_keys
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY api_keys_update_org ON api_keys
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY api_keys_delete_org ON api_keys
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Platform admins can manage all
CREATE POLICY api_keys_admin_all ON api_keys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true)
  );

-- Service role
CREATE POLICY api_keys_service ON api_keys
  FOR ALL USING (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: API KEY VALIDATION FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION validate_api_key(p_key_hash TEXT)
RETURNS TABLE(
  organization_id UUID,
  permissions TEXT[],
  rate_limit_per_minute INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT ak.organization_id, ak.permissions, ak.rate_limit_per_minute
    FROM api_keys ak
    WHERE ak.key_hash = p_key_hash
      AND ak.is_active = true
      AND (ak.expires_at IS NULL OR ak.expires_at > NOW());

  -- Update last_used_at (fire-and-forget)
  UPDATE api_keys SET last_used_at = NOW(), updated_at = NOW()
    WHERE key_hash = p_key_hash AND is_active = true;
END;
$$;
