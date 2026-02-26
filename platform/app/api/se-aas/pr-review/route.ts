/** SE-aaS PR Review Assistant — Async execution — POST /api/se-aas/pr-review */
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

    // Validate required fields
    if (!payload.diff && !payload.code) {
      return createSeAaSError(request, "diff or code is required", 400);
    }

    const { jobId } = await submitSeAaSJob(auth.supabase, {
      domainType: "pr-review",
      request: payload,
      organizationId: auth.organizationId,
      userId: auth.userId,
    });

    return createSeAaSResponse(request, {
      success: true,
      domain: "pr-review",
      jobId,
      pollUrl: `/api/se-aas/jobs/${jobId}`,
      message: "PR review job queued. Poll pollUrl for results.",
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
