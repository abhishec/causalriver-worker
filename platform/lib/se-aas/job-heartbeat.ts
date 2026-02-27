/**
 * Job Heartbeat Utility
 * ======================
 * Prevents the stale job watchdog from marking a long-running job as failed.
 *
 * Usage in domain-executor.ts:
 *
 *   import { startJobHeartbeat, stopJobHeartbeat } from "./job-heartbeat";
 *
 *   const heartbeat = startJobHeartbeat(supabase, jobId);
 *   try {
 *     const result = await executeDomain(...);
 *     return result;
 *   } finally {
 *     stopJobHeartbeat(heartbeat);
 *   }
 *
 * How it works:
 *   - Every 30s, calls update_job_heartbeat() RPC to set heartbeat_at = NOW()
 *   - The stale job watchdog (recover_stale_jobs) marks jobs as 'failed' when
 *     heartbeat_at is not updated for > 120s (4 missed heartbeats)
 *   - stopJobHeartbeat() clears the interval on job complete or error
 *
 * The 30s interval gives 3 grace beats before the 120s threshold kicks in.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export type HeartbeatHandle = ReturnType<typeof setInterval>;

/**
 * Start a heartbeat for a running job.
 *
 * @param supabase     Supabase client (service role)
 * @param jobId        UUID of the running job in agent_queue
 * @param intervalMs   How often to ping (default: 30_000ms = 30s)
 * @returns            Handle to pass to stopJobHeartbeat() when done
 */
export function startJobHeartbeat(
  supabase: SupabaseClient,
  jobId: string,
  intervalMs: number = 30_000
): HeartbeatHandle {
  const handle = setInterval(async () => {
    try {
      const { error } = await supabase.rpc("update_job_heartbeat", { job_id: jobId });
      if (error) {
        // Non-fatal: log warning but keep the interval running.
        // A transient DB error should not stop the heartbeat.
        logger.warn("[job-heartbeat] RPC error (non-fatal)", { jobId, error: error.message });
      }
    } catch (err) {
      logger.warn("[job-heartbeat] Unexpected error (non-fatal)", { jobId, err });
    }
  }, intervalMs);

  return handle;
}

/**
 * Stop a job heartbeat. Always call this in a finally block.
 */
export function stopJobHeartbeat(handle: HeartbeatHandle): void {
  clearInterval(handle);
}
