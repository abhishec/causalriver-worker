/** SE-aaS Performance Profiler — POST /api/se-aas/performance-profile */

import { NextRequest } from "next/server";
import { authenticateSeAaSRequest, createSeAaSResponse, createSeAaSError, parseAndValidateBody } from "@/lib/se-aas/middleware";
import { submitSeAaSJob } from "@/lib/se-aas/job-queue";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSeAaSRequest(request);
    const bodyResult = await parseAndValidateBody(request);
    if ("error" in bodyResult) {
      return createSeAaSError(request, bodyResult.error, 400);
    }
    const payload = bodyResult.data as Record<string, unknown>;

    const { jobId } = await submitSeAaSJob(auth.supabase, {
      organizationId: auth.organizationId,
      domainType: "performance-profiler",
      payload,
      userId: auth.userId,
    });

    return createSeAaSResponse(request, {
      success: true,
      domain: "performance-profiler",
      jobId,
      status: "pending",
      pollUrl: `/api/se-aas/jobs/${jobId}`,
    });
  } catch (err: any) {
    // authenticateSeAaSRequest throws NextResponse for auth errors — return directly
    if (err instanceof Response) return err as Response;
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(request, "Internal error", 500);
  }
}
