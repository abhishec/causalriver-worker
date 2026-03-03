/**
 * Reflexive Agent Architecture — L31 Brain Layer (ADR-030)
 * =========================================================
 *
 * Dual-process cognitive architecture (Kahneman System 1 / System 2):
 *
 *   System 1 (Reflex Layer) — deterministic FSMs for known patterns, 100% reliable
 *   System 2 (LLM Cortex)   — deliberative reasoning for novel situations
 *
 * The reflex engine runs BEFORE the LLM in the copilot chat route. If a reflex
 * matches, it either:
 *   - Returns a complete response (bypassing LLM entirely)
 *   - Injects messages into conversation stream (augmenting LLM context)
 *   - Delegates to the Universal Capability Executor
 *
 * Anti-Pattern Guards constrain LLM behavior for known-dangerous contexts.
 *
 * Self-Evolving Loop: Post-flight detects repeated LLM failures → records reflex
 * gap in capability_library → tool-maker synthesizes a deterministic reflex →
 * promoted reflex starts intercepting before the LLM.
 *
 * Capability-Driven Design: All capabilities (competitive intelligence,
 * product analyst, accounting, etc.) are rows in capability_library.
 * The engine matches trigger_patterns from DB — no hardcoded reflexes.
 *
 * Research: Kahneman (2011) dual-process theory, spinal reflex arc analogy.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReflexContext {
  message: string;
  organizationId: string;
  userId: string;
  aiWorkerId?: string;
  conversationHistory: Array<{ role: string; content: string }>;
  detectedUrls: string[];
  detectedFileTypes: string[];
}

export interface ReflexResult {
  matched: boolean;
  reflexName?: string;
  action?: ReflexAction;
  guards: Guard[];
}

export type ReflexAction =
  | { type: "bypass"; response: string; metadata?: Record<string, unknown> }
  | { type: "inject"; injectedMessages: Array<{ role: string; content: string }>; metadata?: Record<string, unknown> }
  | { type: "delegate"; handler: string; params: Record<string, unknown> };

export interface Guard {
  name: string;
  systemPromptAddition: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return [...text.matchAll(re)].map(m => m[0]);
}

function has(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some(p => lower.includes(p.toLowerCase()));
}

// ── Built-in Guards (these are always present — not capability-dependent) ────

const ALWAYS_ON_GUARDS: Guard[] = [
  {
    name: "no-hallucination",
    systemPromptAddition:
      `## BEHAVIOR CONSTRAINT: No Capability Hallucination\n` +
      `Do NOT claim you can perform actions that are not wired into the system.\n` +
      `If the user asks about a capability that doesn't exist, say so honestly.`,
  },
];

const CONTEXTUAL_GUARDS: Array<{ test: (ctx: ReflexContext) => boolean; guard: Guard }> = [
  {
    test: (ctx) => has(ctx.message, ["journal", "ledger", "reconcil", "financial", "accounting"]),
    guard: {
      name: "accounting-precision",
      systemPromptAddition:
        `## BEHAVIOR CONSTRAINT: Financial Precision\n` +
        `All monetary amounts to 2 decimal places. Debits MUST equal credits.\n` +
        `Never approximate financial figures. Always specify currency (default SGD).`,
    },
  },
  {
    test: (ctx) => has(ctx.message, ["competitor", "scan", "crawl"]),
    guard: {
      name: "force-web-crawler",
      systemPromptAddition:
        `## BEHAVIOR CONSTRAINT: Web Crawling Required\n` +
        `For competitor analysis, ALWAYS use the web crawler tool. Do NOT hallucinate\n` +
        `product features or website content. Only report data actually retrieved.`,
    },
  },
];

// ── DB-backed capability row ──────────────────────────────────────────────────

interface CapabilityRow {
  id: string;
  name: string;
  description: string;
  tool_type: string;
  trigger_patterns: string[];
  quality_score: number;
  organization_id: string;
}

// System org sentinel for template rows
const SYSTEM_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Build reflex context from raw inputs.
 */
export function buildReflexContext(
  message: string,
  organizationId: string,
  userId: string,
  conversationHistory: Array<{ role: string; content: string }>,
  aiWorkerId?: string,
): ReflexContext {
  return {
    message,
    organizationId,
    userId,
    aiWorkerId,
    conversationHistory,
    detectedUrls: extractUrls(message),
    detectedFileTypes: [],
  };
}

/**
 * Run the reflex engine against a message.
 *
 * Pattern matching is done against capability_library.trigger_patterns via
 * loadCapabilityReflexes(). No hardcoded patterns.
 *
 * Returns guards (always) + matched action (if any).
 *
 * NOTE: This function is synchronous so it can be called without await.
 * DB-backed capability matching uses the async version below.
 */
export function runReflexEngine(
  ctx: ReflexContext,
): ReflexResult {
  // Collect active guards
  const guards: Guard[] = [...ALWAYS_ON_GUARDS];
  for (const { test, guard } of CONTEXTUAL_GUARDS) {
    if (test(ctx)) guards.push(guard);
  }

  // Return guards only — actual capability matching is done asynchronously
  // by runReflexEngineAsync() which queries capability_library
  return { matched: false, guards };
}

/**
 * Run the reflex engine with async DB-backed capability matching.
 *
 * This is the primary entry point used by chat/route.ts.
 * Matches trigger_patterns from capability_library rows.
 */
export async function runReflexEngineAsync(
  ctx: ReflexContext,
  supabase: SupabaseClient,
): Promise<ReflexResult> {
  // Collect active guards
  const guards: Guard[] = [...ALWAYS_ON_GUARDS];
  for (const { test, guard } of CONTEXTUAL_GUARDS) {
    if (test(ctx)) guards.push(guard);
  }

  // Load capabilities from DB
  const capabilities = await loadCapabilityReflexes(supabase, ctx.organizationId);

  if (capabilities.length === 0) {
    return { matched: false, guards };
  }

  const lowerMessage = ctx.message.toLowerCase();
  const recentHistory = ctx.conversationHistory.slice(-6).map((m) => m.content).join(" ");

  // Score each capability by trigger pattern matches
  type ScoredCap = { cap: CapabilityRow; score: number };
  const scored: ScoredCap[] = [];

  for (const cap of capabilities) {
    const patterns = cap.trigger_patterns ?? [];
    let matchCount = patterns.filter((p) => lowerMessage.includes(p.toLowerCase())).length;

    // session-continue: check for active session in history AND continuation intent
    if (cap.name === "session-continue") {
      const hasSession = recentHistory.includes("sessionId:") ||
        recentHistory.includes("Session ID:") ||
        recentHistory.includes("session is ready") ||
        recentHistory.includes("Product Analyst");
      if (!hasSession) continue; // session-continue requires an active session
      matchCount += hasSession ? 5 : 0; // boost priority when session is active
    }

    if (matchCount > 0) {
      // Org-specific rows beat system templates
      const orgBonus = cap.organization_id === ctx.organizationId ? 2 : 0;
      scored.push({ cap, score: matchCount + orgBonus + cap.quality_score });
    }
  }

  if (scored.length === 0) {
    return { matched: false, guards };
  }

  // Sort by score descending, first match wins
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0].cap;

  logger.warn("[reflex-engine] Capability matched", {
    capability: winner.name,
    score: scored[0].score,
    orgId: ctx.organizationId,
  });

  const action: ReflexAction = {
    type: "delegate",
    handler: winner.name, // UCE uses this as capabilityName
    params: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      aiWorkerId: ctx.aiWorkerId,
      competitorUrls: ctx.detectedUrls.filter(u =>
        !u.includes("atlassian.net") && !u.includes("confluence") && !u.includes("drive.google.com")
      ),
      confluenceUrls: ctx.detectedUrls.filter(u =>
        u.includes("atlassian.net") || u.includes("confluence")
      ),
      driveUrls: ctx.detectedUrls.filter(u => u.includes("drive.google.com")),
      docUrls: ctx.detectedUrls.filter(u =>
        !u.includes("atlassian.net") && !u.includes("confluence") && !u.includes("drive.google.com")
      ),
      userInput: ctx.message,
    },
  };

  return { matched: true, reflexName: winner.name, action, guards };
}

/**
 * Load capabilities from capability_library that have trigger_patterns.
 * Fetches org-specific promoted rows + system template rows.
 * Cached implicitly by Supabase client's connection pooling.
 */
export async function loadCapabilityReflexes(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CapabilityRow[]> {
  try {
    const { data, error } = await supabase
      .from("capability_library")
      .select("id, name, description, tool_type, trigger_patterns, quality_score, organization_id")
      .in("organization_id", [organizationId, SYSTEM_ORG_ID])
      .in("status", ["validated", "promoted"])
      .not("trigger_patterns", "eq", "{}")
      .order("quality_score", { ascending: false })
      .limit(100);

    if (error) {
      logger.warn("[reflex-engine] Failed to load capabilities from DB", {
        error: error.message,
        orgId: organizationId,
      });
      return [];
    }

    return (data ?? []).filter((r) =>
      Array.isArray(r.trigger_patterns) && r.trigger_patterns.length > 0
    ) as CapabilityRow[];
  } catch (err) {
    logger.warn("[reflex-engine] loadCapabilityReflexes threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * @deprecated Use loadCapabilityReflexes + runReflexEngineAsync instead.
 * Kept for backward compatibility with post-flight.ts.
 */
export async function loadCustomReflexes(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<[]> {
  // No-op: capabilities are now loaded directly in runReflexEngineAsync
  void supabase;
  void organizationId;
  return [];
}

/**
 * Record a reflex gap — post-flight detected repeated LLM failures.
 * Creates a gap in capability_library for the tool-maker to synthesize.
 */
export async function recordReflexGap(
  supabase: SupabaseClient,
  organizationId: string,
  pattern: {
    triggerMessage: string;
    failureReason: string;
    suggestedAction: string;
    domain: string;
    occurrences: number;
  },
): Promise<void> {
  try {
    await supabase.from("capability_library").insert({
      organization_id: organizationId,
      name: `reflex_gap_${pattern.domain}_${Date.now()}`,
      description: `Repeated LLM failure: ${pattern.failureReason}. Suggested: ${pattern.suggestedAction}`,
      domain: `reflex:${pattern.domain}`,
      tool_type: "workflow",
      trigger_patterns: [pattern.triggerMessage.toLowerCase().slice(0, 200)],
      implementation: "",
      workflow_definition: null,
      tags: ["gap", pattern.domain],
      status: "gap",
      quality_score: 0.3,
    });
  } catch {
    // Fire-and-forget
  }
}
