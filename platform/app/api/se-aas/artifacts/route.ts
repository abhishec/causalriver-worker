/** SE-aaS Artifacts List — GET /api/se-aas/artifacts */

import { NextRequest } from "next/server";
import { authenticateSeAaSRequest, createSeAaSResponse, createSeAaSError } from "@/lib/se-aas/middleware";
import { listArtifacts } from "@/lib/se-aas/job-queue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateSeAaSRequest(request);

    const url = new URL(request.url);
    const domainType = url.searchParams.get("domainType") || undefined;
    const conversationId = url.searchParams.get("conversationId") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const { artifacts, total } = await listArtifacts(
      auth.supabase,
      auth.organizationId,
      { domainType, conversationId, limit, offset }
    );

    return createSeAaSResponse(request, {
      success: true,
      artifacts,
      total,
      limit,
      offset,
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
