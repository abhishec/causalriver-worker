/**
 * Reflex Dispatcher — ADR-030 L31 Delegation Router
 * ==================================================
 *
 * Thin adapter: takes a delegate action from the reflex engine and
 * executes it via the Universal Capability Executor.
 *
 * The hardcoded switch statement that used to live here has been replaced
 * by capability_library — all capability logic lives in the DB, not code.
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
 * Map legacy handler names (from hardcoded reflexes) to capability_library names.
 */
const HANDLER_TO_CAPABILITY: Record<string, string> = {
  runCompetitorIntelligence: "competitive-intelligence",
  initializeProductAnalyst: "product-analyst",
  continueAgentSession: "session-continue",
  // Accounting uses inject action — capability name matches directly
  "accounting-gl": "accounting-gl",
};

/**
 * Dispatch a reflex delegate action to the appropriate capability.
 *
 * The handler name comes from the reflex engine (which still uses legacy
 * handler names from BUILT_IN_REFLEXES). We map to capability_library names here.
 *
 * In future: reflex engine will emit capability names directly.
 */
export async function dispatchReflexDelegate(
  params: ReflexDelegateParams,
): Promise<ReflexDelegateResult> {
  const { handler, params: handlerParams, supabase, userMessage = "", detectedUrls = [] } = params;

  // Resolve the capability name
  const capabilityName = HANDLER_TO_CAPABILITY[handler] ?? handler;

  const result = await executeCapability({
    supabase,
    organizationId: handlerParams.organizationId as string,
    userId: handlerParams.userId as string,
    aiWorkerId: handlerParams.aiWorkerId as string | undefined,
    capabilityName,
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
