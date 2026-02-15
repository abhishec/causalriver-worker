-- ============================================================================
-- Developer Jarvis — Analysis Runs & Learning Tables
-- ============================================================================
-- Tracks brain-powered root cause analyses triggered via Jira webhook or CLI.
-- Learning loop: verified fixes (PR merged + ticket closed) generate signals
-- that strengthen the brain's causal graph over time.
-- ============================================================================

-- ── Analysis Runs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dev_jarvis_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  jira_key        TEXT NOT NULL,
  jira_url        TEXT,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('webhook', 'cli', 'api')),
  triggered_by    TEXT,
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending', 'analyzing', 'completed', 'failed', 'verified')),
  repo_url        TEXT,
  base_branch     TEXT,

  -- Analysis results
  analysis_brief  TEXT,
  root_cause      JSONB DEFAULT '{}',
  key_files       JSONB DEFAULT '[]',
  confidence      REAL DEFAULT 0,

  -- Fix verification (populated by learning loop)
  fix_pr_url      TEXT,
  fix_merged_at   TIMESTAMPTZ,
  jira_closed_at  TIMESTAMPTZ,
  fix_verified    BOOLEAN DEFAULT false,
  verification_signals JSONB DEFAULT '[]',

  -- Metadata
  duration_ms     INTEGER,
  error_message   TEXT,
  brain_context   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djr_org ON dev_jarvis_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_djr_jira ON dev_jarvis_runs(jira_key);
CREATE INDEX IF NOT EXISTS idx_djr_status ON dev_jarvis_runs(status);
CREATE INDEX IF NOT EXISTS idx_djr_unverified ON dev_jarvis_runs(fix_verified) WHERE fix_verified = false;

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE dev_jarvis_runs ENABLE ROW LEVEL SECURITY;

-- Org members can read their own org's runs
CREATE POLICY "djr_org_read" ON dev_jarvis_runs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Org members can create runs for their org
CREATE POLICY "djr_org_insert" ON dev_jarvis_runs
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Org admins/owners can update runs (for verification)
CREATE POLICY "djr_org_update" ON dev_jarvis_runs
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Platform admins can read all runs
CREATE POLICY "djr_admin_read" ON dev_jarvis_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );

-- Service role (edge functions) bypasses RLS automatically

-- ── Updated-at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_dev_jarvis_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dev_jarvis_runs_updated_at
  BEFORE UPDATE ON dev_jarvis_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_dev_jarvis_runs_updated_at();
