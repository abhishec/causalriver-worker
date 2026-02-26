/** SE-aaS Codebase Q&A — Async — POST /api/se-aas/codebase-qa */
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

    if (!payload.question) {
      return createSeAaSError(request, "question is required", 400);
    }

    const { jobId } = await submitSeAaSJob(auth.supabase, {
      domainType: "codebase-qa",
      request: payload,
      organizationId: auth.organizationId,
      userId: auth.userId,
    });

    return createSeAaSResponse(request, {
      success: true,
      domain: "codebase-qa",
      jobId,
      pollUrl: `/api/se-aas/jobs/${jobId}`,
      message: "Codebase Q&A job queued. Poll pollUrl for results.",
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
