/**
 * Pattern Detector
 * 
 * Discovers patterns in organizational data using:
 * - Association rule mining (Apriori-style)
 * - K-means clustering
 * - Statistical significance testing
 * 
 * Patterns are only registered if they pass significance thresholds.
 * 
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A discovered pattern with statistical evidence
 */
export interface DiscoveredPattern {
  /** Unique pattern identifier */
  id: string;
  /** Human-readable pattern name */
  name: string;
  /** Pattern description */
  description: string;
  /** Domains involved in this pattern */
  domainsInvolved: string[];
  /** Statistical evidence */
  evidence: PatternEvidence;
  /** Natural language explanation */
  naturalLanguage: string;
  /** Whether this pattern is novel (not previously known) */
  isNovel: boolean;
  /** Whether the pattern is statistically significant */
  isSignificant: boolean;
  /** When the pattern was first discovered */
  discoveredAt: Date;
  /** How many times the pattern has been confirmed */
  confirmationCount: number;
}

/**
 * Statistical evidence for a pattern
 */
export interface PatternEvidence {
  /** Type of statistical test used */
  testType: 'chi-squared' | 'fisher-exact' | 't-test' | 'correlation';
  /** Test statistic value */
  testStatistic: number;
  /** p-value (lower = more significant) */
  pValue: number;
  /** Effect size (Cohen's d, odds ratio, etc.) */
  effectSize: number;
  /** Effect size confidence interval */
  effectSizeCI: [number, number];
  /** Sample size */
  sampleSize: number;
  /** Whether pattern survives multiple testing correction */
  survivesCorrection: boolean;
  /** Corrected p-value after Bonferroni */
  correctedPValue?: number;
}

/**
 * An association rule (antecedent -> consequent)
 */
export interface AssociationRule {
  /** Conditions that precede the outcome */
  antecedent: string[];
  /** Outcome when conditions are met */
  consequent: string[];
  /** How often the rule appears */
  support: number;
  /** P(consequent | antecedent) */
  confidence: number;
  /** Lift: how much more likely than random */
  lift: number;
}

/**
 * Entity cluster result
 */
export interface EntityCluster {
  /** Cluster identifier */
  clusterId: number;
  /** Centroid feature values */
  centroid: number[];
  /** Entity IDs in this cluster */
  entityIds: string[];
  /** Cluster size */
  size: number;
  /** Variance within cluster */
  intraClusterVariance: number;
  /** Distinctive features of this cluster */
  distinctiveFeatures: Array<{
    feature: string;
    meanValue: number;
    zscore: number;
  }>;
}

/**
 * Feature vector for an entity
 */
export interface EntityFeatures {
  entityId: string;
  entityType: string;
  features: Record<string, number>;
}

// ============================================================================
// ASSOCIATION RULE MINING
// ============================================================================

/**
 * Mines association rules from transaction data
 * 
 * Uses Apriori-style algorithm to find frequent itemsets
 * and generate rules with high confidence and lift.
 * 
 * @example
 * ```ts
 * const transactions = [
 *   ['late_payment', 'support_escalation', 'churn'],
 *   ['late_payment', 'usage_decline', 'churn'],
 *   ['high_usage', 'expansion'],
 * ];
 * 
 * const rules = mineAssociationRules(transactions, {
 *   minSupport: 0.1,
 *   minConfidence: 0.6,
 *   minLift: 1.5,
 * });
 * ```
 */
export function mineAssociationRules(
  transactions: string[][],
  config: {
    minSupport: number;
    minConfidence: number;
    minLift: number;
    maxAntecedentSize?: number;
  }
): AssociationRule[] {
  const { minSupport, minConfidence, minLift, maxAntecedentSize = 3 } = config;
  const n = transactions.length;
  
  if (n === 0) return [];
  
  // Count item frequencies
  const itemCounts = new Map<string, number>();
  for (const tx of transactions) {
    for (const item of tx) {
      itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
    }
  }
  
  // Get frequent 1-itemsets
  const frequentItems = Array.from(itemCounts.entries())
    .filter(([_, count]) => count / n >= minSupport)
    .map(([item, _]) => item);
  
  // Generate frequent itemsets (simplified - up to size 3)
  const frequentItemsets = new Map<string, number>();
  
  // 1-itemsets
  for (const item of frequentItems) {
    frequentItemsets.set(item, itemCounts.get(item)!);
  }
  
  // 2-itemsets
  for (let i = 0; i < frequentItems.length; i++) {
    for (let j = i + 1; j < frequentItems.length; j++) {
      const pair = [frequentItems[i], frequentItems[j]].sort().join(',');
      let count = 0;
      for (const tx of transactions) {
        if (tx.includes(frequentItems[i]) && tx.includes(frequentItems[j])) {
          count++;
        }
      }
      if (count / n >= minSupport) {
        frequentItemsets.set(pair, count);
      }
    }
  }
  
  // 3-itemsets (if allowed)
  if (maxAntecedentSize >= 2) {
    for (let i = 0; i < frequentItems.length; i++) {
      for (let j = i + 1; j < frequentItems.length; j++) {
        for (let k = j + 1; k < frequentItems.length; k++) {
          const triple = [frequentItems[i], frequentItems[j], frequentItems[k]].sort().join(',');
          let count = 0;
          for (const tx of transactions) {
            if (tx.includes(frequentItems[i]) && 
                tx.includes(frequentItems[j]) && 
                tx.includes(frequentItems[k])) {
              count++;
            }
          }
          if (count / n >= minSupport) {
            frequentItemsets.set(triple, count);
          }
        }
      }
    }
  }
  
  // Generate rules
  const rules: AssociationRule[] = [];
  
  for (const [itemset, count] of frequentItemsets.entries()) {
    const items = itemset.split(',');
    if (items.length < 2) continue;
    
    // Try each item as consequent
    for (const consequent of items) {
      const antecedent = items.filter(i => i !== consequent);
      const antecedentKey = antecedent.sort().join(',');
      const antecedentCount = frequentItemsets.get(antecedentKey) || 0;
      
      if (antecedentCount === 0) continue;
      
      const support = count / n;
      const confidence = count / antecedentCount;
      const consequentSupport = (itemCounts.get(consequent) || 0) / n;
      const lift = confidence / consequentSupport;
      
      if (confidence >= minConfidence && lift >= minLift) {
        rules.push({
          antecedent,
          consequent: [consequent],
          support,
          confidence,
          lift,
        });
      }
    }
  }
  
  // Sort by lift descending
  return rules.sort((a, b) => b.lift - a.lift);
}

// ============================================================================
// K-MEANS CLUSTERING
// ============================================================================

/**
 * Clusters entities using K-means algorithm
 * 
 * @param entities - Entities with feature vectors
 * @param k - Number of clusters
 * @param maxIterations - Maximum iterations (default 100)
 */
export function clusterEntities(
  entities: EntityFeatures[],
  k: number,
  maxIterations: number = 100
): EntityCluster[] {
  if (entities.length === 0 || k <= 0) return [];
  
  // Get all feature names
  const featureNames = new Set<string>();
  for (const e of entities) {
    for (const f of Object.keys(e.features)) {
      featureNames.add(f);
    }
  }
  const features = Array.from(featureNames);
  
  // Convert to numeric vectors
  const vectors = entities.map(e => 
    features.map(f => e.features[f] || 0)
  );
  
  // Normalize vectors
  const normalized = normalizeVectors(vectors);
  
  // Initialize centroids using k-means++
  const centroids = initializeCentroids(normalized, k);
  
  // Iterate
  let assignments = new Array(entities.length).fill(0);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign points to nearest centroid
    const newAssignments = normalized.map(v => 
      findNearestCentroid(v, centroids)
    );
    
    // Check for convergence
    if (arraysEqual(assignments, newAssignments)) break;
    assignments = newAssignments;
    
    // Update centroids
    for (let c = 0; c < k; c++) {
      const clusterPoints = normalized.filter((_, i) => assignments[i] === c);
      if (clusterPoints.length > 0) {
        centroids[c] = computeCentroid(clusterPoints);
      }
    }
  }
  
  // Build cluster results
  const clusters: EntityCluster[] = [];
  
  for (let c = 0; c < k; c++) {
    const indices = assignments
      .map((a, i) => a === c ? i : -1)
      .filter(i => i >= 0);
    
    if (indices.length === 0) continue;
    
    const clusterVectors = indices.map(i => normalized[i]);
    const variance = computeVariance(clusterVectors, centroids[c]);
    
    // Find distinctive features
    const distinctiveFeatures = features.map((f, fi) => {
      const clusterMean = clusterVectors.reduce((sum, v) => sum + v[fi], 0) / clusterVectors.length;
      const globalMean = normalized.reduce((sum, v) => sum + v[fi], 0) / normalized.length;
      const globalStd = Math.sqrt(
        normalized.reduce((sum, v) => sum + Math.pow(v[fi] - globalMean, 2), 0) / normalized.length
      );
      
      return {
        feature: f,
        meanValue: clusterMean,
        zscore: globalStd > 0 ? (clusterMean - globalMean) / globalStd : 0,
      };
    })
    .filter(d => Math.abs(d.zscore) > 1)
    .sort((a, b) => Math.abs(b.zscore) - Math.abs(a.zscore))
    .slice(0, 5);
    
    clusters.push({
      clusterId: c,
      centroid: centroids[c],
      entityIds: indices.map(i => entities[i].entityId),
      size: indices.length,
      intraClusterVariance: variance,
      distinctiveFeatures,
    });
  }
  
  return clusters;
}

// Helper functions for clustering
function normalizeVectors(vectors: number[][]): number[][] {
  if (vectors.length === 0) return [];
  const dims = vectors[0].length;
  
  const means: number[] = [];
  const stds: number[] = [];
  
  for (let d = 0; d < dims; d++) {
    const values = vectors.map(v => v[d]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    means.push(mean);
    stds.push(Math.sqrt(variance) || 1);
  }
  
  return vectors.map(v => 
    v.map((val, d) => (val - means[d]) / stds[d])
  );
}

function initializeCentroids(vectors: number[][], k: number): number[][] {
  const centroids: number[][] = [];
  const n = vectors.length;
  
  // First centroid: random
  centroids.push([...vectors[Math.floor(Math.random() * n)]]);
  
  // Remaining centroids: k-means++
  while (centroids.length < k) {
    const distances = vectors.map(v => {
      const minDist = Math.min(...centroids.map(c => euclideanDistance(v, c)));
      return minDist * minDist;
    });
    
    const totalDist = distances.reduce((a, b) => a + b, 0);
    let threshold = Math.random() * totalDist;
    
    for (let i = 0; i < n; i++) {
      threshold -= distances[i];
      if (threshold <= 0) {
        centroids.push([...vectors[i]]);
        break;
      }
    }
  }
  
  return centroids;
}

function findNearestCentroid(point: number[], centroids: number[][]): number {
  let minDist = Infinity;
  let nearest = 0;
  
  for (let i = 0; i < centroids.length; i++) {
    const dist = euclideanDistance(point, centroids[i]);
    if (dist < minDist) {
      minDist = dist;
      nearest = i;
    }
  }
  
  return nearest;
}

function computeCentroid(points: number[][]): number[] {
  const dims = points[0].length;
  const centroid = new Array(dims).fill(0);
  
  for (const p of points) {
    for (let d = 0; d < dims; d++) {
      centroid[d] += p[d];
    }
  }
  
  return centroid.map(c => c / points.length);
}

function computeVariance(points: number[][], centroid: number[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => 
    sum + Math.pow(euclideanDistance(p, centroid), 2), 0
  ) / points.length;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ============================================================================
// PATTERN VALIDATION
// ============================================================================

/**
 * Validates a potential pattern using statistical significance testing
 */
export function validatePattern(
  observedCount: number,
  expectedCount: number,
  totalObservations: number,
  numTests: number = 1
): PatternEvidence {
  // Chi-squared test for observed vs expected
  const chiSquared = Math.pow(observedCount - expectedCount, 2) / expectedCount;
  
  // p-value from chi-squared distribution with df=1
  const pValue = 1 - chiSquaredCDF(chiSquared, 1);
  
  // Bonferroni correction
  const correctedPValue = Math.min(1, pValue * numTests);
  
  // Effect size (odds ratio approximation)
  const observedRate = observedCount / totalObservations;
  const expectedRate = expectedCount / totalObservations;
  const effectSize = expectedRate > 0 ? observedRate / expectedRate : 0;
  
  // Simple CI for effect size
  const se = Math.sqrt(1/observedCount + 1/expectedCount);
  const ci: [number, number] = [
    effectSize * Math.exp(-1.96 * se),
    effectSize * Math.exp(1.96 * se),
  ];
  
  return {
    testType: 'chi-squared',
    testStatistic: chiSquared,
    pValue,
    effectSize,
    effectSizeCI: ci,
    sampleSize: totalObservations,
    survivesCorrection: correctedPValue < 0.05,
    correctedPValue,
  };
}

/**
 * Chi-squared CDF approximation
 */
function chiSquaredCDF(x: number, df: number): number {
  if (x < 0) return 0;
  
  // Use gamma function for general case
  const k = df / 2;
  const y = x / 2;
  
  // Incomplete gamma function approximation
  return incompleteGamma(k, y) / gamma(k);
}

function gamma(n: number): number {
  // Lanczos approximation
  if (n < 0.5) {
    return Math.PI / (Math.sin(Math.PI * n) * gamma(1 - n));
  }
  n -= 1;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (n + i);
  }
  const t = n + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
}

function incompleteGamma(a: number, x: number): number {
  // Series expansion for lower incomplete gamma
  let sum = 0;
  let term = 1 / a;
  sum = term;
  
  for (let n = 1; n < 100; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < 1e-10) break;
  }
  
  return Math.pow(x, a) * Math.exp(-x) * sum;
}

// ============================================================================
// PATTERN REGISTRATION
// ============================================================================

/**
 * Registers a validated pattern for storage
 */
export function registerPattern(
  name: string,
  description: string,
  domainsInvolved: string[],
  evidence: PatternEvidence
): DiscoveredPattern {
  const id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Generate natural language explanation
  const effectDirection = evidence.effectSize > 1 ? 'more likely' : 'less likely';
  const effectMagnitude = Math.abs(evidence.effectSize - 1) * 100;
  
  const isSignificant = evidence.pValue < 0.05;
  const naturalLanguage = isSignificant
    ? `${name}: ${effectMagnitude.toFixed(0)}% ${effectDirection} than expected (p=${evidence.pValue.toFixed(4)}, n=${evidence.sampleSize})`
    : `${name}: Not statistically significant (p=${evidence.pValue.toFixed(4)})`;
  
  return {
    id,
    name,
    description,
    domainsInvolved,
    evidence,
    naturalLanguage,
    isNovel: true,
    isSignificant: evidence.pValue < 0.05 && evidence.survivesCorrection,
    discoveredAt: new Date(),
    confirmationCount: 1,
  };
}

// ============================================================================
// SEQUENTIAL PATTERN MINING
// ============================================================================

/**
 * A sequential pattern — ordered sequence of events with temporal gaps.
 *
 * Unlike association rules (unordered co-occurrence), sequential patterns
 * capture ORDER: "A happens, then B, then C".
 */
export interface SequentialPattern {
  /** Ordered sequence of events */
  sequence: string[];
  /** How often this sequence appears */
  support: number;
  /** Average time gaps between steps (in same units as input) */
  avgGaps: number[];
  /** Minimum and maximum observed gaps between steps */
  gapRanges: Array<{ min: number; max: number }>;
  /** How many entities/sessions exhibited this sequence */
  instanceCount: number;
}

/**
 * A temporal event — an event with a timestamp.
 */
export interface TemporalEvent {
  /** Event type / label */
  event: string;
  /** Timestamp (numeric — could be epoch ms, day index, etc.) */
  timestamp: number;
  /** Entity or session this event belongs to */
  entityId: string;
}

/**
 * Mine sequential patterns from time-ordered events.
 *
 * Groups events by entity/session, sorts by time, then finds
 * frequent ordered subsequences using a PrefixSpan-inspired approach.
 *
 * @example
 * ```ts
 * const events: TemporalEvent[] = [
 *   { event: 'deployment', timestamp: 1, entityId: 'sprint_1' },
 *   { event: 'bug_report', timestamp: 3, entityId: 'sprint_1' },
 *   { event: 'support_escalation', timestamp: 5, entityId: 'sprint_1' },
 *   { event: 'deployment', timestamp: 10, entityId: 'sprint_2' },
 *   { event: 'bug_report', timestamp: 12, entityId: 'sprint_2' },
 *   { event: 'support_escalation', timestamp: 15, entityId: 'sprint_2' },
 * ];
 *
 * const patterns = mineSequentialPatterns(events, {
 *   minSupport: 0.3,
 *   maxGap: 10,
 *   maxLength: 4,
 * });
 * // => [{ sequence: ['deployment', 'bug_report', 'support_escalation'], support: 1.0, ... }]
 * ```
 */
export function mineSequentialPatterns(
  events: TemporalEvent[],
  config: {
    /** Minimum support (0-1) */
    minSupport?: number;
    /** Maximum time gap between consecutive events in a pattern */
    maxGap?: number;
    /** Maximum sequence length */
    maxLength?: number;
  } = {}
): SequentialPattern[] {
  const { minSupport = 0.1, maxGap = Infinity, maxLength = 5 } = config;

  // Group events by entity, sort by time
  const entitySequences = new Map<string, TemporalEvent[]>();
  for (const e of events) {
    const seq = entitySequences.get(e.entityId) || [];
    seq.push(e);
    entitySequences.set(e.entityId, seq);
  }
  for (const seq of entitySequences.values()) {
    seq.sort((a, b) => a.timestamp - b.timestamp);
  }

  const totalEntities = entitySequences.size;
  if (totalEntities === 0) return [];
  const minCount = Math.max(1, Math.ceil(totalEntities * minSupport));

  // Count frequent 1-sequences
  const eventCounts = new Map<string, number>();
  for (const seq of entitySequences.values()) {
    const seen = new Set<string>();
    for (const e of seq) {
      if (!seen.has(e.event)) {
        eventCounts.set(e.event, (eventCounts.get(e.event) || 0) + 1);
        seen.add(e.event);
      }
    }
  }

  const frequentItems = Array.from(eventCounts.entries())
    .filter(([_, count]) => count >= minCount)
    .map(([event]) => event);

  // Build patterns using depth-first search (PrefixSpan-style)
  const patterns: SequentialPattern[] = [];
  const seqArrays = Array.from(entitySequences.values());

  function extend(
    prefix: string[],
    prefixInstances: Array<{ entityIdx: number; lastPos: number; timestamps: number[] }>
  ): void {
    if (prefix.length >= maxLength) return;

    // For each possible next event
    const nextCandidates = new Map<string, Array<{ entityIdx: number; lastPos: number; timestamps: number[] }>>();

    for (const inst of prefixInstances) {
      const seq = seqArrays[inst.entityIdx];
      const seenEvents = new Set<string>(); // One match per entity per extension

      for (let j = inst.lastPos + 1; j < seq.length; j++) {
        const e = seq[j];
        // Check gap constraint
        if (maxGap < Infinity && e.timestamp - seq[inst.lastPos].timestamp > maxGap) break;

        if (frequentItems.includes(e.event) && !seenEvents.has(e.event)) {
          seenEvents.add(e.event);
          const instances = nextCandidates.get(e.event) || [];
          instances.push({
            entityIdx: inst.entityIdx,
            lastPos: j,
            timestamps: [...inst.timestamps, e.timestamp],
          });
          nextCandidates.set(e.event, instances);
        }
      }
    }

    // Check which extensions are frequent
    for (const [event, instances] of nextCandidates) {
      // Count distinct entities
      const entitySet = new Set(instances.map(i => i.entityIdx));
      if (entitySet.size < minCount) continue;

      const newPrefix = [...prefix, event];
      const support = entitySet.size / totalEntities;

      // Compute gap statistics
      const avgGaps: number[] = [];
      const gapRanges: Array<{ min: number; max: number }> = [];

      for (let g = 0; g < newPrefix.length - 1; g++) {
        const gaps: number[] = [];
        for (const inst of instances) {
          if (inst.timestamps.length > g + 1) {
            gaps.push(inst.timestamps[g + 1] - inst.timestamps[g]);
          }
        }
        if (gaps.length > 0) {
          avgGaps.push(gaps.reduce((a, b) => a + b, 0) / gaps.length);
          gapRanges.push({ min: Math.min(...gaps), max: Math.max(...gaps) });
        }
      }

      patterns.push({
        sequence: newPrefix,
        support,
        avgGaps,
        gapRanges,
        instanceCount: entitySet.size,
      });

      // Recurse
      extend(newPrefix, instances);
    }
  }

  // Start with each frequent item as a prefix
  for (const item of frequentItems) {
    const instances: Array<{ entityIdx: number; lastPos: number; timestamps: number[] }> = [];

    for (let si = 0; si < seqArrays.length; si++) {
      const seq = seqArrays[si];
      for (let j = 0; j < seq.length; j++) {
        if (seq[j].event === item) {
          instances.push({ entityIdx: si, lastPos: j, timestamps: [seq[j].timestamp] });
          break; // First occurrence per entity
        }
      }
    }

    if (instances.length >= minCount) {
      patterns.push({
        sequence: [item],
        support: instances.length / totalEntities,
        avgGaps: [],
        gapRanges: [],
        instanceCount: instances.length,
      });
      extend([item], instances);
    }
  }

  // Sort by support and length (prefer longer, more specific patterns)
  return patterns
    .filter(p => p.sequence.length >= 2) // Only multi-step patterns
    .sort((a, b) => {
      if (b.sequence.length !== a.sequence.length) return b.sequence.length - a.sequence.length;
      return b.support - a.support;
    });
}

/**
 * Convert sequential patterns to DiscoveredPattern format for integration
 * with the rest of the learning pipeline.
 */
export function sequentialPatternsToDiscovered(
  seqPatterns: SequentialPattern[],
  totalObservations: number
): DiscoveredPattern[] {
  return seqPatterns.map(sp => {
    const observedCount = sp.instanceCount;
    // Expected by chance: product of individual probabilities × total
    const expectedCount = Math.max(1, Math.round(totalObservations * Math.pow(sp.support, sp.sequence.length)));

    const evidence = validatePattern(
      observedCount,
      expectedCount,
      totalObservations,
      seqPatterns.length
    );

    const gapDesc = sp.avgGaps.length > 0
      ? ` (avg gaps: ${sp.avgGaps.map(g => g.toFixed(1)).join(' → ')})`
      : '';

    return registerPattern(
      sp.sequence.join(' → '),
      `Sequential pattern: ${sp.sequence.join(' then ')} observed in ${(sp.support * 100).toFixed(0)}% of entities${gapDesc}`,
      [...new Set(sp.sequence)],
      evidence
    );
  });
}

// ============================================================================
// TEMPORAL ASSOCIATION RULES
// ============================================================================

/**
 * A temporal association rule — like association rules but with time ordering.
 * "When A occurs, B follows within N time units"
 */
export interface TemporalAssociationRule extends AssociationRule {
  /** Average time lag from antecedent to consequent */
  avgLag: number;
  /** Standard deviation of time lag */
  lagStdDev: number;
  /** Temporal direction: 'forward' (A before B) or 'bidirectional' */
  direction: 'forward' | 'bidirectional';
}

/**
 * Mine temporal association rules from timestamped events.
 *
 * Unlike regular association rules, these capture temporal ordering:
 * "A → B within T time units" vs "A and B co-occur"
 *
 * This bridges the gap between plain association rules and full
 * causal discovery — useful for moderate-confidence "tends to precede".
 */
export function mineTemporalAssociationRules(
  events: TemporalEvent[],
  config: {
    /** Maximum time window to consider events as related */
    maxWindow?: number;
    /** Minimum support */
    minSupport?: number;
    /** Minimum confidence */
    minConfidence?: number;
    /** Minimum lift */
    minLift?: number;
  } = {}
): TemporalAssociationRule[] {
  const {
    maxWindow = Infinity,
    minSupport = 0.1,
    minConfidence = 0.5,
    minLift = 1.2,
  } = config;

  // Group by entity
  const entitySequences = new Map<string, TemporalEvent[]>();
  for (const e of events) {
    const seq = entitySequences.get(e.entityId) || [];
    seq.push(e);
    entitySequences.set(e.entityId, seq);
  }
  for (const seq of entitySequences.values()) {
    seq.sort((a, b) => a.timestamp - b.timestamp);
  }

  const totalEntities = entitySequences.size;
  if (totalEntities < 2) return [];

  // Count all ordered pairs (A before B within window)
  const pairCounts = new Map<string, { count: number; lags: number[] }>();
  const eventEntityCounts = new Map<string, number>();

  for (const seq of entitySequences.values()) {
    const seen = new Set<string>();
    for (const e of seq) {
      if (!seen.has(e.event)) {
        eventEntityCounts.set(e.event, (eventEntityCounts.get(e.event) || 0) + 1);
        seen.add(e.event);
      }
    }

    // Check ordered pairs
    const pairsSeen = new Set<string>();
    for (let i = 0; i < seq.length; i++) {
      for (let j = i + 1; j < seq.length; j++) {
        if (seq[j].event === seq[i].event) continue;
        const lag = seq[j].timestamp - seq[i].timestamp;
        if (lag > maxWindow) break; // Events are sorted, so all subsequent are further

        const key = `${seq[i].event}|||${seq[j].event}`;
        if (pairsSeen.has(key)) continue;
        pairsSeen.add(key);

        const entry = pairCounts.get(key) || { count: 0, lags: [] };
        entry.count++;
        entry.lags.push(lag);
        pairCounts.set(key, entry);
      }
    }
  }

  // Generate temporal rules
  const rules: TemporalAssociationRule[] = [];

  for (const [key, { count, lags }] of pairCounts) {
    const [antecedentEvent, consequentEvent] = key.split('|||');
    const support = count / totalEntities;
    if (support < minSupport) continue;

    const antecedentCount = eventEntityCounts.get(antecedentEvent) || 0;
    const consequentCount = eventEntityCounts.get(consequentEvent) || 0;
    if (antecedentCount === 0) continue;

    const confidence = count / antecedentCount;
    if (confidence < minConfidence) continue;

    const consequentSupport = consequentCount / totalEntities;
    const lift = consequentSupport > 0 ? confidence / consequentSupport : 0;
    if (lift < minLift) continue;

    // Compute lag statistics
    const avgLag = lags.reduce((a, b) => a + b, 0) / lags.length;
    const lagVariance = lags.reduce((sum, l) => sum + Math.pow(l - avgLag, 2), 0) / lags.length;
    const lagStdDev = Math.sqrt(lagVariance);

    // Check if reverse direction also exists (bidirectional)
    const reverseKey = `${consequentEvent}|||${antecedentEvent}`;
    const reverseCount = pairCounts.get(reverseKey)?.count || 0;
    const direction = reverseCount > count * 0.5 ? 'bidirectional' as const : 'forward' as const;

    rules.push({
      antecedent: [antecedentEvent],
      consequent: [consequentEvent],
      support,
      confidence,
      lift,
      avgLag,
      lagStdDev,
      direction,
    });
  }

  return rules.sort((a, b) => b.lift - a.lift);
}

// ============================================================================
// MAIN DISCOVERY ENTRY POINT
// ============================================================================

/**
 * A causal edge for enriching pattern discovery with causal intelligence.
 * When provided, patterns that align with known causal edges get boosted
 * confidence, and causally-grounded patterns are tagged.
 */
export interface PatternCausalEdge {
  sourceDomain: string;
  targetDomain: string;
  effectSize: number;
  knockoutScore?: number;
  isLikelyConfounded?: boolean;
  coefficientSign?: number;
  lagDays?: number;
}

/**
 * Main pattern discovery function
 *
 * Combines association mining, sequential patterns, temporal rules,
 * clustering, significance testing, and causal enrichment.
 */
export function discoverPatterns(
  transactions: string[][],
  entities: EntityFeatures[],
  config: {
    minSupport?: number;
    minConfidence?: number;
    minLift?: number;
    numClusters?: number;
    significanceLevel?: number;
    /** Temporal events for sequential pattern mining */
    temporalEvents?: TemporalEvent[];
    /** Max time gap for sequential patterns */
    maxGap?: number;
    /** Causal edges from L4 discovery — enriches patterns with causal grounding */
    causalEdges?: PatternCausalEdge[];
  } = {}
): {
  rules: AssociationRule[];
  clusters: EntityCluster[];
  patterns: DiscoveredPattern[];
  sequentialPatterns: SequentialPattern[];
  temporalRules: TemporalAssociationRule[];
} {
  const {
    minSupport = 0.1,
    minConfidence = 0.6,
    minLift = 1.5,
    numClusters = 5,
    significanceLevel = 0.05,
    temporalEvents,
    maxGap,
    causalEdges,
  } = config;

  // Mine association rules
  const rules = mineAssociationRules(transactions, {
    minSupport,
    minConfidence,
    minLift,
  });

  // Cluster entities
  const k = Math.min(numClusters, Math.floor(entities.length / 3));
  const clusters = k > 1 ? clusterEntities(entities, k) : [];

  // Convert top rules to patterns with statistical validation
  const patterns: DiscoveredPattern[] = [];
  const numTests = rules.length;

  for (const rule of rules.slice(0, 20)) {
    const expectedCount = rule.support / rule.lift * transactions.length;
    const observedCount = rule.support * transactions.length;

    const evidence = validatePattern(
      observedCount,
      expectedCount,
      transactions.length,
      numTests
    );

    if (evidence.pValue < significanceLevel) {
      patterns.push(registerPattern(
        `${rule.antecedent.join(' + ')} → ${rule.consequent.join(' + ')}`,
        `When ${rule.antecedent.join(' and ')} occur, ${rule.consequent.join(' and ')} follows with ${(rule.confidence * 100).toFixed(0)}% confidence`,
        [...rule.antecedent, ...rule.consequent],
        evidence
      ));
    }
  }

  // Mine sequential patterns (if temporal events provided)
  let sequentialPatterns: SequentialPattern[] = [];
  let temporalRules: TemporalAssociationRule[] = [];

  if (temporalEvents && temporalEvents.length > 0) {
    sequentialPatterns = mineSequentialPatterns(temporalEvents, {
      minSupport,
      maxGap,
      maxLength: 5,
    });

    // Convert sequential patterns to DiscoveredPattern
    const seqDiscovered = sequentialPatternsToDiscovered(
      sequentialPatterns,
      transactions.length
    );
    patterns.push(...seqDiscovered.filter(p => p.evidence.pValue < significanceLevel));

    // Mine temporal association rules
    temporalRules = mineTemporalAssociationRules(temporalEvents, {
      maxWindow: maxGap,
      minSupport,
      minConfidence,
      minLift,
    });
  }

  // CAUSAL ENRICHMENT: Boost patterns that align with known causal edges
  if (causalEdges && causalEdges.length > 0) {
    // Build a set of known causal domain pairs for fast lookup
    const causalPairs = new Map<string, PatternCausalEdge>();
    for (const edge of causalEdges) {
      causalPairs.set(`${edge.sourceDomain}→${edge.targetDomain}`, edge);
    }

    for (const pattern of patterns) {
      // Check if pattern domains align with any causal edge
      const domains = pattern.domainsInvolved;
      let causallyGrounded = false;
      let bestKnockoutScore = 0;

      for (let i = 0; i < domains.length; i++) {
        for (let j = 0; j < domains.length; j++) {
          if (i === j) continue;
          const key = `${domains[i]}→${domains[j]}`;
          const edge = causalPairs.get(key);
          if (edge) {
            causallyGrounded = true;
            if (edge.knockoutScore !== undefined && edge.knockoutScore > bestKnockoutScore) {
              bestKnockoutScore = edge.knockoutScore;
            }
            // Confounded edges don't count for grounding
            if (edge.isLikelyConfounded) causallyGrounded = false;
          }
        }
      }

      // Tag and boost causally-grounded patterns
      if (causallyGrounded && bestKnockoutScore > 0.3) {
        pattern.description += ' [CAUSALLY GROUNDED — knockout-validated]';
        // Boost confidence: validated causal patterns are more trustworthy
        pattern.confirmationCount = Math.max(pattern.confirmationCount, 2);
      }
    }
  }

  return { rules, clusters, patterns, sequentialPatterns, temporalRules };
}
