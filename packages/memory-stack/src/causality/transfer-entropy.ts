/**
 * Transfer Entropy Calculator for Causal Discovery
 * Part of 10x Causal Intelligence Transformation
 *
 * Transfer Entropy (TE) measures the amount of information transferred
 * from one time series to another. Unlike correlation (symmetric), TE is
 * DIRECTIONAL - it can distinguish X→Y from Y→X.
 *
 * Formula: TE(X→Y) = H(Y_future | Y_past) - H(Y_future | Y_past, X_past)
 *
 * If knowing X's past reduces uncertainty about Y's future,
 * then X is transferring information (causally) to Y.
 *
 * This is a key differentiator from Granger causality:
 * - Granger: Linear, tests precedence
 * - Transfer Entropy: Non-linear, measures actual information flow
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TransferEntropyResult {
  source: string;
  target: string;
  te_xy: number;              // Information flow X→Y
  te_yx: number;              // Information flow Y→X
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
  bins: number;                // Number of bins for discretization
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
  bins: 4,                     // Quartile binning
  bootstrapIterations: 100,    // 100 iterations for speed
  significanceThreshold: 0.05, // 5% significance level
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Calculate Transfer Entropy from X to Y
 *
 * @param sourceTimeSeries - X values (potential cause)
 * @param targetTimeSeries - Y values (potential effect)
 * @param lag - Time lag in data points
 * @param bins - Number of bins for discretization
 * @returns Transfer entropy value (bits)
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

  // Discretize time series into bins
  const sourceDiscrete = discretize(sourceTimeSeries, bins);
  const targetDiscrete = discretize(targetTimeSeries, bins);

  // Calculate joint and conditional probabilities
  const n = targetDiscrete.length - lag;

  // Count joint occurrences
  const jointCounts: Map<string, number> = new Map();
  const yPastCounts: Map<string, number> = new Map();
  const yPastXPastCounts: Map<string, number> = new Map();
  const yFutureYPastCounts: Map<string, number> = new Map();

  for (let t = lag; t < targetDiscrete.length; t++) {
    const yFuture = targetDiscrete[t];
    const yPast = targetDiscrete[t - 1];
    const xPast = sourceDiscrete[t - lag];

    // Joint key: yFuture|yPast|xPast
    const jointKey = `${yFuture}|${yPast}|${xPast}`;
    jointCounts.set(jointKey, (jointCounts.get(jointKey) || 0) + 1);

    // yPast marginal
    const yPastKey = `${yPast}`;
    yPastCounts.set(yPastKey, (yPastCounts.get(yPastKey) || 0) + 1);

    // yPast, xPast joint
    const yPastXPastKey = `${yPast}|${xPast}`;
    yPastXPastCounts.set(yPastXPastKey, (yPastXPastCounts.get(yPastXPastKey) || 0) + 1);

    // yFuture, yPast joint
    const yFutureYPastKey = `${yFuture}|${yPast}`;
    yFutureYPastCounts.set(yFutureYPastKey, (yFutureYPastCounts.get(yFutureYPastKey) || 0) + 1);
  }

  // Calculate transfer entropy using joint and conditional probabilities
  // TE(X→Y) = Σ p(yFuture, yPast, xPast) * log2(p(yFuture|yPast,xPast) / p(yFuture|yPast))
  let te = 0;

  for (const [jointKey, count] of jointCounts) {
    const [yFuture, yPast, xPast] = jointKey.split('|');

    const pJoint = count / n;
    const pYPastXPast = (yPastXPastCounts.get(`${yPast}|${xPast}`) || 0) / n;
    const pYPast = (yPastCounts.get(yPast) || 0) / n;
    const pYFutureYPast = (yFutureYPastCounts.get(`${yFuture}|${yPast}`) || 0) / n;

    if (pJoint > 0 && pYPastXPast > 0 && pYPast > 0 && pYFutureYPast > 0) {
      // p(yFuture|yPast,xPast) = p(yFuture,yPast,xPast) / p(yPast,xPast)
      const pCondXY = pJoint / pYPastXPast;

      // p(yFuture|yPast) = p(yFuture,yPast) / p(yPast)
      const pCondY = pYFutureYPast / pYPast;

      if (pCondXY > 0 && pCondY > 0) {
        te += pJoint * Math.log2(pCondXY / pCondY);
      }
    }
  }

  return Math.max(0, te); // TE is non-negative
}

/**
 * Calculate bidirectional Transfer Entropy with optimal lag detection
 */
export function calculateBidirectionalTE(
  sourceTimeSeries: number[],
  targetTimeSeries: number[],
  config: TransferEntropyConfig = DEFAULT_TE_CONFIG
): TransferEntropyResult {
  const { maxLag, bins, bootstrapIterations, significanceThreshold } = config;

  // Find optimal lag for X→Y
  let bestLagXY = 1;
  let maxTExy = 0;

  for (let lag = 1; lag <= maxLag; lag++) {
    try {
      const te = calculateTransferEntropy(sourceTimeSeries, targetTimeSeries, lag, bins);
      if (te > maxTExy) {
        maxTExy = te;
        bestLagXY = lag;
      }
    } catch {
      // Skip invalid lags
    }
  }

  // Find optimal lag for Y→X
  let bestLagYX = 1;
  let maxTEyx = 0;

  for (let lag = 1; lag <= maxLag; lag++) {
    try {
      const te = calculateTransferEntropy(targetTimeSeries, sourceTimeSeries, lag, bins);
      if (te > maxTEyx) {
        maxTEyx = te;
        bestLagYX = lag;
      }
    } catch {
      // Skip invalid lags
    }
  }

  // Bootstrap significance test for X→Y
  const bootstrapTExy: number[] = [];
  for (let i = 0; i < bootstrapIterations; i++) {
    const shuffledSource = shuffle([...sourceTimeSeries]);
    try {
      bootstrapTExy.push(calculateTransferEntropy(shuffledSource, targetTimeSeries, bestLagXY, bins));
    } catch {
      // Skip failed iterations
    }
  }

  // Calculate p-value (proportion of bootstrap >= observed)
  const significanceXY = bootstrapTExy.length > 0
    ? bootstrapTExy.filter(te => te >= maxTExy).length / bootstrapTExy.length
    : 1;

  // Net information flow
  const netFlow = maxTExy - maxTEyx;

  // Determine causal direction
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

  // Determine strength
  let strength: TransferEntropyResult['strength'];
  const absNetFlow = Math.abs(netFlow);
  if (absNetFlow > 0.1) {
    strength = 'strong';
  } else if (absNetFlow > 0.03) {
    strength = 'moderate';
  } else {
    strength = 'weak';
  }

  // Calculate confidence interval using bootstrap
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
 * Discover all pairwise causal relationships from domain time series
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
        console.warn(`Failed to calculate TE for ${domains[i]} → ${domains[j]}:`, error);
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
 * Generate natural language hypothesis for a discovered relationship
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
 * Discretize continuous values into bins using quantiles
 */
function discretize(values: number[], bins: number): number[] {
  // Calculate quantile thresholds
  const sorted = [...values].sort((a, b) => a - b);
  const thresholds: number[] = [];

  for (let i = 1; i < bins; i++) {
    const idx = Math.floor((i / bins) * sorted.length);
    thresholds.push(sorted[idx]);
  }

  // Assign each value to a bin
  return values.map(v => {
    for (let i = 0; i < thresholds.length; i++) {
      if (v <= thresholds[i]) return i;
    }
    return bins - 1;
  });
}

/**
 * Fisher-Yates shuffle for bootstrap
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ============================================================================
// EXPORT TYPES FOR HOOKS
// ============================================================================

export type { TransferEntropyConfig, PairwiseDiscoveryResult };
