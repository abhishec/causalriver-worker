export const dynamic = "force-dynamic";

/**
 * GET /api/brain/metrics
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Response time performance metrics for the last 24 hours.
 * Sourced from an in-memory rolling window populated by Next.js middleware.
 *
 * Auth: platform admin only (contains operational data).
 *
 * Response 200:
 *   {
 *     windowMs: number,            // observation window in ms (24h)
 *     totalRequests: number,       // requests recorded in window
 *     topSlowRoutes: RouteStats[], // top 10 by p95 descending
 *     allRoutes: RouteStats[],     // all routes with stats
 *     generatedAt: string,         // ISO timestamp
 *     note: string                 // caveat about Lambda cold-start resets
 *   }
 *
 * Note: The rolling window is module-level and resets on Lambda cold start.
 * For production-grade APM, integrate Datadog/New Relic. This endpoint
 * provides lightweight operational visibility without external dependencies.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeRouteStats } from "@/lib/request-metrics";
import { logger } from "@/lib/logger";

export async function GET(_request: NextRequest) {
  // ── Auth: platform admin only ─────────────────────────────────────────────
  let user = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = data.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const service = await createServiceClient();

    // Verify platform admin
    const { data: adminCheck } = await service
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .limit(1)
      .maybeSingle();

    if (!adminCheck) {
      return NextResponse.json({ error: "Platform admin required" }, { status: 403 });
    }

    // ── Compute stats from the rolling window ─────────────────────────────
    const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
    const allRoutes = computeRouteStats(WINDOW_MS);
    const totalRequests = allRoutes.reduce((sum, r) => sum + r.count, 0);
    const topSlowRoutes = allRoutes.slice(0, 10);

    return NextResponse.json({
      windowMs: WINDOW_MS,
      totalRequests,
      topSlowRoutes,
      allRoutes,
      generatedAt: new Date().toISOString(),
      note: "In-memory rolling window. Resets on Lambda cold start. Max 1000 entries.",
    });
  } catch (err) {
    logger.error("[brain/metrics] Unexpected error:", {
      error: err instanceof Error ? err.message : String(err),
      route: "/api/brain/metrics",
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
