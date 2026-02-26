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
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processSeAaSJobs, type WorkerType } from "@/lib/se-aas/job-worker";
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

  try {
    const service = await createServiceClient();
    const result = await processSeAaSJobs(service, limit, workerType);

    const durationMs = Date.now() - startMs;
    logger.info(
      `[cron/process-jobs] type=${workerType} processed=${result.processed} ok=${result.succeeded} failed=${result.failed} took=${durationMs}ms`
    );

    return NextResponse.json({
      ok: true,
      workerType,
      ...result,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - startMs;
    logger.error("[cron/process-jobs] Error:", err);
    // Return 200 even on unexpected failure — cron schedulers that see 5xx may
    // retry immediately or back off exponentially, causing thundering herd.
    // The error is captured in logs; retrying a broken job every 2 min is safer.
    return NextResponse.json(
      { ok: false, error: "Worker failed", workerType, durationMs },
      { status: 200 }
    );
  }
}
