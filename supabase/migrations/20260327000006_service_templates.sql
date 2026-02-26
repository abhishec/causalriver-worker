-- Service Templates — pre-built AI service configurations
-- Each template defines domains, commands, artifact schemas, and connector requirements
-- Templates are deployed to new workspaces and can be customized per-workspace

CREATE TABLE IF NOT EXISTS service_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type     TEXT NOT NULL UNIQUE,  -- 'se-aas', 'aas', 'custom', etc.
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

  -- Activation state
  activated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active        BOOLEAN NOT NULL DEFAULT true,

  UNIQUE(workspace_id, service_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS service_templates_type ON service_templates(service_type);
CREATE INDEX IF NOT EXISTS workspace_service_activations_workspace ON workspace_service_activations(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_service_activations_org ON workspace_service_activations(organization_id);
CREATE INDEX IF NOT EXISTS workspace_service_activations_active ON workspace_service_activations(is_active) WHERE is_active = true;

-- RLS
ALTER TABLE service_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_service_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read service templates"
  ON service_templates FOR SELECT
  USING (true);

CREATE POLICY "Service role manages service templates"
  ON service_templates FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Org members can read workspace service activations"
  ON workspace_service_activations FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role manages workspace service activations"
  ON workspace_service_activations FOR ALL
  USING (true) WITH CHECK (true);

GRANT SELECT ON service_templates TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_templates TO service_role;
GRANT SELECT ON workspace_service_activations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_service_activations TO service_role;

-- ── SEED: SE-aaS Template ────────────────────────────────────────────────────
INSERT INTO service_templates (service_type, display_name, description, icon, sort_order, domains, commands, artifact_schemas, required_connectors, optional_connectors, onboarding_steps)
VALUES (
  'se-aas',
  'Software Engineering as a Service',
  'Delivery intelligence for engineering teams — pod matching, health monitoring, early warning signals, scope detection, and code analysis.',
  '⚙️',
  1,
  $$[
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
  ]$$::jsonb,
  $$[
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
  ]$$::jsonb,
  $${"delivery-intelligence":{"fields":[{"name":"summary","type":"string","description":"Plain-English health summary"},{"name":"health_score","type":"number","description":"0-100 overall health score"},{"name":"pod_health","type":"object","description":"Per-pod health breakdown"},{"name":"engagement_risk","type":"string","description":"low | medium | high"}],"example":{"summary":"Sprint is on track. One pod showing velocity drop.","health_score":72,"engagement_risk":"medium"}},"pod-match":{"fields":[{"name":"top_recommendation","type":"object","description":"Best-match engineer with score"},{"name":"alternatives","type":"array","description":"Up to 3 alternative matches"},{"name":"reasoning","type":"string","description":"Why this match works best"}],"example":{"top_recommendation":{"name":"alice","pod":"platform","confidence":0.94},"alternatives":[{"name":"bob","pod":"backend","confidence":0.87}],"reasoning":"Alice has been in platform for 2 quarters with strong track record"}},"early-warning":{"fields":[{"name":"signals","type":"array","description":"Array of {type, severity, engineer, metric}"},{"name":"aggregate_risk","type":"number","description":"0-100 risk score"},{"name":"actions","type":"array","description":"Recommended interventions"}],"example":{"signals":[{"type":"velocity_drop","engineer":"charlie","severity":"high","metric":"50% last 2 weeks"}],"aggregate_risk":72}},"scope-creep":{"fields":[{"name":"detected","type":"boolean"},{"name":"unplanned_items","type":"array","description":"New scope items"},{"name":"estimated_delay","type":"string","description":"e.g. '3 days'"}],"example":{"detected":true,"unplanned_items":[{"title":"New reporting feature","story_points":8}],"estimated_delay":"3 days"}}}$$::jsonb,
  ARRAY[]::text[],
  ARRAY['github', 'jira']::text[],
  $$[{"step":"connect-github","title":"Connect GitHub","description":"Link your GitHub account to enable code analysis and PR review"},{"step":"connect-jira","title":"Connect Jira","description":"Link Jira to enable sprint and epic tracking"},{"step":"calibrate-pods","title":"Calibrate Pod Health","description":"Define your delivery pods and configure health scoring"},{"step":"first-check","title":"Run First Health Check","description":"Generate your first delivery intelligence report"}]$$::jsonb
)
ON CONFLICT (service_type) DO NOTHING;

-- ── SEED: AaaS Template ──────────────────────────────────────────────────────
INSERT INTO service_templates (service_type, display_name, description, icon, sort_order, domains, commands, artifact_schemas, required_connectors, optional_connectors, onboarding_steps)
VALUES (
  'aas',
  'Accounting as a Service',
  'AI-powered financial intelligence — reconciliation, P&L analysis, anomaly detection, tax compliance, audit preparation, and the V9 Causal Anomaly Score (CAS).',
  '💰',
  2,
  $$[
    {"id":"causal-analysis","name":"Causal Anomaly Analysis (V9)","description":"Full financial health analysis with 5-dimension Causal Anomaly Score (0-100)","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Run a full causal anomaly analysis for Q3"},
    {"id":"bookkeep","name":"AI Bookkeeping","description":"AI-assisted GL posting and categorization","model":"claude-haiku-4-5","weight":"light","example_query":"Bookkeep these transactions"},
    {"id":"reconcile","name":"Account Reconciliation","description":"Automated bank and account reconciliation with discrepancy detection","model":"claude-haiku-4-5","weight":"light","example_query":"Reconcile accounts for March"},
    {"id":"statements","name":"Financial Statements","description":"Generate P&L, Balance Sheet, and Cash Flow statements","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Generate the P&L for Q2"},
    {"id":"tax","name":"Tax Compliance","description":"Multi-jurisdiction tax compliance review and filing preparation","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Check our tax compliance position"},
    {"id":"audit","name":"Audit Preparation","description":"Generate audit packages with evidence trails and compliance documentation","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Prepare the audit package for FY2025"},
    {"id":"anomaly","name":"Anomaly Detection","description":"Statistical anomaly detection across all transaction categories","model":"claude-haiku-4-5","weight":"light","example_query":"Find any anomalies in this month's transactions"},
    {"id":"cash-forecast","name":"Cash Flow Forecast","description":"90-day cash flow prediction with scenario modeling","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Forecast cash flow for the next 90 days"},
    {"id":"revenue-leakage","name":"Revenue Leakage Detection","description":"Find unbilled work, contract gaps, and lost revenue opportunities","model":"claude-haiku-4-5","weight":"light","example_query":"Detect any revenue leakage in the current period"},
    {"id":"causal-pl","name":"Causal P&L Narrator","description":"Plain-English narrative explaining the drivers behind P&L changes","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Explain the P&L changes in plain English"}
  ]$$::jsonb,
  $$[
    {"id":"cas-analysis","label":"Run Causal Anomaly Score (V9)","prompt":"Run a full V9 causal anomaly analysis. Score all 5 dimensions and flag anything below 70","domain":"causal-analysis","category":"risk","shortcut":"/cas"},
    {"id":"reconcile-now","label":"Reconcile accounts","prompt":"Reconcile all bank accounts for the current period. Flag any unmatched transactions","domain":"reconcile","category":"accounting","shortcut":"/rec"},
    {"id":"pl-statement","label":"Generate P&L statement","prompt":"Generate the Profit & Loss statement for the current period with variance analysis","domain":"statements","category":"reporting","shortcut":"/pl"},
    {"id":"anomaly-scan","label":"Scan for financial anomalies","prompt":"Scan all transactions for statistical anomalies — round numbers, unusual timing, new vendors","domain":"anomaly","category":"risk","shortcut":"/anomaly"},
    {"id":"tax-check","label":"Check tax compliance","prompt":"Review our current tax compliance position across all jurisdictions","domain":"tax","category":"compliance"},
    {"id":"audit-pkg","label":"Generate audit package","prompt":"Prepare the audit package for the current fiscal year. Include all evidence and compliance docs","domain":"audit","category":"compliance"},
    {"id":"cash-forecast","label":"Forecast cash flow","prompt":"Generate a 90-day cash flow forecast with best, worst, and expected scenarios","domain":"cash-forecast","category":"planning"},
    {"id":"revenue-check","label":"Check for revenue leakage","prompt":"Scan for unbilled work, contract gaps, and missed revenue opportunities","domain":"revenue-leakage","category":"revenue"},
    {"id":"pl-narrative","label":"Explain P&L changes","prompt":"Give me a plain-English narrative of what drove the P&L changes this period","domain":"causal-pl","category":"reporting"}
  ]$$::jsonb,
  $${"causal-analysis":{"fields":[{"name":"cas_score","type":"number","description":"0-100 Causal Anomaly Score"},{"name":"dimensions","type":"object","description":"5-dimension breakdown: {timing, magnitude, novelty, classification, context}"},{"name":"risk_level","type":"string","description":"low | medium | high"},{"name":"top_anomalies","type":"array","description":"Ordered list of flagged transactions"}],"example":{"cas_score":68,"dimensions":{"timing":75,"magnitude":60,"novelty":55,"classification":70,"context":65},"risk_level":"medium"}},"statements":{"fields":[{"name":"statement_type","type":"string","description":"P&L | Balance Sheet | Cash Flow"},{"name":"periods","type":"array","description":"Current period + 2 prior"},{"name":"variance_analysis","type":"object"},{"name":"ratios","type":"object"}],"example":{"statement_type":"P&L","periods":["FY2025","FY2024","FY2023"]}},"audit":{"fields":[{"name":"audit_package","type":"object","description":"Complete audit-ready documentation"},{"name":"evidence_trail","type":"array","description":"Transaction-level evidence"},{"name":"compliance_status","type":"object"}]}}$$::jsonb,
  ARRAY[]::text[],
  ARRAY['quickbooks', 'netsuite']::text[],
  $$[{"step":"connect-accounting","title":"Connect Accounting System","description":"Link your QuickBooks or NetSuite account"},{"step":"initial-scan","title":"Run Initial Financial Scan","description":"Generate your first CAS (Causal Anomaly Score) report"},{"step":"set-thresholds","title":"Configure Alert Thresholds","description":"Define what constitutes anomalies in your business"},{"step":"enable-forecasting","title":"Enable Cash Forecasting","description":"Set up automatic 90-day cash flow predictions"}]$$::jsonb
)
ON CONFLICT (service_type) DO NOTHING;

-- ── SEED: PM-aaS Template ────────────────────────────────────────────────────
INSERT INTO service_templates (service_type, display_name, description, icon, sort_order, domains, commands, artifact_schemas, required_connectors, optional_connectors, onboarding_steps)
VALUES (
  'pm-aas',
  'Product Management as a Service',
  'AI-powered product intelligence — roadmap planning, sprint health, backlog prioritization, stakeholder alignment, and release risk assessment.',
  '🗺️',
  3,
  $$[
    {"id":"roadmap-planner","name":"Roadmap Planner","description":"Generate and evaluate product roadmap options based on capacity, dependencies, and business impact","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Help me plan the roadmap for the next two quarters"},
    {"id":"sprint-health","name":"Sprint Health","description":"Real-time sprint status — velocity, risk, and blocker analysis","model":"claude-haiku-4-5","weight":"light","example_query":"How healthy is the current sprint?"},
    {"id":"backlog-prioritizer","name":"Backlog Prioritizer","description":"Score and rank backlog items by value, effort, risk, and strategic alignment","model":"claude-haiku-4-5","weight":"light","example_query":"Prioritize our current backlog"},
    {"id":"stakeholder-alignment","name":"Stakeholder Alignment","description":"Summarize progress, highlight decisions needed, and flag misalignments","model":"claude-sonnet-4-6","weight":"heavy","example_query":"Prepare a stakeholder update for this week"},
    {"id":"release-risk","name":"Release Risk Assessment","description":"Evaluate readiness and risk for upcoming releases","model":"claude-haiku-4-5","weight":"light","example_query":"Is the v2.4 release ready?"},
    {"id":"feature-impact","name":"Feature Impact Analysis","description":"Estimate delivery time, team impact, and downstream dependencies for a feature","model":"claude-sonnet-4-6","weight":"heavy","example_query":"What's the impact of adding real-time notifications?"},
    {"id":"dependency-mapper","name":"Dependency Mapper","description":"Identify cross-team and cross-service dependencies that could block delivery","model":"claude-haiku-4-5","weight":"light","example_query":"What dependencies should I be worried about this quarter?"},
    {"id":"capacity-planner","name":"Capacity Planner","description":"Model team capacity against planned work for the next 1-3 sprints","model":"claude-haiku-4-5","weight":"light","example_query":"Do we have enough capacity for the Q2 plan?"}
  ]$$::jsonb,
  $$[
    {"id":"roadmap-check","label":"Plan the roadmap","prompt":"Help me plan a realistic roadmap for the next two quarters. Consider current velocity, dependencies, and team capacity","domain":"roadmap-planner","category":"planning","shortcut":"/roadmap"},
    {"id":"sprint-check","label":"Check sprint health","prompt":"Give me a sprint health check — what's on track, what's at risk, and what's blocked?","domain":"sprint-health","category":"monitoring","shortcut":"/sprint"},
    {"id":"prioritize-backlog","label":"Prioritize backlog","prompt":"Score and prioritize our backlog. Rank by value, effort, and strategic alignment","domain":"backlog-prioritizer","category":"planning","shortcut":"/backlog"},
    {"id":"stakeholder-update","label":"Generate stakeholder update","prompt":"Prepare a concise stakeholder update: what we shipped, what's in progress, decisions needed","domain":"stakeholder-alignment","category":"communication","shortcut":"/update"},
    {"id":"release-check","label":"Assess release risk","prompt":"Assess the risk level for the next planned release. Flag any blockers or quality gaps","domain":"release-risk","category":"monitoring","shortcut":"/release"},
    {"id":"feature-impact","label":"Analyze feature impact","prompt":"Analyze the impact of adding the feature I describe — effort, risk, and dependencies","domain":"feature-impact","category":"planning"},
    {"id":"capacity-check","label":"Check team capacity","prompt":"Model our team capacity vs the planned work for the next 1-3 sprints","domain":"capacity-planner","category":"planning"}
  ]$$::jsonb,
  $${"sprint-health":{"fields":[{"name":"overall_status","type":"string","description":"on_track | at_risk | off_track"},{"name":"velocity","type":"number","description":"Story points completed vs planned"},{"name":"blockers","type":"array","description":"Active blockers with owner and severity"},{"name":"risks","type":"array","description":"Sprint risks with probability and impact"}],"example":{"overall_status":"at_risk","velocity":0.72,"blockers":[{"title":"API dependency blocked","severity":"high","owner":"alice"}]}},"backlog-prioritizer":{"fields":[{"name":"prioritized_items","type":"array","description":"Backlog items sorted by composite score"},{"name":"quick_wins","type":"array","description":"High value, low effort items"},{"name":"defer_list","type":"array","description":"Items recommended for deferral"}],"example":{"prioritized_items":[{"title":"SSO integration","score":92,"effort":"M"},{"title":"Bulk export","score":75,"effort":"S"}]}},"roadmap-planner":{"fields":[{"name":"quarters","type":"object","description":"Q1/Q2/Q3 theme and deliverables"},{"name":"capacity_utilization","type":"number","description":"0-100% planned vs available"},{"name":"risks","type":"array","description":"Top roadmap risks"},{"name":"dependencies","type":"array","description":"Cross-team dependencies to resolve"}]}}$$::jsonb,
  ARRAY['jira']::text[],
  ARRAY['github', 'confluence', 'slack']::text[],
  $$[{"step":"connect-jira","title":"Connect Jira","description":"Link Jira to enable sprint and backlog tracking"},{"step":"import-roadmap","title":"Import Current Roadmap","description":"Share your roadmap or epic list for AI analysis"},{"step":"calibrate-velocity","title":"Calibrate Velocity","description":"Set baseline velocity so capacity planning is accurate"},{"step":"first-sprint-check","title":"Run First Sprint Health Check","description":"Get your first AI-generated sprint health report"}]$$::jsonb
)
ON CONFLICT (service_type) DO NOTHING;

COMMENT ON TABLE service_templates IS
  'Pre-built AI service templates deployed to new workspaces. '
  'Each template defines domains (execution surfaces), commands (Copilot shortcuts), '
  'connector requirements, and artifact schemas (output formats).';

COMMENT ON TABLE workspace_service_activations IS
  'Track which services are active in each AI workspace. '
  'Supports per-workspace custom commands and configuration overrides.';
