/**
 * GET /api/brain/rl-stats
 *
 * Returns per-domain RL accuracy metrics and the overall RL closed-loop summary
 * for the current workspace. Used by RLStatsPanel and any integration that needs
 * domain-level success rates.
 *
 * Unlike /api/brain/rl-status (hourly signal counts) this endpoint focuses on:
 *   - Per-domain accuracy breakdown (success rate, avg quality, last outcome)
 *   - Overall accuracy and total outcome count
 *   - Recent outcomes timeline (last 10)
 *   - Brain evolution: today's accuracy snapshot vs. yesterday
 *
 * Response shape:
 * {
 *   totalOutcomes: number,
 *   overallSuccessRate: number,     // 0–1
 *   overallAvgQuality: number,      // 0–1
 *   byDomain: Array<{
 *     domain: string,
 *     totalOutcomes: number,
 *     successCount: number,
 *     successRate: number,
 *     avgQuality: number,
 *     lastOutcomeAt: string | null,
 *   }>,
 *   recentOutcomes: Array<{
 *     domain: string,
 *     quality: number,
 *     wasSuccess: boolean,
 *     createdAt: string,
 *   }>,
 *   evolutionToday: { accuracy: number, totalPredictions: number } | null,
 *   evolutionYesterday: { accuracy: number, totalPredictions: number } | null,
 *   lookbackDays: number,
 *   updatedAt: string,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { getOrgRLSummary } from "@/lib/rl/outcome-recorder";

// Must be force-dynamic: reads cookies for auth + workspace context on every request.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  let supabase;
  let user = null;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch (authErr) {
    logger.warn("[rl-stats] Auth failed:", authErr);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const lookbackDays = Math.min(
      parseInt(url.searchParams.get("days") ?? "30", 10) || 30,
      90
    );

    const workspaceId = await getCurrentWorkspaceId();
    const admin = getAdminClient();

    // ── RL summary (per-domain accuracy + recent outcomes) ──────────────
    const [summary, evolutionResult] = await Promise.all([
      getOrgRLSummary(admin, workspaceId, lookbackDays),

      // Brain evolution: today + yesterday accuracy from brain_evolution_snapshots
      (async () => {
        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

        const { data: snapshots } = await admin
          .from("brain_evolution_snapshots")
          .select("snapshot_date, accuracy, total_predictions")
          .eq("organization_id", workspaceId)
          .in("snapshot_date", [today, yesterday])
          .order("snapshot_date", { ascending: false });

        return snapshots ?? [];
      })(),
    ]);

    const todaySnap = evolutionResult.find(
      (s: { snapshot_date: string; accuracy: number; total_predictions: number }) =>
        s.snapshot_date === new Date().toISOString().split("T")[0]
    );
    const yesterdaySnap = evolutionResult.find(
      (s: { snapshot_date: string; accuracy: number; total_predictions: number }) =>
        s.snapshot_date === new Date(Date.now() - 86_400_000).toISOString().split("T")[0]
    );

    if (!summary) {
      // Return empty stats rather than a 500 — client can render an empty state
      return NextResponse.json({
        totalOutcomes: 0,
        overallSuccessRate: 0,
        overallAvgQuality: 0,
        byDomain: [],
        recentOutcomes: [],
        evolutionToday: todaySnap
          ? { accuracy: todaySnap.accuracy, totalPredictions: todaySnap.total_predictions }
          : null,
        evolutionYesterday: yesterdaySnap
          ? { accuracy: yesterdaySnap.accuracy, totalPredictions: yesterdaySnap.total_predictions }
          : null,
        lookbackDays,
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      totalOutcomes: summary.totalOutcomes,
      overallSuccessRate: summary.overallSuccessRate,
      overallAvgQuality: summary.overallAvgQuality,
      byDomain: summary.byDomain,
      recentOutcomes: summary.recentOutcomes,
      evolutionToday: todaySnap
        ? { accuracy: todaySnap.accuracy, totalPredictions: todaySnap.total_predictions }
        : null,
      evolutionYesterday: yesterdaySnap
        ? { accuracy: yesterdaySnap.accuracy, totalPredictions: yesterdaySnap.total_predictions }
        : null,
      lookbackDays,
      updatedAt: summary.updatedAt,
    });
  } catch (err) {
    logger.error("[rl-stats] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
