/**
 * Closed-Loop Learning Engine — The Brain That Actually Learns
 * ═════════════════════════════════════════════════════════════
 *
 * PROBLEM STATEMENT:
 * ─────────────────
 * The 30-layer cognitive stack is a brilliant INFORMATION PROCESSOR
 * that masquerades as a LEARNING SYSTEM. It perceives perfectly but
 * forms zero long-term memories from outcomes. Specifically:
 *
 *   1. Predictions are NEVER verified
 *   2. Causal weights are FROZEN
 *   3. User feedback is NEVER collected
 *   4. Intervention outcomes are NEVER measured
 *   5. Retraining never triggers automatically
 *
 * PHYSICAL BRAIN ANALOGY:
 * ──────────────────────
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │ Human Brain Learning           │ NexusBrain Equivalent        │
 *   ├────────────────────────────────┼──────────────────────────────┤
 *   │ HIPPOCAMPUS                    │ PREDICTION VERIFICATION      │
 *   │   → Encodes new memories       │   → Records outcomes          │
 *   │   → Consolidates during sleep  │   → Verifies during sleep     │
 *   │   → Episodic → semantic        │   → Prediction → weight       │
 *   │                                │                              │
 *   │ VENTRAL TEGMENTAL AREA (VTA)   │ OUTCOME MEASUREMENT          │
 *   │   → Dopamine prediction error  │   → Predicted vs actual       │
 *   │   → Reward signal              │   → Confidence adjustment     │
 *   │   → Drives behavioral change   │   → Weight update trigger     │
 *   │                                │                              │
 *   │ AMYGDALA                       │ USER FEEDBACK                │
 *   │   → Emotional valence          │   → Helpful / not helpful     │
 *   │   → Tags memories for priority │   → Corrections → ai_memory  │
 *   │   → Rapid learning from fear   │   → Fast-path for mistakes   │
 *   │                                │                              │
 *   │ BASAL GANGLIA                  │ INTERVENTION TRACKING        │
 *   │   → Action selection           │   → Did the recommendation    │
 *   │   → Habit formation            │     actually work?            │
 *   │   → Reward-based learning      │   → Rule confidence update   │
 *   │                                │                              │
 *   │ CEREBELLUM                     │ WEIGHT ADAPTATION            │
 *   │   → Error correction           │   → Bayesian weight updates   │
 *   │   → Motor learning             │   → Causal edge refinement    │
 *   │   → Timing calibration         │   → Lag calibration           │
 *   └────────────────────────────────┴──────────────────────────────┘
 *
 * HOW THIS ENGINE CLOSES THE LOOP:
 * ────────────────────────────────
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │                                                                 │
 *   │  PERCEIVE ──→ PREDICT ──→ ACT ──→ OBSERVE ──→ LEARN ──→ ADAPT │
 *   │     ↑                                                      │   │
 *   │     └──────────────────────────────────────────────────────┘   │
 *   │                                                                 │
 *   │  L1-L15        L5,L8      L14,L29   THIS       THIS     THIS  │
 *   │  signal        curiosity  planning  ENGINE     ENGINE    ENGINE │
 *   │  ingestion     hypothesis recommend measure   verify    retrain│
 *   │                                     outcomes  predictions      │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * 5 LEARNING LOOPS (all wired into runLearningCycle):
 *
 *   Loop 1: PREDICTION VERIFICATION
 *     prediction_records (pending) → query cross_domain_signals for actuals
 *     → verifyPrediction() → mark was_correct → emit RL signal
 *
 *   Loop 2: CAUSAL WEIGHT UPDATES (Bayesian)
 *     verified predictions → PredictionEvidence → batchUpdate()
 *     → new posteriors → persist to causal_relationships_statistical
 *     → weights are ALIVE, not frozen
 *
 *   Loop 3: USER FEEDBACK
 *     recordFeedback(rating, correction) → learnFromFeedback()
 *     → ai_memory entries created → RL external reward to affected layers
 *     → brain queries improve over time
 *
 *   Loop 4: INTERVENTION OUTCOME TRACKING
 *     recommendation made → create observation window with baseline
 *     → time passes → query outcome metric → calculate delta
 *     → update rule confidence → RL reward to L14, L29
 *
 *   Loop 5: AUTOMATIC RETRAINING
 *     runLearningCycle() called from sleep cycle or scheduler
 *     → generates training pack from recent verified outcomes
 *     → applies to brain-trainer → causal graph + rules updated
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createFeedbackLoop, type VerificationResult, type WeightUpdate } from '../causality/feedback-loop';
import {
  createBrainPrediction,
  findPredictionsAwaitingOutcome,
  resolvePrediction,
  computeAccuracyByRule,
  type BrainPrediction,
  type PredictionAccuracy,
} from '../learning/outcome-tracker';
import { createBayesianUpdater, type PredictionEvidence, type EdgePosterior } from '../learning/bayesian-updater';
import type { ReinforcementFeedbackInstance } from './reinforcement-feedback-system';

// ============================================================================
// TYPES
// ============================================================================

export interface ClosedLoopConfig {
  supabase: SupabaseClient;
  organizationId: string;
  /** Reinforcement system to inject external rewards into (optional) */
  reinforcement?: ReinforcementFeedbackInstance | null;
  /** Max predictions to verify per cycle (default: 50) */
  verificationBatchSize?: number;
  /** Hours to look back for outcome signals (default: 48) */
  outcomeLookbackHours?: number;
  /** Minimum predictions before updating a rule's confidence (default: 5) */
  minPredictionsForRuleUpdate?: number;
  /** Whether to auto-generate training packs from outcomes (default: true) */
  autoGenerateTrainingPacks?: boolean;
}

/** Result of a single learning cycle */
export interface LearningCycleResult {
  /** When this cycle ran */
  timestamp: string;
  durationMs: number;

  // ── Loop 1: Prediction Verification ──
  verification: {
    predictionsChecked: number;
    predictionsVerified: number;
    correctPredictions: number;
    incorrectPredictions: number;
    expiredPredictions: number;
    verifications: VerificationResult[];
  };

  // ── Loop 2: Causal Weight Updates ──
  weightUpdates: {
    edgesUpdated: number;
    posteriorsPersisted: number;
    uncertainEdges: number;
    updates: WeightUpdate[];
  };

  // ── Loop 3: User Feedback ──
  feedbackProcessing: {
    feedbackProcessed: number;
    memoriesCreated: number;
    patternsReinforced: number;
  };

  // ── Loop 4: Intervention Outcome Tracking ──
  interventionOutcomes: {
    windowsChecked: number;
    windowsCompleted: number;
    interventionSuccesses: number;
    interventionFailures: number;
    rulesUpdated: number;
    ruleAccuracies: Array<{ ruleId: string; accuracy: number; total: number }>;
  };

  // ── Loop 5: Auto-Retraining ──
  retraining: {
    trainingPackGenerated: boolean;
    chainsLearned: number;
    rulesLearned: number;
    outcomesTrained: number;
  };

  // ── Loop 6: Agent Outcome Learning ──
  agentOutcomes: {
    executionsTracked: number;
    outcomesVerified: number;
    agentAccuracy: number;
    approvalRate: number;
    layerCredits: Array<{ layerId: number; reward: number }>;
  };

  /** RL signals injected (if RL system connected) */
  rlSignalsInjected: number;

  /** Human-readable summary of what the brain learned this cycle */
  learningReport: string[];
}

/** Tracks an intervention recommendation with its observation window */
export interface InterventionWindow {
  id: string;
  organizationId: string;
  ruleId: string;
  predictionId?: string;
  entityType: string;
  entityId: string;
  metricName: string;
  baselineValue: number;
  targetValue?: number;
  windowStartAt: string;
  windowEndAt: string;
  status: 'active' | 'completed' | 'expired';
  outcomeValue?: number;
  wasSuccessful?: boolean;
  createdAt: string;
}

/** Brain Agent outcome record (for Loop 6: Agent Outcome Learning) */
export interface AgentOutcomeRecord {
  /** Unique execution ID from brain-agent-runtime */
  executionId: string;
  /** Which brain agent ran */
  agentId: string;
  /** Organization ID */
  organizationId: string;
  /** When the agent ran */
  timestamp: string;
  /** What the agent predicted/recommended */
  prediction: string;
  /** Confidence at time of recommendation */
  confidence: number;
  /** Whether the recommendation was followed */
  wasFollowed: boolean;
  /** Whether the outcome was successful (null = not yet verified) */
  wasSuccessful?: boolean;
  /** Human feedback (if any) */
  humanFeedback?: 'approved' | 'rejected' | 'modified';
  /** Which layers contributed most (for RL credit assignment) */
  layerContributions?: Array<{ layerId: number; weight: number }>;
  /** Verification deadline */
  verifyAfterMs?: number;
}

/** User feedback record (for the feedback queue) */
export interface UserFeedbackRecord {
  conversationId: string;
  messageIndex: number;
  rating: 'helpful' | 'not_helpful' | 'incorrect';
  correction?: string;
  domain?: string;
  layerSource?: number;
  timestamp: number;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export interface ClosedLoopLearningInstance {
  /**
   * Run a complete learning cycle — ALL 5 loops.
   * This is called from:
   *   - neural-cortex-controller.runSleepCycle() (during sleep)
   *   - scheduled-jobs (daily/hourly cron)
   *   - manually for testing
   */
  runLearningCycle(): Promise<LearningCycleResult>;

  /**
   * Record user feedback (from UI thumbs up/down).
   * Queues it for processing in the next learning cycle.
   */
  recordUserFeedback(feedback: UserFeedbackRecord): void;

  /**
   * Record that an intervention was recommended.
   * Creates an observation window to track the outcome.
   */
  recordInterventionRecommended(params: {
    ruleId: string;
    predictionId?: string;
    entityType: string;
    entityId: string;
    metricName: string;
    baselineValue: number;
    targetValue?: number;
    windowDays: number;
  }): Promise<string>;

  /**
   * Get the learning health report (are the loops actually running?)
   */
  getLearningHealth(): Promise<LearningHealthReport>;

  /**
   * Record a brain agent execution for outcome tracking (Loop 6).
   * Called by brain-agent-runtime after every agent execution.
   */
  recordAgentExecution(record: AgentOutcomeRecord): void;

  /**
   * Record approval/rejection of a brain agent's proposed action (Loop 6).
   * Called when a human approves or rejects a pending-approval action.
   */
  recordAgentApproval(executionId: string, approved: boolean, feedback?: string): void;
}

export interface LearningHealthReport {
  /** Timestamp of report */
  timestamp: string;

  // Loop health indicators — these should all be > 0 in a healthy brain
  loop1_predictionsVerifiedLast7Days: number;
  loop2_weightUpdatesLast7Days: number;
  loop3_feedbackReceivedLast7Days: number;
  loop4_interventionsTrackedLast7Days: number;
  loop5_retrainingCyclesLast7Days: number;
  loop6_agentOutcomesLast7Days: number;

  /** Overall: is the brain learning? */
  isLearning: boolean;
  /** Which loops are broken? */
  brokenLoops: string[];
  /** Recommendations */
  recommendations: string[];
}

// ============================================================================
// FACTORY
// ============================================================================

export function createClosedLoopLearningEngine(config: ClosedLoopConfig): ClosedLoopLearningInstance {
  const {
    supabase,
    organizationId,
    reinforcement,
    verificationBatchSize = 50,
    outcomeLookbackHours = 48,
    minPredictionsForRuleUpdate = 5,
    autoGenerateTrainingPacks = true,
  } = config;

  // ── Internal state ──
  const _feedbackQueue: UserFeedbackRecord[] = [];
  const _agentOutcomeQueue: AgentOutcomeRecord[] = [];
  let _lastLearningCycleAt: number = 0;
  let _totalCyclesRun = 0;

  // ── Subsystems ──
  const _feedbackLoop = createFeedbackLoop();
  const _bayesianUpdater = createBayesianUpdater({
    supabase,
    organizationId,
    priorAlpha: 1,
    priorBeta: 1,
    decayHalfLifeDays: 90,
  });

  // ════════════════════════════════════════════════════════════════════════
  // LOOP 1: PREDICTION VERIFICATION
  // ════════════════════════════════════════════════════════════════════════

  async function _runPredictionVerification(): Promise<LearningCycleResult['verification']> {
    const result: LearningCycleResult['verification'] = {
      predictionsChecked: 0,
      predictionsVerified: 0,
      correctPredictions: 0,
      incorrectPredictions: 0,
      expiredPredictions: 0,
      verifications: [],
    };

    // 1. Fetch unverified predictions past their deadline
    const { data: pendingPredictions, error } = await supabase
      .from('prediction_records')
      .select('*')
      .eq('organization_id', organizationId)
      .is('was_correct', null)
      .lte('created_at', new Date(Date.now() - 3600_000).toISOString()) // At least 1hr old
      .order('created_at', { ascending: true })
      .limit(verificationBatchSize);

    if (error || !pendingPredictions?.length) {
      return result;
    }

    result.predictionsChecked = pendingPredictions.length;

    // 2. For each prediction, try to find actual outcome signals
    const lookbackSince = new Date(Date.now() - outcomeLookbackHours * 3600_000).toISOString();

    for (const pred of pendingPredictions) {
      try {
        // Query actual signals for the predicted entity
        const { data: actualSignals } = await supabase
          .from('cross_domain_signals')
          .select('signal_value, signal_timestamp, signal_type')
          .eq('organization_id', organizationId)
          .eq('entity_type', pred.entity_type)
          .eq('entity_id', pred.entity_id)
          .gte('signal_timestamp', lookbackSince)
          .order('signal_timestamp', { ascending: false })
          .limit(5);

        if (!actualSignals?.length) {
          // No outcome data yet — check if prediction expired
          const deadline = pred.metadata?.outcome_deadline
            ? new Date(pred.metadata.outcome_deadline as string)
            : new Date(new Date(pred.created_at).getTime() + 7 * 86400_000);

          if (deadline < new Date()) {
            // Expired — mark as such
            await supabase
              .from('prediction_records')
              .update({ was_correct: null, actual_outcome: 'expired', verified_at: new Date().toISOString() })
              .eq('id', pred.id);
            result.expiredPredictions++;
          }
          continue;
        }

        // 3. Determine if prediction was correct
        const latestActual = actualSignals[0];
        const predictedValue = pred.predicted_value ?? pred.metadata?.predicted_magnitude;
        const actualValue = latestActual.signal_value;

        // Direction check
        const predictedDirection = pred.predicted_outcome ?? pred.metadata?.predicted_direction ?? 'increase';
        let actualDirection: 'increase' | 'decrease' | 'stable' = 'stable';
        if (actualValue > (predictedValue as number) * 1.05) actualDirection = 'increase';
        else if (actualValue < (predictedValue as number) * 0.95) actualDirection = 'decrease';

        const directionCorrect = predictedDirection === actualDirection;
        const magnitudeError = predictedValue != null
          ? Math.abs(actualValue - (predictedValue as number))
          : 0;
        const wasCorrect = directionCorrect && magnitudeError < (predictedValue as number ?? 1) * 0.5;

        // 4. Update the prediction record
        await supabase
          .from('prediction_records')
          .update({
            actual_value: actualValue,
            actual_outcome: actualDirection,
            was_correct: wasCorrect,
            verified_at: new Date().toISOString(),
          })
          .eq('id', pred.id);

        result.predictionsVerified++;
        if (wasCorrect) result.correctPredictions++;
        else result.incorrectPredictions++;

        result.verifications.push({
          predictionId: pred.id,
          wasCorrect,
          directionCorrect,
          magnitudeError,
          weightAdjustment: 0, // Filled in Loop 2
          newRelationshipWeight: 0,
        });

        // 5. Inject RL signal — dopamine for correct, gaba for incorrect
        if (reinforcement) {
          // L5 (Curiosity) and L8 (Imagination) generated the hypothesis
          reinforcement.injectExternalReward(5, wasCorrect ? 0.8 : -0.5, `Prediction ${pred.id} ${wasCorrect ? 'correct' : 'incorrect'}`);
          reinforcement.injectExternalReward(8, wasCorrect ? 0.6 : -0.3, `Hypothesis ${wasCorrect ? 'validated' : 'invalidated'}`);
        }
      } catch {
        // Individual prediction failure shouldn't block others
      }
    }

    return result;
  }

  // ════════════════════════════════════════════════════════════════════════
  // LOOP 2: CAUSAL WEIGHT UPDATES (Bayesian)
  // ════════════════════════════════════════════════════════════════════════

  async function _runWeightUpdates(verifications: VerificationResult[]): Promise<LearningCycleResult['weightUpdates']> {
    const result: LearningCycleResult['weightUpdates'] = {
      edgesUpdated: 0,
      posteriorsPersisted: 0,
      uncertainEdges: 0,
      updates: [],
    };

    if (verifications.length === 0) return result;

    // 1. Load current posteriors from database
    await _bayesianUpdater.loadFromDatabase();

    // 2. Convert verifications to evidence for Bayesian updates
    //    Each verified prediction → PredictionEvidence for the causal edge
    const evidenceList: PredictionEvidence[] = [];

    for (const v of verifications) {
      // Look up the prediction to get source/target domains
      const { data: predRecord } = await supabase
        .from('prediction_records')
        .select('domain, metadata')
        .eq('id', v.predictionId)
        .single();

      if (predRecord) {
        const sourceDomain = predRecord.metadata?.source_domain as string ?? predRecord.domain;
        const targetDomain = predRecord.metadata?.target_domain as string ?? predRecord.domain;

        if (sourceDomain && targetDomain && sourceDomain !== targetDomain) {
          evidenceList.push({
            sourceDomain,
            targetDomain,
            wasCorrect: v.wasCorrect,
            predictionConfidence: 0.7, // Use original prediction confidence if available
          });
        }
      }
    }

    if (evidenceList.length === 0) return result;

    // 3. Batch update posteriors (Bayesian conjugate update: Beta(α,β))
    const updatedPosteriors = _bayesianUpdater.batchUpdate(evidenceList);
    result.edgesUpdated = updatedPosteriors.size;

    // 4. Persist updated posteriors back to database
    result.posteriorsPersisted = await _bayesianUpdater.persistPosteriors();

    // 5. Find uncertain edges (need more exploration)
    const uncertain = _bayesianUpdater.getUncertainEdges(0.2);
    result.uncertainEdges = uncertain.length;

    // 6. Also run the feedback loop's weight update (parallel approach)
    const weightUpdates = await _feedbackLoop.updateAllWeights(supabase, organizationId);
    result.updates = weightUpdates;

    // 7. Inject RL signal to L2 (Causal Discovery) — the more weights updated, the more dopamine
    if (reinforcement && result.edgesUpdated > 0) {
      const reward = Math.min(1.0, result.edgesUpdated / 10);
      reinforcement.injectExternalReward(2, reward, `${result.edgesUpdated} causal edges updated via Bayesian posteriors`);
    }

    return result;
  }

  // ════════════════════════════════════════════════════════════════════════
  // LOOP 3: USER FEEDBACK PROCESSING
  // ════════════════════════════════════════════════════════════════════════

  async function _runFeedbackProcessing(): Promise<LearningCycleResult['feedbackProcessing']> {
    const result: LearningCycleResult['feedbackProcessing'] = {
      feedbackProcessed: 0,
      memoriesCreated: 0,
      patternsReinforced: 0,
    };

    if (_feedbackQueue.length === 0) return result;

    // Process all queued feedback
    const feedbackBatch = _feedbackQueue.splice(0); // drain queue
    result.feedbackProcessed = feedbackBatch.length;

    for (const fb of feedbackBatch) {
      try {
        if (fb.rating === 'incorrect' && fb.correction) {
          // Create a correction memory in ai_memory
          await supabase.from('ai_memory').insert({
            organization_id: organizationId,
            memory_type: 'correction',
            content: fb.correction,
            domain: fb.domain ?? 'general',
            importance: 0.8,
            metadata: {
              conversationId: fb.conversationId,
              messageIndex: fb.messageIndex,
              originalRating: fb.rating,
              correctedAt: new Date().toISOString(),
              layerSource: fb.layerSource,
            },
          });
          result.memoriesCreated++;

          // Inject negative RL signal to L15 (Narrative) — the response was wrong
          if (reinforcement) {
            reinforcement.injectExternalReward(15, -0.7, `User corrected response: ${fb.correction.slice(0, 50)}`);
            if (fb.layerSource) {
              reinforcement.injectExternalReward(fb.layerSource, -0.5, 'User rated output as incorrect');
            }
          }
        } else if (fb.rating === 'not_helpful' && fb.correction) {
          await supabase.from('ai_memory').insert({
            organization_id: organizationId,
            memory_type: 'clarification',
            content: fb.correction,
            domain: fb.domain ?? 'general',
            importance: 0.5,
            metadata: {
              conversationId: fb.conversationId,
              messageIndex: fb.messageIndex,
              originalRating: fb.rating,
            },
          });
          result.memoriesCreated++;
        } else if (fb.rating === 'helpful') {
          result.patternsReinforced++;

          // Inject positive RL signal
          if (reinforcement) {
            reinforcement.injectExternalReward(15, 0.5, 'User found response helpful');
            if (fb.layerSource) {
              reinforcement.injectExternalReward(fb.layerSource, 0.6, 'User found layer output helpful');
            }
          }
        }
      } catch {
        // Individual feedback failure shouldn't block others
      }
    }

    return result;
  }

  // ════════════════════════════════════════════════════════════════════════
  // LOOP 4: INTERVENTION OUTCOME TRACKING
  // ════════════════════════════════════════════════════════════════════════

  async function _runInterventionOutcomeTracking(): Promise<LearningCycleResult['interventionOutcomes']> {
    const result: LearningCycleResult['interventionOutcomes'] = {
      windowsChecked: 0,
      windowsCompleted: 0,
      interventionSuccesses: 0,
      interventionFailures: 0,
      rulesUpdated: 0,
      ruleAccuracies: [],
    };

    // 1. Fetch active observation windows whose window_end has passed
    const { data: activeWindows, error } = await supabase
      .from('outcome_observation_windows')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .lte('window_end', new Date().toISOString())
      .limit(verificationBatchSize);

    if (error || !activeWindows?.length) return result;

    result.windowsChecked = activeWindows.length;

    // In-memory prediction tracking for rule accuracy computation
    const resolvedPredictions: BrainPrediction[] = [];

    for (const window of activeWindows) {
      try {
        // 2. Query actual metric value at window_end
        const { data: outcomeSignals } = await supabase
          .from('cross_domain_signals')
          .select('signal_value, signal_timestamp')
          .eq('organization_id', organizationId)
          .eq('entity_type', window.entity_type)
          .eq('entity_id', window.entity_id)
          .gte('signal_timestamp', window.window_start)
          .lte('signal_timestamp', new Date().toISOString())
          .order('signal_timestamp', { ascending: false })
          .limit(1);

        const outcomeValue = outcomeSignals?.[0]?.signal_value ?? null;

        if (outcomeValue === null) {
          // No outcome data — mark as expired
          await supabase
            .from('outcome_observation_windows')
            .update({ status: 'expired' })
            .eq('id', window.id);
          continue;
        }

        // 3. Calculate success: did the metric move in the predicted direction?
        const baseline = window.baseline_value ?? 0;
        const target = window.metadata?.target_value ?? null;
        const wasSuccessful = target !== null
          ? Math.abs(outcomeValue - (target as number)) < Math.abs(baseline - (target as number))
          : outcomeValue > baseline; // Default: improvement = success

        // 4. Update the observation window with outcome
        await supabase
          .from('outcome_observation_windows')
          .update({
            current_value: outcomeValue,
            status: 'completed',
            metadata: {
              ...(window.metadata ?? {}),
              was_successful: wasSuccessful,
              outcome_delta: outcomeValue - baseline,
              completed_at: new Date().toISOString(),
            },
          })
          .eq('id', window.id);

        result.windowsCompleted++;
        if (wasSuccessful) result.interventionSuccesses++;
        else result.interventionFailures++;

        // 5. Build BrainPrediction for accuracy tracking
        const ruleId = window.metadata?.rule_id as string;
        if (ruleId) {
          const prediction = createBrainPrediction({
            organizationId,
            ruleId,
            predictionType: window.observation_type,
            entityType: window.entity_type,
            entityId: window.entity_id,
            predictedOutcome: true,
            confidence: (window.metadata?.confidence as number) ?? 0.5,
          });
          const resolved = resolvePrediction(prediction, wasSuccessful, new Date());
          resolvedPredictions.push(resolved);
        }

        // 6. Inject RL signal to L14 (Planning) and L29 (Intervention)
        if (reinforcement) {
          reinforcement.injectExternalReward(14, wasSuccessful ? 0.7 : -0.4, `Intervention ${wasSuccessful ? 'succeeded' : 'failed'} for ${window.entity_type}:${window.entity_id}`);
          reinforcement.injectExternalReward(29, wasSuccessful ? 0.8 : -0.5, `Recommendation outcome: ${wasSuccessful ? 'positive' : 'negative'}`);
        }
      } catch {
        // Individual window failure shouldn't block others
      }
    }

    // 7. Compute per-rule accuracy and update rule confidence
    if (resolvedPredictions.length > 0) {
      const accuracyByRule = computeAccuracyByRule(resolvedPredictions);

      for (const [ruleId, accuracy] of accuracyByRule) {
        result.ruleAccuracies.push({
          ruleId,
          accuracy: accuracy.accuracy,
          total: accuracy.total_predictions,
        });

        // Update rule confidence in brain_grammar_rules (if enough samples)
        if (accuracy.total_predictions >= minPredictionsForRuleUpdate) {
          await supabase
            .from('brain_grammar_rules')
            .update({ confidence: accuracy.accuracy })
            .eq('id', ruleId)
            .eq('organization_id', organizationId);

          result.rulesUpdated++;
        }
      }
    }

    return result;
  }

  // ════════════════════════════════════════════════════════════════════════
  // LOOP 5: AUTO-RETRAINING
  // ════════════════════════════════════════════════════════════════════════

  async function _runAutoRetraining(
    verificationResult: LearningCycleResult['verification'],
    weightResult: LearningCycleResult['weightUpdates'],
  ): Promise<LearningCycleResult['retraining']> {
    const result: LearningCycleResult['retraining'] = {
      trainingPackGenerated: false,
      chainsLearned: 0,
      rulesLearned: 0,
      outcomesTrained: 0,
    };

    if (!autoGenerateTrainingPacks) return result;

    // Only generate a training pack if we have meaningful new data
    const hasNewData =
      verificationResult.predictionsVerified >= 3 ||
      weightResult.edgesUpdated >= 2;

    if (!hasNewData) return result;

    try {
      // 1. Fetch recently verified predictions to build training outcomes
      const { data: recentVerified } = await supabase
        .from('prediction_records')
        .select('*')
        .eq('organization_id', organizationId)
        .not('was_correct', 'is', null)
        .gte('verified_at', new Date(Date.now() - 7 * 86400_000).toISOString())
        .limit(100);

      if (!recentVerified?.length) return result;

      // 2. Build a mini training pack from verified outcomes
      const trainingOutcomes = recentVerified.map(p => ({
        predicted: p.predicted_outcome ?? 'increase',
        predictedConfidence: p.confidence ?? 0.5,
        actual: p.actual_outcome ?? 'unknown',
        wasCorrect: p.was_correct ?? false,
        sourceDomain: p.domain,
        targetDomain: p.metadata?.target_domain as string,
      }));

      // 3. Fetch strengthened causal edges to build training chains
      const { data: strongEdges } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, effect_size, optimal_lag_days, granger_p_value')
        .eq('organization_id', organizationId)
        .gte('evidence_weight', 0.6)
        .order('evidence_weight', { ascending: false })
        .limit(50);

      const trainingChains = (strongEdges ?? []).map(e => ({
        source: e.source_domain,
        target: e.target_domain,
        metric: 'cross_domain',
        effectSize: e.effect_size ?? 0.5,
        lagDays: e.optimal_lag_days ?? 3,
        pValue: e.granger_p_value ?? 0.05,
      }));

      // 4. Apply the training pack via brain-trainer
      const { createBrainTrainer } = await import('../learning/brain-trainer');
      const trainer = createBrainTrainer();
      const packResult = await trainer.train(supabase, organizationId, {
        id: `auto_${Date.now()}`,
        title: `Auto-learned from ${recentVerified.length} verified predictions`,
        source: 'closed-loop-learning-engine',
        industry: 'auto-detected',
        domains: [...new Set(recentVerified.map(p => p.domain).filter(Boolean))],
        causalChains: trainingChains,
        businessRules: [],
        cascades: [],
        patterns: [],
        outcomes: trainingOutcomes,
        confidence: 0.7,
        tags: ['auto-generated', 'closed-loop'],
      });

      result.trainingPackGenerated = packResult.success;
      result.chainsLearned = packResult.causalEdges;
      result.rulesLearned = packResult.rules;
      result.outcomesTrained = packResult.outcomes;

      // Inject RL signal to L30 (Wisdom) — the brain learned something new
      if (reinforcement && packResult.success) {
        reinforcement.injectExternalReward(30, 0.9, `Auto-retraining: ${packResult.causalEdges} chains, ${packResult.outcomes} outcomes`);
        reinforcement.injectExternalReward(6, 0.7, 'Self-modification: brain updated its own causal model');
      }
    } catch {
      // Retraining failure shouldn't crash the learning cycle
    }

    return result;
  }

  // ════════════════════════════════════════════════════════════════════════
  // LOOP 6: AGENT OUTCOME LEARNING
  // ════════════════════════════════════════════════════════════════════════

  function _runAgentOutcomeTracking(): LearningCycleResult['agentOutcomes'] {
    const result: LearningCycleResult['agentOutcomes'] = {
      executionsTracked: _agentOutcomeQueue.length,
      outcomesVerified: 0,
      agentAccuracy: 0,
      approvalRate: 0,
      layerCredits: [],
    };

    if (_agentOutcomeQueue.length === 0) return result;

    // Count approvals vs rejections
    const withFeedback = _agentOutcomeQueue.filter(r => r.humanFeedback != null);
    const approved = withFeedback.filter(r => r.humanFeedback === 'approved');
    result.approvalRate = withFeedback.length > 0
      ? approved.length / withFeedback.length
      : 0;

    // Check for verified outcomes (records older than verifyAfterMs or with wasSuccessful set)
    const now = Date.now();
    const verifiable = _agentOutcomeQueue.filter(r => {
      if (r.wasSuccessful != null) return true;
      if (r.verifyAfterMs && now - new Date(r.timestamp).getTime() > r.verifyAfterMs) return true;
      return false;
    });

    const verified = verifiable.filter(r => r.wasSuccessful != null);
    result.outcomesVerified = verified.length;

    // Compute agent accuracy from verified outcomes
    const successful = verified.filter(r => r.wasSuccessful === true);
    result.agentAccuracy = verified.length > 0
      ? successful.length / verified.length
      : 0;

    // Compute RL credits per layer from all records with layer contributions
    const layerRewards = new Map<number, { total: number; count: number }>();
    for (const record of _agentOutcomeQueue) {
      if (!record.layerContributions) continue;
      const reward = record.wasSuccessful === true ? 1.0
        : record.wasSuccessful === false ? -0.5
        : record.humanFeedback === 'approved' ? 0.5
        : record.humanFeedback === 'rejected' ? -0.3
        : 0;
      if (reward === 0) continue;

      for (const lc of record.layerContributions) {
        const existing = layerRewards.get(lc.layerId) ?? { total: 0, count: 0 };
        existing.total += reward * lc.weight;
        existing.count++;
        layerRewards.set(lc.layerId, existing);
      }
    }

    // Inject RL rewards per layer
    for (const [layerId, { total, count }] of layerRewards) {
      const avgReward = total / count;
      result.layerCredits.push({ layerId, reward: avgReward });

      if (reinforcement) {
        const signal = avgReward > 0 ? 'dopamine' : 'gaba';
        reinforcement.injectExternalReward(
          layerId,
          Math.abs(avgReward),
          `Agent outcome: ${count} executions, avg reward ${avgReward.toFixed(2)} for L${layerId}`
        );
      }
    }

    // Drain processed records (keep only unverified ones with pending approval)
    const kept: AgentOutcomeRecord[] = [];
    for (const record of _agentOutcomeQueue) {
      const age = now - new Date(record.timestamp).getTime();
      const isPending = record.humanFeedback == null && record.wasSuccessful == null;
      const isRecent = age < 7 * 86400_000; // Keep for 7 days
      if (isPending && isRecent) {
        kept.push(record);
      }
    }
    _agentOutcomeQueue.length = 0;
    _agentOutcomeQueue.push(...kept);

    return result;
  }

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════════════

  return {
    async runLearningCycle(): Promise<LearningCycleResult> {
      const start = Date.now();
      const report: string[] = [];
      let rlSignalsInjected = 0;

      // ── Loop 1: Verify predictions ──
      const verification = await _runPredictionVerification();
      if (verification.predictionsVerified > 0) {
        report.push(`Verified ${verification.predictionsVerified} predictions: ${verification.correctPredictions} correct, ${verification.incorrectPredictions} incorrect`);
        rlSignalsInjected += verification.predictionsVerified * 2; // 2 RL signals per verification (L5, L8)
      }
      if (verification.expiredPredictions > 0) {
        report.push(`${verification.expiredPredictions} predictions expired (no outcome data)`);
      }

      // ── Loop 2: Update causal weights ──
      const weightUpdates = await _runWeightUpdates(verification.verifications);
      if (weightUpdates.edgesUpdated > 0) {
        report.push(`Updated ${weightUpdates.edgesUpdated} causal edge weights (Bayesian posteriors). ${weightUpdates.uncertainEdges} edges need more evidence.`);
        rlSignalsInjected += 1; // 1 RL signal to L2
      }

      // ── Loop 3: Process user feedback ──
      const feedbackProcessing = await _runFeedbackProcessing();
      if (feedbackProcessing.feedbackProcessed > 0) {
        report.push(`Processed ${feedbackProcessing.feedbackProcessed} user feedback: ${feedbackProcessing.memoriesCreated} corrections memorized, ${feedbackProcessing.patternsReinforced} patterns reinforced`);
        rlSignalsInjected += feedbackProcessing.feedbackProcessed;
      }

      // ── Loop 4: Check intervention outcomes ──
      const interventionOutcomes = await _runInterventionOutcomeTracking();
      if (interventionOutcomes.windowsCompleted > 0) {
        report.push(`Measured ${interventionOutcomes.windowsCompleted} intervention outcomes: ${interventionOutcomes.interventionSuccesses} successes, ${interventionOutcomes.interventionFailures} failures`);
        if (interventionOutcomes.rulesUpdated > 0) {
          report.push(`Updated confidence for ${interventionOutcomes.rulesUpdated} rules based on outcome data`);
        }
        rlSignalsInjected += interventionOutcomes.windowsCompleted * 2; // L14, L29
      }

      // ── Loop 5: Auto-retraining ──
      const retraining = await _runAutoRetraining(verification, weightUpdates);
      if (retraining.trainingPackGenerated) {
        report.push(`Auto-generated training pack: ${retraining.chainsLearned} causal chains, ${retraining.outcomesTrained} outcomes learned`);
        rlSignalsInjected += 2; // L30, L6
      }

      // ── Loop 6: Agent Outcome Learning ──
      const agentOutcomes = _runAgentOutcomeTracking();
      if (agentOutcomes.executionsTracked > 0) {
        report.push(`Agent outcomes: ${agentOutcomes.executionsTracked} tracked, ${agentOutcomes.outcomesVerified} verified, accuracy: ${(agentOutcomes.agentAccuracy * 100).toFixed(0)}%`);
        rlSignalsInjected += agentOutcomes.layerCredits.length;
      }

      // ── Summary ──
      if (report.length === 0) {
        report.push('No new learning signals this cycle. Brain is waiting for outcomes.');
      }

      _lastLearningCycleAt = Date.now();
      _totalCyclesRun++;

      return {
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
        verification,
        weightUpdates,
        feedbackProcessing,
        interventionOutcomes,
        retraining,
        agentOutcomes,
        rlSignalsInjected,
        learningReport: report,
      };
    },

    recordUserFeedback(feedback: UserFeedbackRecord): void {
      _feedbackQueue.push({ ...feedback, timestamp: feedback.timestamp || Date.now() });
    },

    async recordInterventionRecommended(params): Promise<string> {
      const windowEnd = new Date(Date.now() + params.windowDays * 86400_000);
      const id = `iw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await supabase.from('outcome_observation_windows').insert({
        id,
        organization_id: organizationId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        observation_type: params.metricName,
        window_start: new Date().toISOString(),
        window_end: windowEnd.toISOString(),
        baseline_value: params.baselineValue,
        status: 'active',
        metadata: {
          rule_id: params.ruleId,
          prediction_id: params.predictionId,
          target_value: params.targetValue,
          confidence: 0.7,
        },
      });

      return id;
    },

    recordAgentExecution(record: AgentOutcomeRecord): void {
      _agentOutcomeQueue.push(record);
    },

    recordAgentApproval(executionId: string, approved: boolean, feedback?: string): void {
      const record = _agentOutcomeQueue.find(r => r.executionId === executionId);
      if (record) {
        record.humanFeedback = approved ? 'approved' : 'rejected';
        record.wasFollowed = approved;
        // Inject RL signal immediately for fast learning
        if (reinforcement && record.layerContributions) {
          const signal = approved ? 'dopamine' : 'gaba';
          for (const lc of record.layerContributions) {
            reinforcement.injectExternalReward(lc.layerId, lc.weight * (approved ? 0.1 : -0.05), `Agent ${approved ? 'approved' : 'rejected'} (${signal})`);
          }
        }
      }
      // Also inject feedback as a user correction for future context
      if (feedback) {
        _feedbackQueue.push({
          conversationId: executionId,
          messageIndex: 0,
          rating: approved ? 'helpful' : 'not_helpful',
          correction: feedback,
          domain: record?.agentId,
          timestamp: Date.now(),
        });
      }
    },

    async getLearningHealth(): Promise<LearningHealthReport> {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const brokenLoops: string[] = [];
      const recommendations: string[] = [];

      // Loop 1: Predictions verified?
      const { count: verifiedCount } = await supabase
        .from('prediction_records')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .not('was_correct', 'is', null)
        .gte('verified_at', sevenDaysAgo);

      const loop1 = verifiedCount ?? 0;
      if (loop1 === 0) {
        brokenLoops.push('Loop 1: Prediction Verification — ZERO predictions verified in 7 days');
        recommendations.push('Ensure runLearningCycle() is called regularly (sleep cycle or cron)');
      }

      // Loop 2: Weights updated?
      const { count: weightCount } = await supabase
        .from('weight_update_history')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', sevenDaysAgo);

      const loop2 = weightCount ?? 0;
      if (loop2 === 0) {
        brokenLoops.push('Loop 2: Causal Weight Updates — ZERO weight changes in 7 days (weights are FROZEN)');
        recommendations.push('Verify predictions first (Loop 1), then weight updates will follow');
      }

      // Loop 3: Feedback received?
      const { count: feedbackCount } = await supabase
        .from('ai_memory')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('memory_type', ['correction', 'clarification'])
        .gte('created_at', sevenDaysAgo);

      const loop3 = feedbackCount ?? 0;
      if (loop3 === 0) {
        brokenLoops.push('Loop 3: User Feedback — ZERO corrections collected in 7 days');
        recommendations.push('Wire UI feedback buttons to closedLoop.recordUserFeedback()');
      }

      // Loop 4: Interventions tracked?
      const { count: windowCount } = await supabase
        .from('outcome_observation_windows')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', sevenDaysAgo);

      const loop4 = windowCount ?? 0;
      if (loop4 === 0) {
        brokenLoops.push('Loop 4: Intervention Outcomes — ZERO interventions tracked in 7 days');
        recommendations.push('Wire L29 (Intervention Recommender) output to closedLoop.recordInterventionRecommended()');
      }

      // Loop 5: Retraining happened?
      const loop5 = _totalCyclesRun;
      if (loop5 === 0) {
        brokenLoops.push('Loop 5: Auto-Retraining — ZERO learning cycles run');
        recommendations.push('Call runLearningCycle() from neural cortex sleep cycle');
      }

      // Loop 6: Agent outcomes tracked?
      const loop6 = _agentOutcomeQueue.filter(r => r.humanFeedback != null || r.wasSuccessful != null).length;

      const isLearning = brokenLoops.length === 0;
      if (!isLearning && brokenLoops.length >= 5) {
        recommendations.unshift('CRITICAL: Your Brain doesn\'t learn. Multiple feedback loops are broken.');
      }

      return {
        timestamp: new Date().toISOString(),
        loop1_predictionsVerifiedLast7Days: loop1,
        loop2_weightUpdatesLast7Days: loop2,
        loop3_feedbackReceivedLast7Days: loop3,
        loop4_interventionsTrackedLast7Days: loop4,
        loop5_retrainingCyclesLast7Days: loop5,
        loop6_agentOutcomesLast7Days: loop6,
        isLearning,
        brokenLoops,
        recommendations,
      };
    },
  };
}
