/**
 * Process Engine Worker — Batch Job Processor
 * =============================================
 * Picks up pending agent_queue jobs with agent_type='bpaas'.
 * Called by process-jobs cron (Phase 5).
 * Available regardless of which services are active.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { processBPaaSJob } from "@/lib/bpaas/job-worker";
import type { AgentQueueJob } from "@/lib/bpaas/job-worker";
import { logger } from "@/lib/logger";
import type { ProcessEngineWorkerResult } from "./types";

export async function processProcessEngineJobs(
  supabase: SupabaseClient,
  limit = 5
): Promise<ProcessEngineWorkerResult> {
  const result: ProcessEngineWorkerResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    jobIds: [],
  };

  try {
    const { data: pendingJobs, error } = await supabase
      .from("agent_queue")
      .select("id, organization_id, agent_type, task_type, priority, payload, status")
      .eq("agent_type", "bpaas")
      .eq("status", "pending")
      .order("priority", { ascending: false }) // high priority first
      .order("created_at", { ascending: true }) // FIFO within priority
      .limit(limit);

    if (error) {
      logger.warn("[ProcessEngine/Worker] Failed to query pending jobs", { error: error.message });
      return result;
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      return result;
    }

    for (const job of pendingJobs) {
      result.processed++;
      result.jobIds.push(job.id);
      try {
        await processBPaaSJob(supabase, job as AgentQueueJob);
        result.succeeded++;
      } catch (err) {
        result.failed++;
        logger.warn("[ProcessEngine/Worker] Job failed unexpectedly", {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.warn("[ProcessEngine/Worker] processProcessEngineJobs threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}
