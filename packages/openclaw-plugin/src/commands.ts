/**
 * @nexusbrain/openclaw-plugin -- Command Registration
 *
 * Registers 8 auto-reply commands that bypass the LLM for quick actions.
 * These are slash-style commands users can invoke directly in OpenClaw
 * for fast, deterministic responses without an LLM round-trip.
 *
 * Commands:
 *   /brain <question>       -- Quick brain query
 *   /causal                 -- Show causal graph summary
 *   /ingest <json>          -- Quick signal ingestion
 *   /experts <topic>        -- Find who knows about a topic
 *   /incident <service>     -- Get incident context
 *   /impact <entity_id>     -- Quick impact analysis
 *   /brain-status           -- Health check
 *   /brain-help             -- Show all commands and tools
 */

import {
  handleQuery,
  handleRelationships,
  handleIngest,
  handleQueryExperts,
  handleIncidentContext,
  handleImpactAnalysis,
} from '@nexus-ai/mcp-server/handlers';

import type { PluginConfig } from './config.js';

// ---------------------------------------------------------------------------
// Minimal OpenClaw API type (provided by the host)
// ---------------------------------------------------------------------------

interface CommandContext {
  args?: string;
}

interface CommandResult {
  text: string;
}

interface OpenClawApi {
  registerCommand(def: {
    name: string;
    description: string;
    acceptsArgs: boolean;
    requireAuth: boolean;
    handler: (ctx: CommandContext) => Promise<CommandResult>;
  }): void;
  log?(level: string, message: string): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the text payload from an McpTextResult. */
function extractText(result: {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}): string {
  const text = result.content?.[0]?.text ?? '';
  if (result.isError) {
    return `Error: ${text}`;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCommands(api: OpenClawApi, config: PluginConfig): void {
  const { client, supabase } = config;

  // ── 1. /brain ──────────────────────────────────────────────────────────

  api.registerCommand({
    name: 'brain',
    description: 'Quick brain query. Usage: /brain <your question>',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const question = ctx.args?.trim();
      if (!question) {
        return { text: 'Usage: `/brain <your question>`\n\nExample: `/brain What caused the spike in churn last week?`' };
      }

      try {
        const result = await handleQuery(client, { question });
        return { text: extractText(result) };
      } catch (err) {
        return { text: `Brain query failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });

  // ── 2. /causal ─────────────────────────────────────────────────────────

  api.registerCommand({
    name: 'causal',
    description: 'Show causal graph summary (top 20 relationships).',
    acceptsArgs: false,
    requireAuth: true,
    handler: async () => {
      try {
        const result = await handleRelationships(client, { limit: 20 });
        return { text: extractText(result) };
      } catch (err) {
        return { text: `Failed to fetch causal graph: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });

  // ── 3. /ingest ─────────────────────────────────────────────────────────

  api.registerCommand({
    name: 'ingest',
    description: 'Quick signal ingestion. Usage: /ingest <signals JSON>',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const raw = ctx.args?.trim();
      if (!raw) {
        return {
          text:
            'Usage: `/ingest <signals JSON>`\n\n' +
            'Example:\n```json\n' +
            '{"signals":[{"source_domain":"finance","signal_type":"mrr","signal_value":42000}]}\n' +
            '```',
        };
      }

      let parsed: { signals: unknown[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return {
          text:
            'Invalid JSON. Expected format:\n```json\n' +
            '{"signals":[{"source_domain":"finance","signal_type":"mrr","signal_value":42000}]}\n' +
            '```',
        };
      }

      if (!parsed.signals || !Array.isArray(parsed.signals)) {
        return {
          text: 'JSON must contain a `signals` array. Example:\n```json\n{"signals":[{"source_domain":"finance","signal_type":"mrr","signal_value":42000}]}\n```',
        };
      }

      try {
        const result = await handleIngest(client, { signals: parsed.signals as any });
        return { text: extractText(result) };
      } catch (err) {
        return { text: `Ingestion failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });

  // ── 4. /experts ────────────────────────────────────────────────────────

  api.registerCommand({
    name: 'experts',
    description: 'Find who knows about a topic. Usage: /experts <topic>',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const topic = ctx.args?.trim();
      if (!topic) {
        return { text: 'Usage: `/experts <topic>`\n\nExample: `/experts authentication`' };
      }

      try {
        const result = await handleQueryExperts(client, { topic });
        return { text: extractText(result) };
      } catch (err) {
        return { text: `Expert search failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });

  // ── 5. /incident ───────────────────────────────────────────────────────

  api.registerCommand({
    name: 'incident',
    description: 'Get incident context. Usage: /incident <service name>',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const service = ctx.args?.trim();
      if (!service) {
        return { text: 'Usage: `/incident <service name>`\n\nExample: `/incident payment-service`' };
      }

      try {
        const result = await handleIncidentContext(client, { service });
        return { text: extractText(result) };
      } catch (err) {
        return { text: `Incident context failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });

  // ── 6. /impact ─────────────────────────────────────────────────────────

  api.registerCommand({
    name: 'impact',
    description: 'Quick impact analysis. Usage: /impact <entity ID>',
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const entityId = ctx.args?.trim();
      if (!entityId) {
        return { text: 'Usage: `/impact <entity ID>`\n\nExample: `/impact src/auth/session.ts`' };
      }

      try {
        const result = await handleImpactAnalysis(client, { entity_id: entityId });
        return { text: extractText(result) };
      } catch (err) {
        return { text: `Impact analysis failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });

  // ── 7. /brain-status ───────────────────────────────────────────────────

  api.registerCommand({
    name: 'brain-status',
    description: 'NexusBrain health check.',
    acceptsArgs: false,
    requireAuth: true,
    handler: async () => {
      const start = Date.now();
      try {
        const result = await client.getRelationships({ limit: 1 });
        const latencyMs = Date.now() - start;

        const lines: string[] = [];
        lines.push('## NexusBrain Status');
        lines.push('');
        lines.push(`- **Status**: Online`);
        lines.push(`- **Latency**: ${latencyMs}ms`);
        lines.push(`- **Organization**: ${client.organizationId}`);
        lines.push(`- **Endpoint**: ${supabase.supabaseUrl}`);
        lines.push(`- **Causal edges**: ${result.count ?? result.relationships.length}`);
        lines.push(`- **Jira configured**: ${config.hasJira ? 'Yes' : 'No'}`);

        return { text: lines.join('\n') };
      } catch (err) {
        const latencyMs = Date.now() - start;
        return {
          text:
            `## NexusBrain Status\n\n` +
            `- **Status**: Error\n` +
            `- **Latency**: ${latencyMs}ms\n` +
            `- **Error**: ${err instanceof Error ? err.message : String(err)}\n` +
            `- **Organization**: ${client.organizationId}\n` +
            `- **Endpoint**: ${supabase.supabaseUrl}\n` +
            `- **Jira configured**: ${config.hasJira ? 'Yes' : 'No'}`,
        };
      }
    },
  });

  // ── 8. /brain-help ─────────────────────────────────────────────────────

  api.registerCommand({
    name: 'brain-help',
    description: 'Show all NexusBrain commands and tools.',
    acceptsArgs: false,
    requireAuth: false,
    handler: async () => {
      const text = [
        '## NexusBrain -- Commands & Tools',
        '',
        '### Quick Commands (auto-reply, no LLM)',
        '',
        '| Command | Description |',
        '|---------|-------------|',
        '| `/brain <question>` | Ask the brain a question |',
        '| `/causal` | Show top 20 causal relationships |',
        '| `/ingest <json>` | Ingest signals (JSON with `signals` array) |',
        '| `/experts <topic>` | Find who knows about a topic |',
        '| `/incident <service>` | Get incident context for a service |',
        '| `/impact <entity>` | Analyze blast radius of an entity |',
        '| `/brain-status` | Health check and connection info |',
        '| `/brain-help` | This help message |',
        '',
        '### Agent Tools (used by the LLM)',
        '',
        '| Tool | Description |',
        '|------|-------------|',
        '| `nexus_query` | Natural language brain query |',
        '| `nexus_ingest` | Send business signals for causal analysis |',
        '| `nexus_relationships` | Get discovered causal edges |',
        '| `nexus_webhook` | Forward external webhook payloads |',
        '| `nexus_cron` | Trigger maintenance tasks |',
        '| `nexus_query_experts` | Find expertise on a topic |',
        '| `nexus_search_code` | Semantic code search |',
        '| `nexus_incident_context` | Full incident context |',
        '| `nexus_analyze_pr` | PR risk analysis |',
        '| `nexus_team_activity` | Team activity summary |',
        '| `nexus_search_ci_failures` | Search past CI failures |',
        '| `nexus_collaboration_network` | Cross-team patterns |',
        '| `nexus_ingest_adr` | Index architecture decisions |',
        '| `nexus_dependency_graph` | Query dependency graph |',
        '| `nexus_impact_analysis` | Blast radius analysis |',
        '| `nexus_dev_read_ticket` | Fetch Jira ticket details |',
        '| `nexus_dev_get_context` | Brain context for a ticket |',
        '| `nexus_dev_submit_analysis` | Record root cause analysis |',
        '| `nexus_dev_list_runs` | List past Jarvis runs |',
        '| `nexus_verify_prediction` | Verify prediction outcome |',
        '| `nexus_consolidation_status` | Brain consolidation report |',
      ].join('\n');

      return { text };
    },
  });

  api.log?.('info', 'NexusBrain: registered 8 commands');
}
