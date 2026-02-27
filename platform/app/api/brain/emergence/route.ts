/**
 * GET /api/brain/emergence
 *
 * Brain Learning Feed — surfaces what NexusBrain is learning in plain English.
 *
 * Data sources (priority order):
 *   1. brain_emergence_log   — autonomous_learning, dream_insight, evolution_milestone,
 *                              pattern_promoted, self_modification, calibration_shift
 *   2. brain_daily_snapshots — daily intelligence score deltas (learning progress)
 *   3. platform_events       — training_complete, anomaly events (fallback enrichment)
 *
 * Used by:
 *   - Overview / Command Center (all orgs)
 *   - Copilot sidebar (BrainLearningFeed widget)
 *   - AAS marketplace service
 *   - SE-aaS marketplace service
 *
 * Returns events pre-formatted with a plain-English `summary` field so the UI
 * can render them without any transformation logic.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ─── Plain-English formatters per event type ────────────────────────────────

function formatEmergenceEvent(row: Record<string, any>): LearningEvent {
  const metrics = (row.metrics as Record<string, any>) || {};
  const score = row.intelligence_score != null
    ? `Intelligence score: ${Number(row.intelligence_score).toFixed(1)}`
    : null;

  let plain = row.summary || "";

  // Rephrase machine summary into human-friendly sentence
  switch (row.event_type) {
    case "autonomous_learning": {
      const packs = metrics.packsGenerated ?? metrics.packs_generated ?? 0;
      const rules = metrics.rulesPromoted ?? metrics.rules_promoted ?? 0;
      const edges = metrics.edgesDiscovered ?? metrics.causal_edges_discovered ?? 0;
      const accuracy = metrics.predictionAccuracy ?? metrics.prediction_accuracy;
      plain = [
        `Brain ran an autonomous learning cycle.`,
        packs  > 0 ? `Generated ${packs} training pack${packs !== 1 ? "s" : ""}.` : null,
        rules  > 0 ? `Promoted ${rules} rule${rules !== 1 ? "s" : ""} to long-term memory.` : null,
        edges  > 0 ? `Discovered ${edges} new causal edge${edges !== 1 ? "s" : ""}.` : null,
        accuracy != null && Number.isFinite(Number(accuracy)) ? `Prediction accuracy now at ${Number(accuracy).toFixed(1)}%.` : null,
      ].filter(Boolean).join(" ");
      break;
    }
    case "dream_insight": {
      const insight = metrics.insight || metrics.hypothesis || row.summary;
      plain = insight
        ? `💡 Dream insight: "${insight}"`
        : "Brain surfaced a new hypothesis during its deep reasoning cycle.";
      break;
    }
    case "evolution_milestone": {
      const milestone = metrics.milestone || metrics.threshold;
      const accuracy = metrics.accuracy ?? metrics.predictionAccuracy;
      plain = [
        milestone ? `Brain crossed evolution milestone ${milestone}.` : "Brain reached a new evolution milestone.",
        accuracy != null && Number.isFinite(Number(accuracy)) ? `Prediction accuracy: ${Number(accuracy).toFixed(1)}%.` : null,
        score,
      ].filter(Boolean).join(" ");
      break;
    }
    case "pattern_promoted": {
      const pattern = metrics.pattern_name || metrics.patternName || "a new pattern";
      const confidence = metrics.confidence;
      plain = [
        `Promoted pattern "${pattern}" to long-term memory.`,
        confidence != null && Number.isFinite(Number(confidence)) ? `Confidence: ${(Number(confidence) * 100).toFixed(0)}%.` : null,
      ].filter(Boolean).join(" ");
      break;
    }
    case "self_modification": {
      const change = metrics.change || metrics.modification || row.summary;
      plain = change
        ? `Brain self-modified: ${change}`
        : "Brain updated its own reasoning parameters based on feedback.";
      break;
    }
    case "calibration_shift": {
      const domain = metrics.domain || "a domain";
      const delta = metrics.delta ?? metrics.shift;
      plain = [
        `Calibration updated for ${domain}.`,
        delta != null && Number.isFinite(Number(delta)) ? `Confidence threshold shifted by ${Number(delta).toFixed(3)}.` : null,
      ].filter(Boolean).join(" ");
      break;
    }
    case "reactive_trigger": {
      const trigger = metrics.trigger || metrics.signal_type || "a signal";
      plain = `Brain reacted to ${trigger} and triggered a learning cycle.`;
      break;
    }
    default:
      // Use raw summary if available, otherwise humanise the event_type
      plain = row.summary || row.event_type.replace(/_/g, " ");
  }

  const typeMap: Record<string, LearningEvent["type"]> = {
    autonomous_learning:  "training",
    dream_insight:        "discovery",
    evolution_milestone:  "discovery",
    pattern_promoted:     "training",
    self_modification:    "training",
    calibration_shift:    "training",
    reactive_trigger:     "training",
  };

  return {
    id:               `emergence-${row.id}`,
    type:             typeMap[row.event_type] ?? "training",
    event_type:       row.event_type,
    title:            emergenceTitle(row.event_type, metrics),
    summary:          plain,
    intelligence_score: row.intelligence_score != null ? Number(row.intelligence_score) : null,
    duration_ms:      row.duration_ms ?? null,
    metrics,
    created_at:       row.created_at,
  };
}

function emergenceTitle(eventType: string, metrics: Record<string, any>): string {
  switch (eventType) {
    case "autonomous_learning":  return "Autonomous Learning Cycle";
    case "dream_insight":        return "Dream Insight";
    case "evolution_milestone":  return `Evolution Milestone ${metrics.milestone ?? ""}`.trim();
    case "pattern_promoted":     return "Pattern Promoted";
    case "self_modification":    return "Self-Modification";
    case "calibration_shift":    return "Calibration Shift";
    case "reactive_trigger":     return "Reactive Learning";
    default:                     return eventType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LearningEvent {
  id: string;
  type: "training" | "discovery" | "anomaly" | "alert" | "prediction" | "agent";
  event_type: string;
  title: string;
  summary: string;           // plain-English sentence
  intelligence_score: number | null;
  duration_ms: number | null;
  metrics: Record<string, any>;
  created_at: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── Auth: isolate createClient() + getUser() so Lambda env var errors return 401, not 500 ──
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const workspaceId   = url.searchParams.get("org_id") || await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ events: [], total: 0 });
    }
    const limit   = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 50);
    const service = url.searchParams.get("service"); // "aas" | "seaas" | null (all)

    // ── 1. Brain emergence log ───────────────────────────────────────────────
    const { data: emergenceRows } = await supabase
      .from("brain_emergence_log")
      .select("id, event_type, summary, metrics, intelligence_score, duration_ms, created_at")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const emergenceEvents: LearningEvent[] = (emergenceRows || []).map(formatEmergenceEvent);

    // ── 2. Platform events fallback (training_complete, brain.discovery) ─────
    //    Pull these only if emergence log is sparse
    let platformLearningEvents: LearningEvent[] = [];
    if (emergenceEvents.length < 5) {
      const { data: platformRows } = await supabase
        .from("platform_events")
        .select("id, event_type, source, title, event_data, created_at")
        .eq("organization_id", workspaceId)
        .in("event_type", [
          "consolidation.complete",
          "training_complete",
          "brain.discovery",
          "causal.discovered",
          "agent.completed",
        ])
        .order("created_at", { ascending: false })
        .limit(limit);

      platformLearningEvents = (platformRows || []).map((row) => {
        const data = (row.event_data as Record<string, any>) || {};
        const title = (row as any).title || data.title
          || row.event_type.replace(/\./g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        const description = data.description || data.summary || data.details || "";

        return {
          id:               `platform-${row.id}`,
          type:             "training" as const,
          event_type:       row.event_type,
          title,
          summary:          description || title,
          intelligence_score: null,
          duration_ms:      data.duration_ms ?? null,
          metrics:          data,
          created_at:       row.created_at,
        };
      });
    }

    // ── 3. Latest intelligence snapshot (for score context) ──────────────────
    const { data: snapshotRow } = await supabase
      .from("brain_daily_snapshots")
      .select("snapshot_date, intelligence_score, prediction_accuracy, autonomous_cycles_run, dream_insights_surfaced, anomalies_detected")
      .eq("organization_id", workspaceId)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── 4. Merge + sort ──────────────────────────────────────────────────────
    const allEvents = [...emergenceEvents, ...platformLearningEvents]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    // ── 5. Service-aware filtering ────────────────────────────────────────────
    // AAS/SE-aaS services can filter to their domain-relevant events.
    // Currently returns all events for any service — domain-level filter
    // can be added here when emergence_log gains a service_tag column.
    // For now: all services get the full learning feed.

    return NextResponse.json({
      events: allEvents,
      meta: {
        total:             allEvents.length,
        org_id:            workspaceId,
        service:           service || "all",
        latest_score:      snapshotRow?.intelligence_score ?? null,
        prediction_accuracy: snapshotRow?.prediction_accuracy ?? null,
        autonomous_cycles_run:    snapshotRow?.autonomous_cycles_run ?? null,
        dream_insights_surfaced:  snapshotRow?.dream_insights_surfaced ?? null,
        anomalies_detected:       snapshotRow?.anomalies_detected ?? null,
        generated_at:      new Date().toISOString(),
      },
    });
  } catch (err: any) {
    logger.error("[brain/emergence] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
