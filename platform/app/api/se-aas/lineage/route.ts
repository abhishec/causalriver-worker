/** SE-aaS Data Lineage Mapper API — Sync execution — POST /api/se-aas/lineage */
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
      domainType: "data-lineage",
      request: payload,
      organizationId: auth.organizationId,
      userId: auth.userId,
      anthropicApiKey: auth.anthropicApiKey,
    });

    return createSeAaSResponse(request, {
      success: true,
      domain: "data-lineage",
      result,
      artifactId,
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
