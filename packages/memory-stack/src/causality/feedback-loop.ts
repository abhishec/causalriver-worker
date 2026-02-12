/**
 * Nexus Memory Stack - Feedback Loop Closure
 *
 * L5: Feedback Learning - Close the Learning Loop
 *
 * Problem: The system makes predictions (e.g., "CS decline predicts AM churn")
 * but never checks if predictions were correct. Without feedback, the system
 * can't improve.
 *
 * This module:
 * 1. Records predictions with their contexts
 * 2. Schedules outcome verification
 * 3. Adjusts relationship weights based on accuracy
 * 4. Tracks prediction quality over time
 * 5. Identifies degrading relationships for retraining
 */

import { type SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface PredictionRecord {
  /** Unique prediction identifier */
  id: string;
  /** Organization this prediction belongs to */
  organizationId: string;
  /** Causal relationship this prediction is based on */
  relationshipId: string;
  /** Source domain of the relationship */
  sourceDomain: string;
  /** Target domain being predicted */
  targetDomain: string;
  /** Entity the prediction is about */
  entityType: string;
  entityId: string;
  /** When prediction was made */
  predictedAt: Date;
  /** The prediction itself */
  prediction: {
    /** Metric being predicted */
    targetMetric: string;
    /** Predicted direction */
    direction: 'increase' | 'decrease' | 'stable';
    /** Predicted magnitude (normalized -1 to 1) */
    magnitude: number;
    /** Expected timeframe in hours */
    timeframeHours: number;
    /** Confidence in prediction (0-1) */
    confidence: number;
  };
  /** Feature values at prediction time (for debugging) */
  featureSnapshot: Record<string, number>;
  /** Actual outcome (filled later) */
  actualOutcome?: {
    /** When measured */
    measuredAt: Date;
    /** Actual direction */
    direction: 'increase' | 'decrease' | 'stable';
    /** Actual magnitude */
    magnitude: number;
  };
  /** Whether prediction was correct */
  wasCorrect?: boolean;
  /** Direction was correct */
  directionCorrect?: boolean;
  /** Magnitude error */
  magnitudeError?: number;
  /** Status of this prediction */
  status: 'pending' | 'verified' | 'expired' | 'cancelled';
}

export interface RelationshipAccuracyMetrics {
  /** Relationship identifier */
  relationshipId: string;
  sourceDomain: string;
  targetDomain: string;
  /** Total predictions made */
  totalPredictions: number;
  /** Correct predictions */
  correctPredictions: number;
  /** Accuracy rate */
  accuracy: number;
  /** Direction accuracy (easier metric) */
  directionAccuracy: number;
  /** Mean absolute error on magnitude */
  meanAbsoluteError: number;
  /** Recent trend: improving or degrading */
  trend: 'improving' | 'stable' | 'degrading';
  /** Calibration: are confidence levels accurate? */
  calibrationError: number;
  /** Last updated */
  lastUpdated: Date;
  /** Window used for calculation */
  windowDays: number;
}

export interface WeightUpdate {
  /** Relationship being updated */
  relationshipId: string;
  sourceDomain: string;
  targetDomain: string;
  /** Previous weight */
  oldWeight: number;
  /** New weight */
  newWeight: number;
  /** Reason for update */
  reason: string;
  /** Predictions that triggered this update */
  triggeringPredictions: number;
  /** Applied at */
  appliedAt: Date;
}

export interface FeedbackLoopConfig {
  /** Weight boost for correct predictions (multiplier) */
  correctPredictionBoost: number;
  /** Weight penalty for incorrect predictions (multiplier) */
  incorrectPredictionPenalty: number;
  /** Minimum weight (floor) */
  minWeight: number;
  /** Maximum weight (ceiling) */
  maxWeight: number;
  /** Minimum predictions before adjusting weight */
  minPredictionsForUpdate: number;
  /** Days to look back for accuracy calculation */
  accuracyWindowDays: number;
  /** Accuracy threshold below which to flag for review */
  degradationThreshold: number;
  /** How often to run weight updates (hours) */
  updateIntervalHours: number;
}

export interface VerificationResult {
  predictionId: string;
  wasCorrect: boolean;
  directionCorrect: boolean;
  magnitudeError: number;
  weightAdjustment: number;
  newRelationshipWeight: number;
}

// ============================================================================
// FEEDBACK LOOP FACTORY
// ============================================================================

const DEFAULT_CONFIG: FeedbackLoopConfig = {
  correctPredictionBoost: 1.05,      // 5% increase
  incorrectPredictionPenalty: 0.90,  // 10% decrease
  minWeight: 0.1,
  maxWeight: 0.95,
  minPredictionsForUpdate: 10,
  accuracyWindowDays: 30,
  degradationThreshold: 0.5,
  updateIntervalHours: 24
};

/**
 * Create a feedback loop for prediction tracking and weight adjustment
 *
 * @example
 * ```typescript
 * const feedbackLoop = createFeedbackLoop({
 *   correctPredictionBoost: 1.05,
 *   incorrectPredictionPenalty: 0.90
 * });
 *
 * // Record a prediction
 * const predictionId = await feedbackLoop.recordPrediction(
 *   supabase,
 *   organizationId,
 *   {
 *     relationshipId: 'finance-cs',
 *     sourceDomain: 'Finance',
 *     targetDomain: 'CS',
 *     entityType: 'client',
 *     entityId: 'client-123',
 *     prediction: {
 *       targetMetric: 'health_score',
 *       direction: 'decrease',
 *       magnitude: -0.3,
 *       timeframeHours: 336, // 14 days
 *       confidence: 0.72
 *     },
 *     featureSnapshot: { paymentVelocity: -0.5, ticketCount: 3 }
 *   }
 * );
 *
 * // Later, verify the prediction
 * const result = await feedbackLoop.verifyPrediction(
 *   supabase,
 *   predictionId,
 *   { direction: 'decrease', magnitude: -0.25 }
 * );
 * ```
 */
export function createFeedbackLoop(config: Partial<FeedbackLoopConfig> = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const {
    correctPredictionBoost,
    incorrectPredictionPenalty,
    minWeight,
    maxWeight,
    minPredictionsForUpdate,
    accuracyWindowDays,
    degradationThreshold
  } = mergedConfig;

  return {
    /**
     * Record a new prediction
     */
    async recordPrediction(
      supabase: SupabaseClient,
      organizationId: string,
      input: Omit<PredictionRecord, 'id' | 'organizationId' | 'predictedAt' | 'status'>
    ): Promise<string> {
      const predictionId = generatePredictionId();
      const now = new Date();

      const record: PredictionRecord = {
        id: predictionId,
        organizationId,
        ...input,
        predictedAt: now,
        status: 'pending'
      };

      // Store in database
      const { error } = await supabase
        .from('prediction_records')
        .insert({
          id: record.id,
          organization_id: record.organizationId,
          relationship_id: record.relationshipId,
          source_domain: record.sourceDomain,
          target_domain: record.targetDomain,
          entity_type: record.entityType,
          entity_id: record.entityId,
          predicted_at: record.predictedAt.toISOString(),
          target_metric: record.prediction.targetMetric,
          predicted_direction: record.prediction.direction,
          predicted_magnitude: record.prediction.magnitude,
          timeframe_hours: record.prediction.timeframeHours,
          confidence: record.prediction.confidence,
          feature_snapshot: record.featureSnapshot,
          status: record.status
        });

      if (error) {
        console.error('Failed to record prediction:', error);
        throw new Error(`Failed to record prediction: ${error.message}`);
      }

      // Schedule verification
      const verifyAt = new Date(
        now.getTime() + record.prediction.timeframeHours * 60 * 60 * 1000
      );

      await this.scheduleVerification(supabase, predictionId, verifyAt);

      return predictionId;
    },

    /**
     * Schedule prediction verification
     */
    async scheduleVerification(
      supabase: SupabaseClient,
      predictionId: string,
      verifyAt: Date
    ): Promise<void> {
      // Store verification schedule
      await supabase
        .from('scheduled_verifications')
        .insert({
          prediction_id: predictionId,
          scheduled_for: verifyAt.toISOString(),
          status: 'pending'
        });
    },

    /**
     * Verify a prediction against actual outcome
     */
    async verifyPrediction(
      supabase: SupabaseClient,
      predictionId: string,
      actualOutcome: {
        direction: 'increase' | 'decrease' | 'stable';
        magnitude: number;
      }
    ): Promise<VerificationResult> {
      // Fetch prediction
      const { data: prediction, error: fetchError } = await supabase
        .from('prediction_records')
        .select('*')
        .eq('id', predictionId)
        .single();

      if (fetchError || !prediction) {
        throw new Error(`Prediction not found: ${predictionId}`);
      }

      const now = new Date();

      // Calculate correctness
      const directionCorrect = prediction.predicted_direction === actualOutcome.direction;
      const magnitudeError = Math.abs(prediction.predicted_magnitude - actualOutcome.magnitude);

      // Prediction is "correct" if direction matches and magnitude is within 50%
      const wasCorrect = directionCorrect && magnitudeError < Math.abs(prediction.predicted_magnitude) * 0.5;

      // Update prediction record
      await supabase
        .from('prediction_records')
        .update({
          actual_direction: actualOutcome.direction,
          actual_magnitude: actualOutcome.magnitude,
          measured_at: now.toISOString(),
          was_correct: wasCorrect,
          direction_correct: directionCorrect,
          magnitude_error: magnitudeError,
          status: 'verified'
        })
        .eq('id', predictionId);

      // Calculate weight adjustment
      const weightAdjustment = wasCorrect
        ? correctPredictionBoost
        : incorrectPredictionPenalty;

      // Fetch current relationship weight + confounder metadata
      const { data: relationship, error: relError } = await supabase
        .from('causal_relationships_statistical')
        .select('effect_size, is_likely_confounded, knockout_score')
        .eq('organization_id', prediction.organization_id)
        .eq('source_domain', prediction.source_domain)
        .eq('target_domain', prediction.target_domain)
        .single();

      const currentWeight = relError || !relationship ? 0.5 : relationship.effect_size;
      const isConfounded = relationship?.is_likely_confounded === true;

      // Confounder-aware weight adjustment:
      // - Confounded edges getting lucky predictions is NOT validation → skip boost
      // - Confounded edges failing confirms confounding → stronger penalty
      let effectiveAdjustment: number;
      if (isConfounded) {
        effectiveAdjustment = wasCorrect
          ? 1.0                                       // No boost: lucky prediction ≠ causation
          : incorrectPredictionPenalty * 0.95;        // Stronger penalty: confirms confounding
      } else {
        effectiveAdjustment = weightAdjustment;       // Normal boost/penalty for causal edges
      }

      const newWeight = Math.max(minWeight, Math.min(maxWeight,
        currentWeight * effectiveAdjustment
      ));

      // Update relationship weight
      await supabase
        .from('causal_relationships_statistical')
        .update({
          effect_size: newWeight,
          last_computed_at: now.toISOString()
        })
        .eq('organization_id', prediction.organization_id)
        .eq('source_domain', prediction.source_domain)
        .eq('target_domain', prediction.target_domain);

      // Record weight update
      await supabase
        .from('weight_update_history')
        .insert({
          organization_id: prediction.organization_id,
          relationship_id: prediction.relationship_id,
          source_domain: prediction.source_domain,
          target_domain: prediction.target_domain,
          old_weight: currentWeight,
          new_weight: newWeight,
          reason: isConfounded
            ? (wasCorrect ? 'correct_prediction_confounded_no_boost' : 'incorrect_prediction_confounded_stronger_penalty')
            : (wasCorrect ? 'correct_prediction' : 'incorrect_prediction'),
          prediction_id: predictionId,
          applied_at: now.toISOString()
        });

      return {
        predictionId,
        wasCorrect,
        directionCorrect,
        magnitudeError,
        weightAdjustment,
        newRelationshipWeight: newWeight
      };
    },

    /**
     * Get accuracy metrics for a relationship
     */
    async getRelationshipAccuracy(
      supabase: SupabaseClient,
      organizationId: string,
      sourceDomain: string,
      targetDomain: string,
      windowDays: number = accuracyWindowDays
    ): Promise<RelationshipAccuracyMetrics> {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - windowDays);

      // Fetch verified predictions
      const { data: predictions, error } = await supabase
        .from('prediction_records')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('source_domain', sourceDomain)
        .eq('target_domain', targetDomain)
        .eq('status', 'verified')
        .gte('predicted_at', startDate.toISOString());

      if (error || !predictions || predictions.length === 0) {
        return createEmptyAccuracyMetrics(
          `${sourceDomain}-${targetDomain}`,
          sourceDomain,
          targetDomain,
          windowDays
        );
      }

      const total = predictions.length;
      const correct = predictions.filter(p => p.was_correct).length;
      const directionCorrect = predictions.filter(p => p.direction_correct).length;

      const accuracy = correct / total;
      const directionAccuracy = directionCorrect / total;

      // Calculate MAE
      const mae = predictions.reduce((sum, p) =>
        sum + (p.magnitude_error || 0), 0) / total;

      // Calculate calibration error (expected vs actual by confidence bucket)
      const calibrationError = calculateCalibrationError(predictions);

      // Determine trend by comparing recent vs older predictions
      const midPoint = new Date(startDate.getTime() + (Date.now() - startDate.getTime()) / 2);
      const recentPredictions = predictions.filter(
        p => new Date(p.predicted_at) >= midPoint
      );
      const olderPredictions = predictions.filter(
        p => new Date(p.predicted_at) < midPoint
      );

      const recentAccuracy = recentPredictions.length > 0
        ? recentPredictions.filter(p => p.was_correct).length / recentPredictions.length
        : 0;
      const olderAccuracy = olderPredictions.length > 0
        ? olderPredictions.filter(p => p.was_correct).length / olderPredictions.length
        : 0;

      const trend: 'improving' | 'stable' | 'degrading' =
        recentAccuracy > olderAccuracy + 0.05 ? 'improving' :
        recentAccuracy < olderAccuracy - 0.05 ? 'degrading' : 'stable';

      return {
        relationshipId: `${sourceDomain}-${targetDomain}`,
        sourceDomain,
        targetDomain,
        totalPredictions: total,
        correctPredictions: correct,
        accuracy,
        directionAccuracy,
        meanAbsoluteError: mae,
        trend,
        calibrationError,
        lastUpdated: new Date(),
        windowDays
      };
    },

    /**
     * Bulk update all relationship weights based on recent predictions
     */
    async updateAllWeights(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<WeightUpdate[]> {
      const updates: WeightUpdate[] = [];

      // Get all relationships (including confounder metadata for weight adjustment)
      const { data: relationships, error: relError } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, effect_size, is_likely_confounded, knockout_score')
        .eq('organization_id', organizationId)
        .eq('is_significant', true);

      if (relError || !relationships) {
        console.error('Failed to fetch relationships:', relError);
        return [];
      }

      for (const rel of relationships) {
        const accuracy = await this.getRelationshipAccuracy(
          supabase,
          organizationId,
          rel.source_domain,
          rel.target_domain
        );

        if (accuracy.totalPredictions < minPredictionsForUpdate) {
          continue;
        }

        // Determine weight adjustment based on accuracy
        const currentWeight = rel.effect_size || 0.5;
        let newWeight = currentWeight;
        let reason = '';

        const isConfounded = rel.is_likely_confounded === true;

        if (isConfounded) {
          // Confounded relationships: never boost, penalize more aggressively
          if (accuracy.accuracy < degradationThreshold) {
            newWeight = Math.max(minWeight, currentWeight * 0.7);
            reason = `Low accuracy + confounded (${(accuracy.accuracy * 100).toFixed(1)}%)`;
          } else {
            // Even with good accuracy, don't boost confounded edges — could be spurious
            reason = `Confounded edge — weight held (accuracy: ${(accuracy.accuracy * 100).toFixed(1)}%)`;
          }
        } else if (accuracy.accuracy >= 0.7) {
          // Good accuracy, boost weight (causal edges only)
          newWeight = Math.min(maxWeight, currentWeight * 1.1);
          reason = `High accuracy (${(accuracy.accuracy * 100).toFixed(1)}%)`;
        } else if (accuracy.accuracy < degradationThreshold) {
          // Poor accuracy, penalize weight
          newWeight = Math.max(minWeight, currentWeight * 0.8);
          reason = `Low accuracy (${(accuracy.accuracy * 100).toFixed(1)}%)`;
        }

        if (Math.abs(newWeight - currentWeight) < 0.01) {
          continue; // No significant change
        }

        // Apply update
        await supabase
          .from('causal_relationships_statistical')
          .update({
            effect_size: newWeight,
            last_computed_at: new Date().toISOString()
          })
          .eq('organization_id', organizationId)
          .eq('source_domain', rel.source_domain)
          .eq('target_domain', rel.target_domain);

        const update: WeightUpdate = {
          relationshipId: `${rel.source_domain}-${rel.target_domain}`,
          sourceDomain: rel.source_domain,
          targetDomain: rel.target_domain,
          oldWeight: currentWeight,
          newWeight,
          reason,
          triggeringPredictions: accuracy.totalPredictions,
          appliedAt: new Date()
        };

        updates.push(update);

        // Record in history
        await supabase
          .from('weight_update_history')
          .insert({
            organization_id: organizationId,
            relationship_id: update.relationshipId,
            source_domain: rel.source_domain,
            target_domain: rel.target_domain,
            old_weight: currentWeight,
            new_weight: newWeight,
            reason,
            triggering_predictions: accuracy.totalPredictions,
            applied_at: new Date().toISOString()
          });
      }

      return updates;
    },

    /**
     * Find relationships that are degrading and need attention
     */
    async findDegradingRelationships(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<RelationshipAccuracyMetrics[]> {
      const degrading: RelationshipAccuracyMetrics[] = [];

      // Get all relationships
      const { data: relationships, error } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain')
        .eq('organization_id', organizationId)
        .eq('is_significant', true);

      if (error || !relationships) {
        return [];
      }

      for (const rel of relationships) {
        const accuracy = await this.getRelationshipAccuracy(
          supabase,
          organizationId,
          rel.source_domain,
          rel.target_domain
        );

        if (
          accuracy.totalPredictions >= minPredictionsForUpdate &&
          (accuracy.accuracy < degradationThreshold || accuracy.trend === 'degrading')
        ) {
          degrading.push(accuracy);
        }
      }

      return degrading.sort((a, b) => a.accuracy - b.accuracy);
    },

    /**
     * Process pending verifications
     */
    async processPendingVerifications(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<number> {
      const now = new Date();

      // Find predictions due for verification
      const { data: pending, error: pendingError } = await supabase
        .from('scheduled_verifications')
        .select('prediction_id')
        .eq('status', 'pending')
        .lte('scheduled_for', now.toISOString());

      if (pendingError || !pending) {
        return 0;
      }

      let processed = 0;

      for (const item of pending) {
        try {
          // Get the prediction
          const { data: prediction } = await supabase
            .from('prediction_records')
            .select('*')
            .eq('id', item.prediction_id)
            .eq('organization_id', organizationId)
            .single();

          if (!prediction || prediction.status !== 'pending') {
            continue;
          }

          // Fetch actual outcome from domain signals
          const actualOutcome = await fetchActualOutcome(
            supabase,
            prediction.organization_id,
            prediction.target_domain,
            prediction.entity_type,
            prediction.entity_id,
            prediction.target_metric
          );

          if (actualOutcome) {
            await this.verifyPrediction(supabase, item.prediction_id, actualOutcome);
            processed++;
          }

          // Mark verification as processed
          await supabase
            .from('scheduled_verifications')
            .update({ status: 'processed', processed_at: now.toISOString() })
            .eq('prediction_id', item.prediction_id);
        } catch (err) {
          console.error(`Failed to process verification for ${item.prediction_id}:`, err);
        }
      }

      return processed;
    },

    /**
     * Get prediction history for an entity
     */
    async getPredictionHistory(
      supabase: SupabaseClient,
      organizationId: string,
      entityType: string,
      entityId: string,
      limit: number = 20
    ): Promise<PredictionRecord[]> {
      const { data, error } = await supabase
        .from('prediction_records')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('predicted_at', { ascending: false })
        .limit(limit);

      if (error || !data) {
        return [];
      }

      return data.map(row => ({
        id: row.id,
        organizationId: row.organization_id,
        relationshipId: row.relationship_id,
        sourceDomain: row.source_domain,
        targetDomain: row.target_domain,
        entityType: row.entity_type,
        entityId: row.entity_id,
        predictedAt: new Date(row.predicted_at),
        prediction: {
          targetMetric: row.target_metric,
          direction: row.predicted_direction,
          magnitude: row.predicted_magnitude,
          timeframeHours: row.timeframe_hours,
          confidence: row.confidence
        },
        featureSnapshot: row.feature_snapshot,
        actualOutcome: row.measured_at ? {
          measuredAt: new Date(row.measured_at),
          direction: row.actual_direction,
          magnitude: row.actual_magnitude
        } : undefined,
        wasCorrect: row.was_correct,
        directionCorrect: row.direction_correct,
        magnitudeError: row.magnitude_error,
        status: row.status
      }));
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique prediction ID
 */
function generatePredictionId(): string {
  return `pred-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create empty accuracy metrics
 */
function createEmptyAccuracyMetrics(
  relationshipId: string,
  sourceDomain: string,
  targetDomain: string,
  windowDays: number
): RelationshipAccuracyMetrics {
  return {
    relationshipId,
    sourceDomain,
    targetDomain,
    totalPredictions: 0,
    correctPredictions: 0,
    accuracy: 0,
    directionAccuracy: 0,
    meanAbsoluteError: 0,
    trend: 'stable',
    calibrationError: 0,
    lastUpdated: new Date(),
    windowDays
  };
}

/**
 * Calculate calibration error
 * ECE: Expected Calibration Error
 */
function calculateCalibrationError(predictions: Array<{
  confidence: number;
  was_correct: boolean;
}>): number {
  // Bucket predictions by confidence
  const buckets: Map<number, { correct: number; total: number; sumConfidence: number }> = new Map();

  for (const pred of predictions) {
    const bucket = Math.floor(pred.confidence * 10) / 10; // 0.0, 0.1, 0.2, ...
    const current = buckets.get(bucket) || { correct: 0, total: 0, sumConfidence: 0 };

    current.total++;
    current.sumConfidence += pred.confidence;
    if (pred.was_correct) current.correct++;

    buckets.set(bucket, current);
  }

  // Calculate weighted average calibration error
  let totalError = 0;
  let totalSamples = 0;

  for (const bucket of buckets.values()) {
    const expectedAccuracy = bucket.sumConfidence / bucket.total;
    const actualAccuracy = bucket.correct / bucket.total;
    totalError += bucket.total * Math.abs(expectedAccuracy - actualAccuracy);
    totalSamples += bucket.total;
  }

  return totalSamples > 0 ? totalError / totalSamples : 0;
}

/**
 * Fetch actual outcome for verification
 */
async function fetchActualOutcome(
  supabase: SupabaseClient,
  organizationId: string,
  targetDomain: string,
  entityType: string,
  entityId: string,
  targetMetric: string
): Promise<{ direction: 'increase' | 'decrease' | 'stable'; magnitude: number } | null> {
  // Get the most recent signal for this entity in the target domain
  const { data, error } = await supabase
    .from('cross_domain_signals')
    .select('signal_value')
    .eq('organization_id', organizationId)
    .eq('source_domain', targetDomain)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('signal_type', targetMetric)
    .order('signal_timestamp', { ascending: false })
    .limit(2);

  if (error || !data || data.length < 2) {
    return null;
  }

  const current = data[0].signal_value;
  const previous = data[1].signal_value;
  const change = current - previous;

  const direction: 'increase' | 'decrease' | 'stable' =
    change > 0.05 ? 'increase' :
    change < -0.05 ? 'decrease' : 'stable';

  return {
    direction,
    magnitude: change
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const FeedbackLoop = {
  createFeedbackLoop
};
