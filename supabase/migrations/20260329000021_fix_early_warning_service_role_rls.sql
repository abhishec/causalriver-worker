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
--
-- NOTE: All DDL is wrapped in IF EXISTS guards because these tables may not exist
-- in all environments (early-warning feature is opt-in per org).

-- engineers
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'engineers') THEN
    DROP POLICY IF EXISTS "engineers_service" ON public.engineers;
    CREATE POLICY "engineers_service" ON public.engineers
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- teams
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'teams') THEN
    DROP POLICY IF EXISTS "teams_service" ON public.teams;
    CREATE POLICY "teams_service" ON public.teams
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- repositories
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'repositories') THEN
    DROP POLICY IF EXISTS "repositories_service" ON public.repositories;
    CREATE POLICY "repositories_service" ON public.repositories
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- pull_requests
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pull_requests') THEN
    DROP POLICY IF EXISTS "pull_requests_service" ON public.pull_requests;
    CREATE POLICY "pull_requests_service" ON public.pull_requests
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- pr_reviews
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pr_reviews') THEN
    DROP POLICY IF EXISTS "pr_reviews_service" ON public.pr_reviews;
    CREATE POLICY "pr_reviews_service" ON public.pr_reviews
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- tickets
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tickets') THEN
    DROP POLICY IF EXISTS "tickets_service" ON public.tickets;
    CREATE POLICY "tickets_service" ON public.tickets
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- velocity_snapshots
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'velocity_snapshots') THEN
    DROP POLICY IF EXISTS "velocity_snapshots_service" ON public.velocity_snapshots;
    CREATE POLICY "velocity_snapshots_service" ON public.velocity_snapshots
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- bottleneck_snapshots
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bottleneck_snapshots') THEN
    DROP POLICY IF EXISTS "bottleneck_snapshots_service" ON public.bottleneck_snapshots;
    CREATE POLICY "bottleneck_snapshots_service" ON public.bottleneck_snapshots
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- engagements
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'engagements') THEN
    DROP POLICY IF EXISTS "engagements_service" ON public.engagements;
    CREATE POLICY "engagements_service" ON public.engagements
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- engineer_health_snapshots
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'engineer_health_snapshots') THEN
    DROP POLICY IF EXISTS "engineer_health_snapshots_service" ON public.engineer_health_snapshots;
    CREATE POLICY "engineer_health_snapshots_service" ON public.engineer_health_snapshots
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- engagement_health_scores
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'engagement_health_scores') THEN
    DROP POLICY IF EXISTS "engagement_health_scores_service" ON public.engagement_health_scores;
    CREATE POLICY "engagement_health_scores_service" ON public.engagement_health_scores
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- scope_creep_alerts
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'scope_creep_alerts') THEN
    DROP POLICY IF EXISTS "scope_creep_alerts_service" ON public.scope_creep_alerts;
    CREATE POLICY "scope_creep_alerts_service" ON public.scope_creep_alerts
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;

-- pod_match_history
DO $fix$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pod_match_history') THEN
    DROP POLICY IF EXISTS "pod_match_history_service" ON public.pod_match_history;
    CREATE POLICY "pod_match_history_service" ON public.pod_match_history
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $fix$;
