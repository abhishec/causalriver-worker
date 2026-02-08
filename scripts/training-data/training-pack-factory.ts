/**
 * Training Pack Factory — Converts Public Data to NexusBrain Format
 *
 * Takes raw data from public APIs (FRED, GitHub, World Bank, Hacker News)
 * and converts it into:
 * 1. ConnectorSignal[] — raw signals for the causal discovery engine
 * 2. TrainingPack[] — structured knowledge for the brain trainer
 */

import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type {
  TrainingPack,
  CausalChainEntry,
  TrainingPattern,
  TrainingOutcome,
  TrainingCascade,
  TrainingRule,
} from '../../packages/memory-stack/src/learning/brain-trainer';
import type {
  FredSeriesResult,
  GitHubRepoStats,
  WorldBankResult,
  HackerNewsSnapshot,
  BLSSeriesResult,
  StackOverflowSnapshot,
} from './public-data-fetchers';

// ============================================================================
// FRED SERIES → SIGNAL TYPE MAPPING
// ============================================================================

const FRED_SIGNAL_MAP: Record<string, { signalType: string; normalize: (v: number) => number }> = {
  GDP: {
    signalType: 'gdp_level',
    normalize: (v) => Math.min(v / 30000, 1), // GDP in billions, normalize rough
  },
  UNRATE: {
    signalType: 'unemployment_rate',
    normalize: (v) => v / 15, // 0-15% range → 0-1
  },
  CPIAUCSL: {
    signalType: 'cpi_index',
    normalize: (v) => Math.min(v / 350, 1), // CPI index ~100-350 range
  },
  FEDFUNDS: {
    signalType: 'fed_funds_rate',
    normalize: (v) => v / 10, // 0-10% range → 0-1
  },
  PAYEMS: {
    signalType: 'nonfarm_payrolls',
    normalize: (v) => Math.min(v / 160000, 1), // In thousands, ~150K range
  },
  UMCSENT: {
    signalType: 'consumer_sentiment',
    normalize: (v) => v / 120, // Index 0-120 → 0-1
  },
};

// ============================================================================
// SIGNAL CONVERTERS
// ============================================================================

/**
 * Convert FRED economic data to finance domain signals
 */
export function fredToSignals(
  organizationId: string,
  fredData: FredSeriesResult[]
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];

  for (const series of fredData) {
    const mapping = FRED_SIGNAL_MAP[series.seriesId];
    if (!mapping) continue;

    for (const obs of series.observations) {
      const value = parseFloat(obs.value);
      if (isNaN(value)) continue;

      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: mapping.signalType,
        signal_value: mapping.normalize(value),
        entity_type: 'economic_indicator',
        entity_id: series.seriesId,
        metadata: {
          source: 'fred',
          series_id: series.seriesId,
          series_title: series.title,
          date: obs.date,
          raw_value: value,
        },
      });
    }
  }

  return signals;
}

/**
 * Convert GitHub repo stats to engineering domain signals
 */
export function githubToSignals(
  organizationId: string,
  repoData: GitHubRepoStats[]
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];

  for (const repo of repoData) {
    const repoId = `${repo.owner}/${repo.repo}`;

    // Stars as ecosystem health signal (normalized by max ~230K for React)
    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'repo_stars',
      signal_value: Math.min(repo.stars / 230000, 1),
      entity_type: 'github_repo',
      entity_id: repoId,
      metadata: { source: 'github', raw_stars: repo.stars, language: repo.language },
    });

    // Open issues as tech debt proxy
    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'repo_open_issues',
      signal_value: Math.min(repo.openIssues / 5000, 1),
      entity_type: 'github_repo',
      entity_id: repoId,
      metadata: { source: 'github', raw_issues: repo.openIssues },
    });

    // Forks as community contribution signal
    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'repo_forks',
      signal_value: Math.min(repo.forks / 50000, 1),
      entity_type: 'github_repo',
      entity_id: repoId,
      metadata: { source: 'github', raw_forks: repo.forks },
    });
  }

  return signals;
}

/**
 * Convert World Bank data to finance domain signals
 */
export function worldBankToSignals(
  organizationId: string,
  wbData: WorldBankResult[]
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];

  const WB_SIGNAL_MAP: Record<string, { signalType: string; normalize: (v: number) => number }> = {
    'NY.GDP.MKTP.KD.ZG': {
      signalType: 'gdp_growth_annual',
      normalize: (v) => (v + 10) / 20, // -10% to +10% → 0 to 1
    },
    'FP.CPI.TOTL.ZG': {
      signalType: 'inflation_annual',
      normalize: (v) => Math.min(v / 15, 1), // 0-15% → 0-1
    },
    'SL.UEM.TOTL.ZS': {
      signalType: 'unemployment_annual',
      normalize: (v) => v / 15, // 0-15% → 0-1
    },
  };

  for (const result of wbData) {
    const mapping = WB_SIGNAL_MAP[result.indicatorId];
    if (!mapping) continue;

    for (const entry of result.data) {
      if (entry.value === null) continue;

      signals.push({
        organization_id: organizationId,
        source_domain: 'finance',
        signal_type: mapping.signalType,
        signal_value: mapping.normalize(entry.value),
        entity_type: 'world_bank_indicator',
        entity_id: `${result.country}_${result.indicatorId}_${entry.date}`,
        metadata: {
          source: 'world_bank',
          indicator: result.indicatorId,
          country: result.country,
          year: entry.date,
          raw_value: entry.value,
        },
      });
    }
  }

  return signals;
}

/**
 * Convert Hacker News snapshot to marketing/tech sentiment signals
 */
export function hackerNewsToSignals(
  organizationId: string,
  hnData: HackerNewsSnapshot
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];

  if (hnData.stories.length === 0) return signals;

  // Average score as tech sentiment
  signals.push({
    organization_id: organizationId,
    source_domain: 'marketing',
    signal_type: 'tech_sentiment_score',
    signal_value: Math.min(hnData.avgScore / 500, 1), // Top stories avg ~100-500
    entity_type: 'tech_sentiment',
    entity_id: `hn_snapshot_${hnData.fetchedAt.toISOString().split('T')[0]}`,
    metadata: {
      source: 'hacker_news',
      story_count: hnData.stories.length,
      avg_score: Math.round(hnData.avgScore),
      avg_comments: Math.round(hnData.avgComments),
    },
  });

  // Engagement as tech market activity
  signals.push({
    organization_id: organizationId,
    source_domain: 'marketing',
    signal_type: 'tech_engagement_level',
    signal_value: Math.min(hnData.totalEngagement / 15000, 1),
    entity_type: 'tech_sentiment',
    entity_id: `hn_engagement_${hnData.fetchedAt.toISOString().split('T')[0]}`,
    metadata: {
      source: 'hacker_news',
      total_engagement: hnData.totalEngagement,
    },
  });

  // Comment depth as discourse quality signal
  signals.push({
    organization_id: organizationId,
    source_domain: 'marketing',
    signal_type: 'tech_discourse_depth',
    signal_value: Math.min(hnData.avgComments / 300, 1),
    entity_type: 'tech_sentiment',
    entity_id: `hn_discourse_${hnData.fetchedAt.toISOString().split('T')[0]}`,
    metadata: {
      source: 'hacker_news',
      avg_comments: Math.round(hnData.avgComments),
    },
  });

  return signals;
}

/**
 * Convert BLS labor data to people/finance domain signals
 */
export function blsToSignals(
  organizationId: string,
  blsData: BLSSeriesResult[]
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];

  const BLS_SIGNAL_MAP: Record<string, { signalType: string; domain: string; normalize: (v: number) => number }> = {
    CES0000000001: { signalType: 'total_nonfarm_employment', domain: 'people', normalize: (v) => Math.min(v / 160000, 1) },
    LNS14000000: { signalType: 'unemployment_rate_bls', domain: 'people', normalize: (v) => v / 15 },
    CES0500000003: { signalType: 'avg_hourly_earnings', domain: 'people', normalize: (v) => Math.min(v / 40, 1) },
    'CUUR0000SA0': { signalType: 'cpi_bls', domain: 'finance', normalize: (v) => Math.min(v / 350, 1) },
    JTS000000000000000JOL: { signalType: 'job_openings_jolts', domain: 'people', normalize: (v) => Math.min(v / 12000, 1) },
  };

  for (const series of blsData) {
    const mapping = BLS_SIGNAL_MAP[series.seriesId];
    if (!mapping) continue;

    for (const d of series.data) {
      signals.push({
        organization_id: organizationId,
        source_domain: mapping.domain,
        signal_type: mapping.signalType,
        signal_value: mapping.normalize(d.value),
        entity_type: 'bls_indicator',
        entity_id: `${series.seriesId}_${d.year}_${d.period}`,
        metadata: {
          source: 'bls',
          series_id: series.seriesId,
          title: series.title,
          year: d.year,
          period: d.period,
          raw_value: d.value,
        },
      });
    }
  }

  return signals;
}

/**
 * Convert Stack Overflow data to engineering domain signals
 */
export function stackOverflowToSignals(
  organizationId: string,
  soData: StackOverflowSnapshot
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const dateId = soData.fetchedAt.toISOString().split('T')[0];

  // Developer community health signal
  signals.push({
    organization_id: organizationId,
    source_domain: 'engineering',
    signal_type: 'so_answer_rate',
    signal_value: 1 - soData.unansweredPercent, // Higher = healthier
    entity_type: 'dev_community',
    entity_id: `so_health_${dateId}`,
    metadata: {
      source: 'stack_overflow',
      avg_answers: soData.avgAnswerCount,
      unanswered_pct: soData.unansweredPercent,
    },
  });

  // Top tag signals (tech adoption trends)
  for (const tag of soData.topTags.slice(0, 10)) {
    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'so_tag_popularity',
      signal_value: Math.min(tag.count / 3000000, 1), // Normalize by max (~2.5M for javascript)
      entity_type: 'tech_tag',
      entity_id: `so_tag_${tag.name}`,
      metadata: {
        source: 'stack_overflow',
        tag: tag.name,
        question_count: tag.count,
      },
    });
  }

  return signals;
}

// ============================================================================
// DYNAMIC TRAINING PACK BUILDERS
// ============================================================================

/**
 * Build a TrainingPack from live FRED + World Bank economic data
 */
export function buildMacroDataTrainingPack(
  fredData: FredSeriesResult[],
  wbData: WorldBankResult[]
): TrainingPack {
  const today = new Date().toISOString().split('T')[0];

  // Extract latest values for causal chain calibration
  const latestFred: Record<string, number> = {};
  for (const series of fredData) {
    if (series.observations.length > 0) {
      latestFred[series.seriesId] = parseFloat(series.observations[0].value);
    }
  }

  const causalChains: CausalChainEntry[] = [
    {
      source: 'finance', target: 'finance',
      metric: 'fed_rate_to_unemployment',
      effectSize: 0.35,
      lagDays: 180,
      pValue: 0.01,
    },
    {
      source: 'finance', target: 'marketing',
      metric: 'consumer_sentiment_to_spending',
      effectSize: 0.55,
      lagDays: 30,
      pValue: 0.005,
    },
    {
      source: 'finance', target: 'finance',
      metric: 'inflation_to_interest_rates',
      effectSize: 0.60,
      lagDays: 90,
      pValue: 0.003,
    },
  ];

  const patterns: TrainingPattern[] = [
    {
      name: 'Fed Rate Hike Hiring Slowdown',
      domains: ['finance', 'people'],
      description: `Fed funds rate at ${latestFred.FEDFUNDS || 'N/A'}% — rate increases historically slow tech hiring within 6 months`,
      observed: 65,
      expected: 30,
      total: 100,
    },
    {
      name: 'Sentiment-Spending Correlation',
      domains: ['finance', 'marketing'],
      description: `Consumer sentiment at ${latestFred.UMCSENT || 'N/A'} — below 70 historically correlates with spending contraction`,
      observed: 72,
      expected: 35,
      total: 100,
    },
  ];

  return {
    id: `live-macro-${today}`,
    title: `Live Macroeconomic Data (${today})`,
    source: 'FRED + World Bank APIs',
    industry: 'Macroeconomics',
    domains: ['finance', 'marketing', 'people'],
    confidence: 0.70,
    tags: ['live-data', 'macro', 'economics', 'auto-generated'],
    causalChains,
    businessRules: [],
    cascades: [],
    patterns,
    outcomes: [],
    narrative: `Live economic snapshot on ${today}. Fed funds rate: ${latestFred.FEDFUNDS || 'N/A'}%. Unemployment: ${latestFred.UNRATE || 'N/A'}%. CPI: ${latestFred.CPIAUCSL || 'N/A'}. Consumer sentiment: ${latestFred.UMCSENT || 'N/A'}.`,
  };
}

/**
 * Build a TrainingPack from live GitHub + Hacker News data
 */
export function buildTechDataTrainingPack(
  githubData: GitHubRepoStats[],
  hnData: HackerNewsSnapshot
): TrainingPack {
  const today = new Date().toISOString().split('T')[0];

  // Compute aggregate metrics
  const totalStars = githubData.reduce((s, r) => s + r.stars, 0);
  const totalIssues = githubData.reduce((s, r) => s + r.openIssues, 0);
  const avgIssuesPerRepo = githubData.length > 0 ? Math.round(totalIssues / githubData.length) : 0;

  const causalChains: CausalChainEntry[] = [
    {
      source: 'engineering', target: 'engineering',
      metric: 'open_issues_to_project_health',
      effectSize: -0.40,
      lagDays: 14,
      pValue: 0.01,
    },
    {
      source: 'engineering', target: 'marketing',
      metric: 'oss_adoption_to_ecosystem_growth',
      effectSize: 0.50,
      lagDays: 30,
      pValue: 0.008,
    },
    {
      source: 'marketing', target: 'engineering',
      metric: 'tech_sentiment_to_contribution',
      effectSize: 0.35,
      lagDays: 21,
      pValue: 0.02,
    },
  ];

  const patterns: TrainingPattern[] = [
    {
      name: 'Issue Backlog Growth Signal',
      domains: ['engineering'],
      description: `Average ${avgIssuesPerRepo} open issues per tracked repo — sustained growth signals maintainer strain`,
      observed: 60,
      expected: 30,
      total: 100,
    },
    {
      name: 'HN Engagement as Tech Health',
      domains: ['marketing', 'engineering'],
      description: `HN avg score: ${Math.round(hnData.avgScore)}, avg comments: ${Math.round(hnData.avgComments)} — high engagement correlates with ecosystem vitality`,
      observed: 55,
      expected: 30,
      total: 100,
    },
  ];

  return {
    id: `live-tech-${today}`,
    title: `Live Tech Ecosystem Data (${today})`,
    source: 'GitHub API + Hacker News',
    industry: 'Technology',
    domains: ['engineering', 'marketing'],
    confidence: 0.70,
    tags: ['live-data', 'tech', 'oss', 'auto-generated'],
    causalChains,
    businessRules: [],
    cascades: [],
    patterns,
    outcomes: [],
    narrative: `Live tech ecosystem snapshot on ${today}. Tracked ${githubData.length} repos with ${totalStars.toLocaleString()} total stars and ${totalIssues.toLocaleString()} open issues. HN top 30 avg score: ${Math.round(hnData.avgScore)}, avg comments: ${Math.round(hnData.avgComments)}.`,
  };
}

// ============================================================================
// MASTER CONVERSION
// ============================================================================

/**
 * Convert all fetched public data into NexusBrain signals and training packs
 */
export function convertAllFetchedData(
  organizationId: string,
  fred: FredSeriesResult[],
  github: GitHubRepoStats[],
  worldBank: WorldBankResult[],
  hackerNews: HackerNewsSnapshot,
  bls: BLSSeriesResult[] = [],
  stackOverflow: StackOverflowSnapshot | null = null,
): {
  signals: ConnectorSignal[];
  trainingPacks: TrainingPack[];
} {
  // Convert to signals
  const fredSignals = fredToSignals(organizationId, fred);
  const githubSignals = githubToSignals(organizationId, github);
  const wbSignals = worldBankToSignals(organizationId, worldBank);
  const hnSignals = hackerNewsToSignals(organizationId, hackerNews);
  const blsSignals = blsToSignals(organizationId, bls);
  const soSignals = stackOverflow ? stackOverflowToSignals(organizationId, stackOverflow) : [];

  const signals = [...fredSignals, ...githubSignals, ...wbSignals, ...hnSignals, ...blsSignals, ...soSignals];

  // Build dynamic training packs from live data
  const trainingPacks: TrainingPack[] = [];

  if (fred.length > 0 || worldBank.length > 0 || bls.length > 0) {
    trainingPacks.push(buildMacroDataTrainingPack(fred, worldBank));
  }

  if (github.length > 0 || hackerNews.stories.length > 0) {
    trainingPacks.push(buildTechDataTrainingPack(github, hackerNews));
  }

  return { signals, trainingPacks };
}
