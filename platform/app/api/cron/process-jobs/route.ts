/**
 * GET /api/cron/process-jobs
 *
 * Standalone cron endpoint that drains the SE-aaS agent_queue.
 * Must be called on a schedule (e.g. every 2 minutes) to ensure
 * jobs don't stall when no user request triggers them.
 *
 * Security: Protected by Bearer CRON_SECRET header.
 *
 * Schedule (add to Amplify or external scheduler):
 *   Every 2 minutes: GET /api/cron/process-jobs
 *
 * Worker types:
 *   - ?type=light   — fast domains (pod-match, scope-creep, etc.)
 *   - ?type=heavy   — slow domains (tdd-code-generator, pr-review, etc.)
 *   - ?type=mixed   — all domains (default, for small deployments)
 *
 * Phase 1: Stale job recovery runs on EVERY invocation before processing
 *   new jobs. Jobs with no heartbeat update for > 120s are moved from
 *   'running' → 'failed' so they can be retried on the next tick.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processSeAaSJobs, processCodeAgentJobs, type WorkerType } from "@/lib/se-aas/job-worker";
import { writeAllServiceHealth } from "@/lib/brain/service-health-writer";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minute Lambda limit

/**
 * Lambda timeout guard — 25 seconds (Lambda max is 30s; 5s buffer for cleanup).
 *
 * Long-running jobs can be interrupted mid-execution when Lambda's timeout fires.
 * Without this guard, jobs are left in 'running' state permanently — the stale-job
 * recovery RPC in Phase 1 will eventually recover them, but that takes 120s of
 * dead time. With this guard we fail fast and return a clean response within the
 * Lambda window, keeping the queue accurate.
 */
const LAMBDA_TIMEOUT_MS = 25_000;

/**
 * Wraps a promise with a timeout. Resolves with the result or rejects with a
 * timeout error after `timeoutMs` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`lambda_timeout: ${label} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerType = (request.nextUrl.searchParams.get("type") ?? "mixed") as WorkerType;
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "5", 10) || 5, 20);

  const startMs = Date.now();
  let staleJobsRecovered = 0;

  try {
    const service = await createServiceClient();

    // ── Phase 1: Stale job recovery ──────────────────────────────
    // Recover jobs stuck in 'running' because Lambda killed them at 90s.
    // Any job with no heartbeat update for > 60s is moved to 'failed'.
    // 60s (was 120s) — Lambda max is 30s, so 60s = 2 full Lambda cycles, safe margin.
    // This runs BEFORE processing new jobs so the worker slot count is
    // accurate when the per-org backpressure check runs.
    try {
      const { data: recovered, error: recoverError } = await service
        .rpc("recover_stale_jobs", { stale_threshold_seconds: 60 });

      if (recoverError) {
        logger.warn("[cron/process-jobs] recover_stale_jobs RPC error (non-fatal)", {
          error: recoverError.message,
        });
      } else {
        staleJobsRecovered = (recovered as number) ?? 0;
        if (staleJobsRecovered > 0) {
          logger.warn(
            `[cron/process-jobs] Recovered ${staleJobsRecovered} stale job(s) running→failed`
          );
        }
      }

      // Safety net (audit H5): recover_stale_jobs RPC may incorrectly flip 'paused' jobs to
      // 'failed' if they had no heartbeat update during the checkpointing window.
      // Paused jobs always have checkpoint_data set by checkpointAndChain() — restore them.
      const { data: fixedPaused, error: pausedFixErr } = await service
        .from("agent_queue")
        .update({ status: "paused", error_message: null })
        .eq("status", "failed")
        .not("checkpoint_data", "is", null)
        .gte("updated_at", new Date(Date.now() - 30_000).toISOString())
        .select("id");
      if (!pausedFixErr && fixedPaused?.length) {
        logger.warn(`[cron/process-jobs] Restored ${fixedPaused.length} paused job(s) incorrectly moved to failed`);
      }
    } catch (recoverErr: unknown) {
      // Non-fatal: stale recovery failure must NOT prevent new jobs from running
      logger.error("[cron/process-jobs] recover_stale_jobs threw (non-fatal)", {
        error: recoverErr instanceof Error ? recoverErr.message : String(recoverErr),
        route: "/api/cron/process-jobs",
      });
    }

    // ── Phase 2: Process pending SE-aaS jobs ─────────────────────
    // Wrapped with a 25s timeout so we never exceed Lambda's 30s wall clock.
    // On timeout: job-worker leaves jobs in 'running' — Phase 1 on the next
    // tick will recover them (stale threshold: 120s). The timeout error is
    // caught below and returned as { ok: false, error: 'lambda_timeout' }.
    const result = await withTimeout(
      processSeAaSJobs(service, limit, workerType),
      LAMBDA_TIMEOUT_MS,
      "processSeAaSJobs"
    );

    // ── Phase 3: Process pending code-agent (overnight) jobs ─────
    // Run up to 3 code-agent child jobs per cron tick.
    // These are separate from SE-aaS jobs — they create GitHub PRs.
    // Remaining budget after Phase 2: deduct Phase 1 + Phase 2 elapsed time.
    const phaseElapsed = Date.now() - startMs;
    const remainingBudget = Math.max(0, LAMBDA_TIMEOUT_MS - phaseElapsed);
    const codeAgentResult = await withTimeout(
      processCodeAgentJobs(service, 3),
      remainingBudget > 2_000 ? remainingBudget : 2_000, // At least 2s for code agents
      "processCodeAgentJobs"
    );

    // ── Phase 4: Process Engine Jobs (FSM/HITL — available to all workers regardless of service) ──
    // Processes jobs that have a process_definition in their payload (Process Engine FSM).
    // These are submitted via any SE-aaS/AaaS/PM-aaS job payload with process_definition set.
    // Without this phase, FSM/HITL jobs sit pending forever.
    let processEngineResult = { processed: 0, succeeded: 0, failed: 0, jobIds: [] as string[] };
    const remainingForProcessEngine = Math.max(0, 28_000 - (Date.now() - startMs));
    if (remainingForProcessEngine > 2_000) {
      try {
        const { processProcessEngineJobs } = await import("@/lib/process-engine/worker");
        processEngineResult = await withTimeout(
          processProcessEngineJobs(service, 5),
          remainingForProcessEngine,
          "processProcessEngineJobs"
        );
      } catch (err) {
        logger.error("[process-jobs] processEngine phase error", { error: err });
      }
    }

    // ── Phase 4b: Process general-purpose agent jobs ──────────────
    // General agents handle arbitrary tasks via Claude tool_use loops.
    // Separate from SE-aaS (domain-specific) and code-agents (GitHub PRs).
    let generalResult = { processed: 0, succeeded: 0, failed: 0, jobIds: [] as string[] };
    const remainingForGeneral = Math.max(0, 28_000 - (Date.now() - startMs));
    if (remainingForGeneral > 2_000) {
      try {
        const { processGeneralJobs } = await import("@/lib/agents/general-worker");
        generalResult = await withTimeout(
          processGeneralJobs(service, 2),
          remainingForGeneral,
          "processGeneralJobs"
        );
      } catch (err) {
        logger.error("[process-jobs] general-worker phase error", { error: err });
      }
    }

    // ── Phase 4c: APEX agent jobs (FSM-gated, Perplexity-style quality gates) ──
    let apexResult = { processed: 0, succeeded: 0, failed: 0, jobIds: [] as string[] };
    const remainingForApex = Math.max(0, 28_000 - (Date.now() - startMs));
    if (remainingForApex > 2_000) {
      try {
        const { processApexJobs } = await import("@/lib/agents/apex-worker");
        apexResult = await withTimeout(
          processApexJobs(service, 1),
          remainingForApex,
          "processApexJobs"
        );
      } catch (err) {
        logger.error("[process-jobs] apex-worker phase error", { error: err });
      }
    }

    // ── Phase 5: Service Health snapshot ─────────────────────────
    // Fire-and-forget health writes for active orgs. Non-blocking.
    // Provides service_health table data for brain-context.ts L26/L27/L28.
    void writeAllServiceHealth(service).catch((err: unknown) => {
      logger.warn("[cron/process-jobs] writeAllServiceHealth failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // ── Phase 6: Capability Workflow resumption (ADR-031) ──────
    // Resumes FSM workflows paused by waitCondition (e.g., ingestion_complete).
    // Uses existing agent_queue rows with agent_type='capability-workflow'.
    let capabilityResult = { processed: 0, resumed: 0, completed: 0, failed: 0 };
    const remainingForCapabilities = Math.max(0, 28_000 - (Date.now() - startMs));
    if (remainingForCapabilities > 2_000) {
      try {
        const { processCapabilityWorkflows } = await import("@/lib/brain/capability-workflow-worker");
        capabilityResult = await withTimeout(
          processCapabilityWorkflows(service, 3),
          remainingForCapabilities,
          "processCapabilityWorkflows"
        );
      } catch (err) {
        logger.error("[process-jobs] capability-workflow phase error", { error: err });
      }
    }

    const durationMs = Date.now() - startMs;
    logger.warn(
      `[cron/process-jobs] type=${workerType} staleRecovered=${staleJobsRecovered} ` +
      `processed=${result.processed} ok=${result.succeeded} failed=${result.failed} ` +
      `codeAgents=${codeAgentResult.processed}(ok=${codeAgentResult.succeeded}) ` +
      `general=${generalResult.processed}(ok=${generalResult.succeeded}) ` +
      `apex=${apexResult.processed}(ok=${apexResult.succeeded}) ` +
      `processEngine=${processEngineResult.processed}(ok=${processEngineResult.succeeded}) ` +
      `capabilityWf=${capabilityResult.processed}(resumed=${capabilityResult.resumed}) took=${durationMs}ms`
    );

    return NextResponse.json({
      ok: true,
      workerType,
      staleJobsRecovered,
      ...result,
      codeAgent: codeAgentResult,
      general: generalResult,
      apex: apexResult,
      processEngine: processEngineResult,
      capabilityWorkflow: capabilityResult,
      durationMs,
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isTimeout = errorMessage.startsWith("lambda_timeout");

    if (isTimeout) {
      // Graceful timeout — jobs in 'running' state will be recovered by Phase 1
      // on the next cron tick (stale threshold: 120s). Return 200 so the scheduler
      // does not back off — the next invocation should run immediately.
      logger.warn("[cron/process-jobs] Lambda timeout — returning gracefully", {
        durationMs,
        workerType,
        staleJobsRecovered,
        route: "/api/cron/process-jobs",
      });
      return NextResponse.json({
        ok: false,
        error: "lambda_timeout",
        workerType,
        staleJobsRecovered,
        durationMs,
      });
    }

    logger.error("[cron/process-jobs] Error:", { error: errorMessage, route: "/api/cron/process-jobs" });
    // Return 200 even on unexpected failure — cron schedulers that see 5xx may
    // retry immediately or back off exponentially, causing thundering herd.
    // The error is captured in logs; retrying a broken job every 2 min is safer.
    return NextResponse.json(
      {
        ok: false,
        error: "Worker failed",
        workerType,
        staleJobsRecovered,
        durationMs,
      },
      { status: 200 }
    );
  }
}
