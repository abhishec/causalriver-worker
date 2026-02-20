/**
 * @nexusbrain/openclaw-plugin — TypeBox Schemas
 *
 * Mechanical translation of the Zod schemas defined in @nexus-ai/mcp-server
 * (packages/mcp-server/src/index.ts) into TypeBox schemas for OpenClaw plugin
 * tool registration.
 *
 * Translation rules:
 *   z.string()                    → Type.String()
 *   z.number()                    → Type.Number()
 *   z.boolean()                   → Type.Boolean()
 *   z.*.optional()                → Type.Optional(...)
 *   z.number().min(a).max(b)      → Type.Number({ minimum: a, maximum: b })
 *   z.enum([...])                 → Type.Union([Type.Literal(...), ...])
 *   z.array(T)                    → Type.Array(T)
 *   z.record(z.unknown())         → Type.Record(Type.String(), Type.Unknown())
 *   z.object({...})               → Type.Object({...})
 *   .describe('...')              → { description: '...' }
 */

import { Type } from '@sinclair/typebox';

// ---------------------------------------------------------------------------
// 1. NexusQuerySchema
// ---------------------------------------------------------------------------

export const NexusQuerySchema = Type.Object({
  question: Type.String({ description: 'The question to ask the brain' }),
  domain: Type.Optional(
    Type.Union([
      Type.Literal('finance'),
      Type.Literal('engineering'),
      Type.Literal('cs'),
      Type.Literal('marketing'),
      Type.Literal('people'),
      Type.Literal('revenue'),
    ], { description: 'Optional domain filter to focus the answer' }),
  ),
});

// ---------------------------------------------------------------------------
// 2. NexusIngestSchema
// ---------------------------------------------------------------------------

export const NexusIngestSchema = Type.Object({
  signals: Type.Array(
    Type.Object({
      source_domain: Type.String({ description: 'Business domain: finance, engineering, cs, marketing, people, or revenue' }),
      signal_type: Type.String({ description: 'Signal name (e.g. mrr, tickets, deploys, csat, churn_rate)' }),
      signal_value: Type.Number({ description: 'Numeric value of the signal' }),
      signal_timestamp: Type.Optional(Type.String({ description: 'ISO timestamp (defaults to now)' })),
      entity_type: Type.Optional(Type.String({ description: 'Entity type (e.g. customer, team, product)' })),
      entity_id: Type.Optional(Type.String({ description: 'Entity identifier' })),
      metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Additional metadata' })),
    }),
    { description: 'Array of signals to ingest' },
  ),
});

// ---------------------------------------------------------------------------
// 3. NexusRelationshipsSchema
// ---------------------------------------------------------------------------

export const NexusRelationshipsSchema = Type.Object({
  limit: Type.Optional(Type.Number({ description: 'Maximum relationships to return (default: 20)' })),
  min_effect_size: Type.Optional(Type.Number({ description: 'Minimum effect size filter (default: 0)' })),
  include_core_knowledge: Type.Optional(Type.Boolean({ description: 'Include universal knowledge from the core brain (default: true)' })),
});

// ---------------------------------------------------------------------------
// 4. NexusWebhookSchema
// ---------------------------------------------------------------------------

export const NexusWebhookSchema = Type.Object({
  source: Type.Union([
    Type.Literal('stripe'),
    Type.Literal('hubspot'),
    Type.Literal('intercom'),
    Type.Literal('zendesk'),
    Type.Literal('support'),
  ], { description: 'Webhook source service' }),
  payload: Type.Record(Type.String(), Type.Unknown(), { description: 'The raw webhook payload body (JSON)' }),
});

// ---------------------------------------------------------------------------
// 5. NexusCronSchema
// ---------------------------------------------------------------------------

export const NexusCronSchema = Type.Object({
  tasks: Type.Optional(
    Type.Array(Type.String(), { description: 'Specific tasks to run. Omit to run all: prediction_verification, threshold_optimization, evidence_decay' }),
  ),
});

// ---------------------------------------------------------------------------
// 6. NexusQueryExpertsSchema
// ---------------------------------------------------------------------------

export const NexusQueryExpertsSchema = Type.Object({
  topic: Type.String({ description: 'Topic, code path, or system (e.g., "authentication", "src/payment-service")' }),
  evidence_types: Type.Optional(
    Type.String({ description: 'Comma-separated filter: code_change,review,discussion,documentation,incident_response' }),
  ),
  limit: Type.Optional(Type.Number({ description: 'Max experts to return (default: 5)' })),
});

// ---------------------------------------------------------------------------
// 7. NexusSearchCodeSchema
// ---------------------------------------------------------------------------

export const NexusSearchCodeSchema = Type.Object({
  query: Type.String({ description: 'Natural language query about code (e.g., "authentication flow", "database migrations")' }),
  language: Type.Optional(Type.String({ description: 'Filter by language: typescript, python, go, etc.' })),
  limit: Type.Optional(Type.Number({ description: 'Max results (default: 10)' })),
});

// ---------------------------------------------------------------------------
// 8. NexusIncidentContextSchema
// ---------------------------------------------------------------------------

export const NexusIncidentContextSchema = Type.Object({
  service: Type.String({ description: 'Affected service or component (e.g., "payment-service", "auth", "api-gateway")' }),
  hours_lookback: Type.Optional(Type.Number({ description: 'Hours to look back for related deployments (default: 12)' })),
});

// ---------------------------------------------------------------------------
// 9. NexusAnalyzePRSchema
// ---------------------------------------------------------------------------

export const NexusAnalyzePRSchema = Type.Object({
  file_paths: Type.String({ description: 'Comma-separated file paths or directories touched by the PR' }),
  pr_title: Type.Optional(Type.String({ description: 'PR title for context' })),
});

// ---------------------------------------------------------------------------
// 10. NexusTeamActivitySchema
// ---------------------------------------------------------------------------

export const NexusTeamActivitySchema = Type.Object({
  days: Type.Optional(Type.Number({ description: 'Number of days to summarize (default: 7)' })),
});

// ---------------------------------------------------------------------------
// 11. NexusSearchCIFailuresSchema
// ---------------------------------------------------------------------------

export const NexusSearchCIFailuresSchema = Type.Object({
  query: Type.String({ description: 'Description of the failure (e.g., "test timeout in payment module")' }),
  provider: Type.Optional(Type.String({ description: 'CI provider filter: github_actions, jenkins, circleci, gitlab_ci' })),
  days_lookback: Type.Optional(Type.Number({ description: 'Days to look back (default: 30)' })),
});

// ---------------------------------------------------------------------------
// 12. NexusCollaborationNetworkSchema
// ---------------------------------------------------------------------------

export const NexusCollaborationNetworkSchema = Type.Object({
  contributor: Type.Optional(Type.String({ description: "Focus on a specific contributor's network" })),
  team: Type.Optional(Type.String({ description: "Focus on a specific team's collaborations" })),
  days: Type.Optional(Type.Number({ description: 'Lookback period in days (default: 30)' })),
});

// ---------------------------------------------------------------------------
// 13. NexusIngestADRSchema
// ---------------------------------------------------------------------------

export const NexusIngestADRSchema = Type.Object({
  title: Type.String({ description: 'ADR title (e.g., "ADR-001: Use PostgreSQL for primary datastore")' }),
  content: Type.String({ description: 'Full ADR content including context, decision, consequences' }),
  status: Type.Optional(
    Type.Union([
      Type.Literal('proposed'),
      Type.Literal('accepted'),
      Type.Literal('deprecated'),
      Type.Literal('superseded'),
    ], { description: 'ADR status (default: accepted)' }),
  ),
  tags: Type.Optional(Type.String({ description: 'Comma-separated tags (e.g., "database,infrastructure")' })),
  author: Type.Optional(Type.String({ description: 'Author of the ADR' })),
  date: Type.Optional(Type.String({ description: 'Date of the decision (ISO format)' })),
});

// ---------------------------------------------------------------------------
// 14. NexusDependencyGraphSchema
// ---------------------------------------------------------------------------

export const NexusDependencyGraphSchema = Type.Object({
  entity_id: Type.String({ description: 'Entity to query (file path, financial term, document ID, etc.)' }),
  direction: Type.Optional(
    Type.Union([
      Type.Literal('upstream'),
      Type.Literal('downstream'),
      Type.Literal('both'),
    ], { description: 'Dependency direction (default: both)' }),
  ),
  domain: Type.Optional(Type.String({ description: 'Filter by knowledge domain (code, finance, research, documentation, legal, process)' })),
  transitive: Type.Optional(Type.Boolean({ description: 'Include transitive (indirect) dependencies (default: false)' })),
  max_depth: Type.Optional(Type.Number({ description: 'Max depth for transitive queries (default: 5)' })),
  limit: Type.Optional(Type.Number({ description: 'Max results to return (default: 20)' })),
});

// ---------------------------------------------------------------------------
// 15. NexusImpactAnalysisSchema
// ---------------------------------------------------------------------------

export const NexusImpactAnalysisSchema = Type.Object({
  entity_id: Type.String({ description: 'Entity to analyze (e.g., "src/auth/session.ts", "MRR", "paper_attention")' }),
  domain: Type.Optional(Type.String({ description: 'Filter analysis to a specific knowledge domain' })),
});

// ---------------------------------------------------------------------------
// 16. NexusDevReadTicketSchema
// ---------------------------------------------------------------------------

export const NexusDevReadTicketSchema = Type.Object({
  jira_key: Type.String({ description: 'Jira issue key (e.g. FIN-9800, ENG-1234)' }),
});

// ---------------------------------------------------------------------------
// 17. NexusDevGetContextSchema
// ---------------------------------------------------------------------------

export const NexusDevGetContextSchema = Type.Object({
  jira_key: Type.String({ description: 'Jira issue key' }),
  components: Type.Optional(Type.String({ description: 'Comma-separated component/area names for more targeted brain context' })),
});

// ---------------------------------------------------------------------------
// 18. NexusDevSubmitAnalysisSchema
// ---------------------------------------------------------------------------

export const NexusDevSubmitAnalysisSchema = Type.Object({
  jira_key: Type.String({ description: 'Jira issue key that was analyzed' }),
  analysis_brief: Type.String({ description: 'Markdown analysis with ## Issue Summary, ## Root Cause, ## Recommended Fix sections' }),
  root_cause: Type.Object({
    file: Type.Optional(Type.String({ description: 'File path of the root cause' })),
    function: Type.Optional(Type.String({ description: 'Function or method name' })),
    line: Type.Optional(Type.Number({ description: 'Line number' })),
    description: Type.String({ description: 'Root cause description' }),
  }, { description: 'Root cause location and description' }),
  key_files: Type.Array(
    Type.Object({
      path: Type.String({ description: 'File path' }),
      lines: Type.Optional(Type.String({ description: 'Relevant line range (e.g. "42-58")' })),
      reason: Type.String({ description: 'Why this file is relevant' }),
    }),
    { description: 'Key files examined during analysis' },
  ),
  confidence: Type.Number({ minimum: 0, maximum: 1, description: 'Confidence score (0.0\u20131.0)' }),
  suggested_fix: Type.Optional(Type.String({ description: 'One-liner fix suggestion' })),
  post_to_jira: Type.Optional(Type.Boolean({ description: 'Post analysis as Jira comment (default: true)' })),
});

// ---------------------------------------------------------------------------
// 19. NexusDevListRunsSchema
// ---------------------------------------------------------------------------

export const NexusDevListRunsSchema = Type.Object({
  jira_key: Type.Optional(Type.String({ description: 'Filter by specific Jira key' })),
  limit: Type.Optional(Type.Number({ description: 'Max results (default: 10)' })),
  status: Type.Optional(Type.String({ description: 'Filter by status: completed, failed, verified' })),
});

// ---------------------------------------------------------------------------
// 20. NexusVerifyPredictionSchema
// ---------------------------------------------------------------------------

export const NexusVerifyPredictionSchema = Type.Object({
  prediction_id: Type.String({ description: 'ID of the prediction to verify' }),
  actual_value: Type.Number({ description: 'The actual observed value' }),
  actual_direction: Type.Union([
    Type.Literal('increase'),
    Type.Literal('decrease'),
    Type.Literal('stable'),
  ], { description: 'The actual observed direction of change' }),
});

// ---------------------------------------------------------------------------
// 21. NexusConsolidationStatusSchema
// ---------------------------------------------------------------------------

export const NexusConsolidationStatusSchema = Type.Object({
  run_id: Type.Optional(Type.String({ description: 'Specific consolidation run ID to check (omit for latest)' })),
});
