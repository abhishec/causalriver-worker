-- Canonical AI Worker configuration — one row per AI Worker (workspace/org)
CREATE TABLE IF NOT EXISTS ai_worker_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE,   -- FK to organizations.id (the AI Worker)
  display_name TEXT NOT NULL DEFAULT '',

  -- Brain config
  brain_config JSONB NOT NULL DEFAULT '{
    "maxIQ": 100,
    "learningRate": 0.1,
    "minQualityThreshold": 0.4,
    "enableFederation": true,
    "contextWindowTokens": 8000
  }'::jsonb,

  -- Which SE-aaS domains this AI Worker is allowed to run
  enabled_domains TEXT[] DEFAULT ARRAY[
    'pod-match', 'early-warning', 'scope-creep', 'delivery-intelligence',
    'pr-review', 'tdd-code-generator', 'incident-diagnosis', 'impact-analysis',
    'sql-analyzer', 'test-data-generator', 'design-doc-generator',
    'codebase-qa', 'architecture-extractor'
  ],

  -- Which connectors are available (populated when connector is connected)
  available_connectors TEXT[] DEFAULT '{}',

  -- Orchestrator config
  orchestrator_config JSONB NOT NULL DEFAULT '{
    "maxConcurrentJobs": 3,
    "enableRLPriority": true,
    "enableRecovery": true,
    "brainReadinessMinIQ": 10,
    "autoStartWaitingJobs": true
  }'::jsonb,

  -- Context agent config
  context_agent_config JSONB NOT NULL DEFAULT '{
    "enableStrategicReasoning": true,
    "enableCausalInference": true,
    "maxContextAssemblyMs": 5000,
    "cacheValidityMs": 30000
  }'::jsonb,

  -- Recovery config
  recovery_config JSONB NOT NULL DEFAULT '{
    "enableAutoRecovery": true,
    "maxRecoveryAttempts": 3,
    "consultClaudeOnFailure": true,
    "claudeModel": "claude-haiku-4-5-20251001"
  }'::jsonb,

  status TEXT NOT NULL DEFAULT 'active',  -- active | paused | archived
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON ai_worker_config(organization_id);
ALTER TABLE ai_worker_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access" ON ai_worker_config USING (true) WITH CHECK (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ai_worker_config_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ai_worker_config_updated_at BEFORE UPDATE ON ai_worker_config
  FOR EACH ROW EXECUTE FUNCTION update_ai_worker_config_updated_at();
