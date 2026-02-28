/**
 * GET /api/brain/workspace-overview
 *
 * Aggregates all brain layer data for the workspace admin view.
 * Shows L25-L29 service health, learning velocity, federated knowledge count,
 * and per-domain quality trends from prediction_records.
 *
 * Used by: /brain page (ADR-024 workspace overview)
 *
 * Response:
 * {
 *   serviceHealth: Array<{ service_type, status, context_string, updated_at }>,
 *   knowledgeCount: number,
 *   qualityScore7d: number,          // avg confidence 0–1 over last 7 days
 *   learningVelocity: number,        // RL signals in last 24h
 *   totalSignals7d: number,          // prediction_records count last 7d
 *   domainTrends: Array<{ domain, avgQuality, sampleCount }>,
 *   updatedAt: string,
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  // ── Auth: wrap separately so auth errors always return 401, never 500 ──
  let supabase;
  let user = null;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch (authErr) {
    logger.warn("[workspace-overview] Auth failed:", {
      error: (authErr as Error)?.message ?? String(authErr),
      route: "/api/brain/workspace-overview",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orgId = "";
  try {
    orgId = await getCurrentWorkspaceId();
  } catch {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  if (!orgId) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    serviceHealthResult,
    knowledgeCountResult,
    rlStatsResult,
    recentSignalsResult,
    domainQualityResult,
  ] = await Promise.allSettled([
    // L25-L29: service_health rows for this workspace
    supabase
      .from("service_health")
      .select("service_type, status, context_string, updated_at")
      .eq("organization_id", orgId),

    // Federated knowledge count (global + workspace-scoped)
    supabase
      .from("federated_knowledge")
      .select("id", { count: "exact", head: true })
      .or(`organization_id.is.null,organization_id.eq.${orgId}`),

    // RL stats: prediction_records last 7d for overall quality score
    supabase
      .from("prediction_records")
      .select("domain, confidence, success")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgo)
      .limit(500),

    // Recent RL signals last 24h — used as learning velocity proxy
    supabase
      .from("cross_domain_signals")
      .select("signal_type, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", oneDayAgo),

    // Per-domain quality: prediction_records last 7d (separate query, smaller limit)
    supabase
      .from("prediction_records")
      .select("domain, confidence")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgo)
      .limit(200),
  ]);

  // ── Extract results with safe fallbacks ───────────────────────────────────

  const serviceHealth =
    serviceHealthResult.status === "fulfilled"
      ? (serviceHealthResult.value.data ?? [])
      : [];

  const knowledgeCount =
    knowledgeCountResult.status === "fulfilled"
      ? (knowledgeCountResult.value.count ?? 0)
      : 0;

  const rlStats =
    rlStatsResult.status === "fulfilled"
      ? (rlStatsResult.value.data ?? [])
      : [];

  const recentSignals =
    recentSignalsResult.status === "fulfilled"
      ? (recentSignalsResult.value.data ?? [])
      : [];

  const domainQuality =
    domainQualityResult.status === "fulfilled"
      ? (domainQualityResult.value.data ?? [])
      : [];

  // ── Compute per-domain quality averages ───────────────────────────────────

  const domainMap: Record<string, { total: number; count: number }> = {};
  for (const row of domainQuality) {
    if (!row.domain) continue;
    const d = domainMap[row.domain] ?? { total: 0, count: 0 };
    d.total += row.confidence ?? 0;
    d.count++;
    domainMap[row.domain] = d;
  }

  const domainTrends = Object.entries(domainMap)
    .map(([domain, { total, count }]) => ({
      domain,
      avgQuality: Math.round((total / count) * 100) / 100,
      sampleCount: count,
    }))
    .sort((a, b) => b.sampleCount - a.sampleCount)
    .slice(0, 10);

  // ── Aggregate scalars ─────────────────────────────────────────────────────

  // Learning velocity: count of RL signals in the last 24h
  const learningVelocity = recentSignals.length;

  // Overall quality score (avg confidence, 7d)
  const qualityScore7d =
    rlStats.length > 0
      ? Math.round(
          (rlStats.reduce((s, r) => s + (r.confidence ?? 0), 0) / rlStats.length) * 100
        ) / 100
      : 0;

  logger.info(
    `[workspace-overview] org=${orgId} serviceHealth=${serviceHealth.length} knowledge=${knowledgeCount} quality7d=${qualityScore7d} velocity24h=${learningVelocity}`
  );

  return NextResponse.json({
    serviceHealth,
    knowledgeCount,
    qualityScore7d,
    learningVelocity,
    totalSignals7d: rlStats.length,
    domainTrends,
    updatedAt: new Date().toISOString(),
  });
}
