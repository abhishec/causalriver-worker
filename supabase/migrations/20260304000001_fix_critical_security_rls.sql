-- Fix: Critical RLS Security Vulnerabilities
-- ============================================
-- Audit date: 2026-03-04
--
-- Issues fixed:
-- 1. `public.teams` — RLS not enabled (cross-org read vulnerability)
-- 2. `public.engineers` — RLS not enabled (cross-org read vulnerability)
-- 3. Service table unscoped FOR ALL policies on:
--    engagements, engineer_health_snapshots, engagement_health_scores,
--    scope_creep_alerts, pod_match_history
--    → All had FOR ALL USING (true) WITH CHECK (true) with no TO service_role
--    → Any authenticated user could INSERT/UPDATE into any org's rows
-- ============================================================================

-- ── 1. Enable RLS on teams (was missing entirely) ────────────────────────────

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select_org"
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "teams_service_all"
  ON public.teams
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 2. Enable RLS on engineers (was missing entirely) ────────────────────────

ALTER TABLE public.engineers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engineers_select_org"
  ON public.engineers
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "engineers_service_all"
  ON public.engineers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 3. Scope service table bypass policies to service_role ───────────────────
-- These tables have "for all using (true)" which allows any authenticated user
-- to write to any org. Replace with service_role-only bypass + scoped user policies.

-- engagements
DROP POLICY IF EXISTS "engagements_service" ON public.engagements;
CREATE POLICY "engagements_service_role"
  ON public.engagements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- engineer_health_snapshots
DROP POLICY IF EXISTS "engineer_health_snapshots_service" ON public.engineer_health_snapshots;
CREATE POLICY "engineer_health_snapshots_service_role"
  ON public.engineer_health_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- engagement_health_scores
DROP POLICY IF EXISTS "engagement_health_scores_service" ON public.engagement_health_scores;
CREATE POLICY "engagement_health_scores_service_role"
  ON public.engagement_health_scores FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- scope_creep_alerts
DROP POLICY IF EXISTS "scope_creep_alerts_service" ON public.scope_creep_alerts;
CREATE POLICY "scope_creep_alerts_service_role"
  ON public.scope_creep_alerts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- pod_match_history
DROP POLICY IF EXISTS "pod_match_history_service" ON public.pod_match_history;
CREATE POLICY "pod_match_history_service_role"
  ON public.pod_match_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);
