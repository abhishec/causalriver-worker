import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createJiraConnector } from '../connectors/jira';

function createMockSupabase() {
  const insertFn = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({
      insert: insertFn,
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    _insert: insertFn,
  } as any;
}

function mockJiraFetch(responses: Record<string, any>) {
  return vi.fn().mockImplementation(async (url: string) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        return {
          ok: true,
          json: async () => response,
          status: 200,
          statusText: 'OK',
        };
      }
    }
    return { ok: true, json: async () => ({ issues: [], values: [] }), status: 200, statusText: 'OK' };
  });
}

function makeJiraIssue(overrides: Record<string, any> = {}): any {
  return {
    id: '10001',
    key: overrides.key || 'ENG-123',
    fields: {
      summary: overrides.summary || 'Implement feature X',
      status: {
        name: overrides.statusName || 'To Do',
        statusCategory: { key: overrides.statusCategory || 'new' },
      },
      issuetype: { name: overrides.issueType || 'Story' },
      priority: { name: overrides.priority || 'Medium' },
      assignee: overrides.assignee ?? { accountId: 'user-1', displayName: 'Alice' },
      reporter: { accountId: 'user-2', displayName: 'Bob' },
      labels: overrides.labels || [],
      created: overrides.created || '2024-01-01T00:00:00.000+0000',
      updated: overrides.updated || '2024-01-05T00:00:00.000+0000',
      resolutiondate: overrides.resolutiondate || null,
      resolution: overrides.resolution || null,
      project: { key: 'ENG', name: 'Engineering' },
      components: overrides.components || [],
    },
  };
}

describe('Jira Connector', () => {
  let supabase: any;

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalFetch = globalThis.fetch;
    supabase = createMockSupabase();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('createJiraConnector', () => {
    it('should return a valid NexusConnector', () => {
      const connector = createJiraConnector({
        baseUrl: 'https://company.atlassian.net',
        email: 'bot@company.com',
        apiToken: 'test-token',
      });

      expect(connector.id).toBe('jira');
      expect(connector.name).toBe('Jira');
      expect(connector.domain).toBe('engineering');
    });
  });

  describe('Issue signals', () => {
    it('should emit issue_created for new stories', async () => {
      const connector = createJiraConnector({
        baseUrl: 'https://company.atlassian.net',
        email: 'bot@company.com',
        apiToken: 'test-token',
      });

      const issue = makeJiraIssue({ key: 'ENG-1', issueType: 'Story' });

      globalThis.fetch = mockJiraFetch({
        '/rest/api/3/search': { issues: [issue], total: 1 },
        '/rest/agile/1.0/board': { values: [] },
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(true);

      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];
      const created = storedRows.find((r: any) => r.signal_type === 'issue_created');
      expect(created).toBeDefined();
      expect(created.signal_value).toBe(0.5); // Feature = positive
      expect(created.metadata.is_bug).toBe(false);
    });

    it('should emit negative signal for bug creation', async () => {
      const connector = createJiraConnector({
        baseUrl: 'https://company.atlassian.net',
        email: 'bot@company.com',
        apiToken: 'test-token',
      });

      const bugIssue = makeJiraIssue({
        key: 'ENG-2',
        issueType: 'Bug',
      });

      globalThis.fetch = mockJiraFetch({
        '/rest/api/3/search': { issues: [bugIssue], total: 1 },
        '/rest/agile/1.0/board': { values: [] },
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];
      const created = storedRows.find((r: any) => r.signal_type === 'issue_created');
      expect(created.signal_value).toBe(-0.5);
      expect(created.metadata.is_bug).toBe(true);
    });

    it('should emit issue_resolved when status is done', async () => {
      const connector = createJiraConnector({
        baseUrl: 'https://company.atlassian.net',
        email: 'bot@company.com',
        apiToken: 'test-token',
      });

      const resolvedIssue = makeJiraIssue({
        key: 'ENG-3',
        statusName: 'Done',
        statusCategory: 'done',
        resolutiondate: '2024-01-10T00:00:00.000+0000',
        resolution: { name: 'Fixed' },
      });

      globalThis.fetch = mockJiraFetch({
        '/rest/api/3/search': { issues: [resolvedIssue], total: 1 },
        '/rest/agile/1.0/board': { values: [] },
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];

      const resolved = storedRows.find((r: any) => r.signal_type === 'issue_resolved');
      expect(resolved).toBeDefined();
      expect(resolved.signal_value).toBe(1);
      expect(resolved.metadata.resolution).toBe('Fixed');
      expect(resolved.metadata.resolution_time_days).toBe(9);
    });

    it('should emit issue_blocked when status includes blocked', async () => {
      const connector = createJiraConnector({
        baseUrl: 'https://company.atlassian.net',
        email: 'bot@company.com',
        apiToken: 'test-token',
      });

      const blockedIssue = makeJiraIssue({
        key: 'ENG-4',
        statusName: 'Blocked',
        statusCategory: 'indeterminate',
      });

      globalThis.fetch = mockJiraFetch({
        '/rest/api/3/search': { issues: [blockedIssue], total: 1 },
        '/rest/agile/1.0/board': { values: [] },
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];

      const blocked = storedRows.find((r: any) => r.signal_type === 'issue_blocked');
      expect(blocked).toBeDefined();
      expect(blocked.signal_value).toBe(-0.7);
    });
  });

  describe('Webhook handler', () => {
    it('should emit issue_created from webhook', () => {
      const connector = createJiraConnector({
        baseUrl: 'https://company.atlassian.net',
        email: 'bot@company.com',
        apiToken: 'test-token',
      });

      const signals = connector.handleWebhook!({
        webhookEvent: 'jira:issue_created',
        issue: {
          key: 'ENG-10',
          fields: {
            summary: 'New feature',
            issuetype: { name: 'Story' },
            status: { name: 'To Do', statusCategory: { key: 'new' } },
            project: { key: 'ENG' },
            labels: [],
            assignee: { accountId: 'u1', displayName: 'Alice' },
          },
        },
        organization_id: 'org-1',
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('issue_created');
      expect(signals[0].signal_value).toBe(0.5);
    });

    it('should return empty for unknown webhooks', () => {
      const connector = createJiraConnector({
        baseUrl: 'https://company.atlassian.net',
        email: 'bot@company.com',
        apiToken: 'test-token',
      });

      const signals = connector.handleWebhook!({ random: 'data' });
      expect(signals).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should return failure result on API error', async () => {
      const connector = createJiraConnector({
        baseUrl: 'https://company.atlassian.net',
        email: 'bot@company.com',
        apiToken: 'test-token',
      });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Network error');
    });
  });
});
