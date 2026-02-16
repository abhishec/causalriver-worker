/**
 * NexusBrain Autonomous Training Agent (V6 Manus)
 *
 * Brain Region: Sensory Cortex (Region #10)
 * Neurological Function: Public Data Learning
 *
 * Continuously trains the NexusBrain causal intelligence engine using free public data.
 * Data sources: FRED, GitHub, World Bank, Hacker News, BLS, Stack Overflow, Wikipedia, IMF, USPTO.
 *
 * V6 Template: Auto-wires 11 brain regions, Motor Command Engine (Manus), Calibration Loop, OpenClaw.
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';

// Training data fetchers
import {
  fetchFredSeries,
  fetchGitHubRepoStats,
  fetchWorldBankIndicators,
  fetchHackerNewsTop,
  fetchBLSSeries,
  fetchStackOverflowTrends,
  fetchWikipediaPageviews,
  fetchIMFWorldEconomicOutlook,
  fetchUSPTOPatentTrends,
  fetchWikipediaContent,
  type FredSeriesResult,
  type GitHubRepoStats,
  type WorldBankResult,
  type HackerNewsSnapshot,
  type BLSSeriesResult,
  type StackOverflowSnapshot,
  type WikiPageviewResult,
  type IMFIndicatorResult,
  type PatentTrendResult,
  type WikiArticleContent,
} from '../training-data/public-data-fetchers';

// Training pack factories
import { convertAllFetchedData } from '../training-data/training-pack-factory';
import { wikiContentToSignals, buildWikiTrainingPacks } from '../training-data/wikipedia-knowledge-packs';

// Static training packs
import { MACRO_ECONOMIC_PACKS } from '../training-data/macro-economic-packs';
import { TECH_INDUSTRY_PACKS } from '../training-data/tech-industry-packs';
import { BUSINESS_CASE_STUDY_PACKS } from '../training-data/business-case-study-packs';
import { SALES_AND_REVENUE_PACKS } from '../training-data/sales-and-revenue-packs';
import { PEOPLE_AND_CULTURE_PACKS } from '../training-data/people-and-culture-packs';
import { STRATEGY_AND_SCALING_PACKS } from '../training-data/strategy-and-scaling-packs';
import { INDUSTRY_VERTICAL_PACKS } from '../training-data/industry-vertical-packs';
import { OPERATIONS_DEEP_DIVE_PACKS } from '../training-data/operations-deep-dive-packs';
import { ADVANCED_CAUSAL_PACKS } from '../training-data/advanced-causal-packs';
import { VC_METRICS_PACKS } from '../training-data/vc-metrics-packs';
import { DERIVATIVES_OPTIONS_PRICING_PACKS } from '../training-data/derivatives-options-pricing-packs';
import { NETWORK_EFFECTS_PLATFORM_PACKS } from '../training-data/network-effects-platform-packs';
import { SYSTEM_DYNAMICS_SIMULATION_PACKS } from '../training-data/system-dynamics-simulation-packs';
import { ADVANCED_CAUSAL_INFERENCE_PACKS } from '../training-data/advanced-causal-inference-packs';
import { GAME_THEORY_MECHANISM_DESIGN_PACKS } from '../training-data/game-theory-mechanism-design-packs';
import { OPTIMIZATION_OPERATIONS_RESEARCH_PACKS } from '../training-data/optimization-operations-research-packs';
import { CODE_ANALYSIS_OPEN_SOURCE_PACKS } from '../training-data/code-analysis-open-source-packs';

// ────────────────────────────────────────────────────────────────────────────
// Autonomous Trainer Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

interface FetchedData {
  fred: FredSeriesResult[];
  github: GitHubRepoStats[];
  worldBank: WorldBankResult[];
  hackerNews: HackerNewsSnapshot;
  bls: BLSSeriesResult[];
  stackOverflow: StackOverflowSnapshot | null;
  wikipedia: WikiPageviewResult[];
  imf: IMFIndicatorResult[];
  patents: PatentTrendResult[];
  wikiContent: WikiArticleContent[];
}

export class AutonomousTrainerAgent extends ManusNativeAgent {
  readonly name = 'autonomous-trainer';
  readonly version = '7.0.0';
  readonly description = 'Trains the core brain on public data from 10 sources (FRED, GitHub, World Bank, HN, BLS, SO, Wikipedia, IMF, USPTO)';
  readonly brainRegion = 'Sensory Cortex (Region #10)';
  readonly neurologicalFunction = 'Public Data Learning';

  // ── Fetch: Pull data from 10 public sources ──
  async fetch(): Promise<FetchResult> {
    this.log('Fetching public data from 10 sources...');

    const results = await Promise.allSettled([
      fetchFredSeries(undefined, process.env.FRED_API_KEY || 'DEMO_KEY'),
      fetchGitHubRepoStats(),
      fetchWorldBankIndicators(),
      fetchHackerNewsTop(),
      fetchBLSSeries(),
      fetchStackOverflowTrends(),
      fetchWikipediaPageviews(),
      fetchIMFWorldEconomicOutlook(),
      fetchUSPTOPatentTrends(),
      fetchWikipediaContent(),
    ]);

    const fetchedData: FetchedData = {
      fred: results[0].status === 'fulfilled' ? results[0].value : [],
      github: results[1].status === 'fulfilled' ? results[1].value : [],
      worldBank: results[2].status === 'fulfilled' ? results[2].value : [],
      hackerNews: results[3].status === 'fulfilled'
        ? results[3].value
        : { topStoryIds: [], stories: [], avgScore: 0, avgComments: 0, totalEngagement: 0, fetchedAt: new Date() },
      bls: results[4].status === 'fulfilled' ? results[4].value : [],
      stackOverflow: results[5].status === 'fulfilled' ? results[5].value : null,
      wikipedia: results[6].status === 'fulfilled' ? results[6].value : [],
      imf: results[7].status === 'fulfilled' ? results[7].value : [],
      patents: results[8].status === 'fulfilled' ? results[8].value : [],
      wikiContent: results[9].status === 'fulfilled' ? results[9].value : [],
    };

    const totalSources = [
      fetchedData.fred,
      fetchedData.github,
      fetchedData.worldBank,
      fetchedData.hackerNews.stories,
      fetchedData.bls,
      fetchedData.stackOverflow?.topTags || [],
      fetchedData.wikipedia,
      fetchedData.imf,
      fetchedData.patents,
      fetchedData.wikiContent,
    ].filter(a => a.length > 0).length;

    this.log(`${totalSources}/10 data sources available`);

    return { data: fetchedData, sources: ['fred', 'github', 'worldbank', 'hackernews', 'bls', 'stackoverflow', 'wikipedia', 'imf', 'uspto', 'wikipedia-content'], recordCount: totalSources };
  }

  // ── Convert: Transform fetched data into signals + training packs ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.data) {
      return { signals: [], packs: [] };
    }

    const fetched = fetchResult.data as FetchedData;

    // Convert core data sources
    const { signals, trainingPacks: dynamicPacks } = convertAllFetchedData(
      this.organizationId,
      fetched.fred,
      fetched.github,
      fetched.worldBank,
      fetched.hackerNews,
      fetched.bls,
      fetched.stackOverflow,
    );

    // Wikipedia pageviews → marketing/brand signals
    for (const wiki of fetched.wikipedia) {
      for (const day of wiki.dailyViews) {
        signals.push({
          organization_id: this.organizationId,
          source: 'wikipedia',
          connector_type: 'wikipedia_pageviews',
          signal_type: `pageviews_${wiki.article.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          signal_value: day.views,
          signal_timestamp: new Date(`${day.date.substring(0, 4)}-${day.date.substring(4, 6)}-${day.date.substring(6, 8)}`),
          source_domain: 'marketing',
          entity_type: 'topic',
          entity_id: wiki.article,
          metadata: { source: 'wikipedia', article: wiki.article },
        });
      }
    }

    // IMF WEO → global macro finance signals
    for (const indicator of fetched.imf) {
      for (const val of indicator.values) {
        if (val.value !== null) {
          signals.push({
            organization_id: this.organizationId,
            source: 'imf',
            connector_type: 'imf_weo',
            signal_type: `imf_${indicator.indicator.toLowerCase()}_${indicator.country.toLowerCase()}`,
            signal_value: val.value,
            signal_timestamp: new Date(`${val.year}-06-15`),
            source_domain: 'finance',
            entity_type: 'country',
            entity_id: indicator.country,
            metadata: { source: 'imf_weo', indicator: indicator.indicatorLabel, country: indicator.country },
          });
        }
      }
    }

    // USPTO Patents → innovation/engineering signals
    for (const year of fetched.patents) {
      signals.push({
        organization_id: this.organizationId,
        source: 'uspto',
        connector_type: 'patent_trends',
        signal_type: 'annual_patent_count',
        signal_value: year.totalPatents,
        signal_timestamp: new Date(`${year.year}-12-31`),
        source_domain: 'engineering',
        entity_type: 'innovation',
        entity_id: `patents_${year.year}`,
        metadata: { source: 'uspto', year: year.year, avgCitations: year.avgCitationCount },
      });
    }

    // Wikipedia CONTENT → real knowledge signals
    if (fetched.wikiContent.length > 0) {
      const wikiKnowledgeSignals = wikiContentToSignals(this.organizationId, fetched.wikiContent);
      signals.push(...wikiKnowledgeSignals);

      const wikiPacks = buildWikiTrainingPacks(fetched.wikiContent);
      dynamicPacks.push(...wikiPacks);
    }

    // Static training packs (17 collections, always available)
    const staticPacks: TrainingPack[] = [
      ...MACRO_ECONOMIC_PACKS,
      ...TECH_INDUSTRY_PACKS,
      ...BUSINESS_CASE_STUDY_PACKS,
      ...SALES_AND_REVENUE_PACKS,
      ...PEOPLE_AND_CULTURE_PACKS,
      ...STRATEGY_AND_SCALING_PACKS,
      ...INDUSTRY_VERTICAL_PACKS,
      ...OPERATIONS_DEEP_DIVE_PACKS,
      ...ADVANCED_CAUSAL_PACKS,
      ...VC_METRICS_PACKS,
      ...DERIVATIVES_OPTIONS_PRICING_PACKS,
      ...NETWORK_EFFECTS_PLATFORM_PACKS,
      ...SYSTEM_DYNAMICS_SIMULATION_PACKS,
      ...ADVANCED_CAUSAL_INFERENCE_PACKS,
      ...GAME_THEORY_MECHANISM_DESIGN_PACKS,
      ...OPTIMIZATION_OPERATIONS_RESEARCH_PACKS,
      ...CODE_ANALYSIS_OPEN_SOURCE_PACKS,
    ];

    const allPacks = [...dynamicPacks, ...staticPacks];

    this.log(`Converted: ${signals.length} signals, ${dynamicPacks.length} dynamic packs, ${staticPacks.length} static packs`);

    return {
      signals,
      packs: allPacks,
    };
  }

  // ── Motor Commands: Define agent-specific actions ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];

    // Slack notification on successful training
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID && trainResult.signalsStored > 0) {
      commands.push({
        commandId: `slack-training-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `✅ *Autonomous Trainer Complete*\n• Signals: ${trainResult.signalsStored}\n• Packs Trained: ${trainResult.packsProcessed}\n• Brain Region: ${this.brainRegion}`,
        },
        priority: 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }

    return commands;
  }
}

// ── Self-Registration: Auto-register to globalRegistry on import ──────────
import { createClient } from '@supabase/supabase-js';
import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'autonomous-trainer',
  description: 'Trains the core brain on public data from 10 sources (FRED, GitHub, World Bank, HN, BLS, SO, Wikipedia, IMF, USPTO)',
  version: '7.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    const agent = new AutonomousTrainerAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', { verbose: config.verbose });
    return agent as any;
  },
  schedule: '0 */6 * * *',  // Every 6 hours
  resourceRequirements: { cpu: '1024', memory: '4096' },
  tags: ['training', 'sensory-cortex', 'public-data'],
});
