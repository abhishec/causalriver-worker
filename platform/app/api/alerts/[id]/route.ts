export const dynamic = "force-dynamic";
/**
 * Alert Management API
 *
 * PATCH /api/alerts/:id — Acknowledge or resolve an alert
 *
 * Body:
 *   { "action": "acknowledge" } — Mark alert as read
 *   { "action": "resolve", "note": "Fixed by..." } — Manually resolve
 *
 * Auth: Org admin (owner/admin role)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No AI Worker selected" }, { status: 400 });
    }

    // Verify org admin
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const action = body.action;

    if (!action || !["acknowledge", "resolve"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Use 'acknowledge' or 'resolve'" },
        { status: 400 },
      );
    }

    // Verify the alert belongs to this org
    const { data: alert } = await supabase
      .from("cascade_alerts")
      .select("id, organization_id, trigger_domain, is_read")
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .single();

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    // Update the alert
    const { error: updateError } = await supabase
      .from("cascade_alerts")
      .update({
        is_read: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      logger.error("[alerts/:id] Update error:", updateError);
      return NextResponse.json({ error: "Failed to update alert" }, { status: 500 });
    }

    // Log the action
    await supabase.from("health_alert_log").insert({
      organization_id: workspaceId,
      dimension: (alert as { trigger_domain: string }).trigger_domain,
      score: 0,
      threshold: 0,
      severity: "info",
      message: `Alert ${action}d by ${user.email}${body.note ? `: ${body.note}` : ""}`,
      delivered_in_app: true,
    });

    return NextResponse.json({
      success: true,
      action,
      alert_id: id,
    });
  } catch (err) {
    logger.error("[alerts/:id] PATCH error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update alert" },
      { status: 500 },
    );
  }
}
