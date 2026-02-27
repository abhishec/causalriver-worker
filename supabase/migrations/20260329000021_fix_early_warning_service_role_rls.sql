-- Fix cross-tenant write exposure on 13 early-warning + delivery intelligence tables.
--
-- Root cause: Original migrations created service-write policies as:
--   FOR ALL USING (true) WITH CHECK (true)
-- without TO service_role, meaning ANY authenticated user could insert/update/delete
-- rows in ANY org's engineers, pull_requests, engagements, etc.
--
-- Fix: Drop each unscoped policy and recreate it scoped to service_role only.
-- The existing _select policies (already org-scoped) are untouched.
--
-- Tables fixed:
--   P0 early-warning  (20260217000002): engineers, teams, repositories, pull_requests,
--                                        pr_reviews, tickets, velocity_snapshots,
--                                        bottleneck_snapshots
--   Delivery intel    (20260218000005): engagements, engineer_health_snapshots,
--                                        engagement_health_scores, scope_creep_alerts,
--                                        pod_match_history

-- ─── engineers ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "engineers_service" ON public.engineers;
CREATE POLICY "engineers_service" ON public.engineers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── teams ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "teams_service" ON public.teams;
CREATE POLICY "teams_service" ON public.teams
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── repositories ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "repositories_service" ON public.repositories;
CREATE POLICY "repositories_service" ON public.repositories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── pull_requests ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pull_requests_service" ON public.pull_requests;
CREATE POLICY "pull_requests_service" ON public.pull_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── pr_reviews ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pr_reviews_service" ON public.pr_reviews;
CREATE POLICY "pr_reviews_service" ON public.pr_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── tickets ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tickets_service" ON public.tickets;
CREATE POLICY "tickets_service" ON public.tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── velocity_snapshots ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "velocity_snapshots_service" ON public.velocity_snapshots;
CREATE POLICY "velocity_snapshots_service" ON public.velocity_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── bottleneck_snapshots ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bottleneck_snapshots_service" ON public.bottleneck_snapshots;
CREATE POLICY "bottleneck_snapshots_service" ON public.bottleneck_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── engagements ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "engagements_service" ON public.engagements;
CREATE POLICY "engagements_service" ON public.engagements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── engineer_health_snapshots ────────────────────────────────────────────────
DROP POLICY IF EXISTS "engineer_health_snapshots_service" ON public.engineer_health_snapshots;
CREATE POLICY "engineer_health_snapshots_service" ON public.engineer_health_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── engagement_health_scores ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "engagement_health_scores_service" ON public.engagement_health_scores;
CREATE POLICY "engagement_health_scores_service" ON public.engagement_health_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── scope_creep_alerts ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "scope_creep_alerts_service" ON public.scope_creep_alerts;
CREATE POLICY "scope_creep_alerts_service" ON public.scope_creep_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── pod_match_history ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pod_match_history_service" ON public.pod_match_history;
CREATE POLICY "pod_match_history_service" ON public.pod_match_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
