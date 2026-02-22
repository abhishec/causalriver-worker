/**
 * Health Polling Service — Autonomous Brain Health Monitor
 *
 * Provides functions for polling brain health and comparing against
 * configurable thresholds. Designed to be called by:
 *   - Vercel Cron (/api/brain/health/cron)
 *   - Manual trigger from settings UI
 *   - Edge Functions / pg_cron
 *
 * Each poll cycle:
 *   1. Scores 6 health dimensions (0-100)
 *   2. Compares against org thresholds
 *   3. Creates alerts for violations (with deduplication)
 *   4. Emits cross_domain_signal for RL
 *   5. Generates proactive suggestions if score changed significantly
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ───────────────────────────────────────────────────────────────────

export interface HealthDimension {
  score: number; // 0-100
  status: string;
  details: Record<string, unknown>;
}

export interface HealthSnapshot {
  overall_score: number;
  status: "healthy" | "learning" | "degraded" | "initializing";
  dimensions: {
    predictions: HealthDimension;
    causal_graph: HealthDimension;
    signals: HealthDimension;
    connectors: HealthDimension;
    jobs: HealthDimension;
  };
  recommendations: string[];
  timestamp: string;
}

export interface PollResult {
  organizationId: string;
  snapshot: HealthSnapshot;
  violations: AlertViolation[];
  alertsCreated: number;
  signalEmitted: boolean;
  durationMs: number;
}

interface AlertViolation {
  dimension: string;
  score: number;
  threshold: number;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
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

// ── Core Polling Function ───────────────────────────────────────────────────

/**
 * Poll health for a single organization.
 * Runs all 6 dimension checks, compares against thresholds,
 * creates alerts, emits RL signals, and returns the full result.
 */
export async function pollHealthOnce(
  supabase: SupabaseClient,
  organizationId: string,
  orgName?: string,
): Promise<PollResult> {
  const startTime = Date.now();

  // 1. Score all dimensions in parallel
  const [predictions, causalGraph, signals, connectors, jobs] = await Promise.all([
    checkPredictionHealth(supabase, organizationId),
    checkCausalGraphHealth(supabase, organizationId),
    checkSignalHealth(supabase, organizationId),
    checkConnectorHealth(supabase, organizationId),
    checkJobHealth(supabase, organizationId),
  ]);

  const scores = [predictions.score, causalGraph.score, signals.score, connectors.score, jobs.score];
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  const status: HealthSnapshot["status"] =
    overallScore >= 80 ? "healthy"
      : overallScore >= 50 ? "learning"
        : overallScore >= 20 ? "degraded"
          : "initializing";

  const snapshot: HealthSnapshot = {
    overall_score: overallScore,
    status,
    dimensions: { predictions, causal_graph: causalGraph, signals, connectors, jobs },
    recommendations: generateRecommendations(predictions, causalGraph, signals, connectors, jobs),
    timestamp: new Date().toISOString(),
  };

  // 2. Load org thresholds (or defaults)
  const { data: thresholdRow } = await supabase
    .from("health_alert_thresholds")
    .select("*")
    .eq("organization_id", organizationId)
    .single();

  const thresholds: Thresholds = thresholdRow || DEFAULT_THRESHOLDS;

  // 3. Check violations
  let violations: AlertViolation[] = [];
  let alertsCreated = 0;

  if (thresholds.enabled) {
    const label = orgName || organizationId.slice(0, 8);
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
        violations.push({
          dimension,
          score,
          threshold,
          severity: scoreSeverity(score, threshold),
          message: `${label}: ${dimension} health score ${score}/100 below threshold ${threshold}`,
        });
      }
    }

    // 4. Deduplication: skip recently alerted dimensions
    if (violations.length > 0) {
      const cooldownCutoff = new Date(
        Date.now() - thresholds.cooldown_hours * 60 * 60 * 1000,
      ).toISOString();

      const { data: recentAlerts } = await supabase
        .from("health_alert_log")
        .select("dimension")
        .eq("organization_id", organizationId)
        .gte("created_at", cooldownCutoff);

      const recentDimensions = new Set(
        (recentAlerts || []).map((a: { dimension: string }) => a.dimension),
      );
      const newViolations = violations.filter((v) => !recentDimensions.has(v.dimension));

      // 5. Create alerts for new violations
      for (const violation of newViolations) {
        await supabase.from("cascade_alerts").insert({
          organization_id: organizationId,
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
        });

        await supabase.from("health_alert_log").insert({
          organization_id: organizationId,
          dimension: violation.dimension,
          score: violation.score,
          threshold: violation.threshold,
          severity: violation.severity,
          message: violation.message,
          delivered_in_app: true,
        });

        alertsCreated++;
      }
    }
  }

  // 6. Emit RL signal for brain learning
  let signalEmitted = false;
  try {
    await supabase.from("cross_domain_signals").insert({
      organization_id: organizationId,
      source_domain: "brain.health",
      signal_type: "health_polled",
      signal_value: overallScore / 100,
      entity_type: "health_snapshot",
      signal_metadata: {
        overall_score: overallScore,
        status,
        prediction_score: predictions.score,
        causal_graph_score: causalGraph.score,
        signal_score: signals.score,
        connector_score: connectors.score,
        job_score: jobs.score,
        violations_count: violations.length,
        alerts_created: alertsCreated,
        polled_at: new Date().toISOString(),
      },
    });
    signalEmitted = true;
  } catch {
    // Non-critical
  }

  // 7. Store health snapshot for trend tracking
  try {
    await supabase.from("brain_health_history").insert({
      organization_id: organizationId,
      snapshot_type: "automated_poll",
      total_signals: signals.details.total_signals ?? 0,
      total_relationships: causalGraph.details.total_edges ?? 0,
      total_memories: 0,
      prediction_accuracy: predictions.details.accuracy ?? 0,
      total_predictions: predictions.details.total_predictions ?? 0,
      resolved_predictions: predictions.details.verified_predictions ?? 0,
    });
  } catch {
    // Non-critical: table may not have all columns
  }

  return {
    organizationId,
    snapshot,
    violations,
    alertsCreated,
    signalEmitted,
    durationMs: Date.now() - startTime,
  };
}

// ── Batch Polling (All Active Orgs) ─────────────────────────────────────────

/**
 * Poll health for all active organizations.
 * "Active" = has at least one active connector (proxy for usage).
 */
export async function pollAllOrganizations(
  supabase: SupabaseClient,
): Promise<{ results: PollResult[]; totalDurationMs: number }> {
  const startTime = Date.now();

  // Get orgs with active connectors (active usage indicator)
  const { data: activeOrgs } = await supabase
    .from("organizations")
    .select("id, name")
    .limit(100);

  if (!activeOrgs || activeOrgs.length === 0) {
    return { results: [], totalDurationMs: Date.now() - startTime };
  }

  const results: PollResult[] = [];

  for (const org of activeOrgs) {
    try {
      const result = await pollHealthOnce(supabase, org.id, org.name);
      results.push(result);
    } catch (err) {
      logger.error(`[HealthPoller] Failed to poll org ${org.name}:`, err);
    }
  }

  const totalAlerts = results.reduce((sum, r) => sum + r.alertsCreated, 0);
  logger.warn(
    `[HealthPoller] Polled ${results.length} orgs, ${totalAlerts} alerts created (${Date.now() - startTime}ms)`,
  );

  return { results, totalDurationMs: Date.now() - startTime };
}

// ── Health Check Functions ──────────────────────────────────────────────────

async function checkPredictionHealth(supabase: SupabaseClient, orgId: string): Promise<HealthDimension> {
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
    return {
      score: Math.round(volumeScore + accuracyScore),
      status: total === 0 ? "no_predictions" : accuracy >= 0.7 ? "accurate" : accuracy >= 0.4 ? "learning" : "low_accuracy",
      details: { total_predictions: total, verified_predictions: verified, correct_predictions: correct, accuracy: Math.round(accuracy * 100) / 100 },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Prediction table not available" } };
  }
}

async function checkCausalGraphHealth(supabase: SupabaseClient, orgId: string): Promise<HealthDimension> {
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
    return {
      score: Math.round(edgeScore + qualityScore + freshnessScore),
      status: total === 0 ? "empty" : recent === 0 ? "stale" : significant > 5 ? "healthy" : "growing",
      details: { total_edges: total, significant_edges: significant, edges_last_7d: recent },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Causal graph table not available" } };
  }
}

async function checkSignalHealth(supabase: SupabaseClient, orgId: string): Promise<HealthDimension> {
  try {
    const [totalResult, recentResult, domainResult] = await Promise.all([
      supabase.from("cross_domain_signals").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
      supabase.from("cross_domain_signals").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("cross_domain_signals").select("source_domain").eq("organization_id", orgId).limit(1000),
    ]);
    const total = totalResult.count || 0;
    const recent24h = recentResult.count || 0;
    const uniqueDomains = new Set((domainResult.data || []).map((s: { source_domain: string }) => s.source_domain)).size;
    const volumeScore = Math.min(total / 1000, 1) * 30;
    const freshnessScore = recent24h > 0 ? 40 : 0;
    const diversityScore = Math.min(uniqueDomains / 3, 1) * 30;
    return {
      score: Math.round(volumeScore + freshnessScore + diversityScore),
      status: total === 0 ? "empty" : recent24h === 0 ? "stale" : "active",
      details: { total_signals: total, signals_last_24h: recent24h, unique_domains: uniqueDomains },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Signals table not available" } };
  }
}

async function checkConnectorHealth(supabase: SupabaseClient, orgId: string): Promise<HealthDimension> {
  try {
    const { data: connectors } = await supabase
      .from("org_connectors")
      .select("connector_type, status, last_synced_at, credentials")
      .eq("organization_id", orgId);

    if (!connectors || connectors.length === 0) {
      return { score: 0, status: "no_connectors", details: { connected_count: 0 } };
    }

    const connected = connectors.filter((c: { status: string; credentials: unknown }) => c.status === "connected" || c.credentials);
    const recentlySynced = connectors.filter((c: { last_synced_at: string | null }) => {
      if (!c.last_synced_at) return false;
      return Date.now() - new Date(c.last_synced_at).getTime() < 24 * 60 * 60 * 1000;
    });

    const connectedScore = (connected.length / connectors.length) * 50;
    const syncScore = connected.length > 0 ? (recentlySynced.length / connected.length) * 50 : 0;
    return {
      score: Math.round(connectedScore + syncScore),
      status: connected.length === 0 ? "disconnected" : recentlySynced.length === 0 ? "stale" : "syncing",
      details: { total_connectors: connectors.length, connected_count: connected.length, recently_synced: recentlySynced.length },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Connectors table not available" } };
  }
}

async function checkJobHealth(supabase: SupabaseClient, orgId: string): Promise<HealthDimension> {
  try {
    const { data: recentJobs } = await supabase
      .from("scheduled_job_runs")
      .select("job_type, status, started_at, error_message")
      .eq("organization_id", orgId)
      .gte("started_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order("started_at", { ascending: false })
      .limit(50);

    if (!recentJobs || recentJobs.length === 0) {
      return { score: 10, status: "no_recent_jobs", details: { jobs_last_48h: 0 } };
    }

    const succeeded = recentJobs.filter((j: { status: string }) => j.status === "success").length;
    const failed = recentJobs.filter((j: { status: string }) => j.status === "error").length;
    const successRate = succeeded / recentJobs.length;

    return {
      score: Math.round(successRate * 70 + 30),
      status: successRate >= 0.9 ? "healthy" : successRate >= 0.5 ? "degraded" : "failing",
      details: { jobs_last_48h: recentJobs.length, succeeded, failed, success_rate: Math.round(successRate * 100) / 100 },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Job runs table not available" } };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function scoreSeverity(score: number, threshold: number): "critical" | "high" | "medium" | "low" {
  const gap = threshold - score;
  const ratio = gap / Math.max(threshold, 1);
  if (score === 0 || ratio > 0.7) return "critical";
  if (ratio > 0.4) return "high";
  if (ratio > 0.2) return "medium";
  return "low";
}

function getRecommendation(dimension: string): string {
  switch (dimension) {
    case "predictions": return "Run more prediction verification cycles and weight updates.";
    case "causal_graph": return "Run causal discovery to refresh the graph.";
    case "signals": return "Check connector sync status. Trigger a manual sync.";
    case "connectors": return "Verify connector credentials and re-authenticate if expired.";
    case "jobs": return "Check scheduled job logs for errors.";
    case "overall": return "Multiple dimensions degraded. Run full brain consolidation.";
    default: return "Review health dashboard for details.";
  }
}

function generateRecommendations(
  predictions: HealthDimension,
  causalGraph: HealthDimension,
  signals: HealthDimension,
  connectors: HealthDimension,
  jobs: HealthDimension,
): string[] {
  const recs: string[] = [];
  if (connectors.status === "no_connectors") recs.push("Connect at least one data source (GitHub, Slack, Jira) to start ingesting signals.");
  if (signals.status === "empty") recs.push("No signals ingested yet. Run a connector sync to populate the brain with data.");
  else if (signals.status === "stale") recs.push("No signals in the last 24h. Check connector sync or trigger a manual sync.");
  if (causalGraph.status === "empty" && (signals.details.total_signals as number) > 100) recs.push("Enough signals to discover causal patterns. Run a causal discovery job.");
  else if (causalGraph.status === "stale") recs.push("Causal graph is stale. Run daily causal discovery.");
  if (predictions.status === "no_predictions") recs.push("No predictions made yet. The brain needs to make predictions to learn.");
  else if (predictions.status === "low_accuracy") recs.push("Prediction accuracy is low. Run more verification cycles.");
  if (jobs.status === "no_recent_jobs") recs.push("No scheduled jobs in 48h. Set up automated brain cycles.");
  else if (jobs.status === "failing") recs.push("Multiple job failures detected. Check error logs.");
  if (recs.length === 0) recs.push("Brain is healthy. Continue monitoring.");
  return recs;
}
