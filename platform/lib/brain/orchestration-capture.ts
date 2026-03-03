import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export type OrchestrationDecisionType =
  | 'task_decomposition'     // Complex request split into subtasks
  | 'parallelization'        // Tasks identified as parallel-safe
  | 'sequencing'             // Task A must complete before Task B
  | 'priority_override'      // Security/correctness bumped above features
  | 'model_selection'        // Why Haiku vs Sonnet vs Opus chosen
  | 'research_gate'          // Research required before implementation
  | 'agent_spawn'            // Agent spawned with specific purpose
  | 'async_vs_sync'          // Async background vs blocking choice
  | 'abort_and_rethink'      // Detected wrong approach, pivoting
  | 'escalation'             // Elevated to more capable model/approach
  | 'routing_feedback';      // ADR-027: Post-execution routing quality signal

export interface OrchestrationDecision {
  type: OrchestrationDecisionType;
  trigger: string;           // What caused this decision (user message, error, etc.)
  reasoning: string;         // WHY this decision was made (the logic)
  outcome: string;           // WHAT was decided
  alternatives?: string[];   // What was NOT chosen and why
  confidenceScore: number;   // 0.0-1.0, how confident in this decision
  domain: string;            // What domain this relates to ('security', 'feature', 'research', etc.)
  metadata?: Record<string, unknown>;
}

/**
 * Record an orchestration decision to the brain.
 * Called whenever the system makes a strategic decision about HOW to handle a request.
 */
export async function captureOrchestrationDecision(
  supabase: SupabaseClient,
  orgId: string,
  decision: OrchestrationDecision
): Promise<void> {
  const importance = decision.confidenceScore;

  // Build human-readable content for the brain
  const content = [
    `Decision: ${decision.type}`,
    `Trigger: ${decision.trigger.slice(0, 200)}`,
    `Reasoning: ${decision.reasoning.slice(0, 300)}`,
    `Outcome: ${decision.outcome.slice(0, 200)}`,
    decision.alternatives?.length
      ? `Not chosen: ${decision.alternatives.join('; ')}`
      : '',
  ].filter(Boolean).join('\n');

  // Store as pattern in ai_memory (upsert — same decision type + domain updates)
  void Promise.resolve(
    supabase.from('ai_memory').upsert({
      organization_id: orgId,
      domain: `orchestration.${decision.type}.${decision.domain}`,
      memory_type: 'pattern',
      content: content.slice(0, 1000),
      importance,
      metadata: {
        source: 'orchestration_capture',
        decision_type: decision.type,
        confidence: decision.confidenceScore,
        ...decision.metadata,
      },
    }, { onConflict: 'organization_id,memory_type,domain', ignoreDuplicates: false })
  ).catch((err: unknown) => {
    logger.warn(`[orchestration-capture] write failed: ${String(err)}`);
  });

  // Also write to cross_domain_signals for causal graph
  void Promise.resolve(
    supabase.from('cross_domain_signals').insert({
      organization_id: orgId,
      source_domain: 'orchestration',
      signal_type: decision.type,
      signal_value: importance,
      signal_strength: importance,
      target_domain: decision.domain,
      entity_type: 'orchestration_decision',
      entity_id: `${decision.type}:${Date.now()}`,
      signal_metadata: {
        trigger: decision.trigger.slice(0, 200),
        reasoning: decision.reasoning.slice(0, 300),
        outcome: decision.outcome.slice(0, 200),
        ...decision.metadata,
      },
      payload: { full_decision: { ...decision } },
    })
  ).catch(() => {});

  logger.warn(`[orchestration-capture] Captured: ${decision.type} (${decision.domain}) confidence=${decision.confidenceScore}`);
}

/**
 * Capture a task decomposition decision.
 * Call this when a complex request is broken into subtasks.
 */
export async function captureTaskDecomposition(
  supabase: SupabaseClient,
  orgId: string,
  userRequest: string,
  subtasks: string[],
  reasoning: string,
  domain: string
): Promise<void> {
  await captureOrchestrationDecision(supabase, orgId, {
    type: 'task_decomposition',
    trigger: userRequest.slice(0, 200),
    reasoning,
    outcome: `Decomposed into ${subtasks.length} subtasks: ${subtasks.slice(0, 3).join(', ')}${subtasks.length > 3 ? '...' : ''}`,
    confidenceScore: 0.8,
    domain,
    metadata: { subtasks, subtask_count: subtasks.length },
  });
}

/**
 * Capture a parallelization decision.
 * Call when multiple tasks are identified as safe to run concurrently.
 */
export async function captureParallelization(
  supabase: SupabaseClient,
  orgId: string,
  tasks: string[],
  reason: string,
  domain: string
): Promise<void> {
  await captureOrchestrationDecision(supabase, orgId, {
    type: 'parallelization',
    trigger: `${tasks.length} tasks identified`,
    reasoning: reason,
    outcome: `Running in parallel: ${tasks.join(', ')}`,
    confidenceScore: 0.85,
    domain,
    metadata: { parallel_tasks: tasks },
  });
}

/**
 * Capture a model selection decision.
 * Call when the system chooses which AI model to use for a task.
 */
export async function captureModelSelection(
  supabase: SupabaseClient,
  orgId: string,
  taskDescription: string,
  modelChosen: string,
  reason: string,
  alternativeConsidered?: string,
  domain?: string
): Promise<void> {
  await captureOrchestrationDecision(supabase, orgId, {
    type: 'model_selection',
    trigger: taskDescription.slice(0, 200),
    reasoning: reason,
    outcome: `Selected ${modelChosen}`,
    alternatives: alternativeConsidered ? [alternativeConsidered] : undefined,
    confidenceScore: 0.9,
    domain: domain ?? 'model_routing',
    metadata: { model_chosen: modelChosen, alternative: alternativeConsidered },
  });
}

/**
 * Capture a priority override decision.
 * Call when security/correctness/urgency bumps something up the queue.
 */
export async function capturePriorityOverride(
  supabase: SupabaseClient,
  orgId: string,
  what: string,
  why: string,
  domain: string
): Promise<void> {
  await captureOrchestrationDecision(supabase, orgId, {
    type: 'priority_override',
    trigger: what,
    reasoning: why,
    outcome: `Elevated priority: ${what}`,
    confidenceScore: 0.95,
    domain,
    metadata: { override_reason: why },
  });
}

/**
 * ADR-027: Capture routing feedback — records whether a routing decision was good.
 *
 * Called by post-flight.ts after every copilot response. Links the routing
 * decision (intent → domain → service) with the response quality, creating a
 * feedback loop: better routing → higher quality → brain learns → even better routing.
 *
 * The signal is written to both ai_memory (for copilot memory readback) and
 * cross_domain_signals (for brain context / causal graph visibility).
 */
export async function captureRoutingFeedback(
  supabase: SupabaseClient,
  orgId: string,
  params: {
    query: string;
    routedTo: string;       // the domain or service that was chosen
    serviceType: string;    // 'se-aas' | 'aas' | 'pm-aas' | 'copilot' | 'general'
    responseQuality: number; // 0.0-1.0 from RL quality computation
    durationMs: number;
    wasHelpful?: boolean;   // explicit user feedback (if available)
    aiWorkerId?: string;
  }
): Promise<void> {
  const qualityLabel = params.responseQuality >= 0.7 ? "good"
    : params.responseQuality >= 0.4 ? "acceptable"
    : "poor";

  await captureOrchestrationDecision(supabase, orgId, {
    type: 'routing_feedback',
    trigger: params.query.slice(0, 200),
    reasoning: `Routed to ${params.routedTo} via ${params.serviceType}. Quality: ${qualityLabel} (${(params.responseQuality * 100).toFixed(0)}%). Duration: ${params.durationMs}ms.`,
    outcome: `${params.serviceType}/${params.routedTo} → quality=${qualityLabel}`,
    confidenceScore: params.responseQuality,
    domain: params.routedTo,
    metadata: {
      service_type: params.serviceType,
      response_quality: params.responseQuality,
      duration_ms: params.durationMs,
      was_helpful: params.wasHelpful,
      ai_worker_id: params.aiWorkerId,
      quality_label: qualityLabel,
    },
  });
}
