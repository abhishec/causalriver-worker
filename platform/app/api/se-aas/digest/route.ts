/**
 * SE-AAS Weekly Digest API
 * ========================
 *
 * P0-01 Spec: "Jayprasad receives a Slack/email digest every Monday morning
 * summarising velocity collapse warnings and bottleneck risk from the past sprint."
 *
 * Also handles mid-sprint urgent alerts when:
 * - Velocity collapses > 25% within the current sprint window
 * - BRS crosses into HIGH risk mid-sprint
 *
 * Routes:
 *   POST /api/se-aas/digest          — Generate and persist a digest (called by cron/scheduler)
 *   GET  /api/se-aas/digest          — Fetch latest digest(s) for the org
 *   POST /api/se-aas/digest/preview  — Generate digest preview without persisting
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Digest type definitions ────────────────────────────────────────────────

interface DigestSection {
  title: string;
  status: "ok" | "warning" | "critical";
  summary: string;
  metrics: Array<{ label: string; value: string | number; trend?: "up" | "down" | "stable" }>;
  actions?: string[];
}

interface WeeklyDigest {
  workspaceId: string;
  digestType: "weekly_monday" | "mid_sprint_urgent";
  generatedAt: string;
  sprintWindow: { from: string; to: string };
  overallStatus: "healthy" | "at_risk" | "critical";
  headline: string;
  sections: DigestSection[];
  topActions: string[];
  deliveryChannels: string[];
}

// ── Helper: build digest from velocity + bottleneck snapshots ──────────────

async function buildDigest(
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  digestType: "weekly_monday" | "mid_sprint_urgent" = "weekly_monday"
): Promise<WeeklyDigest> {
  const now = new Date();
  const sprintEnd = now.toISOString();
  const sprintStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(); // 2-week sprint

  // Fetch velocity snapshots for the sprint window
  const { data: velocitySnaps } = await supabase
    .from("velocity_snapshots")
    .select("*")
    .eq("organization_id", workspaceId)
    .gte("snapshot_date", sprintStart)
    .order("snapshot_date", { ascending: false })
    .limit(14);

  // Fetch latest 2 bottleneck snapshots for WoW trend
  const { data: bottleneckSnaps } = await supabase
    .from("bottleneck_snapshots")
    .select("*")
    .eq("organization_id", workspaceId)
    .order("snapshot_date", { ascending: false })
    .limit(2);

  // Fetch recent SE-AAS artifacts (last 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentArtifacts } = await supabase
    .from("se_aas_artifacts")
    .select("domain_type, created_at")
    .eq("organization_id", workspaceId)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(50);

  // GitHub connector for branch context
  const { data: ghConnector } = await supabase
    .from("org_connectors")
    .select("config")
    .eq("organization_id", workspaceId)
    .eq("connector_type", "github")
    .maybeSingle();

  const primaryBranch = ghConnector?.config?.primaryBranch ?? "main";

  // ── Compute metrics ──────────────────────────────────────────────────────
  const latestVelocity = velocitySnaps?.[0];
  const latestBottleneck = bottleneckSnaps?.[0];
  const prevBottleneck = bottleneckSnaps?.[1];

  // Velocity trend
  const last7 = (velocitySnaps ?? []).slice(0, 7);
  const prev7 = (velocitySnaps ?? []).slice(7, 14);
  const avgLast7 = last7.reduce((s, v) => s + (v.prs_merged || 0), 0) / (last7.length || 1);
  const avgPrev7 = prev7.reduce((s, v) => s + (v.prs_merged || 0), 0) / (prev7.length || 1);
  const velocityChangePct = avgPrev7 > 0 ? ((avgLast7 - avgPrev7) / avgPrev7) * 100 : 0;
  const isVelocityCollapse = velocityChangePct < -25;

  // BRS trend
  const brsNow = latestBottleneck?.bottleneck_risk_score ?? 0;
  const brsPrev = prevBottleneck?.bottleneck_risk_score ?? brsNow;
  const brsDelta = brsNow - brsPrev;
  const brsTrend = brsDelta <= -5 ? "improving" : brsDelta >= 5 ? "worsening" : "stable";
  const isHighBRS = latestBottleneck?.risk_level === "high";

  // Artifact usage
  const artifactCount = recentArtifacts?.length ?? 0;
  const domainUsage: Record<string, number> = {};
  (recentArtifacts ?? []).forEach((a) => {
    domainUsage[a.domain_type] = (domainUsage[a.domain_type] ?? 0) + 1;
  });
  const topDomain = Object.entries(domainUsage).sort((a, b) => b[1] - a[1])[0] ?? null;

  // ── Build sections ───────────────────────────────────────────────────────
  const sections: DigestSection[] = [];

  // Section 1: Velocity
  sections.push({
    title: "🚀 Deploy Velocity",
    status: isVelocityCollapse ? "critical" : velocityChangePct < -10 ? "warning" : "ok",
    summary: isVelocityCollapse
      ? `Velocity collapsed ${Math.abs(velocityChangePct).toFixed(0)}% vs last sprint — below 25% collapse threshold. Immediate action recommended.`
      : velocityChangePct < 0
      ? `Velocity declined ${Math.abs(velocityChangePct).toFixed(0)}% vs last sprint. Monitor for continued deterioration.`
      : `Velocity is healthy, up ${velocityChangePct.toFixed(0)}% vs last sprint.`,
    metrics: [
      {
        label: "PRs merged (last 7d)",
        value: Math.round(avgLast7),
        trend: velocityChangePct >= 0 ? "up" : "down",
      },
      {
        label: "7-day velocity change",
        value: `${velocityChangePct >= 0 ? "+" : ""}${velocityChangePct.toFixed(1)}%`,
        trend: velocityChangePct >= 0 ? "up" : "down",
      },
      {
        label: "Avg cycle time",
        value: typeof latestVelocity?.mean_pr_cycle_time_hours === "number" && isFinite(latestVelocity.mean_pr_cycle_time_hours)
          ? `${(latestVelocity.mean_pr_cycle_time_hours / 24).toFixed(1)}d`
          : "—",
      },
      {
        label: "Open PRs (WIP)",
        value: latestVelocity?.open_pr_count ?? "—",
      },
    ],
    actions: isVelocityCollapse
      ? [
          "Identify engineers with zero merges this sprint and unblock them",
          "Run Brain SE-AAS PR Review on the oldest open PRs to clear the queue",
          "Check reviewer concentration — one reviewer may be bottlenecking merges",
        ]
      : [],
  });

  // Section 2: Bottleneck SPOF
  sections.push({
    title: "⚠️ Reviewer Bottleneck",
    status: isHighBRS ? "critical" : brsTrend === "worsening" ? "warning" : "ok",
    summary: latestBottleneck
      ? isHighBRS
        ? `Bottleneck risk is CRITICAL (score ${brsNow.toFixed(0)}/100, ${brsTrend} trend). ${latestBottleneck.top_reviewer_login} handles ${((latestBottleneck.top_reviewer_share ?? 0) * 100).toFixed(0)}% of all reviews.`
        : `Bottleneck risk is ${latestBottleneck.risk_level} (score ${brsNow.toFixed(0)}/100). Week-over-week trend: ${brsTrend}.`
      : "No bottleneck data available for this sprint.",
    metrics: [
      {
        label: "Risk score",
        value: `${brsNow.toFixed(0)} / 100`,
        trend: brsDelta < 0 ? "down" : brsDelta > 0 ? "up" : "stable",
      },
      {
        label: "Top reviewer share",
        value: latestBottleneck?.top_reviewer_share
          ? `${(latestBottleneck.top_reviewer_share * 100).toFixed(0)}%`
          : "—",
        trend: (latestBottleneck?.top_reviewer_share ?? 0) > 0.4 ? "up" : "stable",
      },
      {
        label: "HHI concentration",
        value: typeof latestBottleneck?.reviewer_hhi === "number" ? latestBottleneck.reviewer_hhi.toFixed(3) : "—",
      },
      {
        label: "WoW trend",
        value: brsTrend === "improving" ? "↓ Improving" : brsTrend === "worsening" ? "↑ Worsening" : "→ Stable",
        trend: brsTrend === "improving" ? "down" : brsTrend === "worsening" ? "up" : "stable",
      },
    ],
    actions: isHighBRS
      ? [
          `Pair ${latestBottleneck?.top_reviewer_login ?? "top reviewer"} with 2 under-utilized reviewers immediately`,
          "Run 5-Day Absence Simulation to assess resilience if top reviewer is unavailable",
          "Distribute pending PRs across the team — avoid single-reviewer queues",
        ]
      : [],
  });

  // Section 3: Brain SE-AAS Adoption
  sections.push({
    title: "🧠 Brain SE-AAS Usage",
    status: artifactCount === 0 ? "warning" : "ok",
    summary:
      artifactCount > 0
        ? `Team ran ${artifactCount} Brain-augmented analyses this sprint.${topDomain ? ` Most used: ${topDomain[0].replace(/-/g, " ")} (${topDomain[1]}×).` : ""}`
        : "No SE-AAS functions were used this sprint. Consider integrating PR Review and Impact Analysis into your workflow.",
    metrics: [
      { label: "Analyses run (7d)", value: artifactCount },
      { label: "Top function", value: topDomain ? topDomain[0].replace(/-/g, " ") : "—" },
      { label: "Branch", value: primaryBranch },
    ],
    actions:
      artifactCount < 3
        ? [
            "Enable GitHub webhook auto-trigger for PR Review on every opened PR",
            "Use Impact Analysis before deploying large changesets",
            "Schedule a weekly Architecture Extractor run to track structural drift",
          ]
        : [],
  });

  // ── Overall status and headline ──────────────────────────────────────────
  const criticalCount = sections.filter((s) => s.status === "critical").length;
  const warningCount = sections.filter((s) => s.status === "warning").length;

  const overallStatus: "healthy" | "at_risk" | "critical" =
    criticalCount > 0 ? "critical" : warningCount > 0 ? "at_risk" : "healthy";

  const headline =
    overallStatus === "critical"
      ? `⚠️ Engineering health is CRITICAL — ${criticalCount} issue${criticalCount > 1 ? "s" : ""} require immediate action`
      : overallStatus === "at_risk"
      ? `⚡ Engineering health is at risk — ${warningCount} area${warningCount > 1 ? "s" : ""} need attention`
      : "✅ Engineering health is strong — no collapse or bottleneck risk detected";

  // Aggregate top actions (from critical/warning sections)
  const topActions = sections
    .filter((s) => s.status !== "ok")
    .flatMap((s) => s.actions ?? [])
    .slice(0, 5);

  return {
    workspaceId,
    digestType,
    generatedAt: now.toISOString(),
    sprintWindow: { from: sprintStart, to: sprintEnd },
    overallStatus,
    headline,
    sections,
    topActions,
    deliveryChannels: ["in-app"], // Slack/email channels are added when connectors are wired
  };
}

// ── POST /api/se-aas/digest — Generate + persist digest ─────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const body = await request.json().catch(() => ({}));
    const digestType: "weekly_monday" | "mid_sprint_urgent" =
      body.digestType === "mid_sprint_urgent" ? "mid_sprint_urgent" : "weekly_monday";

    const digest = await buildDigest(workspaceId, supabase, digestType);

    // Persist the digest as an ai_memory entry so it shows in notifications
    const { data: saved, error: saveError } = await supabase
      .from("ai_memory")
      .insert({
        organization_id: workspaceId,
        memory_type: "alert",
        content: digest.headline,
        metadata: {
          digest_type: digestType,
          overall_status: digest.overallStatus,
          sprint_window: digest.sprintWindow,
          sections: digest.sections,
          top_actions: digest.topActions,
          generated_at: digest.generatedAt,
          severity:
            digest.overallStatus === "critical"
              ? "critical"
              : digest.overallStatus === "at_risk"
              ? "warning"
              : "info",
        },
        created_at: digest.generatedAt,
      })
      .select("id")
      .maybeSingle();

    if (saveError) {
      logger.error("[digest POST] Failed to persist digest:", saveError.message);
    }

    // Also write to cascade_alerts for the notification bell
    if (digest.overallStatus !== "healthy") {
      await supabase
        .from("cascade_alerts")
        .insert({
          organization_id: workspaceId,
          alert_type: digestType === "weekly_monday" ? "weekly_digest" : "mid_sprint_alert",
          severity:
            digest.overallStatus === "critical"
              ? "high"
              : digest.overallStatus === "at_risk"
              ? "medium"
              : "low",
          message: digest.headline,
          metadata: {
            digest,
            memory_id: saved?.id,
          },
          is_read: false,
        })
        .select("id")
        .maybeSingle();
    }

    return NextResponse.json({
      success: true,
      digest,
      memoryId: saved?.id,
    });
  } catch (err) {
    logger.error("[digest POST] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── GET /api/se-aas/digest — Fetch recent digests for org ───────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();

    // Fetch digest-type ai_memory entries
    const { data: digests } = await supabase
      .from("ai_memory")
      .select("id, content, metadata, created_at")
      .eq("organization_id", workspaceId)
      .eq("memory_type", "alert")
      .order("created_at", { ascending: false })
      .limit(8);

    // Filter to digest entries only
    const digestEntries = (digests ?? []).filter(
      (d) =>
        d.metadata?.digest_type === "weekly_monday" ||
        d.metadata?.digest_type === "mid_sprint_urgent"
    );

    return NextResponse.json({ digests: digestEntries });
  } catch (err) {
    logger.error("[digest GET] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
