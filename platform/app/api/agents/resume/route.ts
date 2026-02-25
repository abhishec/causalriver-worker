/**
 * Agent Resume API — Resume failed/interrupted agent from last checkpoint
 * ======================================================================
 *
 * POST /api/agents/resume
 *   Body: { taskId: string }
 *
 *   Loads the latest checkpoint for the given task, deserializes the agent
 *   state, and re-runs the agent from that checkpoint step onward.
 *
 *   Flow:
 *     1. Validate task exists and is in a resumable state (failed)
 *     2. Load latest checkpoint from agent_checkpoints
 *     3. Update task status to "running"
 *     4. Resume execution from checkpoint step
 *     5. Continue writing steps + checkpoints from resume point
 *
 *   Returns: { taskId, status, resumedFromStep }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CORE_WORKSPACE_ID } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    const { taskId } = body;

    if (!taskId || typeof taskId !== "string") {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    // ── Load task & verify membership ────────────────────────────
    const service = await createServiceClient();

    // Get user's org memberships
    const { data: memberships } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id);

    const memberOrgIds = (memberships || []).map((m) => m.organization_id);

    if (memberOrgIds.length === 0) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const { data: task } = await service
      .from("brain_agent_tasks")
      .select("id, organization_id, status, prompt, agent_type, auto_execute_threshold, created_by")
      .eq("id", taskId)
      .in("organization_id", memberOrgIds)
      .single();

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Only resume failed tasks
    if (task.status !== "failed") {
      return NextResponse.json(
        { error: `Task is "${task.status}" — only failed tasks can be resumed` },
        { status: 400 }
      );
    }

    // ── Load latest checkpoint ───────────────────────────────────
    const { data: checkpoint } = await service
      .from("agent_checkpoints")
      .select("*")
      .eq("task_id", taskId)
      .order("step_number", { ascending: false })
      .limit(1)
      .single();

    if (!checkpoint) {
      return NextResponse.json(
        { error: "No checkpoint found — task cannot be resumed (must restart)" },
        { status: 404 }
      );
    }

    const resumeFromStep = checkpoint.step_number;
    const checkpointState = checkpoint.agent_state as Record<string, unknown>;

    // ── Update task status to running ────────────────────────────
    await service
      .from("brain_agent_tasks")
      .update({
        status: "running",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    // ── Record resume step ───────────────────────────────────────
    await service.from("brain_agent_steps").insert({
      task_id: taskId,
      step_number: resumeFromStep + 1,
      step_type: "system",
      title: `Resumed from checkpoint (step ${resumeFromStep})`,
      content: `Checkpoint type: ${checkpoint.checkpoint_type}, Phase: ${checkpointState.phase || "unknown"}`,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: 0,
    });

    // ── Re-run from checkpoint ───────────────────────────────────
    // Determine which phase we're resuming from and what work remains
    const phase = checkpointState.phase as string || "";
    const AGENT_TIMEOUT_MS = 90_000;

    try {
      await Promise.race([
        resumeAgentExecution(
          service,
          task,
          checkpoint,
          user.id
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Resumed agent timed out (90s)")), AGENT_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      logger.error(`[AgentResume] Task ${taskId} failed again:`, err);
      await service
        .from("brain_agent_tasks")
        .update({
          status: "failed",
          error_message: `Resume failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);
    }

    // Re-read final status
    const { data: finalTask } = await service
      .from("brain_agent_tasks")
      .select("status")
      .eq("id", taskId)
      .single();

    return NextResponse.json({
      success: true,
      taskId,
      status: finalTask?.status || "running",
      resumedFromStep: resumeFromStep,
      checkpointPhase: phase,
      message: `Agent resumed from step ${resumeFromStep} (${phase}). GET /api/agents/tasks?taskId=${taskId}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("[AgentResume] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================================
// RESUME EXECUTION — Re-run agent from checkpoint state
// ============================================================================

async function resumeAgentExecution(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  task: {
    id: string;
    organization_id: string;
    prompt: string;
    agent_type: string;
    auto_execute_threshold: number;
    created_by: string;
  },
  checkpoint: {
    step_number: number;
    checkpoint_type: string;
    agent_state: unknown;
  },
  userId: string
): Promise<void> {
  const startTime = Date.now();
  const taskId = task.id;
  const workspaceId = task.organization_id;
  const state = checkpoint.agent_state as Record<string, unknown>;
  const phase = (state.phase as string) || "";

  // Determine resume point based on checkpoint phase
  // Phases in order: brain_context_loaded → jira_context_loaded → brain_runtime_complete
  const needsBrainCycle = phase !== "brain_runtime_complete";

  const nextStep = checkpoint.step_number + 2; // +1 was the "resumed" step, +2 is the next real step

  if (needsBrainCycle) {
    // Re-run the full L1-L30 brain cycle
    await addStep(supabase, taskId, nextStep, "reasoning", "Resuming L1-L30 brain cycle",
      `Resumed from step ${checkpoint.step_number} (${phase}). Re-running brain cognitive stack...`);

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
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const dt = createDomainTaxonomy();
    const eg = createCrossSystemEntityGraph();
    const cs = createCognitiveStack({ organizationId: workspaceId, anthropicApiKey: apiKey });
    const dl = createDeepLayers({ organizationId: workspaceId, domainTaxonomy: dt, entityGraph: eg });
    const dp = createDeepPipeline({ organizationId: workspaceId, supabase, cognitiveStack: cs, deepLayers: dl, domainTaxonomy: dt, entityGraph: eg });
    const cortex = createNeuralCortexController({ organizationId: workspaceId, supabase, pipeline: dp, cognitiveStack: cs, deepLayers: dl });
    const closedLoop = cortex.getClosedLoopEngine();

    const brainRuntime = createBrainAgentRuntime({
      supabase,
      organizationId: workspaceId,
      cortex,
      closedLoop: closedLoop ?? undefined,
      defaultAnthropicApiKey: apiKey,
      verbose: false,
    });

    registerAllBrainAgents(brainRuntime);

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
    const brainAgentId = AGENT_TYPE_MAP[task.agent_type] || "codebase-mapper";

    const brainResult = await brainRuntime.execute({
      agentId: brainAgentId,
      input: {
        prompt: task.prompt.trim(),
        agentType: task.agent_type,
        taskId,
        resumedFrom: checkpoint.step_number,
      },
      anthropicApiKey: apiKey,
      confidenceThreshold: task.auto_execute_threshold,
      userId,
      userQuery: task.prompt.trim(),
    });

    const durationMs = Date.now() - startTime;

    await addStep(supabase, taskId, nextStep + 1, "reasoning", "Brain cycle complete (resumed)",
      `Confidence: ${(brainResult.confidence * 100).toFixed(0)}%, Model: ${brainResult.metrics.model}, Duration: ${durationMs}ms`);

    // Save checkpoint at this point
    await supabase.from("agent_checkpoints").upsert({
      task_id: taskId,
      step_number: nextStep + 1,
      checkpoint_type: "post_action",
      agent_state: {
        phase: "brain_runtime_complete",
        confidence: brainResult.confidence,
        model: brainResult.metrics.model,
        tokensUsed: brainResult.metrics.tokensUsed,
        resumedFrom: checkpoint.step_number,
      },
    }, { onConflict: "task_id,step_number" }).then(() => {}, () => {});

    // Extract response
    const responseText = brainResult.agentOutput.rawResponse
      ? String(brainResult.agentOutput.rawResponse)
      : JSON.stringify(brainResult.agentOutput, null, 2);

    // Build artifacts
    const artifacts = [{
      id: `agent_${taskId.slice(0, 8)}_analysis`,
      type: "analysis",
      title: `Agent Analysis (Resumed): ${task.prompt.slice(0, 50)}`,
      language: "markdown",
      content: responseText,
      createdAt: Date.now(),
    }];

    const finalStatus = brainResult.status === "auto-executed" ? "completed" : "awaiting_approval";

    await supabase
      .from("brain_agent_tasks")
      .update({
        status: finalStatus,
        confidence_score: brainResult.confidence,
        result_summary: responseText.slice(0, 500),
        result_artifacts: artifacts,
        result_metadata: {
          tokensUsed: brainResult.metrics.tokensUsed,
          durationMs,
          model: brainResult.metrics.model,
          autoExecuted: brainResult.status === "auto-executed",
          resumed: true,
          resumedFromStep: checkpoint.step_number,
        },
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    // Store episodic memory for future runs
    await storeEpisodicMemory(supabase, workspaceId, task.agent_type, taskId, task.prompt, responseText, brainResult.confidence);

    // Learning signal
    await supabase.from("cross_domain_signals").insert({
      organization_id: workspaceId,
      source_domain: "brain.agents",
      signal_type: `agent_${task.agent_type}_resumed_completed`,
      signal_value: brainResult.confidence,
      entity_type: "brain_agent_task",
      entity_id: taskId,
      signal_metadata: {
        prompt: task.prompt.slice(0, 200),
        resumedFromStep: checkpoint.step_number,
        durationMs,
        userId,
      },
    }).then(() => {}, () => {});

  } else {
    // Checkpoint was post_action (brain cycle already done) — just mark as completed
    // The brain result was already generated; we just need to finalize
    await addStep(supabase, taskId, nextStep, "action", "Finalizing from checkpoint",
      `Brain cycle was already complete at step ${checkpoint.step_number}. Marking task as completed.`);

    await supabase
      .from("brain_agent_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
  }
}

// ============================================================================
// EPISODIC MEMORY — Store run summary for agent continuity
// ============================================================================

async function storeEpisodicMemory(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  workspaceId: string,
  agentType: string,
  taskId: string,
  prompt: string,
  responseText: string,
  confidence: number
): Promise<void> {
  // Compose a concise run summary
  const summary = `Task: ${prompt.slice(0, 200)}. ` +
    `Outcome: ${confidence >= 0.8 ? "auto-executed" : "awaiting approval"} ` +
    `(${(confidence * 100).toFixed(0)}% confidence). ` +
    `Key findings: ${responseText.slice(0, 300)}`;

  await supabase.from("agent_episodic_memory").insert({
    organization_id: workspaceId,
    agent_type: agentType,
    episode_type: "run_summary",
    content: summary,
    importance: Math.min(0.5 + confidence * 0.3, 0.9),
    metadata: {
      taskId,
      prompt: prompt.slice(0, 200),
      confidence,
      completedAt: new Date().toISOString(),
    },
  }).then(() => {}, () => {
    // Non-fatal: episodic memory is best-effort
  });
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
