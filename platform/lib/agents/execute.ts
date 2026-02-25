/**
 * Shared Agent Execution — Full L1-L30 Brain Stack
 * =================================================
 *
 * Extracted from /api/agents/run/route.ts so that BOTH the API route
 * and the Workflow Engine can call the same execution path.
 *
 * Every invocation runs:
 *   1. createCognitiveStack()         — L3-L15 (dreaming, memory, curiosity)
 *   2. createDeepLayers()             — L16-L30 (org topology, wisdom)
 *   3. createDeepPipeline()           — Orchestrates L1-L30 with reverse feedback
 *   4. createNeuralCortexController() — Executive function + RL + closed-loop
 *   5. createBrainAgentRuntime()      — Claude call with full 30-layer context
 *
 * Semi-autonomous logic:
 *   - confidence >= threshold → auto-execute, return results
 *   - confidence < threshold  → pause, ask user for approval
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Agent Type → Brain Agent ID Mapping ─────────────────────────────────────

export const AGENT_TYPE_TO_BRAIN_AGENT: Record<string, string> = {
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

// ── Types ───────────────────────────────────────────────────────────────────

export interface ExecuteAgentParams {
  /** What to do — the prompt for the agent */
  prompt: string;
  /** Agent type key (e.g. 'code-review', 'incident-diagnosis') */
  agentType: string;
  /** Organization ID (workspace) */
  organizationId: string;
  /** User who triggered the execution */
  userId: string;
  /** Confidence threshold for auto-execution (default 0.8) */
  autoExecuteThreshold?: number;
  /** Task priority */
  priority?: "low" | "medium" | "high" | "critical";
  /** If this task is part of a workflow */
  workflowRunId?: string;
  /** Step order within the workflow */
  workflowStepOrder?: number;
  /** Where this task was triggered from */
  source?: "copilot" | "studio-test" | "workflow" | "scheduled" | "api";
  /** Conversation ID for copilot link */
  conversationId?: string;
  /** Episodic context from earlier workflow steps */
  episodicContext?: string[];
}

export interface ExecuteAgentResult {
  taskId: string;
  status: "completed" | "awaiting_approval" | "failed";
  confidence?: number;
  resultSummary?: string;
  artifacts?: Array<{
    id: string;
    type: string;
    title: string;
    language: string;
    content: string;
    createdAt: number;
  }>;
  error?: string;
  durationMs?: number;
  /** Rich metadata from the brain stack — brainLayersUsed, topLayerContributions, closedLoopTrackingId etc. */
  resultMetadata?: Record<string, unknown>;
}

// ── Main Execution Function ────────────────────────────────────────────────

/**
 * Execute an agent through the full L1-L30 Brain Agent Runtime.
 *
 * Creates a brain_agent_task record, runs the full cognitive cycle,
 * handles confidence gating, emits learning signals, and stores
 * episodic memory. Returns when execution is complete.
 */
export async function executeAgent(
  supabase: SupabaseClient,
  params: ExecuteAgentParams,
): Promise<ExecuteAgentResult> {
  const {
    prompt,
    agentType,
    organizationId,
    userId,
    autoExecuteThreshold = 0.8,
    priority = "medium",
    workflowRunId,
    workflowStepOrder,
    source = "copilot",
    conversationId,
    episodicContext,
  } = params;

  const startTime = Date.now();

  // ── Create task record ───────────────────────────────────────────
  const { data: task, error: insertError } = await supabase
    .from("brain_agent_tasks")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      prompt: prompt.trim(),
      agent_type: agentType,
      auto_execute_threshold: autoExecuteThreshold,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !task) {
    logger.error("[executeAgent] Failed to create task:", insertError?.message);
    return {
      taskId: "",
      status: "failed",
      error: "Failed to create agent task",
    };
  }

  const taskId = task.id;

  // ── Run with timeout ─────────────────────────────────────────────
  const AGENT_TIMEOUT_MS = 90_000;

  try {
    await Promise.race([
      runBrainRuntime(supabase, taskId, organizationId, prompt, agentType, autoExecuteThreshold, userId, episodicContext),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Agent execution timed out (90s)")), AGENT_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    logger.error(`[executeAgent] Task ${taskId} failed:`, err);
    await supabase
      .from("brain_agent_tasks")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "Unknown error",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
  }

  // ── Read final state ─────────────────────────────────────────────
  const { data: finalTask } = await supabase
    .from("brain_agent_tasks")
    .select("status, confidence_score, result_summary, result_artifacts, error_message, result_metadata")
    .eq("id", taskId)
    .maybeSingle();

  const durationMs = Date.now() - startTime;

  return {
    taskId,
    status: (finalTask?.status || "failed") as ExecuteAgentResult["status"],
    confidence: finalTask?.confidence_score,
    resultSummary: finalTask?.result_summary,
    artifacts: finalTask?.result_artifacts,
    error: finalTask?.error_message,
    durationMs,
    resultMetadata: finalTask?.result_metadata || undefined,
  };
}

// ── L1-L30 Brain Runtime Execution ─────────────────────────────────────────

async function runBrainRuntime(
  supabase: SupabaseClient,
  taskId: string,
  workspaceId: string,
  prompt: string,
  agentType: string,
  autoExecuteThreshold: number,
  userId: string,
  externalEpisodicContext?: string[],
): Promise<void> {
  const startTime = Date.now();

  // ── Step 1: Record "thinking" step ─────────────────────────────
  await addStep(supabase, taskId, 1, "reasoning", "Initializing L1-L30 brain stack",
    "Instantiating cognitive stack (L3-L15), deep layers (L16-L30), neural cortex controller, and brain agent runtime...");

  // ── Step 2: Instantiate the full brain pipeline ────────────────
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
  });

  const closedLoop = cortex.getClosedLoopEngine();

  const brainRuntime = createBrainAgentRuntime({
    supabase,
    organizationId: workspaceId,
    cortex,
    closedLoop: closedLoop ?? undefined,
    defaultAnthropicApiKey: apiKey,
    verbose: process.env.NODE_ENV === "development",
  });

  registerAllBrainAgents(brainRuntime);

  await addStep(supabase, taskId, 2, "reasoning", "Brain stack initialized",
    `Cognitive stack (L3-L15), deep layers (L16-L30), neural cortex with RL + closed-loop learning, ${brainRuntime.listAgents().length} brain agents registered.`);

  // ── Step 2.5: Load episodic memories ───────────────────────────
  let episodicContext = "";

  // External episodic context from workflow steps
  if (externalEpisodicContext && externalEpisodicContext.length > 0) {
    episodicContext = "\n\n[Workflow Step Context — Previous Steps]\n" +
      externalEpisodicContext.map((ctx, i) => `- [Step ${i + 1}] ${ctx}`).join("\n");
  }

  // Agent's own episodic memory
  try {
    const { data: memories } = await supabase
      .from("agent_episodic_memory")
      .select("content, episode_type, importance, created_at")
      .eq("organization_id", workspaceId)
      .eq("agent_type", agentType)
      .order("importance", { ascending: false })
      .limit(5);

    if (memories && memories.length > 0) {
      episodicContext += "\n\n[Agent Memory — Recent Episodes]\n" +
        memories.map((m: any) =>
          `- [${m.episode_type}] ${m.content.slice(0, 200)}`
        ).join("\n");
    }
  } catch {
    // Non-fatal
  }

  // ── Step 3: Resolve brain agent ID ─────────────────────────────
  const brainAgentId = AGENT_TYPE_TO_BRAIN_AGENT[agentType] || "codebase-mapper";

  const agentDef = brainRuntime.getAgent(brainAgentId);
  if (!agentDef) {
    throw new Error(
      `Brain agent "${brainAgentId}" not found. Available: ${brainRuntime.listAgents().map(a => a.id).join(", ")}`
    );
  }

  await addStep(supabase, taskId, 3, "reasoning", `Running ${agentDef.name}`,
    `Agent: ${agentDef.id} — ${agentDef.description}\nRunning full L1-L30 cognitive cycle → Claude call with 30-layer brain context...`);

  // ── Step 4: Execute through Brain Agent Runtime ────────────────
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
  const brainLayersUsed: Record<string, number> = {};
  for (const lc of brainResult.layerContributions) {
    brainLayersUsed[`L${lc.layerId}_${lc.layerName.replace(/\s+/g, '_')}`] = lc.weight;
  }
  brainLayersUsed["_fullCycleRan"] = 1;
  brainLayersUsed["_layerCount"] = 30;

  await supabase
    .from("brain_agent_tasks")
    .update({ brain_layers_used: brainLayersUsed, updated_at: new Date().toISOString() })
    .eq("id", taskId);

  const responseText = brainResult.agentOutput.rawResponse
    ? String(brainResult.agentOutput.rawResponse)
    : JSON.stringify(brainResult.agentOutput, null, 2);

  // Extract code block artifacts
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
  const resultMetadata = {
    tokensUsed: brainResult.metrics.tokensUsed,
    costUsd,
    durationMs,
    brainLayersUsed,
    model: brainResult.metrics.model,
    autoExecuted: isAutoExecuted,
    brainCycleDurationMs: brainResult.metrics.brainCycleDurationMs,
    claudeCallDurationMs: brainResult.metrics.claudeCallDurationMs,
    compositeConfidence: confidence,
    closedLoopTrackingId: brainResult.closedLoopTrackingId,
    brainAttribution: brainResult.brainAttribution,
    topLayerContributions: brainResult.layerContributions.slice(0, 5).map(lc =>
      `L${lc.layerId} ${lc.layerName}: ${(lc.weight * 100).toFixed(0)}%`
    ),
  };

  if (isAutoExecuted) {
    await supabase
      .from("brain_agent_tasks")
      .update({
        status: "completed",
        confidence_score: confidence,
        result_summary: responseText.slice(0, 500),
        result_artifacts: artifacts,
        result_metadata: resultMetadata,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    await addStep(supabase, taskId, 5, "action", "Auto-executed (high confidence)",
      `Composite confidence ${(confidence * 100).toFixed(0)}% >= threshold ${(autoExecuteThreshold * 100).toFixed(0)}%. ` +
      `Full L1-L30 brain cycle completed. Results delivered.`);
  } else {
    await supabase
      .from("brain_agent_tasks")
      .update({
        status: "awaiting_approval",
        confidence_score: confidence,
        result_summary: responseText.slice(0, 500),
        result_artifacts: artifacts,
        result_metadata: resultMetadata,
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
      brainAgentId,
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

  // ── Step 8: Store episodic memory ──────────────────────────────
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

// ── Helper: Add step to brain_agent_steps ──────────────────────────────────

async function addStep(
  supabase: SupabaseClient,
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
