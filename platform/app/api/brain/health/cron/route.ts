export const dynamic = "force-dynamic";
/**
 * Brain Health Cron Endpoint
 *
 * GET /api/brain/health/cron
 *   Designed to be called by Vercel Cron, Supabase pg_cron, or external schedulers.
 *   Polls health for all active organizations and creates alerts for violations.
 *
 * Auth: Bearer CRON_SECRET (env variable) or service_role key.
 *
 * Schedule (vercel.json): every 5 minutes
 *
 * Flow:
 *   1. Authenticate via CRON_SECRET or service_role key
 *   2. Get all organizations with active connectors (proxy for "active usage")
 *   3. For each org: pollHealthOnce() from health-poller.ts
 *   4. Optionally trigger evolution cycle for orgs with degraded health
 *   5. Return summary: { orgs_checked, alerts_created, duration_ms }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { pollAllOrganizations } from "@/lib/health/health-poller";
import { logger } from "@/lib/logger";

// Vercel Cron sends this header automatically
const VERCEL_CRON_HEADER = "x-vercel-cron";

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ── Auth: Verify this is a legitimate cron call ──────────────────
    const isVercelCron = request.headers.get(VERCEL_CRON_HEADER) === "1";
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const isAuthorized =
      isVercelCron ||
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`);

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized. Provide CRON_SECRET or service_role key." },
        { status: 401 },
      );
    }

    // ── Get service client (bypasses RLS) ────────────────────────────
    const supabase = await createServiceClient();

    // ── Poll all active orgs ─────────────────────────────────────────
    const { results, totalDurationMs } = await pollAllOrganizations(supabase);

    const totalAlerts = results.reduce((sum, r) => sum + r.alertsCreated, 0);
    const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
    const degradedOrgs = results.filter((r) => r.snapshot.status === "degraded" || r.snapshot.status === "initializing");

    // ── Trigger evolution for degraded orgs (lightweight mode) ───────
    let evolutionTriggered = 0;
    if (degradedOrgs.length > 0) {
      for (const org of degradedOrgs) {
        try {
          // Trigger a lightweight brain cycle for degraded orgs
          // This runs L1-L15 to help the brain self-repair
          const internalUrl = new URL("/api/brain/cycle", request.nextUrl.origin);
          await fetch(internalUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-cron": "true",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              organizationId: org.organizationId,
              mode: "homeostasis",
            }),
          });
          evolutionTriggered++;
        } catch (err) {
          logger.error(`[HealthCron] Failed to trigger evolution for org ${org.organizationId}:`, err);
        }
      }
    }

    const response = {
      success: true,
      orgs_checked: results.length,
      alerts_created: totalAlerts,
      total_violations: totalViolations,
      degraded_orgs: degradedOrgs.length,
      evolution_triggered: evolutionTriggered,
      duration_ms: Date.now() - startTime,
      polling_duration_ms: totalDurationMs,
      timestamp: new Date().toISOString(),
      // Per-org summary (compact)
      orgs: results.map((r) => ({
        id: r.organizationId,
        score: r.snapshot.overall_score,
        status: r.snapshot.status,
        violations: r.violations.length,
        alerts: r.alertsCreated,
        ms: r.durationMs,
      })),
    };

    logger.warn(
      `[HealthCron] Completed: ${results.length} orgs, ${totalAlerts} alerts, ${degradedOrgs.length} degraded, ${Date.now() - startTime}ms`,
    );

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Health cron failed";
    logger.error("[HealthCron] Error:", error);
    return NextResponse.json(
      { error: message, duration_ms: Date.now() - startTime },
      { status: 500 },
    );
  }
}
