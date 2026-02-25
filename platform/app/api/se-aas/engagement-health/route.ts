/**
 * SE-aaS Engagement Health — GET /api/se-aas/engagement-health
 *
 * Returns the three WOW artifacts for the SEaaSDeliveryPanel:
 *   1. health_scores   — Latest engagement health score per active engagement
 *   2. scope_alerts    — Unacknowledged scope creep alerts
 *   3. pod_matches     — Latest pod recommendation per engagement
 *   4. engineer_health — Summary of at-risk / overallocated engineers
 *
 * Powers both the Copilot panel and the client-facing portal.
 *
 * PATCH /api/se-aas/engagement-health — Acknowledge a scope creep alert
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateSeAaSRequest, createSeAaSResponse, createSeAaSError } from "@/lib/se-aas/middleware";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateSeAaSRequest(request);
    const url = new URL(request.url);
    const engagementId = url.searchParams.get("engagement_id");

    // ── 1. Engagement health scores ─────────────────────────────────────────
    const healthQuery = engagementId
      ? auth.supabase
          .from("engagement_health_scores")
          .select("*, engagements(client_name, engagement_name, pod_name, tech_stack, target_end_date, status)")
          .eq("organization_id", auth.organizationId)
          .eq("engagement_id", engagementId)
          .order("computed_at", { ascending: false })
          .limit(1)
      : auth.supabase
          .from("engagement_health_latest")
          .select("*")
          .eq("organization_id", auth.organizationId);

    const { data: healthScores, error: healthError } = await healthQuery;

    if (healthError) {
      logger.warn("[engagement-health] Health scores query error:", healthError);
    }

    // ── 2. Unacknowledged scope creep alerts ────────────────────────────────
    const { data: scopeAlerts } = await auth.supabase
      .from("scope_creep_alerts")
      .select("*, engagements(engagement_name, client_name)")
      .eq("organization_id", auth.organizationId)
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(20);

    // ── 3. Latest pod recommendations ───────────────────────────────────────
    const podQuery = engagementId
      ? auth.supabase
          .from("pod_match_history")
          .select("*")
          .eq("organization_id", auth.organizationId)
          .eq("engagement_id", engagementId)
          .order("created_at", { ascending: false })
          .limit(3)
      : auth.supabase
          .from("pod_match_history")
          .select("*, engagements(engagement_name, client_name)")
          .eq("organization_id", auth.organizationId)
          .order("created_at", { ascending: false })
          .limit(10);

    const { data: podMatches } = await podQuery;

    // ── 4. Engineer health summary ───────────────────────────────────────────
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay() + 1); // ISO Monday
    const weekStart = thisWeek.toISOString().split("T")[0];

    const { data: engineerSnapshots } = await auth.supabase
      .from("engineer_health_snapshots")
      .select("github_login, review_burden, velocity_index, flight_risk_score, overallocation_flag")
      .eq("organization_id", auth.organizationId)
      .eq("week_start", weekStart);

    const engineerHealthSummary = engineerSnapshots ? {
      total_engineers: engineerSnapshots.length,
      at_risk_count: engineerSnapshots.filter(e => (e.flight_risk_score ?? 0) > 50).length,
      overallocated_count: engineerSnapshots.filter(e => e.overallocation_flag).length,
      avg_review_burden: engineerSnapshots.length > 0
        ? Math.round(engineerSnapshots.reduce((a, e) => a + (e.review_burden ?? 0), 0) / engineerSnapshots.length)
        : 0,
      week_start: weekStart,
    } : null;

    return createSeAaSResponse(request, {
      health_scores:           healthScores ?? [],
      scope_alerts:            scopeAlerts ?? [],
      pod_matches:             podMatches ?? [],
      engineer_health_summary: engineerHealthSummary,
      generated_at:            new Date().toISOString(),
    });
  } catch (err: any) {
    return createSeAaSError(request, "Failed to fetch engagement health data");
  }
}

/**
 * PATCH /api/se-aas/engagement-health
 * Acknowledge a scope creep alert.
 * Body: { alert_id: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateSeAaSRequest(request);
    const body = await request.json();
    const alertId = body?.alert_id;

    if (!alertId || typeof alertId !== "string") {
      return NextResponse.json({ error: "alert_id is required" }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from("scope_creep_alerts")
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", alertId)
      .eq("organization_id", auth.organizationId);

    if (error) {
      return createSeAaSError(request, "Failed to acknowledge alert");
    }

    return createSeAaSResponse(request, { acknowledged: true, alert_id: alertId });
  } catch (err: any) {
    return createSeAaSError(request, "Failed to acknowledge alert");
  }
}
