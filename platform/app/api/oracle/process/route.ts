import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import {
  createOutcomeOracle,
  createCausalMethodBandit,
  type OracleProcessingResult,
} from "@nexus-ai/memory-stack";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/oracle/process
 *
 * Gap 4: Autonomous Outcome Oracle — batch prediction verification.
 *
 * Called:
 *   1. Automatically by each connector sync (GitHub, Slack, Jira)
 *   2. By the daily scheduled job (job:oracle)
 *   3. Manually from the admin panel for on-demand verification
 *
 * Fetches recent signals for the org, runs oracle.processBatch(),
 * and autonomously rewards/penalises the UCB1 bandit arms based on
 * whether predictions were correct.
 *
 * Body: {
 *   organizationId?: string;       // defaults to current org
 *   lookbackHours?: number;        // how far back to fetch signals (default: 48)
 *   sourceDomains?: string[];      // filter signals by domain (default: all)
 *   dryRun?: boolean;              // if true, don't update bandit state
 * }
 *
 * Returns: OracleProcessingResult with verified/expired/pending counts and avg reward
 */
export async function POST(request: Request) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    const body = await request.json().catch(() => ({}));
    const lookbackHours: number = body.lookbackHours ?? 48;
    const sourceDomains: string[] | undefined = body.sourceDomains;
    const dryRun: boolean = body.dryRun ?? false;

    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

    // 2. Fetch recent signals for oracle verification
    let signalQuery = service
      .from("cross_domain_signals")
      .select(
        "source_domain, signal_type, signal_value, signal_timestamp, organization_id, entity_type, entity_id"
      )
      .eq("organization_id", workspaceId)
      .gte("signal_timestamp", since)
      .order("signal_timestamp", { ascending: false })
      .limit(2000);

    if (sourceDomains && sourceDomains.length > 0) {
      signalQuery = signalQuery.in("source_domain", sourceDomains);
    }

    const { data: signals, error: signalError } = await signalQuery;

    if (signalError) {
      logger.error("[Oracle] Signal fetch error:", signalError);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    if (!signals || signals.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No signals found for oracle verification",
        signalsProcessed: 0,
        predictionsChecked: 0,
        predictionsVerified: 0,
        predictionsExpired: 0,
        predictionsPending: 0,
        averageReward: 0,
      });
    }

    // 3. Create bandit + oracle
    const bandit = dryRun
      ? undefined // Don't update bandit state in dry-run mode
      : createCausalMethodBandit({ supabase: service, organizationId: workspaceId });

    const oracle = createOutcomeOracle({
      supabase: service,
      bandit,
      organizationId: workspaceId,
    });

    // 4. Load pending predictions from DB
    await oracle.loadFromSupabase(workspaceId);
    const pendingBefore = oracle.getPendingPredictions().length;

    if (pendingBefore === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending predictions to verify",
        signalsProcessed: signals.length,
        predictionsChecked: 0,
        predictionsVerified: 0,
        predictionsExpired: 0,
        predictionsPending: 0,
        averageReward: 0,
      });
    }

    // 5. Run oracle verification
    const startMs = Date.now();
    const result: OracleProcessingResult = await oracle.processBatch(signals);

    // 6. Persist updated bandit state (arm scores updated from oracle rewards)
    if (bandit && !dryRun) {
      await bandit.persistState().catch((err: any) => {
        logger.warn("[Oracle] Bandit persist error (non-fatal):", err.message);
      });
    }

    // 7. Prune completed/expired predictions to keep table clean
    if (!dryRun) {
      oracle.pruneCompleted();
    }

    // 8. Get method leaderboard (which causal methods are winning)
    const methodLeaderboard = bandit ? bandit.getMethodLeaderboard() : [];

    const duration_ms = Date.now() - startMs;

    logger.info(
      `[Oracle] Processed ${signals.length} signals: ${result.predictionsVerified} verified, ` +
      `${result.predictionsExpired} expired, ${result.predictionsPending} pending, ` +
      `bandit rewards: ${result.banditRewardsGiven ?? 0} (${duration_ms}ms)`
    );

    return NextResponse.json({
      success: true,
      signalsProcessed: signals.length,
      predictionsChecked: result.predictionsChecked,
      predictionsVerified: result.predictionsVerified,
      predictionsExpired: result.predictionsExpired,
      predictionsPending: result.predictionsPending,
      banditRewardsGiven: result.banditRewardsGiven ?? 0,
      verifications: result.verifications ?? [],
      methodLeaderboard,
      dryRun,
      duration_ms,
    });
  } catch (err: any) {
    logger.error("[Oracle] Process error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/oracle/process
 *
 * Returns current oracle stats for the org: pending predictions,
 * accuracy rate, method leaderboard, and recent verifications.
 */
export async function GET(_request: Request) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    const bandit = createCausalMethodBandit({ supabase: service, organizationId: workspaceId });
    const oracle = createOutcomeOracle({ supabase: service, bandit, organizationId: workspaceId });

    await oracle.loadFromSupabase(workspaceId);

    const stats = oracle.getAccuracyStats();
    const pending = oracle.getPendingPredictions();
    const leaderboard = bandit.getMethodLeaderboard();

    return NextResponse.json({
      pending: pending.length,
      accuracy: stats,
      methodLeaderboard: leaderboard,
      pendingPredictions: pending.map((p) => ({
        id: p.predictionId,
        sourceDomain: p.sourceDomain,
        targetDomain: p.targetDomain,
        watchMetric: p.watchMetric,
        predictedDirection: p.predictedDirection,
        predictedMagnitude: p.predictedMagnitude,
        verifyAfter: p.verifyAfter,
        expiresAt: p.expiresAt,
        discoveryMethod: p.discoveryMethod,
      })),
    });
  } catch (err: any) {
    logger.error("[Oracle] GET error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
