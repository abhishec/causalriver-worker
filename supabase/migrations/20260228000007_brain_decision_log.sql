-- brain_decision_log: AI Decision Audit Trail for EU AI Act Article 13 compliance
-- Every autonomous decision the brain makes is logged here for full explainability.

CREATE TABLE IF NOT EXISTS brain_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'domain_routing',     -- LLM classifier chose a domain
    'model_selection',    -- model router chose haiku/sonnet/opus
    'agent_dispatch',     -- orchestrator dispatched a job
    'hitl_override',      -- human approved/rejected
    'policy_blocked',     -- policy enforcer blocked
    'circuit_breaker'     -- global circuit breaker excluded domain
  )),
  input_context JSONB NOT NULL,   -- the query/signal that triggered the decision
  decision_made JSONB NOT NULL,   -- what was chosen (domain, model, job_id, etc.)
  rationale TEXT,                  -- reasoning (from LLM or rule engine)
  confidence FLOAT,
  model_used TEXT,                 -- which Claude model made this decision
  domain TEXT,
  job_id UUID REFERENCES agent_queue(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_brain_decision_log_org_created
  ON brain_decision_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brain_decision_log_domain
  ON brain_decision_log(organization_id, domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brain_decision_log_type
  ON brain_decision_log(organization_id, decision_type, created_at DESC);

-- RLS
ALTER TABLE brain_decision_log ENABLE ROW LEVEL SECURITY;

-- Org members can read their own decision log
CREATE POLICY "org_members_read_decisions"
  ON brain_decision_log FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Service role inserts only (decisions are written server-side)
CREATE POLICY "service_role_write_decisions"
  ON brain_decision_log FOR INSERT
  TO service_role
  WITH CHECK (true);
