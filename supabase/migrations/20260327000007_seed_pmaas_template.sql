-- Seed PM-aaS service template.
-- The original migration (20260327000006) was applied before this template was added
-- to the seed block. This migration adds the missing pm-aas row.

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
