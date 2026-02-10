/**
 * NexusBrain Federated Brain Trainer
 *
 * A standalone training pipeline that fetches real-world knowledge from
 * Wikipedia (270+ articles), 10 public APIs, and 51+ curated training packs,
 * then trains the federated causal intelligence brain through all 7 layers
 * and verifies Expert-level performance.
 *
 * 7-Stage Pipeline:
 *   STAGE 1:   FETCH     — Wikipedia Content + 10 Public APIs (FRED, GitHub, etc.)
 *   STAGE 2:   LOAD      — 80+ Static Packs + 10 Built-in Library Packs
 *   STAGE 3:   CONVERT   — All data → ConnectorSignals + TrainingPacks
 *   STAGE 3.5: NLP       — Raw Wikipedia text → NLP Pipeline → additional TrainingPacks
 *   STAGE 4:   TRAIN     — Feed everything through brain-trainer (in-memory)
 *   STAGE 5:   BENCHMARK — Run full 7-layer suite with federated discovery
 *   STAGE 6:   REPORT    — Display per-layer Expert status
 *
 * No Supabase required — runs entirely in-memory (Tier 1).
 * Optionally persists to Supabase if credentials are available.
 *
 * Usage:
 *   # Full run (fetches Wikipedia + 10 APIs + trains + benchmarks)
 *   pnpm exec tsx scripts/federated-brain-trainer.ts
 *
 *   # Offline mode (static packs only, no network required)
 *   pnpm exec tsx scripts/federated-brain-trainer.ts --offline
 *
 *   # Verbose output
 *   pnpm exec tsx scripts/federated-brain-trainer.ts --verbose
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Load .env (zero-dependency) ──
function loadEnv(): void {
  try {
    const envPath = resolve(import.meta.dirname || __dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env not found — rely on environment variables
  }
}
loadEnv();

// ── NexusBrain Core Imports ──
import { createBrainTrainer, type TrainingPack } from '../packages/memory-stack/src/learning/brain-trainer';
import { getAllTrainingPacks } from '../packages/memory-stack/src/learning/training-library';
import { createBenchmarkRunner } from '../packages/memory-stack/src/benchmarks/benchmark-runner';
import type { ConnectorSignal } from '../packages/memory-stack/src/connectors/connector-framework';

// ── Training Data: Public API Fetchers ──
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
  type FredSeriesResult,
  type GitHubRepoStats,
  type WorldBankResult,
  type HackerNewsSnapshot,
  type BLSSeriesResult,
  type StackOverflowSnapshot,
  type WikiPageviewResult,
  type IMFIndicatorResult,
  type PatentTrendResult,
} from './training-data/public-data-fetchers';

import { convertAllFetchedData } from './training-data/training-pack-factory';

// ── Training Data: Wikipedia Content ──
import { fetchWikipediaContent, type WikiArticleContent } from './training-data/wikipedia-content-fetcher';
import { wikiContentToSignals, buildWikiTrainingPacks } from './training-data/wikipedia-knowledge-packs';

// ── NLP Pipeline ──
import { processDocuments } from '../packages/memory-stack/src/core/nlp';

// ── Training Data: Static Packs (10 domain modules, 41+ packs) ──
import { MACRO_ECONOMIC_PACKS } from './training-data/macro-economic-packs';
import { TECH_INDUSTRY_PACKS } from './training-data/tech-industry-packs';
import { BUSINESS_CASE_STUDY_PACKS } from './training-data/business-case-study-packs';
import { SALES_AND_REVENUE_PACKS } from './training-data/sales-and-revenue-packs';
import { PEOPLE_AND_CULTURE_PACKS } from './training-data/people-and-culture-packs';
import { STRATEGY_AND_SCALING_PACKS } from './training-data/strategy-and-scaling-packs';
import { INDUSTRY_VERTICAL_PACKS } from './training-data/industry-vertical-packs';
import { OPERATIONS_DEEP_DIVE_PACKS } from './training-data/operations-deep-dive-packs';
import { ADVANCED_CAUSAL_PACKS } from './training-data/advanced-causal-packs';
import { VC_METRICS_PACKS } from './training-data/vc-metrics-packs';
import { ACCOUNTING_FINANCE_PACKS } from './training-data/accounting-finance-packs';
import { SUPPLY_CHAIN_OPS_PACKS } from './training-data/supply-chain-ops-packs';
import { LEGAL_COMPLIANCE_PACKS } from './training-data/legal-compliance-packs';
import { BEHAVIORAL_ECONOMICS_PACKS } from './training-data/behavioral-economics-packs';
import { DATA_SCIENCE_ANALYTICS_PACKS } from './training-data/data-science-analytics-packs';
import { VERTICAL_DEEP_DIVE_PACKS } from './training-data/vertical-deep-dive-packs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001';
const FRED_API_KEY = process.env.FRED_API_KEY || 'DEMO_KEY';
const IS_OFFLINE = process.argv.includes('--offline') || process.argv.includes('--no-fetch');
const IS_VERBOSE = process.argv.includes('--verbose');

// ============================================================================
// LOGGING
// ============================================================================

function log(stage: string, message: string): void {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[${time}] [${stage}] ${message}`);
}

function logVerbose(stage: string, message: string): void {
  if (IS_VERBOSE) log(stage, message);
}

function logError(stage: string, message: string, err?: unknown): void {
  const time = new Date().toISOString().substring(11, 19);
  console.error(`[${time}] [${stage}] ERROR: ${message}`);
  if (err instanceof Error) console.error(`  ${err.message}`);
}

function divider(title: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}\n`);
}

function banner(): void {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     NexusBrain Federated Brain Trainer                  ║');
  console.log('║     CauseME + CausalRiver + 7-Layer Intelligence       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Mode: ${IS_OFFLINE ? 'OFFLINE (static packs only)' : 'FULL (Wikipedia + 10 APIs + static packs)'}`);
  console.log(`  Verbose: ${IS_VERBOSE ? 'ON' : 'OFF'}`);
  console.log('');
}

// ============================================================================
// STAGE 1: FETCH REAL-WORLD DATA
// ============================================================================

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

function emptyFetchedData(): FetchedData {
  return {
    fred: [], github: [], worldBank: [],
    hackerNews: { topStoryIds: [], stories: [], avgScore: 0, avgComments: 0, totalEngagement: 0, fetchedAt: new Date() },
    bls: [], stackOverflow: null, wikipedia: [], imf: [], patents: [], wikiContent: [],
  };
}

async function fetchAllPublicData(): Promise<FetchedData> {
  if (IS_OFFLINE) {
    log('FETCH', 'Skipping API fetches (offline mode)');
    return emptyFetchedData();
  }

  divider('STAGE 1: FETCH REAL-WORLD DATA');
  log('FETCH', 'Fetching from 10 public data sources + Wikipedia content...');

  const results = await Promise.allSettled([
    fetchFredSeries(undefined, FRED_API_KEY).then(r => { log('FETCH', `FRED: ${r.length} series`); return r; }),
    fetchGitHubRepoStats().then(r => { log('FETCH', `GitHub: ${r.length} repos`); return r; }),
    fetchWorldBankIndicators().then(r => { log('FETCH', `World Bank: ${r.length} indicators`); return r; }),
    fetchHackerNewsTop().then(r => { log('FETCH', `Hacker News: ${r.stories.length} stories`); return r; }),
    fetchBLSSeries().then(r => { log('FETCH', `BLS: ${r.length} series`); return r; }),
    fetchStackOverflowTrends().then(r => { log('FETCH', `Stack Overflow: ${r.topTags.length} tags`); return r; }),
    fetchWikipediaPageviews().then(r => { log('FETCH', `Wikipedia Pageviews: ${r.length} articles`); return r; }),
    fetchIMFWorldEconomicOutlook().then(r => { log('FETCH', `IMF WEO: ${r.length} indicator/country pairs`); return r; }),
    fetchUSPTOPatentTrends().then(r => { log('FETCH', `USPTO: ${r.length} years of patents`); return r; }),
    fetchWikipediaContent().then(r => { log('FETCH', `Wikipedia Content: ${r.length} full articles extracted`); return r; }),
  ]);

  const fred = results[0].status === 'fulfilled' ? results[0].value : [];
  const github = results[1].status === 'fulfilled' ? results[1].value : [];
  const worldBank = results[2].status === 'fulfilled' ? results[2].value : [];
  const hackerNews = results[3].status === 'fulfilled'
    ? results[3].value
    : { topStoryIds: [], stories: [], avgScore: 0, avgComments: 0, totalEngagement: 0, fetchedAt: new Date() };
  const bls = results[4].status === 'fulfilled' ? results[4].value : [];
  const stackOverflow = results[5].status === 'fulfilled' ? results[5].value : null;
  const wikipedia = results[6].status === 'fulfilled' ? results[6].value : [];
  const imf = results[7].status === 'fulfilled' ? results[7].value : [];
  const patents = results[8].status === 'fulfilled' ? results[8].value : [];
  const wikiContent = results[9].status === 'fulfilled' ? results[9].value : [];

  // Log failures
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      const names = ['FRED', 'GitHub', 'World Bank', 'Hacker News', 'BLS', 'Stack Overflow', 'Wikipedia', 'IMF', 'USPTO', 'Wikipedia Content'];
      logError('FETCH', `${names[i]} failed`, (results[i] as PromiseRejectedResult).reason);
    }
  }

  const sources = [fred, github, worldBank, hackerNews.stories, bls, stackOverflow?.topTags || [], wikipedia, imf, patents, wikiContent];
  const available = sources.filter(a => a.length > 0).length;
  log('FETCH', `${available}/10 data sources available`);

  return { fred, github, worldBank, hackerNews, bls, stackOverflow, wikipedia, imf, patents, wikiContent };
}

// ============================================================================
// STAGE 2: LOAD ALL TRAINING PACKS
// ============================================================================

interface LoadedPacks {
  libraryPacks: TrainingPack[];
  staticPacks: TrainingPack[];
}

function loadAllTrainingPacks(): LoadedPacks {
  divider('STAGE 2: LOAD TRAINING PACKS');

  // 10 built-in curated packs (SaaS patterns, payment spirals, etc.)
  const libraryPacks = getAllTrainingPacks();
  log('LOAD', `Built-in library: ${libraryPacks.length} packs`);

  // 41+ static domain packs (macro-economic, tech, business, etc.)
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
    ...ACCOUNTING_FINANCE_PACKS,
    ...SUPPLY_CHAIN_OPS_PACKS,
    ...LEGAL_COMPLIANCE_PACKS,
    ...BEHAVIORAL_ECONOMICS_PACKS,
    ...DATA_SCIENCE_ANALYTICS_PACKS,
    ...VERTICAL_DEEP_DIVE_PACKS,
  ];
  log('LOAD', `Static modules: ${staticPacks.length} packs across 16 domains`);

  // Deduplicate by ID (library takes priority)
  const seenIds = new Set(libraryPacks.map(p => p.id));
  const deduped = staticPacks.filter(p => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  log('LOAD', `Total unique packs: ${libraryPacks.length + deduped.length}`);
  return { libraryPacks, staticPacks: deduped };
}

// ============================================================================
// STAGE 3: CONVERT TO NEXUSBRAIN FORMAT
// ============================================================================

interface ConvertedData {
  signals: ConnectorSignal[];
  dynamicPacks: TrainingPack[];
}

function convertToNexusBrainFormat(fetched: FetchedData): ConvertedData {
  divider('STAGE 3: CONVERT TO NEXUSBRAIN FORMAT');

  if (IS_OFFLINE) {
    log('CONVERT', 'Offline mode — no dynamic data to convert');
    return { signals: [], dynamicPacks: [] };
  }

  // Convert base API data → signals + dynamic packs
  const { signals, trainingPacks: dynamicPacks } = convertAllFetchedData(
    ORGANIZATION_ID,
    fetched.fred,
    fetched.github,
    fetched.worldBank,
    fetched.hackerNews,
    fetched.bls,
    fetched.stackOverflow,
  );
  log('CONVERT', `Base APIs: ${signals.length} signals, ${dynamicPacks.length} packs`);

  // Wikipedia pageviews → marketing/brand interest signals
  for (const wiki of fetched.wikipedia) {
    for (const day of wiki.dailyViews) {
      signals.push({
        organization_id: ORGANIZATION_ID,
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
  logVerbose('CONVERT', `Wikipedia pageviews: ${fetched.wikipedia.reduce((s, w) => s + w.dailyViews.length, 0)} signals`);

  // IMF WEO → global macro finance signals
  for (const indicator of fetched.imf) {
    for (const val of indicator.values) {
      if (val.value !== null) {
        signals.push({
          organization_id: ORGANIZATION_ID,
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

  // USPTO patents → innovation/engineering signals
  for (const year of fetched.patents) {
    signals.push({
      organization_id: ORGANIZATION_ID,
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

  // Wikipedia CONTENT → knowledge signals + training packs
  if (fetched.wikiContent.length > 0) {
    const wikiSignals = wikiContentToSignals(ORGANIZATION_ID, fetched.wikiContent);
    signals.push(...wikiSignals);
    log('CONVERT', `Wikipedia Content: ${wikiSignals.length} knowledge signals from ${fetched.wikiContent.length} articles`);

    const wikiPacks = buildWikiTrainingPacks(fetched.wikiContent);
    dynamicPacks.push(...wikiPacks);
    log('CONVERT', `Wikipedia Content: ${wikiPacks.length} domain training packs`);
  }

  log('CONVERT', `Total: ${signals.length} signals, ${dynamicPacks.length} dynamic packs`);
  return { signals, dynamicPacks };
}

// ============================================================================
// STAGE 3.5: NLP DEEP PROCESSING
// ============================================================================

function runNLPPipeline(fetched: FetchedData, converted: ConvertedData): TrainingPack[] {
  if (IS_OFFLINE || fetched.wikiContent.length === 0) {
    logVerbose('NLP', 'Skipping NLP pipeline (no wiki content available)');
    return [];
  }

  divider('STAGE 3.5: NLP DEEP PROCESSING');
  log('NLP', `Processing ${fetched.wikiContent.length} Wikipedia articles through NLP pipeline...`);

  // Build document inputs from wiki content
  const documents = fetched.wikiContent.map(article => {
    const fullText = [
      article.extract || '',
      ...article.sections.map(s => `${s.title}. ${s.content}`),
    ].join('\n\n');

    return {
      text: fullText,
      id: `wiki-${article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: article.title,
      domain: article.domain || 'strategy',
    };
  });

  const nlpPacks = processDocuments(documents, {
    chunkSize: 512,
    chunkOverlap: 64,
    maxCausalStatements: 30,
    maxRelationships: 50,
  });

  log('NLP', `NLP pipeline produced ${nlpPacks.length} training packs from ${documents.length} articles`);

  // Add NLP packs to the dynamic packs
  converted.dynamicPacks.push(...nlpPacks);

  return nlpPacks;
}

// ============================================================================
// STAGE 4: TRAIN BRAIN IN-MEMORY
// ============================================================================

interface TrainingResult {
  totalPacks: number;
  trainedPacks: number;
  causalEdges: number;
  patterns: number;
  rules: number;
  cascades: number;
  outcomes: number;
  errors: string[];
}

function trainBrainInMemory(
  loaded: LoadedPacks,
  converted: ConvertedData,
): TrainingResult {
  divider('STAGE 4: TRAIN BRAIN (IN-MEMORY)');

  const trainer = createBrainTrainer();
  const result: TrainingResult = {
    totalPacks: 0, trainedPacks: 0,
    causalEdges: 0, patterns: 0, rules: 0, cascades: 0, outcomes: 0,
    errors: [],
  };

  const allPacks: Array<{ category: string; pack: TrainingPack }> = [
    ...loaded.libraryPacks.map(p => ({ category: 'library', pack: p })),
    ...loaded.staticPacks.map(p => ({ category: 'static', pack: p })),
    ...converted.dynamicPacks.map(p => ({ category: 'dynamic', pack: p })),
  ];

  result.totalPacks = allPacks.length;

  for (const { category, pack } of allPacks) {
    try {
      trainer.trainInMemory(pack);
      result.trainedPacks++;
      logVerbose('TRAIN', `  [${category}] ${pack.id} ✓`);
    } catch (err) {
      logError('TRAIN', `  [${category}] ${pack.id} failed`, err);
      result.errors.push(`${category}/${pack.id}`);
    }
  }

  const stats = trainer.getTrainingStats();
  result.causalEdges = stats.causalEdgesLoaded;
  result.patterns = stats.patternsLoaded;
  result.rules = stats.rulesLoaded;
  result.cascades = stats.cascadesLoaded;
  result.outcomes = stats.outcomesLoaded;

  log('TRAIN', `Trained ${result.trainedPacks}/${result.totalPacks} packs successfully`);
  log('TRAIN', `  Causal edges: ${result.causalEdges}`);
  log('TRAIN', `  Patterns: ${result.patterns}`);
  log('TRAIN', `  Rules: ${result.rules}`);
  log('TRAIN', `  Cascades: ${result.cascades}`);
  log('TRAIN', `  Outcomes: ${result.outcomes}`);
  if (result.errors.length > 0) {
    log('TRAIN', `  Errors: ${result.errors.length}`);
  }

  return result;
}

// ============================================================================
// STAGE 5: BENCHMARK 7-LAYER SUITE
// ============================================================================

function runBenchmarkSuite() {
  divider('STAGE 5: BENCHMARK (7-LAYER FEDERATED SUITE)');

  log('BENCH', 'Running full benchmark suite with federated discovery method...');
  log('BENCH', '  Datasets: Sachs, SaaS, Cascade, Anomaly');
  log('BENCH', '  Method: federated (CauseME + CausalRiver + NexusBrain)');
  log('BENCH', '');

  const runner = createBenchmarkRunner({
    benchmarks: ['sachs', 'saas', 'cascade', 'anomaly'],
    discoveryConfig: { method: 'federated' as any },
    trainFromResults: true,
    trainFromLibrary: true,
    verbose: IS_VERBOSE,
    datasetConfig: {
      sachsObservations: 200,
      saasDays: 365,
      cascadeDays: 365,
      cascadeCount: 3,
      anomalySeriesCount: 5,
      anomalyPointsPerSeries: 200,
      anomalyAnomaliesPerSeries: 5,
    },
  });

  const report = runner.runFullSuite();
  return report;
}

// ============================================================================
// STAGE 6: REPORT
// ============================================================================

function displayReport(
  fetched: FetchedData,
  loaded: LoadedPacks,
  converted: ConvertedData,
  nlpPacks: TrainingPack[],
  training: TrainingResult,
  benchmark: ReturnType<typeof runBenchmarkSuite>,
): void {
  divider('STAGE 6: RESULTS');

  // ── Data Sources ──
  console.log('  DATA SOURCES:');
  if (!IS_OFFLINE) {
    console.log(`    Wikipedia Content:   ${fetched.wikiContent.length} articles (finance, engineering, business, VC, AI/ML)`);
    const apiCount = [fetched.fred, fetched.github, fetched.worldBank, fetched.hackerNews.stories, fetched.bls, fetched.stackOverflow?.topTags || [], fetched.wikipedia, fetched.imf, fetched.patents].filter(a => a.length > 0).length;
    console.log(`    Public APIs:         ${apiCount}/9 sources (FRED, GitHub, World Bank, HN, BLS, SO, IMF, USPTO, Wiki)`);
    console.log(`    Dynamic Signals:     ${converted.signals.length}`);
    console.log(`    Dynamic Packs:       ${converted.dynamicPacks.length}`);
    if (nlpPacks.length > 0) {
      console.log(`    NLP Packs:           ${nlpPacks.length} (raw text → causal knowledge)`);
    }
  } else {
    console.log('    (Offline mode — no API data fetched)');
  }
  console.log(`    Library Packs:       ${loaded.libraryPacks.length} curated`);
  console.log(`    Static Packs:        ${loaded.staticPacks.length} across 10 domains`);
  console.log('');

  // ── Training ──
  console.log('  BRAIN TRAINING:');
  console.log(`    Packs Trained:       ${training.trainedPacks}/${training.totalPacks}`);
  console.log(`    Causal Edges:        ${training.causalEdges}`);
  console.log(`    Patterns:            ${training.patterns}`);
  console.log(`    Rules:               ${training.rules}`);
  console.log(`    Cascades:            ${training.cascades}`);
  console.log(`    Outcomes:            ${training.outcomes}`);
  console.log('');

  // ── Benchmark Results (THE KEY OUTPUT) ──
  console.log('  7-LAYER BENCHMARK:');
  console.log(`    Discovery Method:    ${benchmark.maturity.discoveryMethod}`);
  console.log(`    Overall Score:       ${benchmark.maturity.overallScore}/100`);
  console.log(`    Overall Level:       ${benchmark.maturity.overallLevel}`);
  console.log(`    All Layers Expert:   ${benchmark.maturity.allLayersExpert ? 'YES ✓' : 'NO'}`);
  console.log('');

  // The full human-readable 7-layer report
  console.log(benchmark.maturity.humanReadable);
  console.log('');

  // ── Recommendations ──
  if (benchmark.maturity.recommendations.length > 0) {
    console.log('  RECOMMENDATIONS:');
    for (const rec of benchmark.maturity.recommendations) {
      console.log(`    • ${rec}`);
    }
    console.log('');
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();
  banner();

  // Stage 1: Fetch real-world data
  const fetched = await fetchAllPublicData();

  // Stage 2: Load static training packs
  const loaded = loadAllTrainingPacks();

  // Stage 3: Convert to NexusBrain format
  const converted = convertToNexusBrainFormat(fetched);

  // Stage 3.5: NLP Deep Processing (raw text → additional TrainingPacks)
  const nlpPacks = runNLPPipeline(fetched, converted);

  // Stage 4: Train brain in-memory
  const training = trainBrainInMemory(loaded, converted);

  // Stage 5: Run 7-layer benchmark suite
  const benchmark = runBenchmarkSuite();

  // Stage 6: Display results
  displayReport(fetched, loaded, converted, nlpPacks, training, benchmark);

  // Final
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Total time: ${elapsed}s`);
  if (training.errors.length > 0) {
    console.log(`  Training errors: ${training.errors.length}`);
  }
  console.log(`${'═'.repeat(60)}`);
  console.log('');
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
