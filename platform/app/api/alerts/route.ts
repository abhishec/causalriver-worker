export const dynamic = "force-dynamic";
/**
 * Alert List API
 *
 * GET /api/alerts — List health alerts for the user's org
 *
 * Query params:
 *   ?status=open|resolved  — Filter by status (open = unread, resolved = read)
 *   ?severity=critical|high|medium|low
 *   ?limit=20&offset=0     — Pagination
 *
 * Auth: Org member
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    // Verify org membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // open | resolved
    const severity = searchParams.get("severity");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query for health alerts from cascade_alerts
    let query = supabase
      .from("cascade_alerts")
      .select("id, alert_id, severity, trigger_domain, trigger_signal_type, message, is_read, created_at, updated_at, anomaly_score, recommended_interventions", { count: "exact" })
      .eq("organization_id", workspaceId)
      .eq("alert_type", "health_monitor")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status === "open") {
      query = query.eq("is_read", false);
    } else if (status === "resolved") {
      query = query.eq("is_read", true);
    }

    if (severity) {
      query = query.eq("severity", severity);
    }

    const { data: alerts, count, error } = await query;

    if (error) {
      logger.error("[alerts] Query error:", error);
      return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
    }

    // Get summary counts
    const [openResult, criticalResult] = await Promise.all([
      supabase
        .from("cascade_alerts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .eq("alert_type", "health_monitor")
        .eq("is_read", false),
      supabase
        .from("cascade_alerts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .eq("alert_type", "health_monitor")
        .eq("is_read", false)
        .eq("severity", "critical"),
    ]);

    return NextResponse.json({
      alerts: alerts || [],
      total: count || 0,
      open_count: openResult.count || 0,
      critical_count: criticalResult.count || 0,
      limit,
      offset,
    });
  } catch (err) {
    logger.error("[alerts] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch alerts" },
      { status: 500 },
    );
  }
}
