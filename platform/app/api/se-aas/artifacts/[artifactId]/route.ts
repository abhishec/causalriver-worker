/** SE-aaS Artifact Detail — GET /api/se-aas/artifacts/[artifactId] */

import { NextRequest } from "next/server";
import { authenticateSeAaSRequest, createSeAaSResponse, createSeAaSError } from "@/lib/se-aas/middleware";
import { getArtifact } from "@/lib/se-aas/job-queue";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  try {
    const auth = await authenticateSeAaSRequest(request);
    const { artifactId } = await params;

    const artifact = await getArtifact(auth.supabase, artifactId, auth.organizationId);

    if (!artifact) {
      return createSeAaSError(request, "Artifact not found", 404);
    }

    return createSeAaSResponse(request, {
      success: true,
      artifact,
    });
  } catch (err: any) {
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(request, "Internal error", 500);
  }
}
