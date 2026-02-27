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
import { BPaaSFSMRunner } from "./fsm-runner";
import type { BPaaSContext, BPaaSState } from "./fsm-runner";
import { getProcessDefinition, bpaasDomain } from "./process-registry";
import { runPolicyCheck } from "./policy-checker";
import type { PolicyContext } from "./policy-checker";
import { getBrainContext } from "@/lib/brain/brain-context";
import { recordAgentOutcome, computeAgentQuality } from "@/lib/brain/agent-rl";
import { logger } from "@/lib/logger";

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

// ── LLM Caller ───────────────────────────────────────────────────────────────

async function callHaiku(params: {
  apiKey: string;
  systemPrompt: string;
  userContent: string;
}): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey: params.apiKey });
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userContent }],
  });
  const content = response.content[0];
  return content.type === "text" ? content.text : "";
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

    const context: BPaaSContext = {
      processType: params.processType,
      processInstanceId,
      jobId: params.jobId,
      organizationId: params.organizationId,
      inputPayload: params.inputPayload,
      stateHistory: [{ state: "DECOMPOSE", enteredAt: Date.now() }],
      startedAt,
    };

    runner = new BPaaSFSMRunner(context, "DECOMPOSE");
  }

  // ── State machine loop ────────────────────────────────────────────────────
  let lastError: string | undefined;
  const domain = bpaasDomain(params.processType);

  const terminalStates: BPaaSState[] = ["COMPLETE", "FAILED", "ESCALATE", "APPROVAL_GATE"];

  while (!terminalStates.includes(runner.getCurrentState())) {
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

    try {
      // ── DECOMPOSE ─────────────────────────────────────────────────────────
      if (currentState === "DECOMPOSE") {
        const systemPrompt = [
          "You are a BPaaS process decomposer. Break the input payload into a structured execution plan.",
          "Return a JSON object with fields: steps (array of step names), entities (key business objects), constraints (rules to check), metadata (any useful context).",
          brainContextSummary ? `\n## Brain Context\n${brainContextSummary}` : "",
          bpaasPatterns ? `\n## BPaaS Quality Patterns\n${bpaasPatterns}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const userContent = [
          `Process type: ${params.processType}`,
          `Input payload: ${JSON.stringify(params.inputPayload, null, 2)}`,
        ].join("\n\n");

        let decomposedText = "";
        try {
          decomposedText = await callHaiku({ apiKey, systemPrompt, userContent });
        } catch (llmErr) {
          throw new Error(`DECOMPOSE LLM failed: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`);
        }

        // Parse JSON result — fall back to wrapping raw text
        let decomposedPlan: Record<string, unknown>;
        try {
          decomposedPlan = JSON.parse(decomposedText) as Record<string, unknown>;
        } catch {
          decomposedPlan = { raw: decomposedText };
        }

        runner.getContext(); // side-effect: ensure context is current
        // Mutate context directly through runner's exposed context reference
        const ctx = runner.getContext();
        const updatedCtx: BPaaSContext = { ...ctx, decomposedPlan };
        // Re-construct runner in same state with updated context
        const currentFsmState = runner.getCurrentState();
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState);

        await runner.transition("decomposed", supabase);
        await runner.save(supabase);
      }

      // ── ASSESS ────────────────────────────────────────────────────────────
      else if (currentState === "ASSESS") {
        const ctx = runner.getContext();

        const systemPrompt = [
          "You are a BPaaS process assessor. Analyse the decomposed plan and extract assessed facts.",
          "Return a JSON object with fields: entities (key-value map of business entities and their values), ",
          "numeric_values (map of field names to numbers for policy evaluation), ",
          "boolean_flags (map of flag names to booleans), ",
          "business_rules (array of applicable rule descriptions).",
          brainContextSummary ? `\n## Brain Context\n${brainContextSummary}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const userContent = [
          `Process type: ${params.processType}`,
          `Original payload: ${JSON.stringify(ctx.inputPayload, null, 2)}`,
          `Decomposed plan: ${JSON.stringify(ctx.decomposedPlan, null, 2)}`,
        ].join("\n\n");

        let assessedText = "";
        try {
          assessedText = await callHaiku({ apiKey, systemPrompt, userContent });
        } catch (llmErr) {
          throw new Error(`ASSESS LLM failed: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`);
        }

        let assessedFacts: Record<string, unknown>;
        try {
          assessedFacts = JSON.parse(assessedText) as Record<string, unknown>;
        } catch {
          assessedFacts = { raw: assessedText };
        }

        const updatedCtx: BPaaSContext = { ...ctx, assessedFacts };
        const currentFsmState = runner.getCurrentState();
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState);

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
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState);

        await runner.transition("computed", supabase);
        await runner.save(supabase);
      }

      // ── POLICY_CHECK ──────────────────────────────────────────────────────
      else if (currentState === "POLICY_CHECK") {
        // Deterministic — delegates to policy-checker.ts, zero LLM
        const ctx = runner.getContext();

        let definition;
        try {
          definition = await getProcessDefinition(
            params.processType,
            params.organizationId,
            supabase
          );
        } catch (defErr) {
          throw new Error(
            `POLICY_CHECK: getProcessDefinition failed: ${defErr instanceof Error ? defErr.message : String(defErr)}`
          );
        }

        const policyCtx: PolicyContext = extractPolicyContext(
          (ctx.computedValues ?? {}) as Record<string, unknown>
        );

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
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState);

        if (policyResult.passed) {
          await runner.transition("policy_pass", supabase);
        } else {
          await runner.transition("policy_fail", supabase);
        }
        await runner.save(supabase);

        // If policy failed, state is now ESCALATE — loop will terminate
        if (!policyResult.passed) {
          const escalationLvl = policyResult.escalationLevel ?? "policy_block";
          return {
            status: "escalated",
            processInstanceId,
            processType: params.processType,
            finalState: runner.getCurrentState(),
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

        // Upsert the business entity change into bpaas_process_mutations
        // Non-fatal: mutation table may not exist in all deployments
        try {
          await supabase.from("bpaas_process_mutations").insert({
            organization_id: params.organizationId,
            process_instance_id: processInstanceId,
            process_type: params.processType,
            mutation_data: mutationData,
            created_at: new Date().toISOString(),
          });
        } catch (mutErr) {
          logger.warn("[BPaaS/DomainExecutor] MUTATE: bpaas_process_mutations insert failed (non-fatal)", {
            processInstanceId,
            error: mutErr instanceof Error ? mutErr.message : String(mutErr),
          });
        }

        const mutationResult: Record<string, unknown> = {
          mutated: true,
          mutatedAt: new Date().toISOString(),
          fields: Object.keys(mutationData),
        };

        const updatedCtx: BPaaSContext = { ...ctx, mutationResult };
        const currentFsmState = runner.getCurrentState();
        runner = new BPaaSFSMRunner(updatedCtx, currentFsmState);

        await runner.transition("mutated", supabase);
        await runner.save(supabase);
      }

      // ── SCHEDULE_NOTIFY ───────────────────────────────────────────────────
      else if (currentState === "SCHEDULE_NOTIFY") {
        // Fire-and-forget notification job — no LLM
        const ctx = runner.getContext();

        try {
          await supabase.from("agent_queue").insert({
            organization_id: params.organizationId,
            agent_type: "bpaas",
            task_type: "send-notification",
            priority: "low",
            status: "pending",
            payload: {
              processType: params.processType,
              processInstanceId,
              jobId: params.jobId,
              mutationResult: ctx.mutationResult,
              notificationContext: {
                summary: buildApprovalSummary(
                  params.processType,
                  ctx.computedValues,
                  ctx.policyOutcome
                ),
              },
            },
            created_at: new Date().toISOString(),
          });
        } catch (notifyErr) {
          logger.warn("[BPaaS/DomainExecutor] SCHEDULE_NOTIFY: agent_queue insert failed (non-fatal)", {
            processInstanceId,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }

        await runner.transition("notified", supabase);
        await runner.save(supabase);
      }

      else {
        // Unknown state — break to avoid infinite loop
        logger.warn("[BPaaS/DomainExecutor] Unknown state in loop, breaking", {
          state: currentState,
          processInstanceId,
        });
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn("[BPaaS/DomainExecutor] State execution failed", {
        state: currentState,
        processInstanceId,
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

  const outputResult: Record<string, unknown> = {
    processType: params.processType,
    processInstanceId,
    finalState,
    computedValues: ctx.computedValues,
    mutationResult: ctx.mutationResult,
    stateCount: ctx.stateHistory.length,
    durationMs,
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
  try {
    const resultJson = JSON.stringify(outputResult);
    const quality = computeAgentQuality(
      resultJson,
      status === "failed" ? new Error(lastError ?? "process failed") : null,
      durationMs,
      domain
    );

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
    });
  } catch (rlErr) {
    logger.warn("[BPaaS/DomainExecutor] RL outcome recording failed (non-fatal)", {
      processInstanceId,
      error: rlErr instanceof Error ? rlErr.message : String(rlErr),
    });
  }

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
