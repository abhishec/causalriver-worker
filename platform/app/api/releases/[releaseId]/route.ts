import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { ReleaseTracker } from "@nexus-ai/memory-stack";
import type { ReleaseConfig } from "@nexus-ai/memory-stack";

export const dynamic = "force-dynamic";

/**
 * GET /api/releases/[releaseId]?query=readiness|tickets|diff|velocity
 *
 * SE-aaS release query hub.  One endpoint, `query` param selects the operation.
 *
 * ?query=readiness   → getReleaseReadiness()   — 0-100 score + red/amber/green
 * ?query=tickets     → getTicketsForVersion()  — all Jira tickets for this release
 * ?query=diff        → getCommitsDiff()        — commits since base_version
 * ?query=velocity    → getTeamVelocityByDrop() — PR + ticket counts per drop
 *
 * Also requires releaseConfig to be passed as JSON body (POST) or stored in DB.
 * For the Dashboard we POST with the releaseConfig.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();
    const { releaseId } = await params;

    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? "readiness";

    const body = await request.json().catch(() => ({}));
    const { releaseConfig } = body as { releaseConfig: ReleaseConfig };

    if (!releaseConfig) {
      return NextResponse.json({ error: "releaseConfig is required in body" }, { status: 400 });
    }

    const config: ReleaseConfig = { ...releaseConfig, organizationId: workspaceId };
    const tracker = new ReleaseTracker(service, config);

    switch (query) {
      case "readiness": {
        const readiness = await tracker.getReleaseReadiness(releaseId);
        return NextResponse.json({ query: "readiness", data: readiness });
      }
      case "tickets": {
        const tickets = await tracker.getTicketsForVersion(releaseId);
        return NextResponse.json({ query: "tickets", data: tickets, count: tickets.length });
      }
      case "diff": {
        const diff = await tracker.getCommitsDiff(releaseId);
        return NextResponse.json({ query: "diff", data: diff, count: diff.length });
      }
      case "velocity": {
        const velocity = await tracker.getTeamVelocityByDrop();
        return NextResponse.json({ query: "velocity", data: velocity });
      }
      case "sync": {
        // Trigger a fresh sync for this release
        const syncResult = await tracker.syncAll(releaseId);
        return NextResponse.json({ query: "sync", data: syncResult });
      }
      default:
        return NextResponse.json({ error: `Unknown query: ${query}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
