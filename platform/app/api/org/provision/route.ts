import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { provisionWorkspace } from "@/lib/workspace-provisioning";
import { logger } from "@/lib/logger";

/**
 * POST /api/org/provision
 *
 * Provisions a new organization's infrastructure:
 *   - S3 prefix folder + .org-manifest.json
 *   - s3-storage connector in org_connectors
 *   - Selected connectors (pending status, need OAuth later)
 *   - Verifies DB trigger provisions (brain_cortex_state, org_settings, etc.)
 *
 * Called during onboarding Step 3 to replace the fake "brain waking" animation.
 *
 * Body: { orgId: string, selectedConnectors?: string[], isDesignPartner?: boolean }
 */
export async function POST(request: Request) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body
    const body = await request.json();
    const { orgId, workspaceId: bodyWorkspaceId, selectedConnectors, isDesignPartner, selectedRepos } = body;
    // Accept both workspaceId (new) and orgId (legacy)
    const workspaceId = bodyWorkspaceId || orgId;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // 3. Verify user is owner/admin of this org
    const service = await createServiceClient();
    const { data: membership } = await service
      .from("org_members")
      .select("id, role, is_platform_admin")
      .eq("organization_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this workspace" },
        { status: 403 }
      );
    }

    // Allow owner, admin, or platform admin
    const canProvision =
      membership.role === "owner" ||
      membership.role === "admin" ||
      membership.is_platform_admin;

    if (!canProvision) {
      return NextResponse.json(
        { error: "Only owners and admins can provision a workspace" },
        { status: 403 }
      );
    }

    // 4. Set design partner flag if requested (on both organizations and parent customer)
    if (isDesignPartner) {
      await service
        .from("organizations")
        .update({ is_design_partner: true })
        .eq("id", workspaceId);

      // Also sync to parent customer if one exists
      const { data: org } = await service
        .from("organizations")
        .select("customer_id")
        .eq("id", workspaceId)
        .maybeSingle();

      if (org?.customer_id) {
        await service
          .from("customers")
          .update({ is_design_partner: true })
          .eq("id", org.customer_id);
      }
    }

    // 5. Save selected repos to GitHub connector config if any
    if (Array.isArray(selectedRepos) && selectedRepos.length > 0) {
      await service
        .from("org_connectors")
        .update({
          config: {
            tracked_repos: selectedRepos,
          },
        })
        .eq("organization_id", workspaceId)
        .eq("connector_type", "github");
    }

    // 6. Run provisioning
    const result = await provisionWorkspace(workspaceId, {
      selectedConnectors: Array.isArray(selectedConnectors)
        ? selectedConnectors
        : undefined,
    });

    // 7. Return result
    return NextResponse.json(result);
  } catch (err: unknown) {
    logger.error("[/api/org/provision] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
