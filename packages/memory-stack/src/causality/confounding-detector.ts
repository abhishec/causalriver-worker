/**
 * Nexus Memory Stack - Confounding Detector
 *
 * L4: Causal Graph Engine - Spurious Correlation Detection
 *
 * Identifies spurious correlations caused by unobserved common causes.
 * Uses both structural (graph-based) and statistical methods.
 *
 * Key Concepts:
 * - Confounders: Common causes of treatment and outcome
 * - E-value: Minimum confounding strength needed to explain away effect
 * - Sensitivity analysis: How robust is the causal claim?
 */

import { type ConfidenceInterval } from './statistical-tests';
import { type PCAlgorithmResult, findAncestors, pcResultToDAG } from './pc-algorithm';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of confounding analysis
 */
export interface ConfoundingAnalysis {
  /** Source variable (treatment) */
  sourceVar: string;
  /** Target variable (outcome) */
  targetVar: string;

  /** Identified potential confounders */
  potentialConfounders: Array<{
    variable: string;
    confoundingStrength: number;
    evidence: string;
  }>;

  /** Sensitivity to unobserved confounding */
  unobservedConfoundingSensitivity: {
    /** E-value: minimum strength of confounding to explain away effect */
    eValue: number;
    /** E-value for lower CI bound */
    eValueLowerCI: number;
    /** Interpretation of E-value */
    interpretation: string;
  };

  /** Overall recommendation */
  recommendation: 'causal' | 'likely_confounded' | 'definitely_confounded';

  /** Detailed reasoning */
  reasoning: string[];

  /** Robustness score (0-1) */
  robustnessScore: number;
}

/**
 * Configuration for confounding detection
 */
export interface ConfoundingDetectorConfig {
  /** Minimum E-value to consider robust (default: 2.0) */
  minRobustEValue: number;
  /** Maximum confounding strength to ignore (default: 0.1) */
  confoundingThreshold: number;
}

// ============================================================================
// CONFOUNDING DETECTOR FACTORY
// ============================================================================

/**
 * Create a confounding detector from causal graph
 *
 * @example
 * ```typescript
 * const detector = createConfoundingDetector(pcResult);
 *
 * const analysis = detector.analyzeConfounding(
 *   data,
 *   'finance_signal',
 *   'cs_health_score',
 *   { observedRR: 1.5, ci: { lower: 1.2, upper: 1.9, level: 0.95 } }
 * );
 *
 * console.log(analysis.recommendation);
 * // 'causal' | 'likely_confounded' | 'definitely_confounded'
 * ```
 */
export function createConfoundingDetector(
  pcResult: PCAlgorithmResult,
  config: Partial<ConfoundingDetectorConfig> = {}
) {
  const {
    minRobustEValue = 2.0,
    confoundingThreshold = 0.1
  } = config;

  const dag = pcResultToDAG(pcResult);

  return {
    /**
     * Analyze confounding between source and target variables
     */
    analyzeConfounding(
      data: Map<string, number[]>,
      sourceVar: string,
      targetVar: string,
      effectEstimate?: {
        observedRR: number;
        ci: ConfidenceInterval;
      }
    ): ConfoundingAnalysis {
      const reasoning: string[] = [];

      // 1. Find potential confounders using graph structure
      const sourceAncestors = findAncestors(dag, sourceVar);
      const targetAncestors = findAncestors(dag, targetVar);

      // Common ancestors are potential confounders
      const commonAncestors = [...sourceAncestors].filter(a => targetAncestors.has(a));

      const potentialConfounders: ConfoundingAnalysis['potentialConfounders'] = [];

      for (const ancestor of commonAncestors) {
        // Estimate confounding strength using correlation
        const sourceData = data.get(sourceVar);
        const targetData = data.get(targetVar);
        const ancestorData = data.get(ancestor);

        if (sourceData && targetData && ancestorData) {
          const strength = estimateConfoundingStrength(
            sourceData,
            targetData,
            ancestorData
          );

          if (strength > confoundingThreshold) {
            potentialConfounders.push({
              variable: ancestor,
              confoundingStrength: strength,
              evidence: `Correlation-based strength: ${strength.toFixed(3)}`
            });
          }
        }
      }

      if (potentialConfounders.length > 0) {
        reasoning.push(
          `Found ${potentialConfounders.length} potential confounder(s) from graph structure: ` +
          potentialConfounders.map(c => c.variable).join(', ')
        );
      } else {
        reasoning.push('No observed confounders identified from graph structure');
      }

      // 2. Compute E-value for sensitivity to unobserved confounding
      let eValue = Infinity;
      let eValueLowerCI = Infinity;
      let eValueInterpretation = '';

      if (effectEstimate) {
        const { observedRR, ci } = effectEstimate;

        eValue = computeEValue(observedRR);
        eValueLowerCI = computeEValue(ci.lower);

        if (eValue >= minRobustEValue) {
          eValueInterpretation =
            `E-value of ${eValue.toFixed(2)} suggests the effect is robust to unmeasured confounding. ` +
            `A confounder would need to be associated with both treatment and outcome with ` +
            `relative risk of at least ${eValue.toFixed(2)} to explain away the effect.`;
          reasoning.push(`E-value analysis indicates robust causal effect (E=${eValue.toFixed(2)})`);
        } else {
          eValueInterpretation =
            `E-value of ${eValue.toFixed(2)} is relatively small. ` +
            `A moderate confounder could potentially explain away the observed effect.`;
          reasoning.push(`E-value analysis indicates effect may be due to confounding (E=${eValue.toFixed(2)})`);
        }
      } else {
        eValueInterpretation = 'No effect estimate provided for E-value analysis';
        reasoning.push('E-value analysis skipped: no effect estimate provided');
      }

      // 3. Determine recommendation
      let recommendation: ConfoundingAnalysis['recommendation'];
      let robustnessScore: number;

      const strongConfounders = potentialConfounders.filter(c => c.confoundingStrength > 0.3);

      if (strongConfounders.length > 0) {
        recommendation = 'definitely_confounded';
        robustnessScore = 0.2;
        reasoning.push(
          `Strong confounders detected (${strongConfounders.map(c => c.variable).join(', ')}). ` +
          `Causal interpretation is NOT warranted without adjustment.`
        );
      } else if (potentialConfounders.length > 0 || (effectEstimate && eValue < minRobustEValue)) {
        recommendation = 'likely_confounded';
        robustnessScore = 0.5;
        reasoning.push(
          'Moderate confounding risk detected. Causal interpretation should be made with caution.'
        );
      } else {
        recommendation = 'causal';
        robustnessScore = 0.8;
        reasoning.push(
          'No strong evidence of confounding. Causal interpretation appears reasonable.'
        );
      }

      // Adjust robustness score based on E-value
      if (effectEstimate && eValue !== Infinity) {
        robustnessScore = Math.min(robustnessScore, eValue / (minRobustEValue * 2));
      }

      return {
        sourceVar,
        targetVar,
        potentialConfounders,
        unobservedConfoundingSensitivity: {
          eValue,
          eValueLowerCI,
          interpretation: eValueInterpretation
        },
        recommendation,
        reasoning,
        robustnessScore: Math.max(0, Math.min(1, robustnessScore))
      };
    },

    /**
     * Quick check if relationship is likely confounded
     */
    isLikelyConfounded(
      sourceVar: string,
      targetVar: string
    ): boolean {
      const sourceAncestors = findAncestors(dag, sourceVar);
      const targetAncestors = findAncestors(dag, targetVar);

      // Check for common ancestors
      for (const ancestor of sourceAncestors) {
        if (targetAncestors.has(ancestor)) {
          return true;
        }
      }

      return false;
    },

    /**
     * Find all confounders between two variables
     */
    findConfounders(
      sourceVar: string,
      targetVar: string
    ): string[] {
      const sourceAncestors = findAncestors(dag, sourceVar);
      const targetAncestors = findAncestors(dag, targetVar);

      return [...sourceAncestors].filter(a => targetAncestors.has(a));
    },

    /**
     * Compute required confounder strength to explain away effect
     */
    computeRequiredConfounding(
      observedEffect: number,
      desiredResidualEffect: number = 1.0
    ): number {
      // Based on cornfield conditions
      if (observedEffect <= desiredResidualEffect) {
        return 0; // Effect already explained
      }

      return Math.sqrt(observedEffect / desiredResidualEffect);
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Estimate confounding strength using partial correlation
 *
 * Confounding strength = reduction in correlation when controlling for confounder
 */
function estimateConfoundingStrength(
  source: number[],
  target: number[],
  confounder: number[]
): number {
  const n = source.length;

  // Raw correlation between source and target
  const rawCorr = pearsonCorrelation(source, target);

  // Partial correlation controlling for confounder
  const partialCorr = partialCorrelation(source, target, confounder);

  // Confounding strength = how much the correlation changes
  const strength = Math.abs(rawCorr - partialCorr);

  return strength;
}

/**
 * Pearson correlation coefficient
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denom = Math.sqrt(sumX2 * sumY2);
  return denom > 0 ? sumXY / denom : 0;
}

/**
 * Partial correlation between x and y controlling for z
 */
function partialCorrelation(x: number[], y: number[], z: number[]): number {
  const rXY = pearsonCorrelation(x, y);
  const rXZ = pearsonCorrelation(x, z);
  const rYZ = pearsonCorrelation(y, z);

  const numerator = rXY - rXZ * rYZ;
  const denominator = Math.sqrt((1 - rXZ * rXZ) * (1 - rYZ * rYZ));

  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Compute E-value for unmeasured confounding
 *
 * E-value = RR + sqrt(RR * (RR - 1))
 * where RR is the observed relative risk
 *
 * Interpretation: minimum strength of association between
 * confounder and both treatment and outcome needed to
 * fully explain away the observed effect.
 */
function computeEValue(relativeRisk: number): number {
  if (relativeRisk <= 1) {
    // Convert to > 1 for calculation
    const rr = 1 / relativeRisk;
    return rr + Math.sqrt(rr * (rr - 1));
  }

  return relativeRisk + Math.sqrt(relativeRisk * (relativeRisk - 1));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ConfoundingDetector = {
  createConfoundingDetector,
  computeEValue
};
