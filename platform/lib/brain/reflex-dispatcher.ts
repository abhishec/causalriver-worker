/**
 * Reflex Dispatcher — ADR-031 Zero-Hardcoded Delegation Router
 * ==============================================================
 *
 * Thin adapter: takes a delegate action from the reflex engine and
 * executes it via the Universal Capability Executor.
 *
 * ADR-031: No HANDLER_TO_CAPABILITY map. The handler IS the capability name.
 * The reflex engine emits capability names directly from DB trigger matching.
 *
 * Called from chat/route.ts when the reflex engine returns a "delegate" action.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeCapability, type UCEProgressEvent } from "./universal-capability-executor";
import { logger } from "@/lib/logger";

export interface ReflexDelegateParams {
  handler: string;
  params: Record<string, unknown>;
  supabase: SupabaseClient;
  userMessage?: string;
  detectedUrls?: string[];
  /** Optional progress callback — forwarded to UCE for SSE streaming */
  onProgress?: (event: UCEProgressEvent) => void;
}

export interface ReflexDelegateResult {
  success: boolean;
  result?: Record<string, unknown>;
  narrative?: string;
  injectedMessages?: Array<{ role: string; content: string }>;
  injectMetadata?: Record<string, unknown>;
  error?: string;
  /** ADR-031: True when workflow is paused for async dependencies (e.g. ingestion) */
  asyncWait?: boolean;
}

/**
 * Dispatch a reflex delegate action to the Universal Capability Executor.
 *
 * The handler name is the capability name (from capability_library.name).
 * No translation map needed — reflex engine emits DB names directly.
 */
export async function dispatchReflexDelegate(
  params: ReflexDelegateParams,
): Promise<ReflexDelegateResult> {
  const { handler, params: handlerParams, supabase, userMessage = "", detectedUrls = [], onProgress } = params;

  const result = await executeCapability({
    supabase,
    organizationId: handlerParams.organizationId as string,
    userId: handlerParams.userId as string,
    aiWorkerId: handlerParams.aiWorkerId as string | undefined,
    capabilityName: handler, // Direct — no mapping needed
    params: handlerParams,
    userMessage,
    detectedUrls,
    onProgress,
  });

  // ADR-031 Phase 3: Handle async wait — checkpoint to agent_queue for cron resumption
  if (result.success && result.result?.asyncWait) {
    const orgId = handlerParams.organizationId as string;
    const workerId = handlerParams.aiWorkerId as string | undefined;

    try {
      const { error: queueError } = await supabase.from("agent_queue").insert({
        organization_id: orgId,
        ai_worker_id: workerId ?? null,
        agent_type: "capability-workflow",
        task_type: handler, // capability name for lookup on resume
        priority: 3,
        status: "paused",
        payload: {
          capabilityName: handler,
          checkpoint: result.result.checkpoint,
          waitCondition: result.result.waitCondition,
          userId: handlerParams.userId,
        },
        metadata: {
          waitCondition: result.result.waitCondition,
          pausedAt: new Date().toISOString(),
        },
      });

      if (queueError) {
        logger.warn("[reflex-dispatcher] Failed to queue async workflow", {
          handler,
          error: queueError.message,
        });
      } else {
        logger.warn("[reflex-dispatcher] Async workflow checkpointed to agent_queue", {
          handler,
          waitType: (result.result.waitCondition as Record<string, unknown>)?.type,
        });
      }
    } catch (err) {
      logger.warn("[reflex-dispatcher] Error creating agent_queue row for async workflow", {
        handler,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      success: true,
      narrative: result.narrative,
      asyncWait: true,
    };
  }

  return {
    success: result.success,
    result: result.result,
    narrative: result.narrative,
    injectedMessages: result.injectedMessages,
    injectMetadata: result.injectMetadata,
    error: result.error,
  };
}
