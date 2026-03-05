/**
 * Workflow Execution Engine
 * =========================
 *
 * Executes workflow definitions step-by-step, supporting:
 *   - Sequential step execution
 *   - Parallel step groups (same parallel_group run simultaneously)
 *   - Input mapping between steps (previous_output, original_input, custom, merge_parallel)
 *   - Failure behaviors (stop, skip, retry_once)
 *   - Approval pausing (workflow pauses until task is approved)
 *   - Conditional branching (jump to step based on output evaluation)
 *   - Brain episodic memory continuity across steps
 *
 * Each step calls the shared executeAgent() from lib/agents/execute.ts
 * which runs the full L1-L30 brain stack.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowDefinition, WorkflowStep, WorkflowRun, WorkflowCondition } from "./types";
import { executeAgent } from "@/lib/agents/execute";
import { logger } from "@/lib/logger";

// ── Types ───────────────────────────────────────────────────────────────────

export interface WorkflowExecutionParams {
  workflow: WorkflowDefinition;
  organizationId: string;
  userId: string;
  inputPayload?: Record<string, unknown>;
  conversationId?: string;
  /** If set, resume an existing paused run instead of creating a new one.
   *  Already-completed steps will be skipped with their outputs restored. */
  resumeRunId?: string;
}

export interface WorkflowExecutionResult {
  runId: string;
  status: WorkflowRun["status"];
  completedSteps: number;
  failedSteps: number;
  durationMs: number;
}

export interface WorkflowProgressCallback {
  onStepStart?: (stepOrder: number, label: string) => void;
  onStepComplete?: (stepOrder: number, label: string, status: string) => void;
  onWorkflowPaused?: (stepOrder: number, taskId: string) => void;
}

// ── Engine ──────────────────────────────────────────────────────────────────

export async function executeWorkflow(
  supabase: SupabaseClient,
  params: WorkflowExecutionParams,
  callbacks?: WorkflowProgressCallback,
): Promise<WorkflowExecutionResult> {
  const { workflow, organizationId, userId, inputPayload, conversationId, resumeRunId } = params;
  const startTime = Date.now();

  let runId: string;
  // Set of step orders already completed (for resume support)
  const completedStepOrders = new Set<number>();

  if (resumeRunId) {
    // ── Resume existing run: load completed steps ────────────────
    runId = resumeRunId;

    const { data: completedStepRows } = await supabase
      .from("workflow_run_steps")
      .select("step_order, output_payload, status")
      .eq("workflow_run_id", runId)
      .eq("status", "completed")
      .order("step_order", { ascending: true });

    for (const row of (completedStepRows || [])) {
      completedStepOrders.add(row.step_order);
    }

    // Mark run as running — guard with .eq("status", "paused") to prevent resume race
    await supabase
      .from("workflow_runs")
      .update({ status: "running" })
      .eq("id", runId)
      .eq("status", "paused");

    logger.info(`[WorkflowEngine] Resuming run ${runId} — ${completedStepOrders.size} steps already completed`);
  } else {
    // ── Create new workflow_run record ────────────────────────────
    const { data: run, error: runError } = await supabase
      .from("workflow_runs")
      .insert({
        workflow_id: workflow.id,
        organization_id: organizationId,
        triggered_by: userId,
        trigger_source: "manual",
        status: "running",
        current_step: 0,
        total_steps: workflow.steps.length,
        input_payload: inputPayload || null,
        conversation_id: conversationId || null,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (runError || !run) {
      logger.error("[WorkflowEngine] Failed to create run:", runError?.message);
      return {
        runId: "",
        status: "failed",
        completedSteps: 0,
        failedSteps: 0,
        durationMs: Date.now() - startTime,
      };
    }

    runId = run.id;
  }

  let completedSteps = 0;
  let failedSteps = 0;
  let shouldStop = false;

  // ── Group steps by parallel_group ──────────────────────────────
  const stepGroups = groupSteps(workflow.steps);
  const episodicContext: string[] = [];
  let previousOutput: Record<string, unknown> | null = null;

  // ── For resumed runs, restore outputs from completed steps ─────
  if (completedStepOrders.size > 0) {
    const { data: completedRows } = await supabase
      .from("workflow_run_steps")
      .select("step_order, output_payload")
      .eq("workflow_run_id", runId)
      .eq("status", "completed")
      .order("step_order", { ascending: true });

    for (const row of (completedRows || [])) {
      completedSteps++;
      const output = row.output_payload as Record<string, unknown> | null;
      if (output) previousOutput = output;
      if (output?.summary) episodicContext.push(String(output.summary));
    }
  }

  // ── Build step lookup for conditional branching ─────────────────
  const stepsByOrder = new Map<number, WorkflowStep>();
  for (const s of workflow.steps) {
    stepsByOrder.set(s.order, s);
  }
  /** When set, jump to this step order instead of continuing sequentially */
  let jumpToOrder: number | null = null;

  // ── Execute each group sequentially ────────────────────────────
  for (let groupIdx = 0; groupIdx < stepGroups.length; groupIdx++) {
    const group = stepGroups[groupIdx];
    if (shouldStop) break;

    // ── Handle conditional jump: skip groups until we reach the target step ──
    if (jumpToOrder !== null) {
      const groupContainsTarget = group.some(s => s.order === jumpToOrder);
      if (!groupContainsTarget) continue; // Skip until we find the jump target
      jumpToOrder = null; // Found it — clear the jump
    }

    // Skip groups where ALL steps are already completed (resume support)
    if (group.every(step => completedStepOrders.has(step.order))) {
      continue;
    }

    // Update current step
    await supabase
      .from("workflow_runs")
      .update({ current_step: group[0].order, updated_at: new Date().toISOString() })
      .eq("id", runId);

    if (group.length === 1) {
      // ── Sequential step ────────────────────────────────────────
      const step = group[0];

      // Skip already-completed individual steps
      if (completedStepOrders.has(step.order)) continue;

      const result = await executeStep(supabase, runId, step, {
        organizationId,
        userId,
        inputPayload,
        previousOutput,
        episodicContext,
        conversationId,
        callbacks,
      });

      if (result.status === "completed") {
        completedSteps++;
        previousOutput = result.output;
        if (result.summary) episodicContext.push(result.summary);

        // ── Evaluate conditional branching after successful completion ──
        if (step.condition && result.output) {
          const condResult = evaluateCondition(step.condition, result.output);
          const targetOrder = condResult ? step.condition.trueBranch : step.condition.falseBranch;
          if (targetOrder !== undefined && targetOrder !== null) {
            jumpToOrder = targetOrder;
            // Reset groupIdx to -1 so the for-loop starts scanning from the beginning
            groupIdx = -1;
            logger.info(`[WorkflowEngine] Condition on step ${step.order}: ${condResult ? "TRUE" : "FALSE"} → jumping to step ${targetOrder}`);
            continue;
          }
          // No branch target → continue sequentially
        }
      } else if (result.status === "paused") {
        // Workflow pauses — mark and return
        await supabase
          .from("workflow_runs")
          .update({ status: "paused", current_step: step.order })
          .eq("id", runId);
        return {
          runId,
          status: "paused",
          completedSteps,
          failedSteps,
          durationMs: Date.now() - startTime,
        };
      } else {
        failedSteps++;
        if (step.failure_behavior === "stop") {
          shouldStop = true;
        }
        // skip: continue to next
      }
    } else {
      // ── Parallel group ─────────────────────────────────────────
      // Only execute steps in the group that aren't already completed
      const pendingSteps = group.filter(step => !completedStepOrders.has(step.order));

      const results = await Promise.all(
        pendingSteps.map(step =>
          executeStep(supabase, runId, step, {
            organizationId,
            userId,
            inputPayload,
            previousOutput,
            episodicContext,
            conversationId,
            callbacks,
          })
        )
      );

      // Check for paused steps
      const pausedResult = results.find(r => r.status === "paused");
      if (pausedResult) {
        await supabase
          .from("workflow_runs")
          .update({ status: "paused", current_step: group[0].order })
          .eq("id", runId);
        return {
          runId,
          status: "paused",
          completedSteps,
          failedSteps,
          durationMs: Date.now() - startTime,
        };
      }

      // Merge outputs for merge_parallel
      const mergedOutput: Record<string, unknown> = {};
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "completed") {
          completedSteps++;
          if (r.output) mergedOutput[`step_${pendingSteps[i].order}`] = r.output;
          if (r.summary) episodicContext.push(r.summary);
        } else {
          failedSteps++;
          if (pendingSteps[i].failure_behavior === "stop") shouldStop = true;
        }
      }
      previousOutput = mergedOutput;
    }
  }

  // ── Finalize ───────────────────────────────────────────────────
  const finalStatus = shouldStop ? "failed" : "completed";
  const durationMs = Date.now() - startTime;

  await supabase
    .from("workflow_runs")
    .update({
      status: finalStatus,
      current_step: workflow.steps.length,
      final_output: previousOutput,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    })
    .eq("id", runId);

  // Increment workflow run count atomically using rpc to avoid race conditions
  // Fallback: read current value then update (best-effort without custom RPC)
  try {
    const { data: currentWorkflow } = await supabase
      .from("workflows")
      .select("total_runs")
      .eq("id", workflow.id)
      .maybeSingle();

    await supabase
      .from("workflows")
      .update({
        total_runs: (currentWorkflow?.total_runs || 0) + 1,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", workflow.id);
  } catch {
    // Non-critical: run count may be slightly off under high concurrency
    logger.warn(`[WorkflowEngine] Could not increment total_runs for workflow ${workflow.id}`);
  }

  // Emit workflow-level learning signal with enriched metadata for RL
  await supabase.from("cross_domain_signals").insert({
    organization_id: organizationId,
    source_domain: "brain.workflows",
    signal_type: "workflow_completed",
    signal_value: completedSteps / Math.max(workflow.steps.length, 1),
    signal_timestamp: new Date().toISOString(),
    entity_type: "workflow_run",
    entity_id: runId,
    signal_metadata: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      completedSteps,
      failedSteps,
      totalSteps: workflow.steps.length,
      durationMs,
      status: finalStatus,
      serviceVertical: workflow.service_vertical || "general",
      successRate: completedSteps / Math.max(workflow.steps.length, 1),
      hasParallelGroups: workflow.steps.some(s => s.parallel_group),
      stepLabels: workflow.steps.map(s => s.label),
      episodicContextSize: episodicContext.length,
      triggeredBy: userId,
    },
  });

  return { runId, status: finalStatus, completedSteps, failedSteps, durationMs };
}

// ── Step Execution ──────────────────────────────────────────────────────────

interface StepContext {
  organizationId: string;
  userId: string;
  inputPayload?: Record<string, unknown> | null;
  previousOutput: Record<string, unknown> | null;
  episodicContext: string[];
  conversationId?: string;
  callbacks?: WorkflowProgressCallback;
}

interface StepResult {
  status: "completed" | "failed" | "skipped" | "paused";
  output: Record<string, unknown> | null;
  summary: string | null;
}

async function executeStep(
  supabase: SupabaseClient,
  runId: string,
  step: WorkflowStep,
  context: StepContext,
): Promise<StepResult> {
  const stepStart = Date.now();

  // Create workflow_run_steps record
  const { data: stepRecord, error: stepRecordError } = await supabase
    .from("workflow_run_steps")
    .insert({
      workflow_run_id: runId,
      step_order: step.order,
      parallel_group: step.parallel_group || null,
      agent_template_id: step.agent_template_id,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (stepRecordError || !stepRecord) {
    logger.error(`[WorkflowEngine] Failed to create step record for step ${step.order}:`, stepRecordError?.message);
    return { status: "failed", output: null, summary: `Step ${step.order} failed: could not create step record` };
  }

  try { context.callbacks?.onStepStart?.(step.order, step.label); } catch { /* non-critical */ }

  // Build input based on mapping
  let prompt: string;
  switch (step.input_mapping) {
    case "previous_output":
      prompt = context.previousOutput
        ? `Previous step output: ${JSON.stringify(context.previousOutput).slice(0, 2000)}\n\nContinue the workflow.`
        : "Start the workflow.";
      break;
    case "original_input":
      prompt = context.inputPayload
        ? JSON.stringify(context.inputPayload)
        : "Run this step.";
      break;
    case "custom":
      prompt = step.custom_prompt || "Run this step.";
      break;
    case "merge_parallel":
      prompt = context.previousOutput
        ? `Merged outputs from parallel steps: ${JSON.stringify(context.previousOutput).slice(0, 2000)}\n\nSynthesize these results.`
        : "Run this step.";
      break;
    default:
      prompt = "Run this step.";
  }

  try {
    // Load agent template for type resolution
    const { data: template } = await supabase
      .from("agent_templates")
      .select("prompt, agent_config, service, command_id")
      .eq("id", step.agent_template_id)
      .maybeSingle();

    // Resolve agent type from the template's command_id (maps to AGENT_TYPE_TO_BRAIN_AGENT)
    // Falls back to 'general' if not found
    const agentType = template?.command_id || template?.agent_config?.service_vertical || "general";
    const fullPrompt = template?.prompt
      ? `${template.prompt}\n\n${prompt}`
      : prompt;

    // Execute via shared brain stack
    const result = await executeAgent(supabase, {
      prompt: fullPrompt,
      agentType,
      organizationId: context.organizationId,
      userId: context.userId,
      autoExecuteThreshold: step.approval_required ? 1.0 : 0.8, // Force approval if required
      workflowRunId: runId,
      workflowStepOrder: step.order,
      source: "workflow",
      conversationId: context.conversationId,
      episodicContext: context.episodicContext,
    });

    const durationMs = Date.now() - stepStart;

    // Check if task is awaiting approval
    if (result.status === "awaiting_approval") {
      await supabase
        .from("workflow_run_steps")
        .update({
          brain_task_id: result.taskId,
          status: "pending",
          duration_ms: durationMs,
        })
        .eq("id", stepRecord.id);

      try { context.callbacks?.onWorkflowPaused?.(step.order, result.taskId); } catch { /* non-critical */ }

      return {
        status: "paused",
        output: null,
        summary: null,
      };
    }

    if (result.status === "failed") {
      throw new Error(result.error || "Step execution failed");
    }

    // Success — build enriched output with full brain metadata
    const meta = result.resultMetadata || {};
    const output = {
      taskId: result.taskId,
      confidence: result.confidence,
      summary: result.resultSummary?.slice(0, 500),
      artifacts: result.artifacts?.map(a => ({ id: a.id, type: a.type, title: a.title })) || [],
      durationMs,
      brainLayersUsed: meta.brainLayersUsed ? Object.keys(meta.brainLayersUsed as Record<string, unknown>) : [],
      topLayerContributions: meta.topLayerContributions || [],
      closedLoopTrackingId: meta.closedLoopTrackingId || null,
      compositeConfidence: meta.compositeConfidence || null,
    };

    await supabase
      .from("workflow_run_steps")
      .update({
        brain_task_id: result.taskId,
        status: "completed",
        output_payload: output,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq("id", stepRecord.id);

    // ── Emit per-step RL signal for cross-step learning ────────────
    try {
      await supabase.from("cross_domain_signals").insert({
        organization_id: context.organizationId,
        source_domain: "brain.workflows",
        signal_type: "workflow_step_completed",
        signal_value: result.confidence || 0.5,
        signal_timestamp: new Date().toISOString(),
        entity_type: "workflow_run_step",
        entity_id: stepRecord.id || result.taskId,
        signal_metadata: {
          workflowRunId: runId,
          stepOrder: step.order,
          stepLabel: step.label,
          agentTemplateId: step.agent_template_id,
          agentType,
          taskId: result.taskId,
          confidence: result.confidence,
          durationMs,
          artifactCount: result.artifacts?.length || 0,
          inputMapping: step.input_mapping,
          parallelGroup: step.parallel_group || null,
          previousStepOrders: context.episodicContext.length,
          isRetry: false,
          closedLoopTrackingId: meta.closedLoopTrackingId || null,
          brainLayersUsed: meta.brainLayersUsed ? Object.keys(meta.brainLayersUsed as Record<string, unknown>).filter(k => !k.startsWith("_")) : [],
          topLayerContributions: meta.topLayerContributions || [],
        },
      });
    } catch {
      // Non-critical: step signal failure shouldn't break workflow
    }

    // ── Store per-step episodic memory for workflow learning ───────
    try {
      const stepSummary = `Workflow step ${step.order} (${step.label}): ` +
        `confidence ${((result.confidence || 0) * 100).toFixed(0)}%, ` +
        `${result.artifacts?.length || 0} artifact(s). ` +
        `Findings: ${result.resultSummary?.slice(0, 200) || "completed"}`;

      await supabase.from("agent_episodic_memory").insert({
        organization_id: context.organizationId,
        agent_type: agentType,
        episode_type: "workflow_step",
        content: stepSummary,
        importance: Math.min(0.4 + (result.confidence || 0.5) * 0.3, 0.85),
        metadata: {
          workflowRunId: runId,
          stepOrder: step.order,
          stepLabel: step.label,
          taskId: result.taskId,
          confidence: result.confidence,
          completedAt: new Date().toISOString(),
        },
      });
    } catch {
      // Non-critical
    }

    try { context.callbacks?.onStepComplete?.(step.order, step.label, "completed"); } catch { /* non-critical */ }

    return {
      status: "completed",
      output,
      summary: `Step ${step.order} (${step.label}): ${result.resultSummary?.slice(0, 200) || "completed"}`,
    };
  } catch (err) {
    const durationMs = Date.now() - stepStart;
    const errMsg = err instanceof Error ? err.message : String(err);

    // Retry once if configured — make a single recursive retry attempt
    if (step.failure_behavior === "retry_once") {
      logger.warn(`[WorkflowEngine] Step ${step.order} failed, retrying once: ${errMsg}`);

      // Update step record to show retry
      await supabase
        .from("workflow_run_steps")
        .update({ error_message: `First attempt failed: ${errMsg}. Retrying...` })
        .eq("id", stepRecord.id);

      // Retry with failure_behavior changed to "stop" to prevent infinite recursion
      const retryStep = { ...step, failure_behavior: "stop" as const };
      const retryResult = await executeStep(supabase, runId, retryStep, context);

      if (retryResult.status === "completed") {
        // Retry succeeded — update original step record
        await supabase
          .from("workflow_run_steps")
          .update({
            status: "completed",
            error_message: `Retried after: ${errMsg}`,
            output_payload: retryResult.output,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - stepStart,
          })
          .eq("id", stepRecord.id);

        return retryResult;
      }
      // Retry also failed — fall through to normal failure handling
      logger.warn(`[WorkflowEngine] Step ${step.order} retry also failed`);
    }

    const finalDurationMs = Date.now() - stepStart;
    const finalStatus = step.failure_behavior === "skip" ? "skipped" : "failed";

    await supabase
      .from("workflow_run_steps")
      .update({
        status: finalStatus,
        error_message: errMsg,
        completed_at: new Date().toISOString(),
        duration_ms: finalDurationMs,
      })
      .eq("id", stepRecord.id);

    // ── Emit per-step RL signal for failure learning ──────────────
    try {
      await supabase.from("cross_domain_signals").insert({
        organization_id: context.organizationId,
        source_domain: "brain.workflows",
        signal_type: "workflow_step_failed",
        signal_value: -0.5,
        signal_timestamp: new Date().toISOString(),
        entity_type: "workflow_run_step",
        entity_id: stepRecord.id || runId,
        signal_metadata: {
          workflowRunId: runId,
          stepOrder: step.order,
          stepLabel: step.label,
          agentTemplateId: step.agent_template_id,
          errorMessage: errMsg.slice(0, 300),
          failureBehavior: step.failure_behavior,
          finalStatus,
          durationMs: finalDurationMs,
          inputMapping: step.input_mapping,
          parallelGroup: step.parallel_group || null,
          wasRetry: step.failure_behavior === "retry_once",
        },
      });
    } catch {
      // Non-critical
    }

    try { context.callbacks?.onStepComplete?.(step.order, step.label, "failed"); } catch { /* non-critical */ }

    return {
      status: finalStatus,
      output: null,
      summary: `Step ${step.order} (${step.label}): FAILED — ${errMsg}`,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Group steps by parallel_group. Steps without a group are their own group.
 * Groups are ordered by the minimum step order in each group.
 */
function groupSteps(steps: WorkflowStep[]): WorkflowStep[][] {
  const groups = new Map<string, WorkflowStep[]>();
  let seqCounter = 0;

  for (const step of steps.sort((a, b) => a.order - b.order)) {
    const key = step.parallel_group || `_seq_${seqCounter++}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(step);
  }

  return Array.from(groups.values()).sort(
    (a, b) => Math.min(...a.map(s => s.order)) - Math.min(...b.map(s => s.order))
  );
}

// ── Condition Evaluator ──────────────────────────────────────────────────────

/**
 * Evaluate a workflow condition against step output.
 *
 * Supports four condition types:
 *   - confidence_threshold: checks output.confidence > value
 *   - status_check: checks output.status === value
 *   - data_exists: checks if a field is non-null/non-empty
 *   - custom_expression: evaluates a safe JavaScript-like expression
 *
 * Returns true/false. Returns false on any evaluation error (fail-safe).
 */
function evaluateCondition(
  condition: WorkflowCondition,
  output: Record<string, unknown>,
): boolean {
  try {
    switch (condition.type) {
      case "confidence_threshold": {
        const field = condition.field || "confidence";
        const value = getNestedField(output, field);
        if (value === undefined || value === null) return false;
        return compareValues(Number(value), condition.operator || ">", Number(condition.value ?? 0));
      }

      case "status_check": {
        const field = condition.field || "status";
        const value = getNestedField(output, field);
        if (value === undefined || value === null) return false;
        return compareValues(String(value), condition.operator || "==", String(condition.value ?? ""));
      }

      case "data_exists": {
        const field = condition.field || "";
        if (!field) return false;
        const value = getNestedField(output, field);
        if (value === undefined || value === null) return false;
        if (typeof value === "string" && value.trim() === "") return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      }

      case "custom_expression": {
        if (!condition.expression) return false;
        return evaluateExpression(condition.expression, output);
      }

      default:
        return false;
    }
  } catch (err) {
    logger.warn("[WorkflowEngine] Condition evaluation error:", err);
    return false;
  }
}

/**
 * Safely access nested object fields using dot notation.
 * e.g., "artifacts.0.type" → output.artifacts[0].type
 */
function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Compare two values using the given operator.
 */
function compareValues(
  left: string | number | boolean,
  operator: string,
  right: string | number | boolean,
): boolean {
  switch (operator) {
    case ">": return left > right;
    case ">=": return left >= right;
    case "<": return left < right;
    case "<=": return left <= right;
    case "==": return String(left) === String(right);
    case "!=": return String(left) !== String(right);
    case "contains":
      return typeof left === "string" && typeof right === "string" && left.includes(right);
    case "exists":
      return left !== null && left !== undefined;
    default:
      return false;
  }
}

/**
 * Evaluate a simple expression safely (no eval()).
 * Supports patterns like:
 *   "output.confidence > 0.8"
 *   "output.confidence > 0.8 && output.samples > 100"
 *   "output.status == 'success'"
 *
 * This is deliberately limited — not a full JS parser.
 */
function evaluateExpression(expression: string, output: Record<string, unknown>): boolean {
  try {
    // Split on && and ||
    const orParts = expression.split("||").map(s => s.trim());
    for (const orPart of orParts) {
      const andParts = orPart.split("&&").map(s => s.trim());
      let allTrue = true;

      for (const clause of andParts) {
        if (!evaluateSingleClause(clause, output)) {
          allTrue = false;
          break;
        }
      }

      if (allTrue) return true; // OR: at least one group of ANDs is true
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Evaluate a single comparison clause like "output.confidence > 0.8"
 */
function evaluateSingleClause(clause: string, output: Record<string, unknown>): boolean {
  // Match pattern: <field> <operator> <value>
  const match = clause.match(
    /^([\w.]+)\s*(>=|<=|!=|==|>|<|contains|exists)\s*(.+)?$/
  );
  if (!match) return false;

  const [, fieldPath, operator, rawValue] = match;

  // Resolve field path — strip "output." prefix if present
  const cleanPath = fieldPath.startsWith("output.") ? fieldPath.slice(7) : fieldPath;
  const fieldValue = getNestedField(output, cleanPath);

  if (operator === "exists") {
    return fieldValue !== null && fieldValue !== undefined;
  }

  if (rawValue === undefined) return false;

  // Parse the comparison value
  const trimmed = rawValue.trim().replace(/^['"]|['"]$/g, "");
  const numValue = Number(trimmed);
  const compareVal = isNaN(numValue) ? trimmed : numValue;
  const fieldVal = typeof fieldValue === "number" ? fieldValue : (typeof fieldValue === "string" ? fieldValue : Number(fieldValue));

  return compareValues(fieldVal as string | number, operator, compareVal as string | number);
}

// ── ProcessFSM Class Wrapper ─────────────────────────────────────────────────

/**
 * ProcessFSM — explicit class interface over the functional workflow engine.
 * Wraps executeWorkflow for object-oriented callers.
 *
 * Survives Lambda cold starts: call save() after every state transition and
 * restore() on resume to reconstruct state from agent_queue.metadata.
 */
export class ProcessFSM {
  /** Current FSM state — persisted to agent_queue.metadata on save(). */
  state: 'idle' | 'running' | 'paused' | 'awaiting_hitl' | 'completed' | 'failed' = 'idle';

  /** Ordered history of state transitions for audit trail. */
  history: Array<{ from: string; to: string; at: string }> = [];

  constructor(private readonly supabase?: SupabaseClient) {}

  /**
   * Transition to a new state and record the change in history.
   * Call save() after transitioning to persist to DB.
   */
  transition(next: ProcessFSM['state']): void {
    this.history.push({ from: this.state, to: next, at: new Date().toISOString() });
    this.state = next;
  }

  /**
   * Persist current FSM state to agent_queue.metadata.
   * Called after every state transition.
   * Non-fatal: logs a warning but never throws.
   */
  async save(supabase: SupabaseClient, jobId: string): Promise<void> {
    try {
      await supabase
        .from("agent_queue")
        .update({
          metadata: {
            fsm_state: this.state,
            fsm_history: this.history,
            fsm_updated_at: new Date().toISOString(),
          },
        })
        .eq("id", jobId);
    } catch (err) {
      // Non-fatal: log but don't break execution
      logger.warn("[ProcessFSM] save error:", err);
    }
  }

  /**
   * Restore FSM state from agent_queue.metadata.
   * Falls back to agent_queue.status mapping if metadata is not yet set.
   * Called on resume after Lambda cold start.
   * Never throws — returns an idle FSM on any error.
   */
  static async restore(supabase: SupabaseClient, jobId: string): Promise<ProcessFSM> {
    const fsm = new ProcessFSM();
    try {
      const { data } = await supabase
        .from("agent_queue")
        .select("metadata, status")
        .eq("id", jobId)
        .single();

      if (data?.metadata?.fsm_state) {
        fsm.state = data.metadata.fsm_state as ProcessFSM['state'];
        fsm.history = (data.metadata.fsm_history as Array<{ from: string; to: string; at: string }>) ?? [];
      } else if (data?.status) {
        // Fall back to agent_queue.status mapping when metadata not yet set
        const statusMap: Record<string, ProcessFSM['state']> = {
          pending: 'idle',
          running: 'running',
          completed: 'completed',
          failed: 'failed',
          blocked: 'awaiting_hitl',
          paused: 'paused',
          awaiting_approval: 'awaiting_hitl',
          suspended: 'paused',
        };
        fsm.state = statusMap[data.status] ?? 'idle';
      }
    } catch (err) {
      logger.warn("[ProcessFSM] restore error:", err);
    }
    return fsm;
  }

  /**
   * Execute a workflow or resume a paused run.
   * If params.resumeRunId is set, resumes an existing paused run.
   */
  async execute(
    params: WorkflowExecutionParams,
    callbacks?: WorkflowProgressCallback,
  ): Promise<WorkflowExecutionResult> {
    if (!this.supabase) {
      throw new Error("[ProcessFSM] supabase client required for execute()");
    }
    return executeWorkflow(this.supabase, params, callbacks);
  }
}
