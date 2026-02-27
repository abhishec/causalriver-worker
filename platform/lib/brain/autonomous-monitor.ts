/**
 * Autonomous Monitoring Reactions System
 * =======================================
 *
 * Watches signal thresholds and fires proactive responses without being asked.
 * This is what makes BrainOS act like a colleague, not a tool.
 *
 * Monitors every 15 minutes:
 * - Flight risk score > 70  → queue early-warning agent + Slack PM alert (critical)
 * - Flight risk score > 50  → queue early-warning agent (warning)
 * - Engagement health < 40  → queue delivery-intelligence agent (critical)
 * - Engagement health < 60  → queue delivery-intelligence agent (warning)
 * - New active scope creep  → queue scope-creep analysis + Slack notify (warning)
 * - Signal velocity spikes  → queue brain consolidation (info)
 *
 * Deduplication: 6-hour cooldown per alert per entity (via ai_memory marker)
 * Slack: uses existing org_connectors webhook via get_connector_credentials RPC
 * Agent queuing: inserts to agent_queue with priority 10 (critical) or 5 (warning)
 *
 * NOTE: flight_risk_score is 0-100 scale (not 0-1).
 *       health_score is also 0-100 scale.
 *       Thresholds below reflect the actual DB scale.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { getConnectorWithCredentials } from "@/lib/connectors/get-credentials";

// ============================================================================
// Types
// ============================================================================

export interface ThresholdAlert {
  alertType: string;
  entityId: string;          // engagement_id, engineer github_login, etc.
  entityType: "engagement" | "engineer" | "org";
  currentValue: number;
  threshold: number;
  direction: "above" | "below";
  severity: "info" | "warning" | "critical";
  domain: string;            // which SE-aaS domain handles this
  recommendedAction: string;
  organizationId: string;
  extraContext?: Record<string, unknown>;
}

export interface MonitoringResult {
  alertsDetected: number;
  agentsQueued: number;
  notificationsSent: number;
  errors: string[];
}

// ============================================================================
// Deduplication window: 6 hours
// ============================================================================
const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;

// ============================================================================
// Signal velocity window: alerts if > this many signals in past hour per org
// ============================================================================
const SIGNAL_VELOCITY_THRESHOLD = 50;

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Run all monitoring checks for a single org.
 * Fires agents and Slack notifications for threshold crossings.
 * Deduplicates via ai_memory (6-hour cooldown per alert per entity).
 */
export async function runAutonomousMonitoring(
  supabase: SupabaseClient,
  orgId: string
): Promise<MonitoringResult> {
  const result: MonitoringResult = {
    alertsDetected: 0,
    agentsQueued: 0,
    notificationsSent: 0,
    errors: [],
  };

  // Run all checks in parallel for speed
  const [flightRiskAlerts, healthAlerts, scopeCreepAlerts, velocityAlerts] =
    await Promise.allSettled([
      checkFlightRisk(supabase, orgId),
      checkEngagementHealth(supabase, orgId),
      checkScopeCreep(supabase, orgId),
      checkSignalVelocity(supabase, orgId),
    ]);

  const allAlerts: ThresholdAlert[] = [];

  if (flightRiskAlerts.status === "fulfilled") {
    allAlerts.push(...flightRiskAlerts.value);
  } else {
    const msg = `checkFlightRisk failed: ${String(flightRiskAlerts.reason)}`;
    logger.error(`[AutonomousMonitor] ${msg}`);
    result.errors.push(msg);
  }

  if (healthAlerts.status === "fulfilled") {
    allAlerts.push(...healthAlerts.value);
  } else {
    const msg = `checkEngagementHealth failed: ${String(healthAlerts.reason)}`;
    logger.error(`[AutonomousMonitor] ${msg}`);
    result.errors.push(msg);
  }

  if (scopeCreepAlerts.status === "fulfilled") {
    allAlerts.push(...scopeCreepAlerts.value);
  } else {
    const msg = `checkScopeCreep failed: ${String(scopeCreepAlerts.reason)}`;
    logger.error(`[AutonomousMonitor] ${msg}`);
    result.errors.push(msg);
  }

  if (velocityAlerts.status === "fulfilled") {
    allAlerts.push(...velocityAlerts.value);
  } else {
    const msg = `checkSignalVelocity failed: ${String(velocityAlerts.reason)}`;
    logger.error(`[AutonomousMonitor] ${msg}`);
    result.errors.push(msg);
  }

  result.alertsDetected = allAlerts.length;

  if (allAlerts.length === 0) {
    return result;
  }

  logger.warn(
    `[AutonomousMonitor] org=${orgId} detected ${allAlerts.length} threshold alerts`
  );

  // Process each alert: dedup → react
  for (const alert of allAlerts) {
    try {
      const alreadyFired = await isAlertRecentlyFired(supabase, orgId, alert);
      if (alreadyFired) {
        logger.warn(
          `[AutonomousMonitor] DEDUP skip — ${alert.alertType} / ${alert.entityId} fired within 6h`
        );
        continue;
      }

      // Queue agent (all alerts except pure-info signal velocity)
      if (alert.severity !== "info") {
        const queued = await queueAgentForAlert(supabase, alert);
        if (queued) result.agentsQueued++;
      }

      // Slack notification for critical and warning severity
      if (alert.severity === "critical" || alert.severity === "warning") {
        const sent = await sendSlackAlert(supabase, orgId, alert);
        if (sent) result.notificationsSent++;
      }

      // Mark as fired (prevent re-alerting within 6h)
      await markAlertFired(supabase, orgId, alert);
    } catch (err) {
      const msg = `Failed to react to ${alert.alertType}/${alert.entityId}: ${String(err)}`;
      logger.error(`[AutonomousMonitor] ${msg}`);
      result.errors.push(msg);
    }
  }

  return result;
}

// ============================================================================
// Check: Flight Risk
// Table: engineer_health_snapshots
// Scale: flight_risk_score is 0–100
// ============================================================================

async function checkFlightRisk(
  supabase: SupabaseClient,
  orgId: string
): Promise<ThresholdAlert[]> {
  // Get the most recent snapshot per engineer (latest week_start)
  const { data, error } = await supabase
    .from("engineer_health_snapshots")
    .select("github_login, flight_risk_score, velocity_index, week_start, organization_id")
    .eq("organization_id", orgId)
    .gt("flight_risk_score", 50)  // only fetch engineers above warning threshold
    .order("week_start", { ascending: false })
    .limit(100);

  if (error) {
    logger.error(`[AutonomousMonitor] flight risk query error: ${error.message}`);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Deduplicate to latest snapshot per engineer
  const latestByEngineer = new Map<string, typeof data[0]>();
  for (const row of data) {
    if (!latestByEngineer.has(row.github_login)) {
      latestByEngineer.set(row.github_login, row);
    }
  }

  const alerts: ThresholdAlert[] = [];

  for (const row of latestByEngineer.values()) {
    const score = Number(row.flight_risk_score);

    if (score > 70) {
      alerts.push({
        alertType: "flight-risk-critical",
        entityId: row.github_login,
        entityType: "engineer",
        currentValue: score,
        threshold: 70,
        direction: "above",
        severity: "critical",
        domain: "early-warning",
        recommendedAction: `Engineer @${row.github_login} has critical flight risk (${score.toFixed(0)}/100). Immediate check-in recommended.`,
        organizationId: orgId,
        extraContext: { velocity_index: row.velocity_index, week_start: row.week_start },
      });
    } else if (score > 50) {
      alerts.push({
        alertType: "flight-risk-warning",
        entityId: row.github_login,
        entityType: "engineer",
        currentValue: score,
        threshold: 50,
        direction: "above",
        severity: "warning",
        domain: "early-warning",
        recommendedAction: `Engineer @${row.github_login} shows elevated flight risk (${score.toFixed(0)}/100). Consider workload review.`,
        organizationId: orgId,
        extraContext: { velocity_index: row.velocity_index, week_start: row.week_start },
      });
    }
  }

  return alerts;
}

// ============================================================================
// Check: Engagement Health
// Table: engagement_health_scores
// Scale: health_score is 0–100
// ============================================================================

async function checkEngagementHealth(
  supabase: SupabaseClient,
  orgId: string
): Promise<ThresholdAlert[]> {
  // Get the most recent score per engagement
  const { data, error } = await supabase
    .from("engagement_health_scores")
    .select("engagement_id, health_score, computed_at, organization_id")
    .eq("organization_id", orgId)
    .lt("health_score", 60)  // only fetch engagements below warning threshold
    .order("computed_at", { ascending: false })
    .limit(100);

  if (error) {
    logger.error(`[AutonomousMonitor] engagement health query error: ${error.message}`);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Deduplicate to latest score per engagement
  const latestByEngagement = new Map<string, typeof data[0]>();
  for (const row of data) {
    if (!latestByEngagement.has(row.engagement_id)) {
      latestByEngagement.set(row.engagement_id, row);
    }
  }

  const alerts: ThresholdAlert[] = [];

  for (const row of latestByEngagement.values()) {
    const score = Number(row.health_score);

    if (score < 40) {
      alerts.push({
        alertType: "engagement-health-critical",
        entityId: row.engagement_id,
        entityType: "engagement",
        currentValue: score,
        threshold: 40,
        direction: "below",
        severity: "critical",
        domain: "delivery-intelligence",
        recommendedAction: `Engagement ${row.engagement_id} has critically low health score (${score.toFixed(0)}/100). Full diagnostic required.`,
        organizationId: orgId,
        extraContext: { computed_at: row.computed_at },
      });
    } else if (score < 60) {
      alerts.push({
        alertType: "engagement-health-warning",
        entityId: row.engagement_id,
        entityType: "engagement",
        currentValue: score,
        threshold: 60,
        direction: "below",
        severity: "warning",
        domain: "delivery-intelligence",
        recommendedAction: `Engagement ${row.engagement_id} health declining (${score.toFixed(0)}/100). Review delivery blockers.`,
        organizationId: orgId,
        extraContext: { computed_at: row.computed_at },
      });
    }
  }

  return alerts;
}

// ============================================================================
// Check: Scope Creep
// Table: scope_creep_alerts
// Any new unacknowledged alert in the last 24h → warning
// ============================================================================

async function checkScopeCreep(
  supabase: SupabaseClient,
  orgId: string
): Promise<ThresholdAlert[]> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("scope_creep_alerts")
    .select("id, engagement_id, severity, delta_pct, alert_message, sprint_name, created_at")
    .eq("organization_id", orgId)
    .eq("acknowledged", false)
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    logger.error(`[AutonomousMonitor] scope creep query error: ${error.message}`);
    return [];
  }

  if (!data || data.length === 0) return [];

  return data.map((row) => {
    const deltaPct = Number(row.delta_pct ?? 0);
    const isCritical = row.severity === "critical";
    return {
      alertType: `scope-creep-${row.severity}`,
      entityId: row.engagement_id,
      entityType: "engagement" as const,
      currentValue: deltaPct,
      threshold: 20,  // > 20% scope growth triggers alerts (per schema comment)
      direction: "above" as const,
      severity: isCritical ? ("critical" as const) : ("warning" as const),
      domain: "scope-creep",
      recommendedAction:
        row.alert_message ??
        `Scope creep detected on engagement ${row.engagement_id}` +
          (row.sprint_name ? ` (${row.sprint_name})` : "") +
          `: +${deltaPct.toFixed(0)}% story points.`,
      organizationId: orgId,
      extraContext: {
        alertId: row.id,
        sprint_name: row.sprint_name,
        delta_pct: deltaPct,
        created_at: row.created_at,
      },
    };
  });
}

// ============================================================================
// Check: Signal Velocity
// Table: cross_domain_signals
// If > SIGNAL_VELOCITY_THRESHOLD signals in last hour → queue consolidation
// ============================================================================

async function checkSignalVelocity(
  supabase: SupabaseClient,
  orgId: string
): Promise<ThresholdAlert[]> {
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("cross_domain_signals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("created_at", since1h);

  if (error) {
    logger.error(`[AutonomousMonitor] signal velocity query error: ${error.message}`);
    return [];
  }

  const signalCount = count ?? 0;

  if (signalCount <= SIGNAL_VELOCITY_THRESHOLD) return [];

  return [
    {
      alertType: "signal-velocity-spike",
      entityId: orgId,
      entityType: "org",
      currentValue: signalCount,
      threshold: SIGNAL_VELOCITY_THRESHOLD,
      direction: "above",
      severity: "info",
      domain: "delivery-intelligence",
      recommendedAction: `High signal volume detected (${signalCount} signals/hour). Triggering brain consolidation to process patterns.`,
      organizationId: orgId,
    },
  ];
}

// ============================================================================
// Deduplication: check ai_memory for recent same alert
// ============================================================================

async function isAlertRecentlyFired(
  supabase: SupabaseClient,
  orgId: string,
  alert: ThresholdAlert
): Promise<boolean> {
  const dedupKey = `monitor.${alert.alertType}.${alert.entityId}`;
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("ai_memory")
    .select("id, created_at")
    .eq("organization_id", orgId)
    .eq("domain", dedupKey)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  if (error) {
    // Log but don't block — better to fire a duplicate than miss a real alert
    logger.warn(`[AutonomousMonitor] dedup check error for ${dedupKey}: ${error.message}`);
    return false;
  }

  return data !== null;
}

async function markAlertFired(
  supabase: SupabaseClient,
  orgId: string,
  alert: ThresholdAlert
): Promise<void> {
  const dedupKey = `monitor.${alert.alertType}.${alert.entityId}`;

  const { error } = await supabase.from("ai_memory").insert({
    organization_id: orgId,
    memory_type: "fact",
    domain: dedupKey,
    content: `Alert fired: ${alert.alertType} for ${alert.entityId} (value: ${alert.currentValue.toFixed(2)}, threshold: ${alert.threshold})`,
    importance: 0.6,
    metadata: {
      alertType: alert.alertType,
      entityType: alert.entityType,
      value: alert.currentValue,
      threshold: alert.threshold,
      severity: alert.severity,
      domain: alert.domain,
      firedAt: new Date().toISOString(),
      ...(alert.extraContext ?? {}),
    },
  });

  if (error) {
    logger.warn(`[AutonomousMonitor] Failed to mark alert fired for ${dedupKey}: ${error.message}`);
  }
}

// ============================================================================
// Reaction: Queue Agent
// ============================================================================

async function queueAgentForAlert(
  supabase: SupabaseClient,
  alert: ThresholdAlert
): Promise<boolean> {
  try {
    const { error } = await supabase.from("agent_queue").insert({
      organization_id: alert.organizationId,
      agent_type: "seaas",
      task_type: alert.domain,
      priority: alert.severity === "critical" ? 10 : 5,
      payload: {
        triggeredBy: "autonomous-monitor",
        alertType: alert.alertType,
        entityId: alert.entityId,
        entityType: alert.entityType,
        threshold: alert.threshold,
        currentValue: alert.currentValue,
        direction: alert.direction,
        recommendedAction: alert.recommendedAction,
        ...(alert.extraContext ?? {}),
      },
      status: "pending",
    });

    if (error) {
      logger.error(
        `[AutonomousMonitor] agent_queue insert failed for ${alert.alertType}/${alert.entityId}: ${error.message}`
      );
      return false;
    }

    logger.warn(
      `[AutonomousMonitor] Queued ${alert.domain} agent for ${alert.alertType}/${alert.entityId} (priority=${alert.severity === "critical" ? 10 : 5})`
    );
    return true;
  } catch (err) {
    logger.error(`[AutonomousMonitor] queueAgentForAlert threw: ${String(err)}`);
    return false;
  }
}

// ============================================================================
// Reaction: Send Slack Alert
// Uses getConnectorWithCredentials() — the secure credential access pattern.
// Falls back silently if no Slack connector is configured.
// ============================================================================

async function sendSlackAlert(
  supabase: SupabaseClient,
  orgId: string,
  alert: ThresholdAlert
): Promise<boolean> {
  try {
    const connector = await getConnectorWithCredentials(supabase, orgId, "slack");
    if (!connector) return false;

    const webhookUrl = connector.credentials?.webhook_url as string | undefined;
    if (!webhookUrl) {
      logger.warn(
        `[AutonomousMonitor] Slack connector active for org ${orgId} but no webhook_url in credentials`
      );
      return false;
    }

    const emoji = alert.severity === "critical" ? ":rotating_light:" : ":warning:";
    const severityLabel = alert.severity === "critical" ? "CRITICAL" : "WARNING";

    const message = {
      text: `${emoji} *BrainOS ${severityLabel}*: ${alert.alertType}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${alert.severity === "critical" ? "🚨" : "⚠️"} BrainOS Autonomous Alert`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${alert.alertType}*\n${alert.recommendedAction}`,
          },
          fields: [
            {
              type: "mrkdwn",
              text: `*Severity*\n${severityLabel}`,
            },
            {
              type: "mrkdwn",
              text: `*Value → Threshold*\n${alert.currentValue.toFixed(1)} ${alert.direction === "above" ? ">" : "<"} ${alert.threshold}`,
            },
            {
              type: "mrkdwn",
              text: `*Domain*\n${alert.domain}`,
            },
            {
              type: "mrkdwn",
              text: `*Entity*\n${alert.entityType}: ${alert.entityId}`,
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Fired by BrainOS Autonomous Monitor | ${new Date().toUTCString()}`,
            },
          ],
        },
      ],
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      logger.warn(
        `[AutonomousMonitor] Slack webhook returned ${res.status} for org ${orgId}`
      );
      return false;
    }

    logger.warn(
      `[AutonomousMonitor] Slack alert sent for ${alert.alertType}/${alert.entityId} to org ${orgId}`
    );
    return true;
  } catch (err) {
    logger.error(`[AutonomousMonitor] sendSlackAlert threw: ${String(err)}`);
    return false;
  }
}
