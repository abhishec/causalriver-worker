/** SE-aaS Early Warning System — GET /api/se-aas/early-warning */

import { NextRequest } from "next/server";
import { authenticateSeAaSRequest, createSeAaSResponse, createSeAaSError } from "@/lib/se-aas/middleware";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateSeAaSRequest(request);

    const { runEarlyWarningSystem, getEarlyWarningSummary } = await import("@nexus-ai/memory-stack");

    const url = new URL(request.url);
    const domainsParam = url.searchParams.get("domains");
    const lookbackDays = parseInt(url.searchParams.get("lookbackDays") || "90", 10);

    const domains = domainsParam
      ? domainsParam.split(",").map(d => d.trim())
      : ["backend", "frontend", "infrastructure"];

    const report = await runEarlyWarningSystem({
      supabase: auth.supabase,
      organizationId: auth.organizationId,
      domains,
      lookbackDays,
    });

    const summary = getEarlyWarningSummary(report);

    return createSeAaSResponse(request, {
      success: true,
      report,
      summary,
    });
  } catch (err: any) {
    if (err.status) {
      return createSeAaSError(request, err.error, err.status);
    }
    return createSeAaSError(request, err.message || "Internal server error", 500);
  }
}
