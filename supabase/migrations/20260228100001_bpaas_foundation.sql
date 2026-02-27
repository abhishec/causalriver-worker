-- BPaaS: Business Process as a Service
-- Foundation tables for FSM-driven process execution
-- AgentX competition: automated business process workflows

-- Process instances: running/completed FSM executions
CREATE TABLE IF NOT EXISTS bpaas_process_instances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  process_type TEXT NOT NULL,
  -- 'hr_offboarding', 'procurement', 'order_management', 'expense_approval'
  agent_job_id UUID, -- FK to agent_queue.id (the job executing this process)
  current_state TEXT NOT NULL DEFAULT 'DECOMPOSE',
  -- States: DECOMPOSE | ASSESS | COMPUTE | POLICY_CHECK | APPROVAL_GATE | MUTATE | SCHEDULE_NOTIFY | COMPLETE | ESCALATE | FAILED
  fsm_state JSONB NOT NULL DEFAULT '{}',
  -- fsm_state: working memory for the FSM (findings from each state, intermediate results)
  state_history JSONB NOT NULL DEFAULT '[]',
  -- state_history: [{state, entered_at, exited_at, outcome, signal_value}]
  input_payload JSONB NOT NULL DEFAULT '{}',
  output_result JSONB,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  policy_outcome TEXT, -- 'pass' | 'fail' | 'escalate'
  escalation_level TEXT, -- 'manager' | 'committee' | 'system'
  initiated_by TEXT, -- 'a2a' | 'copilot' | 'cron'
  created_by UUID, -- user_id
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bpaas_process_instances_org
  ON bpaas_process_instances(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bpaas_process_instances_status
  ON bpaas_process_instances(status);
CREATE INDEX IF NOT EXISTS idx_bpaas_process_instances_job
  ON bpaas_process_instances(agent_job_id);
CREATE INDEX IF NOT EXISTS idx_bpaas_process_instances_type
  ON bpaas_process_instances(process_type, organization_id);

-- BPaaS process definitions: templates for common business processes
-- Separate from process_templates (which tracks domain sequences for SE-aaS)
CREATE TABLE IF NOT EXISTS bpaas_process_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID, -- NULL = global/CORE template, org-specific otherwise
  name TEXT NOT NULL,
  process_type TEXT NOT NULL, -- 'hr_offboarding', 'procurement', 'order_management', 'expense_approval'
  description TEXT,
  fsm_definition JSONB NOT NULL DEFAULT '{}',
  -- fsm_definition shape: { states: [...], transitions: [...], initial_state: "DECOMPOSE" }
  policy_rules JSONB NOT NULL DEFAULT '[]',
  -- policy_rules shape: [{ id, condition, action, level, threshold, description }]
  avg_completion_rate NUMERIC DEFAULT NULL,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bpaas_process_definitions_type
  ON bpaas_process_definitions(process_type);
CREATE INDEX IF NOT EXISTS idx_bpaas_process_definitions_org
  ON bpaas_process_definitions(organization_id);

-- Policy rules: reusable approval/escalation logic across processes
CREATE TABLE IF NOT EXISTS bpaas_policy_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  condition TEXT NOT NULL, -- expression language for conditions
  action TEXT NOT NULL, -- 'require_approval', 'escalate', 'alert', 'block'
  approval_level TEXT, -- 'manager', 'committee', 'cfo', 'ciso'
  threshold NUMERIC, -- for numeric comparisons
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bpaas_policy_rules_org
  ON bpaas_policy_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_bpaas_policy_rules_active
  ON bpaas_policy_rules(is_active) WHERE is_active = true;

-- RLS for bpaas_process_instances
ALTER TABLE bpaas_process_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY bpaas_process_instances_org_select ON bpaas_process_instances FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY bpaas_process_instances_org_write ON bpaas_process_instances FOR INSERT WITH CHECK (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY bpaas_process_instances_org_update ON bpaas_process_instances FOR UPDATE USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY bpaas_process_instances_service_write ON bpaas_process_instances FOR ALL USING (auth.role() = 'service_role');

-- RLS for bpaas_process_definitions
ALTER TABLE bpaas_process_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY bpaas_process_definitions_select ON bpaas_process_definitions FOR SELECT USING (
  organization_id IS NULL OR  -- global templates visible to all
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY bpaas_process_definitions_service_write ON bpaas_process_definitions FOR ALL USING (auth.role() = 'service_role');

-- RLS for bpaas_policy_rules
ALTER TABLE bpaas_policy_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY bpaas_policy_rules_org_select ON bpaas_policy_rules FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY bpaas_policy_rules_org_write ON bpaas_policy_rules FOR INSERT WITH CHECK (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY bpaas_policy_rules_org_update ON bpaas_policy_rules FOR UPDATE USING (
  organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
);
CREATE POLICY bpaas_policy_rules_service_write ON bpaas_policy_rules FOR ALL USING (auth.role() = 'service_role');

-- Seed: Core process definitions (global, available to all orgs)
INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active) VALUES
(
  NULL,
  'HR Employee Offboarding',
  'hr_offboarding',
  'End-to-end employee offboarding: access revocation, final pay calculation, equipment return, documentation',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "policy_pass"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "policy_fail"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "APPROVAL_GATE", "to": "ESCALATE", "on": "rejected"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"}
    ]
  }',
  '[
    {"id": "pto_balance", "condition": "pto_balance > 0", "action": "require_approval", "level": "manager", "description": "Positive PTO balance requires manager sign-off on payout"},
    {"id": "severance", "condition": "tenure_years > 2", "action": "require_approval", "level": "hr", "description": "Severance calculation requires HR approval for employees > 2 years"},
    {"id": "equity", "condition": "has_unvested_equity", "action": "escalate", "level": "legal", "description": "Unvested equity requires legal review"}
  ]',
  true
)
ON CONFLICT DO NOTHING;

INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active) VALUES
(
  NULL,
  'Procurement Request',
  'procurement',
  'Purchase order processing: approval routing, budget validation, vendor compliance, PO generation',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "policy_pass"},
      {"from": "POLICY_CHECK", "to": "ESCALATE", "on": "policy_fail"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "MUTATE", "to": "COMPLETE", "on": "mutated"}
    ]
  }',
  '[
    {"id": "amount_threshold", "condition": "total_amount > 500", "action": "require_approval", "level": "manager", "description": "Purchases over $500 require manager approval"},
    {"id": "large_purchase", "condition": "total_amount > 5000", "action": "require_approval", "level": "committee", "description": "Purchases over $5000 require committee approval"},
    {"id": "new_vendor", "condition": "vendor_is_new", "action": "require_approval", "level": "finance", "description": "New vendors require finance team vetting"}
  ]',
  true
)
ON CONFLICT DO NOTHING;

INSERT INTO bpaas_process_definitions (organization_id, name, process_type, description, fsm_definition, policy_rules, is_active) VALUES
(
  NULL,
  'Order Modification',
  'order_management',
  'Customer order modification: price recalculation, inventory check, refund/charge delta, confirmation',
  '{
    "initial_state": "DECOMPOSE",
    "states": ["DECOMPOSE", "ASSESS", "COMPUTE", "POLICY_CHECK", "APPROVAL_GATE", "MUTATE", "SCHEDULE_NOTIFY", "COMPLETE"],
    "transitions": [
      {"from": "DECOMPOSE", "to": "ASSESS", "on": "decomposed"},
      {"from": "ASSESS", "to": "COMPUTE", "on": "assessed"},
      {"from": "COMPUTE", "to": "POLICY_CHECK", "on": "computed"},
      {"from": "POLICY_CHECK", "to": "MUTATE", "on": "policy_pass"},
      {"from": "POLICY_CHECK", "to": "APPROVAL_GATE", "on": "requires_approval"},
      {"from": "APPROVAL_GATE", "to": "MUTATE", "on": "approved"},
      {"from": "MUTATE", "to": "SCHEDULE_NOTIFY", "on": "mutated"},
      {"from": "SCHEDULE_NOTIFY", "to": "COMPLETE", "on": "notified"}
    ]
  }',
  '[
    {"id": "refund_threshold", "condition": "refund_amount > 100", "action": "require_approval", "level": "manager", "description": "Refunds over $100 require manager approval"},
    {"id": "gift_card_limit", "condition": "gift_card_balance_after < 0", "action": "escalate", "level": "finance", "description": "Cannot credit more than gift card capacity"}
  ]',
  true
)
ON CONFLICT DO NOTHING;
