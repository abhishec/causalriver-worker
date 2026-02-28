/**
 * A2A Task Processor
 * ===================
 * Processes pending A2A tasks from the agent_queue table.
 *
 * Flow:
 * 1. Poll agent_queue for pending A2A jobs (agent_type = 'a2a')
 * 2. Claim job (status → 'running')
 * 3. Map A2A skill → domain type (SE-aaS, AaaS, PM-aaS)
 * 4. Execute domain via the appropriate executor
 * 5. Store result in A2A artifact format
 * 6. Update job (status → 'success', result = A2A artifact)
 *
 * The result stored in agent_queue.result follows the A2A artifact format:
 *   { parts: [{ text: "<JSON result string>" }] }
 *
 * This allows /api/a2a/tasks/[taskId] to return the result directly as
 * A2A artifacts without re-serialization.
 *
 * agent_type='aas'    → executeAccounting() (AaaS executor)
 * agent_type='pm-aas' → executePmDomain()   (PM-aaS executor)
 * agent_type='a2a'    → executeDomain()      (SE-aaS executor, default)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { executeAndCompleteJob } from "@/lib/se-aas/job-queue";
import { executeDomain } from "@/lib/se-aas/domain-executor";
import type { WorkerResult } from "@/lib/se-aas/job-worker";

// ── A2A skill → SE-aaS domain mapping ─────────────────────────────────────
// Must stay in sync with the SKILL_TO_DOMAIN map in /api/a2a/tasks/route.ts.
const SKILL_TO_SEAAS_DOMAIN: Record<string, string> = {
  "pod-match": "pod-match",
  "early-warning": "early-warning",
  "scope-creep": "scope-creep",
  "delivery-health": "delivery-intelligence",
};

// ── AaaS skill → action mapping ────────────────────────────────────────────
// Maps the A2A skill ID (task_type in agent_queue) to the AaaS action string.
const AAS_TASK_TO_ACTION: Record<string, string> = {
  "bookkeep":       "bookkeep",
  "reconcile":      "reconcile",
  "statements":     "statements",
  "tax":            "tax",
  "audit":          "audit",
  "anomaly":        "anomaly",
  "causal-analysis":"causal-analysis",
};

// ── PM-aaS task → domain mapping ───────────────────────────────────────────
// Maps the A2A skill ID (task_type in agent_queue) to the PM-aaS domain string.
const PM_AAS_TASK_TO_DOMAIN: Record<string, string> = {
  "roadmap-planner":       "roadmap-planner",
  "sprint-health":         "sprint-health",
  "backlog-prioritizer":   "backlog-prioritizer",
  "stakeholder-alignment": "stakeholder-alignment",
  "release-risk":          "release-risk",
  "feature-impact":        "feature-impact",
  "capacity-planner":      "capacity-planner",
};

/**
 * Process pending A2A tasks from the agent_queue.
 *
 * Handles SE-aaS delivery intelligence domains (agent_type='a2a').
 * AaaS (agent_type='aas') and PM-aaS (agent_type='pm-aas') are
 * processed by processA2AAasTasks() and processA2APmAasTasks() respectively.
 *
 * Called by the process-jobs cron for all three A2A-origin agent types.
 *
 * @param supabase  Service-role Supabase client
 * @param limit     Max tasks to process per invocation (default: 5)
 */
export async function processA2ATasks(
  supabase: SupabaseClient,
  limit = 5
): Promise<WorkerResult> {
  // Fetch pending A2A tasks ordered by priority DESC, created_at ASC
  const { data: pendingJobs, error } = await supabase
    .from("agent_queue")
    .select("id, organization_id, task_type, payload")
    .eq("agent_type", "a2a")
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
        const payload = (job.payload ?? {}) as Record<string, unknown>;
        const userId = (payload.userId as string) ?? "a2a-worker";
        const skill = (payload.skill as string) ?? job.task_type;
        const userText = (payload.userText as string) ?? "";

        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY not configured — cannot execute A2A task");
        }

        // Map skill to internal domain type
        const domainType = SKILL_TO_SEAAS_DOMAIN[skill] ?? job.task_type;

        logger.warn(`[a2a-task-processor] Executing A2A task ${job.id}: skill=${skill} domain=${domainType}`);

        // Execute the domain with the user's text as the primary request
        const execOutput = await executeDomain(supabase, {
          domainType,
          request: {
            ...payload,
            query: userText,
            message: payload.message,
            skill,
            source: "a2a",
          },
          organizationId: job.organization_id,
          userId,
          jobId: job.id,
          anthropicApiKey,
        });

        // Store result in A2A artifact format so the /tasks/:id endpoint
        // can return it as-is without re-serialization.
        const a2aArtifact = {
          parts: [{ text: JSON.stringify(execOutput.result) }],
          artifactId: execOutput.artifactId,
          domainType,
          skill,
          executedAt: new Date().toISOString(),
        };

        return a2aArtifact;
      });

      result.succeeded++;
    } catch (err: unknown) {
      result.failed++;
      logger.error("[a2a-task-processor] A2A task failed", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Process pending AaaS jobs submitted via A2A (agent_type='aas').
 *
 * These are created when an A2A client submits a skill like 'aas-bookkeep'.
 * Routes to the AaaS domain executor (executeAccounting).
 */
export async function processA2AAasTasks(
  supabase: SupabaseClient,
  limit = 5
): Promise<WorkerResult> {
  const { data: pendingJobs, error } = await supabase
    .from("agent_queue")
    .select("id, organization_id, task_type, payload")
    .eq("agent_type", "aas")
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
        const payload = (job.payload ?? {}) as Record<string, unknown>;
        const userId = (payload.userId as string) ?? "a2a-worker";
        const skill = (payload.skill as string) ?? job.task_type;
        const userText = (payload.userText as string) ?? "";

        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY not configured — cannot execute AaaS A2A task");
        }

        // Map task_type → AaaS action
        const action = (AAS_TASK_TO_ACTION[job.task_type] ?? "full") as import("@/lib/aas/domain-executor").AccountingAction;

        logger.warn(`[a2a-task-processor] Executing AaaS A2A task ${job.id}: skill=${skill} action=${action}`);

        const { executeAccountingAgent } = await import("@/lib/aas/domain-executor");
        const execOutput = await executeAccountingAgent(supabase, {
          action,
          organizationId: job.organization_id,
          userId,
          transactions: (payload.transactions as Array<Record<string, unknown>>) ?? [],
          period: payload.period as { from: string; to: string } | undefined,
          jurisdiction: (payload.jurisdiction as string) ?? "SG",
        });

        const a2aArtifact = {
          parts: [{ text: JSON.stringify(execOutput.result) }],
          action: execOutput.action,
          skill,
          executedAt: new Date().toISOString(),
        };

        return a2aArtifact;
      });

      result.succeeded++;
    } catch (err: unknown) {
      result.failed++;
      logger.error("[a2a-task-processor] AaaS A2A task failed", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Process pending PM-aaS jobs submitted via A2A (agent_type='pm-aas').
 *
 * These are created when an A2A client submits a skill like 'pm-roadmap-planner'.
 * Routes to the PM-aaS domain executor (executePmDomain).
 */
export async function processA2APmAasTasks(
  supabase: SupabaseClient,
  limit = 5
): Promise<WorkerResult> {
  const { data: pendingJobs, error } = await supabase
    .from("agent_queue")
    .select("id, organization_id, task_type, payload")
    .eq("agent_type", "pm-aas")
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
        const payload = (job.payload ?? {}) as Record<string, unknown>;
        const userId = (payload.userId as string) ?? "a2a-worker";
        const skill = (payload.skill as string) ?? job.task_type;
        const userText = (payload.userText as string) ?? "";

        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY not configured — cannot execute PM-aaS A2A task");
        }

        // Map task_type → PM-aaS domain
        const domainType = PM_AAS_TASK_TO_DOMAIN[job.task_type] ?? job.task_type;

        logger.warn(`[a2a-task-processor] Executing PM-aaS A2A task ${job.id}: skill=${skill} domain=${domainType}`);

        const { executePmDomain } = await import("@/lib/pm-aas/domain-executor");
        const execOutput = await executePmDomain(supabase, {
          domainType,
          request: {
            ...payload,
            query: userText,
            source: "a2a",
          },
          organizationId: job.organization_id,
          userId,
          anthropicApiKey,
        });

        const a2aArtifact = {
          parts: [{ text: JSON.stringify(execOutput.result) }],
          artifactId: execOutput.artifactId,
          domainType,
          skill,
          executedAt: new Date().toISOString(),
        };

        return a2aArtifact;
      });

      result.succeeded++;
    } catch (err: unknown) {
      result.failed++;
      logger.error("[a2a-task-processor] PM-aaS A2A task failed", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
