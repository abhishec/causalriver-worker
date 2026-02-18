/**
 * RLS: Organization-Scoped Read Policies
 * =======================================
 *
 * PROBLEM: Core tables (cross_domain_signals, causal_relationships_statistical,
 * prediction_records, etc.) only have `service_role_all` RLS policies.
 * This means authenticated users via the browser (using createClient())
 * cannot read any data — only service-role calls work.
 *
 * FIX: Add org-scoped SELECT policies for authenticated users so the
 * /api/brain/health?learning=true, /api/brain/cycle, and /api/brain/evolution
 * endpoints work with both session-based and service-role auth.
 *
 * Pattern: Users can read data for organizations they belong to.
 * Platform admins can read data for all organizations.
 * Write operations remain service-role only (connectors write via service client).
 *
 * Idempotent: Uses DO blocks with IF NOT EXISTS to prevent duplicate policy errors.
 */

-- ============================================================================
-- Helper: Org membership subquery (used in all policies below)
-- Users can read data for orgs they belong to
-- ============================================================================

-- 1. cross_domain_signals — The brain's primary signal store
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'signals_read_org' AND tablename = 'cross_domain_signals') THEN
    EXECUTE 'CREATE POLICY signals_read_org ON cross_domain_signals FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'signals_admin_read_all' AND tablename = 'cross_domain_signals') THEN
    EXECUTE 'CREATE POLICY signals_admin_read_all ON cross_domain_signals FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true
    ))';
  END IF;
END $$;


-- 2. causal_relationships_statistical — The brain's causal graph
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'causal_read_org' AND tablename = 'causal_relationships_statistical') THEN
    EXECUTE 'CREATE POLICY causal_read_org ON causal_relationships_statistical FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'causal_admin_read_all' AND tablename = 'causal_relationships_statistical') THEN
    EXECUTE 'CREATE POLICY causal_admin_read_all ON causal_relationships_statistical FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true
    ))';
  END IF;
END $$;


-- 3. prediction_records — Brain predictions and verification outcomes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'predictions_read_org' AND tablename = 'prediction_records') THEN
    EXECUTE 'CREATE POLICY predictions_read_org ON prediction_records FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'predictions_admin_read_all' AND tablename = 'prediction_records') THEN
    EXECUTE 'CREATE POLICY predictions_admin_read_all ON prediction_records FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true
    ))';
  END IF;
END $$;


-- 4. ai_memory — Brain memories (business rules, learned patterns)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'memory_read_org' AND tablename = 'ai_memory') THEN
    EXECUTE 'CREATE POLICY memory_read_org ON ai_memory FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'memory_admin_read_all' AND tablename = 'ai_memory') THEN
    EXECUTE 'CREATE POLICY memory_admin_read_all ON ai_memory FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true
    ))';
  END IF;
END $$;


-- 5. connector_signals — Raw connector data (90-day retention)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connector_signals_read_org' AND tablename = 'connector_signals') THEN
    EXECUTE 'CREATE POLICY connector_signals_read_org ON connector_signals FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;


-- 6. weight_update_history — Causal edge weight changes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'weight_history_read_org' AND tablename = 'weight_update_history') THEN
    EXECUTE 'CREATE POLICY weight_history_read_org ON weight_update_history FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;


-- 7. threshold_optimization_history — Signal threshold tuning history
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'threshold_history_read_org' AND tablename = 'threshold_optimization_history') THEN
    EXECUTE 'CREATE POLICY threshold_history_read_org ON threshold_optimization_history FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;


-- 8. causal_event_stream — Real-time causal event processing queue
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'events_read_org' AND tablename = 'causal_event_stream') THEN
    EXECUTE 'CREATE POLICY events_read_org ON causal_event_stream FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;


-- 9. brain_health_history — Brain evolution snapshots
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brain_health_read_org' AND tablename = 'brain_health_history') THEN
    EXECUTE 'CREATE POLICY brain_health_read_org ON brain_health_history FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brain_health_admin_read_all' AND tablename = 'brain_health_history') THEN
    EXECUTE 'CREATE POLICY brain_health_admin_read_all ON brain_health_history FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND is_platform_admin = true
    ))';
  END IF;
END $$;


-- 10. custom_training_packs — User-created training data
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'training_packs_read_org' AND tablename = 'custom_training_packs') THEN
    EXECUTE 'CREATE POLICY training_packs_read_org ON custom_training_packs FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;

-- Also allow org members to INSERT training packs (they create them via the UI)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'training_packs_insert_org' AND tablename = 'custom_training_packs') THEN
    EXECUTE 'CREATE POLICY training_packs_insert_org ON custom_training_packs FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;


-- 11. org_connectors — Connector configuration (read-only for non-admin members)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connectors_read_org' AND tablename = 'org_connectors') THEN
    EXECUTE 'CREATE POLICY connectors_read_org ON org_connectors FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    ))';
  END IF;
END $$;


-- ============================================================================
-- PERFORMANCE: Add index on org_members for fast RLS policy evaluation
-- This is critical at scale — without this index, every RLS check does a seq scan
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_org_members_user_org_admin') THEN
    CREATE INDEX IF NOT EXISTS idx_org_members_user_org_admin
      ON org_members (user_id, organization_id, is_platform_admin);
  END IF;
END $$;


-- ============================================================================
-- COMMENT: Document the RLS strategy
-- ============================================================================
COMMENT ON POLICY signals_read_org ON cross_domain_signals IS
  'Organization members can read signals for their org. Part of WEEK 1 Day 2 security hardening.';

COMMENT ON POLICY causal_read_org ON causal_relationships_statistical IS
  'Organization members can read causal edges for their org. Enables /api/brain/health?learning=true.';
