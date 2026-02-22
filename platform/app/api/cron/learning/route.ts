/**
 * Cron: Closed-Loop Learning Cycle
 * =================================
 *
 * GET /api/cron/learning
 *   Runs the closed-loop learning cycle for ALL active organizations.
 *   This is the fast feedback loop that processes user feedback,
 *   verifies predictions, and updates weights.
 *
 * Frequency: Every 4 hours (matches DMN schedule from training page).
 *
 * The 7 learning loops:
 *   Loop 1: Prediction Verification (auto-verify against outcomes)
 *   Loop 1B: Embodied Grounding (outcome → RL reward)
 *   Loop 2: Causal Weight Updates (Bayesian posterior)
 *   Loop 3: User Feedback Processing (drain brain_feedback_queue)
 *   Loop 4: Intervention Outcome Tracking
 *   Loop 5: Auto-Retraining (generate training packs)
 *   Loop 6: Agent Outcome Learning
 *   Loop 7: Federation Validation (CORE vs ORG)
 */

import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    // ── Security ──────────────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV === "production" && cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const service = await createServiceClient();
    const { createClosedLoopLearningEngine } = await import("@nexus-ai/memory-stack");

    // ── Get all organizations ────────────────────────────────────
    const { data: orgs } = await service
      .from("organizations")
      .select("id, name");

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ success: true, message: "No organizations found" });
    }

    const results: Array<{
      orgId: string;
      orgName: string;
      success: boolean;
      loops?: Record<string, unknown>;
      error?: string;
      durationMs: number;
    }> = [];

    logger.info(`[CronLearning] Starting learning cycle for ${orgs.length} organizations`);

    for (const org of orgs) {
      const start = Date.now();
      try {
        const engine = createClosedLoopLearningEngine({
          supabase: service,
          organizationId: org.id,
        });

        const cycleResult = await engine.runLearningCycle();

        results.push({
          orgId: org.id,
          orgName: org.name,
          success: true,
          loops: cycleResult as unknown as Record<string, unknown>,
          durationMs: Date.now() - start,
        });

        logger.info(`[CronLearning] ${org.name}: learning cycle complete`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({
          orgId: org.id,
          orgName: org.name,
          success: false,
          error: errMsg,
          durationMs: Date.now() - start,
        });
        logger.error(`[CronLearning] ${org.name} failed:`, err);
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

    // Log run
    try {
      await service.from("scheduled_job_runs").insert({
        organization_id: orgs[0]?.id || "system",
        job_name: "cron-learning-cycle",
        job_type: "learning_cycle",
        started_at: new Date(Date.now() - totalMs).toISOString(),
        completed_at: new Date().toISOString(),
        status: failed > 0 ? "partial" : "success",
        result: JSON.stringify({ succeeded, failed }),
        duration_ms: totalMs,
      });
    } catch { /* non-fatal */ }

    logger.info(
      `[CronLearning] Complete: ${succeeded}/${orgs.length} succeeded, ${totalMs}ms total`
    );

    return NextResponse.json({
      success: true,
      summary: { totalOrgs: orgs.length, succeeded, failed, totalDurationMs: totalMs },
      results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[CronLearning] Fatal error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
