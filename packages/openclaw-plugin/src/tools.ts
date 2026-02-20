/**
 * @nexusbrain/openclaw-plugin -- Tool Registration
 *
 * Registers all 21 NexusBrain agent tools with the OpenClaw API:
 *   - 15 core brain tools (query, ingest, relationships, webhook, cron,
 *     query_experts, search_code, incident_context, analyze_pr,
 *     team_activity, search_ci_failures, collaboration_network,
 *     ingest_adr, dependency_graph, impact_analysis)
 *   - 4 Developer Jarvis tools (read_ticket, get_context, submit_analysis, list_runs)
 *   - 2 reinforcement tools (verify_prediction, consolidation_status)
 *
 * Handler functions are imported from @nexus-ai/mcp-server; schemas are
 * TypeBox translations defined in ./schemas.ts.
 */

import {
  handleQuery,
  handleIngest,
  handleRelationships,
  handleWebhook,
  handleCron,
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
  handleError,
} from '@nexus-ai/mcp-server/handlers';

import {
  handleJarvisReadTicket,
  handleJarvisGetContext,
  handleJarvisSubmitAnalysis,
  handleJarvisListRuns,
} from '@nexus-ai/mcp-server/jarvis-handlers';

import {
  NexusQuerySchema,
  NexusIngestSchema,
  NexusRelationshipsSchema,
  NexusWebhookSchema,
  NexusCronSchema,
  NexusQueryExpertsSchema,
  NexusSearchCodeSchema,
  NexusIncidentContextSchema,
  NexusAnalyzePRSchema,
  NexusTeamActivitySchema,
  NexusSearchCIFailuresSchema,
  NexusCollaborationNetworkSchema,
  NexusIngestADRSchema,
  NexusDependencyGraphSchema,
  NexusImpactAnalysisSchema,
  NexusDevReadTicketSchema,
  NexusDevGetContextSchema,
  NexusDevSubmitAnalysisSchema,
  NexusDevListRunsSchema,
  NexusVerifyPredictionSchema,
  NexusConsolidationStatusSchema,
} from './schemas.js';

import type { PluginConfig } from './config.js';

// ---------------------------------------------------------------------------
// Minimal OpenClaw API type (provided by the host)
// ---------------------------------------------------------------------------

interface OpenClawApi {
  registerTool(
    name: string,
    def: {
      description: string;
      parameters: unknown;
      execute: (input: any) => Promise<unknown>;
    },
  ): void;
  log?(level: string, message: string): void;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerTools(api: OpenClawApi, config: PluginConfig): void {
  const { client, supabase } = config;

  // ── 1. nexus_query ─────────────────────────────────────────────────────

  api.registerTool('nexus_query', {
    description:
      'Ask NexusBrain a natural language question. Returns AI-powered answer enriched with discovered causal relationships, learned patterns, and organizational memory.',
    parameters: NexusQuerySchema,
    execute: async (input) => {
      const result = await handleQuery(client, input);
      return result;
    },
  });

  // ── 2. nexus_ingest ────────────────────────────────────────────────────

  api.registerTool('nexus_ingest', {
    description:
      'Send business signals to NexusBrain for causal analysis. Signals are cross-domain data points that the brain analyzes to discover causal relationships.',
    parameters: NexusIngestSchema,
    execute: async (input) => {
      const result = await handleIngest(client, input);
      return result;
    },
  });

  // ── 3. nexus_relationships ─────────────────────────────────────────────

  api.registerTool('nexus_relationships', {
    description:
      'Retrieve discovered causal relationships between business domains. Returns statistically significant causal edges.',
    parameters: NexusRelationshipsSchema,
    execute: async (input) => {
      const result = await handleRelationships(client, input);
      return result;
    },
  });

  // ── 4. nexus_webhook ───────────────────────────────────────────────────

  api.registerTool('nexus_webhook', {
    description:
      'Forward a webhook payload from an external service to NexusBrain.',
    parameters: NexusWebhookSchema,
    execute: async (input) => {
      const result = await handleWebhook(client, input);
      return result;
    },
  });

  // ── 5. nexus_cron ──────────────────────────────────────────────────────

  api.registerTool('nexus_cron', {
    description: 'Trigger NexusBrain maintenance tasks.',
    parameters: NexusCronSchema,
    execute: async (input) => {
      const result = await handleCron(client, input);
      return result;
    },
  });

  // ── 6. nexus_query_experts ─────────────────────────────────────────────

  api.registerTool('nexus_query_experts', {
    description:
      'Find who has expertise on a specific topic, code area, or system.',
    parameters: NexusQueryExpertsSchema,
    execute: async (input) => {
      const result = await handleQueryExperts(client, input);
      return result;
    },
  });

  // ── 7. nexus_search_code ───────────────────────────────────────────────

  api.registerTool('nexus_search_code', {
    description:
      'Semantic search across indexed code symbols, files, and documentation.',
    parameters: NexusSearchCodeSchema,
    execute: async (input) => {
      const result = await handleSearchCode(client, input);
      return result;
    },
  });

  // ── 8. nexus_incident_context ──────────────────────────────────────────

  api.registerTool('nexus_incident_context', {
    description:
      'Get full incident context: recent deployments, runbooks, on-call experts, causal chains.',
    parameters: NexusIncidentContextSchema,
    execute: async (input) => {
      const result = await handleIncidentContext(client, input);
      return result;
    },
  });

  // ── 9. nexus_analyze_pr ────────────────────────────────────────────────

  api.registerTool('nexus_analyze_pr', {
    description:
      'Analyze a PR for risk: find past incidents, suggest reviewers, flag causal patterns.',
    parameters: NexusAnalyzePRSchema,
    execute: async (input) => {
      const result = await handleAnalyzePR(client, input);
      return result;
    },
  });

  // ── 10. nexus_team_activity ────────────────────────────────────────────

  api.registerTool('nexus_team_activity', {
    description: 'Get engineering team activity summary.',
    parameters: NexusTeamActivitySchema,
    execute: async (input) => {
      const result = await handleTeamActivity(client, input);
      return result;
    },
  });

  // ── 11. nexus_search_ci_failures ───────────────────────────────────────

  api.registerTool('nexus_search_ci_failures', {
    description:
      'Search for past CI/CD failures similar to a current one.',
    parameters: NexusSearchCIFailuresSchema,
    execute: async (input) => {
      const result = await handleSearchCIFailures(client, input);
      return result;
    },
  });

  // ── 12. nexus_collaboration_network ────────────────────────────────────

  api.registerTool('nexus_collaboration_network', {
    description: 'Get cross-team collaboration patterns.',
    parameters: NexusCollaborationNetworkSchema,
    execute: async (input) => {
      const result = await handleCollaborationNetwork(client, input);
      return result;
    },
  });

  // ── 13. nexus_ingest_adr ───────────────────────────────────────────────

  api.registerTool('nexus_ingest_adr', {
    description:
      'Index an Architectural Decision Record into brain memory.',
    parameters: NexusIngestADRSchema,
    execute: async (input) => {
      const result = await handleIngestADR(client, input);
      return result;
    },
  });

  // ── 14. nexus_dependency_graph ─────────────────────────────────────────

  api.registerTool('nexus_dependency_graph', {
    description:
      'Query the knowledge dependency graph for any entity.',
    parameters: NexusDependencyGraphSchema,
    execute: async (input) => {
      const result = await handleDependencyGraph(client, input);
      return result;
    },
  });

  // ── 15. nexus_impact_analysis ──────────────────────────────────────────

  api.registerTool('nexus_impact_analysis', {
    description:
      'Analyze the blast radius of changes to any entity.',
    parameters: NexusImpactAnalysisSchema,
    execute: async (input) => {
      const result = await handleImpactAnalysis(client, input);
      return result;
    },
  });

  // ── 16. nexus_dev_read_ticket ──────────────────────────────────────────

  api.registerTool('nexus_dev_read_ticket', {
    description: "Fetch a Jira ticket's full details.",
    parameters: NexusDevReadTicketSchema,
    execute: async (input) => {
      const result = await handleJarvisReadTicket(input);
      return result;
    },
  });

  // ── 17. nexus_dev_get_context ──────────────────────────────────────────

  api.registerTool('nexus_dev_get_context', {
    description: 'Get brain-augmented context for a Jira ticket.',
    parameters: NexusDevGetContextSchema,
    execute: async (input) => {
      const result = await handleJarvisGetContext(client, supabase, input);
      return result;
    },
  });

  // ── 18. nexus_dev_submit_analysis ──────────────────────────────────────

  api.registerTool('nexus_dev_submit_analysis', {
    description: 'Record a completed root cause analysis.',
    parameters: NexusDevSubmitAnalysisSchema,
    execute: async (input) => {
      const result = await handleJarvisSubmitAnalysis(client, supabase, input);
      return result;
    },
  });

  // ── 19. nexus_dev_list_runs ────────────────────────────────────────────

  api.registerTool('nexus_dev_list_runs', {
    description: 'List past Developer Jarvis analysis runs.',
    parameters: NexusDevListRunsSchema,
    execute: async (input) => {
      const result = await handleJarvisListRuns(supabase, input);
      return result;
    },
  });

  // ── 20. nexus_verify_prediction ────────────────────────────────────────
  // New reinforcement tool -- inline handler (not in mcp-server)

  api.registerTool('nexus_verify_prediction', {
    description:
      'Verify a prediction with actual outcome, triggering edge weight adjustment.',
    parameters: NexusVerifyPredictionSchema,
    execute: async (input: {
      prediction_id: string;
      actual_value: number;
      actual_direction: 'increase' | 'decrease' | 'stable';
    }) => {
      try {
        const result = await client.query(
          `Verify prediction "${input.prediction_id}": ` +
            `actual_value=${input.actual_value}, actual_direction=${input.actual_direction}. ` +
            `Update edge weights accordingly and return the verification summary ` +
            `including whether the prediction was correct, the error magnitude, ` +
            `and any edge weight adjustments made.`,
        );

        const parts: string[] = [];
        parts.push(`## Prediction Verification: ${input.prediction_id}`);
        parts.push('');
        parts.push(`- Actual value: ${input.actual_value}`);
        parts.push(`- Actual direction: ${input.actual_direction}`);
        parts.push('');
        parts.push(result.answer);

        if (result.context.causal.length > 0) {
          parts.push('');
          parts.push('### Affected Causal Edges');
          result.context.causal.forEach((r: any) => {
            parts.push(
              `- ${r.source_domain} -> ${r.target_domain} | effect=${r.effect_size ?? '?'}`,
            );
          });
        }

        return { content: [{ type: 'text', text: parts.join('\n') }] };
      } catch (err) {
        return handleError(err);
      }
    },
  });

  // ── 21. nexus_consolidation_status ─────────────────────────────────────
  // New reinforcement tool -- inline handler (not in mcp-server)

  api.registerTool('nexus_consolidation_status', {
    description: 'Get the latest brain consolidation report.',
    parameters: NexusConsolidationStatusSchema,
    execute: async (input: { run_id?: string }) => {
      try {
        const qualifier = input.run_id
          ? `for consolidation run "${input.run_id}"`
          : 'for the most recent consolidation run';

        const result = await client.query(
          `What is the brain consolidation status ${qualifier}? ` +
            `Report: edges consolidated, patterns reinforced, stale edges decayed, ` +
            `memory compaction stats, last run timestamp, and overall brain health score.`,
        );

        const parts: string[] = [];
        parts.push('## Brain Consolidation Status');
        if (input.run_id) {
          parts.push(`Run ID: ${input.run_id}`);
        }
        parts.push('');
        parts.push(result.answer);

        if (result.context.patterns.length > 0) {
          parts.push('');
          parts.push('### Active Patterns');
          result.context.patterns.forEach((p: any) => {
            const conf = p.confidence
              ? ` (${Math.round(p.confidence * 100)}%)`
              : '';
            parts.push(
              `- ${p.natural_language || p.rule_type || 'pattern'}${conf}`,
            );
          });
        }

        return { content: [{ type: 'text', text: parts.join('\n') }] };
      } catch (err) {
        return handleError(err);
      }
    },
  });

  api.log?.('info', `NexusBrain: registered 21 tools`);
}
