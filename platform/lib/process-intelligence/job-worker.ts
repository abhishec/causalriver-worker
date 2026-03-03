/**
 * Process Engine Job Worker
 * ==========================
 * Dispatch layer for agent_queue rows with agent_type = 'bpaas'.
 * (agent_type value 'bpaas' is kept for backward compat — do not rename)
 *
 * Flow:
 * 1. Validate agent_type is 'bpaas'
 * 2. Extract processType, organizationId, inputPayload from payload
 * 3. Validate processType via isValidProcessType() — DB query, not hardcoded array
 * 4. Mark job running (status → 'running', started_at = now())
 * 5. Call executeProcess()
 * 6. Handle 5 result states:
 *    - completed      → status = 'completed', result written
 *    - awaiting_approval → status = 'awaiting_approval' (job is PAUSED, not done)
 *    - escalated      → status = 'paused', result with escalation info
 *    - chained        → insert new pending job + chain payload, status = 'completed'
 *    - failed         → status = 'failed', error_message written (non-retryable)
 * 7. Unexpected errors → retry logic:
 *    - If retry_count < max_retries: re-queue as 'pending' with exponential backoff
 *    - If retry_count >= max_retries: mark permanently 'failed'
 *
 * Retry policy:
 *   Unexpected errors (LLM timeouts, network hiccups, unhandled throws) are
 *   retried automatically up to max_retries (default 3 from migration).
 *   Domain-level failures (result.status='failed') are NOT retried — they
 *   represent deterministic outcomes (policy violation, bad input, etc.).
 *   DB constraint violations (non-retryable) are identified by error message
 *   prefix and bypass the retry path immediately.
 *
 * agent_type = 'bpaas' — NEVER 'se-aas'. (value kept for backward compat)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeProcess } from "./domain-executor";
import { isValidProcessType } from "./process-registry";
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
  /** Number of times this job has already been attempted (migration 20260330000020). */
  retry_count?: number | null;
  /** Maximum automatic retries before permanent failure (default 3). */
  max_retries?: number | null;
  /** AI worker UUID — propagated to RL tables for per-worker threshold adaptation (ADR-020). */
  ai_worker_id?: string | null;
}

// ── Retry helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true when an unexpected error is likely transient and should be
 * retried. DB constraint violations (unique_violation, RLS rejection) and
 * validation errors are deterministic — retrying them wastes resources.
 */
function isTransientError(errorMessage: string): boolean {
  const nonRetryablePatterns = [
    "duplicate key",                 // PG unique_violation
    "violates row-level",            // RLS rejection
    "violates foreign key",          // FK constraint
    "invalid input syntax",          // Bad data type
    "null value in column",          // NOT NULL violation
    "permission denied",             // Auth failure
    "Invalid BPaaS process",         // Validation (processProcessJob step 3) — legacy string kept
    "Missing processType",           // Validation (processProcessJob step 2)
  ];
  const lower = errorMessage.toLowerCase();
  return !nonRetryablePatterns.some((p) => lower.includes(p.toLowerCase()));
}

// ── Main Dispatch Function ────────────────────────────────────────────────────

/**
 * Process a single Process Engine job from the agent_queue.
 *
 * Called by the process-jobs cron after it selects a pending bpaas row.
 * Handles all 5 result states and writes back to agent_queue on every path.
 *
 * @param supabase  Service-role Supabase client
 * @param job       The agent_queue row to process
 */
export async function processProcessJob(
  supabase: SupabaseClient,
  job: AgentQueueJob
): Promise<void> {
  // ── 1. Validate agent_type ─────────────────────────────────────────────────
  // agent_type value 'bpaas' is kept for backward compat — do not rename
  if (job.agent_type !== "bpaas") {
    logger.warn("[process-engine/job-worker] processProcessJob called with wrong agent_type", {
      jobId: job.id,
      agentType: job.agent_type,
    });
    await supabase
      .from("agent_queue")
      .update({
        status: "failed",
        error_message: `processProcessJob: expected agent_type='bpaas', got '${job.agent_type}'`,
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
  // Fix 6: Propagate ai_worker_id from the job row to executeProcess → RL tables.
  // The worker SELECT now includes ai_worker_id so this is non-null when the job
  // was submitted with a worker context (API key auth or ADR-013 body param).
  const aiWorkerId = job.ai_worker_id ?? (payload.ai_worker_id as string | undefined) ?? undefined;

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
    logger.warn("[process-engine/job-worker] Missing processType in payload", { jobId: job.id });
    await supabase
      .from("agent_queue")
      .update({
        status: "failed",
        error_message: "Missing processType in payload",
      })
      .eq("id", job.id);
    return;
  }

  // DB-driven validation — any type in bpaas_process_definitions is valid.
  // (table: bpaas_process_definitions, legacy name, kept for backward compat)
  // Replaces the old sync check against the hardcoded process types array.
  const isValid = await isValidProcessType(processType, organizationId, supabase);
  if (!isValid) {
    logger.warn("[process-engine/job-worker] Unknown process type — skipping", {
      jobId: job.id,
      processType,
    });
    await supabase
      .from("agent_queue")
      .update({
        status: "failed",
        error_message: `Unknown process type: ${processType}`,
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
    const result = await executeProcess(
      {
        jobId: job.id,
        organizationId,
        processType,
        inputPayload,
        resumeFromJobId,
        chainDepth,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        userId,
        aiWorkerId,
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

      logger.warn("[process-engine/job-worker] Job completed", {
        jobId: job.id,
        processType,
        durationMs: result.durationMs,
      });
    } else if (result.status === "awaiting_approval") {
      // HITL pause — job is NOT done; it waits for POST /api/agents/{id}/resume.
      //
      // Use 'suspended' — the canonical HITL-paused status introduced in migration
      // 20260329000003_agent_suspended_status.sql. The FSM's pauseJobAtDecisionGate()
      // already wrote 'suspended' earlier; this write is idempotent (same value) and
      // also carries the result JSONB that pauseJobAtDecisionGate cannot populate
      // (it doesn't have the full execution result at that point).
      //
      // 'awaiting_approval' (the old status) is still accepted by resume_agent_job()
      // RPC for backward compat, but 'suspended' is the correct canonical value.
      // Writing 'suspended' here ensures:
      //   1. The idx_agent_queue_suspended index is used by AgentLiveMonitor
      //   2. The status matches what pauseJobAtDecisionGate already wrote
      //   3. No transient window where the job shows 'awaiting_approval' before
      //      the cron's recover_stale_jobs RPC might misclassify it
      await supabase
        .from("agent_queue")
        .update({
          status: "suspended",
          result: {
            processInstanceId: result.processInstanceId,
            finalState: result.finalState,
            approvalId: result.approvalId,
            durationMs: result.durationMs,
          },
        })
        .eq("id", job.id);

      logger.warn("[process-engine/job-worker] Job suspended at approval gate (awaiting human review)", {
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

      logger.warn("[process-engine/job-worker] Job escalated", {
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

      logger.warn("[process-engine/job-worker] Job chained — new pending job queued", {
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
          error_message: result.errorMessage ?? "Process Engine execution failed",
        })
        .eq("id", job.id);

      logger.warn("[process-engine/job-worker] Job failed", {
        jobId: job.id,
        processType,
        errorMessage: result.errorMessage,
      });
    }
  } catch (err) {
    // ── 7. Unexpected error — apply retry logic ──────────────────────────────
    // Distinguish transient errors (network, LLM timeout, DB hiccup) from
    // deterministic failures (constraint violations, auth errors).
    // Transient errors are retried up to max_retries before permanent failure.
    const errorMessage = err instanceof Error ? err.message : String(err);
    const currentRetryCount = job.retry_count ?? 0;
    const maxRetries = job.max_retries ?? 3;
    const transient = isTransientError(errorMessage);

    if (transient && currentRetryCount < maxRetries) {
      // Exponential backoff via retry_count: 0→pending immediately (re-picked
      // on next cron tick), 1→pending (same), etc.
      // The cron runs every 2 minutes, providing natural backoff between retries.
      const nextRetryCount = currentRetryCount + 1;
      logger.warn("[process-engine/job-worker] Transient error — requeueing for retry", {
        jobId: job.id,
        processType,
        error: errorMessage,
        retryAttempt: nextRetryCount,
        maxRetries,
      });

      await supabase
        .from("agent_queue")
        .update({
          status: "pending",
          retry_count: nextRetryCount,
          error_message: `Transient error (attempt ${nextRetryCount}/${maxRetries}): ${errorMessage}`,
          started_at: null,
        })
        .eq("id", job.id);
    } else {
      // Non-retryable error OR retries exhausted — permanent failure
      const reason = transient
        ? `Exhausted ${maxRetries} retries — last error: ${errorMessage}`
        : `Non-retryable error: ${errorMessage}`;

      logger.error("[process-engine/job-worker] Permanent failure", {
        jobId: job.id,
        processType,
        error: errorMessage,
        retryCount: currentRetryCount,
        maxRetries,
        transient,
      });

      await supabase
        .from("agent_queue")
        .update({
          status: "failed",
          error_message: reason,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }
}

/** @deprecated Use processProcessJob instead */
export const processBPaaSJob = processProcessJob;
