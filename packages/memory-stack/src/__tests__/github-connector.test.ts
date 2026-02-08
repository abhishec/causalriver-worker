import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGitHubConnector } from '../connectors/github';

// Mock Supabase
function createMockSupabase() {
  const insertFn = vi.fn().mockReturnValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({
      insert: insertFn,
      upsert: vi.fn().mockReturnValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: vi.fn().mockReturnValue({ data: [], error: null }),
        }),
      }),
    }),
    _insert: insertFn,
  } as any;
}

// Mock fetch for GitHub API
function mockGitHubFetch(responses: Record<string, any>) {
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
    return { ok: true, json: async () => [], status: 200, statusText: 'OK' };
  });
}

describe('GitHub Connector', () => {
  let supabase: any;

  beforeEach(() => {
    supabase = createMockSupabase();
    vi.restoreAllMocks();
  });

  describe('createGitHubConnector', () => {
    it('should return a valid NexusConnector', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      expect(connector.id).toBe('github');
      expect(connector.name).toBe('GitHub');
      expect(connector.domain).toBe('engineering');
      expect(connector.fullSync).toBeDefined();
      expect(connector.incrementalSync).toBeDefined();
      expect(connector.handleWebhook).toBeDefined();
    });
  });

  describe('handleWebhook', () => {
    it('should handle PR opened event', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook({
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Add auth feature',
          user: { login: 'dev1' },
        },
        organization: { id: 123 },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('pr_opened');
      expect(signals[0].source_domain).toBe('engineering');
      expect(signals[0].entity_type).toBe('pull_request');
      expect(signals[0].entity_id).toBe('pr_42');
      expect(signals[0].signal_value).toBe(1);
    });

    it('should handle PR merged event', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook({
        action: 'closed',
        pull_request: {
          number: 42,
          title: 'Add auth feature',
          merged: true,
          user: { login: 'dev1' },
        },
        organization: { id: 123 },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('pr_merged');
      expect(signals[0].signal_value).toBe(1);
    });

    it('should handle issue opened as bug', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook({
        action: 'opened',
        issue: {
          number: 99,
          title: 'Login broken',
          labels: [{ name: 'bug' }],
        },
        organization: { id: 123 },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('bug_opened');
      expect(signals[0].signal_value).toBe(-0.5);
    });

    it('should handle issue closed', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook({
        action: 'closed',
        issue: {
          number: 99,
          title: 'Feature request',
          labels: [],
        },
        organization: { id: 123 },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('issue_closed');
      expect(signals[0].signal_value).toBe(1);
    });

    it('should handle CI check suite success', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook({
        check_suite: {
          id: 555,
          conclusion: 'success',
          head_branch: 'main',
        },
        organization: { id: 123 },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('ci_passed');
      expect(signals[0].signal_value).toBe(1);
    });

    it('should handle CI check suite failure', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook({
        check_suite: {
          id: 556,
          conclusion: 'failure',
          head_branch: 'feature-branch',
        },
        organization: { id: 123 },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('ci_failed');
      expect(signals[0].signal_value).toBe(-1);
    });

    it('should handle deployment success', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook({
        deployment_status: {
          state: 'success',
          environment: 'production',
        },
        deployment: { id: 777 },
        organization: { id: 123 },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('deploy_success');
      expect(signals[0].signal_value).toBe(1);
      expect(signals[0].entity_type).toBe('deployment');
    });

    it('should handle deployment failure', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook({
        deployment_status: {
          state: 'failure',
          environment: 'production',
        },
        deployment: { id: 778 },
        organization: { id: 123 },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signal_type).toBe('deploy_failure');
      expect(signals[0].signal_value).toBe(-1);
    });

    it('should return empty array for unknown webhook', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook({ action: 'ping' });
      expect(signals).toEqual([]);
    });

    it('should return empty array for null payload', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook(null);
      expect(signals).toEqual([]);
    });
  });

  describe('fullSync', () => {
    it('should handle API errors gracefully', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        const connector = createGitHubConnector({
          token: 'test-token',
          owner: 'myorg',
          repo: 'myrepo',
        });

        const result = await connector.fullSync(supabase, 'org_123');
        expect(result.success).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should respect syncScope configuration', async () => {
      const fetchMock = mockGitHubFetch({
        '/pulls': [],
        '/issues': [],
        '/actions/runs': { workflow_runs: [] },
        '/commits': [],
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchMock;

      // Create a more robust supabase mock that handles chained calls
      const robustSupabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({ error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as any;

      try {
        const connector = createGitHubConnector({
          token: 'test-token',
          owner: 'myorg',
          repo: 'myrepo',
          syncScope: { pulls: true, issues: false, commits: false, workflows: false },
        });

        const result = await connector.fullSync(robustSupabase, 'org_123');
        expect(result.success).toBe(true);
        // Only pulls should have been fetched
        const calls = fetchMock.mock.calls.map((c: any) => c[0].toString());
        expect(calls.some((c: string) => c.includes('/pulls'))).toBe(true);
        expect(calls.some((c: string) => c.includes('/issues'))).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
