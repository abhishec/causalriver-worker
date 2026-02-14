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

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

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
