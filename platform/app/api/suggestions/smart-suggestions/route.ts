/**
 * Smart Suggestions API
 * =====================
 *
 * GET /api/suggestions/smart-suggestions?workspaceId=<uuid>
 *   Returns contextual smart suggestions for the current user/org.
 *   Combines: health-driven suggestions + usage-pattern suggestions.
 *
 * POST /api/suggestions/smart-suggestions
 *   Record a suggestion dismissal for cooldown tracking.
 *   Body: { suggestionType: string, reason?: string }
 *
 * Flow:
 *   1. Fetch brain health → generate health suggestions
 *   2. Fetch pending approval count → generate approval suggestion
 *   3. Fetch recent dismissals → filter out cooled-down types
 *   4. Return merged + deduplicated suggestions (max 3)
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { generateHealthSuggestions, fetchHealthForSuggestions } from "@/lib/suggestions/health-suggestion-bridge";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = request.nextUrl.searchParams.get("workspaceId")
      || await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json({ suggestions: [] });
    }

    // ── Fetch health data ────────────────────────────────────────
    const healthData = await fetchHealthForSuggestions(workspaceId);

    // ── Fetch recent dismissals from DB ──────────────────────────
    const service = await createServiceClient();
    const cooldownCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    let recentDismissals = new Map<string, number>();
    try {
      const { data: dismissals } = await service
        .from("suggestion_dismissals")
        .select("suggestion_type, dismissed_at")
        .eq("organization_id", workspaceId)
        .eq("user_id", user.id)
        .gte("dismissed_at", cooldownCutoff);

      if (dismissals) {
        for (const d of dismissals) {
          recentDismissals.set(
            d.suggestion_type,
            new Date(d.dismissed_at).getTime()
          );
        }
      }
    } catch {
      // Table might not exist yet — proceed without dismissals
    }

    // ── Generate health suggestions ──────────────────────────────
    const healthSuggestions = healthData
      ? generateHealthSuggestions(healthData, recentDismissals)
      : [];

    // ── Fetch pending approval count ─────────────────────────────
    let pendingApprovals = 0;
    try {
      const { count } = await service
        .from("brain_agent_tasks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .eq("status", "awaiting_approval");
      pendingApprovals = count || 0;
    } catch {
      // Table might not exist
    }

    // ── Merge: health + approval suggestions ─────────────────────
    const allSuggestions = [...healthSuggestions];

    if (pendingApprovals > 0 && !recentDismissals.has("view-approvals")) {
      allSuggestions.push({
        type: "view-approvals",
        title: `${pendingApprovals} task${pendingApprovals > 1 ? "s" : ""} need approval`,
        description: "Review and approve pending tasks from the Task Queue.",
        actionLabel: "View Pending",
        pendingCount: pendingApprovals,
      });
    }

    // Cap at 3 suggestions
    return NextResponse.json({
      suggestions: allSuggestions.slice(0, 3),
      healthScore: healthData?.overall_score ?? null,
      healthStatus: healthData?.status ?? "unknown",
    });
  } catch (error: unknown) {
    // Graceful degradation: return empty suggestions instead of 500
    logger.warn("[SmartSuggestions] GET failed, returning empty:", error);
    return NextResponse.json({ suggestions: [], healthScore: null, healthStatus: "unknown" });
  }
}

/**
 * POST /api/suggestions/smart-suggestions
 * Record a suggestion dismissal.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { suggestionType, reason } = body as {
      suggestionType?: string;
      reason?: string;
    };

    if (!suggestionType) {
      return NextResponse.json({ error: "suggestionType required" }, { status: 400 });
    }

    const workspaceId = await getCurrentWorkspaceId();

    const service = await createServiceClient();

    // Upsert dismissal (update timestamp if already dismissed)
    try {
      await service.from("suggestion_dismissals").upsert({
        organization_id: workspaceId,
        user_id: user.id,
        suggestion_type: suggestionType,
        reason: reason || null,
        dismissed_at: new Date().toISOString(),
      }, {
        onConflict: "organization_id,user_id,suggestion_type",
      });
    } catch {
      // Table might not exist — fall back to ai_memory
      await service.from("ai_memory").insert({
        organization_id: workspaceId,
        memory_type: "suggestion_dismissal",
        content: JSON.stringify({ suggestionType, reason, userId: user.id }),
        source: "smart-suggestions",
        confidence: 0.5,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[SmartSuggestions] POST error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
