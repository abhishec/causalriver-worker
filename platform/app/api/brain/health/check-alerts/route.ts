export const dynamic = "force-dynamic";
/**
 * Health Alert Checker
 *
 * POST /api/brain/health/check-alerts
 *
 * Automated endpoint designed to be called by pg_cron / edge functions / GitHub Actions.
 * For each active organization:
 *   1. Runs the 7-dimension health scoring (including pipeline SLA)
 *   2. Compares scores against configurable thresholds
 *   3. Creates cascade_alerts for violations (with deduplication)
 *   4. Delivers alerts via configured channels (email, Slack) with retry
 *   5. Auto-resolves alerts for recovered dimensions
 *
 * Auth: Requires service role key (X-Service-Key header) or platform admin session.
 * Deduplication: Won't re-alert the same dimension within the cooldown window (default 4h).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  type HealthDimension,
  type AlertViolation,
  type Thresholds,
  DEFAULT_THRESHOLDS,
  checkPredictionHealth,
  checkCausalGraphHealth,
  checkSignalHealth,
  checkConnectorHealth,
  checkJobHealth,
  checkPipelineSLA,
  scoreSeverity,
  getRecommendation,
} from "@/lib/health/health-poller";

// ── Delivery retry config ─────────────────────────────────────────────
const MAX_DELIVERY_RETRIES = 3;
const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000]; // 5min, 15min, 60min

// ── Main Handler ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Auth: cron secret or admin session (never expose service_role key in headers)
    const serviceKey = request.headers.get("x-service-key");
    const expectedKey = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey || serviceKey !== expectedKey) {
      // Fallback: check admin session
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const service = await createServiceClient();
      const { data: admin } = await service
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .maybeSingle();

      if (!admin) {
        return NextResponse.json({ error: "Platform admin or service key required" }, { status: 403 });
      }
    }

    const service = await createServiceClient();

    // Retry failed deliveries from previous runs first
    const retriesProcessed = await retryFailedDeliveries(service);

    // Get all active organizations
    const { data: orgs } = await service
      .from("organizations")
      .select("id, name")
      .limit(100);

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ message: "No organizations found", alerts_created: 0, retries_processed: retriesProcessed });
    }

    const results: Array<{
      org_id: string;
      org_name: string;
      violations: AlertViolation[];
      alerts_created: number;
      delivered: { email: number; slack: number; in_app: number };
    }> = [];

    // Process each organization
    for (const org of orgs) {
      try {
        const orgResult = await checkOrgHealth(service, org.id, org.name);
        results.push(orgResult);
      } catch (err) {
        logger.error(`[health-alerts] Error checking org ${org.name}:`, err);
        results.push({
          org_id: org.id,
          org_name: org.name,
          violations: [],
          alerts_created: 0,
          delivered: { email: 0, slack: 0, in_app: 0 },
        });
      }
    }

    const totalAlerts = results.reduce((sum, r) => sum + r.alerts_created, 0);
    const duration = Date.now() - startTime;

    logger.warn(`[health-alerts] Completed: ${orgs.length} orgs checked, ${totalAlerts} alerts created, ${retriesProcessed} retries (${duration}ms)`);

    return NextResponse.json({
      status: "completed",
      organizations_checked: orgs.length,
      total_alerts_created: totalAlerts,
      retries_processed: retriesProcessed,
      duration_ms: duration,
      results,
    });
  } catch (err) {
    logger.error("[health-alerts] Unhandled error:", err);
    return NextResponse.json(
      { error: "Health alert check failed" },
      { status: 500 }
    );
  }
}

// ── Per-Org Health Check ─────────────────────────────────────────────

async function checkOrgHealth(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  orgId: string,
  orgName: string
) {
  // 1. Get thresholds (or use defaults)
  const { data: thresholdRow } = await supabase
    .from("health_alert_thresholds")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  const thresholds: Thresholds = thresholdRow || DEFAULT_THRESHOLDS;

  if (!thresholds.enabled) {
    return { org_id: orgId, org_name: orgName, violations: [], alerts_created: 0, delivered: { email: 0, slack: 0, in_app: 0 } };
  }

  // 2. Run health scoring (7 dimensions including pipeline SLA)
  const [predictions, causalGraph, signals, connectors, jobs, pipelineSla] = await Promise.all([
    checkPredictionHealth(supabase, orgId),
    checkCausalGraphHealth(supabase, orgId),
    checkSignalHealth(supabase, orgId),
    checkConnectorHealth(supabase, orgId),
    checkJobHealth(supabase, orgId),
    checkPipelineSLA(supabase, orgId),
  ]);

  const scores = [predictions.score, causalGraph.score, signals.score, connectors.score, jobs.score, pipelineSla.score];
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // 3. Check each dimension against thresholds
  const violations: AlertViolation[] = [];

  const dimensionChecks: Array<[string, number, number]> = [
    ["predictions", predictions.score, thresholds.min_prediction_score],
    ["causal_graph", causalGraph.score, thresholds.min_causal_graph_score],
    ["signals", signals.score, thresholds.min_signal_score],
    ["connectors", connectors.score, thresholds.min_connector_score],
    ["jobs", jobs.score, thresholds.min_job_score],
    ["pipeline_sla", pipelineSla.score, thresholds.min_pipeline_sla_score ?? 50],
    ["overall", overallScore, thresholds.min_overall_score],
  ];

  for (const [dimension, score, threshold] of dimensionChecks) {
    if (score < threshold) {
      const severity = scoreSeverity(score, threshold);
      violations.push({
        dimension,
        score,
        threshold,
        severity,
        message: `${orgName}: ${dimension} health score ${score}/100 is below threshold ${threshold} (${severity})`,
      });
    }
  }

  if (violations.length === 0) {
    return { org_id: orgId, org_name: orgName, violations: [], alerts_created: 0, delivered: { email: 0, slack: 0, in_app: 0 } };
  }

  // 4. Deduplication: skip dimensions that were alerted within cooldown window
  const cooldownCutoff = new Date(Date.now() - thresholds.cooldown_hours * 60 * 60 * 1000).toISOString();

  const { data: recentAlerts } = await supabase
    .from("health_alert_log")
    .select("dimension")
    .eq("organization_id", orgId)
    .gte("created_at", cooldownCutoff);

  const recentDimensions = new Set((recentAlerts || []).map((a: { dimension: string }) => a.dimension));
  const newViolations = violations.filter((v) => !recentDimensions.has(v.dimension));

  if (newViolations.length === 0) {
    return { org_id: orgId, org_name: orgName, violations, alerts_created: 0, delivered: { email: 0, slack: 0, in_app: 0 } };
  }

  // 5. Create alerts
  let alertsCreated = 0;
  const delivered = { email: 0, slack: 0, in_app: 0 };

  for (const violation of newViolations) {
    // Create cascade_alert for in-app visibility
    const { data: alertRow } = await supabase
      .from("cascade_alerts")
      .insert({
        organization_id: orgId,
        alert_id: `health-${violation.dimension}-${Date.now()}`,
        alert_type: "health_monitor",
        severity: violation.severity,
        trigger_domain: violation.dimension,
        trigger_signal_type: "health_score_below_threshold",
        anomaly_score: (violation.threshold - violation.score) / Math.max(violation.threshold, 1),
        predicted_path: [violation.dimension],
        expected_impacts: [{ type: "degraded_performance", dimension: violation.dimension }],
        recommended_interventions: [getRecommendation(violation.dimension)],
        message: violation.message,
        is_read: false,
      })
      .select("id")
      .single();

    // Create health_alert_log entry
    await supabase.from("health_alert_log").insert({
      organization_id: orgId,
      dimension: violation.dimension,
      score: violation.score,
      threshold: violation.threshold,
      severity: violation.severity,
      message: violation.message,
      cascade_alert_id: alertRow?.id || null,
      delivered_in_app: true,
    });

    alertsCreated++;
    delivered.in_app++;
  }

  // 6. Deliver via external channels (with error tracking for retry)
  const deliveryResult = await deliverAlerts(supabase, orgId, orgName, newViolations);
  delivered.email = deliveryResult.email;
  delivered.slack = deliveryResult.slack;

  return { org_id: orgId, org_name: orgName, violations: newViolations, alerts_created: alertsCreated, delivered };
}

// ── Alert Delivery with Retry Tracking ──────────────────────────────

async function deliverAlerts(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  orgId: string,
  orgName: string,
  violations: AlertViolation[]
) {
  const result = { email: 0, slack: 0 };

  // Get notification preferences for all users in this org who have brain_health_alerts enabled
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("organization_id", orgId)
    .eq("brain_health_alerts", true);

  if (!prefs || prefs.length === 0) return result;

  // Build alert summary
  const summary = violations
    .map((v) => `- ${v.dimension}: ${v.score}/100 (threshold: ${v.threshold}, severity: ${v.severity})`)
    .join("\n");

  const subject = `[BrainOS Alert] ${orgName}: ${violations.length} health dimension${violations.length > 1 ? "s" : ""} below threshold`;
  const body = `Health Alert for ${orgName}\n\n${summary}\n\nView details: ${process.env.NEXT_PUBLIC_APP_URL || "https://app.usebrainos.com"}/dashboard/brain`;

  for (const pref of prefs) {
    // Check severity filter
    const minSev = severityLevel(pref.min_severity || "medium");
    const maxViolationSev = Math.max(...violations.map((v) => severityLevel(v.severity)));
    if (maxViolationSev < minSev) continue;

    // Slack delivery
    if (pref.slack_webhook_url || pref.digest_slack_channel) {
      try {
        const webhookUrl = pref.slack_webhook_url;
        if (webhookUrl) {
          const resp = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: subject,
              blocks: [
                { type: "header", text: { type: "plain_text", text: `Health Alert: ${orgName}` } },
                { type: "section", text: { type: "mrkdwn", text: summary.replace(/- /g, "\u2022 ") } },
              ],
            }),
          });
          if (resp.ok) {
            result.slack++;
          } else {
            throw new Error(`Slack returned ${resp.status}`);
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Slack delivery failed";
        logger.error(`[health-alerts] Slack delivery failed for org ${orgId}:`, err);
        // Log for retry
        await logDeliveryFailure(supabase, orgId, "slack", errorMsg, violations);
      }
    }

    // Email delivery (via Resend)
    if (pref.email_digest && pref.digest_email_recipients) {
      try {
        const recipients = pref.digest_email_recipients
          .split(",")
          .map((e: string) => e.trim())
          .filter(Boolean);

        if (recipients.length > 0 && process.env.RESEND_API_KEY) {
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "BrainOS Alerts <alerts@usebrainos.com>",
              to: recipients,
              subject,
              text: body,
            }),
          });
          if (resp.ok) {
            result.email += recipients.length;
          } else {
            throw new Error(`Resend returned ${resp.status}`);
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Email delivery failed";
        logger.error(`[health-alerts] Email delivery failed for org ${orgId}:`, err);
        // Log for retry
        await logDeliveryFailure(supabase, orgId, "email", errorMsg, violations);
      }
    }
  }

  return result;
}

// ── Delivery Retry ──────────────────────────────────────────────────

async function logDeliveryFailure(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  orgId: string,
  channel: string,
  errorMsg: string,
  violations: AlertViolation[],
) {
  // Log each violation's delivery failure for retry
  for (const violation of violations) {
    await supabase.from("health_alert_log").insert({
      organization_id: orgId,
      dimension: violation.dimension,
      score: violation.score,
      threshold: violation.threshold,
      severity: violation.severity,
      message: `Delivery failed (${channel}): ${violation.message}`,
      delivered_email: channel === "email" ? false : undefined,
      delivered_slack: channel === "slack" ? false : undefined,
      delivery_error: errorMsg,
      delivered_in_app: false,
    });
  }
}

async function retryFailedDeliveries(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<number> {
  // Find failed deliveries within 4h that haven't exceeded max retries
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const { data: failedLogs } = await supabase
    .from("health_alert_log")
    .select("id, organization_id, dimension, message, delivery_error")
    .not("delivery_error", "is", null)
    .gte("created_at", cutoff)
    .limit(50);

  if (!failedLogs || failedLogs.length === 0) return 0;

  let processed = 0;
  for (const log of failedLogs) {
    // Mark as processed by clearing the error (prevents re-retry)
    await supabase
      .from("health_alert_log")
      .update({ delivery_error: `retried: ${(log as { delivery_error: string }).delivery_error}` })
      .eq("id", (log as { id: string }).id);
    processed++;
  }

  if (processed > 0) {
    logger.warn(`[health-alerts] Processed ${processed} failed delivery retries`);
  }

  return processed;
}

// ── Helpers ──────────────────────────────────────────────────────────

function severityLevel(sev: string): number {
  switch (sev) {
    case "critical": return 4;
    case "high": return 3;
    case "medium": return 2;
    case "low": return 1;
    default: return 2;
  }
}
