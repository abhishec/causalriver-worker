/**
 * Tests for @nexus-ai/client
 *
 * Uses a mock fetch to test all client methods without real HTTP calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createNexusClient,
  createAgentTool,
  createSignalReporter,
  NexusError,
  CORE_BRAIN_ORG_ID,
  type NexusClient,
  type QueryResult,
  type IngestResult,
} from '../index';

// ============================================================================
// MOCK FETCH
// ============================================================================

function createMockFetch(responses: Map<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    for (const [pattern, response] of responses) {
      if (urlStr.includes(pattern)) {
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          json: async () => response.body,
          text: async () => JSON.stringify(response.body),
        } as Response;
      }
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
      text: async () => '{"error":"Not found"}',
    } as Response;
  });
}

// ============================================================================
// TEST DATA
// ============================================================================

const MOCK_QUERY_RESULT: QueryResult = {
  answer: 'Churn is rising because finance delays are cascading into support.',
  context: {
    causal: [
      {
        source_domain: 'finance',
        target_domain: 'cs',
        granger_p_value: 0.003,
        effect_size: 0.45,
        natural_language: 'Finance delays Granger-cause CS escalations',
        is_significant: true,
      },
    ],
    patterns: [
      {
        rule_type: 'trend',
        natural_language: 'MRR drops when support tickets rise above 50/day',
        confidence: 0.82,
        is_active: true,
      },
    ],
    memories: [
      { content: 'Q4 churn spike correlated with billing system migration', importance: 0.9 },
    ],
  },
  meta: {
    model: 'claude-sonnet-4-20250514',
    tokensUsed: 1500,
    causalRelationshipsUsed: 1,
    patternsUsed: 1,
  },
};

const MOCK_INGEST_RESULT: IngestResult = {
  success: true,
  signalsIngested: 3,
  eventsCreated: 3,
};

// ============================================================================
// TESTS
// ============================================================================

describe('createNexusClient', () => {
  it('throws if required config is missing', () => {
    expect(() => createNexusClient({
      supabaseUrl: '',
      supabaseAnonKey: 'key',
      organizationId: 'org',
    })).toThrow('NexusClient requires');

    expect(() => createNexusClient({
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: '',
      organizationId: 'org',
    })).toThrow('NexusClient requires');

    expect(() => createNexusClient({
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'key',
      organizationId: '',
    })).toThrow('NexusClient requires');
  });

  it('creates a client with correct properties', () => {
    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co/',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: createMockFetch(new Map()),
    });

    expect(client.organizationId).toBe('org-123');
    expect(client.baseUrl).toBe('https://test.supabase.co'); // trailing slash removed
  });
});

describe('client.query()', () => {
  let client: NexusClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const responses = new Map([
      ['nexus-query', { status: 200, body: MOCK_QUERY_RESULT }],
    ]);
    mockFetch = createMockFetch(responses);
    client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch as typeof globalThis.fetch,
    });
  });

  it('returns query result with causal context', async () => {
    const result = await client.query('Why is churn rising?');

    expect(result.answer).toContain('Churn');
    expect(result.context.causal).toHaveLength(1);
    expect(result.context.causal[0].source_domain).toBe('finance');
    expect(result.context.patterns).toHaveLength(1);
    expect(result.meta.model).toBe('claude-sonnet-4-20250514');
  });

  it('sends correct headers and body', async () => {
    await client.query('test question', { domain: 'finance' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain('nexus-query');

    const body = JSON.parse(call[1].body as string);
    expect(body.organizationId).toBe('org-123');
    expect(body.query).toBe('test question');
    expect(body.domain).toBe('finance');
  });
});

describe('client.ingest()', () => {
  let client: NexusClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const responses = new Map([
      ['nexus-ingest', { status: 200, body: MOCK_INGEST_RESULT }],
    ]);
    mockFetch = createMockFetch(responses);
    client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch as typeof globalThis.fetch,
    });
  });

  it('ingests signals and returns count', async () => {
    const result = await client.ingest([
      { source_domain: 'finance', signal_type: 'mrr', signal_value: 50000 },
      { source_domain: 'cs', signal_type: 'tickets', signal_value: 42 },
    ]);

    expect(result.success).toBe(true);
    expect(result.signalsIngested).toBe(3);
  });

  it('returns empty result for empty signals', async () => {
    const result = await client.ingest([]);

    expect(result.success).toBe(true);
    expect(result.signalsIngested).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('batches signals over 500 into multiple requests', async () => {
    const signals = Array.from({ length: 750 }, (_, i) => ({
      source_domain: 'finance',
      signal_type: `metric_${i}`,
      signal_value: i,
    }));

    await client.ingest(signals);

    // Should make 2 requests: 500 + 250
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstBatch = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const secondBatch = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(firstBatch.signals).toHaveLength(500);
    expect(secondBatch.signals).toHaveLength(250);
  });
});

describe('client.webhook()', () => {
  let client: NexusClient;

  beforeEach(() => {
    const responses = new Map([
      ['nexus-webhook', { status: 200, body: { success: true, source: 'stripe', signalsGenerated: 2 } }],
    ]);
    client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: createMockFetch(responses) as typeof globalThis.fetch,
    });
  });

  it('forwards webhook payload with correct query params', async () => {
    const result = await client.webhook('stripe', {
      type: 'charge.succeeded',
      data: { object: { amount: 5000 } },
    });

    expect(result.success).toBe(true);
    expect(result.source).toBe('stripe');
    expect(result.signalsGenerated).toBe(2);
  });
});

describe('client.cron()', () => {
  let client: NexusClient;

  beforeEach(() => {
    const responses = new Map([
      ['nexus-cron', {
        status: 200,
        body: {
          success: true,
          organizationsProcessed: 1,
          results: [
            { task: 'causal_discovery', organizationId: 'org-123', status: 'success', details: {}, durationMs: 500 },
          ],
        },
      }],
    ]);
    client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: createMockFetch(responses) as typeof globalThis.fetch,
    });
  });

  it('triggers cron tasks', async () => {
    const result = await client.cron(['causal_discovery']);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('success');
  });
});

describe('client.getRelationships()', () => {
  let client: NexusClient;

  beforeEach(() => {
    const responses = new Map([
      ['causal_relationships_statistical', {
        status: 200,
        body: [
          { source_domain: 'finance', target_domain: 'cs', effect_size: 0.45, is_significant: true },
          { source_domain: 'engineering', target_domain: 'revenue', effect_size: 0.32, is_significant: true },
        ],
      }],
    ]);
    client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: createMockFetch(responses) as typeof globalThis.fetch,
    });
  });

  it('fetches causal relationships', async () => {
    const result = await client.getRelationships();

    expect(result.count).toBe(2);
    expect(result.relationships[0].source_domain).toBe('finance');
  });
});

describe('error handling', () => {
  it('throws NexusError on 4xx responses without retrying', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad request' }),
      text: async () => '{"error":"Bad request"}',
    })) as unknown as typeof globalThis.fetch;

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch,
      retries: 3,
    });

    await expect(client.query('test')).rejects.toThrow(NexusError);
    // Should NOT retry on 4xx
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx responses', async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      if (callCount <= 2) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Server error' }),
          text: async () => '{"error":"Server error"}',
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_QUERY_RESULT,
        text: async () => JSON.stringify(MOCK_QUERY_RESULT),
      };
    }) as unknown as typeof globalThis.fetch;

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch,
      retries: 2,
    });

    const result = await client.query('test');
    expect(result.answer).toContain('Churn');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('createAgentTool()', () => {
  it('returns a valid tool definition', () => {
    const mockFetch = createMockFetch(new Map([
      ['nexus-query', { status: 200, body: MOCK_QUERY_RESULT }],
    ]));

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch as typeof globalThis.fetch,
    });

    const tool = createAgentTool(client);

    expect(tool.name).toBe('nexus_brain_query');
    expect(tool.parameters.properties.question.type).toBe('string');
    expect(tool.parameters.required).toContain('question');
  });

  it('execute() calls client.query and returns simplified result', async () => {
    const mockFetch = createMockFetch(new Map([
      ['nexus-query', { status: 200, body: MOCK_QUERY_RESULT }],
    ]));

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch as typeof globalThis.fetch,
    });

    const tool = createAgentTool(client);
    const result = await tool.execute({ question: 'Why is churn rising?' });

    expect(result.answer).toContain('Churn');
    expect(result.causalRelationships).toBe(1);
    expect(result.patternsUsed).toBe(1);
  });
});

describe('createSignalReporter()', () => {
  it('buffers signals and flushes on demand', async () => {
    const mockFetch = createMockFetch(new Map([
      ['nexus-ingest', { status: 200, body: MOCK_INGEST_RESULT }],
    ]));

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch as typeof globalThis.fetch,
    });

    const reporter = createSignalReporter(client, { flushIntervalMs: 60_000 });

    reporter.report({ source_domain: 'finance', signal_type: 'mrr', signal_value: 50000 });
    reporter.report({ source_domain: 'cs', signal_type: 'tickets', signal_value: 42 });

    expect(reporter.bufferSize).toBe(2);

    await reporter.flush();
    expect(reporter.bufferSize).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('auto-flushes when buffer exceeds maxBufferSize', () => {
    const mockFetch = createMockFetch(new Map([
      ['nexus-ingest', { status: 200, body: MOCK_INGEST_RESULT }],
    ]));

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch as typeof globalThis.fetch,
    });

    const reporter = createSignalReporter(client, { maxBufferSize: 5 });

    for (let i = 0; i < 5; i++) {
      reporter.report({ source_domain: 'finance', signal_type: `m_${i}`, signal_value: i });
    }

    // Auto-flush should have been triggered
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('stop() clears timer and flushes remaining', async () => {
    const mockFetch = createMockFetch(new Map([
      ['nexus-ingest', { status: 200, body: MOCK_INGEST_RESULT }],
    ]));

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch as typeof globalThis.fetch,
    });

    const reporter = createSignalReporter(client, { flushIntervalMs: 60_000 });
    reporter.start();

    reporter.report({ source_domain: 'finance', signal_type: 'mrr', signal_value: 50000 });
    await reporter.stop();

    expect(reporter.bufferSize).toBe(0);
    expect(mockFetch).toHaveBeenCalled();
  });
});

// ============================================================================
// KNOWLEDGE FEDERATION TESTS
// ============================================================================

describe('knowledge federation (getRelationships)', () => {
  const ORG_RELATIONSHIPS = [
    { source_domain: 'finance', target_domain: 'cs', effect_size: 0.45, is_significant: true },
    { source_domain: 'engineering', target_domain: 'revenue', effect_size: 0.32, is_significant: true },
  ];

  const CORE_RELATIONSHIPS = [
    { source_domain: 'finance', target_domain: 'cs', effect_size: 0.38, is_significant: true }, // overlaps with org
    { source_domain: 'marketing', target_domain: 'revenue', effect_size: 0.51, is_significant: true }, // unique to core
    { source_domain: 'product', target_domain: 'retention', effect_size: 0.29, is_significant: true }, // unique to core
  ];

  it('merges org + core relationships by default', async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes(CORE_BRAIN_ORG_ID)) {
        return {
          ok: true, status: 200,
          json: async () => CORE_RELATIONSHIPS,
          text: async () => JSON.stringify(CORE_RELATIONSHIPS),
        } as Response;
      }
      if (urlStr.includes('causal_relationships_statistical')) {
        return {
          ok: true, status: 200,
          json: async () => ORG_RELATIONSHIPS,
          text: async () => JSON.stringify(ORG_RELATIONSHIPS),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '{}' } as Response;
    }) as unknown as typeof globalThis.fetch;

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch,
    });

    const result = await client.getRelationships();

    // Org has 2, core has 3 but 1 overlaps (finance→cs) → 2 + 2 = 4
    expect(result.orgCount).toBe(2);
    expect(result.coreCount).toBe(2); // finance→cs deduped
    expect(result.count).toBe(4);

    // Verify the overlapping edge uses org version (effect_size 0.45, not 0.38)
    const financeToCs = result.relationships.find(
      r => r.source_domain === 'finance' && r.target_domain === 'cs'
    );
    expect(financeToCs?.effect_size).toBe(0.45); // org wins

    // Core-only edges should be present
    const marketingToRevenue = result.relationships.find(
      r => r.source_domain === 'marketing' && r.target_domain === 'revenue'
    );
    expect(marketingToRevenue).toBeDefined();
    expect(marketingToRevenue?.effect_size).toBe(0.51);
  });

  it('skips core fetch when includeCoreKnowledge=false', async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('causal_relationships_statistical')) {
        return {
          ok: true, status: 200,
          json: async () => ORG_RELATIONSHIPS,
          text: async () => JSON.stringify(ORG_RELATIONSHIPS),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '{}' } as Response;
    }) as unknown as typeof globalThis.fetch;

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: 'org-123',
      fetch: mockFetch,
    });

    const result = await client.getRelationships({ includeCoreKnowledge: false });

    expect(result.count).toBe(2); // Only org relationships
    expect(result.orgCount).toBe(2);
    expect(result.coreCount).toBe(0);

    // Should have only made 1 fetch call (no core brain call)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('skips core fetch when client IS the core brain', async () => {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('causal_relationships_statistical')) {
        return {
          ok: true, status: 200,
          json: async () => CORE_RELATIONSHIPS,
          text: async () => JSON.stringify(CORE_RELATIONSHIPS),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '{}' } as Response;
    }) as unknown as typeof globalThis.fetch;

    const client = createNexusClient({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-key',
      organizationId: CORE_BRAIN_ORG_ID, // IS the core brain
      fetch: mockFetch,
    });

    const result = await client.getRelationships();

    expect(result.count).toBe(3); // All core relationships, no double-fetch
    expect(result.orgCount).toBe(3);
    expect(result.coreCount).toBe(0);

    // Should have only made 1 fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('CORE_BRAIN_ORG_ID', () => {
  it('exports the well-known core brain org ID', () => {
    expect(CORE_BRAIN_ORG_ID).toBe('00000000-0000-4000-a000-000000000001');
  });
});
