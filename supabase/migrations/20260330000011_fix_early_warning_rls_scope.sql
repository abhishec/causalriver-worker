-- Fix cross-tenant write exposure on 8 early-warning tables.
--
-- Root cause: 20260217000002_p0_early_warning_schema.sql created all 8 service
-- policies as FOR ALL USING (true) WITH CHECK (true) without TO service_role,
-- meaning ANY authenticated user could write to any org's engineering data.
--
-- Tables affected:
--   engineers, teams, repositories, pull_requests, pr_reviews,
--   tickets, velocity_snapshots, bottleneck_snapshots
--
-- Fix: Drop and recreate write policies scoped to service_role only.
-- Read policies (org membership check) remain unchanged.

-- ── engineers ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "engineers_service" ON public.engineers;
CREATE POLICY "engineers_service" ON public.engineers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── teams ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "teams_service" ON public.teams;
CREATE POLICY "teams_service" ON public.teams
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── repositories ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "repositories_service" ON public.repositories;
CREATE POLICY "repositories_service" ON public.repositories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── pull_requests ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pull_requests_service" ON public.pull_requests;
CREATE POLICY "pull_requests_service" ON public.pull_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── pr_reviews ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pr_reviews_service" ON public.pr_reviews;
CREATE POLICY "pr_reviews_service" ON public.pr_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── tickets ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tickets_service" ON public.tickets;
CREATE POLICY "tickets_service" ON public.tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── velocity_snapshots ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "velocity_snapshots_service" ON public.velocity_snapshots;
CREATE POLICY "velocity_snapshots_service" ON public.velocity_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── bottleneck_snapshots ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bottleneck_snapshots_service" ON public.bottleneck_snapshots;
CREATE POLICY "bottleneck_snapshots_service" ON public.bottleneck_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
