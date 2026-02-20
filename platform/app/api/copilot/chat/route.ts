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

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  estimateImpact,
} from "@/lib/nexus-copilot-adapter";
import type {
  TrainedCausalEdge,
  TrainedRule,
  TrainedPattern,
  TrainedCascadeRule,
  BrainContext,
  BrainRegions,
} from "@nexus-ai/memory-stack";
import { createBrainContextMesh, createBrainFeedbackBus, createLLMQueryInterpreter } from "@nexus-ai/memory-stack";
import type { QueryInterpretation } from "@nexus-ai/memory-stack";

import { CORE_ORG_ID } from "@/lib/org-helpers";

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Vercel serverless: allow up to 120s for long Claude SSE streams

// ============================================================================
// SSE STREAM HELPER
// ============================================================================

function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const send = (data: string) => {
    controller?.enqueue(encoder.encode(`data: ${data}\n\n`));
  };

  const sendText = (text: string) => {
    send(JSON.stringify({ text }));
  };

  const sendError = (error: string) => {
    send(JSON.stringify({ error }));
  };

  const close = () => {
    send("[DONE]");
    controller?.close();
  };

  // ── Agent Streaming Events (Week 2: OpenClaw + Agent Integration) ──

  /** Stream an agent execution step to the UI */
  const sendAgentStep = (step: {
    stepNumber: number;
    type: "thinking" | "querying" | "acting" | "observing" | "reflecting";
    title: string;
    content?: string;
    toolName?: string;
    durationMs?: number;
    status: "started" | "completed" | "failed";
  }) => {
    send(JSON.stringify({ agentStep: step }));
  };

  /** Stream a progressive artifact that builds incrementally */
  const sendProgressiveArtifact = (artifact: {
    id: string;
    type: string;
    title: string;
    content: string;
    isPartial: boolean;
    service?: "seaas" | "aas" | "core";
  }) => {
    send(JSON.stringify({ progressiveArtifact: artifact }));
  };

  /** Stream agent task status changes */
  const sendAgentStatus = (status: {
    taskId: string;
    status: "starting" | "running" | "completed" | "failed" | "awaiting_approval";
    agentType?: string;
    message?: string;
  }) => {
    send(JSON.stringify({ agentStatus: status }));
  };

  /** Stream proactive insights (\"while you were away\") */
  const sendProactiveInsights = (insights: Array<{
    domain: string;
    content: string;
    importance: number;
  }>) => {
    send(JSON.stringify({ proactiveInsights: insights }));
  };

  return {
    stream, send, sendText, sendError, close,
    sendAgentStep, sendProgressiveArtifact, sendAgentStatus, sendProactiveInsights,
  };
}

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
      entityState,
      conversationHistory,
      useFramework,
      // V4: Optional persona override from frontend
      persona,
      // Phase 4: branch for SE-aaS code intelligence (from GitHub connector)
      branch,
      // Phase 7: Custom template command execution
      commandId,
      commandParams,
    } = body as {
      message: string;
      organizationId?: string;
      entityState?: Record<string, unknown>;
      conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
      useFramework?: boolean;
      persona?: { name: string; description: string };
      branch?: string;
      commandId?: string;
      commandParams?: Record<string, unknown>;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // ── Org resolution ──────────────────────────────────────────────────
    // organizationId comes from the frontend (OrgProvider cookie / context).
    // It is ALWAYS the workspace-org the user is currently viewing.
    //
    // Workspace isolation guarantee:
    //   - Each org has its own causal graph, signals, memory, predictions.
    //   - customer_id (billing parent) is NEVER used here — org_id is the
    //     sole isolation boundary for all brain/SE-AAS/copilot paths.
    //
    // CORE_ORG_ID fallback:
    //   - Only hit when organizationId is not provided (e.g. unauthenticated
    //     embed, API callers without org context).
    //   - The membership check below enforces access — a regular user who is
    //     not a member of CORE will receive a 403. This is correct behaviour.
    let orgId = organizationId || CORE_ORG_ID;

    // Authenticate via Supabase
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Auto-resolve org when frontend didn't provide one ────────────
    if (!organizationId) {
      const { data: userOrgs } = await supabase
        .from("org_members")
        .select("organization_id, organizations:organization_id(is_core_brain)")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true });

      if (userOrgs && userOrgs.length > 0) {
        // Prefer first non-core org (actual workspace), fallback to first org
        const nonCore = userOrgs.find(
          (m: any) => !(m.organizations as any)?.is_core_brain
        );
        orgId = nonCore?.organization_id ?? userOrgs[0].organization_id;
        console.log("[Chat] Auto-resolved org:", orgId);
      }
      // If no memberships found, orgId stays as CORE_ORG_ID → membership check will 403 (correct)
    }

    // ── Validate user is a member of the requested org ──────────────────
    // This runs for EVERY request including CORE_ORG_ID — no exemptions.
    // A user must be an org_member of the target org OR a platform admin.
    // This prevents any user from querying a different workspace's brain,
    // regardless of what organizationId they pass in the request body.
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    // Platform admins can access any org (for support/debugging)
    const { data: adminCheck } = !membership
      ? await supabase
          .from("org_members")
          .select("is_platform_admin")
          .eq("user_id", user.id)
          .eq("is_platform_admin", true)
          .limit(1)
          .single()
      : { data: null };

    if (!membership && !adminCheck) {
      return NextResponse.json(
        { error: "You are not a member of this organization" },
        { status: 403 }
      );
    }

    // ── Create service client once for the entire request lifecycle ──────
    const service = await createServiceClient();

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
    const { createBrainCommander } = await import("@nexus-ai/memory-stack");
    const commander = createBrainCommander({
      supabase,
      organizationId: orgId,
      anthropicApiKey,
      enableActions: false, // We handle action engine separately below for copilot
      enableMotorCommands: false,
    });

    // ── Phase 3: LLM Query Interpretation ────────────────────────────
    // Replace regex dispatch with semantic LLM interpretation (~200ms).
    // Provides: intent classification, entity extraction, service routing,
    // required data signals (skip unneeded DB queries), adaptive token budgets.
    // Falls back to regex dispatch-assessor on any failure.
    const interpreter = createLLMQueryInterpreter({
      anthropicApiKey,
    });
    let interpretation: QueryInterpretation | undefined;
    try {
      interpretation = await interpreter.interpret(message);
    } catch (interpErr) {
      console.warn('[LLMInterpreter] Non-fatal: LLM interpretation failed, falling back to regex dispatch:', interpErr);
    }

    const commandResult = await commander.command(message, {
      userId: user.id,
      entityState,
      interpretation,
    });

    const { intelligence } = commandResult;

    // Map Commander intelligence to the typed formats the copilot pipeline expects
    const causalEdges: TrainedCausalEdge[] = intelligence.causalEdges as unknown as TrainedCausalEdge[];
    const rules: TrainedRule[] = intelligence.rules as unknown as TrainedRule[];
    const cascadeRules: TrainedCascadeRule[] = intelligence.cascadeRules as unknown as TrainedCascadeRule[];

    // Merge insights into patterns — insights are org-level findings from connectors
    // (Xero, Volopay, etc.) that have the same shape as patterns. By including them
    // in the patterns array, the brain context builder naturally surfaces them to the LLM.
    const dbPatterns: TrainedPattern[] = intelligence.patterns as unknown as TrainedPattern[];
    const dbInsights = intelligence.insights.map((row) => ({
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
        const { createCopilotInstance, extractDomains, normalizeEntityState, selectModel } = await import("@nexus-ai/memory-stack");
        const { createNexusBrainAdapter } = await import("@/lib/nexus-copilot-adapter");

        // Detect domains for the adapter
        const detectedDomains = extractDomains(message);

        // Build the adapter from DB data — cast trained types to adapter's narrower interface
        const adapter = createNexusBrainAdapter({
          causalEdges: causalEdges as any,
          rules: rules as any,
          cascadeRules,
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
        console.warn(
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
      } = await import("@nexus-ai/memory-stack");

      // Check if any GitHub connector is active with ingested data (supports multi-instance)
      const { data: ghConnectors } = await Promise.resolve(service
        .from("org_connectors")
        .select("config")
        .eq("organization_id", orgId)
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
          depGraph.load(service, orgId),
          expertiseGraph.load(service, orgId),
          collabGraph.load(service, orgId),
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
            weight: edge.effect_size,
            pValue: edge.granger_p_value,
            lagDays: edge.optimal_lag_days,
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
      const mesh = createBrainContextMesh({ supabase: service, organizationId: orgId });
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
      if (conversationHistory && conversationHistory.length > 0) {
        brainRegions.conversationHistory = conversationHistory;
      }

      // ── Persona (configurable — defaults to generic NexusBrain Copilot) ──
      if (persona) {
        brainRegions.persona = persona;
      }

      // ── Claude-Aspirational Capabilities ──────────────────────────────
      // These are lightweight, stateless factories — safe to instantiate per request.
      const {
        createAgentLoop,
        createProactiveIntelligence,
        createSessionMemory,
        createReasoningChain,
        createMultiModalInference,
      } = await import("@nexus-ai/memory-stack");

      // Agent Loop — autonomous multi-step execution planning
      brainRegions.agentLoop = createAgentLoop({ maxSteps: 10 });

      // Proactive Intelligence — surfaces recent alerts
      brainRegions.proactiveIntelligence = createProactiveIntelligence();

      // Session Memory — per-user context accumulation
      brainRegions.sessionMemory = createSessionMemory({
        userId: user.id,
        organizationId: orgId,
      });

      // Reasoning Chain — chain-of-thought surfacing
      brainRegions.reasoningChain = createReasoningChain({ depth: 'moderate' });

      // Multi-Modal Inference — time series / document analysis
      brainRegions.multiModalInference = createMultiModalInference();

      // Note: RAG retriever and Long-Context Manager are async/post-processing tools.
      // RAG should be pre-fetched before buildContext if vector search is available.
      // Long-Context Manager optimizes the fullPrompt AFTER buildContext.
      // Structured Output validates responses AFTER LLM generation.

      // ── Build unified context from ALL available brain regions ───────
      const builder = createBrainContextBuilder(brainRegions as BrainRegions);
      brainContext = builder.buildContext(message);

    } catch (brainErr) {
      console.warn("[BrainContext] Non-fatal: could not load brain intelligence:", brainErr);
    }

    // ── SE-aaS + AAS SERVICE ROUTING (Phase 3: LLM-Powered) ──────────
    // Uses LLM interpretation for semantic service routing (replaces 350+ lines of regex).
    // Falls back to regex detectSEaaSRoute/detectAccountingRoute if interpretation unavailable.
    let seaasResult: Record<string, unknown> | null = null;
    let accountingResult: Record<string, unknown> | null = null;
    let deliveryIntelligenceResult: Record<string, unknown> | null = null;

    // Copilot-native capabilities handled by Brain commander (not SE-aaS domain executors)
    const COPILOT_NATIVE_DOMAINS = new Set(['boilerplate-generator', 'pr-review-assistant', 'codebase-qa']);

    // Determine service route from LLM interpretation or regex fallback.
    // Regex runs as safety net even when LLM interpretation is present, unless
    // the LLM explicitly routed to a different service (se-aas takes priority).
    const serviceRoute = interpretation?.serviceRoute;
    const seaasRoute = serviceRoute?.type === 'se-aas' && serviceRoute.seaasDomain
      ? { domainType: serviceRoute.seaasDomain, extractedInput: serviceRoute.seaasInput || {} }
      : !interpretation ? detectSEaaSRoute(message) : null;
    const accountingRoute = serviceRoute?.type === 'aas' && serviceRoute.aasDomain
      ? { domainType: serviceRoute.aasDomain, extractedInput: serviceRoute.aasInput || {} }
      : serviceRoute?.type !== 'se-aas' ? detectAccountingRoute(message) : null;

    if (seaasRoute && process.env.ANTHROPIC_API_KEY && !COPILOT_NATIVE_DOMAINS.has(seaasRoute.domainType)) {
      try {
        const { executeDomain } = await import("@/lib/se-aas/domain-executor");

        const domainResult = await executeDomain(service, {
          domainType: seaasRoute.domainType,
          // Phase 4: merge branch into domain request so domain-executor's
          // createBrainContextMesh({ branch }) picks it up for code intelligence.
          request: { ...seaasRoute.extractedInput, ...(branch ? { branch } : {}) },
          organizationId: orgId,
          userId: user.id,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
          interpretation, // Phase 3: pass interpretation for targeted context
        });

        const DELIVERY_DOMAINS = ['pod-match', 'delivery-intelligence', 'early-warning', 'scope-creep'];
        const isDeliveryDomain = DELIVERY_DOMAINS.includes(seaasRoute.domainType);

        if (isDeliveryDomain) {
          // All P0 Delivery Intelligence domains route to the SEaaSDeliveryPanel
          // Fetch the full delivery intelligence data from the dedicated API
          try {
            const healthRes = await fetch(
              `${request.nextUrl.origin}/api/se-aas/engagement-health`,
              { headers: { cookie: request.headers.get('cookie') || '' } }
            );
            if (healthRes.ok) {
              const healthData = await healthRes.json();
              deliveryIntelligenceResult = {
                _domainType: seaasRoute.domainType, // Preserve which P0 domain triggered
                ...healthData,
                podRecommendation: (domainResult.result as any)?.data?.recommendation ?? (domainResult.result as any)?.recommendation,
                // Pass through domain-specific results (e.g. velocity predictions, bottleneck data)
                domainResult: domainResult.result,
              };
            } else {
              deliveryIntelligenceResult = {
                _domainType: seaasRoute.domainType,
                podRecommendation: (domainResult.result as any)?.data?.recommendation ?? (domainResult.result as any)?.recommendation,
                domainResult: domainResult.result,
              };
            }
          } catch {
            deliveryIntelligenceResult = {
              _domainType: seaasRoute.domainType,
              podRecommendation: (domainResult.result as any)?.data?.recommendation ?? (domainResult.result as any)?.recommendation,
              domainResult: domainResult.result,
            };
          }
        } else {
          seaasResult = {
            domainType: seaasRoute.domainType,
            artifactId: domainResult.artifactId,
            ...domainResult.result,
          };
        }
      } catch (seaasErr) {
        console.warn("[SE-aaS NL] Non-fatal: domain execution failed:", seaasErr);
      }
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
          const storagePath = `${orgId}/gl-data.json`;
          const { data: fileData } = await service.storage
            .from("org-data")
            .download(storagePath);
          if (fileData) {
            const text = await fileData.text();
            try {
              glData = JSON.parse(text);
            } catch {
              console.warn("[AaaS] GL data is malformed JSON, skipping");
            }
          }
        } catch {
          // No GL data available for this org
        }

        if (glData.length > 0) {
          const { executeAccountingAgent } = await import("@/lib/aas/domain-executor");
          const aasResult = await executeAccountingAgent(service, {
            action: aasAction as any,
            organizationId: orgId,
            userId: user.id,
            transactions: glData,
            jurisdiction: 'SG',
            interpretation, // Phase 3: pass interpretation for targeted context
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
            error: "no_gl_data",
            message: "No General Ledger data found for this organization. Please upload a GL file (Excel or CSV) using any accounting command (e.g. /aas-pl), then try again.",
          };
        }
      } catch (acctErr) {
        console.warn("[AaaS NL] Non-fatal: accounting routing failed:", acctErr);
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
          .eq('org_id', orgId)
          .eq('command_id', commandId)
          .eq('is_archived', false)
          .single();

        // Also check public templates if not found in org
        let resolvedTemplate = template;
        if (!resolvedTemplate) {
          const { data: publicTemplate } = await service
            .from('agent_templates')
            .select('*')
            .eq('command_id', commandId)
            .eq('is_public', true)
            .eq('is_archived', false)
            .single();
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
                let templatePrompt = resolvedTemplate.prompt;
                if (commandParams) {
                  for (const [key, value] of Object.entries(commandParams)) {
                    templatePrompt = templatePrompt.replace(
                      new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
                      String(value)
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
                    organizationId: orgId,
                    userId: user.id,
                    supabase: service,
                    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
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
                composerSendError(err instanceof Error ? err.message : 'Custom template execution failed');
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
        console.warn("[CustomTemplate] Non-fatal: template loading failed:", templateErr);
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

    if (agentIntent) {
      // ── OpenClaw Gateway Fast-Path ────────────────────────────────
      // If this org has a connected OpenClaw gateway, route the agent
      // request through the daemon instead of running locally. The daemon
      // has direct codebase access, runs tools locally, and the
      // reinforcement loop operates there.
      const openClawConn = (await import("@/lib/openclaw/gateway-client")).gatewayManager.getConnection(orgId);

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
              orgId,
              message: message.trim(),
              sessionKey: `copilot-${orgId}-${Date.now()}`,
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
            clawSendError(err instanceof Error ? err.message : "OpenClaw agent stream failed");
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

        try {
          // ── 1. Create brain_agent_tasks record ──────────────────
          const { data: agentTask, error: taskErr } = await service
            .from("brain_agent_tasks")
            .insert({
              organization_id: orgId,
              created_by: user.id,
              prompt: message.trim(),
              agent_type: agentIntent.agentType,
              auto_execute_threshold: 0.8,
              status: "running",
              started_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (taskErr || !agentTask) {
            agentSendError("Failed to create agent task");
            agentClose();
            return;
          }

          taskId = agentTask.id;

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
          });

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
              const { data: jiraConnectors } = await service
                .from("org_connectors")
                .select("config, credentials")
                .eq("organization_id", orgId)
                .eq("connector_type", "jira")
                .eq("status", "active");

              // Try each Jira instance until we find the ticket
              const jiraId = agentIntent.extractedParams.jiraId!;
              const projectPrefix = jiraId.split("-")[0];

              for (const jiraConnector of (jiraConnectors || [])) {
                const jConf = jiraConnector.config as Record<string, any>;
                const jCreds = jiraConnector.credentials as Record<string, any> | null;
                const jiraBaseUrl = jConf.baseUrl || jConf.jira_base_url || jConf.site_url;
                const jiraEmail = jCreds?.email || jConf.email || jConf.jira_email;
                const jiraToken = jCreds?.api_token || jConf.apiToken || jConf.jira_api_token;

                if (!jiraBaseUrl || !jiraEmail || !jiraToken) continue;

                // If this instance has projectKeys, check if it matches
                const keys = jConf.projectKeys as string[] | undefined;
                if (keys && keys.length > 0 && !keys.includes(projectPrefix)) continue;

                try {
                  const issueRes = await fetch(
                    `${jiraBaseUrl}/rest/api/3/issue/${jiraId}`,
                    {
                      headers: {
                        Authorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64")}`,
                        Accept: "application/json",
                      },
                    }
                  );
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
            });

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
              .eq("organization_id", orgId)
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
                  `- [${m.episode_type}] ${m.content.slice(0, 200)}`
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
          } = await import("@nexus-ai/memory-stack");

          const dt = createDT();
          const eg = createCSEG();
          const cs = createCS({ organizationId: orgId, anthropicApiKey: anthropicApiKey! });
          const dl = createDL({ organizationId: orgId, domainTaxonomy: dt, entityGraph: eg });
          const dp = createDP({ organizationId: orgId, supabase: service, cognitiveStack: cs, deepLayers: dl, domainTaxonomy: dt, entityGraph: eg });
          const cortex = createNCC({ organizationId: orgId, supabase: service, pipeline: dp, cognitiveStack: cs, deepLayers: dl });
          const closedLoop = cortex.getClosedLoopEngine();

          const brainRuntime = createBAR({
            supabase: service,
            organizationId: orgId,
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
            ? `${message.trim()}${episodicContext}`
            : message.trim();

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
                tokensUsed: brainResult.metrics.tokensUsed,
                durationMs: Date.now() - agentStartTime,
                model: brainResult.metrics.model,
                autoExecuted: brainResult.status === "auto-executed",
                brainCycleDurationMs: brainResult.metrics.brainCycleDurationMs,
                claudeCallDurationMs: brainResult.metrics.claudeCallDurationMs,
                compositeConfidence: brainResult.confidence,
                agentIntent: agentIntent,
              },
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", taskId);

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
            organization_id: orgId,
            source_domain: "brain.agents",
            signal_type: `copilot_agent_${agentIntent.agentType}_completed`,
            signal_value: brainResult.confidence,
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
            organization_id: orgId,
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
          const errMsg = err instanceof Error ? err.message : "Agent execution failed";
          console.error("[AgentMode] Error:", errMsg);

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
        const { createDomainActionEngine, formatArtifactForPrompt } = await import(
          "@nexus-ai/memory-stack"
        );
        const engine = createDomainActionEngine({
          supabase,
          organizationId: orgId,
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

        const artifact = await engine.execute(message, knowledgeCtx);
        actionArtifact = artifact as unknown as Record<string, unknown>;

        // Store formatted prompt text for system prompt augmentation
        (actionArtifact as Record<string, unknown>).__promptText =
          formatArtifactForPrompt(artifact);
      } catch (err) {
        console.warn(
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

    // ── Build messages array with conversation history ──────────────────
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      // Include last 4 exchanges for context
      const recent = conversationHistory.slice(-8);
      for (const msg of recent) {
        if (msg && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string") {
          messages.push({
            role: msg.role,
            content: msg.content.slice(0, 50000), // Cap individual message length
          });
        }
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

    // ── Build effective system prompt ──────────────────────────────────
    // V4: brainContext.fullPrompt is the COMPLETE system prompt from the SDK.
    // It already includes persona, intent-aware instructions, and ALL brain data.
    const NO_HALLUCINATION_FALLBACK = `You are the Brain OS Copilot — an intelligence co-pilot for this organization.

CRITICAL RULES:
1. You MUST ONLY answer using data that exists in the brain context below. Do NOT invent, fabricate, or hallucinate any numbers, metrics, KPIs, trends, or statistics.
2. If no brain data is available for the user's question, say clearly: "I don't have data on that yet. This org hasn't connected a data source for [topic] — once connected, I'll be able to answer with real numbers."
3. NEVER make up financial figures, causal relationships, revenue numbers, churn rates, burn rates, or any quantitative claims unless they appear in the brain context.
4. If the user asks about something outside the brain's knowledge, acknowledge the gap honestly. Offer to help with what IS available.
5. When you DO have data, cite it precisely — use the exact numbers from the brain context, not approximations or "typical" values.

You currently have: ${causalEdges.length} causal edges, ${rules.length} business rules, ${patterns.length} patterns/insights, ${cascadeRules.length} cascade rules loaded for this organization.`;

    let effectiveSystemPrompt = brainContext?.fullPrompt || NO_HALLUCINATION_FALLBACK;

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

    // ── Visual chart instruction: teach Claude to emit inline charts ──────
    effectiveSystemPrompt += `\n\n## VISUAL CHART OUTPUT
When data is suitable for visualization (time series, comparisons, distributions), output an interactive chart using a fenced code block with language "chart" and a JSON body:

\`\`\`chart
{
  "type": "bar",
  "title": "Signal Activity by Domain",
  "xKey": "date",
  "series": [{"key": "engineering", "label": "Engineering", "color": "#3b82f6"}],
  "data": [{"date": "Jan 1", "engineering": 42}, {"date": "Jan 2", "engineering": 55}]
}
\`\`\`

Chart types: "bar", "line", "area", "stacked-bar". Always use REAL data from brain context. Combine charts with narrative explanation. Use charts when showing trends, comparisons, or distributions — they render as interactive visualizations in the UI.`;

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
- Top reviewer share: ${(eng.topReviewerShare * 100).toFixed(0)}%
- Reviewer Gini coefficient: ${eng.giniCoefficient.toFixed(2)}
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
The Brain has been actively reasoning about this organization during its sleep cycles.
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
        console.warn('[Copilot] Causal diagnosis non-fatal:', (diagErr as Error).message);
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
        console.warn('[Copilot] Counterfactual simulation non-fatal:', (cfErr as Error).message);
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
        console.warn('[Copilot] Cascade chain non-fatal:', (cascadeErr as Error).message);
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

    // ── LEARNING LOOP: Inject ai_memory corrections into system prompt ─────
    // Query high-importance user corrections from ai_memory table.
    // These are REAL corrections saved by /api/copilot/feedback when users
    // click thumbs-down and provide corrected information.
    // This closes the loop: user corrects → stored in ai_memory → next answer uses correction.
    {
      const correctionDomain = brainContext?.domains?.[0] || "general";
      const { data: corrections } = await Promise.resolve(service
        .from("ai_memory")
        .select("content, importance, domain, created_at")
        .eq("organization_id", orgId)
        .eq("memory_type", "correction")
        .order("importance", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8))
        .catch(() => ({ data: null as any[] | null }));

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

    // ── Smart model selection: Haiku for simple, Sonnet for complex ──
    const { selectModel: selectSmartModel } = await import("@nexus-ai/memory-stack");
    const v4SmartModel = selectSmartModel(message, {
      commanderComplexity: commandResult?.dispatch?.complexityScore,
      hasConversationHistory: conversationHistory && conversationHistory.length > 0,
      conversationTurns: conversationHistory?.length,
      hasBrainArtifacts: !!actionArtifact,
      hasDomainResults: !!seaasResult || !!accountingResult,
    });

    // ── Stream via Anthropic ──────────────────────────────────────────
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const { stream, send, sendText, sendError, close, sendProactiveInsights } = createSSEStream();

    (async () => {
      try {
        // ── Proactive Insights: "While you were away" (Week 6) ──
        // On first message of session, surface recent insights from ai_memory
        const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
        if (isFirstMessage) {
          try {
            const { data: recentInsights } = await service
              .from("ai_memory")
              .select("content, domain, importance")
              .eq("organization_id", orgId)
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

        // Send SE-aaS domain result to frontend for structured display
        if (seaasResult) {
          send(JSON.stringify({ seaasResult }));
        }

        // Send AaaS domain result to frontend for structured display
        if (accountingResult) {
          send(JSON.stringify({ accountingResult }));
        }

        // Send SE-aaS Delivery Intelligence result (pod-match + health scores) for SEaaSDeliveryPanel
        if (deliveryIntelligenceResult) {
          send(JSON.stringify({ deliveryIntelligenceResult }));
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

        const anthropicStream = anthropic.messages.stream({
          model: v4SmartModel,
          max_tokens: 8192,
          // Enable prompt caching — saves ~90% on repeated system prompts (brain context is often similar)
          system: [{ type: 'text' as const, text: effectiveSystemPrompt, cache_control: { type: 'ephemeral' as const } }],
          messages,
        });

        // Safety: hard timeout — close stream if Anthropic takes >120s
        const streamTimeout = setTimeout(() => {
          try {
            sendError("Response timed out after 120 seconds. Please try a shorter question.");
            close();
            anthropicStream.abort();
          } catch { /* already closed */ }
        }, 120_000);

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            sendText(event.delta.text);
          }
        }

        clearTimeout(streamTimeout);

        // ── Brain Feedback: teach the Brain from Copilot interaction ──
        const bus = createBrainFeedbackBus({ supabase: service, organizationId: orgId });
        await Promise.all([
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
            durationMs: Date.now() - Date.now(), // approximate
            claudePowered: true,
            brainAugmented: !!brainContext,
            causalEdgesUsed: causalEdges.length,
            patternsUsed: patterns.length,
          }),
          bus.triggerEvolution(),
        ]).catch(() => {
          // Non-blocking
        });

        // ── Notify OpenClaw gateway of conversation completion ──────
        // This lets the Signal Harvester process the conversation for
        // causal signals, prediction outcomes, and implicit feedback.
        try {
          const { gatewayManager: gm } = await import("@/lib/openclaw/gateway-client");
          const gwConn = gm.getConnection(orgId);
          if (gwConn && gwConn.isConnected()) {
            gwConn.send("nexusbrain.ingest", {
              signals: [{
                type: "conversation_completed",
                source: "copilot",
                orgId,
                userId: user.id,
                query: message.trim().slice(0, 500),
                domain: detectedIntent || "general",
                causalEdgesUsed: causalEdges.length,
                patternsUsed: patterns.length,
                brainAugmented: !!brainContext,
                timestamp: new Date().toISOString(),
              }],
            }).catch(() => {}); // fire-and-forget
          }
        } catch {
          // Non-blocking: gateway not available
        }

        close();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        sendError(
          `Failed to get response from AI: ${errorMessage}. Please try again.`
        );
        close();
      }
    })();

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// ============================================================================
// SE-aaS NATURAL LANGUAGE ROUTING
// ============================================================================

/**
 * Detect if user message should route to an SE-aaS domain.
 *
 * ROUTING TABLE:
 *   "analyze this SQL" / "check SQL" / "SQL query" → sql-analyzer
 *   "generate test cases" / "test for" → test-case-generator
 *   "generate test data" / "mock data" / "seed data" → test-data-generator
 *   "write TDD code" / "implement with tests" → tdd-code-generator
 *   "diagnose incident" / "root cause" / "why is X down" → incident-diagnosis
 *   "impact analysis" / "what's affected" / "blast radius" → impact-analysis
 *   "data lineage" / "where does this data come from" → data-lineage
 *   "query logs" / "find in logs" / "log search" → log-query
 */
function detectSEaaSRoute(
  message: string
): { domainType: string; extractedInput: Record<string, unknown> } | null {
  const lower = message.toLowerCase();

  // ── SQL Analyzer ──────────────────────────────────────────────────────
  if (
    /analyze\s+(this\s+)?sql|check\s+(this\s+)?sql|sql\s+query\s+review|review\s+(this\s+)?query|optimize\s+(this\s+)?sql/i.test(lower)
  ) {
    // Extract SQL from the message (look for code blocks or after ":")
    const sqlMatch = message.match(/```(?:sql)?\s*([\s\S]+?)```/) ||
                     message.match(/:\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+[\s\S]+/i);
    const query = sqlMatch ? sqlMatch[1].trim() : message.replace(/^.*?(SELECT|INSERT|UPDATE|DELETE)/i, '$1').trim();

    return {
      domainType: 'sql-analyzer',
      extractedInput: {
        query: query || message,
        analysisTypes: ['correctness', 'performance', 'security', 'style'],
        databaseType: 'postgresql',
      },
    };
  }

  // ── Test Case Generator ───────────────────────────────────────────────
  if (
    /generate\s+test\s+cases?|create\s+test\s+cases?|test\s+cases?\s+for|write\s+tests?\s+for/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    return {
      domainType: 'test-case-generator',
      extractedInput: {
        code: codeMatch?.[1]?.trim() || message,
        language: detectLanguage(message),
        coverage: 'comprehensive',
      },
    };
  }

  // ── Test Data Generator ───────────────────────────────────────────────
  if (
    /generate\s+test\s+data|mock\s+data|seed\s+data|fake\s+data|sample\s+data/i.test(lower)
  ) {
    return {
      domainType: 'test-data-generator',
      extractedInput: {
        description: message,
        format: 'json',
        count: 10,
      },
    };
  }

  // ── TDD Code Generator ────────────────────────────────────────────────
  if (
    /write\s+(?:tdd|test.driven)|implement\s+with\s+tests?|tdd\s+(?:for|implement)/i.test(lower)
  ) {
    return {
      domainType: 'tdd-code-generator',
      extractedInput: {
        description: message,
        language: detectLanguage(message),
      },
    };
  }

  // ── Incident Diagnosis ────────────────────────────────────────────────
  if (
    /diagnose\s+(?:this\s+)?incident|root\s+cause|why\s+is\s+.*(?:down|failing|broken|crashing)|incident\s+(?:analysis|diagnosis)/i.test(lower)
  ) {
    return {
      domainType: 'incident-diagnosis',
      extractedInput: {
        description: message,
        severity: /critical|p0|sev.?0/i.test(lower) ? 'critical' : 'high',
      },
    };
  }

  // ── Impact Analysis ───────────────────────────────────────────────────
  if (
    /impact\s+analysis|blast\s+radius|what.?s\s+affected|downstream\s+impact|dependency\s+impact/i.test(lower)
  ) {
    return {
      domainType: 'impact-analysis',
      extractedInput: {
        description: message,
        changeType: 'code_change',
      },
    };
  }

  // ── Data Lineage ──────────────────────────────────────────────────────
  if (
    /data\s+lineage|where\s+does\s+.*(?:data|field)\s+come\s+from|trace\s+data|data\s+flow|data\s+origin/i.test(lower)
  ) {
    return {
      domainType: 'data-lineage',
      extractedInput: {
        description: message,
      },
    };
  }

  // ── Log Query ─────────────────────────────────────────────────────────
  if (
    /query\s+logs?|search\s+logs?|find\s+in\s+logs?|log\s+search|grep\s+logs?/i.test(lower)
  ) {
    return {
      domainType: 'log-query',
      extractedInput: {
        query: message,
        timeRange: '24h',
      },
    };
  }

  // ── Dependency Upgrade (P1 1.4) ─────────────────────────────────────
  if (
    /outdated\s+dep|upgrade\s+dep|dependency\s+upgrade|dependency\s+update|check\s+dep.*version|npm\s+audit|security\s+vuln/i.test(lower)
  ) {
    const manifestMatch = message.match(/```(?:json)?\s*([\s\S]+?)```/);
    return {
      domainType: 'dependency-upgrade',
      extractedInput: {
        manifest: manifestMatch?.[1]?.trim() || '{}',
        ecosystem: /pip|python/i.test(lower) ? 'pip' : /go\b/i.test(lower) ? 'go' : 'npm',
      },
    };
  }

  // ── Design Doc Generator (P1 1.5) ──────────────────────────────────
  if (
    /generate\s+(?:hld|lld|design\s+doc)|create\s+(?:hld|lld|design\s+doc)|reverse.?engineer\s+design|architecture\s+doc/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    const isReverse = /reverse|from\s+code|extract\s+design/i.test(lower);
    return {
      domainType: 'design-doc-generator',
      extractedInput: {
        direction: isReverse ? 'reverse' : 'forward',
        requirements: isReverse ? undefined : message,
        sourceCode: isReverse ? (codeMatch?.[1]?.trim() || message) : codeMatch?.[1]?.trim(),
        level: /hld\s+and\s+lld|both/i.test(lower) ? 'both' : /lld/i.test(lower) ? 'lld' : 'hld',
      },
    };
  }

  // ── Performance Profiler (P1 3.4) ──────────────────────────────────
  if (
    /performance\s+profil|slow\s+endpoint|bottleneck.*performance|latency\s+analys|apm\s+data|slow\s+query.*analys/i.test(lower)
  ) {
    return {
      domainType: 'performance-profiler',
      extractedInput: {
        traceData: message,
      },
    };
  }

  // ── Dead Code Detector (P1 4.3) ────────────────────────────────────
  if (
    /dead\s+code|unused\s+(?:code|import|function|variable)|unreachable\s+code|code\s+cleanup/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    return {
      domainType: 'dead-code-detector',
      extractedInput: {
        sourceCode: codeMatch?.[1]?.trim() || message,
        language: detectLanguage(message),
      },
    };
  }

  // ── Boilerplate & Scaffolding Generator (P1 1.2) ─────────────────
  if (
    /scaffol|boilerplate|generate\s+(?:crud|endpoint|api\s+route|service|component)|new\s+(?:service|module|endpoint|component)\s+(?:for|with|that)/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    return {
      domainType: 'boilerplate-generator',
      extractedInput: {
        description: message,
        template: codeMatch?.[1]?.trim(),
        language: detectLanguage(message),
        includeTests: true,
        includeLogging: true,
      },
    };
  }

  // ── PR Review & Iteration Assistant (P1 1.3) ─────────────────────
  if (
    /review\s+(?:this\s+)?(?:pr|pull\s+request|diff|code\s+change)|pr\s+review|code\s+review|check\s+(?:this\s+)?(?:pr|diff)\s+for/i.test(lower)
  ) {
    const codeMatch = message.match(/```(?:\w+)?\s*([\s\S]+?)```/);
    const prMatch = lower.match(/#(\d+)/);
    return {
      domainType: 'pr-review-assistant',
      extractedInput: {
        diff: codeMatch?.[1]?.trim() || message,
        prNumber: prMatch ? parseInt(prMatch[1]) : undefined,
        checkFor: ['bugs', 'security', 'performance', 'style', 'test_coverage'],
      },
    };
  }

  // ── Codebase Q&A Agent (P1 4.1) ──────────────────────────────────
  if (
    /(?:how|where|what|why|explain|show\s+me)\s+.*(?:code|function|class|module|service|endpoint|logic|implemented|work|handler|controller)/i.test(lower) ||
    /understand\s+.*(?:code|codebase)|explain\s+(?:this\s+)?(?:code|function|class|method)/i.test(lower)
  ) {
    return {
      domainType: 'codebase-qa',
      extractedInput: {
        question: message,
        includeGitHistory: true,
      },
    };
  }

  // ── Pod Match / Delivery Intelligence (Sprint 5 — SE-aaS WOW) ──────────
  if (
    /(?:assign|recommend|which|best|right)\s+pod|which\s+team\s+(?:should|for)|pod\s+(?:match|recommendation|assignment)|who\s+should\s+(?:build|work|deliver)|delivery\s+intelligence|engagement\s+health|scope\s+(?:creep|drift|alert)/i.test(lower)
  ) {
    return {
      domainType: 'delivery-intelligence',
      extractedInput: {
        query: message,
        // Extract engagement ID or name if mentioned (best-effort)
        engagementName: message.match(/(?:for|on|about)\s+["']?([A-Z][A-Za-z0-9\s\-]+?)["']?\s+(?:engagement|client|project)/i)?.[1]?.trim(),
      },
    };
  }

  return null;
}

/**
 * Simple language detection from message content.
 */
function detectLanguage(message: string): string {
  const lower = message.toLowerCase();
  if (/typescript|\.ts\b/i.test(lower)) return 'typescript';
  if (/python|\.py\b/i.test(lower)) return 'python';
  if (/javascript|\.js\b/i.test(lower)) return 'javascript';
  if (/java\b/i.test(lower)) return 'java';
  if (/go\b|golang/i.test(lower)) return 'go';
  if (/rust\b|\.rs\b/i.test(lower)) return 'rust';
  if (/ruby\b|\.rb\b/i.test(lower)) return 'ruby';
  return 'typescript'; // Default
}

// ============================================================================
// AaaS (ACCOUNTING) NATURAL LANGUAGE ROUTING
// ============================================================================

/**
 * Detect if user message should route to an Accounting-aaS domain.
 *
 * ROUTING TABLE:
 *   "show P&L" / "profit and loss" / "revenue breakdown" → statement-generator
 *   "balance sheet" / "total assets" → statement-generator
 *   "reconcile" / "trial balance" → reconciler
 *   "classify accounts" / "journal entry" → bookkeeper
 *   "GST" / "tax compliance" / "IRAS" → tax-compliance
 *   "Benford" / "anomaly" / "duplicate" → anomaly-detective
 *   "audit" / "workpapers" → audit-preparer
 *   "expense analysis" / "cost breakdown" → statement-generator
 */
function detectAccountingRoute(
  message: string
): { domainType: string; extractedInput: Record<string, unknown> } | null {
  const lower = message.toLowerCase();

  // ── Financial Statements ──────────────────────────────────────────
  if (
    /p\s*&\s*l|profit\s+and\s+loss|income\s+statement|revenue\s+breakdown|revenue\s+trend|expense\s+analysis|cost\s+breakdown|margin|financial\s+statement/i.test(lower)
  ) {
    return {
      domainType: 'statement-generator',
      extractedInput: { reportType: 'profit-and-loss', question: message },
    };
  }

  // ── Balance Sheet ─────────────────────────────────────────────────
  if (
    /balance\s+sheet|total\s+assets|total\s+liabilities|equity\s+position|net\s+worth|financial\s+position/i.test(lower)
  ) {
    return {
      domainType: 'statement-generator',
      extractedInput: { reportType: 'balance-sheet', question: message },
    };
  }

  // ── Reconciliation ────────────────────────────────────────────────
  if (
    /reconcil|trial\s+balance|month.?end\s+close|completeness\s+check/i.test(lower)
  ) {
    return {
      domainType: 'reconciler',
      extractedInput: { question: message },
    };
  }

  // ── Bookkeeping / Classification ──────────────────────────────────
  if (
    /classify\s+account|journal\s+entr|double.?entry|chart\s+of\s+account|account\s+classif|bookkeep/i.test(lower)
  ) {
    return {
      domainType: 'bookkeeper',
      extractedInput: { question: message },
    };
  }

  // ── Tax Compliance ────────────────────────────────────────────────
  if (
    /\bgst\b|tax\s+compliance|iras|withholding\s+tax|tax\s+filing|tax\s+obligation|vat/i.test(lower)
  ) {
    return {
      domainType: 'tax-compliance',
      extractedInput: { question: message },
    };
  }

  // ── Anomaly Detection ─────────────────────────────────────────────
  if (
    /benford|anomal|duplicate\s+transaction|round.?number|vendor\s+concentration|suspicious\s+transaction|fraud/i.test(lower)
  ) {
    return {
      domainType: 'anomaly-detective',
      extractedInput: { question: message },
    };
  }

  // ── Audit Preparation ─────────────────────────────────────────────
  if (
    /audit\s+read|audit\s+prep|workpaper|audit\s+risk|external\s+audit|audit\s+finding/i.test(lower)
  ) {
    return {
      domainType: 'audit-preparer',
      extractedInput: { question: message },
    };
  }

  // ── Cash / Runway ─────────────────────────────────────────────────
  if (
    /cash\s+balance|runway|burn\s+rate|cash\s+flow|cash\s+position|how\s+long.*money/i.test(lower)
  ) {
    return {
      domainType: 'statement-generator',
      extractedInput: { reportType: 'cash-flow', question: message },
    };
  }

  return null;
}

// NOTE: classifyAccountForCopilot() has been removed — accounting analysis
// is now delegated to the AAS domain executor via executeAccountingAgent().

// ============================================================================
// AGENT INTENT DETECTION — "Start an OpenClaw agent to fix JIRA-1234"
// ============================================================================

/**
 * Detect if user wants to launch an agent via the Copilot.
 *
 * Trigger phrases:
 *   - "start an openclaw agent to ..."
 *   - "use agent/claw to ..."
 *   - "run an agent to fix JIRA-1234"
 *   - "create an openclaw agent and execute ..."
 *   - "openclaw: implement this fix"
 *   - "start an agent to review PR #123"
 *   - "launch agent for JIRA-1234"
 *
 * Also extracts:
 *   - Jira ID (JIRA-1234, PROJ-567)
 *   - Repo name
 *   - Branch name
 *   - Agent type (code-review, diagnose, build, test, analyze)
 */
function detectAgentIntent(
  message: string
): {
  agentType: string;
  extractedParams: {
    jiraId?: string;
    repo?: string;
    branch?: string;
    prNumber?: number;
    description?: string;
  };
} | null {
  const lower = message.toLowerCase();

  // ── Primary trigger: explicit agent invocation ────────────────
  const agentTriggers = [
    /(?:start|launch|run|create|use|spin\s+up)\s+(?:an?\s+)?(?:openclaw|agent|claw)\b/i,
    /(?:openclaw|agent|claw)\s*[:\-—]\s*/i,
    /(?:openclaw|agent|claw)\s+(?:to|for|and)\s+/i,
    /(?:start|launch|run)\s+(?:an?\s+)?(?:brain\s+)?agent\b/i,
    /create\s+(?:an?\s+)?(?:openclaw|agent|claw)\s+(?:agent\s+)?and\s+(?:execute|run)/i,
  ];

  const isAgentTriggered = agentTriggers.some(rx => rx.test(message));

  if (!isAgentTriggered) return null;

  // ── Extract parameters ────────────────────────────────────────

  // Jira ID: PROJ-123, JIRA-456, NB-789, etc.
  const jiraMatch = message.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  const jiraId = jiraMatch?.[1];

  // PR number: PR #123, pull request #456
  const prMatch = message.match(/(?:pr|pull\s+request)\s*#?(\d+)/i);
  const prNumber = prMatch ? parseInt(prMatch[1]) : undefined;

  // Repository: "on repo-name", "in my-repo", "repo product-amls"
  const repoMatch = message.match(/(?:on|in|repo|repository)\s+([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?)/i);
  const repo = repoMatch?.[1];

  // Branch: "branch release/6.3.4", "on branch main"
  const branchMatch = message.match(/branch\s+([a-zA-Z0-9_./-]+)/i);
  const branch = branchMatch?.[1];

  // ── Detect agent type from task description ──────────────────
  let agentType = "general";

  if (/review\s+(?:pr|pull|code|diff)|pr\s+review|code\s+review/i.test(lower)) {
    agentType = "code-review";
  } else if (/(?:fix|implement|build|code|develop|create\s+(?:feature|fix))/i.test(lower)) {
    agentType = "build";
  } else if (/(?:diagnose|debug|root\s+cause|incident|why\s+is)/i.test(lower)) {
    agentType = "diagnose";
  } else if (/(?:test|write\s+tests?|generate\s+tests?|tdd)/i.test(lower)) {
    agentType = "test";
  } else if (/(?:analyze|impact|blast\s+radius|assess)/i.test(lower)) {
    agentType = "analyze";
  } else if (/(?:upgrade|dependency|dependencies|outdated)/i.test(lower)) {
    agentType = "dependency-upgrade";
  } else if (/(?:performance|profil|slow|latency)/i.test(lower)) {
    agentType = "performance";
  } else if (/(?:balance\s+sheet|p\s*&\s*l|financial\s+statement|accounting|reconcil|audit|tax|gst)/i.test(lower)) {
    agentType = "analyze"; // AAAS tasks route through general analysis
  }

  // If openclaw is explicitly mentioned, tag it
  if (/openclaw|claw/i.test(lower)) {
    agentType = "openclaw";
  }

  return {
    agentType,
    extractedParams: {
      jiraId,
      repo,
      branch,
      prNumber,
      description: message,
    },
  };
}
