/**
 * Nexus Memory Stack - Do-Calculus for Causal Intervention Effects
 *
 * L4: Causal Graph Engine - Pearl's Do-Calculus
 *
 * Implements Pearl's do-calculus for computing causal effects from
 * observational data using the causal graph structure.
 *
 * Key Insight:
 * - P(Y|X=x) is correlation (what we observe when X=x)
 * - P(Y|do(X=x)) is causation (what happens when we SET X to x)
 *
 * The do-operator removes incoming edges to X in the causal graph,
 * simulating an intervention rather than observation.
 *
 * This module enables:
 * - Checking if causal effects are identifiable from observational data
 * - Finding valid adjustment sets using backdoor/frontdoor criteria
 * - Estimating Average Treatment Effects (ATE)
 * - Detecting confounders between variables
 */

import { type ConfidenceInterval, normalQuantile } from './statistical-tests';
import {
  type PCAlgorithmResult,
  pcResultToDAG,
  findAncestors,
  findDescendants
} from './pc-algorithm';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Query for causal effect estimation
 */
export interface InterventionQuery {
  /** Variable to intervene on (treatment) */
  treatment: string;
  /** Value to set treatment to */
  treatmentValue: number;
  /** Variable to measure (outcome) */
  outcome: string;
  /** Optional adjustment set (if not provided, will be computed) */
  adjustmentSet?: string[];
  /** Instrumental variable (for IV estimation) */
  instrumentalVar?: string;
}

/**
 * Estimated causal effect
 */
export interface CausalEffectEstimate {
  /** Average Treatment Effect: E[Y|do(X=1)] - E[Y|do(X=0)] */
  ate: number;
  /** Average Treatment Effect on the Treated */
  att: number;
  /** Confidence interval for ATE */
  ateCI: ConfidenceInterval;
  /** Method used for estimation */
  method: 'backdoor' | 'frontdoor' | 'iv' | 'direct';
  /** Whether the effect is identifiable from data */
  identifiable: boolean;
  /** Required causal assumptions */
  assumptions: string[];
  /** Sample size used */
  sampleSize: number;
  /** P-value for effect */
  pValue: number;
  /** Natural language interpretation */
  naturalLanguage: string;
}

/**
 * Directed Acyclic Graph representation
 */
export interface CausalDAG {
  /** Map from node to its children (direct effects) */
  children: Map<string, string[]>;
  /** Map from node to its parents (direct causes) */
  parents: Map<string, string[]>;
  /** All nodes in the graph */
  nodes: string[];
}

/**
 * Configuration for do-calculus estimation
 */
export interface DoCalculusConfig {
  /** Significance level (default: 0.05) */
  alpha: number;
  /** Bootstrap iterations for CI (default: 1000) */
  bootstrapIterations: number;
  /** Minimum observations required (default: 30) */
  minObservations: number;
}

// ============================================================================
// DO-CALCULUS ESTIMATOR FACTORY
// ============================================================================

/**
 * Create a do-calculus estimator from a causal graph
 *
 * @example
 * ```typescript
 * const pcResult = runPCAlgorithm(data);
 * const estimator = createDoCalculusEstimator(pcResult);
 *
 * // Check if effect is identifiable
 * const identifiable = estimator.isIdentifiable({
 *   treatment: 'finance',
 *   treatmentValue: -0.5,
 *   outcome: 'cs_health'
 * });
 *
 * // Find adjustment set
 * const adjSet = estimator.findBackdoorAdjustmentSet('finance', 'cs_health');
 *
 * // Estimate effect
 * const effect = estimator.estimateEffect(query, data);
 * ```
 */
export function createDoCalculusEstimator(
  pcResult: PCAlgorithmResult,
  config: Partial<DoCalculusConfig> = {}
) {
  const {
    alpha = 0.05,
    bootstrapIterations = 1000,
    minObservations = 5
  } = config;

  // Build DAG structure
  const dag = buildDAG(pcResult);

  return {
    /**
     * Get the underlying DAG
     */
    getDAG(): CausalDAG {
      return dag;
    },

    /**
     * Check if the causal effect is identifiable from observational data
     *
     * An effect P(Y|do(X)) is identifiable if:
     * 1. There exists a valid backdoor adjustment set, OR
     * 2. There exists a valid frontdoor adjustment set, OR
     * 3. There is no confounding (no unblocked backdoor paths)
     */
    isIdentifiable(query: InterventionQuery): boolean {
      const { treatment, outcome } = query;

      // Check if backdoor adjustment is possible
      const backdoorSet = this.findBackdoorAdjustmentSet(treatment, outcome);
      if (backdoorSet !== null) return true;

      // Check if frontdoor adjustment is possible
      const frontdoorSet = this.findFrontdoorAdjustmentSet(treatment, outcome);
      if (frontdoorSet !== null) return true;

      // Check for direct effect (no confounding)
      const confounders = this.detectConfounders(treatment, outcome);
      if (confounders.length === 0) return true;

      return false;
    },

    /**
     * Find a valid backdoor adjustment set
     *
     * Backdoor criterion (Pearl):
     * A set Z satisfies the backdoor criterion relative to (X, Y) if:
     * 1. Z blocks all backdoor paths from X to Y
     * 2. Z contains no descendant of X
     *
     * Returns null if no valid adjustment set exists
     */
    findBackdoorAdjustmentSet(treatment: string, outcome: string): string[] | null {
      // Get descendants of treatment (cannot adjust for these)
      const treatmentDescendants = findDescendants(
        pcResultToDAG(pcResult),
        treatment
      );

      // Get all other variables as potential adjusters
      const potentialAdjusters = dag.nodes.filter(n =>
        n !== treatment &&
        n !== outcome &&
        !treatmentDescendants.has(n)
      );

      // Find backdoor paths (paths from treatment to outcome through parents)
      const backdoorPaths = findBackdoorPaths(dag, treatment, outcome);

      if (backdoorPaths.length === 0) {
        // No confounding, can estimate directly
        return [];
      }

      // Find minimal set that blocks all backdoor paths
      // Try single variables first, then pairs, etc.
      for (let size = 1; size <= potentialAdjusters.length; size++) {
        const combinations = generateCombinations(potentialAdjusters, size);

        for (const adjustSet of combinations) {
          if (blocksAllPaths(dag, backdoorPaths, adjustSet)) {
            return adjustSet;
          }
        }
      }

      return null; // No valid adjustment set found
    },

    /**
     * Find a valid frontdoor adjustment set
     *
     * Frontdoor criterion:
     * Z is a valid frontdoor adjustment set if:
     * 1. Z intercepts all directed paths from X to Y
     * 2. There is no backdoor path from X to Z
     * 3. All backdoor paths from Z to Y are blocked by X
     */
    findFrontdoorAdjustmentSet(treatment: string, outcome: string): string[] | null {
      // Find all variables on directed paths from treatment to outcome
      const pathVariables = findVariablesOnDirectedPaths(dag, treatment, outcome);

      if (pathVariables.length === 0) {
        return null; // No directed path exists
      }

      // Check each potential mediator
      for (const mediator of pathVariables) {
        // Check condition 2: no backdoor path from treatment to mediator
        const backdoorToMediator = findBackdoorPaths(dag, treatment, mediator);
        if (backdoorToMediator.length > 0) continue;

        // Check condition 3: backdoor paths from mediator to outcome blocked by treatment
        const backdoorFromMediator = findBackdoorPaths(dag, mediator, outcome);
        const treatmentBlocks = blocksAllPaths(dag, backdoorFromMediator, [treatment]);
        if (!treatmentBlocks) continue;

        return [mediator];
      }

      return null;
    },

    /**
     * Detect confounders between treatment and outcome
     *
     * A confounder is a common cause of both X and Y
     */
    detectConfounders(treatment: string, outcome: string): string[] {
      const treatmentAncestors = findAncestors(pcResultToDAG(pcResult), treatment);
      const outcomeAncestors = findAncestors(pcResultToDAG(pcResult), outcome);

      // Common ancestors are confounders
      const confounders: string[] = [];
      for (const ancestor of treatmentAncestors) {
        if (outcomeAncestors.has(ancestor)) {
          confounders.push(ancestor);
        }
      }

      return confounders;
    },

    /**
     * Estimate causal effect using appropriate method
     */
    estimateEffect(
      query: InterventionQuery,
      data: Map<string, number[]>
    ): CausalEffectEstimate {
      const { treatment, outcome, adjustmentSet } = query;

      // Validate data
      const treatmentData = data.get(treatment);
      const outcomeData = data.get(outcome);

      if (!treatmentData || !outcomeData) {
        throw new Error('Missing data for treatment or outcome variable');
      }

      const n = treatmentData.length;
      if (n < minObservations) {
        throw new Error(`Insufficient observations: ${n} < ${minObservations}`);
      }

      // Determine adjustment set if not provided
      let adjSet: string[] | undefined = adjustmentSet;
      let method: CausalEffectEstimate['method'] = 'direct';

      if (!adjSet) {
        const backdoorSet = this.findBackdoorAdjustmentSet(treatment, outcome);
        adjSet = backdoorSet !== null ? backdoorSet : undefined;
        if (adjSet && adjSet.length > 0) {
          method = 'backdoor';
        } else {
          const frontdoor = this.findFrontdoorAdjustmentSet(treatment, outcome);
          if (frontdoor !== null) {
            adjSet = frontdoor;
            method = 'frontdoor';
          }
        }
      } else {
        method = 'backdoor';
      }

      // Estimate ATE using regression adjustment
      let ate: number;
      let se: number;

      if (!adjSet || adjSet.length === 0) {
        // Simple mean difference (no adjustment)
        const result = computeSimpleATE(treatmentData, outcomeData);
        ate = result.ate;
        se = result.se;
      } else {
        // Regression adjustment
        const adjustmentData = adjSet.map(v => data.get(v)!).filter(Boolean);
        if (adjustmentData.length !== adjSet.length) {
          throw new Error('Missing data for adjustment variables');
        }

        const result = computeAdjustedATE(
          treatmentData,
          outcomeData,
          adjustmentData
        );
        ate = result.ate;
        se = result.se;
      }

      // Compute CI
      const z = normalQuantile(1 - alpha / 2);
      const ateCI: ConfidenceInterval = {
        lower: ate - z * se,
        upper: ate + z * se,
        level: 1 - alpha
      };

      // Compute p-value
      const zStat = Math.abs(ate / se);
      const pValue = 2 * (1 - normalCDF(zStat));

      // ATT (simplified: assume same as ATE for now)
      const att = ate;

      // Build assumptions list
      const assumptions: string[] = [];
      if (method === 'backdoor') {
        assumptions.push('No unmeasured confounders given adjustment set');
        assumptions.push('Positivity: P(X|Z) > 0 for all Z');
      } else if (method === 'frontdoor') {
        assumptions.push('Full mediation through frontdoor variables');
        assumptions.push('No direct effect bypassing mediators');
      } else {
        assumptions.push('No confounding between treatment and outcome');
      }
      assumptions.push('Consistency: no interference between units');
      assumptions.push('No selection bias');

      const identifiable = this.isIdentifiable(query);

      return {
        ate,
        att,
        ateCI,
        method,
        identifiable,
        assumptions,
        sampleSize: n,
        pValue,
        naturalLanguage: generateEffectNarrative(
          treatment,
          outcome,
          ate,
          ateCI,
          pValue,
          method,
          identifiable
        )
      };
    }
  };
}

// ============================================================================
// DAG OPERATIONS
// ============================================================================

/**
 * Build DAG from PC algorithm result
 */
function buildDAG(pcResult: PCAlgorithmResult): CausalDAG {
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  // Initialize
  for (const node of pcResult.nodes) {
    children.set(node, []);
    parents.set(node, []);
  }

  // Add edges
  for (const edge of pcResult.orientedEdges) {
    if (edge.direction === 'forward') {
      children.get(edge.source)!.push(edge.target);
      parents.get(edge.target)!.push(edge.source);
    } else if (edge.direction === 'backward') {
      children.get(edge.target)!.push(edge.source);
      parents.get(edge.source)!.push(edge.target);
    }
    // Undirected edges are treated as bidirectional for backdoor analysis
    else if (edge.direction === 'undirected') {
      children.get(edge.source)!.push(edge.target);
      children.get(edge.target)!.push(edge.source);
      parents.get(edge.target)!.push(edge.source);
      parents.get(edge.source)!.push(edge.target);
    }
  }

  return { children, parents, nodes: pcResult.nodes };
}

/**
 * Find all backdoor paths from treatment to outcome
 *
 * Backdoor paths are paths that start with an arrow INTO treatment
 */
function findBackdoorPaths(
  dag: CausalDAG,
  treatment: string,
  outcome: string
): string[][] {
  const paths: string[][] = [];
  const treatmentParents = dag.parents.get(treatment) || [];

  // BFS from each parent of treatment to find paths to outcome
  for (const parent of treatmentParents) {
    const queue: Array<{ node: string; path: string[] }> = [
      { node: parent, path: [treatment, parent] }
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (node === outcome) {
        paths.push(path);
        continue;
      }

      if (visited.has(node)) continue;
      visited.add(node);

      // Follow parents (going back on causal arrows)
      for (const p of dag.parents.get(node) || []) {
        if (!path.includes(p)) {
          queue.push({ node: p, path: [...path, p] });
        }
      }

      // Follow children (going forward on causal arrows)
      for (const c of dag.children.get(node) || []) {
        if (!path.includes(c)) {
          queue.push({ node: c, path: [...path, c] });
        }
      }
    }
  }

  return paths;
}

/**
 * Find variables on directed paths from source to target
 */
function findVariablesOnDirectedPaths(
  dag: CausalDAG,
  source: string,
  target: string
): string[] {
  const variables = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string, path: string[]): boolean {
    if (node === target) {
      // Add all intermediate nodes to variables
      for (let i = 1; i < path.length; i++) {
        variables.add(path[i]);
      }
      return true;
    }

    visited.add(node);

    for (const child of dag.children.get(node) || []) {
      if (!visited.has(child)) {
        if (dfs(child, [...path, child])) {
          return true;
        }
      }
    }

    return false;
  }

  dfs(source, [source]);
  return Array.from(variables);
}

/**
 * Check if an adjustment set blocks all given paths
 */
function blocksAllPaths(
  dag: CausalDAG,
  paths: string[][],
  adjustSet: string[]
): boolean {
  for (const path of paths) {
    if (!pathBlocked(dag, path, adjustSet)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a path is blocked by the adjustment set
 * Using d-separation rules
 */
function pathBlocked(
  dag: CausalDAG,
  path: string[],
  adjustSet: string[]
): boolean {
  // A path is blocked if any non-collider is in adjustSet
  // or if any collider is NOT in adjustSet (and none of its descendants)

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];

    const isCollider = isColliderOnPath(dag, prev, curr, next);

    if (isCollider) {
      // Path blocked if collider and its descendants are NOT in adjustSet
      const descendants = findDescendantsSimple(dag, curr);
      const colliderOrDescendantAdjusted =
        adjustSet.includes(curr) ||
        descendants.some(d => adjustSet.includes(d));

      if (!colliderOrDescendantAdjusted) {
        return true;
      }
    } else {
      // Path blocked if non-collider IS in adjustSet
      if (adjustSet.includes(curr)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a node is a collider on the path segment prev -> curr -> next
 */
function isColliderOnPath(
  dag: CausalDAG,
  prev: string,
  curr: string,
  next: string
): boolean {
  const currParents = dag.parents.get(curr) || [];
  return currParents.includes(prev) && currParents.includes(next);
}

/**
 * Find descendants (simple BFS)
 */
function findDescendantsSimple(dag: CausalDAG, node: string): string[] {
  const descendants: string[] = [];
  const queue = [...(dag.children.get(node) || [])];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    descendants.push(curr);
    queue.push(...(dag.children.get(curr) || []));
  }

  return descendants;
}

/**
 * Generate all combinations of size k
 */
function generateCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];

  const result: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }

    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

// ============================================================================
// EFFECT ESTIMATION
// ============================================================================

/**
 * Compute simple ATE without adjustment
 */
function computeSimpleATE(
  treatment: number[],
  outcome: number[]
): { ate: number; se: number } {
  const n = treatment.length;

  // Simple regression coefficient
  const meanT = treatment.reduce((a, b) => a + b, 0) / n;
  const meanY = outcome.reduce((a, b) => a + b, 0) / n;

  let sumTY = 0;
  let sumT2 = 0;

  for (let i = 0; i < n; i++) {
    sumTY += (treatment[i] - meanT) * (outcome[i] - meanY);
    sumT2 += (treatment[i] - meanT) ** 2;
  }

  const ate = sumT2 > 0 ? sumTY / sumT2 : 0;

  // Standard error
  let rss = 0;
  for (let i = 0; i < n; i++) {
    const predicted = meanY + ate * (treatment[i] - meanT);
    rss += (outcome[i] - predicted) ** 2;
  }

  const mse = rss / (n - 2);
  const se = Math.sqrt(mse / sumT2);

  return { ate, se };
}

/**
 * Compute ATE with regression adjustment
 */
function computeAdjustedATE(
  treatment: number[],
  outcome: number[],
  adjustmentVars: number[][]
): { ate: number; se: number } {
  const n = treatment.length;
  const p = adjustmentVars.length + 1; // +1 for treatment

  // Build design matrix: [1, treatment, adj1, adj2, ...]
  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = [1, treatment[i]];
    for (let j = 0; j < adjustmentVars.length; j++) {
      row.push(adjustmentVars[j][i]);
    }
    X.push(row);
  }

  // OLS
  const result = solveOLSWithSE(X, outcome);

  // ATE is the coefficient on treatment
  return {
    ate: result.coefficients[1],
    se: result.standardErrors[1]
  };
}

/**
 * Solve OLS and compute standard errors
 */
function solveOLSWithSE(
  X: number[][],
  y: number[]
): { coefficients: number[]; standardErrors: number[] } {
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

  // Add regularization
  for (let i = 0; i < p; i++) {
    XtX[i][i] += 1e-8;
  }

  // Solve for coefficients
  const coefficients = solveLinearSystem(XtX, Xty);

  // Compute residuals
  let rss = 0;
  for (let i = 0; i < n; i++) {
    let predicted = 0;
    for (let j = 0; j < p; j++) {
      predicted += X[i][j] * coefficients[j];
    }
    rss += (y[i] - predicted) ** 2;
  }

  // MSE
  const mse = rss / (n - p);

  // (X'X)^-1 for variance
  const XtXInv = invertMatrix(XtX);

  // Standard errors
  const standardErrors = XtXInv.map((row, i) => Math.sqrt(mse * row[i]));

  return { coefficients, standardErrors };
}

/**
 * Solve linear system
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
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
 * Invert matrix using Gauss-Jordan
 */
function invertMatrix(A: number[][]): number[][] {
  const n = A.length;
  const aug = A.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-10) aug[col][col] = 1e-10;

    const pivot = aug[col][col];
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = aug[row][col];
        for (let j = 0; j < 2 * n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }
  }

  return aug.map(row => row.slice(n));
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
 * Generate natural language narrative
 */
function generateEffectNarrative(
  treatment: string,
  outcome: string,
  ate: number,
  ci: ConfidenceInterval,
  pValue: number,
  method: string,
  identifiable: boolean
): string {
  const direction = ate > 0 ? 'increases' : 'decreases';
  const magnitude = Math.abs(ate).toFixed(3);
  const pStr = pValue < 0.001 ? 'p<0.001' : `p=${pValue.toFixed(3)}`;

  if (!identifiable) {
    return `Causal effect of ${treatment} on ${outcome} is NOT identifiable from observational data. ` +
           `Unobserved confounding may bias any estimate.`;
  }

  if (pValue < 0.05) {
    return `Intervening on ${treatment} ${direction} ${outcome} by ${magnitude} ` +
           `(95% CI: [${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}], ${pStr}) ` +
           `using ${method} adjustment.`;
  } else {
    return `No significant causal effect of ${treatment} on ${outcome} detected ` +
           `(ATE=${ate.toFixed(3)}, ${pStr}).`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const DoCalculus = {
  createDoCalculusEstimator
};
