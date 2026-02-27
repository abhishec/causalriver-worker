/**
 * Queue Backend Factory
 *
 * Provides a unified interface for enqueueing agent jobs that works with
 * either the current Supabase-based queue (no extra infra) or BullMQ
 * backed by Redis (enables 8-hour+ jobs and horizontal worker scaling).
 *
 * Migration path:
 *   1. Today — REDIS_URL not set → uses Supabase agent_queue (existing behaviour)
 *      Max job duration: ~30 min via Lambda chaining
 *   2. When Redis is provisioned — set REDIS_URL in environment → automatically
 *      uses BullMQ. No code changes required.
 *
 * Env var:
 *   REDIS_URL — Redis connection string, e.g. redis://localhost:6379 or
 *               rediss://user:pass@host:6380 (TLS). If not set, Supabase is used.
 *
 * Usage:
 *   import { enqueueJob } from '@/lib/brain/queue-backend';
 *   const jobId = await enqueueJob({ ... });
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentJobPayload {
  organizationId: string;
  agentType: string;
  taskType: string;
  priority?: number;
  payload: Record<string, unknown>;
}

/** Which underlying queue system is active. */
export type QueueBackend = "bullmq" | "supabase";

// ── Backend detection ────────────────────────────────────────────────────────

/**
 * Returns the active queue backend.
 *
 * Decision:
 *   - REDIS_URL set → 'bullmq'  (persistent Redis-backed queue, unlimited duration)
 *   - REDIS_URL not set → 'supabase'  (current behaviour, Lambda-chained jobs)
 */
export function getQueueBackend(): QueueBackend {
  return process.env.REDIS_URL ? "bullmq" : "supabase";
}

// ── Supabase backend ─────────────────────────────────────────────────────────

/**
 * Enqueue a job using the Supabase agent_queue table.
 * This is the current production path (no Redis required).
 * Jobs are picked up by /api/cron/process-jobs every 10 minutes.
 * Long jobs are extended via Lambda chaining (see chain-invoker.ts).
 */
async function enqueueSupabase(
  supabase: SupabaseClient,
  job: AgentJobPayload
): Promise<string> {
  const { data, error } = await supabase
    .from("agent_queue")
    .insert({
      organization_id: job.organizationId,
      agent_type: job.agentType,
      task_type: job.taskType,
      priority: job.priority ?? 5,
      payload: job.payload,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`[queue-backend] Supabase enqueue failed: ${error?.message}`);
  }

  logger.warn("[queue-backend] Enqueued via Supabase", {
    jobId: data.id,
    agentType: job.agentType,
    orgId: job.organizationId,
  });

  return data.id as string;
}

// ── BullMQ backend ───────────────────────────────────────────────────────────

/**
 * Enqueue a job using BullMQ (Redis-backed).
 * Only called when REDIS_URL is set. Dynamically imports BullMQ to avoid
 * bundling the Redis client when it is not needed.
 *
 * BullMQ advantages over Supabase queue:
 *   - Jobs are picked up immediately (no cron polling delay)
 *   - Workers run as long-lived Node.js processes → no Lambda kill ceiling
 *   - Built-in retry, delay, priority, dead-letter queue
 *   - Horizontal scaling: add more worker processes as load grows
 */
async function enqueueBullMQ(job: AgentJobPayload): Promise<string> {
  const redisUrl = process.env.REDIS_URL!;

  try {
    // Dynamic import — avoids bundling ioredis/bullmq when REDIS_URL is not set
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Queue } = await import("bullmq" as any);
    const { default: IORedis } = await import("ioredis");

    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue("brainos-agents", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 86400 }, // Keep completed jobs 24h
        removeOnFail: { age: 7 * 86400 }, // Keep failed jobs 7d
      },
    });

    const bullJob = await queue.add(
      job.agentType,
      {
        ...job.payload,
        organizationId: job.organizationId,
        taskType: job.taskType,
      },
      {
        priority: job.priority ?? 5,
      }
    );

    // Close the queue connection — we don't want to keep it open per-request
    await queue.close();
    await connection.quit();

    const jobId = String(bullJob.id);
    logger.warn("[queue-backend] Enqueued via BullMQ", {
      jobId,
      agentType: job.agentType,
      orgId: job.organizationId,
    });

    return jobId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[queue-backend] BullMQ enqueue failed: ${msg}`);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue an agent job using the active backend.
 *
 * Pass a Supabase service client for the Supabase backend.
 * The BullMQ backend does not need a client (uses REDIS_URL directly).
 *
 * @param job     Job definition
 * @param supabase Service-role Supabase client (required for 'supabase' backend)
 * @returns Job ID as a string
 */
export async function enqueueJob(
  job: AgentJobPayload,
  supabase?: SupabaseClient
): Promise<string> {
  const backend = getQueueBackend();

  if (backend === "bullmq") {
    return enqueueBullMQ(job);
  }

  // Supabase backend — client is required
  if (!supabase) {
    throw new Error(
      "[queue-backend] Supabase client is required when REDIS_URL is not set. " +
      "Pass a service-role client as the second argument to enqueueJob()."
    );
  }

  return enqueueSupabase(supabase, job);
}
