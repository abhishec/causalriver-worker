-- ============================================================================
-- Migration: Fix RLS scope on all obs_* observability tables
-- ============================================================================
-- Problem: 20260215000010_brain_observability_framework.sql created policies
-- using `FOR ALL USING (true)` WITHOUT the `TO service_role` clause.
-- Without TO service_role, Supabase applies the policy to ALL authenticated
-- users — meaning any user can read/write observability data across ALL orgs.
--
-- Fix: Drop each unscoped policy and re-create with `TO service_role` so only
-- the backend service role can access these internal observability tables.
--
-- Pattern: `FOR ALL TO service_role USING (true) WITH CHECK (true)`
-- This is the same fix applied to early-warning tables in:
--   20260329000021_fix_early_warning_service_role_rls.sql
--   20260330000011_fix_early_warning_rls_scope.sql
-- ============================================================================

DO $$
DECLARE
  obs_tables TEXT[] := ARRAY[
    'obs_signal_ingestion',
    'obs_entity_resolution',
    'obs_semantic_operations',
    'obs_causal_calculations',
    'obs_pattern_learning',
    'obs_agent_executions',
    'obs_connector_operations',
    'obs_feedback_loops',
    'obs_consolidation_cycles',
    'obs_layer_health',
    'obs_deep_dreaming',
    'obs_hierarchical_memory',
    'obs_curiosity_engine',
    'obs_self_modifying_cognition',
    'obs_intelligence_mesh',
    'obs_causal_imagination',
    'obs_theory_of_mind',
    'obs_temporal_consciousness'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY obs_tables LOOP
    -- Guard: only act if table exists in this DB
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Drop the unscoped "service_role_all" policy created by 20260215000010
      EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON public.%I', tbl);

      -- Also drop any other unscoped variants that may have been added
      EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON public.%I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "%s_service" ON public.%I', tbl, tbl);

      -- Re-create properly scoped to service_role only
      EXECUTE format(
        'CREATE POLICY "service_role_all" ON public.%I
           FOR ALL TO service_role
           USING (true) WITH CHECK (true)',
        tbl
      );

      RAISE NOTICE 'Fixed RLS on %', tbl;
    ELSE
      RAISE NOTICE 'Skipping % — table does not exist in this DB', tbl;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- Verify fix: confirm early-warning + SEAS tables also properly scoped
-- (belt-and-suspenders — these were fixed in 20260329000021 and 20260330000011
--  but we re-apply idempotently to ensure consistency)
-- ============================================================================

DO $$
DECLARE
  ew_tables TEXT[] := ARRAY[
    'engineers',
    'teams',
    'repositories',
    'pull_requests',
    'pr_reviews',
    'tickets',
    'velocity_snapshots',
    'bottleneck_snapshots',
    'engagements',
    'engineer_health_snapshots',
    'engagement_health_scores',
    'scope_creep_alerts',
    'pod_match_history'
  ];
  tbl TEXT;
  policy_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY ew_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Drop unscoped variants (original names from 20260217 and 20260218)
      policy_name := tbl || '_service';
      EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.%I', policy_name, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON public.%I', tbl);

      -- Re-create scoped to service_role
      EXECUTE format(
        'CREATE POLICY "service_role_all" ON public.%I
           FOR ALL TO service_role
           USING (true) WITH CHECK (true)',
        tbl
      );

      RAISE NOTICE 'Confirmed service_role scope on %', tbl;
    ELSE
      RAISE NOTICE 'Skipping % — table does not exist', tbl;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- Comments for audit trail
-- ============================================================================
COMMENT ON TABLE obs_signal_ingestion IS 'Observability: signal ingestion metrics — service_role only (fixed 20260401000006)';
COMMENT ON TABLE obs_agent_executions IS 'Observability: agent execution traces — service_role only (fixed 20260401000006)';
COMMENT ON TABLE obs_pattern_learning IS 'Observability: pattern learning events — service_role only (fixed 20260401000006)';
