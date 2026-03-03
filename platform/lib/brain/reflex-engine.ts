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
 *   - Delegates to a specific handler function
 *
 * Anti-Pattern Guards constrain LLM behavior for known-dangerous contexts.
 *
 * Self-Evolving Loop: Post-flight detects repeated LLM failures → records reflex
 * gap in capability_library → tool-maker synthesizes a deterministic reflex →
 * promoted reflex starts intercepting before the LLM.
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

export interface Reflex {
  name: string;
  priority: number; // higher = checked first (0-100)
  phases: ReflexPhase[];
}

export interface ReflexPhase {
  gate: (ctx: ReflexContext) => boolean;
  action: (ctx: ReflexContext) => ReflexAction;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return [...text.matchAll(re)].map(m => m[0]);
}

function has(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some(p => lower.includes(p));
}

// ── Built-in Reflexes ────────────────────────────────────────────────────────

/** REFLEX: Continue an active interactive session (highest priority) */
const sessionContinueReflex: Reflex = {
  name: "session-continue",
  priority: 95,
  phases: [{
    gate: (ctx) => {
      const recent = ctx.conversationHistory.slice(-6);
      return recent.some(m =>
        m.content.includes("sessionId:") ||
        m.content.includes("Session ID:") ||
        m.content.includes("session is ready") ||
        m.content.includes("Product Analyst")
      ) && has(ctx.message, [
        "write user story", "write story", "next story", "another story",
        "revise", "approved", "looks good", "lgtm", "try again", "redo",
        "change this", "update this", "write prd", "write requirement",
        "feature", "acceptance criteria",
      ]);
    },
    action: (ctx) => ({
      type: "delegate" as const,
      handler: "continueAgentSession",
      params: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        userInput: ctx.message,
        aiWorkerId: ctx.aiWorkerId,
      },
    }),
  }],
};

/** REFLEX: Competitor Intelligence (scan competitor websites) */
const competitorIntelReflex: Reflex = {
  name: "competitor-intelligence",
  priority: 90,
  phases: [{
    gate: (ctx) => {
      const hasIntent = has(ctx.message, [
        "competitor", "compete", "competing", "rival",
        "scan competitor", "analyze competitor", "compare product",
        "product feature", "feature comparison", "competitive analysis",
        "benchmark", "market analysis",
      ]);
      const hasWebIntent = has(ctx.message, [
        "scan", "crawl", "scrape", "check their website",
        "browse", "extract from", "visit their",
      ]);
      const hasUrls = ctx.detectedUrls.length > 0;
      return hasIntent || (hasUrls && hasWebIntent);
    },
    action: (ctx) => ({
      type: "delegate" as const,
      handler: "runCompetitorIntelligence",
      params: {
        competitorUrls: ctx.detectedUrls,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        aiWorkerId: ctx.aiWorkerId,
      },
    }),
  }],
};

/** REFLEX: Product Analyst (create agent with document corpus) */
const productAnalystReflex: Reflex = {
  name: "product-analyst",
  priority: 85,
  phases: [{
    gate: (ctx) => {
      const hasAnalystIntent = has(ctx.message, [
        "product analyst", "user story", "user stories", "write story",
        "prd", "product requirement", "requirement doc",
        "acceptance criteria", "story writing", "train on",
        "learn from", "consume doc", "learn style", "writing style",
      ]);
      const hasCorpusSource = has(ctx.message, [
        "google drive", "gdrive", "confluence", "from folder",
        "from docs", "existing stories", "past stories",
        "documentation", "user guide", "atlassian",
      ]);
      return hasAnalystIntent && hasCorpusSource;
    },
    action: (ctx) => ({
      type: "delegate" as const,
      handler: "initializeProductAnalyst",
      params: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        aiWorkerId: ctx.aiWorkerId,
        confluenceUrls: ctx.detectedUrls.filter(u =>
          u.includes("atlassian.net") || u.includes("confluence")
        ),
        driveUrls: ctx.detectedUrls.filter(u =>
          u.includes("drive.google.com")
        ),
        docUrls: ctx.detectedUrls.filter(u =>
          !u.includes("atlassian.net") && !u.includes("confluence") && !u.includes("drive.google.com")
        ),
      },
    }),
  }],
};

/** REFLEX: Accounting / GL processing (inject context, don't bypass) */
const accountingReflex: Reflex = {
  name: "accounting-gl",
  priority: 80,
  phases: [{
    gate: (ctx) => has(ctx.message, [
      "journal entry", "journal entries", "general ledger", "gl code",
      "double entry", "chart of account", "post entries", "post journal",
      "bank reconcil", "reconcile bank", "reconciliation",
      "p&l", "profit and loss", "balance sheet", "cash flow",
      "trial balance", "financial statement", "consolidat",
    ]),
    action: () => ({
      type: "inject" as const,
      injectedMessages: [{
        role: "system",
        content:
          `## ACCOUNTING CONTEXT ACTIVE\n` +
          `The user is requesting accounting operations. Available tables:\n` +
          `- journal_entries: Create, post, void double-entry journal entries\n` +
          `- bank_reconciliations: Match bank transactions to book entries\n` +
          `- entity_financials: Multi-entity consolidation\n` +
          `Route to AAS domain. ALWAYS persist results to the appropriate table.`,
      }],
      metadata: { forceAasDomain: true },
    }),
  }],
};

// ── Built-in Guards ──────────────────────────────────────────────────────────

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

// ── Engine (sorted by priority, first match wins) ────────────────────────────

const BUILT_IN_REFLEXES: Reflex[] = [
  sessionContinueReflex,
  competitorIntelReflex,
  productAnalystReflex,
  accountingReflex,
];

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
 * Returns the first matching reflex result, or { matched: false } with guards.
 * Called from copilot/chat/route.ts BEFORE the LLM.
 */
export function runReflexEngine(
  ctx: ReflexContext,
  extraReflexes?: Reflex[],
): ReflexResult {
  // Collect active guards
  const guards: Guard[] = [...ALWAYS_ON_GUARDS];
  for (const { test, guard } of CONTEXTUAL_GUARDS) {
    if (test(ctx)) guards.push(guard);
  }

  // Merge built-in + custom reflexes, sort by priority descending
  const allReflexes = [...BUILT_IN_REFLEXES, ...(extraReflexes ?? [])];
  allReflexes.sort((a, b) => b.priority - a.priority);

  // First match wins
  for (const reflex of allReflexes) {
    const phase = reflex.phases[0];
    if (phase && phase.gate(ctx)) {
      const action = phase.action(ctx);

      logger.warn("[reflex-engine] Reflex matched", {
        reflex: reflex.name,
        actionType: action.type,
        orgId: ctx.organizationId,
      });

      return { matched: true, reflexName: reflex.name, action, guards };
    }
  }

  return { matched: false, guards };
}

/**
 * Load custom reflexes from capability_library (self-synthesized).
 */
export async function loadCustomReflexes(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Reflex[]> {
  try {
    const { data, error } = await supabase
      .from("capability_library")
      .select("name, description, implementation, quality_score")
      .eq("organization_id", organizationId)
      .in("status", ["validated", "promoted"])
      .contains("tags", ["reflex"])
      .order("quality_score", { ascending: false })
      .limit(20);

    if (error || !data?.length) return [];

    const customs: Reflex[] = [];
    for (const row of data) {
      try {
        const def = JSON.parse(row.implementation) as {
          triggerPatterns: string[];
          actionType: "bypass" | "inject" | "delegate";
          actionConfig: Record<string, unknown>;
          priority?: number;
        };
        customs.push({
          name: row.name,
          priority: def.priority ?? 50,
          phases: [{
            gate: (ctx) => has(ctx.message, def.triggerPatterns),
            action: () => ({ type: def.actionType, ...def.actionConfig } as ReflexAction),
          }],
        });
      } catch { /* skip malformed */ }
    }

    if (customs.length > 0) {
      logger.warn("[reflex-engine] Loaded custom reflexes", {
        organizationId,
        count: customs.length,
      });
    }
    return customs;
  } catch {
    return [];
  }
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
      implementation: JSON.stringify({
        triggerPatterns: [pattern.triggerMessage.toLowerCase().slice(0, 200)],
        failureReason: pattern.failureReason,
        suggestedAction: pattern.suggestedAction,
        occurrences: pattern.occurrences,
      }),
      tags: ["reflex", "gap", pattern.domain],
      status: "gap",
      quality_score: 0.3,
    });
  } catch {
    // Fire-and-forget
  }
}
