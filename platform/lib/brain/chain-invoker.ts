/**
 * Lambda Chain Invoker
 *
 * Instead of one 8-hour Lambda (impossible on AWS Amplify), this module
 * chains N×75s Lambdas. Each Lambda:
 *   1. Loads a DeepCheckpoint from DB
 *   2. Runs the agent until ~75s elapsed
 *   3. Calls saveDeepCheckpoint() to persist full conversation state
 *   4. Calls chainContinuation() to create a NEW child job pointing to
 *      the same work
 *   5. Returns — parent job becomes 'paused', child job is 'pending'
 *
 * The next process-jobs cron tick (every 10 min) picks up the child job
 * and repeats the cycle. Result: unlimited execution time via DB-backed
 * continuations without any new infrastructure.
 *
 * Safety limits:
 *   - MAX_CHAIN_DEPTH = 20 → caps at 20 × 75s = 25 minutes of agent work
 *   - At max depth the job is failed gracefully with a clear error message
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/** 75 seconds — leaves a 15s safety margin before the 90s Lambda kill. */
export const LAMBDA_BUDGET_MS = 75_000;

/**
 * Maximum chain depth before we give up and fail the job.
 * 600 hops × 75s = 12.5 hours of wall-clock agent work.
 * Supports long-running enterprise sessions (12h+).
 * Per-job cost control (maxCostUsd in payload) provides budget guardrails.
 */
export const MAX_CHAIN_DEPTH = 600;

/**
 * Returns true when the Lambda should stop and hand off to a continuation.
 * Call this in your inner agent loop:
 *
 *   const startedAt = Date.now();
 *   for (const ticket of tickets) {
 *     if (await shouldChain(startedAt)) {
 *       await saveDeepCheckpoint(...);
 *       await chainContinuation(...);
 *       return; // return from handler — Lambda exits cleanly
 *     }
 *     await processTicket(ticket);
 *   }
 *
 * @param startedAt  Timestamp (Date.now()) when the current Lambda started
 * @param budgetMs   Optional override — defaults to LAMBDA_BUDGET_MS (75 000ms).
 *                   Useful in tests or when a shorter window is needed.
 */
export function shouldChain(startedAt: number, budgetMs: number = LAMBDA_BUDGET_MS): boolean {
  return Date.now() - startedAt > budgetMs;
}

/**
 * Check if a job has exceeded its cost budget.
 * Call this alongside shouldChain() to enforce per-job spending limits.
 *
 * @param accumulatedCostUsd  Total cost accumulated so far for this job chain
 * @param maxCostUsd          Budget cap from agent_queue.payload.maxCostUsd (optional)
 * @returns true if the budget is exceeded and the job should stop chaining
 */
export function isCostBudgetExceeded(accumulatedCostUsd: number, maxCostUsd?: number): boolean {
  if (!maxCostUsd || maxCostUsd <= 0) return false;
  if (accumulatedCostUsd > maxCostUsd) {
    logger.warn(`[chain-invoker] Cost budget exceeded: $${accumulatedCostUsd.toFixed(4)} > $${maxCostUsd}`);
    return true;
  }
  return false;
}

/**
 * Create a child job in agent_queue that will continue the current job
 * from the saved checkpoint.
 *
 * The child job:
 *   - has agent_type = 'chain-continuation'
 *   - has task_type = 'resume'
 *   - carries the checkpoint in its payload
 *   - has chain_parent_id = parentJobId (for lineage tracking)
 *   - has chain_depth = parentChainDepth + 1
 *   - is inserted with status = 'pending' so the next cron tick picks it up
 *
 * Throws if the DB insert fails — caller should catch and log before
 * returning a 500. The parent job must be set to 'paused' BEFORE calling
 * this so the watchdog doesn't mark it stale.
 *
 * @param supabase   Service-role client (needs INSERT on agent_queue)
 * @param parentJobId UUID of the Lambda that is about to exit
 * @param checkpoint  The serialised DeepCheckpoint (from saveDeepCheckpoint)
 * @param parentChainDepth The chain_depth of the parent job
 * @returns UUID of the newly created child job
 */
export async function chainContinuation(
  supabase: SupabaseClient,
  parentJobId: string,
  checkpoint: object,
  parentChainDepth: number
): Promise<string> {
  if (parentChainDepth >= MAX_CHAIN_DEPTH) {
    throw new Error(
      `[chain-invoker] Max chain depth (${MAX_CHAIN_DEPTH}) reached for job ${parentJobId}. ` +
      `This job has been running for ~${Math.round((parentChainDepth * LAMBDA_BUDGET_MS) / 60_000)} minutes. ` +
      `Stopping to prevent infinite execution.`
    );
  }

  // Look up the parent's org so we don't hard-code CORE_WORKSPACE_ID fallback
  const { data: parent, error: lookupError } = await supabase
    .from("agent_queue")
    .select("organization_id")
    .eq("id", parentJobId)
    .single();

  if (lookupError || !parent?.organization_id) {
    throw new Error(
      `[chain-invoker] Could not look up organization_id for parent job ${parentJobId}: ${lookupError?.message}`
    );
  }

  const { data: childJob, error: insertError } = await supabase
    .from("agent_queue")
    .insert({
      organization_id: parent.organization_id,
      agent_type: "chain-continuation",
      task_type: "resume",
      priority: 10, // High priority so continuations don't queue behind new jobs
      payload: { parentJobId, checkpoint },
      status: "pending",
      chain_parent_id: parentJobId,
      chain_depth: parentChainDepth + 1,
    })
    .select("id")
    .single();

  if (insertError || !childJob?.id) {
    throw new Error(
      `[chain-invoker] Failed to create chain continuation for ${parentJobId}: ${insertError?.message}`
    );
  }

  logger.warn("[chain-invoker] Created continuation job", {
    parentJobId,
    childJobId: childJob.id,
    chainDepth: parentChainDepth + 1,
    maxDepth: MAX_CHAIN_DEPTH,
  });

  return childJob.id;
}

/**
 * Convenience wrapper: save checkpoint, create child job, return child ID.
 *
 * Call this in your agent when shouldChain() returns true:
 *
 *   if (shouldChain(startedAt)) {
 *     const childId = await checkpointAndChain(supabase, jobId, {
 *       phase: 'processing_tickets',
 *       conversationHistory,
 *       completedTickets,
 *       ...
 *     }, chainDepth);
 *     return { chained: true, childJobId: childId };
 *   }
 */
export async function checkpointAndChain(
  supabase: SupabaseClient,
  jobId: string,
  checkpointData: object,
  chainDepth: number
): Promise<string> {
  // Mark parent as paused with checkpoint (saveDeepCheckpoint does this)
  const { error: pauseError } = await supabase
    .from("agent_queue")
    .update({
      checkpoint_data: checkpointData,
      heartbeat_at: new Date().toISOString(),
      status: "paused",
    })
    .eq("id", jobId);

  if (pauseError) {
    logger.error("[chain-invoker] Failed to pause parent job before chaining", { jobId, pauseError });
    // Continue anyway — child job creation is the critical path
  }

  return chainContinuation(supabase, jobId, checkpointData, chainDepth);
}
