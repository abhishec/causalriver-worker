/**
 * Process Engine Worker — Batch Job Processor
 * =============================================
 * Picks up pending agent_queue jobs with agent_type='bpaas'.
 * Called by process-jobs cron (Phase 5).
 * Available regardless of which services are active.
 *
 * Race-condition safety:
 * The worker uses a two-phase claim protocol to prevent concurrent cron
 * invocations from processing the same job twice:
 *
 *   Phase A — Scan: SELECT pending jobs (may race with other crons).
 *   Phase B — Claim: UPDATE status='running' WHERE status='pending' for each
 *             job ID. Only the invocation whose UPDATE affects rowCount=1
 *             actually processes that job. Concurrent crons that attempt the
 *             same UPDATE get rowCount=0 (the row is no longer 'pending') and
 *             skip it. This provides optimistic-locking semantics without
 *             requiring a database-level advisory lock.
 *
 * This is the same pattern used by the SE-aaS job-worker for 'se-aas' jobs.
 * processBPaaSJob() still writes started_at + status='running' in step 4,
 * but that write is idempotent — the row is already 'running' from the claim.
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
    // ── Phase A: Scan for candidate pending jobs ─────────────────────────────
    // This SELECT is non-atomic — multiple concurrent cron invocations may see
    // the same rows here. The claim step below resolves the race.
    const { data: candidateJobs, error } = await supabase
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

    if (!candidateJobs || candidateJobs.length === 0) {
      return result;
    }

    // ── Phase B: Claim each job atomically before executing ──────────────────
    // UPDATE WHERE status='pending' is an optimistic lock: only the cron
    // invocation that wins the UPDATE race gets to process the job.
    for (const job of candidateJobs) {
      // Attempt to claim by flipping status pending → running atomically.
      // If rowCount === 0 another cron won the race — skip this job.
      const { data: claimedRows, error: claimErr } = await supabase
        .from("agent_queue")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "pending") // guard: only claim if still pending
        .select("id");

      if (claimErr) {
        logger.warn("[ProcessEngine/Worker] Claim update failed (skipping job)", {
          jobId: job.id,
          error: claimErr.message,
        });
        continue;
      }

      if (!claimedRows || claimedRows.length === 0) {
        // Another cron invocation claimed this job first — skip silently.
        logger.warn("[ProcessEngine/Worker] Job already claimed by concurrent worker (skipping)", {
          jobId: job.id,
        });
        continue;
      }

      // We own this job — process it.
      result.processed++;
      result.jobIds.push(job.id);
      try {
        // Pass a pre-claimed copy of the job so processBPaaSJob's step 4
        // (status → running) is idempotent and does not re-race.
        const claimedJob: AgentQueueJob = { ...(job as AgentQueueJob), status: "running" };
        await processBPaaSJob(supabase, claimedJob);
        result.succeeded++;
      } catch (err: unknown) {
        result.failed++;
        logger.warn("[ProcessEngine/Worker] Job failed unexpectedly", {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err: unknown) {
    logger.warn("[ProcessEngine/Worker] processProcessEngineJobs threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}
