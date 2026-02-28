-- Per-state RL parameters for online gradient descent
CREATE TABLE IF NOT EXISTS process_state_rl_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES ai_workspace(id) ON DELETE CASCADE,
  process_type TEXT NOT NULL,
  state_name TEXT NOT NULL,
  -- Learned parameters
  escalation_threshold FLOAT NOT NULL DEFAULT 0.7,
  timeout_multiplier FLOAT NOT NULL DEFAULT 1.0,
  retry_budget INT NOT NULL DEFAULT 2,
  confidence_weight FLOAT NOT NULL DEFAULT 0.5,
  -- Gradient descent tracking
  learning_rate FLOAT NOT NULL DEFAULT 0.01,
  gradient_sum FLOAT NOT NULL DEFAULT 0.0,
  update_count INT NOT NULL DEFAULT 0,
  last_loss FLOAT,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, process_type, state_name)
);

CREATE INDEX IF NOT EXISTS idx_process_state_rl_params_lookup
  ON process_state_rl_params(organization_id, process_type, state_name);

-- RLS
ALTER TABLE process_state_rl_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can read their own state rl params"
  ON process_state_rl_params FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));
