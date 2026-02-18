-- ============================================================================
-- P0 EARLY WARNING SYSTEM SCHEMA
-- ============================================================================
-- Schema for Use Case A (Velocity Collapse) and Use Case B (Bottleneck Risk)
--
-- Data Pipeline:
--   GitHub/Jira → Raw Event Store (connector_signals)
--   → Feature Engine (this schema)
--   → Risk Models (velocity-tracker.ts, bottleneck-detector.ts)
--   → Alert Engine → Dashboard
--
-- Design Partner: Toktaki
-- ============================================================================

-- ============================================================================
-- 1. ENGINEERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.engineers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identity
  github_user_id TEXT,              -- GitHub username/ID
  github_login TEXT,                -- GitHub login handle
  jira_user_id TEXT,                -- Jira user ID
  email TEXT,
  name TEXT NOT NULL,

  -- Team assignment
  team_id UUID,                     -- References teams table

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraints
  UNIQUE(organization_id, github_user_id),
  UNIQUE(organization_id, jira_user_id)
);

CREATE INDEX IF NOT EXISTS idx_engineers_org_id ON public.engineers(organization_id);
CREATE INDEX IF NOT EXISTS idx_engineers_team_id ON public.engineers(team_id);
CREATE INDEX IF NOT EXISTS idx_engineers_github_user ON public.engineers(github_user_id) WHERE github_user_id IS NOT NULL;

-- ============================================================================
-- 2. TEAMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  team_name TEXT NOT NULL,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, team_name)
);

CREATE INDEX IF NOT EXISTS idx_teams_org_id ON public.teams(organization_id);

-- ============================================================================
-- 3. REPOSITORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.repositories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  github_repo_id TEXT NOT NULL,     -- GitHub repository ID
  repo_name TEXT NOT NULL,          -- e.g., "toktaki/backend"
  team_id UUID REFERENCES teams(id),

  default_branch TEXT DEFAULT 'main',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, github_repo_id)
);

CREATE INDEX IF NOT EXISTS idx_repositories_org_id ON public.repositories(organization_id);
CREATE INDEX IF NOT EXISTS idx_repositories_team_id ON public.repositories(team_id);

-- ============================================================================
-- 4. PULL REQUESTS TABLE (Core P0 data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pull_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- GitHub identifiers
  pr_number INTEGER NOT NULL,
  github_pr_id TEXT NOT NULL,
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,

  -- PR metadata
  title TEXT,
  author_id UUID REFERENCES engineers(id),
  author_login TEXT,                -- Fallback if engineer not mapped

  -- Timestamps (critical for velocity)
  created_at TIMESTAMPTZ NOT NULL,
  merged_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  first_review_at TIMESTAMPTZ,      -- For review latency

  -- Size metrics (for velocity quality)
  additions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  changed_files INTEGER DEFAULT 0,

  -- Status
  is_merged BOOLEAN DEFAULT FALSE,
  is_draft BOOLEAN DEFAULT FALSE,

  -- Derived metrics (computed on insert/update)
  cycle_time_hours NUMERIC,         -- merged_at - created_at (in hours)
  review_latency_hours NUMERIC,     -- first_review_at - created_at

  metadata JSONB DEFAULT '{}',

  UNIQUE(organization_id, github_pr_id)
);

-- Critical indexes for velocity queries
CREATE INDEX IF NOT EXISTS idx_prs_org_repo_merged ON public.pull_requests(organization_id, repo_id, merged_at)
  WHERE is_merged = TRUE;
CREATE INDEX IF NOT EXISTS idx_prs_author_merged ON public.pull_requests(author_id, merged_at)
  WHERE is_merged = TRUE;
CREATE INDEX IF NOT EXISTS idx_prs_merged_timestamp ON public.pull_requests(merged_at)
  WHERE is_merged = TRUE;

-- Function to compute derived metrics
CREATE OR REPLACE FUNCTION compute_pr_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Cycle time (hours)
  IF NEW.merged_at IS NOT NULL AND NEW.created_at IS NOT NULL THEN
    NEW.cycle_time_hours := EXTRACT(EPOCH FROM (NEW.merged_at - NEW.created_at)) / 3600;
  END IF;

  -- Review latency (hours)
  IF NEW.first_review_at IS NOT NULL AND NEW.created_at IS NOT NULL THEN
    NEW.review_latency_hours := EXTRACT(EPOCH FROM (NEW.first_review_at - NEW.created_at)) / 3600;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_compute_pr_metrics ON public.pull_requests;
CREATE TRIGGER trigger_compute_pr_metrics
  BEFORE INSERT OR UPDATE ON public.pull_requests
  FOR EACH ROW
  EXECUTE FUNCTION compute_pr_metrics();

-- ============================================================================
-- 5. PR REVIEWS TABLE (for bottleneck detection)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pr_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  pr_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  github_review_id TEXT NOT NULL,

  reviewer_id UUID REFERENCES engineers(id),
  reviewer_login TEXT,              -- Fallback if engineer not mapped

  review_submitted_at TIMESTAMPTZ NOT NULL,
  review_state TEXT,                -- 'approved', 'changes_requested', 'commented'

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, github_review_id)
);

-- Critical indexes for bottleneck queries
CREATE INDEX IF NOT EXISTS idx_pr_reviews_org_pr ON public.pr_reviews(organization_id, pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_reviews_reviewer ON public.pr_reviews(reviewer_id, review_submitted_at);

-- ============================================================================
-- 6. TICKETS TABLE (Jira/Linear)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Jira/Linear identifiers
  external_ticket_id TEXT NOT NULL, -- Jira key (PROJ-123) or Linear ID
  source TEXT NOT NULL,             -- 'jira' or 'linear'
  team_id UUID REFERENCES teams(id),

  -- Ticket metadata
  title TEXT,
  assignee_id UUID REFERENCES engineers(id),

  -- Timestamps (for cycle time)
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,           -- Status changed to 'In Progress'
  completed_at TIMESTAMPTZ,         -- Status changed to 'Done'

  -- Metrics
  story_points NUMERIC,
  status TEXT,

  -- Linked PRs (for correlation)
  linked_pr_ids UUID[] DEFAULT '{}',

  -- Derived metrics
  ticket_cycle_time_hours NUMERIC,  -- completed_at - started_at

  metadata JSONB DEFAULT '{}',

  UNIQUE(organization_id, external_ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_org_team ON public.tickets(organization_id, team_id);
CREATE INDEX IF NOT EXISTS idx_tickets_completed ON public.tickets(completed_at) WHERE completed_at IS NOT NULL;

-- Function to compute ticket metrics
CREATE OR REPLACE FUNCTION compute_ticket_metrics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
    NEW.ticket_cycle_time_hours := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 3600;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_compute_ticket_metrics ON public.tickets;
CREATE TRIGGER trigger_compute_ticket_metrics
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION compute_ticket_metrics();

-- ============================================================================
-- 7. VELOCITY SNAPSHOTS (Pre-computed aggregates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.velocity_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Time window
  snapshot_date DATE NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  window_type TEXT NOT NULL,        -- 'sprint', '7day', '14day', '30day'

  -- Scope
  team_id UUID REFERENCES teams(id),
  repo_id UUID REFERENCES repositories(id),

  -- Velocity metrics
  prs_merged INTEGER DEFAULT 0,
  story_points_completed NUMERIC DEFAULT 0,
  mean_pr_cycle_time_hours NUMERIC,
  pr_cycle_time_variance NUMERIC,
  mean_review_latency_hours NUMERIC,

  -- WIP metrics
  open_pr_count INTEGER DEFAULT 0,
  tickets_in_progress INTEGER DEFAULT 0,

  -- Load metrics
  prs_per_engineer NUMERIC,
  tickets_per_engineer NUMERIC,

  -- Computed at
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, snapshot_date, window_type, team_id, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_velocity_snapshots_org_date ON public.velocity_snapshots(organization_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_velocity_snapshots_team ON public.velocity_snapshots(team_id, snapshot_date);

-- ============================================================================
-- 8. BOTTLENECK RISK SNAPSHOTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bottleneck_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Time window
  snapshot_date DATE NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,

  -- Scope
  team_id UUID REFERENCES teams(id),

  -- Top bottleneck engineer
  top_reviewer_id UUID REFERENCES engineers(id),
  top_reviewer_share NUMERIC,       -- % of PRs reviewed

  -- Concentration metrics
  reviewer_gini_coefficient NUMERIC,
  reviewer_hhi NUMERIC,             -- Herfindahl-Hirschman Index
  max_betweenness_centrality NUMERIC,

  -- Risk score (0-100)
  bottleneck_risk_score NUMERIC,
  risk_level TEXT,                  -- 'low', 'medium', 'high'

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, snapshot_date, team_id)
);

CREATE INDEX IF NOT EXISTS idx_bottleneck_snapshots_org_date ON public.bottleneck_snapshots(organization_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_bottleneck_snapshots_risk ON public.bottleneck_snapshots(organization_id, risk_level, snapshot_date);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pull_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pr_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.velocity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bottleneck_snapshots ENABLE ROW LEVEL SECURITY;

-- Select policies (users can see their org's data)
CREATE POLICY "engineers_select" ON public.engineers FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

CREATE POLICY "teams_select" ON public.teams FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

CREATE POLICY "repositories_select" ON public.repositories FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

CREATE POLICY "pull_requests_select" ON public.pull_requests FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

CREATE POLICY "pr_reviews_select" ON public.pr_reviews FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

CREATE POLICY "tickets_select" ON public.tickets FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

CREATE POLICY "velocity_snapshots_select" ON public.velocity_snapshots FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

CREATE POLICY "bottleneck_snapshots_select" ON public.bottleneck_snapshots FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

-- Service role can do anything
CREATE POLICY "engineers_service" ON public.engineers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "teams_service" ON public.teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "repositories_service" ON public.repositories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pull_requests_service" ON public.pull_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pr_reviews_service" ON public.pr_reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tickets_service" ON public.tickets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "velocity_snapshots_service" ON public.velocity_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "bottleneck_snapshots_service" ON public.bottleneck_snapshots FOR ALL USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON public.engineers TO authenticated, service_role;
GRANT ALL ON public.teams TO authenticated, service_role;
GRANT ALL ON public.repositories TO authenticated, service_role;
GRANT ALL ON public.pull_requests TO authenticated, service_role;
GRANT ALL ON public.pr_reviews TO authenticated, service_role;
GRANT ALL ON public.tickets TO authenticated, service_role;
GRANT ALL ON public.velocity_snapshots TO authenticated, service_role;
GRANT ALL ON public.bottleneck_snapshots TO authenticated, service_role;

-- Comments
COMMENT ON TABLE public.engineers IS 'P0: Engineer roster for bottleneck detection';
COMMENT ON TABLE public.teams IS 'P0: Team structure for velocity tracking';
COMMENT ON TABLE public.repositories IS 'P0: Repository mapping for velocity tracking';
COMMENT ON TABLE public.pull_requests IS 'P0: PR events for velocity collapse prediction';
COMMENT ON TABLE public.pr_reviews IS 'P0: Review events for bottleneck concentration risk';
COMMENT ON TABLE public.tickets IS 'P0: Jira/Linear tickets for velocity correlation';
COMMENT ON TABLE public.velocity_snapshots IS 'P0: Pre-computed velocity metrics for forecasting';
COMMENT ON TABLE public.bottleneck_snapshots IS 'P0: Pre-computed bottleneck risk scores';
