-- ============================================================================
-- Fix: Remaining unscoped WITH CHECK (true) RLS policies
-- ============================================================================
-- Audit date: 2026-02-27
--
-- FULL AUDIT RESULTS (all WITH CHECK (true) occurrences across all migrations):
--
-- ── SAFE — already scoped to TO service_role ────────────────────────────────
-- 20260220000010  brain_agent_tasks, brain_agent_steps, custom_training_packs
--                 → TO service_role explicit
-- 20260328000002  se_aas_metrics_service_insert
--                 → TO service_role explicit
-- 20260330000011  engineers, teams, repositories, pull_requests, pr_reviews,
--                 tickets, velocity_snapshots, bottleneck_snapshots (early-warning)
--                 → TO service_role explicit
-- 20260330000060  invitation_service_update, bayesian_posteriors,
--                 embedding_transforms, causal_model_state, attention_policy_state,
--                 learning_runs
--                 → TO service_role explicit
-- 20260329000005  writeback_rbac → TO service_role explicit
-- 20260220000001  entity_graph_nodes, entity_graph_edges, domain_taxonomy_state
--                 → TO service_role explicit (EXECUTE block)
-- 20250222000002  embedding_cache_state, temporal_memory_state,
--                 calibration_metrics → TO service_role explicit (EXECUTE block)
-- 20260324000002  _encryption_config → TO service_role explicit
-- 20250214000002  audit_log_insert_service → TO service_role explicit
-- 20260221000001  entity_links → TO service_role explicit
-- 20260215000005  connector_signals_insert_service_role — FIXED by
--                 20260226190520 (now org-scoped)
-- 20260323000002  workflow tables → TO service_role explicit
-- 20250226000005  system_credentials insert/update → TO service_role explicit
-- 20260329000004  Fixes brain_daily_snapshots, agent_run_history,
--                 strategic_priorities, impact_scores, proactive_insights,
--                 attention_decisions, service_templates,
--                 workspace_service_activations, ai_worker_config
--                 → All re-created TO service_role
-- 20260328000001  Fixes brain_daily_snapshots, agent_run_history,
--                 consolidation_runs, causal_graph_snapshots,
--                 strategic_priorities, impact_scores, proactive_insights,
--                 attention_decisions, fast_path_cache,
--                 engagements, engineer_health_snapshots,
--                 engagement_health_scores, scope_creep_alerts,
--                 pod_match_history, engineers, teams, repositories,
--                 pull_requests, pr_reviews, tickets,
--                 velocity_snapshots, bottleneck_snapshots,
--                 ai_worker_config, brain_case_log,
--                 service_templates, workspace_service_activations,
--                 writeback_queue, document_chunks
--                 → All re-created TO service_role
-- 20260327000010  ai_workspace → Fixed (USING/WITH CHECK auth.role()='service_role')
-- 20250219000001  invitation_service_update — FIXED by 20260330000060
-- 20260330000001  All tables → TO service_role explicit
-- 20260329000021  Early-warning tables → TO service_role explicit
--
-- ── SAFE — already uses TO service_role in the CREATE ────────────────────────
-- 20250212000003  bayesian_posteriors, embedding_transforms, causal_model_state,
--                 attention_policy_state, learning_runs
--                 — Comment says "service role can do everything" but policy
--                   names are service_role_*, FIXED by 20260330000060
-- 20250212000001  consolidation_runs, causal_graph_snapshots
--                 — FIXED by 20260328000001
-- 20250212000002  strategic_priorities, impact_scores, proactive_insights,
--                 attention_decisions
--                 — FIXED by 20260328000001 and 20260329000004
-- 20250213000001  fast_path_cache — FIXED by 20260328000001
-- 20250214000001  brain_daily_snapshots — FIXED by 20260328000001 and 20260329000004
-- 20260221000004  velocity_snapshots, bottleneck_snapshots — FIXED by 20260328000001
-- 20260216000003  agent_run_history — FIXED by 20260329000004 and 20260328000001
-- 20260226235900  ai_worker_config — FIXED by 20260329000004 and 20260328000001
-- 20260226230000  brain_case_log — FIXED by 20260328000001
-- 20260327000003  writeback_queue — FIXED by 20260328000001
-- 20260327000005  document_chunks — FIXED by 20260328000001
-- 20260327000006  service_templates, workspace_service_activations
--                 — FIXED by 20260329000004 and 20260328000001
-- 20260218000005  engagements, engineer_health_snapshots,
--                 engagement_health_scores, scope_creep_alerts,
--                 pod_match_history — FIXED by 20260328000001
-- 20260217000002  engineers, teams, repositories, pull_requests, pr_reviews,
--                 tickets, velocity_snapshots, bottleneck_snapshots
--                 — FIXED by 20260328000001
--
-- ── SAFE — org_members INSERT policies from platform_admin_seed ─────────────
-- 20250218000002  member_insert_by_trigger ON org_members
--                 — DROPPED by 20250219000001, 20260315000003, 20260315000005
--
-- ══════════════════════════════════════════════════════════════════════════════
-- VULNERABLE — Active unscoped WITH CHECK (true) requiring a fix:
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 1. "org_insert_by_trigger" ON organizations (20250218000002)
--    Operation: FOR INSERT, Role: all authenticated (no TO clause)
--    Risk: Any authenticated user can INSERT a new organization row with any
--    name/slug. Allows org name squatting and unauthorized org creation.
--    No subsequent migration drops or replaces this policy.
--
-- 2. "events_insert" ON platform_events (20250218000002)
--    Operation: FOR INSERT, Role: all authenticated (no TO clause)
--    Risk: Any authenticated user can INSERT platform_events rows with any
--    organization_id — cross-tenant event injection (fake events into
--    other orgs' audit streams).
--    No subsequent migration drops or replaces this policy.
--
-- ============================================================================
-- Fix: scope both vulnerable policies
-- ============================================================================
-- The trigger function handle_new_platform_user() runs as SECURITY DEFINER
-- and uses the service_role context, so it bypasses RLS entirely. These
-- INSERT policies were never needed for the trigger — removing or scoping
-- them does NOT break org creation on signup.
-- ============================================================================

-- ── Fix 1: organizations INSERT ─────────────────────────────────────────────
-- Drop the overly permissive policy that allows any authenticated user
-- to create organizations. Org creation is handled exclusively by the
-- handle_new_platform_user() SECURITY DEFINER trigger (which bypasses RLS)
-- and by the service_role client in API routes.
DROP POLICY IF EXISTS "org_insert_by_trigger" ON organizations;

CREATE POLICY "org_insert_service_role_only"
  ON organizations
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ── Fix 2: platform_events INSERT ───────────────────────────────────────────
-- Drop the overly permissive policy that allows any authenticated user
-- to inject events into any org's event stream.
-- Authenticated users may insert events only for their own org (kept below).
-- Service role retains full access for backend workers.
DROP POLICY IF EXISTS "events_insert" ON platform_events;

CREATE POLICY "events_insert_service_role"
  ON platform_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Org-scoped INSERT for authenticated users (e.g. UI-triggered events):
-- Users can only fire events for orgs they belong to.
CREATE POLICY "events_insert_own_org"
  ON platform_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
    OR organization_id IS NULL  -- system-level events (no org)
  );
