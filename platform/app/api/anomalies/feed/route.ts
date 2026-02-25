/**
 * GET /api/anomalies/feed
 *
 * Anomaly Feed with Causal Explanations.
 *
 * Joins:
 *   cross_domain_signals (anomaly signals) ← watch_anomaly = true OR signal_type anomaly
 *   causal_relationships_statistical       (explains WHY via upstream causes)
 *   platform_events                        (anomaly.detected events for richer context)
 *
 * For each anomaly, we:
 *   1. Fetch the anomaly signal
 *   2. Look up causal edges where target_domain = signal's source_domain
 *   3. Build a plain-English causal explanation: "X caused this because Y → Z (effect: 0.7, lag: 3d)"
 *   4. Attach upstream causes + downstream risks
 *
 * Used by:
 *   - Overview / Command Center (anomaly count + feed)
 *   - AAS marketplace: anomalies in GL / accounting data
 *   - SE-aaS marketplace: anomalies in engineering signals (velocity, bottleneck)
 *   - Copilot AnomalyDetailPanel (deep-dive causal context)
 *
 * Query params:
 *   org_id     — organization (default: current org)
 *   domain     — filter by source_domain (optional: "engineering", "finance", etc.)
 *   service    — "aas" | "seaas" | null (maps to domain filter)
 *   limit      — max results (default 20, max 50)
 *   since      — ISO timestamp (default: 7 days ago)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CausalExplanation {
  cause_domain: string;
  effect_domain: string;
  effect_size: number;        // 0..1
  lag_days: number;
  confidence: number;         // 0..1
  method: string;
  plain_english: string;      // "Revenue drop caused by: deploy velocity fell (effect: 0.72, 3-day lag)"
}

export interface AnomalyEvent {
  id: string;
  source_domain: string;
  signal_type: string;
  signal_value: number;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;        // plain-English anomaly description
  causal_explanation: string; // why this happened (plain English, max 2 sentences)
  upstream_causes: CausalExplanation[];
  downstream_risks: CausalExplanation[];
  metadata: Record<string, any>;
  detected_at: string;
  // For AnomalyDetailPanel compatibility
  domain: string;
  confidence: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SERVICE_DOMAIN_MAP: Record<string, string[]> = {
  aas:   ["finance", "accounting", "revenue", "cash", "expense"],
  seaas: ["engineering", "engineering.github", "engineering.jira", "engineering.slack", "se-aas"],
};

function domainLabel(domain: string): string {
  const map: Record<string, string> = {
    "engineering.github":  "GitHub",
    "engineering.jira":    "Jira",
    "engineering.slack":   "Slack",
    "engineering":         "Engineering",
    "finance":             "Finance",
    "revenue":             "Revenue",
    "accounting":          "Accounting",
    "se-aas":              "SE-aaS",
    "product":             "Product",
    "marketing":           "Marketing",
    "hr":                  "HR",
  };
  return map[domain] || domain.split(".").pop()?.replace(/_/g, " ") || domain;
}

function signalSeverity(value: number, signalType: string): "info" | "warning" | "critical" {
  if (signalType.includes("collapse") || signalType.includes("critical")) return "critical";
  if (Math.abs(value) > 50) return "critical";
  if (Math.abs(value) > 20) return "warning";
  return "info";
}

function plainAnomalyTitle(signalType: string, domain: string): string {
  const domainStr = domainLabel(domain);
  const typeMap: Record<string, string> = {
    velocity_collapsed:       `${domainStr}: Velocity Collapse Detected`,
    bottleneck_detected:      `${domainStr}: Review Bottleneck Alert`,
    scope_creep_alert:        `${domainStr}: Scope Creep Detected`,
    engagement_scope_velocity:`${domainStr}: Scope Velocity Spike`,
    engineer_velocity_index:  `${domainStr}: Engineer Velocity Anomaly`,
    slack_sentiment_index:    `${domainStr}: Team Sentiment Alert`,
    story_point_delta:        `${domainStr}: Story Point Delta`,
    revenue_anomaly:          `${domainStr}: Revenue Anomaly`,
    cash_anomaly:             `${domainStr}: Cash Flow Alert`,
  };
  return typeMap[signalType]
    || `${domainStr}: ${signalType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} Anomaly`;
}

function buildCausalExplanationText(
  causes: CausalExplanation[],
  anomalyDomain: string,
): string {
  if (causes.length === 0) {
    return `No upstream causal drivers identified yet for ${domainLabel(anomalyDomain)} — the Brain is still building causal evidence.`;
  }
  const top = causes[0];
  const additional = causes.length > 1
    ? ` Also correlated: ${causes.slice(1, 3).map(c => domainLabel(c.cause_domain)).join(", ")}.`
    : "";
  return (
    `Brain traced this to ${domainLabel(top.cause_domain)} ` +
    `(effect size ${top.effect_size.toFixed(2)}, ${top.lag_days}d lag, ${top.method}).` +
    additional
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const workspaceId   = url.searchParams.get("org_id") || await getCurrentWorkspaceId();
    const service = url.searchParams.get("service");   // "aas" | "seaas" | null
    const domainFilter = url.searchParams.get("domain");
    const limit   = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 50);
    const sinceDefault = new Date(Date.now() - 7 * 86400000).toISOString();
    const since   = url.searchParams.get("since") || sinceDefault;

    // ── 1. Resolve domain filter ─────────────────────────────────────────────
    const allowedDomains: string[] | null = domainFilter
      ? [domainFilter]
      : service
        ? (SERVICE_DOMAIN_MAP[service] ?? null)
        : null;

    // ── 2. Fetch anomaly signals from cross_domain_signals ───────────────────
    let signalQuery = supabase
      .from("cross_domain_signals")
      .select("id, source_domain, signal_type, signal_value, signal_metadata, created_at")
      .eq("organization_id", workspaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit * 2); // fetch extra, filter below

    // Filter: signals flagged as anomalies OR known anomaly signal types
    const anomalyTypes = [
      "velocity_collapsed", "bottleneck_detected", "scope_creep_alert",
      "engagement_scope_velocity", "engineer_velocity_index",
      "slack_sentiment_index", "revenue_anomaly", "cash_anomaly",
      "story_point_delta",
    ];

    if (allowedDomains && allowedDomains.length > 0) {
      signalQuery = signalQuery.in("source_domain", allowedDomains);
    }

    // We can't do complex OR in Supabase filter easily, so fetch both and merge
    const [anomalySignalResult, watchAnomalyResult, platformAnomalyResult] = await Promise.all([
      // Signals with known anomaly signal types
      signalQuery.in("signal_type", anomalyTypes),

      // Signals with watch_anomaly flag in metadata
      supabase
        .from("cross_domain_signals")
        .select("id, source_domain, signal_type, signal_value, signal_metadata, created_at")
        .eq("organization_id", workspaceId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit),

      // Platform events: anomaly.detected (richer description)
      supabase
        .from("platform_events")
        .select("id, event_type, source, title, event_data, created_at")
        .eq("organization_id", workspaceId)
        .eq("event_type", "anomaly.detected")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    // Merge signal sources, deduplicate by id
    const rawSignals = [
      ...(anomalySignalResult.data || []),
      ...(watchAnomalyResult.data || []).filter(
        (s: any) => (s.signal_metadata as Record<string, any>)?.watch_anomaly === true
      ),
    ];
    const seenIds = new Set<string>();
    const dedupedSignals = rawSignals.filter(s => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    }).slice(0, limit);

    // ── 3. Fetch all causal edges for this org (for explanation join) ─────────
    const { data: causalEdges } = await supabase
      .from("causal_relationships_statistical")
      .select("source_domain, target_domain, effect_size, optimal_lag_days, confidence_score, statistical_method")
      .eq("organization_id", workspaceId)
      .gte("confidence_score", 0.3)
      .order("confidence_score", { ascending: false })
      .limit(200);

    const edges = causalEdges || [];

    // ── 4. Build anomaly events with causal explanations ─────────────────────
    const platformEventsById = new Map<string, any>();
    for (const pe of (platformAnomalyResult.data || [])) {
      const data = (pe.event_data as Record<string, any>) || {};
      const domain = data.domain || (pe as any).source;
      if (domain) platformEventsById.set(domain + "_" + pe.created_at?.slice(0, 10), pe);
    }

    const anomalyEvents: AnomalyEvent[] = dedupedSignals.map((sig: any) => {
      const meta = (sig.signal_metadata as Record<string, any>) || {};
      const domain = sig.source_domain || "unknown";

      // Find upstream causes: edges where target_domain matches anomaly domain
      const upstreamCauses: CausalExplanation[] = edges
        .filter(e => e.target_domain === domain || domain.startsWith(e.target_domain))
        .slice(0, 5)
        .map(e => ({
          cause_domain:  e.source_domain,
          effect_domain: e.target_domain,
          effect_size:   Number(e.effect_size ?? 0),
          lag_days:      Number(e.optimal_lag_days ?? 0),
          confidence:    Number(e.confidence_score ?? 0),
          method:        e.statistical_method || "Granger",
          plain_english: `${domainLabel(e.source_domain)} → ${domainLabel(e.target_domain)} ` +
            `(effect: ${Number(e.effect_size ?? 0).toFixed(2)}, lag: ${e.optimal_lag_days ?? 0}d, ` +
            `${(Number(e.confidence_score ?? 0) * 100).toFixed(0)}% confidence)`,
        }));

      // Find downstream risks: edges where source_domain matches anomaly domain
      const downstreamRisks: CausalExplanation[] = edges
        .filter(e => e.source_domain === domain || domain.startsWith(e.source_domain))
        .slice(0, 3)
        .map(e => ({
          cause_domain:  e.source_domain,
          effect_domain: e.target_domain,
          effect_size:   Number(e.effect_size ?? 0),
          lag_days:      Number(e.optimal_lag_days ?? 0),
          confidence:    Number(e.confidence_score ?? 0),
          method:        e.statistical_method || "Granger",
          plain_english: `Could affect ${domainLabel(e.target_domain)} in ~${e.optimal_lag_days ?? 0} days ` +
            `(effect size ${Number(e.effect_size ?? 0).toFixed(2)})`,
        }));

      const severity = signalSeverity(Number(sig.signal_value ?? 0), sig.signal_type);
      const title = plainAnomalyTitle(sig.signal_type, domain);
      const causalExplanation = buildCausalExplanationText(upstreamCauses, domain);

      // Build description from metadata
      let description = meta.description || meta.summary || "";
      if (!description) {
        if (sig.signal_type === "velocity_collapsed") {
          description = `Deploy velocity dropped to ${meta.current_velocity ?? sig.signal_value} ` +
            `(historical mean: ${meta.historical_mean?.toFixed ? meta.historical_mean.toFixed(1) : meta.historical_mean ?? "N/A"}). ` +
            `Drop: ${meta.percent_drop?.toFixed ? meta.percent_drop.toFixed(1) : meta.percent_drop ?? 0}%.`;
        } else if (sig.signal_type === "bottleneck_detected") {
          description = `${meta.top_reviewer || "A reviewer"} handling ` +
            `${meta.review_share != null ? (Number(meta.review_share) * 100).toFixed(0) + "%" : "most"} of reviews. ` +
            `Risk score: ${meta.risk_score ?? "N/A"}/100.`;
        } else if (sig.signal_type === "slack_sentiment_index") {
          const valStr = Number(sig.signal_value ?? 0).toFixed(2);
          description = `Slack sentiment index: ${valStr} ` +
            `(${Number(sig.signal_value ?? 0) < 0 ? "negative — possible team friction" : "positive"}).`;
        } else {
          description = `${domainLabel(domain)} signal value: ${sig.signal_value}. ` +
            `Signal type: ${sig.signal_type.replace(/_/g, " ")}.`;
        }
      }

      return {
        id:                  `anomaly-${sig.id}`,
        source_domain:       domain,
        signal_type:         sig.signal_type,
        signal_value:        Number(sig.signal_value ?? 0),
        severity,
        title,
        description,
        causal_explanation:  causalExplanation,
        upstream_causes:     upstreamCauses,
        downstream_risks:    downstreamRisks,
        metadata:            meta,
        detected_at:         sig.created_at,
        // AnomalyDetailPanel compatibility
        domain,
        confidence:          meta.confidence != null ? Number(meta.confidence) : null,
      };
    });

    // ── 5. Append platform-event anomalies not already captured ──────────────
    const platformOnlyAnomalies: AnomalyEvent[] = (platformAnomalyResult.data || [])
      .filter((pe: any) => {
        const data = (pe.event_data as Record<string, any>) || {};
        const domain = data.domain || (pe as any).source || "unknown";
        // Skip if we already have a signal for this domain + day
        return !seenIds.has(`platform-${pe.id}`);
      })
      .slice(0, Math.max(0, limit - anomalyEvents.length))
      .map((pe: any) => {
        const data = (pe.event_data as Record<string, any>) || {};
        const domain = data.domain || (pe as any).source || "unknown";
        const title = (pe as any).title || data.title || "Anomaly Detected";
        const description = data.description || data.summary || data.details || "";

        const upstreamCauses: CausalExplanation[] = edges
          .filter(e => e.target_domain === domain)
          .slice(0, 3)
          .map(e => ({
            cause_domain:  e.source_domain,
            effect_domain: e.target_domain,
            effect_size:   Number(e.effect_size ?? 0),
            lag_days:      Number(e.optimal_lag_days ?? 0),
            confidence:    Number(e.confidence_score ?? 0),
            method:        e.statistical_method || "Granger",
            plain_english: `${domainLabel(e.source_domain)} → ${domainLabel(e.target_domain)} ` +
              `(effect: ${Number(e.effect_size ?? 0).toFixed(2)}, lag: ${e.optimal_lag_days ?? 0}d)`,
          }));

        return {
          id:                  `platform-anomaly-${pe.id}`,
          source_domain:       domain,
          signal_type:         "anomaly.detected",
          signal_value:        data.value ?? 0,
          severity:            (data.severity as any) || "warning",
          title,
          description,
          causal_explanation:  buildCausalExplanationText(upstreamCauses, domain),
          upstream_causes:     upstreamCauses,
          downstream_risks:    [],
          metadata:            data,
          detected_at:         pe.created_at,
          domain,
          confidence:          data.confidence != null ? Number(data.confidence) : null,
        } satisfies AnomalyEvent;
      });

    const allAnomalies = [...anomalyEvents, ...platformOnlyAnomalies]
      .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime())
      .slice(0, limit);

    return NextResponse.json({
      anomalies: allAnomalies,
      meta: {
        total:        allAnomalies.length,
        org_id:       workspaceId,
        service:      service || "all",
        domain:       domainFilter || (service ? SERVICE_DOMAIN_MAP[service]?.join(",") : "all"),
        since,
        causal_edges_available: edges.length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    logger.error("[anomalies/feed] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch anomalies" },
      { status: 500 }
    );
  }
}
