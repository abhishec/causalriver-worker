/**
 * GET /api/cron/watchdog
 *
 * Stale Job Watchdog — runs every 3 minutes via GitHub Actions.
 *
 * Does two things:
 *
 * 1. STALE RUNNING JOBS
 *    Finds jobs with status='running' whose heartbeat_at is > 3 minutes old
 *    (or null and started_at > 3 minutes old). Marks them as 'failed' with
 *    a clear error message so they can be retried on the next process-jobs tick.
 *    This complements recover_stale_jobs() in process-jobs, which uses a 120s
 *    threshold. The watchdog uses 3 minutes (180s) — slightly more lenient —
 *    and runs independently so stale job recovery is not gated on process-jobs.
 *
 * 2. PAUSED CHAIN CONTINUATIONS
 *    Finds jobs with status='paused' AND chain_parent_id IS NOT NULL whose
 *    heartbeat_at is > 1 minute old. Re-queues them as 'pending' so the chain
 *    continues on the next process-jobs tick.
 *    This handles the edge case where a child job was created but the parent
 *    Lambda crashed before the child's status was set to 'pending'.
 *
 * Auth: Bearer CRON_SECRET header.
 * Schedule: every 3 minutes (see .github/workflows/brain-refresh.yml).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Short cron — just DB queries, no LLM calls

/** Jobs stuck in 'running' for longer than this are considered stale.
 *  90s matches the Lambda kill limit (Lambda max duration is 90s on Amplify SSR).
 *  Any job running for >90s with no heartbeat is definitively dead. */
const STALE_RUNNING_THRESHOLD_SECONDS = 90; // 90 seconds = Lambda kill threshold

/** Paused chain continuations older than this are re-queued. */
const STALE_PAUSED_CHAIN_THRESHOLD_SECONDS = 60; // 1 minute

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: Awaited<ReturnType<typeof createServiceClient>>;
  try {
    supabase = await createServiceClient();
  } catch (err) {
    logger.error("[watchdog] Failed to create service client", { err });
    return NextResponse.json({ error: "Service client unavailable" }, { status: 401 });
  }

  const results = {
    staleRunningRecovered: 0,
    pausedChainsRequeued: 0,
    errors: [] as string[],
  };

  // ── 1. Recover stale running jobs ───────────────────────────────────────
  try {
    const staleThreshold = new Date(
      Date.now() - STALE_RUNNING_THRESHOLD_SECONDS * 1000
    ).toISOString();

    const { data: staleJobs, error: fetchError } = await supabase
      .from("agent_queue")
      .select("id, heartbeat_at, started_at")
      .eq("status", "running")
      .or(
        `heartbeat_at.lt.${staleThreshold},` +
        `and(heartbeat_at.is.null,started_at.lt.${staleThreshold})`
      );

    if (fetchError) {
      results.errors.push(`Failed to query stale running jobs: ${fetchError.message}`);
    } else if (staleJobs && staleJobs.length > 0) {
      const staleIds = staleJobs.map((j: { id: string }) => j.id);

      const { error: updateError } = await supabase
        .from("agent_queue")
        .update({
          status: "failed",
          error_message: `watchdog: no heartbeat for ${STALE_RUNNING_THRESHOLD_SECONDS}s — Lambda likely killed`,
          completed_at: new Date().toISOString(),
        })
        .in("id", staleIds);

      if (updateError) {
        results.errors.push(`Failed to mark stale jobs failed: ${updateError.message}`);
      } else {
        results.staleRunningRecovered = staleIds.length;
        logger.warn("[watchdog] Recovered stale running jobs", {
          count: staleIds.length,
          jobIds: staleIds,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`Stale running jobs check threw: ${msg}`);
    logger.error("[watchdog] Stale running jobs check failed", { err });
  }

  // ── 2. Re-queue stale paused chain continuations ─────────────────────────
  try {
    const pausedThreshold = new Date(
      Date.now() - STALE_PAUSED_CHAIN_THRESHOLD_SECONDS * 1000
    ).toISOString();

    const { data: pausedChains, error: fetchError } = await supabase
      .from("agent_queue")
      .select("id, chain_parent_id, heartbeat_at")
      .eq("status", "paused")
      .not("chain_parent_id", "is", null)
      .or(
        `heartbeat_at.lt.${pausedThreshold},` +
        `heartbeat_at.is.null`
      );

    if (fetchError) {
      results.errors.push(`Failed to query paused chains: ${fetchError.message}`);
    } else if (pausedChains && pausedChains.length > 0) {
      const chainIds = pausedChains.map((j: { id: string }) => j.id);

      const { error: updateError } = await supabase
        .from("agent_queue")
        .update({
          status: "pending",
          // Clear heartbeat so the next Lambda picks it up fresh
          heartbeat_at: null,
        })
        .in("id", chainIds);

      if (updateError) {
        results.errors.push(`Failed to re-queue paused chains: ${updateError.message}`);
      } else {
        results.pausedChainsRequeued = chainIds.length;
        logger.warn("[watchdog] Re-queued paused chain continuations", {
          count: chainIds.length,
          jobIds: chainIds,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.errors.push(`Paused chains re-queue threw: ${msg}`);
    logger.error("[watchdog] Paused chains re-queue failed", { err });
  }

  const status = results.errors.length > 0 ? 207 : 200;
  return NextResponse.json({ ok: true, ...results }, { status });
}
