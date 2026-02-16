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

/**
 * Process pending SE-aaS jobs.
 *
 * @param supabase  Service-role Supabase client
 * @param limit     Max jobs to process per invocation (default: 5)
 */
export async function processSeAaSJobs(
  supabase: SupabaseClient,
  limit = 5
): Promise<WorkerResult> {
  // Fetch pending SE-aaS jobs ordered by priority DESC, created_at ASC
  const { data: pendingJobs, error } = await supabase
    .from("agent_queue")
    .select("id, organization_id, task_type, payload")
    .eq("agent_type", "se-aas")
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
        const payload = job.payload as Record<string, unknown>;
        const userId = (payload.userId as string) || "worker";

        const { result: domainResult, artifactId } = await executeDomain(supabase, {
          domainType: job.task_type,
          request: payload,
          organizationId: job.organization_id,
          userId,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
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
