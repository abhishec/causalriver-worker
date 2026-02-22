-- ============================================================================
-- Error Patterns + Template Evolution
--
-- Phase 5: Self-Healing Error Patterns
-- Phase 6: Template A/B Testing & Evolution
-- ============================================================================

-- ── Phase 5: Error Pattern Learning ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS error_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,           -- NULL = global pattern
  pattern TEXT NOT NULL,           -- regex pattern
  category TEXT NOT NULL,          -- 'lockfile', 'typescript', 'eslint', etc.
  healing_strategy TEXT NOT NULL,  -- 'retry', 'retry_with_changes', 'skip', 'escalate', 'auto_fix'
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  success_rate FLOAT DEFAULT 0.5,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_patterns_org
  ON error_patterns(organization_id, category);

ALTER TABLE error_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_error_patterns" ON error_patterns FOR ALL
  USING (auth.role() = 'service_role');

-- Healing outcome tracking
CREATE TABLE IF NOT EXISTS healing_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_pattern_id UUID REFERENCES error_patterns(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL,
  strategy_used TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_healing_outcomes_pattern
  ON healing_outcomes(error_pattern_id, created_at DESC);

ALTER TABLE healing_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_healing_outcomes" ON healing_outcomes FOR ALL
  USING (auth.role() = 'service_role');


-- ── Phase 6: Template A/B Testing & Evolution ─────────────────────────────

-- Add evolution columns to agent_templates
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS source_template_id UUID;
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS variant_label TEXT;
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS evolution_status TEXT DEFAULT 'stable';
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS success_count INTEGER DEFAULT 0;
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0;
ALTER TABLE agent_templates ADD COLUMN IF NOT EXISTS avg_confidence FLOAT;

-- A/B test tracking table
CREATE TABLE IF NOT EXISTS template_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_template_id UUID NOT NULL,
  variant_template_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  status TEXT DEFAULT 'running',     -- 'running', 'completed', 'cancelled'
  original_runs INTEGER DEFAULT 0,
  variant_runs INTEGER DEFAULT 0,
  original_success_rate FLOAT,
  variant_success_rate FLOAT,
  winner TEXT,                       -- 'original', 'variant', null
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_template_ab_tests_org
  ON template_ab_tests(organization_id, status);

ALTER TABLE template_ab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_ab_tests" ON template_ab_tests FOR ALL
  USING (auth.role() = 'service_role');
