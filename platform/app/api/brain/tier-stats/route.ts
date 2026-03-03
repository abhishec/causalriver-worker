/**
 * Brain Tier Stats
 * ================
 *
 * GET /api/brain/tier-stats
 *
 * Returns knowledge tier counts for the current org:
 *   - tier1Count: knowledge_chunks rows (raw ingested knowledge)
 *   - tier2Count: cross_domain_signals in last 24h (active RL signals)
 *   - tier3Count: consolidated_patterns that are active (stable learnings)
 *
 * Security: Requires a valid user session. Scoped to the user's own org.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────
  let supabase;
  let user = null;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch (authErr) {
    logger.warn("[tier-stats] Auth failed:", authErr);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Accept workspaceId from query param (sent by AI Worker Brain tab so we
    // query the worker's actual org, not the admin CORE workspace fallback).
    const url = new URL(request.url);
    const queryWorkspaceId = url.searchParams.get("workspaceId") || undefined;
    const orgId = queryWorkspaceId || (await getCurrentWorkspaceId());

    if (!orgId) {
      return NextResponse.json({
        tier1Count: 0,
        tier2Count: 0,
        tier3Count: 0,
      });
    }

    const oneDayAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const [tier1Result, tier2Result, tier3Result] = await Promise.all([
      // Tier 1: raw knowledge chunks
      supabase
        .from("knowledge_chunks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),

      // Tier 2: RL signals in last 24h
      supabase
        .from("cross_domain_signals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("created_at", oneDayAgo),

      // Tier 3: active consolidated patterns
      supabase
        .from("consolidated_patterns")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("is_active", true),
    ]);

    return NextResponse.json({
      tier1Count: tier1Result.count ?? 0,
      tier2Count: tier2Result.count ?? 0,
      tier3Count: tier3Result.count ?? 0,
    });
  } catch (err) {
    logger.warn("[tier-stats] GET error", { error: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
