/**
 * GET /api/brain/learning-stats
 *
 * Returns aggregated reinforcement learning statistics for the current workspace:
 * - Agent task outcomes (prediction_records)
 * - User feedback distribution (copilot_response_feedback)
 * - Pending RL queue depth (brain_feedback_queue)
 * - Learning velocity (tasks/feedback in last 24h)
 *
 * Used by AI Worker Dashboard, Active Learning Indicator, and agent management UI.
 */

import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getLearningStats } from "@/lib/brain/agent-rl";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // ── Auth: isolate createClient() AND getUser() failures so they return 401, never 500 ──
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

    // Resolve org: if ?orgId provided, verify membership first (prevents cross-tenant read).
    // If not provided, use the user's current workspace from cookie context.
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
      // Verify the authenticated user is actually a member of the requested org
      const membership = await verifyWorkspaceMembership(user.id, requestedOrgId);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      organizationId = requestedOrgId;
    } else {
      // No orgId param — fall back to user's current workspace
      organizationId = await getCurrentWorkspaceId() || null;
      // Ensure the resolved workspace is non-empty and the user actually belongs to it
      if (organizationId) {
        const membership = await verifyWorkspaceMembership(user.id, organizationId);
        if (!membership) {
          organizationId = null;
        }
      }
    }

    if (!organizationId) {
      return NextResponse.json(
        {
          totalTasks: 0,
          successRate: 0,
          avgQuality: 0,
          topDomain: null,
          learningVelocity: 0,
          pendingFeedback: 0,
          helpfulFeedback: 0,
          notHelpfulFeedback: 0,
          qualityScore7d: 0,
        },
        { status: 200 }
      );
    }

    const stats = await getLearningStats(admin, organizationId);

    if (!stats) {
      return NextResponse.json(
        { error: "Failed to compute learning stats" },
        { status: 500 }
      );
    }

    // Recent federated_knowledge captures (last 24h) — shows what the brain learned
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let recentCaptures: Array<{ domain: string; content: string; confidence: number; captured_at: string }> = [];
    try {
      const { data: captureRows } = await admin
        .from("federated_knowledge")
        .select("domain, content, confidence, metadata")
        .eq("organization_id", organizationId)
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(10);

      if (captureRows) {
        recentCaptures = captureRows.map((r: { domain: string; content: string; confidence: number; metadata: Record<string, unknown> | null }) => ({
          domain: r.domain,
          content: (r.content ?? "").slice(0, 100),
          confidence: r.confidence ?? 0,
          captured_at: (r.metadata as { capturedAt?: string } | null)?.capturedAt ?? "",
        }));
      }
    } catch {
      // Non-fatal — learning stats still returned without recentCaptures
    }

    const totalCaptures24h = recentCaptures.length;

    logger.info(
      `[/api/brain/learning-stats] org=${organizationId} tasks=${stats.totalTasks} velocity=${stats.learningVelocity} captures=${totalCaptures24h}`
    );

    return NextResponse.json({ ...stats, recentCaptures, totalCaptures24h });
  } catch (err) {
    logger.error("[/api/brain/learning-stats] error:", { error: (err as Error)?.message ?? String(err), route: "/api/brain/learning-stats" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
