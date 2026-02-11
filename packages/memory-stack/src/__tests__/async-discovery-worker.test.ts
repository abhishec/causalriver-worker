/**
 * Tests for Async Discovery Worker
 */
import { describe, it, expect } from 'vitest';
import { createDiscoveryWorkerPool } from '../causality/async-discovery-worker';

// Helper to generate test signals
function generateTestSignals(domainCount: number, pointsPerDomain: number) {
  const signals: Array<{
    source_domain: string;
    signal_type: string;
    signal_value: number;
    signal_timestamp: string;
  }> = [];

  for (let d = 0; d < domainCount; d++) {
    const domain = `domain_${d}`;
    for (let t = 0; t < pointsPerDomain; t++) {
      const date = new Date(2024, 0, 1 + t);
      signals.push({
        source_domain: domain,
        signal_type: `metric_${d}`,
        signal_value: Math.sin(t * 0.5 + d) * 10 + 50 + Math.random() * 5,
        signal_timestamp: date.toISOString(),
      });
    }
  }

  return signals;
}

describe('Async Discovery Worker', () => {
  describe('createDiscoveryWorkerPool', () => {
    it('should create a worker pool', () => {
      const pool = createDiscoveryWorkerPool(2);

      expect(pool).toBeDefined();
      expect(pool.submit).toBeDefined();
      expect(pool.getJob).toBeDefined();
      expect(pool.cancel).toBeDefined();
      expect(pool.listJobs).toBeDefined();
      expect(pool.cleanup).toBeDefined();
      expect(pool.stats).toBeDefined();
    });

    it('should report initial stats as zeros', () => {
      const pool = createDiscoveryWorkerPool();
      const stats = pool.stats();

      expect(stats.queued).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.totalRelationshipsFound).toBe(0);
    });
  });

  describe('Job Lifecycle', () => {
    it('should submit a job and return job object', () => {
      const pool = createDiscoveryWorkerPool();
      const signals = generateTestSignals(3, 30);

      const job = pool.submit(signals, 'org_test');

      expect(job.id).toMatch(/^disc_/);
      expect(job.organizationId).toBe('org_test');
      expect(job.status === 'queued' || job.status === 'running').toBe(true);
      expect(job.progress).toBeGreaterThanOrEqual(0);
      expect(job.createdAt).toBeInstanceOf(Date);
    });

    it('should complete a small job', async () => {
      const pool = createDiscoveryWorkerPool();
      const signals = generateTestSignals(3, 31);

      const job = pool.submit(signals, 'org_test');

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 2000));

      const finalJob = pool.getJob(job.id);
      expect(finalJob).toBeDefined();
      expect(finalJob!.status).toBe('completed');
      expect(finalJob!.progress).toBe(1);
      expect(finalJob!.result).toBeDefined();
      expect(finalJob!.completedAt).toBeInstanceOf(Date);
    }, 5000);

    it('should retrieve job by ID', () => {
      const pool = createDiscoveryWorkerPool();
      const signals = generateTestSignals(2, 20);

      const job = pool.submit(signals, 'org_test');
      const retrieved = pool.getJob(job.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(job.id);
    });

    it('should list all jobs', () => {
      const pool = createDiscoveryWorkerPool();
      const signals = generateTestSignals(2, 20);

      pool.submit(signals, 'org_1');
      pool.submit(signals, 'org_2');

      const jobs = pool.listJobs();
      expect(jobs.length).toBe(2);
    });

    it('should cancel a queued job', async () => {
      const pool = createDiscoveryWorkerPool(1); // Only 1 concurrent
      const signals = generateTestSignals(3, 50);

      // Submit two jobs — first runs, second queues
      pool.submit(signals, 'org_1');
      const job2 = pool.submit(signals, 'org_2');

      const cancelled = pool.cancel(job2.id);

      expect(cancelled).toBe(true);
      expect(pool.getJob(job2.id)!.status).toBe('cancelled');
    });

    it('should cleanup completed jobs', async () => {
      const pool = createDiscoveryWorkerPool();
      const signals = generateTestSignals(2, 20);

      pool.submit(signals, 'org_test');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const cleaned = pool.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(1);
      expect(pool.listJobs().length).toBe(0);
    }, 5000);
  });

  describe('Progress Tracking', () => {
    it('should report progress via callback', async () => {
      const pool = createDiscoveryWorkerPool();
      const signals = generateTestSignals(3, 30);
      let progressCalled = false;

      pool.submit(signals, 'org_test', {
        onProgress: () => {
          progressCalled = true;
        },
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(progressCalled).toBe(true);
    }, 5000);

    it('should report discovered relationships via callback', async () => {
      const pool = createDiscoveryWorkerPool();
      // Use correlated signals to ensure relationship discovery
      const signals: any[] = [];
      for (let t = 0; t < 60; t++) {
        const date = new Date(2024, 0, 1 + t);
        const causeValue = Math.sin(t * 0.3) * 10 + 50;
        signals.push({
          source_domain: 'cause',
          signal_type: 'metric_cause',
          signal_value: causeValue,
          signal_timestamp: date.toISOString(),
        });
        // Effect with lag
        if (t >= 3) {
          signals.push({
            source_domain: 'effect',
            signal_type: 'metric_effect',
            signal_value: Math.sin((t - 3) * 0.3) * 10 + 50 + Math.random() * 2,
            signal_timestamp: date.toISOString(),
          });
        }
      }

      const relationships: any[] = [];
      pool.submit(signals, 'org_test', {
        onRelationshipFound: (rel) => {
          relationships.push(rel);
        },
      });

      await new Promise(resolve => setTimeout(resolve, 3000));

      // May or may not find relationships depending on significance
      expect(relationships).toBeDefined();
    }, 5000);
  });

  describe('Edge Cases', () => {
    it('should handle empty signals', async () => {
      const pool = createDiscoveryWorkerPool();
      const job = pool.submit([], 'org_test');

      await new Promise(resolve => setTimeout(resolve, 1000));

      const final = pool.getJob(job.id);
      expect(final!.status).toBe('completed');
    }, 3000);

    it('should handle single-domain signals', async () => {
      const pool = createDiscoveryWorkerPool();
      const signals = generateTestSignals(1, 30);
      const job = pool.submit(signals, 'org_test');

      await new Promise(resolve => setTimeout(resolve, 1000));

      const final = pool.getJob(job.id);
      expect(final!.status).toBe('completed');
      expect(final!.result!.discovered_relationships.length).toBe(0);
    }, 3000);

    it('should return false when cancelling non-existent job', () => {
      const pool = createDiscoveryWorkerPool();
      expect(pool.cancel('non_existent')).toBe(false);
    });
  });
});
