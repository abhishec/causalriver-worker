/**
 * Tests for Developer Jarvis MCP handlers.
 *
 * Mocks Jira API (fetch), NexusClient, and Supabase REST responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleJarvisReadTicket,
  handleJarvisGetContext,
  handleJarvisSubmitAnalysis,
  handleJarvisListRuns,
  buildJarvisAnalyzePrompt,
  type SupabaseConfig,
} from '../jarvis-handlers.js';
import type { NexusClient } from '@nexus-ai/client';

// ============================================================================
// MOCKS
// ============================================================================

const MOCK_SUPABASE: SupabaseConfig = {
  supabaseUrl: 'https://test.supabase.co',
  supabaseKey: 'test-key-123',
  orgId: 'org-test-001',
};

function createMockClient(overrides: Partial<NexusClient> = {}): NexusClient {
  return {
    organizationId: 'org-test-001',
    baseUrl: 'https://test.supabase.co',
    query: vi.fn<NexusClient['query']>(),
    ingest: vi.fn<NexusClient['ingest']>(),
    webhook: vi.fn<NexusClient['webhook']>(),
    cron: vi.fn<NexusClient['cron']>(),
    getRelationships: vi.fn<NexusClient['getRelationships']>(),
    ...overrides,
  } as NexusClient;
}

// Store original env and fetch
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Set Jira env vars for tests that need them
  process.env.JIRA_BASE_URL = 'https://test.atlassian.net';
  process.env.JIRA_EMAIL = 'test@example.com';
  process.env.JIRA_API_TOKEN = 'test-token-abc';
});

afterEach(() => {
  // Restore env
  process.env.JIRA_BASE_URL = originalEnv.JIRA_BASE_URL;
  process.env.JIRA_EMAIL = originalEnv.JIRA_EMAIL;
  process.env.JIRA_API_TOKEN = originalEnv.JIRA_API_TOKEN;
  // Restore fetch
  globalThis.fetch = originalFetch;
});

// ============================================================================
// MOCK JIRA RESPONSES
// ============================================================================

const MOCK_JIRA_ISSUE = {
  key: 'FIN-9800',
  id: '10001',
  fields: {
    summary: 'Refund calculation off by 1 cent',
    description: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'The refund amount is consistently 1 cent less than expected.' }],
        },
      ],
    },
    status: { name: 'Open', statusCategory: { key: 'new' } },
    issuetype: { name: 'Bug' },
    priority: { name: 'High' },
    assignee: { displayName: 'Alice Dev' },
    reporter: { displayName: 'Bob QA' },
    labels: ['regression', 'finance'],
    components: [{ name: 'payment-service' }],
    created: '2026-02-10T10:00:00Z',
    updated: '2026-02-14T15:30:00Z',
    resolutiondate: null,
    resolution: null,
    comment: {
      comments: [
        {
          author: { displayName: 'Charlie' },
          created: '2026-02-11T08:00:00Z',
          body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reproduced in staging.' }] }] },
        },
      ],
    },
    issuelinks: [
      {
        type: { outward: 'is caused by' },
        outwardIssue: { key: 'FIN-9750', fields: { summary: 'Currency rounding changes', status: { name: 'Done' } } },
      },
    ],
  },
};

// ============================================================================
// TESTS: jarvis_read_ticket
// ============================================================================

describe('handleJarvisReadTicket', () => {
  it('fetches and formats a Jira ticket', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_JIRA_ISSUE),
    });

    const result = await handleJarvisReadTicket({ jira_key: 'FIN-9800' });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('FIN-9800');
    expect(text).toContain('Refund calculation off by 1 cent');
    expect(text).toContain('Open');
    expect(text).toContain('Alice Dev');
    expect(text).toContain('payment-service');
    expect(text).toContain('Reproduced in staging');
    expect(text).toContain('FIN-9750');
  });

  it('returns error when Jira env vars not set', async () => {
    delete process.env.JIRA_BASE_URL;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;

    const result = await handleJarvisReadTicket({ jira_key: 'FIN-9800' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Jira not configured');
    expect(result.content[0].text).toContain('JIRA_BASE_URL');
  });

  it('returns error on Jira 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    });

    const result = await handleJarvisReadTicket({ jira_key: 'NOPE-999' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('returns error on Jira 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    const result = await handleJarvisReadTicket({ jira_key: 'FIN-9800' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('authentication failed');
  });
});

// ============================================================================
// TESTS: jarvis_get_context
// ============================================================================

describe('handleJarvisGetContext', () => {
  it('returns brain context and past runs', async () => {
    const client = createMockClient({
      query: vi.fn().mockResolvedValue({
        answer: 'Payment service has had rounding issues historically.',
        context: {
          causal: [
            { source_domain: 'engineering', target_domain: 'finance', effect_size: 0.4, granger_p_value: 0.01, optimal_lag_days: 2 },
          ],
          patterns: [],
          memories: [{ content: 'Currency handling refactored in Q4 2025' }],
        },
        meta: {},
      }),
    });

    // Mock Supabase REST for past runs
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          id: 'run-1',
          jira_key: 'FIN-9700',
          status: 'completed',
          root_cause: { file: 'refund-handler.ts' },
          confidence: 0.85,
          created_at: '2026-02-01T00:00:00Z',
        },
      ]),
    });

    const result = await handleJarvisGetContext(client, MOCK_SUPABASE, { jira_key: 'FIN-9800' });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('Brain Context for FIN-9800');
    expect(text).toContain('rounding issues');
    expect(text).toContain('Causal Patterns');
    expect(text).toContain('Organizational Memory');
    expect(text).toContain('FIN-9700');
    expect(text).toContain('85%');
  });

  it('degrades gracefully when brain query fails', async () => {
    const client = createMockClient({
      query: vi.fn().mockRejectedValue(new Error('Brain unavailable')),
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await handleJarvisGetContext(client, MOCK_SUPABASE, { jira_key: 'FIN-9800' });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Brain context unavailable');
  });
});

// ============================================================================
// TESTS: jarvis_submit_analysis
// ============================================================================

describe('handleJarvisSubmitAnalysis', () => {
  it('records analysis, posts to Jira, and emits signal', async () => {
    const ingestFn = vi.fn().mockResolvedValue({ success: true, signalsIngested: 1, eventsCreated: 1 });
    const client = createMockClient({ ingest: ingestFn });

    // Mock fetch — used for Supabase insert, Jira comment
    let fetchCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // Supabase insert
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{
            id: 'run-new-123',
            jira_key: 'FIN-9800',
            status: 'completed',
            confidence: 0.9,
            created_at: '2026-02-14T16:00:00Z',
          }]),
        });
      }
      // Jira comment
      return Promise.resolve({ ok: true });
    });

    const result = await handleJarvisSubmitAnalysis(client, MOCK_SUPABASE, {
      jira_key: 'FIN-9800',
      analysis_brief: '## Issue Summary\nOff-by-one in rounding\n\n## Root Cause\nFloat arithmetic',
      root_cause: { file: 'refund-handler.ts', function: 'calculateRefund', line: 142, description: 'Float rounding error' },
      key_files: [{ path: 'refund-handler.ts', lines: '140-150', reason: 'Rounding logic' }],
      confidence: 0.9,
      suggested_fix: 'Use Math.round() instead of Math.floor()',
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('Analysis recorded for FIN-9800');
    expect(text).toContain('run-new-123');
    expect(text).toContain('90%');
    expect(text).toContain('refund-handler.ts:142');
    expect(text).toContain('Posted to Jira: Yes');
    expect(text).toContain('Brain signal: Emitted');

    // Verify brain signal was emitted
    expect(ingestFn).toHaveBeenCalledWith([
      expect.objectContaining({
        source_domain: 'engineering',
        signal_type: 'jarvis_analysis_completed',
        signal_value: 0.9,
        entity_type: 'dev_jarvis_run',
        entity_id: 'run-new-123',
      }),
    ]);
  });

  it('handles Jira comment failure gracefully', async () => {
    const client = createMockClient({
      ingest: vi.fn().mockResolvedValue({ success: true, signalsIngested: 1, eventsCreated: 1 }),
    });

    let fetchCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'run-456', jira_key: 'FIN-9800', status: 'completed', confidence: 0.8, created_at: '2026-02-14T16:00:00Z' }]),
        });
      }
      // Jira comment fails
      return Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve('Forbidden') });
    });

    const result = await handleJarvisSubmitAnalysis(client, MOCK_SUPABASE, {
      jira_key: 'FIN-9800',
      analysis_brief: 'Test',
      root_cause: { description: 'Test root cause' },
      key_files: [],
      confidence: 0.8,
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('Posted to Jira: No');
    expect(text).toContain('Jira comment failed');
  });

  it('skips Jira comment when post_to_jira=false', async () => {
    const client = createMockClient({
      ingest: vi.fn().mockResolvedValue({ success: true, signalsIngested: 1, eventsCreated: 1 }),
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'run-789', jira_key: 'FIN-9800', status: 'completed', confidence: 0.7, created_at: '2026-02-14T16:00:00Z' }]),
    });

    const result = await handleJarvisSubmitAnalysis(client, MOCK_SUPABASE, {
      jira_key: 'FIN-9800',
      analysis_brief: 'Test',
      root_cause: { description: 'Test' },
      key_files: [],
      confidence: 0.7,
      post_to_jira: false,
    });

    expect(result.isError).toBeUndefined();
    // Should only call fetch once (Supabase insert), not for Jira comment
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// TESTS: jarvis_list_runs
// ============================================================================

describe('handleJarvisListRuns', () => {
  it('returns formatted table of runs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'r1', jira_key: 'FIN-9800', status: 'completed', root_cause: { file: 'handler.ts' }, confidence: 0.92, created_at: '2026-02-14T10:00:00Z', key_files: [], duration_ms: 5000, trigger_type: 'cli', triggered_by: null },
        { id: 'r2', jira_key: 'ENG-4521', status: 'failed', root_cause: {}, confidence: 0, created_at: '2026-02-13T09:00:00Z', key_files: [], duration_ms: null, trigger_type: 'cli', triggered_by: null },
      ]),
    });

    const result = await handleJarvisListRuns(MOCK_SUPABASE, {});

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('Jarvis Analysis Runs');
    expect(text).toContain('FIN-9800');
    expect(text).toContain('92%');
    expect(text).toContain('handler.ts');
    expect(text).toContain('ENG-4521');
    expect(text).toContain('failed');
    expect(text).toContain('1 completed');
    expect(text).toContain('1 failed');
  });

  it('returns message when no runs found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const result = await handleJarvisListRuns(MOCK_SUPABASE, {});

    expect(result.content[0].text).toContain('No Jarvis analysis runs found');
  });
});

// ============================================================================
// TESTS: jarvis-analyze prompt
// ============================================================================

describe('buildJarvisAnalyzePrompt', () => {
  it('builds prompt with ticket and brain context', async () => {
    const client = createMockClient({
      query: vi.fn().mockResolvedValue({
        answer: 'Rounding issues are common in payment service.',
        context: { causal: [], patterns: [], memories: [] },
        meta: {},
      }),
    });

    // First fetch: Jira ticket, second: Supabase past runs
    let fetchCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_JIRA_ISSUE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const result = await buildJarvisAnalyzePrompt(client, MOCK_SUPABASE, { jira_key: 'FIN-9800' });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');

    const text = result.messages[0].content.text;
    expect(text).toContain('root cause analysis');
    expect(text).toContain('FIN-9800');
    expect(text).toContain('Refund calculation off by 1 cent');
    expect(text).toContain('jarvis_submit_analysis');
    expect(text).toContain('Brain Context');
  });
});
