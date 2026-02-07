/**
 * Intervention Effects Module
 * 
 * Tracks and measures the causal effects of interventions (actions taken)
 * on organizational outcomes. This enables learning which actions actually
 * work vs those that are merely correlated with success.
 * 
 * Key Concepts:
 * - Natural Experiments: When similar situations get different treatments
 * - Average Treatment Effect (ATE): The average impact of an intervention
 * - Propensity Score Matching: Adjusting for selection bias
 * - Difference-in-Differences: Comparing trends before/after intervention
 * 
 * This module answers: "Did this action actually cause the improvement?"
 */

import {
  performTTest,
  computeCohensD,
  meanConfidenceInterval,
  normalQuantile,
  type ConfidenceInterval,
  type EffectSizeResult
} from './statistical-tests';

// ============================================================================
// TYPES
// ============================================================================

export interface InterventionRecord {
  id: string;
  signalId: string;
  entityType: string;
  entityId: string;
  interventionType: InterventionType;
  interventionDate: Date;
  preMetrics: MetricSnapshot;
  postMetrics?: MetricSnapshot;
  outcomeRecorded: boolean;
  outcomeDate?: Date;
}

export interface MetricSnapshot {
  timestamp: Date;
  values: Record<string, number>;
  aggregationPeriodDays: number;
}

export type InterventionType =
  | 'alert_created'
  | 'alert_dismissed'
  | 'action_created'
  | 'action_completed'
  | 'escalation'
  | 'outreach_call'
  | 'meeting_scheduled'
  | 'contract_modification'
  | 'no_intervention';

export interface InterventionEffect {
  interventionType: InterventionType;
  metricName: string;
  sampleSize: number;
  
  // Treatment group (received intervention)
  treatedMean: number;
  treatedStd: number;
  treatedCount: number;
  
  // Control group (did not receive intervention)
  controlMean: number;
  controlStd: number;
  controlCount: number;
  
  // Causal effect estimates
  averageTreatmentEffect: number;
  ateConfidenceInterval: ConfidenceInterval;
  effectSize: EffectSizeResult;
  
  // Statistical significance
  pValue: number;
  isSignificant: boolean;
  
  // Interpretation
  naturalLanguage: string;
}

export interface DifferenceInDifferences {
  treatmentGroup: {
    preMean: number;
    postMean: number;
    change: number;
  };
  controlGroup: {
    preMean: number;
    postMean: number;
    change: number;
  };
  didEstimate: number;
  standardError: number;
  confidenceInterval: ConfidenceInterval;
  pValue: number;
  isSignificant: boolean;
  naturalLanguage: string;
}

export interface PropensityScore {
  entityId: string;
  score: number;
  features: Record<string, number>;
  receivedTreatment: boolean;
}

// ============================================================================
// INTERVENTION TRACKING
// ============================================================================

/**
 * Track a new intervention for later outcome measurement
 */
export function trackIntervention(
  signalId: string,
  entityType: string,
  entityId: string,
  interventionType: InterventionType,
  preMetrics: Record<string, number>,
  aggregationPeriodDays: number = 30
): InterventionRecord {
  return {
    id: `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    signalId,
    entityType,
    entityId,
    interventionType,
    interventionDate: new Date(),
    preMetrics: {
      timestamp: new Date(),
      values: preMetrics,
      aggregationPeriodDays
    },
    outcomeRecorded: false
  };
}

/**
 * Record the outcome of a tracked intervention
 */
export function recordInterventionOutcome(
  intervention: InterventionRecord,
  postMetrics: Record<string, number>
): InterventionRecord {
  return {
    ...intervention,
    postMetrics: {
      timestamp: new Date(),
      values: postMetrics,
      aggregationPeriodDays: intervention.preMetrics.aggregationPeriodDays
    },
    outcomeRecorded: true,
    outcomeDate: new Date()
  };
}

// ============================================================================
// AVERAGE TREATMENT EFFECT (ATE)
// ============================================================================

/**
 * Compute the Average Treatment Effect from paired observations
 * 
 * ATE = E[Y(1)] - E[Y(0)]
 * where Y(1) is outcome with treatment, Y(0) without
 */
export function computeATE(
  treated: number[],
  control: number[],
  confidenceLevel: number = 0.95
): InterventionEffect {
  const treatedMean = mean(treated);
  const controlMean = mean(control);
  const treatedStd = std(treated);
  const controlStd = std(control);
  
  // ATE point estimate
  const ate = treatedMean - controlMean;
  
  // Standard error for difference of means
  const se = Math.sqrt(
    (treatedStd * treatedStd) / treated.length +
    (controlStd * controlStd) / control.length
  );
  
  // Confidence interval
  const z = normalQuantile(1 - (1 - confidenceLevel) / 2);
  const ateCI: ConfidenceInterval = {
    lower: ate - z * se,
    upper: ate + z * se,
    level: confidenceLevel
  };
  
  // T-test for significance
  const tTest = performTTest(treated, control);
  
  // Effect size
  const effectSize = computeCohensD(treated, control, confidenceLevel);
  
  return {
    interventionType: 'action_completed',
    metricName: 'outcome',
    sampleSize: treated.length + control.length,
    treatedMean,
    treatedStd,
    treatedCount: treated.length,
    controlMean,
    controlStd,
    controlCount: control.length,
    averageTreatmentEffect: ate,
    ateConfidenceInterval: ateCI,
    effectSize,
    pValue: tTest.pValue,
    isSignificant: tTest.isSignificant,
    naturalLanguage: generateATENarrative(ate, ateCI, effectSize, tTest.pValue)
  };
}

/**
 * Generate natural language description of ATE
 */
function generateATENarrative(
  ate: number,
  ci: ConfidenceInterval,
  effectSize: EffectSizeResult,
  pValue: number
): string {
  const direction = ate > 0 ? 'increase' : 'decrease';
  const magnitude = Math.abs(ate);
  const significanceLevel = pValue < 0.001 ? 'p<0.001' :
                            pValue < 0.01 ? 'p<0.01' :
                            pValue < 0.05 ? 'p<0.05' : `p=${pValue.toFixed(3)}`;
  
  if (pValue < 0.05) {
    return `Intervention causes ${magnitude.toFixed(2)} ${direction} ` +
           `(95% CI: [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}], ` +
           `${effectSize.interpretation} effect, ${significanceLevel})`;
  } else {
    return `No significant treatment effect detected ` +
           `(ATE=${ate.toFixed(2)}, ${significanceLevel})`;
  }
}

// ============================================================================
// DIFFERENCE-IN-DIFFERENCES
// ============================================================================

/**
 * Difference-in-Differences estimator
 * 
 * Compares the change in outcomes between treatment and control groups
 * before and after the intervention. This controls for time trends.
 * 
 * DiD = (Y_treat_post - Y_treat_pre) - (Y_control_post - Y_control_pre)
 */
export function computeDifferenceInDifferences(
  treatmentPre: number[],
  treatmentPost: number[],
  controlPre: number[],
  controlPost: number[],
  confidenceLevel: number = 0.95
): DifferenceInDifferences {
  // Group means
  const treatPreMean = mean(treatmentPre);
  const treatPostMean = mean(treatmentPost);
  const controlPreMean = mean(controlPre);
  const controlPostMean = mean(controlPost);
  
  // Treatment and control changes
  const treatmentChange = treatPostMean - treatPreMean;
  const controlChange = controlPostMean - controlPreMean;
  
  // DiD estimate
  const didEstimate = treatmentChange - controlChange;
  
  // Standard error (simplified pooled estimate)
  const nTreat = treatmentPre.length;
  const nControl = controlPre.length;
  
  const treatPreVar = variance(treatmentPre);
  const treatPostVar = variance(treatmentPost);
  const controlPreVar = variance(controlPre);
  const controlPostVar = variance(controlPost);
  
  const se = Math.sqrt(
    (treatPreVar + treatPostVar) / nTreat +
    (controlPreVar + controlPostVar) / nControl
  );
  
  // Confidence interval
  const z = normalQuantile(1 - (1 - confidenceLevel) / 2);
  const ci: ConfidenceInterval = {
    lower: didEstimate - z * se,
    upper: didEstimate + z * se,
    level: confidenceLevel
  };
  
  // p-value (two-tailed)
  const zStat = Math.abs(didEstimate / se);
  const pValue = 2 * (1 - normalCDF(zStat));
  
  return {
    treatmentGroup: {
      preMean: treatPreMean,
      postMean: treatPostMean,
      change: treatmentChange
    },
    controlGroup: {
      preMean: controlPreMean,
      postMean: controlPostMean,
      change: controlChange
    },
    didEstimate,
    standardError: se,
    confidenceInterval: ci,
    pValue,
    isSignificant: pValue < 0.05,
    naturalLanguage: generateDiDNarrative(didEstimate, ci, pValue)
  };
}

function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function generateDiDNarrative(
  estimate: number,
  ci: ConfidenceInterval,
  pValue: number
): string {
  const direction = estimate > 0 ? 'improvement' : 'decline';
  const significanceLevel = pValue < 0.001 ? 'p<0.001' :
                            pValue < 0.01 ? 'p<0.01' :
                            pValue < 0.05 ? 'p<0.05' : `p=${pValue.toFixed(3)}`;
  
  if (pValue < 0.05) {
    return `Intervention shows causal ${direction} of ${Math.abs(estimate).toFixed(2)} ` +
           `after controlling for time trends ` +
           `(95% CI: [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}], ${significanceLevel})`;
  } else {
    return `No significant causal effect after controlling for time trends ` +
           `(DiD=${estimate.toFixed(2)}, ${significanceLevel})`;
  }
}

// ============================================================================
// PROPENSITY SCORE MATCHING
// ============================================================================

/**
 * Compute propensity scores using logistic regression
 * 
 * The propensity score is P(Treatment | X) - the probability of receiving
 * treatment given observed covariates. Used for matching similar units.
 */
export function computePropensityScores(
  features: Record<string, number>[],
  receivedTreatment: boolean[]
): PropensityScore[] {
  // Simple logistic regression using gradient descent
  const n = features.length;
  const featureNames = Object.keys(features[0]);
  const p = featureNames.length;
  
  // Initialize coefficients
  let coefficients = Array(p + 1).fill(0); // +1 for intercept
  const learningRate = 0.01;
  const iterations = 1000;
  
  // Feature matrix (with intercept)
  const X = features.map(f => [1, ...featureNames.map(name => f[name])]);
  const y = receivedTreatment.map(t => t ? 1 : 0);
  
  // Gradient descent
  for (let iter = 0; iter < iterations; iter++) {
    const gradient = Array(p + 1).fill(0);
    
    for (let i = 0; i < n; i++) {
      const linearPred = X[i].reduce((sum, x, j) => sum + x * coefficients[j], 0);
      const prob = 1 / (1 + Math.exp(-linearPred));
      const error = y[i] - prob;
      
      for (let j = 0; j < p + 1; j++) {
        gradient[j] += error * X[i][j];
      }
    }
    
    // Update coefficients
    for (let j = 0; j < p + 1; j++) {
      coefficients[j] += learningRate * gradient[j] / n;
    }
  }
  
  // Compute propensity scores
  return features.map((f, i) => {
    const x = [1, ...featureNames.map(name => f[name])];
    const linearPred = x.reduce((sum, val, j) => sum + val * coefficients[j], 0);
    const score = 1 / (1 + Math.exp(-linearPred));
    
    return {
      entityId: `entity_${i}`,
      score,
      features: f,
      receivedTreatment: receivedTreatment[i]
    };
  });
}

/**
 * Match treated units to similar control units based on propensity scores
 */
export function matchByPropensityScore(
  scores: PropensityScore[],
  caliper: number = 0.1
): Array<{ treated: PropensityScore; control: PropensityScore }> {
  const treated = scores.filter(s => s.receivedTreatment);
  const control = scores.filter(s => !s.receivedTreatment);
  const matches: Array<{ treated: PropensityScore; control: PropensityScore }> = [];
  
  const usedControls = new Set<string>();
  
  for (const t of treated) {
    // Find closest control within caliper
    let bestMatch: PropensityScore | null = null;
    let bestDistance = caliper;
    
    for (const c of control) {
      if (usedControls.has(c.entityId)) continue;
      
      const distance = Math.abs(t.score - c.score);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = c;
      }
    }
    
    if (bestMatch) {
      matches.push({ treated: t, control: bestMatch });
      usedControls.add(bestMatch.entityId);
    }
  }
  
  return matches;
}

/**
 * Compute ATE using propensity score matched samples
 */
export function computeATEWithMatching(
  scores: PropensityScore[],
  outcomes: Map<string, number>,
  caliper: number = 0.1
): InterventionEffect {
  const matches = matchByPropensityScore(scores, caliper);
  
  const treated = matches.map(m => outcomes.get(m.treated.entityId) ?? 0);
  const control = matches.map(m => outcomes.get(m.control.entityId) ?? 0);
  
  const effect = computeATE(treated, control);
  
  return {
    ...effect,
    naturalLanguage: `${effect.naturalLanguage} (propensity-matched, n=${matches.length} pairs)`
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr: number[]): number {
  const m = mean(arr);
  return arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1);
}

function std(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const InterventionEffects = {
  trackIntervention,
  recordInterventionOutcome,
  computeATE,
  computeDifferenceInDifferences,
  computePropensityScores,
  matchByPropensityScore,
  computeATEWithMatching
};
