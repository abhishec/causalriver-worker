export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

/**
 * GET /api/partner/activation
 *
 * Computes the design partner activation checklist state.
 * Queries multiple tables to determine which items are complete.
 */
export async function GET() {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    // Run all checks in parallel
    const [
      githubResult,
      artifactsResult,
      velocityResult,
      membersResult,
      invitationsResult,
      settingsResult,
    ] = await Promise.all([
      // GitHub connector status
      service
        .from("org_connectors")
        .select("status, config")
        .eq("organization_id", workspaceId)
        .eq("connector_type", "github")
        .maybeSingle(),

      // SE-aaS artifacts (for PR review + general artifact count)
      service
        .from("se_aas_artifacts")
        .select("domain_type")
        .eq("organization_id", workspaceId)
        .limit(50),

      // Velocity snapshots (for early warning check)
      service
        .from("velocity_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId),

      // Org members count
      service
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId),

      // Org invitations count
      service
        .from("org_invitations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId),

      // Org settings (for notification config + dismissed state)
      service
        .from("org_settings")
        .select("partner_activation, config")
        .eq("organization_id", workspaceId)
        .maybeSingle(),
    ]);

    // Compute each checklist item
    const github = githubResult.data;
    const githubConfig = (github?.config as Record<string, any>) || {};
    const artifacts = artifactsResult.data || [];
    const artifactDomains = new Set(artifacts.map((a: any) => a.domain_type));

    const completedItems: string[] = [];

    // 1. Create organization (always complete)
    completedItems.push("create_org");

    // 2. Connect GitHub
    if (github?.status === "active") {
      completedItems.push("connect_github");
    }

    // 3. Select repositories
    const trackedBranches = githubConfig?.trackedBranches || githubConfig?.tracked_branches || [];
    const repoFullName = githubConfig?.repoFullName || githubConfig?.repo_full_name;
    if (trackedBranches.length > 0 || repoFullName) {
      completedItems.push("select_repos");
    }

    // 4. Run first PR Review
    if (artifactDomains.has("pr-review")) {
      completedItems.push("run_pr_review");
    }

    // 5. Run first Early Warning
    if ((velocityResult.count ?? 0) > 0) {
      completedItems.push("run_early_warning");
    }

    // 6. Invite a teammate
    if ((membersResult.count ?? 0) > 1 || (invitationsResult.count ?? 0) > 0) {
      completedItems.push("invite_teammate");
    }

    // 7. Ask the Copilot (any artifact = copilot was used)
    if (artifacts.length > 0) {
      completedItems.push("ask_copilot");
    }

    // 8. Generate artifact (needs a domain-specific artifact, not just a chat)
    if (artifactDomains.size > 0) {
      completedItems.push("generate_artifact");
    }

    // 9. Configure digest notifications
    const config = (settingsResult.data?.config as Record<string, any>) || {};
    const hasDigest =
      config?.digest_slack_channel ||
      config?.digest_email_recipients ||
      config?.email_digest === true;
    if (hasDigest) {
      completedItems.push("configure_digest");
    }

    // Check dismissed state
    const partnerActivation = (settingsResult.data?.partner_activation as Record<string, any>) || {};
    const dismissed = partnerActivation?.checklist_dismissed === true;

    return NextResponse.json({
      items: completedItems,
      completedCount: completedItems.length,
      totalItems: 9,
      dismissed,
    });
  } catch (err) {
    logger.error("[Partner/activation] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/partner/activation
 *
 * Updates activation state (e.g., dismiss checklist).
 */
export async function POST(request: Request) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();
    const body = await request.json();

    if (body.action === "dismiss") {
      // Get current org_settings
      const { data: current } = await service
        .from("org_settings")
        .select("partner_activation")
        .eq("organization_id", workspaceId)
        .maybeSingle();

      const existing = (current?.partner_activation as Record<string, any>) || {};

      await service
        .from("org_settings")
        .upsert({
          organization_id: workspaceId,
          partner_activation: {
            ...existing,
            checklist_dismissed: true,
            dismissed_at: new Date().toISOString(),
            dismissed_by: user.id,
          },
        }, { onConflict: "organization_id" });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    logger.error("[Partner/activation] POST Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
