import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { OverviewClient } from "./overview-client";

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
  ] = await Promise.all([
    // Latest brain snapshots (30 days)
    supabase
      .from("brain_daily_snapshots")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .order("snapshot_date", { ascending: false })
      .limit(30),

    // Signals today
    supabase
      .from("cross_domain_signals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", CORE_ORG_ID)
      .gte("created_at", today),

    // Total causal edges
    supabase
      .from("causal_relationships_statistical")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", CORE_ORG_ID),

    // Today's LLM cost (scoped to org)
    supabase
      .from("llm_cost_log")
      .select("estimated_cost_usd, component, function_name, model, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .gte("created_at", today)
      .order("created_at", { ascending: false })
      .limit(50),

    // Budget config
    supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .single(),

    // Recent causal discoveries for intelligence stream
    supabase
      .from("causal_relationships_statistical")
      .select("id, source_entity, target_entity, statistical_method, p_value, confidence_score, lag_days, source_domain, target_domain, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .order("created_at", { ascending: false })
      .limit(10),

    // Platform events for intelligence stream
    supabase
      .from("platform_events")
      .select("id, event_type, event_data, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .order("created_at", { ascending: false })
      .limit(15),

    // Signals grouped by domain (for signal rate panel)
    supabase
      .from("cross_domain_signals")
      .select("source_domain, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500),

    // Early warning: velocity collapse + bottleneck alerts
    supabase
      .from("cross_domain_signals")
      .select("id, signal_type, signal_value, signal_metadata, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .eq("source_domain", "engineering")
      .in("signal_type", ["velocity_collapsed", "bottleneck_detected"])
      .order("created_at", { ascending: false })
      .limit(5),
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

  // Calculate cost metrics
  const costToday = costRows.reduce((sum, r) => sum + (r.estimated_cost_usd || 0), 0);
  const dailyBudget = budget?.daily_llm_budget || 2.0;
  const monthlyBudget = budget?.monthly_llm_budget || 50.0;

  // Calculate brain age
  const oldestSnapshot = snapshots[snapshots.length - 1];
  const brainAge = oldestSnapshot
    ? Math.ceil((Date.now() - new Date(oldestSnapshot.snapshot_date).getTime()) / 86400000)
    : 0;

  // Prediction accuracy from latest snapshot
  const predictionAccuracy = latest?.prediction_accuracy ?? 0;

  // Build intelligence stream events from causal discoveries
  const discoveryEvents = recentEdges.map((edge) => ({
    id: `discovery-${edge.id}`,
    type: "discovery" as const,
    title: `${edge.source_entity} → ${edge.target_entity}`,
    description: `Causal relationship discovered via ${edge.statistical_method || "Granger causality"}${edge.lag_days ? ` with ${edge.lag_days}-day lag` : ""}`,
    timestamp: edge.created_at,
    domain: edge.source_domain,
    domains: edge.source_domain !== edge.target_domain
      ? [edge.source_domain, edge.target_domain].filter(Boolean)
      : undefined,
    confidence: edge.confidence_score,
    pValue: edge.p_value,
    method: edge.statistical_method,
  }));

  // Build intelligence stream events from platform events
  const activityEvents = platformEvents.map((evt) => {
    const data = evt.event_data || {};
    const typeMap: Record<string, "training" | "anomaly" | "alert" | "agent"> = {
      "consolidation.complete": "training",
      "consolidation.started": "training",
      "alert.triggered": "alert",
      "anomaly.detected": "anomaly",
      "agent.completed": "agent",
      "agent.started": "agent",
    };
    const eventType = typeMap[evt.event_type] || "training";

    return {
      id: `event-${evt.id}`,
      type: eventType,
      title: data.title || evt.event_type.replace(/\./g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: data.description || data.summary,
      timestamp: evt.created_at,
      domain: data.domain,
      confidence: data.confidence,
      details: data.details,
    };
  });

  // Build early warning alert events from P0 signals
  const earlyWarningSignals = earlyWarningResult.data || [];
  const earlyWarningEvents = earlyWarningSignals.map((sig: any) => {
    const meta = sig.signal_metadata || {};
    const isCollapse = sig.signal_type === "velocity_collapsed";
    return {
      id: `ew-${sig.id}`,
      type: "alert" as const,
      title: isCollapse
        ? `⚠️ Velocity Collapse: ${meta.percent_drop?.toFixed(1) || 0}% drop`
        : `🚨 Bottleneck: ${meta.top_reviewer || "unknown"} (${(meta.review_share * 100)?.toFixed(0) || 0}% of reviews)`,
      description: isCollapse
        ? `Deploy velocity dropped to ${meta.current_velocity || 0} (historical mean: ${meta.historical_mean?.toFixed(1) || 0}). Confidence: ${(meta.confidence * 100)?.toFixed(0) || 0}%`
        : `Risk score: ${meta.risk_score?.toFixed(0) || 0}/100. Gini: ${meta.gini_coefficient?.toFixed(2) || 0}`,
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
      topDiscoveries={latest?.top_discoveries || []}
    />
  );
}
