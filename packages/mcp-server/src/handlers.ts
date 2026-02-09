/**
 * @nexus-ai/mcp-server — Handler functions
 *
 * Pure functions that translate MCP tool calls → NexusClient SDK calls.
 * Exported for testability — the main index.ts wires these into the MCP server.
 */

import {
  NexusError,
  type NexusClient,
  type Signal,
  type CausalRelationship,
} from '@nexus-ai/client';

// ============================================================================
// TYPES
// ============================================================================

export interface McpTextResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: true;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export function handleError(err: unknown): McpTextResult {
  if (err instanceof NexusError) {
    return {
      content: [{
        type: 'text',
        text: `NexusBrain error (${err.functionName}, HTTP ${err.statusCode}): ${err.message}`,
      }],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

export function formatRelationship(r: CausalRelationship): string {
  const parts = [`${r.source_domain} \u2192 ${r.target_domain}`];
  if (r.natural_language) parts.push(r.natural_language);
  if (r.effect_size !== undefined) parts.push(`effect=${r.effect_size}`);
  if (r.granger_p_value !== undefined) parts.push(`p=${r.granger_p_value}`);
  if (r.optimal_lag_days !== undefined) parts.push(`lag=${r.optimal_lag_days}d`);
  return parts.join(' | ');
}

export function formatRelationshipsText(
  relationships: CausalRelationship[],
  meta?: { orgCount?: number; coreCount?: number },
): string {
  if (relationships.length === 0) {
    return 'No causal relationships discovered yet. Ingest more signals to enable causal discovery.';
  }

  const lines = relationships.map((r, i) => `${i + 1}. ${formatRelationship(r)}`);

  let header = `Discovered ${relationships.length} causal relationship(s)`;
  if (meta?.orgCount !== undefined && meta?.coreCount !== undefined) {
    header += ` (${meta.orgCount} org-specific, ${meta.coreCount} from universal knowledge base)`;
  }

  return `${header}:\n\n${lines.join('\n')}`;
}

// ============================================================================
// TOOL HANDLERS
// ============================================================================

/**
 * Handle nexus_query — ask the brain a natural language question.
 */
export async function handleQuery(
  client: NexusClient,
  args: { question: string; domain?: string },
): Promise<McpTextResult> {
  try {
    const result = await client.query(args.question, { domain: args.domain });

    const parts: string[] = [];
    parts.push(result.answer);

    if (result.context.causal.length > 0) {
      parts.push('\n--- Causal Context ---');
      result.context.causal.forEach(r => {
        parts.push(`  ${formatRelationship(r)}`);
      });
    }

    if (result.context.patterns.length > 0) {
      parts.push('\n--- Learned Patterns ---');
      result.context.patterns.forEach(p => {
        const conf = p.confidence ? ` (${Math.round(p.confidence * 100)}%)` : '';
        parts.push(`  ${p.natural_language || p.rule_type || 'pattern'}${conf}`);
      });
    }

    if (result.context.memories.length > 0) {
      parts.push('\n--- Organizational Memory ---');
      result.context.memories.forEach(m => {
        parts.push(`  ${m.content || 'memory'}`);
      });
    }

    if (result.meta.federated) {
      parts.push(
        `\n[Federated: ${result.meta.orgSpecificRelationships ?? '?'} org edges + ${result.meta.coreBrainRelationships ?? '?'} core brain edges]`,
      );
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_ingest — send signals for causal analysis.
 */
export async function handleIngest(
  client: NexusClient,
  args: { signals: Signal[] },
): Promise<McpTextResult> {
  try {
    const result = await client.ingest(args.signals);
    return {
      content: [{
        type: 'text',
        text: `Ingested ${result.signalsIngested} signal(s), created ${result.eventsCreated} event(s). Success: ${result.success}`,
      }],
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_relationships — read discovered causal edges.
 */
export async function handleRelationships(
  client: NexusClient,
  args: { limit?: number; min_effect_size?: number; include_core_knowledge?: boolean },
): Promise<McpTextResult> {
  try {
    const result = await client.getRelationships({
      limit: args.limit,
      minEffectSize: args.min_effect_size,
      includeCoreKnowledge: args.include_core_knowledge,
    });

    const text = formatRelationshipsText(result.relationships, {
      orgCount: result.orgCount,
      coreCount: result.coreCount,
    });

    return { content: [{ type: 'text', text }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_webhook — forward webhook payloads from external services.
 */
export async function handleWebhook(
  client: NexusClient,
  args: { source: 'stripe' | 'hubspot' | 'intercom' | 'zendesk' | 'support'; payload: Record<string, unknown> },
): Promise<McpTextResult> {
  try {
    const result = await client.webhook(args.source, args.payload);
    return {
      content: [{
        type: 'text',
        text: `Webhook processed from ${result.source}. Generated ${result.signalsGenerated} signal(s). Success: ${result.success}`,
      }],
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_cron — trigger maintenance tasks.
 */
export async function handleCron(
  client: NexusClient,
  args: { tasks?: string[] },
): Promise<McpTextResult> {
  try {
    const result = await client.cron(args.tasks);

    const lines = result.results.map(r =>
      `  ${r.task}: ${r.status} (${r.durationMs}ms)`,
    );

    return {
      content: [{
        type: 'text',
        text: `Cron completed. Processed ${result.organizationsProcessed} org(s).\n${lines.join('\n')}`,
      }],
    };
  } catch (err) {
    return handleError(err);
  }
}

// ============================================================================
// RESOURCE HANDLER
// ============================================================================

/**
 * Handle nexusbrain://relationships resource — live causal graph as JSON.
 */
export async function handleRelationshipsResource(
  client: NexusClient,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  try {
    const result = await client.getRelationships({
      limit: 100,
      includeCoreKnowledge: true,
    });

    return {
      contents: [{
        uri: 'nexusbrain://relationships',
        mimeType: 'application/json',
        text: JSON.stringify({
          organizationId: client.organizationId,
          relationships: result.relationships.map(r => ({
            cause: r.source_domain,
            effect: r.target_domain,
            effectSize: r.effect_size,
            pValue: r.granger_p_value,
            lagDays: r.optimal_lag_days,
            description: r.natural_language,
            isSignificant: r.is_significant,
          })),
          count: result.count,
          orgCount: result.orgCount,
          coreCount: result.coreCount,
          fetchedAt: new Date().toISOString(),
        }, null, 2),
      }],
    };
  } catch (err) {
    return {
      contents: [{
        uri: 'nexusbrain://relationships',
        mimeType: 'application/json',
        text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      }],
    };
  }
}

// ============================================================================
// PROMPT HANDLER
// ============================================================================

/**
 * Build the analyze-metrics prompt — fetches live causal graph and injects as context.
 */
export async function buildAnalyzeMetricsPrompt(
  client: NexusClient,
  args: { domain?: string; question?: string },
): Promise<{ messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }> }> {
  // Fetch live causal graph for context
  let relationshipsContext: string;
  try {
    const result = await client.getRelationships({
      limit: 30,
      includeCoreKnowledge: true,
    });
    relationshipsContext = formatRelationshipsText(result.relationships, {
      orgCount: result.orgCount,
      coreCount: result.coreCount,
    });
  } catch {
    relationshipsContext = '(Could not fetch causal relationships \u2014 the brain may not have enough data yet.)';
  }

  const focusDomain = args.domain
    ? `Focus on the **${args.domain}** domain.`
    : 'Analyze across all domains.';

  const specificQuestion = args.question
    || 'What are the most important causal dynamics affecting business outcomes?';

  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: [
          'You are a causal intelligence analyst with access to NexusBrain, a system that discovers statistically significant causal relationships between business domains using Granger causality, transfer entropy, and ensemble methods.',
          '',
          '## Known Causal Relationships',
          '',
          relationshipsContext,
          '',
          '## Task',
          '',
          focusDomain,
          '',
          `Analyze: ${specificQuestion}`,
          '',
          'Provide your analysis structured as:',
          '1. **Key Causal Chains** \u2014 The most impactful cause-effect sequences',
          '2. **Risk Signals** \u2014 Domains where negative cascades could start',
          '3. **Opportunity Signals** \u2014 Interventions with the highest expected ROI',
          '4. **Data Gaps** \u2014 What additional signals would improve the causal model',
          '',
          'Use the nexus_query tool to ask follow-up questions to the brain if needed.',
        ].join('\n'),
      },
    }],
  };
}
