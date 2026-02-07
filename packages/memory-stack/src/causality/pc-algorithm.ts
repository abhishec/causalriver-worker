/**
 * Nexus Memory Stack - PC Algorithm for Causal Structure Discovery
 *
 * L4: Causal Graph Engine - True Causal Discovery
 *
 * The PC (Peter-Clark) Algorithm discovers causal structure from
 * observational data using conditional independence tests.
 *
 * Key Difference from Granger Causality:
 * - Granger asks: "Does X precede Y?" (temporal)
 * - PC asks: "Is X independent of Y given Z?" (structural)
 *
 * PC can:
 * - Detect confounders (common causes)
 * - Identify mediators
 * - Distinguish direct from indirect effects
 * - Handle non-temporal relationships
 *
 * Algorithm Steps:
 * 1. Start with complete undirected graph
 * 2. Remove edges where conditional independence is found
 * 3. Orient edges based on v-structures (X -> Z <- Y where X,Y not adjacent)
 * 4. Propagate orientation using Meek rules R1-R4
 */

import { normalQuantile, type ConfidenceInterval } from './statistical-tests';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of a conditional independence test
 */
export interface ConditionalIndependenceTest {
  /** First variable */
  x: string;
  /** Second variable */
  y: string;
  /** Conditioning set */
  conditioningSet: string[];
  /** P-value from test */
  pValue: number;
  /** Test statistic */
  statistic: number;
  /** Type of test used */
  testType: 'partial_correlation' | 'fisher_z' | 'g2';
  /** Whether independence was found (p > alpha) */
  isIndependent: boolean;
}

/**
 * An edge in the causal graph
 */
export interface CausalEdge {
  source: string;
  target: string;
  /** Edge direction: directed, bidirected, or undirected */
  direction: 'forward' | 'backward' | 'bidirectional' | 'undirected';
  /** Strength of relationship (effect size) */
  strength?: number;
  /** P-value for the edge */
  pValue?: number;
}

/**
 * A v-structure in the graph (X -> Z <- Y)
 */
export interface VStructure {
  /** The collider node */
  collider: string;
  /** The two parent nodes */
  parents: [string, string];
}

/**
 * Result of PC Algorithm
 */
export interface PCAlgorithmResult {
  /** Undirected skeleton (adjacency matrix) */
  skeleton: Array<{ source: string; target: string }>;
  /** Oriented edges with directions */
  orientedEdges: CausalEdge[];
  /** Detected v-structures */
  vStructures: VStructure[];
  /** Separating sets for each removed edge */
  separatingSets: Map<string, string[]>;
  /** All conditional independence tests performed */
  testResults: ConditionalIndependenceTest[];
  /** Number of iterations */
  iterations: number;
  /** Nodes in the graph */
  nodes: string[];
}

/**
 * Configuration for PC Algorithm
 */
export interface PCAlgorithmConfig {
  /** Significance level for independence tests (default: 0.05) */
  alpha: number;
  /** Maximum conditioning set size (default: min(3, n-2)) */
  maxConditioningSetSize: number;
  /** Minimum observations required (default: 30) */
  minObservations: number;
  /** Use Fisher Z-transformation for correlation tests */
  useFisherZ: boolean;
}

// ============================================================================
// PC ALGORITHM IMPLEMENTATION
// ============================================================================

/**
 * Run the PC Algorithm on domain signal data
 *
 * @example
 * ```typescript
 * const data = new Map<string, number[]>();
 * data.set('finance', [0.1, 0.2, -0.3, ...]);
 * data.set('cs', [-0.1, 0.3, 0.2, ...]);
 * data.set('revenue', [0.4, 0.5, 0.3, ...]);
 *
 * const result = runPCAlgorithm(data, 0.05);
 * console.log(result.orientedEdges);
 * // [{ source: 'finance', target: 'cs', direction: 'forward' }, ...]
 * ```
 */
export function runPCAlgorithm(
  data: Map<string, number[]>,
  alpha: number = 0.05,
  maxConditioningSetSize?: number
): PCAlgorithmResult {
  const nodes = Array.from(data.keys());
  const n = nodes.length;

  // Validate input
  if (n < 2) {
    throw new Error('Need at least 2 variables for PC algorithm');
  }

  const sampleSize = data.get(nodes[0])!.length;
  for (const [node, values] of data.entries()) {
    if (values.length !== sampleSize) {
      throw new Error(`Variable ${node} has different sample size`);
    }
    if (values.length < 30) {
      throw new Error(`Insufficient observations: ${values.length} < 30`);
    }
  }

  // Default max conditioning set size
  const maxCondSetSize = maxConditioningSetSize ?? Math.min(3, n - 2);

  // Initialize adjacency matrix (start with complete graph)
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(node, new Set(nodes.filter(n => n !== node)));
  }

  // Separating sets for removed edges
  const separatingSets = new Map<string, string[]>();

  // All test results
  const testResults: ConditionalIndependenceTest[] = [];

  // Convert data to matrix for efficient access
  const dataMatrix = nodes.map(node => data.get(node)!);

  // Phase 1: Learn skeleton through conditional independence tests
  let condSetSize = 0;
  let iterations = 0;

  while (condSetSize <= maxCondSetSize) {
    let anyRemoved = false;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const nodeX = nodes[i];
        const nodeY = nodes[j];

        // Skip if already not adjacent
        if (!adjacency.get(nodeX)!.has(nodeY)) continue;

        // Get possible conditioning sets
        const neighborsX = Array.from(adjacency.get(nodeX)!).filter(n => n !== nodeY);
        const neighborsY = Array.from(adjacency.get(nodeY)!).filter(n => n !== nodeX);
        const possibleCondSets = [...new Set([...neighborsX, ...neighborsY])];

        // If not enough neighbors for this conditioning set size, skip
        if (possibleCondSets.length < condSetSize) continue;

        // Test all conditioning sets of current size
        const condSets = combinations(possibleCondSets, condSetSize);

        for (const condSet of condSets) {
          iterations++;

          // Perform conditional independence test
          const testResult = conditionalIndependenceTest(
            dataMatrix[i],
            dataMatrix[j],
            condSet.map(node => dataMatrix[nodes.indexOf(node)]),
            alpha
          );

          testResults.push({
            x: nodeX,
            y: nodeY,
            conditioningSet: condSet,
            pValue: testResult.pValue,
            statistic: testResult.statistic,
            testType: 'partial_correlation',
            isIndependent: testResult.isIndependent
          });

          // If independent, remove edge and record separating set
          if (testResult.isIndependent) {
            adjacency.get(nodeX)!.delete(nodeY);
            adjacency.get(nodeY)!.delete(nodeX);
            separatingSets.set(`${nodeX}-${nodeY}`, condSet);
            separatingSets.set(`${nodeY}-${nodeX}`, condSet);
            anyRemoved = true;
            break; // Move to next pair
          }
        }
      }
    }

    // If no edges removed at this level, increase conditioning set size
    if (!anyRemoved) {
      condSetSize++;
    }
  }

  // Build skeleton from remaining adjacencies
  const skeleton: Array<{ source: string; target: string }> = [];
  const seenEdges = new Set<string>();

  for (const [node, neighbors] of adjacency.entries()) {
    for (const neighbor of neighbors) {
      const edgeKey = [node, neighbor].sort().join('-');
      if (!seenEdges.has(edgeKey)) {
        skeleton.push({ source: node, target: neighbor });
        seenEdges.add(edgeKey);
      }
    }
  }

  // Phase 2: Orient v-structures (X -> Z <- Y where X,Y not adjacent)
  const vStructures: VStructure[] = [];
  const edgeOrientations = new Map<string, 'forward' | 'backward'>();

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const nodeX = nodes[i];
      const nodeY = nodes[j];

      // X and Y must NOT be adjacent
      if (adjacency.get(nodeX)!.has(nodeY)) continue;

      // Find common neighbors (potential colliders)
      const neighborsX = adjacency.get(nodeX)!;
      const neighborsY = adjacency.get(nodeY)!;
      const commonNeighbors = [...neighborsX].filter(n => neighborsY.has(n));

      for (const z of commonNeighbors) {
        // Check if Z is NOT in the separating set of X-Y
        const sepSet = separatingSets.get(`${nodeX}-${nodeY}`) || [];
        if (!sepSet.includes(z)) {
          // This is a v-structure: X -> Z <- Y
          vStructures.push({
            collider: z,
            parents: [nodeX, nodeY]
          });

          // Orient edges toward Z
          edgeOrientations.set(`${nodeX}-${z}`, 'forward');
          edgeOrientations.set(`${nodeY}-${z}`, 'forward');
        }
      }
    }
  }

  // Phase 3: Apply orientation rules R1-R4 (Meek rules)
  let changed = true;
  while (changed) {
    changed = false;

    for (const { source, target } of skeleton) {
      const edgeKey1 = `${source}-${target}`;
      const edgeKey2 = `${target}-${source}`;

      // Skip if already oriented
      if (edgeOrientations.has(edgeKey1) || edgeOrientations.has(edgeKey2)) continue;

      // R1: If X -> Y and Y - Z and X not adjacent to Z, then Y -> Z
      // Check if any neighbor of target points toward target
      for (const neighbor of adjacency.get(target)!) {
        if (neighbor === source) continue;
        if (edgeOrientations.get(`${neighbor}-${target}`) === 'forward') {
          // neighbor -> target exists, so orient target -> source would create cycle
          // Actually we should orient target -> neighbor if not already
          const neighborEdge = `${target}-${neighbor}`;
          if (!edgeOrientations.has(neighborEdge)) {
            edgeOrientations.set(neighborEdge, 'forward');
            changed = true;
          }
        }
      }

      // R2: Avoid creating cycles
      // If X -> Z -> Y and X - Y, then X -> Y
      for (const intermediate of adjacency.get(source)!) {
        if (intermediate === target) continue;
        if (!adjacency.get(intermediate)!.has(target)) continue;

        const sourceToInter = edgeOrientations.get(`${source}-${intermediate}`);
        const interToTarget = edgeOrientations.get(`${intermediate}-${target}`);

        if (sourceToInter === 'forward' && interToTarget === 'forward') {
          edgeOrientations.set(edgeKey1, 'forward');
          changed = true;
          break;
        }
      }
    }
  }

  // Build final oriented edges
  const orientedEdges: CausalEdge[] = skeleton.map(({ source, target }) => {
    const forwardKey = `${source}-${target}`;
    const backwardKey = `${target}-${source}`;

    let direction: CausalEdge['direction'] = 'undirected';
    if (edgeOrientations.get(forwardKey) === 'forward') {
      direction = 'forward';
    } else if (edgeOrientations.get(backwardKey) === 'forward') {
      direction = 'backward';
    }

    // Find the test result for this edge to get p-value
    const relevantTests = testResults.filter(t =>
      (t.x === source && t.y === target) || (t.x === target && t.y === source)
    );
    const maxPValue = relevantTests.length > 0
      ? Math.max(...relevantTests.map(t => t.pValue))
      : undefined;

    return {
      source,
      target,
      direction,
      pValue: maxPValue
    };
  });

  return {
    skeleton,
    orientedEdges,
    vStructures,
    separatingSets,
    testResults,
    iterations,
    nodes
  };
}

// ============================================================================
// CONDITIONAL INDEPENDENCE TESTING
// ============================================================================

/**
 * Test conditional independence between X and Y given Z
 * Uses partial correlation with Fisher Z transformation
 */
function conditionalIndependenceTest(
  x: number[],
  y: number[],
  conditioningVars: number[][],
  alpha: number
): { pValue: number; statistic: number; isIndependent: boolean } {
  const n = x.length;

  if (conditioningVars.length === 0) {
    // Simple correlation test
    const r = pearsonCorrelation(x, y);
    const { pValue, statistic } = fisherZTest(r, n);
    return { pValue, statistic, isIndependent: pValue > alpha };
  }

  // Partial correlation
  const partialCorr = partialCorrelation(x, y, conditioningVars);
  const df = n - conditioningVars.length - 2;

  if (df < 1) {
    // Not enough degrees of freedom
    return { pValue: 1, statistic: 0, isIndependent: true };
  }

  const { pValue, statistic } = fisherZTest(partialCorr, df);
  return { pValue, statistic, isIndependent: pValue > alpha };
}

/**
 * Compute Pearson correlation
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
 * Compute partial correlation between X and Y controlling for Z
 * Uses residual method
 */
function partialCorrelation(
  x: number[],
  y: number[],
  conditioningVars: number[][]
): number {
  if (conditioningVars.length === 0) {
    return pearsonCorrelation(x, y);
  }

  // Regress X on Z and get residuals
  const residualsX = computeResiduals(x, conditioningVars);

  // Regress Y on Z and get residuals
  const residualsY = computeResiduals(y, conditioningVars);

  // Correlation of residuals is partial correlation
  return pearsonCorrelation(residualsX, residualsY);
}

/**
 * Compute residuals from regressing y on X
 */
function computeResiduals(y: number[], X: number[][]): number[] {
  const n = y.length;
  const p = X.length;

  if (p === 0) return [...y];

  // Simple linear regression using normal equations
  // Add intercept column
  const designMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = [1]; // intercept
    for (let j = 0; j < p; j++) {
      row.push(X[j][i]);
    }
    designMatrix.push(row);
  }

  // Compute (X'X)^-1 X'y
  const coeffs = solveOLS(designMatrix, y);

  // Compute residuals
  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    let predicted = coeffs[0]; // intercept
    for (let j = 0; j < p; j++) {
      predicted += coeffs[j + 1] * X[j][i];
    }
    residuals.push(y[i] - predicted);
  }

  return residuals;
}

/**
 * Solve OLS regression using normal equations
 */
function solveOLS(X: number[][], y: number[]): number[] {
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

  // Solve with regularization for numerical stability
  for (let i = 0; i < p; i++) {
    XtX[i][i] += 1e-8;
  }

  return solveLinearSystem(XtX, Xty);
}

/**
 * Solve linear system using Gaussian elimination
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with pivoting
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-10) {
      aug[col][col] = 1e-10;
    }

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
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
 * Fisher Z transformation test for correlation
 */
function fisherZTest(r: number, n: number): { pValue: number; statistic: number } {
  // Clamp r to avoid infinity
  const rClamped = Math.max(-0.9999, Math.min(0.9999, r));

  // Fisher Z transformation
  const z = 0.5 * Math.log((1 + rClamped) / (1 - rClamped));

  // Standard error
  const se = 1 / Math.sqrt(n - 3);

  // Test statistic
  const statistic = Math.abs(z / se);

  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(statistic));

  return { pValue, statistic };
}

/**
 * Normal CDF approximation
 */
function normalCDF(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * Generate all combinations of size k from array
 */
function combinations<T>(array: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > array.length) return [];

  const result: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }

    for (let i = start; i < array.length; i++) {
      current.push(array[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert PC result to a Directed Acyclic Graph (DAG) representation
 */
export function pcResultToDAG(result: PCAlgorithmResult): Map<string, string[]> {
  const dag = new Map<string, string[]>();

  // Initialize with all nodes
  for (const node of result.nodes) {
    dag.set(node, []);
  }

  // Add directed edges
  for (const edge of result.orientedEdges) {
    if (edge.direction === 'forward') {
      dag.get(edge.source)!.push(edge.target);
    } else if (edge.direction === 'backward') {
      dag.get(edge.target)!.push(edge.source);
    }
  }

  return dag;
}

/**
 * Find all ancestors of a node in the DAG
 */
export function findAncestors(dag: Map<string, string[]>, node: string): Set<string> {
  const ancestors = new Set<string>();
  const reverseDag = new Map<string, string[]>();

  // Build reverse DAG
  for (const [parent, children] of dag.entries()) {
    for (const child of children) {
      if (!reverseDag.has(child)) {
        reverseDag.set(child, []);
      }
      reverseDag.get(child)!.push(parent);
    }
  }

  // BFS to find ancestors
  const queue = [node];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const parents = reverseDag.get(current) || [];
    for (const parent of parents) {
      if (!ancestors.has(parent)) {
        ancestors.add(parent);
        queue.push(parent);
      }
    }
  }

  return ancestors;
}

/**
 * Find all descendants of a node in the DAG
 */
export function findDescendants(dag: Map<string, string[]>, node: string): Set<string> {
  const descendants = new Set<string>();

  const queue = [node];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = dag.get(current) || [];
    for (const child of children) {
      if (!descendants.has(child)) {
        descendants.add(child);
        queue.push(child);
      }
    }
  }

  return descendants;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const PCAlgorithm = {
  runPCAlgorithm,
  pcResultToDAG,
  findAncestors,
  findDescendants
};
