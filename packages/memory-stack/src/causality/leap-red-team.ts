/**
 * Leap 11: Red Team (Adversarial Self-Testing)
 *
 * The brain's "amygdala" — generates adversarial scenarios to stress-test
 * predictions before they reach users. Every prediction is attacked.
 *
 * How it works:
 * 1. Take a prediction from any brain region
 * 2. Generate adversarial scenarios that would invalidate it
 * 3. Score the prediction's robustness (0-1)
 * 4. Flag weak predictions for human review
 * 5. Learn from past adversarial failures to improve future attacks
 *
 * Compute tier: scheduled (runs nightly + on-demand for critical predictions)
 */

import { getDefaultLogger, type NexusLogger } from '../observability';

// ============================================================================
// TYPES
// ============================================================================

export interface RedTeamConfig {
  /** Min robustness score to pass (default: 0.6) */
  minRobustnessScore?: number;
  /** Max adversarial scenarios to generate per prediction (default: 5) */
  maxScenariosPerPrediction?: number;
  /** Historical window for learning past failures (default: 90 days) */
  learningWindowDays?: number;
  /** Logger */
  logger?: NexusLogger;
}

export interface Prediction {
  id: string;
  organizationId: string;
  domain: string;
  claim: string;
  confidence: number;
  evidence: string[];
  method: string;
  timestamp: Date;
}

export interface AdversarialScenario {
  id: string;
  type: AdversarialType;
  description: string;
  assumption_challenged: string;
  counter_evidence: string[];
  plausibility: number;
  impact_if_true: 'low' | 'medium' | 'high' | 'critical';
}

export type AdversarialType =
  | 'data_quality'
  | 'confounding_variable'
  | 'selection_bias'
  | 'temporal_shift'
  | 'regime_change'
  | 'survivorship_bias'
  | 'reverse_causality'
  | 'simpson_paradox'
  | 'ecological_fallacy'
  | 'black_swan';

export interface RedTeamResult {
  predictionId: string;
  robustnessScore: number;
  passed: boolean;
  scenarios: AdversarialScenario[];
  weaknesses: string[];
  recommendations: string[];
  testDurationMs: number;
}

export interface RedTeamInstance {
  /** Run adversarial testing on a single prediction */
  testPrediction(prediction: Prediction): RedTeamResult;
  /** Batch test multiple predictions */
  testBatch(predictions: Prediction[]): RedTeamResult[];
  /** Get historical attack patterns that were effective */
  getEffectiveAttacks(domain?: string): AdversarialScenario[];
  /** Record a prediction that failed in production */
  recordFailure(predictionId: string, actualOutcome: string): void;
  /** Get stats */
  getStats(): { totalTested: number; totalFailed: number; avgRobustness: number; failureRate: number };
}

// ============================================================================
// ADVERSARIAL GENERATORS
// ============================================================================

const ADVERSARIAL_TEMPLATES: Record<AdversarialType, {
  generate: (prediction: Prediction) => Omit<AdversarialScenario, 'id'>;
}> = {
  data_quality: {
    generate: (p) => ({
      type: 'data_quality',
      description: `What if the data underlying "${p.claim}" has quality issues (missing values, duplicates, stale records)?`,
      assumption_challenged: 'Data is clean and representative',
      counter_evidence: ['Incomplete data ingestion', 'Stale connector data', 'Sampling bias in signals'],
      plausibility: 0.4,
      impact_if_true: 'high',
    }),
  },
  confounding_variable: {
    generate: (p) => ({
      type: 'confounding_variable',
      description: `Is there a hidden variable driving both the cause and effect in "${p.claim}"?`,
      assumption_challenged: 'Correlation implies causation in this context',
      counter_evidence: ['Seasonality effects', 'Market-wide trends', 'Organizational changes'],
      plausibility: 0.5,
      impact_if_true: 'critical',
    }),
  },
  selection_bias: {
    generate: (p) => ({
      type: 'selection_bias',
      description: `Does "${p.claim}" only hold for the subset of data we observed, not the full population?`,
      assumption_challenged: 'Observed data is representative',
      counter_evidence: ['Only successful cases tracked', 'Silent failures unrecorded', 'Voluntary reporting bias'],
      plausibility: 0.35,
      impact_if_true: 'high',
    }),
  },
  temporal_shift: {
    generate: (p) => ({
      type: 'temporal_shift',
      description: `Has the relationship in "${p.claim}" changed over time due to market/product evolution?`,
      assumption_challenged: 'Relationship is temporally stable',
      counter_evidence: ['Product changes', 'Market dynamics', 'Competitive landscape shifts'],
      plausibility: 0.45,
      impact_if_true: 'high',
    }),
  },
  regime_change: {
    generate: (p) => ({
      type: 'regime_change',
      description: `What if a regime change (new regulation, market crash, pivot) invalidates "${p.claim}"?`,
      assumption_challenged: 'Current conditions will persist',
      counter_evidence: ['Regulatory changes', 'Economic shocks', 'Technology disruption'],
      plausibility: 0.25,
      impact_if_true: 'critical',
    }),
  },
  survivorship_bias: {
    generate: (p) => ({
      type: 'survivorship_bias',
      description: `Are we only seeing successful examples that support "${p.claim}" while failures are invisible?`,
      assumption_challenged: 'We see the full picture',
      counter_evidence: ['Churned entities not tracked', 'Failed experiments deleted', 'Only winners reported'],
      plausibility: 0.4,
      impact_if_true: 'medium',
    }),
  },
  reverse_causality: {
    generate: (p) => ({
      type: 'reverse_causality',
      description: `What if the cause and effect in "${p.claim}" are actually reversed?`,
      assumption_challenged: 'Causal direction is correct',
      counter_evidence: ['Bidirectional relationship', 'Effect precedes cause in some cases', 'Common cause drives both'],
      plausibility: 0.3,
      impact_if_true: 'critical',
    }),
  },
  simpson_paradox: {
    generate: (p) => ({
      type: 'simpson_paradox',
      description: `Does "${p.claim}" reverse when controlling for subgroups (Simpson's Paradox)?`,
      assumption_challenged: 'Aggregate trend applies to all subgroups',
      counter_evidence: ['Different behavior by segment', 'Aggregation hides reversal', 'Subgroup sizes differ'],
      plausibility: 0.2,
      impact_if_true: 'high',
    }),
  },
  ecological_fallacy: {
    generate: (p) => ({
      type: 'ecological_fallacy',
      description: `Does the group-level finding in "${p.claim}" actually apply to individual cases?`,
      assumption_challenged: 'Group trends apply to individuals',
      counter_evidence: ['High within-group variance', 'Individual behavior differs from mean', 'Outliers dominate mean'],
      plausibility: 0.35,
      impact_if_true: 'medium',
    }),
  },
  black_swan: {
    generate: (p) => ({
      type: 'black_swan',
      description: `What unprecedented event could completely invalidate "${p.claim}"?`,
      assumption_challenged: 'No extreme outlier events will occur',
      counter_evidence: ['Unprecedented market event', 'System failure', 'Paradigm shift'],
      plausibility: 0.1,
      impact_if_true: 'critical',
    }),
  },
};

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createRedTeam(config: RedTeamConfig = {}): RedTeamInstance {
  const {
    minRobustnessScore = 0.6,
    maxScenariosPerPrediction = 5,
  } = config;

  const logger = config.logger ?? getDefaultLogger().child({ module: 'red-team' });

  let totalTested = 0;
  let totalFailed = 0;
  let totalRobustness = 0;
  const effectiveAttacks: AdversarialScenario[] = [];
  const failureHistory: Array<{ predictionId: string; actualOutcome: string; timestamp: Date }> = [];

  // Select most relevant adversarial types based on prediction characteristics
  const selectAttackTypes = (prediction: Prediction): AdversarialType[] => {
    const types: AdversarialType[] = [];

    // Always test for confounders and data quality
    types.push('confounding_variable', 'data_quality');

    // Add domain-specific attacks
    if (prediction.confidence > 0.8) types.push('survivorship_bias');
    if (prediction.method.includes('granger') || prediction.method.includes('causal')) types.push('reverse_causality');
    if (prediction.evidence.length < 3) types.push('selection_bias');
    if (prediction.domain === 'finance') types.push('regime_change', 'black_swan');

    // Add temporal shift for all predictions
    types.push('temporal_shift');

    // Simpson and ecological for aggregate predictions
    if (prediction.claim.includes('overall') || prediction.claim.includes('average')) {
      types.push('simpson_paradox', 'ecological_fallacy');
    }

    return [...new Set(types)].slice(0, maxScenariosPerPrediction);
  };

  return {
    testPrediction(prediction) {
      const start = Date.now();
      totalTested++;

      const attackTypes = selectAttackTypes(prediction);
      const scenarios: AdversarialScenario[] = attackTypes.map((type, i) => ({
        id: `adv_${prediction.id}_${i}`,
        ...ADVERSARIAL_TEMPLATES[type].generate(prediction),
      }));

      // Calculate robustness score
      const totalPlausibility = scenarios.reduce((sum, s) => sum + s.plausibility, 0);
      const avgPlausibility = scenarios.length > 0 ? totalPlausibility / scenarios.length : 0;
      const criticalThreats = scenarios.filter(s => s.impact_if_true === 'critical' && s.plausibility > 0.3);

      // Robustness = base confidence - threat penalty
      const threatPenalty = avgPlausibility * 0.4 + criticalThreats.length * 0.1;
      const robustnessScore = Math.max(0, Math.min(1, prediction.confidence - threatPenalty));

      const passed = robustnessScore >= minRobustnessScore;
      if (!passed) totalFailed++;
      totalRobustness += robustnessScore;

      const weaknesses = scenarios
        .filter(s => s.plausibility > 0.3)
        .map(s => s.assumption_challenged);

      const recommendations = [];
      if (criticalThreats.length > 0) {
        recommendations.push('Gather additional evidence before acting on this prediction');
      }
      if (scenarios.some(s => s.type === 'confounding_variable' && s.plausibility > 0.4)) {
        recommendations.push('Run controlled experiment to isolate causal effect');
      }
      if (!passed) {
        recommendations.push('Flag for human review before deployment');
      }

      const result: RedTeamResult = {
        predictionId: prediction.id,
        robustnessScore,
        passed,
        scenarios,
        weaknesses,
        recommendations,
        testDurationMs: Date.now() - start,
      };

      if (!passed) {
        logger.warn('Prediction failed red team', {
          predictionId: prediction.id,
          robustness: robustnessScore,
          criticalThreats: criticalThreats.length,
        });
      }

      return result;
    },

    testBatch(predictions) {
      return predictions.map(p => this.testPrediction(p));
    },

    getEffectiveAttacks(domain?: string) {
      if (domain) {
        return effectiveAttacks.filter(a => a.description.toLowerCase().includes(domain.toLowerCase()));
      }
      return [...effectiveAttacks];
    },

    recordFailure(predictionId, actualOutcome) {
      failureHistory.push({ predictionId, actualOutcome, timestamp: new Date() });
      logger.info('Prediction failure recorded', { predictionId, actualOutcome });
    },

    getStats() {
      return {
        totalTested,
        totalFailed,
        avgRobustness: totalTested > 0 ? totalRobustness / totalTested : 0,
        failureRate: totalTested > 0 ? totalFailed / totalTested : 0,
      };
    },
  };
}
