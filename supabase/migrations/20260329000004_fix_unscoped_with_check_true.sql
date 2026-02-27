-- Fix unscoped WITH CHECK (true) policies that allow any authenticated user
-- to write to any org's rows. Scope them to service_role only.
--
-- Affected tables found during DB integrity audit (2026-02-27):
--   - brain_daily_snapshots: service role writes snapshots, authenticated read
--   - agent_run_history:     service role writes history, authenticated read only
--   - strategic_priorities:  service role writes, authenticated read own org
--   - impact_scores:         service role writes, authenticated read own org
--   - proactive_insights:    service role writes, authenticated read own org
--   - attention_decisions:   service role writes, authenticated read own org
--
-- Root cause: Original migrations used FOR ALL USING (true) WITH CHECK (true)
-- without TO service_role, allowing ANY authenticated user to insert/update
-- into ANY organization's rows (cross-tenant write exposure).

-- ─── brain_daily_snapshots ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_brain_snapshots" ON brain_daily_snapshots;
CREATE POLICY "service_role_brain_snapshots" ON brain_daily_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── agent_run_history ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "agent_run_history_service_all" ON public.agent_run_history;
CREATE POLICY "agent_run_history_service_all"
  ON public.agent_run_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── strategic_priorities ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow service role full access to strategic_priorities" ON strategic_priorities;
CREATE POLICY "Allow service role full access to strategic_priorities"
  ON strategic_priorities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── impact_scores ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow service role full access to impact_scores" ON impact_scores;
CREATE POLICY "Allow service role full access to impact_scores"
  ON impact_scores
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── proactive_insights ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow service role full access to proactive_insights" ON proactive_insights;
CREATE POLICY "Allow service role full access to proactive_insights"
  ON proactive_insights
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── attention_decisions ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow service role full access to attention_decisions" ON attention_decisions;
CREATE POLICY "Allow service role full access to attention_decisions"
  ON attention_decisions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── service_templates ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages service templates" ON service_templates;
CREATE POLICY "Service role manages service templates"
  ON service_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── workspace_service_activations ───────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages workspace service activations" ON workspace_service_activations;
CREATE POLICY "Service role manages workspace service activations"
  ON workspace_service_activations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── ai_worker_config ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service role full access" ON ai_worker_config;
CREATE POLICY "service role full access"
  ON ai_worker_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
