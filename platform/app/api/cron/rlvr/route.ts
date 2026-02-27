/**
 * Cron: Ground-Truth RLVR Verification Sweep
 * ============================================
 *
 * GET /api/cron/rlvr
 *   Sweeps all organizations for pending RLVR predictions that are past
 *   their verify_after_date, then re-measures actual domain outcomes and
 *   emits verified RL signals to cross_domain_signals for the brain.
 *
 * Frequency: Daily at 3 AM UTC (see vercel.json / crons config).
 * Max duration: 300s (handles orgs with many pending predictions).
 *
 * Security: Bearer CRON_SECRET (same as all other cron routes).
 *
 * Returns: { orgsChecked, predictionsVerified, totalCorrect, totalIncorrect, accuracy }
 */

import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { verifyPendingPredictions } from "@/lib/brain/rlvr-verifier";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    // ── Security ──────────────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServiceClient();
    const runStart = Date.now();

    // ── Discover orgs with pending RLVR predictions ───────────────
    const now = new Date().toISOString();
    const { data: orgsWithPending, error: pendingErr } = await supabase
      .from("rlvr_prediction_outcomes")
      .select("organization_id")
      .eq("verification_status", "pending")
      .lte("verify_after_date", now);

    if (pendingErr) {
      logger.warn("[CronRLVR] Failed to query pending predictions:", pendingErr.message);
      return NextResponse.json({ error: "Failed to query pending predictions" }, { status: 500 });
    }

    if (!orgsWithPending || orgsWithPending.length === 0) {
      logger.warn("[CronRLVR] No pending predictions due for verification");
      return NextResponse.json({
        success: true,
        message: "No pending predictions due",
        orgsChecked: 0,
        predictionsVerified: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        accuracy: null,
      });
    }

    // Deduplicate org IDs
    const orgIds = [...new Set(
      (orgsWithPending as Array<{ organization_id: string }>).map(r => r.organization_id),
    )];

    logger.warn(`[CronRLVR] Found ${orgIds.length} orgs with pending RLVR predictions`);

    // ── Verify predictions per org ────────────────────────────────
    let totalVerified = 0;
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalExpired = 0;

    const orgResults: Array<{
      orgId: string;
      verified: number;
      correct: number;
      incorrect: number;
      expired: number;
      durationMs: number;
    }> = [];

    for (const orgId of orgIds) {
      const orgStart = Date.now();
      try {
        const summary = await verifyPendingPredictions(supabase, orgId);
        const orgDuration = Date.now() - orgStart;

        totalVerified += summary.verified;
        totalCorrect += summary.correct;
        totalIncorrect += summary.incorrect;
        totalExpired += summary.expired;

        orgResults.push({
          orgId: orgId.slice(0, 8),
          verified: summary.verified,
          correct: summary.correct,
          incorrect: summary.incorrect,
          expired: summary.expired,
          durationMs: orgDuration,
        });

        logger.warn(
          `[CronRLVR] org=${orgId.slice(0, 8)} verified=${summary.verified} ` +
          `correct=${summary.correct} incorrect=${summary.incorrect} ` +
          `expired=${summary.expired} took=${orgDuration}ms`,
        );
      } catch (err) {
        logger.warn(`[CronRLVR] org=${orgId.slice(0, 8)} verification threw:`, err);
        orgResults.push({
          orgId: orgId.slice(0, 8),
          verified: 0,
          correct: 0,
          incorrect: 0,
          expired: 0,
          durationMs: Date.now() - orgStart,
        });
      }
    }

    const totalDurationMs = Date.now() - runStart;
    const accuracy =
      totalVerified > 0
        ? Math.round((totalCorrect / totalVerified) * 100) / 100
        : null;

    logger.warn(
      `[CronRLVR] Complete: orgs=${orgIds.length} verified=${totalVerified} ` +
      `correct=${totalCorrect} incorrect=${totalIncorrect} expired=${totalExpired} ` +
      `accuracy=${accuracy !== null ? (accuracy * 100).toFixed(1) + "%" : "n/a"} ` +
      `took=${totalDurationMs}ms`,
    );

    // ── Audit log ─────────────────────────────────────────────────
    try {
      await supabase.from("scheduled_job_runs").insert({
        organization_id: orgIds[0] ?? "system",
        job_name: "cron-rlvr",
        job_type: "rlvr_verification",
        started_at: new Date(Date.now() - totalDurationMs).toISOString(),
        completed_at: new Date().toISOString(),
        status: "success",
        result: JSON.stringify({
          orgsChecked: orgIds.length,
          predictionsVerified: totalVerified,
          totalCorrect,
          totalIncorrect,
          totalExpired,
          accuracy,
        }),
        duration_ms: totalDurationMs,
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({
      success: true,
      orgsChecked: orgIds.length,
      predictionsVerified: totalVerified,
      totalCorrect,
      totalIncorrect,
      totalExpired,
      accuracy,
      totalDurationMs,
      orgResults,
    });
  } catch (error: unknown) {
    logger.error("[CronRLVR] Fatal error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
