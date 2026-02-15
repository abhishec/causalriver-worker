/**
 * @nexus-ai/mcp-server — MCP server for NexusBrain
 *
 * Exposes NexusBrain causal intelligence to Claude Desktop and Claude Code
 * via the Model Context Protocol. Wraps @nexus-ai/client — no HTTP logic
 * is duplicated here.
 *
 * Usage:
 *   npx @nexus-ai/mcp-server
 *
 * Required env vars:
 *   NEXUS_SUPABASE_URL   — Supabase project URL
 *   NEXUS_SUPABASE_KEY   — Supabase anon key
 *   NEXUS_ORG_ID         — Organization ID
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createNexusClient, type NexusClient } from '@nexus-ai/client';

import {
  handleQuery,
  handleIngest,
  handleRelationships,
  handleWebhook,
  handleCron,
  handleRelationshipsResource,
  buildAnalyzeMetricsPrompt,
  handleQueryExperts,
  handleSearchCode,
  handleIncidentContext,
  handleAnalyzePR,
  handleTeamActivity,
  handleSearchCIFailures,
  handleCollaborationNetwork,
  handleIngestADR,
  handleDependencyGraph,
  handleImpactAnalysis,
} from './handlers.js';

import {
  handleJarvisReadTicket,
  handleJarvisGetContext,
  handleJarvisSubmitAnalysis,
  handleJarvisListRuns,
  buildJarvisAnalyzePrompt,
  type SupabaseConfig,
} from './jarvis-handlers.js';

import { getJiraConfig } from './jira-client.js';

// ============================================================================
// CONFIG
// ============================================================================

function getConfig(): { supabaseUrl: string; supabaseKey: string; orgId: string } {
  const supabaseUrl = process.env.NEXUS_SUPABASE_URL;
  const supabaseKey = process.env.NEXUS_SUPABASE_KEY;
  const orgId = process.env.NEXUS_ORG_ID;

  if (!supabaseUrl || !supabaseKey || !orgId) {
    console.error(
      'Missing required environment variables:\n' +
      '  NEXUS_SUPABASE_URL  \u2014 Supabase project URL\n' +
      '  NEXUS_SUPABASE_KEY  \u2014 Supabase anon key\n' +
      '  NEXUS_ORG_ID        \u2014 Organization ID\n' +
      '\nSee https://github.com/abhishec/nexus-intelligence#mcp-server for setup.',
    );
    process.exit(1);
  }

  return { supabaseUrl, supabaseKey, orgId };
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const config = getConfig();

  const client: NexusClient = createNexusClient({
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseKey,
    organizationId: config.orgId,
  });

  const server = new McpServer({
    name: 'nexusbrain',
    version: '0.1.0',
  });

  // ── TOOL: nexus_query ──────────────────────────────────────────────────

  server.tool(
    'nexus_query',
    'Ask NexusBrain a natural language question. Returns an AI-powered answer enriched with discovered causal relationships, learned patterns, and organizational memory. Knowledge federation merges org-specific + universal core brain intelligence.',
    {
      question: z.string().describe('The question to ask the brain'),
      domain: z.enum(['finance', 'engineering', 'cs', 'marketing', 'people', 'revenue'])
        .optional()
        .describe('Optional domain filter to focus the answer'),
    },
    async ({ question, domain }) => handleQuery(client, { question, domain }),
  );

  // ── TOOL: nexus_ingest ─────────────────────────────────────────────────

  server.tool(
    'nexus_ingest',
    'Send business signals to NexusBrain for causal analysis. Signals are cross-domain data points (revenue, support tickets, deployments, CSAT scores, etc.) that the brain analyzes to discover causal relationships between domains.',
    {
      signals: z.array(z.object({
        source_domain: z.string().describe('Business domain: finance, engineering, cs, marketing, people, or revenue'),
        signal_type: z.string().describe('Signal name (e.g. mrr, tickets, deploys, csat, churn_rate)'),
        signal_value: z.number().describe('Numeric value of the signal'),
        signal_timestamp: z.string().optional().describe('ISO timestamp (defaults to now)'),
        entity_type: z.string().optional().describe('Entity type (e.g. customer, team, product)'),
        entity_id: z.string().optional().describe('Entity identifier'),
        metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
      })).describe('Array of signals to ingest'),
    },
    async ({ signals }) => handleIngest(client, { signals }),
  );

  // ── TOOL: nexus_relationships ──────────────────────────────────────────

  server.tool(
    'nexus_relationships',
    'Retrieve discovered causal relationships between business domains. Returns statistically significant causal edges with effect sizes, p-values, and lag information. Includes universal knowledge from the core brain by default (knowledge federation).',
    {
      limit: z.number().optional().describe('Maximum relationships to return (default: 20)'),
      min_effect_size: z.number().optional().describe('Minimum effect size filter (default: 0)'),
      include_core_knowledge: z.boolean().optional().describe('Include universal knowledge from the core brain (default: true)'),
    },
    async (args) => handleRelationships(client, args),
  );

  // ── TOOL: nexus_webhook ────────────────────────────────────────────────

  server.tool(
    'nexus_webhook',
    'Forward a webhook payload from an external service to NexusBrain. The brain auto-transforms vendor-specific payloads into normalized business signals for causal analysis.',
    {
      source: z.enum(['stripe', 'hubspot', 'intercom', 'zendesk', 'support'])
        .describe('Webhook source service'),
      payload: z.record(z.unknown())
        .describe('The raw webhook payload body (JSON)'),
    },
    async ({ source, payload }) => handleWebhook(client, { source, payload }),
  );

  // ── TOOL: nexus_cron ───────────────────────────────────────────────────

  server.tool(
    'nexus_cron',
    'Trigger NexusBrain maintenance tasks: prediction_verification (check past predictions), threshold_optimization (tune signal thresholds), evidence_decay (age out stale relationships). Causal discovery itself runs via the autonomous trainer.',
    {
      tasks: z.array(z.string()).optional()
        .describe('Specific tasks to run. Omit to run all: prediction_verification, threshold_optimization, evidence_decay'),
    },
    async ({ tasks }) => handleCron(client, { tasks }),
  );

  // ── ENGINEERING TOOLS ──────────────────────────────────────────────────
  // These tools power the 6 Developer Use Cases (Yuan's requirements):
  //   UC1: Onboarding Memory   UC2: Debugging Assistant
  //   UC3: Incident Response   UC4: Knowledge Retention
  //   UC5: Code Review Intel   UC6: Cross-Team Visibility

  server.tool(
    'nexus_query_experts',
    'Find who has expertise on a specific topic, code area, or system. Returns ranked contributors by evidence strength. Use when someone asks "who knows about X?" or "who should review this?" (UC1/UC3/UC5)',
    {
      topic: z.string().describe('Topic, code path, or system (e.g., "authentication", "src/payment-service")'),
      evidence_types: z.string().optional()
        .describe('Comma-separated filter: code_change,review,discussion,documentation,incident_response'),
      limit: z.number().optional().describe('Max experts to return (default: 5)'),
    },
    async (args) => handleQueryExperts(client, args),
  );

  server.tool(
    'nexus_search_code',
    'Semantic search across indexed code symbols, files, and documentation. Returns relevant code files, functions, and descriptions. Use for onboarding "how does auth work?" or debugging "where is payment processing handled?" (UC1/UC2)',
    {
      query: z.string().describe('Natural language query about code (e.g., "authentication flow", "database migrations")'),
      language: z.string().optional().describe('Filter by language: typescript, python, go, etc.'),
      limit: z.number().optional().describe('Max results (default: 10)'),
    },
    async (args) => handleSearchCode(client, args),
  );

  server.tool(
    'nexus_incident_context',
    'Get full incident context: recent deployments that may have caused it, relevant runbooks, on-call experts, and causal chains. Use when an incident fires or for production issue analysis. (UC3)',
    {
      service: z.string().describe('Affected service or component (e.g., "payment-service", "auth", "api-gateway")'),
      hours_lookback: z.number().optional().describe('Hours to look back for related deployments (default: 12)'),
    },
    async (args) => handleIncidentContext(client, args),
  );

  server.tool(
    'nexus_analyze_pr',
    'Analyze a PR for risk: find past incidents in touched file paths, suggest reviewers, and flag causal patterns. Use for code review intelligence. (UC5)',
    {
      file_paths: z.string().describe('Comma-separated file paths or directories touched by the PR'),
      pr_title: z.string().optional().describe('PR title for context'),
    },
    async (args) => handleAnalyzePR(client, args),
  );

  server.tool(
    'nexus_team_activity',
    'Get engineering team activity summary: recent signals, top topics, sentiment trends, active contributors, and cross-team collaboration. Use when PMs or leaders ask "what is engineering working on?" (UC6)',
    {
      days: z.number().optional().describe('Number of days to summarize (default: 7)'),
    },
    async (args) => handleTeamActivity(client, args),
  );

  server.tool(
    'nexus_search_ci_failures',
    'Search for past CI/CD failures similar to a current one. Returns matching failures with resolution PRs, causal analysis, and timeline. Use for debugging CI issues. (UC2)',
    {
      query: z.string().describe('Description of the failure (e.g., "test timeout in payment module")'),
      provider: z.string().optional().describe('CI provider filter: github_actions, jenkins, circleci, gitlab_ci'),
      days_lookback: z.number().optional().describe('Days to look back (default: 30)'),
    },
    async (args) => handleSearchCIFailures(client, args),
  );

  // ── TOOL: nexus_collaboration_network ──────────────────────────────────

  server.tool(
    'nexus_collaboration_network',
    'Get cross-team collaboration patterns: who works with whom, bridge contributors connecting teams, and interaction frequency. Powers UC6 (Cross-Team Visibility).',
    {
      contributor: z.string().optional().describe('Focus on a specific contributor\'s network'),
      team: z.string().optional().describe('Focus on a specific team\'s collaborations'),
      days: z.number().optional().describe('Lookback period in days (default: 30)'),
    },
    async (args) => handleCollaborationNetwork(client, args),
  );

  // ── TOOL: nexus_ingest_adr ──────────────────────────────────────────────

  server.tool(
    'nexus_ingest_adr',
    'Index an Architectural Decision Record (ADR) into brain memory. ADRs capture "why" decisions were made — the most valuable knowledge for onboarding and future decisions. Powers UC4 (Knowledge Retention).',
    {
      title: z.string().describe('ADR title (e.g., "ADR-001: Use PostgreSQL for primary datastore")'),
      content: z.string().describe('Full ADR content including context, decision, consequences'),
      status: z.enum(['proposed', 'accepted', 'deprecated', 'superseded']).optional().describe('ADR status (default: accepted)'),
      tags: z.string().optional().describe('Comma-separated tags (e.g., "database,infrastructure")'),
      author: z.string().optional().describe('Author of the ADR'),
      date: z.string().optional().describe('Date of the decision (ISO format)'),
    },
    async (args) => handleIngestADR(client, args),
  );

  // ── TOOL: nexus_dependency_graph ──────────────────────────────────────

  server.tool(
    'nexus_dependency_graph',
    'Query the knowledge dependency graph for any entity — code files, financial line items, documents, or business processes. Returns upstream/downstream dependencies with filtering by domain and type.',
    {
      entity_id: z.string().describe('Entity to query (file path, financial term, document ID, etc.)'),
      direction: z.enum(['upstream', 'downstream', 'both']).optional().describe('Dependency direction (default: both)'),
      domain: z.string().optional().describe('Filter by knowledge domain (code, finance, research, documentation, legal, process)'),
      transitive: z.boolean().optional().describe('Include transitive (indirect) dependencies (default: false)'),
      max_depth: z.number().optional().describe('Max depth for transitive queries (default: 5)'),
      limit: z.number().optional().describe('Max results to return (default: 20)'),
    },
    async (args) => handleDependencyGraph(client, args),
  );

  // ── TOOL: nexus_impact_analysis ─────────────────────────────────────

  server.tool(
    'nexus_impact_analysis',
    'Analyze the blast radius of changes to any entity. Returns impact radius, risk score (0-1), affected business domains, critical dependency paths, and complexity metrics.',
    {
      entity_id: z.string().describe('Entity to analyze (e.g., "src/auth/session.ts", "MRR", "paper_attention")'),
      domain: z.string().optional().describe('Filter analysis to a specific knowledge domain'),
    },
    async (args) => handleImpactAnalysis(client, args),
  );

  // ── DEVELOPER JARVIS TOOLS ───────────────────────────────────────────
  // Brain-powered root cause analysis via Jira + codebase exploration.
  // Requires: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN (optional — tools
  // degrade gracefully if not set).

  const supabaseConfig: SupabaseConfig = {
    supabaseUrl: config.supabaseUrl,
    supabaseKey: config.supabaseKey,
    orgId: config.orgId,
  };

  const jiraConfig = getJiraConfig();
  if (!jiraConfig) {
    console.error(
      'Jira credentials not found (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN). ' +
      'Jarvis tools will prompt for configuration when called. Other tools work normally.',
    );
  }

  server.tool(
    'nexus_dev_read_ticket',
    'Fetch a Jira ticket\'s full details — summary, description, status, assignee, components, recent comments, linked issues. Use this to understand a bug report before codebase exploration.',
    {
      jira_key: z.string().describe('Jira issue key (e.g. FIN-9800, ENG-1234)'),
    },
    async (args) => handleJarvisReadTicket(args),
  );

  server.tool(
    'nexus_dev_get_context',
    'Get brain-augmented context for a Jira ticket — past analyses for the same project, causal patterns, organizational memory. Call this before starting your root cause analysis.',
    {
      jira_key: z.string().describe('Jira issue key'),
      components: z.string().optional().describe('Comma-separated component/area names for more targeted brain context'),
    },
    async (args) => handleJarvisGetContext(client, supabaseConfig, args),
  );

  server.tool(
    'nexus_dev_submit_analysis',
    'Record a completed root cause analysis. Saves to the brain database, posts a formatted comment to Jira, and emits a brain signal for learning. Call this after you\'ve finished investigating.',
    {
      jira_key: z.string().describe('Jira issue key that was analyzed'),
      analysis_brief: z.string().describe('Markdown analysis with ## Issue Summary, ## Root Cause, ## Recommended Fix sections'),
      root_cause: z.object({
        file: z.string().optional().describe('File path of the root cause'),
        function: z.string().optional().describe('Function or method name'),
        line: z.number().optional().describe('Line number'),
        description: z.string().describe('Root cause description'),
      }).describe('Root cause location and description'),
      key_files: z.array(z.object({
        path: z.string().describe('File path'),
        lines: z.string().optional().describe('Relevant line range (e.g. "42-58")'),
        reason: z.string().describe('Why this file is relevant'),
      })).describe('Key files examined during analysis'),
      confidence: z.number().min(0).max(1).describe('Confidence score (0.0–1.0)'),
      suggested_fix: z.string().optional().describe('One-liner fix suggestion'),
      post_to_jira: z.boolean().optional().describe('Post analysis as Jira comment (default: true)'),
    },
    async (args) => handleJarvisSubmitAnalysis(client, supabaseConfig, args),
  );

  server.tool(
    'nexus_dev_list_runs',
    'List past Developer Jarvis analysis runs. Filter by Jira key or status. Shows confidence scores, root cause files, and timestamps.',
    {
      jira_key: z.string().optional().describe('Filter by specific Jira key'),
      limit: z.number().optional().describe('Max results (default: 10)'),
      status: z.string().optional().describe('Filter by status: completed, failed, verified'),
    },
    async (args) => handleJarvisListRuns(supabaseConfig, args),
  );

  // ── PROMPT: nexus-dev-analyze ──────────────────────────────────────────

  server.prompt(
    'nexus-dev-analyze',
    'Analyze a Jira ticket for root cause. Pre-fetches ticket details and brain context, then provides a structured analysis prompt. Use this to start a Developer Jarvis investigation session.',
    {
      jira_key: z.string().describe('Jira issue key to analyze (e.g. FIN-9800)'),
    },
    async ({ jira_key }) => buildJarvisAnalyzePrompt(client, supabaseConfig, { jira_key }),
  );

  // ── RESOURCE: nexusbrain://relationships ───────────────────────────────

  server.resource(
    'relationships',
    'nexusbrain://relationships',
    {
      description: 'Live causal relationship graph for this organization, federated with the core brain universal knowledge base. Returns JSON with cause, effect, effectSize, pValue, lagDays for each discovered edge.',
      mimeType: 'application/json',
    },
    async () => handleRelationshipsResource(client),
  );

  // ── PROMPT: analyze-metrics ────────────────────────────────────────────

  server.prompt(
    'analyze-metrics',
    'Analyze business metrics using NexusBrain causal intelligence. Pre-fetches the live causal graph and generates a structured analysis prompt covering key chains, risks, opportunities, and data gaps.',
    {
      domain: z.string().optional().describe('Focus domain (finance, engineering, cs, marketing, people, revenue)'),
      question: z.string().optional().describe('Specific question to investigate'),
    },
    async ({ domain, question }) => buildAnalyzeMetricsPrompt(client, { domain, question }),
  );

  // ── START SERVER ───────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('NexusBrain MCP server started (stdio transport)');
}

main().catch((err) => {
  console.error('Fatal error starting NexusBrain MCP server:', err);
  process.exit(1);
});
