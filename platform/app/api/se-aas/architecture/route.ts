/** SE-aaS Architecture Extractor (P1-15) — Async execution — POST /api/se-aas/architecture */
import { NextRequest } from "next/server";
import {
  authenticateSeAaSRequest,
  createSeAaSResponse,
  createSeAaSError,
  parseAndValidateBody,
} from "@/lib/se-aas/middleware";
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

    // Validate required fields — at least one source of codebase information must be provided
    if (!payload.codebaseContext && !payload.repositoryUrl) {
      return createSeAaSError(request, "codebaseContext or repositoryUrl is required", 400);
    }

    const jobId = await submitSeAaSJob(auth.supabase, {
      domainType: "architecture-extractor",
      request: payload,
      organizationId: auth.organizationId,
      userId: auth.userId,
      anthropicApiKey: auth.anthropicApiKey,
    });

    const pollUrl = `/api/se-aas/jobs/${jobId}`;

    return createSeAaSResponse(request, {
      success: true,
      domain: "architecture-extractor",
      jobId,
      pollUrl,
      message: `Architecture extraction queued. Poll ${pollUrl} for results.`,
    });
  } catch (err: any) {
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(request, "Internal error", 500);
  }
}
