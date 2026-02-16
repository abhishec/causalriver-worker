/** SE-aaS Job Status — GET /api/se-aas/jobs/[jobId] */

import { NextRequest } from "next/server";
import { authenticateSeAaSRequest, createSeAaSResponse, createSeAaSError } from "@/lib/se-aas/middleware";
import { getJobStatus } from "@/lib/se-aas/job-queue";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const auth = await authenticateSeAaSRequest(request);
    const { jobId } = await params;

    const status = await getJobStatus(auth.supabase, jobId, auth.organizationId);

    if (!status) {
      return createSeAaSError(request, "Job not found", 404);
    }

    return createSeAaSResponse(request, status as unknown as Record<string, unknown>);
  } catch (err: any) {
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(request, err.message || "Internal server error", 500);
  }
}
