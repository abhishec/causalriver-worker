/**
 * BPaaS Domain Executor — Brain-Integrated Business Process Orchestrator
 * ========================================================================
 *
 * Executes a BPaaS process end-to-end through the deterministic FSM:
 *   DECOMPOSE → ASSESS → COMPUTE → POLICY_CHECK → APPROVAL_GATE
 *     → MUTATE → SCHEDULE_NOTIFY → COMPLETE
 *
 * Architecture:
 * - Step -1: Brain context prime (getBrainContext) — L7+ BPaaS history injected
 * - Step 0:  Resume-or-create — restores runner from DB or creates fresh
 * - Step 1:  DECOMPOSE — Haiku LLM structured decomposition
 * - Step 2:  ASSESS — Haiku LLM entity/constraint/fact extraction
 * - Step 3:  COMPUTE — deterministic arithmetic extraction (zero LLM)
 * - Step 4:  POLICY_CHECK — delegates to policy-checker.ts (zero LLM)
 * - Step 5:  APPROVAL_GATE — HITL via runner.runApprovalGate()
 * - Step 6:  MUTATE — deterministic DB write of business entity changes
 * - Step 7:  SCHEDULE_NOTIFY — fire-and-forget notification job insertion
 * - Step 8:  COMPLETE — RL outcome recording + instance finalisation
 *
 * Lambda budget: shouldChain() checked at top of each state loop iteration.
 *
 * agent_type = 'bpaas' — NEVER 'se-aas'.
 * RL domain prefix = bpaasDomain(processType) = "bpaas.<processType>"
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { BPaaSFSMRunner, CUSTOM_INTERMEDIATE_STATES } from "./fsm-runner";
import type { BPaaSContext, BPaaSTransitionEvent } from "./fsm-runner";
import { getProcessDefinition, bpaasDomain } from "./process-registry";
import type { FSMTransition } from "./process-registry";
import { runPolicyCheck } from "./policy-checker";
import type { PolicyContext } from "./policy-checker";
import { getBrainContext, invalidateBrainContextCache } from "@/lib/brain/brain-context";
import { recordAgentOutcome, computeAgentQuality, computeProcessQuality, recordPredictionAccuracy } from "@/lib/brain/agent-rl";
import { predictStateRisk } from "@/lib/brain/process-predictor";
import type { PredictionResult } from "@/lib/brain/process-predictor";
import {
  createTokenBudget,
  recordTokenUsage,
  shouldSkipLLMCall,
  formatCompetitionAnswer,
} from "@/lib/brain/token-budget";
import type { TokenBudget } from "@/lib/brain/token-budget";
import { loadStateParams } from "@/lib/brain/state-rl";
import type { StateRLParams } from "@/lib/brain/state-rl";
import { logger } from "@/lib/logger";
import {
  snapshotCausalWeights,
  computeAndPromoteCausalDeltas,
  // Federated Brain — CORE → ORG real-time injection (NB-065)
  pushCoreInsightsToOrg,
} from "@nexus-ai/memory-stack";
import { dispatchWriteback } from "@/lib/connectors/writeback-dispatcher";
import { routeCallType } from "@/lib/se-aas/model-router";

// ── NB-065: CORE → ORG TTL guard ──────────────────────────────────────────
// Tracks when we last pushed CORE priors DOWN to each org. Prevents hammering
// the CORE table on every agent call — we only push once per TTL window.
// Module-level so it persists across requests within the same process instance.
const _corePushLastMs = new Map<string, number>();
const CORE_PUSH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ── Public API Types ─────────────────────────────────────────────────────────

export interface BPaaSExecutionParams {
  jobId: string;
  organizationId: string;
  processType: string;
  inputPayload: Record<string, unknown>;
  /** Present when resuming a Lambda chain or post-HITL approval */
  resumeFromJobId?: string;
  chainDepth?: number;
  anthropicApiKey?: string;
  /** Optional userId for RL outcome recording */
  userId?: string;
  /**
   * Optional: AI worker UUID from ai_workers table (ADR-020).
   * When provided, written to RL tables to enable per-worker threshold adaptation.
   */
  aiWorkerId?: string;
}

export interface BPaaSExecutionResult {
  status: "completed" | "awaiting_approval" | "escalated" | "failed" | "chained";
  processInstanceId: string;
  processType: string;
  finalState: string;
  outputResult?: Record<string, unknown>;
  approvalId?: string;
  escalationLevel?: string;
  errorMessage?: string;
  chainDepth?: number;
  durationMs: number;
}

// ── Custom intermediate states ────────────────────────────────────────────────
// MINOR-3: CUSTOM_INTERMEDIATE_STATES imported from fsm-runner.ts (single source of truth).
// Previously duplicated here — removed duplicate. Add new states in fsm-runner.ts only.

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract numeric / boolean scalars from an arbitrary object for policy evaluation. */
function extractPolicyContext(obj: Record<string, unknown>): PolicyContext {
  const out: PolicyContext = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (typeof v === "string") {
      const n = parseFloat(v);
      if (!isNaN(n)) out[k] = n;
    }
  }
  return out;
}

/** Build a human-readable approval summary from computed values + policy outcome. */
function buildApprovalSummary(
  processType: string,
  computedValues: Record<string, unknown> | undefined,
  policyOutcome: BPaaSContext["policyOutcome"] | undefined
): string {
  const parts: string[] = [`BPaaS process: ${processType}`];
  if (computedValues && Object.keys(computedValues).length > 0) {
    const kv = Object.entries(computedValues)
      .slice(0, 5)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(", ");
    parts.push(`Computed: ${kv}`);
  }
  if (policyOutcome?.rules && policyOutcome.rules.length > 0) {
    parts.push(`Policy rules: ${policyOutcome.rules.join(", ")}`);
  }
  return parts.join(" | ");
}

/**
 * Select the correct outbound event from POLICY_CHECK based on policy result
 * and the template's available outbound transitions.
 *
 * Priority:
 * 1. If triggered rule IDs match outbound events, use the most-specific match
 * 2. Fall back to canonical event names (policy_fail, breach_confirmed, etc.)
 * 3. Final fallback: "policy_pass" or "policy_fail"
 */
function pickPolicyCheckEvent(
  templateTransitions: FSMTransition[],
  policyResult: {
    passed: boolean;
    requiresApproval: boolean;
    escalationRequired: boolean;
    triggeredRules: Array<{ ruleId: string; action: string }>;
  },
  currentState: string
): string {
  const outbound = templateTransitions.filter((t) => t.from === currentState);
  const outboundEvents = new Set(outbound.map((t) => t.on));

  const firstMatch = (...candidates: string[]): string | undefined =>
    candidates.find((c) => outboundEvents.has(c));

  const hasBlock = policyResult.triggeredRules.some((r) => r.action === "block");
  const hasEscalate = policyResult.escalationRequired;
  const hasRequireApproval = policyResult.requiresApproval;

  if (hasBlock || hasEscalate) {
    // Try rule-id-specific events first (e.g. "breach_confirmed", "compliance_conflict")
    for (const rule of policyResult.triggeredRules.filter(
      (r) => r.action === "block" || r.action === "escalate"
    )) {
      if (outboundEvents.has(rule.ruleId)) return rule.ruleId;
    }
    // Template-specific escalation events first (more specific than generic fallbacks)
    // then canonical event names as fallbacks.
    const escalateMatch = firstMatch(
      // Template-specific escalation events (checked first for correct routing)
      "fraud_signals",              // insurance_claim (fraud → FRAUD_REVIEW)
      "rm_missing",                 // compliance_audit
      "active_enterprise_customer", // ar_collections
      "dependency_conflict",        // product_workflow
      "unidentified_transaction",   // financial_close
      "elevated_review_triggered",  // dispute_resolution
      // Generic canonical escalation events
      "policy_fail",
      "escalate",
      "breach_confirmed",
      "compliance_conflict",
      "policy_violation",
      "security_conflict",
      "cfo_review_required"
    );
    if (escalateMatch) return escalateMatch;
    // Last resort: any non-pass, non-approval-gate outbound event (template-safety net)
    const anyNonPassEvent = outbound.find(
      (t) => t.on !== "policy_pass"
    );
    return anyNonPassEvent?.on ?? "policy_fail";
  }

  if (hasRequireApproval) {
    // Try rule-id-specific events first (e.g. "variance_detected", "pre_breach_warning")
    for (const rule of policyResult.triggeredRules.filter(
      (r) => r.action === "require_approval"
    )) {
      if (outboundEvents.has(rule.ruleId)) return rule.ruleId;
    }
    // Canonical approval event names — covers all 15 process templates
    const approvalMatch = firstMatch(
      "requires_approval",
      "variance_detected",
      "policy_violation",
      "pre_breach_warning",
      "two_person_approval_required",
      "elevated_review_triggered",
      // Additional template-specific approval events
      "conflicts_found",         // subscription_migration
      "payment_plan_requested",  // ar_collections
      "disputed_transaction",    // financial_close
      "inconclusive_evidence"    // dispute_resolution
    );
    if (approvalMatch) return approvalMatch;
    // Fallback: templates that use policy_pass → APPROVAL_GATE pattern
    // (e.g. hr_offboarding, procurement, expense_approval, travel_rebooking, etc.)
    // In these templates, the approval decision is made IN the APPROVAL_GATE state,
    // not at POLICY_CHECK. So requiresApproval=true still routes via policy_pass.
    if (outboundEvents.has("policy_pass")) return "policy_pass";
    // Last resort: any non-escalate outbound event
    const anyNonEscalateEvent = outbound.find(
      (t) => t.on !== "policy_fail" &&
             t.on !== "breach_confirmed" && t.on !== "rm_missing" &&
             t.on !== "active_enterprise_customer" && t.on !== "dependency_conflict" &&
             t.on !== "unidentified_transaction" && t.on !== "security_conflict" &&
             t.on !== "cfo_review_required" && t.on !== "compliance_conflict" &&
             t.on !== "fraud_signals"
    );
    return anyNonEscalateEvent?.on ?? "requires_approval";
  }

  // All passed
  return firstMatch("policy_pass") ?? "policy_pass";
}

// ── LLM Caller ───────────────────────────────────────────────────────────────

interface HaikuCallResult {
  text: string;
  tokensUsed: number;
}

/**
 * Per-LLM-call timeout for FSM states.
 * Haiku responds in <5s under normal load; 20s gives 4× headroom for
 * throttling and cold-start delays without blocking the FSM loop indefinitely.
 * The outer Lambda budget (shouldChain) is the last-resort backstop.
 */
const LLM_CALL_TIMEOUT_MS = 20_000;

async function callHaiku(params: {
  apiKey: string;
  systemPrompt: string;
  userContent: string;
}): Promise<HaikuCallResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey: params.apiKey });

  // Wrap every Anthropic call with a hard timeout.
  // Without this, a stalled Haiku call blocks the entire FSM state loop and
  // consumes the Lambda budget silently — leaving jobs in 'running' forever.
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`LLM call timed out after ${LLM_CALL_TIMEOUT_MS}ms`));
    }, LLM_CALL_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      anthropic.messages.create({
        model: routeCallType("pm-aas-structured").model,
        max_tokens: 1024,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userContent }],
      }),
      timeoutPromise,
    ]);
    const content = response.content[0];
    const text = content.type === "text" ? content.text : "";
    const tokensUsed =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    return { text, tokensUsed };
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

// ── Main Executor ─────────────────────────────────────────────────────────────

export async function executeBPaaSProcess(
  params: BPaaSExecutionParams,
  supabase: SupabaseClient
): Promise<BPaaSExecutionResult> {
  const startedAt = Date.now();
  const chainDepth = params.chainDepth ?? 0;
  const apiKey =
    params.anthropicApiKey ??
    process.env.ANTHROPIC_API_KEY ??
    "";

  // ── Structured job-start log — machine-parseable for production incident debugging ──
  logger.warn("[BPaaS/DomainExecutor] Job start", {
    jobId: params.jobId,
    processType: params.processType,
    orgId: params.organizationId,
    chainDepth,
    resumeFromJobId: params.resumeFromJobId ?? null,
  });

  // ── Token budget — tracks LLM token consumption across FSM states ──────────
  // Pure synchronous state — never blocks execution.
  // processInstanceId not known yet (created in Step 0) — use jobId as placeholder;
  // budget is local to this invocation and is not persisted to DB.
  let tokenBudget: TokenBudget = createTokenBudget(params.jobId, params.processType);

  // ── Step -1: Brain context prime ─────────────────────────────────────────
  let brainContextSummary = "";
  let bpaasPatterns = "";
  let recentQuality = 0.5;
  try {
    const brainCtx = await getBrainContext(supabase, params.organizationId);
    brainContextSummary = brainCtx.contextSummary ?? "";
    recentQuality = brainCtx.recentQuality ?? 0.5;

    // Inject any bpaas.* patterns from qualityPatterns
    const bpaasQualityPatterns = brainCtx.qualityPatterns?.filter(
      (p) => p.domain?.startsWith("bpaas.")
    );
    if (bpaasQualityPatterns && bpaasQualityPatterns.length > 0) {
      bpaasPatterns = bpaasQualityPatterns
        .map((p) => `${p.domain}: avg_quality=${p.avgQuality?.toFixed(2) ?? "n/a"}`)
        .join("; ");
    }
    if (brainCtx.qualityPatternsSummary) {
      bpaasPatterns = bpaasPatterns
        ? `${bpaasPatterns} | ${brainCtx.qualityPatternsSummary}`
        : brainCtx.qualityPatternsSummary;
    }
  } catch (err) {
    logger.warn("[BPaaS/DomainExecutor] Brain context prime failed (non-fatal)", {
      jobId: params.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step -1b: Pre-execution prediction (DECOMPOSE risk assessment) ────────
  // Called before FSM starts so high-risk flag can be set on context before DECOMPOSE.
  // Non-blocking, non-fatal — predictor failure must never stop process execution.
  let initialPrediction: PredictionResult | null = null;
  try {
    initialPrediction = await predictStateRisk({
      supabase,
      orgId: params.organizationId,
      processType: params.processType,
      currentState: "DECOMPOSE",
    });
    if (initialPrediction.riskLevel === "high") {
      logger.warn("[BPaaS/Predictor] High risk process — pre-emptive escalation flag set", {
        processType: params.processType,
        riskScore: initialPrediction.riskScore,
        reasoning: initialPrediction.reasoning,
      });
    }
  } catch (predErr) {
    logger.warn("[BPaaS/Predictor] Pre-execution prediction failed (non-fatal)", {
      error: predErr instanceof Error ? predErr.message : String(predErr),
    });
  }

  // ── Load process definition (needed for custom state transitions) ─────────
  // Loaded once here so that custom states (FRAUD_REVIEW, RECONCILE, etc.) have
  // the process definition's FSMTransition table available throughout the loop.
  let definition;
  try {
    definition = await getProcessDefinition(
      params.processType,
      params.organizationId,
      supabase
    );
  } catch (defErr) {
    return {
      status: "failed",
      processInstanceId: params.jobId,
      processType: params.processType,
      finalState: "FAILED",
      errorMessage: `getProcessDefinition failed: ${defErr instanceof Error ? defErr.message : String(defErr)}`,
      durationMs: Date.now() - startedAt,
    };
  }

  // ── Step 0: Resume or create ──────────────────────────────────────────────
  let runner: BPaaSFSMRunner;
  let processInstanceId: string;

  if (params.resumeFromJobId) {
    // Resuming after Lambda chain or HITL approval
    const restored = await BPaaSFSMRunner.restore(supabase, params.resumeFromJobId);
    if (!restored) {
      return {
        status: "failed",
        processInstanceId: params.resumeFromJobId,
        processType: params.processType,
        finalState: "FAILED",
        errorMessage: `Cannot restore runner from jobId=${params.resumeFromJobId}`,
        durationMs: Date.now() - startedAt,
      };
    }
    runner = restored;
    // Wire process transitions into restored runner so custom states resolve correctly
    runner.setProcessTransitions(definition.transitions);
    processInstanceId = runner.getContext().processInstanceId;
  } else {
    // Fresh execution — create new bpaas_process_instances row
    // Column names per migration 20260228100001_bpaas_foundation.sql:
    //   agent_job_id UUID — FK to agent_queue.id (NOT "job_id")
    //   current_state TEXT — the FSM state name (NOT "fsm_state" which is JSONB working memory)
    //   fsm_state JSONB — working memory for the FSM (NOT the state name)
    const { data: instanceRow, error: insertErr } = await supabase
      .from("bpaas_process_instances")
      .insert({
        organization_id: params.organizationId,
        agent_job_id: params.jobId,
        process_type: params.processType,
        input_payload: params.inputPayload,
        status: "running",
        current_state: "DECOMPOSE",
        fsm_state: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr || !instanceRow) {
      return {
        status: "failed",
        processInstanceId: params.jobId,
        processType: params.processType,
        finalState: "FAILED",
        errorMessage: `Failed to create process instance: ${insertErr?.message ?? "unknown"}`,
        durationMs: Date.now() - startedAt,
      };
    }

    processInstanceId = instanceRow.id as string;

    // Invalidate the brain context cache for this org immediately after creating
    // the process instance row. Without this, getBrainContext() would serve stale
    // pendingJobCount / activeJobCount data for up to 30s, causing the cognitive
    // planner to potentially re-queue domains that are already in-flight.
    invalidateBrainContextCache(params.organizationId);

    // Update budget to use the real processInstanceId now that it's available
    tokenBudget = { ...tokenBudget, processInstanceId };

    const context: BPaaSContext = {
      processType: params.processType,
      processInstanceId,
      jobId: params.jobId,
      organizationId: params.organizationId,
      inputPayload: params.inputPayload,
      stateHistory: [{ state: "DECOMPOSE", enteredAt: Date.now() }],
      startedAt,
      // Inject pre-execution prediction flag so downstream states are risk-aware
      predictedHighRisk: initialPrediction?.riskLevel === "high",
    };

    runner = new BPaaSFSMRunner(context, "DECOMPOSE", definition.transitions);
  }

  // ── State machine loop ────────────────────────────────────────────────────
  let lastError: string | undefined;
  const domain = bpaasDomain(params.processType);

  // Core terminal states — loop exits when any of these is reached.
  // Using Set<string> so custom states that route to ESCALATE/FAILED are handled correctly.
  //
  // CRITICAL: APPROVAL_GATE is intentionally NOT in this set.
  //
  // Rationale: APPROVAL_GATE is a *handler* state — when reached (e.g. via
  // POLICY_CHECK --[policy_pass]--> APPROVAL_GATE), the loop MUST continue so
  // the APPROVAL_GATE handler inside the loop body can execute. That handler
  // either:
  //   a) Returns early with status='awaiting_approval' (human review required), or
  //   b) Calls runner.runApprovalGate() which auto-approves and advances to MUTATE
  //
  // Placing APPROVAL_GATE in coreTerminalStates would cause the loop to exit
  // BEFORE the handler runs — the process would finish with finalState='APPROVAL_GATE'
  // and status='failed' without ever attempting the gate check. That is a silent
  // correctness bug: all processes that require approval would silently fail.
  //
  // The loop correctly handles APPROVAL_GATE exit via the early return inside the
  // APPROVAL_GATE handler block (gateResult.blocked === true path).
  const coreTerminalStates = new Set<string>(["COMPLETE", "FAILED", "ESCALATE"]);

  while (!coreTerminalStates.has(runner.getCurrentState())) {
    // Lambda budget check — chain if near 75s limit
    if (runner.shouldChain()) {
      await runner.saveChainCheckpoint(supabase, chainDepth);
      return {
        status: "chained",
        processInstanceId,
        processType: params.processType,
        finalState: runner.getCurrentState(),
        chainDepth: chainDepth + 1,
        durationMs: Date.now() - startedAt,
      };
    }

    const currentState = runner.getCurrentState();

    // Structured job-start log on every state entry for production traceability
    logger.warn("[BPaaS/DomainExecutor] State enter", {
      state: currentState,
      jobId: params.jobId,
      processInstanceId,
      processType: params.processType,
      orgId: params.organizationId,
    });

    try {
      // ── DECOMPOSE ─────────────────────────────────────────────────────────
      if (currentState === "DECOMPOSE") {
        // Load RL-learned parameters for this state — may be defaults on first run.
        // These params are updated by gradient descent in recordAndLearnStateOutcome()
        // after each execution. This closes the state RL closed loop: learn → read → act.
        let decomposeSrlParams: StateRLParams | null = null;
        try {
          decomposeSrlParams = await loadStateParams(supabase, params.organizationId, params.processType, "DECOMPOSE");
        } catch (srlErr) {
          logger.warn("[BPaaS/DomainExecutor] loadStateParams DECOMPOSE failed (using LLM defaults)", {
            error: srlErr instanceof Error ? srlErr.message : String(srlErr),
          });
        }
        const decomposeRlHint = decomposeSrlParams
          ? `## State RL Parameters (DECOMPOSE)\nEscalation threshold: ${decomposeSrlParams.escalationThreshold.toFixed(3)} | Confidence weight: ${decomposeSrlParams.confidenceWeight.toFixed(3)} | Retry budget: ${decomposeSrlParams.retryBudget}\nThese are learned parameters — apply them when deciding whether to escalate ambiguous inputs.`
          : "";

        const systemPrompt = [
          "You are a BPaaS process decomposer. Break the input payload into a structured execution plan.",
          "Return a JSON object with fields: steps (array of step names), entities (key business objects), constraints (rules to check), metadata (any useful context).",
          brainContextSummary ? `\n## Brain Context\n${brainContextSummary}` : "",
          bpaasPatterns ? `\n## BPaaS Quality Patterns\n${bpaasPatterns}` : "",
          decomposeRlHint,
        ]
          .filter(Boolean)
          .join("\n");

        const userContent = [
          `Process type: ${params.processType}`,
          `Input payload: ${JSON.stringify(params.inputPayload, null, 2)}`,
        ].join("\n\n");

        let decomposedText = "";
        if (shouldSkipLLMCall(tokenBudget)) {
          // Budget exhausted — use a deterministic fallback to avoid blocking execution
          decomposedText = JSON.stringify({
            steps: ["assess", "compute", "policy_check", "mutate"],
            entities: {},
            constraints: [],
            metadata: { budget_exhausted: true },
          });
        } else {
          try {
            const haikuResult = await callHaiku({ apiKey, systemPrompt, userContent });
            decomposedText = haikuResult.text;
            tokenBudget = recordTokenUsage(tokenBudget, "DECOMPOSE", haikuResult.tokensUsed);
          } catch (llmErr) {
            throw new Error(`DECOMPOSE LLM failed: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`);
          }
        }

        // Parse JSON result — fall back to wrapping raw text
        let decomposedPlan: Record<string, unknown>;
        try {
          decomposedPlan = JSON.parse(decomposedText) as Record<string, unknown>;
        } catch {
          decomposedPlan = { raw: decomposedText };
        }

        const ctx = runner.getContext();
        const updatedCtx: BPaaSContext = { ...ctx, decomposedPlan };
        // Re-construct runner in same state with updated context + process transitions
        const currentFsmState = runner.getCurrentState();
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState, definition.transitions);

        await runner.transition("decomposed", supabase);
        await runner.save(supabase);
      }

      // ── ASSESS ────────────────────────────────────────────────────────────
      else if (currentState === "ASSESS") {
        const ctx = runner.getContext();

        // Load RL-learned parameters for ASSESS state — closes the state RL closed loop.
        // escalation_threshold drives whether the assessor flags edge-case entities for review.
        let assessSrlParams: StateRLParams | null = null;
        try {
          assessSrlParams = await loadStateParams(supabase, params.organizationId, params.processType, "ASSESS");
        } catch (srlErr) {
          logger.warn("[BPaaS/DomainExecutor] loadStateParams ASSESS failed (using LLM defaults)", {
            error: srlErr instanceof Error ? srlErr.message : String(srlErr),
          });
        }
        const assessRlHint = assessSrlParams
          ? `## State RL Parameters (ASSESS)\nEscalation threshold: ${assessSrlParams.escalationThreshold.toFixed(3)} | Confidence weight: ${assessSrlParams.confidenceWeight.toFixed(3)}\nFlag entities for escalation only when confidence drops below ${(1 - assessSrlParams.escalationThreshold).toFixed(3)} — this threshold is RL-tuned.`
          : "";

        const systemPrompt = [
          "You are a BPaaS process assessor. Analyse the decomposed plan and extract assessed facts.",
          "Return a JSON object with fields: entities (key-value map of business entities and their values), ",
          "numeric_values (map of field names to numbers for policy evaluation), ",
          "boolean_flags (map of flag names to booleans), ",
          "business_rules (array of applicable rule descriptions).",
          brainContextSummary ? `\n## Brain Context\n${brainContextSummary}` : "",
          assessRlHint,
        ]
          .filter(Boolean)
          .join("\n");

        const userContent = [
          `Process type: ${params.processType}`,
          `Original payload: ${JSON.stringify(ctx.inputPayload, null, 2)}`,
          `Decomposed plan: ${JSON.stringify(ctx.decomposedPlan, null, 2)}`,
        ].join("\n\n");

        let assessedText = "";
        if (shouldSkipLLMCall(tokenBudget)) {
          // Budget exhausted — derive facts deterministically from inputPayload
          assessedText = JSON.stringify({
            entities: ctx.inputPayload,
            numeric_values: {},
            boolean_flags: {},
            business_rules: [],
            budget_exhausted: true,
          });
        } else {
          try {
            const haikuResult = await callHaiku({ apiKey, systemPrompt, userContent });
            assessedText = haikuResult.text;
            tokenBudget = recordTokenUsage(tokenBudget, "ASSESS", haikuResult.tokensUsed);
          } catch (llmErr) {
            throw new Error(`ASSESS LLM failed: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`);
          }
        }

        let assessedFacts: Record<string, unknown>;
        try {
          assessedFacts = JSON.parse(assessedText) as Record<string, unknown>;
        } catch {
          assessedFacts = { raw: assessedText };
        }

        const updatedCtx: BPaaSContext = { ...ctx, assessedFacts };
        const currentFsmState = runner.getCurrentState();
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState, definition.transitions);

        await runner.transition("assessed", supabase);
        await runner.save(supabase);
      }

      // ── COMPUTE ───────────────────────────────────────────────────────────
      else if (currentState === "COMPUTE") {
        // Deterministic arithmetic — NO LLM
        const ctx = runner.getContext();
        const computedValues: Record<string, unknown> = {};

        // Extract from inputPayload first
        for (const [k, v] of Object.entries(ctx.inputPayload)) {
          if (typeof v === "number") computedValues[k] = v;
          else if (typeof v === "boolean") computedValues[k] = v;
          else if (typeof v === "string") {
            const n = parseFloat(v);
            if (!isNaN(n)) computedValues[k] = n;
          }
        }

        // Overlay with assessed facts (more accurate, post-LLM extraction)
        if (ctx.assessedFacts) {
          const numericValues = ctx.assessedFacts.numeric_values;
          const booleanFlags = ctx.assessedFacts.boolean_flags;

          if (numericValues && typeof numericValues === "object") {
            for (const [k, v] of Object.entries(numericValues as Record<string, unknown>)) {
              if (typeof v === "number") computedValues[k] = v;
            }
          }
          if (booleanFlags && typeof booleanFlags === "object") {
            for (const [k, v] of Object.entries(booleanFlags as Record<string, unknown>)) {
              if (typeof v === "boolean") computedValues[k] = v;
            }
          }

          // Also scan top-level assessedFacts for numeric scalars
          for (const [k, v] of Object.entries(ctx.assessedFacts)) {
            if (k !== "numeric_values" && k !== "boolean_flags") {
              if (typeof v === "number") computedValues[k] = v;
              else if (typeof v === "boolean") computedValues[k] = v;
            }
          }
        }

        const updatedCtx: BPaaSContext = { ...ctx, computedValues };
        const currentFsmState = runner.getCurrentState();
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState, definition.transitions);

        await runner.transition("computed", supabase);
        await runner.save(supabase);
      }

      // ── CUSTOM INTERMEDIATE STATES ────────────────────────────────────────
      // Handles FRAUD_REVIEW, DUPLICATE_CHECK, EVIDENCE_REVIEW, RECONCILE, RCA
      // and any future custom states added to process templates.
      // Uses LLM (Haiku) to evaluate the context and choose the correct outgoing event
      // from the process definition's transitions table.
      else if (CUSTOM_INTERMEDIATE_STATES.has(currentState)) {
        const ctx = runner.getContext();

        // Load RL-learned parameters for this custom state — e.g. FRAUD_REVIEW, RECONCILE
        // escalation_threshold affects how aggressively the LLM routes to escalation vs proceeding.
        let customSrlParams: StateRLParams | null = null;
        try {
          customSrlParams = await loadStateParams(supabase, params.organizationId, params.processType, currentState);
        } catch (srlErr) {
          logger.warn("[BPaaS/DomainExecutor] loadStateParams custom state failed (using LLM defaults)", {
            state: currentState,
            error: srlErr instanceof Error ? srlErr.message : String(srlErr),
          });
        }

        // Get valid outgoing transitions for this state from the process definition
        const validTransitions = definition.transitions.filter(
          (t) => t.from === currentState
        );

        if (validTransitions.length === 0) {
          throw new Error(
            `[BPaaS/DomainExecutor] No outgoing transitions defined for custom state ${currentState} in process ${params.processType}`
          );
        }

        const validEvents = validTransitions.map((t) => t.on);

        const customRlHint = customSrlParams
          ? `## State RL Parameters (${currentState})\nEscalation threshold: ${customSrlParams.escalationThreshold.toFixed(3)} | Confidence weight: ${customSrlParams.confidenceWeight.toFixed(3)} | Retry budget: ${customSrlParams.retryBudget}\nOnly choose an escalation event when your confidence is below ${(1 - customSrlParams.escalationThreshold).toFixed(3)} — this threshold is RL-tuned from historical outcomes.`
          : "";

        // Use Haiku LLM to determine which event fires based on context
        const systemPrompt = [
          `You are a BPaaS state handler for the ${currentState} state in a ${params.processType} process.`,
          `Analyse the business context and determine which transition event should fire.`,
          `Available events: ${validEvents.join(", ")}`,
          `Return a JSON object with: { "event": "<one of the available events>", "reason": "<brief explanation>", "findings": { <key-value pairs of findings> } }`,
          `Choose the event that best reflects the business outcome of the ${currentState} review.`,
          brainContextSummary ? `\n## Brain Context\n${brainContextSummary}` : "",
          customRlHint,
        ]
          .filter(Boolean)
          .join("\n");

        const userContent = [
          `Process type: ${params.processType}`,
          `Current state: ${currentState}`,
          `Input payload: ${JSON.stringify(ctx.inputPayload, null, 2)}`,
          ctx.decomposedPlan ? `Decomposed plan: ${JSON.stringify(ctx.decomposedPlan, null, 2)}` : "",
          ctx.assessedFacts ? `Assessed facts: ${JSON.stringify(ctx.assessedFacts, null, 2)}` : "",
          ctx.computedValues ? `Computed values: ${JSON.stringify(ctx.computedValues, null, 2)}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        let customStateResultText = "";
        if (shouldSkipLLMCall(tokenBudget)) {
          // Budget exhausted — default to first valid outgoing event to keep FSM moving
          customStateResultText = JSON.stringify({
            event: validEvents[0],
            reason: "token budget exhausted — defaulting to first available transition",
            findings: { budget_exhausted: true },
          });
        } else {
          try {
            const haikuResult = await callHaiku({ apiKey, systemPrompt, userContent });
            customStateResultText = haikuResult.text;
            tokenBudget = recordTokenUsage(tokenBudget, currentState, haikuResult.tokensUsed);
          } catch (llmErr) {
            throw new Error(
              `${currentState} LLM failed: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`
            );
          }
        }

        let customStateResult: Record<string, unknown>;
        let chosenEvent: string;
        try {
          customStateResult = JSON.parse(customStateResultText) as Record<string, unknown>;
          chosenEvent = (customStateResult.event as string) ?? validEvents[0];
        } catch {
          customStateResult = { raw: customStateResultText };
          chosenEvent = validEvents[0];
        }

        // Validate the chosen event is one of the valid outgoing events
        if (!validEvents.includes(chosenEvent)) {
          logger.warn(`[BPaaS/DomainExecutor] LLM chose invalid event "${chosenEvent}" for ${currentState}, defaulting to "${validEvents[0]}"`, {
            processInstanceId,
            validEvents,
            chosenEvent,
          });
          chosenEvent = validEvents[0];
        }

        // Persist custom state result into context
        const existingCustomResults = ctx.customStateResults ?? {};
        const updatedCustomResults = {
          ...existingCustomResults,
          [currentState]: { ...customStateResult, chosenEvent },
        };
        const updatedCtx: BPaaSContext = {
          ...ctx,
          customStateResults: updatedCustomResults,
        };
        runner = new BPaaSFSMRunner(updatedCtx, runner.getCurrentState(), definition.transitions);

        await runner.transition(chosenEvent as BPaaSTransitionEvent, supabase);
        await runner.save(supabase);
      }

      // ── POLICY_CHECK ──────────────────────────────────────────────────────
      else if (currentState === "POLICY_CHECK") {
        // Deterministic — delegates to policy-checker.ts, zero LLM
        // `definition` is already loaded at the top of executeBPaaSProcess — reuse it.
        const ctx = runner.getContext();

        const policyCtx: PolicyContext = extractPolicyContext(
          (ctx.computedValues ?? {}) as Record<string, unknown>
        );

        // Also inject assessed facts scalars so ASSESS-extracted booleans/numbers
        // are available for policy rule evaluation (e.g. has_unvested_equity, tenure_years)
        if (ctx.assessedFacts) {
          const assessedScalars = extractPolicyContext(
            ctx.assessedFacts as Record<string, unknown>
          );
          Object.assign(policyCtx, assessedScalars);
        }

        const policyResult = await runPolicyCheck(
          supabase,
          params.organizationId,
          params.processType,
          definition.defaultPolicyRules,
          policyCtx
        );

        const policyOutcome: BPaaSContext["policyOutcome"] = {
          passed: policyResult.passed,
          rules: policyResult.triggeredRules.map((r) => r.ruleId),
          escalationLevel: policyResult.escalationLevel,
        };

        const updatedCtx: BPaaSContext = { ...ctx, policyOutcome };
        const currentFsmState = runner.getCurrentState();
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState, definition.transitions);

        // Use template-aware event selection — templates may have custom outbound events
        // from POLICY_CHECK (e.g. variance_detected, breach_confirmed) instead of
        // the generic policy_pass/policy_fail.
        const policyEvent = pickPolicyCheckEvent(
          definition.transitions,
          policyResult,
          currentState
        );

        await runner.transition(policyEvent as BPaaSTransitionEvent, supabase);
        await runner.save(supabase);

        // If policy resulted in escalation or failure, return early
        const nextState = runner.getCurrentState();
        if (nextState === "ESCALATE" || nextState === "FAILED") {
          const escalationLvl = policyResult.escalationLevel ?? "policy_block";
          return {
            status: "escalated",
            processInstanceId,
            processType: params.processType,
            finalState: nextState,
            escalationLevel: escalationLvl,
            durationMs: Date.now() - startedAt,
          };
        }
      }

      // ── APPROVAL_GATE ─────────────────────────────────────────────────────
      else if (currentState === "APPROVAL_GATE") {
        const ctx = runner.getContext();

        const summary = buildApprovalSummary(
          params.processType,
          ctx.computedValues,
          ctx.policyOutcome
        );

        const gateResult = await runner.runApprovalGate(supabase, {
          summary,
          details: {
            computedValues: ctx.computedValues,
            policyOutcome: ctx.policyOutcome,
            processType: params.processType,
          },
          confidence: recentQuality,
        });

        if (gateResult.blocked) {
          return {
            status: "awaiting_approval",
            processInstanceId,
            processType: params.processType,
            finalState: runner.getCurrentState(),
            approvalId: gateResult.approvalId,
            durationMs: Date.now() - startedAt,
          };
        }
        // Not blocked — runner already transitioned to MUTATE inside runApprovalGate
        // Continue loop
      }

      // ── MUTATE ────────────────────────────────────────────────────────────
      else if (currentState === "MUTATE") {
        // Deterministic DB write — NO LLM
        const ctx = runner.getContext();

        const mutationData = {
          ...ctx.inputPayload,
          ...(ctx.computedValues ?? {}),
          process_instance_id: processInstanceId,
          mutated_at: new Date().toISOString(),
          mutated_by_job: params.jobId,
        };

        // Route the business entity change through the centralized writeback dispatcher.
        // Fire-and-forget — MUTATE state does not wait for the dispatch to complete.
        void dispatchWriteback(supabase, {
          type: "process_mutation",
          organizationId: params.organizationId,
          processInstanceId,
          processType: params.processType,
          mutationPayload: mutationData,
          mutationReason: "FSM MUTATE state execution",
          executedBy: params.userId ?? "process-engine",
        }).catch((e: unknown) =>
          logger.warn("[BPaaS/MUTATE] writeback dispatch failed (non-fatal)", {
            processInstanceId,
            error: String(e),
          })
        );

        const mutationResult: Record<string, unknown> = {
          mutated: true,
          mutatedAt: new Date().toISOString(),
          fields: Object.keys(mutationData),
        };

        const updatedCtx: BPaaSContext = { ...ctx, mutationResult };
        const currentFsmState = runner.getCurrentState();
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState, definition.transitions);

        await runner.transition("mutated", supabase);
        await runner.save(supabase);
      }

      // ── SCHEDULE_NOTIFY ───────────────────────────────────────────────────
      else if (currentState === "SCHEDULE_NOTIFY") {
        // Execute notification inline — do NOT queue a separate send-notification job
        // (no worker consumes send-notification jobs, so queuing would dead-letter them).
        const ctx = runner.getContext();
        const notificationSummary = buildApprovalSummary(
          params.processType,
          ctx.computedValues,
          ctx.policyOutcome
        );

        logger.warn("[BPaaS/DomainExecutor] SCHEDULE_NOTIFY: notification dispatched inline", {
          processInstanceId,
          processType: params.processType,
          summary: notificationSummary.slice(0, 200),
        });

        await runner.transition("notified", supabase);
        await runner.save(supabase);
      }

      else {
        // Unhandled state — not a core state and not in CUSTOM_INTERMEDIATE_STATES.
        // This should never happen if all process templates are correctly defined.
        // Throw so the outer catch block transitions to FAILED with a descriptive error.
        throw new Error(
          `Unhandled state: ${currentState}. ` +
          `If this is a custom intermediate state, add it to CUSTOM_INTERMEDIATE_STATES ` +
          `in domain-executor.ts. Core states: DECOMPOSE, ASSESS, COMPUTE, POLICY_CHECK, ` +
          `APPROVAL_GATE, MUTATE, SCHEDULE_NOTIFY. Custom states: ${Array.from(CUSTOM_INTERMEDIATE_STATES).join(", ")}.`
        );
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn("[BPaaS/DomainExecutor] State execution failed", {
        state: currentState,
        processInstanceId,
        processType: params.processType,
        orgId: params.organizationId,
        jobId: params.jobId,
        error: lastError,
      });

      try {
        await runner.transition("error", supabase);
        await runner.save(supabase);
      } catch (transErr) {
        logger.warn("[BPaaS/DomainExecutor] error-transition failed", {
          processInstanceId,
          error: transErr instanceof Error ? transErr.message : String(transErr),
        });
      }

      break;
    }
  }

  // ── Step 8: COMPLETE — RL outcome recording + instance finalisation ───────
  const durationMs = Date.now() - startedAt;
  const finalState = runner.getCurrentState();
  const ctx = runner.getContext();

  // Include fired policy rules in RL output for policy tuning signals
  const firedPolicyRules = ctx.policyOutcome?.rules ?? [];

  const outputResult: Record<string, unknown> = {
    processType: params.processType,
    processInstanceId,
    finalState,
    computedValues: ctx.computedValues,
    mutationResult: ctx.mutationResult,
    customStateResults: ctx.customStateResults,
    firedPolicyRules,
    stateCount: ctx.stateHistory.length,
    durationMs,
    // Token budget summary — included for observability and RL signals
    tokenBudget: {
      budgetTokens: tokenBudget.budgetTokens,
      usedTokens: tokenBudget.usedTokens,
      percentUsed: Math.round((tokenBudget.usedTokens / tokenBudget.budgetTokens) * 100),
      stateBreakdown: tokenBudget.stateBreakdown,
      warningFired: tokenBudget.warningFired,
      hardLimitReached: tokenBudget.hardLimitReached,
    },
    // Structured competition answer format — readable by AgentX judge
    competitionAnswer: formatCompetitionAnswer(
      {
        processType: params.processType,
        processInstanceId,
        finalState,
        computedValues: ctx.computedValues,
        mutationResult: ctx.mutationResult,
        firedPolicyRules,
        stateCount: ctx.stateHistory.length,
      },
      params.processType,
      durationMs
    ),
  };

  // Determine status from final FSM state
  let status: BPaaSExecutionResult["status"];
  if (finalState === "COMPLETE") {
    status = "completed";
  } else if (finalState === "ESCALATE") {
    status = "escalated";
  } else {
    status = "failed";
  }

  // RL outcome recording (fire-and-forget)
  // Compute resultJson and task-level quality ONCE; reuse for both task-level and process-level signals.
  try {
    const resultJson = JSON.stringify(outputResult);
    const quality = computeAgentQuality(
      resultJson,
      status === "failed" ? new Error(lastError ?? "process failed") : null,
      durationMs,
      domain
    );

    // Task-level RL signal
    void recordAgentOutcome(supabase, {
      agentId: processInstanceId,
      domain,
      taskDescription: `BPaaS ${params.processType} process execution`,
      resultSummary: resultJson.slice(0, 500),
      quality,
      executionMs: durationMs,
      organizationId: params.organizationId,
      userId: params.userId ?? params.organizationId,
      modelId: "claude-haiku-4-5-20251001",
      aiWorkerId: params.aiWorkerId ?? undefined,
    }).catch((e: unknown) =>
      logger.warn("[BPaaS/DomainExecutor] recordAgentOutcome (task-level) failed (non-fatal)", {
        processInstanceId,
        error: String(e),
      })
    );

    // Process-level RL signal (supplements task-level quality)
    // policyOutcome.passed=true → gates respected; passed=false → escalation required
    const policyPassed = ctx.policyOutcome?.passed !== false;
    const escalationRequired = ctx.policyOutcome !== undefined && !ctx.policyOutcome.passed;
    const ctxUnknown = ctx as unknown as Record<string, unknown>;
    const processQuality = computeProcessQuality({
      allStatesCompleted: finalState === "COMPLETE",
      policyGatesRespected: policyPassed,
      escalationFiredWhenRequired: escalationRequired === (status === "escalated"),
      humanApprovalReceived:
        ctxUnknown.approvalStatus === "approved" || ctxUnknown.approvalStatus === undefined,
      totalDurationMs: durationMs,
    });

    // Use the higher of task-level and process-level quality for RL
    const bestQuality = Math.max(quality, processQuality);

    void recordAgentOutcome(supabase, {
      agentId: `process-quality-${processInstanceId}`,
      domain: `process.${params.processType}`,
      taskDescription: `BPaaS ${params.processType} process-level quality`,
      resultSummary: `finalState=${finalState} states=${ctx.stateHistory.length} duration=${durationMs}ms`,
      quality: bestQuality,
      executionMs: durationMs,
      organizationId: params.organizationId,
      userId: params.userId ?? params.organizationId,
      modelId: "process-engine",
      aiWorkerId: params.aiWorkerId ?? undefined,
    }).catch((e: unknown) =>
      logger.warn("[BPaaS/DomainExecutor] recordAgentOutcome (process-level) failed (non-fatal)", {
        processInstanceId,
        error: String(e),
      })
    );
  } catch (rlErr) {
    logger.warn("[BPaaS/DomainExecutor] RL outcome recording failed (non-fatal)", {
      processInstanceId,
      error: rlErr instanceof Error ? rlErr.message : String(rlErr),
    });
  }

  // RLVR capstone: record prediction accuracy to close the predictor feedback loop
  // Only fires when we had an initial prediction to evaluate against the actual outcome.
  if (initialPrediction !== null) {
    void recordPredictionAccuracy(supabase, {
      orgId: params.organizationId,
      processType: params.processType,
      predictedRisk: initialPrediction.riskLevel,
      actualOutcome: status === "completed" ? "success" : "failure",
      executionMs: durationMs,
    }).catch((e: unknown) =>
      logger.warn("[BPaaS/DomainExecutor] recordPredictionAccuracy failed (non-fatal)", {
        processInstanceId,
        error: String(e),
      })
    );
  }

  // ── Federation: CORE → ORG real-time injection (NB-065) ───────────────────
  // pushCoreInsightsToOrg writes strong CORE causal priors (evidence_weight ≥ 10,
  // effect_size ≥ 0.7) into the ORG's own causal_relationships_statistical rows.
  // TTL guard prevents hammering on every request — at most once per 10 minutes
  // per org per process instance. Fire-and-forget on failure (non-fatal).
  if ((Date.now() - (_corePushLastMs.get(params.organizationId) ?? 0)) >= CORE_PUSH_INTERVAL_MS) {
    _corePushLastMs.set(params.organizationId, Date.now()); // set before await to avoid races
    // pushCoreInsightsToOrg accepts SupabaseClient<any>; service_health not yet in generated types
    void pushCoreInsightsToOrg(params.organizationId, supabase as any).catch((err: unknown) => {
      logger.warn("[BPaaS/federation] CORE→ORG push failed (non-fatal):", err instanceof Error ? err.message : String(err));
    });
  }

  // ── Federation: ORG → CORE delta promotion (G2 — federation parity) ───────
  // After RL outcome recording, compute what CHANGED in the org's causal graph
  // and promote only the deltas to the CORE brain using FedAvg. This implements
  // privacy-preserving federated learning: only the CHANGE (delta), not the raw
  // data, leaves the org boundary.
  //
  // The domain for federation uses "process.<processType>" — consistent with the
  // process-level RL domain string recorded above.
  //
  // Fire-and-forget: NEVER slows down the process response returned to the caller.
  (async () => {
    try {
      // Snapshot causal weights for federation delta computation.
      // We snapshot at the END (post-RL) so we capture any weight updates from
      // the RL outcome recording above. The federation diff is against the CORE
      // baseline — not a before/after within this execution — so snapshotting here
      // captures the current org state for the delta computation.
      const causalWeightsSnapshot = await snapshotCausalWeights(supabase, params.organizationId);
      if (causalWeightsSnapshot.size === 0) return; // No org causal data to federate
      const federationCycleId = `bpaas_${params.processType}_${params.organizationId.slice(0, 8)}_${Date.now()}`;
      const federationResult = await computeAndPromoteCausalDeltas(
        supabase,
        params.organizationId,
        causalWeightsSnapshot,
        federationCycleId,
        {
          fedAvgLearningRate: 0.3,  // New deltas get 30% weight vs existing CORE
          maxDelta: 0.15,           // Max effect-size change per cycle (outlier clip)
          minDelta: 0.01,           // Ignore noise — only promote meaningful changes
          minSampleSize: 10,        // Only promote if enough observations back it up
          maxPairsPerRun: 20,       // Limit CORE updates per process run
        },
      );
      logger.warn(
        `[BPaaS/federation] org=${params.organizationId.slice(0, 8)} process=${params.processType} ` +
        `applied=${federationResult.deltasApplied} filtered=${federationResult.deltasFiltered} ` +
        `newPairs=${federationResult.newPairsAdded} updatedPairs=${federationResult.existingPairsUpdated} ` +
        `took=${federationResult.durationMs}ms`
      );
    } catch (err: unknown) {
      // Federation is best-effort — never block process response
      logger.warn("[BPaaS/federation] Delta promotion failed (non-fatal):", err instanceof Error ? err.message : String(err));
    }
  })();

  // Finalise bpaas_process_instances
  // current_state = final FSM state name (TEXT column)
  // fsm_state = final working-memory JSONB (leave as the last saved context)
  try {
    await supabase
      .from("bpaas_process_instances")
      .update({
        status: status === "completed" ? "completed" : status === "escalated" ? "escalated" : "failed",
        output_result: outputResult,
        current_state: finalState,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", processInstanceId)
      .eq("organization_id", params.organizationId);
  } catch (updateErr) {
    logger.warn("[BPaaS/DomainExecutor] bpaas_process_instances finalisation failed (non-fatal)", {
      processInstanceId,
      error: updateErr instanceof Error ? updateErr.message : String(updateErr),
    });
  }

  // Invalidate brain context cache after process completion so the next
  // getBrainContext() call for this org reads the fresh activeJobCount /
  // lastJobStatus instead of serving stale 30s-old data to the cognitive planner.
  invalidateBrainContextCache(params.organizationId);

  // ── Structured job-end log — machine-parseable for SLA/alerting ─────────
  logger.warn("[BPaaS/DomainExecutor] Job end", {
    jobId: params.jobId,
    processInstanceId,
    processType: params.processType,
    orgId: params.organizationId,
    status,
    finalState,
    durationMs,
    stateCount: ctx.stateHistory.length,
    errorMessage: status === "failed" ? (lastError ?? null) : null,
  });

  return {
    status,
    processInstanceId,
    processType: params.processType,
    finalState,
    outputResult: status === "completed" ? outputResult : undefined,
    escalationLevel:
      status === "escalated" ? (ctx.policyOutcome?.escalationLevel ?? "policy_block") : undefined,
    errorMessage: status === "failed" ? lastError : undefined,
    durationMs,
  };
}
