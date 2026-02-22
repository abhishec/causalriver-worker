/**
 * Agent Chain Executor — Dynamic Multi-Agent Orchestration
 *
 * Executes a dynamic chain of agents where each passes output to the next.
 * Supports three execution modes:
 *   - sequential: Step-by-step, output flows forward
 *   - parallel: All steps run simultaneously, results merged
 *   - pipeline: Fork input to all, stream results back
 *
 * This bridges the gap between:
 *   - Single agent execution (executeAgent)
 *   - Pre-defined workflows (workflow engine)
 *   - Dynamic runtime-composed chains (this)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeAgent } from "./execute";
import type { ExecuteAgentResult } from "./execute";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentChainStep {
  /** Agent type to execute (e.g., "code-review", "impact-analysis") */
  agentType: string;
  /** Optional prompt template — use {{previous_output}} for interpolation */
  promptTemplate?: string;
  /** How to provide input: previous agent's output, original input, or custom */
  inputMapping: "previous_output" | "original" | "custom";
  /** Custom input (used when inputMapping = "custom") */
  customInput?: string;
  /** Optional label for display */
  label?: string;
}

export interface AgentChain {
  /** Chain steps in execution order */
  steps: AgentChainStep[];
  /** Execution mode */
  mode: "sequential" | "parallel" | "pipeline";
  /** Optional name for this chain */
  name?: string;
  /** Optional final synthesis step — runs after all steps complete (for parallel mode) */
  synthesisPrompt?: string;
}

export interface AgentChainResult {
  chainId: string;
  status: "completed" | "partial" | "failed";
  mode: string;
  steps: AgentChainStepResult[];
  /** Synthesized result (for parallel mode with synthesis) */
  synthesis?: ExecuteAgentResult;
  totalDurationMs: number;
  metadata: {
    stepsCompleted: number;
    stepsFailed: number;
    totalSteps: number;
  };
}

export interface AgentChainStepResult {
  stepIndex: number;
  agentType: string;
  label?: string;
  status: "completed" | "failed" | "skipped" | "awaiting_approval";
  result?: ExecuteAgentResult;
  error?: string;
  durationMs: number;
}

export interface ChainExecutionParams {
  organizationId: string;
  userId: string;
  /** The original user input */
  originalInput: string;
  /** Optional conversation ID for tracing */
  conversationId?: string;
  /** Max depth to prevent infinite recursion */
  maxDepth?: number;
  /** Callback for step completion (for streaming progress) */
  onStepComplete?: (step: AgentChainStepResult) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CHAIN_STEPS = 5;
const MAX_CHAIN_DEPTH = 3;
const STEP_TIMEOUT_MS = 120_000; // 2 minutes per step

// ── Main Chain Executor ────────────────────────────────────────────────────

/**
 * Execute a dynamic chain of agents.
 * Each step receives context from the previous step's output.
 */
export async function executeAgentChain(
  supabase: SupabaseClient,
  chain: AgentChain,
  params: ChainExecutionParams,
): Promise<AgentChainResult> {
  const chainId = `chain_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();
  const maxDepth = params.maxDepth ?? MAX_CHAIN_DEPTH;

  // Validate chain
  if (chain.steps.length === 0) {
    return {
      chainId,
      status: "failed",
      mode: chain.mode,
      steps: [],
      totalDurationMs: 0,
      metadata: { stepsCompleted: 0, stepsFailed: 0, totalSteps: 0 },
    };
  }

  if (chain.steps.length > MAX_CHAIN_STEPS) {
    logger.error(`[ChainExecutor] Chain exceeds max steps (${chain.steps.length} > ${MAX_CHAIN_STEPS})`);
    chain.steps = chain.steps.slice(0, MAX_CHAIN_STEPS);
  }

  logger.warn(
    `[ChainExecutor] Starting chain "${chain.name || chainId}" (${chain.mode}, ${chain.steps.length} steps)`,
  );

  // Create a workflow_run record for tracking
  let workflowRunId: string | undefined;
  try {
    const { data: run } = await supabase
      .from("workflow_runs")
      .insert({
        organization_id: params.organizationId,
        workflow_id: null, // Dynamic chain, not pre-defined
        initiated_by: params.userId,
        status: "running",
        current_step: 1,
        total_steps: chain.steps.length,
        context: {
          chain_mode: chain.mode,
          chain_name: chain.name,
          original_input: params.originalInput,
        },
      })
      .select("id")
      .single();
    workflowRunId = run?.id;
  } catch {
    // Non-critical: tracking is optional
  }

  // Execute based on mode
  let result: AgentChainResult;

  switch (chain.mode) {
    case "sequential":
      result = await executeSequential(supabase, chain, params, chainId, workflowRunId);
      break;
    case "parallel":
      result = await executeParallel(supabase, chain, params, chainId, workflowRunId);
      break;
    case "pipeline":
      // Pipeline is essentially parallel without synthesis
      result = await executeParallel(supabase, chain, params, chainId, workflowRunId);
      break;
    default:
      result = await executeSequential(supabase, chain, params, chainId, workflowRunId);
  }

  result.totalDurationMs = Date.now() - startTime;

  // Update workflow run status
  if (workflowRunId) {
    try {
      await supabase
        .from("workflow_runs")
        .update({
          status: result.status === "completed" ? "completed" : "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", workflowRunId);
    } catch {
      // Non-critical
    }
  }

  // Emit RL signal for the chain
  try {
    await supabase.from("cross_domain_signals").insert({
      organization_id: params.organizationId,
      source_domain: "brain.agents",
      signal_type: "chain_completed",
      signal_value: result.status === "completed" ? 0.8 : -0.2,
      entity_type: "agent_chain",
      signal_metadata: {
        chain_id: chainId,
        mode: chain.mode,
        steps_completed: result.metadata.stepsCompleted,
        steps_failed: result.metadata.stepsFailed,
        total_steps: result.metadata.totalSteps,
        duration_ms: result.totalDurationMs,
        agent_types: chain.steps.map((s) => s.agentType),
      },
    });
  } catch {
    // Non-critical
  }

  logger.warn(
    `[ChainExecutor] Chain "${chain.name || chainId}" completed: ${result.metadata.stepsCompleted}/${result.metadata.totalSteps} steps, ${result.totalDurationMs}ms`,
  );

  return result;
}

// ── Sequential Execution ───────────────────────────────────────────────────

async function executeSequential(
  supabase: SupabaseClient,
  chain: AgentChain,
  params: ChainExecutionParams,
  chainId: string,
  workflowRunId?: string,
): Promise<AgentChainResult> {
  const stepResults: AgentChainStepResult[] = [];
  let previousOutput = "";
  let stepsCompleted = 0;
  let stepsFailed = 0;

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i];
    const stepStart = Date.now();

    try {
      // Build prompt for this step
      const prompt = buildStepPrompt(step, params.originalInput, previousOutput);

      // Execute agent
      const result = await executeAgent(supabase, {
        prompt,
        agentType: step.agentType,
        organizationId: params.organizationId,
        userId: params.userId,
        source: "workflow",
        workflowRunId,
        workflowStepOrder: i + 1,
        conversationId: params.conversationId,
        episodicContext: previousOutput ? [previousOutput] : undefined,
      });

      const stepResult: AgentChainStepResult = {
        stepIndex: i,
        agentType: step.agentType,
        label: step.label,
        status: result.status,
        result,
        durationMs: Date.now() - stepStart,
      };

      stepResults.push(stepResult);
      params.onStepComplete?.(stepResult);

      if (result.status === "completed") {
        previousOutput = result.resultSummary || "";
        stepsCompleted++;
      } else if (result.status === "awaiting_approval") {
        // Chain pauses at approval — remaining steps are skipped
        for (let j = i + 1; j < chain.steps.length; j++) {
          stepResults.push({
            stepIndex: j,
            agentType: chain.steps[j].agentType,
            label: chain.steps[j].label,
            status: "skipped",
            durationMs: 0,
          });
        }
        break;
      } else {
        stepsFailed++;
        // On failure, skip remaining steps
        for (let j = i + 1; j < chain.steps.length; j++) {
          stepResults.push({
            stepIndex: j,
            agentType: chain.steps[j].agentType,
            label: chain.steps[j].label,
            status: "skipped",
            durationMs: 0,
          });
        }
        break;
      }
    } catch (err) {
      stepsFailed++;
      stepResults.push({
        stepIndex: i,
        agentType: step.agentType,
        label: step.label,
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error",
        durationMs: Date.now() - stepStart,
      });
      break;
    }
  }

  return {
    chainId,
    status: stepsFailed === 0 ? "completed" : stepsCompleted > 0 ? "partial" : "failed",
    mode: "sequential",
    steps: stepResults,
    totalDurationMs: 0,
    metadata: {
      stepsCompleted,
      stepsFailed,
      totalSteps: chain.steps.length,
    },
  };
}

// ── Parallel Execution ─────────────────────────────────────────────────────

async function executeParallel(
  supabase: SupabaseClient,
  chain: AgentChain,
  params: ChainExecutionParams,
  chainId: string,
  workflowRunId?: string,
): Promise<AgentChainResult> {
  // Execute all steps simultaneously
  const stepPromises = chain.steps.map(async (step, i) => {
    const stepStart = Date.now();
    try {
      const prompt = buildStepPrompt(step, params.originalInput, "");

      const result = await executeAgent(supabase, {
        prompt,
        agentType: step.agentType,
        organizationId: params.organizationId,
        userId: params.userId,
        source: "workflow",
        workflowRunId,
        workflowStepOrder: i + 1,
        conversationId: params.conversationId,
      });

      const stepResult: AgentChainStepResult = {
        stepIndex: i,
        agentType: step.agentType,
        label: step.label,
        status: result.status,
        result,
        durationMs: Date.now() - stepStart,
      };

      params.onStepComplete?.(stepResult);
      return stepResult;
    } catch (err) {
      return {
        stepIndex: i,
        agentType: step.agentType,
        label: step.label,
        status: "failed" as const,
        error: err instanceof Error ? err.message : "Unknown error",
        durationMs: Date.now() - stepStart,
      };
    }
  });

  const stepResults = await Promise.all(stepPromises);
  const stepsCompleted = stepResults.filter((s) => s.status === "completed").length;
  const stepsFailed = stepResults.filter((s) => s.status === "failed").length;

  // Optional synthesis step — merge results from all parallel steps
  let synthesis: ExecuteAgentResult | undefined;
  if (chain.synthesisPrompt && stepsCompleted > 0) {
    try {
      const mergedOutputs = stepResults
        .filter((s) => s.result?.resultSummary)
        .map((s) => `[${s.agentType}]: ${s.result!.resultSummary}`)
        .join("\n\n");

      const synthPrompt = chain.synthesisPrompt.replace("{{merged_results}}", mergedOutputs);

      synthesis = await executeAgent(supabase, {
        prompt: synthPrompt,
        agentType: "general",
        organizationId: params.organizationId,
        userId: params.userId,
        source: "workflow",
        workflowRunId,
        conversationId: params.conversationId,
        episodicContext: [mergedOutputs],
      });
    } catch (err) {
      logger.error("[ChainExecutor] Synthesis step failed:", err);
    }
  }

  return {
    chainId,
    status: stepsFailed === 0 ? "completed" : stepsCompleted > 0 ? "partial" : "failed",
    mode: chain.mode,
    steps: stepResults,
    synthesis,
    totalDurationMs: 0,
    metadata: {
      stepsCompleted,
      stepsFailed,
      totalSteps: chain.steps.length,
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildStepPrompt(step: AgentChainStep, originalInput: string, previousOutput: string): string {
  if (step.promptTemplate) {
    return step.promptTemplate
      .replace(/\{\{previous_output\}\}/g, previousOutput)
      .replace(/\{\{original_input\}\}/g, originalInput);
  }

  switch (step.inputMapping) {
    case "previous_output":
      return previousOutput
        ? `Based on the previous analysis:\n\n${previousOutput}\n\nPlease continue with: ${originalInput}`
        : originalInput;
    case "original":
      return originalInput;
    case "custom":
      return step.customInput || originalInput;
    default:
      return originalInput;
  }
}
