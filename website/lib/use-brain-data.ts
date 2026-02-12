"use client";

import { useEffect, useState } from "react";
import { supabase, CORE_BRAIN_ORG_ID } from "./supabase";
import type { BrainDailySnapshot, BrainHealth } from "./types";

// ─── Simulated data for when Supabase is not connected ─────────
// This makes the website look alive even during development
function generateSimulatedSnapshots(): BrainDailySnapshot[] {
  const days: BrainDailySnapshot[] = [];
  const now = new Date();
  const baseConnections = 2400;
  const baseAccuracy = 82;

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayNum = 30 - i;

    // Organic growth curve — starts fast, compounds
    const growthFactor = 1 + Math.log(dayNum + 1) * 0.15;
    const randomJitter = 0.9 + Math.random() * 0.2;

    const newConns = Math.round((8 + dayNum * 0.6) * randomJitter);
    const totalConns = baseConnections + Math.round(dayNum * 15 * growthFactor);
    const accuracy = Math.min(
      95,
      baseAccuracy + dayNum * 0.18 + (Math.random() - 0.3) * 1.2
    );

    const discoveries = generateDiscoveriesForDay(dayNum, date);
    const regions = generateActiveRegions(dayNum);

    days.push({
      id: `sim-${i}`,
      organization_id: CORE_BRAIN_ORG_ID,
      snapshot_date: date.toISOString().split("T")[0],
      total_connections: totalConns,
      new_connections: newConns,
      total_signals: Math.round(600 + dayNum * 40 + Math.random() * 200),
      signals_processed: Math.round(500 + dayNum * 35 + Math.random() * 150),
      prediction_accuracy: Math.round(accuracy * 10) / 10,
      confidence_mean: 0.65 + dayNum * 0.005,
      edges_strengthened: Math.round(12 + dayNum * 0.8 + Math.random() * 5),
      edges_pruned: Math.round(3 + Math.random() * 4),
      edges_decayed: Math.round(1 + Math.random() * 3),
      anomalies_detected: Math.round(2 + Math.random() * 6),
      patterns_found: Math.round(4 + dayNum * 0.3 + Math.random() * 3),
      memories_created: Math.round(6 + dayNum * 0.5 + Math.random() * 4),
      regions_active: regions,
      top_discoveries: discoveries,
      consolidation_stats: {
        signalsProcessed: Math.round(500 + dayNum * 35),
        causalEdgesDiscovered: totalConns,
        newRelationships: newConns,
        anomaliesDetected: Math.round(2 + Math.random() * 6),
        patternsFound: Math.round(4 + dayNum * 0.3),
        edgesPruned: Math.round(3 + Math.random() * 4),
        edgesStrengthened: Math.round(12 + dayNum * 0.8),
        edgesDecayed: Math.round(1 + Math.random() * 3),
        memoriesCreated: Math.round(6 + dayNum * 0.5),
        orgsConsolidated: 1,
      },
      narrative: null,
      run_duration_ms: Math.round(45000 + Math.random() * 30000),
      run_status: "completed",
      created_at: date.toISOString(),
    });
  }

  return days;
}

function generateDiscoveriesForDay(dayNum: number, _date: Date): string[] {
  const allDiscoveries = [
    "Discovered: deploy frequency causes customer satisfaction (14d lag, p<0.01)",
    "Anomaly detected: support tickets +340% — traced to v3.2 release",
    "New causal chain: marketing spend \u2192 pipeline growth \u2192 revenue (21d cascade)",
    "Pattern: Monday deploys correlate with 2.3x more Thursday support tickets",
    "Prediction validated: revenue forecast was within 3% of actual",
    "Strengthened: GitHub PR velocity \u2192 customer satisfaction (confidence now 0.89)",
    "Discovered: Slack response time causes support resolution speed (7d lag)",
    "Anomaly: payment failures spiked 180% — correlated with API gateway change",
    "New connection: engineering velocity \u2192 product adoption rate (28d cascade)",
    "Pattern: quarterly reviews trigger 40% spike in feature requests",
    "Pruned 3 weak edges that failed validation over 30 days",
    "Dream insight: customer onboarding speed predicts 6-month retention",
    "Federation: promoted 4 verified edges to core brain knowledge",
    "Cascade detected: pricing change \u2192 churn increase \u2192 support load (45d)",
    "Memory formed: seasonal patterns in B2B purchasing behavior",
    "Simulated: \u2018What if marketing budget +20%?\u2019 \u2014 predicted 3 cascade paths",
    "Cross-domain link: HR hiring velocity impacts engineering output (60d lag)",
    "Anomaly: unusual correlation between weather data and SaaS signups",
    "Prediction: churn will decrease 8% next quarter at current trajectory",
    "Consolidated 847 signals into 12 verified causal edges overnight",
  ];

  // Pick 3-6 discoveries based on day number for variety
  const count = 3 + (dayNum % 4);
  const offset = (dayNum * 3) % allDiscoveries.length;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(allDiscoveries[(offset + i) % allDiscoveries.length]);
  }
  return picked;
}

function generateActiveRegions(dayNum: number): string[] {
  const allRegions = [
    "perception",
    "memory",
    "reasoning",
    "emotional",
    "simulation",
    "subconscious",
    "instinct",
    "reflexes",
  ];
  // More regions active as brain matures
  const count = Math.min(allRegions.length, 5 + Math.floor(dayNum / 10));
  return allRegions.slice(0, count);
}

// ─── Main hook ─────────────────────────────────────────────────

export function useBrainData(): BrainHealth {
  const [health, setHealth] = useState<BrainHealth>(() => {
    const simulated = generateSimulatedSnapshots();
    return {
      latest: simulated[simulated.length - 1],
      history: simulated,
      ageDays: 30,
      growthRate: 15,
      isLive: false,
    };
  });

  useEffect(() => {
    if (!supabase) return; // No Supabase configured — stay on simulated data

    let cancelled = false;

    async function fetchSnapshots() {
      try {
        const { data, error } = await supabase!
          .from("brain_daily_snapshots")
          .select("*")
          .eq("organization_id", CORE_BRAIN_ORG_ID)
          .order("snapshot_date", { ascending: true })
          .limit(90); // Last 90 days max

        if (error || !data || data.length === 0) {
          // No data yet — keep simulated
          return;
        }

        if (cancelled) return;

        const snapshots = data as BrainDailySnapshot[];
        const latest = snapshots[snapshots.length - 1];
        const oldest = snapshots[0];

        // Calculate age in days
        const ageDays = Math.ceil(
          (new Date(latest.snapshot_date).getTime() -
            new Date(oldest.snapshot_date).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;

        // Calculate growth rate (avg new connections over last 7 days)
        const last7 = snapshots.slice(-7);
        const growthRate =
          last7.length > 0
            ? Math.round(
                last7.reduce((sum, s) => sum + s.new_connections, 0) /
                  last7.length
              )
            : 0;

        setHealth({
          latest,
          history: snapshots,
          ageDays,
          growthRate,
          isLive: true,
        });
      } catch {
        // Network error — stay on simulated
      }
    }

    fetchSnapshots();

    // Refresh every 5 minutes
    const interval = setInterval(fetchSnapshots, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return health;
}
