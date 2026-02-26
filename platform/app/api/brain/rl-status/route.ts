import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { getLearningStats } from "@/lib/brain/agent-rl";

// Must be force-dynamic: reads cookies for auth + workspace context on every request.
// Without this, Next.js 15 tries to statically prerender the route and fails.
export const dynamic = "force-dynamic";

/**
 * GET /api/brain/rl-status
 *
 * Returns the current reinforcement learning activity for this org.
 * Used by OpenClawPanel to show "Active Learning" stats.
 *
 * Response:
 *   {
 *     signalsThisHour: number,      // RL signals emitted in the last 60 minutes
 *     signalsThisSession: number,   // RL signals since the copilot session started (last 24h)
 *     feedbackTotal: number,        // Total user feedback submissions (all time)
 *     feedbackHelpful: number,      // Thumbs-up count
 *     feedbackNotHelpful: number,   // Thumbs-down count
 *     learningVelocity: number,     // Signals per hour (7-day moving avg)
 *     recentSignals: Array<{ signal_type, source_domain, signal_value, created_at }>,
 *     queueDepth: number,           // Brain feedback queue pending items
 *   }
 */
export async function GET(req: NextRequest) {
  // ── Auth: isolate failures so auth errors always return 401, never 500 ──
  let supabase;
  let user = null;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch (authErr) {
    // createClient() or getUser() threw (e.g. network error, no request context)
    logger.warn("[rl-status] Auth failed:", authErr);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaceId = await getCurrentWorkspaceId();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Run all queries in parallel for speed
    const [
      hourlySignals,
      sessionSignals,
      weeklySignals,
      recentSignalsResult,
      feedbackResult,
      queueResult,
    ] = await Promise.all([
      // Signals in the last hour
      supabase
        .from("cross_domain_signals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .gte("signal_timestamp", oneHourAgo),

      // Signals in the last 24 hours (session proxy)
      supabase
        .from("cross_domain_signals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .gte("signal_timestamp", oneDayAgo),

      // Signals in the last 7 days (for velocity calculation)
      supabase
        .from("cross_domain_signals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .gte("signal_timestamp", sevenDaysAgo),

      // Recent signal events (last 5)
      supabase
        .from("cross_domain_signals")
        .select("signal_type, source_domain, signal_value, signal_timestamp")
        .eq("organization_id", workspaceId)
        .order("signal_timestamp", { ascending: false })
        .limit(5),

      // User feedback stats
      supabase
        .from("copilot_response_feedback")
        .select("rating")
        .eq("organization_id", workspaceId),

      // Queue depth
      supabase
        .from("brain_feedback_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .eq("status", "pending"),
    ]);

    const signalsThisHour = hourlySignals.count ?? 0;
    const signalsThisSession = sessionSignals.count ?? 0;
    const signalsThisWeek = weeklySignals.count ?? 0;
    // Velocity: signals/hour averaged over 7 days
    const learningVelocity = Math.round((signalsThisWeek / (7 * 24)) * 10) / 10;

    const feedbackRows = feedbackResult.data ?? [];
    const feedbackTotal = feedbackRows.length;
    const feedbackHelpful = feedbackRows.filter((r) => r.rating === "helpful").length;
    const feedbackNotHelpful = feedbackRows.filter((r) => r.rating !== "helpful").length;

    const improvementThisSession = feedbackTotal > 0 ? Math.round((feedbackHelpful / feedbackTotal) * 100) : 0;

    // ── Learning stats from agent task outcomes ───────────────────────────
    const admin = getAdminClient();
    const learningStats = await getLearningStats(admin, workspaceId).catch(() => null);

    return NextResponse.json({
      signalsThisHour,
      signalsThisSession,
      // Aliases used by the Active Learning indicator and spec consumers
      totalSignals24h: signalsThisSession,
      learningVelocity,
      improvementThisSession,
      feedbackTotal,
      feedbackHelpful,
      feedbackNotHelpful,
      positiveFeedbacks: feedbackHelpful,
      recentSignals: recentSignalsResult.data ?? [],
      queueDepth: queueResult.count ?? 0,
      // Agent task learning stats (from prediction_records)
      learningStats: learningStats ?? null,
    });
  } catch (err) {
    logger.error("[rl-status] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
