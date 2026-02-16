/** SE-aaS Design Document Generator — POST /api/se-aas/design-doc */

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
      domainType: "design-doc-generator",
      payload,
      userId: auth.userId,
    });

    return createSeAaSResponse(request, {
      success: true,
      domain: "design-doc-generator",
      jobId,
      status: "pending",
      pollUrl: `/api/se-aas/jobs/${jobId}`,
    });
  } catch (err: any) {
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(request, err.message || "Internal server error", 500);
  }
}
