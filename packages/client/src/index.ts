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
}

export interface BrainRule {
  id?: string;
  rule_type?: string;
  natural_language?: string;
  confidence?: number;
  is_active?: boolean;
}

export interface Memory {
  id?: string;
  content?: string;
  importance?: number;
  memory_type?: string;
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
}

export interface NexusClient {
  /** Query the brain with natural language — returns AI answer enriched with causal context */
  query(question: string, options?: { domain?: string; agentType?: string }): Promise<QueryResult>;

  /** Ingest signals into the brain — triggers causal discovery on next learning cycle */
  ingest(signals: Signal[]): Promise<IngestResult>;

  /** Forward a webhook payload (Stripe, HubSpot, Intercom) — auto-transforms to signals */
  webhook(source: 'stripe' | 'hubspot' | 'intercom' | 'zendesk' | 'support', payload: unknown): Promise<WebhookResult>;

  /** Trigger scheduled tasks (causal_discovery, prediction_verification, etc.) */
  cron(tasks?: string[]): Promise<CronResult>;

  /** Fetch discovered causal relationships for this org */
  getRelationships(options?: { limit?: number; minEffectSize?: number }): Promise<RelationshipsResult>;

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

      let url = `${baseUrl}/rest/v1/causal_relationships_statistical?organization_id=eq.${organizationId}&is_significant=eq.true&order=effect_size.desc&limit=${limit}`;
      if (minEffect > 0) {
        url += `&effect_size=gte.${minEffect}`;
      }

      const response = await fetchFn(url, {
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new NexusError(
          `getRelationships failed (${response.status})`,
          response.status,
          'getRelationships',
        );
      }

      const relationships = await response.json() as CausalRelationship[];
      return { relationships, count: relationships.length };
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

/**
 * Create a tool definition for AI agents (OpenAI function calling format).
 *
 * Returns a tool spec that any LLM agent framework can use to query NexusBrain.
 * Works with LangChain, CrewAI, AutoGen, Vercel AI SDK, and raw OpenAI tool_use.
 */
export function createAgentTool(client: NexusClient) {
  return {
    name: 'nexus_brain_query',
    description: 'Query organizational intelligence. Returns AI-powered answers enriched with discovered causal relationships, learned patterns, and organizational memory. Use this when you need to understand cross-domain business dynamics, predict cascading effects, or get data-driven strategic insights.',
    parameters: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string' as const,
          description: 'The question to ask the organizational brain',
        },
        domain: {
          type: 'string' as const,
          description: 'Optional domain filter (finance, engineering, cs, marketing, people, revenue)',
          enum: ['finance', 'engineering', 'cs', 'marketing', 'people', 'revenue'],
        },
      },
      required: ['question'] as const,
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
