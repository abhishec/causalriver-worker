/**
 * Engineering Bottleneck Concentration Risk Detector
 * ====================================================
 *
 * Detects single-point-of-failure risks in engineering teams:
 * - Reviewer centrality (who are critical reviewers?)
 * - Code ownership concentration (is knowledge concentrated in 1-2 people?)
 * - Bus factor calculation (how many people can you lose?)
 * - Knowledge distribution metrics (Gini coefficient, top-N concentration)
 *
 * Integrates with:
 * - ExpertiseGraph for code ownership data
 * - GitHub connector for PR review signals
 * - Theory of Mind for expert modeling
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createExpertiseGraph, type ExpertiseEdge } from '../core/expertise-graph';

// ============================================================================
// TYPES
// ============================================================================

export interface BottleneckMetrics {
  /** Organization ID */
  organizationId: string;
  /** Domain being analyzed (e.g., "backend", "frontend", "infrastructure") */
  domain: string;
  /** Gini coefficient (0 = perfect equality, 1 = perfect inequality) */
  giniCoefficient: number;
  /** % of expertise owned by top 3 contributors */
  top3Concentration: number;
  /** Bus factor (how many people can you lose and still function?) */
  busFactor: number;
  /** List of critical bottlenecks */
  bottlenecks: BottleneckAlert[];
  /** Computed at timestamp */
  computedAt: string;
}

export interface BottleneckAlert {
  /** Alert severity: critical (>70%), high (50-70%), medium (30-50%) */
  severity: 'critical' | 'high' | 'medium';
  /** Contributor ID who is the bottleneck */
  contributorId: string;
  /** Contributor name */
  contributorName: string;
  /** % of domain expertise owned by this person */
  expertiseShare: number;
  /** Centrality score (z-score vs. team mean) */
  centralityScore: number;
  /** Topics/areas this person is critical for */
  criticalTopics: string[];
  /** Recommended actions to mitigate risk */
  recommendations: string[];
  /** Estimated impact if this person leaves (0-1) */
  impactScore: number;
}

export interface ConcentrationConfig {
  /** Supabase client for expertise graph queries */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Minimum expertise strength to consider (0-1) */
  minStrength?: number;
  /** Days to look back for recent activity */
  lookbackDays?: number;
}

// ============================================================================
// CONCENTRATION METRICS CALCULATION
// ============================================================================

/**
 * Calculate Gini coefficient for expertise distribution
 *
 * Gini = 0 means perfect equality (everyone has same expertise)
 * Gini = 1 means perfect inequality (one person has all expertise)
 *
 * Formula: G = (Σ(2i - n - 1) * x_i) / (n * Σx_i)
 * where x_i are sorted strength values
 */
export function calculateGiniCoefficient(strengths: number[]): number {
  if (strengths.length === 0) return 0;
  if (strengths.length === 1) return 1; // Single person = maximum concentration

  // Sort ascending
  const sorted = [...strengths].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  if (sum === 0) return 0;

  let gini = 0;
  for (let i = 0; i < n; i++) {
    gini += (2 * (i + 1) - n - 1) * sorted[i];
  }

  return gini / (n * sum);
}

/**
 * Calculate top-N concentration
 * Returns % of total expertise owned by top N contributors
 */
export function calculateTopNConcentration(
  strengths: number[],
  topN: number = 3
): number {
  if (strengths.length === 0) return 0;

  const sorted = [...strengths].sort((a, b) => b - a); // Descending
  const totalStrength = sorted.reduce((acc, val) => acc + val, 0);

  if (totalStrength === 0) return 0;

  const topNSum = sorted.slice(0, topN).reduce((acc, val) => acc + val, 0);
  return (topNSum / totalStrength) * 100;
}

/**
 * Calculate bus factor
 * How many people would need to leave before team loses 50% of expertise?
 */
export function calculateBusFactor(strengths: number[]): number {
  if (strengths.length === 0) return 0;

  const sorted = [...strengths].sort((a, b) => b - a); // Descending
  const totalStrength = sorted.reduce((acc, val) => acc + val, 0);

  if (totalStrength === 0) return 0;

  let cumulativeStrength = 0;
  let count = 0;

  for (const strength of sorted) {
    cumulativeStrength += strength;
    count++;

    // If we've accumulated >50% of total expertise, that's the bus factor
    if (cumulativeStrength >= totalStrength * 0.5) {
      return count;
    }
  }

  return sorted.length;
}

/**
 * Calculate centrality z-score
 * How many standard deviations above/below the mean?
 */
export function calculateCentralityScore(
  contributorStrength: number,
  allStrengths: number[]
): number {
  if (allStrengths.length <= 1) return 0;

  const mean = allStrengths.reduce((acc, val) => acc + val, 0) / allStrengths.length;
  const variance =
    allStrengths.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / allStrengths.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  return (contributorStrength - mean) / stdDev;
}

// ============================================================================
// BOTTLENECK DETECTION
// ============================================================================

/**
 * Detect engineering bottlenecks for a specific domain
 */
export async function detectBottlenecks(
  config: ConcentrationConfig,
  domain: string
): Promise<BottleneckMetrics> {
  const { supabase, organizationId, minStrength = 0.05, lookbackDays = 90 } = config;

  // Initialize expertise graph and load org data
  const expertiseGraph = createExpertiseGraph();
  await expertiseGraph.load(supabase, organizationId);

  // Query experts for this domain
  const experts = expertiseGraph.queryExperts({
    topic: domain,
    minStrength,
    limit: 100,
  });

  if (experts.length === 0) {
    return {
      organizationId,
      domain,
      giniCoefficient: 0,
      top3Concentration: 0,
      busFactor: 0,
      bottlenecks: [],
      computedAt: new Date().toISOString(),
    };
  }

  // Extract strength values
  const strengths = experts.map((e: ExpertiseEdge) => e.strength);
  const contributorMap = new Map(
    experts.map((e: ExpertiseEdge) => [e.contributorId, { name: e.contributorName ?? 'Unknown', strength: e.strength }])
  );

  // Calculate concentration metrics
  const giniCoefficient = calculateGiniCoefficient(strengths);
  const top3Concentration = calculateTopNConcentration(strengths, 3);
  const busFactor = calculateBusFactor(strengths);

  // Identify bottlenecks
  const bottlenecks: BottleneckAlert[] = [];

  for (const expert of experts) {
    const centralityScore = calculateCentralityScore(expert.strength, strengths);
    const expertiseShare = (expert.strength / strengths.reduce((a: number, b: number) => a + b, 0)) * 100;

    // Determine severity
    let severity: 'critical' | 'high' | 'medium' | null = null;
    if (expertiseShare > 70) severity = 'critical';
    else if (expertiseShare > 50) severity = 'high';
    else if (expertiseShare > 30 || centralityScore > 2.5) severity = 'medium';

    if (!severity) continue;

    // Calculate impact score (combination of share and centrality)
    const impactScore = Math.min(1, expertiseShare / 100 + centralityScore / 10);

    // Generate recommendations
    const recommendations: string[] = [];
    if (expertiseShare > 50) {
      recommendations.push(`Cross-train 2-3 team members in ${domain}`);
      recommendations.push('Document critical knowledge in runbooks');
      recommendations.push('Pair programming sessions with junior developers');
    }
    if (centralityScore > 2.5) {
      recommendations.push('Distribute code review load to other team members');
      recommendations.push('Create backup reviewers for critical areas');
    }
    if (busFactor <= 2) {
      recommendations.push('URGENT: Team has bus factor of ' + busFactor);
      recommendations.push('Implement knowledge transfer plan immediately');
    }

    bottlenecks.push({
      severity,
      contributorId: expert.contributorId,
      contributorName: expert.contributorName || 'Unknown',
      expertiseShare,
      centralityScore,
      criticalTopics: [domain], // Can be expanded to show sub-topics
      recommendations,
      impactScore,
    });
  }

  // Sort by impact score (highest first)
  bottlenecks.sort((a, b) => b.impactScore - a.impactScore);

  return {
    organizationId,
    domain,
    giniCoefficient,
    top3Concentration,
    busFactor,
    bottlenecks,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Detect bottlenecks across multiple domains
 */
export async function detectAllBottlenecks(
  config: ConcentrationConfig,
  domains: string[]
): Promise<BottleneckMetrics[]> {
  const results: BottleneckMetrics[] = [];

  for (const domain of domains) {
    const metrics = await detectBottlenecks(config, domain);
    results.push(metrics);
  }

  return results;
}

/**
 * Calculate Herfindahl-Hirschman Index (HHI)
 *
 * HHI = Σ(share_i²) where share_i = strength_i / total_strength
 * HHI > 0.25 = highly concentrated (spec threshold)
 * HHI = 1.0 = perfect monopoly (one person has all expertise)
 * HHI = 1/n = perfect equality (n people with equal expertise)
 */
export function calculateHHI(strengths: number[]): number {
  if (strengths.length === 0) return 0;

  const totalStrength = strengths.reduce((acc, val) => acc + val, 0);
  if (totalStrength === 0) return 0;

  let hhi = 0;
  for (const strength of strengths) {
    const share = strength / totalStrength;
    hhi += share * share;
  }

  return hhi;
}

/**
 * Calculate in-degree centrality for each contributor
 * In the review context: how many unique people review your PRs (or you review theirs)
 *
 * Returns: Map<contributorId, normalizedInDegree>
 * where normalizedInDegree = inDegree / (n - 1) for n contributors
 */
export function calculateInDegreeCentrality(
  edges: Array<{ from: string; to: string }>
): Map<string, number> {
  const inDegree = new Map<string, Set<string>>();
  const allNodes = new Set<string>();

  for (const edge of edges) {
    allNodes.add(edge.from);
    allNodes.add(edge.to);

    if (!inDegree.has(edge.to)) {
      inDegree.set(edge.to, new Set());
    }
    inDegree.get(edge.to)!.add(edge.from);
  }

  const n = allNodes.size;
  const result = new Map<string, number>();
  const normalizer = Math.max(n - 1, 1);

  for (const node of allNodes) {
    const degree = inDegree.get(node)?.size || 0;
    result.set(node, degree / normalizer);
  }

  return result;
}

/**
 * Calculate betweenness centrality (simplified BFS-based)
 * Measures how often a contributor lies on the shortest path between other contributors.
 * High betweenness = gatekeeper / bottleneck in collaboration network.
 *
 * Uses Brandes' algorithm (O(VE)) for unweighted graphs.
 */
export function calculateBetweennessCentrality(
  edges: Array<{ from: string; to: string }>
): Map<string, number> {
  // Build adjacency list (undirected)
  const adj = new Map<string, Set<string>>();
  const allNodes = new Set<string>();

  for (const edge of edges) {
    allNodes.add(edge.from);
    allNodes.add(edge.to);

    if (!adj.has(edge.from)) adj.set(edge.from, new Set());
    if (!adj.has(edge.to)) adj.set(edge.to, new Set());
    adj.get(edge.from)!.add(edge.to);
    adj.get(edge.to)!.add(edge.from);
  }

  const n = allNodes.size;
  const betweenness = new Map<string, number>();
  for (const node of allNodes) {
    betweenness.set(node, 0);
  }

  // Brandes' algorithm
  for (const s of allNodes) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    const delta = new Map<string, number>();

    for (const v of allNodes) {
      pred.set(v, []);
      sigma.set(v, 0);
      dist.set(v, -1);
      delta.set(v, 0);
    }

    sigma.set(s, 1);
    dist.set(s, 0);
    const queue: string[] = [s];

    // BFS
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      const dv = dist.get(v)!;

      for (const w of adj.get(v) || []) {
        if (dist.get(w) === -1) {
          dist.set(w, dv + 1);
          queue.push(w);
        }
        if (dist.get(w) === dv + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    // Back-propagation
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== s) {
        betweenness.set(w, betweenness.get(w)! + delta.get(w)!);
      }
    }
  }

  // Normalize (undirected: divide by 2)
  const normalizer = n > 2 ? ((n - 1) * (n - 2)) / 2 : 1;
  for (const [node, val] of betweenness) {
    betweenness.set(node, (val / 2) / normalizer);
  }

  return betweenness;
}

/**
 * Calculate Eigenvector Centrality (Power Iteration method)
 *
 * Eigenvector centrality measures influence — a node is important if it's
 * connected to other important nodes. Unlike betweenness (gatekeepers),
 * this finds "influential connectors" in the collaboration network.
 *
 * Algorithm: Power iteration until convergence or max iterations.
 *   v(t+1) = A * v(t) / ||A * v(t)||
 *
 * Spec Requirement: Use Case B — Bottleneck Concentration Risk
 */
export function calculateEigenvectorCentrality(
  adjacency: Map<string, Map<string, number>>,
  maxIterations: number = 100,
  tolerance: number = 1e-6
): Map<string, number> {
  const nodes = Array.from(adjacency.keys());
  const n = nodes.length;
  if (n === 0) return new Map();

  // Initialize with uniform vector
  let centrality = new Map<string, number>();
  const initVal = 1 / Math.sqrt(n);
  for (const node of nodes) {
    centrality.set(node, initVal);
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    const newCentrality = new Map<string, number>();

    // Matrix-vector multiply: new[i] = Σ_j A[i][j] * old[j]
    for (const node of nodes) {
      let sum = 0;
      const neighbors = adjacency.get(node);
      if (neighbors) {
        for (const [neighbor, weight] of neighbors) {
          sum += weight * (centrality.get(neighbor) ?? 0);
        }
      }
      newCentrality.set(node, sum);
    }

    // Normalize by L2 norm
    let norm = 0;
    for (const val of newCentrality.values()) {
      norm += val * val;
    }
    norm = Math.sqrt(norm);

    if (norm === 0) break; // Disconnected graph

    for (const [node, val] of newCentrality) {
      newCentrality.set(node, val / norm);
    }

    // Check convergence
    let maxDiff = 0;
    for (const node of nodes) {
      maxDiff = Math.max(maxDiff, Math.abs((newCentrality.get(node) ?? 0) - (centrality.get(node) ?? 0)));
    }

    centrality = newCentrality;

    if (maxDiff < tolerance) break;
  }

  return centrality;
}

/**
 * Get heatmap of bottleneck risk across organization
 * Returns: { domain: riskScore } where riskScore = 0-100
 *
 * BRS Formula (updated with HHI):
 *   25% Gini (inequality)
 *   25% HHI (concentration)
 *   20% Top3% concentration
 *   30% Inverse bus factor
 */
export async function getBottleneckHeatmap(
  config: ConcentrationConfig,
  domains: string[]
): Promise<Record<string, number>> {
  const allMetrics = await detectAllBottlenecks(config, domains);
  const heatmap: Record<string, number> = {};

  for (const metrics of allMetrics) {
    const strengths = metrics.bottlenecks.map(b => b.expertiseShare);
    const hhi = calculateHHI(strengths);

    // Risk score = weighted combination with HHI
    const giniRisk = metrics.giniCoefficient * 100 * 0.25;
    const hhiRisk = Math.min(hhi / 0.5, 1.0) * 100 * 0.25; // Saturates at HHI=0.5
    const top3Risk = metrics.top3Concentration * 0.20;
    const busFactorRisk = (1 / Math.max(metrics.busFactor, 1)) * 100 * 0.30;

    const riskScore = Math.min(100, giniRisk + hhiRisk + top3Risk + busFactorRisk);
    heatmap[metrics.domain] = Math.round(riskScore);
  }

  return heatmap;
}

// ============================================================================
// ALERTING
// ============================================================================

export interface BottleneckAlertEvent {
  /** Event type for cascade system */
  type: 'bottleneck_concentration_risk';
  /** Organization ID */
  organizationId: string;
  /** Domain with bottleneck */
  domain: string;
  /** Risk level */
  severity: 'critical' | 'high' | 'medium';
  /** Detailed metrics */
  metrics: BottleneckMetrics;
  /** Human-readable message */
  message: string;
  /** Recommended actions */
  actions: string[];
  /** Timestamp */
  timestamp: string;
}

/**
 * Generate alert events for critical bottlenecks
 */
export function generateBottleneckAlerts(
  metrics: BottleneckMetrics
): BottleneckAlertEvent[] {
  const alerts: BottleneckAlertEvent[] = [];

  // Check for critical domain-level concentration
  if (metrics.top3Concentration > 70 || metrics.busFactor <= 2) {
    const severity = metrics.busFactor <= 1 ? 'critical' : metrics.top3Concentration > 85 ? 'critical' : 'high';

    alerts.push({
      type: 'bottleneck_concentration_risk',
      organizationId: metrics.organizationId,
      domain: metrics.domain,
      severity,
      metrics,
      message: `⚠️ Critical bottleneck in ${metrics.domain}: ${metrics.top3Concentration.toFixed(1)}% of expertise owned by top 3 contributors. Bus factor: ${metrics.busFactor}`,
      actions: [
        'Implement immediate knowledge transfer plan',
        'Cross-train team members in critical areas',
        'Document key processes and decision-making',
        'Consider hiring to reduce concentration risk',
      ],
      timestamp: new Date().toISOString(),
    });
  }

  // Check for individual contributor bottlenecks
  for (const bottleneck of metrics.bottlenecks.filter((b) => b.severity === 'critical')) {
    alerts.push({
      type: 'bottleneck_concentration_risk',
      organizationId: metrics.organizationId,
      domain: metrics.domain,
      severity: 'critical',
      metrics,
      message: `🚨 Single-point-of-failure: ${bottleneck.contributorName} owns ${bottleneck.expertiseShare.toFixed(1)}% of ${metrics.domain} expertise`,
      actions: bottleneck.recommendations,
      timestamp: new Date().toISOString(),
    });
  }

  return alerts;
}
