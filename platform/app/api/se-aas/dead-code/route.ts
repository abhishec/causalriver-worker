/** SE-aaS Dead Code Detector — POST /api/se-aas/dead-code */

import { NextRequest } from "next/server";
import { authenticateSeAaSRequest, createSeAaSResponse, createSeAaSError, parseAndValidateBody } from "@/lib/se-aas/middleware";
import { executeDomain } from "@/lib/se-aas/domain-executor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSeAaSRequest(request);
    const bodyResult = await parseAndValidateBody(request);
    if ("error" in bodyResult) {
      return createSeAaSError(request, bodyResult.error, 400);
    }
    const payload = bodyResult.data as Record<string, unknown>;

    const { result, artifactId } = await executeDomain(auth.supabase, {
      domainType: "dead-code-detector",
      request: payload,
      organizationId: auth.organizationId,
      userId: auth.userId,
      anthropicApiKey: auth.anthropicApiKey,
    });

    return createSeAaSResponse(request, {
      success: true,
      domain: "dead-code-detector",
      result,
      artifactId,
    });
  } catch (err: any) {
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(request, err.message || "Internal server error", 500);
  }
}
