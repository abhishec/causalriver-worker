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
import { executeCapability } from "./universal-capability-executor";

export interface ReflexDelegateParams {
  handler: string;
  params: Record<string, unknown>;
  supabase: SupabaseClient;
  userMessage?: string;
  detectedUrls?: string[];
}

export interface ReflexDelegateResult {
  success: boolean;
  result?: Record<string, unknown>;
  narrative?: string;
  injectedMessages?: Array<{ role: string; content: string }>;
  injectMetadata?: Record<string, unknown>;
  error?: string;
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
  const { handler, params: handlerParams, supabase, userMessage = "", detectedUrls = [] } = params;

  const result = await executeCapability({
    supabase,
    organizationId: handlerParams.organizationId as string,
    userId: handlerParams.userId as string,
    aiWorkerId: handlerParams.aiWorkerId as string | undefined,
    capabilityName: handler, // Direct — no mapping needed
    params: handlerParams,
    userMessage,
    detectedUrls,
  });

  return {
    success: result.success,
    result: result.result,
    narrative: result.narrative,
    injectedMessages: result.injectedMessages,
    injectMetadata: result.injectMetadata,
    error: result.error,
  };
}
