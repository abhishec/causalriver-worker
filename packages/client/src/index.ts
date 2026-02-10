/**
 * @nexus-ai/client — Lightweight HTTP client for NexusBrain
 *
 * Zero dependencies. Works in Node.js, Deno, Bun, and browsers.
 * Wraps the 4 Supabase edge functions (query, ingest, webhook, cron)
 * into a clean TypeScript API that any app or agent can use.
 *
 * Usage:
 *   import { createNexusClient } from '@nexus-ai/client'
 *
 *   const brain = createNexusClient({
 *     supabaseUrl: 'https://xxx.supabase.co',
 *     supabaseAnonKey: 'ey...',
 *     organizationId: 'org_123',
 *   })
 *
 *   // Query the brain
 *   const answer = await brain.query('Why is churn rising?')
 *
 *   // Ingest signals
 *   await brain.ingest([
 *     { source_domain: 'finance', signal_type: 'mrr', signal_value: 50000 },
 *   ])
 *
 * @packageDocumentation
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * The core brain — trained on Wikipedia, FRED, IMF, GitHub, World Bank, etc.
 * All organizations inherit this knowledge as a baseline via query-time federation.
 */
export const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// TYPES
// ============================================================================

export interface NexusClientConfig {
  /** Supabase project URL (e.g. https://xxx.supabase.co) */
  supabaseUrl: string;

  /** Supabase anon key or service role key */
  supabaseAnonKey: string;

  /** Organization ID — all operations are scoped to this org */
  organizationId: string;

  /** Custom fetch implementation (defaults to globalThis.fetch) */
  fetch?: typeof globalThis.fetch;

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Retry failed requests up to N times (default: 1) */
  retries?: number;
}

export interface Signal {
  source_domain: string;
  signal_type: string;
  signal_value: number;
  /** When the signal occurred (defaults to now if omitted) */
  signal_timestamp?: string | Date;
  entity_type?: string;
  entity_id?: string;
  client_id?: string;
  metadata?: Record<string, unknown>;
}

export interface QueryResult {
  answer: string;
  context: {
    causal: CausalRelationship[];
    patterns: BrainRule[];
    memories: Memory[];
  };
  meta: {
    model?: string;
    tokensUsed?: number;
    causalRelationshipsUsed?: number;
    patternsUsed?: number;
    llmConfigured?: boolean;
    federated?: boolean;
    orgSpecificRelationships?: number;
    coreBrainRelationships?: number;
  };
}

export interface CausalRelationship {
  id?: string;
  source_domain: string;
  target_domain: string;
  granger_f_statistic?: number;
  granger_p_value?: number;
  optimal_lag_days?: number;
  effect_size?: number;
  natural_language?: string;
  is_significant?: boolean;
  evidence_weight?: number;
  /** Source: 'org' (organization-specific) or 'core' (universal knowledge base) */
  _source?: 'org' | 'core';
}

export interface BrainRule {
  id?: string;
  rule_type?: string;
  natural_language?: string;
  confidence?: number;
  is_active?: boolean;
  /** Source: 'org' (organization-specific) or 'core' (universal knowledge base) */
  _source?: 'org' | 'core';
}

export interface Memory {
  id?: string;
  content?: string;
  importance?: number;
  memory_type?: string;
  /** Source: 'org' (organization-specific) or 'core' (universal knowledge base) */
  _source?: 'org' | 'core';
}

export interface IngestResult {
  success: boolean;
  signalsIngested: number;
  eventsCreated: number;
}

export interface WebhookResult {
  success: boolean;
  source: string;
  signalsGenerated: number;
}

export interface CronResult {
  success: boolean;
  organizationsProcessed: number;
  results: Array<{
    task: string;
    organizationId: string;
    status: 'success' | 'skipped' | 'error';
    details: Record<string, unknown>;
    durationMs: number;
  }>;
}

export interface RelationshipsResult {
  relationships: CausalRelationship[];
  count: number;
  /** Number of relationships from this org specifically */
  orgCount?: number;
  /** Number of relationships from the core brain (universal knowledge) */
  coreCount?: number;
}

// ============================================================================
// COPILOT v2 TYPES (Agentic)
// ============================================================================

export interface CopilotToolCall {
  tool: string;
  input: Record<string, unknown>;
  result_summary: string;
}

export interface CopilotComplexity {
  level: 'simple' | 'moderate' | 'complex';
  score: number;
  reasons: string[];
}

export interface CopilotResult {
  answer: string;
  /** Which execution path was used */
  path: 'fast' | 'agentic';
  /** Complexity assessment from the router */
  complexity?: CopilotComplexity;
  /** All tool calls made during the agentic loop */
  toolCalls: CopilotToolCall[];
  /** Self-correction result (if applicable) */
  selfCorrection?: {
    corrected: boolean;
    correction?: string;
    status?: string;
  };
  context?: {
    causal: CausalRelationship[];
    patterns: BrainRule[];
    memories: Memory[];
  };
  meta: {
    model?: string;
    tokensUsed?: number;
    toolCallsCount?: number;
    toolsUsed?: string[];
    agenticRounds?: number;
    federated?: boolean;
    /** Which brain layers (L1-L7) were queried */
    layersAccessed?: string[];
    complexity?: string;
  };
}

/** SSE event types emitted by the copilot stream */
export type CopilotStreamEvent =
  | { event: 'complexity'; data: CopilotComplexity & { suggestedTools: string[] } }
  | { event: 'thinking'; data: { round: number | string; status: string } }
  | { event: 'thinking_text'; data: { text: string } }
  | { event: 'tool_call'; data: { tool: string; input: Record<string, unknown>; round: number } }
  | { event: 'tool_result'; data: { tool: string; result_summary: string } }
  | { event: 'answer_chunk'; data: { text: string } }
  | { event: 'self_correction'; data: { correction?: string; status?: string; message?: string } }
  | { event: 'done'; data: { answer: string; toolCallsCount: number; tokensUsed: number; complexity: string; federated: boolean } }
  | { event: 'error'; data: { message: string } };

export interface CopilotStreamOptions {
  /** Called for each SSE event */
  onEvent?: (event: CopilotStreamEvent) => void;
  /** Called when a tool is called */
  onToolCall?: (tool: string, input: Record<string, unknown>) => void;
  /** Called when an answer chunk arrives (for progressive rendering) */
  onAnswerChunk?: (text: string) => void;
  /** Called when thinking text arrives */
  onThinking?: (text: string) => void;
  /** Called when self-correction happens */
  onSelfCorrection?: (correction: string) => void;
  /** Called on completion */
  onDone?: (result: { answer: string; toolCallsCount: number; tokensUsed: number }) => void;
  /** Called on error */
  onError?: (error: Error) => void;
  /** AbortSignal to cancel the stream */
  signal?: AbortSignal;
}

export interface NexusClient {
  /** Query the brain with natural language — returns AI answer enriched with causal context */
  query(question: string, options?: { domain?: string; agentType?: string }): Promise<QueryResult>;

  /**
   * Copilot v2 — Agentic query with 7-layer tool access.
   * Claude autonomously queries the brain's layers, traces cascades,
   * and self-corrects against causal evidence.
   *
   * Simple queries → fast path (context + single LLM call)
   * Complex queries → agentic path (Claude + tools + multi-turn loop)
   */
  copilot(question: string, options?: {
    domain?: string;
    conversationId?: string;
  }): Promise<CopilotResult>;

  /**
   * Copilot v2 with SSE streaming — progressive answer delivery.
   * Returns an async iterator of events (thinking, tool_calls, answer_chunks).
   * Use callbacks for real-time UI updates.
   */
  copilotStream(question: string, options?: {
    domain?: string;
    conversationId?: string;
  }, streamOptions?: CopilotStreamOptions): Promise<CopilotResult>;

  /** Ingest signals into the brain — triggers causal discovery on next learning cycle */
  ingest(signals: Signal[]): Promise<IngestResult>;

  /** Forward a webhook payload (Stripe, HubSpot, Intercom) — auto-transforms to signals */
  webhook(source: 'stripe' | 'hubspot' | 'intercom' | 'zendesk' | 'support', payload: unknown): Promise<WebhookResult>;

  /**
   * Trigger scheduled maintenance tasks (prediction_verification, threshold_optimization, evidence_decay).
   * Note: causal_discovery runs via the autonomous trainer using the full calibrated_ensemble engine.
   */
  cron(tasks?: string[]): Promise<CronResult>;

  /** Fetch discovered causal relationships — includes core brain knowledge by default */
  getRelationships(options?: {
    limit?: number;
    minEffectSize?: number;
    /** Include universal knowledge from the core brain (default: true) */
    includeCoreKnowledge?: boolean;
  }): Promise<RelationshipsResult>;

  /** Get the organization ID this client is scoped to */
  readonly organizationId: string;

  /** Get the base URL this client connects to */
  readonly baseUrl: string;
}

// ============================================================================
// CLIENT IMPLEMENTATION
// ============================================================================

/**
 * Create a NexusBrain client.
 *
 * This is the main entry point for integrating NexusBrain into any app or agent.
 * All operations go through Supabase edge functions — no direct DB access needed.
 */
export function createNexusClient(config: NexusClientConfig): NexusClient {
  const {
    supabaseUrl,
    supabaseAnonKey,
    organizationId,
    timeout = 30_000,
    retries = 1,
  } = config;

  const fetchFn = config.fetch ?? globalThis.fetch;

  if (!supabaseUrl || !supabaseAnonKey || !organizationId) {
    throw new Error('NexusClient requires supabaseUrl, supabaseAnonKey, and organizationId');
  }

  // Normalize URL (strip trailing slash)
  const baseUrl = supabaseUrl.replace(/\/+$/, '');

  // ── Internal HTTP helper ──

  async function request<T>(
    functionName: string,
    body: unknown,
    queryParams?: Record<string, string>,
  ): Promise<T> {
    let url = `${baseUrl}/functions/v1/${functionName}`;
    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const errorBody = await response.text();
          let errorMessage: string;
          try {
            const parsed = JSON.parse(errorBody);
            errorMessage = parsed.error || parsed.message || errorBody;
          } catch {
            errorMessage = errorBody;
          }
          throw new NexusError(
            `${functionName} failed (${response.status}): ${errorMessage}`,
            response.status,
            functionName,
          );
        }

        return await response.json() as T;
      } catch (err) {
        clearTimeout(timer);

        if (err instanceof NexusError) {
          // Don't retry client errors (4xx)
          if (err.statusCode >= 400 && err.statusCode < 500) throw err;
        }

        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry on last attempt
        if (attempt === retries) break;

        // Exponential backoff: 200ms, 400ms, 800ms...
        await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
      }
    }

    throw lastError ?? new Error(`${functionName} failed after ${retries + 1} attempts`);
  }

  // ── Public API ──

  return {
    get organizationId() {
      return organizationId;
    },

    get baseUrl() {
      return baseUrl;
    },

    async query(question, options) {
      return request<QueryResult>('nexus-query', {
        organizationId,
        query: question,
        domain: options?.domain,
        agentType: options?.agentType,
      });
    },

    async copilot(question, options) {
      return request<CopilotResult>('nexus-copilot', {
        organizationId,
        query: question,
        domain: options?.domain,
        conversationId: options?.conversationId,
        stream: false,
      });
    },

    async copilotStream(question, options, streamOptions) {
      const url = `${baseUrl}/functions/v1/nexus-copilot`;
      const controller = new AbortController();
      const combinedSignal = streamOptions?.signal;

      if (combinedSignal) {
        combinedSignal.addEventListener('abort', () => controller.abort());
      }

      const timer = setTimeout(() => controller.abort(), timeout * 3); // 3x timeout for streaming

      let fullAnswer = '';
      let totalTokens = 0;
      let toolCallsCount = 0;

      try {
        const response = await fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify({
            organizationId,
            query: question,
            domain: options?.domain,
            conversationId: options?.conversationId,
            stream: true,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const errorBody = await response.text();
          throw new NexusError(`nexus-copilot stream failed (${response.status}): ${errorBody}`, response.status, 'copilotStream');
        }

        // If the response is JSON (fast path returned JSON instead of SSE)
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const result = await response.json() as CopilotResult;
          streamOptions?.onDone?.({ answer: result.answer, toolCallsCount: result.toolCalls.length, tokensUsed: result.meta.tokensUsed || 0 });
          return result;
        }

        // Parse SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new NexusError('No response body for stream', 500, 'copilotStream');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          let currentEvent = '';
          let currentData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6);

              if (currentEvent && currentData) {
                try {
                  const parsed = JSON.parse(currentData);
                  const sseEvent = { event: currentEvent, data: parsed } as CopilotStreamEvent;
                  streamOptions?.onEvent?.(sseEvent);

                  // Route to specific callbacks
                  switch (currentEvent) {
                    case 'answer_chunk':
                      fullAnswer += parsed.text;
                      streamOptions?.onAnswerChunk?.(parsed.text);
                      break;
                    case 'thinking_text':
                      streamOptions?.onThinking?.(parsed.text);
                      break;
                    case 'tool_call':
                      streamOptions?.onToolCall?.(parsed.tool, parsed.input);
                      break;
                    case 'self_correction':
                      if (parsed.correction) {
                        streamOptions?.onSelfCorrection?.(parsed.correction);
                      }
                      break;
                    case 'done':
                      fullAnswer = parsed.answer || fullAnswer;
                      totalTokens = parsed.tokensUsed || 0;
                      toolCallsCount = parsed.toolCallsCount || 0;
                      streamOptions?.onDone?.({
                        answer: fullAnswer,
                        toolCallsCount,
                        tokensUsed: totalTokens,
                      });
                      break;
                    case 'error':
                      streamOptions?.onError?.(new Error(parsed.message));
                      break;
                  }
                } catch {
                  // Skip unparseable events
                }
                currentEvent = '';
                currentData = '';
              }
            } else if (line === '') {
              currentEvent = '';
              currentData = '';
            }
          }
        }
      } catch (err) {
        clearTimeout(timer);
        const error = err instanceof Error ? err : new Error(String(err));
        streamOptions?.onError?.(error);
        if (err instanceof NexusError) throw err;
        throw new NexusError(error.message, 500, 'copilotStream');
      }

      return {
        answer: fullAnswer,
        path: 'agentic' as const,
        toolCalls: [],
        meta: { tokensUsed: totalTokens, toolCallsCount },
      };
    },

    async ingest(signals) {
      if (signals.length === 0) {
        return { success: true, signalsIngested: 0, eventsCreated: 0 };
      }

      // Chunk into batches of 500 (API limit)
      const results: IngestResult[] = [];
      for (let i = 0; i < signals.length; i += 500) {
        const batch = signals.slice(i, i + 500);
        const result = await request<IngestResult>('nexus-ingest', {
          organizationId,
          signals: batch,
        });
        results.push(result);
      }

      return {
        success: results.every(r => r.success),
        signalsIngested: results.reduce((sum, r) => sum + r.signalsIngested, 0),
        eventsCreated: results.reduce((sum, r) => sum + r.eventsCreated, 0),
      };
    },

    async webhook(source, payload) {
      return request<WebhookResult>('nexus-webhook', payload, {
        source,
        org: organizationId,
      });
    },

    async cron(tasks) {
      return request<CronResult>('nexus-cron', {
        organizationId,
        tasks,
      });
    },

    async getRelationships(options) {
      // Direct Supabase REST API query for causal relationships
      const limit = options?.limit ?? 20;
      const minEffect = options?.minEffectSize ?? 0;
      const includeCoreKnowledge = options?.includeCoreKnowledge ?? true;

      const headers = {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
        'Accept': 'application/json',
      };

      let orgUrl = `${baseUrl}/rest/v1/causal_relationships_statistical?organization_id=eq.${organizationId}&is_significant=eq.true&order=effect_size.desc&limit=${limit}`;
      if (minEffect > 0) {
        orgUrl += `&effect_size=gte.${minEffect}`;
      }

      // Fetch org relationships
      const orgResponse = await fetchFn(orgUrl, { headers });
      if (!orgResponse.ok) {
        throw new NexusError(
          `getRelationships failed (${orgResponse.status})`,
          orgResponse.status,
          'getRelationships',
        );
      }
      const orgRelationships = await orgResponse.json() as CausalRelationship[];

      // Optionally fetch core brain relationships and merge
      if (includeCoreKnowledge && organizationId !== CORE_BRAIN_ORG_ID) {
        let coreUrl = `${baseUrl}/rest/v1/causal_relationships_statistical?organization_id=eq.${CORE_BRAIN_ORG_ID}&is_significant=eq.true&order=effect_size.desc&limit=${limit}`;
        if (minEffect > 0) {
          coreUrl += `&effect_size=gte.${minEffect}`;
        }

        const coreResponse = await fetchFn(coreUrl, { headers });
        if (coreResponse.ok) {
          const coreRelationships = await coreResponse.json() as CausalRelationship[];
          // Dedup: org edges take priority over core brain edges
          const orgKeys = new Set(orgRelationships.map(
            r => `${r.source_domain}::${r.target_domain}`,
          ));
          const taggedOrg = orgRelationships.map(r => ({ ...r, _source: 'org' as const }));
          const uniqueCore = coreRelationships
            .filter(r => !orgKeys.has(`${r.source_domain}::${r.target_domain}`))
            .map(r => ({ ...r, _source: 'core' as const }));
          const merged = [...taggedOrg, ...uniqueCore];
          return {
            relationships: merged,
            count: merged.length,
            orgCount: taggedOrg.length,
            coreCount: uniqueCore.length,
          };
        }
        // If core fetch fails, fall through to org-only result
      }

      const taggedOrgOnly = orgRelationships.map(r => ({ ...r, _source: 'org' as const }));
      return {
        relationships: taggedOrgOnly,
        count: taggedOrgOnly.length,
        orgCount: taggedOrgOnly.length,
        coreCount: 0,
      };
    },
  };
}

// ============================================================================
// ERROR CLASS
// ============================================================================

export class NexusError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly functionName: string,
  ) {
    super(message);
    this.name = 'NexusError';
  }
}

// ============================================================================
// CONVENIENCE: Agent Integration Helpers
// ============================================================================

// ── Tool schema shared across all formats ──

const QUERY_TOOL_SCHEMA = {
  name: 'nexus_brain_query',
  description: 'Query organizational intelligence. Returns AI-powered answers enriched with discovered causal relationships, learned patterns, and organizational memory.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      question: {
        type: 'string' as const,
        description: 'The question to ask the organizational brain',
      },
      domain: {
        type: 'string' as const,
        description: 'Optional domain filter',
        enum: ['finance', 'engineering', 'cs', 'marketing', 'people', 'revenue'],
      },
    },
    required: ['question'] as const,
  },
};

const INGEST_TOOL_SCHEMA = {
  name: 'nexus_brain_ingest',
  description: 'Send business signals to NexusBrain for causal analysis. Signals are cross-domain data points (revenue, support tickets, deployments, etc.) that the brain analyzes for causal relationships.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      signals: {
        type: 'array' as const,
        description: 'Array of signals to ingest',
        items: {
          type: 'object' as const,
          properties: {
            source_domain: { type: 'string' as const, description: 'Business domain (finance, engineering, cs, marketing, people, revenue)' },
            signal_type: { type: 'string' as const, description: 'Signal name (e.g. mrr, tickets, deploys)' },
            signal_value: { type: 'number' as const, description: 'Numeric value of the signal' },
          },
          required: ['source_domain', 'signal_type', 'signal_value'] as const,
        },
      },
    },
    required: ['signals'] as const,
  },
};

const RELATIONSHIPS_TOOL_SCHEMA = {
  name: 'nexus_brain_relationships',
  description: 'Retrieve discovered causal relationships between business domains. Returns statistically significant causal edges with effect sizes, confidence intervals, and lag information.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      limit: { type: 'number' as const, description: 'Maximum relationships to return (default: 20)' },
      min_effect_size: { type: 'number' as const, description: 'Minimum effect size filter (default: 0)' },
    },
    required: [] as const,
  },
};

/**
 * Create tool definitions for AI agents — OpenAI function calling format.
 *
 * Returns a tool spec that any LLM agent framework can use to query NexusBrain.
 * Works with LangChain, CrewAI, AutoGen, and raw OpenAI tool_use.
 *
 * @example
 * ```ts
 * const tool = createAgentTool(brain)
 * const result = await tool.execute({ question: 'Why is churn rising?' })
 * ```
 */
export function createAgentTool(client: NexusClient) {
  return {
    name: QUERY_TOOL_SCHEMA.name,
    description: QUERY_TOOL_SCHEMA.description,
    parameters: {
      type: QUERY_TOOL_SCHEMA.inputSchema.type,
      properties: QUERY_TOOL_SCHEMA.inputSchema.properties,
      required: QUERY_TOOL_SCHEMA.inputSchema.required,
    },
    execute: async (args: { question: string; domain?: string }) => {
      const result = await client.query(args.question, { domain: args.domain });
      return {
        answer: result.answer,
        causalRelationships: result.context.causal.length,
        patternsUsed: result.context.patterns.length,
      };
    },
  };
}

/**
 * Create a full toolkit with query, ingest, and relationships tools.
 *
 * Returns all 3 tools in OpenAI function-calling format.
 * Use this when you want your agent to have full read/write access to the brain.
 *
 * @example
 * ```ts
 * const tools = createAgentToolkit(brain)
 * // tools.query   — ask the brain questions
 * // tools.ingest  — feed signals into the brain
 * // tools.relationships — read discovered causal edges
 * ```
 */
export function createAgentToolkit(client: NexusClient) {
  return {
    query: createAgentTool(client),

    ingest: {
      name: INGEST_TOOL_SCHEMA.name,
      description: INGEST_TOOL_SCHEMA.description,
      parameters: {
        type: INGEST_TOOL_SCHEMA.inputSchema.type,
        properties: INGEST_TOOL_SCHEMA.inputSchema.properties,
        required: INGEST_TOOL_SCHEMA.inputSchema.required,
      },
      execute: async (args: { signals: Signal[] }) => {
        const result = await client.ingest(args.signals);
        return { success: result.success, signalsIngested: result.signalsIngested };
      },
    },

    relationships: {
      name: RELATIONSHIPS_TOOL_SCHEMA.name,
      description: RELATIONSHIPS_TOOL_SCHEMA.description,
      parameters: {
        type: RELATIONSHIPS_TOOL_SCHEMA.inputSchema.type,
        properties: RELATIONSHIPS_TOOL_SCHEMA.inputSchema.properties,
        required: RELATIONSHIPS_TOOL_SCHEMA.inputSchema.required,
      },
      execute: async (args: { limit?: number; min_effect_size?: number }) => {
        const result = await client.getRelationships({
          limit: args.limit,
          minEffectSize: args.min_effect_size,
        });
        return {
          relationships: result.relationships.map(r => ({
            cause: r.source_domain,
            effect: r.target_domain,
            strength: r.effect_size,
            lagDays: r.optimal_lag_days,
            description: r.natural_language,
          })),
          count: result.count,
        };
      },
    },
  };
}

/**
 * Create tool definitions in Anthropic Claude tool_use format.
 *
 * Returns an array of tool definitions ready for the Anthropic Messages API.
 *
 * @example
 * ```ts
 * const tools = createAnthropicTools(brain)
 * const response = await anthropic.messages.create({
 *   model: 'claude-sonnet-4-20250514',
 *   tools,
 *   messages: [{ role: 'user', content: 'Why is revenue dropping?' }],
 * })
 * ```
 */
export function createAnthropicTools(client: NexusClient) {
  const toolkit = createAgentToolkit(client);

  return {
    tools: [
      { name: QUERY_TOOL_SCHEMA.name, description: QUERY_TOOL_SCHEMA.description, input_schema: QUERY_TOOL_SCHEMA.inputSchema },
      { name: INGEST_TOOL_SCHEMA.name, description: INGEST_TOOL_SCHEMA.description, input_schema: INGEST_TOOL_SCHEMA.inputSchema },
      { name: RELATIONSHIPS_TOOL_SCHEMA.name, description: RELATIONSHIPS_TOOL_SCHEMA.description, input_schema: RELATIONSHIPS_TOOL_SCHEMA.inputSchema },
    ],

    /** Handle a tool_use block from Claude's response */
    async handleToolCall(toolName: string, toolInput: Record<string, unknown>) {
      switch (toolName) {
        case 'nexus_brain_query':
          return toolkit.query.execute(toolInput as { question: string; domain?: string });
        case 'nexus_brain_ingest':
          return toolkit.ingest.execute(toolInput as { signals: Signal[] });
        case 'nexus_brain_relationships':
          return toolkit.relationships.execute(toolInput as { limit?: number; min_effect_size?: number });
        default:
          throw new NexusError(`Unknown tool: ${toolName}`, 400, 'handleToolCall');
      }
    },
  };
}

/**
 * Create tools for the Vercel AI SDK (ai package).
 *
 * Returns an object of tool definitions compatible with `generateText()` and `streamText()`.
 *
 * @example
 * ```ts
 * import { generateText } from 'ai'
 * const tools = createVercelAITools(brain)
 * const { text } = await generateText({
 *   model: yourModel,
 *   tools,
 *   prompt: 'What causal relationships exist in our data?',
 * })
 * ```
 */
export function createVercelAITools(client: NexusClient) {
  const toolkit = createAgentToolkit(client);

  return {
    nexus_brain_query: {
      description: QUERY_TOOL_SCHEMA.description,
      parameters: QUERY_TOOL_SCHEMA.inputSchema,
      execute: toolkit.query.execute,
    },
    nexus_brain_ingest: {
      description: INGEST_TOOL_SCHEMA.description,
      parameters: INGEST_TOOL_SCHEMA.inputSchema,
      execute: toolkit.ingest.execute,
    },
    nexus_brain_relationships: {
      description: RELATIONSHIPS_TOOL_SCHEMA.description,
      parameters: RELATIONSHIPS_TOOL_SCHEMA.inputSchema,
      execute: toolkit.relationships.execute,
    },
  };
}

/**
 * Create Copilot v2 tools for the Anthropic Claude tool_use format.
 *
 * Returns the 7-layer tool definitions that the copilot edge function uses,
 * along with a handler that proxies tool calls through the client.
 * Useful when you want to run the agentic loop yourself instead of
 * relying on the edge function.
 *
 * @example
 * ```ts
 * const { tools, handleToolCall } = createCopilotTools(brain)
 * const response = await anthropic.messages.create({
 *   model: 'claude-sonnet-4-20250514',
 *   tools,
 *   messages: [{ role: 'user', content: 'Why is churn rising?' }],
 * })
 * // Handle tool_use blocks...
 * ```
 */
export function createCopilotTools(client: NexusClient) {
  const toolkit = createAgentToolkit(client);

  return {
    tools: [
      ...createAnthropicTools(client).tools,
      {
        name: 'nexus_copilot_query',
        description: 'Agentic query to the organizational brain. Claude autonomously queries all 7 layers (semantic memory, causal engine, pattern memory, domain agents, intelligence) and self-corrects against causal evidence. Use this for complex cross-domain questions.',
        input_schema: {
          type: 'object' as const,
          properties: {
            question: { type: 'string' as const, description: 'The question to ask the organizational brain' },
            domain: { type: 'string' as const, description: 'Optional domain filter', enum: ['finance', 'engineering', 'cs', 'marketing', 'people', 'revenue'] },
          },
          required: ['question'] as const,
        },
      },
    ],

    async handleToolCall(toolName: string, toolInput: Record<string, unknown>) {
      if (toolName === 'nexus_copilot_query') {
        const result = await client.copilot(
          toolInput.question as string,
          { domain: toolInput.domain as string | undefined },
        );
        return {
          answer: result.answer,
          complexity: result.complexity,
          toolsUsed: result.meta.toolsUsed,
          layersAccessed: result.meta.layersAccessed,
          selfCorrected: result.selfCorrection?.corrected || false,
        };
      }
      return createAnthropicTools(client).handleToolCall(toolName, toolInput);
    },
  };
}

/**
 * Create a signal reporter for instrumenting applications.
 *
 * Returns a simple function that batches and sends signals to NexusBrain.
 * Signals are buffered locally and flushed every `flushIntervalMs`.
 */
export function createSignalReporter(
  client: NexusClient,
  options: {
    /** Flush interval in ms (default: 10000 — every 10 seconds) */
    flushIntervalMs?: number;
    /** Max signals to buffer before auto-flush (default: 100) */
    maxBufferSize?: number;
    /** Called on flush errors */
    onError?: (error: Error) => void;
  } = {},
) {
  const { flushIntervalMs = 10_000, maxBufferSize = 100, onError } = options;
  let buffer: Signal[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0);
    try {
      await client.ingest(batch);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function report(signal: Signal): void {
    buffer.push(signal);
    if (buffer.length >= maxBufferSize) {
      flush();
    }
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(flush, flushIntervalMs);
  }

  function stop(): Promise<void> {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    return flush();
  }

  return { report, flush, start, stop, get bufferSize() { return buffer.length; } };
}
