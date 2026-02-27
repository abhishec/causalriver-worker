/**
 * POST /api/brain/rlvr
 *
 * Ground-Truth RL Verification — confidence calibration sweep.
 *
 * Compares prediction_records confidence scores against actual outcome
 * signals in cross_domain_signals, computes calibration error per domain,
 * and stores results in ai_memory for the brain's next planning cycle.
 *
 * Auth: Bearer CRON_SECRET (same as all other cron-compatible routes).
 *
 * Called by: brain-refresh.yml daily at 3 AM UTC (rlvr entry).
 * Also callable manually for on-demand calibration checks.
 *
 * Body: { organizationId?: string }
 *   - If omitted, runs across ALL active orgs.
 *   - If provided, runs for that single org only.
 *
 * Returns: { success, orgsProcessed, results: RLVRResult[] }
 */

import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { runRLVR } from "@/lib/brain/rlvr";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — handles multi-org sweeps

export async function POST(request: NextRequest) {
  try {
    // ── Auth: CRON_SECRET ──────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServiceClient();
    const runStart = Date.now();

    // ── Parse body ────────────────────────────────────────────────
    let body: { organizationId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // empty body is fine — runs for all orgs
    }

    let orgIds: string[] = [];

    if (body.organizationId) {
      // Single org run
      orgIds = [body.organizationId];
    } else {
      // Discover all active orgs: orgs with any prediction_records in last 48h
      const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: activeOrgs, error: orgErr } = await supabase
        .from("prediction_records")
        .select("organization_id")
        .eq("prediction_type", "agent_task_outcome")
        .gte("created_at", since48h);

      if (orgErr) {
        logger.warn("[rlvr-route] Failed to discover active orgs:", orgErr.message);
        return NextResponse.json({ error: "Failed to discover orgs" }, { status: 500 });
      }

      orgIds = [...new Set(
        (activeOrgs ?? []).map(r => r.organization_id).filter(Boolean)
      )];
    }

    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active orgs with recent predictions",
        orgsProcessed: 0,
        results: [],
        durationMs: Date.now() - runStart,
      });
    }

    logger.warn(`[rlvr-route] Running RLVR calibration for ${orgIds.length} org(s)`);

    // ── Run RLVR for each org ──────────────────────────────────────
    const results = await Promise.all(
      orgIds.map(async (orgId) => {
        try {
          const result = await runRLVR(supabase, orgId);
          return { orgId: orgId.slice(0, 8), ...result };
        } catch (err) {
          logger.warn(`[rlvr-route] runRLVR threw for org=${orgId.slice(0, 8)}:`, err);
          return {
            orgId: orgId.slice(0, 8),
            totalEvaluated: 0,
            avgCalibrationError: 0,
            domainsImproved: [],
            byDomain: [],
            ranAt: new Date().toISOString(),
          };
        }
      })
    );

    const durationMs = Date.now() - runStart;

    // ── Audit log (non-fatal) ──────────────────────────────────────
    try {
      const totalEvaluated = results.reduce((sum, r) => sum + r.totalEvaluated, 0);
      const avgError = results.length > 0
        ? results.reduce((sum, r) => sum + r.avgCalibrationError, 0) / results.length
        : 0;

      await supabase.from("scheduled_job_runs").insert({
        organization_id: orgIds[0] ?? "system",
        job_name: "brain-rlvr",
        job_type: "rlvr_calibration",
        started_at: new Date(Date.now() - durationMs).toISOString(),
        completed_at: new Date().toISOString(),
        status: "success",
        result: JSON.stringify({
          orgsProcessed: orgIds.length,
          totalEvaluated,
          avgCalibrationError: Math.round(avgError * 10000) / 10000,
        }),
        duration_ms: durationMs,
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({
      success: true,
      orgsProcessed: orgIds.length,
      results,
      durationMs,
    });
  } catch (error: unknown) {
    logger.error("[rlvr-route] Fatal error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
