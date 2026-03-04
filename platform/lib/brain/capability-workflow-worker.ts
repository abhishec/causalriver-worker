/**
 * Capability Workflow Worker — ADR-031 Phase 4
 * ==============================================
 *
 * Processes paused capability-workflow jobs from agent_queue.
 * These are FSM workflows that hit a waitCondition (e.g., ingestion_complete)
 * and checkpointed to agent_queue for durable execution.
 *
 * Flow:
 *   1. Query agent_queue WHERE agent_type='capability-workflow' AND status='paused'
 *   2. For each: check if waitCondition is met
 *   3. If met: resume FSM from checkpoint via executeFSMWorkflowFromCheckpoint()
 *   4. If resumed workflow hits ANOTHER waitCondition: re-pause (update checkpoint)
 *   5. If complete: status='completed' with result
 *   6. If error: retry_count++ → retry or fail
 *
 * Integrated into process-jobs cron as Phase 6.
 * No new tables, no new cron routes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeFSMWorkflowFromCheckpoint,
  type FSMCheckpoint,
  type FSMWorkflowDefinition,
} from "./universal-capability-executor";
import type { PrimitiveContext } from "./primitive-registry";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

interface WaitCondition {
  type: string;
  resolvedJobIds?: string[];
  description?: string;
}

interface PausedJob {
  id: string;
  organization_id: string;
  ai_worker_id: string | null;
  task_type: string;
  payload: {
    capabilityName: string;
    checkpoint: FSMCheckpoint;
    waitCondition: WaitCondition;
    userId: string;
  };
  retry_count: number;
  max_retries: number;
}

// ── Wait condition checkers ──────────────────────────────────────────────────

/**
 * Check if an ingestion_complete wait condition is satisfied.
 * All referenced ingestion_jobs must be in a terminal state (completed/failed).
 */
async function checkIngestionComplete(
  supabase: SupabaseClient,
  condition: WaitCondition,
): Promise<{ met: boolean; details: string }> {
  const jobIds = condition.resolvedJobIds ?? [];
  if (jobIds.length === 0) {
    return { met: true, details: "No ingestion jobs to wait for" };
  }

  const { data: jobs, error } = await supabase
    .from("ingestion_jobs")
    .select("id, status")
    .in("id", jobIds);

  if (error) {
    return { met: false, details: `Failed to query ingestion_jobs: ${error.message}` };
  }

  if (!jobs || jobs.length === 0) {
    // Jobs not found — might have been deleted. Treat as met to unblock.
    return { met: true, details: "Ingestion jobs not found — treating as complete" };
  }

  const allTerminal = jobs.every(
    (j: { status: string }) => j.status === "completed" || j.status === "failed",
  );
  const statuses = jobs.map((j: { id: string; status: string }) => `${j.id}:${j.status}`).join(", ");

  return {
    met: allTerminal,
    details: allTerminal
      ? `All ingestion jobs terminal: ${statuses}`
      : `Waiting on: ${statuses}`,
  };
}

/**
 * Check if a wait condition is met. Extensible — add new condition types here.
 */
async function isWaitConditionMet(
  supabase: SupabaseClient,
  condition: WaitCondition,
): Promise<{ met: boolean; details: string }> {
  switch (condition.type) {
    case "ingestion_complete":
      return checkIngestionComplete(supabase, condition);
    default:
      // Unknown condition type — assume met to prevent permanent stall
      logger.warn("[capability-worker] Unknown waitCondition type — treating as met", {
        type: condition.type,
      });
      return { met: true, details: `Unknown condition type '${condition.type}' — auto-resolved` };
  }
}

// ── Main worker ──────────────────────────────────────────────────────────────

export async function processCapabilityWorkflows(
  supabase: SupabaseClient,
  limit: number = 3,
): Promise<{ processed: number; resumed: number; completed: number; failed: number }> {
  // 1. Fetch paused capability-workflow jobs
  const { data: pausedJobs, error: fetchError } = await supabase
    .from("agent_queue")
    .select("id, organization_id, ai_worker_id, task_type, payload, retry_count, max_retries")
    .eq("agent_type", "capability-workflow")
    .eq("status", "paused")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchError) {
    logger.warn("[capability-worker] Failed to fetch paused jobs", { error: fetchError.message });
    return { processed: 0, resumed: 0, completed: 0, failed: 0 };
  }

  if (!pausedJobs || pausedJobs.length === 0) {
    return { processed: 0, resumed: 0, completed: 0, failed: 0 };
  }

  let resumed = 0;
  let completed = 0;
  let failed = 0;

  for (const rawJob of pausedJobs) {
    const job = rawJob as unknown as PausedJob;

    try {
      // 2. Check if waitCondition is met
      const waitCondition = job.payload?.waitCondition;
      if (!waitCondition) {
        logger.warn("[capability-worker] Job has no waitCondition — marking complete", { jobId: job.id });
        await supabase.from("agent_queue").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result: { error: "No waitCondition in payload" },
        }).eq("id", job.id);
        failed++;
        continue;
      }

      const { met, details } = await isWaitConditionMet(supabase, waitCondition);

      if (!met) {
        logger.warn("[capability-worker] WaitCondition not met — skipping", {
          jobId: job.id,
          type: waitCondition.type,
          details,
        });
        continue;
      }

      logger.warn("[capability-worker] WaitCondition met — resuming FSM", {
        jobId: job.id,
        capability: job.task_type,
        details,
      });

      // 3. Mark as running
      await supabase.from("agent_queue").update({
        status: "running",
        started_at: new Date().toISOString(),
      }).eq("id", job.id);

      // 4. Look up workflow definition from capability_library
      const { data: capRow } = await supabase
        .from("capability_library")
        .select("workflow_definition")
        .eq("name", job.task_type)
        .eq("organization_id", job.organization_id)
        .in("status", ["validated", "promoted"])
        .order("quality_score", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fallback to system template
      const capData = capRow ?? (await supabase
        .from("capability_library")
        .select("workflow_definition")
        .eq("name", job.task_type)
        .eq("organization_id", "00000000-0000-0000-0000-000000000001")
        .limit(1)
        .maybeSingle()
      ).data;

      if (!capData?.workflow_definition) {
        logger.warn("[capability-worker] Capability not found for resume", {
          jobId: job.id,
          capability: job.task_type,
        });
        await supabase.from("agent_queue").update({
          status: "failed",
          error_message: `Capability '${job.task_type}' not found for resume`,
          completed_at: new Date().toISOString(),
        }).eq("id", job.id);
        failed++;
        continue;
      }

      // 5. Build context and resume
      const ctx: PrimitiveContext = {
        supabase,
        organizationId: job.organization_id,
        userId: job.payload.userId ?? "system",
        aiWorkerId: job.ai_worker_id ?? undefined,
      };

      const fsmDef = capData.workflow_definition as FSMWorkflowDefinition;

      const result = await executeFSMWorkflowFromCheckpoint(ctx, fsmDef, job.payload.checkpoint);
      resumed++;

      // 6. Handle result
      if (result.success && result.result?.asyncWait) {
        // Another waitCondition — re-pause with updated checkpoint
        logger.warn("[capability-worker] FSM paused again after resume", {
          jobId: job.id,
          nextWaitType: (result.result.waitCondition as WaitCondition | undefined)?.type,
        });

        await supabase.from("agent_queue").update({
          status: "paused",
          payload: {
            ...job.payload,
            checkpoint: result.result.checkpoint,
            waitCondition: result.result.waitCondition,
          },
          metadata: {
            waitCondition: result.result.waitCondition,
            lastResumedAt: new Date().toISOString(),
          },
        }).eq("id", job.id);
      } else if (result.success) {
        // Complete!
        logger.warn("[capability-worker] Workflow completed successfully", {
          jobId: job.id,
          capability: job.task_type,
        });

        await supabase.from("agent_queue").update({
          status: "completed",
          result: {
            capabilityName: result.capabilityName,
            narrative: result.narrative,
            data: result.result,
          },
          completed_at: new Date().toISOString(),
        }).eq("id", job.id);
        completed++;
      } else {
        // Error during resume
        const retryCount = (job.retry_count ?? 0) + 1;
        const maxRetries = job.max_retries ?? 3;

        if (retryCount < maxRetries) {
          logger.warn("[capability-worker] Resume failed — will retry", {
            jobId: job.id,
            error: result.error,
            retryCount,
            maxRetries,
          });
          await supabase.from("agent_queue").update({
            status: "paused", // keep paused so next tick retries
            retry_count: retryCount,
            error_message: result.error,
          }).eq("id", job.id);
        } else {
          logger.warn("[capability-worker] Resume failed — max retries exhausted", {
            jobId: job.id,
            error: result.error,
            retryCount,
          });
          await supabase.from("agent_queue").update({
            status: "failed",
            retry_count: retryCount,
            error_message: result.error,
            completed_at: new Date().toISOString(),
          }).eq("id", job.id);
          failed++;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[capability-worker] Unexpected error processing job", {
        jobId: job.id,
        error: msg,
      });

      const retryCount = (job.retry_count ?? 0) + 1;
      const maxRetries = job.max_retries ?? 3;

      await supabase.from("agent_queue").update({
        status: retryCount < maxRetries ? "paused" : "failed",
        retry_count: retryCount,
        error_message: msg,
        ...(retryCount >= maxRetries ? { completed_at: new Date().toISOString() } : {}),
      }).eq("id", job.id);

      if (retryCount >= maxRetries) failed++;
    }
  }

  return { processed: pausedJobs.length, resumed, completed, failed };
}
