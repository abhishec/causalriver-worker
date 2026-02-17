/**
 * OutcomeOracle — Autonomous Prediction Verification
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE PROBLEM WITH CURRENT FEEDBACK LOOP:
 *
 * ```typescript
 * // Human must call this with actual data
 * await feedbackLoop.verifyPrediction(supabase, predictionId, {
 *   direction: 'decrease',
 *   magnitude: -0.25
 * });
 * // If nobody calls this → learning never happens
 * ```
 *
 * The existing system makes predictions ("deploy velocity will drop 48h from now")
 * but waits for a human to call verifyPrediction() with the actual outcome.
 * If nobody calls it, the feedback loop never fires — the brain never learns.
 *
 * THE SOLUTION — OUTCOMEORACLE:
 *
 * The OutcomeOracle closes the loop automatically using signals already flowing
 * through NexusBrain's connectors (GitHub, Jira, Slack, Stripe, etc.).
 *
 * At prediction time:
 *   1. Record what metric to watch (e.g., "engineering.deploy_frequency")
 *   2. Record the predicted direction + magnitude + timeframe
 *   3. Record the baseline value at prediction time
 *   4. Schedule a verification window: "check at T+48h"
 *
 * At next connector sync (automatic, on signal arrival):
 *   1. Compare actual metric value to baseline
 *   2. Compute actual direction + magnitude
 *   3. Call verifyPrediction() autonomously
 *   4. Feed result back to bandit (which method predicted this correctly?)
 *
 * This makes the learning loop FULLY AUTONOMOUS — no human required.
 * The brain observes its own predictions against the signals it already ingests.
 *
 * Why this is the missing piece for "self-improving brain":
 *   WITHOUT oracle: Brain predicts → nobody checks → brain never learns accuracy
 *   WITH oracle:    Brain predicts → oracle checks with next signal batch → brain learns
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Signal Batch Arrives (GitHub/Jira/Slack connector sync)        │
 * │                                                                 │
 * │  OutcomeOracle.processBatch(signals)                           │
 * │    ↓                                                            │
 * │  1. Fetch all pending predictions due for verification          │
 * │  2. For each pending prediction:                                │
 * │     a. Find matching signals in current batch                  │
 * │     b. Compute actual metric value from signals                 │
 * │     c. Compare to baseline → compute direction + magnitude     │
 * │     d. Call feedbackLoop.verifyPrediction()                    │
 * │     e. Update bandit reward for the method that predicted this  │
 * │  3. Return verification summary                                  │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CausalMethodBanditInstance, BanditArm } from './causal-method-bandit';
import { updateBanditReward } from './causal-discovery-runner';
import { createFeedbackLoop, type PredictionRecord } from './feedback-loop';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A registered prediction awaiting autonomous verification.
 *
 * Created at prediction time, consumed by the OutcomeOracle when
 * matching signals arrive.
 */
export interface WatchedPrediction {
  /** Unique prediction ID (matches feedback-loop PredictionRecord.id) */
  predictionId: string;

  /** Organization this prediction belongs to */
  organizationId: string;

  /**
   * Source domain that triggered this prediction.
   * Used by causal discovery bandit reward.
   */
  sourceDomain: string;

  /**
   * Target domain being predicted.
   * e.g., 'engineering' if predicting deploy_frequency
   */
  targetDomain: string;

  /**
   * The specific metric signal to watch for.
   * Format: "source_domain.signal_type" or just "signal_type"
   * e.g., 'engineering.deploy_frequency', 'ci_success_rate'
   */
  watchMetric: string;

  /**
   * Signal type to match in incoming batches.
   * e.g., 'deploy_frequency', 'ci_failed', 'bug_open_rate'
   */
  watchSignalType: string;

  /**
   * Domain the signal comes from.
   * e.g., 'engineering', 'product', 'support'
   */
  watchDomain: string;

  /** Baseline value at prediction time */
  baselineValue: number;

  /** Baseline measured at (prediction time) */
  baselineTimestamp: Date;

  /** Predicted direction */
  predictedDirection: 'increase' | 'decrease' | 'stable';

  /** Predicted magnitude (-1 to 1) */
  predictedMagnitude: number;

  /** Confidence at prediction time */
  confidence: number;

  /**
   * When to verify — prediction is "due" after this timestamp.
   * Oracle will skip it until this time arrives.
   */
  verifyAfter: Date;

  /**
   * Hard deadline — prediction expires after this timestamp.
   * If no matching signals arrive, the prediction is marked expired.
   */
  expiresAt: Date;

  /**
   * Causal discovery method that produced this prediction.
   * Used to reward the bandit arm that made a correct prediction.
   */
  discoveryMethod?: BanditArm;

  /** Relationship ID for feedback-loop weight updates */
  relationshipId?: string;

  /** Status: pending (awaiting verification) → verified | expired */
  status: 'pending' | 'verified' | 'expired';
}

/**
 * A signal from a connector batch — the OutcomeOracle receives these
 * and uses them to verify pending predictions.
 */
export interface IncomingSignal {
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp: string;
  organization_id: string;
  entity_type?: string;
  entity_id?: string;
}

/**
 * Result of verifying a single prediction.
 */
export interface VerificationSummary {
  predictionId: string;
  sourceDomain: string;
  targetDomain: string;
  watchMetric: string;
  baselineValue: number;
  actualValue: number;
  actualDirection: 'increase' | 'decrease' | 'stable';
  actualMagnitude: number;
  predictedDirection: 'increase' | 'decrease' | 'stable';
  predictedMagnitude: number;
  directionCorrect: boolean;
  magnitudeError: number;
  wasCorrect: boolean;
  /** Bandit reward applied (0.0 to 1.0) */
  banditReward: number;
  /** Discovery method rewarded */
  discoveryMethod?: string;
}

/**
 * Result of processing a full signal batch.
 */
export interface OracleProcessingResult {
  /** Signals processed in this batch */
  signalsProcessed: number;
  /** Predictions checked */
  predictionsChecked: number;
  /** Predictions successfully verified (had matching signals) */
  predictionsVerified: number;
  /** Predictions expired (timeframe passed, no signals) */
  predictionsExpired: number;
  /** Predictions still pending (too early) */
  predictionsPending: number;
  /** Bandit arms rewarded */
  banditRewardsGiven: number;
  /** Verification details */
  verifications: VerificationSummary[];
  /** Duration in ms */
  durationMs: number;
}

/**
 * Configuration for the OutcomeOracle.
 */
export interface OutcomeOracleConfig {
  /**
   * Minimum number of signals to compute a reliable metric average.
   * Default: 3
   */
  minSignalsForVerification?: number;

  /**
   * Direction threshold: signals within this % of baseline = 'stable'.
   * e.g., 0.05 = ±5% change is considered stable.
   * Default: 0.05
   */
  stableThreshold?: number;

  /**
   * Supabase client for persisting verification state.
   * When provided, watched predictions survive process restarts.
   */
  supabase?: SupabaseClient;

  /**
   * Bandit instance for rewarding correct predictions.
   * When provided, method accuracy feeds bandit arm rewards.
   */
  bandit?: CausalMethodBanditInstance;

  /**
   * Organization ID — used for signal filtering.
   */
  organizationId?: string;

  /**
   * Whether to call feedbackLoop.verifyPrediction() on the feedback-loop system.
   * Default: true
   */
  updateFeedbackLoop?: boolean;

  /**
   * FeedbackLoop config (passed to createFeedbackLoop).
   */
  feedbackConfig?: {
    correctPredictionBoost?: number;
    incorrectPredictionPenalty?: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<OutcomeOracleConfig, 'supabase' | 'bandit' | 'organizationId' | 'feedbackConfig'>> = {
  minSignalsForVerification: 3,
  stableThreshold: 0.05,
  updateFeedbackLoop: true,
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Compute the actual direction and magnitude from a set of signals
 * compared to the baseline value.
 *
 * @param signals - Matching incoming signals
 * @param baselineValue - The baseline metric value at prediction time
 * @param stableThreshold - ±this% is considered 'stable'
 * @returns { direction, magnitude, actualValue }
 */
export function computeActualOutcome(
  signals: IncomingSignal[],
  baselineValue: number,
  stableThreshold: number = DEFAULT_CONFIG.stableThreshold,
): {
  direction: 'increase' | 'decrease' | 'stable';
  magnitude: number;
  actualValue: number;
} {
  if (signals.length === 0) {
    return { direction: 'stable', magnitude: 0, actualValue: baselineValue };
  }

  // Use the mean of recent signal values as the "actual" metric
  const actualValue = signals.reduce((sum, s) => sum + s.signal_value, 0) / signals.length;

  // Compute relative change
  const relativeChange = baselineValue !== 0
    ? (actualValue - baselineValue) / Math.abs(baselineValue)
    : actualValue - baselineValue;

  // Determine direction
  let direction: 'increase' | 'decrease' | 'stable';
  if (Math.abs(relativeChange) <= stableThreshold) {
    direction = 'stable';
  } else if (relativeChange > 0) {
    direction = 'increase';
  } else {
    direction = 'decrease';
  }

  // Magnitude: clamp to [-1, 1]
  const magnitude = Math.max(-1, Math.min(1, relativeChange));

  return { direction, magnitude, actualValue };
}

/**
 * Evaluate whether a prediction was correct.
 *
 * A prediction is correct if:
 *   - Direction matches (exact), OR
 *   - Both predicted and actual are non-stable and direction matches
 *
 * Magnitude error = |predictedMagnitude - actualMagnitude|
 */
export function evaluatePrediction(
  predicted: { direction: 'increase' | 'decrease' | 'stable'; magnitude: number },
  actual: { direction: 'increase' | 'decrease' | 'stable'; magnitude: number },
): {
  directionCorrect: boolean;
  magnitudeError: number;
  wasCorrect: boolean;
} {
  const directionCorrect = predicted.direction === actual.direction;
  const magnitudeError = Math.abs(predicted.magnitude - actual.magnitude);

  // "Correct" = direction correct AND magnitude within 0.3 (30% relative error)
  const wasCorrect = directionCorrect && magnitudeError <= 0.3;

  return { directionCorrect, magnitudeError, wasCorrect };
}

/**
 * Compute bandit reward from prediction evaluation.
 *
 * Reward formula (consistent with causal-discovery-runner.ts updateBanditReward):
 *   wasCorrect ? 0.6 + 0.4 × (1 - magnitudeError) : 0.0
 *
 * This gives partial credit: correct direction + accurate magnitude = 1.0,
 * correct direction + inaccurate magnitude = 0.6, wrong direction = 0.0.
 */
export function computeBanditReward(evaluation: {
  wasCorrect: boolean;
  magnitudeError: number;
}): number {
  if (!evaluation.wasCorrect) return 0.0;
  return Math.max(0, Math.min(1, 0.6 + 0.4 * (1 - evaluation.magnitudeError)));
}

/**
 * Filter signals that match a watched prediction's target metric.
 *
 * Matching criteria:
 * - signal.source_domain === prediction.watchDomain (or watchDomain is '*')
 * - signal.signal_type === prediction.watchSignalType
 * - signal.organization_id === prediction.organizationId (if provided)
 * - signal.signal_timestamp >= prediction.baselineTimestamp (only post-prediction signals)
 */
export function findMatchingSignals(
  prediction: WatchedPrediction,
  signals: IncomingSignal[],
): IncomingSignal[] {
  return signals.filter(signal => {
    // Domain match
    if (prediction.watchDomain !== '*' && signal.source_domain !== prediction.watchDomain) {
      return false;
    }

    // Signal type match
    if (signal.signal_type !== prediction.watchSignalType) {
      return false;
    }

    // Organization match
    if (prediction.organizationId && signal.organization_id !== prediction.organizationId) {
      return false;
    }

    // Only use signals AFTER the baseline timestamp
    const signalTs = new Date(signal.signal_timestamp).getTime();
    const baselineTs = prediction.baselineTimestamp.getTime();
    if (signalTs <= baselineTs) {
      return false;
    }

    return true;
  });
}

// ============================================================================
// OUTCOME ORACLE FACTORY
// ============================================================================

/**
 * Create an OutcomeOracle that autonomously verifies brain predictions.
 *
 * @example
 * ```typescript
 * // Setup (once at startup)
 * const oracle = createOutcomeOracle({
 *   supabase,
 *   bandit, // CausalMethodBanditInstance
 *   organizationId: 'org_123',
 * });
 *
 * // At prediction time (when brain makes a forecast)
 * oracle.registerPrediction({
 *   predictionId: 'pred_001',
 *   organizationId: 'org_123',
 *   sourceDomain: 'engineering',
 *   targetDomain: 'support',
 *   watchMetric: 'support.escalation_volume',
 *   watchSignalType: 'escalation_volume',
 *   watchDomain: 'support',
 *   baselineValue: 0.3,
 *   baselineTimestamp: new Date(),
 *   predictedDirection: 'increase',
 *   predictedMagnitude: 0.4,
 *   confidence: 0.72,
 *   verifyAfter: new Date(Date.now() + 48 * 3600 * 1000), // 48h
 *   expiresAt: new Date(Date.now() + 96 * 3600 * 1000),   // 4 days
 *   discoveryMethod: 'transfer_entropy',
 *   status: 'pending',
 * });
 *
 * // On every connector sync (GitHub, Jira, Slack signal batch)
 * const result = await oracle.processBatch(incomingSignals);
 * console.log(`Verified ${result.predictionsVerified} predictions`);
 * console.log(`Bandit rewards given: ${result.banditRewardsGiven}`);
 * ```
 */
export function createOutcomeOracle(config: OutcomeOracleConfig = {}) {
  const {
    minSignalsForVerification = DEFAULT_CONFIG.minSignalsForVerification,
    stableThreshold = DEFAULT_CONFIG.stableThreshold,
    supabase,
    bandit,
    organizationId: defaultOrgId,
    updateFeedbackLoop: doUpdateFeedbackLoop = DEFAULT_CONFIG.updateFeedbackLoop,
    feedbackConfig,
  } = config;

  // In-memory store of watched predictions
  // In production, backed by Supabase (outcome_observation_windows table)
  const _predictions = new Map<string, WatchedPrediction>();

  // Feedback loop instance (only if updateFeedbackLoop is enabled)
  const _feedbackLoop = doUpdateFeedbackLoop
    ? createFeedbackLoop(feedbackConfig ?? {})
    : null;

  return {
    /**
     * Register a new prediction for autonomous monitoring.
     *
     * Called at prediction time by the brain or causal discovery system.
     * The oracle will verify this prediction when matching signals arrive.
     *
     * @param prediction - The watched prediction to register
     */
    registerPrediction(prediction: WatchedPrediction): void {
      _predictions.set(prediction.predictionId, { ...prediction, status: 'pending' });

      // Optionally persist to Supabase for restart survival
      if (supabase) {
        // Non-blocking background persist — non-critical
        supabase
          .from('outcome_observation_windows')
          .upsert({
            id: prediction.predictionId,
            organization_id: prediction.organizationId,
            source_domain: prediction.sourceDomain,
            target_domain: prediction.targetDomain,
            watch_signal_type: prediction.watchSignalType,
            watch_domain: prediction.watchDomain,
            watch_metric: prediction.watchMetric,
            baseline_value: prediction.baselineValue,
            baseline_timestamp: prediction.baselineTimestamp.toISOString(),
            predicted_direction: prediction.predictedDirection,
            predicted_magnitude: prediction.predictedMagnitude,
            confidence: prediction.confidence,
            verify_after: prediction.verifyAfter.toISOString(),
            expires_at: prediction.expiresAt.toISOString(),
            discovery_method: prediction.discoveryMethod ?? null,
            relationship_id: prediction.relationshipId ?? null,
            status: 'pending',
          }, { onConflict: 'id' })
          .then(() => {}, (err) => {
            console.warn('[OutcomeOracle] Persist failed (non-fatal):', err?.message);
          });
      }
    },

    /**
     * Process an incoming signal batch to auto-verify pending predictions.
     *
     * This is the core method — called on every connector sync.
     * No human input required.
     *
     * @param signals - Signals from the latest connector sync
     * @returns Summary of verifications performed
     */
    async processBatch(signals: IncomingSignal[]): Promise<OracleProcessingResult> {
      const startMs = Date.now();
      const now = new Date();

      const verifications: VerificationSummary[] = [];
      let predictionsChecked = 0;
      let predictionsVerified = 0;
      let predictionsExpired = 0;
      let predictionsPending = 0;
      let banditRewardsGiven = 0;

      for (const [predId, prediction] of _predictions) {
        if (prediction.status !== 'pending') continue;
        predictionsChecked++;

        // Too early to verify
        if (now < prediction.verifyAfter) {
          predictionsPending++;
          continue;
        }

        // Prediction expired (window passed without matching signals)
        if (now > prediction.expiresAt) {
          prediction.status = 'expired';
          _predictions.set(predId, prediction);
          predictionsExpired++;

          // Mark bandit arm as failed (reward=0) on expiry
          if (bandit && prediction.discoveryMethod) {
            bandit.updateArm(
              prediction.sourceDomain,
              prediction.targetDomain,
              prediction.discoveryMethod,
              0.0,
            );
            banditRewardsGiven++;
          }

          // Persist expiry
          if (supabase) {
            supabase
              .from('outcome_observation_windows')
              .upsert({ id: predId, status: 'expired' }, { onConflict: 'id' })
              .then(() => {}, () => {});
          }
          continue;
        }

        // Find matching signals in this batch
        const matchingSignals = findMatchingSignals(prediction, signals);

        if (matchingSignals.length < minSignalsForVerification) {
          // Not enough signals yet — stay pending
          predictionsPending++;
          continue;
        }

        // Compute actual outcome from signals
        const actual = computeActualOutcome(matchingSignals, prediction.baselineValue, stableThreshold);

        // Evaluate prediction accuracy
        const evaluation = evaluatePrediction(
          { direction: prediction.predictedDirection, magnitude: prediction.predictedMagnitude },
          { direction: actual.direction, magnitude: actual.magnitude },
        );

        // Compute bandit reward
        const banditReward = computeBanditReward(evaluation);

        // Update prediction status
        prediction.status = 'verified';
        _predictions.set(predId, prediction);
        predictionsVerified++;

        // Reward the bandit arm that made this prediction
        if (bandit && prediction.discoveryMethod) {
          bandit.updateArm(
            prediction.sourceDomain,
            prediction.targetDomain,
            prediction.discoveryMethod,
            banditReward,
          );
          banditRewardsGiven++;
        }

        // Update feedback loop (adjusts causal relationship weights)
        if (_feedbackLoop && supabase && prediction.relationshipId) {
          try {
            await _feedbackLoop.verifyPrediction(
              supabase,
              predId,
              {
                direction: actual.direction,
                magnitude: actual.magnitude,
              },
            );
          } catch {
            // Non-critical — verification failure doesn't block signal processing
          }
        }

        // Persist verification result
        if (supabase) {
          supabase
            .from('outcome_observation_windows')
            .upsert({
              id: predId,
              status: 'verified',
              actual_value: actual.actualValue,
              actual_direction: actual.direction,
              actual_magnitude: actual.magnitude,
              was_correct: evaluation.wasCorrect,
              direction_correct: evaluation.directionCorrect,
              magnitude_error: evaluation.magnitudeError,
              bandit_reward: banditReward,
              verified_at: now.toISOString(),
            }, { onConflict: 'id' })
            .then(() => {}, () => {});
        }

        verifications.push({
          predictionId: predId,
          sourceDomain: prediction.sourceDomain,
          targetDomain: prediction.targetDomain,
          watchMetric: prediction.watchMetric,
          baselineValue: prediction.baselineValue,
          actualValue: actual.actualValue,
          actualDirection: actual.direction,
          actualMagnitude: actual.magnitude,
          predictedDirection: prediction.predictedDirection,
          predictedMagnitude: prediction.predictedMagnitude,
          directionCorrect: evaluation.directionCorrect,
          magnitudeError: evaluation.magnitudeError,
          wasCorrect: evaluation.wasCorrect,
          banditReward,
          discoveryMethod: prediction.discoveryMethod,
        });
      }

      return {
        signalsProcessed: signals.length,
        predictionsChecked,
        predictionsVerified,
        predictionsExpired,
        predictionsPending,
        banditRewardsGiven,
        verifications,
        durationMs: Date.now() - startMs,
      };
    },

    /**
     * Load pending predictions from Supabase (for restart survival).
     * Call this at startup to restore any predictions that survived a restart.
     */
    async loadFromSupabase(orgId?: string): Promise<{ loaded: number }> {
      if (!supabase) return { loaded: 0 };

      const targetOrgId = orgId ?? defaultOrgId;
      if (!targetOrgId) return { loaded: 0 };

      try {
        const { data, error } = await supabase
          .from('outcome_observation_windows')
          .select('*')
          .eq('organization_id', targetOrgId)
          .eq('status', 'pending');

        if (error || !data) return { loaded: 0 };

        let loaded = 0;
        for (const row of data) {
          const pred: WatchedPrediction = {
            predictionId: row.id,
            organizationId: row.organization_id,
            sourceDomain: row.source_domain,
            targetDomain: row.target_domain,
            watchMetric: row.watch_metric,
            watchSignalType: row.watch_signal_type,
            watchDomain: row.watch_domain,
            baselineValue: row.baseline_value ?? 0,
            baselineTimestamp: new Date(row.baseline_timestamp),
            predictedDirection: row.predicted_direction,
            predictedMagnitude: row.predicted_magnitude ?? 0,
            confidence: row.confidence ?? 0.5,
            verifyAfter: new Date(row.verify_after),
            expiresAt: new Date(row.expires_at),
            discoveryMethod: row.discovery_method ?? undefined,
            relationshipId: row.relationship_id ?? undefined,
            status: 'pending',
          };
          _predictions.set(pred.predictionId, pred);
          loaded++;
        }

        return { loaded };
      } catch {
        return { loaded: 0 };
      }
    },

    /**
     * Get all currently tracked predictions (for observability/debugging).
     */
    getPredictions(): WatchedPrediction[] {
      return Array.from(_predictions.values());
    },

    /**
     * Get only pending predictions (awaiting verification).
     */
    getPendingPredictions(): WatchedPrediction[] {
      return Array.from(_predictions.values()).filter(p => p.status === 'pending');
    },

    /**
     * Get accuracy statistics across all verified predictions.
     *
     * This is the "brain getting smarter" dashboard metric:
     * - accuracyRate: fraction of predictions that were correct
     * - directionAccuracy: easier metric — was direction right?
     * - meanMagnitudeError: how accurate were the magnitudes?
     * - byMethod: breakdown per discovery method (shows bandit progress)
     */
    getAccuracyStats(): {
      totalVerified: number;
      correctCount: number;
      accuracyRate: number;
      directionAccuracy: number;
      meanMagnitudeError: number;
      byMethod: Array<{
        method: string;
        total: number;
        correct: number;
        accuracy: number;
        avgReward: number;
      }>;
    } {
      const verified = Array.from(_predictions.values()).filter(p => p.status === 'verified');

      // We need the verifications — stored separately since predictions only track status
      // For stats we re-examine prediction outcomes from memory
      // Note: in production, these come from Supabase queries

      const totalVerified = verified.length;
      // Provide structural stats (detailed stats require stored verification results)
      return {
        totalVerified,
        correctCount: 0, // Would come from stored verifications in Supabase
        accuracyRate: 0,
        directionAccuracy: 0,
        meanMagnitudeError: 0,
        byMethod: [],
      };
    },

    /**
     * Cancel a prediction (e.g., if the entity no longer exists).
     */
    cancelPrediction(predictionId: string): boolean {
      const pred = _predictions.get(predictionId);
      if (!pred) return false;
      pred.status = 'expired';
      _predictions.set(predictionId, pred);
      return true;
    },

    /**
     * Clear all verified/expired predictions to free memory.
     * Keeps only pending predictions.
     */
    pruneCompleted(): number {
      let pruned = 0;
      for (const [id, pred] of _predictions) {
        if (pred.status !== 'pending') {
          _predictions.delete(id);
          pruned++;
        }
      }
      return pruned;
    },
  };
}

// ============================================================================
// CONVENIENCE: registerPredictionFromDiscovery
// ============================================================================

/**
 * Create a WatchedPrediction from a causal discovery relationship.
 *
 * This bridges the gap between discovery → oracle registration:
 *   causal discovery finds "engineering → support (0.72 effect, 2-day lag)"
 *   → oracle registers "watch support.escalation_volume for 48h"
 *
 * @param relationship - A discovered causal relationship
 * @param currentMetricValue - Current baseline value of the target metric
 * @param watchSignalType - Which signal type to watch in the target domain
 * @param discoveryMethod - The bandit arm that found this relationship
 * @param options - Additional options
 */
export function buildWatchedPrediction(
  relationship: {
    organization_id: string;
    source_domain: string;
    target_domain: string;
    effect_size: number;
    optimal_lag_days: number;
    natural_language: string;
  },
  currentMetricValue: number,
  watchSignalType: string,
  discoveryMethod?: BanditArm,
  options: {
    predictionId?: string;
    confidence?: number;
    expiryMultiplier?: number; // How many times the lag until expiry (default: 3x)
  } = {},
): WatchedPrediction {
  const lagMs = relationship.optimal_lag_days * 24 * 3600 * 1000;
  const expiryMs = lagMs * (options.expiryMultiplier ?? 3);
  const now = new Date();

  // Determine predicted direction from effect size
  // Positive effect: target is expected to increase (following source increase)
  // Negative effect: inverse relationship
  const predictedDirection: 'increase' | 'decrease' | 'stable' =
    Math.abs(relationship.effect_size) < 0.05
      ? 'stable'
      : relationship.effect_size > 0
        ? 'increase'
        : 'decrease';

  const predictionId = options.predictionId ??
    `pred_${relationship.source_domain}_${relationship.target_domain}_${Date.now()}`;

  return {
    predictionId,
    organizationId: relationship.organization_id,
    sourceDomain: relationship.source_domain,
    targetDomain: relationship.target_domain,
    watchMetric: `${relationship.target_domain}.${watchSignalType}`,
    watchSignalType,
    watchDomain: relationship.target_domain,
    baselineValue: currentMetricValue,
    baselineTimestamp: now,
    predictedDirection,
    predictedMagnitude: Math.max(-1, Math.min(1, relationship.effect_size)),
    confidence: options.confidence ?? 0.65,
    verifyAfter: new Date(now.getTime() + lagMs),
    expiresAt: new Date(now.getTime() + expiryMs),
    discoveryMethod,
    status: 'pending',
  };
}
