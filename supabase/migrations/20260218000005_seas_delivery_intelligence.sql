-- ============================================================================
-- SE-aaS DELIVERY INTELLIGENCE SCHEMA
-- ============================================================================
-- Adds the three WOW artifacts for the SE-aaS service:
--   1. Engagement Health Score — live 0-100 per client engagement
--   2. Predictive Delivery Timeline — days-to-completion forecast
--   3. Pod Match Card — which internal pod to assign, with evidence
--
-- Architecture:
--   GitHub/Jira/Slack signals (existing)
--   → delivery-health-signals.ts (aggregation engine)
--   → engineer_health_snapshots (per-dev per-week)
--   → engagement_health_scores (per-engagement per-day)
--   → scope_creep_alerts (when story_point_delta_pct > 20%)
--   → pod_match_history (recommendation log for Oracle reward)
-- ============================================================================

-- ============================================================================
-- GUARD: Ensure `teams` table exists before referencing it.
-- Created by 20260217000002_p0_early_warning_schema.sql, but that migration
-- may not have been applied to all environments. This guard is idempotent.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_name        TEXT NOT NULL,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, team_name)
);

CREATE INDEX IF NOT EXISTS idx_teams_org_id ON public.teams(organization_id);

-- ============================================================================
-- GUARD: Ensure `engineers` table exists before referencing it.
-- Created by 20260217000002_p0_early_warning_schema.sql, same caveat as above.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.engineers (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  github_user_id   TEXT,
  github_login     TEXT,
  jira_user_id     TEXT,
  email            TEXT,
  name             TEXT NOT NULL,
  team_id          UUID,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, github_user_id),
  UNIQUE(organization_id, jira_user_id)
);

CREATE INDEX IF NOT EXISTS idx_engineers_org_id    ON public.engineers(organization_id);
CREATE INDEX IF NOT EXISTS idx_engineers_team_id   ON public.engineers(team_id);
CREATE INDEX IF NOT EXISTS idx_engineers_github_user ON public.engineers(github_user_id) WHERE github_user_id IS NOT NULL;

-- ============================================================================
-- 1. ENGAGEMENTS — Registry of client engagements
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.engagements (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  client_name      TEXT NOT NULL,
  engagement_name  TEXT NOT NULL,

  -- Signal mapping: which Jira/GitHub/Slack resources belong to this engagement
  jira_projects    TEXT[]  DEFAULT '{}',   -- e.g., ['ACME', 'ACME-BACKEND']
  jira_labels      TEXT[]  DEFAULT '{}',   -- e.g., ['acme-client', 'q1-engagement']
  github_repos     TEXT[]  DEFAULT '{}',   -- e.g., ['acme-api', 'acme-frontend']
  slack_channels   TEXT[]  DEFAULT '{}',   -- e.g., ['#client-acme', '#acme-delivery']

  -- Assigned internal delivery pod
  pod_id           UUID REFERENCES teams(id),
  pod_name         TEXT,

  -- Lifecycle
  status           TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  start_date       DATE,
  target_end_date  DATE,

  -- Tech stack for pod-match scoring
  tech_stack       TEXT[]  DEFAULT '{}',   -- e.g., ['react', 'node', 'postgresql']

  metadata         JSONB   DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, engagement_name)
);

CREATE INDEX idx_engagements_org_id   ON public.engagements(organization_id);
CREATE INDEX idx_engagements_pod_id   ON public.engagements(pod_id);
CREATE INDEX idx_engagements_status   ON public.engagements(organization_id, status);

-- ============================================================================
-- 2. ENGINEER HEALTH SNAPSHOTS — Per engineer per week
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.engineer_health_snapshots (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Engineer identity (fallback to github_login if not yet mapped to engineers table)
  engineer_id          UUID REFERENCES engineers(id),
  github_login         TEXT NOT NULL,
  week_start           DATE NOT NULL,  -- ISO Monday

  -- Gap 1: Computed from pr_reviewed, pr_merged, jira_comment signals
  review_burden        INTEGER DEFAULT 0,    -- PRs assigned as reviewer this week
  velocity_index       NUMERIC DEFAULT 0,    -- PRs merged by this author this week
  ticket_response_lag  NUMERIC,              -- Avg hours: ticket created → first comment
  sentiment_index      NUMERIC,              -- -1..+1 from Slack messages in their channels

  -- Flight risk composite (0-100, higher = more risk)
  flight_risk_score    NUMERIC DEFAULT 0 CHECK (flight_risk_score >= 0 AND flight_risk_score <= 100),
  overallocation_flag  BOOLEAN DEFAULT FALSE,

  computed_at          TIMESTAMPTZ DEFAULT NOW(),
  metadata             JSONB DEFAULT '{}',

  UNIQUE(organization_id, github_login, week_start)
);

CREATE INDEX idx_eng_health_org_week  ON public.engineer_health_snapshots(organization_id, week_start DESC);
CREATE INDEX idx_eng_health_login     ON public.engineer_health_snapshots(github_login, week_start DESC);
CREATE INDEX idx_eng_health_risk      ON public.engineer_health_snapshots(organization_id, flight_risk_score DESC) WHERE flight_risk_score > 50;

-- ============================================================================
-- 3. ENGAGEMENT HEALTH SCORES — Per engagement per day
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.engagement_health_scores (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id        UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,

  -- Composite health score 0-100
  health_score         NUMERIC(5,2) NOT NULL CHECK (health_score >= 0 AND health_score <= 100),

  -- Component breakdown (for sparkbars in SEaaSDeliveryPanel)
  delivery_velocity    NUMERIC(5,2),  -- 30% weight: avg pr_merged cycle time, normalized
  jira_resolution_rate NUMERIC(5,2),  -- 25% weight: resolved / (resolved + open) tickets
  scope_drift          NUMERIC(5,2),  -- 20% weight: 100 - clamp(story_point_delta_pct, 0, 100)
  team_concentration   NUMERIC(5,2),  -- 15% weight: (1 - HHI_authorship) * 100
  slack_sentiment      NUMERIC(5,2),  -- 10% weight: (avg_sentiment + 1) / 2 * 100

  -- Signal counts used in this computation
  pr_count             INTEGER DEFAULT 0,
  ticket_count         INTEGER DEFAULT 0,
  message_count        INTEGER DEFAULT 0,

  -- Scope tracking (WOW artifact #1 data source)
  story_points_baseline INTEGER DEFAULT 0,  -- Sprint start baseline
  story_points_current  INTEGER DEFAULT 0,  -- Current total
  story_point_delta_pct NUMERIC(5,2),       -- % growth vs baseline

  -- Delivery forecast (WOW artifact #2)
  predicted_completion_date  DATE,
  forecast_confidence        NUMERIC(4,3) CHECK (forecast_confidence >= 0 AND forecast_confidence <= 1),
  forecast_days_remaining    INTEGER,
  forecast_at_risk           BOOLEAN DEFAULT FALSE,

  -- Oracle link
  oracle_prediction_id UUID,

  computed_at          TIMESTAMPTZ DEFAULT NOW(),
  metadata             JSONB DEFAULT '{}'
);

-- Functional unique index: one score record per (org, engagement, day).
-- Uses CREATE UNIQUE INDEX rather than inline UNIQUE(...) because expression-based
-- unique constraints inside CREATE TABLE require PG 15+ and aren't supported
-- in all Supabase environments.
CREATE UNIQUE INDEX IF NOT EXISTS idx_eng_scores_unique_day
  ON public.engagement_health_scores(organization_id, engagement_id, (computed_at::DATE));

CREATE INDEX idx_eng_scores_engagement  ON public.engagement_health_scores(engagement_id, computed_at DESC);
CREATE INDEX idx_eng_scores_org         ON public.engagement_health_scores(organization_id, computed_at DESC);
CREATE INDEX idx_eng_scores_low_health  ON public.engagement_health_scores(organization_id, health_score ASC) WHERE health_score < 60;

-- ============================================================================
-- 4. SCOPE CREEP ALERTS — Unacknowledged scope drift alerts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.scope_creep_alerts (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id    UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,

  severity         TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  delta_pct        NUMERIC(5,2),   -- Scope growth vs baseline
  baseline_pts     INTEGER,
  current_pts      INTEGER,
  sprint_name      TEXT,
  alert_message    TEXT,

  acknowledged     BOOLEAN DEFAULT FALSE,
  acknowledged_at  TIMESTAMPTZ,
  acknowledged_by  UUID REFERENCES auth.users(id),

  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scope_alerts_org    ON public.scope_creep_alerts(organization_id, created_at DESC);
CREATE INDEX idx_scope_alerts_active ON public.scope_creep_alerts(organization_id, engagement_id)
  WHERE acknowledged = FALSE;

-- ============================================================================
-- 5. POD MATCH HISTORY — WOW artifact #3 recommendation evidence log
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pod_match_history (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id        UUID REFERENCES engagements(id),

  recommended_pod_id   UUID REFERENCES teams(id),
  recommended_pod_name TEXT,

  -- Evidence snapshot at time of recommendation (for "why this pod" card)
  evidence             JSONB DEFAULT '{}',
  -- Shape: {
  --   avgCycleTimeHours: number,
  --   weeklyPrCount: number,
  --   techStackMatch: string[],
  --   techStackOverlapScore: number,
  --   pastEngagements: [{ name, healthScore, daysToDeliver, techStack }],
  --   matchScore: number  // 0-1 composite
  -- }

  confidence           NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  rank                 INTEGER DEFAULT 1,  -- 1 = primary recommendation

  -- Outcome tracking (filled in by Outcome Oracle after engagement ends)
  was_accepted         BOOLEAN,
  outcome_health_score NUMERIC(5,2),

  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pod_match_org ON public.pod_match_history(organization_id, created_at DESC);
CREATE INDEX idx_pod_match_eng ON public.pod_match_history(engagement_id, created_at DESC);

-- ============================================================================
-- 6. VIEW: engagement_health_latest — Latest score per engagement
-- ============================================================================
CREATE OR REPLACE VIEW public.engagement_health_latest AS
SELECT DISTINCT ON (ehs.engagement_id)
  ehs.id,
  ehs.engagement_id,
  ehs.organization_id,
  ehs.health_score,
  ehs.delivery_velocity,
  ehs.jira_resolution_rate,
  ehs.scope_drift,
  ehs.team_concentration,
  ehs.slack_sentiment,
  ehs.pr_count,
  ehs.ticket_count,
  ehs.message_count,
  ehs.story_points_baseline,
  ehs.story_points_current,
  ehs.story_point_delta_pct,
  ehs.predicted_completion_date,
  ehs.forecast_confidence,
  ehs.forecast_days_remaining,
  ehs.forecast_at_risk,
  ehs.computed_at,
  -- Engagement context
  e.client_name,
  e.engagement_name,
  e.pod_id,
  e.pod_name,
  e.tech_stack,
  e.target_end_date,
  e.status,
  -- Days overdue (if past target)
  CASE
    WHEN e.target_end_date IS NOT NULL AND e.target_end_date < CURRENT_DATE AND e.status = 'active'
    THEN (CURRENT_DATE - e.target_end_date)
    ELSE NULL
  END AS days_overdue
FROM public.engagement_health_scores ehs
JOIN public.engagements e ON e.id = ehs.engagement_id
ORDER BY ehs.engagement_id, ehs.computed_at DESC;

-- ============================================================================
-- RLS POLICIES (following p0_early_warning_schema.sql pattern exactly)
-- ============================================================================

ALTER TABLE public.engagements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineer_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_health_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_creep_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pod_match_history         ENABLE ROW LEVEL SECURITY;

-- Select policies (org members can see their org's data)
CREATE POLICY "engagements_select" ON public.engagements FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY "engineer_health_snapshots_select" ON public.engineer_health_snapshots FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY "engagement_health_scores_select" ON public.engagement_health_scores FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY "scope_creep_alerts_select" ON public.scope_creep_alerts FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY "pod_match_history_select" ON public.pod_match_history FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

-- Acknowledge write policy for scope_creep_alerts
CREATE POLICY "scope_creep_alerts_update" ON public.scope_creep_alerts FOR UPDATE USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
) WITH CHECK (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);

-- Service role full access
CREATE POLICY "engagements_service"              ON public.engagements              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "engineer_health_snapshots_service" ON public.engineer_health_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "engagement_health_scores_service"  ON public.engagement_health_scores  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "scope_creep_alerts_service"        ON public.scope_creep_alerts        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "pod_match_history_service"         ON public.pod_match_history         FOR ALL USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON public.engagements              TO authenticated, service_role;
GRANT ALL ON public.engineer_health_snapshots TO authenticated, service_role;
GRANT ALL ON public.engagement_health_scores  TO authenticated, service_role;
GRANT ALL ON public.scope_creep_alerts        TO authenticated, service_role;
GRANT ALL ON public.pod_match_history         TO authenticated, service_role;
GRANT SELECT ON public.engagement_health_latest TO authenticated, service_role;
