/**
 * GET /api/export/engagements
 *
 * Enterprise data export — returns org's engagement data as JSON.
 * Auth-gated and scoped to the caller's organization_id.
 *
 * Includes:
 *   - engagements (with latest health score)
 *   - scope creep alerts
 *   - pod match history
 *   - engineer health snapshots
 *
 * Query params:
 *   - format=json (default) | csv — response format
 *   - orgId=xxx — optional override (platform admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { logAuditEvent, AuditAction } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "json";

    // Resolve workspace — allow platform admin override via orgId param
    let orgId = await getCurrentWorkspaceId();

    const requestedOrgId = url.searchParams.get("orgId");
    if (requestedOrgId && requestedOrgId !== orgId) {
      // Only platform admins can export another org's data
      const { data: memberRow } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .maybeSingle();

      if (!memberRow?.is_platform_admin) {
        return NextResponse.json({ error: "Forbidden — platform admin required to export another org" }, { status: 403 });
      }
      orgId = requestedOrgId;
    }

    if (!orgId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 403 });
    }

    // ── Fetch all data in parallel ───────────────────────────────────────────
    const [engagementsResult, healthResult, scopeResult, podResult, engineerResult] = await Promise.all([
      supabase
        .from("engagements")
        .select("id, client_name, engagement_name, pod_name, tech_stack, status, target_end_date, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("engagement_health_latest")
        .select("engagement_id, health_score, computed_at")
        .eq("organization_id", orgId),
      supabase
        .from("scope_creep_alerts")
        .select("id, engagement_id, alert_type, severity, description, acknowledged, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("pod_match_history")
        .select("id, engagement_id, recommended_pod_name, confidence, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("engineer_health_snapshots")
        .select("id, github_login, velocity_index, review_burden, flight_risk_score, overallocation_flag, snapshot_date")
        .eq("organization_id", orgId)
        .order("snapshot_date", { ascending: false })
        .limit(500),
    ]);

    // Build health score lookup
    const healthByEngagement = new Map<string, number>();
    for (const h of healthResult.data ?? []) {
      healthByEngagement.set(h.engagement_id, h.health_score);
    }

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      organizationId: orgId,
      engagements: (engagementsResult.data ?? []).map((e) => ({
        ...e,
        latestHealthScore: healthByEngagement.get(e.id) ?? null,
      })),
      scopeCreepAlerts: scopeResult.data ?? [],
      podMatchHistory: podResult.data ?? [],
      engineerHealthSnapshots: engineerResult.data ?? [],
      stats: {
        totalEngagements: (engagementsResult.data ?? []).length,
        activeEngagements: (engagementsResult.data ?? []).filter((e) => e.status === "active").length,
        openScopeAlerts: (scopeResult.data ?? []).filter((a) => !a.acknowledged).length,
        totalEngineerSnapshots: (engineerResult.data ?? []).length,
      },
    };

    // Audit log — data export is a compliance-critical event (fire-and-forget)
    void logAuditEvent({
      organizationId: orgId,
      userId: user.id,
      action: AuditAction.DATA_EXPORT,
      resourceType: "engagements",
      metadata: {
        format,
        exportedEngagements: exportPayload.stats.totalEngagements,
        exportedScopeAlerts: (scopeResult.data ?? []).length,
        exportedEngineerSnapshots: (engineerResult.data ?? []).length,
      },
    });

    if (format === "csv") {
      // Simple CSV for engagements table
      const headers = ["id", "client_name", "engagement_name", "pod_name", "status", "health_score", "target_end_date", "created_at"];
      const rows = exportPayload.engagements.map((e) =>
        [
          e.id,
          e.client_name ?? "",
          e.engagement_name ?? "",
          e.pod_name ?? "",
          e.status ?? "",
          e.latestHealthScore ?? "",
          e.target_end_date ?? "",
          e.created_at ?? "",
        ]
          .map((v) => {
            const s = String(v);
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      );
      const csv = [headers.join(","), ...rows].join("\r\n");
      const dateStr = new Date().toISOString().slice(0, 10);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="brainos_engagements_${dateStr}.csv"`,
          "Cache-Control": "no-cache",
        },
      });
    }

    // Default: JSON
    return NextResponse.json(exportPayload);
  } catch (err) {
    logger.error("[export/engagements] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
