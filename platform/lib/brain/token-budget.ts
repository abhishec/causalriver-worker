/**
 * FSM Token Budget Tracker
 * =========================
 *
 * Tracks LLM token consumption across FSM state transitions and enforces
 * a per-process token budget to prevent runaway costs.
 *
 * Token budget per process execution: 100,000 tokens (configurable)
 * Warning threshold: 80% used → log warning + switch to Haiku
 * Hard limit: 100% used → skip remaining LLM calls, use cached/default outputs
 *
 * Also provides answer format discipline: ensures all LLM outputs follow
 * the structured answer format (JSON with required fields).
 *
 * Design principles:
 * - All state updates are pure / synchronous — no DB calls, never blocks execution
 * - recordTokenUsage() returns an updated budget (immutable update pattern)
 * - shouldSkipLLMCall() and getRecommendedModel() are pure reads from budget state
 * - formatCompetitionAnswer() produces clean markdown for an AgentX judge
 */

import { logger } from "@/lib/logger";

// ── Constants ──────────────────────────────────────────────────────────────────

export const DEFAULT_PROCESS_TOKEN_BUDGET = 100_000;
export const BUDGET_WARNING_THRESHOLD = 0.80;
export const BUDGET_HARD_LIMIT = 1.00;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TokenBudget {
  processInstanceId: string;
  processType: string;
  /** Total tokens allowed for this process execution */
  budgetTokens: number;
  /** Tokens consumed so far across all FSM states */
  usedTokens: number;
  /** Per-state token breakdown — keyed by FSM state name */
  stateBreakdown: Record<string, number>;
  /** True once usedTokens / budgetTokens crosses BUDGET_WARNING_THRESHOLD */
  warningFired: boolean;
  /** True once usedTokens / budgetTokens crosses BUDGET_HARD_LIMIT */
  hardLimitReached: boolean;
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Create a fresh TokenBudget for a new process execution.
 *
 * @param processInstanceId - FK to bpaas_process_instances.id
 * @param processType       - e.g. "hr_offboarding", "procurement"
 * @param budgetTokens      - optional override; defaults to DEFAULT_PROCESS_TOKEN_BUDGET
 */
export function createTokenBudget(
  processInstanceId: string,
  processType: string,
  budgetTokens: number = DEFAULT_PROCESS_TOKEN_BUDGET
): TokenBudget {
  return {
    processInstanceId,
    processType,
    budgetTokens,
    usedTokens: 0,
    stateBreakdown: {},
    warningFired: false,
    hardLimitReached: false,
  };
}

// ── Mutation (immutable update) ────────────────────────────────────────────────

/**
 * Record token usage for a completed FSM state and return an updated budget.
 *
 * Thresholds are evaluated after adding the new usage:
 *   - >= 80%  → sets warningFired = true, logs a warning (once per process)
 *   - >= 100% → sets hardLimitReached = true, logs a warning
 *
 * This function is pure and synchronous — it never throws or blocks.
 *
 * @param budget     - current TokenBudget (not mutated)
 * @param stateName  - FSM state that just ran (e.g. "DECOMPOSE", "ASSESS")
 * @param tokensUsed - tokens consumed by the LLM call in that state (0 if no LLM)
 * @returns updated TokenBudget (new object — does not mutate input)
 */
export function recordTokenUsage(
  budget: TokenBudget,
  stateName: string,
  tokensUsed: number
): TokenBudget {
  if (tokensUsed <= 0) return budget;

  const newUsed = budget.usedTokens + tokensUsed;
  const newBreakdown: Record<string, number> = {
    ...budget.stateBreakdown,
    [stateName]: (budget.stateBreakdown[stateName] ?? 0) + tokensUsed,
  };

  const usageRatio = newUsed / budget.budgetTokens;
  let { warningFired, hardLimitReached } = budget;

  if (!hardLimitReached && usageRatio >= BUDGET_HARD_LIMIT) {
    hardLimitReached = true;
    logger.warn("[TokenBudget] Hard limit reached — remaining LLM calls will be skipped", {
      processInstanceId: budget.processInstanceId,
      processType: budget.processType,
      usedTokens: newUsed,
      budgetTokens: budget.budgetTokens,
      stateName,
    });
  } else if (!warningFired && usageRatio >= BUDGET_WARNING_THRESHOLD) {
    warningFired = true;
    logger.warn("[TokenBudget] Warning threshold crossed — switching to Haiku for remaining states", {
      processInstanceId: budget.processInstanceId,
      processType: budget.processType,
      usedTokens: newUsed,
      budgetTokens: budget.budgetTokens,
      percentUsed: Math.round(usageRatio * 100),
      stateName,
    });
  }

  return {
    ...budget,
    usedTokens: newUsed,
    stateBreakdown: newBreakdown,
    warningFired,
    hardLimitReached,
  };
}

// ── Pure Reads ─────────────────────────────────────────────────────────────────

/**
 * Returns the number of tokens remaining in the budget.
 * Always returns 0 or more — never negative.
 */
export function getRemainingBudget(budget: TokenBudget): number {
  return Math.max(0, budget.budgetTokens - budget.usedTokens);
}

/**
 * Returns true when the process has consumed 100% of its token budget.
 * Callers should skip LLM calls and use cached/default outputs instead.
 *
 * Token budget enforcement must NEVER block execution — callers should degrade
 * gracefully (e.g. use a deterministic fallback or previous state output).
 */
export function shouldSkipLLMCall(budget: TokenBudget): boolean {
  return budget.hardLimitReached;
}

/**
 * Returns the recommended model based on current budget pressure.
 *
 * - > 80% used → "haiku" (cost reduction mode — warning threshold already crossed)
 * - Otherwise  → "sonnet" (standard quality, sufficient for most BPaaS states)
 *
 * Note: Opus is never recommended from budget pressure alone — use the main
 * model-router.ts for Opus escalation decisions.
 */
export function getRecommendedModel(budget: TokenBudget): "haiku" | "sonnet" | "opus" {
  if (budget.warningFired) return "haiku";
  return "sonnet";
}

// ── Progressive Efficiency Hints ───────────────────────────────────────────────

/**
 * Returns a system prompt suffix with budget guidance at key thresholds.
 * Returns empty string when budget is healthy (< 30% used).
 *
 * Thresholds:
 *   >= 30% — Awareness hint: be concise
 *   >= 60% — Caution hint: prioritize key points, reduce examples
 *   >= 80% — Warning hint: switch to compressed mode
 *   >= 100% — Hard stop: no LLM calls (shouldSkipLLMCall === true)
 *
 * Designed to be injected into the system prompt dynamically.
 * Never throws — returns "" on any unexpected input.
 */
export function getEfficiencyHint(budget: TokenBudget): string {
  try {
    if (!budget || budget.budgetTokens <= 0) return "";

    const ratio = budget.usedTokens / budget.budgetTokens;

    if (ratio >= 1.0) {
      return "\n\n## TOKEN BUDGET: EXHAUSTED\nToken budget fully consumed. Return a brief summary only — no elaboration.";
    }

    if (ratio >= 0.80) {
      return "\n\n## TOKEN BUDGET: CRITICAL (80%+ used)\nCompress all responses: use bullet points, skip preambles, omit examples. Prioritize final answer only.";
    }

    if (ratio >= 0.60) {
      return "\n\n## TOKEN BUDGET: CAUTION (60%+ used)\nBe concise. Lead with conclusions. Skip lengthy explanations unless critical to the answer.";
    }

    if (ratio >= 0.30) {
      return "\n\n## TOKEN BUDGET: AWARENESS (30%+ used)\nPrefer direct, structured answers. Avoid unnecessary elaboration.";
    }

    return "";
  } catch {
    return "";
  }
}

/**
 * Returns the current budget usage as a percentage string (e.g. "45%").
 * Useful for logging and monitoring.
 */
export function getBudgetUsagePercent(budget: TokenBudget): string {
  if (!budget || budget.budgetTokens <= 0) return "0%";
  const pct = Math.round((budget.usedTokens / budget.budgetTokens) * 100);
  return `${pct}%`;
}

// ── Answer Format ──────────────────────────────────────────────────────────────

/**
 * Format any process result into a clean, structured answer readable by an AgentX judge.
 *
 * Output format (markdown):
 *
 *   ## Process Execution Complete
 *   **Type**: {processType}
 *   **Status**: {status}
 *   **Duration**: {durationMs}ms
 *   **Result**: {JSON.stringify(result, null, 2)}
 *   **Quality**: {quality}/1.0
 *
 * Used at COMPLETE state to produce the final A2A artifact text.
 *
 * @param result      - the process outputResult object (any shape)
 * @param processType - e.g. "hr_offboarding"
 * @param durationMs  - total wall-clock ms for the process
 */
export function formatCompetitionAnswer(
  result: unknown,
  processType: string,
  durationMs: number
): string {
  // Derive status and quality from the result shape
  let status = "unknown";
  let quality = 0.5;

  if (result !== null && typeof result === "object") {
    const r = result as Record<string, unknown>;

    if (typeof r.finalState === "string") {
      const stateToStatus: Record<string, string> = {
        COMPLETE: "completed",
        FAILED: "failed",
        ESCALATE: "escalated",
      };
      status = stateToStatus[r.finalState] ?? r.finalState.toLowerCase();
    }

    // Compute a simple quality score from the result fields
    const allStatesCompleted = r.finalState === "COMPLETE";
    const stateCount = typeof r.stateCount === "number" ? r.stateCount : 0;
    const hasMutation = !!r.mutationResult;

    if (allStatesCompleted && hasMutation) quality = 1.0;
    else if (allStatesCompleted) quality = 0.85;
    else if (stateCount > 2) quality = 0.6;
    else quality = 0.3;
  }

  // Serialize result — limit to 4KB to keep the artifact readable
  let resultJson: string;
  try {
    const full = JSON.stringify(result, null, 2);
    resultJson = full.length > 4096 ? full.slice(0, 4093) + "..." : full;
  } catch (err: unknown) {
    // JSON.stringify can throw on circular references — fall back to String()
    logger.warn("[TokenBudget] formatCompetitionAnswer: JSON.stringify failed on result", {
      processType,
      error: err instanceof Error ? err.message : String(err),
    });
    resultJson = String(result);
  }

  return [
    `## Process Execution Complete`,
    `**Type**: ${processType}`,
    `**Status**: ${status}`,
    `**Duration**: ${durationMs}ms`,
    `**Result**:\n\`\`\`json\n${resultJson}\n\`\`\``,
    `**Quality**: ${quality.toFixed(2)}/1.0`,
  ].join("\n");
}
