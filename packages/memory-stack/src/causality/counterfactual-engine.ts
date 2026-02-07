/**
 * Nexus Memory Stack - Counterfactual Reasoning Engine
 *
 * L4: Causal Graph Engine - "What If" Analysis
 *
 * Answers counterfactual questions like:
 * "Given that we observed outcome Y=y after doing X=x,
 * what would Y have been if we had done X=x' instead?"
 *
 * Key Concepts:
 * - Counterfactuals: Reasoning about alternative outcomes
 * - Probability of Necessity (PN): Would Y have been different without X?
 * - Probability of Sufficiency (PS): Would X alone have caused Y?
 * - Optimal intervention: What X value would achieve target Y?
 *
 * This enables:
 * - Post-hoc analysis of interventions
 * - Optimization of future interventions
 * - Attribution of outcomes to specific actions
 */

import { type ConfidenceInterval, normalQuantile } from './statistical-tests';
import { type PCAlgorithmResult, pcResultToDAG, findAncestors } from './pc-algorithm';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Query for counterfactual reasoning
 */
export interface CounterfactualQuery {
  /** What treatment was actually given */
  observedTreatment: { variable: string; value: number };
  /** What outcome was actually observed */
  observedOutcome: { variable: string; value: number };
  /** What alternative treatment we're asking about */
  hypotheticalTreatment: { variable: string; value: number };
  /** Values of other relevant variables */
  covariates: Record<string, number>;
}

/**
 * Result of counterfactual analysis
 */
export interface CounterfactualResult {
  /** Predicted outcome under hypothetical treatment */
  hypotheticalOutcome: number;
  /** Confidence interval */
  confidenceInterval: ConfidenceInterval;

  /** Probability that Y would have been different without X */
  probabilityOfNecessity: number;
  /** Probability that X alone would have caused Y */
  probabilityOfSufficiency: number;

  /** Natural language explanation */
  explanation: string;

  /** Comparison with observed */
  comparison: {
    observedOutcome: number;
    hypotheticalOutcome: number;
    difference: number;
    percentChange: number;
  };
}

/**
 * Optimal intervention recommendation
 */
export interface OptimalIntervention {
  /** Variable to intervene on */
  variable: string;
  /** Recommended value */
  recommendedValue: number;
  /** Confidence interval for recommended value */
  valueCI: ConfidenceInterval;
  /** Expected outcome under intervention */
  expectedOutcome: number;
  /** Probability of achieving target */
  probabilityOfSuccess: number;
  /** Explanation */
  explanation: string;
}

/**
 * Structural Causal Model (simplified)
 */
export interface StructuralCausalModel {
  /** Variables in the model */
  variables: string[];
  /** Structural equations: variable -> function of parents + noise */
  equations: Map<string, {
    parents: string[];
    coefficients: number[];
    intercept: number;
    noiseVariance: number;
  }>;
}

// ============================================================================
// COUNTERFACTUAL ENGINE FACTORY
// ============================================================================

/**
 * Create a counterfactual reasoning engine
 *
 * @example
 * ```typescript
 * const engine = createCounterfactualEngine(scm);
 *
 * // What if we had done a different intervention?
 * const result = engine.computeCounterfactual({
 *   observedTreatment: { variable: 'collections_effort', value: 0.3 },
 *   observedOutcome: { variable: 'payment_velocity', value: -0.2 },
 *   hypotheticalTreatment: { variable: 'collections_effort', value: 0.8 },
 *   covariates: { client_size: 1000000, health_score: 65 }
 * });
 *
 * console.log(result.hypotheticalOutcome);
 * // 0.15 (payment velocity would have improved)
 * ```
 */
export function createCounterfactualEngine(structuralModel: StructuralCausalModel) {
  const { variables, equations } = structuralModel;

  /**
   * Compute noise term (exogenous) from observed data
   * Using the structural equation: U = Y - f(Pa(Y))
   */
  const computeNoise = (
    variable: string,
    value: number,
    parentValues: Record<string, number>
  ): number => {
    const eq = equations.get(variable);
    if (!eq) return 0;

    let predicted = eq.intercept;
    for (let i = 0; i < eq.parents.length; i++) {
      const parentValue = parentValues[eq.parents[i]] || 0;
      predicted += eq.coefficients[i] * parentValue;
    }

    return value - predicted;
  };

  /**
   * Compute variable value from parents and noise
   */
  const computeValue = (
    variable: string,
    parentValues: Record<string, number>,
    noise: number
  ): number => {
    const eq = equations.get(variable);
    if (!eq) return noise;

    let value = eq.intercept + noise;
    for (let i = 0; i < eq.parents.length; i++) {
      const parentValue = parentValues[eq.parents[i]] || 0;
      value += eq.coefficients[i] * parentValue;
    }

    return value;
  };

  return {
    /**
     * Get the structural causal model
     */
    getModel(): StructuralCausalModel {
      return structuralModel;
    },

    /**
     * Compute counterfactual outcome
     *
     * Algorithm (Pearl's 3-step process):
     * 1. Abduction: Use observed values to infer noise terms
     * 2. Action: Modify the model by setting treatment to hypothetical value
     * 3. Prediction: Compute outcome in modified model with inferred noise
     */
    computeCounterfactual(query: CounterfactualQuery): CounterfactualResult {
      const {
        observedTreatment,
        observedOutcome,
        hypotheticalTreatment,
        covariates
      } = query;

      // Step 1: Abduction - infer noise terms from observations
      const noiseTerms: Record<string, number> = {};

      // Compute noise for outcome variable
      const outcomeParentValues: Record<string, number> = {
        ...covariates,
        [observedTreatment.variable]: observedTreatment.value
      };
      noiseTerms[observedOutcome.variable] = computeNoise(
        observedOutcome.variable,
        observedOutcome.value,
        outcomeParentValues
      );

      // Step 2 & 3: Action + Prediction
      // Set treatment to hypothetical value and recompute outcome
      const hypotheticalParentValues: Record<string, number> = {
        ...covariates,
        [hypotheticalTreatment.variable]: hypotheticalTreatment.value
      };

      const hypotheticalOutcome = computeValue(
        observedOutcome.variable,
        hypotheticalParentValues,
        noiseTerms[observedOutcome.variable]
      );

      // Compute confidence interval using noise variance
      const eq = equations.get(observedOutcome.variable);
      const noiseStd = eq ? Math.sqrt(eq.noiseVariance) : 0.1;
      const z = normalQuantile(0.975);

      const confidenceInterval: ConfidenceInterval = {
        lower: hypotheticalOutcome - z * noiseStd,
        upper: hypotheticalOutcome + z * noiseStd,
        level: 0.95
      };

      // Compute Probability of Necessity (PN)
      // P(Y' != y | do(X=x'), X=x, Y=y)
      // Approximated using the counterfactual
      const pn = computeProbabilityOfNecessity(
        observedOutcome.value,
        hypotheticalOutcome,
        noiseStd
      );

      // Compute Probability of Sufficiency (PS)
      // P(Y=y | do(X=x), X'=x', Y'!=y)
      const ps = computeProbabilityOfSufficiency(
        observedTreatment.value,
        hypotheticalTreatment.value,
        observedOutcome.value,
        hypotheticalOutcome,
        noiseStd
      );

      // Build comparison
      const difference = hypotheticalOutcome - observedOutcome.value;
      const percentChange = observedOutcome.value !== 0
        ? (difference / Math.abs(observedOutcome.value)) * 100
        : 0;

      const comparison = {
        observedOutcome: observedOutcome.value,
        hypotheticalOutcome,
        difference,
        percentChange
      };

      // Generate explanation
      const explanation = generateCounterfactualExplanation(
        observedTreatment,
        observedOutcome,
        hypotheticalTreatment,
        hypotheticalOutcome,
        pn,
        ps
      );

      return {
        hypotheticalOutcome,
        confidenceInterval,
        probabilityOfNecessity: pn,
        probabilityOfSufficiency: ps,
        explanation,
        comparison
      };
    },

    /**
     * Find optimal intervention to achieve target outcome
     */
    findOptimalIntervention(
      currentState: Record<string, number>,
      targetOutcome: { variable: string; targetValue: number },
      treatmentVariable: string,
      constraints?: { min?: number; max?: number }
    ): OptimalIntervention {
      const eq = equations.get(targetOutcome.variable);
      if (!eq) {
        throw new Error(`No equation found for ${targetOutcome.variable}`);
      }

      // Find treatment coefficient
      const treatmentIndex = eq.parents.indexOf(treatmentVariable);
      if (treatmentIndex === -1) {
        throw new Error(`${treatmentVariable} is not a direct cause of ${targetOutcome.variable}`);
      }

      const treatmentCoeff = eq.coefficients[treatmentIndex];

      // Compute required treatment value
      // Y = intercept + coeff * X + other_terms + noise
      // X = (Y - intercept - other_terms - noise) / coeff

      let otherTerms = eq.intercept;
      for (let i = 0; i < eq.parents.length; i++) {
        if (i !== treatmentIndex) {
          otherTerms += eq.coefficients[i] * (currentState[eq.parents[i]] || 0);
        }
      }

      const recommendedValue = (targetOutcome.targetValue - otherTerms) / treatmentCoeff;

      // Apply constraints
      const { min = -Infinity, max = Infinity } = constraints || {};
      const constrainedValue = Math.max(min, Math.min(max, recommendedValue));

      // Compute expected outcome with constrained value
      const expectedOutcome = otherTerms + treatmentCoeff * constrainedValue;

      // Probability of success (accounting for noise)
      const noiseStd = Math.sqrt(eq.noiseVariance);
      const zSuccess = Math.abs(targetOutcome.targetValue - expectedOutcome) / noiseStd;
      const probabilityOfSuccess = 1 - 2 * (1 - normalCDF(zSuccess));

      // CI for recommended value
      const uncertaintyInValue = noiseStd / Math.abs(treatmentCoeff);
      const z = normalQuantile(0.975);

      const valueCI: ConfidenceInterval = {
        lower: constrainedValue - z * uncertaintyInValue,
        upper: constrainedValue + z * uncertaintyInValue,
        level: 0.95
      };

      const explanation = generateOptimalInterventionExplanation(
        treatmentVariable,
        constrainedValue,
        targetOutcome,
        expectedOutcome,
        probabilityOfSuccess,
        recommendedValue !== constrainedValue
      );

      return {
        variable: treatmentVariable,
        recommendedValue: constrainedValue,
        valueCI,
        expectedOutcome,
        probabilityOfSuccess,
        explanation
      };
    },

    /**
     * Compute what-if scenarios for multiple treatment values
     */
    computeWhatIfScenarios(
      query: Omit<CounterfactualQuery, 'hypotheticalTreatment'>,
      treatmentValues: number[]
    ): Array<{ treatmentValue: number; outcome: number; ci: ConfidenceInterval }> {
      return treatmentValues.map(value => {
        const result = this.computeCounterfactual({
          ...query,
          hypotheticalTreatment: {
            variable: query.observedTreatment.variable,
            value
          }
        });

        return {
          treatmentValue: value,
          outcome: result.hypotheticalOutcome,
          ci: result.confidenceInterval
        };
      });
    }
  };
}

// ============================================================================
// STRUCTURAL MODEL ESTIMATION
// ============================================================================

/**
 * Estimate a Structural Causal Model from data and DAG
 *
 * Uses OLS regression for each variable on its parents
 */
export function estimateSCM(
  pcResult: PCAlgorithmResult,
  data: Map<string, number[]>
): StructuralCausalModel {
  const dag = pcResultToDAG(pcResult);
  const equations = new Map<string, {
    parents: string[];
    coefficients: number[];
    intercept: number;
    noiseVariance: number;
  }>();

  for (const variable of pcResult.nodes) {
    const varData = data.get(variable);
    if (!varData) continue;

    // Get parents from DAG
    const parents: string[] = [];
    for (const [node, children] of dag.entries()) {
      if (children.includes(variable)) {
        parents.push(node);
      }
    }

    if (parents.length === 0) {
      // Root node: Y = intercept + noise
      const mean = varData.reduce((a, b) => a + b, 0) / varData.length;
      const variance = varData.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (varData.length - 1);

      equations.set(variable, {
        parents: [],
        coefficients: [],
        intercept: mean,
        noiseVariance: variance
      });
    } else {
      // Non-root: regress on parents
      const n = varData.length;
      const parentData = parents.map(p => data.get(p)!).filter(Boolean);

      if (parentData.length !== parents.length) {
        // Missing parent data, skip
        continue;
      }

      // Build design matrix
      const X: number[][] = [];
      for (let i = 0; i < n; i++) {
        const row = [1]; // intercept
        for (let j = 0; j < parentData.length; j++) {
          row.push(parentData[j][i]);
        }
        X.push(row);
      }

      // OLS
      const result = solveOLS(X, varData);

      // Compute residual variance
      let rss = 0;
      for (let i = 0; i < n; i++) {
        let predicted = result.coefficients[0];
        for (let j = 0; j < parents.length; j++) {
          predicted += result.coefficients[j + 1] * parentData[j][i];
        }
        rss += (varData[i] - predicted) ** 2;
      }
      const noiseVariance = rss / (n - parents.length - 1);

      equations.set(variable, {
        parents,
        coefficients: result.coefficients.slice(1),
        intercept: result.coefficients[0],
        noiseVariance
      });
    }
  }

  return {
    variables: pcResult.nodes,
    equations
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Compute Probability of Necessity
 *
 * PN: Probability that outcome would have been different without treatment
 */
function computeProbabilityOfNecessity(
  observedOutcome: number,
  hypotheticalOutcome: number,
  noiseStd: number
): number {
  // If outcomes are very different, PN is high
  const diff = Math.abs(observedOutcome - hypotheticalOutcome);
  const z = diff / noiseStd;

  // Convert to probability
  return 2 * normalCDF(z) - 1;
}

/**
 * Compute Probability of Sufficiency
 *
 * PS: Probability that treatment alone would cause outcome
 */
function computeProbabilityOfSufficiency(
  observedTreatment: number,
  hypotheticalTreatment: number,
  observedOutcome: number,
  hypotheticalOutcome: number,
  noiseStd: number
): number {
  // PS is related to the treatment effect magnitude
  const treatmentDiff = Math.abs(observedTreatment - hypotheticalTreatment);
  const outcomeDiff = Math.abs(observedOutcome - hypotheticalOutcome);

  if (treatmentDiff < 0.001) return 0;

  // Effect per unit treatment
  const effectRatio = outcomeDiff / treatmentDiff;
  const normalizedEffect = effectRatio * noiseStd;

  return Math.min(1, normalizedEffect);
}

/**
 * OLS solver
 */
function solveOLS(X: number[][], y: number[]): { coefficients: number[] } {
  const n = X.length;
  const p = X[0].length;

  // X'X
  const XtX: number[][] = Array(p).fill(null).map(() => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < n; k++) {
        XtX[i][j] += X[k][i] * X[k][j];
      }
    }
  }

  // X'y
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let k = 0; k < n; k++) {
      Xty[i] += X[k][i] * y[k];
    }
  }

  // Regularization
  for (let i = 0; i < p; i++) {
    XtX[i][i] += 1e-8;
  }

  // Solve
  const coefficients = solveLinear(XtX, Xty);
  return { coefficients };
}

/**
 * Solve linear system
 */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-10) aug[col][col] = 1e-10;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const x = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = aug[row][n];
    for (let col = row + 1; col < n; col++) {
      x[row] -= aug[row][col] * x[col];
    }
    x[row] /= aug[row][row];
  }

  return x;
}

/**
 * Normal CDF
 */
function normalCDF(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Generate counterfactual explanation
 */
function generateCounterfactualExplanation(
  observedTreatment: { variable: string; value: number },
  observedOutcome: { variable: string; value: number },
  hypotheticalTreatment: { variable: string; value: number },
  hypotheticalOutcome: number,
  pn: number,
  ps: number
): string {
  const outcomeDirection = hypotheticalOutcome > observedOutcome.value ? 'higher' : 'lower';
  const outcomeChange = Math.abs(hypotheticalOutcome - observedOutcome.value).toFixed(3);

  let explanation = `If ${observedTreatment.variable} had been ${hypotheticalTreatment.value.toFixed(2)} ` +
    `instead of ${observedTreatment.value.toFixed(2)}, ` +
    `${observedOutcome.variable} would have been ${outcomeDirection} by ${outcomeChange} ` +
    `(${hypotheticalOutcome.toFixed(3)} vs observed ${observedOutcome.value.toFixed(3)}). `;

  if (pn > 0.7) {
    explanation += `The treatment was likely necessary for the observed outcome (PN=${pn.toFixed(2)}). `;
  }
  if (ps > 0.7) {
    explanation += `The treatment was likely sufficient to cause this outcome (PS=${ps.toFixed(2)}).`;
  }

  return explanation;
}

/**
 * Generate optimal intervention explanation
 */
function generateOptimalInterventionExplanation(
  variable: string,
  value: number,
  target: { variable: string; targetValue: number },
  expectedOutcome: number,
  probability: number,
  constrained: boolean
): string {
  let explanation = `To achieve ${target.variable} = ${target.targetValue.toFixed(2)}, `;
  explanation += `set ${variable} to ${value.toFixed(2)}. `;
  explanation += `Expected outcome: ${expectedOutcome.toFixed(3)} `;
  explanation += `(${(probability * 100).toFixed(0)}% probability of success). `;

  if (constrained) {
    explanation += `Note: Value was constrained to feasible range.`;
  }

  return explanation;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const CounterfactualEngine = {
  createCounterfactualEngine,
  estimateSCM
};
