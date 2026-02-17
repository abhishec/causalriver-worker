-- =============================================================================
-- REPAIR: Create velocity_snapshots and bottleneck_snapshots tables
-- =============================================================================
-- These tables were defined in migration 20260217000002 but failed to create
-- due to FK references to tables (engineers, teams, repositories) that didn't
-- exist at migration time. This repair migration creates them WITHOUT FK
-- constraints to unblock the early-warning pipeline.
-- =============================================================================

-- Drop and recreate without FK constraints
CREATE TABLE IF NOT EXISTS public.velocity_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  window_type TEXT DEFAULT '7day',
  team_id UUID,
  repo_id UUID,
  prs_merged INTEGER DEFAULT 0,
  story_points_completed NUMERIC DEFAULT 0,
  mean_pr_cycle_time_hours NUMERIC,
  pr_cycle_time_variance NUMERIC,
  mean_review_latency_hours NUMERIC,
  open_pr_count INTEGER DEFAULT 0,
  tickets_in_progress INTEGER DEFAULT 0,
  prs_per_engineer NUMERIC,
  tickets_per_engineer NUMERIC,
  z_score NUMERIC DEFAULT 0,
  percent_drop NUMERIC DEFAULT 0,
  collapse_detected BOOLEAN DEFAULT false,
  historical_mean NUMERIC DEFAULT 0,
  historical_stddev NUMERIC DEFAULT 0,
  predicted_velocity NUMERIC,
  prediction_lower_bound NUMERIC,
  prediction_upper_bound NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, snapshot_date, window_type, team_id, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_velocity_snapshots_org_date
  ON public.velocity_snapshots(organization_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_velocity_snapshots_team
  ON public.velocity_snapshots(team_id, snapshot_date);

CREATE TABLE IF NOT EXISTS public.bottleneck_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  team_id UUID,
  top_reviewer_id UUID,
  top_reviewer TEXT,
  top_reviewer_share NUMERIC,
  reviewer_gini_coefficient NUMERIC,
  reviewer_hhi NUMERIC,
  max_betweenness_centrality NUMERIC,
  top_centrality_contributor TEXT,
  avg_review_latency_hours NUMERIC,
  reviewer_count INTEGER DEFAULT 0,
  reviewer_breakdown JSONB DEFAULT '[]',
  bottleneck_risk_score NUMERIC,
  risk_level TEXT DEFAULT 'low',
  jira_assignee_hhi NUMERIC,
  top_jira_assignee TEXT,
  top_jira_assignee_share NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, snapshot_date, team_id)
);

CREATE INDEX IF NOT EXISTS idx_bottleneck_snapshots_org_date
  ON public.bottleneck_snapshots(organization_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_bottleneck_snapshots_risk
  ON public.bottleneck_snapshots(organization_id, risk_level, snapshot_date);

-- RLS
ALTER TABLE public.velocity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bottleneck_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role full access (drop first to be idempotent)
DROP POLICY IF EXISTS "velocity_snapshots_service" ON public.velocity_snapshots;
CREATE POLICY "velocity_snapshots_service" ON public.velocity_snapshots
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bottleneck_snapshots_service" ON public.bottleneck_snapshots;
CREATE POLICY "bottleneck_snapshots_service" ON public.bottleneck_snapshots
  FOR ALL USING (true) WITH CHECK (true);

-- Authenticated user read access
DROP POLICY IF EXISTS "velocity_snapshots_read" ON public.velocity_snapshots;
CREATE POLICY "velocity_snapshots_read" ON public.velocity_snapshots
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "bottleneck_snapshots_read" ON public.bottleneck_snapshots;
CREATE POLICY "bottleneck_snapshots_read" ON public.bottleneck_snapshots
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
  );

-- Grants
GRANT ALL ON public.velocity_snapshots TO authenticated, service_role;
GRANT ALL ON public.bottleneck_snapshots TO authenticated, service_role;
