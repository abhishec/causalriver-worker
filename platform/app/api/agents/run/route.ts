/**
 * Brain Agent Run API — Full L1-L30 Cognitive Stack Execution
 * ============================================================
 *
 * POST /api/agents/run
 *   Spawn a brain agent that runs the FULL 30-layer cognitive stack.
 *   Every request triggers: L1-L30 cycle → Claude call → confidence gating.
 *
 *   Unlike the previous version which loaded flat Supabase rows into a text prompt,
 *   this version instantiates the real Brain Agent Runtime:
 *     1. createCognitiveStack()   — L3-L15 (dreaming, memory, curiosity, etc.)
 *     2. createDeepLayers()       — L16-L30 (org topology, wisdom, etc.)
 *     3. createDeepPipeline()     — Orchestrates L1-L30 with reverse feedback
 *     4. createNeuralCortexController() — Executive function + RL + closed-loop
 *     5. createBrainAgentRuntime()— Claude call with full 30-layer context
 *
 *   Semi-autonomous logic:
 *   - confidence >= threshold → auto-execute, return results
 *   - confidence < threshold  → pause, ask user for approval
 *
 *   Body: {
 *     prompt: string,          // What to do: "Diagnose why churn increased"
 *     agentType?: string,      // 'code-review' | 'incident-diagnosis' | 'feature-build' | etc.
 *     autoExecuteThreshold?: number, // Override default 0.8
 *     organizationId?: string,
 *   }
 *
 *   Returns: { taskId, status } — poll GET /api/agents/tasks?taskId=xxx for results
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CORE_WORKSPACE_ID } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 2 min for agent execution

// ============================================================================
// AGENT TYPE → BRAIN AGENT ID MAPPING
// ============================================================================

/**
 * Maps UI agent types to registered Brain Agent IDs.
 * Brain Agent IDs correspond to definitions in brain-agent-definitions.ts.
 * Unmapped types fall back to 'codebase-mapper' (general analysis).
 */
const AGENT_TYPE_TO_BRAIN_AGENT: Record<string, string> = {
  "code-review": "code-reviewer",
  "diagnose": "incident-diagnoser",
  "incident-diagnosis": "incident-diagnoser",
  "build": "feature-builder",
  "feature-build": "feature-builder",
  "tech-debt": "tech-debt-auditor",
  "tech-debt-audit": "tech-debt-auditor",
  "dependency-upgrade": "dependency-upgrader",
  "performance": "performance-profiler",
  "dead-code": "dead-code-detector",
  "tdd": "tdd-generator",
  "test": "test-case-generator",
  "test-case": "test-case-generator",
  "log-analysis": "log-analyzer",
  "analyze": "impact-analyzer",
  "impact-analysis": "impact-analyzer",
  "sql-optimize": "sql-optimizer",
  "data-lineage": "data-lineage-tracer",
  "architecture": "hld-lld-generator",
  "hld-lld": "hld-lld-generator",
  "codebase": "codebase-mapper",
  "general": "codebase-mapper",
  "investigate": "codebase-mapper",
  "predict": "impact-analyzer",
};

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      prompt,
      agentType = "general",
      autoExecuteThreshold = 0.8,
      organizationId,
    } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return NextResponse.json(
        { error: "prompt is required (min 3 characters)" },
        { status: 400 }
      );
    }

    // ── Resolve org ──────────────────────────────────────────────
    let workspaceId = organizationId;
    if (!workspaceId) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .single();
      workspaceId = membership?.organization_id || CORE_WORKSPACE_ID;
    }

    // Verify membership
    const { data: memberCheck } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 }
      );
    }

    // ── Create task record ───────────────────────────────────────
    const service = await createServiceClient();

    const { data: task, error: insertError } = await service
      .from("brain_agent_tasks")
      .insert({
        organization_id: workspaceId,
        created_by: user.id,
        prompt: prompt.trim(),
        agent_type: agentType,
        auto_execute_threshold: autoExecuteThreshold,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !task) {
      logger.error("[AgentRun] Failed to create task:", insertError?.message);
      return NextResponse.json(
        { error: "Failed to create agent task" },
        { status: 500 }
      );
    }

    const taskId = task.id;

    // ── Execute agent with timeout safety ─────────────────────────
    // Run inline (NOT fire-and-forget) — Next.js serverless kills detached
    // promises after response is sent. We await with a hard 90s timeout
    // so the task ALWAYS reaches a terminal state (completed/failed).
    const AGENT_TIMEOUT_MS = 90_000;

    try {
      await Promise.race([
        executeAgentWithBrainRuntime(service, taskId, workspaceId, prompt, agentType, autoExecuteThreshold, user.id),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Agent execution timed out (90s)")), AGENT_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      logger.error(`[AgentRun] Task ${taskId} failed:`, err);
      // Ensure task reaches terminal state — never orphaned as "running"
      await service
        .from("brain_agent_tasks")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Unknown error",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);
    }

    // Re-read final status to return to client
    const { data: finalTask } = await service
      .from("brain_agent_tasks")
      .select("status")
      .eq("id", taskId)
      .single();

    return NextResponse.json({
      success: true,
      taskId,
      status: finalTask?.status || "completed",
      message: "Agent task finished. GET /api/agents/tasks?taskId=" + taskId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[AgentRun] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// FULL L1-L30 BRAIN AGENT EXECUTION
// ============================================================================

/**
 * Execute an agent through the FULL Brain Agent Runtime.
 *
 * This is THE critical fix from the CTO audit (Gap #1):
 *   BEFORE: 6 flat Supabase queries → text prompt → Claude call
 *   AFTER:  Full L1-L30 cognitive cycle → 30-layer context → Claude call
 *           + composite confidence (L6 calibration + L11 red team + history)
 *           + closed-loop learning (outcome tracking for brain evolution)
 *           + RL feedback (5 neurotransmitter types, credit assignment)
 *
 * Steps:
 *  1. Instantiate the full brain stack (cognitive, deep, pipeline, cortex, runtime)
 *  2. Register all 15 brain agent definitions
 *  3. Run the brain agent runtime → full L1-L30 cycle → Claude → confidence gate
 *  4. Map results back to brain_agent_tasks table (preserve UI contract)
 *  5. Emit learning signal for closed-loop evolution
 */
async function executeAgentWithBrainRuntime(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  taskId: string,
  workspaceId: string,
  prompt: string,
  agentType: string,
  autoExecuteThreshold: number,
  userId: string
): Promise<void> {
  const startTime = Date.now();

  // ── Step 1: Record "thinking" step ─────────────────────────────
  await addStep(supabase, taskId, 1, "reasoning", "Initializing L1-L30 brain stack",
    "Instantiating cognitive stack (L3-L15), deep layers (L16-L30), neural cortex controller, and brain agent runtime...");

  // ── Step 2: Instantiate the full brain pipeline ────────────────
  // Dynamic import to avoid cold-start overhead when SDK isn't needed
  const {
    createCognitiveStack,
    createDeepLayers,
    createDeepPipeline,
    createNeuralCortexController,
    createBrainAgentRuntime,
    registerAllBrainAgents,
    createDomainTaxonomy,
    createCrossSystemEntityGraph,
  } = await import("@nexus-ai/memory-stack");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  // Instantiate all brain subsystems
  const domainTaxonomy = createDomainTaxonomy();
  const entityGraph = createCrossSystemEntityGraph();

  const cognitiveStack = createCognitiveStack({
    organizationId: workspaceId,
    anthropicApiKey: apiKey,
  });

  const deepLayers = createDeepLayers({
    organizationId: workspaceId,
    domainTaxonomy,
    entityGraph,
  });

  const pipeline = createDeepPipeline({
    organizationId: workspaceId,
    supabase,
    cognitiveStack,
    deepLayers,
    domainTaxonomy,
    entityGraph,
  });

  const cortex = createNeuralCortexController({
    organizationId: workspaceId,
    supabase,
    pipeline,
    cognitiveStack,
    deepLayers,
    // RL + closed-loop enabled by default (not disabled)
  });

  // Get the closed-loop engine from cortex (for outcome tracking)
  const closedLoop = cortex.getClosedLoopEngine();

  const brainRuntime = createBrainAgentRuntime({
    supabase,
    organizationId: workspaceId,
    cortex,
    closedLoop: closedLoop ?? undefined,
    defaultAnthropicApiKey: apiKey,
    verbose: process.env.NODE_ENV === "development",
  });

  // Register all 15 brain agent definitions
  registerAllBrainAgents(brainRuntime);

  await addStep(supabase, taskId, 2, "reasoning", "Brain stack initialized",
    `Cognitive stack (L3-L15), deep layers (L16-L30), neural cortex with RL + closed-loop learning, ${brainRuntime.listAgents().length} brain agents registered.`);

  // ── Step 2.5: Load episodic memories for agent continuity (Week 5) ──
  let episodicContext = "";
  try {
    const { data: memories } = await supabase
      .from("agent_episodic_memory")
      .select("content, episode_type, importance, created_at")
      .eq("organization_id", workspaceId)
      .eq("agent_type", agentType)
      .order("importance", { ascending: false })
      .limit(5);

    if (memories && memories.length > 0) {
      episodicContext = "\n\n[Agent Memory — Recent Episodes]\n" +
        memories.map((m: any) =>
          `- [${m.episode_type}] ${m.content.slice(0, 200)}`
        ).join("\n");
    }
  } catch {
    // Non-fatal: episodic memory not available
  }

  // ── Step 3: Resolve the brain agent ID ─────────────────────────
  const brainAgentId = AGENT_TYPE_TO_BRAIN_AGENT[agentType] || "codebase-mapper";

  // Verify the agent exists
  const agentDef = brainRuntime.getAgent(brainAgentId);
  if (!agentDef) {
    throw new Error(
      `Brain agent "${brainAgentId}" not found. Available: ${brainRuntime.listAgents().map(a => a.id).join(", ")}`
    );
  }

  await addStep(supabase, taskId, 3, "reasoning", `Running ${agentDef.name}`,
    `Agent: ${agentDef.id} — ${agentDef.description}\nRunning full L1-L30 cognitive cycle → Claude call with 30-layer brain context...`);

  // ── Step 4: Execute through Brain Agent Runtime ────────────────
  // This is THE key call: full L1-L30 cycle → format 30 layers → Claude → confidence gate
  const agentPrompt = episodicContext
    ? `${prompt.trim()}${episodicContext}`
    : prompt.trim();

  const brainResult = await brainRuntime.execute({
    agentId: brainAgentId,
    input: {
      prompt: agentPrompt,
      agentType,
      taskId,
    },
    anthropicApiKey: apiKey,
    confidenceThreshold: autoExecuteThreshold,
    userId,
    userQuery: prompt.trim(),
  });

  const durationMs = Date.now() - startTime;

  // ── Step 5: Map brain result to task record ────────────────────
  // Build layer usage tracking (which layers contributed)
  const brainLayersUsed: Record<string, number> = {};
  for (const lc of brainResult.layerContributions) {
    brainLayersUsed[`L${lc.layerId}_${lc.layerName.replace(/\s+/g, '_')}`] = lc.weight;
  }
  // Always mark all 30 layers as used (since full cycle runs all)
  brainLayersUsed["_fullCycleRan"] = 1;
  brainLayersUsed["_layerCount"] = 30;

  await supabase
    .from("brain_agent_tasks")
    .update({ brain_layers_used: brainLayersUsed, updated_at: new Date().toISOString() })
    .eq("id", taskId);

  // Extract response text for artifacts
  const responseText = brainResult.agentOutput.rawResponse
    ? String(brainResult.agentOutput.rawResponse)
    : JSON.stringify(brainResult.agentOutput, null, 2);

  // Extract code blocks as artifacts
  const artifacts: Array<{
    id: string;
    type: string;
    title: string;
    language: string;
    content: string;
    createdAt: number;
  }> = [];

  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let match;
  let artifactIndex = 0;
  while ((match = codeBlockRegex.exec(responseText)) !== null) {
    const lang = match[1] || "text";
    const code = match[2].trim();
    if (code.split("\n").length >= 2) {
      artifactIndex++;
      artifacts.push({
        id: `agent_${taskId.slice(0, 8)}_${artifactIndex}`,
        type: "code",
        title: `Agent Output ${artifactIndex} (${lang})`,
        language: lang,
        content: code,
        createdAt: Date.now(),
      });
    }
  }

  // Analysis artifact
  artifacts.unshift({
    id: `agent_${taskId.slice(0, 8)}_analysis`,
    type: "analysis",
    title: `Agent Analysis: ${prompt.slice(0, 50)}${prompt.length > 50 ? "..." : ""}`,
    language: "markdown",
    content: responseText,
    createdAt: Date.now(),
  });

  const confidence = brainResult.confidence;
  const costUsd = brainResult.metrics.tokensUsed * 0.000003;

  await addStep(supabase, taskId, 4, "artifact", "Results generated (full L1-L30)",
    `${artifacts.length} artifact(s). Composite confidence: ${(confidence * 100).toFixed(0)}% ` +
    `(Claude×0.40 + L6-calibration×0.15 + L11-robustness×0.20 + history×0.25). ` +
    `Brain cycle: ${brainResult.metrics.brainCycleDurationMs}ms, Claude: ${brainResult.metrics.claudeCallDurationMs}ms.`);

  // ── Step 6: Handle brain result status ─────────────────────────
  if (brainResult.status === "failed") {
    throw new Error(brainResult.error || "Brain agent execution failed");
  }

  const isAutoExecuted = brainResult.status === "auto-executed";

  if (isAutoExecuted) {
    await supabase
      .from("brain_agent_tasks")
      .update({
        status: "completed",
        confidence_score: confidence,
        result_summary: responseText.slice(0, 500),
        result_artifacts: artifacts,
        result_metadata: {
          tokensUsed: brainResult.metrics.tokensUsed,
          costUsd,
          durationMs,
          brainLayersUsed,
          model: brainResult.metrics.model,
          autoExecuted: true,
          brainCycleDurationMs: brainResult.metrics.brainCycleDurationMs,
          claudeCallDurationMs: brainResult.metrics.claudeCallDurationMs,
          compositeConfidence: confidence,
          closedLoopTrackingId: brainResult.closedLoopTrackingId,
          brainAttribution: brainResult.brainAttribution,
          topLayerContributions: brainResult.layerContributions.slice(0, 5).map(lc =>
            `L${lc.layerId} ${lc.layerName}: ${(lc.weight * 100).toFixed(0)}%`
          ),
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    await addStep(supabase, taskId, 5, "action", "Auto-executed (high confidence)",
      `Composite confidence ${(confidence * 100).toFixed(0)}% >= threshold ${(autoExecuteThreshold * 100).toFixed(0)}%. ` +
      `Full L1-L30 brain cycle completed. Results delivered.`);
  } else {
    // pending-approval
    await supabase
      .from("brain_agent_tasks")
      .update({
        status: "awaiting_approval",
        confidence_score: confidence,
        result_summary: responseText.slice(0, 500),
        result_artifacts: artifacts,
        result_metadata: {
          tokensUsed: brainResult.metrics.tokensUsed,
          costUsd,
          durationMs,
          brainLayersUsed,
          model: brainResult.metrics.model,
          autoExecuted: false,
          brainCycleDurationMs: brainResult.metrics.brainCycleDurationMs,
          claudeCallDurationMs: brainResult.metrics.claudeCallDurationMs,
          compositeConfidence: confidence,
          closedLoopTrackingId: brainResult.closedLoopTrackingId,
          brainAttribution: brainResult.brainAttribution,
          topLayerContributions: brainResult.layerContributions.slice(0, 5).map(lc =>
            `L${lc.layerId} ${lc.layerName}: ${(lc.weight * 100).toFixed(0)}%`
          ),
        },
        proposed_action: brainResult.proposedActions?.length
          ? {
              actionType: agentType,
              description: `Agent completed analysis with ${(confidence * 100).toFixed(0)}% composite confidence. Review recommended.`,
              proposedActions: brainResult.proposedActions,
              impact: "Results will be added to your artifacts",
              reversible: true,
            }
          : {
              actionType: agentType,
              description: `Agent completed analysis with ${(confidence * 100).toFixed(0)}% composite confidence. Review recommended before accepting results.`,
              impact: "Results will be added to your artifacts",
              reversible: true,
            },
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    await addStep(supabase, taskId, 5, "approval_request", "Awaiting your approval",
      `Composite confidence ${(confidence * 100).toFixed(0)}% < threshold ${(autoExecuteThreshold * 100).toFixed(0)}%. ` +
      `Full L1-L30 brain cycle completed. Please review and approve/reject.`);
  }

  // ── Step 7: Emit learning signal ───────────────────────────────
  await supabase.from("cross_domain_signals").insert({
    organization_id: workspaceId,
    source_domain: "brain.agents",
    signal_type: `agent_${agentType}_completed`,
    signal_value: confidence,
    entity_type: "brain_agent_task",
    entity_id: taskId,
    signal_metadata: {
      prompt: prompt.slice(0, 200),
      brainAgentId: brainAgentId,
      autoExecuted: isAutoExecuted,
      tokensUsed: brainResult.metrics.tokensUsed,
      durationMs,
      brainCycleDurationMs: brainResult.metrics.brainCycleDurationMs,
      claudeCallDurationMs: brainResult.metrics.claudeCallDurationMs,
      artifactCount: artifacts.length,
      compositeConfidence: confidence,
      closedLoopTrackingId: brainResult.closedLoopTrackingId,
      brainLayersUsed: Object.keys(brainLayersUsed),
      topLayerContributions: brainResult.layerContributions.slice(0, 5).map(lc => lc.layerName),
      fullL1L30Cycle: true,
    },
  });

  // ── Step 8: Store episodic memory for agent continuity (Week 5) ──
  const runSummary = `Task: ${prompt.slice(0, 200)}. ` +
    `Outcome: ${isAutoExecuted ? "auto-executed" : "awaiting approval"} ` +
    `(${(confidence * 100).toFixed(0)}% confidence). ` +
    `Key findings: ${responseText.slice(0, 300)}`;

  await supabase.from("agent_episodic_memory").insert({
    organization_id: workspaceId,
    agent_type: agentType,
    episode_type: "run_summary",
    content: runSummary,
    importance: Math.min(0.5 + confidence * 0.3, 0.9),
    metadata: {
      taskId,
      prompt: prompt.slice(0, 200),
      confidence,
      completedAt: new Date().toISOString(),
    },
  }).then(() => {}, () => { /* non-blocking */ });
}

// ============================================================================
// HELPER: Add step to brain_agent_steps
// ============================================================================

async function addStep(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  taskId: string,
  stepNumber: number,
  stepType: string,
  title: string,
  content: string,
): Promise<void> {
  await supabase.from("brain_agent_steps").insert({
    task_id: taskId,
    step_number: stepNumber,
    step_type: stepType,
    title,
    content,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: 0,
  });
}
