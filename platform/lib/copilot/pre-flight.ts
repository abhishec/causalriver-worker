/**
 * Copilot Pre-Flight
 *
 * Handles everything that must succeed BEFORE the main copilot execution path:
 *   1. Auth + workspace resolution (delegates to resolveSession)
 *   2. Rate limit check
 *   3. Anthropic API key validation
 *   4. memory-stack module loading
 *   5. Brain Commander initialization + LLM query interpretation
 *
 * Returns a CopilotExecutionContext on success, or a NextResponse (error) on failure.
 *
 * NOTE: Brain context (getBrainContext) is NOT loaded here — it is loaded lazily
 * inside the main handler so it shares the same supabase service client and can
 * be gated behind a 5s timeout alongside the rest of the execution path.
 */

import { NextResponse } from "next/server";
import { createRequire } from "module";
import { resolveSession } from "@/lib/copilot/session";
import { checkSessionRateLimit } from "@/lib/security-middleware";
import { createSSEStream } from "@/lib/copilot/stream-utils";
import { logger } from "@/lib/logger";
import type { CopilotExecutionContext } from "@/lib/copilot/execution-context";

// ── memory-stack: loaded via createRequire to avoid Turbopack bundling ────────
// memory-stack embeds TypeScript's compiler which uses dynamic require("fs").
// Turbopack replaces require() with __require() which doesn't support dynamic calls.
// Solution: use createRequire (Node.js standard for ESM→CJS interop) instead of
// eval("require"). createRequire is bundler-safe, Lambda-safe, and passes security scans.
const _nativeRequire = createRequire(import.meta.url);
let _memStackMod: Record<string, any> | null = null;

function getMemoryStackSync(): Record<string, any> {
  if (!_memStackMod) {
    _memStackMod = _nativeRequire("@nexus-ai/memory-stack");
  }
  return _memStackMod!;
}

// ── Inline type: avoids importing memory-stack types at module level ──────────
interface QueryInterpretation {
  intent: string;
  domains: string[];
  requiredData: string[];
  tokenBudget?: { system: number; history: number };
  confidence: number;
  primaryDomain?: string;
  serviceRoute?: {
    type: string;
    seaasDomain?: string;
    seaasInput?: Record<string, unknown>;
    aasDomain?: string;
    aasInput?: Record<string, unknown>;
    agentSpec?: {
      name: string;
      description: string;
      domain: string;
      trigger: string;
      schedule?: string;
      requiredInputs?: string[];
    };
  };
  complexity?: number;
  entities?: unknown[];
  responseStrategy?: unknown;
  [k: string]: unknown;
}

export type PreFlightResult = CopilotExecutionContext | NextResponse | "sse_error_response";

/**
 * Run pre-flight checks and initialize the execution context.
 *
 * @param requestedWorkspaceId  workspaceId from the request body (may be undefined)
 * @param message               The user's message string (already validated)
 * @param compressedSummary     Optional compressed conversation summary
 * @returns CopilotExecutionContext on success.
 *          NextResponse with the appropriate HTTP error status on failure.
 *          The string "sse_error_response" when the caller must return a pre-built
 *          SSE stream response (e.g. brain engine init failure).
 *
 * When "sse_error_response" is returned, the SSE stream has already been kicked off
 * (fire-and-forget IIFE) and the caller should return `getPreFlightSSEErrorResponse()`.
 */
export async function runPreFlight(
  requestedWorkspaceId: string | undefined,
  message: string,
  compressedSummary: string | null | undefined,
): Promise<
  | CopilotExecutionContext
  | NextResponse
  | { type: "sse_brain_error"; response: Response }
> {
  // ── 1. Session resolution: auth + workspace membership + service client ──
  const sessionResult = await resolveSession(requestedWorkspaceId);
  if ("type" in sessionResult) {
    switch (sessionResult.type) {
      case "invalid_json":
        return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
      case "invalid_id_format":
        return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
      case "unauthorized":
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      case "forbidden":
        return NextResponse.json({ error: "You do not have access to this AI Worker" }, { status: 403 });
      case "no_api_key":
        return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured. Contact your administrator." }, { status: 503 });
    }
  }

  const { user, workspaceId, supabase, service } = sessionResult;

  // ── 2. Rate limiting: 30 req/min per user ──────────────────────────────────
  const rateLimit = await checkSessionRateLimit(user.id, "/api/copilot/chat");
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment before sending another message." },
      { status: 429 }
    );
  }

  // ── 3. Anthropic API key validation ───────────────────────────────────────
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured. Contact your administrator." },
      { status: 503 }
    );
  }

  // ── 4. memory-stack module loading ────────────────────────────────────────
  let memStack: Record<string, any>;
  try {
    memStack = getMemoryStackSync();
  } catch (memErr) {
    logger.error("[Copilot/PreFlight] Failed to load @nexus-ai/memory-stack:", {
      error: (memErr as Error)?.message ?? String(memErr),
      route: "/api/copilot/chat",
    });
    // Return a graceful SSE error response instead of 500
    const { stream, sendText, sendError, close } = createSSEStream();
    (async () => {
      sendText(
        "I'm unable to process your request right now — the brain intelligence engine failed to initialize. " +
        "This is typically a server configuration issue. Please try again in a moment, or contact your administrator if the problem persists."
      );
      sendError("Brain engine initialization failed");
      close();
    })();
    return {
      type: "sse_brain_error",
      response: new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      }),
    };
  }

  // ── 5. Brain Commander initialization ─────────────────────────────────────
  const { createBrainCommander } = memStack;
  const commander = createBrainCommander({
    supabase,
    organizationId: workspaceId,
    anthropicApiKey,
    enableActions: false,
    enableMotorCommands: false,
  });

  // ── 6. Brain state prefix for classifier routing ───────────────────────────
  let _classifierBrainPrefix = '';
  try {
    const { count } = await supabase
      .from('cross_domain_signals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', workspaceId);
    const _sigCount = count ?? 0;
    const _brainReady = _sigCount > 10;
    _classifierBrainPrefix = `[Brain: ${_sigCount} signals, ${_brainReady ? 'data available' : 'limited data'}] `;
  } catch { /* non-fatal */ }

  // ── 7. LLM Query Interpretation ────────────────────────────────────────────
  const { createLLMQueryInterpreter } = memStack;
  const interpreter = createLLMQueryInterpreter({
    anthropicApiKey,
    timeoutMs: 8000,
  });

  let interpretation: QueryInterpretation | undefined;
  try {
    interpretation = await interpreter.interpret(_classifierBrainPrefix + message);
  } catch (interpErr) {
    logger.warn('[LLMInterpreter] Non-fatal: LLM interpretation failed, falling back to regex dispatch:', {
      error: (interpErr as Error)?.message ?? String(interpErr),
      route: "/api/copilot/chat",
    });
  }

  // ── 8. Brain Commander execution ───────────────────────────────────────────
  let commandResult: any;
  try {
    commandResult = await commander.command(message, {
      userId: user.id,
      interpretation,
    });
  } catch (cmdErr) {
    logger.warn("[Copilot/PreFlight] Brain commander failed (non-fatal, falling back to basic chat):", {
      error: (cmdErr as Error)?.message ?? String(cmdErr),
      route: "/api/copilot/chat",
    });
    commandResult = {
      intelligence: { causalEdges: [], rules: [], cascadeRules: [], patterns: [], insights: [] },
      dispatch: { complexityScore: 0 },
    };
  }

  // ── 9. Assemble execution context ──────────────────────────────────────────
  const ctx: CopilotExecutionContext = {
    workspaceId,
    userId: user.id,
    supabase,
    service,
    message,
    conversationId: null, // populated by the main handler if/when conversation is saved
    compressedSummary: compressedSummary ?? null,
    service_mode: "general", // updated by main handler based on domain routing
    brainContext: null,      // populated by main handler after context building
    memStack,
    detectedIntent: interpretation?.intent ?? null,
    v4SmartModel: "claude-sonnet-4-6", // overridden by DAAO in main handler
    streamedAssistantText: "",           // accumulated during SSE stream
    requestId: `copilot_${workspaceId}_${Date.now()}`,
    streamStartMs: 0,                    // set just before stream opens
  };

  // Expose commander + interpretation for the main handler via the context object.
  // These are typed as `unknown` in CopilotExecutionContext to keep it bundler-safe.
  // The main handler casts them back as needed.
  (ctx as any)._commandResult = commandResult;
  (ctx as any)._interpretation = interpretation;

  return ctx;
}
