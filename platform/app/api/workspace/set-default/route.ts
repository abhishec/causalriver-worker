import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/set-default
 *
 * Sets the user's default workspace for a customer.
 * Body: { workspaceId: string }
 *
 * Updates customer_members.primary_org_id for the current user
 * in the customer that owns the given workspace.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const workspaceId = body.workspaceId;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // 1. Verify user is a member of this workspace
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // 2. Find the customer that owns this workspace
    const { data: workspace } = await supabase
      .from("organizations")
      .select("customer_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace?.customer_id) {
      return NextResponse.json(
        { error: "No customer association found" },
        { status: 400 }
      );
    }

    // 3. Update customer_members.primary_org_id
    // Wrapped in try/catch — customer_members table may not exist in all environments
    try {
      const { error: updateError } = await supabase
        .from("customer_members")
        .update({ primary_org_id: workspaceId })
        .eq("user_id", user.id)
        .eq("customer_id", workspace.customer_id);

      if (updateError) {
        // Log but don't crash — default workspace still works via cookie fallback
        logger.warn("[/api/workspace/set-default] customer_members update failed:", updateError.message);
      }
    } catch {
      logger.warn("[/api/workspace/set-default] customer_members not available — skipping persistent default");
    }

    return NextResponse.json({ success: true, defaultWorkspaceId: workspaceId });
  } catch (err) {
    logger.error("[/api/workspace/set-default] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
