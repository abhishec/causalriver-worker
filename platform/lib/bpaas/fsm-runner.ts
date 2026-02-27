/**
 * BPaaS FSM Runner — Business Process as a Service State Machine Executor
 * =========================================================================
 *
 * Executes a business process through an ordered state machine:
 *   DECOMPOSE → ASSESS → COMPUTE → POLICY_CHECK → APPROVAL_GATE
 *     → MUTATE → SCHEDULE_NOTIFY → COMPLETE
 *
 * Error paths lead to ESCALATE or FAILED.
 *
 * Design:
 * - Composes ProcessFSM (coarse states) for agent_queue persistence
 * - Fine-grained BPaaS states stored in bpaas_process_instances.fsm_state
 * - Every state transition emits a step-level RL signal via recordStepOutcome()
 * - POLICY_CHECK gate calls evaluateConstraints() from policy-enforcer.ts
 * - APPROVAL_GATE calls checkHitlGate() and pauses via pauseJobAtDecisionGate()
 * - Lambda budget checked via shouldChain(); caller should checkpointAndChain() if true
 * - All gate decisions logged fire-and-forget via logDecision()
 *
 * Never use agent_type = 'se-aas' for BPaaS jobs — always 'bpaas'.
 * Domain prefix: "bpaas.<processType>"
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ProcessFSM } from "@/lib/workflows/engine";
import { checkHitlGate } from "@/lib/brain/hitl-gate";
import {
  pauseJobAtDecisionGate,
  saveDeepCheckpoint,
} from "@/lib/se-aas/agent-checkpoint";
import { shouldChain } from "@/lib/brain/chain-invoker";
import { recordStepOutcome } from "@/lib/brain/agent-rl";
import { logDecision } from "@/lib/brain/decision-log";
import { evaluateConstraints } from "@/lib/brain/policy-enforcer";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BPaaSState =
  | "DECOMPOSE"
  | "ASSESS"
  | "COMPUTE"
  | "POLICY_CHECK"
  | "APPROVAL_GATE"
  | "MUTATE"
  | "SCHEDULE_NOTIFY"
  | "COMPLETE"
  | "ESCALATE"
  | "FAILED";

export type BPaaSTransitionEvent =
  | "decomposed"
  | "assessed"
  | "computed"
  | "policy_pass"
  | "policy_fail"
  | "requires_approval"
  | "approved"
  | "rejected"
  | "mutated"
  | "notified"
  | "escalate"
  | "error";

export interface BPaaSContext {
  /** 'hr_offboarding' | 'procurement' | 'order_management' */
  processType: string;
  /** FK to bpaas_process_instances */
  processInstanceId: string;
  /** agent_queue.id */
  jobId: string;
  organizationId: string;
  /** Original request */
  inputPayload: Record<string, unknown>;
  /** Output of DECOMPOSE state */
  decomposedPlan?: Record<string, unknown>;
  /** Output of ASSESS state */
  assessedFacts?: Record<string, unknown>;
  /** Output of COMPUTE state (arithmetic, NO LLM) */
  computedValues?: Record<string, unknown>;
  policyOutcome?: {
    passed: boolean;
    rules: string[];
    escalationLevel?: string;
  };
  /** hitl_approvals.id when in APPROVAL_GATE */
  approvalId?: string;
  /** Output of MUTATE state */
  mutationResult?: Record<string, unknown>;
  stateHistory: Array<{
    state: BPaaSState;
    enteredAt: number;
    exitedAt?: number;
    outcome?: string;
  }>;
  /** Unix ms — for shouldChain() check */
  startedAt: number;
}

// ── State Machine Transition Table ──────────────────────────────────────────

/**
 * Legal state transitions.
 * Key: [currentState, event] → nextState
 */
const TRANSITIONS: Readonly<
  Record<string, Record<BPaaSTransitionEvent, BPaaSState | null>>
> = {
  DECOMPOSE: {
    decomposed: "ASSESS",
    assessed: null,
    computed: null,
    policy_pass: null,
    policy_fail: null,
    requires_approval: null,
    approved: null,
    rejected: null,
    mutated: null,
    notified: null,
    escalate: "ESCALATE",
    error: "FAILED",
  },
  ASSESS: {
    decomposed: null,
    assessed: "COMPUTE",
    computed: null,
    policy_pass: null,
    policy_fail: null,
    requires_approval: null,
    approved: null,
    rejected: null,
    mutated: null,
    notified: null,
    escalate: "ESCALATE",
    error: "FAILED",
  },
  COMPUTE: {
    decomposed: null,
    assessed: null,
    computed: "POLICY_CHECK",
    policy_pass: null,
    policy_fail: null,
    requires_approval: null,
    approved: null,
    rejected: null,
    mutated: null,
    notified: null,
    escalate: "ESCALATE",
    error: "FAILED",
  },
  POLICY_CHECK: {
    decomposed: null,
    assessed: null,
    computed: null,
    policy_pass: "APPROVAL_GATE",
    policy_fail: "ESCALATE",
    requires_approval: null,
    approved: null,
    rejected: null,
    mutated: null,
    notified: null,
    escalate: "ESCALATE",
    error: "FAILED",
  },
  APPROVAL_GATE: {
    decomposed: null,
    assessed: null,
    computed: null,
    policy_pass: null,
    policy_fail: null,
    requires_approval: "APPROVAL_GATE", // self-loop: stays awaiting
    approved: "MUTATE",
    rejected: "FAILED",
    mutated: null,
    notified: null,
    escalate: "ESCALATE",
    error: "FAILED",
  },
  MUTATE: {
    decomposed: null,
    assessed: null,
    computed: null,
    policy_pass: null,
    policy_fail: null,
    requires_approval: null,
    approved: null,
    rejected: null,
    mutated: "SCHEDULE_NOTIFY",
    notified: null,
    escalate: "ESCALATE",
    error: "FAILED",
  },
  SCHEDULE_NOTIFY: {
    decomposed: null,
    assessed: null,
    computed: null,
    policy_pass: null,
    policy_fail: null,
    requires_approval: null,
    approved: null,
    rejected: null,
    mutated: null,
    notified: "COMPLETE",
    escalate: "ESCALATE",
    error: "FAILED",
  },
  COMPLETE: {
    decomposed: null,
    assessed: null,
    computed: null,
    policy_pass: null,
    policy_fail: null,
    requires_approval: null,
    approved: null,
    rejected: null,
    mutated: null,
    notified: null,
    escalate: null,
    error: null,
  },
  ESCALATE: {
    decomposed: null,
    assessed: null,
    computed: null,
    policy_pass: null,
    policy_fail: null,
    requires_approval: null,
    approved: null,
    rejected: null,
    mutated: null,
    notified: null,
    escalate: null,
    error: "FAILED",
  },
  FAILED: {
    decomposed: null,
    assessed: null,
    computed: null,
    policy_pass: null,
    policy_fail: null,
    requires_approval: null,
    approved: null,
    rejected: null,
    mutated: null,
    notified: null,
    escalate: null,
    error: null,
  },
};

/** Map BPaaS fine-grained states to the coarse ProcessFSM states for agent_queue. */
const BPAAS_TO_COARSE: Record<BPaaSState, ProcessFSM["state"]> = {
  DECOMPOSE: "running",
  ASSESS: "running",
  COMPUTE: "running",
  POLICY_CHECK: "running",
  APPROVAL_GATE: "awaiting_hitl",
  MUTATE: "running",
  SCHEDULE_NOTIFY: "running",
  COMPLETE: "completed",
  ESCALATE: "paused",
  FAILED: "failed",
};

// ── BPaaSFSMRunner ─────────────────────────────────────────────────────────

export class BPaaSFSMRunner {
  private state: BPaaSState;
  private context: BPaaSContext;
  /** Coarse-grained FSM used for agent_queue persistence. */
  private processFSM: ProcessFSM;

  constructor(
    context: BPaaSContext,
    initialState: BPaaSState = "DECOMPOSE"
  ) {
    this.context = { ...context };
    this.state = initialState;
    this.processFSM = new ProcessFSM();
    // Sync coarse FSM to initial state
    this.processFSM.transition(BPAAS_TO_COARSE[initialState]);
  }

  // ── Accessors ───────────────────────────────────────────────────────────

  getCurrentState(): BPaaSState {
    return this.state;
  }

  getContext(): BPaaSContext {
    return { ...this.context };
  }

  // ── Lambda budget ───────────────────────────────────────────────────────

  /**
   * Returns true when the Lambda is near its 75s budget.
   * Caller should call checkpointAndChain() and return if this is true.
   */
  shouldChain(): boolean {
    return shouldChain(this.context.startedAt);
  }

  // ── State Transition ────────────────────────────────────────────────────

  /**
   * Transition to the next BPaaS state based on the event.
   *
   * Responsibilities:
   * 1. Validate the transition is legal
   * 2. Record exit time in stateHistory for the departing state
   * 3. Add an entry for the new state
   * 4. Emit a step-level RL signal (fire-and-forget)
   * 5. Log the decision (fire-and-forget, EU AI Act Article 13)
   * 6. Sync the coarse ProcessFSM state
   *
   * Does NOT call save() — caller must do that after each transition to
   * avoid a save mid-batch when multiple transitions happen in sequence.
   *
   * @throws Error if the transition is illegal (no target state defined)
   */
  async transition(
    event: BPaaSTransitionEvent,
    supabase?: SupabaseClient
  ): Promise<BPaaSState> {
    const stateTransitions = TRANSITIONS[this.state];
    if (!stateTransitions) {
      throw new Error(
        `[BPaaSFSMRunner] Unknown current state: ${this.state}`
      );
    }

    const nextState = stateTransitions[event];
    if (nextState === null || nextState === undefined) {
      throw new Error(
        `[BPaaSFSMRunner] Illegal transition: ${this.state} --[${event}]--> (no target state)`
      );
    }

    const now = Date.now();
    const prevState = this.state;
    const stepStartMs =
      this.context.stateHistory.length > 0
        ? (this.context.stateHistory[this.context.stateHistory.length - 1]
            ?.enteredAt ?? now)
        : this.context.startedAt;

    // Mark exit time on the last open history entry
    const lastEntry = this.context.stateHistory[
      this.context.stateHistory.length - 1
    ];
    if (lastEntry && !lastEntry.exitedAt) {
      lastEntry.exitedAt = now;
      lastEntry.outcome = event;
    }

    // Push entry for the new state
    this.context.stateHistory.push({
      state: nextState,
      enteredAt: now,
    });

    // Advance fine-grained state
    this.state = nextState;

    // Sync coarse ProcessFSM
    const coarseState = BPAAS_TO_COARSE[nextState];
    this.processFSM.transition(coarseState);

    const durationMs = now - stepStartMs;
    const isTerminalFailure = nextState === "FAILED";
    const domain = `bpaas.${this.context.processType}`;

    // RL signal — fire-and-forget
    if (supabase) {
      void recordStepOutcome(supabase, {
        organizationId: this.context.organizationId,
        domain,
        stepName: prevState,
        stepIndex: this.context.stateHistory.length - 1,
        success: !isTerminalFailure,
        durationMs,
        errorMessage: isTerminalFailure ? `Transition event: ${event}` : undefined,
      });

      // Decision log — EU AI Act Article 13 compliance
      void logDecision(supabase, {
        organizationId: this.context.organizationId,
        decisionType: "domain_routing",
        inputContext: {
          prevState,
          event,
          processType: this.context.processType,
          processInstanceId: this.context.processInstanceId,
        },
        decisionMade: {
          nextState,
          coarseState,
        },
        rationale: `BPaaS state transition: ${prevState} --[${event}]--> ${nextState}`,
        domain,
        jobId: this.context.jobId,
      });
    }

    logger.warn(`[BPaaSFSMRunner] Transition: ${prevState} --[${event}]--> ${nextState}`, {
      jobId: this.context.jobId,
      processType: this.context.processType,
      processInstanceId: this.context.processInstanceId,
    });

    return nextState;
  }

  // ── POLICY_CHECK gate ───────────────────────────────────────────────────

  /**
   * Run policy constraints for this org.
   * Updates context.policyOutcome and transitions accordingly.
   *
   * - policy_pass → APPROVAL_GATE
   * - policy_fail → ESCALATE
   *
   * Returns the resulting state.
   */
  async runPolicyCheck(supabase: SupabaseClient): Promise<BPaaSState> {
    if (this.state !== "POLICY_CHECK") {
      throw new Error(
        `[BPaaSFSMRunner] runPolicyCheck() called in wrong state: ${this.state}`
      );
    }

    const result = await evaluateConstraints(supabase, this.context.organizationId);

    this.context.policyOutcome = {
      passed: result.allowed,
      rules: result.policyName ? [result.policyName] : [],
      escalationLevel: result.allowed ? undefined : "policy_block",
    };

    const event: BPaaSTransitionEvent = result.allowed ? "policy_pass" : "policy_fail";
    return this.transition(event, supabase);
  }

  // ── APPROVAL_GATE ────────────────────────────────────────────────────────

  /**
   * Check the HITL gate for the MUTATE action.
   *
   * If blocked:
   *   1. Transitions to APPROVAL_GATE (self-loop via requires_approval)
   *   2. Stores approvalId in context
   *   3. Calls pauseJobAtDecisionGate() to suspend the agent_queue job
   *   4. Returns true — caller must stop execution and return a 202
   *
   * If not blocked:
   *   1. Transitions via "approved" → MUTATE
   *   2. Returns false — caller continues execution
   */
  async runApprovalGate(
    supabase: SupabaseClient,
    params: {
      summary: string;
      details?: Record<string, unknown>;
      confidence?: number;
    }
  ): Promise<{ blocked: boolean; approvalId?: string }> {
    if (this.state !== "APPROVAL_GATE") {
      throw new Error(
        `[BPaaSFSMRunner] runApprovalGate() called in wrong state: ${this.state}`
      );
    }

    const { blocked, approvalId } = await checkHitlGate(supabase, {
      orgId: this.context.organizationId,
      gateType: "high_confidence_action",
      jobId: this.context.jobId,
      summary: params.summary,
      details: params.details,
      confidence: params.confidence,
    });

    if (blocked) {
      // Self-loop: APPROVAL_GATE --[requires_approval]--> APPROVAL_GATE
      await this.transition("requires_approval", supabase);

      this.context.approvalId = approvalId;

      // Suspend the agent_queue job — human must respond via POST /api/agents/{id}/resume
      await pauseJobAtDecisionGate(
        supabase,
        this.context.jobId,
        this.context.organizationId,
        {
          phase: "APPROVAL_GATE",
          entityIds: [this.context.processInstanceId],
          partialResults: {
            decomposedPlan: this.context.decomposedPlan,
            assessedFacts: this.context.assessedFacts,
            computedValues: this.context.computedValues,
            policyOutcome: this.context.policyOutcome,
          },
          escalationQuestion: params.summary,
          resumeInstruction: `Resume BPaaS process ${this.context.processType} (instance: ${this.context.processInstanceId}) from APPROVAL_GATE after human approval. approvalId=${approvalId}`,
          escalationType: "admin-approval",
          metadata: {
            approvalId,
            processType: this.context.processType,
            processInstanceId: this.context.processInstanceId,
          },
        }
      );

      return { blocked: true, approvalId };
    }

    // Not blocked — proceed to MUTATE
    await this.transition("approved", supabase);
    return { blocked: false };
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  /**
   * Persist the current runner state to:
   * 1. bpaas_process_instances.fsm_state (full BPaaSContext + fine-grained state)
   * 2. agent_queue.metadata via processFSM.save() (coarse state for job worker)
   *
   * Non-fatal — logs warnings on failure but never throws.
   */
  async save(supabase: SupabaseClient): Promise<void> {
    // Persist fine-grained BPaaS context to bpaas_process_instances
    // Column names per migration 20260228100001_bpaas_foundation.sql:
    //   current_state TEXT — the FSM state name (e.g. "ASSESS", "MUTATE")
    //   fsm_state JSONB    — working memory / full BPaaSContext for restore
    //   (there is NO fsm_context column — fsm_state IS the context store)
    try {
      const { error } = await supabase
        .from("bpaas_process_instances")
        .update({
          current_state: this.state,
          fsm_state: this.context as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq("id", this.context.processInstanceId)
        .eq("organization_id", this.context.organizationId);

      if (error) {
        logger.warn("[BPaaSFSMRunner] save: bpaas_process_instances update failed", {
          processInstanceId: this.context.processInstanceId,
          error: error.message,
        });
      }
    } catch (err) {
      logger.warn("[BPaaSFSMRunner] save: bpaas_process_instances threw", {
        processInstanceId: this.context.processInstanceId,
        err,
      });
    }

    // Persist coarse state to agent_queue.metadata via ProcessFSM
    await this.processFSM.save(supabase, this.context.jobId);
  }

  /**
   * Save a deep checkpoint to agent_queue.checkpoint_data for Lambda chaining.
   * Call this when shouldChain() returns true, then call chainContinuation().
   *
   * Uses saveDeepCheckpoint() — sets status = 'paused' on the agent_queue row.
   */
  async saveChainCheckpoint(
    supabase: SupabaseClient,
    chainDepth: number
  ): Promise<void> {
    await saveDeepCheckpoint(supabase, this.context.jobId, {
      jobId: this.context.jobId,
      phase: this.state,
      phaseLabel: `BPaaS ${this.context.processType} — ${this.state}`,
      conversationHistory: [],  // BPaaS FSM runner is not LLM-conversation-based
      completedTickets: this.context.stateHistory
        .filter((h) => h.exitedAt !== undefined)
        .map((h) => h.state),
      contextWindow: {
        tokensUsed: 0,
        systemPrompt: "",
        lastUserMessage: JSON.stringify(this.context.inputPayload).slice(0, 200),
      },
      chainDepth,
    });
  }

  // ── Static Restore ───────────────────────────────────────────────────────

  /**
   * Restore a BPaaSFSMRunner from the database.
   *
   * Load order:
   * 1. bpaas_process_instances WHERE id = context.processInstanceId — preferred
   *    (contains the full BPaaSContext with fine-grained state)
   * 2. agent_queue.metadata WHERE id = jobId — fallback (coarse state only,
   *    reconstructed with empty stateHistory)
   *
   * Returns null if the job cannot be found or the context is unrecoverable.
   */
  static async restore(
    supabase: SupabaseClient,
    jobId: string
  ): Promise<BPaaSFSMRunner | null> {
    // 1. Try agent_queue to get the processInstanceId from payload
    try {
      const { data: jobRow, error: jobErr } = await supabase
        .from("agent_queue")
        .select("payload, metadata, organization_id")
        .eq("id", jobId)
        .single();

      if (jobErr || !jobRow) {
        logger.warn("[BPaaSFSMRunner] restore: agent_queue lookup failed", {
          jobId,
          error: jobErr?.message,
        });
        return null;
      }

      const payload = jobRow.payload as Record<string, unknown>;
      const processInstanceId =
        (payload?.processInstanceId as string) ??
        (payload?.bpaas_instance_id as string);

      // 2. Try bpaas_process_instances for full context (preferred path)
      // Column names per migration:
      //   current_state TEXT — the FSM state name
      //   fsm_state JSONB    — working memory / full BPaaSContext
      if (processInstanceId) {
        const { data: instanceRow } = await supabase
          .from("bpaas_process_instances")
          .select("current_state, fsm_state")
          .eq("id", processInstanceId)
          .single();

        if (instanceRow?.fsm_state) {
          const savedContext = instanceRow.fsm_state as BPaaSContext;
          const savedState = (instanceRow.current_state as BPaaSState) ?? "DECOMPOSE";

          logger.warn("[BPaaSFSMRunner] restore: restored from bpaas_process_instances", {
            jobId,
            processInstanceId,
            state: savedState,
          });

          return new BPaaSFSMRunner(savedContext, savedState);
        }
      }

      // 3. Fallback: reconstruct from agent_queue.metadata (coarse state only)
      const metadata = jobRow.metadata as Record<string, unknown> | null;
      const bpaasContext = metadata?.bpaas_fsm_context as BPaaSContext | undefined;

      if (bpaasContext) {
        const coarseFsmState = (metadata?.fsm_state as string) ?? "running";
        // Map coarse → fine-grained: running → last known BPaaS state or DECOMPOSE
        const fallbackState: BPaaSState =
          coarseFsmState === "awaiting_hitl"
            ? "APPROVAL_GATE"
            : coarseFsmState === "paused"
            ? "ESCALATE"
            : coarseFsmState === "completed"
            ? "COMPLETE"
            : coarseFsmState === "failed"
            ? "FAILED"
            : "DECOMPOSE";

        logger.warn("[BPaaSFSMRunner] restore: fell back to agent_queue.metadata", {
          jobId,
          fallbackState,
        });

        return new BPaaSFSMRunner(bpaasContext, fallbackState);
      }

      logger.warn("[BPaaSFSMRunner] restore: no restorable context found", { jobId });
      return null;
    } catch (err) {
      logger.warn("[BPaaSFSMRunner] restore: threw unexpectedly", { jobId, err });
      return null;
    }
  }
}
