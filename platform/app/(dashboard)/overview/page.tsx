import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { OverviewClient } from "./overview-client";
import type { LearningEvent } from "@/app/api/brain/emergence/route";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Command Center",
};

export default async function OverviewPage() {
  const supabase = await createClient();
  const CORE_ORG_ID = await getCurrentOrgId();

  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Fetch all data in parallel
  // Wrap each query to prevent a single failure from crashing the whole page
  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any; count?: number | null }>): Promise<{ data: T | null; error: any; count?: number | null }> =>
    Promise.resolve(p).catch((err) => {
      console.warn("[Overview] Query failed:", err);
      return { data: null as T | null, error: err, count: null };
    });

  const [
    snapshotsResult,
    signalsResult,
    causalResult,
    costResult,
    budgetResult,
    recentEdgesResult,
    eventsResult,
    signalsByDomainResult,
    earlyWarningResult,
    connectorsResult,
    artifactsResult,
    emergenceResult,
  ] = await Promise.all([
    // Latest brain snapshots (30 days)
    safe(supabase
      .from("brain_daily_snapshots")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .order("snapshot_date", { ascending: false })
      .limit(30)),

    // Signals today
    safe(supabase
      .from("cross_domain_signals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", CORE_ORG_ID)
      .gte("created_at", today)),

    // Total causal edges
    safe(supabase
      .from("causal_relationships_statistical")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", CORE_ORG_ID)),

    // Today's LLM cost (scoped to org)
    safe(supabase
      .from("llm_cost_log")
      .select("estimated_cost_usd, component, function_name, model, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .gte("created_at", today)
      .order("created_at", { ascending: false })
      .limit(50)),

    // Budget config
    safe(supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .single()),

    // Recent causal discoveries for intelligence stream
    safe(supabase
      .from("causal_relationships_statistical")
      .select("id, source_entity, target_entity, statistical_method, p_value, confidence_score, lag_days, source_domain, target_domain, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .order("created_at", { ascending: false })
      .limit(10)),

    // Platform events for intelligence stream (anomalies, discoveries, alerts)
    safe(supabase
      .from("platform_events")
      .select("id, event_type, source, title, event_data, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .order("created_at", { ascending: false })
      .limit(30)),

    // Signals grouped by domain (for signal rate panel)
    safe(supabase
      .from("cross_domain_signals")
      .select("source_domain, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500)),

    // Early warning: velocity collapse + bottleneck alerts
    safe(supabase
      .from("cross_domain_signals")
      .select("id, signal_type, signal_value, signal_metadata, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .like("source_domain", "engineering%")
      .in("signal_type", ["velocity_collapsed", "bottleneck_detected"])
      .order("created_at", { ascending: false })
      .limit(5)),

    // Active connectors for data flow section
    safe(supabase
      .from("org_connectors")
      .select("id, connector_type, display_name, status, last_sync_at")
      .eq("organization_id", CORE_ORG_ID)
      .order("last_sync_at", { ascending: false })),

    // Recent SE-aaS artifacts
    safe(supabase
      .from("se_aas_artifacts")
      .select("id, domain_type, title, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .order("created_at", { ascending: false })
      .limit(5)),

    // Brain learning feed — brain_emergence_log
    safe(supabase
      .from("brain_emergence_log")
      .select("id, event_type, summary, metrics, intelligence_score, duration_ms, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .order("created_at", { ascending: false })
      .limit(10)),
  ]);

  const snapshots = snapshotsResult.data || [];
  const latest = snapshots[0] || null;
  const signalsToday = signalsResult.count || 0;
  const totalEdges = causalResult.count || 0;
  const costRows = costResult.data || [];
  const budget = budgetResult.data;
  const recentEdges = recentEdgesResult.data || [];
  const platformEvents = eventsResult.data || [];
  const signalRecords = signalsByDomainResult.data || [];

  // Brain learning feed — format emergence log rows into LearningEvent shape
  // (mirrors the /api/brain/emergence formatter so SSR data is identical to client fetches)
  const emergenceRows = emergenceResult.data || [];
  const TYPE_MAP: Record<string, LearningEvent["type"]> = {
    autonomous_learning: "training",
    dream_insight: "discovery",
    evolution_milestone: "discovery",
    pattern_promoted: "training",
    self_modification: "training",
    calibration_shift: "training",
    reactive_trigger: "training",
  };
  function makeLearningEventSummary(row: any): string {
    const metrics = (row.metrics as Record<string, any>) || {};
    switch (row.event_type) {
      case "autonomous_learning": {
        const packs = metrics.packsGenerated ?? metrics.packs_generated ?? 0;
        const rules = metrics.rulesPromoted ?? metrics.rules_promoted ?? 0;
        const edges = metrics.edgesDiscovered ?? metrics.causal_edges_discovered ?? 0;
        const accuracy = metrics.predictionAccuracy ?? metrics.prediction_accuracy;
        return [
          "Brain ran an autonomous learning cycle.",
          packs > 0 ? `Generated ${packs} training pack${packs !== 1 ? "s" : ""}.` : null,
          rules > 0 ? `Promoted ${rules} rule${rules !== 1 ? "s" : ""} to long-term memory.` : null,
          edges > 0 ? `Discovered ${edges} new causal edge${edges !== 1 ? "s" : ""}.` : null,
          accuracy != null ? `Prediction accuracy now at ${Number(accuracy).toFixed(1)}%.` : null,
        ].filter(Boolean).join(" ");
      }
      case "dream_insight": {
        const insight = metrics.insight || metrics.hypothesis || row.summary;
        return insight ? `💡 Dream insight: "${insight}"` : "Brain surfaced a new hypothesis during its deep reasoning cycle.";
      }
      case "evolution_milestone": {
        const milestone = metrics.milestone || metrics.threshold;
        const accuracy = metrics.accuracy ?? metrics.predictionAccuracy;
        return [
          milestone ? `Brain crossed evolution milestone ${milestone}.` : "Brain reached a new evolution milestone.",
          accuracy != null ? `Prediction accuracy: ${Number(accuracy).toFixed(1)}%.` : null,
        ].filter(Boolean).join(" ");
      }
      case "pattern_promoted": {
        const pattern = metrics.pattern_name || metrics.patternName || "a new pattern";
        const confidence = metrics.confidence;
        return [
          `Promoted pattern "${pattern}" to long-term memory.`,
          confidence != null ? `Confidence: ${(Number(confidence) * 100).toFixed(0)}%.` : null,
        ].filter(Boolean).join(" ");
      }
      case "calibration_shift": {
        const domain = metrics.domain || "a domain";
        const delta = metrics.delta ?? metrics.shift;
        return [
          `Calibration updated for ${domain}.`,
          delta != null ? `Confidence threshold shifted by ${Number(delta).toFixed(3)}.` : null,
        ].filter(Boolean).join(" ");
      }
      default:
        return row.summary || row.event_type.replace(/_/g, " ");
    }
  }
  const brainLearningEvents: LearningEvent[] = emergenceRows.map((row: any) => ({
    id: `emergence-${row.id}`,
    type: TYPE_MAP[row.event_type] ?? "training",
    event_type: row.event_type,
    title: (() => {
      switch (row.event_type) {
        case "autonomous_learning": return "Autonomous Learning Cycle";
        case "dream_insight": return "Dream Insight";
        case "evolution_milestone": return `Evolution Milestone ${(row.metrics as any)?.milestone ?? ""}`.trim();
        case "pattern_promoted": return "Pattern Promoted";
        case "self_modification": return "Self-Modification";
        case "calibration_shift": return "Calibration Shift";
        case "reactive_trigger": return "Reactive Learning";
        default: return row.event_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
    })(),
    summary: makeLearningEventSummary(row),
    intelligence_score: row.intelligence_score != null ? Number(row.intelligence_score) : null,
    duration_ms: row.duration_ms ?? null,
    metrics: (row.metrics as Record<string, any>) || {},
    created_at: row.created_at,
  }));

  // Brain learning feed meta (from latest snapshot)
  const brainLearningMeta = {
    latest_score: latest?.intelligence_score ?? null,
    prediction_accuracy: latest?.prediction_accuracy ?? null,
    autonomous_cycles_run: latest?.autonomous_cycles_run ?? null,
    dream_insights_surfaced: latest?.dream_insights_surfaced ?? null,
  };

  // Calculate cost metrics
  const costToday = costRows.reduce((sum, r) => sum + (r.estimated_cost_usd || 0), 0);
  const dailyBudget = (budget as any)?.daily_llm_budget || 2.0;
  const monthlyBudget = (budget as any)?.monthly_llm_budget || 50.0;

  // Calculate brain age
  const oldestSnapshot = snapshots[snapshots.length - 1];
  const brainAge = oldestSnapshot
    ? Math.ceil((Date.now() - new Date(oldestSnapshot.snapshot_date).getTime()) / 86400000)
    : 0;

  // Prediction accuracy from latest snapshot
  const predictionAccuracy = latest?.prediction_accuracy ?? 0;

  // Convert snake_case entity/domain names to readable business labels
  function toBusinessLabel(raw: string | null | undefined): string {
    if (!raw) return "";
    return raw
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\bAnd\b/g, "and")
      .replace(/\bOf\b/g, "of");
  }

  // Build intelligence stream events from causal discoveries
  // Use natural_language if available (written by the brain), otherwise compose a plain-English title
  const discoveryEvents = recentEdges.map((edge) => {
    const srcLabel = toBusinessLabel(edge.source_entity || edge.source_domain);
    const tgtLabel = toBusinessLabel(edge.target_entity || edge.target_domain);
    const lagText = edge.lag_days ? ` ${edge.lag_days} days later` : "";
    const title = `When your ${srcLabel} moves, your ${tgtLabel} follows${lagText}`;
    const description = edge.lag_days
      ? `Brain found a ${edge.lag_days}-day causal link between ${srcLabel} and ${tgtLabel} — it's now watching for breaks in this pattern.`
      : `Brain mapped a causal relationship between ${srcLabel} and ${tgtLabel} in your data.`;
    return {
      id: `discovery-${edge.id}`,
      type: "discovery" as const,
      title,
      description,
      timestamp: edge.created_at,
      domain: edge.source_domain,
      domains: edge.source_domain !== edge.target_domain
        ? [edge.source_domain, edge.target_domain].filter(Boolean)
        : undefined,
      confidence: edge.confidence_score,
      pValue: edge.p_value,
      method: edge.statistical_method,
    };
  });

  // Build intelligence stream events from platform events
  const activityEvents = platformEvents.map((evt) => {
    const data = evt.event_data || {};
    const typeMap: Record<string, "training" | "anomaly" | "alert" | "agent" | "discovery"> = {
      "consolidation.complete": "training",
      "consolidation.started": "training",
      "alert.triggered": "alert",
      "anomaly.detected": "anomaly",
      "agent.completed": "agent",
      "agent.started": "agent",
      "brain.discovery": "discovery",
      "causal.discovered": "discovery",
      "gl.bootstrap": "discovery",
    };
    const eventType = typeMap[evt.event_type] || "training";

    // Use the row-level title field first (business-language sentence we write),
    // then fall back to event_data.title, then format the event_type as a label.
    const title = (evt as any).title
      || data.title
      || evt.event_type.replace(/\./g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

    return {
      id: `event-${evt.id}`,
      type: eventType,
      title,
      description: data.description || data.summary,
      timestamp: evt.created_at,
      domain: data.domain || (evt as any).source || undefined,
      confidence: data.confidence,
      details: data.details,
    };
  });

  // Build early warning alert events from P0 signals
  const earlyWarningSignals = earlyWarningResult.data || [];
  const earlyWarningEvents = earlyWarningSignals.map((sig: any) => {
    const meta = sig.signal_metadata || {};
    const isCollapse = sig.signal_type === "velocity_collapsed";
    const drop = meta.percent_drop != null ? `${Number(meta.percent_drop).toFixed(0)}%` : null;
    const reviewer = meta.top_reviewer || "one reviewer";
    const share = meta.review_share != null ? `${(Number(meta.review_share) * 100).toFixed(0)}%` : null;
    return {
      id: `ew-${sig.id}`,
      type: "alert" as const,
      title: isCollapse
        ? `Engineering output dropped${drop ? ` ${drop}` : ""} — ships-per-week is well below your usual pace`
        : `Code review bottleneck: ${reviewer} is approving ${share || "most"} of all merges`,
      description: isCollapse
        ? `Your team is shipping ${meta.current_velocity || 0} deploys/week vs a normal pace of ${meta.historical_mean?.toFixed(1) || "—"}. If this continues, feature timelines will slip.`
        : `When one person reviews ${share || "most"} of your code, any absence stalls your whole pipeline. Brain flagged this before it becomes a crisis.`,
      timestamp: sig.created_at,
      domain: "engineering",
      confidence: meta.confidence,
    };
  });

  // Merge and sort by timestamp
  const intelligenceEvents = [...discoveryEvents, ...activityEvents, ...earlyWarningEvents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  // Build knowledge growth data from snapshots
  const knowledgeGrowth = [...snapshots]
    .reverse()
    .map((s) => ({
      date: s.snapshot_date,
      edges: s.total_causal_edges || 0,
      signals: s.total_signals_processed || 0,
    }));

  // Build signal rates by domain
  const domainCounts: Record<string, number> = {};
  for (const sig of signalRecords) {
    const d = sig.source_domain || "unknown";
    domainCounts[d] = (domainCounts[d] || 0) + 1;
  }
  const hoursInPeriod = Math.max(1, (Date.now() - new Date(thirtyDaysAgo).getTime()) / 3600000);
  const signalRates = Object.entries(domainCounts)
    .map(([domain, count]) => ({
      domain,
      count,
      rate: Math.round((count / hoursInPeriod) * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count);

  const totalSignalRate = signalRates.reduce((sum, s) => sum + s.rate, 0);

  const connectors = (connectorsResult.data || []).map((c: any) => ({
    type: c.connector_type,
    name: c.display_name || c.connector_type,
    status: c.status || "active",
    lastSync: c.last_sync_at,
  }));

  const recentArtifacts = (artifactsResult.data || []).map((a: any) => ({
    id: a.id,
    domain: a.domain_type,
    title: a.title,
    createdAt: a.created_at,
  }));

  // Brain vs Claude metrics: count anomalies and discoveries from this week's platform_events
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekEvents = platformEvents.filter((e: any) => e.created_at >= sevenDaysAgo);
  const brainAnomaliesThisWeek = weekEvents.filter((e: any) => e.event_type === "anomaly.detected").length;
  const brainDiscoveriesThisWeek = weekEvents.filter(
    (e: any) => e.event_type === "brain.discovery" || e.event_type === "causal.discovered"
  ).length;

  return (
    <OverviewClient
      totalEdges={totalEdges}
      signalsToday={signalsToday}
      predictionAccuracy={predictionAccuracy}
      connectorsActive={latest?.regions_active?.length ?? 0}
      costToday={costToday}
      dailyBudget={dailyBudget}
      monthlyBudget={monthlyBudget}
      brainAge={brainAge}
      intelligenceEvents={intelligenceEvents}
      knowledgeGrowth={knowledgeGrowth}
      signalRates={signalRates}
      totalSignalRate={Math.round(totalSignalRate * 100) / 100}
      orgId={CORE_ORG_ID}
      brainAnomaliesThisWeek={brainAnomaliesThisWeek}
      brainDiscoveriesThisWeek={brainDiscoveriesThisWeek}
      topDiscoveries={latest?.top_discoveries || []}
      connectors={connectors}
      recentArtifacts={recentArtifacts}
      brainHealthScore={latest?.brain_health_score ?? 0}
      brainLearningEvents={brainLearningEvents}
      brainLearningMeta={brainLearningMeta}
    />
  );
}
