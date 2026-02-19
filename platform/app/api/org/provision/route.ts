import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { provisionOrg } from "@/lib/org-provisioning";

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
    const { orgId, selectedConnectors, isDesignPartner } = body;

    if (!orgId) {
      return NextResponse.json(
        { error: "orgId is required" },
        { status: 400 }
      );
    }

    // 3. Verify user is owner/admin of this org
    const service = await createServiceClient();
    const { data: membership } = await service
      .from("org_members")
      .select("id, role, is_platform_admin")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this organization" },
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
        { error: "Only owners and admins can provision an organization" },
        { status: 403 }
      );
    }

    // 4. Set design partner flag if requested
    if (isDesignPartner) {
      await service
        .from("organizations")
        .update({ is_design_partner: true })
        .eq("id", orgId);
    }

    // 5. Run provisioning
    const result = await provisionOrg(orgId, {
      selectedConnectors: Array.isArray(selectedConnectors)
        ? selectedConnectors
        : undefined,
    });

    // 6. Return result
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("[/api/org/provision] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
