-- supabase/migrations/20260228000003_engagement_outcomes.sql
-- Data Flywheel: Structured Engagement Outcome Deposits
-- Every engagement milestone deposits structured signals — the primary moat.

CREATE TABLE IF NOT EXISTS engagement_outcomes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  engagement_id UUID,               -- FK to engagements table
  milestone_type TEXT NOT NULL,     -- 'engagement_start', 'sprint_complete', 'flight_risk_detected', 'scope_creep_alert', 'engagement_complete'
  milestone_data JSONB NOT NULL DEFAULT '{}',
  -- Structured signals deposited at this milestone:
  team_composition JSONB,           -- {size, roles, tech_stack}
  velocity_pattern JSONB,           -- {avg_velocity, trend, bottlenecks}
  health_score NUMERIC,             -- 0-1
  flight_risk_count INTEGER DEFAULT 0,
  scope_creep_detected BOOLEAN DEFAULT false,
  pod_name TEXT,
  domain_sequence TEXT[],           -- domains that ran in order, e.g. ['pod-match','early-warning']
  quality_scores JSONB,             -- {domain: score} map
  outcome_label TEXT,               -- 'successful_delivery', 'at_risk', 'churned', 'on_track'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_outcomes_org ON engagement_outcomes(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_outcomes_milestone ON engagement_outcomes(milestone_type);
CREATE INDEX IF NOT EXISTS idx_engagement_outcomes_engagement ON engagement_outcomes(engagement_id);

ALTER TABLE engagement_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read" ON engagement_outcomes
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
  );

CREATE POLICY "service_role_write" ON engagement_outcomes
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
