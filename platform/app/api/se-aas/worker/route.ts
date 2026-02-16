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
    // Verify worker auth: service-role key or worker secret
    const authHeader = request.headers.get("authorization");
    const workerSecret = process.env.SE_AAS_WORKER_SECRET;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const isAuthorized =
      (workerSecret && authHeader === `Bearer ${workerSecret}`) ||
      (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`);

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "5", 10);

    const supabase = await createServiceClient();
    const result = await processSeAaSJobs(supabase, Math.min(limit, 20));

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Worker failed" },
      { status: 500 }
    );
  }
}
