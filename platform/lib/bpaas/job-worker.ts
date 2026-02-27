/**
 * BPaaS Job Worker
 * =================
 * Dispatch layer for agent_queue rows with agent_type = 'bpaas'.
 *
 * Flow:
 * 1. Validate agent_type is 'bpaas'
 * 2. Extract processType, organizationId, inputPayload from payload
 * 3. Validate processType via isBPaaSProcessType()
 * 4. Mark job running (status → 'running', started_at = now())
 * 5. Call executeBPaaSProcess()
 * 6. Handle 5 result states:
 *    - completed      → status = 'completed', result written
 *    - awaiting_approval → status = 'awaiting_hitl' (job is PAUSED, not done)
 *    - escalated      → status = 'paused', result with escalation info
 *    - chained        → insert new pending job + chain payload, status = 'completed'
 *    - failed         → status = 'failed', error_message written
 * 7. Unexpected errors → status = 'failed', error_message written
 *
 * agent_type = 'bpaas' — NEVER 'se-aas'.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeBPaaSProcess } from "./domain-executor";
import { isBPaaSProcessType } from "./process-registry";
import { MAX_CHAIN_DEPTH } from "@/lib/brain/chain-invoker";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Shape of an agent_queue row as fetched by the process-jobs cron. */
export interface AgentQueueJob {
  id: string;
  organization_id: string;
  agent_type: string;
  task_type: string;
  priority?: string | null;
  payload?: Record<string, unknown> | null;
  status?: string | null;
}

// ── Main Dispatch Function ────────────────────────────────────────────────────

/**
 * Process a single BPaaS job from the agent_queue.
 *
 * Called by the process-jobs cron after it selects a pending bpaas row.
 * Handles all 5 result states and writes back to agent_queue on every path.
 *
 * @param supabase  Service-role Supabase client
 * @param job       The agent_queue row to process
 */
export async function processBPaaSJob(
  supabase: SupabaseClient,
  job: AgentQueueJob
): Promise<void> {
  // ── 1. Validate agent_type ─────────────────────────────────────────────────
  if (job.agent_type !== "bpaas") {
    logger.warn("[bpaas/job-worker] processBPaaSJob called with wrong agent_type", {
      jobId: job.id,
      agentType: job.agent_type,
    });
    await supabase
      .from("agent_queue")
      .update({
        status: "failed",
        error_message: `processBPaaSJob: expected agent_type='bpaas', got '${job.agent_type}'`,
      })
      .eq("id", job.id);
    return;
  }

  // ── 2. Extract payload fields ──────────────────────────────────────────────
  const payload = (job.payload ?? {}) as Record<string, unknown>;

  const processType = payload.processType as string | undefined;
  const organizationId =
    (payload.organizationId as string | undefined) ?? job.organization_id;
  const inputPayload = (payload.inputPayload as Record<string, unknown> | undefined) ?? {};
  const resumeFromJobId = payload.resumeFromJobId as string | undefined;
  const chainDepth = (payload.chainDepth as number | undefined) ?? 0;
  const userId = payload.userId as string | undefined;

  // ── 2b. Chain depth guard — prevent infinite Lambda chaining ──────────────
  // MAX_CHAIN_DEPTH (20) matches the global chain-invoker limit.
  // Without this check a process that always triggers shouldChain() would
  // create an unbounded chain of pending jobs, exhausting the queue.
  if (chainDepth >= MAX_CHAIN_DEPTH) {
    logger.warn("[bpaas/job-worker] Max chain depth reached — aborting", {
      jobId: job.id,
      processType: payload.processType,
      chainDepth,
      maxChainDepth: MAX_CHAIN_DEPTH,
    });
    await supabase
      .from("agent_queue")
      .update({
        status: "failed",
        error_message: `Max chain depth (${MAX_CHAIN_DEPTH}) reached — process aborted to prevent infinite chaining`,
      })
      .eq("id", job.id);
    return;
  }

  // ── 3. Validate processType ────────────────────────────────────────────────
  if (!processType) {
    logger.warn("[bpaas/job-worker] Missing processType in payload", { jobId: job.id });
    await supabase
      .from("agent_queue")
      .update({
        status: "failed",
        error_message: "Missing processType in payload",
      })
      .eq("id", job.id);
    return;
  }

  if (!isBPaaSProcessType(processType)) {
    logger.warn("[bpaas/job-worker] Invalid processType", {
      jobId: job.id,
      processType,
    });
    await supabase
      .from("agent_queue")
      .update({
        status: "failed",
        error_message: `Invalid BPaaS process type: '${processType}'`,
      })
      .eq("id", job.id);
    return;
  }

  // ── 4. Mark job running ────────────────────────────────────────────────────
  await supabase
    .from("agent_queue")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  // ── 5. Execute + 6/7. Handle result ───────────────────────────────────────
  try {
    const result = await executeBPaaSProcess(
      {
        jobId: job.id,
        organizationId,
        processType,
        inputPayload,
        resumeFromJobId,
        chainDepth,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        userId,
      },
      supabase
    );

    if (result.status === "completed") {
      // Happy path — write result and mark done
      await supabase
        .from("agent_queue")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result: {
            outputResult: result.outputResult,
            processInstanceId: result.processInstanceId,
            finalState: result.finalState,
            durationMs: result.durationMs,
          },
        })
        .eq("id", job.id);

      logger.warn("[bpaas/job-worker] Job completed", {
        jobId: job.id,
        processType,
        durationMs: result.durationMs,
      });
    } else if (result.status === "awaiting_approval") {
      // HITL pause — job is NOT done; it waits for POST /api/agents/{id}/resume
      await supabase
        .from("agent_queue")
        .update({
          status: "awaiting_hitl",
          result: {
            processInstanceId: result.processInstanceId,
            finalState: result.finalState,
            approvalId: result.approvalId,
            durationMs: result.durationMs,
          },
        })
        .eq("id", job.id);

      logger.warn("[bpaas/job-worker] Job paused at approval gate (awaiting_hitl)", {
        jobId: job.id,
        processType,
        approvalId: result.approvalId,
      });
    } else if (result.status === "escalated") {
      // Policy escalation — mark paused so operators can inspect
      await supabase
        .from("agent_queue")
        .update({
          status: "paused",
          result: {
            escalationLevel: result.escalationLevel,
            processInstanceId: result.processInstanceId,
            finalState: result.finalState,
            durationMs: result.durationMs,
          },
        })
        .eq("id", job.id);

      logger.warn("[bpaas/job-worker] Job escalated", {
        jobId: job.id,
        processType,
        escalationLevel: result.escalationLevel,
      });
    } else if (result.status === "chained") {
      // Lambda chain continuation — insert new pending job, mark current completed
      await supabase.from("agent_queue").insert({
        organization_id: job.organization_id,
        agent_type: "bpaas",
        task_type: job.task_type,
        priority: job.priority ?? "normal",
        status: "pending",
        payload: {
          ...payload,
          resumeFromJobId: job.id,
          chainDepth: result.chainDepth,
        },
      });

      await supabase
        .from("agent_queue")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result: {
            chained: true,
            processInstanceId: result.processInstanceId,
            finalState: result.finalState,
            chainDepth: result.chainDepth,
            durationMs: result.durationMs,
          },
        })
        .eq("id", job.id);

      logger.warn("[bpaas/job-worker] Job chained — new pending job queued", {
        jobId: job.id,
        processType,
        chainDepth: result.chainDepth,
      });
    } else {
      // result.status === 'failed'
      await supabase
        .from("agent_queue")
        .update({
          status: "failed",
          error_message: result.errorMessage ?? "BPaaS execution failed",
        })
        .eq("id", job.id);

      logger.warn("[bpaas/job-worker] Job failed", {
        jobId: job.id,
        processType,
        errorMessage: result.errorMessage,
      });
    }
  } catch (err) {
    // ── 7. Unexpected error ──────────────────────────────────────────────────
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[bpaas/job-worker] Unexpected error during job execution", {
      jobId: job.id,
      processType,
      error: errorMessage,
    });

    await supabase
      .from("agent_queue")
      .update({
        status: "failed",
        error_message: `Unexpected error: ${errorMessage}`,
      })
      .eq("id", job.id);
  }
}
