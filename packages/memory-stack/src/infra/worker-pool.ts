/**
 * Worker Pool — BullMQ-compatible job queue with 4 compute tiers
 *
 * Fixes Bottleneck #5: Single Node.js process blocking event loop
 *
 * Architecture:
 *   Job Producers → Redis-backed Queue → Worker Pool → Compute Tiers
 *                                                       ├── realtime (<100ms)
 *                                                       ├── interactive (<5s)
 *                                                       ├── background (<5min)
 *                                                       └── scheduled (<2hr)
 *
 * Features:
 * - 4 compute tier queues with different concurrency/priority
 * - Job priority, retry, dead-letter queue
 * - Rate limiting per queue
 * - Job progress tracking
 * - Graceful shutdown with in-flight completion
 */

import type { RedisClientInstance } from './redis-client';
import { getDefaultLogger, type NexusLogger } from '../observability';
import type { ComputeTier } from '../architecture/ARCHITECTURE-10M';

// ============================================================================
// TYPES
// ============================================================================

export interface JobDefinition<T = unknown, R = unknown> {
  /** Unique job name/type */
  name: string;
  /** Job payload data */
  data: T;
  /** Compute tier for routing */
  tier: ComputeTier;
  /** Job priority (1 = highest, lower runs first) */
  priority?: number;
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
  /** Retry backoff in ms (exponential) */
  retryBackoffMs?: number;
  /** Job timeout in ms */
  timeoutMs?: number;
  /** Delay before processing in ms */
  delayMs?: number;
  /** Organization ID for tenant isolation */
  organizationId?: string;
  /** Optional: expected result type marker */
  _resultType?: R;
}

export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  tier: ComputeTier;
  priority: number;
  attempt: number;
  maxRetries: number;
  timeoutMs: number;
  organizationId?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  result?: unknown;
  progress: number;
  status: JobStatus;
}

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'dead_letter';

export type JobProcessor<T = unknown, R = unknown> = (job: Job<T>, helpers: JobHelpers) => Promise<R>;

export interface JobHelpers {
  updateProgress(progress: number): Promise<void>;
  log(message: string): void;
  getRedis(): RedisClientInstance;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  deadLetter: number;
}

export interface WorkerPoolConfig {
  redis: RedisClientInstance;
  /** Queue prefix (default: 'nexus:jobs') */
  queuePrefix?: string;
  /** Concurrency per tier */
  concurrency?: Record<ComputeTier, number>;
  /** Rate limit per tier (jobs per second) */
  rateLimit?: Record<ComputeTier, number>;
  /** Max dead letter queue size per tier */
  maxDeadLetterSize?: number;
  /** Stalled job check interval ms */
  stalledCheckIntervalMs?: number;
  /** Logger */
  logger?: NexusLogger;
}

export interface WorkerPoolInstance {
  /** Add a job to the queue */
  addJob<T, R>(definition: JobDefinition<T, R>): Promise<Job<T>>;
  /** Add multiple jobs */
  addBulk<T>(definitions: JobDefinition<T>[]): Promise<Job<T>[]>;
  /** Register a job processor */
  registerProcessor<T, R>(name: string, processor: JobProcessor<T, R>): void;
  /** Start processing jobs */
  start(): Promise<void>;
  /** Stop processing (graceful) */
  stop(): Promise<void>;
  /** Get queue stats per tier */
  getStats(): Promise<Record<ComputeTier, QueueStats>>;
  /** Get total stats across all tiers */
  getTotalStats(): Promise<QueueStats & { byTier: Record<ComputeTier, QueueStats> }>;
  /** Get a specific job by ID */
  getJob(jobId: string): Promise<Job | null>;
  /** Retry failed jobs */
  retryFailed(tier: ComputeTier, limit?: number): Promise<number>;
  /** Drain dead letter queue */
  drainDeadLetter(tier: ComputeTier): Promise<number>;
  /** Clean completed jobs older than ms */
  clean(olderThanMs: number): Promise<number>;
  /** Destroy the worker pool */
  destroy(): Promise<void>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createWorkerPool(config: WorkerPoolConfig): WorkerPoolInstance {
  const {
    redis,
    queuePrefix = 'nexus:jobs',
    concurrency = { realtime: 50, interactive: 20, background: 10, scheduled: 2 },
    rateLimit = { realtime: 1000, interactive: 100, background: 20, scheduled: 5 },
    maxDeadLetterSize = 1000,
    stalledCheckIntervalMs = 30_000,
  } = config;

  const logger = config.logger ?? getDefaultLogger().child({ module: 'worker-pool' });
  const tiers: ComputeTier[] = ['realtime', 'interactive', 'background', 'scheduled'];
  const processors = new Map<string, JobProcessor>();
  let running = false;
  let jobIdCounter = 0;
  let stalledInterval: ReturnType<typeof setInterval> | null = null;

  // Active job tracking per tier
  const activeJobs = new Map<ComputeTier, Map<string, Job>>();
  const tierIntervals = new Map<ComputeTier, ReturnType<typeof setInterval>>();

  for (const tier of tiers) {
    activeJobs.set(tier, new Map());
  }

  // Queue key helpers
  const queueKey = (tier: ComputeTier, suffix: string) => `${queuePrefix}:${tier}:${suffix}`;
  const jobKey = (jobId: string) => `${queuePrefix}:job:${jobId}`;

  // Serialize/deserialize job
  const serializeJob = (job: Job): string => JSON.stringify({
    ...job,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    failedAt: job.failedAt?.toISOString(),
  });

  const deserializeJob = (raw: string): Job => {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      startedAt: parsed.startedAt ? new Date(parsed.startedAt) : undefined,
      completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
      failedAt: parsed.failedAt ? new Date(parsed.failedAt) : undefined,
    };
  };

  // Rate limiter
  const rateLimitCounters = new Map<ComputeTier, { count: number; resetAt: number }>();

  const checkRateLimit = (tier: ComputeTier): boolean => {
    const limit = rateLimit[tier];
    const now = Date.now();
    let counter = rateLimitCounters.get(tier);

    if (!counter || now >= counter.resetAt) {
      counter = { count: 0, resetAt: now + 1000 };
      rateLimitCounters.set(tier, counter);
    }

    if (counter.count >= limit) return false;
    counter.count++;
    return true;
  };

  // Process a single job
  const processJob = async (job: Job, tier: ComputeTier): Promise<void> => {
    const processor = processors.get(job.name);
    if (!processor) {
      logger.warn('No processor registered', { jobName: job.name, jobId: job.id });
      job.status = 'failed';
      job.error = `No processor registered for job type: ${job.name}`;
      job.failedAt = new Date();
      await redis.set(jobKey(job.id), serializeJob(job), { ex: 86400 });
      return;
    }

    job.status = 'active';
    job.startedAt = new Date();
    job.attempt++;
    activeJobs.get(tier)!.set(job.id, job);

    const helpers: JobHelpers = {
      async updateProgress(progress: number) {
        job.progress = Math.min(100, Math.max(0, progress));
        await redis.set(jobKey(job.id), serializeJob(job), { ex: 86400 });
      },
      log(message: string) {
        logger.info(`[Job ${job.id}] ${message}`, { jobId: job.id, jobName: job.name });
      },
      getRedis() { return redis; },
    };

    // Timeout wrapper
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Job timeout after ${job.timeoutMs}ms`)), job.timeoutMs);
    });

    try {
      const result = await Promise.race([
        processor(job, helpers),
        timeoutPromise,
      ]);

      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result;
      job.progress = 100;

      await redis.set(jobKey(job.id), serializeJob(job), { ex: 86400 });
      // Add to completed list
      await redis.lpush(queueKey(tier, 'completed'), job.id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (job.attempt < job.maxRetries) {
        // Retry with exponential backoff
        const delay = Math.min(30000, (job.data as JobDefinition).retryBackoffMs ?? 1000 * Math.pow(2, job.attempt));
        job.status = 'delayed';
        job.error = errorMsg;

        await redis.set(jobKey(job.id), serializeJob(job), { ex: 86400 });
        // Re-queue after delay
        setTimeout(async () => {
          job.status = 'waiting';
          await redis.set(jobKey(job.id), serializeJob(job), { ex: 86400 });
          await redis.zadd(queueKey(tier, 'waiting'), job.priority, job.id);
        }, delay);

        logger.warn('Job failed, retrying', { jobId: job.id, attempt: job.attempt, maxRetries: job.maxRetries, delay });
      } else {
        // Move to dead letter queue
        job.status = 'dead_letter';
        job.failedAt = new Date();
        job.error = errorMsg;

        await redis.set(jobKey(job.id), serializeJob(job), { ex: 604800 }); // 7 day retention
        await redis.lpush(queueKey(tier, 'dead_letter'), job.id);

        // Trim DLQ
        const dlqLen = await redis.llen(queueKey(tier, 'dead_letter'));
        if (dlqLen > maxDeadLetterSize) {
          // Remove oldest entries
          for (let i = 0; i < dlqLen - maxDeadLetterSize; i++) {
            await redis.rpop(queueKey(tier, 'dead_letter'));
          }
        }

        logger.error('Job permanently failed', { jobId: job.id, error: errorMsg });
      }
    } finally {
      activeJobs.get(tier)!.delete(job.id);
    }
  };

  // Poll queue for a tier
  const pollTier = async (tier: ComputeTier) => {
    if (!running) return;

    const active = activeJobs.get(tier)!;
    const maxConcurrency = concurrency[tier];

    while (active.size < maxConcurrency && running) {
      if (!checkRateLimit(tier)) break;

      // Get highest priority job from sorted set
      const jobIds = await redis.zrangebyscore(
        queueKey(tier, 'waiting'),
        '-inf', '+inf',
        { limit: { offset: 0, count: 1 } }
      );

      if (jobIds.length === 0) break;

      const jobId = jobIds[0];
      await redis.zrem(queueKey(tier, 'waiting'), jobId);

      const raw = await redis.get(jobKey(jobId));
      if (!raw) continue;

      const job = deserializeJob(raw);
      // Fire and forget — runs in background
      processJob(job, tier).catch(err => {
        logger.error('Unexpected job processing error', { jobId, error: err instanceof Error ? err.message : String(err) });
      });
    }
  };

  // Tier-specific polling intervals
  const tierPollIntervals: Record<ComputeTier, number> = {
    realtime: 10,
    interactive: 100,
    background: 1000,
    scheduled: 5000,
  };

  return {
    async addJob<T, R>(definition: JobDefinition<T, R>): Promise<Job<T>> {
      const job: Job<T> = {
        id: `job_${Date.now()}_${++jobIdCounter}_${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`,
        name: definition.name,
        data: definition.data,
        tier: definition.tier,
        priority: definition.priority ?? 5,
        attempt: 0,
        maxRetries: definition.maxRetries ?? 3,
        timeoutMs: definition.timeoutMs ?? (
          definition.tier === 'realtime' ? 100 :
          definition.tier === 'interactive' ? 5000 :
          definition.tier === 'background' ? 300000 :
          7200000
        ),
        organizationId: definition.organizationId,
        createdAt: new Date(),
        progress: 0,
        status: 'waiting',
      };

      // Store job data
      await redis.set(jobKey(job.id), serializeJob(job as unknown as Job), { ex: 86400 });

      if (definition.delayMs && definition.delayMs > 0) {
        job.status = 'delayed';
        await redis.set(jobKey(job.id), serializeJob(job as unknown as Job), { ex: 86400 });
        setTimeout(async () => {
          job.status = 'waiting';
          await redis.set(jobKey(job.id), serializeJob(job as unknown as Job), { ex: 86400 });
          await redis.zadd(queueKey(definition.tier, 'waiting'), job.priority, job.id);
        }, definition.delayMs);
      } else {
        // Add to priority sorted set
        await redis.zadd(queueKey(definition.tier, 'waiting'), job.priority, job.id);
      }

      return job;
    },

    async addBulk<T>(definitions: JobDefinition<T>[]) {
      const jobs: Job<T>[] = [];
      for (const def of definitions) {
        const job = await this.addJob(def);
        jobs.push(job);
      }
      return jobs;
    },

    registerProcessor<T, R>(name: string, processor: JobProcessor<T, R>) {
      processors.set(name, processor as JobProcessor);
      logger.info('Processor registered', { name });
    },

    async start() {
      if (running) return;
      running = true;

      // Start polling for each tier
      for (const tier of tiers) {
        const interval = setInterval(() => pollTier(tier), tierPollIntervals[tier]);
        tierIntervals.set(tier, interval);
      }

      // Stalled job detection
      stalledInterval = setInterval(async () => {
        for (const tier of tiers) {
          const active = activeJobs.get(tier)!;
          const now = Date.now();
          for (const [jobId, job] of active) {
            const startTime = job.startedAt?.getTime() ?? now;
            if (now - startTime > job.timeoutMs * 2) {
              logger.warn('Stalled job detected', { jobId, tier, elapsed: now - startTime });
              active.delete(jobId);
              job.status = 'waiting';
              job.attempt++;
              await redis.set(jobKey(jobId), serializeJob(job), { ex: 86400 });
              await redis.zadd(queueKey(tier, 'waiting'), job.priority, jobId);
            }
          }
        }
      }, stalledCheckIntervalMs);

      logger.info('Worker pool started', {
        concurrency,
        tiers: tiers.map(t => `${t}:${concurrency[t]}`),
      });
    },

    async stop() {
      running = false;

      // Stop polling
      for (const interval of tierIntervals.values()) {
        clearInterval(interval);
      }
      tierIntervals.clear();

      if (stalledInterval) {
        clearInterval(stalledInterval);
        stalledInterval = null;
      }

      // Wait for active jobs to complete (with timeout)
      const timeout = 30_000;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        let totalActive = 0;
        for (const tier of tiers) {
          totalActive += activeJobs.get(tier)!.size;
        }
        if (totalActive === 0) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info('Worker pool stopped');
    },

    async getStats() {
      const result = {} as Record<ComputeTier, QueueStats>;

      for (const tier of tiers) {
        const waiting = await redis.zcard(queueKey(tier, 'waiting'));
        const completed = await redis.llen(queueKey(tier, 'completed'));
        const deadLetter = await redis.llen(queueKey(tier, 'dead_letter'));
        const active = activeJobs.get(tier)!.size;

        result[tier] = {
          waiting,
          active,
          completed,
          failed: 0,
          delayed: 0,
          deadLetter,
        };
      }

      return result;
    },

    async getTotalStats() {
      const byTier = await this.getStats();
      const total: QueueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, deadLetter: 0 };

      for (const stats of Object.values(byTier)) {
        total.waiting += stats.waiting;
        total.active += stats.active;
        total.completed += stats.completed;
        total.failed += stats.failed;
        total.delayed += stats.delayed;
        total.deadLetter += stats.deadLetter;
      }

      return { ...total, byTier };
    },

    async getJob(jobId: string) {
      const raw = await redis.get(jobKey(jobId));
      return raw ? deserializeJob(raw) : null;
    },

    async retryFailed(tier: ComputeTier, limit = 100) {
      const dlqKey = queueKey(tier, 'dead_letter');
      let retried = 0;

      for (let i = 0; i < limit; i++) {
        const jobId = await redis.rpop(dlqKey);
        if (!jobId) break;

        const raw = await redis.get(jobKey(jobId));
        if (!raw) continue;

        const job = deserializeJob(raw);
        job.status = 'waiting';
        job.attempt = 0;
        job.error = undefined;
        job.failedAt = undefined;

        await redis.set(jobKey(jobId), serializeJob(job), { ex: 86400 });
        await redis.zadd(queueKey(tier, 'waiting'), job.priority, jobId);
        retried++;
      }

      return retried;
    },

    async drainDeadLetter(tier: ComputeTier) {
      const dlqKey = queueKey(tier, 'dead_letter');
      let drained = 0;

      while (true) {
        const jobId = await redis.rpop(dlqKey);
        if (!jobId) break;
        await redis.del(jobKey(jobId));
        drained++;
      }

      return drained;
    },

    async clean(olderThanMs: number) {
      let cleaned = 0;
      const cutoff = Date.now() - olderThanMs;

      for (const tier of tiers) {
        const completedKey = queueKey(tier, 'completed');
        const completedIds = await redis.lrange(completedKey, 0, -1);

        for (const jobId of completedIds) {
          const raw = await redis.get(jobKey(jobId));
          if (!raw) continue;

          const job = deserializeJob(raw);
          if (job.completedAt && job.completedAt.getTime() < cutoff) {
            await redis.del(jobKey(jobId));
            cleaned++;
          }
        }
      }

      return cleaned;
    },

    async destroy() {
      await this.stop();
      processors.clear();
      for (const tier of tiers) {
        activeJobs.get(tier)!.clear();
      }
      logger.info('Worker pool destroyed');
    },
  };
}
