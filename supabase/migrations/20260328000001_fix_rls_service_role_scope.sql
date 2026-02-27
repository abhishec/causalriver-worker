-- =============================================================================
-- Fix: RLS policies missing TO service_role scope
-- =============================================================================
-- Multiple tables had policies named "service role full access" or similar
-- but were missing the `TO service_role` clause, meaning the permissive
-- WITH CHECK (true) applied to ALL authenticated roles — allowing any
-- authenticated user to write data into any organization's rows.
--
-- This migration drops and recreates each vulnerable policy scoped to
-- service_role only. Authenticated user SELECT policies are left untouched.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- brain_daily_snapshots
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service_role_brain_snapshots" ON brain_daily_snapshots;
CREATE POLICY "service_role_brain_snapshots" ON brain_daily_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- agent_run_history
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS agent_run_history_service_all ON public.agent_run_history;
CREATE POLICY agent_run_history_service_all ON public.agent_run_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- consolidation_runs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access to consolidation_runs" ON consolidation_runs;
CREATE POLICY "Allow service role full access to consolidation_runs" ON consolidation_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- causal_graph_snapshots
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access to causal_graph_snapshots" ON causal_graph_snapshots;
CREATE POLICY "Allow service role full access to causal_graph_snapshots" ON causal_graph_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- strategic_priorities
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access to strategic_priorities" ON strategic_priorities;
CREATE POLICY "Allow service role full access to strategic_priorities" ON strategic_priorities
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- impact_scores
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access to impact_scores" ON impact_scores;
CREATE POLICY "Allow service role full access to impact_scores" ON impact_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- proactive_insights
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access to proactive_insights" ON proactive_insights;
CREATE POLICY "Allow service role full access to proactive_insights" ON proactive_insights
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- attention_decisions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access to attention_decisions" ON attention_decisions;
CREATE POLICY "Allow service role full access to attention_decisions" ON attention_decisions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- fast_path_cache
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow service role full access to fast_path_cache" ON fast_path_cache;
CREATE POLICY "Allow service role full access to fast_path_cache" ON fast_path_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- SE-aaS delivery intelligence tables (20260218000005_seas_delivery_intelligence)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "engagements_service" ON public.engagements;
CREATE POLICY "engagements_service" ON public.engagements
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "engineer_health_snapshots_service" ON public.engineer_health_snapshots;
CREATE POLICY "engineer_health_snapshots_service" ON public.engineer_health_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "engagement_health_scores_service" ON public.engagement_health_scores;
CREATE POLICY "engagement_health_scores_service" ON public.engagement_health_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "scope_creep_alerts_service" ON public.scope_creep_alerts;
CREATE POLICY "scope_creep_alerts_service" ON public.scope_creep_alerts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pod_match_history_service" ON public.pod_match_history;
CREATE POLICY "pod_match_history_service" ON public.pod_match_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- P0 early warning tables (20260217000002_p0_early_warning_schema)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "engineers_service" ON public.engineers;
CREATE POLICY "engineers_service" ON public.engineers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "teams_service" ON public.teams;
CREATE POLICY "teams_service" ON public.teams
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DO $$ BEGIN
  DROP POLICY IF EXISTS "repositories_service" ON public.repositories;
  CREATE POLICY "repositories_service" ON public.repositories
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "pull_requests_service" ON public.pull_requests;
  CREATE POLICY "pull_requests_service" ON public.pull_requests
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "pr_reviews_service" ON public.pr_reviews;
  CREATE POLICY "pr_reviews_service" ON public.pr_reviews
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tickets_service" ON public.tickets;
  CREATE POLICY "tickets_service" ON public.tickets
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- velocity_snapshots and bottleneck_snapshots were re-created in
-- 20260221000004_repair_p0_snapshot_tables without service_role scope
DROP POLICY IF EXISTS "velocity_snapshots_service" ON public.velocity_snapshots;
CREATE POLICY "velocity_snapshots_service" ON public.velocity_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bottleneck_snapshots_service" ON public.bottleneck_snapshots;
CREATE POLICY "bottleneck_snapshots_service" ON public.bottleneck_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- ai_worker_config
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service role full access" ON ai_worker_config;
CREATE POLICY "service role full access" ON ai_worker_config
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- brain_case_log
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "service role full access" ON brain_case_log;
CREATE POLICY "service role full access" ON brain_case_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- service_templates (20260327000006 — name includes "Service role manages...")
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role manages service templates" ON service_templates;
CREATE POLICY "Service role manages service templates" ON service_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- workspace_service_activations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role manages workspace service activations" ON workspace_service_activations;
CREATE POLICY "Service role manages workspace service activations" ON workspace_service_activations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- writeback_queue (20260327000003)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role manages writeback queue" ON writeback_queue;
CREATE POLICY "Service role manages writeback queue" ON writeback_queue
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- document_chunks (20260327000005)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role manages document chunks" ON document_chunks;
CREATE POLICY "Service role manages document chunks" ON document_chunks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
