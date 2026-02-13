import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { OverviewClient } from "./overview-client";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Overview",
};

export default async function OverviewPage() {
  const supabase = await createClient();
  const CORE_ORG_ID = await getCurrentOrgId();

  // Fetch brain metrics in parallel
  const [
    snapshotsResult,
    signalsResult,
    causalResult,
    costResult,
    budgetResult,
  ] = await Promise.all([
    // Latest brain snapshots
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
      .gte("created_at", new Date().toISOString().split("T")[0]),

    // Total causal edges
    supabase
      .from("causal_relationships_statistical")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", CORE_ORG_ID),

    // Today's LLM cost
    supabase
      .from("llm_cost_log")
      .select("estimated_cost_usd, component, function_name, model, created_at")
      .gte("created_at", new Date().toISOString().split("T")[0])
      .order("created_at", { ascending: false })
      .limit(50),

    // Budget config
    supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .single(),
  ]);

  const snapshots = snapshotsResult.data || [];
  const latest = snapshots[0] || null;
  const signalsToday = signalsResult.count || 0;
  const totalEdges = causalResult.count || 0;
  const costRows = costResult.data || [];
  const budget = budgetResult.data;

  // Calculate cost metrics
  const costToday = costRows.reduce((sum, r) => sum + (r.estimated_cost_usd || 0), 0);
  const dailyBudget = budget?.daily_llm_budget || 2.0;
  const monthlyBudget = budget?.monthly_llm_budget || 50.0;

  // Calculate brain age
  const oldestSnapshot = snapshots[snapshots.length - 1];
  const brainAge = oldestSnapshot
    ? Math.ceil((Date.now() - new Date(oldestSnapshot.snapshot_date).getTime()) / 86400000)
    : 0;

  // Build activity feed from recent cost logs
  const recentActivity = costRows.slice(0, 10).map((r, i) => ({
    id: `cost-${i}`,
    type: "training" as const,
    title: `${r.component}.${r.function_name}`,
    timestamp: r.created_at,
    details: `${r.model} | $${r.estimated_cost_usd?.toFixed(6)}`,
  }));

  // Prediction accuracy from latest snapshot
  const predictionAccuracy = latest?.prediction_accuracy ?? 0;

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
      recentActivity={recentActivity}
      topDiscoveries={latest?.top_discoveries || []}
    />
  );
}
