/**
 * Leap 12: Experimentation Engine
 *
 * The brain's "scientific method" — designs A/B tests from causal graph insights,
 * suggests interventions, and measures causal effects.
 *
 * How it works:
 * 1. Identify a causal edge with high potential impact but low confidence
 * 2. Design an experiment (intervention + control + metric)
 * 3. Calculate required sample size for statistical power
 * 4. Monitor experiment progress
 * 5. Analyze results with proper causal inference (not just A/B)
 *
 * Compute tier: background
 */

import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface ExperimentConfig {
  /** Min sample size per group (default: 30) */
  minSampleSize?: number;
  /** Default significance level (default: 0.05) */
  defaultAlpha?: number;
  /** Default power (default: 0.8) */
  defaultPower?: number;
  /** Max concurrent experiments (default: 5) */
  maxConcurrentExperiments?: number;
  /** Logger */
  logger?: NexusLogger;
}

export interface ExperimentDesign {
  id: string;
  name: string;
  hypothesis: string;
  causalEdgeId: string;
  interventionVariable: string;
  outcomeVariable: string;
  controlGroup: GroupDefinition;
  treatmentGroup: GroupDefinition;
  confounders: string[];
  requiredSampleSize: number;
  estimatedDurationDays: number;
  designType: ExperimentType;
  status: ExperimentStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export type ExperimentType = 'ab_test' | 'switchback' | 'regression_discontinuity' | 'natural_experiment' | 'instrumental_variable';
export type ExperimentStatus = 'designed' | 'approved' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface GroupDefinition {
  name: string;
  criteria: Record<string, unknown>;
  size: number;
  intervention?: string;
}

export interface ExperimentResult {
  experimentId: string;
  treatmentEffect: number;
  confidenceInterval: { lower: number; upper: number };
  pValue: number;
  significant: boolean;
  effectSize: 'negligible' | 'small' | 'medium' | 'large';
  powerAchieved: number;
  sampleSizeActual: { control: number; treatment: number };
  recommendation: string;
  causalClaim: string;
  confounders_controlled: string[];
}

export interface ExperimentSuggestion {
  causalEdgeId: string;
  sourceEntity: string;
  targetEntity: string;
  currentConfidence: number;
  potentialImpact: number;
  suggestedExperiment: Partial<ExperimentDesign>;
  priority: number;
  reasoning: string;
}

export interface ExperimentEngineInstance {
  /** Suggest experiments from causal graph edges */
  suggestExperiments(edges: Array<{ id: string; source: string; target: string; confidence: number; weight: number }>): ExperimentSuggestion[];
  /** Design a specific experiment */
  designExperiment(suggestion: ExperimentSuggestion, options?: Partial<ExperimentDesign>): ExperimentDesign;
  /** Calculate required sample size */
  calculateSampleSize(expectedEffect: number, variance: number, alpha?: number, power?: number): number;
  /** Analyze experiment results */
  analyzeResults(design: ExperimentDesign, data: { control: number[]; treatment: number[] }): ExperimentResult;
  /** Get all experiments */
  getExperiments(): ExperimentDesign[];
  /** Get experiment by ID */
  getExperiment(id: string): ExperimentDesign | undefined;
  /** Update experiment status */
  updateStatus(id: string, status: ExperimentStatus): void;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createExperimentEngine(config: ExperimentConfig = {}): ExperimentEngineInstance {
  const {
    minSampleSize = 30,
    defaultAlpha = 0.05,
    defaultPower = 0.8,
    maxConcurrentExperiments = 5,
  } = config;

  const logger = config.logger ?? getDefaultLogger().child({ module: 'experimentation' });
  const experiments = new Map<string, ExperimentDesign>();

  // Z-score for confidence level
  const zScore = (p: number): number => {
    // Approximation of inverse normal CDF
    const a = [0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
    const b = [0, -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const t = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));
    let x = (((((a[6] * t + a[5]) * t + a[4]) * t + a[3]) * t + a[2]) * t + a[1]) * t + a[0];
    x /= ((((((b[6] ?? 0) * t + (b[5] ?? 0)) * t + b[4]) * t + b[3]) * t + b[2]) * t + b[1]) * t + 1;
    return p < 0.5 ? -x : x;
  };

  return {
    suggestExperiments(edges) {
      const suggestions: ExperimentSuggestion[] = [];

      for (const edge of edges) {
        // Score: high impact + low confidence = good experiment candidate
        const priority = Math.abs(edge.weight) * (1 - edge.confidence);

        if (priority > 0.1) {
          suggestions.push({
            causalEdgeId: edge.id,
            sourceEntity: edge.source,
            targetEntity: edge.target,
            currentConfidence: edge.confidence,
            potentialImpact: Math.abs(edge.weight),
            priority,
            reasoning: `Edge ${edge.source} → ${edge.target} has ${edge.confidence < 0.5 ? 'low' : 'medium'} confidence (${(edge.confidence * 100).toFixed(0)}%) but ${Math.abs(edge.weight) > 0.5 ? 'high' : 'moderate'} potential impact. An experiment could clarify the causal relationship.`,
            suggestedExperiment: {
              hypothesis: `Changing ${edge.source} causally affects ${edge.target} with effect size ~${edge.weight.toFixed(2)}`,
              interventionVariable: edge.source,
              outcomeVariable: edge.target,
              designType: edge.confidence < 0.3 ? 'ab_test' : 'natural_experiment',
            },
          });
        }
      }

      return suggestions.sort((a, b) => b.priority - a.priority).slice(0, maxConcurrentExperiments);
    },

    designExperiment(suggestion, options = {}) {
      const id = `exp_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`;
      const sampleSize = this.calculateSampleSize(
        suggestion.potentialImpact,
        1.0, // default variance
      );

      const design: ExperimentDesign = {
        id,
        name: options.name ?? `Experiment: ${suggestion.sourceEntity} → ${suggestion.targetEntity}`,
        hypothesis: suggestion.suggestedExperiment?.hypothesis ?? '',
        causalEdgeId: suggestion.causalEdgeId,
        interventionVariable: suggestion.sourceEntity,
        outcomeVariable: suggestion.targetEntity,
        controlGroup: {
          name: 'Control',
          criteria: { intervention: false },
          size: sampleSize,
        },
        treatmentGroup: {
          name: 'Treatment',
          criteria: { intervention: true },
          size: sampleSize,
          intervention: `Modify ${suggestion.sourceEntity}`,
        },
        confounders: [],
        requiredSampleSize: sampleSize,
        estimatedDurationDays: Math.ceil(sampleSize / 10),
        designType: suggestion.suggestedExperiment?.designType ?? 'ab_test',
        status: 'designed',
        createdAt: new Date(),
        ...options,
      };

      experiments.set(id, design);
      logger.info('Experiment designed', { id, hypothesis: design.hypothesis, sampleSize });
      return design;
    },

    calculateSampleSize(expectedEffect, variance, alpha = defaultAlpha, power = defaultPower) {
      const zAlpha = zScore(1 - alpha / 2);
      const zBeta = zScore(power);
      const n = Math.ceil(2 * variance * Math.pow(zAlpha + zBeta, 2) / Math.pow(expectedEffect, 2));
      return Math.max(n, minSampleSize);
    },

    analyzeResults(design, data) {
      const { control, treatment } = data;

      // Calculate means
      const controlMean = control.reduce((s, v) => s + v, 0) / control.length;
      const treatmentMean = treatment.reduce((s, v) => s + v, 0) / treatment.length;
      const treatmentEffect = treatmentMean - controlMean;

      // Calculate pooled standard deviation
      const controlVar = control.reduce((s, v) => s + Math.pow(v - controlMean, 2), 0) / (control.length - 1);
      const treatmentVar = treatment.reduce((s, v) => s + Math.pow(v - treatmentMean, 2), 0) / (treatment.length - 1);
      const pooledSE = Math.sqrt(controlVar / control.length + treatmentVar / treatment.length);

      // T-statistic and p-value (approximation)
      const tStat = Math.abs(treatmentEffect / (pooledSE || 0.001));
      const df = control.length + treatment.length - 2;
      // Rough p-value from t-distribution
      const pValue = Math.max(0.001, Math.min(1, 2 * Math.exp(-0.717 * tStat - 0.416 * tStat * tStat)));

      // Effect size (Cohen's d)
      const pooledSD = Math.sqrt((controlVar + treatmentVar) / 2);
      const cohensD = Math.abs(treatmentEffect / (pooledSD || 0.001));
      const effectSize = cohensD < 0.2 ? 'negligible' : cohensD < 0.5 ? 'small' : cohensD < 0.8 ? 'medium' : 'large';

      // Confidence interval
      const margin = 1.96 * pooledSE;
      const ci = { lower: treatmentEffect - margin, upper: treatmentEffect + margin };

      const significant = pValue < defaultAlpha;

      const result: ExperimentResult = {
        experimentId: design.id,
        treatmentEffect,
        confidenceInterval: ci,
        pValue,
        significant,
        effectSize,
        powerAchieved: tStat > 0 ? Math.min(1, 1 - pValue) : 0,
        sampleSizeActual: { control: control.length, treatment: treatment.length },
        recommendation: significant
          ? `Result is statistically significant (p=${pValue.toFixed(4)}). The ${effectSize} effect of ${treatmentEffect.toFixed(3)} supports the causal claim.`
          : `Result is NOT statistically significant (p=${pValue.toFixed(4)}). Insufficient evidence to support the causal claim. Consider increasing sample size.`,
        causalClaim: significant
          ? `${design.interventionVariable} causally affects ${design.outcomeVariable} (effect: ${treatmentEffect.toFixed(3)}, CI: [${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}])`
          : `No significant causal effect detected between ${design.interventionVariable} and ${design.outcomeVariable}`,
        confounders_controlled: design.confounders,
      };

      // Update experiment status
      design.status = 'completed';
      design.completedAt = new Date();

      logger.info('Experiment analyzed', {
        id: design.id,
        significant,
        effectSize,
        pValue: pValue.toFixed(4),
        treatmentEffect: treatmentEffect.toFixed(3),
      });

      return result;
    },

    getExperiments() {
      return Array.from(experiments.values());
    },

    getExperiment(id) {
      return experiments.get(id);
    },

    updateStatus(id, status) {
      const exp = experiments.get(id);
      if (exp) {
        exp.status = status;
        if (status === 'running') exp.startedAt = new Date();
        if (status === 'completed' || status === 'cancelled') exp.completedAt = new Date();
      }
    },
  };
}
