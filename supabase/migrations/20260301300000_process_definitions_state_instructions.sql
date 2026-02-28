-- Add state_instructions JSONB to bpaas_process_definitions
-- state_instructions: maps FSM state name → natural language instruction for the agentic executor
-- The generic executor reads this at each state and passes it to Claude with available tools.
-- No code changes needed to add new process types or customize behavior — edit DB rows.

ALTER TABLE bpaas_process_definitions
  ADD COLUMN IF NOT EXISTS state_instructions JSONB NOT NULL DEFAULT '{}';

-- Default state instructions (generic, work for any process type)
-- Applied to ALL existing global templates (organization_id IS NULL)
-- Org-specific templates can override these with their own instructions.

UPDATE bpaas_process_definitions
SET state_instructions = '{
  "DECOMPOSE": "Analyze the input payload for this process. Identify all key entities (people, amounts, systems, dates, identifiers). Determine what data needs to be gathered and what actions will be required. Produce a clear structured plan outlining the steps this process will follow.",
  "ASSESS": "Review the decomposed plan. Use available tools to query relevant systems and gather supporting data. Look for missing information, potential blockers, compliance issues, and risk factors. Document your findings.",
  "COMPUTE": "Perform all calculations, business logic, and analysis required. Apply the process policy rules to the current data. Calculate financial amounts, deadlines, risk scores, or any derived values needed for the policy check.",
  "POLICY_CHECK": "Evaluate whether this process passes policy automatically, requires human approval, or must be escalated. Review each policy rule against the computed values. Return a clear decision: pass (proceed automatically), require_approval (needs human sign-off), or escalate (beyond normal approval).",
  "APPROVAL_GATE": "Human approval is required. Prepare a concise approval request that summarizes: what is being approved, the key data points, which policy rule was triggered, the risk level, and your recommendation. Make it easy for the approver to make a decision.",
  "MUTATE": "Execute all output actions for this process. Use your available tools to create records, send notifications, update systems, and complete deliverables. If a tool is not available (connector not connected), note it clearly but continue with the tools you do have. Maximize value from available connectors.",
  "SCHEDULE_NOTIFY": "Send or schedule notifications to all relevant stakeholders about the process outcome. Use available messaging tools. Tailor the message content to each audience — be specific about what happened and what they need to do next.",
  "COMPLETE": "The process has completed. Provide a clear summary: what was accomplished, which actions succeeded, which were skipped due to missing connectors, any follow-up items, and the overall outcome. This becomes the permanent record of this process execution.",
  "ESCALATE": "This process requires escalation beyond normal approval. Clearly explain why escalation is needed, what the escalation path should be, and notify the appropriate decision-makers using available tools. Document everything.",
  "FAILED": "The process has failed. Explain what went wrong, what was attempted, and what needs to happen for this process to be retried or resolved manually.",
  "FRAUD_REVIEW": "Conduct a fraud risk assessment. Review all available signals for anomalies, inconsistencies, or suspicious patterns. Use available tools to cross-reference data. Provide a fraud risk score and recommendation.",
  "DUPLICATE_CHECK": "Check for duplicate records that would create problems (duplicate invoices, duplicate requests, etc.). Use available tools to search existing records. Flag any matches for review.",
  "RECONCILE": "Reconcile discrepancies between data sources. Identify mismatches, calculate variances, and determine whether differences are within acceptable tolerance. Flag items requiring manual review.",
  "RCA": "Conduct a root cause analysis. Systematically trace the problem from symptoms to underlying causes. Use the 5-whys or similar methodology. Identify contributing factors and the primary root cause. Recommend preventive actions.",
  "GATHER": "Collect all data needed for this process from available sources. Use every relevant connector tool to pull live data. Aggregate information from multiple systems. Note any data sources that could not be reached."
}'
WHERE organization_id IS NULL;

-- Also update the service_role access for the new column (already covered by existing policies)
-- No RLS change needed — the column inherits table policies.

COMMENT ON COLUMN bpaas_process_definitions.state_instructions IS
  'JSONB map of FSM state name → natural language instruction for the generic agentic executor.
   At each state, the executor reads this instruction, builds tool schemas from connected connectors,
   and calls Claude with tool_use. No code changes needed to customize per-state behavior.';
