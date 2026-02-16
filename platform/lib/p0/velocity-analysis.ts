/**
 * P0 Velocity Analysis - Brain-Aligned Implementation
 * ====================================================
 *
 * Uses cross_domain_signals (L1) instead of isolated tables
 * Results feed back as signals for Brain's causal discovery (L4)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMergedPRSignals, getReviewSignals, emitVelocityCollapseSignal, emitBottleneckSignal } from './ingest-pr-signals';

// ============================================================================
// VELOCITY COLLAPSE DETECTION
// ============================================================================

interface VelocityMetrics {
  windowStart: string;
  windowEnd: string;
  prsMerged: number;
  avgCycleTimeHours: number;
  wipCount: number;
}

export async function analyzeVelocityCollapse(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackDays: number = 90
): Promise<{
  currentVelocity: number;
  historicalMean: number;
  percentDrop: number;
  collapseDetected: boolean;
  confidence: number;
  velocityTimeSeries: VelocityMetrics[];
}> {
  // Get PR merge signals from cross_domain_signals
  const mergedPRs = await getMergedPRSignals(supabase, organizationId, lookbackDays);

  // Group into 7-day windows
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

    const avgCycleTime =
      prsInWindow.length > 0
        ? prsInWindow.reduce((sum, pr) => sum + pr.cycleTimeHours, 0) / prsInWindow.length
        : 0;

    windows.set(windowKey, {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      prsMerged: prsInWindow.length,
      avgCycleTimeHours: avgCycleTime,
      wipCount: 0, // TODO: Query pr_opened - pr_merged for current WIP
    });
  }

  const velocityTimeSeries = Array.from(windows.values()).reverse();

  // Calculate collapse
  const last7Days = velocityTimeSeries.slice(-1)[0];
  const prev7Days = velocityTimeSeries.slice(-2, -1)[0];

  const currentVelocity = last7Days?.prsMerged || 0;
  const prevVelocity = prev7Days?.prsMerged || 0;

  const historicalMean =
    velocityTimeSeries.reduce((sum, w) => sum + w.prsMerged, 0) / velocityTimeSeries.length;

  const percentDrop = prevVelocity > 0 ? ((currentVelocity - prevVelocity) / prevVelocity) * 100 : 0;

  const collapseDetected = percentDrop < -25; // 25% drop threshold

  const confidence = Math.min(velocityTimeSeries.length / 12, 1.0); // More history = higher confidence

  // Emit collapse signal if detected
  if (collapseDetected) {
    await emitVelocityCollapseSignal(supabase, organizationId, {
      currentVelocity,
      historicalMean,
      percentDrop,
      confidence,
    });
  }

  return {
    currentVelocity,
    historicalMean,
    percentDrop,
    collapseDetected,
    confidence,
    velocityTimeSeries,
  };
}

// ============================================================================
// BOTTLENECK DETECTION
// ============================================================================

interface BottleneckResult {
  topReviewer: string;
  reviewShare: number;
  giniCoefficient: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export async function analyzeBottleneckRisk(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackDays: number = 90
): Promise<BottleneckResult> {
  // Get review signals from cross_domain_signals
  const reviews = await getReviewSignals(supabase, organizationId, lookbackDays);

  // Count reviews per reviewer
  const reviewerCounts = new Map<string, number>();
  for (const review of reviews) {
    reviewerCounts.set(review.reviewer, (reviewerCounts.get(review.reviewer) || 0) + 1);
  }

  const totalReviews = reviews.length;
  if (totalReviews === 0) {
    return {
      topReviewer: 'none',
      reviewShare: 0,
      giniCoefficient: 0,
      riskScore: 0,
      riskLevel: 'low',
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

  // Calculate Gini coefficient (inequality measure)
  const counts = Array.from(reviewerCounts.values()).sort((a, b) => a - b);
  let sumOfDifferences = 0;
  for (let i = 0; i < counts.length; i++) {
    for (let j = 0; j < counts.length; j++) {
      sumOfDifferences += Math.abs(counts[i] - counts[j]);
    }
  }
  const giniCoefficient = sumOfDifferences / (2 * totalReviews * counts.length);

  // Calculate risk score (0-100)
  // Components:
  // - reviewShare > 0.4 → high risk (50 points)
  // - gini > 0.5 → high inequality (30 points)
  // - few reviewers → concentration (20 points)
  let riskScore = 0;
  riskScore += reviewShare * 50; // Max 50 if one person reviews everything
  riskScore += Math.min(giniCoefficient, 1.0) * 30; // Max 30
  riskScore += Math.min((1 / reviewerCounts.size) * 20, 20); // Max 20 if only 1 reviewer

  const riskLevel: 'low' | 'medium' | 'high' =
    riskScore > 60 ? 'high' : riskScore > 30 ? 'medium' : 'low';

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
    riskScore,
    riskLevel,
  };
}
