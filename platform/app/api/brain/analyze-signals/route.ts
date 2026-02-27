import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { analyzeConnectorSignals } from "@/lib/brain/connector-signal-analyzer";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/brain/analyze-signals
 *
 * Batch-analyzes recent connector signals across all active orgs and stores
 * the derived insights into ai_memory. This is how 100% of connector data
 * becomes brain knowledge — raw events become patterns/trends/risks via LLM.
 *
 * Auth: Bearer CRON_SECRET (same as all other cron endpoints)
 * Called by: brain-refresh.yml on the 4-hour schedule + workflow_dispatch
 *
 * Response:
 *   { orgsProcessed, totalInsights, totalSignals, timestamp }
 */
export async function GET(request: Request) {
  // Auth: same Bearer CRON_SECRET pattern used by all cron endpoints
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !serviceKey) {
    logger.warn("[analyze-signals] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  // Discover all orgs that have had signal activity in the last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: activeOrgs, error: orgsErr } = await admin
    .from("cross_domain_signals")
    .select("organization_id")
    .gte("created_at", since)
    .limit(100);

  if (orgsErr) {
    logger.warn("[analyze-signals] Failed to query active orgs:", orgsErr.message);
    return NextResponse.json(
      { error: "Failed to query active orgs" },
      { status: 500 }
    );
  }

  if (!activeOrgs || activeOrgs.length === 0) {
    return NextResponse.json({
      message: "No active orgs with recent signals",
      orgsProcessed: 0,
      totalInsights: 0,
      totalSignals: 0,
      timestamp: new Date().toISOString(),
    });
  }

  // Deduplicate org IDs (signals table has one row per signal, not per org)
  const uniqueOrgs = [
    ...new Set(activeOrgs.map((r) => r.organization_id as string)),
  ];

  // Process at most 10 orgs per run to stay within Lambda timeout
  const orgsToProcess = uniqueOrgs.slice(0, 10);

  let totalInsights = 0;
  let totalSignals = 0;

  for (const orgId of orgsToProcess) {
    try {
      const result = await analyzeConnectorSignals(admin, orgId, 24);
      totalInsights += result.insightsCreated;
      totalSignals += result.signalsAnalyzed;
    } catch (err) {
      // Non-fatal: log and continue with remaining orgs
      logger.warn(
        `[analyze-signals] org ${orgId} failed (non-fatal):`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  logger.warn(
    `[analyze-signals] Done — ${orgsToProcess.length} orgs, ${totalInsights} insights created from ${totalSignals} signals`
  );

  return NextResponse.json({
    orgsProcessed: orgsToProcess.length,
    totalInsights,
    totalSignals,
    timestamp: new Date().toISOString(),
  });
}
