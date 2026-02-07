/**
 * Prediction Tracker
 * 
 * Records predictions when made and tracks actual outcomes for calibration.
 * This enables measuring prediction accuracy over time.
 * 
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A prediction record capturing what the system predicted
 */
export interface PredictionRecord {
  /** Unique prediction identifier */
  id: string;
  /** Organization scope */
  organizationId: string;
  /** Type of prediction (churn, conversion, escalation, etc.) */
  predictionType: string;
  /** Entity being predicted about */
  entityType: string;
  entityId: string;
  /** Predicted probability (0-1) */
  predictedProbability: number;
  /** Confidence interval bounds */
  confidenceLower?: number;
  confidenceUpper?: number;
  /** When the prediction was made */
  predictedAt: Date;
  /** How many days until outcome should be known */
  predictionWindowDays: number;
  /** Model version for tracking improvements */
  modelVersion?: string;
  /** Snapshot of features used for prediction */
  featureSnapshot?: Record<string, unknown>;
}

/**
 * An outcome record linking actual results to predictions
 */
export interface OutcomeRecord {
  /** Prediction this outcome is for */
  predictionId: string;
  /** Whether the predicted event occurred */
  outcomeOccurred: boolean;
  /** When the outcome was observed */
  outcomeDate: Date;
  /** When we recorded this outcome */
  recordedAt: Date;
  /** Additional context about the outcome */
  metadata?: Record<string, unknown>;
}

/**
 * A prediction with its matched outcome
 */
export interface MatchedPrediction {
  prediction: PredictionRecord;
  outcome: OutcomeRecord;
  /** Absolute error: |predicted - actual| */
  absoluteError: number;
  /** Squared error for Brier score */
  squaredError: number;
}

/**
 * Pending prediction awaiting outcome
 */
export interface PendingPrediction extends PredictionRecord {
  /** Days until outcome window expires */
  daysRemaining: number;
  /** Whether the window has expired */
  isExpired: boolean;
}

// ============================================================================
// PREDICTION LIFECYCLE
// ============================================================================

/**
 * Creates a new prediction record
 * 
 * @example
 * ```ts
 * const prediction = recordPrediction({
 *   organizationId: 'org-123',
 *   predictionType: 'churn',
 *   entityType: 'client',
 *   entityId: 'client-456',
 *   predictedProbability: 0.75,
 *   predictionWindowDays: 30,
 *   modelVersion: 'v2.1'
 * });
 * ```
 */
export function recordPrediction(input: {
  organizationId: string;
  predictionType: string;
  entityType: string;
  entityId: string;
  predictedProbability: number;
  predictionWindowDays: number;
  confidenceLower?: number;
  confidenceUpper?: number;
  modelVersion?: string;
  featureSnapshot?: Record<string, unknown>;
}): PredictionRecord {
  const id = `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    id,
    organizationId: input.organizationId,
    predictionType: input.predictionType,
    entityType: input.entityType,
    entityId: input.entityId,
    predictedProbability: Math.max(0, Math.min(1, input.predictedProbability)),
    confidenceLower: input.confidenceLower,
    confidenceUpper: input.confidenceUpper,
    predictedAt: new Date(),
    predictionWindowDays: input.predictionWindowDays,
    modelVersion: input.modelVersion,
    featureSnapshot: input.featureSnapshot,
  };
}

/**
 * Records an outcome for a prediction
 */
export function recordOutcome(
  predictionId: string,
  outcomeOccurred: boolean,
  outcomeDate: Date = new Date(),
  metadata?: Record<string, unknown>
): OutcomeRecord {
  return {
    predictionId,
    outcomeOccurred,
    outcomeDate,
    recordedAt: new Date(),
    metadata,
  };
}

/**
 * Identifies predictions that are still awaiting outcomes
 */
export function getPendingPredictions(
  predictions: PredictionRecord[],
  outcomes: OutcomeRecord[],
  asOfDate: Date = new Date()
): PendingPrediction[] {
  const outcomesByPredictionId = new Set(outcomes.map(o => o.predictionId));
  
  return predictions
    .filter(p => !outcomesByPredictionId.has(p.id))
    .map(p => {
      const expiryDate = new Date(p.predictedAt);
      expiryDate.setDate(expiryDate.getDate() + p.predictionWindowDays);
      
      const daysRemaining = Math.ceil(
        (expiryDate.getTime() - asOfDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      return {
        ...p,
        daysRemaining: Math.max(0, daysRemaining),
        isExpired: daysRemaining < 0,
      };
    });
}

/**
 * Matches predictions with their outcomes for calibration analysis
 */
export function matchPredictionsToOutcomes(
  predictions: PredictionRecord[],
  outcomes: OutcomeRecord[]
): MatchedPrediction[] {
  const outcomeMap = new Map(outcomes.map(o => [o.predictionId, o]));
  
  return predictions
    .filter(p => outcomeMap.has(p.id))
    .map(prediction => {
      const outcome = outcomeMap.get(prediction.id)!;
      const actualValue = outcome.outcomeOccurred ? 1 : 0;
      const absoluteError = Math.abs(prediction.predictedProbability - actualValue);
      const squaredError = absoluteError * absoluteError;
      
      return {
        prediction,
        outcome,
        absoluteError,
        squaredError,
      };
    });
}

/**
 * Groups predictions by type for separate calibration analysis
 */
export function groupPredictionsByType(
  matched: MatchedPrediction[]
): Map<string, MatchedPrediction[]> {
  const groups = new Map<string, MatchedPrediction[]>();
  
  for (const m of matched) {
    const type = m.prediction.predictionType;
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(m);
  }
  
  return groups;
}

/**
 * Filters predictions within a time window
 */
export function filterByTimeWindow(
  predictions: PredictionRecord[],
  startDate: Date,
  endDate: Date
): PredictionRecord[] {
  return predictions.filter(p => 
    p.predictedAt >= startDate && p.predictedAt <= endDate
  );
}

/**
 * Gets summary statistics for prediction tracking
 */
export function getPredictionStats(
  predictions: PredictionRecord[],
  outcomes: OutcomeRecord[]
): {
  totalPredictions: number;
  withOutcomes: number;
  pending: number;
  expired: number;
  avgProbability: number;
  outcomeRate: number;
} {
  const pending = getPendingPredictions(predictions, outcomes);
  const matched = matchPredictionsToOutcomes(predictions, outcomes);
  
  const avgProbability = predictions.length > 0
    ? predictions.reduce((sum, p) => sum + p.predictedProbability, 0) / predictions.length
    : 0;
    
  const positiveOutcomes = matched.filter(m => m.outcome.outcomeOccurred).length;
  const outcomeRate = matched.length > 0 ? positiveOutcomes / matched.length : 0;
  
  return {
    totalPredictions: predictions.length,
    withOutcomes: matched.length,
    pending: pending.filter(p => !p.isExpired).length,
    expired: pending.filter(p => p.isExpired).length,
    avgProbability,
    outcomeRate,
  };
}
