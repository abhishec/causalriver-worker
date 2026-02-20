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

// ============================================================================
// ENGINEERING TOOL HANDLERS
// ============================================================================

/**
 * Handle nexus_query_experts — find who knows about a topic.
 * Powers UC1 (Onboarding), UC3 (Incident Response), UC5 (Code Review).
 * Routes through brain's query layer which accesses the expertise graph.
 */
export async function handleQueryExperts(
  client: NexusClient,
  args: { topic: string; evidence_types?: string; limit?: number },
): Promise<McpTextResult> {
  try {
    const evidenceClause = args.evidence_types
      ? ` Focus on evidence from: ${args.evidence_types}.`
      : '';
    const limitClause = args.limit ? ` Return top ${args.limit} experts.` : '';

    const result = await client.query(
      `Who are the experts on "${args.topic}"? List contributors ranked by expertise strength, including what evidence supports their knowledge (code changes, reviews, discussions, incident response).${evidenceClause}${limitClause}`,
      { domain: 'engineering' },
    );

    const parts: string[] = [];
    parts.push(`🧑‍💻 Expertise Search: "${args.topic}"\n`);
    parts.push(result.answer);

    if (result.context.memories.length > 0) {
      parts.push('\n--- Supporting Evidence ---');
      result.context.memories.forEach(m => {
        parts.push(`  ${m.content || 'evidence'}`);
      });
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_search_code — semantic search across indexed code.
 * Powers UC1 (Onboarding) and UC2 (Debugging).
 * Routes through brain's query layer which accesses entity embeddings + code search.
 */
export async function handleSearchCode(
  client: NexusClient,
  args: { query: string; language?: string; limit?: number },
): Promise<McpTextResult> {
  try {
    const langClause = args.language ? ` Focus on ${args.language} code.` : '';

    const result = await client.query(
      `Search code for: "${args.query}". Find relevant code symbols, functions, files, and documentation that match.${langClause} Include related engineering signals if any.`,
      { domain: 'engineering' },
    );

    const parts: string[] = [];
    parts.push(`🔍 Code Search: "${args.query}"\n`);
    parts.push(result.answer);

    if (result.context.memories.length > 0) {
      parts.push('\n--- Related Code Context ---');
      result.context.memories.forEach(m => {
        parts.push(`  ${m.content || 'code context'}`);
      });
    }

    if (result.context.causal.length > 0) {
      parts.push('\n--- Related Causal Patterns ---');
      result.context.causal.forEach(r => {
        parts.push(`  ${formatRelationship(r)}`);
      });
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_incident_context — full incident context with deployments, experts, runbooks.
 * Powers UC3 (Incident Response).
 */
export async function handleIncidentContext(
  client: NexusClient,
  args: { service: string; hours_lookback?: number },
): Promise<McpTextResult> {
  try {
    const hours = args.hours_lookback || 12;

    // Query for recent deployments via the brain
    const questionParts = [
      `What recent deployments or CI failures happened for ${args.service}?`,
      `Who are the experts for ${args.service}?`,
      `Are there relevant runbooks or past incidents?`,
    ];

    const result = await client.query(
      `Incident analysis for ${args.service}: ${questionParts.join(' ')}`,
      { domain: 'engineering' },
    );

    const parts: string[] = [];
    parts.push(`🚨 Incident Context for "${args.service}" (last ${hours}h)\n`);
    parts.push(result.answer);

    if (result.context.causal.length > 0) {
      parts.push('\n--- Related Causal Chains ---');
      result.context.causal.forEach(r => {
        parts.push(`  ${formatRelationship(r)}`);
      });
    }

    if (result.context.memories.length > 0) {
      parts.push('\n--- Relevant Organizational Memory ---');
      result.context.memories.forEach(m => {
        parts.push(`  ${m.content || 'memory'}`);
      });
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_analyze_pr — PR risk analysis with incident history and reviewer suggestions.
 * Powers UC5 (Code Review Intelligence).
 */
export async function handleAnalyzePR(
  client: NexusClient,
  args: { file_paths: string; pr_title?: string },
): Promise<McpTextResult> {
  try {
    const filePaths = args.file_paths.split(',').map(s => s.trim());

    const question = [
      `Analyze risk for a PR${args.pr_title ? ` titled "${args.pr_title}"` : ''} touching these paths: ${filePaths.join(', ')}.`,
      'Are there past incidents, CI failures, or known issues in these areas?',
      'Who should review this code?',
    ].join(' ');

    const result = await client.query(question, { domain: 'engineering' });

    const parts: string[] = [];
    parts.push(`📋 PR Risk Analysis${args.pr_title ? `: "${args.pr_title}"` : ''}\n`);
    parts.push(`Files: ${filePaths.join(', ')}\n`);
    parts.push(result.answer);

    if (result.context.causal.length > 0) {
      parts.push('\n--- Causal Patterns ---');
      result.context.causal.forEach(r => {
        parts.push(`  ${formatRelationship(r)}`);
      });
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_team_activity — engineering team activity summary.
 * Powers UC6 (Cross-Team Visibility).
 */
export async function handleTeamActivity(
  client: NexusClient,
  args: { days?: number },
): Promise<McpTextResult> {
  try {
    const days = args.days || 7;

    const result = await client.query(
      `Summarize engineering team activity over the last ${days} days: deployments, incidents, PRs merged, CI health, active contributors, and main focus areas.`,
      { domain: 'engineering' },
    );

    const parts: string[] = [];
    parts.push(`📊 Engineering Team Activity (last ${days} days)\n`);
    parts.push(result.answer);

    if (result.context.patterns.length > 0) {
      parts.push('\n--- Detected Patterns ---');
      result.context.patterns.forEach(p => {
        const conf = p.confidence ? ` (${Math.round(p.confidence * 100)}%)` : '';
        parts.push(`  ${p.natural_language || p.rule_type || 'pattern'}${conf}`);
      });
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_search_ci_failures — search past CI/CD failures.
 * Powers UC2 (Debugging Assistant).
 */
export async function handleSearchCIFailures(
  client: NexusClient,
  args: { query: string; provider?: string; days_lookback?: number },
): Promise<McpTextResult> {
  try {
    const days = args.days_lookback || 30;

    const question = [
      `Find past CI/CD failures similar to: "${args.query}"`,
      args.provider ? `in ${args.provider}` : '',
      `within the last ${days} days.`,
      'What resolved them? Any causal patterns?',
    ].filter(Boolean).join(' ');

    const result = await client.query(question, { domain: 'engineering' });

    const parts: string[] = [];
    parts.push(`🔍 CI Failure Search: "${args.query}"\n`);
    parts.push(result.answer);

    if (result.context.causal.length > 0) {
      parts.push('\n--- Related Causal Chains ---');
      result.context.causal.forEach(r => {
        parts.push(`  ${formatRelationship(r)}`);
      });
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_collaboration_network — cross-team collaboration patterns.
 * Powers UC6 (Cross-Team Visibility).
 */
export async function handleCollaborationNetwork(
  client: NexusClient,
  args: { contributor?: string; team?: string; days?: number },
): Promise<McpTextResult> {
  try {
    const days = args.days || 30;
    const focus = args.contributor
      ? `for contributor "${args.contributor}"`
      : args.team
        ? `for team "${args.team}"`
        : 'across the entire organization';

    const result = await client.query(
      `Show collaboration patterns ${focus} over the last ${days} days. Who works together most? Which teams interact? Who are the bridge connectors between teams?`,
      { domain: 'engineering' },
    );

    const parts: string[] = [];
    parts.push(`🤝 Collaboration Network ${focus} (last ${days} days)\n`);
    parts.push(result.answer);

    if (result.context.memories.length > 0) {
      parts.push('\n--- Supporting Evidence ---');
      result.context.memories.forEach(m => {
        parts.push(`  ${m.content || 'collaboration data'}`);
      });
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Handle nexus_ingest_adr — index an architectural decision record.
 * Powers UC4 (Knowledge Retention).
 */
export async function handleIngestADR(
  client: NexusClient,
  args: { title: string; content: string; status?: string; tags?: string; author?: string; date?: string },
): Promise<McpTextResult> {
  try {
    // Ingest the ADR as signals to the brain
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const signals = [
      {
        source_domain: 'engineering',
        signal_type: 'adr_ingested',
        signal_value: 1,
        entity_type: 'adr',
        entity_id: `adr-${Date.now()}`,
        metadata: {
          title: args.title,
          content: args.content.substring(0, 5000),
          status: args.status || 'accepted',
          tags,
          author: args.author,
          decision_date: args.date || new Date().toISOString(),
        },
      },
    ];

    await client.ingest(signals);

    // Also query brain to acknowledge and contextualize
    const result = await client.query(
      `An architectural decision record has been ingested: "${args.title}". Status: ${args.status || 'accepted'}. Tags: ${tags.join(', ') || 'none'}. This knowledge should be available for future onboarding and decision-making queries.`,
      { domain: 'engineering' },
    );

    const parts: string[] = [];
    parts.push(`📋 ADR Indexed: "${args.title}"\n`);
    parts.push(`Status: ${args.status || 'accepted'}`);
    if (tags.length) parts.push(`Tags: ${tags.join(', ')}`);
    if (args.author) parts.push(`Author: ${args.author}`);
    parts.push('\n' + result.answer);

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
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

// ============================================================================
// KNOWLEDGE DEPENDENCY GRAPH HANDLERS
// ============================================================================

/**
 * Query the knowledge dependency graph for any entity (code file, financial line, document).
 * Returns upstream/downstream dependencies, filtered by domain and type.
 */
export async function handleDependencyGraph(
  client: NexusClient,
  args: {
    entity_id: string;
    direction?: 'upstream' | 'downstream' | 'both';
    domain?: string;
    transitive?: boolean;
    max_depth?: number;
    limit?: number;
  },
): Promise<McpTextResult> {
  try {
    // Use the client's query method to ask the brain about dependencies
    const query = [
      `What are the ${args.direction || 'both'} dependencies of "${args.entity_id}"?`,
      args.domain ? `Filter to the ${args.domain} domain.` : '',
      args.transitive ? `Include transitive (indirect) dependencies up to depth ${args.max_depth || 5}.` : 'Show direct dependencies only.',
      `Limit to ${args.limit || 20} results.`,
    ].filter(Boolean).join(' ');

    const result = await client.query(query);

    const output = [
      `## Dependencies for: ${args.entity_id}`,
      `Direction: ${args.direction || 'both'}`,
      args.domain ? `Domain: ${args.domain}` : 'Domain: all',
      `Transitive: ${args.transitive ? 'yes' : 'no'}`,
      '',
      result.answer || 'No dependency data found. The knowledge dependency graph may not have data for this entity yet.',
      '',
      'Use nexus_impact_analysis to see the full blast radius of changes to this entity.',
    ].join('\n');

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Analyze the blast radius of changes to any entity.
 * Returns impact radius, risk score, affected domains, and critical paths.
 */
export async function handleImpactAnalysis(
  client: NexusClient,
  args: {
    entity_id: string;
    domain?: string;
  },
): Promise<McpTextResult> {
  try {
    const query = [
      `What is the impact analysis for "${args.entity_id}"?`,
      'Include blast radius, risk score, affected business domains, and critical dependency paths.',
      args.domain ? `Filter to the ${args.domain} domain.` : '',
    ].filter(Boolean).join(' ');

    const result = await client.query(query);

    const output = [
      `## Impact Analysis: ${args.entity_id}`,
      args.domain ? `Domain: ${args.domain}` : 'Domain: all',
      '',
      result.answer || 'No impact data found. The knowledge dependency graph may not have data for this entity yet.',
      '',
      'Tip: Use nexus_dependency_graph to explore specific upstream/downstream dependencies.',
    ].join('\n');

    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (err) {
    return handleError(err);
  }
}
