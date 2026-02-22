/**
 * Cron: Brain Evolution Cycle
 * ===========================
 *
 * GET /api/cron/evolution
 *   Runs the brain evolution cycle for ALL active organizations.
 *   This is the heartbeat that makes the Brain get smarter over time.
 *
 * Triggered by:
 *   - Vercel Cron (vercel.json: every 6 hours)
 *   - External scheduler (e.g., crontab, GitHub Actions)
 *   - Manual trigger via admin panel
 *
 * What it does per org:
 *   1. Verifies pending predictions against real outcomes
 *   2. Updates causal edge weights via Bayesian learning
 *   3. Computes accuracy & calibration metrics
 *   4. Computes intelligence score
 *   5. Saves evolution snapshot (timeline)
 *   6. Emits RL signals for meta-learning
 *
 * Security: Protected by CRON_SECRET header (Vercel Cron injects this).
 */

import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for all orgs

export async function GET(request: NextRequest) {
  try {
    // ── Security: Verify cron secret ──────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // In production, require CRON_SECRET. In dev, allow unrestricted.
    if (process.env.NODE_ENV === "production" && cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const service = await createServiceClient();

    // ── Get all active organizations ────────────────────────────
    const { data: orgs, error: orgError } = await service
      .from("organizations")
      .select("id, name")
      .eq("is_active", true);

    if (orgError) {
      // Fallback: try without is_active filter (column might not exist)
      const { data: allOrgs, error: allError } = await service
        .from("organizations")
        .select("id, name");

      if (allError) {
        logger.error("[CronEvolution] Failed to fetch orgs:", allError);
        return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
      }

      return await runEvolutionForOrgs(service, allOrgs || []);
    }

    return await runEvolutionForOrgs(service, orgs || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[CronEvolution] Fatal error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runEvolutionForOrgs(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  orgs: Array<{ id: string; name: string }>
) {
  const { runBrainEvolutionCycle } = await import("@nexus-ai/memory-stack");

  const results: Array<{
    orgId: string;
    orgName: string;
    success: boolean;
    intelligenceScore?: number;
    accuracy?: number;
    error?: string;
    durationMs: number;
  }> = [];

  logger.info(`[CronEvolution] Starting evolution cycle for ${orgs.length} organizations`);

  for (const org of orgs) {
    const start = Date.now();
    try {
      const state = await runBrainEvolutionCycle(service, org.id, "full");
      results.push({
        orgId: org.id,
        orgName: org.name,
        success: true,
        intelligenceScore: state.intelligenceScore,
        accuracy: Math.round(state.accuracy.overall * 100),
        durationMs: Date.now() - start,
      });

      logger.info(
        `[CronEvolution] ${org.name}: score=${state.intelligenceScore}, accuracy=${Math.round(state.accuracy.overall * 100)}%`
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({
        orgId: org.id,
        orgName: org.name,
        success: false,
        error: errMsg,
        durationMs: Date.now() - start,
      });
      logger.error(`[CronEvolution] ${org.name} failed:`, err);
    }
  }

  // ── Log summary ─────────────────────────────────────────────
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  // Save cron run to scheduled_job_runs
  try {
    await service.from("scheduled_job_runs").insert({
      organization_id: orgs[0]?.id || "system",
      job_name: "cron-evolution-cycle",
      job_type: "evolution_cycle",
      started_at: new Date(Date.now() - totalMs).toISOString(),
      completed_at: new Date().toISOString(),
      status: failed > 0 ? "partial" : "success",
      result: JSON.stringify({ succeeded, failed, results }),
      duration_ms: totalMs,
    });
  } catch {
    // Non-fatal: logging failure shouldn't break the cron
  }

  logger.info(
    `[CronEvolution] Complete: ${succeeded}/${orgs.length} succeeded, ${failed} failed, ${totalMs}ms total`
  );

  return NextResponse.json({
    success: true,
    summary: {
      totalOrgs: orgs.length,
      succeeded,
      failed,
      totalDurationMs: totalMs,
    },
    results,
  });
}
