/**
 * P0 Velocity Analysis - Brain-Aligned Implementation
 * ====================================================
 *
 * Uses cross_domain_signals (L1) instead of isolated tables
 * Results feed back as signals for Brain's causal discovery (L4)
 *
 * SPEC COMPLIANCE (P0):
 * ✓ 7-day window velocity tracking
 * ✓ Z-score collapse test: velocity < (mean_last_3_sprints - 1_std)
 * ✓ Sprint-over-sprint drop: >25% decline detection
 * ✓ HHI (Herfindahl-Hirschman Index): >0.25 = high concentration
 * ✓ Gini coefficient for reviewer inequality
 * ✓ Extended velocity features: cycle_time_variance, pr_size_mean,
 *   reviewer_count_per_pr, review_concentration_index, open_pr_trend,
 *   prs_per_engineer, jira_ticket_velocity
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMergedPRSignals, getReviewSignals, emitVelocityCollapseSignal, emitBottleneckSignal } from './ingest-pr-signals';

// ============================================================================
// TYPES
// ============================================================================

interface VelocityMetrics {
  windowStart: string;
  windowEnd: string;
  prsMerged: number;
  avgCycleTimeHours: number;
  cycleTimeVariance: number;
  prSizeMean: number;
  reviewerCountPerPrMean: number;
  reviewConcentrationIndex: number;
  openPrCount: number;
  prsPerEngineer: number;
  wipCount: number;
}

export interface VelocityCollapseResult {
  currentVelocity: number;
  historicalMean: number;
  historicalStdDev: number;
  percentDrop: number;
  zScore: number;
  collapseDetected: boolean;
  collapseReason: string[];
  confidence: number;
  velocityTimeSeries: VelocityMetrics[];
  /** Extended features for ML model (XGBoost input) */
  featureVector: VelocityFeatureVector;
}

/** Feature vector for ML-based velocity prediction (Week 3: XGBoost/LightGBM) */
export interface VelocityFeatureVector {
  prsMergedLast7d: number;
  prsMergedLast14d: number;
  prsMergedLast30d: number;
  avgCycleTimeHours: number;
  cycleTimeVariance: number;
  prSizeMean: number;
  reviewerCountPerPrMean: number;
  reviewConcentrationIndex: number;
  openPrCountTrend: number;
  prsPerEngineer: number;
  jiraTicketsResolved7d: number;
  jiraTicketCycleTimeHours: number;
  velocityZScore: number;
  /** Reviewer HHI from bottleneck analysis */
  reviewerHHI: number;
  /** Gini coefficient from bottleneck analysis */
  reviewerGini: number;
}

// ============================================================================
// VELOCITY COLLAPSE DETECTION
// ============================================================================

export async function analyzeVelocityCollapse(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackDays: number = 90
): Promise<VelocityCollapseResult> {
  // Get PR merge signals from cross_domain_signals
  const mergedPRs = await getMergedPRSignals(supabase, organizationId, lookbackDays);

  // Get review signals for reviewer-per-PR and concentration metrics
  const reviewSignals = await getReviewSignals(supabase, organizationId, lookbackDays);

  // Get open PR signals for WIP tracking
  const { data: openPrSignals } = await supabase
    .from('cross_domain_signals')
    .select('created_at, signal_metadata')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .eq('signal_type', 'pr_opened')
    .gte('created_at', new Date(Date.now() - lookbackDays * 86400000).toISOString())
    .order('created_at', { ascending: true });

  // Get Jira ticket signals for cross-domain velocity features
  const { data: jiraTicketSignals } = await supabase
    .from('cross_domain_signals')
    .select('created_at, signal_value, signal_metadata')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'product')
    .eq('signal_type', 'ticket_resolved')
    .gte('created_at', new Date(Date.now() - lookbackDays * 86400000).toISOString())
    .order('created_at', { ascending: true });

  // Get unique engineers (PR authors) for prs_per_engineer
  const uniqueAuthors = new Set(mergedPRs.map((pr) => pr.author));
  const engineerCount = Math.max(uniqueAuthors.size, 1);

  // Group into 7-day windows with extended features
  const windows: Map<string, VelocityMetrics> = new Map();
  const now = new Date();

  for (let i = 0; i < lookbackDays / 7; i++) {
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() - i * 7);
    const windowStart = new Date(windowEnd);
    windowStart.setDate(windowStart.getDate() - 7);

    const windowKey = windowStart.toISOString().split('T')[0];
    const prsInWindow = mergedPRs.filter((pr) => {
      const mergedAt = new Date(pr.mergedAt);
      return mergedAt >= windowStart && mergedAt < windowEnd;
    });

    // Avg cycle time
    const avgCycleTime =
      prsInWindow.length > 0
        ? prsInWindow.reduce((sum, pr) => sum + pr.cycleTimeHours, 0) / prsInWindow.length
        : 0;

    // Cycle time variance (Feature #1)
    const cycleTimeVariance =
      prsInWindow.length > 1
        ? prsInWindow.reduce((sum, pr) => sum + Math.pow(pr.cycleTimeHours - avgCycleTime, 2), 0) /
          (prsInWindow.length - 1)
        : 0;

    // PR size mean (Feature #2)
    const prSizeMean =
      prsInWindow.length > 0
        ? prsInWindow.reduce((sum, pr) => sum + pr.prSize, 0) / prsInWindow.length
        : 0;

    // Reviewer count per PR mean (Feature #3)
    const reviewsInWindow = reviewSignals.filter((r) => {
      const reviewedAt = new Date(r.reviewedAt);
      return reviewedAt >= windowStart && reviewedAt < windowEnd;
    });
    const prReviewerCounts = new Map<number, Set<string>>();
    for (const review of reviewsInWindow) {
      if (!prReviewerCounts.has(review.prNumber)) {
        prReviewerCounts.set(review.prNumber, new Set());
      }
      prReviewerCounts.get(review.prNumber)!.add(review.reviewer);
    }
    const reviewerCountPerPrMean =
      prReviewerCounts.size > 0
        ? Array.from(prReviewerCounts.values()).reduce((sum, s) => sum + s.size, 0) /
          prReviewerCounts.size
        : 0;

    // Review concentration index (Feature #4) — uses HHI over this window
    const windowReviewerCounts = new Map<string, number>();
    for (const review of reviewsInWindow) {
      windowReviewerCounts.set(review.reviewer, (windowReviewerCounts.get(review.reviewer) || 0) + 1);
    }
    const windowTotalReviews = reviewsInWindow.length;
    let reviewConcentrationIndex = 0;
    if (windowTotalReviews > 0) {
      for (const count of windowReviewerCounts.values()) {
        const share = count / windowTotalReviews;
        reviewConcentrationIndex += share * share; // HHI
      }
    }

    // Open PR count (Feature #5)
    const openedInWindow = (openPrSignals || []).filter((s: any) => {
      const created = new Date(s.created_at);
      return created >= windowStart && created < windowEnd;
    }).length;

    // PRs per engineer (Feature #6)
    const windowAuthors = new Set(prsInWindow.map((pr) => pr.author));
    const prsPerEngineer =
      windowAuthors.size > 0 ? prsInWindow.length / windowAuthors.size : 0;

    windows.set(windowKey, {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      prsMerged: prsInWindow.length,
      avgCycleTimeHours: avgCycleTime,
      cycleTimeVariance,
      prSizeMean,
      reviewerCountPerPrMean,
      reviewConcentrationIndex,
      openPrCount: openedInWindow,
      prsPerEngineer,
      wipCount: 0, // Will be computed as running open-close delta
    });
  }

  const velocityTimeSeries = Array.from(windows.values()).reverse();

  // ── COLLAPSE DETECTION ────────────────────────────────────────────────────

  const last7Days = velocityTimeSeries.slice(-1)[0];
  const prev7Days = velocityTimeSeries.slice(-2, -1)[0];

  const currentVelocity = last7Days?.prsMerged || 0;
  const prevVelocity = prev7Days?.prsMerged || 0;

  // Historical mean and standard deviation (last 3 sprints = last 3 windows)
  const recentWindows = velocityTimeSeries.slice(-4, -1); // 3 windows before current
  const historicalVelocities = recentWindows.map((w) => w.prsMerged);

  const historicalMean =
    historicalVelocities.length > 0
      ? historicalVelocities.reduce((sum, v) => sum + v, 0) / historicalVelocities.length
      : 0;

  const historicalVariance =
    historicalVelocities.length > 1
      ? historicalVelocities.reduce((sum, v) => sum + Math.pow(v - historicalMean, 2), 0) /
        (historicalVelocities.length - 1)
      : 0;
  const historicalStdDev = Math.sqrt(historicalVariance);

  // Sprint-over-sprint drop
  const percentDrop =
    prevVelocity > 0 ? ((currentVelocity - prevVelocity) / prevVelocity) * 100 : 0;

  // Z-score: how many std devs below the mean? (SPEC: velocity < mean - 1_std)
  const zScore =
    historicalStdDev > 0 ? (currentVelocity - historicalMean) / historicalStdDev : 0;

  // ── DUAL COLLAPSE CRITERIA ────────────────────────────────────────────────
  // 1. Sprint-over-sprint: >25% drop
  // 2. Z-score: velocity < (mean_last_3_sprints - 1_std) → z-score < -1.0
  const collapseReasons: string[] = [];
  if (percentDrop < -25) {
    collapseReasons.push(`Sprint-over-sprint drop: ${percentDrop.toFixed(1)}% (threshold: -25%)`);
  }
  if (zScore < -1.0 && historicalStdDev > 0) {
    collapseReasons.push(
      `Z-score collapse: ${zScore.toFixed(2)} (velocity ${currentVelocity} < mean ${historicalMean.toFixed(1)} - 1σ ${historicalStdDev.toFixed(1)} = ${(historicalMean - historicalStdDev).toFixed(1)})`
    );
  }

  const collapseDetected = collapseReasons.length > 0;

  const confidence = Math.min(velocityTimeSeries.length / 12, 1.0);

  // Emit collapse signal if detected
  if (collapseDetected) {
    await emitVelocityCollapseSignal(supabase, organizationId, {
      currentVelocity,
      historicalMean,
      percentDrop,
      confidence,
    });
  }

  // ── JIRA CROSS-DOMAIN FEATURES (Feature #7) ──────────────────────────────
  const jiraLast7d = (jiraTicketSignals || []).filter(
    (s: any) => new Date(s.created_at) >= new Date(Date.now() - 7 * 86400000)
  );
  const jiraTicketsResolved7d = jiraLast7d.length;
  const jiraTicketCycleTimeHours =
    jiraLast7d.length > 0
      ? jiraLast7d.reduce((sum: number, s: any) => sum + (s.signal_value || 0), 0) / jiraLast7d.length
      : 0;

  // ── FEATURE VECTOR (for ML model input) ───────────────────────────────────
  const last14dPRs = mergedPRs.filter(
    (pr) => new Date(pr.mergedAt) >= new Date(Date.now() - 14 * 86400000)
  );
  const last30dPRs = mergedPRs.filter(
    (pr) => new Date(pr.mergedAt) >= new Date(Date.now() - 30 * 86400000)
  );

  const featureVector: VelocityFeatureVector = {
    prsMergedLast7d: currentVelocity,
    prsMergedLast14d: last14dPRs.length,
    prsMergedLast30d: last30dPRs.length,
    avgCycleTimeHours: last7Days?.avgCycleTimeHours || 0,
    cycleTimeVariance: last7Days?.cycleTimeVariance || 0,
    prSizeMean: last7Days?.prSizeMean || 0,
    reviewerCountPerPrMean: last7Days?.reviewerCountPerPrMean || 0,
    reviewConcentrationIndex: last7Days?.reviewConcentrationIndex || 0,
    openPrCountTrend: last7Days?.openPrCount || 0,
    prsPerEngineer: currentVelocity / engineerCount,
    jiraTicketsResolved7d,
    jiraTicketCycleTimeHours,
    velocityZScore: zScore,
    reviewerHHI: 0, // Populated by bottleneck analysis
    reviewerGini: 0, // Populated by bottleneck analysis
  };

  return {
    currentVelocity,
    historicalMean,
    historicalStdDev,
    percentDrop,
    zScore,
    collapseDetected,
    collapseReason: collapseReasons,
    confidence,
    velocityTimeSeries,
    featureVector,
  };
}

// ============================================================================
// BOTTLENECK DETECTION (with HHI)
// ============================================================================

export interface BottleneckResult {
  topReviewer: string;
  reviewShare: number;
  giniCoefficient: number;
  /** Herfindahl-Hirschman Index: >0.25 = high concentration */
  hhi: number;
  /** Top-3 reviewer share (% of reviews by top 3 reviewers) */
  top3Share: number;
  /** Average review latency in hours */
  avgReviewLatencyHours: number;
  /** Max betweenness centrality from collaboration graph */
  maxBetweennessCentrality: number;
  /** Top centrality contributor */
  topCentralityContributor: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  /** Per-reviewer breakdown */
  reviewerBreakdown: Array<{
    reviewer: string;
    reviewCount: number;
    share: number;
    avgLatencyHours: number;
    betweennessCentrality: number;
  }>;
}

export async function analyzeBottleneckRisk(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackDays: number = 90
): Promise<BottleneckResult> {
  // Get review signals from cross_domain_signals
  const reviews = await getReviewSignals(supabase, organizationId, lookbackDays);

  // Load collaboration graph edges for centrality computation
  const { data: collabEdges } = await supabase
    .from('cross_domain_signals')
    .select('signal_metadata')
    .eq('organization_id', organizationId)
    .eq('signal_type', 'collaboration_edge')
    .eq('entity_type', 'collaboration');

  // Build review graph edges for centrality (reviewer → author)
  const reviewEdges: Array<{ from: string; to: string }> = [];
  for (const review of reviews) {
    if (review.prAuthor && review.reviewer !== review.prAuthor) {
      reviewEdges.push({ from: review.reviewer, to: review.prAuthor });
    }
  }

  // Also add collaboration graph edges
  for (const edge of collabEdges || []) {
    const meta = edge.signal_metadata;
    if (meta?.contributor_a && meta?.contributor_b) {
      reviewEdges.push({ from: meta.contributor_a, to: meta.contributor_b });
    }
  }

  // Compute betweenness centrality over the combined graph
  const betweennessCentrality = computeBetweennessCentrality(reviewEdges);

  // Count reviews per reviewer + track latency
  const reviewerCounts = new Map<string, number>();
  const reviewerLatencies = new Map<string, number[]>();
  for (const review of reviews) {
    reviewerCounts.set(review.reviewer, (reviewerCounts.get(review.reviewer) || 0) + 1);
    if (!reviewerLatencies.has(review.reviewer)) {
      reviewerLatencies.set(review.reviewer, []);
    }
    reviewerLatencies.get(review.reviewer)!.push(review.reviewLatencyHours);
  }

  const totalReviews = reviews.length;
  if (totalReviews === 0) {
    return {
      topReviewer: 'none',
      reviewShare: 0,
      giniCoefficient: 0,
      hhi: 0,
      top3Share: 0,
      avgReviewLatencyHours: 0,
      maxBetweennessCentrality: 0,
      topCentralityContributor: 'none',
      riskScore: 0,
      riskLevel: 'low',
      reviewerBreakdown: [],
    };
  }

  // Find top reviewer
  let topReviewer = 'unknown';
  let maxReviews = 0;
  for (const [reviewer, count] of reviewerCounts.entries()) {
    if (count > maxReviews) {
      maxReviews = count;
      topReviewer = reviewer;
    }
  }

  const reviewShare = maxReviews / totalReviews;

  // ── GINI COEFFICIENT ─────────────────────────────────────────────────────
  const counts = Array.from(reviewerCounts.values()).sort((a, b) => a - b);
  let sumOfDifferences = 0;
  for (let i = 0; i < counts.length; i++) {
    for (let j = 0; j < counts.length; j++) {
      sumOfDifferences += Math.abs(counts[i] - counts[j]);
    }
  }
  const giniCoefficient = counts.length > 0
    ? sumOfDifferences / (2 * totalReviews * counts.length)
    : 0;

  // ── HHI (HERFINDAHL-HIRSCHMAN INDEX) ─────────────────────────────────────
  // HHI = Σ(share_i²) where share_i = reviewer_i_count / total_reviews
  // HHI > 0.25 = highly concentrated (spec threshold)
  // HHI = 1.0 means one person does all reviews
  let hhi = 0;
  for (const count of reviewerCounts.values()) {
    const share = count / totalReviews;
    hhi += share * share;
  }

  // ── TOP-3 REVIEWER SHARE ──────────────────────────────────────────────────
  const sortedCounts = Array.from(reviewerCounts.values()).sort((a, b) => b - a);
  const top3Sum = sortedCounts.slice(0, 3).reduce((sum, c) => sum + c, 0);
  const top3Share = top3Sum / totalReviews;

  // ── AVERAGE REVIEW LATENCY ────────────────────────────────────────────────
  const allLatencies = reviews.map((r) => r.reviewLatencyHours);
  const avgReviewLatencyHours =
    allLatencies.length > 0
      ? allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length
      : 0;

  // ── CENTRALITY METRICS ──────────────────────────────────────────────────
  let maxBetweennessCentrality = 0;
  let topCentralityContributor = 'none';
  for (const [contributor, centrality] of betweennessCentrality) {
    if (centrality > maxBetweennessCentrality) {
      maxBetweennessCentrality = centrality;
      topCentralityContributor = contributor;
    }
  }

  // ── RISK SCORE (BRS 0-100) ────────────────────────────────────────────────
  // Weighted formula (with centrality):
  //   25% Gini coefficient (inequality)
  //   20% HHI (concentration)
  //   20% Top reviewer share
  //   15% Inverse reviewer count (few reviewers = higher risk)
  //   10% Max betweenness centrality (gatekeeper risk)
  //   10% Review latency spike (slow reviews = bottleneck)
  let riskScore = 0;
  riskScore += Math.min(giniCoefficient, 1.0) * 25;                  // Max 25
  riskScore += Math.min(hhi / 0.5, 1.0) * 20;                       // Max 20 (HHI=0.5 → max)
  riskScore += reviewShare * 20;                                      // Max 20
  riskScore += Math.min((1 / reviewerCounts.size) * 15, 15);         // Max 15
  riskScore += Math.min(maxBetweennessCentrality * 100, 10);         // Max 10 (centrality 0-1)
  riskScore += Math.min(avgReviewLatencyHours / 48, 1.0) * 10;      // Max 10 (48h+ = max risk)

  const riskLevel: 'low' | 'medium' | 'high' =
    riskScore > 60 || hhi > 0.25 ? 'high' : riskScore > 30 ? 'medium' : 'low';

  // ── REVIEWER BREAKDOWN (with centrality) ──────────────────────────────────
  const reviewerBreakdown = Array.from(reviewerCounts.entries())
    .map(([reviewer, count]) => {
      const latencies = reviewerLatencies.get(reviewer) || [];
      const avgLatency =
        latencies.length > 0 ? latencies.reduce((s, l) => s + l, 0) / latencies.length : 0;
      return {
        reviewer,
        reviewCount: count,
        share: count / totalReviews,
        avgLatencyHours: avgLatency,
        betweennessCentrality: betweennessCentrality.get(reviewer) || 0,
      };
    })
    .sort((a, b) => b.reviewCount - a.reviewCount);

  // Emit bottleneck signal if high risk
  if (riskLevel === 'high') {
    await emitBottleneckSignal(supabase, organizationId, {
      topReviewer,
      reviewShare,
      giniCoefficient,
      riskScore,
    });
  }

  return {
    topReviewer,
    reviewShare,
    giniCoefficient,
    hhi,
    top3Share,
    avgReviewLatencyHours,
    maxBetweennessCentrality,
    topCentralityContributor,
    riskScore,
    riskLevel,
    reviewerBreakdown,
  };
}

// ============================================================================
// CENTRALITY COMPUTATION (Brandes' BFS-based Betweenness)
// ============================================================================

/**
 * Compute betweenness centrality for all nodes in an undirected graph.
 * Uses Brandes' algorithm (O(VE)) for efficiency.
 *
 * High betweenness = gatekeeper / bottleneck in collaboration/review network.
 */
function computeBetweennessCentrality(
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
  if (n < 3) {
    // Centrality is meaningless with < 3 nodes
    const result = new Map<string, number>();
    for (const node of allNodes) result.set(node, 0);
    return result;
  }

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

    // BFS phase
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

    // Back-propagation phase
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

  // Normalize (undirected graph: divide by 2, then by (n-1)(n-2)/2)
  const normalizer = n > 2 ? ((n - 1) * (n - 2)) : 1;
  for (const [node, val] of betweenness) {
    betweenness.set(node, val / normalizer);
  }

  return betweenness;
}
