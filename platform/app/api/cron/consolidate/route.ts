/**
 * Cron: Tier 3 Brain Consolidation
 * ==================================
 *
 * GET /api/cron/consolidate
 *   Runs the Tier 3 consolidation pass for ALL organizations that have had
 *   recent agent_queue activity (last 7 days). Processes up to 10 orgs in
 *   parallel via Promise.allSettled.
 *
 * Triggered by:
 *   - Vercel Cron (vercel.json: nightly or on schedule)
 *   - External scheduler (GitHub Actions, crontab)
 *   - Manual admin trigger
 *
 * What it does per org:
 *   1. Fetches high-quality cross_domain_signals (strength >= 0.72, 7-day window)
 *   2. Fetches high-quality prediction_records (quality >= 0.75, 7-day window)
 *   3. Clusters by domain — 3+ events → pattern candidate
 *   4. Upserts patterns into consolidated_patterns (insert or update evidence/confidence)
 *   5. Logs each run to consolidation_runs
 *
 * Security: Protected by CRON_SECRET bearer token. Fails closed if secret is
 * not configured.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  runConsolidation,
  type ConsolidationResult,
} from "@/lib/brain/tier3-consolidation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for all orgs

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Security: Verify cron secret ─────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Require CRON_SECRET in ALL environments. Fail closed if not set.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = getAdminClient();

    // ── Fetch orgs with recent agent_queue activity (last 7 days) ───────────
    const since = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: activeOrgs } = await admin
      .from("agent_queue")
      .select("organization_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    // Deduplicate org IDs, cap at 10 for parallel execution
    const orgIds = [
      ...new Set(
        (activeOrgs ?? [])
          .map((r: { organization_id: string }) => r.organization_id)
          .filter(Boolean)
      ),
    ].slice(0, 10) as string[];

    if (orgIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active orgs to consolidate",
        orgsProcessed: 0,
      });
    }

    // ── Run consolidation in parallel ────────────────────────────────────────
    const results = await Promise.allSettled(
      orgIds.map((orgId) => runConsolidation(orgId))
    );

    const summary = results.map((r, i) => ({
      orgId: orgIds[i],
      status: r.status,
      ...(r.status === "fulfilled"
        ? r.value
        : { error: String((r as PromiseRejectedResult).reason) }),
    }));

    const totalPromoted = results
      .filter(
        (r): r is PromiseFulfilledResult<ConsolidationResult> =>
          r.status === "fulfilled"
      )
      .reduce((sum, r) => sum + r.value.patternsPromoted, 0);

    logger.warn("[cron/consolidate] Consolidation cron complete", {
      orgsProcessed: orgIds.length,
      totalPatternsPromoted: totalPromoted,
    });

    return NextResponse.json({
      success: true,
      orgsProcessed: orgIds.length,
      totalPatternsPromoted: totalPromoted,
      summary,
    });
  } catch (err) {
    logger.warn("[cron/consolidate] Cron error", { error: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
