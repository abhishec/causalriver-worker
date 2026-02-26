import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { getOrCreateAIWorkspace, updateWorkspaceConfig } from "@/lib/brain/ai-workspace";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/workspace/ai-worker-config
 *
 * Returns the current orchestratorConfig for the authenticated workspace.
 * Also returns brainSignalCount from brain_evolution_snapshots.
 *
 * Response:
 *   {
 *     brainReadinessMinIq: number;
 *     brainSignalCount: number;
 *   }
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Fetch workspace config and signal count in parallel
    const [workspace, snapshotsRes] = await Promise.all([
      getOrCreateAIWorkspace(workspaceId),
      admin
        .from("brain_evolution_snapshots")
        .select("total_predictions")
        .eq("organization_id", workspaceId)
        .order("snapshot_date", { ascending: false })
        .limit(30),
    ]);

    const brainSignalCount = (snapshotsRes.data ?? []).reduce(
      (sum: number, s: { total_predictions: number | null }) => sum + (s.total_predictions ?? 0),
      0
    );

    return NextResponse.json({
      brainReadinessMinIq: workspace.orchestratorConfig.brainReadinessMinIq,
      brainSignalCount,
    });
  } catch (err) {
    logger.error("[ai-worker-config/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/workspace/ai-worker-config
 *
 * Updates orchestratorConfig fields for the authenticated workspace.
 * Body: { brainReadinessMinIq: number }
 *
 * Auth: user must be owner/admin of the workspace.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Check user is owner/admin of this workspace
    const { data: membership } = await supabase
      .from("org_members")
      .select("role, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    const isAuthorized =
      membership?.is_platform_admin ||
      membership?.role === "owner" ||
      membership?.role === "admin";

    if (!isAuthorized) {
      // Check platform admin via any membership
      const { data: adminCheck } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .maybeSingle();

      if (!adminCheck) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }
    }

    const body = await request.json();
    const { brainReadinessMinIq } = body;

    if (brainReadinessMinIq === undefined || typeof brainReadinessMinIq !== "number") {
      return NextResponse.json({ error: "brainReadinessMinIq must be a number" }, { status: 400 });
    }

    const clamped = Math.min(50, Math.max(5, Math.round(brainReadinessMinIq)));

    // Read current workspace config so we only patch the one field
    const current = await getOrCreateAIWorkspace(workspaceId);

    await updateWorkspaceConfig(workspaceId, {
      orchestratorConfig: {
        ...current.orchestratorConfig,
        brainReadinessMinIq: clamped,
      },
    });

    return NextResponse.json({ success: true, brainReadinessMinIq: clamped });
  } catch (err) {
    logger.error("[ai-worker-config/PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
