import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGitHubConnector } from '../connectors/github';

// Mock Supabase
function createMockSupabase() {
  const insertFn = vi.fn().mockResolvedValue({ error: null });
  return {
    from: vi.fn().mockReturnValue({
      insert: insertFn,
      upsert: vi.fn().mockResolvedValue({ error: null }),
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
// Patterns are matched longest-first to avoid greedy matching
// (e.g., '/pulls/42' must not intercept '/pulls/42/reviews')
function mockGitHubFetch(responses: Record<string, any>) {
  // Sort patterns by length descending so longer (more specific) patterns match first
  const sortedPatterns = Object.entries(responses).sort(
    ([a], [b]) => b.length - a.length
  );

  return vi.fn().mockImplementation(async (url: string) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    for (const [pattern, response] of sortedPatterns) {
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

describe('GitHub Connector — Enhanced Signals', () => {
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

  describe('PR review signals', () => {
    it('should emit pr_review_submitted signals for each review', async () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
        syncScope: { pulls: true, issues: false, commits: false, workflows: false },
      });

      const mockPR = {
        id: 1, number: 42, title: 'Add auth', state: 'closed', merged_at: '2024-01-10T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-10T00:00:00Z',
        additions: 50, deletions: 10, changed_files: 3,
        user: { login: 'alice' },
        labels: [],
        requested_reviewers: [{ login: 'bob' }],
      };

      const mockReviews = [
        { id: 1, user: { login: 'bob' }, state: 'APPROVED', body: 'Looks great! Clean code.', submitted_at: '2024-01-05T00:00:00Z' },
        { id: 2, user: { login: 'carol' }, state: 'CHANGES_REQUESTED', body: 'This is bad, needs refactoring.', submitted_at: '2024-01-03T00:00:00Z' },
      ];

      const mockFiles = [
        { filename: 'src/auth/login.ts', status: 'modified', additions: 30, deletions: 5 },
        { filename: 'src/auth/signup.ts', status: 'added', additions: 20, deletions: 0 },
        { filename: 'tests/auth.test.ts', status: 'modified', additions: 10, deletions: 5 },
      ];

      globalThis.fetch = mockGitHubFetch({
        '/pulls?': [mockPR],
        '/pulls/42': mockPR,
        '/pulls/42/reviews': mockReviews,
        '/pulls/42/files': mockFiles,
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(true);

      // Extract signals from what was stored
      const insertCall = supabase.from.mock.results.find(
        (r: any) => true
      );
      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];

      // Should include review signals
      const reviewSignals = storedRows.filter((r: any) => r.signal_type === 'pr_review_submitted');
      expect(reviewSignals.length).toBe(2);

      // Approved review
      const approvedReview = reviewSignals.find((r: any) => r.metadata.state === 'APPROVED');
      expect(approvedReview).toBeDefined();
      expect(approvedReview.signal_value).toBe(1);
      expect(approvedReview.metadata.reviewer).toBe('bob');
      expect(approvedReview.metadata.sentiment_score).toBeGreaterThan(0);
      expect(approvedReview.metadata.sentiment_label).toBe('positive');

      // Changes requested review
      const changesReview = reviewSignals.find((r: any) => r.metadata.state === 'CHANGES_REQUESTED');
      expect(changesReview).toBeDefined();
      expect(changesReview.signal_value).toBe(-0.3);
      expect(changesReview.metadata.reviewer).toBe('carol');
      expect(changesReview.metadata.sentiment_score).toBeLessThan(0);
    });

    it('should include file paths and directories in review signals', async () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
        syncScope: { pulls: true, issues: false, commits: false, workflows: false },
      });

      const mockPR = {
        id: 1, number: 10, title: 'Fix payment', state: 'open',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-05T00:00:00Z',
        merged_at: null, additions: 10, deletions: 5, changed_files: 2,
        user: { login: 'alice' }, labels: [], requested_reviewers: [],
      };

      const mockFiles = [
        { filename: 'src/payments/checkout.ts', status: 'modified', additions: 5, deletions: 3 },
        { filename: 'src/payments/stripe.ts', status: 'modified', additions: 5, deletions: 2 },
      ];

      globalThis.fetch = mockGitHubFetch({
        '/pulls?': [mockPR],
        '/pulls/10': mockPR,
        '/pulls/10/reviews': [],
        '/pulls/10/files': mockFiles,
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(true);

      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];
      const prOpened = storedRows.find((r: any) => r.signal_type === 'pr_opened');
      expect(prOpened).toBeDefined();
      expect(prOpened.metadata.file_paths).toContain('src/payments/checkout.ts');
      expect(prOpened.metadata.directories_changed).toContain('src/payments');
    });
  });

  describe('PR files changed signal', () => {
    it('should emit pr_files_changed signal with directory info', async () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
        syncScope: { pulls: true, issues: false, commits: false, workflows: false },
      });

      const mockPR = {
        id: 1, number: 5, title: 'Refactor auth', state: 'open',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
        merged_at: null, additions: 100, deletions: 50, changed_files: 5,
        user: { login: 'alice' }, labels: [], requested_reviewers: [],
      };

      const mockFiles = [
        { filename: 'src/auth/login.ts', status: 'modified', additions: 20, deletions: 10 },
        { filename: 'src/auth/session.ts', status: 'modified', additions: 30, deletions: 20 },
        { filename: 'src/utils/crypto.ts', status: 'modified', additions: 50, deletions: 20 },
      ];

      globalThis.fetch = mockGitHubFetch({
        '/pulls?': [mockPR],
        '/pulls/5': mockPR,
        '/pulls/5/reviews': [],
        '/pulls/5/files': mockFiles,
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(true);

      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];
      const filesChanged = storedRows.find((r: any) => r.signal_type === 'pr_files_changed');
      expect(filesChanged).toBeDefined();
      expect(filesChanged.metadata.file_count).toBe(3);
      expect(filesChanged.metadata.directories_changed).toContain('src/auth');
      expect(filesChanged.metadata.directories_changed).toContain('src/utils');
    });
  });

  describe('PR merged with enriched metadata', () => {
    it('should include reviewers_who_approved and file paths on merged PR', async () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
        syncScope: { pulls: true, issues: false, commits: false, workflows: false },
      });

      const mockPR = {
        id: 1, number: 20, title: 'Feature X', state: 'closed',
        merged_at: '2024-01-10T00:00:00Z', created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-10T00:00:00Z', additions: 200, deletions: 50,
        changed_files: 5, user: { login: 'alice' }, labels: [],
        requested_reviewers: [],
      };

      const mockReviews = [
        { id: 1, user: { login: 'bob' }, state: 'APPROVED', body: 'LGTM', submitted_at: '2024-01-08T00:00:00Z' },
        { id: 2, user: { login: 'carol' }, state: 'APPROVED', body: 'Ship it!', submitted_at: '2024-01-09T00:00:00Z' },
      ];

      const mockFiles = [
        { filename: 'src/feature/index.ts', status: 'added', additions: 200, deletions: 0 },
      ];

      globalThis.fetch = mockGitHubFetch({
        '/pulls?': [mockPR],
        '/pulls/20': mockPR,
        '/pulls/20/reviews': mockReviews,
        '/pulls/20/files': mockFiles,
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(true);

      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];
      const mergedSignal = storedRows.find((r: any) => r.signal_type === 'pr_merged');
      expect(mergedSignal).toBeDefined();
      expect(mergedSignal.metadata.reviewers_who_approved).toContain('bob');
      expect(mergedSignal.metadata.reviewers_who_approved).toContain('carol');
      expect(mergedSignal.metadata.review_rounds).toBe(2);
      expect(mergedSignal.metadata.file_paths).toContain('src/feature/index.ts');
      expect(mergedSignal.metadata.directories_changed).toContain('src/feature');
    });
  });

  describe('CI job-level signals', () => {
    it('should emit per-job signals for failed workflow runs', async () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
        syncScope: { pulls: false, issues: false, commits: false, workflows: true },
      });

      const mockRuns = {
        workflow_runs: [{
          id: 100, name: 'CI', status: 'completed', conclusion: 'failure',
          created_at: '2024-01-05T10:00:00Z', updated_at: '2024-01-05T10:15:00Z',
          head_branch: 'main', event: 'push',
        }],
      };

      const mockJobs = {
        jobs: [
          {
            id: 201, name: 'lint', conclusion: 'success',
            started_at: '2024-01-05T10:01:00Z', completed_at: '2024-01-05T10:05:00Z',
            steps: [],
          },
          {
            id: 202, name: 'test', conclusion: 'failure',
            started_at: '2024-01-05T10:05:00Z', completed_at: '2024-01-05T10:12:00Z',
            steps: [
              { name: 'Run tests', conclusion: 'failure' },
            ],
          },
        ],
      };

      globalThis.fetch = mockGitHubFetch({
        '/actions/runs?': mockRuns,
        '/actions/runs/100/jobs': mockJobs,
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(true);

      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];

      // Should have job-level signals
      const jobPassed = storedRows.find((r: any) => r.signal_type === 'ci_job_passed');
      expect(jobPassed).toBeDefined();
      expect(jobPassed.metadata.job_name).toBe('lint');

      const jobFailed = storedRows.find((r: any) => r.signal_type === 'ci_job_failed');
      expect(jobFailed).toBeDefined();
      expect(jobFailed.metadata.job_name).toBe('test');

      // Overall CI signal should include failed job names
      const ciFailed = storedRows.find((r: any) => r.signal_type === 'ci_failed');
      expect(ciFailed).toBeDefined();
      expect(ciFailed.metadata.failed_job_names).toContain('test');
      expect(ciFailed.metadata.step_that_failed).toBe('Run tests');
    });
  });

  describe('Rollback detection', () => {
    it('should emit deploy_rollback when success follows failure within 4 hours', async () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
        syncScope: { pulls: false, issues: false, commits: false, workflows: true },
      });

      const mockRuns = {
        workflow_runs: [
          {
            id: 300, name: 'Deploy', status: 'completed', conclusion: 'failure',
            created_at: '2024-01-05T10:00:00Z', updated_at: '2024-01-05T10:05:00Z',
            head_branch: 'main', event: 'push',
          },
          {
            id: 301, name: 'Deploy', status: 'completed', conclusion: 'success',
            created_at: '2024-01-05T11:00:00Z', updated_at: '2024-01-05T11:05:00Z',
            head_branch: 'main', event: 'push',
          },
        ],
      };

      globalThis.fetch = mockGitHubFetch({
        '/actions/runs?': mockRuns,
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(true);

      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];
      const rollback = storedRows.find((r: any) => r.signal_type === 'deploy_rollback');
      expect(rollback).toBeDefined();
      expect(rollback.signal_value).toBe(-1);
      expect(rollback.metadata.time_since_failure_minutes).toBe(60);
    });
  });

  describe('Webhook — pull_request_review', () => {
    it('should emit pr_review_submitted from review webhook', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook!({
        action: 'submitted',
        review: {
          id: 1,
          user: { login: 'bob' },
          state: 'approved',
          body: 'Excellent work, this is great!',
          submitted_at: '2024-01-05T00:00:00Z',
        },
        pull_request: {
          number: 42,
          title: 'Add feature',
          user: { login: 'alice' },
        },
        organization: { id: 12345 },
      });

      const reviewSignal = signals.find((s) => s.signal_type === 'pr_review_submitted');
      expect(reviewSignal).toBeDefined();
      expect(reviewSignal!.signal_value).toBe(1); // approved
      expect(reviewSignal!.metadata?.reviewer).toBe('bob');
      expect(reviewSignal!.metadata?.sentiment_score).toBeGreaterThan(0);
    });

    it('should emit negative value for changes_requested', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook!({
        action: 'submitted',
        review: {
          id: 2,
          user: { login: 'carol' },
          state: 'changes_requested',
          body: 'This has bugs and issues.',
          submitted_at: '2024-01-05T00:00:00Z',
        },
        pull_request: { number: 43, title: 'Fix bug' },
        organization: { id: 12345 },
      });

      const reviewSignal = signals.find((s) => s.signal_type === 'pr_review_submitted');
      expect(reviewSignal).toBeDefined();
      expect(reviewSignal!.signal_value).toBe(-0.3);
    });
  });

  describe('Webhook — workflow_job', () => {
    it('should emit ci_job_passed for successful job', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook!({
        action: 'completed',
        workflow_job: {
          id: 500,
          name: 'test-suite',
          conclusion: 'success',
          workflow_name: 'CI',
          head_branch: 'main',
        },
        organization: { id: 12345 },
      });

      const jobSignal = signals.find((s) => s.signal_type === 'ci_job_passed');
      expect(jobSignal).toBeDefined();
      expect(jobSignal!.signal_value).toBe(1);
      expect(jobSignal!.metadata?.job_name).toBe('test-suite');
    });

    it('should emit ci_job_failed for failed job', () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
      });

      const signals = connector.handleWebhook!({
        action: 'completed',
        workflow_job: {
          id: 501,
          name: 'e2e-tests',
          conclusion: 'failure',
          workflow_name: 'CI',
          head_branch: 'feature/auth',
        },
        organization: { id: 12345 },
      });

      const jobSignal = signals.find((s) => s.signal_type === 'ci_job_failed');
      expect(jobSignal).toBeDefined();
      expect(jobSignal!.signal_value).toBe(-1);
      expect(jobSignal!.metadata?.job_name).toBe('e2e-tests');
    });
  });

  describe('Config — syncScope toggles', () => {
    it('should skip reviews when reviews=false', async () => {
      const connector = createGitHubConnector({
        token: 'test-token',
        owner: 'myorg',
        repo: 'myrepo',
        syncScope: {
          pulls: true, issues: false, commits: false, workflows: false,
          reviews: false, fileChanges: false,
        },
      });

      const mockPR = {
        id: 1, number: 1, title: 'Test', state: 'open',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
        merged_at: null, additions: 10, deletions: 5, changed_files: 1,
        user: { login: 'alice' }, labels: [], requested_reviewers: [],
      };

      globalThis.fetch = mockGitHubFetch({
        '/pulls?': [mockPR],
        '/pulls/1': mockPR,
      }) as any;

      const result = await connector.fullSync(supabase, 'org-1');
      expect(result.success).toBe(true);

      const storedRows = supabase._insert.mock.calls[0]?.[0] || [];
      const reviewSignals = storedRows.filter((r: any) => r.signal_type === 'pr_review_submitted');
      expect(reviewSignals.length).toBe(0);

      const fileSignals = storedRows.filter((r: any) => r.signal_type === 'pr_files_changed');
      expect(fileSignals.length).toBe(0);
    });
  });
});
