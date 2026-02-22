/**
 * SE-aaS Job Worker
 * ===================
 * Processes pending SE-aaS jobs from the agent_queue table.
 *
 * Flow:
 * 1. Poll agent_queue for pending jobs (agent_type = 'se-aas')
 * 2. Claim job (status → 'running')
 * 3. Execute domain via domain-executor
 * 4. Save artifact + update job (status → 'success' or 'error')
 *
 * Week 7: Priority-aware worker types (light/heavy/mixed).
 * Heavy domains (incident-diagnosis, tdd-code-generator, etc.) are separated
 * from light domains to prevent backpressure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeAndCompleteJob } from "./job-queue";
import { executeDomain } from "./domain-executor";

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
  "hld-lld-generator",
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

    try {
      await executeAndCompleteJob(supabase, job.id, async () => {
        const payload = job.payload as Record<string, unknown>;
        const userId = (payload.userId as string) || "worker";

        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicApiKey) {
          throw new Error("ANTHROPIC_API_KEY not configured — cannot execute SE-aaS domain task");
        }

        const { result: domainResult, artifactId } = await executeDomain(supabase, {
          domainType: job.task_type,
          request: payload,
          organizationId: job.organization_id,
          userId,
          anthropicApiKey,
        });

        return { ...domainResult, artifactId };
      });

      result.succeeded++;
    } catch {
      result.failed++;
    }
  }

  return result;
}
