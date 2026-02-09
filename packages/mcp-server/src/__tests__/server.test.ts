/**
 * Tests for @nexus-ai/mcp-server
 *
 * Mocks the NexusClient to test handler functions without real HTTP calls.
 * Mirrors the testing pattern from @nexus-ai/client.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  handleQuery,
  handleIngest,
  handleRelationships,
  handleWebhook,
  handleCron,
  handleRelationshipsResource,
  buildAnalyzeMetricsPrompt,
  handleError,
  formatRelationship,
  formatRelationshipsText,
} from '../handlers.js';
import type { NexusClient, QueryResult, IngestResult, WebhookResult, CronResult, RelationshipsResult } from '@nexus-ai/client';
import { NexusError } from '@nexus-ai/client';

// ============================================================================
// MOCK CLIENT FACTORY
// ============================================================================

function createMockClient(overrides: Partial<NexusClient> = {}): NexusClient {
  return {
    organizationId: 'test-org-123',
    baseUrl: 'https://test.supabase.co',
    query: vi.fn<NexusClient['query']>(),
    ingest: vi.fn<NexusClient['ingest']>(),
    webhook: vi.fn<NexusClient['webhook']>(),
    cron: vi.fn<NexusClient['cron']>(),
    getRelationships: vi.fn<NexusClient['getRelationships']>(),
    ...overrides,
  } as NexusClient;
}

// ============================================================================
// TEST DATA
// ============================================================================

const MOCK_QUERY_RESULT: QueryResult = {
  answer: 'Churn is rising because engineering deployment frequency increased, causing more support tickets.',
  context: {
    causal: [
      { source_domain: 'engineering', target_domain: 'cs', effect_size: 0.45, granger_p_value: 0.002, optimal_lag_days: 3, natural_language: 'Deployments cause support tickets' },
      { source_domain: 'cs', target_domain: 'revenue', effect_size: 0.32, granger_p_value: 0.01, optimal_lag_days: 7 },
    ],
    patterns: [
      { rule_type: 'cascade', natural_language: 'Engineering instability cascades to customer support within 3 days', confidence: 0.87 },
    ],
    memories: [
      { content: 'Q3 deployment freeze reduced churn by 15%', importance: 0.9 },
    ],
  },
  meta: {
    model: 'claude-sonnet-4-20250514',
    tokensUsed: 1500,
    causalRelationshipsUsed: 5,
    patternsUsed: 2,
    federated: true,
    orgSpecificRelationships: 3,
    coreBrainRelationships: 2,
  },
};

const MOCK_INGEST_RESULT: IngestResult = {
  success: true,
  signalsIngested: 3,
  eventsCreated: 3,
};

const MOCK_WEBHOOK_RESULT: WebhookResult = {
  success: true,
  source: 'stripe',
  signalsGenerated: 2,
};

const MOCK_CRON_RESULT: CronResult = {
  success: true,
  organizationsProcessed: 1,
  results: [
    { task: 'prediction_verification', organizationId: 'test-org', status: 'success', details: { verified: 5 }, durationMs: 120 },
    { task: 'threshold_optimization', organizationId: 'test-org', status: 'success', details: { optimized: 2 }, durationMs: 85 },
    { task: 'evidence_decay', organizationId: 'test-org', status: 'success', details: { decayed: 1 }, durationMs: 45 },
  ],
};

const MOCK_RELATIONSHIPS_RESULT: RelationshipsResult = {
  relationships: [
    { source_domain: 'finance', target_domain: 'cs', effect_size: 0.45, granger_p_value: 0.003, optimal_lag_days: 5, natural_language: 'MRR changes drive support volume', is_significant: true },
    { source_domain: 'engineering', target_domain: 'revenue', effect_size: 0.32, granger_p_value: 0.01, optimal_lag_days: 14, natural_language: 'Deploy frequency impacts revenue', is_significant: true },
    { source_domain: 'marketing', target_domain: 'revenue', effect_size: 0.51, granger_p_value: 0.001, optimal_lag_days: 30, is_significant: true },
  ],
  count: 3,
  orgCount: 2,
  coreCount: 1,
};

// ============================================================================
// TESTS: nexus_query
// ============================================================================

describe('handleQuery', () => {
  it('returns answer with causal context, patterns, and memories', async () => {
    const client = createMockClient({
      query: vi.fn().mockResolvedValue(MOCK_QUERY_RESULT),
    });

    const result = await handleQuery(client, { question: 'Why is churn rising?' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Churn is rising');
    expect(result.content[0].text).toContain('engineering');
    expect(result.content[0].text).toContain('Causal Context');
    expect(result.content[0].text).toContain('Learned Patterns');
    expect(result.content[0].text).toContain('Organizational Memory');
    expect(result.content[0].text).toContain('Federated');
    expect(result.content[0].text).toContain('3 org edges');
    expect(result.content[0].text).toContain('2 core brain edges');
  });

  it('passes domain filter to client', async () => {
    const queryFn = vi.fn().mockResolvedValue(MOCK_QUERY_RESULT);
    const client = createMockClient({ query: queryFn });

    await handleQuery(client, { question: 'Revenue trend?', domain: 'finance' });

    expect(queryFn).toHaveBeenCalledWith('Revenue trend?', { domain: 'finance' });
  });

  it('returns isError on NexusError', async () => {
    const client = createMockClient({
      query: vi.fn().mockRejectedValue(new NexusError('Bad request', 400, 'nexus-query')),
    });

    const result = await handleQuery(client, { question: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('400');
    expect(result.content[0].text).toContain('nexus-query');
  });

  it('returns isError on generic Error', async () => {
    const client = createMockClient({
      query: vi.fn().mockRejectedValue(new Error('Network timeout')),
    });

    const result = await handleQuery(client, { question: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network timeout');
  });
});

// ============================================================================
// TESTS: nexus_ingest
// ============================================================================

describe('handleIngest', () => {
  it('returns ingestion summary', async () => {
    const client = createMockClient({
      ingest: vi.fn().mockResolvedValue(MOCK_INGEST_RESULT),
    });

    const result = await handleIngest(client, {
      signals: [
        { source_domain: 'finance', signal_type: 'mrr', signal_value: 52000 },
        { source_domain: 'cs', signal_type: 'tickets', signal_value: 47 },
        { source_domain: 'engineering', signal_type: 'deploys', signal_value: 3 },
      ],
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('3 signal(s)');
    expect(result.content[0].text).toContain('3 event(s)');
    expect(result.content[0].text).toContain('Success: true');
  });

  it('handles ingest errors', async () => {
    const client = createMockClient({
      ingest: vi.fn().mockRejectedValue(new NexusError('Rate limited', 429, 'nexus-ingest')),
    });

    const result = await handleIngest(client, {
      signals: [{ source_domain: 'finance', signal_type: 'mrr', signal_value: 50000 }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('429');
  });
});

// ============================================================================
// TESTS: nexus_relationships
// ============================================================================

describe('handleRelationships', () => {
  it('returns formatted relationships with federation metadata', async () => {
    const client = createMockClient({
      getRelationships: vi.fn().mockResolvedValue(MOCK_RELATIONSHIPS_RESULT),
    });

    const result = await handleRelationships(client, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('3 causal relationship(s)');
    expect(result.content[0].text).toContain('2 org-specific');
    expect(result.content[0].text).toContain('1 from universal knowledge base');
    expect(result.content[0].text).toContain('finance');
    expect(result.content[0].text).toContain('MRR changes drive support volume');
  });

  it('passes limit and min_effect_size to client', async () => {
    const getRelsFn = vi.fn().mockResolvedValue(MOCK_RELATIONSHIPS_RESULT);
    const client = createMockClient({ getRelationships: getRelsFn });

    await handleRelationships(client, { limit: 5, min_effect_size: 0.3 });

    expect(getRelsFn).toHaveBeenCalledWith({
      limit: 5,
      minEffectSize: 0.3,
      includeCoreKnowledge: undefined,
    });
  });

  it('passes include_core_knowledge=false to client', async () => {
    const getRelsFn = vi.fn().mockResolvedValue({
      relationships: [],
      count: 0,
      orgCount: 0,
      coreCount: 0,
    });
    const client = createMockClient({ getRelationships: getRelsFn });

    await handleRelationships(client, { include_core_knowledge: false });

    expect(getRelsFn).toHaveBeenCalledWith({
      limit: undefined,
      minEffectSize: undefined,
      includeCoreKnowledge: false,
    });
  });

  it('handles no relationships gracefully', async () => {
    const client = createMockClient({
      getRelationships: vi.fn().mockResolvedValue({
        relationships: [],
        count: 0,
        orgCount: 0,
        coreCount: 0,
      }),
    });

    const result = await handleRelationships(client, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('No causal relationships discovered yet');
  });
});

// ============================================================================
// TESTS: nexus_webhook
// ============================================================================

describe('handleWebhook', () => {
  it('returns webhook processing summary', async () => {
    const client = createMockClient({
      webhook: vi.fn().mockResolvedValue(MOCK_WEBHOOK_RESULT),
    });

    const result = await handleWebhook(client, {
      source: 'stripe',
      payload: { type: 'charge.succeeded', data: { amount: 5000 } },
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('stripe');
    expect(result.content[0].text).toContain('2 signal(s)');
    expect(result.content[0].text).toContain('Success: true');
  });
});

// ============================================================================
// TESTS: nexus_cron
// ============================================================================

describe('handleCron', () => {
  it('returns task execution summary', async () => {
    const client = createMockClient({
      cron: vi.fn().mockResolvedValue(MOCK_CRON_RESULT),
    });

    const result = await handleCron(client, {});

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Cron completed');
    expect(result.content[0].text).toContain('1 org(s)');
    expect(result.content[0].text).toContain('prediction_verification: success');
    expect(result.content[0].text).toContain('threshold_optimization: success');
    expect(result.content[0].text).toContain('evidence_decay: success');
  });

  it('passes specific tasks to client', async () => {
    const cronFn = vi.fn().mockResolvedValue(MOCK_CRON_RESULT);
    const client = createMockClient({ cron: cronFn });

    await handleCron(client, { tasks: ['evidence_decay'] });

    expect(cronFn).toHaveBeenCalledWith(['evidence_decay']);
  });
});

// ============================================================================
// TESTS: nexusbrain://relationships resource
// ============================================================================

describe('handleRelationshipsResource', () => {
  it('returns JSON resource with federated relationships', async () => {
    const client = createMockClient({
      getRelationships: vi.fn().mockResolvedValue(MOCK_RELATIONSHIPS_RESULT),
    });

    const result = await handleRelationshipsResource(client);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('nexusbrain://relationships');
    expect(result.contents[0].mimeType).toBe('application/json');

    const data = JSON.parse(result.contents[0].text);
    expect(data.organizationId).toBe('test-org-123');
    expect(data.relationships).toHaveLength(3);
    expect(data.relationships[0].cause).toBe('finance');
    expect(data.relationships[0].effect).toBe('cs');
    expect(data.orgCount).toBe(2);
    expect(data.coreCount).toBe(1);
    expect(data.fetchedAt).toBeDefined();
  });

  it('returns error JSON on failure', async () => {
    const client = createMockClient({
      getRelationships: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    });

    const result = await handleRelationshipsResource(client);

    const data = JSON.parse(result.contents[0].text);
    expect(data.error).toContain('DB connection failed');
  });
});

// ============================================================================
// TESTS: analyze-metrics prompt
// ============================================================================

describe('buildAnalyzeMetricsPrompt', () => {
  it('builds structured prompt with live causal context', async () => {
    const client = createMockClient({
      getRelationships: vi.fn().mockResolvedValue(MOCK_RELATIONSHIPS_RESULT),
    });

    const result = await buildAnalyzeMetricsPrompt(client, {});

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');

    const text = result.messages[0].content.text;
    expect(text).toContain('causal intelligence analyst');
    expect(text).toContain('3 causal relationship(s)');
    expect(text).toContain('Key Causal Chains');
    expect(text).toContain('Risk Signals');
    expect(text).toContain('Opportunity Signals');
    expect(text).toContain('Data Gaps');
    expect(text).toContain('nexus_query');
  });

  it('includes domain focus when specified', async () => {
    const client = createMockClient({
      getRelationships: vi.fn().mockResolvedValue(MOCK_RELATIONSHIPS_RESULT),
    });

    const result = await buildAnalyzeMetricsPrompt(client, { domain: 'finance' });

    expect(result.messages[0].content.text).toContain('**finance** domain');
  });

  it('includes custom question when specified', async () => {
    const client = createMockClient({
      getRelationships: vi.fn().mockResolvedValue(MOCK_RELATIONSHIPS_RESULT),
    });

    const result = await buildAnalyzeMetricsPrompt(client, { question: 'Why is MRR dropping?' });

    expect(result.messages[0].content.text).toContain('Why is MRR dropping?');
  });

  it('handles relationship fetch failure gracefully', async () => {
    const client = createMockClient({
      getRelationships: vi.fn().mockRejectedValue(new Error('timeout')),
    });

    const result = await buildAnalyzeMetricsPrompt(client, {});

    expect(result.messages[0].content.text).toContain('Could not fetch causal relationships');
  });
});

// ============================================================================
// TESTS: error handling
// ============================================================================

describe('handleError', () => {
  it('formats NexusError with statusCode and functionName', () => {
    const result = handleError(new NexusError('Not found', 404, 'nexus-query'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('404');
    expect(result.content[0].text).toContain('nexus-query');
    expect(result.content[0].text).toContain('Not found');
  });

  it('formats generic Error', () => {
    const result = handleError(new Error('Something broke'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Something broke');
  });

  it('formats non-Error values', () => {
    const result = handleError('unexpected string error');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unexpected string error');
  });
});

// ============================================================================
// TESTS: formatting helpers
// ============================================================================

describe('formatRelationship', () => {
  it('formats a complete relationship', () => {
    const text = formatRelationship({
      source_domain: 'finance',
      target_domain: 'cs',
      effect_size: 0.45,
      granger_p_value: 0.003,
      optimal_lag_days: 5,
      natural_language: 'Revenue impacts support load',
    });

    expect(text).toContain('finance');
    expect(text).toContain('cs');
    expect(text).toContain('0.45');
    expect(text).toContain('0.003');
    expect(text).toContain('5d');
    expect(text).toContain('Revenue impacts support load');
  });

  it('handles minimal relationship', () => {
    const text = formatRelationship({
      source_domain: 'engineering',
      target_domain: 'revenue',
    });

    expect(text).toContain('engineering');
    expect(text).toContain('revenue');
  });
});

describe('formatRelationshipsText', () => {
  it('returns empty message when no relationships', () => {
    const text = formatRelationshipsText([]);
    expect(text).toContain('No causal relationships discovered yet');
  });

  it('includes federation counts', () => {
    const text = formatRelationshipsText(
      MOCK_RELATIONSHIPS_RESULT.relationships,
      { orgCount: 2, coreCount: 1 },
    );
    expect(text).toContain('2 org-specific');
    expect(text).toContain('1 from universal knowledge base');
  });
});
