/**
 * SE-aaS Job Worker
 * ===================
 * Processes pending SE-aaS jobs from the agent_queue table.
 *
 * Flow:
 * 1. Poll agent_queue for pending jobs (agent_type = 'se-aas')
 * 2. Claim job (status → 'running')
 * 3. Execute domain via domain-executor
 * 4. If domain fails OR returns empty: trigger Recovery Agent before marking failed
 * 5. Save artifact + update job (status → 'success', 'recovered', or 'error')
 *
 * Week 7: Priority-aware worker types (light/heavy/mixed).
 * Heavy domains (incident-diagnosis, tdd-code-generator, etc.) are separated
 * from light domains to prevent backpressure.
 *
 * Recovery Agent: Never surfaces a bare error to the user — always attempts
 * an alternative domain or graceful degradation first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { executeAndCompleteJob } from "./job-queue";
import { executeDomain } from "./domain-executor";
import { recordJobOutcome } from "@/lib/rl/outcome-recorder";
import { attemptRecovery } from "@/lib/brain/recovery-agent";
import { checkAndQueueWriteback } from "@/lib/connectors/writeback-dispatcher";
import {
  checkAndStartWaitingJobs,
  checkAndStartBrainDependentJobs,
  BRAIN_POPULATION_TYPES,
} from "@/lib/brain/agent-orchestrator";
import { executeCodeAgentJob, type CodeAgentPayload } from "@/lib/agents/overnight-executor";
import { evaluateConstraints } from "@/lib/brain/policy-enforcer";

export interface WorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  jobIds: string[];
}

// Week 7: Heavy domains require more resources and time
const HEAVY_DOMAINS = new Set([
  "incident-diagnosis",
  "tdd-code-generator",
  "design-doc-generator",
  "architecture-extractor",
  "codebase-qa",
  "pr-review",
]);

export type WorkerType = "light" | "heavy" | "mixed";

/**
 * Classify a domain as light or heavy.
 */
export function classifyDomainWeight(domainType: string): "light" | "heavy" {
  return HEAVY_DOMAINS.has(domainType) ? "heavy" : "light";
}

/**
 * Process pending SE-aaS jobs.
 *
 * @param supabase    Service-role Supabase client
 * @param limit       Max jobs to process per invocation (default: 5)
 * @param workerType  Filter by domain weight: 'light', 'heavy', or 'mixed' (default: 'mixed')
 */
export async function processSeAaSJobs(
  supabase: SupabaseClient,
  limit = 5,
  workerType: WorkerType = "mixed"
): Promise<WorkerResult> {
  // Fetch pending SE-aaS jobs ordered by priority DESC, created_at ASC
  let query = supabase
    .from("agent_queue")
    .select("id, organization_id, task_type, payload")
    .eq("agent_type", "se-aas")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  // Week 7: Filter by domain weight if worker is specialized
  if (workerType === "light") {
    query = query.not("task_type", "in", `(${Array.from(HEAVY_DOMAINS).join(",")})`);
  } else if (workerType === "heavy") {
    query = query.in("task_type", Array.from(HEAVY_DOMAINS));
  }

  const { data: pendingJobs, error } = await query;

  if (error || !pendingJobs || pendingJobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, jobIds: [] };
  }

  // Week 7: Per-org backpressure — skip jobs from orgs that already have
  // too many running jobs (prevents one org from monopolizing workers)
  const MAX_RUNNING_PER_ORG = 3;
  let filteredJobs = pendingJobs;

  if (pendingJobs.length > 1) {
    const orgIds = [...new Set(pendingJobs.map((j) => j.organization_id))];
    const { data: runningCounts } = await supabase
      .from("agent_queue")
      .select("organization_id")
      .eq("agent_type", "se-aas")
      .eq("status", "running")
      .in("organization_id", orgIds);

    if (runningCounts) {
      const orgRunning = new Map<string, number>();
      for (const r of runningCounts) {
        orgRunning.set(r.organization_id, (orgRunning.get(r.organization_id) || 0) + 1);
      }

      filteredJobs = pendingJobs.filter((j) => {
        const running = orgRunning.get(j.organization_id) || 0;
        return running < MAX_RUNNING_PER_ORG;
      });

      if (filteredJobs.length === 0) filteredJobs = pendingJobs.slice(0, 1); // Always process at least one
    }
  }

  const result: WorkerResult = {
    processed: filteredJobs.length,
    succeeded: 0,
    failed: 0,
    jobIds: [],
  };

  for (const job of filteredJobs) {
    result.jobIds.push(job.id);

    // ── PolicyEnforcer gate — evaluate per-org constraints before dispatch ──
    // If a policy is violated the job is left in 'pending' and a 'blocked'
    // record is written so operators can inspect it. We continue to the next
    // job so a single blocked org doesn't stall other orgs in the batch.
    try {
      const policyResult = await evaluateConstraints(supabase, job.organization_id);
      if (!policyResult.allowed) {
        logger.warn("[job-worker] PolicyEnforcer blocked job", {
          jobId: job.id,
          orgId: job.organization_id,
          policy: policyResult.policyName,
          reason: policyResult.reason,
        });
        // Mark as blocked so the UI can surface a reason to the user
        await supabase
          .from("agent_queue")
          .update({
            status: "failed",
            error_message: `[PolicyEnforcer] ${policyResult.policyName}: ${policyResult.reason}`,
          })
          .eq("id", job.id)
          .eq("organization_id", job.organization_id);
        result.failed += 1;
        continue;
      }
    } catch (policyErr) {
      // Fail-open: evaluateConstraints already handles its own errors,
      // but guard here too so a catastrophic policy module failure never
      // drops the whole batch.
      logger.warn("[job-worker] PolicyEnforcer threw (fail-open, continuing)", {
        jobId: job.id,
        err: policyErr instanceof Error ? policyErr.message : String(policyErr),
      });
    }

    try {
      await executeAndCompleteJob(supabase, job.id, async () => {
        const payload = (job.payload ?? {}) as Record<string, unknown>;
        const userId = (payload.userId as string) || "worker";

        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY not configured — cannot execute SE-aaS domain task");
        }

        const startMs = Date.now();
        let domainResult: Record<string, unknown>;
        let artifactId: string | null = null;
        let usedRecovery = false;

        try {
          // ── Primary execution ────────────────────────────────────────────
          const execOutput = await executeDomain(supabase, {
            domainType: job.task_type,
            request: payload,
            organizationId: job.organization_id,
            userId,
            anthropicApiKey,
          });
          domainResult = execOutput.result;
          artifactId = execOutput.artifactId;

          // ── Empty-result detection ───────────────────────────────────────
          // If the domain ran successfully but returned no meaningful data,
          // attempt recovery before returning the empty result to the user.
          const resultStr = JSON.stringify(domainResult);
          const isEmpty =
            resultStr === "{}" ||
            resultStr === "[]" ||
            resultStr.length < 30 ||
            (domainResult.data === null) ||
            (Array.isArray(domainResult.data) && (domainResult.data as unknown[]).length === 0);

          if (isEmpty) {
            logger.warn(
              `[job-worker] Empty result from ${job.task_type} (job ${job.id}) — triggering recovery`
            );
            const recovery = await attemptRecovery({
              jobId: job.id,
              originalDomain: job.task_type,
              originalPayload: payload,
              failureReason: "empty result",
              orgId: job.organization_id,
              emptyResult: true,
              supabase,
            });

            if (recovery.recovered && recovery.result) {
              domainResult = { ...(recovery.result as Record<string, unknown>) };
              usedRecovery = true;
              logger.warn(
                `[job-worker] Recovery succeeded for ${job.id}: ` +
                `strategy=${recovery.strategy} alt=${recovery.alternativeDomain ?? "none"}`
              );
            } else {
              // Use the graceful degradation object as the result so the user
              // gets a helpful message instead of an empty response.
              domainResult = { ...(recovery.result as Record<string, unknown> ?? { _recovery: recovery }) };
            }
          }
        } catch (domainErr: any) {
          // ── Domain threw an error — attempt recovery before re-throwing ──
          logger.warn(
            `[job-worker] Domain ${job.task_type} threw (job ${job.id}): ${domainErr?.message ?? String(domainErr)}`
          );

          const recovery = await attemptRecovery({
            jobId: job.id,
            originalDomain: job.task_type,
            originalPayload: payload,
            failureReason: domainErr?.message ?? "unknown error",
            orgId: job.organization_id,
            emptyResult: false,
            supabase,
          });

          if (recovery.recovered && recovery.result) {
            domainResult = { ...(recovery.result as Record<string, unknown>) };
            usedRecovery = true;
            logger.warn(
              `[job-worker] Error-recovery succeeded for ${job.id}: ` +
              `strategy=${recovery.strategy} alt=${recovery.alternativeDomain ?? "none"}`
            );
          } else {
            // Recovery exhausted — mark with recovery log and re-throw so
            // executeAndCompleteJob sets status='error' with our context.
            const errorMsg =
              `Domain failed: ${domainErr?.message ?? "unknown"}. ` +
              `Recovery attempted (${recovery.attemptsCount} attempts): ${recovery.explanation}`;
            throw new Error(errorMsg);
          }
        }

        const executionMs = Date.now() - startMs;

        // ── RL Closed-Loop: record outcome ──────────────────────────────────
        // Fire-and-forget: outcome recording MUST NOT block the job result.
        recordJobOutcome(supabase, {
          jobId: job.id,
          domain: job.task_type,
          organizationId: job.organization_id,
          userId,
          taskDescription: JSON.stringify(payload).slice(0, 200),
          resultSummary: JSON.stringify(domainResult).slice(0, 500),
          executionMs,
          artifactGenerated: !!artifactId,
          artifactId: artifactId ?? null,
        }).catch(() => { /* non-fatal */ });

        // ── Write-back Dispatch ──────────────────────────────────────────
        // Fire-and-forget: queue write-back actions for any matching rules.
        // MUST NOT block the job result.
        checkAndQueueWriteback(supabase, {
          jobId: job.id,
          artifactId: artifactId ?? null,
          domainType: job.task_type,
          organizationId: job.organization_id,
          userId,
          artifactData: domainResult,
        }).catch(() => { /* non-fatal */ });

        return {
          ...domainResult,
          artifactId,
          ...(usedRecovery ? { _recoveryUsed: true } : {}),
        };
      });

      result.succeeded++;

      // ── Orchestration: unblock waiting jobs ──────────────────────────────
      // Fire-and-forget: NEVER let this block job completion or throw.
      // If this job was a brain-population type, also unblock jobs waiting
      // on brain readiness with no specific blocking job ID.
      const _orgId = job.organization_id;
      const _jobId = job.id;
      const _isBrainPopulation = BRAIN_POPULATION_TYPES.has(job.task_type);
      Promise.resolve()
        .then(() => checkAndStartWaitingJobs(_orgId, _jobId))
        .then(() => _isBrainPopulation ? checkAndStartBrainDependentJobs(_orgId) : Promise.resolve([]))
        .catch(() => { /* non-fatal — orchestration must never break the job worker */ });
    } catch {
      result.failed++;

      // ── Orchestration: still unblock on failure (best-effort) ────────────
      // Even on job failure, unblock waiting jobs so they can attempt execution
      // (they may succeed independently or surface a clearer error to the user).
      const _orgId2 = job.organization_id;
      const _jobId2 = job.id;
      checkAndStartWaitingJobs(_orgId2, _jobId2).catch(() => {});
    }
  }

  return result;
}

// ============================================================================
// CODE-AGENT WORKER — Overnight orchestrator child job processor
// ============================================================================

/**
 * Process pending code-agent jobs from the agent_queue.
 *
 * These are child jobs created by POST /api/agents/overnight.
 * Each job calls executeCodeAgentJob which: generates code via Claude,
 * commits to a GitHub branch, opens a PR, and pings Slack.
 *
 * @param supabase  Service-role Supabase client
 * @param limit     Max jobs to process per invocation (default: 3)
 */
export async function processCodeAgentJobs(
  supabase: SupabaseClient,
  limit = 3
): Promise<WorkerResult> {
  const { data: pendingJobs, error } = await supabase
    .from("agent_queue")
    .select("id, organization_id, task_type, payload")
    .eq("agent_type", "code-agent")
    .eq("task_type", "code-agent")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !pendingJobs || pendingJobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, jobIds: [] };
  }

  const result: WorkerResult = {
    processed: pendingJobs.length,
    succeeded: 0,
    failed: 0,
    jobIds: [],
  };

  for (const job of pendingJobs) {
    result.jobIds.push(job.id);

    try {
      await executeAndCompleteJob(supabase, job.id, async () => {
        const payload = (job.payload ?? {}) as CodeAgentPayload;

        const execResult = await executeCodeAgentJob(
          supabase,
          job.id,
          job.organization_id,
          payload
        );

        if (!execResult.success) {
          throw new Error(execResult.error ?? "code-agent execution failed");
        }

        return {
          prUrl: execResult.prUrl ?? null,
          prNumber: execResult.prNumber ?? null,
          filesCommitted: execResult.filesCommitted ?? 0,
          branchName: execResult.branchName ?? null,
        };
      });

      result.succeeded++;

      // Unblock any jobs waiting on this child job (fire-and-forget)
      checkAndStartWaitingJobs(job.organization_id, job.id).catch(() => {});
    } catch (err) {
      result.failed++;
      logger.error("[job-worker] code-agent job failed", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Still try to unblock waiting jobs
      checkAndStartWaitingJobs(job.organization_id, job.id).catch(() => {});
    }
  }

  return result;
}
