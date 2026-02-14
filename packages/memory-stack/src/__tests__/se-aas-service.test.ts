/**
 * SE-aaS Service Integration Tests
 *
 * Comprehensive tests for production API service layer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSEaaSService,
  type SEaaSConfig,
  type CodeReviewRequest,
  type FeatureBuildRequest,
  type CodebaseAnalysisRequest,
  type TechDebtAuditRequest,
} from '../orchestrator/se-aas-service';
import { createAgentRegistry } from '../orchestrator/agent-registry';
import { registerSoftwareEngineeringAgents } from '../orchestrator/agents-software-engineering';

// Mock Supabase
function createMockSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'user_123',
              org_id: 'org_123',
              api_key: 'sk_test_123',
              rate_limit_rpm: 100,
              rate_limit_tpd: 100000,
            },
            error: null,
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  } as any;
}

describe('SEaaSService', () => {
  let service: any;
  let supabase: any;
  let agentRegistry: any;

  beforeEach(() => {
    supabase = createMockSupabase();
    agentRegistry = createAgentRegistry();
    registerSoftwareEngineeringAgents(agentRegistry);

    const config: SEaaSConfig = {
      supabase,
      agentRegistry,
      maxConcurrentJobs: 5,
      defaultTimeout: 300000,
      retryAttempts: 3,
      rateLimitWindow: 60000,
    };

    service = createSEaaSService(config);
  });

  describe('Authentication', () => {
    it('should authenticate valid API key', async () => {
      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      };

      const result = await service.codeReview(request);

      expect(result).toBeDefined();
      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
    });

    it('should reject invalid API key', async () => {
      // Mock invalid API key
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Invalid API key' },
            }),
          }),
        }),
      });

      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'invalid_key',
      };

      await expect(service.codeReview(request)).rejects.toThrow('Authentication failed');
    });

    it('should reject missing API key', async () => {
      const request: any = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        // apiKey missing
      };

      await expect(service.codeReview(request)).rejects.toThrow();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce requests per minute limit', async () => {
      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      };

      // Make 101 requests (limit is 100 per minute)
      const promises = [];
      for (let i = 0; i < 101; i++) {
        promises.push(service.codeReview({ ...request, pullRequestId: `PR-${i}` }));
      }

      const results = await Promise.allSettled(promises);
      const rejected = results.filter(r => r.status === 'rejected');

      expect(rejected.length).toBeGreaterThan(0);
      expect(rejected[0].reason.message).toContain('Rate limit exceeded');
    });

    it('should track tokens per day limit', async () => {
      // Mock high token usage
      const mockMetrics = {
        tokensUsedToday: 99000, // Close to 100K limit
      };

      service.metrics.set('org_123', mockMetrics);

      const request: FeatureBuildRequest = {
        specification: 'Build a very large feature requiring many tokens',
        language: 'typescript',
        apiKey: 'sk_test_123',
      };

      // This should succeed (under limit)
      const result1 = await service.featureBuild(request);
      expect(result1.status).toBe('queued');

      // Update to exceed limit
      mockMetrics.tokensUsedToday = 100001;

      // This should fail (over limit)
      await expect(service.featureBuild(request)).rejects.toThrow('Token limit exceeded');
    });
  });

  describe('Code Review', () => {
    it('should queue code review job', async () => {
      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts', 'src/user.ts'],
        description: 'Add authentication system',
        apiKey: 'sk_test_123',
      };

      const result = await service.codeReview(request);

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
      expect(result.createdAt).toBeDefined();
      expect(result.estimatedDuration).toBeGreaterThan(0);
    });

    it('should accept webhook URL for async notifications', async () => {
      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
        webhookUrl: 'https://example.com/webhook',
      };

      const result = await service.codeReview(request);

      expect(result.jobId).toBeDefined();
      expect(result.webhookUrl).toBe('https://example.com/webhook');
    });

    it('should validate changed files array', async () => {
      const request: any = {
        pullRequestId: 'PR-123',
        changedFiles: 'not-an-array', // Invalid
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      };

      await expect(service.codeReview(request)).rejects.toThrow();
    });
  });

  describe('Feature Build', () => {
    it('should queue feature build job', async () => {
      const request: FeatureBuildRequest = {
        specification: 'Implement password reset with email verification',
        language: 'typescript',
        framework: 'express',
        patterns: ['Use async/await', 'Follow REST conventions'],
        apiKey: 'sk_test_123',
      };

      const result = await service.featureBuild(request);

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
      expect(result.priority).toBe('normal');
    });

    it('should handle different languages', async () => {
      const languages = ['typescript', 'javascript', 'python', 'go'];

      for (const language of languages) {
        const request: FeatureBuildRequest = {
          specification: 'Build a simple function',
          language: language as any,
          apiKey: 'sk_test_123',
        };

        const result = await service.featureBuild(request);
        expect(result.status).toBe('queued');
      }
    });

    it('should validate specification is not empty', async () => {
      const request: any = {
        specification: '', // Empty
        language: 'typescript',
        apiKey: 'sk_test_123',
      };

      await expect(service.featureBuild(request)).rejects.toThrow();
    });
  });

  describe('Codebase Analysis', () => {
    it('should queue codebase analysis job', async () => {
      const request: CodebaseAnalysisRequest = {
        repositoryUrl: 'https://github.com/myorg/myrepo',
        branch: 'main',
        apiKey: 'sk_test_123',
      };

      const result = await service.codebaseAnalysis(request);

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
    });

    it('should use default branch if not specified', async () => {
      const request: CodebaseAnalysisRequest = {
        repositoryUrl: 'https://github.com/myorg/myrepo',
        apiKey: 'sk_test_123',
        // branch not specified
      };

      const result = await service.codebaseAnalysis(request);

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
    });

    it('should validate repository URL format', async () => {
      const request: any = {
        repositoryUrl: 'not-a-valid-url',
        apiKey: 'sk_test_123',
      };

      await expect(service.codebaseAnalysis(request)).rejects.toThrow();
    });
  });

  describe('Tech Debt Audit', () => {
    it('should queue tech debt audit job', async () => {
      const request: TechDebtAuditRequest = {
        scope: {
          directories: ['src'],
          excludePatterns: ['*.test.ts', 'node_modules'],
        },
        apiKey: 'sk_test_123',
      };

      const result = await service.techDebtAudit(request);

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
    });

    it('should handle full codebase audit (no scope)', async () => {
      const request: TechDebtAuditRequest = {
        apiKey: 'sk_test_123',
        // scope not specified - full audit
      };

      const result = await service.techDebtAudit(request);

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
    });
  });

  describe('Job Status', () => {
    it('should retrieve job status', async () => {
      // Create a job first
      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      };

      const job = await service.codeReview(request);

      // Get status
      const status = await service.getJobStatus(job.jobId, 'sk_test_123');

      expect(status.jobId).toBe(job.jobId);
      expect(status.status).toBeDefined();
    });

    it('should reject access to other org jobs', async () => {
      // Mock job owned by different org
      supabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user_456',
                org_id: 'org_456', // Different org
                api_key: 'sk_test_456',
              },
              error: null,
            }),
          }),
        }),
      });

      await expect(service.getJobStatus('job_123', 'sk_test_456')).rejects.toThrow('Unauthorized');
    });
  });

  describe('Metrics', () => {
    it('should return service metrics', async () => {
      const metrics = await service.getMetrics('sk_test_123');

      expect(metrics).toBeDefined();
      expect(metrics.totalRequests).toBeGreaterThanOrEqual(0);
      expect(metrics.successfulRequests).toBeGreaterThanOrEqual(0);
      expect(metrics.failedRequests).toBeGreaterThanOrEqual(0);
      expect(metrics.tokensUsedToday).toBeGreaterThanOrEqual(0);
      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
    });

    it('should track requests per endpoint', async () => {
      await service.codeReview({
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login',
        apiKey: 'sk_test_123',
      });

      const metrics = await service.getMetrics('sk_test_123');

      expect(metrics.requestsByEndpoint).toBeDefined();
      expect(metrics.requestsByEndpoint.codeReview).toBeGreaterThan(0);
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed jobs with exponential backoff', async () => {
      // Mock agent that fails first 2 times, succeeds on 3rd
      let attempts = 0;
      const mockAgent = {
        id: 'brain-code-reviewer',
        name: 'Code Reviewer',
        domain: 'software-engineering',
        capabilities: ['code-review'],
        run: vi.fn().mockImplementation(async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return {
            success: true,
            confidence: 0.9,
            narrative: 'Review complete',
          };
        }),
      };

      agentRegistry.agents.set('brain-code-reviewer', mockAgent);

      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      };

      const job = await service.codeReview(request);

      // Wait for job to process with retries
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(attempts).toBe(3);
    });

    it('should mark job as failed after max retries', async () => {
      // Mock agent that always fails
      const mockAgent = {
        id: 'brain-code-reviewer',
        name: 'Code Reviewer',
        domain: 'software-engineering',
        capabilities: ['code-review'],
        run: vi.fn().mockRejectedValue(new Error('Permanent failure')),
      };

      agentRegistry.agents.set('brain-code-reviewer', mockAgent);

      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      };

      const job = await service.codeReview(request);

      // Wait for retries to exhaust
      await new Promise(resolve => setTimeout(resolve, 2000));

      const status = await service.getJobStatus(job.jobId, 'sk_test_123');
      expect(status.status).toBe('failed');
      expect(status.error).toContain('Permanent failure');
    });
  });

  describe('Webhooks', () => {
    it('should call webhook on job completion', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch as any;

      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
        webhookUrl: 'https://example.com/webhook',
      };

      await service.codeReview(request);

      // Wait for job to process
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should handle webhook failures gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Webhook failed'));
      global.fetch = mockFetch as any;

      const request: CodeReviewRequest = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
        webhookUrl: 'https://example.com/webhook',
      };

      // Should not throw even if webhook fails
      const job = await service.codeReview(request);
      expect(job.jobId).toBeDefined();
    });
  });

  describe('Concurrency', () => {
    it('should respect max concurrent jobs limit', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        pullRequestId: `PR-${i}`,
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      }));

      const jobs = await Promise.all(requests.map(r => service.codeReview(r)));

      // All jobs should be queued
      expect(jobs.every(j => j.status === 'queued')).toBe(true);

      // But only 5 should be processing at once (maxConcurrentJobs: 5)
      const processingCount = service.processingJobs?.size || 0;
      expect(processingCount).toBeLessThanOrEqual(5);
    });
  });
});
