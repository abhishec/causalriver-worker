/**
 * GET /api/connectors/monitoring
 *
 * Connector ingestion monitoring dashboard.
 *
 * Returns real-time status, ETA, error counts, signal throughput, and health
 * for all connectors registered to the current organisation.
 *
 * Response shape:
 * {
 *   connectors: ConnectorStatus[],
 *   summary: {
 *     total: number,
 *     healthy: number,
 *     syncing: number,
 *     errored: number,
 *     totalSignalsAllTime: number,
 *   },
 *   generatedAt: string,  // ISO timestamp
 * }
 *
 * NB-022: This endpoint was missing — connector sync progress was completely
 * invisible to operators and design partners.
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectorStatus {
  id: string;
  connectorType: string;
  displayName: string;
  status: "healthy" | "syncing" | "errored" | "not_configured" | "never_synced";
  lastSyncedAt: string | null;
  lastSyncDurationMs: number | null;
  /** Signals ingested in the most recent sync run */
  lastSyncSignals: number | null;
  /** Total signals ingested all-time for this connector */
  totalSignalsAllTime: number | null;
  /** In-progress ingestion checkpoint (if a sync is currently running) */
  checkpoint: {
    progressPct: number;
    signalsIngested: number;
    estimatedRemainingMs: number | null;
    state: Record<string, any>;
  } | null;
  /** Last error message (if status === 'errored') */
  lastError: string | null;
  /** Signal throughput: signals per minute (rolling 5-min window) */
  signalsPerMinute: number | null;
  /** Signal counts by type (top 5) */
  signalBreakdown: Array<{ signalType: string; count: number }>;
  /** Recent errors in the last 24h */
  recentErrorCount: number;
}

interface MonitoringResponse {
  connectors: ConnectorStatus[];
  summary: {
    total: number;
    healthy: number;
    syncing: number;
    errored: number;
    totalSignalsAllTime: number;
  };
  generatedAt: string;
}

// ─── Human-readable display names ────────────────────────────────────────────

const CONNECTOR_DISPLAY_NAMES: Record<string, string> = {
  github: "GitHub",
  jira: "Jira",
  slack: "Slack",
  freshdesk: "Freshdesk",
  freshsales: "Freshsales",
  freshchat: "Freshchat",
  linear: "Linear",
  logs: "Log Ingestion",
  datadog: "Datadog",
  cloudwatch: "CloudWatch",
  pagerduty: "PagerDuty",
  stripe: "Stripe",
  hubspot: "HubSpot",
  google_calendar: "Google Calendar",
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // 2. Load all registered connectors for this org
    const { data: orgConnectors, error: connErr } = await service
      .from("org_connectors")
      .select("id, connector_type, config, last_synced_at, status, error_message")
      .eq("organization_id", workspaceId)
      .order("connector_type");

    if (connErr) {
      return NextResponse.json({ error: connErr.message }, { status: 500 });
    }

    // 3. Load checkpoints (in-progress syncs)
    const { data: checkpoints } = await service
      .from("connector_checkpoints")
      .select(
        "connector_type, status, progress_pct, signals_ingested, updated_at, state, error_message"
      )
      .eq("organization_id", workspaceId);

    const checkpointByType: Record<string, any> = {};
    for (const cp of checkpoints || []) {
      checkpointByType[cp.connector_type] = cp;
    }

    // 4. Load signal counts per connector type (all-time)
    const { data: signalCounts } = await service
      .from("cross_domain_signals")
      .select("source_domain, signal_type")
      .eq("organization_id", workspaceId);

    // Aggregate by connector type (source_domain prefix maps to connector)
    const allTimeByConnector: Record<string, number> = {};
    const signalTypesByConnector: Record<string, Record<string, number>> = {};

    for (const sig of signalCounts || []) {
      const connType = inferConnectorFromDomain(sig.source_domain);
      allTimeByConnector[connType] = (allTimeByConnector[connType] || 0) + 1;
      if (!signalTypesByConnector[connType]) signalTypesByConnector[connType] = {};
      signalTypesByConnector[connType][sig.signal_type] =
        (signalTypesByConnector[connType][sig.signal_type] || 0) + 1;
    }

    // 5. Load rolling 5-min signal counts (throughput)
    const { data: recentSignals } = await service
      .from("cross_domain_signals")
      .select("source_domain, created_at")
      .eq("organization_id", workspaceId)
      .gte("created_at", fiveMinutesAgo);

    const recentByConnector: Record<string, number> = {};
    for (const sig of recentSignals || []) {
      const connType = inferConnectorFromDomain(sig.source_domain);
      recentByConnector[connType] = (recentByConnector[connType] || 0) + 1;
    }

    // 6. Count recent errors per connector (last 24h from checkpoint error states)
    const { data: errorCheckpoints } = await service
      .from("connector_checkpoints")
      .select("connector_type, updated_at, status")
      .eq("organization_id", workspaceId)
      .eq("status", "failed")
      .gte("updated_at", twentyFourHoursAgo);

    const recentErrorsByConnector: Record<string, number> = {};
    for (const cp of errorCheckpoints || []) {
      recentErrorsByConnector[cp.connector_type] =
        (recentErrorsByConnector[cp.connector_type] || 0) + 1;
    }

    // 7. Build per-connector status objects
    const connectorStatuses: ConnectorStatus[] = (orgConnectors || []).map((conn) => {
      const cp = checkpointByType[conn.connector_type];
      const isSyncing = cp?.status === "in_progress";
      const lastError = conn.error_message || cp?.error_message || null;
      const connStatus = deriveStatus(conn, cp, lastError);

      // ETA estimation: if syncing and progress > 0, extrapolate
      let etaMs: number | null = null;
      if (isSyncing && cp?.progress_pct > 0 && cp?.updated_at && conn.last_synced_at) {
        const elapsed = now.getTime() - new Date(conn.last_synced_at).getTime();
        const totalEstimated = elapsed / (cp.progress_pct / 100);
        etaMs = Math.max(0, totalEstimated - elapsed);
      }

      // Signal breakdown: top 5 types for this connector
      const typeMap = signalTypesByConnector[conn.connector_type] || {};
      const signalBreakdown = Object.entries(typeMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([signalType, count]) => ({ signalType, count }));

      // Throughput: signals in last 5 min → per-minute rate
      const signalsLast5Min = recentByConnector[conn.connector_type] || 0;
      const signalsPerMinute = signalsLast5Min > 0 ? signalsLast5Min / 5 : null;

      return {
        id: conn.id,
        connectorType: conn.connector_type,
        displayName:
          CONNECTOR_DISPLAY_NAMES[conn.connector_type] || conn.connector_type,
        status: connStatus,
        lastSyncedAt: conn.last_synced_at || null,
        lastSyncDurationMs: null, // stored in checkpoint state when available
        lastSyncSignals: cp?.signals_ingested ?? null,
        totalSignalsAllTime: allTimeByConnector[conn.connector_type] ?? null,
        checkpoint: isSyncing
          ? {
              progressPct: cp.progress_pct || 0,
              signalsIngested: cp.signals_ingested || 0,
              estimatedRemainingMs: etaMs,
              state: cp.state || {},
            }
          : null,
        lastError,
        signalsPerMinute,
        signalBreakdown,
        recentErrorCount: recentErrorsByConnector[conn.connector_type] || 0,
      };
    });

    // 8. Summary
    const summary = {
      total: connectorStatuses.length,
      healthy: connectorStatuses.filter((c) => c.status === "healthy").length,
      syncing: connectorStatuses.filter((c) => c.status === "syncing").length,
      errored: connectorStatuses.filter((c) => c.status === "errored").length,
      totalSignalsAllTime: Object.values(allTimeByConnector).reduce((a, b) => a + b, 0),
    };

    const response: MonitoringResponse = {
      connectors: connectorStatuses,
      summary,
      generatedAt: now.toISOString(),
    };

    return NextResponse.json(response);
  } catch (err: any) {
    logger.error("[Connector Monitoring] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a human-readable status from connector + checkpoint state.
 */
function deriveStatus(
  conn: any,
  cp: any,
  lastError: string | null
): ConnectorStatus["status"] {
  if (cp?.status === "in_progress") return "syncing";
  if (cp?.status === "failed" || lastError) return "errored";
  if (!conn.last_synced_at) return "never_synced";
  // If last sync was more than 25h ago with no checkpoint, consider stale but healthy
  return "healthy";
}

/**
 * Map source_domain prefix to connector type.
 * e.g. "engineering.github" → "github"
 *      "support.freshdesk"  → "freshdesk"
 *      "engineering.jira"   → "jira"
 */
function inferConnectorFromDomain(sourceDomain: string): string {
  if (!sourceDomain) return "unknown";
  // Check for exact matches like "engineering.jira" → "jira"
  const parts = sourceDomain.split(".");
  const knownConnectors = [
    "github",
    "jira",
    "slack",
    "freshdesk",
    "freshsales",
    "freshchat",
    "linear",
    "logs",
    "datadog",
    "cloudwatch",
    "pagerduty",
    "stripe",
    "hubspot",
  ];

  for (const part of parts.reverse()) {
    if (knownConnectors.includes(part)) return part;
  }
  return parts[parts.length - 1] || "unknown";
}
