import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { BrainClient } from "./brain-client";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Brain Explorer",
};

export default async function BrainPage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  // Wrap each query to prevent a single failure from crashing the whole page
  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      console.warn("[Brain] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  const [causalResult, entitiesResult, snapshotResult, discoveryTimelineResult, layerHealthResult, signalsResult] = await Promise.all([
    // Top 50 causal relationships by strength
    safe(supabase
      .from("causal_relationships_statistical")
      .select(
        "id, source_entity, target_entity, strength, p_value, lag_periods, method, domain, natural_language, created_at"
      )
      .eq("organization_id", workspaceId)
      .order("strength", { ascending: false })
      .limit(50)),

    // Top 30 resolved entities
    safe(supabase
      .from("resolved_entities")
      .select("id, canonical_name, entity_type, domain, aliases, confidence, created_at")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(30)),

    // Latest snapshot for discoveries and region status
    safe(supabase
      .from("brain_daily_snapshots")
      .select("*")
      .eq("organization_id", workspaceId)
      .order("snapshot_date", { ascending: false })
      .limit(1)),

    // Recent discovery timeline (last 20 causal discoveries for replay tab)
    safe(supabase
      .from("causal_relationships_statistical")
      .select("id, source_entity, target_entity, strength, p_value, statistical_method, confidence_score, lag_days, source_domain, target_domain, created_at")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20)),

    // Layer health data
    safe(supabase
      .from("obs_layer_health")
      .select("layer_id, layer_name, health_score, requests_processed, errors, latency_p50, created_at")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(15)),

    // Signal activity for timeline (last 30 days, capped at 200 for perf)
    // The client aggregates by day anyway — 200 recent signals is enough for the chart.
    safe(supabase
      .from("cross_domain_signals")
      .select("id, domain, source_type, created_at")
      .eq("organization_id", workspaceId)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(200)),
  ]);

  const causalEdges = causalResult.data || [];
  const entities = entitiesResult.data || [];
  const snapshot = snapshotResult.data?.[0] || null;
  const discoveryTimeline = discoveryTimelineResult.data || [];
  const layerHealth = layerHealthResult.data || [];
  const signals = signalsResult.data || [];

  return (
    <BrainClient
      causalEdges={causalEdges}
      entities={entities}
      snapshot={snapshot}
      discoveryTimeline={discoveryTimeline}
      layerHealth={layerHealth}
      signals={signals}
    />
  );
}
