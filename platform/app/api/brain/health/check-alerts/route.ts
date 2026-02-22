/**
 * Health Alert Checker
 *
 * POST /api/brain/health/check-alerts
 *
 * Automated endpoint designed to be called by pg_cron / edge functions / GitHub Actions.
 * For each active organization:
 *   1. Runs the 6-dimension health scoring
 *   2. Compares scores against configurable thresholds
 *   3. Creates cascade_alerts for violations (with deduplication)
 *   4. Delivers alerts via configured channels (email, Slack)
 *
 * Auth: Requires service role key (X-Service-Key header) or platform admin session.
 * Deduplication: Won't re-alert the same dimension within the cooldown window (default 4h).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────

interface HealthDimension {
  score: number;
  status: string;
  details: Record<string, unknown>;
}

interface Thresholds {
  min_prediction_score: number;
  min_causal_graph_score: number;
  min_signal_score: number;
  min_connector_score: number;
  min_job_score: number;
  min_overall_score: number;
  cooldown_hours: number;
  enabled: boolean;
}

interface AlertViolation {
  dimension: string;
  score: number;
  threshold: number;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  min_prediction_score: 30,
  min_causal_graph_score: 20,
  min_signal_score: 20,
  min_connector_score: 30,
  min_job_score: 40,
  min_overall_score: 30,
  cooldown_hours: 4,
  enabled: true,
};

// ── Main Handler ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Auth: service key or admin session
    const serviceKey = request.headers.get("x-service-key");
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        .single();

      if (!admin) {
        return NextResponse.json({ error: "Platform admin or service key required" }, { status: 403 });
      }
    }

    const service = await createServiceClient();

    // Get all active organizations
    const { data: orgs } = await service
      .from("organizations")
      .select("id, name")
      .limit(100);

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ message: "No organizations found", alerts_created: 0 });
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

    logger.warn(`[health-alerts] Completed: ${orgs.length} orgs checked, ${totalAlerts} alerts created (${duration}ms)`);

    return NextResponse.json({
      status: "completed",
      organizations_checked: orgs.length,
      total_alerts_created: totalAlerts,
      duration_ms: duration,
      results,
    });
  } catch (err) {
    logger.error("[health-alerts] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Health alert check failed" },
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
    .single();

  const thresholds: Thresholds = thresholdRow || DEFAULT_THRESHOLDS;

  if (!thresholds.enabled) {
    return { org_id: orgId, org_name: orgName, violations: [], alerts_created: 0, delivered: { email: 0, slack: 0, in_app: 0 } };
  }

  // 2. Run health scoring (same logic as /api/brain/health?learning=true)
  const [predictions, causalGraph, signals, connectors, jobs] = await Promise.all([
    checkPredictionHealth(supabase, orgId),
    checkCausalGraphHealth(supabase, orgId),
    checkSignalHealth(supabase, orgId),
    checkConnectorHealth(supabase, orgId),
    checkJobHealth(supabase, orgId),
  ]);

  const scores = [predictions.score, causalGraph.score, signals.score, connectors.score, jobs.score];
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // 3. Check each dimension against thresholds
  const violations: AlertViolation[] = [];

  const dimensionChecks: Array<[string, number, number]> = [
    ["predictions", predictions.score, thresholds.min_prediction_score],
    ["causal_graph", causalGraph.score, thresholds.min_causal_graph_score],
    ["signals", signals.score, thresholds.min_signal_score],
    ["connectors", connectors.score, thresholds.min_connector_score],
    ["jobs", jobs.score, thresholds.min_job_score],
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
        anomaly_score: (violation.threshold - violation.score) / violation.threshold,
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

  // 6. Deliver via external channels
  const deliveryResult = await deliverAlerts(supabase, orgId, orgName, newViolations);
  delivered.email = deliveryResult.email;
  delivered.slack = deliveryResult.slack;

  return { org_id: orgId, org_name: orgName, violations: newViolations, alerts_created: alertsCreated, delivered };
}

// ── Alert Delivery ───────────────────────────────────────────────────

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
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: subject,
              blocks: [
                { type: "header", text: { type: "plain_text", text: `Health Alert: ${orgName}` } },
                { type: "section", text: { type: "mrkdwn", text: summary.replace(/- /g, "• ") } },
              ],
            }),
          });
          result.slack++;
        }
      } catch (err) {
        logger.error(`[health-alerts] Slack delivery failed for org ${orgId}:`, err);
      }
    }

    // Email delivery (via Supabase edge function or Resend)
    if (pref.email_digest && pref.digest_email_recipients) {
      try {
        const recipients = pref.digest_email_recipients
          .split(",")
          .map((e: string) => e.trim())
          .filter(Boolean);

        if (recipients.length > 0 && process.env.RESEND_API_KEY) {
          await fetch("https://api.resend.com/emails", {
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
          result.email += recipients.length;
        }
      } catch (err) {
        logger.error(`[health-alerts] Email delivery failed for org ${orgId}:`, err);
      }
    }
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────

function scoreSeverity(score: number, threshold: number): "critical" | "high" | "medium" | "low" {
  const gap = threshold - score;
  const ratio = gap / Math.max(threshold, 1);
  if (score === 0 || ratio > 0.7) return "critical";
  if (ratio > 0.4) return "high";
  if (ratio > 0.2) return "medium";
  return "low";
}

function severityLevel(sev: string): number {
  switch (sev) {
    case "critical": return 4;
    case "high": return 3;
    case "medium": return 2;
    case "low": return 1;
    default: return 2;
  }
}

function getRecommendation(dimension: string): string {
  switch (dimension) {
    case "predictions": return "Run more prediction verification cycles and weight updates.";
    case "causal_graph": return "Run causal discovery to refresh the graph. Check if signals are being ingested.";
    case "signals": return "Check connector sync status. Trigger a manual sync if needed.";
    case "connectors": return "Verify connector credentials and re-authenticate if expired.";
    case "jobs": return "Check scheduled job logs for errors. Verify pg_cron and edge functions are running.";
    case "overall": return "Multiple health dimensions are degraded. Run the full brain consolidation pipeline.";
    default: return "Review health dashboard for details.";
  }
}

// ── Health Check Functions (shared with /api/brain/health) ────────────
// Duplicated here to avoid circular imports and keep the endpoint self-contained.
// These mirror the exact same logic in the main health route.

async function checkPredictionHealth(supabase: any, orgId: string): Promise<HealthDimension> {
  try {
    const [totalResult, verifiedResult, correctResult] = await Promise.all([
      supabase.from("prediction_records").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("prediction_records").select("id", { count: "exact", head: true }).eq("organization_id", orgId).not("verified_at", "is", null),
      supabase.from("prediction_records").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("was_correct", true),
    ]);
    const total = totalResult.count || 0;
    const verified = verifiedResult.count || 0;
    const correct = correctResult.count || 0;
    const accuracy = verified > 0 ? correct / verified : 0;
    const volumeScore = Math.min(total / 10, 1) * 40;
    const accuracyScore = accuracy * 60;
    return { score: Math.round(volumeScore + accuracyScore), status: total === 0 ? "no_predictions" : accuracy >= 0.7 ? "accurate" : "learning", details: { total, verified, correct, accuracy } };
  } catch {
    return { score: 0, status: "unavailable", details: {} };
  }
}

async function checkCausalGraphHealth(supabase: any, orgId: string): Promise<HealthDimension> {
  try {
    const [totalResult, significantResult, recentResult] = await Promise.all([
      supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_significant", true),
      supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("last_computed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);
    const total = totalResult.count || 0;
    const significant = significantResult.count || 0;
    const recent = recentResult.count || 0;
    const edgeScore = Math.min(total / 20, 1) * 30;
    const qualityScore = total > 0 ? (significant / total) * 30 : 0;
    const freshnessScore = total > 0 ? (recent / total) * 40 : 0;
    return { score: Math.round(edgeScore + qualityScore + freshnessScore), status: total === 0 ? "empty" : "active", details: { total, significant, recent } };
  } catch {
    return { score: 0, status: "unavailable", details: {} };
  }
}

async function checkSignalHealth(supabase: any, orgId: string): Promise<HealthDimension> {
  try {
    const [totalResult, recentResult] = await Promise.all([
      supabase.from("cross_domain_signals").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("cross_domain_signals").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);
    const total = totalResult.count || 0;
    const recent = recentResult.count || 0;
    const volumeScore = Math.min(total / 1000, 1) * 30;
    const freshnessScore = recent > 0 ? 40 : 0;
    return { score: Math.round(volumeScore + freshnessScore + 20), status: total === 0 ? "empty" : recent > 0 ? "active" : "stale", details: { total, recent_24h: recent } };
  } catch {
    return { score: 0, status: "unavailable", details: {} };
  }
}

async function checkConnectorHealth(supabase: any, orgId: string): Promise<HealthDimension> {
  try {
    const { data: connectors } = await supabase.from("org_connectors").select("connector_type, status, last_synced_at, credentials").eq("organization_id", orgId);
    if (!connectors || connectors.length === 0) return { score: 0, status: "no_connectors", details: {} };
    const connected = connectors.filter((c: any) => c.status === "connected" || c.credentials);
    const recentlySynced = connectors.filter((c: any) => c.last_synced_at && Date.now() - new Date(c.last_synced_at).getTime() < 24 * 60 * 60 * 1000);
    const connectedScore = (connected.length / connectors.length) * 50;
    const syncScore = connected.length > 0 ? (recentlySynced.length / connected.length) * 50 : 0;
    return { score: Math.round(connectedScore + syncScore), status: connected.length === 0 ? "disconnected" : "active", details: { total: connectors.length, connected: connected.length } };
  } catch {
    return { score: 0, status: "unavailable", details: {} };
  }
}

async function checkJobHealth(supabase: any, orgId: string): Promise<HealthDimension> {
  try {
    const { data: recentJobs } = await supabase.from("scheduled_job_runs").select("status").eq("organization_id", orgId).gte("started_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()).limit(50);
    if (!recentJobs || recentJobs.length === 0) return { score: 10, status: "no_recent_jobs", details: {} };
    const succeeded = recentJobs.filter((j: any) => j.status === "success").length;
    const successRate = succeeded / recentJobs.length;
    return { score: Math.round(successRate * 70 + 30), status: successRate >= 0.9 ? "healthy" : "degraded", details: { total: recentJobs.length, succeeded, rate: successRate } };
  } catch {
    return { score: 0, status: "unavailable", details: {} };
  }
}
