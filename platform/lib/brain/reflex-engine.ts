/**
 * Reflexive Agent Architecture — L31 Brain Layer (ADR-030 / ADR-031)
 * ===================================================================
 *
 * Dual-process cognitive architecture (Kahneman System 1 / System 2):
 *
 *   System 1 (Reflex Layer) — DB-driven pattern matching against capability_library
 *   System 2 (Workflow Synthesizer) — LLM generates a new capability on-the-fly
 *
 * The reflex engine runs BEFORE the LLM in the copilot chat route. If a reflex
 * matches, it either:
 *   - Returns a complete response (bypassing LLM entirely)
 *   - Injects messages into conversation stream (augmenting LLM context)
 *   - Delegates to the Universal Capability Executor
 *
 * ADR-031 ZERO-HARDCODED DESIGN:
 *   - NO hardcoded capability names (no "competitive-intelligence", "session-continue")
 *   - NO hardcoded URL patterns (no "atlassian.net", "drive.google.com")
 *   - NO hardcoded session detection (generic agent_sessions DB query)
 *   - Guards stored per-capability in capability_library.guards column
 *   - All matching is database-driven via trigger_patterns
 *
 * Self-Evolving Loop:
 *   System 1 miss → System 2 synthesizes workflow → stored in capability_library
 *   → next time System 1 matches → fast path. RL feedback promotes/demotes.
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

// ── Built-in Guards (universal — not domain-specific) ────────────────────────

const ALWAYS_ON_GUARDS: Guard[] = [
  {
    name: "no-hallucination",
    systemPromptAddition:
      `## BEHAVIOR CONSTRAINT: No Capability Hallucination\n` +
      `Do NOT claim you can perform actions that are not wired into the system.\n` +
      `If the user asks about a capability that doesn't exist, say so honestly.`,
  },
];

// ── DB-backed capability row ─────────────────────────────────────────────────

interface CapabilityRow {
  id: string;
  name: string;
  description: string;
  tool_type: string;
  trigger_patterns: string[];
  quality_score: number;
  organization_id: string;
  guards: Array<{ name: string; systemPromptAddition: string }> | null;
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
 * Run the reflex engine (sync — guards only, no DB matching).
 */
export function runReflexEngine(
  ctx: ReflexContext,
): ReflexResult {
  void ctx;
  return { matched: false, guards: [...ALWAYS_ON_GUARDS] };
}

// ── Generic session detection ────────────────────────────────────────────────

/**
 * Check if there's an active agent session for this org/worker.
 * Returns the session's agent_type if found, null otherwise.
 *
 * This replaces the hardcoded "Product Analyst" / "sessionId:" checks.
 */
async function findActiveSession(
  supabase: SupabaseClient,
  organizationId: string,
  aiWorkerId?: string,
): Promise<{ id: string; agentType: string } | null> {
  try {
    let query = supabase
      .from("agent_sessions")
      .select("id, agent_type")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (aiWorkerId) {
      query = query.eq("ai_worker_id", aiWorkerId);
    }

    const { data } = await query;
    if (data?.length) {
      return { id: data[0].id as string, agentType: data[0].agent_type as string };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if this message looks like a session continuation vs a new capability request.
 *
 * Session-continue triggers: conversational follow-ups that imply continuing
 * an existing interaction rather than starting something new.
 *
 * These are stored per-capability in trigger_patterns — but we need a quick
 * heuristic to decide if we should PRIORITIZE session-continue over other matches.
 */
function looksLikeContinuation(message: string): boolean {
  const lower = message.toLowerCase().trim();

  // Very short messages are usually continuations (e.g., "yes", "approved", "next")
  if (lower.length < 30) return true;

  // Messages without URLs are more likely continuations
  if (!extractUrls(message).length) return true;

  return false;
}

/**
 * Run the reflex engine with async DB-backed capability matching.
 *
 * This is the primary entry point used by chat/route.ts.
 * Matches trigger_patterns from capability_library rows.
 *
 * ADR-031: Zero hardcoded patterns. All matching is database-driven.
 * If no match: engages System 2 (workflow synthesizer) to generate
 * a capability on-the-fly.
 */
export async function runReflexEngineAsync(
  ctx: ReflexContext,
  supabase: SupabaseClient,
): Promise<ReflexResult> {
  // Collect universal guards
  const guards: Guard[] = [...ALWAYS_ON_GUARDS];

  // Load capabilities from DB
  const capabilities = await loadCapabilityReflexes(supabase, ctx.organizationId);

  // Check for active session (generic — no hardcoded agent types)
  const activeSession = await findActiveSession(supabase, ctx.organizationId, ctx.aiWorkerId);

  const lowerMessage = ctx.message.toLowerCase();

  // Score each capability by trigger pattern matches
  type ScoredCap = { cap: CapabilityRow; score: number };
  const scored: ScoredCap[] = [];

  for (const cap of capabilities) {
    const patterns = cap.trigger_patterns ?? [];
    let matchCount = patterns.filter((p) => lowerMessage.includes(p.toLowerCase())).length;

    // Generic session-continue boosting:
    // If there's an active session AND message looks like a continuation AND
    // this capability's tool_type is 'workflow' with trigger_patterns matching
    // continuation keywords → boost it.
    if (cap.tool_type === "workflow" && activeSession && looksLikeContinuation(ctx.message)) {
      // Check if this capability handles session continuation
      // (its trigger_patterns will include things like "write", "revise", "approve" etc.)
      if (matchCount > 0) {
        matchCount += 5; // Significant boost when session is active + has pattern match
      }
    }

    if (matchCount > 0) {
      // Org-specific rows beat system templates
      const orgBonus = cap.organization_id === ctx.organizationId ? 2 : 0;
      scored.push({ cap, score: matchCount + orgBonus + cap.quality_score });

      // Merge capability-specific guards
      if (cap.guards && Array.isArray(cap.guards)) {
        for (const g of cap.guards) {
          if (g.name && g.systemPromptAddition) {
            guards.push(g);
          }
        }
      }
    }
  }

  if (scored.length > 0) {
    // Sort by score descending, first match wins
    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0].cap;

    logger.warn("[reflex-engine] Capability matched (System 1)", {
      capability: winner.name,
      score: scored[0].score,
      orgId: ctx.organizationId,
      hasActiveSession: !!activeSession,
    });

    // Build delegate action — pass ALL URLs through, let UCE extractParams handle filtering
    const action: ReflexAction = {
      type: "delegate",
      handler: winner.name,
      params: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        aiWorkerId: ctx.aiWorkerId,
        urls: ctx.detectedUrls, // ALL URLs — no pre-filtering
        userInput: ctx.message,
        // Pass active session info if available (UCE/primitives may need it)
        ...(activeSession ? { activeSessionId: activeSession.id, activeSessionAgentType: activeSession.agentType } : {}),
      },
    };

    return { matched: true, reflexName: winner.name, action, guards };
  }

  // ── System 2: Workflow Synthesis ──────────────────────────────────────────
  // No match in capability_library — engage the synthesizer to create
  // a new capability on-the-fly.

  try {
    const { synthesizeWorkflow } = await import("./workflow-synthesizer");
    const synthesized = await synthesizeWorkflow(
      supabase,
      ctx.organizationId,
      ctx.message,
      ctx.detectedUrls,
      ctx.conversationHistory,
    );

    if (synthesized) {
      logger.warn("[reflex-engine] Capability synthesized (System 2)", {
        capability: synthesized.name,
        orgId: ctx.organizationId,
      });

      // Merge synthesized capability's guards
      if (synthesized.guards?.length) {
        for (const g of synthesized.guards) {
          guards.push(g);
        }
      }

      return {
        matched: true,
        reflexName: synthesized.name,
        action: {
          type: "delegate",
          handler: synthesized.name,
          params: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            aiWorkerId: ctx.aiWorkerId,
            urls: ctx.detectedUrls,
            userInput: ctx.message,
            ...(activeSession ? { activeSessionId: activeSession.id, activeSessionAgentType: activeSession.agentType } : {}),
          },
        },
        guards,
      };
    }
  } catch (err) {
    logger.warn("[reflex-engine] System 2 synthesis failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { matched: false, guards };
}

/**
 * Load capabilities from capability_library that have trigger_patterns.
 * Fetches org-specific + system template rows with validated/promoted status.
 */
export async function loadCapabilityReflexes(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CapabilityRow[]> {
  try {
    const { data, error } = await supabase
      .from("capability_library")
      .select("id, name, description, tool_type, trigger_patterns, quality_score, organization_id, guards")
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
