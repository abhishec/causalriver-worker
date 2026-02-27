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
import { applyGroundTruthSignals } from "@/lib/brain/ground-truth-validator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    // ── Security ──────────────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Fail closed: require CRON_SECRET in ALL environments
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = await createServiceClient();
    const { createClosedLoopLearningEngine } = await import("@nexus-ai/memory-stack");

    // ── Get all organizations with AI Workers ────────────────────
    const { data: orgs } = await service
      .from("organizations")
      .select("id, name, settings");

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ success: true, message: "No organizations found" });
    }

    const results: Array<{
      workerId: string;
      workerName: string;
      service: string;
      orgId: string;
      orgName: string;
      success: boolean;
      loops?: Record<string, unknown>;
      error?: string;
      durationMs: number;
    }> = [];

    logger.info(`[CronLearning] Starting AI Worker learning cycle for ${orgs.length} organizations`);

    for (const org of orgs) {
      const settings = (org as { settings?: { ai_workers?: Array<{ id: string; name: string; service: string; status: string }> } }).settings;
      const workers = settings?.ai_workers?.filter(w => w.status === "active") || [];

      if (workers.length === 0) {
        // No AI Workers — run org-level learning as fallback
        const start = Date.now();
        try {
          const engine = createClosedLoopLearningEngine({
            supabase: service,
            organizationId: org.id,
          });
          const cycleResult = await engine.runLearningCycle();
          // Fire-and-forget: apply objective ground-truth RL signals from connector outcomes
          void applyGroundTruthSignals(service, org.id);
          results.push({
            workerId: `org_${org.id}`,
            workerName: `${org.name} (org-level)`,
            service: "general",
            orgId: org.id, orgName: org.name,
            success: true,
            loops: cycleResult as unknown as Record<string, unknown>,
            durationMs: Date.now() - start,
          });
          logger.info(`[CronLearning] ${org.name} (org-level): learning cycle complete`);
        } catch (err) {
          results.push({
            workerId: `org_${org.id}`,
            workerName: `${org.name} (org-level)`,
            service: "general",
            orgId: org.id, orgName: org.name,
            success: false,
            error: "Learning cycle failed",
            durationMs: Date.now() - start,
          });
          logger.error(`[CronLearning] ${org.name} (org-level) failed:`, err);
        }
        continue;
      }

      // Run learning ONCE per org (engine is org-scoped), then log per-worker
      const orgStart = Date.now();
      try {
        const engine = createClosedLoopLearningEngine({
          supabase: service,
          organizationId: org.id,
        });
        const cycleResult = await engine.runLearningCycle();
        // Fire-and-forget: apply objective ground-truth RL signals from connector outcomes
        void applyGroundTruthSignals(service, org.id);
        const orgDurationMs = Date.now() - orgStart;
        for (const worker of workers) {
          results.push({
            workerId: worker.id,
            workerName: worker.name,
            service: worker.service,
            orgId: org.id, orgName: org.name,
            success: true,
            loops: cycleResult as unknown as Record<string, unknown>,
            durationMs: orgDurationMs,
          });
        }
        logger.info(`[CronLearning] ${org.name}: learning cycle complete for ${workers.length} workers (${orgDurationMs}ms)`);
      } catch (err) {
        const orgDurationMs = Date.now() - orgStart;
        for (const worker of workers) {
          results.push({
            workerId: worker.id,
            workerName: worker.name,
            service: worker.service,
            orgId: org.id, orgName: org.name,
            success: false,
            error: "Learning cycle failed",
            durationMs: orgDurationMs,
          });
        }
        logger.error(`[CronLearning] ${org.name} workers failed:`, err);
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
    const totalWorkers = results.length;

    // Log run
    try {
      await service.from("scheduled_job_runs").insert({
        organization_id: orgs[0]?.id || "system",
        job_name: "cron-learning-cycle",
        job_type: "learning_cycle",
        started_at: new Date(Date.now() - totalMs).toISOString(),
        completed_at: new Date().toISOString(),
        status: failed > 0 ? "partial" : "success",
        result: JSON.stringify({ totalWorkers, succeeded, failed }),
        duration_ms: totalMs,
      });
    } catch { /* non-fatal */ }

    logger.info(
      `[CronLearning] Complete: ${succeeded}/${totalWorkers} AI Workers succeeded, ${failed} failed, ${totalMs}ms total`
    );

    return NextResponse.json({
      success: true,
      summary: { totalOrgs: orgs.length, totalWorkers, succeeded, failed, totalDurationMs: totalMs },
      results,
    });
  } catch (error: unknown) {
    logger.error("[CronLearning] Fatal error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
