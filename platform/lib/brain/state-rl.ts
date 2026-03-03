/**
 * State-Level Online Gradient Descent RL
 * ========================================
 *
 * Maintains per-state RL parameters for each FSM state in each process type.
 * Parameters adapt via online gradient descent after each state execution.
 *
 * The gradient is computed from the quality signal:
 *   loss = (1 - quality)^2  (MSE loss, target quality = 1.0)
 *   dL/d(param) = 2 * (quality - 1) * (d_predicted_quality / d_param)
 *
 * For each parameter, we model a simple linear relationship between the parameter
 * value and the predicted quality. The partial derivatives are approximated from
 * the direction of the quality signal:
 *
 *   escalation_threshold: higher threshold → fewer false-positive escalations → better quality
 *     d_quality/d_escalation_threshold ≈ sign depends on regime:
 *       quality < 0.5 (failure): threshold was too high — reduce it  → gradient pushes DOWN
 *       quality > 0.8 (success): threshold may be too hair-trigger  → gradient pushes UP
 *
 *   timeout_multiplier: higher multiplier → more time → fewer timeouts → better quality
 *     quality < 0.5: not enough time likely caused failure → push UP
 *     quality > 0.8: state ran well → nudge toward 1.0 (efficiency optimum)
 *
 *   retry_budget (treated as continuous for gradient, rounded on storage):
 *     quality < 0.5: more retries might have helped → push UP
 *     quality > 0.8: retries cost overhead → push toward lower values (nudge DOWN slightly)
 *
 *   confidence_weight: weight on confidence signals in escalation decision
 *     quality < 0.5: confidence may have been over-trusted → reduce weight
 *     quality > 0.8: weight was appropriate or caused correct routing → reinforce
 *
 * Update rule (standard SGD with clipping):
 *   new_param = clamp(old_param - learning_rate * gradient, [min, max])
 *
 * Parameters learned:
 *   - escalation_threshold ∈ [0.3, 0.95]
 *   - timeout_multiplier   ∈ [0.5, 3.0]
 *   - retry_budget         ∈ [0, 5]  (rounded to int on storage)
 *   - confidence_weight    ∈ [0.1, 0.9]
 *
 * All functions are fire-and-forget safe — never throw, only logger.warn on failure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { recordAgentOutcome } from "@/lib/brain/agent-rl";

// ── Types ──────────────────────────────────────────────────────────────────

export interface StateRLParams {
  id?: string;
  organizationId: string;
  processType: string;
  stateName: string;
  // Learned parameters
  escalationThreshold: number;
  timeoutMultiplier: number;
  retryBudget: number;
  confidenceWeight: number;
  // Gradient descent tracking
  learningRate: number;
  gradientSum: number;
  updateCount: number;
  lastLoss: number | null;
}

/** Parameter bounds — clamp to valid ranges after each update */
const PARAM_BOUNDS = {
  escalationThreshold: { min: 0.3, max: 0.95 },
  timeoutMultiplier:   { min: 0.5, max: 3.0 },
  retryBudget:         { min: 0,   max: 5 },
  confidenceWeight:    { min: 0.1, max: 0.9 },
} as const;

/** Default parameter values (conservative baselines). */
const DEFAULT_PARAMS: Omit<StateRLParams, "id" | "organizationId" | "processType" | "stateName"> = {
  escalationThreshold: 0.7,
  timeoutMultiplier:   1.0,
  retryBudget:         2,
  confidenceWeight:    0.5,
  learningRate:        0.01,
  gradientSum:         0.0,
  updateCount:         0,
  lastLoss:            null,
};

// ── Module-Level Cache (5-minute TTL) ─────────────────────────────────────

interface CacheEntry {
  params: StateRLParams;
  cachedAt: number;
}

const _paramsCache = new Map<string, CacheEntry>();
const PARAMS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function _cacheKey(orgId: string, processType: string, stateName: string): string {
  return `${orgId}:${processType}:${stateName}`;
}

function _invalidateCache(orgId: string, processType: string, stateName: string): void {
  _paramsCache.delete(_cacheKey(orgId, processType, stateName));
}

// ── DB Row ↔ StateRLParams Mapping ─────────────────────────────────────────

interface ProcessStateRLParamsRow {
  id: string;
  organization_id: string;
  process_type: string;
  state_name: string;
  escalation_threshold: number;
  timeout_multiplier: number;
  retry_budget: number;
  confidence_weight: number;
  learning_rate: number;
  gradient_sum: number;
  update_count: number;
  last_loss: number | null;
}

function _rowToParams(row: ProcessStateRLParamsRow): StateRLParams {
  return {
    id:                  row.id,
    organizationId:      row.organization_id,
    processType:         row.process_type,
    stateName:           row.state_name,
    escalationThreshold: row.escalation_threshold,
    timeoutMultiplier:   row.timeout_multiplier,
    retryBudget:         row.retry_budget,
    confidenceWeight:    row.confidence_weight,
    learningRate:        row.learning_rate,
    gradientSum:         row.gradient_sum,
    updateCount:         row.update_count,
    lastLoss:            row.last_loss,
  };
}

// ── loadStateParams ────────────────────────────────────────────────────────

/**
 * Load per-state RL parameters for (orgId, processType, stateName).
 * Returns defaults if no row exists yet.
 * Results are cached for 5 minutes per unique key.
 */
export async function loadStateParams(
  supabase: SupabaseClient,
  orgId: string,
  processType: string,
  stateName: string
): Promise<StateRLParams> {
  const key = _cacheKey(orgId, processType, stateName);
  const cached = _paramsCache.get(key);
  if (cached && Date.now() - cached.cachedAt < PARAMS_CACHE_TTL) {
    return cached.params;
  }

  try {
    const { data, error } = await supabase
      .from("process_state_rl_params")
      .select("*")
      .eq("organization_id", orgId)
      .eq("process_type", processType)
      .eq("state_name", stateName)
      .maybeSingle();

    if (error) {
      logger.warn("[state-rl] loadStateParams: DB query failed (using defaults)", {
        error: error.message,
        orgId: orgId.slice(0, 8),
        processType,
        stateName,
      });
      const defaults = _defaultParams(orgId, processType, stateName);
      _paramsCache.set(key, { params: defaults, cachedAt: Date.now() });
      return defaults;
    }

    if (!data) {
      // No row yet — return defaults (will be created on first updateStateParams)
      const defaults = _defaultParams(orgId, processType, stateName);
      _paramsCache.set(key, { params: defaults, cachedAt: Date.now() });
      return defaults;
    }

    const params = _rowToParams(data as ProcessStateRLParamsRow);
    _paramsCache.set(key, { params, cachedAt: Date.now() });
    return params;
  } catch (err) {
    logger.warn("[state-rl] loadStateParams: threw unexpectedly (using defaults)", {
      error: String(err),
      processType,
      stateName,
    });
    return _defaultParams(orgId, processType, stateName);
  }
}

function _defaultParams(orgId: string, processType: string, stateName: string): StateRLParams {
  return {
    ...DEFAULT_PARAMS,
    organizationId: orgId,
    processType,
    stateName,
  };
}

// ── computeStateGradient ───────────────────────────────────────────────────

/**
 * Compute the gradient update for each RL parameter given the quality signal.
 *
 * Loss function: L = (1 - quality)^2
 * dL/d(quality) = -2 * (1 - quality)
 *
 * For each parameter θ, the update uses the sign of (quality - 0.5) to
 * determine direction of adaptation. This is a simplified chain-rule approach
 * where dL/dθ = dL/d(quality) * (d_quality / dθ).
 *
 * We approximate d_quality/dθ per parameter based on domain knowledge:
 *
 *   escalation_threshold:
 *     - Regime: failure (quality < 0.5) → threshold too high → gradient pushes DOWN
 *     - Regime: success (quality > 0.8) → may be too hair-trigger → gradient pushes UP
 *     - Near quality=0.5: gradient approaches 0
 *
 *   timeout_multiplier:
 *     - Failure → need more time → push UP (away from 1.0)
 *     - Success with value > 1.0 → nudge toward efficiency 1.0
 *
 *   retry_budget:
 *     - Failure → more retries might help → push UP
 *     - Success → budget was sufficient, slight downward pressure to avoid waste
 *
 *   confidence_weight:
 *     - Failure → confidence was over-trusted → reduce weight
 *     - Success → weight was appropriate → nudge toward 0.5 (neutral anchor)
 */
export function computeStateGradient(
  params: StateRLParams,
  quality: number
): Partial<StateRLParams> {
  const loss = (1 - quality) ** 2;

  // dL/d(quality) = -2 * (1 - quality)
  // We negate this to get the reward signal direction: positive when quality < 1
  const lossGrad = -2 * (1 - quality); // negative when quality < 1, 0 at quality=1

  // ── escalation_threshold ──────────────────────────────────────────────
  // d_quality / d(escalation_threshold):
  //   In failure mode: high threshold → fewer escalations → more failures
  //     → increasing threshold hurts quality → d_quality/d(threshold) < 0
  //     → lossGrad * d_quality/d(threshold) = lossGrad * (-1) (pushes threshold DOWN)
  //   In success mode: quality is good → gradient pushes threshold UP slightly
  //     → d_quality/d(threshold) > 0 in success regime
  // We implement this by making the sensitivity proportional to (quality - 0.5)
  const escalationSensitivity = quality < 0.5
    ? -(0.5 - quality)   // negative → threshold should decrease when failing
    : (quality - 0.5);   // positive → threshold should increase when succeeding
  const escalationGrad = lossGrad * escalationSensitivity;
  const newEscalationThreshold = _clamp(
    params.escalationThreshold - params.learningRate * escalationGrad,
    PARAM_BOUNDS.escalationThreshold.min,
    PARAM_BOUNDS.escalationThreshold.max
  );

  // ── timeout_multiplier ────────────────────────────────────────────────
  // d_quality / d(timeout_multiplier):
  //   In failure mode: more time likely helps → sensitivity is positive
  //     but since loss grad is negative (bad), net update pushes multiplier UP
  //   In success mode with multiplier > 1: efficiency signal → nudge toward 1.0
  let timeoutSensitivity: number;
  if (quality < 0.5) {
    // Failure → more time needed → push UP
    timeoutSensitivity = -(0.5 - quality); // negative → timeout should increase
  } else if (params.timeoutMultiplier > 1.0 && quality > 0.8) {
    // Well-performing with inflated multiplier → nudge toward 1.0 (efficiency)
    timeoutSensitivity = params.timeoutMultiplier - 1.0; // positive → multiplier decreases
  } else {
    // Neutral zone — tiny stabilizing nudge toward 1.0
    timeoutSensitivity = (params.timeoutMultiplier - 1.0) * 0.1;
  }
  const timeoutGrad = lossGrad * timeoutSensitivity;
  const newTimeoutMultiplier = _clamp(
    params.timeoutMultiplier - params.learningRate * timeoutGrad,
    PARAM_BOUNDS.timeoutMultiplier.min,
    PARAM_BOUNDS.timeoutMultiplier.max
  );

  // ── retry_budget ──────────────────────────────────────────────────────
  // d_quality / d(retry_budget):
  //   In failure mode: more retries would help → push budget UP
  //   In success mode: retries cost overhead → mild downward pressure
  let retrySensitivity: number;
  if (quality < 0.5) {
    retrySensitivity = -(0.5 - quality); // failure → budget should increase
  } else if (quality > 0.8) {
    retrySensitivity = 0.1; // success → very mild budget reduction pressure
  } else {
    retrySensitivity = 0.0; // neutral zone → no change
  }
  const retryGrad = lossGrad * retrySensitivity;
  const newRetryBudgetFloat = _clamp(
    params.retryBudget - params.learningRate * retryGrad * 10, // scale by 10 for int param
    PARAM_BOUNDS.retryBudget.min,
    PARAM_BOUNDS.retryBudget.max
  );
  // Round to nearest integer — retry_budget is discrete
  const newRetryBudget = Math.round(newRetryBudgetFloat);

  // ── confidence_weight ─────────────────────────────────────────────────
  // d_quality / d(confidence_weight):
  //   In failure mode: over-reliance on confidence signals may have caused wrong routing
  //     → reduce weight (sensitivity negative → weight decreases when failing)
  //   In success mode: confidence routing was accurate → reinforce, anchor toward 0.5
  let confidenceSensitivity: number;
  if (quality < 0.5) {
    confidenceSensitivity = 0.5 - quality; // failure → weight should decrease
  } else if (quality > 0.8) {
    // Anchor slightly toward 0.5 (balanced weight) — prevents overfitting to confidence
    confidenceSensitivity = -(params.confidenceWeight - 0.5) * 0.2;
  } else {
    confidenceSensitivity = 0.0;
  }
  const confidenceGrad = lossGrad * confidenceSensitivity;
  const newConfidenceWeight = _clamp(
    params.confidenceWeight - params.learningRate * confidenceGrad,
    PARAM_BOUNDS.confidenceWeight.min,
    PARAM_BOUNDS.confidenceWeight.max
  );

  return {
    escalationThreshold: _round(newEscalationThreshold),
    timeoutMultiplier:   _round(newTimeoutMultiplier),
    retryBudget:         newRetryBudget,
    confidenceWeight:    _round(newConfidenceWeight),
    lastLoss:            _round(loss),
    gradientSum:         _round(params.gradientSum + Math.abs(lossGrad)),
    updateCount:         params.updateCount + 1,
  };
}

// ── updateStateParams ──────────────────────────────────────────────────────

/**
 * Load current params, apply one gradient descent step, and upsert to DB.
 *
 * Cache strategy: write-through — after computing the merged params we
 * immediately update the module cache BEFORE the DB write.  This prevents
 * a thundering-herd of concurrent FSM state transitions from all reading
 * the same stale cached values, each computing independent gradients, and
 * then racing each other to the DB (last-write-wins discards earlier updates).
 *
 * Fire-and-forget safe — all errors are caught and logged.
 */
export async function updateStateParams(
  supabase: SupabaseClient,
  orgId: string,
  processType: string,
  stateName: string,
  quality: number
): Promise<void> {
  try {
    const current = await loadStateParams(supabase, orgId, processType, stateName);
    const updates = computeStateGradient(current, quality);

    const merged: StateRLParams = { ...current, ...updates };

    // Write-through cache: update in-memory state immediately so that any
    // concurrent caller that reads this key within the next 5 minutes sees
    // the post-gradient params rather than the pre-update baseline.
    // We do this BEFORE the DB write to avoid a race where another concurrent
    // updateStateParams call loads the same stale cached value.
    const key = _cacheKey(orgId, processType, stateName);
    _paramsCache.set(key, { params: merged, cachedAt: Date.now() });

    const { error } = await supabase
      .from("process_state_rl_params")
      .upsert(
        {
          organization_id:    orgId,
          process_type:       processType,
          state_name:         stateName,
          escalation_threshold: merged.escalationThreshold,
          timeout_multiplier:   merged.timeoutMultiplier,
          retry_budget:         merged.retryBudget,
          confidence_weight:    merged.confidenceWeight,
          learning_rate:        merged.learningRate,
          gradient_sum:         merged.gradientSum,
          update_count:         merged.updateCount,
          last_loss:            merged.lastLoss,
          updated_at:           new Date().toISOString(),
        },
        {
          onConflict: "organization_id,process_type,state_name",
        }
      );

    if (error) {
      logger.warn("[state-rl] updateStateParams: upsert failed (non-fatal)", {
        error: error.message,
        orgId: orgId.slice(0, 8),
        processType,
        stateName,
      });
      // On DB failure: invalidate cache so the next load re-fetches from DB
      // rather than serving the optimistic merged value indefinitely.
      _invalidateCache(orgId, processType, stateName);
      return;
    }
  } catch (err) {
    logger.warn("[state-rl] updateStateParams: threw unexpectedly (non-fatal)", {
      error: String(err),
      processType,
      stateName,
    });
    // On unexpected error: invalidate cache so the next read is from DB.
    _invalidateCache(orgId, processType, stateName);
    // Never re-throw — gradient descent failure must not affect the FSM
  }
}

// ── recordAndLearnStateOutcome ─────────────────────────────────────────────

/**
 * Single call for fsm-runner.ts to make after each state transition.
 *
 * Responsibilities:
 * 1. Online gradient descent: updateStateParams() — adapts per-state RL params
 * 2. Agent-level RL: recordAgentOutcome() — emits dopamine/gaba to cross_domain_signals
 *    and inserts into prediction_records for the learning flywheel
 *
 * Both operations are fire-and-forget. This function NEVER throws and NEVER blocks.
 * It is safe to call with `void` and not await.
 *
 * @param supabase  - Supabase client (service or auth client)
 * @param orgId     - organization_id from ProcessContext
 * @param processType - e.g. "hr_offboarding", "procurement"
 * @param stateName - the state that just completed (prevState before transition)
 * @param quality   - RL quality signal 0–1
 * @param executionMs - duration of the state in milliseconds
 */
export async function recordAndLearnStateOutcome(
  supabase: SupabaseClient,
  orgId: string,
  processType: string,
  stateName: string,
  quality: number,
  executionMs: number
): Promise<void> {
  // Both operations run concurrently; neither blocks the other
  const gradientP = updateStateParams(supabase, orgId, processType, stateName, quality).catch(
    (err) => {
      logger.warn("[state-rl] recordAndLearnStateOutcome: gradient descent failed (non-fatal)", {
        error: String(err),
        processType,
        stateName,
      });
    }
  );

  const agentRlP = recordAgentOutcome(supabase, {
    // agentId prefix 'bpaas-' kept for backward compat — historical RL records use this prefix
    agentId:         `bpaas-${processType}-${stateName}-${Date.now()}`,
    domain:          `process.${processType}.${stateName}`,
    taskDescription: `Process Engine state execution: ${processType}/${stateName}`,
    resultSummary:   `quality=${quality.toFixed(3)} durationMs=${executionMs}`,
    quality,
    executionMs,
    organizationId:  orgId,
    userId:          orgId, // process-level RL has no individual user
  }).catch((err) => {
    logger.warn("[state-rl] recordAndLearnStateOutcome: recordAgentOutcome failed (non-fatal)", {
      error: String(err),
      processType,
      stateName,
    });
  });

  // Await both concurrently — but we don't propagate errors (already caught above)
  await Promise.allSettled([gradientP, agentRlP]);
}

// ── Utilities ─────────────────────────────────────────────────────────────

function _clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to 4 decimal places to avoid floating-point drift in the DB */
function _round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
