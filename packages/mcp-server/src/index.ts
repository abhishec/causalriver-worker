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
} from './handlers.js';

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
