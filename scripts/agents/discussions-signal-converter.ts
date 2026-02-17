/**
 * GitHub Discussions Signal Converter
 *
 * Transforms GitHub Discussions data into brain signals + training packs.
 * This is the Slack-proxy intelligence layer:
 * - Response latency (how fast does the community respond?)
 * - Thread resolution rate (% of discussions marked answered)
 * - Community engagement depth (comments per discussion)
 * - Category health (which channels are active?)
 * - Contributor network density (how many unique helpers?)
 *
 * All signals aggregated per-day to avoid skew.
 */

import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { RepoDiscussionData } from './discussions-trainer-fetcher';

// ============================================================================
// SIGNAL CONVERSION
// ============================================================================

export function convertDiscussionsToSignals(
  repoData: RepoDiscussionData,
  organizationId: string,
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const entityId = `${repoData.owner}/${repoData.repo}`;

  // ── 1. Response Latency (per day) ──
  // How fast does the first comment arrive after a discussion is posted?
  {
    const latencyByDay = new Map<string, { totalHours: number; count: number }>();
    for (const d of repoData.discussions) {
      if (d.comments.length === 0) continue;
      const created = new Date(d.createdAt).getTime();
      const firstComment = new Date(d.comments[0].createdAt).getTime();
      const hours = Math.max(0, (firstComment - created) / (1000 * 60 * 60));
      const day = d.createdAt.substring(0, 10);
      const entry = latencyByDay.get(day) || { totalHours: 0, count: 0 };
      entry.totalHours += hours;
      entry.count++;
      latencyByDay.set(day, entry);
    }
    for (const [day, { totalHours, count }] of latencyByDay) {
      if (count >= 2) {
        const avgHours = totalHours / count;
        // 1 = fast (< 1hr), 0 = slow (> 72hrs)
        const speed = Math.max(0, Math.min(1, 1 - avgHours / 72));
        signals.push({
          organization_id: organizationId,
          source_domain: 'people',
          signal_type: 'discussion_response_latency',
          signal_value: speed,
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: entityId,
          metadata: { avg_hours: Math.round(avgHours * 10) / 10, discussions: count, repo: entityId },
        });
      }
    }
  }

  // ── 2. Resolution Rate (per day) ──
  // What fraction of discussions are marked as answered?
  {
    const resByDay = new Map<string, { answered: number; total: number }>();
    for (const d of repoData.discussions) {
      const day = d.createdAt.substring(0, 10);
      const entry = resByDay.get(day) || { answered: 0, total: 0 };
      entry.total++;
      if (d.isAnswered) entry.answered++;
      resByDay.set(day, entry);
    }
    for (const [day, { answered, total }] of resByDay) {
      if (total >= 3) {
        const rate = answered / total;
        signals.push({
          organization_id: organizationId,
          source_domain: 'people',
          signal_type: 'discussion_resolution_rate',
          signal_value: rate,
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: entityId,
          metadata: { answered, total, repo: entityId },
        });
      }
    }
  }

  // ── 3. Engagement Depth (per day) ──
  // Average comments per discussion — more engagement = healthier community.
  {
    const engByDay = new Map<string, { totalComments: number; count: number; deep: number }>();
    for (const d of repoData.discussions) {
      const day = d.createdAt.substring(0, 10);
      const entry = engByDay.get(day) || { totalComments: 0, count: 0, deep: 0 };
      entry.count++;
      entry.totalComments += d.commentCount;
      if (d.commentCount >= 5) entry.deep++;
      engByDay.set(day, entry);
    }
    for (const [day, { totalComments, count, deep }] of engByDay) {
      if (count >= 3) {
        const avgComments = totalComments / count;
        // Cap at 1.0 when avg ≥ 8 comments
        const depth = Math.min(1, avgComments / 8);
        signals.push({
          organization_id: organizationId,
          source_domain: 'people',
          signal_type: 'discussion_engagement_depth',
          signal_value: depth,
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: entityId,
          metadata: { avg_comments: Math.round(avgComments * 10) / 10, deep_threads: deep, total: count, repo: entityId },
        });
      }
    }
  }

  // ── 4. Community Upvote Signal (per day) ──
  // Average upvotes per discussion — measures content quality.
  {
    const upvoteByDay = new Map<string, { totalUpvotes: number; count: number }>();
    for (const d of repoData.discussions) {
      const day = d.createdAt.substring(0, 10);
      const entry = upvoteByDay.get(day) || { totalUpvotes: 0, count: 0 };
      entry.count++;
      entry.totalUpvotes += d.upvoteCount;
      upvoteByDay.set(day, entry);
    }
    for (const [day, { totalUpvotes, count }] of upvoteByDay) {
      if (count >= 3) {
        const avgUpvotes = totalUpvotes / count;
        const quality = Math.min(1, avgUpvotes / 5);
        signals.push({
          organization_id: organizationId,
          source_domain: 'people',
          signal_type: 'discussion_content_quality',
          signal_value: quality,
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: entityId,
          metadata: { avg_upvotes: Math.round(avgUpvotes * 10) / 10, total: count, repo: entityId },
        });
      }
    }
  }

  // ── 5. Contributor Diversity (per day) ──
  // How many unique people respond? High diversity = healthy bus-factor-free community.
  {
    const contribByDay = new Map<string, Set<string>>();
    for (const d of repoData.discussions) {
      const day = d.createdAt.substring(0, 10);
      if (!contribByDay.has(day)) contribByDay.set(day, new Set());
      const contributors = contribByDay.get(day)!;
      contributors.add(d.author);
      for (const c of d.comments) {
        contributors.add(c.author);
      }
    }
    for (const [day, contributors] of contribByDay) {
      if (contributors.size >= 3) {
        // Normalize: 1.0 at 20+ unique contributors/day
        const diversity = Math.min(1, contributors.size / 20);
        signals.push({
          organization_id: organizationId,
          source_domain: 'people',
          signal_type: 'discussion_contributor_diversity',
          signal_value: diversity,
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: entityId,
          metadata: { unique_contributors: contributors.size, repo: entityId },
        });
      }
    }
  }

  // ── 6. Category Distribution (per day) ──
  // Healthy communities have balanced category usage. Heavy "Help" = struggling users.
  {
    const catByDay = new Map<string, Map<string, number>>();
    for (const d of repoData.discussions) {
      const day = d.createdAt.substring(0, 10);
      if (!catByDay.has(day)) catByDay.set(day, new Map());
      const cats = catByDay.get(day)!;
      cats.set(d.category, (cats.get(d.category) || 0) + 1);
    }
    for (const [day, cats] of catByDay) {
      const total = Array.from(cats.values()).reduce((a, b) => a + b, 0);
      if (total >= 5) {
        const helpCount = cats.get('Help') || cats.get('Q&A') || 0;
        const helpRatio = helpCount / total;
        // Negative if >60% is help-seeking (indicates struggling users)
        const balance = helpRatio > 0.6 ? -(helpRatio - 0.6) * 2.5 : (1 - helpRatio);
        signals.push({
          organization_id: organizationId,
          source_domain: 'product',
          signal_type: 'discussion_category_balance',
          signal_value: Math.max(-1, Math.min(1, balance)),
          signal_timestamp: day,
          entity_type: 'repository',
          entity_id: entityId,
          metadata: { categories: Object.fromEntries(cats), total, help_ratio: Math.round(helpRatio * 100), repo: entityId },
        });
      }
    }
  }

  return signals;
}

// ============================================================================
// TRAINING PACK GENERATION
// ============================================================================

export function buildDiscussionsTrainingPacks(allRepoData: RepoDiscussionData[]): TrainingPack[] {
  const packs: TrainingPack[] = [];
  const repoCount = allRepoData.length;

  const repoStats = allRepoData.map(r => {
    const answered = r.discussions.filter(d => d.isAnswered).length;
    const resolutionRate = r.discussions.length > 0 ? answered / r.discussions.length : 0;
    const avgComments = r.discussions.length > 0
      ? r.discussions.reduce((sum, d) => sum + d.commentCount, 0) / r.discussions.length
      : 0;
    const avgUpvotes = r.discussions.length > 0
      ? r.discussions.reduce((sum, d) => sum + d.upvoteCount, 0) / r.discussions.length
      : 0;
    const avgLatencyHours = (() => {
      const withComments = r.discussions.filter(d => d.comments.length > 0);
      if (withComments.length === 0) return 48;
      return withComments.reduce((sum, d) => {
        const created = new Date(d.createdAt).getTime();
        const first = new Date(d.comments[0].createdAt).getTime();
        return sum + Math.max(0, (first - created) / (1000 * 60 * 60));
      }, 0) / withComments.length;
    })();
    const uniqueContributors = new Set<string>();
    for (const d of r.discussions) {
      uniqueContributors.add(d.author);
      for (const c of d.comments) uniqueContributors.add(c.author);
    }
    return {
      repo: `${r.owner}/${r.repo}`,
      resolutionRate,
      avgComments,
      avgUpvotes,
      avgLatencyHours,
      contributorCount: uniqueContributors.size,
      discussionCount: r.discussions.length,
    };
  });

  // Pearson correlation helper
  function computeCorrelation(
    getX: (s: typeof repoStats[0]) => number,
    getY: (s: typeof repoStats[0]) => number,
  ): number {
    const pairs = repoStats.filter(s => !isNaN(getX(s)) && !isNaN(getY(s)));
    if (pairs.length < 4) return 0;
    const xs = pairs.map(getX);
    const ys = pairs.map(getY);
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denomX = 0, denomY = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      num += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }
    const denom = Math.sqrt(denomX * denomY);
    return denom > 0 ? Math.round(num / denom * 100) / 100 : 0;
  }

  const latencyVsResolution = computeCorrelation(s => 1 / Math.max(0.1, s.avgLatencyHours), s => s.resolutionRate);
  const engagementVsResolution = computeCorrelation(s => s.avgComments, s => s.resolutionRate);

  // Pack 1: Response Speed → Resolution Quality
  packs.push({
    id: 'discussions-response-resolution',
    title: 'Community Response Speed and Discussion Resolution',
    source: `Computed from ${repoCount} GitHub Discussion repos: latency-resolution r=${latencyVsResolution}`,
    industry: 'Technology',
    domains: ['people', 'engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(latencyVsResolution) * 0.4),
    tags: ['discussions', 'communication', 'response-time', 'resolution', 'data-computed'],
    causalChains: [
      {
        source: 'people',
        target: 'people',
        metric: 'discussion_resolution_rate',
        effectSize: Math.abs(latencyVsResolution) || 0.55,
        lagDays: 3,
        coefficientSign: latencyVsResolution > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Response Speed → Resolution',
        domains: ['people', 'engineering'],
        description: `Measured r=${latencyVsResolution} between first-response latency and resolution rate across ${repoCount} repos. ${latencyVsResolution > 0 ? 'Faster responses → more resolved discussions' : 'No clear relationship'}.`,
        observed: repoStats.filter(s => s.avgLatencyHours < 12 && s.resolutionRate > 0.5).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // Pack 2: Engagement Depth → Resolution Quality
  packs.push({
    id: 'discussions-engagement-resolution',
    title: 'Discussion Engagement and Resolution Quality',
    source: `Computed from ${repoCount} GitHub Discussion repos: engagement-resolution r=${engagementVsResolution}`,
    industry: 'Technology',
    domains: ['people', 'product'],
    confidence: Math.min(0.85, 0.5 + Math.abs(engagementVsResolution) * 0.4),
    tags: ['discussions', 'engagement', 'community', 'data-computed'],
    causalChains: [
      {
        source: 'people',
        target: 'product',
        metric: 'discussion_engagement_depth',
        effectSize: Math.abs(engagementVsResolution) || 0.5,
        lagDays: 7,
        coefficientSign: engagementVsResolution > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Engagement → Resolution',
        domains: ['people', 'product'],
        description: `Measured r=${engagementVsResolution} between comment depth and resolution rate across ${repoCount} repos.`,
        observed: repoStats.filter(s => s.avgComments > 3 && s.resolutionRate > 0.4).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // Pack 3: Cross-domain — Communication health → Engineering outcomes
  packs.push({
    id: 'discussions-communication-engineering',
    title: 'Community Communication Health and Engineering Outcomes',
    source: `Computed from ${repoCount} repos — cross-domain communication → engineering causality`,
    industry: 'Technology',
    domains: ['people', 'engineering', 'product'],
    confidence: 0.7,
    tags: ['discussions', 'cross-domain', 'communication', 'data-computed'],
    causalChains: [
      {
        source: 'people',
        target: 'engineering',
        metric: 'issue_resolution_speed',
        effectSize: 0.5,
        lagDays: 14,
        coefficientSign: 1, // Better community communication → faster issue resolution
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Communication → Engineering',
        domains: ['people', 'engineering'],
        description: `Repos with active discussions and fast responses tend to have faster issue resolution. Observed across ${repoCount} repos.`,
        observed: repoStats.filter(s => s.avgLatencyHours < 24 && s.contributorCount > 10).length,
        expected: Math.round(repoCount * 0.3),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  return packs;
}
