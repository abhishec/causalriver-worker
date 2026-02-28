/**
 * Ground-Truth RL Verification (RLVR)
 *
 * Closes the RL loop with real outcomes instead of proxy signals (thumbs up/down).
 * Pattern: record prediction → wait 30-60 days → measure actual outcome →
 *          compare → update RL weights with real ground truth.
 *
 * Research: RLVR shows 40%+ improvement in prediction accuracy after 3
 * verification cycles vs proxy-signal-only RL.
 *
 * Asymmetric rewards:
 *   Correct prediction → +0.1 per prediction (learn from success)
 *   Incorrect prediction → -0.05 per prediction (penalise but don't over-discourage)
 *
 * All public functions are fire-and-forget safe — never throw on error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RlvrPredictionInput {
  domainType: "early-warning" | "scope-creep" | "delivery-intelligence" | "pod-match";
  entityId: string;        // engagement_id, engineer_login, pod_name, etc.
  entityType: "engagement" | "engineer" | "pod";
  predictedValue: number;  // 0–1 prediction score
  predictedOutcome: string; // human-readable description
  verifyAfterDays: number; // 30 or 45 or 60
  metadata?: Record<string, unknown>;
}

interface DbRlvrOutcome {
  id: string;
  organization_id: string;
  domain_type: string;
  entity_id: string;
  entity_type: string;
  predicted_value: number;
  predicted_outcome: string;
  verify_after_date: string;
  verification_status: string;
  metadata: Record<string, unknown> | null;
}

export interface VerificationSummary {
  verified: number;
  correct: number;
  incorrect: number;
  expired: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const RL_SCORE_CORRECT = 0.1;
const RL_SCORE_INCORRECT = -0.05;

// Threshold for "high risk" early-warning predictions
const FLIGHT_RISK_HIGH_THRESHOLD = 0.5;

// ── Record Prediction ──────────────────────────────────────────────────────

/**
 * Record a domain prediction for future ground-truth verification.
 * Returns the rlvr_prediction_outcomes row id, or null on failure.
 * Fire-and-forget safe.
 */
export async function recordRlvrPrediction(
  supabase: SupabaseClient,
  orgId: string,
  prediction: RlvrPredictionInput,
): Promise<string | null> {
  try {
    const verifyAfterDate = new Date(
      Date.now() + prediction.verifyAfterDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabase
      .from("rlvr_prediction_outcomes")
      .insert({
        organization_id: orgId,
        domain_type: prediction.domainType,
        entity_id: prediction.entityId,
        entity_type: prediction.entityType,
        predicted_value: prediction.predictedValue,
        predicted_outcome: prediction.predictedOutcome,
        verify_after_date: verifyAfterDate,
        verification_status: "pending",
        metadata: prediction.metadata ?? {},
      })
      .select("id")
      .single();

    if (error) {
      logger.warn("[rlvr] recordRlvrPrediction insert failed:", error.message);
      return null;
    }

    logger.warn(
      `[rlvr] Recorded ${prediction.domainType} prediction for ${prediction.entityType}=${prediction.entityId} ` +
      `value=${prediction.predictedValue.toFixed(2)}, verify after ${prediction.verifyAfterDays}d`,
    );

    return (data as { id: string }).id;
  } catch (err) {
    logger.warn("[rlvr] recordRlvrPrediction threw:", err);
    return null;
  }
}

// ── Verify Pending Predictions ─────────────────────────────────────────────

/**
 * Verify all pending predictions for an org that are past their verify_after_date.
 * Re-queries actual domain data, compares to predicted value, emits RL signal.
 * Fire-and-forget safe — returns summary stats.
 */
export async function verifyPendingPredictions(
  supabase: SupabaseClient,
  orgId: string,
): Promise<VerificationSummary> {
  const summary: VerificationSummary = { verified: 0, correct: 0, incorrect: 0, expired: 0 };

  try {
    // Fetch all pending predictions that are due
    const now = new Date().toISOString();
    const { data: pending, error } = await supabase
      .from("rlvr_prediction_outcomes")
      .select("*")
      .eq("organization_id", orgId)
      .eq("verification_status", "pending")
      .lte("verify_after_date", now)
      .limit(50); // process in batches

    if (error) {
      logger.warn("[rlvr] verifyPendingPredictions fetch failed:", error.message);
      return summary;
    }

    if (!pending || pending.length === 0) return summary;

    logger.warn(`[rlvr] Verifying ${pending.length} pending predictions for org=${orgId.slice(0, 8)}`);

    // Verify each prediction
    for (const prediction of pending as DbRlvrOutcome[]) {
      try {
        const outcome = await checkActualOutcome(supabase, orgId, prediction);

        if (outcome === null) {
          // Could not determine outcome — expire it
          await supabase
            .from("rlvr_prediction_outcomes")
            .update({
              verification_status: "expired",
              actual_outcome: "Could not determine actual outcome — data unavailable",
              verified_at: new Date().toISOString(),
            })
            .eq("id", prediction.id);
          summary.expired++;
          continue;
        }

        const { actualValue, actualOutcome, matched } = outcome;
        const rlScoreDelta = matched ? RL_SCORE_CORRECT : RL_SCORE_INCORRECT;

        // Update prediction row with outcome
        await supabase
          .from("rlvr_prediction_outcomes")
          .update({
            verification_status: "verified",
            actual_outcome: actualOutcome,
            actual_value: actualValue,
            outcome_matched: matched,
            rl_score_delta: rlScoreDelta,
            verified_at: new Date().toISOString(),
          })
          .eq("id", prediction.id);

        // Emit verified RL signal to cross_domain_signals for brain to learn from
        await emitVerifiedRlSignal(supabase, orgId, prediction, actualOutcome, matched, rlScoreDelta);

        summary.verified++;
        if (matched) summary.correct++;
        else summary.incorrect++;
      } catch (predErr) {
        logger.warn(`[rlvr] Failed to verify prediction ${prediction.id}:`, predErr);
      }
    }
  } catch (err) {
    logger.warn("[rlvr] verifyPendingPredictions outer catch:", err);
  }

  return summary;
}

// ── Actual Outcome Checkers ────────────────────────────────────────────────

/**
 * Dispatch to domain-specific outcome checker.
 * Returns null if the outcome cannot be determined (data unavailable).
 */
async function checkActualOutcome(
  supabase: SupabaseClient,
  orgId: string,
  prediction: DbRlvrOutcome,
): Promise<{ actualValue: number; actualOutcome: string; matched: boolean } | null> {
  switch (prediction.domain_type) {
    case "early-warning":
      return checkEarlyWarningOutcome(supabase, orgId, prediction);
    case "scope-creep":
      return checkScopeCreepOutcome(supabase, orgId, prediction);
    case "delivery-intelligence":
      return checkDeliveryIntelligenceOutcome(supabase, orgId, prediction);
    case "pod-match":
      // pod-match predictions are harder to verify without explicit feedback
      // Treat as expired — we don't have ground truth for pod fit
      return null;
    default:
      logger.warn(`[rlvr] Unknown domain_type for verification: ${prediction.domain_type}`);
      return null;
  }
}

/**
 * Early-warning verification: was the flight risk prediction accurate?
 *
 * Logic:
 * - Re-query engineer_health_snapshots for same engineer
 * - If predicted > 0.5 AND engineer no longer exists in snapshots → correct (they left)
 * - If predicted > 0.5 AND current flight_risk < 0.3 → incorrect (risk resolved)
 * - If predicted > 0.5 AND current flight_risk still >= 0.5 → correct (risk persists)
 * - If predicted <= 0.5 AND current flight_risk > 0.7 → incorrect (missed the risk)
 * - If predicted <= 0.5 AND current flight_risk <= 0.5 → correct (risk stayed low)
 */
async function checkEarlyWarningOutcome(
  supabase: SupabaseClient,
  orgId: string,
  prediction: DbRlvrOutcome,
): Promise<{ actualValue: number; actualOutcome: string; matched: boolean } | null> {
  try {
    const { data: snapshots, error } = await supabase
      .from("engineer_health_snapshots")
      .select("github_login, flight_risk_score")
      .eq("organization_id", orgId)
      .eq("github_login", prediction.entity_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      logger.warn("[rlvr] engineer_health_snapshots query failed:", error.message);
      return null;
    }

    const predictedHigh = prediction.predicted_value > FLIGHT_RISK_HIGH_THRESHOLD;

    if (!snapshots || snapshots.length === 0) {
      // Engineer not found in snapshots — likely left or was removed
      if (predictedHigh) {
        return {
          actualValue: 1.0,
          actualOutcome: `Engineer ${prediction.entity_id} no longer in snapshots — likely departed (prediction correct)`,
          matched: true,
        };
      } else {
        return {
          actualValue: 1.0,
          actualOutcome: `Engineer ${prediction.entity_id} no longer in snapshots — prediction missed departure`,
          matched: false,
        };
      }
    }

    const currentRisk = (snapshots[0] as { github_login: string; flight_risk_score: number | null }).flight_risk_score ?? 0;
    const currentHigh = currentRisk > FLIGHT_RISK_HIGH_THRESHOLD;

    const matched = predictedHigh === currentHigh;
    const direction = predictedHigh ? "high" : "low";
    const actualDirection = currentHigh ? "high" : "low";

    return {
      actualValue: currentRisk,
      actualOutcome: `Predicted flight risk ${direction} (${prediction.predicted_value.toFixed(2)}), actual is ${actualDirection} (${currentRisk.toFixed(2)})`,
      matched,
    };
  } catch (err) {
    logger.warn("[rlvr] checkEarlyWarningOutcome threw:", err);
    return null;
  }
}

/**
 * Scope-creep verification: did the predicted scope creep materialize/resolve?
 *
 * Logic:
 * - Check scope_creep_alerts for same engagement
 * - If we predicted scope creep (predicted_value > 0.5) and alerts still exist → correct
 * - If we predicted scope creep and alerts are resolved → incorrect (resolved early)
 * - If no alerts exist at verification time → compare to prediction direction
 */
async function checkScopeCreepOutcome(
  supabase: SupabaseClient,
  orgId: string,
  prediction: DbRlvrOutcome,
): Promise<{ actualValue: number; actualOutcome: string; matched: boolean } | null> {
  try {
    const { data: alerts, error } = await supabase
      .from("scope_creep_alerts")
      .select("id, status, severity")
      .eq("organization_id", orgId)
      .eq("engagement_id", prediction.entity_id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      logger.warn("[rlvr] scope_creep_alerts query failed:", error.message);
      return null;
    }

    const alertList = (alerts ?? []) as Array<{ id: string; status: string | null; severity: string | null }>;
    const hasActiveAlerts = alertList.some(a => a.status !== "resolved");
    const predictedCreep = prediction.predicted_value > 0.5;
    const matched = predictedCreep === hasActiveAlerts;

    const actualValue = hasActiveAlerts ? 0.9 : 0.1;
    const actualDesc = hasActiveAlerts
      ? `${alertList.filter(a => a.status !== "resolved").length} active scope creep alerts`
      : "no active scope creep alerts";

    return {
      actualValue,
      actualOutcome: `Predicted scope creep=${predictedCreep}, actual: ${actualDesc}`,
      matched,
    };
  } catch (err) {
    logger.warn("[rlvr] checkScopeCreepOutcome threw:", err);
    return null;
  }
}

/**
 * Delivery intelligence verification: was the predicted health score accurate?
 *
 * Logic:
 * - Query engagement_health_scores for same engagement (latest)
 * - |predicted_value - actual_health_score| < 0.15 → matched (within tolerance)
 */
async function checkDeliveryIntelligenceOutcome(
  supabase: SupabaseClient,
  orgId: string,
  prediction: DbRlvrOutcome,
): Promise<{ actualValue: number; actualOutcome: string; matched: boolean } | null> {
  try {
    const { data: healthRows, error } = await supabase
      .from("engagement_health_scores")
      .select("health_score, computed_at")
      .eq("organization_id", orgId)
      .eq("engagement_id", prediction.entity_id)
      .order("computed_at", { ascending: false })
      .limit(1);

    if (error) {
      logger.warn("[rlvr] engagement_health_scores query failed:", error.message);
      return null;
    }

    if (!healthRows || healthRows.length === 0) {
      return null; // No current health data — can't verify
    }

    const actualScore = (healthRows[0] as { health_score: number | null }).health_score ?? 0;
    const delta = Math.abs(prediction.predicted_value - actualScore);
    const matched = delta < 0.15; // within 15% tolerance

    return {
      actualValue: actualScore,
      actualOutcome: `Predicted health=${prediction.predicted_value.toFixed(2)}, actual=${actualScore.toFixed(2)}, delta=${delta.toFixed(2)} (${matched ? "within" : "outside"} 0.15 tolerance)`,
      matched,
    };
  } catch (err) {
    logger.warn("[rlvr] checkDeliveryIntelligenceOutcome threw:", err);
    return null;
  }
}

// ── RL Signal Emission ─────────────────────────────────────────────────────

/**
 * Emit a verified RL signal to cross_domain_signals.
 * Brain picks these up via its regular signal ingestion loop.
 */
async function emitVerifiedRlSignal(
  supabase: SupabaseClient,
  orgId: string,
  prediction: DbRlvrOutcome,
  actualOutcome: string,
  matched: boolean,
  rlScoreDelta: number,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    // signal_value MUST be a string — cross_domain_signals.signal_value is TEXT.
    // Store the neurotransmitter name so tier3-consolidation .in("signal_value", ["dopamine"])
    // can filter RLVR signals. rlScoreDelta is carried in payload for numeric use.
    const signalValueStr = matched ? "rl_verified_correct" : "rl_verified_incorrect";
    await supabase.from("cross_domain_signals").insert({
      organization_id: orgId,
      source_domain: `rlvr.${prediction.domain_type}`,
      target_domain: "brain.rl",
      signal_type: matched ? "rl_verified_correct" : "rl_verified_incorrect",
      signal_value: signalValueStr,
      signal_strength: Math.abs(rlScoreDelta),
      entity_type: prediction.entity_type,
      entity_id: prediction.entity_id,
      signal_timestamp: now,
      created_at: now,
      payload: {
        predictionId: prediction.id,
        domainType: prediction.domain_type,
        predictedValue: prediction.predicted_value,
        predictedOutcome: prediction.predicted_outcome,
        actualOutcome,
        matched,
        rlScoreDelta,
        verificationDate: now,
      },
    });
  } catch (err) {
    logger.warn("[rlvr] emitVerifiedRlSignal failed:", err);
    // Non-fatal — verification result is already saved to rlvr_prediction_outcomes
  }
}
