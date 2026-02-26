-- AI Workspace: the core unit of intelligence in BrainOS
-- One org can theoretically have multiple workspaces (different service configs)
-- but typically 1:1 for now
CREATE TABLE IF NOT EXISTS ai_workspace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,        -- FK to organizations.id
  name TEXT NOT NULL DEFAULT '',        -- "Fincense 5.11.5 SE-aaS Workspace"

  -- Activated services (what this AI Worker can do)
  activated_services TEXT[] NOT NULL DEFAULT ARRAY['SE-aaS'],
  -- Possible values: 'SE-aaS', 'A-aaS', 'Code-aaS', 'Test-aaS', 'Obs-aaS'

  -- Service-specific configs
  seaas_config JSONB DEFAULT '{
    "enabled_domains": ["pod-match","early-warning","scope-creep","delivery-intelligence",
      "pr-review","tdd-code-generator","incident-diagnosis","impact-analysis",
      "sql-analyzer","test-data-generator","design-doc-generator","codebase-qa","architecture-extractor"],
    "async_mode": true,
    "max_concurrent_jobs": 3
  }'::jsonb,

  aaas_config JSONB DEFAULT '{"enabled": false}'::jsonb,

  -- Brain config for this workspace
  brain_config JSONB NOT NULL DEFAULT '{
    "min_iq_for_activation": 10,
    "learning_rate": 0.1,
    "enable_federation": true,
    "context_window_tokens": 8000,
    "enable_recovery": true,
    "recovery_model": "claude-haiku-4-5-20251001",
    "max_recovery_attempts": 3
  }'::jsonb,

  -- Orchestrator config
  orchestrator_config JSONB NOT NULL DEFAULT '{
    "enable_rl_priority": true,
    "brain_readiness_min_iq": 10,
    "auto_start_waiting_jobs": true
  }'::jsonb,

  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_workspace_organization_id_idx ON ai_workspace(organization_id);
CREATE INDEX IF NOT EXISTS ai_workspace_org_status_idx ON ai_workspace(organization_id, status);

ALTER TABLE ai_workspace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON ai_workspace
  USING (true) WITH CHECK (true);

CREATE POLICY "members can view own workspace" ON ai_workspace
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_ai_workspace_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER ai_workspace_updated_at
  BEFORE UPDATE ON ai_workspace
  FOR EACH ROW EXECUTE FUNCTION update_ai_workspace_updated_at();
