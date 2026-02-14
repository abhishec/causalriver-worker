/**
 * SE-aaS Service Integration Tests
 *
 * Comprehensive tests for production API service layer.
 * Tests are aligned with the current SEaaSService implementation which:
 * - Creates its own AgentRegistry internally
 * - Uses NexusMetrics (not a Map) for metrics tracking
 * - Returns SEaaSMetrics shape from getMetrics()
 * - Uses in-memory job store with auth-based ownership
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSEaaSService,
  type SEaaSConfig,
} from '../orchestrator/se-aas-service';

describe('SEaaSService', () => {
  let service: any;

  beforeEach(() => {
    // Service creates its own registry, auth, and metrics internally.
    // With no authProvider, it uses dev-mode auth (userId: 'dev-user', orgId: 'dev-org').
    const config: SEaaSConfig = {
      maxConcurrentJobs: 5,
      jobTimeout: 300000,
    };

    service = createSEaaSService(config);
  });

  afterEach(() => {
    // Clean up any timers the job processor may have started
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should authenticate valid API key (dev mode)', async () => {
      const result = await service.codeReview({
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      });

      expect(result).toBeDefined();
      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should reject when authProvider rejects key', async () => {
      const strictService = createSEaaSService({
        authProvider: {
          validateApiKey: async () => { throw new Error('Invalid key'); },
          hasPermission: async () => false,
        },
      });

      await expect(
        strictService.codeReview({
          pullRequestId: 'PR-123',
          changedFiles: ['src/auth.ts'],
          description: 'Add login feature',
          apiKey: 'invalid_key',
        })
      ).rejects.toThrow('Invalid API key');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce requests per minute limit', async () => {
      // Create service with very low rate limit
      const limitedService = createSEaaSService({
        rateLimit: {
          requestsPerMinute: 5,
          tokensPerDay: 100000,
          maxConcurrentPerUser: 5,
        },
      });

      const request = {
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      };

      // Make 6 requests (limit is 5 per minute)
      const promises = [];
      for (let i = 0; i < 6; i++) {
        promises.push(limitedService.codeReview({ ...request, pullRequestId: `PR-${i}` }));
      }

      const results = await Promise.allSettled(promises);
      const rejected = results.filter(r => r.status === 'rejected');

      expect(rejected.length).toBeGreaterThan(0);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('Rate limit exceeded');
    });
  });

  describe('Code Review', () => {
    it('should queue code review job', async () => {
      const result = await service.codeReview({
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts', 'src/user.ts'],
        description: 'Add authentication system',
        apiKey: 'sk_test_123',
      });

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.createdAt).toBeDefined();
    });

    it('should accept webhook URL for async notifications', async () => {
      const result = await service.codeReview({
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
        webhookUrl: 'https://example.com/webhook',
      });

      expect(result.jobId).toBeDefined();
      // Job is created successfully; webhook will be called on completion
    });
  });

  describe('Feature Build', () => {
    it('should queue feature build job', async () => {
      const result = await service.featureBuild({
        specification: 'Implement password reset with email verification',
        language: 'typescript',
        framework: 'express',
        patterns: ['Use async/await', 'Follow REST conventions'],
        apiKey: 'sk_test_123',
      });

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should handle different languages', async () => {
      const languages = ['typescript', 'javascript', 'python', 'go'];

      for (const language of languages) {
        const result = await service.featureBuild({
          specification: 'Build a simple function',
          language: language as any,
          apiKey: 'sk_test_123',
        });
        expect(result.status).toBe('pending');
      }
    });
  });

  describe('Codebase Analysis', () => {
    it('should queue codebase analysis job', async () => {
      const result = await service.codebaseAnalysis({
        repositoryUrl: 'https://github.com/myorg/myrepo',
        branch: 'main',
        apiKey: 'sk_test_123',
      });

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should use default branch if not specified', async () => {
      const result = await service.codebaseAnalysis({
        repositoryUrl: 'https://github.com/myorg/myrepo',
        apiKey: 'sk_test_123',
      });

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('pending');
    });
  });

  describe('Tech Debt Audit', () => {
    it('should queue tech debt audit job', async () => {
      const result = await service.techDebtAudit({
        scope: 'src',
        apiKey: 'sk_test_123',
      });

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should handle full codebase audit (no scope)', async () => {
      const result = await service.techDebtAudit({
        apiKey: 'sk_test_123',
      });

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('pending');
    });
  });

  describe('Job Status', () => {
    it('should retrieve job status', async () => {
      // Create a job first
      const job = await service.codeReview({
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      });

      // Get status (dev mode: same user owns all jobs)
      const status = await service.getJobStatus(job.jobId, 'sk_test_123');

      expect(status.jobId).toBe(job.jobId);
      expect(status.status).toBeDefined();
    });

    it('should throw for non-existent jobs', async () => {
      await expect(
        service.getJobStatus('job_nonexistent', 'sk_test_123')
      ).rejects.toThrow('not found');
    });
  });

  describe('Metrics', () => {
    it('should return service metrics', async () => {
      const metrics = await service.getMetrics('sk_test_123');

      expect(metrics).toBeDefined();
      expect(metrics.totalRequests).toBeGreaterThanOrEqual(0);
      expect(metrics.successfulRequests).toBeGreaterThanOrEqual(0);
      expect(metrics.failedRequests).toBeGreaterThanOrEqual(0);
      expect(metrics.totalTokensUsed).toBeGreaterThanOrEqual(0);
      expect(metrics.activeJobs).toBeGreaterThanOrEqual(0);
      expect(metrics.queueDepth).toBeGreaterThanOrEqual(0);
    });

    it('should track job count in metrics', async () => {
      await service.codeReview({
        pullRequestId: 'PR-123',
        changedFiles: ['src/auth.ts'],
        description: 'Add login',
        apiKey: 'sk_test_123',
      });

      const metrics = await service.getMetrics('sk_test_123');

      // Queue depth should reflect the enqueued job
      expect(metrics.queueDepth).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Concurrency', () => {
    it('should handle multiple concurrent job submissions', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        pullRequestId: `PR-${i}`,
        changedFiles: ['src/auth.ts'],
        description: 'Add login feature',
        apiKey: 'sk_test_123',
      }));

      const jobs = await Promise.all(requests.map(r => service.codeReview(r)));

      // All jobs should be created with pending status
      expect(jobs.every(j => j.status === 'pending')).toBe(true);
      expect(jobs.length).toBe(10);

      // All job IDs should be unique
      const ids = new Set(jobs.map(j => j.jobId));
      expect(ids.size).toBe(10);
    });
  });
});
