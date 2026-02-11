-- ============================================================================
-- DMN (Background Insight Engine) + Impact Scoring Tables
-- Phase 2+3 of the Org Brain evolution.
-- ============================================================================

-- Strategic priorities — organization's declared goals
-- The impact scorer uses these to determine which events align with what matters
CREATE TABLE IF NOT EXISTS strategic_priorities (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  relevant_domains TEXT[] NOT NULL DEFAULT '{}',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  weight NUMERIC NOT NULL DEFAULT 0.5 CHECK (weight >= 0 AND weight <= 1),
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategic_priorities_org
  ON strategic_priorities (organization_id, active);

-- Impact scores — scored events with business impact assessment
CREATE TABLE IF NOT EXISTS impact_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  composite_score INTEGER NOT NULL CHECK (composite_score >= 0 AND composite_score <= 100),
  cascade_reach NUMERIC NOT NULL DEFAULT 0,
  dollar_effect NUMERIC NOT NULL DEFAULT 0,
  strategic_alignment NUMERIC NOT NULL DEFAULT 0,
  novelty NUMERIC NOT NULL DEFAULT 0,
  summary TEXT,
  aligned_priorities TEXT[] DEFAULT '{}',
  affected_domains TEXT[] DEFAULT '{}',
  cascade_depth INTEGER DEFAULT 0,
  should_alert BOOLEAN NOT NULL DEFAULT false,
  alert_tier TEXT CHECK (alert_tier IN ('critical', 'high', 'medium', 'low')),
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impact_scores_org
  ON impact_scores (organization_id, scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_impact_scores_alert
  ON impact_scores (organization_id, should_alert, alert_tier, scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_impact_scores_composite
  ON impact_scores (organization_id, composite_score DESC);

-- Proactive insights — DMN-discovered insights
-- (These are also stored in ai_memory, but this table provides structured querying)
CREATE TABLE IF NOT EXISTS proactive_insights (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'unexpected_correlation', 'emerging_cascade', 'what_changed',
    'knowledge_gap', 'prediction_opportunity'
  )),
  importance NUMERIC NOT NULL DEFAULT 0,
  surprise_score NUMERIC NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  domains TEXT[] NOT NULL DEFAULT '{}',
  evidence JSONB DEFAULT '{}',
  delivered BOOLEAN NOT NULL DEFAULT false,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proactive_insights_org
  ON proactive_insights (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proactive_insights_type
  ON proactive_insights (organization_id, insight_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proactive_insights_importance
  ON proactive_insights (organization_id, importance DESC);

-- Attention decisions — routing log for the attention manager
CREATE TABLE IF NOT EXISTS attention_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  composite_score INTEGER NOT NULL,
  delivery TEXT NOT NULL CHECK (delivery IN ('immediate', 'batched', 'suppressed', 'digest')),
  reason TEXT,
  route_id TEXT,
  deliver_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attention_decisions_org
  ON attention_decisions (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attention_decisions_delivery
  ON attention_decisions (organization_id, delivery, created_at DESC);

-- RLS: strategic_priorities
ALTER TABLE strategic_priorities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to strategic_priorities"
  ON strategic_priorities
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS: impact_scores
ALTER TABLE impact_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to impact_scores"
  ON impact_scores
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS: proactive_insights
ALTER TABLE proactive_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to proactive_insights"
  ON proactive_insights
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS: attention_decisions
ALTER TABLE attention_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to attention_decisions"
  ON attention_decisions
  FOR ALL
  USING (true)
  WITH CHECK (true);
