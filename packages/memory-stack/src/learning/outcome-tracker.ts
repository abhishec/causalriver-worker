/**
 * Outcome Tracker - Links Brain rule executions to real-world outcomes
 *
 * This module closes the feedback loop for the Brain OS by:
 * 1. Recording predictions when rules fire
 * 2. Tracking actual outcomes (e.g., did churn actually happen?)
 * 3. Enabling accuracy computation for confidence calibration
 *
 * The 10x Innovation: Rules that learn from their own mistakes.
 */


// ============================================================================
// TYPES
// ============================================================================

export interface BrainPrediction {
  id?: string;
  organization_id: string;
  execution_id?: string;
  rule_id: string;
  rule_title?: string;
  
  // What was predicted
  prediction_type: string; // 'churn_risk', 'collection_delay', 'escalation', 'upsell_opportunity'
  entity_type: string;
  entity_id: string;
  predicted_outcome: boolean; // Rule matched = true prediction
  confidence_at_prediction: number;
  
  // Context for analysis
  feature_snapshot?: Record<string, any>;
  
  // Outcome tracking
  outcome_window_days: number;
  outcome_deadline?: Date;
  outcome_occurred?: boolean;
  outcome_date?: Date;
  
  created_at?: Date;
}

export interface OutcomeResult {
  prediction_id: string;
  outcome_occurred: boolean;
  outcome_date: Date;
  outcome_notes?: string;
  outcome_metric?: Record<string, number>;
}

export interface PredictionAccuracy {
  rule_id: string;
  prediction_type: string;
  total_predictions: number;
  true_positives: number;
  true_negatives: number;
  false_positives: number;
  false_negatives: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  avg_confidence: number;
  sample_period_days: number;
}

export interface AccuracyByType {
  [predictionType: string]: PredictionAccuracy;
}

// ============================================================================
// PREDICTION RECORDING
// ============================================================================

/**
 * Record a Brain rule prediction for outcome tracking
 */
export function createBrainPrediction(
  params: {
    organizationId: string;
    ruleId: string;
    ruleTitle?: string;
    predictionType: string;
    entityType: string;
    entityId: string;
    predictedOutcome: boolean;
    confidence: number;
    outcomeWindowDays?: number;
    featureSnapshot?: Record<string, any>;
    executionId?: string;
  }
): BrainPrediction {
  const outcomeWindowDays = params.outcomeWindowDays || 30;
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + outcomeWindowDays);
  
  return {
    organization_id: params.organizationId,
    execution_id: params.executionId,
    rule_id: params.ruleId,
    rule_title: params.ruleTitle,
    prediction_type: params.predictionType,
    entity_type: params.entityType,
    entity_id: params.entityId,
    predicted_outcome: params.predictedOutcome,
    confidence_at_prediction: params.confidence,
    feature_snapshot: params.featureSnapshot,
    outcome_window_days: outcomeWindowDays,
    outcome_deadline: deadline,
    created_at: new Date(),
  };
}

/**
 * Map prediction type from rule context
 */
export function inferPredictionType(
  ruleId: string,
  domain: string,
  actions?: Array<{ type: string }>
): string {
  // Check actions for hints
  const actionTypes = (actions || []).map(a => a.type.toLowerCase());
  
  if (actionTypes.some(t => t.includes('churn'))) return 'churn_risk';
  if (actionTypes.some(t => t.includes('collection') || t.includes('overdue'))) return 'collection_delay';
  if (actionTypes.some(t => t.includes('escalat'))) return 'escalation';
  if (actionTypes.some(t => t.includes('upsell') || t.includes('expansion'))) return 'upsell_opportunity';
  if (actionTypes.some(t => t.includes('renewal'))) return 'renewal_risk';
  
  // Fallback to domain
  switch (domain.toLowerCase()) {
    case 'client_success': return 'churn_risk';
    case 'finance': return 'collection_delay';
    case 'support': return 'escalation';
    case 'sales': return 'deal_outcome';
    default: return 'general';
  }
}

// ============================================================================
// OUTCOME MATCHING
// ============================================================================

/**
 * Find predictions that are past their outcome window and need resolution
 */
export function findPredictionsAwaitingOutcome(
  predictions: BrainPrediction[],
  now: Date = new Date()
): BrainPrediction[] {
  return predictions.filter(p => {
    const deadline = p.outcome_deadline || new Date(p.created_at!.getTime() + p.outcome_window_days * 24 * 60 * 60 * 1000);
    return p.outcome_occurred === undefined && deadline < now;
  });
}

/**
 * Match an outcome event to predictions
 * 
 * Example: A client churns → find all "churn_risk" predictions for that client
 */
export function matchOutcomeToPredictons(
  predictions: BrainPrediction[],
  outcome: {
    entityType: string;
    entityId: string;
    outcomeType: string;
    occurredAt: Date;
  }
): BrainPrediction[] {
  return predictions.filter(p => 
    p.entity_type === outcome.entityType &&
    p.entity_id === outcome.entityId &&
    p.prediction_type === outcome.outcomeType &&
    p.outcome_occurred === undefined
  );
}

/**
 * Apply an outcome to a prediction
 */
export function resolvePrediction(
  prediction: BrainPrediction,
  occurred: boolean,
  outcomeDate: Date = new Date()
): BrainPrediction {
  return {
    ...prediction,
    outcome_occurred: occurred,
    outcome_date: outcomeDate,
  };
}

// ============================================================================
// ACCURACY COMPUTATION
// ============================================================================

/**
 * Compute accuracy metrics for a set of resolved predictions
 */
export function computePredictionAccuracy(
  predictions: BrainPrediction[],
  ruleId: string,
  predictionType: string
): PredictionAccuracy {
  const resolved = predictions.filter(p => 
    p.rule_id === ruleId && 
    p.prediction_type === predictionType &&
    p.outcome_occurred !== undefined
  );
  
  if (resolved.length === 0) {
    return {
      rule_id: ruleId,
      prediction_type: predictionType,
      total_predictions: 0,
      true_positives: 0,
      true_negatives: 0,
      false_positives: 0,
      false_negatives: 0,
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1_score: 0,
      avg_confidence: 0,
      sample_period_days: 0,
    };
  }
  
  let tp = 0, tn = 0, fp = 0, fn = 0;
  let totalConfidence = 0;
  
  for (const p of resolved) {
    totalConfidence += p.confidence_at_prediction;
    
    if (p.predicted_outcome && p.outcome_occurred) tp++;
    else if (!p.predicted_outcome && !p.outcome_occurred) tn++;
    else if (p.predicted_outcome && !p.outcome_occurred) fp++;
    else fn++;
  }
  
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  
  // Calculate sample period
  const dates = resolved
    .filter(p => p.created_at)
    .map(p => p.created_at!.getTime());
  const periodDays = dates.length > 1 
    ? Math.ceil((Math.max(...dates) - Math.min(...dates)) / (24 * 60 * 60 * 1000))
    : 0;
  
  return {
    rule_id: ruleId,
    prediction_type: predictionType,
    total_predictions: resolved.length,
    true_positives: tp,
    true_negatives: tn,
    false_positives: fp,
    false_negatives: fn,
    accuracy: (tp + tn) / resolved.length,
    precision,
    recall,
    f1_score: f1,
    avg_confidence: totalConfidence / resolved.length,
    sample_period_days: periodDays,
  };
}

/**
 * Group predictions by rule and compute accuracy for each
 */
export function computeAccuracyByRule(
  predictions: BrainPrediction[]
): Map<string, PredictionAccuracy> {
  const byRule = new Map<string, BrainPrediction[]>();
  
  for (const p of predictions) {
    if (!byRule.has(p.rule_id)) byRule.set(p.rule_id, []);
    byRule.get(p.rule_id)!.push(p);
  }
  
  const results = new Map<string, PredictionAccuracy>();
  
  for (const [ruleId, rulePredictions] of byRule) {
    // Find primary prediction type for this rule
    const typeCount = new Map<string, number>();
    for (const p of rulePredictions) {
      typeCount.set(p.prediction_type, (typeCount.get(p.prediction_type) || 0) + 1);
    }
    const primaryType = [...typeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
    
    results.set(ruleId, computePredictionAccuracy(predictions, ruleId, primaryType));
  }
  
  return results;
}

/**
 * Determine if a rule has enough data for reliable calibration
 */
export function hasMinimumSampleSize(
  accuracy: PredictionAccuracy,
  minimumSamples: number = 10
): boolean {
  return accuracy.total_predictions >= minimumSamples;
}
