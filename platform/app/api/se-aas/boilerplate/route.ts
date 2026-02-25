/** SE-aaS Boilerplate & Scaffolding Generator — Async — POST /api/se-aas/boilerplate */
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

    if (!payload.name || !payload.type) {
      return createSeAaSError(request, "name and type are required", 400);
    }

    const jobId = await submitSeAaSJob(auth.supabase, {
      domainType: "boilerplate-scaffold",
      request: payload,
      organizationId: auth.organizationId,
      userId: auth.userId,
      anthropicApiKey: auth.anthropicApiKey,
    });

    return createSeAaSResponse(request, {
      success: true,
      domain: "boilerplate-scaffold",
      jobId,
      pollUrl: `/api/se-aas/jobs/${jobId}`,
      message: "Scaffolding job queued. Poll pollUrl for results.",
    });
  } catch (err: any) {
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(request, "Internal error", 500);
  }
}
