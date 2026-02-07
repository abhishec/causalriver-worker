/**
 * Nexus Memory Stack - Pattern Detector Module Tests
 *
 * Comprehensive tests for association rule mining, K-means clustering,
 * pattern validation, pattern registration, and the main discovery pipeline.
 */

import { describe, it, expect } from 'vitest';
import {
  mineAssociationRules,
  clusterEntities,
  validatePattern,
  registerPattern,
  discoverPatterns,
} from '../learning/pattern-detector';
import type {
  AssociationRule,
  EntityFeatures,
  PatternEvidence,
  EntityCluster,
  DiscoveredPattern,
} from '../learning/pattern-detector';

// ============================================================================
// ASSOCIATION RULE MINING
// ============================================================================

describe('mineAssociationRules', () => {
  // Reusable transaction set: strong co-occurrence of A+B -> C
  const transactions: string[][] = [
    ['A', 'B', 'C'],
    ['A', 'B', 'C'],
    ['A', 'B', 'C'],
    ['A', 'B', 'C'],
    ['A', 'B', 'C'],
    ['A', 'D'],
    ['B', 'D'],
    ['D', 'E'],
    ['D', 'E'],
    ['E', 'F'],
  ];

  it('should return an empty array for empty transactions', () => {
    const rules = mineAssociationRules([], {
      minSupport: 0.1,
      minConfidence: 0.5,
      minLift: 1.0,
    });
    expect(rules).toEqual([]);
  });

  it('should discover rules that meet support, confidence, and lift thresholds', () => {
    const rules = mineAssociationRules(transactions, {
      minSupport: 0.3,
      minConfidence: 0.6,
      minLift: 1.0,
    });

    expect(rules.length).toBeGreaterThan(0);

    for (const rule of rules) {
      expect(rule.support).toBeGreaterThanOrEqual(0.3);
      expect(rule.confidence).toBeGreaterThanOrEqual(0.6);
      expect(rule.lift).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('should return rules sorted by lift descending', () => {
    const rules = mineAssociationRules(transactions, {
      minSupport: 0.1,
      minConfidence: 0.5,
      minLift: 1.0,
    });

    for (let i = 0; i < rules.length - 1; i++) {
      expect(rules[i].lift).toBeGreaterThanOrEqual(rules[i + 1].lift);
    }
  });

  it('should produce rules with correct structural shape', () => {
    const rules = mineAssociationRules(transactions, {
      minSupport: 0.1,
      minConfidence: 0.5,
      minLift: 1.0,
    });

    for (const rule of rules) {
      expect(rule.antecedent).toBeInstanceOf(Array);
      expect(rule.antecedent.length).toBeGreaterThan(0);
      expect(rule.consequent).toBeInstanceOf(Array);
      expect(rule.consequent.length).toBe(1);
      expect(rule.support).toBeGreaterThan(0);
      expect(rule.support).toBeLessThanOrEqual(1);
      expect(rule.confidence).toBeGreaterThan(0);
      expect(rule.confidence).toBeLessThanOrEqual(1);
      expect(rule.lift).toBeGreaterThan(0);
    }
  });

  it('should return no rules when thresholds are impossibly high', () => {
    const rules = mineAssociationRules(transactions, {
      minSupport: 0.99,
      minConfidence: 0.99,
      minLift: 100,
    });
    expect(rules).toEqual([]);
  });

  it('should respect the maxAntecedentSize parameter', () => {
    // With maxAntecedentSize = 1, only 2-itemsets are generated (antecedent size 1).
    // No 3-itemsets should appear, so antecedent size should never exceed 1.
    const rules = mineAssociationRules(transactions, {
      minSupport: 0.1,
      minConfidence: 0.3,
      minLift: 1.0,
      maxAntecedentSize: 1,
    });

    for (const rule of rules) {
      expect(rule.antecedent.length).toBeLessThanOrEqual(1);
    }
  });

  it('should find the strong A,B -> C rule in the dataset', () => {
    // A and B co-occur with C in 5 out of 10 transactions
    const rules = mineAssociationRules(transactions, {
      minSupport: 0.1,
      minConfidence: 0.5,
      minLift: 1.0,
    });

    const abToC = rules.find(
      (r) =>
        r.antecedent.sort().join(',') === 'A,B' &&
        r.consequent.join(',') === 'C'
    );
    expect(abToC).toBeDefined();
    if (abToC) {
      // support = 5/10 = 0.5
      expect(abToC.support).toBeCloseTo(0.5, 5);
      // A,B appears together in 5 tx, C given A,B = 5/5 = 1.0
      expect(abToC.confidence).toBeCloseTo(1.0, 5);
      // lift = confidence / P(C) = 1.0 / 0.5 = 2.0
      expect(abToC.lift).toBeCloseTo(2.0, 5);
    }
  });
});

// ============================================================================
// K-MEANS CLUSTERING
// ============================================================================

describe('clusterEntities', () => {
  // Two clearly separated clusters in 2D feature space
  const entities: EntityFeatures[] = [
    { entityId: 'a1', entityType: 'account', features: { revenue: 100, usage: 90 } },
    { entityId: 'a2', entityType: 'account', features: { revenue: 110, usage: 95 } },
    { entityId: 'a3', entityType: 'account', features: { revenue: 105, usage: 85 } },
    { entityId: 'a4', entityType: 'account', features: { revenue: 95, usage: 92 } },
    { entityId: 'b1', entityType: 'account', features: { revenue: 10, usage: 5 } },
    { entityId: 'b2', entityType: 'account', features: { revenue: 15, usage: 8 } },
    { entityId: 'b3', entityType: 'account', features: { revenue: 12, usage: 3 } },
    { entityId: 'b4', entityType: 'account', features: { revenue: 8, usage: 7 } },
  ];

  it('should return an empty array for empty entities', () => {
    const clusters = clusterEntities([], 3);
    expect(clusters).toEqual([]);
  });

  it('should return an empty array when k <= 0', () => {
    const clusters = clusterEntities(entities, 0);
    expect(clusters).toEqual([]);
  });

  it('should partition entities into k clusters for well-separated data', () => {
    const clusters = clusterEntities(entities, 2, 200);
    // We may get 1 or 2 non-empty clusters; with well-separated data, expect 2
    expect(clusters.length).toBe(2);
  });

  it('should assign all entity IDs across the clusters', () => {
    const clusters = clusterEntities(entities, 2, 200);
    const allIds = clusters.flatMap((c) => c.entityIds).sort();
    const expectedIds = entities.map((e) => e.entityId).sort();
    expect(allIds).toEqual(expectedIds);
  });

  it('should produce clusters with correct structural properties', () => {
    const clusters = clusterEntities(entities, 2, 200);

    for (const cluster of clusters) {
      expect(cluster.clusterId).toBeGreaterThanOrEqual(0);
      expect(cluster.centroid).toBeInstanceOf(Array);
      expect(cluster.centroid.length).toBe(2); // 2 features: revenue, usage
      expect(cluster.entityIds.length).toBe(cluster.size);
      expect(cluster.intraClusterVariance).toBeGreaterThanOrEqual(0);
      expect(cluster.distinctiveFeatures).toBeInstanceOf(Array);
    }
  });

  it('should separate the two natural groups into different clusters', () => {
    const clusters = clusterEntities(entities, 2, 200);
    const groupA = ['a1', 'a2', 'a3', 'a4'];
    const groupB = ['b1', 'b2', 'b3', 'b4'];

    // Each cluster should contain members from one group predominantly
    const clusterSets = clusters.map((c) => new Set(c.entityIds));

    // Check that group A is entirely in one cluster, group B in the other
    const groupACluster = clusterSets.findIndex((s) =>
      groupA.every((id) => s.has(id))
    );
    const groupBCluster = clusterSets.findIndex((s) =>
      groupB.every((id) => s.has(id))
    );

    expect(groupACluster).toBeGreaterThanOrEqual(0);
    expect(groupBCluster).toBeGreaterThanOrEqual(0);
    expect(groupACluster).not.toBe(groupBCluster);
  });

  it('should handle a single entity without crashing', () => {
    const single: EntityFeatures[] = [
      { entityId: 'x1', entityType: 'lead', features: { score: 50 } },
    ];
    // k=1 for a single entity
    const clusters = clusterEntities(single, 1);
    expect(clusters.length).toBe(1);
    expect(clusters[0].entityIds).toEqual(['x1']);
    expect(clusters[0].size).toBe(1);
  });
});

// ============================================================================
// PATTERN VALIDATION
// ============================================================================

describe('validatePattern', () => {
  it('should return a significant result when observed greatly exceeds expected', () => {
    // Observed 40 out of 100, expected 20 => chi-squared = (40-20)^2/20 = 20
    // Using moderate chi-squared value that the local CDF handles accurately
    const evidence = validatePattern(40, 20, 100);
    expect(evidence.testType).toBe('chi-squared');
    expect(evidence.testStatistic).toBeGreaterThan(0);
    expect(evidence.pValue).toBeLessThan(0.05);
    expect(evidence.effectSize).toBeGreaterThan(1);
    expect(evidence.sampleSize).toBe(100);
  });

  it('should return a non-significant result when observed matches expected', () => {
    // Observed ~= expected => chi-squared close to 0
    const evidence = validatePattern(50, 50, 100);
    expect(evidence.testStatistic).toBeCloseTo(0, 5);
    expect(evidence.pValue).toBeGreaterThan(0.05);
    expect(evidence.effectSize).toBeCloseTo(1, 3);
  });

  it('should apply Bonferroni correction when numTests > 1', () => {
    const evidenceSingle = validatePattern(80, 20, 100, 1);
    const evidenceMultiple = validatePattern(80, 20, 100, 50);

    expect(evidenceMultiple.correctedPValue).toBeDefined();
    expect(evidenceMultiple.correctedPValue!).toBeGreaterThanOrEqual(
      evidenceSingle.correctedPValue ?? evidenceSingle.pValue
    );
  });

  it('should cap correctedPValue at 1.0', () => {
    // A moderately non-significant result with many tests
    const evidence = validatePattern(22, 20, 100, 1000);
    expect(evidence.correctedPValue).toBeLessThanOrEqual(1.0);
  });

  it('should produce a valid effect size confidence interval', () => {
    const evidence = validatePattern(60, 30, 100);
    const [lower, upper] = evidence.effectSizeCI;
    expect(lower).toBeLessThan(evidence.effectSize);
    expect(upper).toBeGreaterThan(evidence.effectSize);
  });

  it('should set survivesCorrection based on corrected p-value < 0.05', () => {
    // Strong signal: should survive even with correction
    const strong = validatePattern(90, 10, 100, 5);
    expect(strong.survivesCorrection).toBe(strong.correctedPValue! < 0.05);

    // Weak signal with heavy correction
    const weak = validatePattern(22, 20, 100, 500);
    expect(weak.survivesCorrection).toBe(weak.correctedPValue! < 0.05);
  });
});

// ============================================================================
// PATTERN REGISTRATION
// ============================================================================

describe('registerPattern', () => {
  const significantEvidence: PatternEvidence = {
    testType: 'chi-squared',
    testStatistic: 25.0,
    pValue: 0.001,
    effectSize: 2.5,
    effectSizeCI: [1.8, 3.4],
    sampleSize: 200,
    survivesCorrection: true,
    correctedPValue: 0.005,
  };

  const nonSignificantEvidence: PatternEvidence = {
    testType: 'chi-squared',
    testStatistic: 1.2,
    pValue: 0.27,
    effectSize: 1.1,
    effectSizeCI: [0.8, 1.5],
    sampleSize: 50,
    survivesCorrection: false,
    correctedPValue: 0.81,
  };

  it('should create a pattern with a unique id and correct metadata', () => {
    const pattern = registerPattern(
      'Late Payment -> Churn',
      'Late payments predict churn',
      ['billing', 'retention'],
      significantEvidence
    );

    expect(pattern.id).toMatch(/^pattern_\d+_[a-z0-9]+$/);
    expect(pattern.name).toBe('Late Payment -> Churn');
    expect(pattern.description).toBe('Late payments predict churn');
    expect(pattern.domainsInvolved).toEqual(['billing', 'retention']);
    expect(pattern.evidence).toBe(significantEvidence);
    expect(pattern.isNovel).toBe(true);
    expect(pattern.confirmationCount).toBe(1);
    expect(pattern.discoveredAt).toBeInstanceOf(Date);
  });

  it('should mark a pattern as significant when pValue < 0.05 and it survives correction', () => {
    const pattern = registerPattern(
      'Significant Pattern',
      'Test',
      ['domain'],
      significantEvidence
    );
    expect(pattern.isSignificant).toBe(true);
  });

  it('should mark a pattern as not significant when it does not survive correction', () => {
    const pattern = registerPattern(
      'Non-Significant Pattern',
      'Test',
      ['domain'],
      nonSignificantEvidence
    );
    expect(pattern.isSignificant).toBe(false);
  });

  it('should generate a natural language explanation including effect direction', () => {
    const patternUp = registerPattern(
      'Upsell Signal',
      'Test',
      ['sales'],
      { ...significantEvidence, effectSize: 2.0 }
    );
    expect(patternUp.naturalLanguage).toContain('more likely');

    const patternDown = registerPattern(
      'Downsell Signal',
      'Test',
      ['sales'],
      { ...significantEvidence, effectSize: 0.5 }
    );
    expect(patternDown.naturalLanguage).toContain('less likely');
  });
});

// ============================================================================
// MAIN DISCOVERY PIPELINE
// ============================================================================

describe('discoverPatterns', () => {
  // Transactions with a strong repeating pattern
  const transactions: string[][] = [
    ['high_usage', 'expansion'],
    ['high_usage', 'expansion'],
    ['high_usage', 'expansion'],
    ['high_usage', 'expansion'],
    ['high_usage', 'expansion'],
    ['high_usage', 'expansion'],
    ['late_payment', 'churn'],
    ['late_payment', 'churn'],
    ['late_payment', 'churn'],
    ['late_payment', 'churn'],
  ];

  const entities: EntityFeatures[] = [
    { entityId: 'e1', entityType: 'account', features: { revenue: 100, health: 90 } },
    { entityId: 'e2', entityType: 'account', features: { revenue: 110, health: 85 } },
    { entityId: 'e3', entityType: 'account', features: { revenue: 105, health: 88 } },
    { entityId: 'e4', entityType: 'account', features: { revenue: 10, health: 20 } },
    { entityId: 'e5', entityType: 'account', features: { revenue: 15, health: 25 } },
    { entityId: 'e6', entityType: 'account', features: { revenue: 12, health: 22 } },
    { entityId: 'e7', entityType: 'account', features: { revenue: 50, health: 50 } },
    { entityId: 'e8', entityType: 'account', features: { revenue: 55, health: 48 } },
    { entityId: 'e9', entityType: 'account', features: { revenue: 52, health: 53 } },
  ];

  it('should return rules, clusters, and patterns in the result', () => {
    const result = discoverPatterns(transactions, entities);
    expect(result).toHaveProperty('rules');
    expect(result).toHaveProperty('clusters');
    expect(result).toHaveProperty('patterns');
    expect(result.rules).toBeInstanceOf(Array);
    expect(result.clusters).toBeInstanceOf(Array);
    expect(result.patterns).toBeInstanceOf(Array);
  });

  it('should use default config values when none provided', () => {
    const result = discoverPatterns(transactions, entities);
    // With defaults (minSupport=0.1, minConfidence=0.6, minLift=1.5), rules should be found
    expect(result.rules.length).toBeGreaterThan(0);
  });

  it('should produce clusters when enough entities are provided', () => {
    const result = discoverPatterns(transactions, entities, { numClusters: 3 });
    // k = min(3, floor(9/3)) = 3, which is > 1, so clusters should be produced
    expect(result.clusters.length).toBeGreaterThan(0);
  });

  it('should skip clustering when entities are too few', () => {
    const fewEntities: EntityFeatures[] = [
      { entityId: 'x1', entityType: 'lead', features: { score: 50 } },
    ];
    const result = discoverPatterns(transactions, fewEntities, { numClusters: 5 });
    // k = min(5, floor(1/3)) = 0, which is not > 1 => no clustering
    expect(result.clusters).toEqual([]);
  });

  it('should handle empty transactions gracefully', () => {
    const result = discoverPatterns([], entities);
    expect(result.rules).toEqual([]);
    expect(result.patterns).toEqual([]);
  });

  it('should handle both empty transactions and empty entities', () => {
    const result = discoverPatterns([], []);
    expect(result.rules).toEqual([]);
    expect(result.clusters).toEqual([]);
    expect(result.patterns).toEqual([]);
  });

  it('should only register patterns that pass the significance level', () => {
    const result = discoverPatterns(transactions, entities, {
      significanceLevel: 0.05,
    });

    for (const pattern of result.patterns) {
      expect(pattern.evidence.pValue).toBeLessThan(0.05);
    }
  });
});
