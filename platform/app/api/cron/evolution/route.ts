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

    // In production, require CRON_SECRET. Fail closed if not set.
    if (process.env.NODE_ENV === "production") {
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
    logger.error("[CronEvolution] Fatal error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function runEvolutionForOrgs(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  orgs: Array<{ id: string; name: string }>
) {
  const { runBrainEvolutionCycle } = await import("@nexus-ai/memory-stack");
  const { getDomainsForService } = await import("@/lib/ai-worker-domains");

  interface WorkerResult {
    workerId: string;
    workerName: string;
    service: string;
    orgId: string;
    orgName: string;
    success: boolean;
    intelligenceScore?: number;
    accuracy?: number;
    error?: string;
    durationMs: number;
  }

  const results: WorkerResult[] = [];

  // Load AI Workers from org settings
  const { data: orgSettings } = await service
    .from("organizations")
    .select("id, name, settings")
    .in("id", orgs.map(o => o.id));

  const orgMap = new Map(orgs.map(o => [o.id, o.name]));

  logger.info(`[CronEvolution] Starting AI Worker evolution cycle for ${orgs.length} organizations`);

  for (const org of (orgSettings || orgs)) {
    const orgId = org.id;
    const orgName = org.name || orgMap.get(orgId) || orgId;
    const settings = (org as { settings?: { ai_workers?: Array<{ id: string; name: string; service: string; status: string }> } }).settings;
    const workers = settings?.ai_workers?.filter(w => w.status === "active") || [];

    if (workers.length === 0) {
      // No AI Workers configured — run org-level evolution as fallback
      const start = Date.now();
      try {
        const state = await runBrainEvolutionCycle(service, orgId, "full");
        results.push({
          workerId: `org_${orgId}`,
          workerName: `${orgName} (org-level)`,
          service: "general",
          orgId, orgName,
          success: true,
          intelligenceScore: state.intelligenceScore,
          accuracy: Math.round(state.accuracy.overall * 100),
          durationMs: Date.now() - start,
        });
        logger.info(`[CronEvolution] ${orgName} (org-level): score=${state.intelligenceScore}`);
      } catch (err) {
        results.push({
          workerId: `org_${orgId}`,
          workerName: `${orgName} (org-level)`,
          service: "general",
          orgId, orgName,
          success: false,
          error: "Evolution cycle failed",
          durationMs: Date.now() - start,
        });
      }
      continue;
    }

    // Run evolution PER AI WORKER — each worker gets domain-scoped brain
    for (const worker of workers) {
      const start = Date.now();
      try {
        // Run full evolution cycle (computes all domains)
        const state = await runBrainEvolutionCycle(service, orgId, "full");

        // Filter to this worker's domain for per-worker intelligence
        let workerAccuracy = state.accuracy.overall;
        let workerScore = state.intelligenceScore;

        if (worker.service !== "general") {
          const domains = getDomainsForService(worker.service);
          if (domains.length > 0 && state.accuracy?.byDomain) {
            const domainAccuracies = Object.entries(state.accuracy.byDomain)
              .filter(([d]) => domains.some(prefix => d.startsWith(prefix)));

            if (domainAccuracies.length > 0) {
              const totalPreds = domainAccuracies.reduce((s, [, v]) => s + (v as { totalPredictions: number }).totalPredictions, 0);
              const correctPreds = domainAccuracies.reduce((s, [, v]) => s + (v as { correctPredictions: number }).correctPredictions, 0);
              workerAccuracy = totalPreds > 0 ? correctPreds / totalPreds : 0;
            }
          }
        }

        results.push({
          workerId: worker.id,
          workerName: worker.name,
          service: worker.service,
          orgId, orgName,
          success: true,
          intelligenceScore: workerScore,
          accuracy: Math.round(workerAccuracy * 100),
          durationMs: Date.now() - start,
        });

        logger.info(
          `[CronEvolution] AI Worker "${worker.name}" (${worker.service}@${orgName}): score=${workerScore}, accuracy=${Math.round(workerAccuracy * 100)}%`
        );
      } catch (err) {
        results.push({
          workerId: worker.id,
          workerName: worker.name,
          service: worker.service,
          orgId, orgName,
          success: false,
          error: "Worker evolution failed",
          durationMs: Date.now() - start,
        });
        logger.error(`[CronEvolution] AI Worker "${worker.name}" failed:`, err);
      }
    }
  }

  // ── Log summary ─────────────────────────────────────────────
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const totalWorkers = results.length;

  // Save cron run to scheduled_job_runs
  try {
    await service.from("scheduled_job_runs").insert({
      organization_id: orgs[0]?.id || "system",
      job_name: "cron-evolution-cycle",
      job_type: "evolution_cycle",
      started_at: new Date(Date.now() - totalMs).toISOString(),
      completed_at: new Date().toISOString(),
      status: failed > 0 ? "partial" : "success",
      result: JSON.stringify({ totalWorkers, succeeded, failed, results }),
      duration_ms: totalMs,
    });
  } catch {
    // Non-fatal: logging failure shouldn't break the cron
  }

  logger.info(
    `[CronEvolution] Complete: ${succeeded}/${totalWorkers} AI Workers succeeded, ${failed} failed, ${totalMs}ms total`
  );

  return NextResponse.json({
    success: true,
    summary: {
      totalOrgs: orgs.length,
      totalWorkers,
      succeeded,
      failed,
      totalDurationMs: totalMs,
    },
    results,
  });
}
