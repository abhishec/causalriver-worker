import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { ReleaseTracker, listActiveReleases } from "@nexus-ai/memory-stack";
import type { ReleaseConfig } from "@nexus-ai/memory-stack";

export const dynamic = "force-dynamic";

/**
 * GET /api/releases
 * List all active releases for the org.
 * Used by the Release Dashboard to show Team A (6.3.4) + Team B (5.11.5-enterprise).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    const releases = await listActiveReleases(service, workspaceId);
    return NextResponse.json({ releases });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/releases
 * Register a new release (or update existing) and optionally run syncAll.
 *
 * Body: {
 *   releaseConfig: ReleaseConfig,
 *   syncNow?: boolean   -- if true, immediately runs syncCommits + syncJiraTickets + syncPRs
 * }
 *
 * For Tookitaki Team A (6.3.4):
 * {
 *   releaseConfig: {
 *     organizationId: "<orgId>",
 *     releaseName: "6.3.4",
 *     releaseType: "patch",
 *     branchName: "release/6.3.4",
 *     baseVersion: "6.3.3",
 *     targetDate: "2026-04-07",
 *     teamLabel: "team-634",
 *     teamMembers: ["Bao","Ravi","Mayank","Nitish","Ganesh"],
 *     githubRepo: "tookitaki/aml-engine",
 *     jiraProjectKey: "TM",
 *     jiraFixVersion: "6.3.4",
 *     githubToken: "ghp_...",
 *     jiraCredentials: { baseUrl: "...", email: "...", apiToken: "..." }
 *   },
 *   syncNow: true
 * }
 *
 * For Tookitaki Team B (5.11.5-enterprise, 2 drops):
 * {
 *   releaseConfig: {
 *     ...
 *     releaseName: "5.11.5-enterprise",
 *     releaseType: "enterprise",
 *     branchName: "release/5.11.5-enterprise",
 *     baseVersion: "5.11.4.3",
 *     drops: [
 *       { dropNumber: 1, dropDate: "2026-02-26" },
 *       { dropNumber: 2, dropDate: "2026-03-15" }
 *     ],
 *     teamLabel: "team-5115",
 *     teamMembers: ["Sandeep","Doan","Siva","Anish","Nagaru"],
 *     jiraFixVersion: "5.11.5-enterprise"
 *   },
 *   syncNow: true
 * }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    const body = await request.json();
    const { releaseConfig, syncNow = false } = body as {
      releaseConfig: ReleaseConfig;
      syncNow?: boolean;
    };

    if (!releaseConfig?.releaseName || !releaseConfig?.branchName) {
      return NextResponse.json(
        { error: "releaseConfig.releaseName and branchName are required" },
        { status: 400 }
      );
    }

    // Always use the authenticated org's ID (never trust client-supplied orgId)
    const config: ReleaseConfig = { ...releaseConfig, organizationId: workspaceId };

    const tracker = new ReleaseTracker(service, config);

    // Register all drops (or single release for non-enterprise)
    const releaseIds = await tracker.registerAllDrops();

    let syncResult: { commits: number; jiraTickets: number; prs: number } | null = null;

    if (syncNow && releaseIds.length > 0) {
      // For multi-drop: sync against the first drop's release ID (commits/tickets span all drops)
      syncResult = await tracker.syncAll(releaseIds[0]);
    }

    return NextResponse.json({
      success: true,
      releaseIds,
      releaseName: config.releaseName,
      branchName: config.branchName,
      drops: releaseIds.length,
      syncResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
