-- ============================================================================
-- Service Template Activator
-- ============================================================================
-- Closes the "what is this service?" gap for AI Workers.
-- Every service type (SE-aaS, AaaS, PM-aaS) has a canonical template
-- stored in the DB — with domains, pre-built commands, and artifact schemas.
--
-- When an admin activates a service on an AI Worker workspace, the template
-- is instantiated and the workspace gains the full command library + schemas.
--
-- Tables:
--   service_templates            — canonical per-service-type definitions
--   workspace_service_activations — which workspaces have which services active
-- ============================================================================

-- ── service_templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type     TEXT NOT NULL UNIQUE,  -- 'se-aas', 'aas', 'pm-aas'
  display_name     TEXT NOT NULL,
  description      TEXT NOT NULL,
  icon             TEXT,                  -- emoji or icon identifier

  -- Domains this service exposes (ordered by user-facing priority)
  -- Each domain: { id, name, description, model, weight, example_query }
  domains          JSONB NOT NULL DEFAULT '[]',

  -- Pre-built commands shown in Copilot command palette
  -- Each command: { id, label, prompt, domain, category, shortcut? }
  commands         JSONB NOT NULL DEFAULT '[]',

  -- Artifact output schemas — what each domain produces
  -- { "domain-id": { fields: [{name, type, description}], example: {...} } }
  artifact_schemas JSONB NOT NULL DEFAULT '{}',

  -- Connector requirements for this service
  required_connectors TEXT[] DEFAULT '{}',  -- must have these connected
  optional_connectors TEXT[] DEFAULT '{}',  -- better with these

  -- Onboarding checklist shown after activation
  -- [{ step, title, description, action_type, action_target }]
  onboarding_steps JSONB NOT NULL DEFAULT '[]',

  is_active        BOOLEAN NOT NULL DEFAULT true,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── workspace_service_activations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_service_activations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES ai_workspace(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_type     TEXT NOT NULL,

  -- Per-workspace command overrides / additions
  custom_commands  JSONB DEFAULT '[]',
  -- Per-workspace config (e.g. default sprint length, fiscal year start)
  custom_config    JSONB DEFAULT '{}',

  activated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  UNIQUE(workspace_id, service_type)
);

CREATE INDEX IF NOT EXISTS workspace_service_activations_org
  ON workspace_service_activations(organization_id, service_type);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE service_templates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_service_activations ENABLE ROW LEVEL SECURITY;

-- Templates: public read (all authenticated users can discover services)
CREATE POLICY "Authenticated users can read service templates"
  ON service_templates FOR SELECT TO authenticated USING (true);

-- Activations: org-scoped read
CREATE POLICY "Org members can read their service activations"
  ON workspace_service_activations FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

-- Activations: admin/owner can insert (via service_role in practice)
CREATE POLICY "Service role manages activations"
  ON workspace_service_activations FOR ALL
  USING (true) WITH CHECK (true);

-- ── GRANTs ────────────────────────────────────────────────────────────────────
GRANT SELECT ON service_templates TO authenticated;
GRANT SELECT ON workspace_service_activations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_service_activations TO service_role;

-- ── SEED: SE-aaS Template ─────────────────────────────────────────────────────
INSERT INTO service_templates (service_type, display_name, description, icon, sort_order, domains, commands, artifact_schemas, required_connectors, optional_connectors, onboarding_steps)
VALUES (
  'se-aas',
  'Software Engineering as a Service',
  'Delivery intelligence for engineering teams — pod matching, health monitoring, early warning signals, scope detection, and code analysis.',
  '⚙️',
  1,
  '[
    {"id":"delivery-intelligence","name":"Delivery Intelligence","description":"Full engagement health snapshot — velocity, risks, pod health","model":"claude-haiku-4-5","weight":"light","example_query":"Give me a delivery health check for the current sprint"},
    {"id":"pod-match","name":"Pod Matching","description":"Match engineers to pods based on skills, availability, and track record","model":"claude-haiku-4-5","weight":"light","example_query":"Who should lead the next delivery pod?"},
    {"id":"early-warning","name":"Early Warning","description":"Detect velocity drops, bottlenecks, and flight-risk engineers before they escalate","model":"claude-haiku-4-5","weight":"light","example_query":"Are there any early warning signals I should know about?"},
    {"id":"scope-creep","name":"Scope Creep Detection","description":"Identify unplanned work entering active sprints and estimate delay impact","model":"claude-haiku-4-5","weight":"light","example_query":"Is there any scope creep in the current sprint?"},
    {"id":"pr-review","name":"PR Review","description":"AI-assisted pull request review with risk scoring and suggested changes","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Review the open PRs for this week"},
    {"id":"codebase-qa","name":"Codebase Quality Assessment","description":"Deep analysis of code quality, test coverage, and technical debt","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Assess the quality of the current codebase"},
    {"id":"incident-diagnosis","name":"Incident Diagnosis","description":"Root-cause analysis for production incidents with timeline reconstruction","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Diagnose the recent production incident"},
    {"id":"tdd-code-generator","name":"TDD Code Generator","description":"Generate test suites using test-driven development principles","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Generate tests for the authentication module"},
    {"id":"design-doc-generator","name":"Design Document Generator","description":"Produce architecture and design documents from codebase analysis","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Generate a design document for the payments service"},
    {"id":"architecture-extractor","name":"Architecture Extractor","description":"Extract and visualize system architecture from the codebase","model":"claude-sonnet-4-6","weight":"heavy","example_query":"What does our current system architecture look like?"}
  ]'::jsonb,
  '[
    {"id":"delivery-check","label":"Run delivery health check","prompt":"Run a delivery intelligence check for my current engagements and give me a health summary","domain":"delivery-intelligence","category":"monitoring","shortcut":"/delivery"},
    {"id":"pod-match-now","label":"Find best pod match","prompt":"Who should lead the next delivery pod? Match based on current skills and availability","domain":"pod-match","category":"team","shortcut":"/pod"},
    {"id":"early-warning-scan","label":"Scan for early warning signals","prompt":"Are there any early warning signals — velocity drops, blockers, or flight risks — I should act on now?","domain":"early-warning","category":"monitoring","shortcut":"/warn"},
    {"id":"scope-check","label":"Check for scope creep","prompt":"Check the current sprint for unplanned scope. How much is it affecting our delivery timeline?","domain":"scope-creep","category":"monitoring","shortcut":"/scope"},
    {"id":"review-prs","label":"Review open PRs","prompt":"Review the open pull requests this week. Flag any high-risk changes","domain":"pr-review","category":"code"},
    {"id":"code-quality","label":"Assess codebase quality","prompt":"Assess the overall quality of our codebase — test coverage, tech debt, code smells","domain":"codebase-qa","category":"code"},
    {"id":"diagnose-incident","label":"Diagnose recent incident","prompt":"Diagnose the most recent production incident. What was the root cause and what should we fix?","domain":"incident-diagnosis","category":"operations"},
    {"id":"gen-tests","label":"Generate test suite","prompt":"Generate a test suite using TDD principles for the code I describe","domain":"tdd-code-generator","category":"code"},
    {"id":"gen-design-doc","label":"Generate design document","prompt":"Generate a design document for the service or feature I describe","domain":"design-doc-generator","category":"documentation"},
    {"id":"extract-architecture","label":"Extract system architecture","prompt":"Analyze the codebase and extract a clear picture of the current system architecture","domain":"architecture-extractor","category":"documentation"}
  ]'::jsonb,
  '{
    "delivery-intelligence": {
      "fields": [
        {"name":"summary","type":"string","description":"Plain-English health summary"},
        {"name":"health_score","type":"number","description":"0-100 overall health score"},
        {"name":"pod_health","type":"object","description":"Per-pod health breakdown"},
        {"name":"engagement_risk","type":"string","description":"low | medium | high"}
      ],
      "example": {"summary":"Sprint is on track. One pod showing velocity drop.","health_score":72,"engagement_risk":"medium"}
    },
    "pod-match": {
      "fields": [
        {"name":"top_recommendation","type":"string","description":"Recommended pod name"},
        {"name":"confidence","type":"number","description":"0-1 confidence score"},
        {"name":"alternatives","type":"array","description":"Alternative pod options"},
        {"name":"reasoning","type":"string","description":"Why this pod was selected"}
      ],
      "example": {"top_recommendation":"Alpha Pod","confidence":0.87,"reasoning":"Best skill match + availability"}
    },
    "early-warning": {
      "fields": [
        {"name":"alerts","type":"array","description":"List of alert objects with severity and description"},
        {"name":"velocity_trend","type":"string","description":"improving | stable | declining"},
        {"name":"flight_risk_engineers","type":"array","description":"Engineers showing flight risk signals"}
      ],
      "example": {"alerts":[{"severity":"high","message":"3 engineers overallocated"}],"velocity_trend":"declining"}
    },
    "scope-creep": {
      "fields": [
        {"name":"alerts","type":"array","description":"Scope creep alert objects"},
        {"name":"severity","type":"string","description":"none | low | medium | high"},
        {"name":"estimated_delay_days","type":"number","description":"Estimated timeline impact in days"}
      ],
      "example": {"severity":"medium","estimated_delay_days":3}
    }
  }'::jsonb,
  ARRAY['github', 'jira'],
  ARRAY['slack', 'linear', 'confluence'],
  '[
    {"step":1,"title":"Connect GitHub","description":"Connect your GitHub org to start reading PRs, commits, and code","action_type":"connect_connector","action_target":"github"},
    {"step":2,"title":"Connect Jira","description":"Connect Jira to read sprint data, tickets, and velocity metrics","action_type":"connect_connector","action_target":"jira"},
    {"step":3,"title":"Run first delivery check","description":"Run your first delivery intelligence check to see your team health","action_type":"run_command","action_target":"delivery-check"},
    {"step":4,"title":"Set up early warning alerts","description":"Configure Slack write-back rules to get notified of risks automatically","action_type":"configure_writeback","action_target":"early-warning"}
  ]'::jsonb
)
ON CONFLICT (service_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  domains = EXCLUDED.domains,
  commands = EXCLUDED.commands,
  artifact_schemas = EXCLUDED.artifact_schemas,
  required_connectors = EXCLUDED.required_connectors,
  optional_connectors = EXCLUDED.optional_connectors,
  onboarding_steps = EXCLUDED.onboarding_steps,
  updated_at = now();

-- ── SEED: AaaS Template ───────────────────────────────────────────────────────
INSERT INTO service_templates (service_type, display_name, description, icon, sort_order, domains, commands, artifact_schemas, required_connectors, optional_connectors, onboarding_steps)
VALUES (
  'aas',
  'Accounting as a Service',
  'AI-powered financial intelligence — reconciliation, P&L analysis, anomaly detection, tax compliance, audit preparation, and the V9 Causal Anomaly Score (CAS).',
  '💰',
  2,
  '[
    {"id":"causal-analysis","name":"Causal Anomaly Analysis (V9)","description":"Full financial health analysis with 5-dimension Causal Anomaly Score (0-100)","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Run a full causal anomaly analysis for Q3"},
    {"id":"bookkeep","name":"AI Bookkeeping","description":"AI-assisted GL posting and categorization","model":"claude-haiku-4-5","weight":"light","example_query":"Bookkeep these transactions"},
    {"id":"reconcile","name":"Account Reconciliation","description":"Automated bank and account reconciliation with discrepancy detection","model":"claude-haiku-4-5","weight":"light","example_query":"Reconcile accounts for March"},
    {"id":"statements","name":"Financial Statements","description":"Generate P&L, Balance Sheet, and Cash Flow statements","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Generate the P&L for Q2"},
    {"id":"tax","name":"Tax Compliance","description":"Multi-jurisdiction tax compliance review and filing preparation","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Check our tax compliance position"},
    {"id":"audit","name":"Audit Preparation","description":"Generate audit packages with evidence trails and compliance documentation","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Prepare the audit package for FY2025"},
    {"id":"anomaly","name":"Anomaly Detection","description":"Statistical anomaly detection across all transaction categories","model":"claude-haiku-4-5","weight":"light","example_query":"Find any anomalies in this month'\''s transactions"},
    {"id":"cash-forecast","name":"Cash Flow Forecast","description":"90-day cash flow prediction with scenario modeling","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Forecast cash flow for the next 90 days"},
    {"id":"revenue-leakage","name":"Revenue Leakage Detection","description":"Find unbilled work, contract gaps, and lost revenue opportunities","model":"claude-haiku-4-5","weight":"light","example_query":"Detect any revenue leakage in the current period"},
    {"id":"causal-pl","name":"Causal P&L Narrator","description":"Plain-English narrative explaining the drivers behind P&L changes","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Explain the P&L changes in plain English"}
  ]'::jsonb,
  '[
    {"id":"cas-analysis","label":"Run Causal Anomaly Score (V9)","prompt":"Run a full V9 causal anomaly analysis. Score all 5 dimensions and flag anything below 70","domain":"causal-analysis","category":"risk","shortcut":"/cas"},
    {"id":"reconcile-now","label":"Reconcile accounts","prompt":"Reconcile all bank accounts for the current period. Flag any unmatched transactions","domain":"reconcile","category":"accounting","shortcut":"/rec"},
    {"id":"pl-statement","label":"Generate P&L statement","prompt":"Generate the Profit & Loss statement for the current period with variance analysis","domain":"statements","category":"reporting","shortcut":"/pl"},
    {"id":"anomaly-scan","label":"Scan for financial anomalies","prompt":"Scan all transactions for statistical anomalies — round numbers, unusual timing, new vendors","domain":"anomaly","category":"risk","shortcut":"/anomaly"},
    {"id":"tax-check","label":"Check tax compliance","prompt":"Review our current tax compliance position across all jurisdictions","domain":"tax","category":"compliance"},
    {"id":"audit-prep","label":"Prepare audit package","prompt":"Prepare the audit package with evidence trail and compliance documentation for the current fiscal year","domain":"audit","category":"compliance"},
    {"id":"cash-forecast","label":"Forecast cash flow","prompt":"Forecast cash flow for the next 90 days with best, base, and worst case scenarios","domain":"cash-forecast","category":"planning"},
    {"id":"revenue-leakage","label":"Find revenue leakage","prompt":"Identify any revenue leakage — unbilled work, contract gaps, or missed invoicing","domain":"revenue-leakage","category":"risk"},
    {"id":"explain-pl","label":"Explain P&L in plain English","prompt":"Explain the key drivers behind this period'\''s P&L changes in plain English for a non-finance audience","domain":"causal-pl","category":"reporting"}
  ]'::jsonb,
  '{
    "causal-analysis": {
      "fields": [
        {"name":"cas_score","type":"number","description":"Causal Anomaly Score 0-100 (85+ clean, 70-84 review, <70 high risk)"},
        {"name":"dimensions","type":"object","description":"5 dimension scores: completeness, consistency, conformity, conditions, brain_intelligence"},
        {"name":"high_risk_flags","type":"array","description":"Transactions or patterns flagged as high risk"},
        {"name":"recommendations","type":"array","description":"Prioritized action items"}
      ],
      "example": {"cas_score":78,"dimensions":{"completeness":18,"consistency":16,"conformity":17,"conditions":15,"brain_intelligence":12}}
    },
    "anomaly": {
      "fields": [
        {"name":"anomalies","type":"array","description":"List of anomaly objects with severity, category, and description"},
        {"name":"total_value_at_risk","type":"number","description":"Total transaction value associated with anomalies"},
        {"name":"anomaly_count","type":"number","description":"Total number of anomalies detected"}
      ],
      "example": {"anomaly_count":3,"total_value_at_risk":45000}
    },
    "cash-forecast": {
      "fields": [
        {"name":"base_case","type":"object","description":"30/60/90 day cash balance projections"},
        {"name":"best_case","type":"object","description":"Optimistic scenario"},
        {"name":"worst_case","type":"object","description":"Pessimistic scenario"},
        {"name":"key_assumptions","type":"array","description":"Assumptions driving the forecast"}
      ]
    }
  }'::jsonb,
  ARRAY[]::text[],
  ARRAY['github'],
  '[
    {"step":1,"title":"Upload chart of accounts","description":"Provide your chart of accounts so the AI understands your account structure","action_type":"upload_document","action_target":"chart-of-accounts"},
    {"step":2,"title":"Run first anomaly scan","description":"Run an anomaly detection scan to establish a baseline","action_type":"run_command","action_target":"anomaly-scan"},
    {"step":3,"title":"Run Causal Anomaly Score","description":"Get your V9 CAS score — the benchmark for ongoing financial health monitoring","action_type":"run_command","action_target":"cas-analysis"},
    {"step":4,"title":"Configure risk alerts","description":"Set up write-back rules to automatically create Jira tickets for high-risk anomalies","action_type":"configure_writeback","action_target":"causal-analysis"}
  ]'::jsonb
)
ON CONFLICT (service_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  domains = EXCLUDED.domains,
  commands = EXCLUDED.commands,
  artifact_schemas = EXCLUDED.artifact_schemas,
  required_connectors = EXCLUDED.required_connectors,
  optional_connectors = EXCLUDED.optional_connectors,
  onboarding_steps = EXCLUDED.onboarding_steps,
  updated_at = now();

-- ── SEED: PM-aaS Template ─────────────────────────────────────────────────────
INSERT INTO service_templates (service_type, display_name, description, icon, sort_order, domains, commands, artifact_schemas, required_connectors, optional_connectors, onboarding_steps)
VALUES (
  'pm-aas',
  'Product Management as a Service',
  'AI-powered product intelligence — user story analysis, roadmap alignment, sprint retrospectives, blocker identification, and release notes generation.',
  '🗺️',
  3,
  '[
    {"id":"story-analysis","name":"User Story Analysis","description":"Analyze user story quality, completeness, and testability against acceptance criteria","model":"claude-haiku-4-5","weight":"light","example_query":"Analyze the quality of our current sprint user stories"},
    {"id":"roadmap-alignment","name":"Roadmap Alignment","description":"Check if current sprint work aligns with product roadmap and strategic goals","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Is our current sprint aligned with the product roadmap?"},
    {"id":"sprint-retro","name":"Sprint Retrospective","description":"AI-generated sprint retrospective with velocity analysis and improvement suggestions","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Run a sprint retrospective for the last sprint"},
    {"id":"blocker-analysis","name":"Blocker Analysis","description":"Identify and categorize all current blockers with suggested resolution paths","model":"claude-haiku-4-5","weight":"light","example_query":"What are the current blockers and how do we unblock them?"},
    {"id":"release-notes","name":"Release Notes Generator","description":"Generate structured release notes from completed tickets and PRs","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Generate release notes for v2.3"},
    {"id":"priority-stack","name":"Priority Stack Ranker","description":"Rank the backlog by business value, effort, and strategic alignment","model":"claude-haiku-4-5","weight":"light","example_query":"Help me rank the backlog by priority"},
    {"id":"feature-gap","name":"Feature Gap Analysis","description":"Compare current product capabilities against competitor features and customer requests","model":"claude-sonnet-4-6","weight":"heavy","example_query":"What are the biggest feature gaps in our product?"}
  ]'::jsonb,
  '[
    {"id":"story-quality","label":"Analyze user story quality","prompt":"Analyze the quality of user stories in the current sprint. Are they well-defined, testable, and aligned with acceptance criteria?","domain":"story-analysis","category":"quality","shortcut":"/stories"},
    {"id":"roadmap-check","label":"Check roadmap alignment","prompt":"Is the current sprint work aligned with our product roadmap and strategic goals? Flag any drift","domain":"roadmap-alignment","category":"strategy","shortcut":"/roadmap"},
    {"id":"run-retro","label":"Run sprint retrospective","prompt":"Run a comprehensive sprint retrospective. What went well, what didn'\''t, and what should we do differently?","domain":"sprint-retro","category":"process","shortcut":"/retro"},
    {"id":"find-blockers","label":"Find all blockers","prompt":"What are all the current blockers across the team? Categorize by type and suggest resolution paths","domain":"blocker-analysis","category":"operations","shortcut":"/blockers"},
    {"id":"gen-release-notes","label":"Generate release notes","prompt":"Generate structured release notes from all completed tickets and merged PRs in this release","domain":"release-notes","category":"documentation","shortcut":"/notes"},
    {"id":"rank-backlog","label":"Rank backlog by priority","prompt":"Rank the current backlog by business value, effort, and strategic alignment. What should we build next?","domain":"priority-stack","category":"planning","shortcut":"/priority"},
    {"id":"feature-gaps","label":"Identify feature gaps","prompt":"Analyze our product against customer feedback and competitive landscape. What are the critical feature gaps?","domain":"feature-gap","category":"strategy"}
  ]'::jsonb,
  '{
    "story-analysis": {
      "fields": [
        {"name":"stories_analyzed","type":"number","description":"Total stories reviewed"},
        {"name":"quality_score","type":"number","description":"0-100 overall story quality score"},
        {"name":"issues","type":"array","description":"List of quality issues per story"},
        {"name":"recommendations","type":"array","description":"Specific improvement suggestions"}
      ],
      "example": {"stories_analyzed":12,"quality_score":68,"issues":[{"story_id":"ENG-42","issue":"Missing acceptance criteria"}]}
    },
    "sprint-retro": {
      "fields": [
        {"name":"velocity","type":"object","description":"Planned vs completed points"},
        {"name":"went_well","type":"array","description":"Positive observations"},
        {"name":"to_improve","type":"array","description":"Areas for improvement"},
        {"name":"action_items","type":"array","description":"Specific next-sprint action items"}
      ]
    },
    "release-notes": {
      "fields": [
        {"name":"version","type":"string","description":"Release version"},
        {"name":"summary","type":"string","description":"Plain-English release summary"},
        {"name":"new_features","type":"array","description":"New features shipped"},
        {"name":"bug_fixes","type":"array","description":"Bugs resolved"},
        {"name":"breaking_changes","type":"array","description":"Breaking changes requiring action"}
      ]
    }
  }'::jsonb,
  ARRAY['jira'],
  ARRAY['github', 'confluence', 'slack'],
  '[
    {"step":1,"title":"Connect Jira","description":"Connect Jira to read sprint data, user stories, and backlog","action_type":"connect_connector","action_target":"jira"},
    {"step":2,"title":"Connect Confluence","description":"Connect Confluence to read requirements and user stories from your wiki","action_type":"connect_connector","action_target":"confluence"},
    {"step":3,"title":"Analyze first sprint","description":"Run a user story quality analysis on your current sprint","action_type":"run_command","action_target":"story-quality"},
    {"step":4,"title":"Run roadmap alignment check","description":"Check if your current work is aligned with strategic goals","action_type":"run_command","action_target":"roadmap-check"}
  ]'::jsonb
)
ON CONFLICT (service_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  domains = EXCLUDED.domains,
  commands = EXCLUDED.commands,
  artifact_schemas = EXCLUDED.artifact_schemas,
  required_connectors = EXCLUDED.required_connectors,
  optional_connectors = EXCLUDED.optional_connectors,
  onboarding_steps = EXCLUDED.onboarding_steps,
  updated_at = now();

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE service_templates IS
  'Canonical service type definitions — domains, commands, artifact schemas. '
  'Seeded with SE-aaS, AaaS, PM-aaS. Activating a service on an AI Worker '
  'grants the workspace access to all commands and artifact schemas in the template.';

COMMENT ON TABLE workspace_service_activations IS
  'Records which service templates are active for each AI Worker workspace. '
  'One row per workspace+service_type. Supports per-workspace command customization.';
