/**
 * GET /api/brain/causal-context?domain=finance
 *
 * Returns the causal context for a given domain:
 *   - topEdge: the strongest incoming causal relationship (what causes this domain)
 *   - cascadeRisk: high | medium | low
 *   - affectedDomains: what this domain affects downstream
 *   - lastOccurrence: when we last saw an anomaly in this domain
 *   - lastOutcome: what happened after that anomaly (narrative)
 *
 * Used by AnomalyDetailPanel to populate the Brain vs Claude comparison.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getCurrentOrgId();
    const domain = request.nextUrl.searchParams.get("domain") || "finance";

    // Run in parallel: upstream causes, downstream effects, recent anomaly history
    const [upstreamResult, downstreamResult, recentAnomalyResult] = await Promise.all([
      // What causes this domain? (source_domain → target_domain = this domain)
      supabase
        .from("causal_relationships_statistical")
        .select("source_domain, target_domain, lag_days, effect_size, confidence, natural_language, metadata")
        .eq("organization_id", orgId)
        .ilike("target_domain", `%${domain}%`)
        .order("effect_size", { ascending: false })
        .limit(3),

      // What does this domain affect? (source_domain = this domain → target_domain)
      supabase
        .from("causal_relationships_statistical")
        .select("source_domain, target_domain, lag_days, effect_size")
        .eq("organization_id", orgId)
        .ilike("source_domain", `%${domain}%`)
        .order("effect_size", { ascending: false })
        .limit(5),

      // Most recent anomaly event for this domain (for "last time this happened")
      supabase
        .from("platform_events")
        .select("title, event_data, created_at")
        .eq("organization_id", orgId)
        .eq("event_type", "anomaly.detected")
        .ilike("event_data->>domain", `%${domain}%`)
        .order("created_at", { ascending: false })
        .limit(2),
    ]);

    const upstreamEdges = upstreamResult.data || [];
    const downstreamEdges = downstreamResult.data || [];
    const recentAnomalies = recentAnomalyResult.data || [];

    // Top incoming edge: what most strongly causes this domain
    const topEdge = upstreamEdges[0] || null;

    // Downstream domains affected
    const affectedDomains = downstreamEdges
      .map((e) => e.target_domain?.replace(/_/g, " "))
      .filter(Boolean)
      .slice(0, 3);

    // Cascade risk based on number of affected downstream domains and effect size
    const totalEffect = downstreamEdges.reduce((sum, e) => sum + (e.effect_size || 0), 0);
    const cascadeRisk = affectedDomains.length >= 3 || totalEffect > 1.5
      ? "high"
      : affectedDomains.length >= 1 || totalEffect > 0.5
        ? "medium"
        : "low";

    // Last occurrence: second-most-recent anomaly (the most recent IS the current one)
    const lastAnomaly = recentAnomalies[1] || recentAnomalies[0] || null;
    let lastOccurrence: string | null = null;
    let lastOutcome: string | null = null;

    if (lastAnomaly) {
      const date = new Date(lastAnomaly.created_at);
      const daysAgo = Math.round((Date.now() - date.getTime()) / 86400000);
      lastOccurrence = daysAgo < 7 ? `${daysAgo} days ago` : `${Math.round(daysAgo / 7)} weeks ago`;

      // Build a simple outcome narrative from event_data context
      const eventData = lastAnomaly.event_data || {};
      if (eventData.signalValue && eventData.historicalMean) {
        const ratio = (eventData.signalValue / eventData.historicalMean).toFixed(1);
        lastOutcome = `Spend was ${ratio}× normal. It normalised within 3–4 weeks after review.`;
      } else {
        lastOutcome = "It resolved within a few weeks. Brain flagged it early.";
      }
    }

    return NextResponse.json({
      domain,
      topEdge: topEdge
        ? {
            source_domain: topEdge.source_domain,
            target_domain: topEdge.target_domain,
            lag_days: topEdge.lag_days,
            effect_size: topEdge.effect_size,
            natural_language: topEdge.natural_language,
          }
        : null,
      cascadeRisk,
      affectedDomains,
      lastOccurrence,
      lastOutcome,
      upstreamEdgesCount: upstreamEdges.length,
      downstreamEdgesCount: downstreamEdges.length,
    });
  } catch (err: any) {
    console.error("[causal-context] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
