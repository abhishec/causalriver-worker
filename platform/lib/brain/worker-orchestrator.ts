/**
 * Worker Orchestrator — Server-side W2W Dispatch Utility
 * =======================================================
 *
 * Use this module to dispatch tasks between AI Workers from within cron jobs,
 * domain executors, or any lib/ context where you have a Supabase client but
 * no HTTP layer available.
 *
 * For HTTP-based dispatch (e.g., from a client or external caller), use:
 *   POST /api/ai-workers/[workerId]/dispatch
 *
 * Example:
 *   const result = await dispatchToWorker(supabase, {
 *     sourceWorkerId: myWorker.id,
 *     targetWorkerType: 'aas',
 *     taskType: 'financial-analysis',
 *     payload: { engagementId: '...' },
 *     orgId: org.id,
 *   });
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DispatchParams {
  /** The worker initiating the dispatch */
  sourceWorkerId: string;
  /** Direct ID of the target worker (takes precedence over targetWorkerType) */
  targetWorkerId?: string;
  /** Resolve the target by service_type — picks the first active worker of this type */
  targetWorkerType?: "se-aas" | "aas" | "pm-aas";
  /** task_type value that the target worker's domain executor will handle */
  taskType: string;
  /** Input payload for the task */
  payload: Record<string, unknown>;
  /** Workspace scope — both source and target must belong to this org */
  orgId: string;
  /** Optional human-readable name for the spawned agent (auto-generated if omitted) */
  agentName?: string;
}

export interface DispatchResult {
  jobId: string;
  agentId: string;
  targetWorkerId: string;
}

// ── dispatchToWorker ──────────────────────────────────────────────────────────

/**
 * Server-side W2W dispatch.
 *
 * Creates an agent row + an agent_queue job both scoped to the TARGET worker.
 * The job payload includes `_dispatched_from` so the executor can trace the call chain.
 *
 * Returns null on any failure (non-fatal — callers decide whether to retry).
 */
export async function dispatchToWorker(
  supabase: SupabaseClient,
  params: DispatchParams
): Promise<DispatchResult | null> {
  try {
    // ── Resolve target worker ──────────────────────────────────────────────────
    let targetWorkerId = params.targetWorkerId;

    if (!targetWorkerId && params.targetWorkerType) {
      const { data: found } = await supabase
        .from("ai_workers")
        .select("id")
        .eq("organization_id", params.orgId)
        .eq("service_type", params.targetWorkerType)
        .eq("status", "active")
        .limit(1)
        .single();

      if (!found) {
        logger.warn("[worker-orchestrator] No active target worker found", {
          targetWorkerType: params.targetWorkerType,
          orgId: params.orgId,
        });
        return null;
      }
      targetWorkerId = found.id;
    }

    if (!targetWorkerId) {
      logger.warn("[worker-orchestrator] No targetWorkerId resolved — provide targetWorkerId or targetWorkerType");
      return null;
    }

    // Prevent self-dispatch
    if (targetWorkerId === params.sourceWorkerId) {
      logger.warn("[worker-orchestrator] Self-dispatch prevented", { workerId: params.sourceWorkerId });
      return null;
    }

    // ── Look up target worker's service_type for agent_type ────────────────────
    const { data: targetWorkerData } = await supabase
      .from("ai_workers")
      .select("service_type")
      .eq("id", targetWorkerId)
      .single();

    const agentType = targetWorkerData?.service_type ?? "se-aas";
    const agentName = params.agentName ?? `${params.taskType}-w2w-${Date.now()}`;

    // ── Create agent scoped to target worker ───────────────────────────────────
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .insert({
        organization_id: params.orgId,
        ai_worker_id: targetWorkerId,
        name: agentName,
        purpose: `W2W dispatch from ${params.sourceWorkerId}: ${params.taskType}`,
        status: "active",
        created_by: "orchestrator",
      })
      .select()
      .single();

    if (agentError || !agent) {
      logger.warn("[worker-orchestrator] Agent creation failed", {
        error: agentError?.message,
        targetWorkerId,
      });
      return null;
    }

    // ── Create job in agent_queue scoped to target worker ──────────────────────
    const { data: job, error: jobError } = await supabase
      .from("agent_queue")
      .insert({
        organization_id: params.orgId,
        ai_worker_id: targetWorkerId,
        agent_id: agent.id,
        agent_type: agentType,
        task_type: params.taskType,
        priority: "normal",
        payload: {
          ...params.payload,
          _dispatched_from: params.sourceWorkerId,
          _dispatch_agent_id: agent.id,
        },
        status: "pending",
      })
      .select()
      .single();

    if (jobError || !job) {
      logger.warn("[worker-orchestrator] Job creation failed", {
        error: jobError?.message,
        agentId: agent.id,
      });
      return null;
    }

    logger.info("[worker-orchestrator] W2W dispatch complete", {
      sourceWorkerId: params.sourceWorkerId,
      targetWorkerId,
      taskType: params.taskType,
      jobId: job.id,
      agentId: agent.id,
    });

    return { jobId: job.id, agentId: agent.id, targetWorkerId };
  } catch (err: unknown) {
    logger.warn("[worker-orchestrator] Dispatch threw unexpectedly", { error: String(err) });
    return null;
  }
}
