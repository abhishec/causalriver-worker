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
import { processA2ATasks, processA2AAasTasks, processA2APmAasTasks } from "@/lib/a2a/task-processor";
import { processProcessEngineJobs } from "@/lib/process-engine/worker";
import { writeAllServiceHealth } from "@/lib/brain/service-health-writer";
import { evolveProcessTemplates } from "@/lib/brain/process-evolver";
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
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "5", 10), 20);

  const startMs = Date.now();
  let staleJobsRecovered = 0;

  try {
    const service = await createServiceClient();

    // ── Phase 1: Stale job recovery ──────────────────────────────
    // Recover jobs stuck in 'running' because Lambda killed them at 90s.
    // Any job with no heartbeat update for > 120s is moved to 'failed'.
    // This runs BEFORE processing new jobs so the worker slot count is
    // accurate when the per-org backpressure check runs.
    try {
      const { data: recovered, error: recoverError } = await service
        .rpc("recover_stale_jobs", { stale_threshold_seconds: 120 });

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
    } catch (recoverErr) {
      // Non-fatal: stale recovery failure must NOT prevent new jobs from running
      logger.error("[cron/process-jobs] recover_stale_jobs threw (non-fatal)", { error: (recoverErr as Error)?.message ?? String(recoverErr), route: "/api/cron/process-jobs" });
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

    // ── Phase 4: Process pending A2A tasks (SE-aaS delivery intelligence) ──
    // A2A tasks are created by POST /api/a2a/tasks from external agents.
    // Run up to 3 A2A tasks per cron tick (they execute domain logic, so
    // budget 3 on top of the SE-aaS and code-agent loads).
    const phaseElapsed2 = Date.now() - startMs;
    const remainingBudget2 = Math.max(0, LAMBDA_TIMEOUT_MS - phaseElapsed2);
    const a2aResult = await withTimeout(
      processA2ATasks(service, 3),
      remainingBudget2 > 2_000 ? remainingBudget2 : 2_000,
      "processA2ATasks"
    );

    // ── Phase 4b: Process pending AaaS A2A tasks ─────────────────
    // agent_type='aas' jobs submitted via POST /api/a2a/tasks with AaaS skills.
    // Routes to the AaaS domain executor (bookkeep, reconcile, statements, etc.).
    let a2aAasResult: { processed: number; succeeded: number; failed: number; jobIds: string[] } = { processed: 0, succeeded: 0, failed: 0, jobIds: [] };
    const phaseElapsedAas = Date.now() - startMs;
    const remainingForAas = Math.max(0, LAMBDA_TIMEOUT_MS - phaseElapsedAas);
    if (remainingForAas > 2_000) {
      try {
        a2aAasResult = await withTimeout(
          processA2AAasTasks(service, 3),
          remainingForAas,
          "processA2AAasTasks"
        );
      } catch (err) {
        logger.warn("[cron/process-jobs] Phase 4b AaaS A2A failed (non-fatal)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Phase 4c: Process pending PM-aaS A2A tasks ───────────────
    // agent_type='pm-aas' jobs submitted via POST /api/a2a/tasks with PM-aaS skills.
    // Routes to the PM-aaS domain executor (roadmap-planner, sprint-health, etc.).
    let a2aPmAasResult: { processed: number; succeeded: number; failed: number; jobIds: string[] } = { processed: 0, succeeded: 0, failed: 0, jobIds: [] };
    const phaseElapsedPm = Date.now() - startMs;
    const remainingForPm = Math.max(0, LAMBDA_TIMEOUT_MS - phaseElapsedPm);
    if (remainingForPm > 2_000) {
      try {
        a2aPmAasResult = await withTimeout(
          processA2APmAasTasks(service, 3),
          remainingForPm,
          "processA2APmAasTasks"
        );
      } catch (err) {
        logger.warn("[cron/process-jobs] Phase 4c PM-aaS A2A failed (non-fatal)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Phase 5: Process Engine Jobs ─────────────────────────────
    // Picks up agent_type='bpaas' jobs — process engine templates are
    // available to all AI Workers regardless of SE-aaS/AaaS activation.
    // Runs up to 5 BPaaS jobs per cron tick.
    let processEngineResult: { processed: number; succeeded: number; failed: number; jobIds: string[] } = { processed: 0, succeeded: 0, failed: 0, jobIds: [] };
    const phaseElapsed3 = Date.now() - startMs;
    const remainingForProcessEngine = Math.max(0, 28_000 - phaseElapsed3);
    if (remainingForProcessEngine > 2_000) {
      try {
        processEngineResult = await withTimeout(
          processProcessEngineJobs(service, 5),
          remainingForProcessEngine,
          "processProcessEngineJobs"
        );
      } catch (err) {
        logger.warn("[cron/process-jobs] Phase 5 Process Engine failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Phase 6: Service Health snapshot ─────────────────────────
    // Fire-and-forget health writes for active orgs. Non-blocking.
    // Provides service_health table data for brain-context.ts L26/L27/L28.
    void writeAllServiceHealth(service).catch((err: unknown) => {
      logger.warn("[cron/process-jobs] writeAllServiceHealth failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // ── Phase 7: Process Template Evolution (fire-and-forget per org) ──────────
    // Runs once per hour per org — evolveProcessTemplates() has its own rate-limit guard.
    // Derive active org IDs from recent BPaaS agent_queue activity (last 24h, max 5 orgs).
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: activeOrgRows } = await service
        .from("agent_queue")
        .select("organization_id")
        .eq("agent_type", "bpaas")
        .gte("created_at", oneDayAgo)
        .limit(20);

      if (activeOrgRows && activeOrgRows.length > 0) {
        const activeOrgsForEvolution = [
          ...new Set(
            (activeOrgRows as Array<{ organization_id: string }>).map(
              (r) => r.organization_id
            )
          ),
        ].slice(0, 5); // max 5 orgs per cron run

        for (const orgId of activeOrgsForEvolution) {
          void evolveProcessTemplates(service, orgId).catch((e) =>
            logger.warn("[cron/process-jobs] Phase 7 evolution failed", {
              orgId,
              error: String(e),
            })
          );
        }
      }
    } catch (evolveErr) {
      logger.warn("[cron/process-jobs] Phase 7 org query failed (non-fatal)", {
        error: evolveErr instanceof Error ? evolveErr.message : String(evolveErr),
      });
    }

    const durationMs = Date.now() - startMs;
    logger.warn(
      `[cron/process-jobs] type=${workerType} staleRecovered=${staleJobsRecovered} ` +
      `processed=${result.processed} ok=${result.succeeded} failed=${result.failed} ` +
      `codeAgents=${codeAgentResult.processed}(ok=${codeAgentResult.succeeded}) ` +
      `a2a=${a2aResult.processed}(ok=${a2aResult.succeeded}) ` +
      `a2aAas=${a2aAasResult.processed}(ok=${a2aAasResult.succeeded}) ` +
      `a2aPmAas=${a2aPmAasResult.processed}(ok=${a2aPmAasResult.succeeded}) ` +
      `processEngine=${processEngineResult.processed}(ok=${processEngineResult.succeeded}) took=${durationMs}ms`
    );

    return NextResponse.json({
      ok: true,
      workerType,
      staleJobsRecovered,
      ...result,
      codeAgent: codeAgentResult,
      a2a: a2aResult,
      a2aAas: a2aAasResult,
      a2aPmAas: a2aPmAasResult,
      processEngine: processEngineResult,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const errorMessage = (err as Error)?.message ?? String(err);
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
