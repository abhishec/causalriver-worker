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
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minute Lambda limit

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
      logger.error("[cron/process-jobs] recover_stale_jobs threw (non-fatal)", { recoverErr });
    }

    // ── Phase 2: Process pending SE-aaS jobs ─────────────────────
    const result = await processSeAaSJobs(service, limit, workerType);

    // ── Phase 3: Process pending code-agent (overnight) jobs ─────
    // Run up to 3 code-agent child jobs per cron tick.
    // These are separate from SE-aaS jobs — they create GitHub PRs.
    const codeAgentResult = await processCodeAgentJobs(service, 3);

    const durationMs = Date.now() - startMs;
    logger.warn(
      `[cron/process-jobs] type=${workerType} staleRecovered=${staleJobsRecovered} ` +
      `processed=${result.processed} ok=${result.succeeded} failed=${result.failed} ` +
      `codeAgents=${codeAgentResult.processed}(ok=${codeAgentResult.succeeded}) took=${durationMs}ms`
    );

    return NextResponse.json({
      ok: true,
      workerType,
      staleJobsRecovered,
      ...result,
      codeAgent: codeAgentResult,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - startMs;
    logger.error("[cron/process-jobs] Error:", err);
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
