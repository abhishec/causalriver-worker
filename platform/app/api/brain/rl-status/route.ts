import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

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
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    return NextResponse.json({
      signalsThisHour,
      signalsThisSession,
      feedbackTotal,
      feedbackHelpful,
      feedbackNotHelpful,
      learningVelocity,
      recentSignals: recentSignalsResult.data ?? [],
      queueDepth: queueResult.count ?? 0,
    });
  } catch (err) {
    logger.error("[rl-status] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
