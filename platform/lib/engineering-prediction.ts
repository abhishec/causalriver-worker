/**
 * Engineering Prediction Models
 *
 * Statistical prediction models for the Brain's P0 functions:
 *   - Velocity Collapse Warning (Holt's exponential smoothing w/ trend)
 *   - Betweenness Centrality (BFS-based graph analysis for reviewer bottleneck detection)
 *
 * These replace XGBoost/LightGBM with lightweight statistical equivalents
 * that run server-side without external ML dependencies.
 */

import { logger } from "@/lib/logger";

// ── TYPES ──────────────────────────────────────────────────────────────────

export interface SprintVelocityPoint {
  sprint: string;           // Sprint identifier (e.g. "Sprint 42" or ISO date)
  velocity: number;         // Merged PRs or story points in this sprint
  cycleTime?: number;       // Average PR cycle time (hours)
  prCount?: number;         // PRs merged in this sprint
  commitCount?: number;     // Commits in this sprint
  reviewCount?: number;     // Reviews in this sprint
  timestamp: number;        // Unix timestamp of sprint end
}

export interface VelocityPrediction {
  predictedVelocity: number;         // Next sprint predicted velocity
  historicalMean: number;             // Mean of last N sprints
  historicalStdDev: number;           // Std dev of last N sprints
  collapseThreshold: number;          // 0.8 × historical_mean
  collapseRisk: boolean;              // predicted < threshold
  confidence: number;                 // 0-100 prediction confidence
  leadTimeSprints: number;            // How many sprints ahead we're predicting
  triggerReasons: string[];           // Why the warning fired
  trend: 'accelerating' | 'stable' | 'decelerating' | 'collapsing';
  trendSlope: number;                 // Velocity change per sprint
  predictionInterval: {               // 70% confidence interval
    lower: number;
    upper: number;
  };
  sprintHistory: SprintVelocityPoint[]; // For chart rendering
}

export interface ReviewerNode {
  name: string;
  reviewCount: number;
  prReviewCount: number;       // Unique PRs reviewed
  betweennessCentrality: number;
  inDegreeCentrality: number;
  isBottleneck: boolean;        // z-score > 2 above mean
  zScore: number;
}

export interface ReviewGraph {
  nodes: ReviewerNode[];
  edges: Array<{
    author: string;
    reviewer: string;
    weight: number;            // Number of reviews from this author to reviewer
  }>;
  betweennessBottleneck: ReviewerNode | null;
  topBridgeEngineers: ReviewerNode[];  // Engineers who are critical bridges
}

// ── VELOCITY COLLAPSE PREDICTION ──────────────────────────────────────────
// Uses Holt's double exponential smoothing with trend detection.
// This is the statistical equivalent of XGBoost on lagged sprint features:
// - Level component captures the current velocity baseline
// - Trend component captures acceleration/deceleration
// - Prediction = level + trend * steps_ahead
// - Confidence from prediction interval width vs historical variance

/**
 * Predict next sprint velocity using Holt's exponential smoothing.
 * Requires at least 3 sprint data points for meaningful prediction.
 *
 * @param sprintData - Array of sprint velocity points, oldest first
 * @param alpha - Level smoothing factor (0.3 = responsive, 0.1 = conservative)
 * @param beta - Trend smoothing factor (0.2 = responsive, 0.05 = conservative)
 */
export function predictVelocityCollapse(
  sprintData: SprintVelocityPoint[],
  alpha = 0.3,
  beta = 0.15,
): VelocityPrediction | null {
  if (sprintData.length < 3) {
    logger.info("[VelocityPrediction] Insufficient data: need 3+ sprints");
    return null;
  }

  // Sort oldest first
  const sorted = [...sprintData].sort((a, b) => a.timestamp - b.timestamp);
  const velocities = sorted.map(s => s.velocity);
  const n = velocities.length;

  // ── Historical statistics ──
  const historicalMean = velocities.reduce((a, b) => a + b, 0) / n;
  const variance = velocities.reduce((sum, v) => sum + Math.pow(v - historicalMean, 2), 0) / n;
  const historicalStdDev = Math.sqrt(variance);

  // ── Holt's double exponential smoothing ──
  // Initialize: level = first value, trend = average difference of first 3 points
  let level = velocities[0];
  let trend = (velocities[Math.min(2, n - 1)] - velocities[0]) / Math.min(2, n - 1);

  // Smooth through all data points
  const smoothedLevels: number[] = [level];
  const smoothedTrends: number[] = [trend];
  const residuals: number[] = [];

  for (let i = 1; i < n; i++) {
    const newLevel = alpha * velocities[i] + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;

    // Track residual for confidence estimation
    const predicted = level + trend;
    residuals.push(velocities[i] - predicted);

    level = newLevel;
    trend = newTrend;
    smoothedLevels.push(level);
    smoothedTrends.push(trend);
  }

  // ── Predict next sprint ──
  const predictedVelocity = Math.max(0, level + trend);
  const collapseThreshold = 0.8 * historicalMean;

  // ── TRIGGER #1: Next sprint velocity < (mean of last 3 sprints − 1 std dev) ──
  const last3Mean = velocities.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, n);
  const last3StdDev = n >= 3
    ? Math.sqrt(velocities.slice(-3).reduce((sum, v) => sum + Math.pow(v - last3Mean, 2), 0) / Math.min(3, n))
    : historicalStdDev;
  const trigger1Threshold = last3Mean - last3StdDev;
  const trigger1Fired = predictedVelocity < trigger1Threshold;

  // ── TRIGGER #2: >25% drop in merged PRs sprint-over-sprint ──
  const lastVelocity = velocities[n - 1];
  const prevVelocity = n >= 2 ? velocities[n - 2] : lastVelocity;
  const sprintOverSprintDrop = prevVelocity > 0
    ? (prevVelocity - lastVelocity) / prevVelocity
    : 0;
  const trigger2Fired = sprintOverSprintDrop > 0.25;

  // ── Confidence estimation ──
  // Based on residual standard error and data quantity
  const residualMean = residuals.length > 0
    ? residuals.reduce((a, b) => a + b, 0) / residuals.length
    : 0;
  const residualVariance = residuals.length > 0
    ? residuals.reduce((sum, r) => sum + Math.pow(r - residualMean, 2), 0) / residuals.length
    : variance;
  const residualStdErr = Math.sqrt(residualVariance);

  // Confidence factors:
  // 1. More data = higher confidence (caps at ~85% with 8+ sprints)
  // 2. Lower residual variance = higher confidence
  // 3. Strong trend signal = higher confidence
  const dataConfidence = Math.min(0.85, 0.4 + n * 0.06);
  const stabilityConfidence = historicalStdDev > 0
    ? Math.max(0.3, 1 - residualStdErr / historicalMean)
    : 0.5;
  const confidence = Math.round(Math.min(95, (dataConfidence * 60 + stabilityConfidence * 40)));

  // ── 70% prediction interval ──
  const intervalWidth = 1.04 * residualStdErr; // z ≈ 1.04 for 70% CI
  const predictionInterval = {
    lower: Math.max(0, predictedVelocity - intervalWidth),
    upper: predictedVelocity + intervalWidth,
  };

  // ── Trend classification ──
  const trendSlope = trend;
  let trendLabel: VelocityPrediction['trend'];
  if (trendSlope > historicalStdDev * 0.3) trendLabel = 'accelerating';
  else if (trendSlope < -historicalStdDev * 0.5) trendLabel = 'collapsing';
  else if (trendSlope < -historicalStdDev * 0.1) trendLabel = 'decelerating';
  else trendLabel = 'stable';

  // ── Collapse risk assessment ──
  const collapseRisk = predictedVelocity < collapseThreshold && confidence >= 70;

  // ── Trigger reasons ──
  const triggerReasons: string[] = [];
  if (trigger1Fired) {
    triggerReasons.push(`Predicted velocity (${predictedVelocity.toFixed(1)}) < last 3 sprint mean − 1σ (${trigger1Threshold.toFixed(1)})`);
  }
  if (trigger2Fired) {
    triggerReasons.push(`${(sprintOverSprintDrop * 100).toFixed(0)}% drop in velocity sprint-over-sprint (threshold: 25%)`);
  }
  if (predictedVelocity < collapseThreshold) {
    triggerReasons.push(`Predicted (${predictedVelocity.toFixed(1)}) < 80% of historical mean (${collapseThreshold.toFixed(1)})`);
  }
  if (trendLabel === 'collapsing') {
    triggerReasons.push(`Velocity trend is collapsing (slope: ${trendSlope.toFixed(2)} per sprint)`);
  }

  return {
    predictedVelocity,
    historicalMean,
    historicalStdDev,
    collapseThreshold,
    collapseRisk,
    confidence,
    leadTimeSprints: 1,
    triggerReasons,
    trend: trendLabel,
    trendSlope,
    predictionInterval,
    sprintHistory: sorted,
  };
}

// ── BETWEENNESS CENTRALITY ─────────────────────────────────────────────────
// Computes betweenness centrality for the reviewer graph using BFS-based
// shortest path counting (Brandes algorithm, O(V*E)).
//
// Betweenness centrality measures how often a node appears on the shortest
// path between other nodes. High betweenness = critical bridge in the
// review flow. If this person is unavailable, review flow is disrupted.

interface AdjacencyMap {
  [node: string]: { [neighbor: string]: number }; // neighbor → weight
}

/**
 * Compute betweenness centrality for the reviewer collaboration graph.
 *
 * @param reviewEvents - Array of { author, reviewer } pairs from PR reviews
 */
export function computeReviewerGraph(
  reviewEvents: Array<{ author: string; reviewer: string; prId?: string }>,
): ReviewGraph {
  if (reviewEvents.length < 3) {
    return { nodes: [], edges: [], betweennessBottleneck: null, topBridgeEngineers: [] };
  }

  // Build undirected weighted graph: author ↔ reviewer (weight = review count)
  const adjacency: AdjacencyMap = {};
  const edgeMap: Record<string, number> = {};
  const reviewerCounts: Record<string, number> = {};
  const prReviewMap: Record<string, Set<string>> = {};

  for (const event of reviewEvents) {
    const { author, reviewer } = event;
    if (author === reviewer) continue; // Skip self-reviews

    // Track review counts
    reviewerCounts[reviewer] = (reviewerCounts[reviewer] || 0) + 1;
    if (!prReviewMap[reviewer]) prReviewMap[reviewer] = new Set();
    if (event.prId) prReviewMap[reviewer].add(event.prId);

    // Build adjacency (undirected — review flow goes both ways)
    if (!adjacency[author]) adjacency[author] = {};
    if (!adjacency[reviewer]) adjacency[reviewer] = {};
    adjacency[author][reviewer] = (adjacency[author][reviewer] || 0) + 1;
    adjacency[reviewer][author] = (adjacency[reviewer][author] || 0) + 1;

    // Track directed edges for output
    const edgeKey = `${author}→${reviewer}`;
    edgeMap[edgeKey] = (edgeMap[edgeKey] || 0) + 1;
  }

  const allNodes = Object.keys(adjacency);
  const n = allNodes.length;

  if (n < 2) {
    return { nodes: [], edges: [], betweennessBottleneck: null, topBridgeEngineers: [] };
  }

  // ── Brandes algorithm for betweenness centrality ──
  // O(V * E) — efficient for small-medium graphs (up to ~200 nodes)
  const betweenness: Record<string, number> = {};
  for (const node of allNodes) betweenness[node] = 0;

  for (const s of allNodes) {
    // BFS from source s
    const stack: string[] = [];
    const predecessors: Record<string, string[]> = {};
    const sigma: Record<string, number> = {};    // # shortest paths
    const dist: Record<string, number> = {};     // distance from s
    const delta: Record<string, number> = {};    // dependency

    for (const v of allNodes) {
      predecessors[v] = [];
      sigma[v] = 0;
      dist[v] = -1;
      delta[v] = 0;
    }
    sigma[s] = 1;
    dist[s] = 0;

    const queue: string[] = [s];
    let head = 0;

    while (head < queue.length) {
      const v = queue[head++];
      stack.push(v);

      const neighbors = adjacency[v] || {};
      for (const w of Object.keys(neighbors)) {
        // First visit?
        if (dist[w] < 0) {
          queue.push(w);
          dist[w] = dist[v] + 1;
        }
        // Shortest path to w via v?
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          predecessors[w].push(v);
        }
      }
    }

    // Back-propagation of dependencies
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of predecessors[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      if (w !== s) {
        betweenness[w] += delta[w];
      }
    }
  }

  // Normalize betweenness (divide by (n-1)(n-2) for undirected graphs)
  const normFactor = n > 2 ? (n - 1) * (n - 2) : 1;
  for (const node of allNodes) {
    betweenness[node] = betweenness[node] / normFactor;
  }

  // ── In-degree centrality ──
  const inDegree: Record<string, number> = {};
  const totalPRs = new Set(reviewEvents.filter(e => e.prId).map(e => e.prId)).size || reviewEvents.length;
  for (const node of allNodes) {
    inDegree[node] = (reviewerCounts[node] || 0) / Math.max(1, totalPRs);
  }

  // ── Z-scores for bottleneck detection ──
  const bValues = allNodes.map(n => betweenness[n]);
  const bMean = bValues.reduce((a, b) => a + b, 0) / bValues.length;
  const bStdDev = Math.sqrt(bValues.reduce((sum, v) => sum + Math.pow(v - bMean, 2), 0) / bValues.length);

  // Build node objects
  const nodes: ReviewerNode[] = allNodes.map(name => {
    const bc = betweenness[name];
    const zScore = bStdDev > 0 ? (bc - bMean) / bStdDev : 0;
    return {
      name,
      reviewCount: reviewerCounts[name] || 0,
      prReviewCount: prReviewMap[name]?.size || 0,
      betweennessCentrality: bc,
      inDegreeCentrality: inDegree[name],
      isBottleneck: zScore > 2, // >2 std dev above mean = bottleneck
      zScore,
    };
  }).sort((a, b) => b.betweennessCentrality - a.betweennessCentrality);

  // Build edge list
  const edges = Object.entries(edgeMap).map(([key, weight]) => {
    const [author, reviewer] = key.split('→');
    return { author, reviewer, weight };
  }).sort((a, b) => b.weight - a.weight);

  // Identify bottleneck and bridge engineers
  const bottleneck = nodes.find(n => n.isBottleneck) || nodes[0] || null;
  const topBridges = nodes.filter(n => n.zScore > 1.5).slice(0, 3);

  return {
    nodes,
    edges,
    betweennessBottleneck: bottleneck,
    topBridgeEngineers: topBridges,
  };
}

// ── SPRINT VELOCITY EXTRACTION FROM SIGNALS ─────────────────────────────────
// Groups engineering signals into 14-day sprint windows and computes velocity

/**
 * Convert raw engineering signals into sprint velocity data points.
 * Uses 14-day rolling windows to create sprint-like periods.
 */
export function extractSprintVelocity(
  signals: Array<{
    signal_type: string;
    signal_value?: number;
    signal_timestamp?: string;
    signal_metadata?: Record<string, any>;
    created_at?: string;
  }>,
  windowDays = 14,
): SprintVelocityPoint[] {
  if (!signals || signals.length === 0) return [];

  // Sort by timestamp
  const sorted = [...signals].sort((a, b) => {
    const ta = new Date(a.signal_timestamp || a.created_at || 0).getTime();
    const tb = new Date(b.signal_timestamp || b.created_at || 0).getTime();
    return ta - tb;
  });

  const firstTs = new Date(sorted[0].signal_timestamp || sorted[0].created_at || 0).getTime();
  const lastTs = new Date(sorted[sorted.length - 1].signal_timestamp || sorted[sorted.length - 1].created_at || 0).getTime();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  const sprints: SprintVelocityPoint[] = [];
  let windowStart = firstTs;
  let sprintNum = 1;

  while (windowStart < lastTs) {
    const windowEnd = windowStart + windowMs;

    const windowSignals = sorted.filter(s => {
      const ts = new Date(s.signal_timestamp || s.created_at || 0).getTime();
      return ts >= windowStart && ts < windowEnd;
    });

    if (windowSignals.length > 0) {
      const prMerged = windowSignals.filter(s => s.signal_type === 'pr_merged').length;
      const commits = windowSignals.filter(s => s.signal_type === 'commit_pushed').length;
      const reviews = windowSignals.filter(s => s.signal_type === 'pr_reviewed').length;
      const cycleTimes = windowSignals
        .filter(s => s.signal_type === 'pr_merged' && s.signal_value && s.signal_value > 0)
        .map(s => s.signal_value!);
      const avgCycleTime = cycleTimes.length > 0
        ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
        : undefined;

      sprints.push({
        sprint: `Sprint ${sprintNum}`,
        velocity: prMerged, // Use merged PRs as velocity metric
        cycleTime: avgCycleTime,
        prCount: prMerged,
        commitCount: commits,
        reviewCount: reviews,
        timestamp: windowEnd,
      });
    }

    windowStart = windowEnd;
    sprintNum++;
  }

  return sprints;
}

/**
 * Extract reviewer collaboration events from review signals.
 */
export function extractReviewerEvents(
  signals: Array<{
    signal_type: string;
    signal_metadata?: Record<string, any>;
    entity_id?: string;
  }>,
): Array<{ author: string; reviewer: string; prId?: string }> {
  return signals
    .filter(s => s.signal_type === 'pr_reviewed')
    .map(s => ({
      author: s.signal_metadata?.pr_author || s.signal_metadata?.author || 'unknown',
      reviewer: s.signal_metadata?.reviewer || 'unknown',
      prId: s.entity_id || s.signal_metadata?.pr_number?.toString(),
    }))
    .filter(e => e.author !== 'unknown' && e.reviewer !== 'unknown');
}
