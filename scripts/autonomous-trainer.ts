/**
 * NexusBrain Autonomous Training Agent
 *
 * A standalone agent that runs on your laptop and continuously trains
 * the NexusBrain causal intelligence engine using free public data.
 *
 * 4-Stage Pipeline:
 *   FETCH  → FRED, GitHub, World Bank, Hacker News
 *   CONVERT → ConnectorSignal[] + TrainingPack[]
 *   TRAIN  → Brain trainer persists to Supabase
 *   LEARN  → Autonomous learner + scheduled jobs
 *
 * Usage:
 *   # One-time training run
 *   pnpm exec tsx scripts/autonomous-trainer.ts
 *
 *   # Run every 6 hours
 *   TRAINER_MODE=interval pnpm exec tsx scripts/autonomous-trainer.ts
 *
 *   # Run every hour
 *   TRAINER_MODE=interval TRAINER_INTERVAL_MINUTES=60 pnpm exec tsx scripts/autonomous-trainer.ts
 *
 *   # With real FRED API key (free at research.stlouisfed.org)
 *   FRED_API_KEY=your_key pnpm exec tsx scripts/autonomous-trainer.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from project root (zero-dependency, no dotenv needed)
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
      // Don't override existing env vars
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env file not found — rely on environment variables
  }
}
loadEnv();

// ── NexusBrain Imports (relative source paths for tsx) ──
import { createBrainTrainer } from '../packages/memory-stack/src/learning/brain-trainer';
import { getAllTrainingPacks } from '../packages/memory-stack/src/learning/training-library';
import { createAutonomousLearner } from '../packages/memory-stack/src/learning/autonomous-learner';
import { createScheduledJobs } from '../packages/memory-stack/src/orchestrator/scheduled-jobs';
import { createSupabaseRepository } from '../packages/memory-stack/src/persistence/supabase-repository';
import { storeConnectorSignals } from '../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../packages/memory-stack/src/learning/brain-trainer';
import type { ConnectorSignal } from '../packages/memory-stack/src/connectors/connector-framework';

// ── Training Data Modules ──
import {
  fetchFredSeries,
  fetchGitHubRepoStats,
  fetchWorldBankIndicators,
  fetchHackerNewsTop,
  type FredSeriesResult,
  type GitHubRepoStats,
  type WorldBankResult,
  type HackerNewsSnapshot,
} from './training-data/public-data-fetchers';

import { convertAllFetchedData } from './training-data/training-pack-factory';
import { MACRO_ECONOMIC_PACKS } from './training-data/macro-economic-packs';
import { TECH_INDUSTRY_PACKS } from './training-data/tech-industry-packs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Organization ID — Training is NOT client-specific, it matures the brain globally.
// The DB schema requires a UUID for organization_id, so we use a well-known
// "global trainer" UUID. All clients benefit from this shared knowledge.
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || '00000000-0000-4000-a000-000000000001';
const FRED_API_KEY = process.env.FRED_API_KEY || 'DEMO_KEY';
const TRAINER_MODE = (process.env.TRAINER_MODE || 'once') as 'once' | 'interval' | 'continuous';
const TRAINER_INTERVAL_MINUTES = parseInt(process.env.TRAINER_INTERVAL_MINUTES || '360', 10);

// ============================================================================
// LOGGING
// ============================================================================

function log(stage: string, message: string): void {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[${time}] [${stage}] ${message}`);
}

function logError(stage: string, message: string, err?: unknown): void {
  const time = new Date().toISOString().substring(11, 19);
  console.error(`[${time}] [${stage}] ERROR: ${message}`);
  if (err instanceof Error) {
    console.error(`  ${err.message}`);
  }
}

function divider(title: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}\n`);
}

// ============================================================================
// STAGE 1: FETCH PUBLIC DATA
// ============================================================================

interface FetchedData {
  fred: FredSeriesResult[];
  github: GitHubRepoStats[];
  worldBank: WorldBankResult[];
  hackerNews: HackerNewsSnapshot;
}

async function fetchPublicData(): Promise<FetchedData> {
  divider('STAGE 1: FETCH PUBLIC DATA');

  const results = await Promise.allSettled([
    fetchFredSeries(undefined, FRED_API_KEY).then(r => {
      log('FETCH', `FRED: ${r.length} series fetched`);
      return r;
    }),
    fetchGitHubRepoStats().then(r => {
      log('FETCH', `GitHub: ${r.length} repos fetched`);
      return r;
    }),
    fetchWorldBankIndicators().then(r => {
      log('FETCH', `World Bank: ${r.length} indicators fetched`);
      return r;
    }),
    fetchHackerNewsTop().then(r => {
      log('FETCH', `Hacker News: ${r.stories.length} stories fetched`);
      return r;
    }),
  ]);

  const fred = results[0].status === 'fulfilled' ? results[0].value : [];
  const github = results[1].status === 'fulfilled' ? results[1].value : [];
  const worldBank = results[2].status === 'fulfilled' ? results[2].value : [];
  const hackerNews = results[3].status === 'fulfilled'
    ? results[3].value
    : { topStoryIds: [], stories: [], avgScore: 0, avgComments: 0, totalEngagement: 0, fetchedAt: new Date() };

  if (results[0].status === 'rejected') logError('FETCH', 'FRED failed', results[0].reason);
  if (results[1].status === 'rejected') logError('FETCH', 'GitHub failed', results[1].reason);
  if (results[2].status === 'rejected') logError('FETCH', 'World Bank failed', results[2].reason);
  if (results[3].status === 'rejected') logError('FETCH', 'Hacker News failed', results[3].reason);

  const totalSources = [fred, github, worldBank, hackerNews.stories].filter(a => a.length > 0).length;
  log('FETCH', `${totalSources}/4 data sources available`);

  return { fred, github, worldBank, hackerNews };
}

// ============================================================================
// STAGE 2: CONVERT TO NEXUSBRAIN FORMAT
// ============================================================================

interface ConvertedData {
  signals: ConnectorSignal[];
  dynamicPacks: TrainingPack[];
  staticPacks: TrainingPack[];
}

function convertData(fetched: FetchedData): ConvertedData {
  divider('STAGE 2: CONVERT TO NEXUSBRAIN FORMAT');

  // Convert fetched data to signals + dynamic training packs
  const { signals, trainingPacks: dynamicPacks } = convertAllFetchedData(
    ORGANIZATION_ID,
    fetched.fred,
    fetched.github,
    fetched.worldBank,
    fetched.hackerNews,
  );

  // Static training packs (always available, even if APIs fail)
  const staticPacks: TrainingPack[] = [
    ...MACRO_ECONOMIC_PACKS,
    ...TECH_INDUSTRY_PACKS,
  ];

  log('CONVERT', `${signals.length} signals generated`);
  log('CONVERT', `${dynamicPacks.length} dynamic training packs built`);
  log('CONVERT', `${staticPacks.length} static training packs loaded`);

  return { signals, dynamicPacks, staticPacks };
}

// ============================================================================
// STAGE 3: TRAIN THE BRAIN
// ============================================================================

interface TrainingResult {
  signalsStored: number;
  packsTrainedCount: number;
  packsTrainedIds: string[];
  errors: string[];
}

async function trainBrain(
  supabase: ReturnType<typeof createClient>,
  converted: ConvertedData,
  isFirstRun: boolean,
): Promise<TrainingResult> {
  divider('STAGE 3: TRAIN THE BRAIN');

  const result: TrainingResult = {
    signalsStored: 0,
    packsTrainedCount: 0,
    packsTrainedIds: [],
    errors: [],
  };

  // 3a. Store connector signals
  if (converted.signals.length > 0) {
    try {
      await storeConnectorSignals(supabase, converted.signals);
      result.signalsStored = converted.signals.length;
      log('TRAIN', `Stored ${converted.signals.length} signals to cross_domain_signals`);
    } catch (err) {
      logError('TRAIN', 'Failed to store signals', err);
      result.errors.push('Signal storage failed');
    }
  }

  // 3b. Create brain trainer
  const trainer = createBrainTrainer({ verbose: false });

  // 3c. On first run, train all built-in TRAINING_LIBRARY packs
  if (isFirstRun) {
    log('TRAIN', 'First run detected — loading all 10 built-in training packs...');
    const builtInPacks = getAllTrainingPacks();

    for (const pack of builtInPacks) {
      try {
        await trainer.train(supabase, ORGANIZATION_ID, pack);
        result.packsTrainedCount++;
        result.packsTrainedIds.push(pack.id);
        log('TRAIN', `  [built-in] ${pack.id} ✓`);
      } catch (err) {
        logError('TRAIN', `  [built-in] ${pack.id} ✗`, err);
        result.errors.push(`Built-in pack ${pack.id} failed`);
      }
    }
  }

  // 3d. Train dynamic packs (from live API data)
  for (const pack of converted.dynamicPacks) {
    try {
      await trainer.train(supabase, ORGANIZATION_ID, pack);
      result.packsTrainedCount++;
      result.packsTrainedIds.push(pack.id);
      log('TRAIN', `  [dynamic] ${pack.id} ✓`);
    } catch (err) {
      logError('TRAIN', `  [dynamic] ${pack.id} ✗`, err);
      result.errors.push(`Dynamic pack ${pack.id} failed`);
    }
  }

  // 3e. Train static packs (macro-economic + tech industry)
  for (const pack of converted.staticPacks) {
    try {
      await trainer.train(supabase, ORGANIZATION_ID, pack);
      result.packsTrainedCount++;
      result.packsTrainedIds.push(pack.id);
      log('TRAIN', `  [static] ${pack.id} ✓`);
    } catch (err) {
      logError('TRAIN', `  [static] ${pack.id} ✗`, err);
      result.errors.push(`Static pack ${pack.id} failed`);
    }
  }

  // Summary
  const stats = trainer.getTrainingStats();
  log('TRAIN', `Training complete: ${result.packsTrainedCount} packs trained`);
  log('TRAIN', `  Causal edges: ${stats.causalEdgesLoaded}`);
  log('TRAIN', `  Patterns: ${stats.patternsLoaded}`);
  log('TRAIN', `  Rules: ${stats.rulesLoaded}`);
  if (result.errors.length > 0) {
    log('TRAIN', `  Errors: ${result.errors.length}`);
  }

  return result;
}

// ============================================================================
// STAGE 4: AUTONOMOUS LEARNING
// ============================================================================

interface LearningResult {
  cycleCompleted: boolean;
  dailyJobsCompleted: boolean;
  errors: string[];
}

async function learnAndMaintain(
  supabase: ReturnType<typeof createClient>,
): Promise<LearningResult> {
  divider('STAGE 4: AUTONOMOUS LEARNING');

  const result: LearningResult = {
    cycleCompleted: false,
    dailyJobsCompleted: false,
    errors: [],
  };

  // 4a. Run autonomous learning cycle
  try {
    const repository = createSupabaseRepository(supabase, ORGANIZATION_ID);
    const learner = createAutonomousLearner({
      supabase,
      organizationId: ORGANIZATION_ID,
      repository,
      autoPromoteConfidence: 0.7,
      minPatternObservations: 3, // Lower threshold for initial training
      verbose: false,
    });

    log('LEARN', 'Running autonomous learning cycle...');
    const cycleResult = await learner.runLearningCycle();
    result.cycleCompleted = true;

    log('LEARN', `Learning cycle complete (${(cycleResult.duration / 1000).toFixed(1)}s):`);
    log('LEARN', `  Causal edges updated: ${cycleResult.causalEdgesUpdated}`);
    log('LEARN', `  Patterns registered: ${cycleResult.patternsRegistered}`);
    log('LEARN', `  Rules promoted: ${cycleResult.rulesPromoted}`);
    log('LEARN', `  Memories created: ${cycleResult.memoriesCreated}`);
    log('LEARN', `  Anomalies detected: ${cycleResult.anomaliesDetected}`);
    log('LEARN', `  Training packs generated: ${cycleResult.packsGenerated}`);
  } catch (err) {
    logError('LEARN', 'Learning cycle failed', err);
    result.errors.push('Learning cycle failed');
  }

  // 4b. Run scheduled maintenance jobs
  try {
    const jobs = createScheduledJobs(supabase, {
      lookbackDays: 90,
      minObservations: 10,
    });

    log('LEARN', 'Running daily maintenance jobs...');
    const jobResult = await jobs.runAllDailyJobs(ORGANIZATION_ID);
    result.dailyJobsCompleted = true;

    log('LEARN', `Daily jobs complete:`);
    log('LEARN', `  Verifications processed: ${jobResult.verifications.verificationsProcessed}`);
    log('LEARN', `  Weights updated: ${jobResult.weights.weightsUpdated.length}`);
    log('LEARN', `  Edges decayed: ${jobResult.decay.edgesDecayed}`);
    log('LEARN', `  Edges removed: ${jobResult.decay.edgesRemoved}`);
    log('LEARN', `  New relationships discovered: ${jobResult.discovery.newRelationships.length}`);
    log('LEARN', `  Lost relationships: ${jobResult.discovery.lostRelationships.length}`);
  } catch (err) {
    logError('LEARN', 'Daily jobs failed', err);
    result.errors.push('Daily jobs failed');
  }

  return result;
}

// ============================================================================
// FIRST-RUN DETECTION
// ============================================================================

async function isFirstRun(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('cross_domain_signals')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORGANIZATION_ID);

    if (error) {
      log('INIT', 'Could not check signal count — assuming first run');
      return true;
    }

    const isFirst = (count ?? 0) === 0;
    if (isFirst) {
      log('INIT', 'No existing signals found — this is a first run');
    } else {
      log('INIT', `Found ${count} existing signals — incremental run`);
    }
    return isFirst;
  } catch {
    return true;
  }
}

// ============================================================================
// SINGLE RUN
// ============================================================================

async function runOnce(supabase: ReturnType<typeof createClient>): Promise<void> {
  const startTime = Date.now();

  divider('NEXUSBRAIN AUTONOMOUS TRAINER');
  log('INIT', `Organization: ${ORGANIZATION_ID}`);
  log('INIT', `Mode: ${TRAINER_MODE}`);
  log('INIT', `FRED API Key: ${FRED_API_KEY === 'DEMO_KEY' ? 'DEMO_KEY (rate-limited)' : 'custom key'}`);

  // Check if first run
  const firstRun = await isFirstRun(supabase);

  // Stage 1: Fetch
  const fetchedData = await fetchPublicData();

  // Stage 2: Convert
  const convertedData = convertData(fetchedData);

  // Stage 3: Train
  const trainingResult = await trainBrain(supabase, convertedData, firstRun);

  // Stage 4: Learn
  const learningResult = await learnAndMaintain(supabase);

  // Final Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  divider('RUN COMPLETE');
  log('DONE', `Total time: ${elapsed}s`);
  log('DONE', `Signals stored: ${trainingResult.signalsStored}`);
  log('DONE', `Packs trained: ${trainingResult.packsTrainedCount}`);
  log('DONE', `Learning cycle: ${learningResult.cycleCompleted ? '✓' : '✗'}`);
  log('DONE', `Daily jobs: ${learningResult.dailyJobsCompleted ? '✓' : '✗'}`);

  const totalErrors = trainingResult.errors.length + learningResult.errors.length;
  if (totalErrors > 0) {
    log('DONE', `Errors: ${totalErrors}`);
    for (const err of [...trainingResult.errors, ...learningResult.errors]) {
      log('DONE', `  - ${err}`);
    }
  } else {
    log('DONE', 'All stages completed successfully ✓');
  }

  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

let shutdownRequested = false;

async function main(): Promise<void> {
  // Validate environment
  if (!SUPABASE_URL) {
    console.error('ERROR: SUPABASE_URL is not set. Add it to .env or set as environment variable.');
    process.exit(1);
  }
  if (!SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env or set as environment variable.');
    process.exit(1);
  }

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Test connection
  try {
    const { error } = await supabase.from('cross_domain_signals').select('id', { count: 'exact', head: true });
    if (error) {
      console.error(`ERROR: Supabase connection failed: ${error.message}`);
      process.exit(1);
    }
    log('INIT', 'Supabase connection verified ✓');
  } catch (err) {
    console.error('ERROR: Cannot connect to Supabase.');
    if (err instanceof Error) console.error(err.message);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    if (shutdownRequested) {
      console.log('\nForce shutdown.');
      process.exit(1);
    }
    shutdownRequested = true;
    console.log('\nShutdown requested. Finishing current run...');
  });

  process.on('SIGTERM', () => {
    shutdownRequested = true;
    console.log('\nSIGTERM received. Finishing current run...');
  });

  // Execute based on mode
  switch (TRAINER_MODE) {
    case 'once':
      await runOnce(supabase);
      break;

    case 'interval':
    case 'continuous': {
      const intervalMs = TRAINER_INTERVAL_MINUTES * 60 * 1000;
      log('INIT', `Running in ${TRAINER_MODE} mode — every ${TRAINER_INTERVAL_MINUTES} minutes`);

      let runCount = 0;
      while (!shutdownRequested) {
        runCount++;
        log('LOOP', `Starting run #${runCount}`);

        try {
          await runOnce(supabase);
        } catch (err) {
          logError('LOOP', `Run #${runCount} failed`, err);
        }

        if (shutdownRequested) break;

        log('LOOP', `Next run in ${TRAINER_INTERVAL_MINUTES} minutes. Press Ctrl+C to stop.`);

        // Sleep in small chunks so we can respond to shutdown quickly
        const sleepChunkMs = 10_000; // 10 seconds
        let slept = 0;
        while (slept < intervalMs && !shutdownRequested) {
          await new Promise(r => setTimeout(r, Math.min(sleepChunkMs, intervalMs - slept)));
          slept += sleepChunkMs;
        }
      }

      log('LOOP', `Completed ${runCount} runs. Goodbye!`);
      break;
    }

    default:
      console.error(`ERROR: Unknown TRAINER_MODE "${TRAINER_MODE}". Use: once, interval, or continuous.`);
      process.exit(1);
  }
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
