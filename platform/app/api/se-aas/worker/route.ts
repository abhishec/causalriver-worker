/** SE-aaS Job Worker — POST /api/se-aas/worker */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processSeAaSJobs } from "@/lib/se-aas/job-worker";

export const dynamic = "force-dynamic";

/**
 * POST /api/se-aas/worker
 *
 * Processes pending SE-aaS jobs. Protected by service-role auth
 * or a shared worker secret. Can be called by:
 * - Supabase Edge Function on cron
 * - Async API endpoints (fire-and-forget after job submission)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify worker auth: worker secret or cron secret only (never expose service_role key in headers)
    const authHeader = request.headers.get("authorization");
    const workerSecret = process.env.SE_AAS_WORKER_SECRET;
    const cronSecret = process.env.CRON_SECRET;

    const isAuthorized =
      (workerSecret && authHeader === `Bearer ${workerSecret}`) ||
      (cronSecret && authHeader === `Bearer ${cronSecret}`);

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "5", 10) || 5;

    const supabase = await createServiceClient();
    const result = await processSeAaSJobs(supabase, Math.min(limit, 20));

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
