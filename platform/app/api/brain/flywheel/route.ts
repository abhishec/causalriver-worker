/**
 * GET /api/brain/flywheel
 *
 * Returns aggregate engagement outcome benchmark stats for the current workspace.
 * This is the "500 engagements say..." data — impossible to replicate without running
 * the product at scale.
 *
 * Response shape:
 * {
 *   totalMilestones: number,
 *   milestoneBreakdown: { [type]: number },
 *   avgHealthScore: number | null,
 *   flightRiskTotal: number,
 *   scopeCreepTotal: number,
 *   topDomainSequences: Array<{ sequence: string; count: number }>,
 *   avgQualityByDomain: { [domain]: number },
 *   outcomeDistribution: { [label]: number },
 *   trend7d: number,   -- milestone count last 7 days
 *   trend30d: number,  -- milestone count last 30 days
 * }
 */

import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let supabase;
  let user = null;
  try {
    supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedOrgId = url.searchParams.get("orgId");

    let admin;
    try {
      admin = getAdminClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let organizationId: string | null = null;

    if (requestedOrgId) {
      const membership = await verifyWorkspaceMembership(user.id, requestedOrgId);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      organizationId = requestedOrgId;
    } else {
      organizationId = (await getCurrentWorkspaceId()) || null;
      if (organizationId) {
        const membership = await verifyWorkspaceMembership(user.id, organizationId);
        if (!membership) organizationId = null;
      }
    }

    if (!organizationId) {
      return NextResponse.json(emptyStats(), { status: 200 });
    }

    // ── Aggregate queries (parallel) ──────────────────────────────────────
    const now = new Date();
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      totalResult,
      avgHealthResult,
      flightRiskResult,
      scopeCreepResult,
      milestoneBreakdownResult,
      qualityResult,
      outcomeResult,
      trend7dResult,
      trend30dResult,
    ] = await Promise.all([
      // Total milestone count
      admin
        .from("engagement_outcomes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),

      // Average health score
      admin
        .from("engagement_outcomes")
        .select("health_score")
        .eq("organization_id", organizationId)
        .not("health_score", "is", null),

      // Total flight risk count (sum of flight_risk_count)
      admin
        .from("engagement_outcomes")
        .select("flight_risk_count")
        .eq("organization_id", organizationId),

      // Scope creep total
      admin
        .from("engagement_outcomes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("scope_creep_detected", true),

      // Milestone type breakdown
      admin
        .from("engagement_outcomes")
        .select("milestone_type")
        .eq("organization_id", organizationId),

      // Quality scores by domain (quality_scores JSONB)
      admin
        .from("engagement_outcomes")
        .select("quality_scores, domain_sequence")
        .eq("organization_id", organizationId)
        .not("quality_scores", "is", null),

      // Outcome label distribution
      admin
        .from("engagement_outcomes")
        .select("outcome_label")
        .eq("organization_id", organizationId)
        .not("outcome_label", "is", null),

      // 7-day trend
      admin
        .from("engagement_outcomes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", ago7d),

      // 30-day trend
      admin
        .from("engagement_outcomes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", ago30d),
    ]);

    // ── Compute stats ─────────────────────────────────────────────────────

    const totalMilestones = totalResult.count ?? 0;

    // Average health score
    const healthScores = (avgHealthResult.data ?? [])
      .map((r) => r.health_score as number | null)
      .filter((v): v is number => typeof v === "number");
    const avgHealthScore =
      healthScores.length > 0
        ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length
        : null;

    // Flight risk total
    const flightRiskTotal = (flightRiskResult.data ?? []).reduce(
      (sum, r) => sum + ((r.flight_risk_count as number) || 0),
      0
    );

    // Scope creep total
    const scopeCreepTotal = scopeCreepResult.count ?? 0;

    // Milestone breakdown
    const milestoneBreakdown: Record<string, number> = {};
    for (const row of milestoneBreakdownResult.data ?? []) {
      const t = row.milestone_type as string;
      milestoneBreakdown[t] = (milestoneBreakdown[t] ?? 0) + 1;
    }

    // Average quality by domain
    const domainQualityAccum: Record<string, { sum: number; count: number }> = {};
    const sequenceCounts: Record<string, number> = {};

    for (const row of qualityResult.data ?? []) {
      const qs = row.quality_scores as Record<string, number> | null;
      if (qs) {
        for (const [domain, score] of Object.entries(qs)) {
          if (typeof score === "number") {
            if (!domainQualityAccum[domain]) {
              domainQualityAccum[domain] = { sum: 0, count: 0 };
            }
            domainQualityAccum[domain].sum += score;
            domainQualityAccum[domain].count += 1;
          }
        }
      }
      // Domain sequence tracking
      const seq = row.domain_sequence as string[] | null;
      if (seq && seq.length > 0) {
        const key = seq.join(" → ");
        sequenceCounts[key] = (sequenceCounts[key] ?? 0) + 1;
      }
    }

    const avgQualityByDomain: Record<string, number> = {};
    for (const [domain, accum] of Object.entries(domainQualityAccum)) {
      avgQualityByDomain[domain] =
        Math.round((accum.sum / accum.count) * 1000) / 1000;
    }

    // Top domain sequences (top 5)
    const topDomainSequences = Object.entries(sequenceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([sequence, count]) => ({ sequence, count }));

    // Outcome distribution
    const outcomeDistribution: Record<string, number> = {};
    for (const row of outcomeResult.data ?? []) {
      const label = row.outcome_label as string;
      if (label) {
        outcomeDistribution[label] = (outcomeDistribution[label] ?? 0) + 1;
      }
    }

    const trend7d = trend7dResult.count ?? 0;
    const trend30d = trend30dResult.count ?? 0;

    const stats = {
      totalMilestones,
      milestoneBreakdown,
      avgHealthScore: avgHealthScore !== null ? Math.round(avgHealthScore * 1000) / 1000 : null,
      flightRiskTotal,
      scopeCreepTotal,
      topDomainSequences,
      avgQualityByDomain,
      outcomeDistribution,
      trend7d,
      trend30d,
    };

    logger.warn(`[/api/brain/flywheel] org=${organizationId} total=${totalMilestones} trend7d=${trend7d}`);

    return NextResponse.json(stats);
  } catch (err) {
    logger.error("[/api/brain/flywheel] error:", {
      error: (err as Error)?.message ?? String(err),
      route: "/api/brain/flywheel",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function emptyStats() {
  return {
    totalMilestones: 0,
    milestoneBreakdown: {},
    avgHealthScore: null,
    flightRiskTotal: 0,
    scopeCreepTotal: 0,
    topDomainSequences: [],
    avgQualityByDomain: {},
    outcomeDistribution: {},
    trend7d: 0,
    trend30d: 0,
  };
}
