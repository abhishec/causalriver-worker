/**
 * Cron: Autonomous Monitoring Reactions
 * ======================================
 *
 * GET /api/cron/autonomous-monitor
 *
 * Runs every 15 minutes. Watches signal thresholds across all active orgs and
 * fires proactive agents + Slack notifications when thresholds are crossed.
 *
 * This is what makes BrainOS act like a colleague, not a tool.
 * The brain watches. The brain reacts. No one had to ask.
 *
 * Threshold rules:
 *   - flight_risk_score > 70  : critical: queue early-warning agent + Slack
 *   - flight_risk_score > 50  : warning: queue early-warning agent
 *   - health_score < 40       : critical: queue delivery-intelligence agent + Slack
 *   - health_score < 60       : warning: queue delivery-intelligence agent
 *   - scope_creep_alerts (new, unacknowledged, last 24h) : queue scope-creep agent + Slack
 *   - cross_domain_signals > 50/hour : info: queue brain consolidation
 *
 * Deduplication: each alert type per entity is suppressed for 6 hours (ai_memory marker).
 * Slack: uses org_connectors webhook if configured for the org.
 *
 * Security: Protected by Bearer CRON_SECRET header.
 * Schedule: Every 15 minutes (see vercel.json crons config)
 *
 * Which orgs get monitored?
 *   Orgs with any of: engineer_health_snapshots, engagement_health_scores,
 *   scope_creep_alerts, or cross_domain_signals in the last 7 days.
 *   Max 10 orgs per run to stay within Lambda timeout.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  runAutonomousMonitoring,
  type MonitoringResult,
} from "@/lib/brain/autonomous-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — 10 orgs × ~30s each

const MAX_ORGS_PER_RUN = 10;
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    const service = await createServiceClient();

    // ── Find active orgs to monitor ───────────────────────────────────────
    // Use cross_domain_signals as a proxy for "org has active data".
    // This avoids scanning every org in the system.
    const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();

    const { data: activeOrgRows, error: orgError } = await service
      .from("cross_domain_signals")
      .select("organization_id")
      .gte("created_at", since)
      .limit(MAX_ORGS_PER_RUN * 10); // over-fetch to deduplicate

    if (orgError) {
      logger.error("[CronAutonomousMonitor] Failed to fetch active orgs:", orgError);
      return NextResponse.json({ error: "Failed to fetch active orgs" }, { status: 500 });
    }

    // Deduplicate org IDs and cap at MAX_ORGS_PER_RUN
    const seenOrgIds = new Set<string>();
    const activeOrgIds: string[] = [];

    for (const row of activeOrgRows ?? []) {
      if (!seenOrgIds.has(row.organization_id) && activeOrgIds.length < MAX_ORGS_PER_RUN) {
        seenOrgIds.add(row.organization_id);
        activeOrgIds.push(row.organization_id);
      }
    }

    if (activeOrgIds.length === 0) {
      logger.warn("[CronAutonomousMonitor] No active orgs found — skipping monitor run");
      return NextResponse.json({
        ok: true,
        orgsProcessed: 0,
        totalAlerts: 0,
        totalAgentsQueued: 0,
        totalNotificationsSent: 0,
        message: "No active orgs",
        durationMs: Date.now() - startMs,
      });
    }

    logger.warn(
      `[CronAutonomousMonitor] Monitoring ${activeOrgIds.length} active orgs`
    );

    // ── Run monitoring for each org ────────────────────────────────────────
    const orgResults: Array<{
      orgId: string;
      result: MonitoringResult;
      durationMs: number;
    }> = [];

    let totalAlerts = 0;
    let totalAgentsQueued = 0;
    let totalNotificationsSent = 0;
    const allErrors: string[] = [];

    for (const orgId of activeOrgIds) {
      const orgStart = Date.now();

      try {
        const result = await runAutonomousMonitoring(service, orgId);
        const orgDuration = Date.now() - orgStart;

        orgResults.push({ orgId, result, durationMs: orgDuration });

        totalAlerts += result.alertsDetected;
        totalAgentsQueued += result.agentsQueued;
        totalNotificationsSent += result.notificationsSent;
        allErrors.push(...result.errors.map((e) => `[org:${orgId}] ${e}`));

        if (result.alertsDetected > 0) {
          logger.warn(
            `[CronAutonomousMonitor] org=${orgId}: ` +
              `alerts=${result.alertsDetected}, ` +
              `agents=${result.agentsQueued}, ` +
              `notifications=${result.notificationsSent}, ` +
              `errors=${result.errors.length}, ` +
              `dur=${orgDuration}ms`
          );
        }
      } catch (err) {
        const msg = `org=${orgId} threw: ${String(err)}`;
        logger.error(`[CronAutonomousMonitor] ${msg}`);
        allErrors.push(msg);
        orgResults.push({
          orgId,
          result: { alertsDetected: 0, agentsQueued: 0, notificationsSent: 0, errors: [msg] },
          durationMs: Date.now() - orgStart,
        });
      }
    }

    const totalDuration = Date.now() - startMs;

    logger.warn(
      `[CronAutonomousMonitor] Complete — ` +
        `orgs=${activeOrgIds.length}, ` +
        `alerts=${totalAlerts}, ` +
        `agents=${totalAgentsQueued}, ` +
        `notifications=${totalNotificationsSent}, ` +
        `errors=${allErrors.length}, ` +
        `dur=${totalDuration}ms`
    );

    return NextResponse.json({
      ok: true,
      orgsProcessed: activeOrgIds.length,
      totalAlerts,
      totalAgentsQueued,
      totalNotificationsSent,
      errors: allErrors.length > 0 ? allErrors : undefined,
      durationMs: totalDuration,
      orgBreakdown: orgResults.map(({ orgId, result, durationMs }) => ({
        orgId,
        alertsDetected: result.alertsDetected,
        agentsQueued: result.agentsQueued,
        notificationsSent: result.notificationsSent,
        errorCount: result.errors.length,
        durationMs,
      })),
    });
  } catch (err) {
    const totalDuration = Date.now() - startMs;
    logger.error("[CronAutonomousMonitor] Unexpected error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        durationMs: totalDuration,
      },
      { status: 500 }
    );
  }
}
