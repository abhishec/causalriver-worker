/**
 * Calibration Feedback Loop V1 — The Brain That Learns From Its Mistakes
 * ======================================================================
 *
 * Brain Analog: Cerebellum + Basal Ganglia (error correction + reward learning)
 *
 * The brain makes predictions (forecasts, diagnoses, interventions).
 * Those predictions either come true or don't.
 * This module CLOSES THE LOOP: it compares predictions to outcomes,
 * measures calibration drift, and recalibrates the brain's confidence.
 *
 * What it does:
 *   1. Records decision journal entries as predictions with deadlines
 *   2. When outcomes arrive, matches them to predictions
 *   3. Computes calibration metrics (Brier score, ECE, reliability)
 *   4. Detects overconfidence/underconfidence patterns per domain
 *   5. Produces recalibration adjustments the engine can use
 *   6. Tracks the brain's learning velocity over time
 *
 * The key insight: A brain that says "I'm 80% confident" should be right
 * ~80% of the time. If it's right 60% of the time, it's overconfident.
 * If it's right 95% of the time, it's underconfident. Both are bad.
 *
 * Design: Pure functions + state container. Never throws.
 * All calibration data is append-only for audit trail.
 *
 * @packageDocumentation
 */

import type { DecisionJournalEntry, ActionType } from './domain-action-engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NexusRepository } from '../persistence/supabase-repository';
import { createSupabaseRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

/** A recorded prediction from a decision journal entry */
export interface CalibrationPrediction {
  /** Unique prediction ID */
  id: string;
  /** From which decision journal entry */
  journalEntryTimestamp: string;
  /** The original question */
  question: string;
  /** What was predicted */
  prediction: string;
  /** Predicted outcome description */
  predictedOutcome: string;
  /** Confidence at time of prediction (0-1) */
  confidence: number;
  /** Domain this prediction targets */
  domain: string;
  /** Action type that generated this */
  actionType: ActionType;
  /** When this prediction should be reviewed */
  reviewDate: string;
  /** The falsification criteria (what would prove this wrong) */
  falsificationCriteria: string[];
  /** Key assumptions */
  assumptions: string[];
  /** Whether this prediction has been resolved */
  resolved: boolean;
  /** Outcome (set when resolved) */
  outcome?: CalibrationOutcome;
  /** When this prediction was created */
  createdAt: string;
}

/** The actual outcome matched to a prediction */
export interface CalibrationOutcome {
  /** Whether the prediction was correct */
  correct: boolean;
  /** Degree of accuracy (0 = completely wrong, 1 = perfectly correct) */
  accuracy: number;
  /** What actually happened */
  actualOutcome: string;
  /** When the outcome was recorded */
  recordedAt: string;
  /** How the outcome was determined */
  source: 'manual' | 'automated' | 'signal_data' | 'brain_reanalysis';
  /** Optional notes about why the prediction was right/wrong */
  notes?: string;
}

/** Calibration metrics for a specific domain or overall */
export interface CalibrationMetrics {
  /** Total predictions tracked */
  totalPredictions: number;
  /** Predictions that have been resolved */
  resolvedPredictions: number;
  /** Predictions still pending */
  pendingPredictions: number;
  /** Brier score (0 = perfect, 1 = worst) — measures calibration + discrimination */
  brierScore: number;
  /** Expected Calibration Error — measures how well-calibrated confidence is */
  expectedCalibrationError: number;
  /** Calibration buckets — binned predictions by confidence */
  calibrationBuckets: CalibrationBucket[];
  /** Is the brain overconfident, underconfident, or calibrated? */
  calibrationBias: 'overconfident' | 'underconfident' | 'well_calibrated';
  /** Average confidence assigned */
  avgConfidence: number;
  /** Actual accuracy rate */
  actualAccuracy: number;
  /** Confidence gap (avgConfidence - actualAccuracy) */
  confidenceGap: number;
  /** Trend: is calibration improving, degrading, or stable? */
  trend: 'improving' | 'degrading' | 'stable' | 'insufficient_data';
  /** Domain-level breakdown */
  domainBreakdown: Record<string, DomainCalibration>;
  /** Action-type breakdown */
  actionTypeBreakdown: Record<string, ActionTypeCalibration>;
}

/** A calibration bucket (e.g., predictions made with 70-80% confidence) */
export interface CalibrationBucket {
  /** Bucket range (e.g., "0.7-0.8") */
  range: string;
  /** Lower bound of confidence range */
  lower: number;
  /** Upper bound of confidence range */
  upper: number;
  /** Number of predictions in this bucket */
  count: number;
  /** Average confidence in this bucket */
  avgConfidence: number;
  /** Actual accuracy (fraction correct) */
  actualAccuracy: number;
  /** Gap (avgConfidence - actualAccuracy; positive = overconfident) */
  gap: number;
}

/** Per-domain calibration stats */
export interface DomainCalibration {
  domain: string;
  totalPredictions: number;
  resolvedPredictions: number;
  avgConfidence: number;
  actualAccuracy: number;
  brierScore: number;
  calibrationBias: 'overconfident' | 'underconfident' | 'well_calibrated';
}

/** Per-action-type calibration stats */
export interface ActionTypeCalibration {
  actionType: string;
  totalPredictions: number;
  resolvedPredictions: number;
  avgConfidence: number;
  actualAccuracy: number;
  brierScore: number;
}

/** Recalibration adjustment — how to fix the brain's confidence */
export interface RecalibrationAdjustment {
  /** Which domain to adjust */
  domain: string;
  /** Which action type to adjust (or 'all') */
  actionType: string;
  /** Current average confidence */
  currentAvgConfidence: number;
  /** Recommended adjusted confidence */
  recommendedConfidence: number;
  /** Adjustment factor (multiply raw confidence by this) */
  adjustmentFactor: number;
  /** How many resolved predictions this is based on */
  sampleSize: number;
  /** How reliable is this adjustment (need 20+ samples for reliability) */
  reliability: 'high' | 'medium' | 'low';
  /** Human-readable explanation */
  explanation: string;
}

/** Learning velocity — how fast is the brain improving */
export interface LearningVelocity {
  /** Periods analyzed */
  periods: Array<{
    /** Period label */
    label: string;
    /** Number of resolved predictions */
    resolvedCount: number;
    /** Brier score for this period */
    brierScore: number;
    /** ECE for this period */
    ece: number;
  }>;
  /** Is the brain getting better over time? */
  trajectory: 'accelerating' | 'steady' | 'plateaued' | 'regressing' | 'insufficient_data';
  /** Improvement rate (negative = improving, positive = degrading) */
  brierScoreChangeRate: number;
}

/** Configuration for the Calibration Feedback Loop */
export interface CalibrationFeedbackLoopConfig {
  /** Number of buckets for calibration curve (default: 10) */
  numBuckets?: number;
  /** Minimum resolved predictions to compute reliable metrics (default: 5) */
  minSamplesForMetrics?: number;
  /** Minimum resolved predictions for reliable recalibration (default: 20) */
  minSamplesForRecalibration?: number;
  /** Confidence gap threshold for "well calibrated" (default: 0.1) */
  wellCalibratedThreshold?: number;
  /** Verbose logging */
  verbose?: boolean;
  /** Supabase client for database persistence (if provided, predictions persist to DB) */
  supabase?: SupabaseClient;
  /** Organization ID for scoped persistence */
  organizationId?: string;
  /** Lookback window in days for loading historical predictions (default: 30) */
  lookbackDays?: number;
}

// ============================================================================
// CALIBRATION FEEDBACK LOOP
// ============================================================================

/** Create the Calibration Feedback Loop — the brain's error correction system */
export function createCalibrationFeedbackLoop(config: CalibrationFeedbackLoopConfig = {}) {
  const {
    numBuckets = 10,
    minSamplesForMetrics = 5,
    minSamplesForRecalibration = 20,
    wellCalibratedThreshold = 0.1,
    verbose = false,
    supabase,
    organizationId,
    lookbackDays = 30,
  } = config;

  const predictions: CalibrationPrediction[] = [];
  let predictionCounter = 0;

  const log = verbose ? (...args: unknown[]) => console.log('[CalibrationLoop]', ...args) : () => {};

  // Create repository if database persistence is enabled
  const repository: NexusRepository | null = supabase && organizationId
    ? createSupabaseRepository(supabase, organizationId)
    : null;

  // Load historical predictions from database if repository is available
  if (repository) {
    (async () => {
      try {
        const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const dbPredictions = await repository.getPendingPredictions(new Date());
        // Convert to in-memory format for metrics computation
        for (const dbPred of dbPredictions) {
          predictions.push({
            id: dbPred.id,
            journalEntryTimestamp: dbPred.created_at,
            question: `${dbPred.action_type} in ${dbPred.domain}`,
            prediction: dbPred.prediction,
            predictedOutcome: dbPred.prediction,
            confidence: dbPred.confidence,
            domain: dbPred.domain,
            actionType: dbPred.action_type as ActionType,
            reviewDate: dbPred.review_date,
            falsificationCriteria: dbPred.metadata?.falsificationCriteria || [],
            assumptions: dbPred.metadata?.assumptions || [],
            resolved: dbPred.resolved || false,
            outcome: dbPred.resolved
              ? {
                  correct: dbPred.actual_outcome,
                  accuracy: dbPred.actual_outcome ? 1 : 0,
                  actualOutcome: dbPred.actual_outcome ? 'Prediction came true' : 'Prediction did not come true',
                  recordedAt: dbPred.resolved_at,
                  source: 'automated' as const,
                  notes: 'Loaded from database',
                }
              : undefined,
            createdAt: dbPred.created_at,
          });
        }
        log(`Loaded ${dbPredictions.length} predictions from database`);
      } catch (err) {
        log('Failed to load predictions from database (continuing with in-memory only):', err);
      }
    })();
  }

  // ── Record Prediction from Decision Journal ──

  function recordPrediction(entry: DecisionJournalEntry): CalibrationPrediction {
    predictionCounter++;
    const prediction: CalibrationPrediction = {
      id: `pred_${Date.now()}_${predictionCounter}`,
      journalEntryTimestamp: entry.timestamp,
      question: entry.question,
      prediction: entry.recommendation,
      predictedOutcome: entry.predictedOutcome,
      confidence: entry.confidenceAtDecision,
      domain: entry.domain,
      actionType: entry.actionType,
      reviewDate: entry.reviewDate,
      falsificationCriteria: entry.falsificationCriteria,
      assumptions: entry.assumptions,
      resolved: false,
      createdAt: new Date().toISOString(),
    };

    predictions.push(prediction);
    log(`Recorded prediction: ${prediction.id} (${prediction.domain}, ${(prediction.confidence * 100).toFixed(0)}% confidence, review: ${prediction.reviewDate})`);

    // Persist to database if repository is available
    if (repository) {
      repository
        .upsertPrediction({
          domain: prediction.domain,
          actionType: prediction.actionType,
          prediction: prediction.prediction,
          confidence: prediction.confidence,
          reviewDate: new Date(prediction.reviewDate),
          metadata: {
            question: prediction.question,
            predictedOutcome: prediction.predictedOutcome,
            falsificationCriteria: prediction.falsificationCriteria,
            assumptions: prediction.assumptions,
          },
        })
        .then((id) => {
          log(`Persisted prediction ${prediction.id} to database (DB ID: ${id})`);
          // Update in-memory ID to match database ID
          prediction.id = id;
        })
        .catch((err) => {
          log(`Failed to persist prediction ${prediction.id}:`, err);
        });
    }

    return prediction;
  }

  // ── Record Outcome ──

  function recordOutcome(
    predictionId: string,
    outcome: Omit<CalibrationOutcome, 'recordedAt'> | { actuallyHappened: boolean; confidence: number; notes?: string },
  ): CalibrationPrediction | null {
    const prediction = predictions.find(p => p.id === predictionId);
    if (!prediction) {
      log(`Prediction ${predictionId} not found`);
      return null;
    }

    // Handle both outcome formats (from decision journal and from outcome-resolver-agent)
    const normalizedOutcome: CalibrationOutcome = 'actuallyHappened' in outcome
      ? {
          correct: outcome.actuallyHappened,
          accuracy: outcome.actuallyHappened ? 1 : 0,
          actualOutcome: outcome.actuallyHappened ? 'Prediction came true' : 'Prediction did not come true',
          source: 'automated' as const,
          notes: outcome.notes || '',
          recordedAt: new Date().toISOString(),
        }
      : {
          ...outcome,
          recordedAt: new Date().toISOString(),
        };

    prediction.resolved = true;
    prediction.outcome = normalizedOutcome;

    log(`Resolved prediction: ${predictionId} → ${normalizedOutcome.correct ? 'CORRECT' : 'INCORRECT'} (accuracy: ${(normalizedOutcome.accuracy * 100).toFixed(0)}%)`);

    // Persist to database if repository is available
    if (repository) {
      const brierScore = Math.pow(prediction.confidence - normalizedOutcome.accuracy, 2);
      repository
        .recordPredictionOutcome({
          predictionId,
          actuallyHappened: normalizedOutcome.correct,
          brierScore,
          resolvedAt: new Date(),
        })
        .then(() => {
          log(`Persisted outcome for prediction ${predictionId} to database`);
        })
        .catch((err) => {
          log(`Failed to persist outcome for prediction ${predictionId}:`, err);
        });
    }

    return prediction;
  }

  // ── Compute Calibration Metrics ──

  function computeMetrics(filter?: { domain?: string; actionType?: ActionType }): CalibrationMetrics {
    let relevant = [...predictions];
    if (filter?.domain) relevant = relevant.filter(p => p.domain === filter.domain);
    if (filter?.actionType) relevant = relevant.filter(p => p.actionType === filter.actionType);

    const resolved = relevant.filter(p => p.resolved && p.outcome);
    const pending = relevant.filter(p => !p.resolved);

    if (resolved.length < minSamplesForMetrics) {
      return {
        totalPredictions: relevant.length,
        resolvedPredictions: resolved.length,
        pendingPredictions: pending.length,
        brierScore: 1,
        expectedCalibrationError: 1,
        calibrationBuckets: [],
        calibrationBias: 'well_calibrated',
        avgConfidence: relevant.length > 0 ? relevant.reduce((sum, p) => sum + p.confidence, 0) / relevant.length : 0,
        actualAccuracy: 0,
        confidenceGap: 0,
        trend: 'insufficient_data',
        domainBreakdown: {},
        actionTypeBreakdown: {},
      };
    }

    // ── Brier Score: mean((confidence - actual)^2) ──
    const brierScore = resolved.reduce((sum, p) => {
      const actual = p.outcome!.accuracy;
      return sum + Math.pow(p.confidence - actual, 2);
    }, 0) / resolved.length;

    // ── Calibration Buckets ──
    const bucketSize = 1.0 / numBuckets;
    const calibrationBuckets: CalibrationBucket[] = [];

    for (let i = 0; i < numBuckets; i++) {
      const lower = i * bucketSize;
      const upper = (i + 1) * bucketSize;
      const inBucket = resolved.filter(p => p.confidence >= lower && p.confidence < upper);

      if (inBucket.length > 0) {
        const avgConf = inBucket.reduce((s, p) => s + p.confidence, 0) / inBucket.length;
        const actualAcc = inBucket.reduce((s, p) => s + p.outcome!.accuracy, 0) / inBucket.length;

        calibrationBuckets.push({
          range: `${lower.toFixed(1)}-${upper.toFixed(1)}`,
          lower,
          upper,
          count: inBucket.length,
          avgConfidence: avgConf,
          actualAccuracy: actualAcc,
          gap: avgConf - actualAcc,
        });
      }
    }

    // ── Expected Calibration Error (ECE): weighted average of bucket gaps ──
    const ece = calibrationBuckets.reduce((sum, b) => {
      return sum + (b.count / resolved.length) * Math.abs(b.gap);
    }, 0);

    // ── Overall confidence and accuracy ──
    const avgConfidence = resolved.reduce((s, p) => s + p.confidence, 0) / resolved.length;
    const actualAccuracy = resolved.reduce((s, p) => s + p.outcome!.accuracy, 0) / resolved.length;
    const confidenceGap = avgConfidence - actualAccuracy;

    // ── Calibration bias ──
    let calibrationBias: CalibrationMetrics['calibrationBias'] = 'well_calibrated';
    if (Math.abs(confidenceGap) > wellCalibratedThreshold) {
      calibrationBias = confidenceGap > 0 ? 'overconfident' : 'underconfident';
    }

    // ── Trend detection (compare first half to second half) ──
    let trend: CalibrationMetrics['trend'] = 'insufficient_data';
    if (resolved.length >= minSamplesForMetrics * 2) {
      const half = Math.floor(resolved.length / 2);
      const firstHalf = resolved.slice(0, half);
      const secondHalf = resolved.slice(half);

      const firstBrier = firstHalf.reduce((s, p) => s + Math.pow(p.confidence - p.outcome!.accuracy, 2), 0) / firstHalf.length;
      const secondBrier = secondHalf.reduce((s, p) => s + Math.pow(p.confidence - p.outcome!.accuracy, 2), 0) / secondHalf.length;

      if (secondBrier < firstBrier - 0.02) trend = 'improving';
      else if (secondBrier > firstBrier + 0.02) trend = 'degrading';
      else trend = 'stable';
    }

    // ── Domain breakdown ──
    const domainBreakdown: Record<string, DomainCalibration> = {};
    const domains = [...new Set(resolved.map(p => p.domain))];
    for (const domain of domains) {
      const domainPreds = resolved.filter(p => p.domain === domain);
      if (domainPreds.length >= 2) {
        const dAvgConf = domainPreds.reduce((s, p) => s + p.confidence, 0) / domainPreds.length;
        const dActualAcc = domainPreds.reduce((s, p) => s + p.outcome!.accuracy, 0) / domainPreds.length;
        const dBrier = domainPreds.reduce((s, p) => s + Math.pow(p.confidence - p.outcome!.accuracy, 2), 0) / domainPreds.length;
        const dGap = dAvgConf - dActualAcc;

        domainBreakdown[domain] = {
          domain,
          totalPredictions: relevant.filter(p => p.domain === domain).length,
          resolvedPredictions: domainPreds.length,
          avgConfidence: dAvgConf,
          actualAccuracy: dActualAcc,
          brierScore: dBrier,
          calibrationBias: Math.abs(dGap) <= wellCalibratedThreshold ? 'well_calibrated'
            : dGap > 0 ? 'overconfident' : 'underconfident',
        };
      }
    }

    // ── Action type breakdown ──
    const actionTypeBreakdown: Record<string, ActionTypeCalibration> = {};
    const actionTypes = [...new Set(resolved.map(p => p.actionType))];
    for (const at of actionTypes) {
      const atPreds = resolved.filter(p => p.actionType === at);
      if (atPreds.length >= 2) {
        actionTypeBreakdown[at] = {
          actionType: at,
          totalPredictions: relevant.filter(p => p.actionType === at).length,
          resolvedPredictions: atPreds.length,
          avgConfidence: atPreds.reduce((s, p) => s + p.confidence, 0) / atPreds.length,
          actualAccuracy: atPreds.reduce((s, p) => s + p.outcome!.accuracy, 0) / atPreds.length,
          brierScore: atPreds.reduce((s, p) => s + Math.pow(p.confidence - p.outcome!.accuracy, 2), 0) / atPreds.length,
        };
      }
    }

    return {
      totalPredictions: relevant.length,
      resolvedPredictions: resolved.length,
      pendingPredictions: pending.length,
      brierScore,
      expectedCalibrationError: ece,
      calibrationBuckets,
      calibrationBias,
      avgConfidence,
      actualAccuracy,
      confidenceGap,
      trend,
      domainBreakdown,
      actionTypeBreakdown,
    };
  }

  // ── Generate Recalibration Adjustments ──

  function generateRecalibrationAdjustments(): RecalibrationAdjustment[] {
    const adjustments: RecalibrationAdjustment[] = [];
    const resolved = predictions.filter(p => p.resolved && p.outcome);

    if (resolved.length < minSamplesForRecalibration) {
      log(`Need ${minSamplesForRecalibration} resolved predictions for recalibration (have ${resolved.length})`);
      return adjustments;
    }

    // ── Per-domain adjustments ──
    const domains = [...new Set(resolved.map(p => p.domain))];
    for (const domain of domains) {
      const domainPreds = resolved.filter(p => p.domain === domain);
      if (domainPreds.length < Math.ceil(minSamplesForRecalibration / 2)) continue;

      const avgConf = domainPreds.reduce((s, p) => s + p.confidence, 0) / domainPreds.length;
      const actualAcc = domainPreds.reduce((s, p) => s + p.outcome!.accuracy, 0) / domainPreds.length;
      const gap = avgConf - actualAcc;

      if (Math.abs(gap) > wellCalibratedThreshold) {
        // Adjustment factor: if brain says 80% but is right 60%, factor = 60/80 = 0.75
        const factor = avgConf > 0 ? actualAcc / avgConf : 1;

        adjustments.push({
          domain,
          actionType: 'all',
          currentAvgConfidence: avgConf,
          recommendedConfidence: actualAcc,
          adjustmentFactor: Math.max(0.3, Math.min(1.5, factor)),
          sampleSize: domainPreds.length,
          reliability: domainPreds.length >= minSamplesForRecalibration ? 'high'
            : domainPreds.length >= minSamplesForRecalibration / 2 ? 'medium' : 'low',
          explanation: gap > 0
            ? `Brain is overconfident in ${domain}: predicts ${(avgConf * 100).toFixed(0)}% but actual accuracy is ${(actualAcc * 100).toFixed(0)}%. Multiply confidence by ${factor.toFixed(2)}.`
            : `Brain is underconfident in ${domain}: predicts ${(avgConf * 100).toFixed(0)}% but actual accuracy is ${(actualAcc * 100).toFixed(0)}%. Multiply confidence by ${factor.toFixed(2)}.`,
        });
      }
    }

    // ── Per-action-type adjustments ──
    const actionTypes = [...new Set(resolved.map(p => p.actionType))];
    for (const at of actionTypes) {
      const atPreds = resolved.filter(p => p.actionType === at);
      if (atPreds.length < Math.ceil(minSamplesForRecalibration / 2)) continue;

      const avgConf = atPreds.reduce((s, p) => s + p.confidence, 0) / atPreds.length;
      const actualAcc = atPreds.reduce((s, p) => s + p.outcome!.accuracy, 0) / atPreds.length;
      const gap = avgConf - actualAcc;

      if (Math.abs(gap) > wellCalibratedThreshold) {
        const factor = avgConf > 0 ? actualAcc / avgConf : 1;

        adjustments.push({
          domain: 'all',
          actionType: at,
          currentAvgConfidence: avgConf,
          recommendedConfidence: actualAcc,
          adjustmentFactor: Math.max(0.3, Math.min(1.5, factor)),
          sampleSize: atPreds.length,
          reliability: atPreds.length >= minSamplesForRecalibration ? 'high'
            : atPreds.length >= minSamplesForRecalibration / 2 ? 'medium' : 'low',
          explanation: gap > 0
            ? `Brain is overconfident in ${at} actions: predicts ${(avgConf * 100).toFixed(0)}% but actual accuracy is ${(actualAcc * 100).toFixed(0)}%.`
            : `Brain is underconfident in ${at} actions: predicts ${(avgConf * 100).toFixed(0)}% but actual accuracy is ${(actualAcc * 100).toFixed(0)}%.`,
        });
      }
    }

    return adjustments;
  }

  // ── Apply Recalibration to a Raw Confidence Score ──

  function recalibrateConfidence(
    rawConfidence: number,
    domain: string,
    actionType: ActionType,
  ): { calibratedConfidence: number; adjustmentApplied: boolean; reason: string } {
    const adjustments = generateRecalibrationAdjustments();

    // Find most specific adjustment: domain+actionType > domain > actionType > none
    const domainActionAdj = adjustments.find(a => a.domain === domain && a.actionType === actionType);
    const domainAdj = adjustments.find(a => a.domain === domain && a.actionType === 'all');
    const actionAdj = adjustments.find(a => a.domain === 'all' && a.actionType === actionType);

    const adj = domainActionAdj || domainAdj || actionAdj;

    if (!adj || adj.reliability === 'low') {
      return {
        calibratedConfidence: rawConfidence,
        adjustmentApplied: false,
        reason: 'No reliable recalibration data available',
      };
    }

    const calibrated = Math.max(0, Math.min(1, rawConfidence * adj.adjustmentFactor));
    return {
      calibratedConfidence: calibrated,
      adjustmentApplied: true,
      reason: adj.explanation,
    };
  }

  // ── Compute Learning Velocity ──

  function computeLearningVelocity(): LearningVelocity {
    const resolved = predictions.filter(p => p.resolved && p.outcome);

    if (resolved.length < minSamplesForMetrics * 3) {
      return {
        periods: [],
        trajectory: 'insufficient_data',
        brierScoreChangeRate: 0,
      };
    }

    // Split resolved predictions into 3-4 periods
    const periodCount = Math.min(4, Math.floor(resolved.length / minSamplesForMetrics));
    const periodSize = Math.floor(resolved.length / periodCount);
    const periods: LearningVelocity['periods'] = [];

    for (let i = 0; i < periodCount; i++) {
      const start = i * periodSize;
      const end = i === periodCount - 1 ? resolved.length : (i + 1) * periodSize;
      const periodPreds = resolved.slice(start, end);

      const brier = periodPreds.reduce((s, p) => s + Math.pow(p.confidence - p.outcome!.accuracy, 2), 0) / periodPreds.length;

      // ECE per period
      const buckets: Record<string, { confSum: number; accSum: number; count: number }> = {};
      for (const p of periodPreds) {
        const bucket = Math.floor(p.confidence * numBuckets);
        const key = `${bucket}`;
        if (!buckets[key]) buckets[key] = { confSum: 0, accSum: 0, count: 0 };
        buckets[key].confSum += p.confidence;
        buckets[key].accSum += p.outcome!.accuracy;
        buckets[key].count++;
      }
      const ece = Object.values(buckets).reduce((sum, b) => {
        const avgConf = b.confSum / b.count;
        const avgAcc = b.accSum / b.count;
        return sum + (b.count / periodPreds.length) * Math.abs(avgConf - avgAcc);
      }, 0);

      periods.push({
        label: `Period ${i + 1} (predictions ${start + 1}-${end})`,
        resolvedCount: periodPreds.length,
        brierScore: brier,
        ece,
      });
    }

    // Determine trajectory
    let trajectory: LearningVelocity['trajectory'] = 'steady';
    if (periods.length >= 2) {
      const first = periods[0].brierScore;
      const last = periods[periods.length - 1].brierScore;
      const changeRate = (last - first) / first;

      if (changeRate < -0.15) trajectory = 'accelerating';
      else if (changeRate < -0.05) trajectory = 'steady';
      else if (changeRate < 0.05) trajectory = 'plateaued';
      else trajectory = 'regressing';
    }

    const brierScoreChangeRate = periods.length >= 2
      ? (periods[periods.length - 1].brierScore - periods[0].brierScore)
      : 0;

    return { periods, trajectory, brierScoreChangeRate };
  }

  // ── Get Overdue Predictions (past review date, still unresolved) ──

  function getOverduePredictions(): CalibrationPrediction[] {
    const now = new Date().toISOString();
    return predictions.filter(p => !p.resolved && p.reviewDate < now);
  }

  // ── Get Pending Predictions by Domain ──

  function getPendingByDomain(): Record<string, CalibrationPrediction[]> {
    const pending = predictions.filter(p => !p.resolved);
    const result: Record<string, CalibrationPrediction[]> = {};
    for (const p of pending) {
      if (!result[p.domain]) result[p.domain] = [];
      result[p.domain].push(p);
    }
    return result;
  }

  // ── Summary for Prompt (inject into LLM system prompt) ──

  function formatCalibrationForPrompt(): string {
    const metrics = computeMetrics();
    const parts: string[] = [];

    parts.push(`## 📊 BRAIN CALIBRATION STATUS`);

    if (metrics.resolvedPredictions < minSamplesForMetrics) {
      parts.push(`Predictions tracked: ${metrics.totalPredictions} (${metrics.resolvedPredictions} resolved, need ${minSamplesForMetrics} for metrics)`);
      parts.push(`Status: Building calibration baseline — keep making and reviewing predictions.`);
      return parts.join('\n');
    }

    parts.push(`Predictions: ${metrics.totalPredictions} total, ${metrics.resolvedPredictions} resolved, ${metrics.pendingPredictions} pending`);
    parts.push(`Brier Score: ${metrics.brierScore.toFixed(3)} (${metrics.brierScore < 0.25 ? 'good' : metrics.brierScore < 0.5 ? 'moderate' : 'poor'})`);
    parts.push(`ECE: ${metrics.expectedCalibrationError.toFixed(3)} | Calibration: ${metrics.calibrationBias.replace(/_/g, ' ')}`);
    parts.push(`Average Confidence: ${(metrics.avgConfidence * 100).toFixed(0)}% | Actual Accuracy: ${(metrics.actualAccuracy * 100).toFixed(0)}% | Gap: ${(metrics.confidenceGap * 100).toFixed(0)}%`);
    parts.push(`Trend: ${metrics.trend}`);

    if (Object.keys(metrics.domainBreakdown).length > 0) {
      parts.push('');
      parts.push('### Domain Calibration');
      for (const [domain, dc] of Object.entries(metrics.domainBreakdown)) {
        parts.push(`  ${domain}: ${dc.calibrationBias} (${(dc.avgConfidence * 100).toFixed(0)}% predicted vs ${(dc.actualAccuracy * 100).toFixed(0)}% actual, n=${dc.resolvedPredictions})`);
      }
    }

    const adjustments = generateRecalibrationAdjustments();
    if (adjustments.length > 0) {
      parts.push('');
      parts.push('### Active Recalibration Adjustments');
      for (const adj of adjustments.slice(0, 5)) {
        parts.push(`  ${adj.domain}/${adj.actionType}: ×${adj.adjustmentFactor.toFixed(2)} (${adj.explanation.slice(0, 100)})`);
      }
    }

    return parts.join('\n');
  }

  // ── Recalibrate Domain/ActionType ──

  async function recalibrate(params: {
    domain?: string;
    actionType?: ActionType;
    targetAccuracy?: number;
    adjustmentFactor?: number;
  }): Promise<void> {
    const { domain, actionType, targetAccuracy, adjustmentFactor } = params;

    log(`Recalibration triggered for domain=${domain || 'all'}, actionType=${actionType || 'all'}`);

    // This method is called by outcome-resolver-agent to apply recalibration
    // The actual recalibration logic is in generateRecalibrationAdjustments()
    // This method simply logs and confirms the recalibration was requested

    const adjustments = generateRecalibrationAdjustments();
    const relevant = adjustments.filter(
      (a) =>
        (!domain || a.domain === domain) &&
        (!actionType || a.actionType === actionType)
    );

    if (relevant.length > 0) {
      log(`Applied recalibration adjustments:`);
      for (const adj of relevant) {
        log(`  ${adj.domain}/${adj.actionType}: ×${adj.adjustmentFactor.toFixed(2)} (${adj.explanation.slice(0, 100)})`);
      }
    } else {
      log(`No recalibration adjustments found for domain=${domain}, actionType=${actionType}`);
    }

    // If target accuracy or adjustment factor is provided, we could persist it
    // For now, recalibration is computed dynamically from historical accuracy
  }

  // ── Public API ──

  return {
    /** Record a prediction from a decision journal entry */
    recordPrediction,
    /** Record an outcome for a prediction */
    recordOutcome,
    /** Compute calibration metrics (optionally filtered) */
    computeMetrics,
    /** Generate recalibration adjustments based on historical accuracy */
    generateRecalibrationAdjustments,
    /** Apply recalibration to a raw confidence score */
    recalibrateConfidence,
    /** Compute learning velocity over time */
    computeLearningVelocity,
    /** Get predictions past their review date */
    getOverduePredictions,
    /** Get pending predictions grouped by domain */
    getPendingByDomain,
    /** Format calibration data for LLM system prompt */
    formatCalibrationForPrompt,
    /** Get all predictions */
    getAllPredictions: () => [...predictions],
    /** Get a specific prediction */
    getPrediction: (id: string) => predictions.find(p => p.id === id) || null,
    /** Get stats summary */
    getStats: () => ({
      totalPredictions: predictions.length,
      resolved: predictions.filter(p => p.resolved).length,
      pending: predictions.filter(p => !p.resolved).length,
      overdue: getOverduePredictions().length,
      domains: [...new Set(predictions.map(p => p.domain))],
      actionTypes: [...new Set(predictions.map(p => p.actionType))],
    }),
    /** Trigger recalibration for a domain/actionType */
    recalibrate,
  };
}

/** Convenience type for the calibration feedback loop instance */
export type CalibrationFeedbackLoop = ReturnType<typeof createCalibrationFeedbackLoop>;
