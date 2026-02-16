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

import { CORE_ORG_ID } from "@/lib/org-helpers";

export const dynamic = 'force-dynamic';

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

  return { stream, send, sendText, sendError, close };
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
    const body = await request.json();
    const {
      message,
      organizationId,
      entityState,
      conversationHistory,
      useFramework,
      // V4: Optional persona override from frontend
      persona,
    } = body as {
      message: string;
      organizationId?: string;
      entityState?: Record<string, unknown>;
      conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
      useFramework?: boolean;
      persona?: { name: string; description: string };
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const orgId = organizationId || CORE_ORG_ID;

    // Authenticate via Supabase
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Validate user is a member of the requested org ─────────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    // Platform admins can access any org
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

    // ── Brain Commander: Unified intelligence pipeline ──────────────────
    // Replace manual DB queries with Commander — single source of truth
    // for intelligence gathering, dispatch assessment, and permission filtering.
    const { createBrainCommander } = await import("@nexus-ai/memory-stack");
    const commander = createBrainCommander({
      supabase,
      organizationId: orgId,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      enableActions: false, // We handle action engine separately below for copilot
      enableMotorCommands: false,
    });

    const commandResult = await commander.command(message, {
      userId: user.id,
      entityState,
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
        const { createCopilotInstance, extractDomains, normalizeEntityState } = await import("@nexus-ai/memory-stack");
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

        // Create the copilot instance
        const copilot = createCopilotInstance({
          adapter,
          provider: "anthropic",
          apiKey: anthropicKey,
          model: "claude-sonnet-4-5-20250929",
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

      const service = await createServiceClient();

      // Check if GitHub connector is active with ingested data
      const { data: ghConnector } = await service
        .from("org_connectors")
        .select("config")
        .eq("organization_id", orgId)
        .eq("connector_type", "github")
        .eq("status", "active")
        .maybeSingle();

      const ingestionStats = (ghConnector?.config as Record<string, any>)?.ingestion_progress?.stats;

      // Build BrainRegions — ALL available intelligence in one object
      const brainRegions: Partial<BrainRegions> = {};

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

      // ── Live Engineering Metrics for P0 Early Warning context ──────
      // Copilot needs velocity + bottleneck snapshots to answer
      // "Why is velocity dropping?" with LIVE data, not just causal edges.
      const [velocityRes, bottleneckRes, recentSignalsRes] = await Promise.all([
        service
          .from('velocity_snapshots')
          .select('*')
          .eq('organization_id', orgId)
          .order('snapshot_date', { ascending: false })
          .limit(7),
        service
          .from('bottleneck_snapshots')
          .select('*')
          .eq('organization_id', orgId)
          .order('snapshot_date', { ascending: false })
          .limit(1),
        service
          .from('cross_domain_signals')
          .select('signal_type, signal_value, signal_metadata, created_at')
          .eq('organization_id', orgId)
          .eq('source_domain', 'engineering')
          .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      const velocitySnapshots = velocityRes.data || [];
      const bottleneckSnapshot = bottleneckRes.data?.[0] || null;
      const recentSignals = recentSignalsRes.data || [];

      // Inject engineering metrics into brain regions as live signals
      (brainRegions as any).liveSignals = {
        velocitySnapshots,
        bottleneckSnapshot,
        recentSignals,
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

    // ── SE-aaS NL ROUTING ─────────────────────────────────────────────
    // Detect when user asks about SE-aaS capabilities and route to domains.
    // Routes: "analyze this SQL" → sql-analyzer, "generate test cases" → test-case-generator, etc.
    let seaasResult: Record<string, unknown> | null = null;
    const seaasRoute = detectSEaaSRoute(message);

    if (seaasRoute && process.env.ANTHROPIC_API_KEY) {
      try {
        const service = await createServiceClient();
        const { executeDomain } = await import("@/lib/se-aas/domain-executor");

        const domainResult = await executeDomain(service, {
          domainType: seaasRoute.domainType,
          request: seaasRoute.extractedInput,
          organizationId: orgId,
          userId: user.id,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        });

        seaasResult = {
          domainType: seaasRoute.domainType,
          artifactId: domainResult.artifactId,
          ...domainResult.result,
        };
      } catch (seaasErr) {
        console.warn("[SE-aaS NL] Non-fatal: domain execution failed:", seaasErr);
      }
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

    if (conversationHistory && conversationHistory.length > 0) {
      // Include last 4 exchanges for context
      const recent = conversationHistory.slice(-8);
      for (const msg of recent) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

    // ── Build effective system prompt ──────────────────────────────────
    // V4: brainContext.fullPrompt is the COMPLETE system prompt from the SDK.
    // It already includes persona, intent-aware instructions, and ALL brain data.
    const NO_HALLUCINATION_FALLBACK = `You are the NexusBrain Copilot — an intelligence co-pilot for this organization.

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
- You can still answer general questions about NexusBrain's capabilities
- NEVER fabricate numbers, metrics, or analysis — you have nothing to analyze`;
    }

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

    // ── SE-aaS domain result injection ──────────────────────────────────
    if (seaasResult) {
      const domainType = seaasResult.domainType as string;
      const resultData = seaasResult.data || seaasResult;
      effectiveSystemPrompt += `\n\n## SE-aaS DOMAIN RESULT: ${domainType.toUpperCase()} (Claude-powered analysis)
This is the result from the ${domainType} domain execution. Present this to the user with context and explanation.
Result data:
${JSON.stringify(resultData, null, 2).slice(0, 3000)}

Artifact ID: ${seaasResult.artifactId || 'N/A'}
Use this data to give a comprehensive answer. The analysis was performed by NexusBrain's AI ${domainType} engine.`;
    }

    // ── Stream via Anthropic ──────────────────────────────────────────
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const { stream, send, sendText, sendError, close } = createSSEStream();

    (async () => {
      try {
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
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 8192,
          system: effectiveSystemPrompt,
          messages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            sendText(event.delta.text);
          }
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
