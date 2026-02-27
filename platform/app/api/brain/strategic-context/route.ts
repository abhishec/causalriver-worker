/**
 * GET /api/brain/strategic-context
 * ==================================
 *
 * Returns the cognitive planner's current strategic state for dashboard display.
 * Includes:
 *   - Active strategic objectives (from last planner cycle)
 *   - High-demand domains (what users are actually querying)
 *   - Domain quality scores (RL confidence averages)
 *   - Recovery mode status
 *   - Top episodic reflections (planner's verbal memory)
 *
 * Auth: session required (no API key needed — read-only dashboard data)
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  // ── Auth: 500→401 Lambda pattern ──────────────────────────────────────────
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let service;
  try {
    service = await createServiceClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orgId: string;
  try {
    orgId = await getCurrentWorkspaceId();
  } catch {
    return NextResponse.json({ error: "No workspace context" }, { status: 400 });
  }

  // ── Parallel fetch: strategic state + demand + quality + recovery ─────────
  const [
    plannerWorkingMemResult,
    plannerEpisodicResult,
    demandResult,
    qualityResult,
    recoveryResult,
  ] = await Promise.allSettled([
    // Last planner cycle working memory → current strategic decisions
    service
      .from("ai_memory")
      .select("content, created_at, metadata")
      .eq("organization_id", orgId)
      .eq("domain", "cognitive-planner")
      .eq("memory_type", "working")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Last 3 episodic reflections → lessons learned
    service
      .from("ai_memory")
      .select("content, created_at, metadata")
      .eq("organization_id", orgId)
      .eq("domain", "cognitive-planner")
      .eq("memory_type", "episodic")
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3),

    // High-demand domains: count prediction_records per domain last 24h
    service
      .from("prediction_records")
      .select("domain_type")
      .eq("organization_id", orgId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(300),

    // Domain quality: avg confidence per domain last 24h
    service
      .from("prediction_records")
      .select("domain_type, confidence")
      .eq("organization_id", orgId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(300),

    // Recovery mode: any recovery_mode markers in last 2h
    service
      .from("ai_memory")
      .select("content, created_at, metadata")
      .eq("organization_id", orgId)
      .eq("memory_type", "recovery_mode")
      .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // ── Parse working memory → current decisions ──────────────────────────────
  type Decision = { domain: string; priority: string; rationale: string };
  let currentDecisions: Decision[] = [];
  let lastCycleAt: string | null = null;
  let coverageGaps: string[] = [];

  const plannerMem = plannerWorkingMemResult.status === "fulfilled"
    ? plannerWorkingMemResult.value.data
    : null;

  if (plannerMem?.content) {
    try {
      const parsed = JSON.parse(plannerMem.content as string) as {
        decisions?: Decision[];
        coverageGaps?: string[];
        assessedAt?: string;
      };
      currentDecisions = parsed.decisions ?? [];
      coverageGaps = parsed.coverageGaps ?? [];
      lastCycleAt = (plannerMem.created_at as string | null) ?? (parsed.assessedAt ?? null);
    } catch { /* non-fatal */ }
  }

  // ── Parse episodic reflections ─────────────────────────────────────────────
  const reflections: Array<{ text: string; successCount: number; failCount: number; at: string }> = [];
  const episodicRows = plannerEpisodicResult.status === "fulfilled"
    ? (plannerEpisodicResult.value.data ?? [])
    : [];
  for (const row of episodicRows) {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    reflections.push({
      text: row.content as string,
      successCount: (meta.successCount as number | null) ?? 0,
      failCount: (meta.failCount as number | null) ?? 0,
      at: row.created_at as string,
    });
  }

  // ── Parse demand signals ───────────────────────────────────────────────────
  const demandRows = demandResult.status === "fulfilled"
    ? (demandResult.value.data ?? [])
    : [];
  const demandCounts: Record<string, number> = {};
  for (const row of demandRows) {
    const d = (row as { domain_type: string | null }).domain_type;
    if (d) demandCounts[d] = (demandCounts[d] ?? 0) + 1;
  }
  const demandSignals = Object.entries(demandCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([domain, count]) => ({ domain, queryCount: count }));

  // ── Parse domain quality ───────────────────────────────────────────────────
  const qualityRows = qualityResult.status === "fulfilled"
    ? (qualityResult.value.data ?? [])
    : [];
  const qualityAgg: Record<string, { sum: number; count: number }> = {};
  for (const row of qualityRows) {
    const d = (row as { domain_type: string | null }).domain_type;
    const c = (row as { confidence: number | null }).confidence ?? 0;
    if (d) {
      if (!qualityAgg[d]) qualityAgg[d] = { sum: 0, count: 0 };
      qualityAgg[d].sum += c;
      qualityAgg[d].count++;
    }
  }
  const domainQuality = Object.entries(qualityAgg)
    .map(([domain, { sum, count }]) => ({
      domain,
      avgConfidence: Math.round((sum / count) * 100) / 100,
      sampleCount: count,
    }))
    .sort((a, b) => b.avgConfidence - a.avgConfidence);

  // ── Parse recovery mode ────────────────────────────────────────────────────
  const recoveryRows = recoveryResult.status === "fulfilled"
    ? (recoveryResult.value.data ?? [])
    : [];
  const recoveryMode = recoveryRows.length > 0;
  const recoveryEvents = recoveryRows.map(row => {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    return {
      domain: (meta.triggeredDomain as string | null) ?? "unknown",
      suppressUntil: (meta.suppressUntil as string | null) ?? null,
      at: row.created_at as string,
    };
  });

  logger.info(
    `[StrategicContext] org=${orgId} decisions=${currentDecisions.length} demand=${demandSignals.length} recovery=${recoveryMode}`
  );

  return NextResponse.json({
    orgId,
    lastCycleAt,
    recoveryMode,
    recoveryEvents,
    currentDecisions,
    coverageGaps: coverageGaps.slice(0, 8),
    demandSignals,
    domainQuality,
    reflections,
    // Convenience: sorted domain list by (demand + quality) composite score
    topPriorityDomains: demandSignals
      .map(d => {
        const q = domainQuality.find(q => q.domain === d.domain);
        return {
          domain: d.domain,
          queryCount: d.queryCount,
          avgConfidence: q?.avgConfidence ?? null,
          // Low confidence + high demand = highest priority (needs improvement AND users want it)
          priorityScore: d.queryCount * (1 - (q?.avgConfidence ?? 0.5)),
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 5),
  });
}
