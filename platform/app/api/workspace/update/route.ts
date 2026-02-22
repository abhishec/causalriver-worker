import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/workspace/update
 *
 * Updates workspace name and/or budget settings.
 * Body: { workspaceId, name?, daily_llm_budget?, monthly_llm_budget?, monthly_aws_budget?, alert_threshold_pct? }
 *
 * Auth: user must be owner/admin of the workspace (or platform admin).
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

    const body = await request.json();
    const { workspaceId, name, daily_llm_budget, monthly_llm_budget, monthly_aws_budget, alert_threshold_pct } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Check user is owner/admin of this workspace
    const { data: membership } = await supabase
      .from("org_members")
      .select("role, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    const isAuthorized =
      membership?.is_platform_admin ||
      membership?.role === "owner" ||
      membership?.role === "admin";

    if (!isAuthorized) {
      // Check if platform admin via any membership
      const { data: adminCheck } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .single();

      if (!adminCheck) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }
    }

    const admin = getAdminClient();

    // Update workspace name if provided
    if (name && typeof name === "string" && name.trim()) {
      const { error: nameError } = await admin
        .from("organizations")
        .update({ name: name.trim() })
        .eq("id", workspaceId);

      if (nameError) {
        logger.error("[workspace/update] Failed to update name:", nameError);
        return NextResponse.json({ error: "Failed to update workspace name" }, { status: 500 });
      }
    }

    // Update budget if any budget fields provided
    const hasBudgetUpdate =
      daily_llm_budget !== undefined ||
      monthly_llm_budget !== undefined ||
      monthly_aws_budget !== undefined ||
      alert_threshold_pct !== undefined;

    if (hasBudgetUpdate) {
      const budgetUpdate: Record<string, number> = {};
      if (daily_llm_budget !== undefined) budgetUpdate.daily_llm_budget = Number(daily_llm_budget);
      if (monthly_llm_budget !== undefined) budgetUpdate.monthly_llm_budget = Number(monthly_llm_budget);
      if (monthly_aws_budget !== undefined) budgetUpdate.monthly_aws_budget = Number(monthly_aws_budget);
      if (alert_threshold_pct !== undefined) budgetUpdate.alert_threshold_pct = Number(alert_threshold_pct);

      const { error: budgetError } = await admin
        .from("cost_budget_config")
        .upsert(
          { organization_id: workspaceId, ...budgetUpdate },
          { onConflict: "organization_id" }
        );

      if (budgetError) {
        logger.error("[workspace/update] Failed to update budget:", budgetError);
        return NextResponse.json({ error: "Failed to update budget settings" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[workspace/update] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
