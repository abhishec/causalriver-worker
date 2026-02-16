/**
 * P0 Early Warning - Brain-Aligned Signal Ingestion
 * ==================================================
 *
 * ARCHITECTURE COMPLIANCE:
 * This implementation follows NexusBrain's 7-layer architecture:
 *   - L1 Ingestion: PRs/reviews → cross_domain_signals (engineering domain)
 *   - L4 Causal: Brain learns velocity/bottleneck relationships
 *   - L6 Agents: Copilot can query "why is velocity collapsing?"
 *
 * DATA FLOW:
 *   GitHub API → extractPRSignals() → cross_domain_signals
 *   → Causal discovery learns patterns
 *   → velocity-tracker.ts queries cross_domain_signals
 *   → Results feed back as signals
 *   → Brain builds causal graph (velocity ← bottleneck)
 *
 * SIGNAL TYPES (engineering domain):
 *   - pr_opened
 *   - pr_merged
 *   - pr_closed
 *   - pr_reviewed
 *   - velocity_collapsed (alert signal)
 *   - bottleneck_detected (alert signal)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

interface GitHubPR {
  id: number;
  number: number;
  title: string;
  user: { login: string; id: number };
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  merged: boolean;
  draft: boolean;
}

interface GitHubReview {
  id: number;
  user: { login: string; id: number };
  submitted_at: string;
  state: string;
}

// ============================================================================
// PR → BRAIN SIGNALS
// ============================================================================

/**
 * Extract PR events as Brain signals (L1 ingestion)
 *
 * Each PR generates multiple signals in cross_domain_signals:
 * 1. pr_opened (entity_type: pr, entity_id: PR#)
 * 2. pr_merged (if merged)
 * 3. pr_reviewed (for each review)
 *
 * Brain then learns causal relationships:
 * - reviewer_concentration → velocity_drop
 * - cycle_time_increase → velocity_collapse
 */
export async function ingestPRAsSignals(
  supabase: SupabaseClient,
  organizationId: string,
  repoName: string,
  pr: GitHubPR,
  reviews: GitHubReview[]
): Promise<void> {
  const signals: Array<{
    organization_id: string;
    source_domain: string;
    signal_type: string;
    signal_value: number;
    entity_type: string;
    entity_id: string;
    signal_metadata: Record<string, any>;
    created_at: string;
  }> = [];

  // Signal 1: PR Opened
  signals.push({
    organization_id: organizationId,
    source_domain: 'engineering',
    signal_type: 'pr_opened',
    signal_value: 1,
    entity_type: 'pull_request',
    entity_id: `${repoName}#${pr.number}`,
    signal_metadata: {
      repo: repoName,
      pr_number: pr.number,
      author: pr.user.login,
      author_id: pr.user.id,
      title: pr.title,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      is_draft: pr.draft,
    },
    created_at: pr.created_at,
  });

  // Signal 2: PR Merged (if applicable)
  if (pr.merged_at) {
    const cycleTimeHours =
      (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3600000;

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'pr_merged',
      signal_value: cycleTimeHours, // Cycle time in hours
      entity_type: 'pull_request',
      entity_id: `${repoName}#${pr.number}`,
      signal_metadata: {
        repo: repoName,
        pr_number: pr.number,
        author: pr.user.login,
        cycle_time_hours: cycleTimeHours,
        pr_size: pr.additions + pr.deletions,
      },
      created_at: pr.merged_at,
    });
  }

  // Signal 3: PR Closed (if not merged)
  if (pr.closed_at && !pr.merged_at) {
    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'pr_closed_unmerged',
      signal_value: 1,
      entity_type: 'pull_request',
      entity_id: `${repoName}#${pr.number}`,
      signal_metadata: {
        repo: repoName,
        pr_number: pr.number,
        author: pr.user.login,
      },
      created_at: pr.closed_at,
    });
  }

  // Signal 4: PR Reviews (for bottleneck detection)
  for (const review of reviews) {
    const reviewLatencyHours =
      (new Date(review.submitted_at).getTime() - new Date(pr.created_at).getTime()) / 3600000;

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'pr_reviewed',
      signal_value: reviewLatencyHours,
      entity_type: 'review',
      entity_id: `${repoName}#${pr.number}:review:${review.id}`,
      signal_metadata: {
        repo: repoName,
        pr_number: pr.number,
        pr_author: pr.user.login,
        reviewer: review.user.login,
        reviewer_id: review.user.id,
        review_state: review.state,
        review_latency_hours: reviewLatencyHours,
      },
      created_at: review.submitted_at,
    });
  }

  // Bulk insert all signals
  const { error } = await supabase.from('cross_domain_signals').insert(signals);

  if (error) {
    console.error('[P0 Ingest] Error inserting signals:', error);
    throw error;
  }
}

// ============================================================================
// VELOCITY COLLAPSE → BRAIN SIGNAL
// ============================================================================

/**
 * When velocity collapse is detected, feed it back as a signal
 * This allows Brain to learn causal patterns:
 *   - bottleneck_concentration → velocity_collapsed
 *   - review_latency_spike → velocity_collapsed
 */
export async function emitVelocityCollapseSignal(
  supabase: SupabaseClient,
  organizationId: string,
  collapseDetails: {
    currentVelocity: number;
    historicalMean: number;
    percentDrop: number;
    confidence: number;
  }
): Promise<void> {
  await supabase.from('cross_domain_signals').insert({
    organization_id: organizationId,
    source_domain: 'engineering',
    signal_type: 'velocity_collapsed',
    signal_value: collapseDetails.percentDrop, // % drop
    entity_type: 'team',
    entity_id: 'org-wide', // Team-level in future
    signal_metadata: {
      current_velocity: collapseDetails.currentVelocity,
      historical_mean: collapseDetails.historicalMean,
      percent_drop: collapseDetails.percentDrop,
      confidence: collapseDetails.confidence,
      alert_type: 'velocity_collapse',
    },
    created_at: new Date().toISOString(),
  });
}

// ============================================================================
// BOTTLENECK DETECTED → BRAIN SIGNAL
// ============================================================================

/**
 * When bottleneck is detected, feed it as a signal
 * Brain learns: reviewer_X_concentration → velocity_drop
 */
export async function emitBottleneckSignal(
  supabase: SupabaseClient,
  organizationId: string,
  bottleneckDetails: {
    topReviewer: string;
    reviewShare: number;
    giniCoefficient: number;
    riskScore: number;
  }
): Promise<void> {
  await supabase.from('cross_domain_signals').insert({
    organization_id: organizationId,
    source_domain: 'engineering',
    signal_type: 'bottleneck_detected',
    signal_value: bottleneckDetails.riskScore, // 0-100
    entity_type: 'engineer',
    entity_id: bottleneckDetails.topReviewer,
    signal_metadata: {
      top_reviewer: bottleneckDetails.topReviewer,
      review_share: bottleneckDetails.reviewShare,
      gini_coefficient: bottleneckDetails.giniCoefficient,
      risk_score: bottleneckDetails.riskScore,
      alert_type: 'bottleneck_concentration',
    },
    created_at: new Date().toISOString(),
  });
}

// ============================================================================
// QUERY HELPERS (for velocity-tracker.ts, bottleneck-detector.ts)
// ============================================================================

/**
 * Get merged PRs from cross_domain_signals for velocity calculation
 * Replaces direct pull_requests table queries
 */
export async function getMergedPRSignals(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackDays: number
): Promise<Array<{
  prNumber: number;
  repo: string;
  author: string;
  mergedAt: string;
  cycleTimeHours: number;
  prSize: number;
}>> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const { data, error } = await supabase
    .from('cross_domain_signals')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .eq('signal_type', 'pr_merged')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map((signal) => ({
    prNumber: signal.signal_metadata.pr_number,
    repo: signal.signal_metadata.repo,
    author: signal.signal_metadata.author,
    mergedAt: signal.created_at,
    cycleTimeHours: signal.signal_value,
    prSize: signal.signal_metadata.pr_size || 0,
  }));
}

/**
 * Get review signals for bottleneck detection
 * Replaces direct pr_reviews table queries
 */
export async function getReviewSignals(
  supabase: SupabaseClient,
  organizationId: string,
  lookbackDays: number
): Promise<Array<{
  prNumber: number;
  repo: string;
  reviewer: string;
  reviewedAt: string;
  reviewLatencyHours: number;
}>> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const { data, error } = await supabase
    .from('cross_domain_signals')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('source_domain', 'engineering')
    .eq('signal_type', 'pr_reviewed')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map((signal) => ({
    prNumber: signal.signal_metadata.pr_number,
    repo: signal.signal_metadata.repo,
    reviewer: signal.signal_metadata.reviewer,
    reviewedAt: signal.created_at,
    reviewLatencyHours: signal.signal_value,
  }));
}
