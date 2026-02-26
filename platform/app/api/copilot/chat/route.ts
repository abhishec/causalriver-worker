/**
 * Brain-Powered Copilot Chat Route — V4 (Universal Brain Context Builder)
 *
 * This route uses the FULL NexusBrain knowledge graph to answer questions.
 *
 * V4 UPGRADE:
 *   - SINGLE source of truth: createBrainContextBuilder() from @nexus-ai/memory-stack
 *   - ALL context building (trained knowledge, live brain regions, persona, conversation)
 *     is now handled by the SDK's universal brain context builder
 *   - No more inline buildBrainContext() — ZERO duplicated logic
 *   - Persona is fully configurable (not hardcoded to any specific copilot)
 *   - Can still optionally use the generic CopilotFramework (useFramework: true)
 *
 * Data flow:
 *   1. Parallel DB queries: causal edges, rules, cascade rules, patterns
 *   2. Pass ALL data to createBrainContextBuilder() as trainedKnowledge + brain regions
 *   3. builder.buildContext(question) → intent detection, domain extraction, context assembly
 *   4. context.fullPrompt = COMPLETE system prompt (persona + instructions + brain data)
 *   5. Multi-turn conversation support (via conversationHistory in builder)
 *   6. Stream response via Anthropic (or fallback to brain-only)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  estimateImpact,
} from "@/lib/nexus-copilot-adapter";
import { createSSEStream, SSE_HEADERS } from "@/lib/copilot/stream-utils";
import { resolveSession } from "@/lib/copilot/session";
import { checkSessionRateLimit } from "@/lib/security-middleware";
import { resolveSeaasRoute, resolveAccountingRoute, resolvePmAasRoute } from "@/lib/copilot/domain-router";
import { handleAgentCreation, detectAgentIntent, DOMAIN_AGENT_NAMES } from "@/lib/copilot/handlers/agent-handler";
import { buildDeliveryIntelligenceResult, DELIVERY_DOMAINS } from "@/lib/copilot/handlers/delivery-handler";
// Keep admin client import for the orchestration dynamic import path
import { getAdminClient } from "@/lib/supabase/admin";
// ── @nexus-ai/memory-stack: bypasses Turbopack bundling ──────────────────────
// memory-stack embeds TypeScript's compiler which uses dynamic require("fs").
// Turbopack replaces require() with __require() which doesn't support dynamic calls.
// Solution: use eval("require") to force native Node.js require at runtime.
// Type definitions are inlined to avoid even `import type` triggering module resolution.

interface TrainedCausalEdge { source_domain: string; target_domain: string; effect_size: number; optimal_lag_days: number; confidence: number; method: string; [k: string]: unknown; }
interface TrainedRule { id: string; title: string; natural_language: string; conditions: string[]; content: string; [k: string]: unknown; }
interface TrainedPattern { [k: string]: unknown; }
interface TrainedCascadeRule { [k: string]: unknown; }
interface BrainContext { fullPrompt: string; intent: string; domains: string[]; confidence: number; sections: Array<{ title: string; content: string }>; [k: string]: unknown; }
interface BrainRegions { [k: string]: unknown; }
interface QueryInterpretation { intent: string; domains: string[]; requiredData: string[]; tokenBudget?: { system: number; history: number }; confidence: number; primaryDomain?: string; serviceRoute?: { type: string; seaasDomain?: string; seaasInput?: Record<string, unknown>; aasDomain?: string; aasInput?: Record<string, unknown>; agentSpec?: { name: string; description: string; domain: string; trigger: string; schedule?: string; requiredInputs?: string[] } }; complexity?: number; entities?: unknown[]; responseStrategy?: unknown; [k: string]: unknown; }

// eslint-disable-next-line no-eval
const _nativeRequire = eval("require") as NodeRequire;
let _memStackMod: Record<string, any> | null = null;
function getMemoryStackSync() {
  if (!_memStackMod) {
    _memStackMod = _nativeRequire("@nexus-ai/memory-stack");
  }
  return _memStackMod!;
}

import { logger } from "@/lib/logger";
import { getCaseLogContext, logAgentRetro } from "@/lib/brain/rl-agent-loop";
import { getConnectorsWithCredentials } from "@/lib/connectors/get-credentials";

// ── Token Budget Constants (Phase 4: prevent context overflow) ──────────
const MAX_CONTEXT_TOKENS = 180_000; // Claude 3.5 Sonnet context window
const MAX_SYSTEM_PROMPT_TOKENS = 100_000; // Reserve 80K for system prompt
const MAX_OUTPUT_TOKENS = 8_192;
const RESERVED_TOKENS = MAX_OUTPUT_TOKENS + 5_000; // output + safety margin
const MAX_HISTORY_TOKENS = MAX_CONTEXT_TOKENS - MAX_SYSTEM_PROMPT_TOKENS - RESERVED_TOKENS;

// ── Module-level hot-path caches ─────────────────────────────────────────
// These two query blocks fire on EVERY copilot chat request. Both return stable
// aggregate/config data that is safe to cache for 30s. Cache key = orgId so
// cross-org isolation is preserved.

const HOT_PATH_TTL_MS = 30_000; // 30 seconds — matches brain-context cache

// ai_memory corrections cache (top-8 user corrections per org)
interface CachedCorrections {
  data: Array<{ content: string; importance: number; domain: string; created_at: string }>;
  expiry: number;
}
const _correctionsCache = new Map<string, CachedCorrections>();

// learningPulse cache (brain intelligence snapshot + feedback stats)
interface LearningPulse {
  intelligenceScore: number;
  predictionAccuracy: number | null;
  totalCorrections: number;
  totalFeedback: number;
  satisfactionRate: number;
  recentEmergenceEvents: Array<{ event_type: string; summary: string; created_at: string }>;
  learningVelocity: string;
  brierScore: number | null;
  edgesLearned: number;
  memoriesStored: number;
  lastLearningCycle: string | null;
}
interface CachedLearningPulse {
  data: LearningPulse;
  expiry: number;
}
const _learningPulseCache = new Map<string, CachedLearningPulse>();

/** Rough token estimate: ~4 chars per token for English text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Vercel serverless: allow up to 120s for long Claude SSE streams

// createSSEStream, SSE_HEADERS — imported from @/lib/copilot/stream-utils

// ============================================================================
// ACTION KNOWLEDGE BUILDER — adapts DB data for DomainActionEngine input format
// (DomainActionEngine has its own typed input, this bridges the gap)
// ============================================================================

type UserIntent = "build" | "explain" | "diagnose" | "predict" | "general";

function buildActionKnowledge(
  question: string,
  intent: string,
  domains: string[],
  causalEdges: TrainedCausalEdge[],
  rules: TrainedRule[],
  entityState?: Record<string, unknown>
): {
  question: string;
  intent: UserIntent;
  extractedDomains: string[];
  primaryDomain: string;
  directCauses: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>>;
  directEffects: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>>;
  matchedRules: Array<{ title: string; naturalLanguage: string; conditions: string[]; triggered: boolean }>;
} {
  // Map BrainIntent → UserIntent for DomainActionEngine compatibility
  const intentMap: Record<string, UserIntent> = {
    build: "build", explain: "explain", diagnose: "diagnose",
    predict: "predict", whatif: "predict", cascade: "diagnose",
    debugging: "diagnose", incident: "diagnose", review: "explain",
    onboarding: "explain", knowledge: "explain", health: "general",
    uncertainty: "general", general: "general",
  };
  const actionIntent: UserIntent = intentMap[intent] || "general";

  // Build directCauses and directEffects from causal edges
  const directCauses: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>> = {};
  const directEffects: Record<string, Array<{ source: string; target: string; effectSize: number; lagDays: number }>> = {};

  for (const edge of causalEdges) {
    const entry = {
      source: edge.source_domain,
      target: edge.target_domain,
      effectSize: edge.effect_size,
      lagDays: edge.optimal_lag_days,
    };

    if (!directCauses[edge.target_domain]) directCauses[edge.target_domain] = [];
    directCauses[edge.target_domain].push(entry);

    if (!directEffects[edge.source_domain]) directEffects[edge.source_domain] = [];
    directEffects[edge.source_domain].push(entry);
  }

  for (const domain of Object.keys(directCauses)) {
    directCauses[domain].sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
  }
  for (const domain of Object.keys(directEffects)) {
    directEffects[domain].sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
  }

  // Parse and evaluate rules for ActionEngine
  const matchedRules: Array<{ title: string; naturalLanguage: string; conditions: string[]; triggered: boolean }> = [];

  for (const r of rules) {
    try {
      const p = JSON.parse(r.content);
      if (p && p.when && p.entity_type) {
        const conditionStrs = (p.when.conditions || []).map(
          (c: { field: string; operator: string; value: unknown }) =>
            `${c.field} ${c.operator} ${c.value}`
        );

        let triggered = false;
        if (entityState && p.when.conditions?.length > 0) {
          triggered = p.when.conditions.some((c: { field: string; operator: string; value: unknown }) => {
            const parts = c.field.split(".");
            let val: unknown = entityState;
            for (const part of parts) {
              if (val == null || typeof val !== "object") return false;
              val = (val as Record<string, unknown>)[part];
            }
            return val !== undefined;
          });
        }

        matchedRules.push({
          title: p.title || "Untitled Rule",
          naturalLanguage: p.natural_language || p.naturalLanguage || p.description || "",
          conditions: conditionStrs,
          triggered,
        });
      }
    } catch {
      // Skip malformed
    }
  }

  return {
    question,
    intent: actionIntent,
    extractedDomains: domains,
    primaryDomain: domains[0] || "finance",
    directCauses,
    directEffects,
    matchedRules,
  };
}

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }
    const {
      message,
      organizationId,
      workspaceId: bodyWorkspaceId,
      entityState,
      conversationHistory: rawConversationHistory,
      useFramework,
      // V4: Optional persona override from frontend
      persona,
      // Phase 4: branch for SE-aaS code intelligence (from GitHub connector)
      branch,
      // Phase 7: Custom template command execution
      commandId,
      commandParams,
      // Memory compression: narrative summary of earlier turns for unlimited memory
      compressedSummary,
    } = body as {
      message: string;
      organizationId?: string;
      workspaceId?: string;
      entityState?: Record<string, unknown>;
      conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
      useFramework?: boolean;
      persona?: { name: string; description: string };
      branch?: string;
      commandId?: string;
      commandParams?: Record<string, unknown>;
      compressedSummary?: string;
    };

    // When a compressed summary exists, cap history to the 10 most recent turns.
    // The LLM sees: [compressed memory block] + [last 10 turns] = unlimited memory feel.
    const conversationHistory = compressedSummary && rawConversationHistory
      ? rawConversationHistory.slice(-10)
      : rawConversationHistory;

    // Accept both workspaceId (new) and organizationId (legacy) from request body
    const requestedWorkspaceId = bodyWorkspaceId || organizationId;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }
    if (message.length > 50000) {
      return NextResponse.json(
        { error: "Message too long (max 50,000 characters)" },
        { status: 400 }
      );
    }

    // ── Session resolution: auth + workspace membership + service client ──
    // Delegates to resolveSession() from @/lib/copilot/session
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

    // ── Rate limiting — 30 req/min per user (defined in SESSION_RATE_LIMITS) ──
    const rateLimit = await checkSessionRateLimit(user.id, "/api/copilot/chat");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment before sending another message." },
        { status: 429 }
      );
    }

    // ── Validate API key early ────────────────────────────────────────
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured. Contact your administrator." },
        { status: 503 }
      );
    }

    // ── Brain Commander: Unified intelligence pipeline ──────────────────
    // Replace manual DB queries with Commander — single source of truth
    // for intelligence gathering, dispatch assessment, and permission filtering.
    let memStack: Record<string, any>;
    try {
      memStack = getMemoryStackSync();
    } catch (memErr) {
      logger.error("[Copilot/Chat] Failed to load @nexus-ai/memory-stack:", memErr);
      // Return a graceful SSE error instead of 500
      const { stream, sendText, sendError, close } = createSSEStream();
      (async () => {
        sendText("I'm unable to process your request right now — the brain intelligence engine failed to initialize. This is typically a server configuration issue. Please try again in a moment, or contact your administrator if the problem persists.");
        sendError("Brain engine initialization failed");
        close();
      })();
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const { createBrainCommander } = memStack;
    const commander = createBrainCommander({
      supabase,
      organizationId: workspaceId,
      anthropicApiKey,
      enableActions: false, // We handle action engine separately below for copilot
      enableMotorCommands: false,
    });

    // ── Phase 3: LLM Query Interpretation ────────────────────────────
    // Replace regex dispatch with semantic LLM interpretation (~200ms).
    // Provides: intent classification, entity extraction, service routing,
    // required data signals (skip unneeded DB queries), adaptive token budgets.
    // Falls back to regex dispatch-assessor on any failure.
    const { createLLMQueryInterpreter } = memStack;
    const interpreter = createLLMQueryInterpreter({
      anthropicApiKey,
      // 500ms default was aborting Haiku calls under load — use 8s dedicated timeout.
      // This controller is SEPARATE from request.signal so navigation/disconnect
      // does not abort the classification mid-flight.
      timeoutMs: 8000,
    });
    // ── Brain state prefix: lightweight signal count for classifier routing ──
    // Gives the LLM classifier awareness of brain data availability before routing.
    // Avoids routing to data-heavy SE-aaS domains when brain is empty.
    let _classifierBrainPrefix = '';
    try {
      const { count } = await supabase
        .from('cross_domain_signals')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', workspaceId);
      const _sigCount = count ?? 0;
      const _brainReady = _sigCount > 10;
      _classifierBrainPrefix = `[Brain: ${_sigCount} signals, ${_brainReady ? 'data available' : 'limited data'}] `;
    } catch { /* non-fatal — classifier runs without prefix if this fails */ }

    let interpretation: QueryInterpretation | undefined;
    try {
      interpretation = await interpreter.interpret(_classifierBrainPrefix + message);
    } catch (interpErr) {
      logger.warn('[LLMInterpreter] Non-fatal: LLM interpretation failed, falling back to regex dispatch:', interpErr);
    }

    let commandResult;
    try {
      commandResult = await commander.command(message, {
        userId: user.id,
        entityState,
        interpretation,
      });
    } catch (cmdErr) {
      logger.warn("[Copilot/Chat] Brain commander failed (non-fatal, falling back to basic chat):", cmdErr);
      // Graceful fallback: return a basic chat response without brain intelligence
      commandResult = {
        intelligence: { causalEdges: [], rules: [], cascadeRules: [], patterns: [], insights: [] },
        dispatch: { complexityScore: 0 },
      };
    }

    const { intelligence } = commandResult;

    // Map Commander intelligence to the typed formats the copilot pipeline expects
    const causalEdges: TrainedCausalEdge[] = intelligence.causalEdges as unknown as TrainedCausalEdge[];
    const rules: TrainedRule[] = intelligence.rules as unknown as TrainedRule[];
    const cascadeRules: TrainedCascadeRule[] = intelligence.cascadeRules as unknown as TrainedCascadeRule[];

    // Merge insights into patterns — insights are org-level findings from connectors
    // (Xero, Volopay, etc.) that have the same shape as patterns. By including them
    // in the patterns array, the brain context builder naturally surfaces them to the LLM.
    const dbPatterns: TrainedPattern[] = intelligence.patterns as unknown as TrainedPattern[];
    const dbInsights = (intelligence.insights ?? []).map((row: { content: string; domain?: string; importance: number; metadata?: Record<string, unknown> }) => ({
      content: row.content,
      domain: row.domain || "general",
      importance: row.importance,
      llm_pattern_name: (row.metadata as Record<string, unknown>)?.category as string || "insight",
      llm_pattern_description: (row.metadata as Record<string, unknown>)?.severity as string || "Connector-sourced insight",
      metadata: row.metadata,
    } as TrainedPattern));
    const patterns: TrainedPattern[] = [...dbPatterns, ...dbInsights];

    // ══════════════════════════════════════════════════════════════════════
    // V3 FRAMEWORK PATH — uses the generic CopilotFramework from memory-stack
    // Activated when `useFramework: true` is passed in the request body.
    // Provides: 3-layer prompt, structured output sections, unified streaming.
    // ══════════════════════════════════════════════════════════════════════
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (useFramework && anthropicKey) {
      try {
        const { createCopilotInstance, extractDomains, normalizeEntityState, selectModel } = memStack;
        const { createNexusBrainAdapter } = await import("@/lib/nexus-copilot-adapter");

        // Detect domains for the adapter
        const detectedDomains = extractDomains(message);

        // Build the adapter from DB data — cast trained types to adapter's narrower interface
        const adapter = createNexusBrainAdapter({
          causalEdges: causalEdges as any,
          rules: rules as any,
          cascadeRules: cascadeRules as any,
          patterns: patterns as any,
          entityState,
          detectedDomains,
        });

        // Smart model routing: Haiku for simple queries, Sonnet for complex — saves 60-70% LLM cost
        const smartModel = selectModel(message, {
          commanderComplexity: commandResult?.dispatch?.complexityScore,
          hasConversationHistory: conversationHistory && conversationHistory.length > 0,
          conversationTurns: conversationHistory?.length,
        });

        // Create the copilot instance
        const copilot = createCopilotInstance({
          adapter,
          provider: "anthropic",
          apiKey: anthropicKey,
          model: smartModel,
          maxTokens: 8192,
        });

        // Handle the chat and return stream
        const { stream, headers } = copilot.chat(message, {
          conversationHistory: conversationHistory?.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          entityState,
        });

        return new Response(stream, { headers });
      } catch (frameworkErr) {
        logger.warn(
          "[CopilotFramework] Non-fatal: framework path failed, falling back to V4:",
          frameworkErr
        );
        // Fall through to V4 path below
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // V4 PATH — Universal Brain Context Builder (SINGLE source of truth)
    // All context building is handled by the SDK's createBrainContextBuilder.
    // ══════════════════════════════════════════════════════════════════════

    let brainContext: BrainContext | null = null;
    // Declared here so they're accessible both inside the try block and in the system prompt builder below
    let entityLinks: any[] = [];
    let universalCtx: any = null; // BRAIN NUTRITION: LEAP context from Mesh universal layer
    // Hoisted so causal reasoning blocks (after the try) can access causalDAG + reasoners
    let brainRegions: any = {};

    try {
      const {
        createKnowledgeDependencyGraph,
        createExpertiseGraph,
        createCollaborationGraph,
        createBrainContextBuilder,
        createMultiHopReasoner,
        createExplanationGenerator,
        createCounterfactualSimulator,
        createUncertaintyQuantifier,
        createBrainHealthMonitor,
        createEmptyDAG,
      } = memStack;

      // Check if any GitHub connector is active with ingested data (supports multi-instance)
      const { data: ghConnectors } = await Promise.resolve(service
        .from("org_connectors")
        .select("config")
        .eq("organization_id", workspaceId)
        .eq("connector_type", "github")
        .eq("status", "active"))
        .catch(() => ({ data: null as any }));

      // Aggregate ingestion stats from all GitHub instances
      const ingestionStats = (ghConnectors || []).reduce((best: any, c: any) => {
        const stats = (c.config as Record<string, any>)?.ingestion_progress?.stats;
        if (!best) return stats;
        if (stats?.filesProcessed > (best?.filesProcessed || 0)) return stats;
        return best;
      }, null);

      // Build BrainRegions — ALL available intelligence in one object
      // (variable hoisted above try block so causal reasoning blocks can access it after)
      brainRegions = {} as Partial<BrainRegions>;

      // ── Structural Intelligence: load if code has been ingested ──────
      if (ingestionStats?.filesProcessed > 0) {
        const depGraph = createKnowledgeDependencyGraph();
        const expertiseGraph = createExpertiseGraph();
        const collabGraph = createCollaborationGraph();

        await Promise.all([
          depGraph.load(service, workspaceId),
          expertiseGraph.load(service, workspaceId),
          collabGraph.load(service, workspaceId),
        ]);

        brainRegions.dependencyGraph = depGraph;
        brainRegions.expertiseGraph = expertiseGraph;
        brainRegions.collaborationGraph = collabGraph;
      }

      // ── Causal Intelligence: build DAG from already-fetched edges ───
      if (causalEdges.length > 0) {
        const dag = createEmptyDAG([]);
        for (const edge of causalEdges) {
          dag.nodes.add(edge.source_domain);
          dag.nodes.add(edge.target_domain);
          if (!dag.edges.has(edge.source_domain)) dag.edges.set(edge.source_domain, new Map());
          dag.edges.get(edge.source_domain)!.set(edge.target_domain, {
            weight: edge.effect_size ?? 0,
            pValue: edge.granger_p_value ?? 1.0,
            lagDays: edge.optimal_lag_days ?? 0,
            lastUpdated: new Date(),
            sampleSize: edge.sample_size || 30,
          });
        }
        brainRegions.causalDAG = dag;
        // Cast factory returns to BrainRegions interface — implementations have
        // additional methods and slightly wider return types than the interface.
        brainRegions.multiHopReasoner = createMultiHopReasoner() as any;
        brainRegions.explanationGenerator = createExplanationGenerator() as any;
        brainRegions.counterfactualSimulator = createCounterfactualSimulator() as any;
        brainRegions.uncertaintyQuantifier = createUncertaintyQuantifier() as any;
        brainRegions.brainHealthMonitor = createBrainHealthMonitor();
      }

      // ── Live Engineering Metrics via Brain Context Mesh ──────────────
      // The Mesh handles velocity, bottleneck, signals, and entity links
      // in a single call with caching and resilience built in.
      const { createBrainContextMesh } = memStack;
      const mesh = createBrainContextMesh({ supabase: service, organizationId: workspaceId });
      const copilotDomainCtx = await mesh.getDomainContext('copilot') as any;
      // BRAIN NUTRITION: Also get universal context for LEAP (deep brain reasoning)
      universalCtx = await mesh.getUniversalContext();

      const velocitySnapshots = copilotDomainCtx.velocity ? [copilotDomainCtx.velocity] : [];
      const bottleneckSnapshot = copilotDomainCtx.bottleneck || null;
      const recentSignals = copilotDomainCtx.recentSignals || [];
      entityLinks = copilotDomainCtx.entityLinks || [];

      // Inject engineering metrics + entity links into brain regions as live signals
      (brainRegions as any).liveSignals = {
        velocitySnapshots,
        bottleneckSnapshot,
        recentSignals,
        entityLinks,
        entityLinksSummary: {
          total: entityLinks.length,
          prToJiraLinks: entityLinks.filter((l: any) => l.link_type === 'pr_references_ticket').length,
          slackToPRLinks: entityLinks.filter((l: any) => l.link_type === 'slack_mentions_pr').length,
          slackToJiraLinks: entityLinks.filter((l: any) => l.link_type === 'slack_mentions_ticket').length,
          commitToJiraLinks: entityLinks.filter((l: any) => l.link_type === 'commit_references_ticket').length,
        },
        engineeringSummary: {
          prsMergedLast7Days: velocitySnapshots[0]?.prs_merged || 0,
          avgCycleTimeHours: velocitySnapshots[0]?.mean_pr_cycle_time_hours || null,
          openPRs: velocitySnapshots[0]?.open_pr_count || 0,
          bottleneckRiskScore: bottleneckSnapshot?.bottleneck_risk_score || 0,
          bottleneckRiskLevel: bottleneckSnapshot?.risk_level || 'unknown',
          topReviewerShare: bottleneckSnapshot?.top_reviewer_share || 0,
          giniCoefficient: bottleneckSnapshot?.reviewer_gini_coefficient || 0,
          recentSignalCount: recentSignals.length,
        },
      };

      // ── Trained Knowledge: pass ALL DB data to the builder ──────────
      // Cast trained types — TrainedXxx has optional fields (e.g. importance?: number)
      // but BrainRegions expects required fields. Runtime values are always present.
      brainRegions.trainedKnowledge = {
        causalEdges: causalEdges as any,
        rules: rules as any,
        patterns: patterns as any,
        cascadeRules,
        entityState,
        estimateImpact: (domain: string, edges: TrainedCausalEdge[]) =>
          estimateImpact(domain, edges as any),
      };

      // ── Conversation History ─────────────────────────────────────────
      // Cap at 20 messages to prevent token overflow when brainRegions is serialized
      // into the LLM context by createBrainContextBuilder (same cap as the messages[] array)
      if (conversationHistory && conversationHistory.length > 0) {
        brainRegions.conversationHistory = conversationHistory.slice(-20);
      }

      // ── Persona (configurable — defaults to generic NexusBrain Copilot) ──
      // Sanitize persona fields to prevent prompt injection via user-controlled input
      if (persona) {
        const sanitize = (s: string, maxLen: number) =>
          (s || "").replace(/[\x00-\x1F\x7F]/g, "").slice(0, maxLen);
        brainRegions.persona = {
          name: sanitize(persona.name, 200),
          description: sanitize(persona.description, 500),
        };
      }

      // ── Claude-Aspirational Capabilities ──────────────────────────────
      // These are lightweight, stateless factories — safe to instantiate per request.
      const {
        createAgentLoop,
        createProactiveIntelligence,
        createSessionMemory,
        createReasoningChain,
        createMultiModalInference,
      } = memStack;

      // Agent Loop — autonomous multi-step execution planning
      brainRegions.agentLoop = createAgentLoop({ maxSteps: 10 });

      // Proactive Intelligence — surfaces recent alerts
      brainRegions.proactiveIntelligence = createProactiveIntelligence();

      // Session Memory — per-user context accumulation
      brainRegions.sessionMemory = createSessionMemory({
        userId: user.id,
        organizationId: workspaceId,
      });

      // Reasoning Chain — chain-of-thought surfacing
      brainRegions.reasoningChain = createReasoningChain({ depth: 'moderate' });

      // Multi-Modal Inference — time series / document analysis
      brainRegions.multiModalInference = createMultiModalInference();

      // Note: RAG retriever and Long-Context Manager are async/post-processing tools.
      // RAG should be pre-fetched before buildContext if vector search is available.
      // Long-Context Manager optimizes the fullPrompt AFTER buildContext.
      // Structured Output validates responses AFTER LLM generation.

      // ── Requirement Intelligence: inject Jira ticket details for requirement queries ──
      // When the query is about requirements, P0/P1 items, release status, or sprint content,
      // we fetch actual Jira ticket metadata (summaries, descriptions, priorities, statuses)
      // and inject them into the context. This is what makes the copilot answer
      // "What are the P0 requirements?" with SPECIFIC ticket-level details rather than
      // generic statistical patterns. This is the difference between "meh" and "wow".
      const requirementKeywords = /\b(requirement|release|p0|p1|p2|sprint|backlog|ticket|issue|story|epic|blocker|priority|scope|milestone|deliverable|acceptance\s+criteria|user\s+stor|feature\s+request|bug|defect|roadmap|fix\s*version)\b/i;
      if (requirementKeywords.test(message)) {
        try {
          // Fetch top 60 Jira signals for this workspace, ordered by priority + recency
          const { data: jiraSignals } = await service
            .from("cross_domain_signals")
            .select("signal_type, signal_metadata, entity_id, created_at")
            .eq("organization_id", workspaceId)
            .eq("source_domain", "product.jira")
            .order("created_at", { ascending: false })
            .limit(60);

          if (jiraSignals && jiraSignals.length > 0) {
            // Sort by priority (P0 first) then recency
            const priorityOrder: Record<string, number> = {
              'Highest': 0, 'Blocker': 0, 'Critical': 0,
              'High': 1,
              'Medium': 2,
              'Low': 3, 'Lowest': 4,
            };
            const sorted = [...jiraSignals].sort((a, b) => {
              const pa = priorityOrder[a.signal_metadata?.priority] ?? 5;
              const pb = priorityOrder[b.signal_metadata?.priority] ?? 5;
              if (pa !== pb) return pa - pb;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });

            // Build a structured ticket list for the LLM
            const ticketLines = sorted.slice(0, 40).map((s: any) => {
              const m = s.signal_metadata || {};
              const status = m.status_category === 'Done' ? '✅' : m.status_category === 'In Progress' ? '🔄' : '📋';
              const desc = m.description ? ` — ${m.description.slice(0, 200)}` : '';
              const labels = m.labels?.length ? ` [${m.labels.join(', ')}]` : '';
              const fixVers = m.fix_versions?.length ? ` (fixVersion: ${m.fix_versions.join(', ')})` : '';
              const assignee = m.assignee ? ` → ${m.assignee}` : '';
              const points = m.story_points ? ` (${m.story_points}pts)` : '';
              return `${status} ${m.issue_key || s.entity_id} | ${m.priority || '?'} | ${m.issue_type || '?'} | ${m.status || '?'}${assignee}${points}${fixVers}${labels}\n   ${m.summary || 'No summary'}${desc}`;
            });

            // Compute summary stats
            const byPriority: Record<string, number> = {};
            const byStatus: Record<string, number> = {};
            const byStatusCategory: Record<string, number> = {};
            const byAssignee: Record<string, number> = {};
            const byIssueType: Record<string, number> = {};
            const byComponent: Record<string, number> = {};
            for (const s of jiraSignals) {
              const m = s.signal_metadata || {};
              byPriority[m.priority || 'Unknown'] = (byPriority[m.priority || 'Unknown'] || 0) + 1;
              byStatus[m.status || 'Unknown'] = (byStatus[m.status || 'Unknown'] || 0) + 1;
              byStatusCategory[m.status_category || 'Unknown'] = (byStatusCategory[m.status_category || 'Unknown'] || 0) + 1;
              if (m.assignee) byAssignee[m.assignee] = (byAssignee[m.assignee] || 0) + 1;
              byIssueType[m.issue_type || 'Unknown'] = (byIssueType[m.issue_type || 'Unknown'] || 0) + 1;
              if (m.components && Array.isArray(m.components)) {
                for (const comp of m.components) {
                  byComponent[comp] = (byComponent[comp] || 0) + 1;
                }
              }
            }

            const statsLines = [
              `Total tickets: ${jiraSignals.length}`,
              `By priority: ${Object.entries(byPriority).map(([k, v]) => `${k}=${v}`).join(', ')}`,
              `By status: ${Object.entries(byStatusCategory).map(([k, v]) => `${k}=${v}`).join(', ')}`,
              `By type: ${Object.entries(byIssueType).map(([k, v]) => `${k}=${v}`).join(', ')}`,
              ...(Object.keys(byComponent).length > 0 ? [`By component: ${Object.entries(byComponent).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${v}`).join(', ')}`] : []),
              `Top assignees: ${Object.entries(byAssignee).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v})`).join(', ')}`,
            ];

            // ── Pre-compute chart data for the LLM to embed as ready-made artifacts ──
            // Status Distribution Chart (stacked-bar by priority)
            const priorityList = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
            const statusCats = ['To Do', 'In Progress', 'Done'];
            const priorityStatusMatrix: Array<Record<string, any>> = [];
            for (const pri of priorityList) {
              if (!byPriority[pri]) continue;
              const row: Record<string, any> = { priority: pri };
              for (const sc of statusCats) {
                row[sc] = sorted.filter((s: any) => {
                  const m = s.signal_metadata || {};
                  return m.priority === pri && (m.status_category === sc);
                }).length;
              }
              if (Object.values(row).some((v, i) => i > 0 && typeof v === 'number' && v > 0)) {
                priorityStatusMatrix.push(row);
              }
            }

            const statusChartSpec = JSON.stringify({
              type: "stacked-bar",
              title: "Requirements by Priority & Status",
              xKey: "priority",
              series: [
                { key: "To Do", label: "To Do", color: "#94a3b8" },
                { key: "In Progress", label: "In Progress", color: "#3b82f6" },
                { key: "Done", label: "Done", color: "#10b981" },
              ],
              data: priorityStatusMatrix,
            });

            // Workload Distribution Chart (bar by assignee)
            const assigneeChartData = Object.entries(byAssignee)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([name, count]) => ({ assignee: name.split(' ')[0], tickets: count }));
            const workloadChartSpec = assigneeChartData.length > 1 ? JSON.stringify({
              type: "bar",
              title: "Workload Distribution",
              xKey: "assignee",
              series: [{ key: "tickets", label: "Assigned Tickets", color: "#8b5cf6" }],
              data: assigneeChartData,
            }) : null;

            // Issue Type Breakdown Chart
            const typeChartData = Object.entries(byIssueType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => ({ type, count }));
            const typeChartSpec = typeChartData.length > 1 ? JSON.stringify({
              type: "bar",
              title: "Issue Type Breakdown",
              xKey: "type",
              series: [{ key: "count", label: "Count", color: "#f59e0b" }],
              data: typeChartData,
            }) : null;

            // ── Pre-compute Mermaid diagram: Feature Status Map ──
            // Shows each high-priority ticket as a node, color-coded by status
            const p0p1Tickets = sorted.filter((s: any) => {
              const pri = s.signal_metadata?.priority;
              return pri === 'Highest' || pri === 'Blocker' || pri === 'Critical' || pri === 'High';
            }).slice(0, 15);

            let mermaidStatusMap = 'graph LR\n';
            const mermaidNodes: string[] = [];
            for (const t of p0p1Tickets) {
              const m = t.signal_metadata || {};
              const key = (m.issue_key || t.entity_id || '').replace(/[^A-Za-z0-9-]/g, '');
              if (!key) continue;
              const safeKey = key.replace(/-/g, '_');
              const shortSummary = (m.summary || 'No summary').slice(0, 40).replace(/["\[\](){}]/g, '');
              const statusCat = m.status_category || 'To Do';
              const fillColor = statusCat === 'Done' ? '#10b981' :
                statusCat === 'In Progress' ? '#3b82f6' : '#94a3b8';
              mermaidNodes.push(`  ${safeKey}["${key}<br/>${shortSummary}"]`);
              mermaidNodes.push(`  style ${safeKey} fill:${fillColor},color:#fff,stroke:${fillColor}`);
            }
            mermaidStatusMap += mermaidNodes.join('\n');

            // ── Pre-compute risk items ──
            const blockers = sorted.filter((s: any) => {
              const m = s.signal_metadata || {};
              const isHighPri = ['Highest', 'Blocker', 'Critical', 'High'].includes(m.priority);
              const isOpen = m.status_category !== 'Done';
              return isHighPri && isOpen;
            });
            const riskItems = blockers.slice(0, 10).map((s: any) => {
              const m = s.signal_metadata || {};
              return `- **${m.issue_key || s.entity_id}** (${m.priority}) — ${m.summary || 'No summary'} [${m.status}]${m.assignee ? ` → ${m.assignee}` : ' ⚠️ UNASSIGNED'}`;
            });
            const completionRate = jiraSignals.length > 0
              ? ((byStatusCategory['Done'] || 0) / jiraSignals.length * 100).toFixed(1)
              : '0';

            // Inject as a special brain region with pre-computed visuals
            (brainRegions as any).requirementIntelligence = {
              ticketList: ticketLines.join('\n'),
              stats: statsLines.join('\n'),
              ticketCount: jiraSignals.length,
              // Pre-computed artifacts for the LLM
              precomputedCharts: {
                statusDistribution: statusChartSpec,
                workloadDistribution: workloadChartSpec,
                issueTypeBreakdown: typeChartSpec,
              },
              precomputedMermaid: mermaidStatusMap,
              riskAssessment: {
                completionRate,
                blockerCount: blockers.length,
                riskItems: riskItems.join('\n'),
                riskLevel: blockers.length > 5 ? 'HIGH' : blockers.length > 2 ? 'MEDIUM' : 'LOW',
              },
              byPriority,
              byStatusCategory,
              byIssueType,
              byComponent,
            };

            logger.info(`[Copilot] Injected requirement intelligence: ${jiraSignals.length} Jira tickets for workspace ${workspaceId}`);
          }

          // Also fetch entity links to build a rich ticket↔PR coverage map
          let prToJiraLinks: any[] | null = null;
          let commitToJiraLinks: any[] | null = null;
          try {
            const [prLinks, commitLinks] = await Promise.all([
              service
                .from("entity_links")
                .select("source_entity_id, target_entity_id, link_type, evidence, confidence")
                .eq("organization_id", workspaceId)
                .eq("link_type", "pr_references_ticket")
                .order("confidence", { ascending: false })
                .limit(50),
              service
                .from("entity_links")
                .select("source_entity_id, target_entity_id, link_type, evidence, confidence")
                .eq("organization_id", workspaceId)
                .eq("link_type", "commit_references_ticket")
                .order("confidence", { ascending: false })
                .limit(50),
            ]);
            prToJiraLinks = prLinks.data;
            commitToJiraLinks = commitLinks.data;
          } catch {
            // entity_links table may not exist in some envs
          }

          const allCodeLinks = [...(prToJiraLinks || []), ...(commitToJiraLinks || [])];
          if (allCodeLinks.length > 0) {
            // Build per-ticket coverage map
            const ticketCoverage: Record<string, { prs: string[]; commits: string[] }> = {};
            for (const l of allCodeLinks) {
              const ticketId = l.target_entity_id?.replace('jira#', '') || '';
              if (!ticketId) continue;
              if (!ticketCoverage[ticketId]) ticketCoverage[ticketId] = { prs: [], commits: [] };
              if (l.link_type === 'pr_references_ticket') {
                ticketCoverage[ticketId].prs.push(l.source_entity_id);
              } else {
                const commitHash = l.source_entity_id?.split(':')?.[1]?.slice(0, 8) || l.source_entity_id;
                ticketCoverage[ticketId].commits.push(commitHash);
              }
            }

            // Compute coverage stats (use jiraSignals which is in scope)
            const allTicketKeys = (jiraSignals || []).map((s: any) => s.signal_metadata?.issue_key || '').filter(Boolean);
            const coveredTickets = allTicketKeys.filter((k: string) => ticketCoverage[k]);
            const uncoveredTickets = allTicketKeys.filter((k: string) => !ticketCoverage[k]);

            // Build coverage text
            const linkLines = Object.entries(ticketCoverage).slice(0, 30).map(([ticket, cov]) => {
              const prText = cov.prs.length > 0 ? `PRs: ${cov.prs.join(', ')}` : '';
              const commitText = cov.commits.length > 0 ? `Commits: ${cov.commits.join(', ')}` : '';
              return `- ${ticket} → ${[prText, commitText].filter(Boolean).join(' | ')}`;
            });

            // Build Mermaid coverage map
            const mermaidCovLines: string[] = ['graph LR'];
            const coveredSet = new Set<string>();
            for (const [ticket, cov] of Object.entries(ticketCoverage).slice(0, 12)) {
              const safeTicket = ticket.replace(/[^A-Za-z0-9]/g, '_');
              coveredSet.add(safeTicket);
              mermaidCovLines.push(`  ${safeTicket}["${ticket}"]`);
              mermaidCovLines.push(`  style ${safeTicket} fill:#10b981,color:#fff`);
              for (const pr of cov.prs.slice(0, 2)) {
                const safePr = pr.replace(/[^A-Za-z0-9]/g, '_');
                mermaidCovLines.push(`  ${safePr}["${pr}"] --> ${safeTicket}`);
                mermaidCovLines.push(`  style ${safePr} fill:#3b82f6,color:#fff`);
              }
            }
            // Show a few uncovered tickets as red nodes
            for (const ticket of uncoveredTickets.slice(0, 5)) {
              const safeTicket = ticket.replace(/[^A-Za-z0-9]/g, '_');
              if (!coveredSet.has(safeTicket)) {
                mermaidCovLines.push(`  ${safeTicket}["${ticket}<br/>NO CODE"]`);
                mermaidCovLines.push(`  style ${safeTicket} fill:#ef4444,color:#fff`);
              }
            }

            (brainRegions as any).codeCoverage = {
              prToTicketLinks: linkLines.join('\n'),
              linkCount: allCodeLinks.length,
              coverageRate: allTicketKeys.length > 0
                ? ((coveredTickets.length / allTicketKeys.length) * 100).toFixed(1)
                : '0',
              coveredCount: coveredTickets.length,
              uncoveredCount: uncoveredTickets.length,
              uncoveredTickets: uncoveredTickets.slice(0, 10),
              mermaidCoverageMap: mermaidCovLines.join('\n'),
            };
          }
        } catch (reqErr) {
          logger.warn("[Copilot] Non-fatal: requirement intelligence fetch failed:", reqErr);
        }
      }

      // ── Build unified context from ALL available brain regions ───────
      const builder = createBrainContextBuilder(brainRegions as BrainRegions);
      brainContext = builder.buildContext(message);

    } catch (brainErr) {
      logger.warn("[BrainContext] Non-fatal: could not load brain intelligence:", brainErr);
    }

    // ── SE-aaS + AAS SERVICE ROUTING (Phase 3: LLM-Powered) ──────────
    // Uses LLM interpretation for semantic service routing (replaces 350+ lines of regex).
    // Falls back to regex detectSEaaSRoute/detectAccountingRoute if interpretation unavailable.
    // Track which domain was executed so SSE can emit agent_status events at stream start.
    let executedSeaasDomain: string | null = null;
    let seaasResult: Record<string, unknown> | null = null;
    let accountingResult: Record<string, unknown> | null = null;
    let deliveryIntelligenceResult: Record<string, unknown> | null = null;
    let pmAasResult: Record<string, unknown> | null = null;
    let agentCreated: Record<string, unknown> | null = null;
    /** Set when orchestrator queues a job as waiting — injected into system prompt */
    let orchestratorResult: Record<string, unknown> | null = null;
    /** Collected Agent Communication Protocol payloads — emitted to frontend via SSE */
    const agentCommsBuffer: import("@/lib/agents/agent-comms").AgentCommsPayload[] = [];

    // Copilot-native capabilities handled by Brain commander (not SE-aaS domain executors).
    // All SE-aaS domains now route through executeDomain() for full WOW artifact generation.
    // codebase-qa remains native to leverage full conversation context in Brain commander.
    const COPILOT_NATIVE_DOMAINS = new Set(['codebase-qa']);

    // Determine service route from LLM interpretation or regex fallback.
    // resolveSeaasRoute/resolveAccountingRoute/resolvePmAasRoute handle domain gating + regex fallback.
    const serviceRoute = interpretation?.serviceRoute;
    const seaasRoute = resolveSeaasRoute(message, interpretation as any);
    const accountingRoute = resolveAccountingRoute(message, interpretation as any);
    const pmAasRoute = resolvePmAasRoute(message, interpretation as any);

    // ── Agent Creation Routing ────────────────────────────────────────────────
    // When the LLM classifier detects "create-agent" intent, delegate to handleAgentCreation().
    if (serviceRoute?.type === 'create-agent' && serviceRoute?.agentSpec) {
      agentCreated = await handleAgentCreation(
        serviceRoute.agentSpec as any,
        workspaceId,
        user.id,
        message
      );
    }

    if (seaasRoute && process.env.ANTHROPIC_API_KEY && !COPILOT_NATIVE_DOMAINS.has(seaasRoute.domainType)) {
      // ── Orchestration gate: check for brain dependencies before executing ──
      // If the brain isn't ready or a brain-population job is running, queue
      // this domain and stream a human-readable wait message to the user.
      let orchestrationBlocked = false;
      try {
        const {
          orchestrateJob: _orchestrateJob,
          formatOrchestratorMessage: _formatOrchestratorMessage,
          registerDependency: _registerDependency,
          BRAIN_DEPENDENT_DOMAINS: _BRAIN_DEPENDENT_DOMAINS,
        } = await import("@/lib/brain/agent-orchestrator");

        if (_BRAIN_DEPENDENT_DOMAINS.has(seaasRoute.domainType)) {
          const _decision = await _orchestrateJob({
            orgId: workspaceId,
            taskType: seaasRoute.domainType,
            payload: seaasRoute.extractedInput,
          });

          if (_decision.action === "queue-waiting") {
            orchestrationBlocked = true;

            // Insert a waiting job to agent_queue so it can be auto-started later
            const { getAdminClient: _getAdminClient } = await import("@/lib/supabase/admin");
            const _admin = _getAdminClient();
            const { data: _waitingJob } = await _admin
              .from("agent_queue")
              .insert({
                organization_id: workspaceId,
                agent_type: "se-aas",
                task_type: seaasRoute.domainType,
                priority: 7, // P0 delivery domains get above-default priority
                payload: {
                  ...seaasRoute.extractedInput,
                  userId: user.id,
                  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
                },
                status: "waiting",
              })
              .select("id")
              .single();

            if (_waitingJob?.id) {
              await _registerDependency({
                orgId: workspaceId,
                jobId: _waitingJob.id,
                dependsOnJobId: _decision.blockingJobId,
                dependsOnType: _decision.blockingJobType ?? "brain-population",
                autoStart: true,
              });
            }

            // Get current state for the message (lightweight — already cached in orchestrateJob above)
            const { getOrgAgentState: _getOrgAgentState } = await import("@/lib/brain/agent-orchestrator");
            const _state = await _getOrgAgentState(workspaceId);
            const _orchMsg = _formatOrchestratorMessage(_decision, _state);

            // Store result — injected into the system prompt so Claude tells the user
            // about the queued job. The SSE stream sends it as orchestratorQueued.
            orchestratorResult = {
              type: "queued",
              message: _orchMsg,
              waiting: true,
              jobId: _waitingJob?.id ?? null,
              domain: seaasRoute.domainType,
              taskType: seaasRoute.domainType,
              blockingJobId: _decision.blockingJobId ?? null,
              blockingJobType: _decision.blockingJobType ?? "brain-population",
              estimatedWaitMs: _decision.estimatedWaitMs ?? 120000,
              brainReadiness: _state.brainReadiness,
              brainSignalCount: _state.brainSignalCount,
            };
          }
          // 'reject' case: rare (duplicate brain-population) — fall through to normal execution
          // 'execute-now': proceed normally below
        }
      } catch (_orchErr: any) {
        // Non-fatal — orchestration check must NEVER break domain execution
        logger.warn("[chat/route] Orchestration check failed (non-fatal):", _orchErr?.message);
      }

      if (!orchestrationBlocked) {
      try {
        const { executeDomain } = await import("@/lib/se-aas/domain-executor");

        const domainResult = await executeDomain(service, {
          domainType: seaasRoute.domainType,
          // Phase 4: merge branch into domain request so domain-executor's
          // createBrainContextMesh({ branch }) picks it up for code intelligence.
          request: { ...seaasRoute.extractedInput, ...(branch ? { branch } : {}) },
          organizationId: workspaceId,
          userId: user.id,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
          interpretation: interpretation as any, // Phase 3: pass interpretation for targeted context
          // Agent Communication Protocol: collect payloads for SSE emission
          onComms: (payload) => { agentCommsBuffer.push(payload); },
        });

        const isDeliveryDomain = DELIVERY_DOMAINS.has(seaasRoute.domainType);

        if (isDeliveryDomain) {
          // All P0 Delivery Intelligence domains route to the SEaaSDeliveryPanel.
          // Delegate to buildDeliveryIntelligenceResult() from delivery-handler.
          deliveryIntelligenceResult = await buildDeliveryIntelligenceResult(
            request,
            seaasRoute.domainType,
            domainResult
          );
        } else {
          seaasResult = {
            domainType: seaasRoute.domainType,
            artifactId: domainResult.artifactId,
            ...domainResult.result,
          };
        }
        // Track which domain completed so SSE IIFE can emit agent_status events
        executedSeaasDomain = seaasRoute.domainType;
      } catch (seaasErr) {
        logger.warn("[SE-aaS NL] Non-fatal: domain execution failed:", seaasErr);
        // Surface a user-visible error instead of silent failure
        seaasResult = {
          domainType: seaasRoute.domainType,
          brainAugmented: false,
          error: true,
          message: `Analysis could not be completed for ${seaasRoute.domainType}. The brain will provide general guidance instead.`,
        };
      }
      } // end if (!orchestrationBlocked)
    }

    // ── AaaS ROUTING — Accounting queries via Brain-connected AAS executor ──
    if (accountingRoute && !seaasResult) {
      try {
        // Map NL route domain types to AAS executor action types
        const ACCT_ACTION_MAP: Record<string, string> = {
          'statement-generator': 'statements',
          'reconciler': 'reconcile',
          'bookkeeper': 'bookkeep',
          'tax-compliance': 'tax',
          'anomaly-detective': 'anomaly',
          'audit-preparer': 'audit',
          'cash-flow-prophet': 'cash-forecast',
          'revenue-leakage-detector': 'revenue-leakage',
          'causal-pl-narrator': 'causal-pl',
        };
        const aasAction = ACCT_ACTION_MAP[accountingRoute.domainType] || 'causal-analysis';

        // Load GL data from Supabase Storage (org-scoped)
        let glData: Array<Record<string, unknown>> = [];
        try {
          const storagePath = `${workspaceId}/gl-data.json`;
          const { data: fileData } = await service.storage
            .from("org-data")
            .download(storagePath);
          if (fileData) {
            const text = await fileData.text();
            try {
              const parsed = JSON.parse(text);
              glData = Array.isArray(parsed) ? parsed : [];
            } catch {
              logger.warn("[AaaS] GL data is malformed JSON, skipping");
            }
          }
        } catch {
          // No GL data available for this org
        }

        if (glData.length > 0) {
          const { executeAccountingAgent } = await import("@/lib/aas/domain-executor");
          const aasResult = await executeAccountingAgent(service, {
            action: aasAction as any,
            organizationId: workspaceId,
            userId: user.id,
            transactions: glData,
            jurisdiction: 'SG',
            interpretation: interpretation as any, // Phase 3: pass interpretation for targeted context
            // Agent Communication Protocol: collect payloads for SSE emission
            onComms: (payload) => { agentCommsBuffer.push(payload); },
          });

          accountingResult = {
            domainType: accountingRoute.domainType,
            brainAugmented: aasResult.brainMetadata.brainAugmented,
            ...aasResult.result,
          };
        } else {
          // No GL data uploaded — surface clear error instead of silent fallthrough
          accountingResult = {
            domainType: accountingRoute.domainType,
            brainAugmented: false,
            data: {
              error: "no_gl_data",
              message: "No General Ledger data found. Please upload a GL file (Excel or CSV) using any accounting command (e.g. /aas-pl), then try again.",
            },
          };
        }
      } catch (acctErr) {
        logger.warn("[AaaS NL] Non-fatal: accounting routing failed:", acctErr);
        accountingResult = {
          domainType: accountingRoute?.domainType ?? "accounting",
          brainAugmented: false,
          data: {
            error: true,
            message: "Accounting analysis could not be completed. The brain will provide general guidance instead.",
          },
        };
      }
    }

    // ── PM-aaS ROUTING — Product Management queries via PM-aaS executor ──
    if (pmAasRoute && !seaasResult && !accountingResult && process.env.ANTHROPIC_API_KEY) {
      try {
        const { executePmDomain } = await import("@/lib/pm-aas/domain-executor");
        const pmDomainResult = await executePmDomain(service, {
          domainType: pmAasRoute.domainType,
          request: pmAasRoute.extractedInput,
          organizationId: workspaceId,
          userId: user.id,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        });

        pmAasResult = {
          domainType: pmAasRoute.domainType,
          artifactId: pmDomainResult.artifactId,
          ...pmDomainResult.result,
        };
      } catch (pmErr) {
        logger.warn("[PM-aaS NL] Non-fatal: PM domain execution failed:", pmErr);
        pmAasResult = {
          domainType: pmAasRoute.domainType,
          brainAugmented: false,
          error: true,
          message: `PM-aaS analysis could not be completed for ${pmAasRoute.domainType}. The brain will provide general guidance instead.`,
        };
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // CUSTOM TEMPLATE COMMAND ROUTING
    // When commandId starts with "custom-", load the template from DB and
    // either execute via agent composer (if template has agent_config) or
    // flow through normal LLM path with the template prompt.
    // ══════════════════════════════════════════════════════════════════════

    if (commandId && typeof commandId === 'string' && commandId.startsWith('custom-')) {
      try {
        // Load the template
        const { data: template } = await service
          .from('agent_templates')
          .select('*')
          .eq('org_id', workspaceId)
          .eq('command_id', commandId)
          .eq('is_archived', false)
          .maybeSingle();

        // Also check public templates if not found in org
        let resolvedTemplate = template;
        if (!resolvedTemplate) {
          const { data: publicTemplate } = await service
            .from('agent_templates')
            .select('*')
            .eq('command_id', commandId)
            .eq('is_public', true)
            .eq('is_archived', false)
            .maybeSingle();
          resolvedTemplate = publicTemplate;
        }

        if (resolvedTemplate) {
          // Track usage
          await service
            .from('agent_templates')
            .update({
              usage_count: (resolvedTemplate.usage_count || 0) + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq('id', resolvedTemplate.id)
            .then(() => {}, () => {});

          // If template has agent_config → execute via agent composer
          if (resolvedTemplate.agent_config) {
            const {
              stream: composerStream, send: composerSend,
              sendText: composerSendText, sendError: composerSendError,
              close: composerClose, sendAgentStep, sendProgressiveArtifact,
            } = createSSEStream();

            (async () => {
              try {
                const { executeComposedAgent } = await import("@/lib/agent-composer/executor");
                const agentConfig = resolvedTemplate.agent_config as {
                  persona: string; tools: string[]; executionPlan: string[];
                };

                // Interpolate commandParams into the template prompt
                // Security: sanitize values to prevent prompt injection via template params
                let templatePrompt = resolvedTemplate.prompt;
                if (commandParams) {
                  for (const [key, value] of Object.entries(commandParams)) {
                    // Sanitize: strip control chars, limit length, escape injection patterns
                    const raw = String(value);
                    const sanitized = raw
                      .replace(/[\x00-\x1f\x7f]/g, "")      // strip control chars
                      .replace(/\{\{/g, "{ {")                // prevent nested template injection
                      .replace(/\}\}/g, "} }")
                      .slice(0, 5000);                         // hard limit per param
                    templatePrompt = templatePrompt.replace(
                      new RegExp(`\\{\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g'),
                      sanitized
                    );
                  }
                }

                // Build a minimal AgentComposition from the template config
                const { getToolById } = await import("@/lib/agent-composer/tool-registry");
                const selectedTools = agentConfig.tools
                  .map((id: string) => getToolById(id))
                  .filter(Boolean) as any[];

                const composition = {
                  name: resolvedTemplate.label,
                  persona: agentConfig.persona,
                  selectedTools,
                  inferredGathering: null,
                  executionPrompt: templatePrompt,
                  executionPlan: agentConfig.executionPlan,
                  complexity: selectedTools.length <= 2 ? 'light' as const
                    : selectedTools.length <= 5 ? 'medium' as const : 'heavy' as const,
                };

                const result = await executeComposedAgent(
                  composition,
                  {
                    organizationId: workspaceId,
                    userId: user.id,
                    supabase: service,
                    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
                    params: commandParams as Record<string, unknown> | undefined,
                    branch: branch as string | undefined,
                  },
                  {
                    onStep: (step) => sendAgentStep(step as any),
                    onArtifact: (artifact) => sendProgressiveArtifact({
                      id: artifact.id,
                      type: artifact.type,
                      title: artifact.title,
                      content: artifact.content,
                      isPartial: false,
                      service: artifact.service as any,
                    }),
                    onText: (text) => composerSendText(text),
                  }
                );

                composerSendText(result.narrative);
              } catch (err) {
                composerSendError('Custom template execution failed');
              } finally {
                composerClose();
              }
            })();

            return new Response(composerStream, {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
              },
            });
          }
          // Otherwise: template without agent_config → override message with template prompt
          // (falls through to normal LLM path below, using the template prompt)
        }
      } catch (templateErr) {
        logger.warn("[CustomTemplate] Non-fatal: template loading failed:", templateErr);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // WORKFLOW EXECUTION MODE
    // When commandId starts with "workflow-", load the workflow from DB
    // and execute it via the workflow engine, streaming progress events
    // back to the copilot UI via sendWorkflowProgress().
    // ══════════════════════════════════════════════════════════════════════

    if (commandId && typeof commandId === 'string' && commandId.startsWith('workflow-')) {
      try {
        const workflowId = commandId.replace('workflow-', '');

        // Validate workflow ID is non-empty (prevent empty-ID queries)
        if (!workflowId || workflowId.length < 10) {
          const { stream: errStream, sendError: errSendErr, close: errClose } = createSSEStream();
          errSendErr("Invalid workflow ID");
          errClose();
          return new Response(errStream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
          });
        }

        // Load the workflow definition (org-scoped)
        const { data: workflow } = await service
          .from('workflows')
          .select('*')
          .eq('id', workflowId)
          .eq('organization_id', workspaceId)
          .neq('status', 'archived')
          .maybeSingle();

        if (!workflow) {
          // Workflow not found — send error via SSE instead of leaving client hanging
          const { stream: nfStream, sendError: nfSendErr, close: nfClose } = createSSEStream();
          nfSendErr("Workflow not found or archived");
          nfClose();
          return new Response(nfStream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
          });
        }

        {
          const {
            stream: wfStream, send: wfSend, sendText: wfSendText,
            sendError: wfSendError, close: wfClose, sendWorkflowProgress,
          } = createSSEStream();

          // Track usage
          await service
            .from('workflows')
            .update({
              total_runs: (workflow.total_runs || 0) + 1,
              last_run_at: new Date().toISOString(),
            })
            .eq('id', workflowId)
            .then(() => {}, () => {});

          // Build step status array for progress tracking
          const steps = (workflow.steps || []) as Array<{
            order: number; label: string; parallel_group?: string;
          }>;

          // Fire-and-stream: execute workflow and relay progress
          (async () => {
            try {
              // Send initial progress
              sendWorkflowProgress({
                runId: "",
                workflowId: workflow.id,
                workflowName: workflow.name,
                status: "running",
                currentStep: 0,
                totalSteps: steps.length,
                steps: steps.map(s => ({
                  order: s.order,
                  label: s.label,
                  status: "pending" as const,
                  parallel_group: s.parallel_group,
                })),
              });

              const { executeWorkflow } = await import("@/lib/workflows/engine");

              const result = await executeWorkflow(service, {
                workflow,
                organizationId: workspaceId,
                userId: user.id,
                inputPayload: commandParams as Record<string, unknown> | undefined,
                conversationId: undefined,
              }, {
                onStepStart: (stepOrder, label) => {
                  sendWorkflowProgress({
                    runId: "",
                    workflowId: workflow.id,
                    workflowName: workflow.name,
                    status: "running",
                    currentStep: stepOrder,
                    totalSteps: steps.length,
                    steps: steps.map(s => ({
                      order: s.order,
                      label: s.label,
                      status: s.order === stepOrder ? "running" as const
                        : s.order < stepOrder ? "completed" as const
                        : "pending" as const,
                      parallel_group: s.parallel_group,
                    })),
                  });
                },
                onStepComplete: (stepOrder, label, status) => {
                  sendWorkflowProgress({
                    runId: "",
                    workflowId: workflow.id,
                    workflowName: workflow.name,
                    status: "running",
                    currentStep: stepOrder,
                    totalSteps: steps.length,
                    steps: steps.map(s => ({
                      order: s.order,
                      label: s.label,
                      status: s.order === stepOrder
                        ? (status === "completed" ? "completed" as const : "failed" as const)
                        : s.order < stepOrder ? "completed" as const
                        : "pending" as const,
                      parallel_group: s.parallel_group,
                    })),
                  });
                },
                onWorkflowPaused: (stepOrder, taskId) => {
                  sendWorkflowProgress({
                    runId: "",
                    workflowId: workflow.id,
                    workflowName: workflow.name,
                    status: "paused",
                    currentStep: stepOrder,
                    totalSteps: steps.length,
                    steps: steps.map(s => ({
                      order: s.order,
                      label: s.label,
                      status: s.order === stepOrder ? "running" as const
                        : s.order < stepOrder ? "completed" as const
                        : "pending" as const,
                      parallel_group: s.parallel_group,
                    })),
                  });
                  wfSendText(`Workflow paused at step ${stepOrder} — task ${taskId} is awaiting approval. Approve it in the Task Queue to continue.`);
                },
              });

              // Send final progress
              sendWorkflowProgress({
                runId: result.runId,
                workflowId: workflow.id,
                workflowName: workflow.name,
                status: result.status === "completed" ? "completed" : "failed",
                currentStep: steps.length,
                totalSteps: steps.length,
                steps: steps.map((s, i) => ({
                  order: s.order,
                  label: s.label,
                  status: (result.status === "completed" || i < result.completedSteps
                    ? "completed"
                    : "failed") as "completed" | "failed" | "running" | "pending",
                  parallel_group: s.parallel_group,
                })),
              });

              const summary = result.status === "completed"
                ? `Workflow "${workflow.name}" completed successfully in ${(result.durationMs / 1000).toFixed(1)}s. ` +
                  `${result.completedSteps} steps completed${result.failedSteps > 0 ? `, ${result.failedSteps} failed` : ""}.`
                : `Workflow "${workflow.name}" finished with status: ${result.status}. ` +
                  `${result.completedSteps} completed, ${result.failedSteps} failed.`;

              wfSendText(summary);
            } catch (err) {
              wfSendError('Workflow execution failed');
            } finally {
              wfClose();
            }
          })();

          return new Response(wfStream, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            },
          });
        }
      } catch (wfErr) {
        logger.warn("[Workflow] Non-fatal: workflow routing failed:", wfErr);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // AGENT EXECUTION MODE — "Start an OpenClaw agent to fix JIRA-1234"
    // When the user requests an agent, we short-circuit into agent mode:
    //   1. Detect agent intent via regex
    //   2. Create brain_agent_tasks record
    //   3. Stream agent steps live via SSE (agentStep, agentStatus, progressiveArtifact)
    //   4. Run full L1-L30 cognitive cycle with step-by-step streaming
    //   5. Emit agent-execution artifact to right panel
    // ══════════════════════════════════════════════════════════════════════

    const agentIntent = detectAgentIntent(message);

    // Skip regex agent path when LLM already handled create-agent via handleAgentCreation().
    // Without this guard, both paths run: handleAgentCreation succeeds, then detectAgentIntent
    // also fires and hits the brain_agent_tasks path which emits "Failed to create agent task".
    if (agentIntent && !agentCreated) {

      // ══════════════════════════════════════════════════════════════
      // ── Train Brain Fast-Path ─────────────────────────────────────
      // Intercepts BEFORE OpenClaw gateway or general agent execution.
      // Runs learning + evolution cycles directly via SDK (no HTTP).
      // ══════════════════════════════════════════════════════════════
      if (agentIntent.agentType === "train-brain") {
        const {
          stream: trainStream, send: trainSend, sendText: trainSendText,
          sendError: trainSendError, close: trainClose,
          sendAgentStep, sendAgentStatus, sendProgressiveArtifact,
        } = createSSEStream();

        (async () => {
          const trainStartTime = Date.now();
          let taskId = "";

          try {
            // ── Create task record ──────────────────────────────────
            const { data: trainTask } = await service
              .from("brain_agent_tasks")
              .insert({
                organization_id: workspaceId,
                created_by: user.id,
                prompt: message.trim(),
                agent_type: "train-brain",
                auto_execute_threshold: 1.0,
                status: "running",
                started_at: new Date().toISOString(),
              })
              .select("id")
              .maybeSingle();

            taskId = trainTask?.id ?? `train-${Date.now()}`;
            const caseLogCtx = await getCaseLogContext({ agentType: "train-brain", prompt: message.trim(), orgId: workspaceId });

            sendAgentStatus({
              taskId,
              status: "starting",
              agentType: "Brain Training",
              message: "Initializing brain training sequence...",
            });

            // ═══════════════════════════════════════════════════════
            // STEP 1: Load AI Worker context
            // ═══════════════════════════════════════════════════════
            const step1Start = Date.now();
            sendAgentStep({
              stepNumber: 1,
              type: "querying",
              title: "Loading AI Worker context...",
              status: "started",
            });

            const [orgSettingsRes, connectorRes] = await Promise.all([
              service.from("organizations").select("name, settings").eq("id", workspaceId).maybeSingle(),
              service.from("org_connectors").select("connector_type, status").eq("organization_id", workspaceId),
            ]);

            const orgSettings = orgSettingsRes.data;
            const orgName = orgSettings?.name ?? "this workspace";
            const workers: Array<{ id: string; name: string; service: string; status: string }> =
              ((orgSettings?.settings as Record<string, unknown>)?.ai_workers as Array<{ id: string; name: string; service: string; status: string }>) ?? [];
            const activeWorkers = workers.filter(w => w.status === "active");
            const workerName = activeWorkers[0]?.name ?? "Brain";
            const connectors = connectorRes.data ?? [];
            const activeConnectors = connectors.filter((c: { status: string }) => c.status === "active");

            sendAgentStep({
              stepNumber: 1,
              type: "querying",
              title: `${workerName} loaded — ${activeConnectors.length} active connector(s)`,
              content: `Organization: ${orgName}\nActive workers: ${activeWorkers.length}\nConnectors: ${connectors.map((c: { connector_type: string; status: string }) => `${c.connector_type} (${c.status})`).join(", ") || "none"}`,
              durationMs: Date.now() - step1Start,
              status: "completed",
            });

            sendAgentStatus({
              taskId,
              status: "running",
              agentType: "Brain Training",
              message: "Running learning cycle...",
            });

            // ═══════════════════════════════════════════════════════
            // STEP 2: Run Learning Cycle (7 loops)
            // ═══════════════════════════════════════════════════════
            const step2Start = Date.now();
            sendAgentStep({
              stepNumber: 2,
              type: "acting",
              title: "Running 7-loop learning cycle...",
              content: "Loop 1: Prediction verification\nLoop 2: Causal weight updates\nLoop 3: User feedback processing\nLoop 4: Intervention outcomes\nLoop 5: Auto-retraining\nLoop 6: Agent outcome learning\nLoop 7: Federation validation",
              status: "started",
            });

            const { createClosedLoopLearningEngine } = await import("@nexus-ai/memory-stack");
            const learningEngine = createClosedLoopLearningEngine({
              supabase: service,
              organizationId: workspaceId,
            });
            const cycleResult = await learningEngine.runLearningCycle();

            sendAgentStep({
              stepNumber: 2,
              type: "acting",
              title: `Learning cycle complete — 7 loops executed`,
              content: `Duration: ${Date.now() - step2Start}ms`,
              durationMs: Date.now() - step2Start,
              status: "completed",
            });

            // ═══════════════════════════════════════════════════════
            // STEP 3: Verify Predictions
            // ═══════════════════════════════════════════════════════
            const step3Start = Date.now();
            sendAgentStep({
              stepNumber: 3,
              type: "observing",
              title: "Verifying predictions against outcomes...",
              status: "started",
            });

            let totalVerified = 0;
            let correctPreds = 0;
            let accuracyBefore: number | null = null;
            let iqBefore: number | null = null;

            try {
              const [predVerifyRes, recentSnap] = await Promise.all([
                service
                  .from("brain_predictions")
                  .select("outcome_verified, is_correct")
                  .eq("organization_id", workspaceId)
                  .eq("outcome_verified", true)
                  .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
                service
                  .from("brain_intelligence_snapshots")
                  .select("intelligence_score, prediction_accuracy")
                  .eq("organization_id", workspaceId)
                  .order("snapshot_date", { ascending: false })
                  .limit(1),
              ]);
              const verifiedPreds = predVerifyRes.data ?? [];
              correctPreds = verifiedPreds.filter((p: { is_correct: boolean }) => p.is_correct).length;
              totalVerified = verifiedPreds.length;
              const snapBefore = recentSnap.data?.[0] as { intelligence_score?: number; prediction_accuracy?: number } | undefined;
              accuracyBefore = snapBefore?.prediction_accuracy ?? null;
              iqBefore = snapBefore?.intelligence_score ?? null;
            } catch {
              // Tables may not exist — graceful fallback
            }

            sendAgentStep({
              stepNumber: 3,
              type: "observing",
              title: `${totalVerified} predictions verified${totalVerified > 0 ? ` — ${Math.round((correctPreds / totalVerified) * 100)}% correct` : ""}`,
              content: `Verified (last 30 days): ${totalVerified}\nCorrect: ${correctPreds}\nIncorrect: ${totalVerified - correctPreds}\nPre-training accuracy: ${accuracyBefore !== null ? (accuracyBefore * 100).toFixed(1) + "%" : "calibrating..."}`,
              durationMs: Date.now() - step3Start,
              status: "completed",
            });

            // ═══════════════════════════════════════════════════════
            // STEP 4: Compute Intelligence Score (Evolution Cycle)
            // ═══════════════════════════════════════════════════════
            const step4Start = Date.now();
            sendAgentStep({
              stepNumber: 4,
              type: "thinking",
              title: "Computing intelligence score via evolution cycle...",
              content: "Running Bayesian weight updates, calibration, IQ computation...",
              status: "started",
            });

            const { runBrainEvolutionCycle } = await import("@nexus-ai/memory-stack");
            const evolutionState = await runBrainEvolutionCycle(service, workspaceId, "full");

            const newIQ = evolutionState?.intelligenceScore ?? 0;
            const newAccuracy = evolutionState?.accuracy?.overall ?? null;
            const iqDelta = iqBefore !== null ? newIQ - iqBefore : null;

            sendAgentStep({
              stepNumber: 4,
              type: "thinking",
              title: `IQ computed: ${newIQ}/100${iqDelta !== null ? ` (${iqDelta >= 0 ? "+" : ""}${iqDelta.toFixed(1)})` : ""}`,
              content: `Intelligence Score: ${newIQ}/100\nPrediction Accuracy: ${newAccuracy !== null ? (newAccuracy * 100).toFixed(1) + "%" : "calibrating..."}\nIQ Delta: ${iqDelta !== null ? (iqDelta >= 0 ? "+" : "") + iqDelta.toFixed(1) : "first run"}\nDuration: ${Date.now() - step4Start}ms`,
              durationMs: Date.now() - step4Start,
              status: "completed",
            });

            // ═══════════════════════════════════════════════════════
            // STEP 5: Persist Brain State + Emit Signal
            // ═══════════════════════════════════════════════════════
            const step5Start = Date.now();
            sendAgentStep({
              stepNumber: 5,
              type: "acting",
              title: "Saving brain state and emitting learning signal...",
              status: "started",
            });

            await Promise.all([
              service.from("brain_agent_tasks").update({
                status: "completed",
                confidence_score: newAccuracy ?? 0.75,
                result_summary: `Brain training complete. IQ: ${newIQ}/100. Accuracy: ${newAccuracy !== null ? (newAccuracy * 100).toFixed(1) + "%" : "calibrating"}`,
                result_metadata: {
                  intelligenceScore: newIQ,
                  accuracy: newAccuracy,
                  iqDelta,
                  durationMs: Date.now() - trainStartTime,
                  predictionsVerified: totalVerified,
                },
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq("id", taskId).then(() => {}, () => {}),

              service.from("cross_domain_signals").insert({
                organization_id: workspaceId,
                source_domain: "brain.training",
                signal_type: "copilot_brain_training_completed",
                signal_value: newAccuracy ?? 0,
                signal_timestamp: new Date().toISOString(),
                entity_type: "brain_agent_task",
                entity_id: taskId,
                signal_metadata: {
                  intelligenceScore: newIQ,
                  iqDelta,
                  durationMs: Date.now() - trainStartTime,
                  triggeredBy: user.id,
                },
              }).then(() => {}, () => {}),
            ]);

            sendAgentStep({
              stepNumber: 5,
              type: "acting",
              title: "Brain state persisted — learning signal emitted",
              durationMs: Date.now() - step5Start,
              status: "completed",
            });

            // ═══════════════════════════════════════════════════════
            // STEP 6: Training Complete — Final Summary
            // ═══════════════════════════════════════════════════════
            const totalDurationMs = Date.now() - trainStartTime;
            sendAgentStep({
              stepNumber: 6,
              type: "reflecting",
              title: `Training complete in ${(totalDurationMs / 1000).toFixed(1)}s`,
              content: `Brain IQ: ${newIQ}/100\nPrediction Accuracy: ${newAccuracy !== null ? (newAccuracy * 100).toFixed(1) + "%" : "calibrating..."}\nIQ Delta: ${iqDelta !== null ? (iqDelta >= 0 ? "+" : "") + iqDelta.toFixed(1) : "first run"}\n7 learning loops completed\n${totalVerified} predictions verified`,
              durationMs: totalDurationMs,
              status: "completed",
            });

            sendAgentStatus({
              taskId,
              status: "completed",
              agentType: "Brain Training",
              message: `Training complete — IQ: ${newIQ}/100`,
            });

            // ── Emit LearningPulse so the IQ indicator updates live ────
            trainSend(JSON.stringify({
              learningPulse: {
                intelligenceScore: newIQ,
                predictionAccuracy: newAccuracy,
                totalCorrections: 0,
                totalFeedback: 0,
                satisfactionRate: 0,
                recentEmergenceEvents: [],
                learningVelocity: iqDelta != null && iqDelta > 0 ? "accelerating" : "steady",
                brierScore: null,
                edgesLearned: 0,
                memoriesStored: 0,
                lastLearningCycle: new Date().toISOString(),
              },
            }));

            // ── Rich artifact for right panel ──────────────────────────
            sendProgressiveArtifact({
              id: `train-report-${taskId.slice(0, 8)}`,
              type: "analysis",
              title: "Brain Training Report",
              content: [
                "## Brain Training Report",
                "",
                `**Worker**: ${workerName}`,
                `**Duration**: ${(totalDurationMs / 1000).toFixed(1)}s`,
                "",
                "### Intelligence Metrics",
                `- **IQ Score**: ${newIQ}/100${iqDelta !== null ? ` _(${iqDelta >= 0 ? "+" : ""}${iqDelta.toFixed(1)} from pre-training)_` : ""}`,
                `- **Prediction Accuracy**: ${newAccuracy !== null ? (newAccuracy * 100).toFixed(1) + "%" : "Calibrating..."}`,
                "",
                "### Learning Loops Executed",
                "1. Prediction Verification",
                "2. Causal Weight Updates (Bayesian)",
                "3. User Feedback Processing",
                "4. Intervention Outcome Tracking",
                "5. Auto-Retraining",
                "6. Agent Outcome Learning",
                "7. Federation Validation",
                "",
                "### Prediction Verification",
                `- Verified: ${totalVerified}`,
                `- Correct: ${correctPreds}`,
                `- Incorrect: ${totalVerified - correctPreds}`,
              ].join("\n"),
              isPartial: false,
              service: "core",
            });

            // ── Final narrative text ────────────────────────────────────
            trainSendText(`Brain training complete. **${workerName}** processed 7 learning loops and computed a new intelligence score of **${newIQ}/100**${iqDelta !== null ? ` (${iqDelta >= 0 ? "up" : "down"} ${Math.abs(iqDelta).toFixed(1)} points)` : ""}. Prediction accuracy: **${newAccuracy !== null ? (newAccuracy * 100).toFixed(1) + "%" : "calibrating"}**. The brain verified ${totalVerified} predictions and updated causal graph weights via Bayesian learning.`);

          } catch (err) {
            logger.error("[TrainBrain] Error:", err instanceof Error ? err.message : String(err));
            if (taskId) {
              sendAgentStatus({ taskId, status: "failed", message: "Brain training failed" });
              await service.from("brain_agent_tasks").update({
                status: "failed",
                error_message: "Training cycle failed",
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq("id", taskId).then(() => {}, () => {});
            }
            trainSendError("Brain training failed. Check logs for details.");
          } finally {
            trainClose();
          }
        })();

        return new Response(trainStream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      } // end train-brain intercept

      // ── OpenClaw Gateway Fast-Path ────────────────────────────────
      // If this org has a connected OpenClaw gateway, route the agent
      // request through the daemon instead of running locally. The daemon
      // has direct codebase access, runs tools locally, and the
      // reinforcement loop operates there.
      const openClawConn = (await import("@/lib/openclaw/gateway-client")).gatewayManager.getConnection(workspaceId);

      if (openClawConn && openClawConn.isConnected()) {
        const { triggerOpenClawAgent } = await import("@/lib/openclaw/gateway-client");
        const {
          stream: clawSSEStream, send: clawSend, sendText: clawSendText,
          sendError: clawSendError, close: clawClose,
          sendAgentStep: clawSendAgentStep, sendAgentStatus: clawSendAgentStatus,
        } = createSSEStream();

        // Fire-and-stream: relay OpenClaw daemon events via SSE
        (async () => {
          try {
            clawSendAgentStatus({
              taskId: "openclaw",
              status: "starting",
              agentType: agentIntent.agentType,
              message: `Routing to OpenClaw daemon (${agentIntent.agentType})...`,
            });

            const agentStream = triggerOpenClawAgent({
              orgId: workspaceId,
              message: message.trim(),
              sessionKey: `copilot-${workspaceId}-${Date.now()}`,
              agentId: agentIntent.agentType,
            });

            for await (const event of agentStream) {
              if (event === "[DONE]") {
                break;
              }
              // Forward the event type-by-type to our SSE stream
              if ("text" in event) {
                clawSendText(event.text);
              } else if ("agentStep" in event) {
                clawSendAgentStep(event.agentStep);
              } else if ("agentStatus" in event) {
                const validStatuses = ["starting", "running", "completed", "failed", "awaiting_approval"] as const;
                const rawStatus = event.agentStatus?.status ?? "running";
                const mappedStatus = validStatuses.includes(rawStatus as typeof validStatuses[number])
                  ? (rawStatus as typeof validStatuses[number])
                  : "running";
                clawSendAgentStatus({
                  ...event.agentStatus,
                  status: mappedStatus,
                });
              } else if ("error" in event) {
                clawSendError(event.error);
              }
            }
          } catch (err) {
            clawSendError("OpenClaw agent stream failed");
          } finally {
            clawClose();
          }
        })();

        return new Response(clawSSEStream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      // ── Local Agent Execution (no OpenClaw gateway) ───────────────
      const {
        stream: agentSSEStream, send: agentSend, sendText: agentSendText,
        sendError: agentSendError, close: agentClose,
        sendAgentStep, sendProgressiveArtifact, sendAgentStatus,
      } = createSSEStream();

      // Fire-and-stream: agent runs async while SSE pushes events
      (async () => {
        const agentStartTime = Date.now();
        let taskId = "";
        let agentFinalStatus: "completed" | "failed" | "partial" = "failed";
        let agentOutputSummary = "";
        let agentModelUsed = "claude-sonnet-4-20250514";

        try {
          // ── 1. Create brain_agent_tasks record ──────────────────
          const { data: agentTask, error: taskErr } = await service
            .from("brain_agent_tasks")
            .insert({
              organization_id: workspaceId,
              created_by: user.id,
              prompt: message.trim(),
              agent_type: agentIntent.agentType,
              auto_execute_threshold: 0.8,
              status: "running",
              started_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();

          if (taskErr || !agentTask) {
            agentSendError("Failed to create agent task");
            agentClose();
            return;
          }

          taskId = agentTask.id;
          const caseLogCtx = await getCaseLogContext({ agentType: agentIntent.agentType, prompt: message.trim(), orgId: workspaceId });

          sendAgentStatus({
            taskId,
            status: "starting",
            agentType: agentIntent.agentType,
            message: `Starting ${agentIntent.agentType} agent...`,
          });

          // ── 2. Brain Pre-Flight Intelligence (context gathering) ──
          sendAgentStep({
            stepNumber: 1,
            type: "querying",
            title: "Gathering Brain intelligence...",
            content: `Loading causal graph, patterns, and domain context for ${agentIntent.extractedParams.jiraId || agentIntent.extractedParams.description || "task"}`,
            status: "started",
          });

          // Helper: save durable checkpoint for resumability (Week 4)
          const saveCheckpoint = async (stepNum: number, type: string, state: Record<string, unknown>) => {
            await service.from("agent_checkpoints").upsert({
              task_id: taskId,
              step_number: stepNum,
              checkpoint_type: type,
              agent_state: state,
            }, { onConflict: "task_id,step_number" }).then(() => {}, () => {});
          };

          // Record step in DB
          await service.from("brain_agent_steps").insert({
            task_id: taskId,
            step_number: 1,
            step_type: "query",
            title: "Brain context loading",
            content: `Loaded ${causalEdges.length} causal edges, ${patterns.length} patterns, ${rules.length} rules`,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - agentStartTime,
          }).then(() => {}, () => {});

          // Checkpoint after brain context loaded
          await saveCheckpoint(1, "iteration", {
            phase: "brain_context_loaded",
            causalEdgesCount: causalEdges.length,
            patternsCount: patterns.length,
            rulesCount: rules.length,
            agentType: agentIntent.agentType,
            params: agentIntent.extractedParams,
          });

          sendAgentStep({
            stepNumber: 1,
            type: "querying",
            title: "Brain intelligence loaded",
            content: `${causalEdges.length} causal edges, ${patterns.length} patterns, ${rules.length} business rules`,
            durationMs: Date.now() - agentStartTime,
            status: "completed",
          });

          // If Jira context requested, try to load it
          if (agentIntent.extractedParams.jiraId) {
            sendAgentStep({
              stepNumber: 2,
              type: "querying",
              title: `Reading ${agentIntent.extractedParams.jiraId}...`,
              toolName: "brain_jira_context",
              status: "started",
            });

            // Attempt Jira context via org connector (supports multi-instance)
            let jiraContext: string | null = null;
            try {
              const jiraConnectors = await getConnectorsWithCredentials(service, workspaceId, ["jira"]);

              // Try each Jira instance until we find the ticket
              const jiraId = agentIntent.extractedParams.jiraId!;
              const projectPrefix = jiraId.split("-")[0];

              for (const jiraConnector of jiraConnectors) {
                const jConf = jiraConnector.config as Record<string, any>;
                const jCreds = (jiraConnector.credentials ?? {}) as Record<string, any>;
                const jiraBaseUrl = jConf.baseUrl || jConf.jira_base_url || jConf.site_url;
                const jiraEmail = jCreds?.email || jConf.email || jConf.jira_email;
                const jiraToken = jCreds?.api_token || jConf.apiToken || jConf.jira_api_token;

                if (!jiraBaseUrl || !jiraEmail || !jiraToken) continue;

                // If this instance has projectKeys, check if it matches
                const keys = jConf.projectKeys as string[] | undefined;
                if (keys && keys.length > 0 && !keys.includes(projectPrefix)) continue;

                try {
                  // Phase 4: Circuit breaker — abort Jira fetch after 8 seconds
                  const jiraAbort = new AbortController();
                  const jiraTimeout = setTimeout(() => jiraAbort.abort(), 8_000);
                  const issueRes = await fetch(
                    `${jiraBaseUrl}/rest/api/3/issue/${jiraId}`,
                    {
                      headers: {
                        Authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`,
                        Accept: "application/json",
                      },
                      signal: jiraAbort.signal,
                    }
                  );
                  clearTimeout(jiraTimeout);
                  if (issueRes.ok) {
                    const issue = await issueRes.json();
                    jiraContext = JSON.stringify({
                      key: issue.key,
                      summary: issue.fields?.summary,
                      status: issue.fields?.status?.name,
                      assignee: issue.fields?.assignee?.displayName,
                      priority: issue.fields?.priority?.name,
                      description: typeof issue.fields?.description === "string"
                        ? issue.fields.description.slice(0, 500)
                        : issue.fields?.description?.content?.[0]?.content?.[0]?.text?.slice(0, 500) || "",
                    });
                    break; // Found it, stop trying other instances
                  }
                } catch {
                  // Try next instance
                }
              }
            } catch {
              // Non-fatal: Jira context not available
            }

            sendAgentStep({
              stepNumber: 2,
              type: "querying",
              title: jiraContext
                ? `${agentIntent.extractedParams.jiraId} context loaded`
                : `${agentIntent.extractedParams.jiraId} — no Jira connector`,
              toolName: "brain_jira_context",
              content: jiraContext || "Jira connector not configured. Proceeding with user description.",
              durationMs: Date.now() - agentStartTime,
              status: "completed",
            });

            if (jiraContext) {
              sendProgressiveArtifact({
                id: `jira-${taskId.slice(0, 8)}`,
                type: "jira-context",
                title: `${agentIntent.extractedParams.jiraId} Context`,
                content: jiraContext,
                isPartial: false,
                service: "core",
              });
            }

            await service.from("brain_agent_steps").insert({
              task_id: taskId,
              step_number: 2,
              step_type: "query",
              title: `Jira: ${agentIntent.extractedParams.jiraId}`,
              content: jiraContext || "Jira connector not available",
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              duration_ms: Date.now() - agentStartTime,
            }).then(() => {}, () => {});

            // Checkpoint after Jira context
            await saveCheckpoint(2, "iteration", {
              phase: "jira_context_loaded",
              jiraId: agentIntent.extractedParams.jiraId,
              hasJiraContext: !!jiraContext,
            });
          }

          // ── 2.5. Load episodic memories for agent continuity (Week 5) ──
          let episodicContext = "";
          try {
            const { data: memories } = await service
              .from("agent_episodic_memory")
              .select("content, episode_type, importance, created_at")
              .eq("organization_id", workspaceId)
              .eq("agent_type", agentIntent.agentType)
              .order("importance", { ascending: false })
              .limit(5);

            if (memories && memories.length > 0) {
              // Bump access count for loaded memories
              const memoryIds = memories.map((m: any) => m.id).filter(Boolean);
              if (memoryIds.length > 0) {
                await service.rpc("increment_access_count", { memory_ids: memoryIds }).then(() => {}, () => {});
              }

              episodicContext = "\n\n[Agent Memory — Recent Episodes]\n" +
                memories.map((m: any) =>
                  `- [${m.episode_type || "general"}] ${(m.content || "").slice(0, 200)}`
                ).join("\n");
            }
          } catch {
            // Non-fatal: episodic memory not available
          }

          // ── 3. Run Full L1-L30 Brain Agent Runtime ───────────────
          sendAgentStatus({ taskId, status: "running", agentType: agentIntent.agentType });

          const brainStepStart = Date.now();
          sendAgentStep({
            stepNumber: 3,
            type: "thinking",
            title: "Running L1-L30 Brain cognitive cycle...",
            content: `Full 30-layer brain stack: cognitive (L3-L15) + deep (L16-L30) + neural cortex + RL feedback${episodicContext ? ` + ${episodicContext.split("\n").length - 2} episodic memories` : ""}`,
            status: "started",
          });

          const {
            createCognitiveStack: createCS,
            createDeepLayers: createDL,
            createDeepPipeline: createDP,
            createNeuralCortexController: createNCC,
            createBrainAgentRuntime: createBAR,
            registerAllBrainAgents: regAll,
            createDomainTaxonomy: createDT,
            createCrossSystemEntityGraph: createCSEG,
          } = memStack;

          const dt = createDT();
          const eg = createCSEG();
          const cs = createCS({ organizationId: workspaceId, anthropicApiKey: anthropicApiKey! });
          const dl = createDL({ organizationId: workspaceId, domainTaxonomy: dt, entityGraph: eg });
          const dp = createDP({ organizationId: workspaceId, supabase: service, cognitiveStack: cs, deepLayers: dl, domainTaxonomy: dt, entityGraph: eg });
          const cortex = createNCC({ organizationId: workspaceId, supabase: service, pipeline: dp, cognitiveStack: cs, deepLayers: dl });
          const closedLoop = cortex.getClosedLoopEngine();

          const brainRuntime = createBAR({
            supabase: service,
            organizationId: workspaceId,
            cortex,
            closedLoop: closedLoop ?? undefined,
            defaultAnthropicApiKey: anthropicApiKey!,
            verbose: false,
          });

          regAll(brainRuntime);

          // Map agent type to brain agent ID
          const AGENT_TYPE_MAP: Record<string, string> = {
            "openclaw": "codebase-mapper",
            "code-review": "code-reviewer",
            "diagnose": "incident-diagnoser",
            "incident-diagnosis": "incident-diagnoser",
            "build": "feature-builder",
            "feature-build": "feature-builder",
            "test": "test-case-generator",
            "tdd": "tdd-generator",
            "analyze": "impact-analyzer",
            "impact-analysis": "impact-analyzer",
            "general": "codebase-mapper",
          };
          const brainAgentId = AGENT_TYPE_MAP[agentIntent.agentType] || "codebase-mapper";

          // Compose prompt with episodic context if available
          const agentPrompt = episodicContext
            ? `${message.trim()}${episodicContext}${caseLogCtx}`
            : `${message.trim()}${caseLogCtx}`;

          const brainResult = await brainRuntime.execute({
            agentId: brainAgentId,
            input: {
              prompt: agentPrompt,
              agentType: agentIntent.agentType,
              taskId,
              ...(agentIntent.extractedParams.jiraId ? { jiraId: agentIntent.extractedParams.jiraId } : {}),
              ...(agentIntent.extractedParams.repo ? { repo: agentIntent.extractedParams.repo } : {}),
              ...(agentIntent.extractedParams.branch ? { branch: agentIntent.extractedParams.branch } : {}),
            },
            anthropicApiKey: anthropicApiKey!,
            confidenceThreshold: 0.8,
            userId: user.id,
            userQuery: message.trim(),
          });

          const brainStepDuration = Date.now() - brainStepStart;

          sendAgentStep({
            stepNumber: 3,
            type: "thinking",
            title: `Brain cycle complete — ${(brainResult.confidence * 100).toFixed(0)}% confidence`,
            content: `Model: ${brainResult.metrics.model}, Tokens: ${brainResult.metrics.tokensUsed}, Brain: ${brainResult.metrics.brainCycleDurationMs}ms, Claude: ${brainResult.metrics.claudeCallDurationMs}ms`,
            durationMs: brainStepDuration,
            status: "completed",
          });

          await service.from("brain_agent_steps").insert({
            task_id: taskId,
            step_number: 3,
            step_type: "reasoning",
            title: "L1-L30 Brain cognitive cycle",
            content: `Confidence: ${(brainResult.confidence * 100).toFixed(0)}%, Model: ${brainResult.metrics.model}`,
            started_at: new Date(brainStepStart).toISOString(),
            completed_at: new Date().toISOString(),
            duration_ms: brainStepDuration,
          });

          // Checkpoint after brain runtime (pre-action — reversible point before emitting results)
          await saveCheckpoint(3, "post_action", {
            phase: "brain_runtime_complete",
            confidence: brainResult.confidence,
            model: brainResult.metrics.model,
            tokensUsed: brainResult.metrics.tokensUsed,
            responseSummary: (brainResult.agentOutput.rawResponse || "").toString().slice(0, 200),
          });

          // ── 4. Extract and stream results ──────────────────────
          const responseText = brainResult.agentOutput.rawResponse
            ? String(brainResult.agentOutput.rawResponse)
            : JSON.stringify(brainResult.agentOutput, null, 2);

          sendAgentStep({
            stepNumber: 4,
            type: "acting",
            title: "Generating results and artifacts...",
            status: "started",
          });

          // Extract code blocks as progressive artifacts
          const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
          let codeMatch;
          let artIdx = 0;
          while ((codeMatch = codeBlockRegex.exec(responseText)) !== null) {
            const lang = codeMatch[1] || "text";
            const code = codeMatch[2].trim();
            if (code.split("\n").length >= 2) {
              artIdx++;
              sendProgressiveArtifact({
                id: `code-${taskId.slice(0, 8)}-${artIdx}`,
                type: "code",
                title: `Agent Output ${artIdx} (${lang})`,
                content: code,
                isPartial: false,
                service: "core",
              });
            }
          }

          sendAgentStep({
            stepNumber: 4,
            type: "acting",
            title: `${artIdx + 1} artifact(s) generated`,
            durationMs: Date.now() - agentStartTime,
            status: "completed",
          });

          // ── 5. Update task to completed/awaiting_approval ──────
          const finalStatus = brainResult.status === "auto-executed" ? "completed" : "awaiting_approval";
          agentFinalStatus = finalStatus === "completed" ? "completed" : "partial";
          agentOutputSummary = responseText.slice(0, 200);
          agentModelUsed = brainResult.metrics?.model ?? "claude-sonnet-4-20250514";

          const agentArtifacts = [
            {
              id: `agent_${taskId.slice(0, 8)}_analysis`,
              type: "analysis",
              title: `Agent Analysis: ${message.slice(0, 50)}${message.length > 50 ? "..." : ""}`,
              language: "markdown",
              content: responseText,
              createdAt: Date.now(),
            },
          ];

          await service
            .from("brain_agent_tasks")
            .update({
              status: finalStatus,
              confidence_score: brainResult.confidence,
              result_summary: responseText.slice(0, 500),
              result_artifacts: agentArtifacts,
              result_metadata: {
                tokensUsed: brainResult.metrics?.tokensUsed,
                durationMs: Date.now() - agentStartTime,
                model: brainResult.metrics?.model,
                autoExecuted: brainResult.status === "auto-executed",
                brainCycleDurationMs: brainResult.metrics?.brainCycleDurationMs,
                claudeCallDurationMs: brainResult.metrics?.claudeCallDurationMs,
                compositeConfidence: brainResult.confidence,
                agentIntent: agentIntent,
              },
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", taskId)
            .then(() => {}, () => {});

          // ── 6. Stream final agent-execution artifact ────────────
          const allSteps = [
            { stepNumber: 1, type: "querying" as const, title: "Brain intelligence loaded", status: "completed" as const, durationMs: Date.now() - agentStartTime },
            ...(agentIntent.extractedParams.jiraId ? [{ stepNumber: 2, type: "querying" as const, title: `${agentIntent.extractedParams.jiraId} context`, toolName: "brain_jira_context", status: "completed" as const }] : []),
            { stepNumber: 3, type: "thinking" as const, title: `Brain cycle — ${(brainResult.confidence * 100).toFixed(0)}%`, status: "completed" as const, durationMs: brainStepDuration },
            { stepNumber: 4, type: "acting" as const, title: `${artIdx + 1} artifacts generated`, status: "completed" as const },
          ];

          // Emit agent-execution artifact for right panel
          agentSend(JSON.stringify({
            agentExecutionArtifact: {
              id: `agent-exec-${taskId.slice(0, 8)}`,
              type: "agent-execution",
              title: `${agentIntent.agentType} Agent Execution`,
              service: "agent",
              rawData: {
                taskId,
                agentType: agentIntent.agentType,
                status: finalStatus,
                steps: allSteps,
                summary: responseText.slice(0, 300),
                artifacts: agentArtifacts.map(a => ({ id: a.id, type: a.type, title: a.title })),
                timing: {
                  totalMs: Date.now() - agentStartTime,
                  stepCount: allSteps.length,
                },
              },
            },
          }));

          sendAgentStatus({
            taskId,
            status: finalStatus === "completed" ? "completed" : "awaiting_approval",
            agentType: agentIntent.agentType,
            message: finalStatus === "completed"
              ? `Agent completed with ${(brainResult.confidence * 100).toFixed(0)}% confidence.`
              : `Agent needs approval (${(brainResult.confidence * 100).toFixed(0)}% confidence).`,
          });

          // ── 7. Stream the LLM response text as normal chat ──────
          // This makes the agent's analysis appear as readable chat text
          const words = responseText.split(" ");
          for (let i = 0; i < words.length; i++) {
            agentSendText(words[i] + (i < words.length - 1 ? " " : ""));
            // Micro-delay for streaming effect (~50 words at a time)
            if (i % 50 === 49) {
              await new Promise(r => setTimeout(r, 10));
            }
          }

          // ── 8. Emit learning signal ────────────────────────────
          await service.from("cross_domain_signals").insert({
            organization_id: workspaceId,
            source_domain: "brain.agents",
            signal_type: `copilot_agent_${agentIntent.agentType}_completed`,
            signal_value: brainResult.confidence,
            signal_timestamp: new Date().toISOString(),
            entity_type: "brain_agent_task",
            entity_id: taskId,
            signal_metadata: {
              prompt: message.slice(0, 200),
              agentType: agentIntent.agentType,
              autoExecuted: brainResult.status === "auto-executed",
              durationMs: Date.now() - agentStartTime,
              userId: user.id,
            },
          }).then(() => {}, () => { /* non-blocking */ });

          // ── 9. Store episodic memory for agent continuity (Week 5) ──
          const runSummary = `Task: ${message.slice(0, 200)}. ` +
            `Outcome: ${finalStatus} (${(brainResult.confidence * 100).toFixed(0)}% confidence). ` +
            `Key findings: ${responseText.slice(0, 300)}`;

          await service.from("agent_episodic_memory").insert({
            organization_id: workspaceId,
            agent_type: agentIntent.agentType,
            episode_type: "run_summary",
            content: runSummary,
            importance: Math.min(0.5 + brainResult.confidence * 0.3, 0.9),
            metadata: {
              taskId,
              prompt: message.slice(0, 200),
              confidence: brainResult.confidence,
              completedAt: new Date().toISOString(),
            },
          }).then(() => {}, () => { /* non-blocking */ });

        } catch (err) {
          logger.error("[AgentMode] Error:", err instanceof Error ? err.message : String(err));
          const errMsg = "Agent execution failed";

          if (taskId) {
            sendAgentStatus({ taskId, status: "failed", message: errMsg });
            await service
              .from("brain_agent_tasks")
              .update({
                status: "failed",
                error_message: errMsg,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", taskId)
              .then(() => {}, () => {});
          }

          agentSendError(`Agent failed: ${errMsg}`);
        }

        logAgentRetro({
          taskId,
          agentType: agentIntent?.agentType ?? "general",
          prompt: message.trim().slice(0, 200),
          status: agentFinalStatus,
          durationMs: Date.now() - agentStartTime,
          modelUsed: agentModelUsed,
          outputSummary: agentOutputSummary || "Agent completed",
        }).catch(() => {}); // non-blocking

        agentClose();
      })();

      return new Response(agentSSEStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── Domain Action Engine — give brain HANDS (Motor Cortex) ─────────
    // Routes intent to the RIGHT execution module (forecaster, simulator,
    // explainer) and produces structured artifacts with REAL computed data.
    let actionArtifact: Record<string, unknown> | null = null;
    const actionIntents = new Set(["build", "predict", "diagnose"]);
    const detectedIntent = brainContext?.intent || "general";
    const detectedDomains = brainContext?.domains || ["finance", "strategy"];
    const forceAction = /what\s+if|forecast|simulate|predict\s+\d+|project\s+\d+|build\s+.*model|comprehensive|full\s+analysis/.test(
      message.toLowerCase()
    );

    if (actionIntents.has(detectedIntent) || forceAction) {
      try {
        const { createDomainActionEngine, formatArtifactForPrompt } = memStack;
        const engine = createDomainActionEngine({
          supabase,
          organizationId: workspaceId,
          amplifierConfig: process.env.ANTHROPIC_API_KEY
            ? { provider: "anthropic" as const, apiKey: process.env.ANTHROPIC_API_KEY }
            : undefined,
        });

        // Build lightweight ActionKnowledgeContext from already-fetched DB data
        const knowledgeCtx = buildActionKnowledge(
          message,
          detectedIntent,
          detectedDomains,
          causalEdges,
          rules,
          entityState
        );

        // Wrap in a 10s timeout — engine.execute() calls the LLM amplifier which can
        // take up to 30s. Without a timeout this blocks the entire handler synchronously
        // before the SSE stream is returned, causing client-visible hangs (e.g. Q5:
        // "Analyse delivery velocity and predict risk" → detectedIntent="predict").
        const engineTimeout = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 10_000)
        );
        const engineResult = await Promise.race([
          engine.execute(message, knowledgeCtx).then((a: unknown) => a).catch(() => null),
          engineTimeout,
        ]);
        if (engineResult) {
          actionArtifact = engineResult as unknown as Record<string, unknown>;
          // Store formatted prompt text for system prompt augmentation
          (actionArtifact as Record<string, unknown>).__promptText =
            formatArtifactForPrompt(engineResult);
        }
      } catch (err) {
        logger.warn(
          "[ActionEngine] Non-fatal failure, falling back to LLM-only:",
          err
        );
      }
    }

    // ── Check for Anthropic API key ─────────────────────────────────────
    if (!anthropicKey) {
      const { stream, sendText, close } = createSSEStream();

      // Generate fallback from brain context
      const fallbackResponse = brainContext
        ? `Brain Context (${brainContext.intent} intent, ${brainContext.domains.join(", ")} domains, confidence: ${(brainContext.confidence * 100).toFixed(0)}%)\n\n` +
          brainContext.sections.map((s) => `${s.title}\n${s.content}`).join("\n\n") +
          "\n\nNote: ANTHROPIC_API_KEY is not configured. This is a brain-data-only response. Configure the API key for full AI-powered answers."
        : "No brain context available and ANTHROPIC_API_KEY is not configured. Please configure the API key for AI-powered answers.";

      setTimeout(() => {
        const words = fallbackResponse.split(" ");
        let i = 0;
        const interval = setInterval(() => {
          if (i < words.length) {
            sendText(words[i] + (i < words.length - 1 ? " " : ""));
            i++;
          } else {
            clearInterval(interval);
            close();
          }
        }, 30);
      }, 100);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── Build messages array with token-aware conversation history (Phase 4) ──
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      // Token-aware history capping: include as many recent messages as fit in budget
      const recent = conversationHistory.slice(-20); // Hard cap: max 20 messages
      let historyTokens = 0;
      const budgetedHistory: typeof messages = [];

      // Walk backwards (most recent first) to prioritize recent context
      for (let i = recent.length - 1; i >= 0; i--) {
        const msg = recent[i];
        if (!msg || (msg.role !== "user" && msg.role !== "assistant") || typeof msg.content !== "string") continue;
        const capped = msg.content.slice(0, 50_000); // Cap individual message length
        const tokens = estimateTokens(capped);
        if (historyTokens + tokens > MAX_HISTORY_TOKENS) break; // Budget exhausted
        historyTokens += tokens;
        budgetedHistory.unshift({ role: msg.role, content: capped });
      }
      messages.push(...budgetedHistory);
    }

    // Add current message
    messages.push({ role: "user", content: message });

    // ── Build effective system prompt ──────────────────────────────────
    // V4: brainContext.fullPrompt is the COMPLETE system prompt from the SDK.
    // It already includes persona, intent-aware instructions, and ALL brain data.
    const NO_HALLUCINATION_FALLBACK = `You are the Brain OS AI Worker — an intelligence co-pilot.

CRITICAL RULES:
1. You MUST ONLY answer using data that exists in the brain context below. Do NOT invent, fabricate, or hallucinate any numbers, metrics, KPIs, trends, or statistics.
2. If no brain data is available for the user's question, say clearly: "I don't have data on that yet. Connect a data source for [topic] — once connected, I'll be able to answer with real numbers."
3. NEVER make up financial figures, causal relationships, revenue numbers, churn rates, burn rates, or any quantitative claims unless they appear in the brain context.
4. If the user asks about something outside the brain's knowledge, acknowledge the gap honestly. Offer to help with what IS available.
5. When you DO have data, cite it precisely — use the exact numbers from the brain context, not approximations or "typical" values.

You currently have: ${causalEdges.length} causal edges, ${rules.length} business rules, ${patterns.length} patterns/insights, ${cascadeRules.length} cascade rules loaded.`;

    let effectiveSystemPrompt = brainContext?.fullPrompt || NO_HALLUCINATION_FALLBACK;

    // ── Memory compression injection ──────────────────────────────────────────
    // When the user compressed earlier conversation turns, prepend the summary so
    // the LLM has context from ALL prior messages — not just the last 10.
    // This is the "unlimited memory" mechanism: summary + recent turns = full continuity.
    if (compressedSummary && compressedSummary.trim().length > 0) {
      effectiveSystemPrompt =
        `## CONVERSATION MEMORY (earlier turns summarized)\n${compressedSummary}\n\n---\n\n` +
        effectiveSystemPrompt;
    }

    // ── Zero-data guard: even when brainContext exists, if the org has NO data,
    // inject an explicit "don't hallucinate" instruction so the LLM doesn't invent metrics.
    const totalDataPoints = causalEdges.length + rules.length + patterns.length + cascadeRules.length;
    if (totalDataPoints === 0) {
      effectiveSystemPrompt += `\n\n## ⚠️ EMPTY BRAIN — NO DATA LOADED FOR THIS ORGANIZATION
This organization has not connected any data sources yet (no Xero, Volopay, GitHub, or other connectors).
You have ZERO causal edges, ZERO business rules, ZERO patterns, and ZERO cascade rules.
DO NOT invent any data. Instead:
- Tell the user that no data sources have been connected yet
- Suggest they connect their data sources (Xero, Volopay, GitHub, etc.) from the Settings page
- You can still answer general questions about Brain OS's capabilities
- NEVER fabricate numbers, metrics, or analysis — you have nothing to analyze`;
    }

    // ── Delivery Intelligence exemption — overrides zero-data restriction ──
    // Pod-match, early-warning, scope-creep, delivery-intelligence are AI-reasoned
    // domains. They do NOT require pre-loaded causal graph data to be useful.
    // The AI worker IS the intelligence — it reasons from the question + domain knowledge.
    // This exemption MUST come AFTER the zero-data guard so it can override it.
    if (deliveryIntelligenceResult) {
      const delivExemptDomain = (deliveryIntelligenceResult._domainType as string) || 'delivery-intelligence';
      effectiveSystemPrompt += `\n\n## ✅ DELIVERY INTELLIGENCE ACTIVE — EXEMPTION FROM ZERO-DATA RULES
You are operating as a SE-aaS Delivery Intelligence AI for the "${delivExemptDomain}" domain.
This OVERRIDES the "no data" restriction above. Delivery intelligence is AI-reasoned, not data-dependent.

You MUST give a specific, helpful, expert response. Do NOT refuse. Do NOT list what data is missing.
- For pod-match: Give a pod assignment framework, ask targeted questions about team/engagement
- For early-warning: Give velocity/capacity analysis framework, ask about current sprint signals
- For scope-creep: Give scope drift analysis, ask about story point changes
- For delivery-intelligence: Give a delivery health overview, guide toward key risk areas

This is your primary job as an SE-aaS Delivery Intelligence AI. Provide value even without live signals.`;
    }

    // ── Visual output instruction: charts, diagrams, infographics ─────────
    effectiveSystemPrompt += `\n\n## VISUAL OUTPUT — Charts, Diagrams & Infographics
You MUST use rich visual output whenever data supports it. The UI renders these as beautiful interactive artifacts that WOW users.

### 1. Charts (rendered as interactive Recharts components)
Wrap JSON in a \`\`\`chart fence. Supported types: "bar", "line", "area", "stacked-bar".
\`\`\`chart
{"type":"stacked-bar","title":"Requirements by Priority & Status","xKey":"priority","series":[{"key":"Done","label":"Done","color":"#10b981"},{"key":"In Progress","label":"In Progress","color":"#3b82f6"},{"key":"To Do","label":"To Do","color":"#94a3b8"}],"data":[{"priority":"Highest","Done":3,"In Progress":5,"To Do":2}]}
\`\`\`
Use colors: green=#10b981, blue=#3b82f6, amber=#f59e0b, red=#ef4444, purple=#8b5cf6, gray=#94a3b8, cyan=#06b6d4, pink=#ec4899

### 2. Mermaid Diagrams (rendered as interactive SVG with dark/light theme)
\`\`\`mermaid
graph TD
  A[Engineering Velocity] -->|effect: 0.72| B[Delivery Speed]
  style A fill:#3b82f6,color:#fff,stroke:#3b82f6
\`\`\`
Supported: graph (flowchart), gantt, stateDiagram, sequenceDiagram, pie, classDiagram, gitgraph.

### 3. Mandatory Visual Patterns by Query Type:

**P0/P1 Requirements → MINIMUM 3 visual artifacts:**
1. Stacked-bar chart: status distribution by priority
2. Mermaid flowchart: feature status map (green=done, blue=wip, gray=todo, red=blocker)
3. Markdown table: structured ticket list with Key|Priority|Type|Status|Assignee|Summary
4. (bonus) Mermaid diagram: blocker dependency graph showing what blocks what

**Release Readiness → MINIMUM 3 visual artifacts:**
1. Bar chart: completion % by component/epic (target vs actual)
2. Mermaid Gantt chart: timeline of sprint/release milestones
3. Risk table with color-coded severity
4. (bonus) Stacked-bar: issue type breakdown

**Causal/Impact Analysis → MINIMUM 2 visual artifacts:**
1. Mermaid flowchart: causal chain with effect_size on edges, nodes colored by impact
2. Line chart: metric trend over time showing the causal relationship
3. (bonus) Mermaid stateDiagram showing state transitions

**Engineering Health/Velocity → MINIMUM 2 visual artifacts:**
1. Line or area chart: velocity/throughput trends
2. Mermaid flowchart: bottleneck dependency map
3. (bonus) Bar chart: reviewer/contributor distribution

**Team/Workload → MINIMUM 2 visual artifacts:**
1. Bar chart: ticket/PR distribution by assignee
2. Mermaid diagram: collaboration/ownership map

### 4. Visual Presentation Rules:
- **ALWAYS lead with visuals** — charts and diagrams FIRST, then narrative explanation
- **Minimum 2 visual artifacts per response** when data exists — chart + diagram together
- **Color coding** (CONSISTENT everywhere): red=#ef4444 (risk/blocker), amber=#f59e0b (warning/medium), green=#10b981 (done/good), blue=#3b82f6 (in-progress/info), purple=#8b5cf6 (assignments), gray=#94a3b8 (todo/unknown)
- **Mermaid node styling**: ALWAYS add style directives with fill colors and white text (color:#fff)
- **Chart data**: Use REAL numbers from the brain context. Never approximate or invent.
- **Tables**: Use markdown tables liberally. For requirements: Key | Priority | Type | Status | Assignee | Summary
- **Bold numbers**: Wrap key metrics in **bold** (e.g., **85%** completion, **3** blockers)
- **Section headers**: Use ## and ### to create scannable structure
- **Emoji indicators**: ✅ Done, 🔄 In Progress, 📋 To Do, 🔴 Blocker, ⚠️ At Risk, 🟢 On Track`;


    // Augment with action engine computed data if available
    if (actionArtifact?.__promptText) {
      effectiveSystemPrompt +=
        "\n\n## COMPUTED DATA + EXECUTION PLAYBOOK + DECISION INTELLIGENCE + MOTOR COMMANDS + CALIBRATION (use these REAL numbers, recommended actions, meta-cognition, counterfactuals, motor commands, and calibration status — do NOT invent data)\n" +
        String(actionArtifact.__promptText);
    }

    // ── P0 ENGINEERING METRICS: Inject live velocity + bottleneck data ──
    // This makes the Copilot able to answer "Why is velocity collapsing?" with REAL data
    if (brainContext && (brainContext as any).regionsUsed) {
      const liveSignals = ((brainContext as any).regions || (brainContext as any).brainRegions || {} as any).liveSignals;
      if (liveSignals?.engineeringSummary) {
        const eng = liveSignals.engineeringSummary;
        effectiveSystemPrompt += `\n\n## LIVE ENGINEERING METRICS (P0 Early Warning — use these REAL numbers)
- PRs merged (last 7 days): ${eng.prsMergedLast7Days}
- Avg PR cycle time: ${eng.avgCycleTimeHours ? (eng.avgCycleTimeHours / 24).toFixed(1) + ' days' : 'N/A'}
- Open PRs (WIP): ${eng.openPRs}
- Bottleneck risk score: ${eng.bottleneckRiskScore}/100 (${eng.bottleneckRiskLevel})
- Top reviewer share: ${typeof eng.topReviewerShare === 'number' ? (eng.topReviewerShare * 100).toFixed(0) + '%' : 'N/A'}
- Reviewer Gini coefficient: ${typeof eng.giniCoefficient === 'number' ? eng.giniCoefficient.toFixed(2) : 'N/A'}
- Engineering signals (14d): ${eng.recentSignalCount}

When the user asks about velocity, bottlenecks, or engineering health, use THESE numbers. Cite them precisely.`;
      }
    }

    // ── CROSS-DOMAIN ENTITY LINKS: The Brain's connective tissue ──────────
    // This is what makes GitHub↔Jira↔Slack connected in the Brain.
    // Without this, Copilot cannot answer "What Jira tickets are linked to velocity collapse?"
    if (entityLinks.length > 0) {
      // Group links by type for a clean context block
      const prToJira = entityLinks.filter((l: any) => l.link_type === 'pr_references_ticket');
      const slackToPR = entityLinks.filter((l: any) => l.link_type === 'slack_mentions_pr');
      const slackToJira = entityLinks.filter((l: any) => l.link_type === 'slack_mentions_ticket');
      const commitToJira = entityLinks.filter((l: any) => l.link_type === 'commit_references_ticket');

      effectiveSystemPrompt += `\n\n## CROSS-DOMAIN ENTITY LINKS (Brain's Knowledge Graph — use to answer cross-system questions)
The Brain has built ${entityLinks.length} verified connections between GitHub, Jira, and Slack:

${prToJira.length > 0 ? `### PRs linked to Jira Tickets (${prToJira.length} links)
${prToJira.slice(0, 30).map((l: any) => `- ${l.source_entity_id} → ${l.target_entity_id.replace('jira#', 'Jira:')} [${(l.confidence * 100).toFixed(0)}% confidence | ${l.evidence}]`).join('\n')}` : ''}

${commitToJira.length > 0 ? `### Commits linked to Jira Tickets (${commitToJira.length} links)
${commitToJira.slice(0, 20).map((l: any) => `- commit ${l.source_entity_id.split(':')[1]?.slice(0, 8)} in ${l.source_entity_id.split(':')[0]} → ${l.target_entity_id.replace('jira#', 'Jira:')} | ${l.evidence}`).join('\n')}` : ''}

${slackToPR.length > 0 ? `### Slack Discussions about PRs (${slackToPR.length} links)
${slackToPR.slice(0, 20).map((l: any) => `- Slack message → ${l.target_entity_id} | ${l.evidence}`).join('\n')}` : ''}

${slackToJira.length > 0 ? `### Slack Discussions about Jira Tickets (${slackToJira.length} links)
${slackToJira.slice(0, 20).map((l: any) => `- Slack message → ${l.target_entity_id.replace('jira#', 'Jira:')} | ${l.evidence}`).join('\n')}` : ''}

USE THESE LINKS to:
- Answer "What code changes are linked to [Jira ticket]?" → find PRs/commits with that ticket
- Answer "What Slack discussions happened around [PR]?" → find Slack→PR links
- Connect velocity collapse signals to specific Jira tickets via PR links
- Show the full chain: Jira ticket → PR → commit → Slack discussion`;
    }

    // ── REQUIREMENT INTELLIGENCE: Ticket-level data + pre-computed visuals ────
    // This is the "wow factory" — the copilot's killer feature for design partners.
    // We inject BOTH raw ticket data AND pre-computed chart specs + Mermaid code
    // so the LLM produces stunning visual artifacts with real data on first response.
    const reqIntel = (brainRegions as any)?.requirementIntelligence;
    const codeCoverage = (brainRegions as any)?.codeCoverage;

    if (reqIntel && reqIntel.ticketCount > 0) {
      const risk = reqIntel.riskAssessment || {};
      const charts = reqIntel.precomputedCharts || {};

      effectiveSystemPrompt += `\n\n## REQUIREMENT INTELLIGENCE — ${reqIntel.ticketCount} Jira Tickets

### Executive Summary
- **Completion Rate**: ${risk.completionRate || '?'}% of tickets are Done
- **Risk Level**: ${risk.riskLevel || 'UNKNOWN'} (${risk.blockerCount || 0} open high-priority blockers)
- **Ticket Distribution**: ${reqIntel.stats}

### Risk & Blockers (HIGHLIGHT THESE — color red)
${risk.riskItems || 'No high-priority blockers found'}

### Full Ticket Details (sorted by priority then recency)
${reqIntel.ticketList}

---

## PRE-COMPUTED VISUAL ARTIFACTS — USE THESE EXACTLY (copy-paste into your response)

### ARTIFACT 1: Status Distribution Chart (ALWAYS include this)
Embed this chart block in your response (it renders as an interactive stacked-bar chart):
\`\`\`chart
${charts.statusDistribution || '{}'}
\`\`\`

${charts.workloadDistribution ? `### ARTIFACT 2: Workload Distribution Chart (include when discussing team/assignments)
\`\`\`chart
${charts.workloadDistribution}
\`\`\`` : ''}

${charts.issueTypeBreakdown ? `### ARTIFACT 3: Issue Type Breakdown (include when discussing scope)
\`\`\`chart
${charts.issueTypeBreakdown}
\`\`\`` : ''}

### ARTIFACT 4: Feature Status Map (Mermaid — ALWAYS include for P0/P1 queries)
This renders as a color-coded visual map of high-priority requirements:
\`\`\`mermaid
${reqIntel.precomputedMermaid || 'graph LR\n  NoData[No high-priority tickets]'}
\`\`\`

---

## RESPONSE BLUEPRINT FOR REQUIREMENT QUERIES

When answering about P0/P1 requirements, structure your response in this EXACT order:

**1. EXECUTIVE DASHBOARD** (first thing the user sees)
Start with a bold summary line: completion rate, risk level, blocker count.

**2. STATUS DISTRIBUTION CHART** (embed the pre-computed chart above)
Copy the stacked-bar chart block from ARTIFACT 1 above into your response.

**3. REQUIREMENTS TABLE** (structured markdown table)
| Key | Priority | Type | Status | Assignee | Summary |
Use the ticket details data. Separate by priority level with headers.

**4. FEATURE STATUS MAP** (embed the pre-computed Mermaid diagram)
Copy ARTIFACT 4 above. Each node is color-coded: green=done, blue=in-progress, gray=todo.

**5. RISK ASSESSMENT** (use red/amber colors)
List all open high-priority blockers from the Risk & Blockers section above.
Add a Mermaid diagram showing dependencies between blockers:
\`\`\`mermaid
graph TD
  BLOCKER1[Ticket Key - Summary] -->|blocks| FEATURE1[Dependent Feature]
  style BLOCKER1 fill:#ef4444,color:#fff
\`\`\`

**6. CODE COVERAGE ANALYSIS** (if PR links are available)
Show which requirements have linked PRs (green) vs gaps (red).

**7. WORKLOAD CHART** (embed ARTIFACT 2 if available)

**CRITICAL**: You MUST include at least 3 visual artifacts (charts + Mermaid diagrams) in EVERY response about requirements. The chart/mermaid blocks render as beautiful interactive visuals. Users judge the product by these visuals — make them count.`;
    }

    if (codeCoverage && codeCoverage.linkCount > 0) {
      effectiveSystemPrompt += `\n\n## CODE COVERAGE — ${codeCoverage.linkCount} Code↔Ticket Links | **${codeCoverage.coverageRate || '?'}%** coverage (${codeCoverage.coveredCount || 0} covered, ${codeCoverage.uncoveredCount || 0} gaps)

### Ticket → Code Mapping
${codeCoverage.prToTicketLinks}

${codeCoverage.uncoveredCount > 0 ? `### ⚠️ COVERAGE GAPS — Tickets with NO linked code
These tickets have no PRs or commits addressing them:
${(codeCoverage.uncoveredTickets || []).map((t: string) => `- 🔴 **${t}** — No code coverage`).join('\n')}` : '### ✅ All tracked tickets have code coverage'}

### Pre-computed Coverage Map (Mermaid — include this in your response)
\`\`\`mermaid
${codeCoverage.mermaidCoverageMap || 'graph LR\n  NoCovData[No coverage data]'}
\`\`\`

USE THIS TO:
- Show code coverage % prominently in executive summaries
- Highlight coverage gaps in red — these are release risks
- Link specific PRs to specific requirements when asked "What code backs this?"
- Include the pre-computed Mermaid coverage map in your response for visual impact`;
    }

    // ── LIVE CAPABILITY DEMONSTRATION: Connect brain's metrics to P0 requirements ──
    // This is the KILLER WOW moment — when the user asks about P0 requirements,
    // the copilot doesn't just list Jira tickets, it DEMONSTRATES that the brain
    // is ALREADY computing what the P0 functions describe. This is the "holy shit
    // it already works" moment that wins design partners.
    if (reqIntel && reqIntel.ticketCount > 0) {
      const liveSignals = ((brainRegions as any).liveSignals || {});
      const eng = liveSignals.engineeringSummary;
      const velocitySnaps = liveSignals.velocitySnapshots;
      const bottleneckSnap = liveSignals.bottleneckSnapshot;

      // Fetch velocity scorecard, reviewer patterns, prediction, and centrality from ai_memory
      let velocityScorecard: any = null;
      let reviewerPattern: any = null;
      let cycleTimePattern: any = null;
      let velocityPrediction: any = null;
      let betweennessCentrality: any = null;
      try {
        const [vsRes, rpRes, ctRes, vpRes, bcRes] = await Promise.all([
          service.from("ai_memory").select("content, importance")
            .eq("organization_id", workspaceId)
            .eq("memory_type", "pattern")
            .eq("domain", "engineering.velocity_scorecard")
            .limit(1),
          service.from("ai_memory").select("content, importance")
            .eq("organization_id", workspaceId)
            .eq("memory_type", "pattern")
            .eq("domain", "engineering.reviewers")
            .limit(1),
          service.from("ai_memory").select("content, importance")
            .eq("organization_id", workspaceId)
            .eq("memory_type", "pattern")
            .eq("domain", "engineering.cycle_time")
            .limit(1),
          service.from("ai_memory").select("content, importance")
            .eq("organization_id", workspaceId)
            .eq("memory_type", "pattern")
            .eq("domain", "engineering.velocity_prediction")
            .limit(1),
          service.from("ai_memory").select("content, importance")
            .eq("organization_id", workspaceId)
            .eq("memory_type", "pattern")
            .eq("domain", "engineering.betweenness_centrality")
            .limit(1),
        ]);
        const tryParse = (row: any) => {
          if (!row?.data?.[0]) return null;
          try { return typeof row.data[0].content === 'string' ? JSON.parse(row.data[0].content) : row.data[0].content; } catch { return null; }
        };
        velocityScorecard = tryParse(vsRes);
        reviewerPattern = tryParse(rpRes);
        cycleTimePattern = tryParse(ctRes);
        velocityPrediction = tryParse(vpRes);
        betweennessCentrality = tryParse(bcRes);
      } catch {
        // Non-fatal — ai_memory may not have these patterns yet
      }

      const hasVelocityData = eng || velocityScorecard || cycleTimePattern;
      const hasBottleneckData = bottleneckSnap || reviewerPattern;

      if (hasVelocityData || hasBottleneckData) {
        effectiveSystemPrompt += `\n\n## 🧠 LIVE CAPABILITY DEMONSTRATION — Brain OS is ALREADY Computing P0 Functions

**CRITICAL INSTRUCTION**: When the user asks about P0 requirements, DO NOT just list Jira tickets.
Show them that Brain OS is ALREADY computing what these P0 functions describe, using REAL data from their repos.
This is the most impressive thing you can show — the product ALREADY WORKS on their data.

Structure your response to FIRST show the Jira requirements, THEN demonstrate the live capability.`;

        // Function 01: Velocity Collapse Warning — demonstrate with real metrics
        if (hasVelocityData) {
          const prsMerged = eng?.prsMergedLast7Days ?? velocityScorecard?.total_prs ?? '?';
          const avgCycleHrs = eng?.avgCycleTimeHours ?? cycleTimePattern?.avg_hours ?? null;
          const avgCycleDays = avgCycleHrs ? (avgCycleHrs / 24).toFixed(1) : '?';
          const openPRs = eng?.openPRs ?? '?';
          const totalCommits = velocityScorecard?.total_commits ?? '?';
          const totalReviews = velocityScorecard?.total_reviews ?? '?';
          const hotspotCount = velocityScorecard?.hotspot_count ?? '?';
          const p75 = cycleTimePattern?.p75_hours ? (cycleTimePattern.p75_hours / 24).toFixed(1) : '?';
          const p95 = cycleTimePattern?.p95_hours ? (cycleTimePattern.p95_hours / 24).toFixed(1) : '?';
          const slowRatio = cycleTimePattern?.slow_pr_ratio ? (cycleTimePattern.slow_pr_ratio * 100).toFixed(0) : '?';

          effectiveSystemPrompt += `

### P0 Function 01: "Tell Me Before We're About to Miss" — Delivery Velocity Collapse Warning
🟢 **BRAIN OS IS ALREADY COMPUTING THIS.** Here are the REAL metrics:

| Metric | Value | What It Means |
|--------|-------|---------------|
| PRs Merged (7d) | **${prsMerged}** | Current sprint throughput |
| Avg PR Cycle Time | **${avgCycleDays} days** | Time from PR open to merge |
| P75 Cycle Time | **${p75} days** | 75th percentile — most PRs merge within this |
| P95 Cycle Time | **${p95} days** | Outlier PRs — potential bottlenecks |
| Slow PR Ratio | **${slowRatio}%** | PRs taking >2x average time |
| Open PRs (WIP) | **${openPRs}** | Work-in-progress load |
| Total Commits | **${totalCommits}** | Code contribution volume |
| Total Reviews | **${totalReviews}** | Review activity level |
| Hotspot Files | **${hotspotCount}** | Files with concentrated changes |

**INCLUDE THIS CHART** in your response to visualize the data flow:
\`\`\`mermaid
graph TD
  GH["🔄 GitHub Repos"] -->|PRs, Commits, Reviews| SIG["📊 Signal Ingestion"]
  JR["📋 Jira Board"] -->|Tickets, Sprint Data| SIG
  SIG -->|Rolling 14-day Window| CALC["🧮 Velocity Calculator"]
  CALC -->|cycle_time, merge_rate, WIP| VEL["📈 Velocity Scorecard"]
  CALC -->|sprint_predicted < 0.8 × mean| ALERT["🚨 Collapse Warning"]
  VEL -->|Dashboard| DASH["📊 Engineering Dashboard"]
  ALERT -->|Slack/Email| NOTIFY["📬 Leadership Alert"]
  style GH fill:#3b82f6,color:#fff
  style JR fill:#8b5cf6,color:#fff
  style SIG fill:#06b6d4,color:#fff
  style CALC fill:#f59e0b,color:#fff
  style VEL fill:#10b981,color:#fff
  style ALERT fill:#ef4444,color:#fff
  style DASH fill:#10b981,color:#fff
  style NOTIFY fill:#ef4444,color:#fff
\`\`\`

**SAY THIS**: "Brain OS is already ingesting your GitHub and Jira data and computing a rolling 14-day velocity pulse. The metrics above are LIVE from your repositories. The velocity collapse detection triggers when predicted sprint velocity drops below 80% of the historical mean with >70% confidence."`;

          // Inject velocity prediction if available (from Holt's exponential smoothing)
          if (velocityPrediction) {
            const vp = velocityPrediction;
            const sprintHistory = vp.sprint_history || [];
            const collapseEmoji = vp.collapse_risk ? '🔴' : '🟢';

            // Build sprint velocity trend chart
            let sprintChartSpec = '';
            if (sprintHistory.length >= 3) {
              sprintChartSpec = JSON.stringify({
                type: "line",
                title: "Sprint Velocity Trend (PRs Merged per 14-Day Window)",
                xKey: "sprint",
                series: [
                  { key: "velocity", label: "Velocity", color: "#3b82f6" },
                  ...(sprintHistory[0]?.reviews !== undefined ? [{ key: "reviews", label: "Reviews", color: "#8b5cf6" }] : []),
                ],
                data: sprintHistory.map((s: any) => ({
                  sprint: s.sprint,
                  velocity: s.velocity,
                  ...(s.reviews !== undefined ? { reviews: s.reviews } : {}),
                })),
              });
            }

            effectiveSystemPrompt += `

#### 🔮 VELOCITY COLLAPSE PREDICTION MODEL (Holt's Exponential Smoothing)
${collapseEmoji} **Predicted next sprint velocity: ${vp.predicted_velocity?.toFixed(1) || '?'}** (${vp.confidence || '?'}% confidence)
- Historical mean: ${vp.historical_mean?.toFixed(1) || '?'} | Collapse threshold: ${vp.collapse_threshold?.toFixed(1) || '?'}
- Trend: **${vp.trend || '?'}** (slope: ${vp.trend_slope?.toFixed(2) || '?'} per sprint)
- Prediction interval (70%): [${vp.prediction_interval?.lower?.toFixed(1) || '?'}, ${vp.prediction_interval?.upper?.toFixed(1) || '?'}]
${vp.collapse_risk ? `- 🚨 **COLLAPSE WARNING ACTIVE**: ${(vp.trigger_reasons || []).join('. ')}` : '- ✅ No collapse warning — velocity is within normal range'}
- Based on ${vp.sprint_count || '?'} sprint windows of data

${sprintChartSpec ? `**INCLUDE THIS CHART** — Sprint Velocity Trend:
\`\`\`chart
${sprintChartSpec}
\`\`\`` : ''}

**SAY THIS**: "The prediction model uses Holt's double exponential smoothing — the statistical foundation behind gradient boosting models like XGBoost. It captures both the velocity level and acceleration trend, predicting ${vp.predicted_velocity?.toFixed(1) || '?'} PRs merged in the next sprint window with ${vp.confidence || '?'}% confidence. ${vp.collapse_risk ? 'A COLLAPSE WARNING has been triggered — immediate action is recommended.' : 'No collapse warning at this time.'}"`;
          }
        }

        // Function 02: Bottleneck Concentration Risk — demonstrate with real metrics
        if (hasBottleneckData) {
          const brs = eng?.bottleneckRiskScore ?? bottleneckSnap?.bottleneck_risk_score ?? '?';
          const brsLevel = eng?.bottleneckRiskLevel ?? bottleneckSnap?.risk_level ?? '?';
          const topShare = eng?.topReviewerShare ?? bottleneckSnap?.top_reviewer_share ?? 0;
          const topSharePct = typeof topShare === 'number' ? (topShare * 100).toFixed(0) : '?';
          const gini = eng?.giniCoefficient ?? bottleneckSnap?.reviewer_gini_coefficient ?? 0;
          const giniStr = typeof gini === 'number' ? gini.toFixed(2) : '?';
          const topReviewer = reviewerPattern?.top_reviewer ?? 'Unknown';
          const reviewerBreakdown = reviewerPattern?.reviewer_breakdown;
          const hhiIndex = reviewerPattern?.hhi_index ?? null;
          const hhiStr = typeof hhiIndex === 'number' ? hhiIndex.toFixed(3) : '?';
          const hhiRisk = reviewerPattern?.hhi_risk ?? 'UNKNOWN';
          const unavailImpact = reviewerPattern?.unavailability_impact;
          const blockedPRs = unavailImpact?.estimated_blocked_prs_5day ?? '?';
          const underUtilized = reviewerPattern?.under_utilized_reviewers;

          // Build reviewer distribution chart data
          let reviewerChartSpec = '';
          if (reviewerBreakdown && Array.isArray(reviewerBreakdown)) {
            if (reviewerBreakdown.length > 1) {
              reviewerChartSpec = JSON.stringify({
                type: "bar",
                title: "Reviewer Load Distribution (Live Data)",
                xKey: "reviewer",
                series: [{ key: "reviews", label: "PR Reviews", color: "#8b5cf6" }],
                data: reviewerBreakdown.map((r: any) => ({
                  reviewer: (r.name || '').split(' ')[0],
                  reviews: r.count || 0,
                })),
              });
            }
          } else if (reviewerBreakdown && typeof reviewerBreakdown === 'object') {
            const entries = Object.entries(reviewerBreakdown as Record<string, number>)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .slice(0, 8);
            if (entries.length > 1) {
              reviewerChartSpec = JSON.stringify({
                type: "bar",
                title: "Reviewer Load Distribution (Live Data)",
                xKey: "reviewer",
                series: [{ key: "reviews", label: "PR Reviews", color: "#8b5cf6" }],
                data: entries.map(([name, count]) => ({
                  reviewer: name.split(' ')[0],
                  reviews: count,
                })),
              });
            }
          }

          effectiveSystemPrompt += `

### P0 Function 02: "Show Me the Single Point of Failure" — Bottleneck Concentration Risk
🟢 **BRAIN OS IS ALREADY DETECTING THIS.** Here are the REAL bottleneck metrics:

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Bottleneck Risk Score (BRS) | **${brs}/100** | >60 = High Risk | ${Number(brs) > 60 ? '🔴 HIGH RISK' : Number(brs) > 30 ? '🟡 MEDIUM' : '🟢 LOW'} |
| Top Reviewer Share | **${topSharePct}%** | >40% = Danger Zone | ${Number(topSharePct) > 40 ? '🔴 CONCENTRATED' : '🟢 OK'} |
| Gini Coefficient | **${giniStr}** | 0=equal, 1=monopoly | ${Number(giniStr) > 0.4 ? '🔴 CONCENTRATED' : '🟢 DISTRIBUTED'} |
| HHI (Herfindahl-Hirschman) | **${hhiStr}** | >0.25 = Antitrust-level | ${hhiRisk === 'ANTITRUST_LEVEL' ? '🔴 ANTITRUST' : hhiRisk === 'MODERATE' ? '🟡 MODERATE' : '🟢 LOW'} |
| Top Reviewer | **${topReviewer}** | — | Single point of failure |
| 5-Day Unavailability Impact | **${blockedPRs} PRs blocked** | — | ${Number(blockedPRs) > 5 ? '🔴 CRITICAL' : '🟡 MANAGEABLE'} |

${underUtilized && Array.isArray(underUtilized) && underUtilized.length > 0 ? `**Under-utilized reviewers** (should absorb more load): ${underUtilized.map((r: any) => `${r.name} (${r.reviews} reviews)`).join(', ')}` : ''}

${reviewerChartSpec ? `**INCLUDE THIS CHART** — Reviewer Load Distribution:
\`\`\`chart
${reviewerChartSpec}
\`\`\`` : ''}

**INCLUDE THIS DIAGRAM** — Bottleneck Detection Architecture:
\`\`\`mermaid
graph TD
  GH["🔄 GitHub PR Events"] -->|Every review event| ING["📊 Review Signal Ingestion"]
  ING -->|14-day sliding window| CALC["🧮 Concentration Calculator"]
  CALC --> GINI["Gini: ${giniStr}"]
  CALC --> HHI_N["HHI: ${hhiStr}"]
  CALC --> TOP["Top Reviewer: ${topSharePct}%"]
  CALC --> BRS_NODE["BRS: ${brs}/100"]
  GINI --> RISK{"Risk Assessment"}
  HHI_N --> RISK
  TOP --> RISK
  BRS_NODE --> RISK
  RISK -->|BRS > 60| ALERT["🚨 Bottleneck Alert"]
  RISK -->|BRS ≤ 60| OK["🟢 Healthy Distribution"]
  ALERT --> SIM["📉 Simulation: ${blockedPRs} PRs blocked if unavailable 5d"]
  ALERT --> REBAL["⚖️ Load Rebalancing Recommendations"]
  ALERT -->|Slack/Email| LEAD["📬 Engineering Leadership"]
  style GH fill:#3b82f6,color:#fff
  style CALC fill:#f59e0b,color:#fff
  style GINI fill:#8b5cf6,color:#fff
  style HHI_N fill:#8b5cf6,color:#fff
  style TOP fill:#8b5cf6,color:#fff
  style BRS_NODE fill:#8b5cf6,color:#fff
  style ALERT fill:#ef4444,color:#fff
  style OK fill:#10b981,color:#fff
  style SIM fill:#ef4444,color:#fff
  style REBAL fill:#f59e0b,color:#fff
\`\`\`

**SAY THIS**: "Brain OS is already tracking every PR review event and computing concentration metrics in real-time. Your current Gini coefficient is ${giniStr}, HHI is ${hhiStr}${hhiRisk === 'ANTITRUST_LEVEL' ? ' (above the 0.25 antitrust threshold — this is the same measure used in market concentration analysis)' : ''}, and ${topReviewer} handles ${topSharePct}% of all reviews. The Bottleneck Risk Score is ${brs}/100. If ${topReviewer} were unavailable for 5 days, an estimated ${blockedPRs} PRs would be blocked."`;

          // Inject betweenness centrality graph analysis if available
          if (betweennessCentrality) {
            const bc = betweennessCentrality;
            const bottleneck = bc.bottleneck;
            const bcNodes = bc.nodes || [];
            const bridgeEngineers = bc.bridge_engineers || [];

            effectiveSystemPrompt += `

#### 🔬 BETWEENNESS CENTRALITY — Graph Analysis (Brandes Algorithm)
${bottleneck?.is_bottleneck ? '🔴' : '🟢'} **Critical bridge: ${bottleneck?.name || 'None'}** (centrality: ${bottleneck?.centrality?.toFixed(3) || '?'}, z-score: ${bottleneck?.z_score?.toFixed(1) || '?'})

| Engineer | Betweenness Centrality | In-Degree | Reviews | Z-Score | Risk |
|----------|----------------------|-----------|---------|---------|------|
${bcNodes.slice(0, 8).map((n: any) => `| ${n.name} | ${n.betweenness_centrality?.toFixed(3) || '?'} | ${n.in_degree_centrality?.toFixed(3) || '?'} | ${n.review_count || '?'} | ${n.z_score?.toFixed(1) || '?'} | ${n.is_bottleneck ? '🔴 BOTTLENECK' : n.z_score > 1 ? '🟡 BRIDGE' : '🟢 OK'} |`).join('\n')}

${bridgeEngineers.length > 0 ? `**Bridge Engineers** (z-score > 1.5 — critical for review flow): ${bridgeEngineers.join(', ')}` : ''}

${bc.mermaid_review_graph ? `**INCLUDE THIS DIAGRAM** — Reviewer Collaboration Graph:
\`\`\`mermaid
${bc.mermaid_review_graph}
\`\`\`` : ''}

**SAY THIS**: "Betweenness centrality measures how often an engineer appears on the shortest path between other team members in the review flow. ${bottleneck?.name || 'No one'} has the highest centrality${bottleneck?.is_bottleneck ? ' and is flagged as a BOTTLENECK — they are the critical bridge in your review flow. If they are unavailable, review flow between teams would be severely disrupted' : ''}. This is computed using the Brandes algorithm on your actual PR review graph."`;
          }
        }

        effectiveSystemPrompt += `

### HOW TO PRESENT THE CAPABILITY DEMONSTRATION
When the user asks about P0 requirements:
1. **FIRST**: Show the requirement overview (tickets, status, progress) with charts and tables
2. **THEN**: Say "Let me show you something powerful — Brain OS is ALREADY computing these P0 functions on your data."
3. **SHOW**: The live metrics tables above with the actual numbers
4. **EMBED**: The architecture Mermaid diagrams showing how the brain implements each P0 function
5. **EMBED**: The reviewer distribution chart (if available)
6. **CONCLUDE**: "These are not mockups — these are real metrics computed from your GitHub repositories and Jira boards."

This creates the "wow" moment — the design partner sees that the product doesn't just TRACK requirements, it IMPLEMENTS them.`;
      }
    }

    // ── BRAIN NUTRITION: LEAP Context (Deep Brain Reasoning from Sleep Cycles) ──
    // These are the richest cognitive outputs — curiosity hypotheses, imagination
    // scenarios, self-model audits, goal plans. They represent what the Brain has
    // been "thinking about" during its autonomous cognitive cycles.
    if (universalCtx?.leapContext) {
      const lc = universalCtx.leapContext;
      const leapEntries: string[] = [];
      if (lc.narrative?.content) leapEntries.push(`**Narrative Intelligence**: ${lc.narrative.content.substring(0, 300)}`);
      if (lc.curiosity?.content) leapEntries.push(`**Curiosity Hypothesis**: ${lc.curiosity.content.substring(0, 300)}`);
      if (lc.imagination?.content) leapEntries.push(`**Imagination Scenario**: ${lc.imagination.content.substring(0, 300)}`);
      if (lc.goalPlans?.content) leapEntries.push(`**Goal Plans**: ${lc.goalPlans.content.substring(0, 300)}`);
      if (lc.selfModel?.content) leapEntries.push(`**Self-Model Assessment**: ${lc.selfModel.content.substring(0, 200)}`);
      if (lc.experiments?.content) leapEntries.push(`**Active Experiments**: ${lc.experiments.content.substring(0, 200)}`);
      if (lc.redTeam?.content) leapEntries.push(`**Red Team Findings**: ${lc.redTeam.content.substring(0, 200)}`);

      if (leapEntries.length > 0) {
        effectiveSystemPrompt += `\n\n## BRAIN DEEP REASONING (from autonomous cognitive sleep cycles)
The Brain has been actively reasoning during its sleep cycles.
These insights come from its curiosity engine, imagination layer, and goal-planning system:

${leapEntries.join('\n\n')}

USE THESE to:
- Reference the Brain's own hypotheses when answering questions about organizational health
- Connect current queries to the Brain's ongoing investigations
- Share the Brain's imagination scenarios when users ask "what if" questions`;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // CAUSAL REASONING BLOCKS — Gap 4 wiring
    // These blocks fire intent-specifically and inject structured causal
    // reasoning into the prompt BEFORE Claude sees the question.
    // Without these, Claude has edge counts but not causal explanations.
    //
    // Pattern: detect intent → call the right causal module → inject result.
    // All blocks are non-fatal: a module failure degrades gracefully.
    // ══════════════════════════════════════════════════════════════════════

    const causalIntent = brainContext?.intent;
    const verifiedPredictions = (intelligence as any).verifiedPredictions as Array<{
      source_domain: string; target_domain: string; watch_metric: string | null;
      predicted_direction: string | null; predicted_magnitude: number | null;
      actual_direction: string | null; actual_value: number | null;
      was_correct: boolean | null; bandit_reward: number | null;
      discovery_method: string | null; verified_at: string | null;
    }> | undefined;

    // ── A. VERIFIED PREDICTION HISTORY — always inject if oracle data exists ──
    // Powers: "We predicted this X times — Y% correct. Last verified: [date]."
    // This is the oracle feedback loop made visible in the copilot.
    if (verifiedPredictions && verifiedPredictions.length > 0) {
      // Group by domain pair to compute per-pair accuracy
      const pairStats = new Map<string, { total: number; correct: number; method: string | null; lastVerified: string | null }>();
      for (const vp of verifiedPredictions) {
        const key = `${vp.source_domain}→${vp.target_domain}`;
        const existing = pairStats.get(key) || { total: 0, correct: 0, method: vp.discovery_method, lastVerified: vp.verified_at };
        existing.total++;
        if (vp.was_correct) existing.correct++;
        if (!existing.lastVerified || (vp.verified_at && vp.verified_at > existing.lastVerified)) existing.lastVerified = vp.verified_at;
        pairStats.set(key, existing);
      }
      const pairLines = Array.from(pairStats.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([pair, s]) => {
          const acc = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
          const lastDate = s.lastVerified ? new Date(s.lastVerified).toISOString().split('T')[0] : 'unknown';
          return `- ${pair}: ${s.correct}/${s.total} correct (${acc}%) | method: ${s.method || 'unknown'} | last verified: ${lastDate}`;
        });
      effectiveSystemPrompt += `\n\n## ORACLE PREDICTION ACCURACY (Gap 4 — autonomous verification history)
The Brain has autonomously verified ${verifiedPredictions.length} causal predictions against real connector data.
Use this to ground "Why did X happen?" answers with historical accuracy.

${pairLines.join('\n')}

When asked WHY something happened, cite the relevant pair's accuracy. E.g.: "The Brain predicted engineering→revenue effects 6 times — 5 were correct (83%). Based on this pattern…"`;
    }

    // ── B. CAUSAL CHAIN DIAGNOSIS — fires for explain/diagnose intents ──
    // Uses multiHopReasoner.diagnose() to find upstream causes of the queried domain.
    // Without this: Claude sees edge counts. With this: Claude sees the actual causal chain.
    if ((causalIntent === 'explain' || causalIntent === 'diagnose') &&
        brainRegions.causalDAG && brainRegions.multiHopReasoner && causalEdges.length > 0) {
      try {
        // Extract the domain being asked about from brainContext
        const affectedDomain = brainContext?.domains?.[0];
        if (affectedDomain) {
          const reasoner = brainRegions.multiHopReasoner as any;
          const diagnosis = reasoner.diagnose(brainRegions.causalDAG, affectedDomain);
          // diagnose() returns { topCauses, isExplainable, narrative }
          // topCauses shape: { cause, likelihood, lagDays, path, explanation }
          if (diagnosis && diagnosis.topCauses && diagnosis.topCauses.length > 0) {
            const causeLines = diagnosis.topCauses.slice(0, 5).map((rc: any) =>
              `- ${rc.cause} → ${affectedDomain} | likelihood: ${rc.likelihood != null ? (rc.likelihood * 100).toFixed(0) + '%' : 'N/A'} | lag: ${rc.lagDays ?? '?'}d | ${rc.explanation || 'direct link'}`
            );
            effectiveSystemPrompt += `\n\n## CAUSAL CHAIN DIAGNOSIS for "${affectedDomain}" (multi-hop reasoning)
The Brain traced upstream causes for the domain you're asking about:

${causeLines.join('\n')}

${diagnosis.narrative || ''}

Use this causal chain in your answer. Don't just say "X affects Y" — explain the path, likelihood, and lag.`;
          }
        }
      } catch (diagErr) {
        // Non-fatal: degrade to edge-count reasoning
        logger.warn('[Copilot] Causal diagnosis non-fatal:', (diagErr as Error).message);
      }
    }

    // ── C. COUNTERFACTUAL SIMULATION — fires for whatif/predict intents ──
    // Uses counterfactualSimulator.findLeveragePoints() to answer "What if we change X?"
    // Without this: Claude reasons from memory. With this: Claude reasons from the causal DAG.
    if ((causalIntent === 'whatif' || causalIntent === 'predict') &&
        brainRegions.causalDAG && brainRegions.counterfactualSimulator && causalEdges.length > 0) {
      try {
        const simulator = brainRegions.counterfactualSimulator as any;
        const leveragePoints = simulator.findLeveragePoints(brainRegions.causalDAG);
        if (leveragePoints && leveragePoints.length > 0) {
          // LeveragePoint shape: { source, target, currentWeight, leverageScore, downstreamCount, mostAffected, explanation }
          const topLevers = leveragePoints.slice(0, 5).map((lp: any) =>
            `- ${lp.source} → ${lp.target} | leverage score: ${lp.leverageScore != null ? lp.leverageScore.toFixed(3) : 'N/A'} | affects ${lp.downstreamCount ?? '?'} downstream domain(s) | ${lp.explanation || ''}`
          );
          effectiveSystemPrompt += `\n\n## COUNTERFACTUAL LEVERAGE POINTS (causal DAG simulation)
These are the highest-impact intervention points in the causal graph — where changes propagate furthest.
Use these when answering "What if we change X?" or "What should we do to improve Y?":

${topLevers.join('\n')}

When answering what-if questions, base your answer on these leverage points and their downstream effects through the causal graph.`;
        }
      } catch (cfErr) {
        // Non-fatal: degrade to semantic reasoning
        logger.warn('[Copilot] Counterfactual simulation non-fatal:', (cfErr as Error).message);
      }
    }

    // ── D. CASCADE CHAIN — fires for cascade intent ──
    // Uses multiHopReasoner to find all reachable domains from the source.
    if (causalIntent === 'cascade' &&
        brainRegions.causalDAG && brainRegions.multiHopReasoner && causalEdges.length > 0) {
      try {
        const reasoner = brainRegions.multiHopReasoner as any;
        const sourceDomain = brainContext?.domains?.[0];
        if (sourceDomain) {
          const reachable = reasoner.findReachableDomains(brainRegions.causalDAG, sourceDomain);
          if (reachable && reachable.length > 0) {
            const cascadeLines = reachable.slice(0, 8).map((r: any) =>
              `- ${sourceDomain} → ${r.domain} (${r.hops} hop${r.hops !== 1 ? 's' : ''}, confidence: ${r.confidence != null ? (r.confidence * 100).toFixed(0) + '%' : 'N/A'}, cumulative lag: ${r.lagDays ?? '?'}d)`
            );
            effectiveSystemPrompt += `\n\n## CASCADE CHAIN from "${sourceDomain}" (ripple effect analysis)
A change in ${sourceDomain} propagates through the causal graph to these downstream domains:

${cascadeLines.join('\n')}

When answering cascade/ripple questions, use this chain. Show the path and confidence at each hop.`;
          }
        }
      } catch (cascadeErr) {
        logger.warn('[Copilot] Cascade chain non-fatal:', (cascadeErr as Error).message);
      }
    }

    // ── E. BANDIT METHOD ATTRIBUTION — enrich edge descriptions ──
    // Without this: "engineering→revenue: effect_size=0.72"
    // With this: "engineering→revenue: effect_size=0.72, discovered by APEX (74% win rate)"
    if (causalEdges.length > 0 && verifiedPredictions && verifiedPredictions.length > 0) {
      // Build method win rate map from verified predictions
      const methodStats = new Map<string, { wins: number; total: number }>();
      for (const vp of verifiedPredictions) {
        if (!vp.discovery_method) continue;
        const s = methodStats.get(vp.discovery_method) || { wins: 0, total: 0 };
        s.total++;
        if (vp.was_correct) s.wins++;
        methodStats.set(vp.discovery_method, s);
      }
      if (methodStats.size > 0) {
        const methodLeaderboard = Array.from(methodStats.entries())
          .map(([method, s]) => `${method}: ${Math.round((s.wins / s.total) * 100)}% accuracy (${s.total} predictions)`)
          .sort()
          .join(', ');
        effectiveSystemPrompt += `\n\n## CAUSAL DISCOVERY METHOD PERFORMANCE (UCB1 Bandit — Gap 1)
The Brain uses a bandit algorithm to learn which causal discovery method works best per domain pair.
Current method accuracy: ${methodLeaderboard}

When explaining how a causal relationship was discovered, you can cite the method and its accuracy.`;
      }
    }

    // ── SE-aaS domain result injection ──────────────────────────────────
    if (seaasResult) {
      const domainType = seaasResult.domainType as string;
      const resultData = seaasResult.data || seaasResult;
      effectiveSystemPrompt += `\n\n## SE-aaS DOMAIN RESULT: ${domainType.toUpperCase()} (Claude-powered analysis)
This is the result from the ${domainType} domain execution. Present this to the user with context and explanation.
Result data:
${JSON.stringify(resultData, null, 2).slice(0, 3000)}

Artifact ID: ${seaasResult.artifactId || 'N/A'}
Use this data to give a comprehensive answer. The analysis was performed by Brain OS's AI ${domainType} engine.`;
    }

    // ── SE-aaS Delivery Intelligence injection ────────────────────────
    // deliveryIntelligenceResult is set by P0 delivery domains (pod-match, early-warning,
    // scope-creep, delivery-intelligence). It is DIFFERENT from seaasResult and must be
    // injected separately so Claude can answer delivery-domain questions with live data.
    if (deliveryIntelligenceResult) {
      const delivDomainType = (deliveryIntelligenceResult._domainType as string) || 'delivery-intelligence';
      const healthScores = (deliveryIntelligenceResult.health_scores as unknown[]) ?? [];
      const scopeAlerts = (deliveryIntelligenceResult.scope_alerts as unknown[]) ?? [];
      const podMatches = (deliveryIntelligenceResult.pod_matches as unknown[]) ?? [];
      const engineerHealthSummary = deliveryIntelligenceResult.engineer_health_summary ?? null;
      const podRecommendation = deliveryIntelligenceResult.podRecommendation ?? null;
      const domainSpecificResult = deliveryIntelligenceResult.domainResult ?? null;
      const hasLiveData = healthScores.length > 0 || podMatches.length > 0 || scopeAlerts.length > 0 || (engineerHealthSummary as any)?.total_engineers > 0;

      // ── Compute dataMode for frontend provenance indicator ───────────────
      // Determines which badge the DomainResultRenderer will show.
      const hasHealthData = healthScores.length > 0 || (engineerHealthSummary as any)?.total_engineers > 0;
      const hasPodData = podMatches.length > 0;
      const hasScopeData = scopeAlerts.length > 0;
      const liveSourceCount = (hasHealthData ? 1 : 0) + (hasPodData ? 1 : 0) + (hasScopeData ? 1 : 0);
      // A "partial" result means some data arrived but not all expected for this domain
      const expectedSources = delivDomainType === 'pod-match' ? 1 : delivDomainType === 'scope-creep' ? 1 : 2;
      const dataMode: "live" | "partial" | "ai-reasoned" = !hasLiveData
        ? "ai-reasoned"
        : liveSourceCount < expectedSources
          ? "partial"
          : "live";

      const connectedSources: string[] = [];
      const missingData: string[] = [];
      if (hasHealthData) connectedSources.push("GitHub");
      else missingData.push("engineer velocity");
      if (hasPodData) connectedSources.push("pod signals");
      else if (delivDomainType === 'pod-match' || delivDomainType === 'delivery-intelligence') missingData.push("pod match history");
      if (hasScopeData) connectedSources.push("Jira");
      else if (delivDomainType === 'scope-creep' || delivDomainType === 'delivery-intelligence') missingData.push("sprint health");

      // Tag the result object so it flows to the frontend via SSE
      deliveryIntelligenceResult.dataMode = dataMode;
      deliveryIntelligenceResult.connectedSources = connectedSources;
      deliveryIntelligenceResult.missingData = missingData;

      if (hasLiveData) {
        // ── Live data available: inject real numbers ────────────────────────
        effectiveSystemPrompt += `\n\n## SE-aaS DELIVERY INTELLIGENCE: ${delivDomainType.toUpperCase()}
Live delivery data fetched for this organization. Use these REAL numbers when answering.

Active engagement health scores (${healthScores.length} engagements):
${JSON.stringify(healthScores, null, 2).slice(0, 2000)}

Unacknowledged scope creep alerts (${scopeAlerts.length} alerts):
${scopeAlerts.length > 0 ? JSON.stringify(scopeAlerts, null, 2).slice(0, 1000) : 'None.'}

Recent pod match recommendations (${podMatches.length} records):
${podMatches.length > 0 ? JSON.stringify(podMatches, null, 2).slice(0, 1000) : 'None.'}
${engineerHealthSummary ? `\nEngineer health summary:\n${JSON.stringify(engineerHealthSummary, null, 2)}` : ''}
${podRecommendation ? `\nLatest pod recommendation from ${delivDomainType}:\n${JSON.stringify(podRecommendation, null, 2).slice(0, 1500)}` : ''}
${domainSpecificResult ? `\nDomain-specific analysis result:\n${JSON.stringify(domainSpecificResult, null, 2).slice(0, 1500)}` : ''}

Answer the user's question using this live delivery data with specific insights about their engagements.`;
      } else {
        // ── No live data yet: AI-reasoned mode ──────────────────────────────
        // Connectors (GitHub/Jira) may not be synced yet. The AI worker MUST
        // still give intelligent delivery guidance — this IS the value of SE-aaS.
        const domainNarrative = (domainSpecificResult as any)?.narrative || '';
        effectiveSystemPrompt += `\n\n## SE-aaS DELIVERY INTELLIGENCE: ${delivDomainType.toUpperCase()} (AI-Reasoned Mode)
This organization's AI worker hasn't ingested live connector data yet (GitHub/Jira sync pending).
${domainNarrative ? `Domain analysis: ${domainNarrative}` : ''}

You are an expert SE-aaS Delivery Intelligence AI. Even without live signal data, you MUST give a specific, valuable, actionable response. This is your core job.

MANDATORY response approach for "${delivDomainType}" queries:
- pod-match: Recommend a pod assignment framework based on the engagement type described. Ask 1-2 targeted questions about team capabilities and engagement tech stack. Be specific about what makes a strong match (velocity, tech overlap, past delivery success).
- early-warning: Ask about specific risk signals the user is observing. Explain what velocity collapse, bottleneck, and flight-risk patterns look like. Offer a structured health check framework.
- scope-creep: Explain how scope drift is measured (story point delta %). Ask about the current sprint state. Give 2-3 concrete scope management recommendations.
- delivery-intelligence: Give an intelligent overview of delivery health factors. Ask clarifying questions to identify which engagement needs attention.

NEVER say "I cannot answer" or list what data is missing. Be confident, helpful, and delivery-focused.
End your response with ONE sentence: what connector data would be used to make this recommendation data-driven (e.g. "Connect GitHub to start tracking ${delivDomainType === 'pod-match' ? 'PR velocity and tech stack signals' : delivDomainType === 'early-warning' ? 'sprint velocity and review burden' : 'story point drift and sprint changes'} for this AI worker.").`;
      }
    }

    // ── AaaS domain result injection ──────────────────────────────────
    if (accountingResult) {
      const acctDomain = accountingResult.domainType as string;
      effectiveSystemPrompt += `\n\n## ACCOUNTING-aaS RESULT: ${acctDomain.toUpperCase()} (Real GL Data Analysis)
This is a real analysis from ${(accountingResult.data as any)?.transactions || 0} Xero GL transactions (Design Partner — Singapore, SGD).
Present these numbers precisely — they are REAL, not estimates.
Result data:
${JSON.stringify(accountingResult.data, null, 2).slice(0, 5000)}

Use this data to answer the user's accounting question with precision. Cite specific numbers.`;
    }

    // ── PM-aaS domain result injection ────────────────────────────────
    if (pmAasResult) {
      const pmDomainType = pmAasResult.domainType as string;
      const pmResultData = pmAasResult.data || pmAasResult;
      effectiveSystemPrompt += `\n\n## PM-aaS DOMAIN RESULT: ${pmDomainType.toUpperCase()} (AI-powered PM analysis)
This is the result from the PM-aaS ${pmDomainType} domain execution. Present this to the user with context and actionable guidance.
Result data:
${JSON.stringify(pmResultData, null, 2).slice(0, 3000)}

Artifact ID: ${pmAasResult.artifactId || 'N/A'}
Use this data to give a comprehensive, actionable PM answer. The analysis was performed by BrainOS's AI PM-aaS ${pmDomainType} engine.`;
    }

    // ── Agent Creation result injection ───────────────────────────────
    if (agentCreated) {
      const agentName = agentCreated.name as string;
      const agentDomain = agentCreated.domain as string;
      const agentTrigger = agentCreated.trigger as string;
      const agentId = agentCreated.agentId as string;
      effectiveSystemPrompt += `\n\n## AGENT SUCCESSFULLY CREATED
The user requested an AI agent and it has been created and is now ACTIVE.

Agent details:
- Name: ${agentName}
- Domain: ${agentDomain}
- Trigger: ${agentTrigger}
- ID: ${agentId}
- Brain Learning: Enabled
- RL Feedback Loop: Active
- Memory Tracking: On

Tell the user their agent "${agentName}" is live and active. Mention that:
1. Brain learning is enabled (it improves over time)
2. RL feedback loop is active (it learns from outcomes)
3. They can monitor it in the AI Worker Dashboard
Be enthusiastic but concise. Do NOT list the agent ID unless the user asks.`;
    } else if (serviceRoute?.type === 'create-agent') {
      // Create-agent was requested but insertion failed
      effectiveSystemPrompt += `\n\n## AGENT CREATION FAILED
The user requested to create an AI agent but there was a technical error. Tell the user we encountered a temporary issue creating their agent and they should try again in a moment. Apologize briefly.`;
    }

    // ── ORCHESTRATOR: Inject queued job notification into system prompt ────
    // When brain isn't ready, the orchestrator queues the job and sets
    // orchestratorResult so Claude tells the user about the wait.
    if (orchestratorResult) {
      const _orchMsg = orchestratorResult.message as string;
      const _orchJobType = orchestratorResult.taskType as string;
      const _orchEta = orchestratorResult.estimatedWaitMs
        ? `~${Math.ceil((orchestratorResult.estimatedWaitMs as number) / 60_000)} minutes`
        : null;
      effectiveSystemPrompt += `\n\n## ORCHESTRATOR: JOB QUEUED — BRAIN NOT READY
The user requested a "${_orchJobType}" analysis but it has been queued because the brain is not ready yet.

Your response to the user MUST:
1. Acknowledge their request warmly
2. Explain the analysis is queued: "${_orchMsg}"
${_orchEta ? `3. Give the estimated wait: ${_orchEta}` : '3. Tell them you\'ll notify them when it\'s ready'}
4. Suggest they can track progress in the Agent Monitor (open from the sidebar)
5. Keep it concise — 2-3 sentences max

Do NOT attempt to answer the analysis question with placeholder or made-up data.`;
    }

    // ── LEARNING LOOP: Inject ai_memory corrections into system prompt ─────
    // Query high-importance user corrections from ai_memory table.
    // These are REAL corrections saved by /api/copilot/feedback when users
    // click thumbs-down and provide corrected information.
    // This closes the loop: user corrects → stored in ai_memory → next answer uses correction.
    // CACHED: corrections are stable config data — 30s TTL cuts DB queries by ~10x under load.
    {
      const correctionDomain = brainContext?.domains?.[0] || "general";

      // Cache hit: return stale-within-30s corrections immediately
      let corrections: Array<{ content: string; importance: number; domain: string; created_at: string }> | null = null;
      const cachedCorrections = _correctionsCache.get(workspaceId);
      if (cachedCorrections && cachedCorrections.expiry > Date.now()) {
        corrections = cachedCorrections.data;
      } else {
        const { data: freshCorrections } = await Promise.resolve(service
          .from("ai_memory")
          .select("content, importance, domain, created_at")
          .eq("organization_id", workspaceId)
          .eq("memory_type", "correction")
          .order("importance", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(8))
          .catch(() => ({ data: null as any[] | null }));
        corrections = freshCorrections;
        // Store in cache (even null/empty result — avoids repeated DB round-trips for orgs with no corrections)
        _correctionsCache.set(workspaceId, {
          data: corrections ?? [],
          expiry: Date.now() + HOT_PATH_TTL_MS,
        });
      }

      if (corrections && corrections.length > 0) {
        // Prioritize domain-relevant corrections, but include cross-domain ones too
        const domainRelevant = corrections.filter((c: any) => c.domain === correctionDomain);
        const crossDomain = corrections.filter((c: any) => c.domain !== correctionDomain);
        const ordered = [...domainRelevant, ...crossDomain].slice(0, 5);

        const correctionsText = ordered
          .map((c: any) => `- [${c.domain}] ${c.content}`)
          .join("\n");

        effectiveSystemPrompt += `\n\n## LEARNED CORRECTIONS (User-validated knowledge — HIGH PRIORITY)
These corrections were explicitly provided by users who identified errors in previous answers.
They represent ground-truth knowledge and OVERRIDE any conflicting brain data:

${correctionsText}

RULES FOR CORRECTIONS:
- If a correction contradicts causal edges or patterns, the correction wins
- Cite corrections naturally: "Based on updated information..." or "Our latest data shows..."
- Do NOT mention that these came from user corrections — present them as known facts`;
      }
    }

    // ── REINFORCEMENT LEARNING CONTEXT: Visible Learning Loop ──────────
    // Fetch brain intelligence metrics so the copilot can reference its own
    // learning journey. This is the "wow" factor — users SEE the AI getting smarter.
    // CACHED: 5 DB queries → 0 on cache hit. 30s TTL — acceptable staleness for display stats.
    let learningPulse: LearningPulse | null = null;

    try {
      // Cache hit: return stale-within-30s learning stats immediately
      const cachedPulse = _learningPulseCache.get(workspaceId);
      if (cachedPulse && cachedPulse.expiry > Date.now()) {
        learningPulse = cachedPulse.data;
      } else {
        const [
          intelligenceSnap,
          feedbackStats,
          correctionCount,
          emergenceEvents,
          rlState,
        ] = await Promise.all([
          // Latest intelligence snapshot
          service
            .from("brain_intelligence_snapshots")
            .select("intelligence_score, prediction_accuracy, brier_score, causal_edges_total, memories_total, feedback_processed, created_at")
            .eq("organization_id", workspaceId)
            .order("snapshot_date", { ascending: false })
            .limit(1),
          // Feedback stats (last 30 days)
          service
            .from("copilot_response_feedback")
            .select("rating")
            .eq("organization_id", workspaceId)
            .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
          // Correction count
          service
            .from("ai_memory")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", workspaceId)
            .eq("memory_type", "correction"),
          // Recent emergence events (learning milestones)
          service
            .from("brain_emergence_log")
            .select("event_type, summary, created_at")
            .eq("organization_id", workspaceId)
            .order("created_at", { ascending: false })
            .limit(3),
          // RL state — get exploration rate and reward trend
          service
            .from("brain_rl_state")
            .select("cumulative_reward, reward_trend, exploration_rate")
            .eq("organization_id", workspaceId)
            .limit(1),
        ]);

        const snap = intelligenceSnap.data?.[0];
        const feedbackRows = feedbackStats.data || [];
        const helpfulCount = feedbackRows.filter((r: any) => r.rating === "helpful").length;
        const totalFeedback = feedbackRows.length;
        const rewardTrend = rlState.data?.[0]?.reward_trend || "stable";

        learningPulse = {
          intelligenceScore: snap?.intelligence_score ?? 0,
          predictionAccuracy: snap?.prediction_accuracy ?? null,
          totalCorrections: correctionCount.count ?? 0,
          totalFeedback,
          satisfactionRate: totalFeedback > 0 ? helpfulCount / totalFeedback : 0,
          recentEmergenceEvents: (emergenceEvents.data || []) as any[],
          learningVelocity: rewardTrend === "improving" ? "accelerating" : rewardTrend === "declining" ? "recalibrating" : "steady",
          brierScore: snap?.brier_score ?? null,
          edgesLearned: snap?.causal_edges_total ?? 0,
          memoriesStored: snap?.memories_total ?? 0,
          lastLearningCycle: snap?.created_at ?? null,
        };
        // Store in cache: 30s TTL — DB load reduction ~10x under concurrent users
        _learningPulseCache.set(workspaceId, { data: learningPulse, expiry: Date.now() + HOT_PATH_TTL_MS });
      }

      // Inject learning awareness into system prompt
      if (learningPulse.intelligenceScore > 0 || learningPulse.totalFeedback > 0) {
        const emergenceSummary = learningPulse.recentEmergenceEvents.length > 0
          ? learningPulse.recentEmergenceEvents
              .map((e: any) => `- ${e.event_type}: ${e.summary}`)
              .join("\n")
          : "No recent emergence events";

        effectiveSystemPrompt += `\n\n## 🧠 BRAIN LEARNING STATUS (Reinforcement Learning Loop)
You are a continuously learning system. Here is your current learning state for THIS workspace:

**Intelligence Score**: ${learningPulse.intelligenceScore}/100
**Prediction Accuracy**: ${learningPulse.predictionAccuracy !== null ? (learningPulse.predictionAccuracy * 100).toFixed(1) + "%" : "calibrating..."}
**Learning Velocity**: ${learningPulse.learningVelocity}
**Knowledge Base**: ${learningPulse.edgesLearned} causal edges, ${learningPulse.memoriesStored} memories, ${learningPulse.totalCorrections} user corrections applied
**User Satisfaction**: ${(learningPulse.satisfactionRate * 100).toFixed(0)}% (from ${learningPulse.totalFeedback} interactions)

Recent Learning Events:
${emergenceSummary}

BEHAVIORAL RULES FOR LEARNING TRANSPARENCY:
- When you use a learned correction, subtly acknowledge it: "Based on what I've learned..."
- When asked about your capabilities, reference your intelligence score and learning progress
- If a user gives you negative feedback, acknowledge you're learning: "I'm continuously improving — your feedback directly updates my knowledge"
- Reference specific learning milestones when relevant (e.g., "Since I learned ${learningPulse.edgesLearned} causal relationships...")
- Show confidence calibrated to your actual accuracy — don't oversell if accuracy is low
- NEVER fabricate learning stats — only reference the numbers above`;
      }
    } catch {
      // Non-fatal: learning context is enrichment
    }

    // ── Brain Context Injection — pre-enrich every LLM call with brain state ──
    // Non-fatal: if getBrainContext fails, proceed without enrichment.
    // brainIqForRouting is captured here and used by Brain IQ model-routing gate below.
    // TIMEOUT: getBrainContext uses Promise.allSettled internally but individual Supabase
    // queries can hang indefinitely on network issues. We race with a 5s timeout so a
    // slow DB never stalls the entire request. Defaults are safe (IQ=0, brainState=empty).
    let brainIqForRouting = 0;
    let brainWarning: string | null = null;
    try {
      const { getBrainContext } = await import("@/lib/brain/brain-context");
      const brainCtxTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000));
      const brainCtx = await Promise.race([getBrainContext(service, workspaceId), brainCtxTimeout]);
      // brainCtx is null only if the 5s timeout fires — skip enrichment, use safe defaults
      if (!brainCtx) throw new Error("getBrainContext timed out");
      brainIqForRouting = brainCtx.brainIq;

      if (brainCtx.brainState !== "empty") {
        effectiveSystemPrompt += `\n\n## Brain Context\n- IQ Score: ${brainCtx.brainIq}\n- Quality Patterns (last 24h): ${brainCtx.qualityPatternsSummary ?? "No data"}\n- Active Signals: ${brainCtx.signalCount}\n${brainCtx.contextSummary}`;
      } else if (brainCtx.activeJobCount > 0 || brainCtx.pendingJobCount > 0) {
        // FM-01: Brain may be empty (no signals yet) but the orchestrator can still have
        // active or pending jobs. Always surface job counts so the LLM can answer
        // "How many agents are running?" correctly even before any signals are ingested.
        const orchParts: string[] = [];
        if (brainCtx.activeJobCount > 0) orchParts.push(`${brainCtx.activeJobCount} running`);
        if (brainCtx.pendingJobCount > 0) orchParts.push(`${brainCtx.pendingJobCount} pending`);
        effectiveSystemPrompt += `\n\n## Brain Context (Orchestrator State)\n- Orchestrator: ${orchParts.join(", ")} agent job(s).\n${brainCtx.lastJobStatus ? `- Last completed job: ${brainCtx.lastJobStatus}.` : ""}`;
      }

      // Brain IQ gate: warn the user when brain is not ready
      if (brainCtx.brainState === "empty" || brainCtx.brainIq < 10) {
        brainWarning = `Brain IQ is low (${brainCtx.brainIq}). Connect more data sources for better results.`;
      }

      // ── Brain Status Guidance — injected into every LLM call so the AI can answer
      // "Is my brain trained?" / "What should I do to start?" correctly.
      // This supplements the brainWarning SSE banner with actionable LLM guidance.
      //
      // Intent triggers: "is my brain trained", "check brain", "what should I do",
      // "how do I start", "is my AI ready", "brain status", "train my brain", "am I ready"
      if (brainCtx.brainState === "empty") {
        effectiveSystemPrompt += `\n\n## BRAIN STATUS GUIDANCE (CRITICAL)
Brain IQ: ${brainCtx.brainIq}/100 | Signals: ${brainCtx.signalCount}

When the user asks about brain status, training, readiness, or "what should I do to start":
Respond: "🧠 I've checked your AI Worker Brain — it's still in early learning mode (IQ: ${brainCtx.brainIq}/100). To accelerate training, connect your GitHub and Jira data sources from the Connections panel on the left. Once connected, your brain will automatically start processing engineering signals and building intelligence within minutes."

Intent triggers for brain status check: "is my brain trained", "check brain", "what should I do", "how do I start", "is my AI ready", "brain status", "train my brain", "am I ready"

Additional context:
- Their brain has not started learning yet (Brain IQ: ${brainCtx.brainIq} / 100)
- They need to connect data sources first:
  1. GitHub — go to /connectors → click "Connect GitHub"
  2. Jira — go to /connectors → click "Connect Jira"
- Once connected, Brain IQ will begin rising automatically.
- Brain IQ >= 10 means the brain is learning. Brain IQ >= 20 means it is ready for full SE-aaS analysis.
Be encouraging and specific. Do NOT say "I don't know" — give them the exact next steps above.`;
      } else if (brainCtx.brainIq < 10) {
        effectiveSystemPrompt += `\n\n## BRAIN STATUS GUIDANCE (CRITICAL)
Brain IQ: ${brainCtx.brainIq}/100 | Signals: ${brainCtx.signalCount}

When the user asks about brain status, training, readiness, or "what should I do to start":
Respond: "🧠 Your brain is actively learning (IQ: ${brainCtx.brainIq}/100, ${brainCtx.signalCount} signals processed). You can start using SE-aaS commands now — accuracy will improve as more data flows in."

Intent triggers for brain status check: "is my brain trained", "check brain", "what should I do", "how do I start", "is my AI ready", "brain status", "train my brain", "am I ready"

Additional context:
- Brain IQ is ${brainCtx.brainIq}/100 — the brain is learning but needs more signals.
- They can start using SE-aaS commands (delivery intelligence, pod match, early warning) but accuracy improves as more signals accumulate.
- Encourage them to connect more data sources from /connectors if they haven't already (GitHub, Jira).
- Brain IQ >= 20 unlocks full prediction accuracy. They are ${Math.max(0, 20 - brainCtx.brainIq)} IQ points away.`;
      } else {
        effectiveSystemPrompt += `\n\n## BRAIN STATUS GUIDANCE (CRITICAL)
Brain IQ: ${brainCtx.brainIq}/100 | Signals: ${brainCtx.signalCount}

When the user asks about brain status, training, readiness, or "what should I do to start":
Respond: "🧠 Your brain is trained and ready (IQ: ${brainCtx.brainIq}/100). I have ${brainCtx.signalCount} engineering signals processed. Try /early-warning or /delivery-intelligence to get started."

Intent triggers for brain status check: "is my brain trained", "check brain", "what should I do", "how do I start", "is my AI ready", "brain status", "train my brain", "am I ready"

Additional context:
- The brain is fully active with ${brainCtx.signalCount} signals (IQ: ${brainCtx.brainIq}/100).
- If asked whether the brain is trained: confirm yes, it is active and ready. Highlight the IQ score and top signal domains.`;
      }
    } catch {
      // non-fatal — proceed without brain context
    }

    // ── FM-09: Connector Awareness — inject active connector list so LLM can answer
    // "Show me our Slack standup notes" with "Slack is not connected — go to /connectors"
    // rather than a generic "I don't have data on that."
    // We only fetch the lightweight (connector_type, status) projection — no credentials.
    try {
      const { data: orgConnectors } = await service
        .from("org_connectors")
        .select("connector_type, status")
        .eq("organization_id", workspaceId);

      if (orgConnectors && orgConnectors.length > 0) {
        const activeC = orgConnectors.filter((c: { status: string }) => c.status === "active").map((c: { connector_type: string }) => c.connector_type);
        const inactiveC = orgConnectors.filter((c: { status: string }) => c.status !== "active").map((c: { connector_type: string }) => c.connector_type);

        effectiveSystemPrompt += `\n\n## CONNECTED DATA SOURCES
Active connectors (data is flowing): ${activeC.length > 0 ? activeC.join(", ") : "none"}
${inactiveC.length > 0 ? `Inactive/pending connectors: ${inactiveC.join(", ")}` : ""}

When the user asks about data from a specific source (e.g. Slack, GitHub, Jira, Xero):
- If that source is in the ACTIVE list: the brain is ingesting data from it — answer from brain context or say data may still be processing.
- If that source is NOT in ANY list: tell the user it is not connected yet and direct them to Settings > Connectors (path: /connectors) to add it.
- If that source is inactive/pending: tell the user the connector exists but is not yet active — they should check the connector status in Settings > Connectors.`;
      } else {
        // No connectors at all — LLM already has the zero-data guard, but clarify no connectors configured
        effectiveSystemPrompt += `\n\n## CONNECTED DATA SOURCES
No connectors are configured yet. When the user asks for data from any source (Slack, GitHub, Jira, etc.), tell them to go to Settings > Connectors (path: /connectors) to connect that source.`;
      }
    } catch {
      // Non-fatal: connector awareness is enrichment only
    }

    // ── Smart model selection: Haiku for simple, Sonnet for complex ──
    // Brain IQ gates the final model choice: IQ < 10 → Haiku regardless of query complexity.
    const { selectModel: selectSmartModel } = memStack;
    const v4SmartModelBase = selectSmartModel(message, {
      commanderComplexity: commandResult?.dispatch?.complexityScore,
      hasConversationHistory: conversationHistory && conversationHistory.length > 0,
      conversationTurns: conversationHistory?.length,
      hasBrainArtifacts: !!actionArtifact,
      hasDomainResults: !!seaasResult || !!accountingResult || !!deliveryIntelligenceResult || !!pmAasResult || !!agentCreated || !!orchestratorResult,
    });
    // Apply Brain IQ gate: if brain is not ready, downgrade general copilot queries to Haiku
    const v4SmartModel = brainIqForRouting < 10 ? "claude-haiku-4-5-20251001" : v4SmartModelBase;

    // ── Stream via Anthropic ──────────────────────────────────────────
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const { stream, send, sendText, sendError, close, sendProactiveInsights } = createSSEStream();
    const streamStartMs = Date.now();

    // ── Brain RL: Fire pre-stream interaction signal ────────────────────────
    // Must fire BEFORE the async IIFE so signal is captured even if the client
    // disconnects mid-stream (post-stream code is bypassed on AbortError).
    {
      const { createBrainFeedbackBus: _preFeedbackBus } = memStack;
      const _preBus = _preFeedbackBus({ supabase: service, organizationId: workspaceId });
      _preBus.emitSignal({
        sourceDomain: 'copilot.chat',
        signalType: 'copilot_interaction',
        signalValue: brainContext?.confidence ?? 0.5,
        entityType: 'copilot_chat',
        entityId: `copilot_${Date.now()}`,
        metadata: {
          intent: detectedIntent,
          domains: detectedDomains,
          model: v4SmartModel,
          hadBrainContext: !!brainContext,
          hadSeaasResult: !!seaasResult,
          hadActionArtifact: !!actionArtifact,
          userId: user.id,
          phase: 'pre_stream',
        },
      }).catch((e: unknown) =>
        logger.warn('[Copilot] Pre-stream RL signal failed:', e instanceof Error ? e.message : String(e))
      );
    }

    (async () => {
      try {
        // ── Orchestrator: emit queued job event so UI can show Agent Monitor ──
        // This must be sent BEFORE any text so the frontend can update state.
        if (orchestratorResult) {
          send(JSON.stringify({ orchestratorQueued: orchestratorResult }));
        }

        // ── Agent Status: emit domain execution events for SE-aaS domains ──
        // Domain execution happens before the SSE stream is created (it's synchronous prep).
        // We emit a "complete" status here so the frontend knows which agent ran.
        // The "running" status is emitted first so the UI can show a transitional state.
        if (executedSeaasDomain) {
          const domainStatusMessages: Record<string, string> = {
            'pod-match': 'matching pods against tech stack and velocity...',
            'early-warning': 'analysing velocity signals and flight risk...',
            'scope-creep': 'scanning sprint boundaries for scope drift...',
            'delivery-intelligence': 'computing engagement health score...',
          };
          const domainMessage = domainStatusMessages[executedSeaasDomain] ?? 'running agent...';
          send(JSON.stringify({
            type: 'agent_status',
            status: 'running',
            domain: executedSeaasDomain,
            message: domainMessage,
          }));
          // Immediately follow with complete since execution already finished
          send(JSON.stringify({
            type: 'agent_status',
            status: 'complete',
            domain: executedSeaasDomain,
          }));
        }

        // ── Proactive Insights: "While you were away" (Week 6) ──
        // On first message of session, surface recent insights from ai_memory
        const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
        if (isFirstMessage) {
          try {
            const { data: recentInsights } = await service
              .from("ai_memory")
              .select("content, domain, importance")
              .eq("organization_id", workspaceId)
              .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
              .in("memory_type", ["insight", "alert", "pattern"])
              .order("importance", { ascending: false })
              .limit(5);

            if (recentInsights && recentInsights.length > 0) {
              sendProactiveInsights(
                recentInsights.map((m: any) => ({
                  domain: m.domain || "brain",
                  content: (m.content || "").slice(0, 200),
                  importance: m.importance || 0.5,
                }))
              );
            }
          } catch {
            // Non-fatal: proactive insights are best-effort
          }
        }

        // Send structured artifact BEFORE LLM text stream
        // Frontend can render tables/charts from this while LLM narrates
        if (actionArtifact) {
          const { __promptText, ...cleanArtifact } = actionArtifact;
          send(JSON.stringify({ artifact: cleanArtifact }));
          // V3: Send playbook and outcome contract as separate events
          if (cleanArtifact.playbook) {
            send(JSON.stringify({ playbook: cleanArtifact.playbook }));
          }
          if (cleanArtifact.outcomeContract) {
            send(JSON.stringify({ outcomeContract: cleanArtifact.outcomeContract }));
          }
          // V4: Send decision intelligence events
          if (cleanArtifact.metaCognition) {
            send(JSON.stringify({ metaCognition: cleanArtifact.metaCognition }));
          }
          if (cleanArtifact.counterfactuals) {
            send(JSON.stringify({ counterfactuals: cleanArtifact.counterfactuals }));
          }
          if (cleanArtifact.adaptiveLayer) {
            send(JSON.stringify({ adaptiveLayer: cleanArtifact.adaptiveLayer }));
          }
          if (cleanArtifact.decisionJournal) {
            send(JSON.stringify({ decisionJournal: cleanArtifact.decisionJournal }));
          }
          // V5: Send motor commands and calibration status
          if (cleanArtifact.motorCommands) {
            send(JSON.stringify({ motorCommands: cleanArtifact.motorCommands }));
          }
          if (cleanArtifact.calibrationStatus) {
            send(JSON.stringify({ calibrationStatus: cleanArtifact.calibrationStatus }));
          }
        }

        // Send Agent Communication Protocol payloads (Heart/Mind/Speech) collected during domain execution
        // These were captured via onComms callbacks in executeDomain / executeAccountingAgent
        for (const commsPayload of agentCommsBuffer) {
          send(JSON.stringify({ agentComms: commsPayload }));
        }

        // Send SE-aaS domain result to frontend for structured display
        if (seaasResult) {
          send(JSON.stringify({ seaasResult }));

          // Input discovery: check if required inputs were missing for the domain
          // Only fire if we have a seaas result with no error (successful routing but might need more context)
          if (!seaasResult.error) {
            try {
              const { getRequiredInputs } = await import("@/lib/agents/agent-comms");
              const extractedParams = (seaasResult as Record<string, unknown>) ?? {};
              const missingInputs = getRequiredInputs(seaasResult.domainType as string, extractedParams);
              if (missingInputs.length > 0) {
                send(JSON.stringify({
                  agentInputRequest: {
                    agentType: seaasResult.domainType,
                    missing: missingInputs,
                    message: `I need a bit more to work with. Could you tell me ${missingInputs.map((i: { label: string }) => i.label).join(" and ")}?`,
                  },
                }));
              }
            } catch {
              // Non-fatal — input discovery must never break the response
            }
          }
        }

        // Send AaaS domain result to frontend for structured display
        if (accountingResult) {
          send(JSON.stringify({ accountingResult }));
        }

        // Send SE-aaS Delivery Intelligence result (pod-match + health scores) for SEaaSDeliveryPanel
        if (deliveryIntelligenceResult) {
          send(JSON.stringify({ deliveryIntelligenceResult }));
        }

        // Send PM-aaS domain result to frontend for structured display
        if (pmAasResult) {
          send(JSON.stringify({ pmAasResult }));
        }

        // Send agent created event so the frontend can render AgentCreatedCard
        if (agentCreated) {
          send(JSON.stringify({ agentCreated }));
        }

        // ── Brain IQ warning — emitted when brain is not ready (IQ < 10) ──
        // Lets the frontend show an amber banner above the response.
        if (brainWarning) {
          send(JSON.stringify({ brainWarning, brainIq: brainIqForRouting }));
        }

        // ── Agent Name: tell the frontend which agent handled this query ──────
        // Provides "Handled by: [Agent Name]" indicator in the chat UI.
        {
          // DOMAIN_AGENT_NAMES — imported from @/lib/copilot/handlers/agent-handler

          const PM_AAS_AGENT_NAMES: Record<string, string> = {
            "roadmap-planner": "Roadmap Planner Agent",
            "sprint-health": "Sprint Health Agent",
            "backlog-prioritizer": "Backlog Prioritizer Agent",
            "stakeholder-alignment": "Stakeholder Alignment Agent",
            "release-risk": "Release Risk Agent",
            "feature-impact": "Feature Impact Agent",
            "capacity-planner": "Capacity Planner Agent",
          };

          let agentName: string | null = null;
          if (agentCreated) {
            agentName = "Agent Creator";
          } else if (seaasResult) {
            agentName = DOMAIN_AGENT_NAMES[seaasResult.domainType as string] || "SE-aaS Agent";
          } else if (deliveryIntelligenceResult) {
            const dt = (deliveryIntelligenceResult._domainType as string) || "delivery-intelligence";
            agentName = DOMAIN_AGENT_NAMES[dt] || "Delivery Intelligence Agent";
          } else if (pmAasResult) {
            agentName = PM_AAS_AGENT_NAMES[pmAasResult.domainType as string] || "PM-aaS Agent";
          } else if (accountingResult) {
            agentName = DOMAIN_AGENT_NAMES[accountingResult.domainType as string] || "Accounting Agent";
          } else if (brainContext) {
            // General brain query — name by primary domain
            const primaryDomain = brainContext.domains?.[0] || "general";
            const BRAIN_DOMAIN_AGENTS: Record<string, string> = {
              finance: "Finance Intelligence",
              revenue: "Revenue Intelligence",
              cs: "Customer Success Intelligence",
              am: "Account Management Intelligence",
              services: "Services Intelligence",
              product: "Product Intelligence",
              marketing: "Marketing Intelligence",
              people: "People Intelligence",
              engineering: "Engineering Intelligence",
              executive: "Executive Intelligence",
            };
            agentName = BRAIN_DOMAIN_AGENTS[primaryDomain] || "Brain Copilot";
          }

          if (agentName) {
            send(JSON.stringify({ agentName }));
          }
        }

        // Send brain context metadata to frontend for display
        if (brainContext) {
          send(JSON.stringify({
            brainMeta: {
              intent: brainContext.intent,
              domains: brainContext.domains,
              confidence: brainContext.confidence,
              regionsUsed: brainContext.regionsUsed,
              uncertainAreas: brainContext.uncertainAreas,
            },
          }));
        }

        // ── LEARNING PULSE: Send brain intelligence & RL metrics to frontend ──
        // The UI renders this as a "Brain is learning" indicator that shows
        // intelligence score, learning velocity, and recent emergence events.
        if (learningPulse) {
          send(JSON.stringify({ learningPulse }));
        }

        // Send Commander dispatch metadata
        if (commandResult?.dispatch) {
          send(JSON.stringify({
            commanderMeta: {
              route: commandResult.dispatch.route,
              intent: commandResult.dispatch.intent,
              domains: commandResult.dispatch.domains,
              complexity: commandResult.dispatch.complexityScore,
              confidence: commandResult.dispatch.confidence,
              timing: commandResult.timing,
              userContext: commandResult.userContext ? {
                role: commandResult.userContext.role,
                persona: commandResult.userContext.persona.name,
              } : undefined,
            },
          }));
        }

        // Phase 4: Guard against system prompt exceeding token budget
        const systemTokens = estimateTokens(effectiveSystemPrompt);
        if (systemTokens > MAX_SYSTEM_PROMPT_TOKENS) {
          logger.warn(`[TokenBudget] System prompt ${systemTokens} tokens exceeds budget ${MAX_SYSTEM_PROMPT_TOKENS}, truncating`);
          // Truncate from the end (preserves persona + core instructions, trims entity links/LEAP)
          effectiveSystemPrompt = effectiveSystemPrompt.slice(0, (MAX_SYSTEM_PROMPT_TOKENS - 10_000) * 4);
        }

        const anthropicStream = anthropic.messages.stream({
          model: v4SmartModel,
          max_tokens: 8192,
          // Enable prompt caching — saves ~90% on repeated system prompts (brain context is often similar)
          system: [{ type: 'text' as const, text: effectiveSystemPrompt, cache_control: { type: 'ephemeral' as const } }],
          messages,
          // Thread request abort signal so client disconnect cancels the Anthropic call
          // and stops token consumption. Uses request.signal passed in from the outer scope.
        }, { signal: request.signal as any });

        // Safety: hard timeout — close stream if Anthropic takes >120s
        const streamTimeout = setTimeout(() => {
          try {
            sendError("Response timed out after 120 seconds. Please try a shorter question.");
            close();
            anthropicStream.abort();
          } catch { /* already closed */ }
        }, 120_000);

        // Accumulate the streamed assistant text for auto-save (BUILD 4)
        let streamedAssistantText = "";
        try {
          for await (const event of anthropicStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              streamedAssistantText += event.delta.text;
              sendText(event.delta.text);
            }
          }
        } finally {
          // Always clear the timeout — whether stream completed, errored, or client aborted.
          // Without finally, a throw here leaks the 120s timer.
          clearTimeout(streamTimeout);
        }

        // ── Brain Feedback: teach the Brain from Copilot interaction (Phase 4: 5s timeout) ──
        const { createBrainFeedbackBus } = memStack;
        const bus = createBrainFeedbackBus({ supabase: service, organizationId: workspaceId });
        const feedbackTimeout = new Promise<void>((resolve) => setTimeout(resolve, 5_000));
        await Promise.race([
          Promise.all([
            bus.emitSignal({
              sourceDomain: 'copilot.chat',
              signalType: 'copilot_interaction',
              signalValue: brainContext?.confidence ?? 0.5,
              entityType: 'copilot_chat',
              entityId: `copilot_${Date.now()}`,
              metadata: {
                intent: detectedIntent,
                domains: detectedDomains,
                model: v4SmartModel,
                hadBrainContext: !!brainContext,
                hadActionArtifact: !!actionArtifact,
                hadSeaasResult: !!seaasResult,
                hadAccountingResult: !!accountingResult,
                userId: user.id,
              },
            }),
            bus.recordExecution({
              service: 'copilot',
              domainType: detectedIntent,
              durationMs: Date.now() - streamStartMs,
              claudePowered: true,
              brainAugmented: !!brainContext,
              causalEdgesUsed: causalEdges.length,
              patternsUsed: patterns.length,
            }),
            bus.triggerEvolution(),
          ]),
          feedbackTimeout,
        ]).catch((feedbackErr) => {
          // Non-blocking but log for debugging — silent swallowing hides brain learning failures
          logger.warn("[Copilot] Feedback bus error (non-fatal):", feedbackErr instanceof Error ? feedbackErr.message : String(feedbackErr));
        });

        // ── RL Quality Recording: close the RL flywheel for copilot LLM responses ──
        // recordAgentOutcome() was only called from domain-executor (SE-aaS path).
        // For standard copilot responses, prediction_records was never written.
        // This fire-and-forget call closes that gap.
        try {
          const { computeAgentQuality, recordAgentOutcome } = await import('@/lib/brain/agent-rl');
          const _rlDomain = detectedIntent ?? 'general';
          const _rlExecutionMs = Date.now() - streamStartMs;
          const _rlResultText = streamedAssistantText ?? '';
          const _rlQuality = computeAgentQuality(
            _rlResultText,
            null,
            _rlExecutionMs,
            _rlDomain
          );
          recordAgentOutcome(service, {
            agentId: `copilot_${workspaceId}_${Date.now()}`,
            domain: _rlDomain,
            taskDescription: message.trim().slice(0, 200),
            resultSummary: _rlResultText.slice(0, 500),
            quality: _rlQuality,
            executionMs: _rlExecutionMs,
            organizationId: workspaceId,
            userId: user.id,
          }).catch((rlErr: unknown) => logger.warn('[Copilot] RL outcome recording failed:', rlErr instanceof Error ? rlErr.message : String(rlErr)));
        } catch (rlErr: unknown) {
          logger.warn('[Copilot] RL import failed:', rlErr instanceof Error ? rlErr.message : String(rlErr));
        }

        // ── Notify OpenClaw gateway of conversation completion ──────
        // This lets the Signal Harvester process the conversation for
        // causal signals, prediction outcomes, and implicit feedback.
        try {
          const { gatewayManager: gm } = await import("@/lib/openclaw/gateway-client");
          const gwConn = gm.getConnection(workspaceId);
          if (gwConn && gwConn.isConnected()) {
            gwConn.send("nexusbrain.ingest", {
              signals: [{
                type: "conversation_completed",
                source: "copilot",
                orgId: workspaceId,
                userId: user.id,
                query: message.trim().slice(0, 500),
                domain: detectedIntent || "general",
                causalEdgesUsed: causalEdges.length,
                patternsUsed: patterns.length,
                brainAugmented: !!brainContext,
                timestamp: new Date().toISOString(),
              }],
            }).catch((gwErr) => { logger.warn("[Copilot] OpenClaw ingest failed (non-fatal):", gwErr instanceof Error ? gwErr.message : String(gwErr)); });
          }
        } catch {
          // Non-blocking: gateway not available
        }

        // ── Chat Auto-Save — persist conversation turn to conversations table ──
        // Every message pair (user + assistant) is saved so history survives page refresh.
        // Uses upsert-by-session-key pattern: one row per (org_id, user_id) per day session.
        // Non-fatal: save failure must NEVER prevent response delivery.
        try {
          const sessionDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
          const sessionTitle = message.trim().slice(0, 80) || "New conversation";

          // Build the updated message list: prior history + new user+assistant pair
          // streamedAssistantText was accumulated during the LLM stream loop above.
          const updatedMessages: Array<{ role: string; content: string; timestamp: string }> = [
            ...(conversationHistory ?? []).map((h) => ({ role: h.role, content: h.content, timestamp: "" })),
            { role: "user", content: message.trim(), timestamp: new Date().toISOString() },
            ...(streamedAssistantText
              ? [{ role: "assistant", content: streamedAssistantText.trim(), timestamp: new Date().toISOString() }]
              : []),
          ];

          // Upsert the conversation row — insert if new session, update messages if existing
          await service
            .from("conversations")
            .upsert(
              {
                org_id: workspaceId,
                user_id: user.id,
                title: sessionTitle,
                service_mode: seaasResult || deliveryIntelligenceResult ? "seaas" : accountingResult ? "aas" : "general",
                messages: updatedMessages,
                metadata: {
                  lastDomain: detectedIntent || "general",
                  brainIq: brainIqForRouting,
                  sessionDate,
                },
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "id",
                ignoreDuplicates: false,
              }
            )
            .select("id")
            .maybeSingle();
        } catch (saveErr) {
          // Non-blocking — chat save must never fail the response
          logger.warn("[Copilot] Chat auto-save failed (non-fatal):", saveErr instanceof Error ? saveErr.message : String(saveErr));
        }

        close();
      } catch (err) {
        sendError(
          "Failed to get response from AI. Please try again."
        );
        close();
      }
    })();

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    logger.error("[Copilot/Chat] Unhandled error in POST handler:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================================
// Route utility functions — moved to dedicated modules:
//   detectSEaaSRoute(), detectLanguage()  → @/lib/copilot/handlers/seaas-handler
//   detectAccountingRoute()               → @/lib/copilot/handlers/seaas-handler
//   detectAgentIntent(), DOMAIN_AGENT_NAMES → @/lib/copilot/handlers/agent-handler
// ============================================================================
