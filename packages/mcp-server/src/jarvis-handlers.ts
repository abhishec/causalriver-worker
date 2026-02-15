/**
 * Developer Jarvis MCP handlers.
 *
 * Pure functions that translate MCP tool calls → Jira API + Supabase REST + brain queries.
 * Follows the same pattern as handlers.ts.
 */

import type { NexusClient } from '@nexus-ai/client';
import type { McpTextResult } from './handlers.js';
import { handleError, formatRelationship } from './handlers.js';
import { getJiraConfig, createJiraClient, type JiraTicketDetails } from './jira-client.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
  orgId: string;
}

interface JarvisRun {
  id: string;
  jira_key: string;
  status: string;
  analysis_brief: string | null;
  root_cause: Record<string, unknown>;
  key_files: Array<Record<string, unknown>>;
  confidence: number;
  created_at: string;
  duration_ms: number | null;
  trigger_type: string;
  triggered_by: string | null;
}

// ============================================================================
// SUPABASE REST HELPERS
// ============================================================================

function supabaseHeaders(config: SupabaseConfig): Record<string, string> {
  return {
    'Authorization': `Bearer ${config.supabaseKey}`,
    'apikey': config.supabaseKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

async function insertJarvisRun(
  config: SupabaseConfig,
  run: Record<string, unknown>,
): Promise<JarvisRun> {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/dev_jarvis_runs`,
    {
      method: 'POST',
      headers: {
        ...supabaseHeaders(config),
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        organization_id: config.orgId,
        ...run,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to insert Jarvis run (${response.status}): ${text.slice(0, 200)}`);
  }

  const rows = await response.json() as JarvisRun[];
  return rows[0];
}

async function queryJarvisRuns(
  config: SupabaseConfig,
  filters: { jira_key?: string; status?: string; limit?: number; jira_project?: string },
): Promise<JarvisRun[]> {
  const limit = filters.limit || 10;
  const select = 'id,jira_key,status,analysis_brief,root_cause,key_files,confidence,created_at,duration_ms,trigger_type,triggered_by';

  let url = `${config.supabaseUrl}/rest/v1/dev_jarvis_runs?organization_id=eq.${config.orgId}&order=created_at.desc&limit=${limit}&select=${select}`;

  if (filters.jira_key) {
    url += `&jira_key=eq.${encodeURIComponent(filters.jira_key)}`;
  }
  if (filters.status) {
    url += `&status=eq.${encodeURIComponent(filters.status)}`;
  }
  if (filters.jira_project) {
    url += `&jira_key=like.${encodeURIComponent(filters.jira_project)}-%2A`;
  }

  const response = await fetch(url, { headers: supabaseHeaders(config) });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to query Jarvis runs (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<JarvisRun[]>;
}

// ============================================================================
// HELPERS
// ============================================================================

function extractProjectKey(jiraKey: string): string {
  const match = jiraKey.match(/^([A-Z][A-Z0-9]+)-\d+$/);
  return match ? match[1] : jiraKey;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTicket(ticket: JiraTicketDetails): string {
  const lines: string[] = [];

  lines.push(`## ${ticket.key}: ${ticket.summary}`);
  lines.push('');
  lines.push(`**Status**: ${ticket.status} (${ticket.statusCategory})`);
  lines.push(`**Type**: ${ticket.issueType}${ticket.priority ? ` | **Priority**: ${ticket.priority}` : ''}`);
  if (ticket.assignee) lines.push(`**Assignee**: ${ticket.assignee}`);
  if (ticket.reporter) lines.push(`**Reporter**: ${ticket.reporter}`);
  if (ticket.components.length > 0) lines.push(`**Components**: ${ticket.components.join(', ')}`);
  if (ticket.labels.length > 0) lines.push(`**Labels**: ${ticket.labels.join(', ')}`);
  lines.push(`**Created**: ${formatDate(ticket.created)} | **Updated**: ${formatDate(ticket.updated)}`);
  if (ticket.resolution) lines.push(`**Resolution**: ${ticket.resolution} (${formatDate(ticket.resolutionDate || '')})`);

  if (ticket.description) {
    lines.push('');
    lines.push('### Description');
    lines.push(ticket.description.trim());
  }

  if (ticket.comments.length > 0) {
    lines.push('');
    lines.push(`### Recent Comments (${ticket.comments.length})`);
    ticket.comments.forEach((c, i) => {
      lines.push(`${i + 1}. **${c.author}** (${formatDate(c.created)}): ${c.body.trim().slice(0, 300)}`);
    });
  }

  if (ticket.linkedIssues.length > 0) {
    lines.push('');
    lines.push('### Linked Issues');
    ticket.linkedIssues.forEach((l) => {
      lines.push(`- ${l.type}: **${l.key}** — ${l.summary} (${l.status})`);
    });
  }

  return lines.join('\n');
}

// ============================================================================
// TOOL HANDLERS
// ============================================================================

/**
 * Fetch a Jira ticket's full details.
 */
export async function handleJarvisReadTicket(
  args: { jira_key: string },
): Promise<McpTextResult> {
  try {
    const jiraConfig = getJiraConfig();
    if (!jiraConfig) {
      return {
        content: [{
          type: 'text',
          text: 'Jira not configured. Set environment variables:\n  JIRA_BASE_URL  (e.g. https://company.atlassian.net)\n  JIRA_EMAIL     (your Jira account email)\n  JIRA_API_TOKEN (from https://id.atlassian.com/manage-profile/security/api-tokens)',
        }],
        isError: true,
      };
    }

    const client = createJiraClient(jiraConfig);
    const ticket = await client.getTicket(args.jira_key);
    return { content: [{ type: 'text', text: formatTicket(ticket) }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Get brain context for a Jira ticket: past analyses + causal patterns.
 */
export async function handleJarvisGetContext(
  client: NexusClient,
  supabase: SupabaseConfig,
  args: { jira_key: string; components?: string },
): Promise<McpTextResult> {
  try {
    const projectKey = extractProjectKey(args.jira_key);
    const parts: string[] = [];
    parts.push(`## Brain Context for ${args.jira_key}`);

    // 1. Query brain for engineering intelligence
    const topic = args.components || projectKey;
    try {
      const brainResult = await client.query(
        `What engineering patterns, past incidents, or known fragile areas exist related to "${topic}"? Include any causal relationships affecting the engineering domain.`,
        { domain: 'engineering' },
      );

      parts.push('');
      parts.push('### Brain Intelligence');
      parts.push(brainResult.answer);

      if (brainResult.context.causal.length > 0) {
        parts.push('');
        parts.push('### Causal Patterns');
        brainResult.context.causal.slice(0, 5).forEach((r) => {
          parts.push(`- ${formatRelationship(r)}`);
        });
      }

      if (brainResult.context.memories.length > 0) {
        parts.push('');
        parts.push('### Organizational Memory');
        brainResult.context.memories.slice(0, 5).forEach((m) => {
          parts.push(`- ${(m as any).content || 'memory'}`);
        });
      }
    } catch {
      parts.push('');
      parts.push('### Brain Intelligence');
      parts.push('(Brain context unavailable — continuing with past analyses only)');
    }

    // 2. Query past Jarvis analyses for this project
    try {
      const pastRuns = await queryJarvisRuns(supabase, {
        jira_project: projectKey,
        status: 'completed',
        limit: 5,
      });

      if (pastRuns.length > 0) {
        parts.push('');
        parts.push(`### Past Jarvis Analyses (${projectKey} project)`);
        pastRuns.forEach((run, i) => {
          const rootFile = (run.root_cause as any)?.file || '—';
          parts.push(`${i + 1}. **${run.jira_key}** (${formatDate(run.created_at)}): ${rootFile} — confidence ${Math.round(run.confidence * 100)}%`);
        });
      }
    } catch {
      // Past runs unavailable — non-fatal
    }

    return { content: [{ type: 'text', text: parts.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Record a completed analysis: save to DB, post to Jira, emit brain signal.
 */
export async function handleJarvisSubmitAnalysis(
  client: NexusClient,
  supabase: SupabaseConfig,
  args: {
    jira_key: string;
    analysis_brief: string;
    root_cause: {
      file?: string;
      function?: string;
      line?: number;
      description: string;
    };
    key_files: Array<{
      path: string;
      lines?: string;
      reason: string;
    }>;
    confidence: number;
    suggested_fix?: string;
    post_to_jira?: boolean;
  },
): Promise<McpTextResult> {
  try {
    const startTime = Date.now();
    const warnings: string[] = [];

    // 1. Insert dev_jarvis_runs record
    const run = await insertJarvisRun(supabase, {
      jira_key: args.jira_key,
      trigger_type: 'cli',
      status: 'completed',
      analysis_brief: args.analysis_brief,
      root_cause: args.root_cause,
      key_files: args.key_files,
      confidence: args.confidence,
      duration_ms: Date.now() - startTime,
    });

    // 2. Post to Jira (if configured and not opted out)
    let postedToJira = false;
    if (args.post_to_jira !== false) {
      const jiraConfig = getJiraConfig();
      if (jiraConfig) {
        try {
          const jiraClient = createJiraClient(jiraConfig);
          const commentBody = formatAnalysisForJira(args);
          await jiraClient.addComment(args.jira_key, commentBody);
          postedToJira = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`Jira comment failed: ${msg}`);
        }
      } else {
        warnings.push('Jira not configured — skipped posting comment');
      }
    }

    // 3. Emit brain signal
    let signalEmitted = false;
    try {
      await client.ingest([{
        source_domain: 'engineering',
        signal_type: 'jarvis_analysis_completed',
        signal_value: args.confidence,
        entity_type: 'dev_jarvis_run',
        entity_id: run.id,
        metadata: {
          jira_key: args.jira_key,
          root_cause_file: args.root_cause.file || null,
          root_cause_function: args.root_cause.function || null,
          key_files_count: args.key_files.length,
          project: extractProjectKey(args.jira_key),
          trigger_type: 'cli',
        },
      }]);
      signalEmitted = true;
    } catch {
      warnings.push('Brain signal emission failed (non-fatal)');
    }

    // 4. Format response
    const lines: string[] = [];
    lines.push(`Analysis recorded for ${args.jira_key} (run: ${run.id})`);
    lines.push(`- Confidence: ${Math.round(args.confidence * 100)}%`);
    if (args.root_cause.file) {
      const loc = args.root_cause.line ? `:${args.root_cause.line}` : '';
      lines.push(`- Root cause: ${args.root_cause.file}${loc}`);
    }
    lines.push(`- Key files: ${args.key_files.length}`);
    lines.push(`- Posted to Jira: ${postedToJira ? 'Yes' : 'No'}`);
    lines.push(`- Brain signal: ${signalEmitted ? 'Emitted' : 'Failed'}`);

    if (warnings.length > 0) {
      lines.push('');
      lines.push('Warnings:');
      warnings.forEach((w) => lines.push(`  - ${w}`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * List past Jarvis analysis runs.
 */
export async function handleJarvisListRuns(
  supabase: SupabaseConfig,
  args: { jira_key?: string; limit?: number; status?: string },
): Promise<McpTextResult> {
  try {
    const runs = await queryJarvisRuns(supabase, {
      jira_key: args.jira_key,
      status: args.status,
      limit: args.limit || 10,
    });

    if (runs.length === 0) {
      return { content: [{ type: 'text', text: 'No Jarvis analysis runs found.' }] };
    }

    const lines: string[] = [];
    lines.push('## Jarvis Analysis Runs');
    lines.push('');
    lines.push('| # | Jira Key | Status | Confidence | Root Cause File | Date |');
    lines.push('|---|----------|--------|------------|-----------------|------|');

    runs.forEach((run, i) => {
      const rootFile = (run.root_cause as any)?.file || '—';
      const conf = run.confidence > 0 ? `${Math.round(run.confidence * 100)}%` : '—';
      lines.push(`| ${i + 1} | ${run.jira_key} | ${run.status} | ${conf} | ${rootFile} | ${formatDate(run.created_at)} |`);
    });

    const completed = runs.filter((r) => r.status === 'completed').length;
    const failed = runs.filter((r) => r.status === 'failed').length;
    lines.push('');
    lines.push(`Total: ${runs.length} runs | ${completed} completed | ${failed} failed`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err) {
    return handleError(err);
  }
}

// ============================================================================
// PROMPT HANDLER
// ============================================================================

/**
 * Build the jarvis-analyze prompt — pre-fetches ticket and brain context.
 */
export async function buildJarvisAnalyzePrompt(
  client: NexusClient,
  supabase: SupabaseConfig,
  args: { jira_key: string },
): Promise<{ messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }> }> {
  // 1. Fetch ticket details
  let ticketSection = '';
  try {
    const ticketResult = await handleJarvisReadTicket({ jira_key: args.jira_key });
    ticketSection = ticketResult.content[0].text;
  } catch {
    ticketSection = `(Could not fetch Jira ticket ${args.jira_key} — Jira may not be configured)`;
  }

  // 2. Fetch brain context
  let brainSection = '';
  try {
    const contextResult = await handleJarvisGetContext(client, supabase, { jira_key: args.jira_key });
    brainSection = contextResult.content[0].text;
  } catch {
    brainSection = '(Brain context unavailable)';
  }

  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: [
          'You are a senior engineer performing root cause analysis on a bug.',
          'You are working inside the actual git repository for this project.',
          'Use your tools (Read, Glob, Grep, and Bash with git commands) to explore the codebase.',
          '',
          '## Jira Ticket',
          '',
          ticketSection,
          '',
          brainSection,
          '',
          '## Your Task',
          '',
          '1. Read the Jira ticket carefully. Identify the symptoms and failure mode.',
          '2. Search the codebase for relevant files (error messages, function names, components from the ticket).',
          '3. Trace the code path that could cause this bug.',
          '4. Check git log and git blame on suspicious files — what changed recently?',
          '5. Identify the root cause with specific file, function, and line number.',
          '',
          '## After Analysis',
          '',
          'When you have completed your analysis, call the `jarvis_submit_analysis` tool with:',
          `- **jira_key**: "${args.jira_key}"`,
          '- **analysis_brief**: Markdown with ## Issue Summary, ## Root Cause, ## Recommended Fix sections (under 500 words)',
          '- **root_cause**: { file, function, line, description }',
          '- **key_files**: [{ path, lines, reason }]',
          '- **confidence**: 0.0\u20131.0',
          '- **suggested_fix**: one-liner description',
          '',
          'Be precise \u2014 include exact file paths, function names, line numbers.',
        ].join('\n'),
      },
    }],
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function formatAnalysisForJira(args: {
  jira_key: string;
  analysis_brief: string;
  root_cause: { file?: string; function?: string; line?: number; description: string };
  key_files: Array<{ path: string; lines?: string; reason: string }>;
  confidence: number;
  suggested_fix?: string;
}): string {
  const lines: string[] = [];
  lines.push(`NexusBrain Developer Jarvis \u2014 Analysis for ${args.jira_key}`);
  lines.push('');
  lines.push(args.analysis_brief);

  if (args.root_cause.file) {
    lines.push('');
    lines.push('Root Cause Location:');
    const loc = args.root_cause.line ? `:${args.root_cause.line}` : '';
    const fn = args.root_cause.function ? ` (${args.root_cause.function})` : '';
    lines.push(`  ${args.root_cause.file}${loc}${fn}`);
    lines.push(`  ${args.root_cause.description}`);
  }

  if (args.key_files.length > 0) {
    lines.push('');
    lines.push('Key Files:');
    args.key_files.forEach((f) => {
      const loc = f.lines ? ` (L${f.lines})` : '';
      lines.push(`  - ${f.path}${loc}: ${f.reason}`);
    });
  }

  if (args.suggested_fix) {
    lines.push('');
    lines.push(`Suggested Fix: ${args.suggested_fix}`);
  }

  lines.push('');
  lines.push(`Confidence: ${Math.round(args.confidence * 100)}% | Analyzed by NexusBrain Developer Jarvis`);

  return lines.join('\n');
}
