/**
 * Transfer Entropy Calculator for Causal Discovery
 * Part of 10x Causal Intelligence Transformation
 *
 * Transfer Entropy (TE) measures the amount of information transferred
 * from one time series to another. Unlike correlation (symmetric), TE is
 * DIRECTIONAL - it can distinguish X->Y from Y->X.
 *
 * Formula: TE(X->Y) = H(Y_future | Y_past) - H(Y_future | Y_past, X_past)
 *
 * If knowing X's past reduces uncertainty about Y's future,
 * then X is transferring information (causally) to Y.
 *
 * Implementation uses KSG (Kraskov-Stoegbauer-Grassberger) Algorithm 1
 * for continuous estimation via k-nearest neighbors in joint embedding
 * space. This avoids the information-destroying discretization of bin-based
 * methods and works directly on continuous values.
 *
 * KSG reference:
 *   Kraskov, Stoegbauer, Grassberger (2004). "Estimating mutual information."
 *   Physical Review E, 69(6), 066138.
 *
 * Fallback: For very short series (< 50 points) the KSG estimator lacks
 * sufficient neighbors and we fall back to an adaptive 16-bin histogram
 * estimator that is more robust at small sample sizes.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TransferEntropyResult {
  source: string;
  target: string;
  te_xy: number;              // Information flow X->Y
  te_yx: number;              // Information flow Y->X
  net_information_flow: number; // te_xy - te_yx (positive = X causes Y)
  significance: number;       // Bootstrap p-value
  dominant_lag: number;       // Optimal time delay (days)
  sample_size: number;        // Number of observations used

  // Interpretation
  causal_direction: 'source_causes_target' | 'target_causes_source' | 'bidirectional' | 'no_relationship';
  strength: 'strong' | 'moderate' | 'weak';

  // Confidence interval
  confidence_interval: {
    lower: number;
    upper: number;
  };
}

export interface TransferEntropyConfig {
  maxLag: number;              // Maximum lag to test (days)
  bins: number;                // Backward-compat alias for kNeighbors
  kNeighbors?: number;         // k for KSG estimator (default 4)
  bootstrapIterations: number; // Iterations for significance testing
  significanceThreshold: number; // p-value threshold
}

export interface PairwiseDiscoveryResult {
  relationships: TransferEntropyResult[];
  metadata: {
    total_pairs_tested: number;
    significant_relationships: number;
    discovery_timestamp: Date;
    config_used: TransferEntropyConfig;
  };
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_TE_CONFIG: TransferEntropyConfig = {
  maxLag: 14,                  // 14 days max
  bins: 4,                     // Backward compat: aliased to kNeighbors
  kNeighbors: 4,               // k=4 is standard in KSG literature
  bootstrapIterations: 100,    // 100 iterations for speed
  significanceThreshold: 0.05, // 5% significance level
};

/**
 * Minimum series length for KSG estimation. Below this threshold we fall
 * back to adaptive histogram binning because the kNN neighbor search
 * becomes unreliable with too few embedding vectors.
 */
const KSG_MIN_SAMPLES = 50;

/**
 * Number of bins for the short-series histogram fallback.
 * 16 bins provides a good resolution/bias tradeoff for N in [20, 50).
 */
const FALLBACK_BINS = 16;

// ============================================================================
// DIGAMMA FUNCTION
// ============================================================================

/**
 * Compute the digamma (psi) function: psi(x) = d/dx ln(Gamma(x)).
 *
 * Uses the asymptotic expansion for x >= 6 and the recurrence relation
 * psi(x) = psi(x+1) - 1/x to shift small arguments upward. Accurate to
 * ~1e-12 for all positive x.
 */
function digamma(x: number): number {
  if (x <= 0) {
    throw new Error('Digamma undefined for non-positive arguments');
  }

  // Shift x upward using recurrence psi(x) = psi(x+1) - 1/x
  let result = 0;
  while (x < 6) {
    result -= 1 / x;
    x += 1;
  }

  // Asymptotic expansion (Abramowitz & Stegun 6.3.18)
  // psi(x) ~ ln(x) - 1/(2x) - 1/(12x^2) + 1/(120x^4) - 1/(252x^6) + ...
  const x2 = x * x;
  const x4 = x2 * x2;
  const x6 = x4 * x2;
  const x8 = x4 * x4;
  const x10 = x8 * x2;
  const x12 = x10 * x2;

  result += Math.log(x)
    - 1 / (2 * x)
    - 1 / (12 * x2)
    + 1 / (120 * x4)
    - 1 / (252 * x6)
    + 1 / (240 * x8)
    - 5 / (660 * x10)
    + 691 / (32760 * x12);

  return result;
}

// ============================================================================
// DISTANCE & NEIGHBOR UTILITIES
// ============================================================================

/**
 * Chebyshev (L-infinity / max-norm) distance between two points.
 * This is the standard distance metric for KSG estimators because the
 * subspace neighbor counts use the max-norm ball defined in joint space.
 */
function chebyshevDistance(a: number[], b: number[]): number {
  let maxDist = 0;
  for (let d = 0; d < a.length; d++) {
    const diff = Math.abs(a[d] - b[d]);
    if (diff > maxDist) maxDist = diff;
  }
  return maxDist;
}

/**
 * Brute-force k-nearest neighbor search in Chebyshev metric.
 *
 * Returns the distance to the k-th nearest neighbor for each point.
 * O(N^2 * D) which is acceptable for N < 5000 typical of time-series TE.
 *
 * @param points - Array of D-dimensional points
 * @param k - Number of neighbors
 * @returns Array of k-th neighbor distances (epsilon_i for each point)
 */
function kthNeighborDistances(points: number[][], k: number): number[] {
  const n = points.length;
  const eps = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    // Collect all distances from point i to other points
    const dists: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      dists.push(chebyshevDistance(points[i], points[j]));
    }

    // Partial sort: find k-th smallest distance
    // Full sort is fine for N < 5000
    dists.sort((a, b) => a - b);
    eps[i] = dists[k - 1]; // k-th neighbor (0-indexed, so index k-1)
  }

  return eps;
}

/**
 * Count the number of points strictly within a Chebyshev ball of given
 * radius around a query point in a subspace projection.
 *
 * @param points - All points (only the specified dimensions are used)
 * @param queryIdx - Index of the query point
 * @param dims - Which dimensions to project onto
 * @param radius - Chebyshev ball radius (strict inequality)
 * @returns Number of points within the ball (excluding query itself)
 */
function countNeighborsInSubspace(
  points: number[][],
  queryIdx: number,
  dims: number[],
  radius: number
): number {
  let count = 0;
  const query = points[queryIdx];

  for (let j = 0; j < points.length; j++) {
    if (j === queryIdx) continue;

    let maxDist = 0;
    for (const d of dims) {
      const diff = Math.abs(query[d] - points[j][d]);
      if (diff > maxDist) maxDist = diff;
    }

    // Strict inequality: < epsilon (KSG convention)
    if (maxDist < radius) {
      count++;
    }
  }

  return count;
}

// ============================================================================
// KSG TRANSFER ENTROPY ESTIMATOR (Algorithm 1)
// ============================================================================

/**
 * Estimate Transfer Entropy TE(X->Y) using KSG Algorithm 1.
 *
 * Constructs the 3D joint embedding space Z = (Y_{t+1}, Y_t, X_{t-lag+1})
 * and estimates TE as a difference of conditional mutual informations
 * using the KSG neighbor-counting approach:
 *
 *   TE(X->Y) = psi(k) - < psi(n_xz + 1) + psi(n_yz + 1) - psi(n_z + 1) >
 *
 * where:
 *   - Z_i = (Y_{t+1}, Y_t, X_{t-lag+1})  — joint space
 *   - xz subspace = (X_{t-lag+1}, Y_t)    — source past + target past
 *   - yz subspace = (Y_{t+1}, Y_t)        — target future + target past
 *   - z  subspace = (Y_t)                 — target past only
 *   - epsilon_i = distance to k-th neighbor in joint Z space
 *   - n_xz, n_yz, n_z = counts in subspace balls of radius epsilon_i
 *
 * @param source - Source time series X (potential cause)
 * @param target - Target time series Y (potential effect)
 * @param lag - Time lag in data points (>= 1)
 * @param k - Number of nearest neighbors for KSG estimator
 * @returns Transfer entropy estimate in nats (natural log base)
 */
function ksgTransferEntropy(
  source: number[],
  target: number[],
  lag: number,
  k: number
): number {
  const n = target.length;
  const effectiveN = n - lag;

  if (effectiveN < k + 2) {
    return 0; // Not enough embedding vectors
  }

  // Build joint embedding vectors:
  //   Z_i = [yFuture, yPast, xPast]
  // where yFuture = target[t], yPast = target[t-1], xPast = source[t-lag]
  // for t = lag ... n-1
  const points: number[][] = [];
  for (let t = lag; t < n; t++) {
    const yFuture = target[t];
    const yPast = target[t - 1];
    const xPast = source[t - lag];
    points.push([yFuture, yPast, xPast]);
  }

  // Normalize each dimension to [0, 1] to avoid scale bias in Chebyshev metric
  const m = points.length;
  const ndim = 3;
  const mins = new Array<number>(ndim).fill(Infinity);
  const maxs = new Array<number>(ndim).fill(-Infinity);

  for (let i = 0; i < m; i++) {
    for (let d = 0; d < ndim; d++) {
      if (points[i][d] < mins[d]) mins[d] = points[i][d];
      if (points[i][d] > maxs[d]) maxs[d] = points[i][d];
    }
  }

  for (let d = 0; d < ndim; d++) {
    const range = maxs[d] - mins[d];
    if (range > 0) {
      for (let i = 0; i < m; i++) {
        points[i][d] = (points[i][d] - mins[d]) / range;
      }
    } else {
      // Constant dimension — add tiny jitter to avoid zero distances
      for (let i = 0; i < m; i++) {
        points[i][d] = 0.5 + (Math.random() - 0.5) * 1e-10;
      }
    }
  }

  // Find k-th neighbor distances in the full 3D joint space
  const epsilons = kthNeighborDistances(points, k);

  // Dimension indices for subspace projections
  // points[i] = [yFuture(0), yPast(1), xPast(2)]
  const xzDims = [2, 1]; // xPast, yPast  — "source past + conditioning"
  const yzDims = [0, 1];  // yFuture, yPast — "target future + conditioning"
  const zDims = [1];       // yPast          — "conditioning only"

  // Accumulate digamma terms
  let sumPsiNxz = 0;
  let sumPsiNyz = 0;
  let sumPsiNz = 0;

  for (let i = 0; i < m; i++) {
    const eps = epsilons[i];

    // Handle degenerate case where eps = 0 (duplicate points)
    if (eps <= 0) {
      // Use digamma(1) = -0.5772... for all subspaces (minimum count = 0 -> psi(1))
      const psi1 = digamma(1);
      sumPsiNxz += psi1;
      sumPsiNyz += psi1;
      sumPsiNz += psi1;
      continue;
    }

    const nxz = countNeighborsInSubspace(points, i, xzDims, eps);
    const nyz = countNeighborsInSubspace(points, i, yzDims, eps);
    const nz = countNeighborsInSubspace(points, i, zDims, eps);

    sumPsiNxz += digamma(nxz + 1);
    sumPsiNyz += digamma(nyz + 1);
    sumPsiNz += digamma(nz + 1);
  }

  // KSG Algorithm 1 formula for Transfer Entropy:
  // TE = psi(k) - (1/m) * sum[ psi(n_xz+1) + psi(n_yz+1) - psi(n_z+1) ]
  const te = digamma(k) - (sumPsiNxz + sumPsiNyz - sumPsiNz) / m;

  // TE is theoretically non-negative; clamp to 0 for finite-sample bias
  return Math.max(0, te);
}

// ============================================================================
// BINNED TRANSFER ENTROPY FALLBACK (for short series < 50 points)
// ============================================================================

/**
 * Discretize continuous values into equal-frequency (quantile) bins.
 *
 * @param values - Continuous time series
 * @param numBins - Number of bins
 * @returns Array of bin indices [0, numBins-1]
 */
function discretize(values: number[], numBins: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const thresholds: number[] = [];

  for (let i = 1; i < numBins; i++) {
    const idx = Math.floor((i / numBins) * sorted.length);
    thresholds.push(sorted[idx]);
  }

  return values.map(v => {
    for (let i = 0; i < thresholds.length; i++) {
      if (v <= thresholds[i]) return i;
    }
    return numBins - 1;
  });
}

/**
 * Binned histogram estimator for Transfer Entropy (fallback for short series).
 *
 * Uses adaptive quantile binning with the specified number of bins and
 * computes TE via joint/conditional probability tables:
 *
 *   TE(X->Y) = sum p(yF, yP, xP) * log( p(yF|yP,xP) / p(yF|yP) )
 *
 * @param source - Source time series X
 * @param target - Target time series Y
 * @param lag - Time lag
 * @param numBins - Number of quantile bins (default: FALLBACK_BINS=16)
 * @returns Transfer entropy estimate in bits (log2)
 */
function binnedTransferEntropy(
  source: number[],
  target: number[],
  lag: number,
  numBins: number = FALLBACK_BINS
): number {
  // Adaptive bin count: never more bins than sqrt(N)
  const effectiveBins = Math.min(numBins, Math.max(2, Math.floor(Math.sqrt(source.length))));

  const sourceDiscrete = discretize(source, effectiveBins);
  const targetDiscrete = discretize(target, effectiveBins);

  const n = targetDiscrete.length - lag;
  if (n < 4) return 0;

  // Joint and marginal count tables
  const jointCounts: Map<string, number> = new Map();
  const yPastCounts: Map<string, number> = new Map();
  const yPastXPastCounts: Map<string, number> = new Map();
  const yFutureYPastCounts: Map<string, number> = new Map();

  for (let t = lag; t < targetDiscrete.length; t++) {
    const yFuture = targetDiscrete[t];
    const yPast = targetDiscrete[t - 1];
    const xPast = sourceDiscrete[t - lag];

    const jointKey = `${yFuture}|${yPast}|${xPast}`;
    jointCounts.set(jointKey, (jointCounts.get(jointKey) || 0) + 1);

    const yPastKey = `${yPast}`;
    yPastCounts.set(yPastKey, (yPastCounts.get(yPastKey) || 0) + 1);

    const yPastXPastKey = `${yPast}|${xPast}`;
    yPastXPastCounts.set(yPastXPastKey, (yPastXPastCounts.get(yPastXPastKey) || 0) + 1);

    const yFutureYPastKey = `${yFuture}|${yPast}`;
    yFutureYPastCounts.set(yFutureYPastKey, (yFutureYPastCounts.get(yFutureYPastKey) || 0) + 1);
  }

  let te = 0;

  for (const [jointKey, count] of jointCounts) {
    const [yFuture, yPast, xPast] = jointKey.split('|');

    const pJoint = count / n;
    const pYPastXPast = (yPastXPastCounts.get(`${yPast}|${xPast}`) || 0) / n;
    const pYPast = (yPastCounts.get(yPast) || 0) / n;
    const pYFutureYPast = (yFutureYPastCounts.get(`${yFuture}|${yPast}`) || 0) / n;

    if (pJoint > 0 && pYPastXPast > 0 && pYPast > 0 && pYFutureYPast > 0) {
      const pCondXY = pJoint / pYPastXPast;
      const pCondY = pYFutureYPast / pYPast;

      if (pCondXY > 0 && pCondY > 0) {
        te += pJoint * Math.log2(pCondXY / pCondY);
      }
    }
  }

  return Math.max(0, te);
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Calculate Transfer Entropy from X to Y.
 *
 * Uses the KSG continuous estimator (Algorithm 1) for series with >= 50
 * points, and falls back to adaptive 16-bin histogram estimation for
 * shorter series where kNN becomes unreliable.
 *
 * The `bins` parameter is retained for backward compatibility but is
 * reinterpreted as `kNeighbors` for the KSG estimator. Callers passing
 * bins=4 (the old quartile default) will get k=4 neighbors (the KSG
 * literature default), so existing call sites work unchanged.
 *
 * @param sourceTimeSeries - X values (potential cause)
 * @param targetTimeSeries - Y values (potential effect)
 * @param lag - Time lag in data points
 * @param bins - k for KSG estimator (backward-compat alias for kNeighbors)
 * @returns Transfer entropy value (nats for KSG, bits for binned fallback)
 */
export function calculateTransferEntropy(
  sourceTimeSeries: number[],
  targetTimeSeries: number[],
  lag: number = 1,
  bins: number = 4
): number {
  // Validate inputs
  if (sourceTimeSeries.length !== targetTimeSeries.length) {
    throw new Error('Time series must have equal length');
  }

  if (sourceTimeSeries.length < lag + 2) {
    throw new Error('Time series too short for given lag');
  }

  const k = Math.max(1, Math.round(bins)); // Interpret bins as kNeighbors

  // Choose estimator based on available data
  if (sourceTimeSeries.length >= KSG_MIN_SAMPLES) {
    return ksgTransferEntropy(sourceTimeSeries, targetTimeSeries, lag, k);
  } else {
    // Fallback: adaptive histogram for very short series
    return binnedTransferEntropy(sourceTimeSeries, targetTimeSeries, lag, FALLBACK_BINS);
  }
}

/**
 * Calculate bidirectional Transfer Entropy with optimal lag detection.
 *
 * Scans all lags from 1 to maxLag for both directions (X->Y and Y->X),
 * selects the lag with highest TE in each direction, then runs a bootstrap
 * significance test by shuffling the source series to destroy temporal
 * structure while preserving marginal distributions.
 *
 * @param sourceTimeSeries - X values (potential cause)
 * @param targetTimeSeries - Y values (potential effect)
 * @param config - Estimation configuration
 * @returns Full bidirectional TE result with significance and interpretation
 */
export function calculateBidirectionalTE(
  sourceTimeSeries: number[],
  targetTimeSeries: number[],
  config: TransferEntropyConfig = DEFAULT_TE_CONFIG
): TransferEntropyResult {
  const {
    maxLag,
    bins,
    kNeighbors,
    bootstrapIterations,
    significanceThreshold,
  } = config;

  // Resolve k: prefer explicit kNeighbors, fall back to bins alias
  const k = kNeighbors ?? bins;

  // --- Find optimal lag for X->Y ---
  let bestLagXY = 1;
  let maxTExy = 0;

  for (let lag = 1; lag <= maxLag; lag++) {
    try {
      const te = calculateTransferEntropy(sourceTimeSeries, targetTimeSeries, lag, k);
      if (te > maxTExy) {
        maxTExy = te;
        bestLagXY = lag;
      }
    } catch {
      // Skip invalid lags
    }
  }

  // --- Find optimal lag for Y->X ---
  let bestLagYX = 1;
  let maxTEyx = 0;

  for (let lag = 1; lag <= maxLag; lag++) {
    try {
      const te = calculateTransferEntropy(targetTimeSeries, sourceTimeSeries, lag, k);
      if (te > maxTEyx) {
        maxTEyx = te;
        bestLagYX = lag;
      }
    } catch {
      // Skip invalid lags
    }
  }

  // --- Bootstrap significance test for X->Y ---
  const bootstrapTExy: number[] = [];
  for (let i = 0; i < bootstrapIterations; i++) {
    const shuffledSource = shuffle([...sourceTimeSeries]);
    try {
      bootstrapTExy.push(
        calculateTransferEntropy(shuffledSource, targetTimeSeries, bestLagXY, k)
      );
    } catch {
      // Skip failed iterations
    }
  }

  // p-value: proportion of bootstrap TE values >= observed TE
  const significanceXY = bootstrapTExy.length > 0
    ? bootstrapTExy.filter(te => te >= maxTExy).length / bootstrapTExy.length
    : 1;

  // --- Net information flow ---
  const netFlow = maxTExy - maxTEyx;

  // --- Determine causal direction ---
  let causalDirection: TransferEntropyResult['causal_direction'];
  if (significanceXY > significanceThreshold) {
    causalDirection = 'no_relationship';
  } else if (Math.abs(netFlow) < 0.01) {
    causalDirection = 'bidirectional';
  } else if (netFlow > 0) {
    causalDirection = 'source_causes_target';
  } else {
    causalDirection = 'target_causes_source';
  }

  // --- Determine strength ---
  let strength: TransferEntropyResult['strength'];
  const absNetFlow = Math.abs(netFlow);
  if (absNetFlow > 0.1) {
    strength = 'strong';
  } else if (absNetFlow > 0.03) {
    strength = 'moderate';
  } else {
    strength = 'weak';
  }

  // --- Confidence interval from bootstrap distribution ---
  const sortedBootstrap = [...bootstrapTExy].sort((a, b) => a - b);
  const lowerIdx = Math.floor(sortedBootstrap.length * 0.025);
  const upperIdx = Math.floor(sortedBootstrap.length * 0.975);

  return {
    source: '',  // To be filled by caller
    target: '',  // To be filled by caller
    te_xy: maxTExy,
    te_yx: maxTEyx,
    net_information_flow: netFlow,
    significance: significanceXY,
    dominant_lag: netFlow >= 0 ? bestLagXY : bestLagYX,
    sample_size: sourceTimeSeries.length,
    causal_direction: causalDirection,
    strength: strength,
    confidence_interval: {
      lower: sortedBootstrap[lowerIdx] || 0,
      upper: sortedBootstrap[upperIdx] || maxTExy * 1.5,
    },
  };
}

/**
 * Discover all pairwise causal relationships from domain time series.
 *
 * Tests all unique pairs (i, j) with i < j and computes bidirectional TE
 * for each. Results are sorted by absolute net information flow so the
 * strongest causal links appear first.
 *
 * @param domainTimeSeries - Map of domain name to time series values
 * @param config - Estimation configuration
 * @returns Discovery result with all relationships and summary metadata
 */
export function discoverAllPairwiseRelationships(
  domainTimeSeries: Map<string, number[]>,
  config: TransferEntropyConfig = DEFAULT_TE_CONFIG
): PairwiseDiscoveryResult {
  const domains = Array.from(domainTimeSeries.keys());
  const relationships: TransferEntropyResult[] = [];
  let totalPairs = 0;
  let significantCount = 0;

  // Test all pairs
  for (let i = 0; i < domains.length; i++) {
    for (let j = i + 1; j < domains.length; j++) {
      const sourceData = domainTimeSeries.get(domains[i]);
      const targetData = domainTimeSeries.get(domains[j]);

      if (!sourceData || !targetData) continue;
      if (sourceData.length < config.maxLag + 5) continue; // Need enough data

      totalPairs++;

      try {
        const result = calculateBidirectionalTE(sourceData, targetData, config);
        result.source = domains[i];
        result.target = domains[j];

        if (result.significance <= config.significanceThreshold) {
          significantCount++;
        }

        relationships.push(result);
      } catch (error) {
        console.warn(`Failed to calculate TE for ${domains[i]} -> ${domains[j]}:`, error);
      }
    }
  }

  return {
    relationships: relationships.sort((a, b) =>
      Math.abs(b.net_information_flow) - Math.abs(a.net_information_flow)
    ),
    metadata: {
      total_pairs_tested: totalPairs,
      significant_relationships: significantCount,
      discovery_timestamp: new Date(),
      config_used: config,
    },
  };
}

/**
 * Generate natural language hypothesis for a discovered relationship.
 *
 * Translates the numeric TE result into a human-readable sentence
 * describing the causal direction, strength, and time lag.
 *
 * @param result - A TransferEntropyResult from bidirectional analysis
 * @returns Natural language hypothesis string
 */
export function generateHypothesis(result: TransferEntropyResult): string {
  const { source, target, causal_direction, strength, dominant_lag } = result;

  if (causal_direction === 'no_relationship') {
    return `No significant causal relationship detected between ${source} and ${target}.`;
  }

  const sourceName = source.charAt(0).toUpperCase() + source.slice(1);
  const targetName = target.charAt(0).toUpperCase() + target.slice(1);

  const strengthWord = strength === 'strong' ? 'strongly' : strength === 'moderate' ? 'moderately' : 'weakly';
  const lagText = dominant_lag > 1 ? `with a ${dominant_lag}-day lag` : 'within a day';

  if (causal_direction === 'source_causes_target') {
    return `${sourceName} changes ${strengthWord} predict ${targetName} changes ${lagText}.`;
  } else if (causal_direction === 'target_causes_source') {
    return `${targetName} changes ${strengthWord} predict ${sourceName} changes ${lagText}.`;
  } else {
    return `${sourceName} and ${targetName} have a bidirectional causal relationship ${lagText}.`;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fisher-Yates shuffle for bootstrap significance testing.
 * Destroys temporal structure while preserving the marginal distribution.
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
