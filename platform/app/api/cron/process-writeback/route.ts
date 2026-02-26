/**
 * GET /api/cron/process-writeback
 *
 * Drains the writeback_queue — executes pending write-back actions against
 * external connectors (Slack, Jira, GitHub) after domain execution completes.
 *
 * Security: Protected by Bearer CRON_SECRET header.
 *
 * Schedule (add to Amplify or external scheduler):
 *   Every 2 minutes: GET /api/cron/process-writeback
 *
 * Query parameters:
 *   ?limit=N  — max items to process per invocation (default 50, max 100)
 *   ?org=UUID — restrict to a single organization (optional, for debugging)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processWritebackQueue } from "@/lib/connectors/writeback-dispatcher";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2-minute Lambda limit

export async function GET(request: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Params ─────────────────────────────────────────────────────────────────
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(
    rawLimit ? parseInt(rawLimit, 10) : 50,
    100
  );
  const orgId = request.nextUrl.searchParams.get("org") ?? undefined;

  const startMs = Date.now();

  try {
    const service = await createServiceClient();
    const result = await processWritebackQueue(service, orgId, limit);

    const durationMs = Date.now() - startMs;

    logger.warn(
      `[cron/process-writeback] processed=${result.processed} ok=${result.succeeded} failed=${result.failed} took=${durationMs}ms`
    );

    return NextResponse.json({
      ok: true,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[cron/process-writeback] Error:", err);
    return NextResponse.json({ error: "Writeback worker failed" }, { status: 500 });
  }
}
