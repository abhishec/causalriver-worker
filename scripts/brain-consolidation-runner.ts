/**
 * NexusBrain Consolidation Runner — "Brain Sleep" Agent
 *
 * A standalone agent that runs on your laptop and performs periodic
 * brain consolidation — the equivalent of human sleep for the org brain.
 *
 * This agent orchestrates the 10-step consolidation cycle:
 *   1. Fetch signals from last 48 hours
 *   2. Run full causal discovery (15-method federated ensemble)
 *   3. Detect cross-domain anomalies
 *   4. Mine patterns (Apriori + PrefixSpan + temporal rules)
 *   5. Auto-generate training packs from discoveries
 *   6. Feed through brain trainer
 *   7. Prune edges with low confidence / unvalidated for 30+ days
 *   8. Strengthen edges whose predictions came true
 *   9. Generate "What the brain learned today" report
 *  10. Store consolidation results
 *
 * Modes:
 *   - Core Brain: Consolidates universal knowledge (default)
 *   - Org Brain: Consolidates org-specific knowledge + federates to core
 *   - All Orgs: Consolidates all active orgs, then core brain
 *
 * Usage:
 *   # One-time consolidation (core brain)
 *   pnpm exec tsx scripts/brain-consolidation-runner.ts
 *
 *   # Run nightly at 2 AM (interval mode, every 24h)
 *   CONSOLIDATION_MODE=interval pnpm exec tsx scripts/brain-consolidation-runner.ts
 *
 *   # Run every 6 hours
 *   CONSOLIDATION_MODE=interval CONSOLIDATION_INTERVAL_HOURS=6 pnpm exec tsx scripts/brain-consolidation-runner.ts
 *
 *   # Consolidate specific org + core brain
 *   ORGANIZATION_ID=your-org-id pnpm exec tsx scripts/brain-consolidation-runner.ts
 *
 *   # Consolidate ALL active orgs
 *   CONSOLIDATE_ALL_ORGS=true pnpm exec tsx scripts/brain-consolidation-runner.ts
 *
 *   # Verbose output
 *   VERBOSE=true pnpm exec tsx scripts/brain-consolidation-runner.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from project root
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
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env file not found — rely on environment variables
  }
}
loadEnv();

// ── NexusBrain Imports ──
import {
  createConsolidationEngine,
  type ConsolidationResult,
} from '../packages/memory-stack/src/orchestrator/consolidation-engine';

import { createBayesianUpdater } from '../packages/memory-stack/src/learning/bayesian-updater';
import { createEmbeddingTuner } from '../packages/memory-stack/src/learning/embedding-tuner';
import { createContrastiveCausalLearner } from '../packages/memory-stack/src/learning/contrastive-causal-learner';
import { createPublicDataLearner } from '../packages/memory-stack/src/learning/public-data-learner';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// Which org to consolidate
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || CORE_BRAIN_ORG_ID;

// Consolidation scope
const CONSOLIDATE_ALL_ORGS = process.env.CONSOLIDATE_ALL_ORGS === 'true';

// Running mode
const CONSOLIDATION_MODE = (process.env.CONSOLIDATION_MODE || 'once') as 'once' | 'interval';
const CONSOLIDATION_INTERVAL_HOURS = parseInt(process.env.CONSOLIDATION_INTERVAL_HOURS || '24', 10);

// Consolidation parameters
const LOOKBACK_HOURS = parseInt(process.env.LOOKBACK_HOURS || '48', 10);
const PRUNE_AFTER_DAYS = parseInt(process.env.PRUNE_AFTER_DAYS || '30', 10);
const VERBOSE = process.env.VERBOSE === 'true';

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
  if (err instanceof Error) console.error(`  ${err.message}`);
}

function divider(title: string): void {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(70)}\n`);
}

// ============================================================================
// CONSOLIDATION ORCHESTRATION
// ============================================================================

async function getActiveOrgIds(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  // Find orgs with signals in the last 30 days
  const { data: orgs } = await supabase
    .from('cross_domain_signals')
    .select('organization_id')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .limit(500);

  if (!orgs) return [];

  const uniqueOrgs = [...new Set(orgs.map((o: any) => o.organization_id))];
  return uniqueOrgs.filter(id => id !== CORE_BRAIN_ORG_ID);
}

async function consolidateOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<ConsolidationResult> {
  const isCore = orgId === CORE_BRAIN_ORG_ID;
  const label = isCore ? 'Core Brain' : `Org ${orgId.substring(0, 8)}...`;

  divider(`CONSOLIDATING: ${label}`);

  const engine = createConsolidationEngine({
    supabase,
    organizationId: orgId,
    lookbackHours: LOOKBACK_HOURS,
    pruneAfterDays: PRUNE_AFTER_DAYS,
    runFederation: !isCore, // Org brains federate up; core brain doesn't
    verbose: VERBOSE,
  });

  const result = isCore
    ? await engine.runConsolidation()
    : await engine.runOrgConsolidation();

  // Print summary
  console.log(`\n  Status: ${result.status.toUpperCase()}`);
  console.log(`  Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Signals: ${result.report.stats.signalsProcessed}`);
  console.log(`  Causal edges: ${result.report.stats.causalEdgesDiscovered}`);
  console.log(`  New relationships: ${result.report.stats.newRelationships}`);
  console.log(`  Anomalies: ${result.report.stats.anomaliesDetected}`);
  console.log(`  Patterns: ${result.report.stats.patternsFound}`);
  console.log(`  Temporal rules: ${result.report.stats.temporalRulesFound}`);
  console.log(`  Edges pruned: ${result.report.stats.edgesPruned}`);
  console.log(`  Edges strengthened: ${result.report.stats.edgesStrengthened}`);

  if (result.report.discoveries.length > 0) {
    console.log('\n  Discoveries:');
    for (const d of result.report.discoveries) {
      console.log(`    + ${d}`);
    }
  }

  if (result.report.warnings.length > 0) {
    console.log('\n  Warnings:');
    for (const w of result.report.warnings) {
      console.log(`    ! ${w}`);
    }
  }

  console.log('');

  return result;
}

async function runOnce(supabase: ReturnType<typeof createClient>): Promise<void> {
  const overallStart = Date.now();
  const results: ConsolidationResult[] = [];

  divider('NEXUSBRAIN BRAIN CONSOLIDATION ("Sleep")');
  log('INIT', `Mode: ${CONSOLIDATION_MODE}`);
  log('INIT', `Lookback: ${LOOKBACK_HOURS} hours`);
  log('INIT', `Prune threshold: ${PRUNE_AFTER_DAYS} days`);

  // ── STEP 0: FEED THE BRAIN — Pull fresh public data ──
  divider('STEP 0: FEEDING THE BRAIN (Public Data Ingestion)');
  try {
    const dataLearner = createPublicDataLearner({
      supabase,
      organizationId: CORE_BRAIN_ORG_ID,
      fredApiKey: process.env.FRED_API_KEY,
      verbose: VERBOSE,
    });

    const ingestion = await dataLearner.ingest();
    log('FEED', ingestion.summary);

    for (const src of ingestion.sources) {
      const status = src.success ? '✓' : '✗';
      log('FEED', `  ${status} ${src.source}: ${src.signalCount} signals (${(src.durationMs / 1000).toFixed(1)}s)`);
    }
  } catch (err) {
    logError('FEED', 'Public data ingestion failed (non-fatal)', err);
  }

  if (CONSOLIDATE_ALL_ORGS) {
    // Phase 1: Consolidate all active org brains
    log('INIT', 'Scanning for active organizations...');
    const orgIds = await getActiveOrgIds(supabase);
    log('INIT', `Found ${orgIds.length} active org${orgIds.length !== 1 ? 's' : ''}`);

    for (const orgId of orgIds) {
      try {
        const result = await consolidateOrg(supabase, orgId);
        results.push(result);
      } catch (err) {
        logError('ORG', `Failed to consolidate org ${orgId.substring(0, 8)}`, err);
      }
    }

    // Phase 2: Always consolidate core brain last (it receives federated knowledge)
    try {
      const coreResult = await consolidateOrg(supabase, CORE_BRAIN_ORG_ID);
      results.push(coreResult);
    } catch (err) {
      logError('CORE', 'Failed to consolidate core brain', err);
    }
  } else if (ORGANIZATION_ID !== CORE_BRAIN_ORG_ID) {
    // Consolidate specific org, then core brain
    try {
      const orgResult = await consolidateOrg(supabase, ORGANIZATION_ID);
      results.push(orgResult);
    } catch (err) {
      logError('ORG', `Failed to consolidate org ${ORGANIZATION_ID.substring(0, 8)}`, err);
    }

    // Also consolidate core brain
    try {
      const coreResult = await consolidateOrg(supabase, CORE_BRAIN_ORG_ID);
      results.push(coreResult);
    } catch (err) {
      logError('CORE', 'Failed to consolidate core brain', err);
    }
  } else {
    // Core brain only
    try {
      const coreResult = await consolidateOrg(supabase, CORE_BRAIN_ORG_ID);
      results.push(coreResult);
    } catch (err) {
      logError('CORE', 'Failed to consolidate core brain', err);
    }
  }

  // ── POST-CONSOLIDATION: Real Learning Steps ──
  divider('REAL LEARNING (Bayesian + Embeddings + Contrastive)');

  // Bayesian weight updates — replace naive ×1.05 with proper posteriors
  try {
    const bayesian = createBayesianUpdater({
      supabase,
      organizationId: ORGANIZATION_ID,
      verbose: VERBOSE,
    });

    const loaded = await bayesian.loadFromDatabase();
    log('LEARN', `Bayesian: loaded ${loaded} edge posteriors`);

    // Get prediction history and update posteriors
    const { data: predictions } = await supabase
      .from('ai_memory')
      .select('metadata')
      .eq('organization_id', ORGANIZATION_ID)
      .eq('memory_type', 'prediction_verification')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(200);

    if (predictions && predictions.length > 0) {
      for (const p of predictions) {
        const meta = p.metadata as any;
        if (meta?.sourceDomain && meta?.targetDomain) {
          bayesian.update({
            sourceDomain: meta.sourceDomain,
            targetDomain: meta.targetDomain,
            wasCorrect: meta.wasCorrect || false,
            predictionConfidence: meta.confidence || 0.5,
          });
        }
      }
      const persisted = await bayesian.persistPosteriors();
      log('LEARN', `Bayesian: updated ${predictions.length} predictions, persisted ${persisted} posteriors`);

      const uncertain = bayesian.getUncertainEdges(0.25);
      if (uncertain.length > 0) {
        log('LEARN', `Bayesian: ${uncertain.length} edges need more evidence (high uncertainty)`);
      }
    } else {
      log('LEARN', 'Bayesian: no recent prediction data — skipping update');
    }
  } catch (err) {
    logError('LEARN', 'Bayesian update failed (non-fatal)', err);
  }

  // Embedding fine-tuning — learn domain transforms from causal graph
  try {
    const tuner = createEmbeddingTuner({
      supabase,
      organizationId: ORGANIZATION_ID,
      verbose: VERBOSE,
      epochs: 3, // Keep it light for nightly runs
    });

    const tuneResult = await tuner.tune();
    if (tuneResult.pairsUsed > 0) {
      log('LEARN', `Embedding tuner: loss ${tuneResult.initialLoss.toFixed(4)} → ${tuneResult.finalLoss.toFixed(4)} (${tuneResult.improvement.toFixed(1)}% improvement, ${tuneResult.pairsUsed} pairs)`);
      await tuner.persistTransform();
    } else {
      log('LEARN', 'Embedding tuner: not enough causal pairs — skipping');
    }
  } catch (err) {
    logError('LEARN', 'Embedding tuning failed (non-fatal)', err);
  }

  // Contrastive causal learner — train "does A cause B?" predictor
  try {
    const learner = createContrastiveCausalLearner({ verbose: VERBOSE });

    // Build training examples from verified causal edges
    const { data: edges } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, is_significant, evidence_weight')
      .eq('organization_id', ORGANIZATION_ID)
      .limit(100);

    if (edges && edges.length >= 5) {
      const examples = [];
      const allDomains = [...new Set(edges.map(e => e.source_domain).concat(edges.map(e => e.target_domain)))];

      for (const edge of edges) {
        // Positive example (causal edge exists)
        examples.push({
          sourceDomain: edge.source_domain,
          targetDomain: edge.target_domain,
          label: edge.is_significant ? 1 : 0,
          labelConfidence: edge.evidence_weight || 0.5,
        });

        // Negative example (random non-causal pair)
        const randomDomain = allDomains[Math.floor(Math.random() * allDomains.length)];
        if (randomDomain !== edge.source_domain) {
          examples.push({
            sourceDomain: edge.source_domain,
            targetDomain: randomDomain,
            label: 0,
            labelConfidence: 0.3,
          });
        }
      }

      const result = learner.trainBatch(examples);
      const stats = learner.getStats();
      log('LEARN', `Contrastive: ${stats.examplesSeen} examples, loss=${result.avgLoss.toFixed(4)}, accuracy=${(result.accuracy * 100).toFixed(1)}%`);
    } else {
      log('LEARN', 'Contrastive: not enough edges — skipping');
    }
  } catch (err) {
    logError('LEARN', 'Contrastive learning failed (non-fatal)', err);
  }

  // Final Summary
  const totalDuration = ((Date.now() - overallStart) / 1000).toFixed(1);
  const successful = results.filter(r => r.status === 'success').length;
  const partial = results.filter(r => r.status === 'partial').length;
  const failed = results.filter(r => r.status === 'failed').length;

  divider('CONSOLIDATION COMPLETE');
  log('DONE', `Total time: ${totalDuration}s`);
  log('DONE', `Organizations consolidated: ${results.length}`);
  log('DONE', `Success: ${successful} | Partial: ${partial} | Failed: ${failed}`);

  const totalSignals = results.reduce((sum, r) => sum + r.report.stats.signalsProcessed, 0);
  const totalEdges = results.reduce((sum, r) => sum + r.report.stats.causalEdgesDiscovered, 0);
  const totalNew = results.reduce((sum, r) => sum + r.report.stats.newRelationships, 0);
  const totalAnomalies = results.reduce((sum, r) => sum + r.report.stats.anomaliesDetected, 0);
  const totalPruned = results.reduce((sum, r) => sum + r.report.stats.edgesPruned, 0);
  const totalStrengthened = results.reduce((sum, r) => sum + r.report.stats.edgesStrengthened, 0);

  log('DONE', `Signals processed: ${totalSignals.toLocaleString()}`);
  log('DONE', `Causal edges: ${totalEdges}`);
  log('DONE', `New discoveries: ${totalNew}`);
  log('DONE', `Anomalies detected: ${totalAnomalies}`);
  log('DONE', `Edges pruned: ${totalPruned}`);
  log('DONE', `Edges strengthened: ${totalStrengthened}`);

  // Print all discoveries across all orgs
  const allDiscoveries = results.flatMap(r => r.report.discoveries);
  if (allDiscoveries.length > 0) {
    console.log('\n  What the brain learned today:');
    for (const d of allDiscoveries) {
      console.log(`    + ${d}`);
    }
  }

  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

let shutdownRequested = false;

async function main(): Promise<void> {
  if (!SUPABASE_URL) {
    console.error('ERROR: SUPABASE_URL is not set.');
    process.exit(1);
  }
  if (!SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Verify connection
  try {
    const { error } = await supabase
      .from('cross_domain_signals')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.error(`ERROR: Supabase connection failed: ${error.message}`);
      process.exit(1);
    }
    log('INIT', 'Supabase connection verified');
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
    console.log('\nShutdown requested. Finishing current consolidation...');
  });

  process.on('SIGTERM', () => {
    shutdownRequested = true;
    console.log('\nSIGTERM received. Finishing current consolidation...');
  });

  // Execute based on mode
  switch (CONSOLIDATION_MODE) {
    case 'once':
      await runOnce(supabase);
      break;

    case 'interval': {
      const intervalMs = CONSOLIDATION_INTERVAL_HOURS * 60 * 60 * 1000;
      log('INIT', `Running in interval mode — every ${CONSOLIDATION_INTERVAL_HOURS} hours`);

      let runCount = 0;
      while (!shutdownRequested) {
        runCount++;
        log('LOOP', `Starting consolidation run #${runCount}`);

        try {
          await runOnce(supabase);
        } catch (err) {
          logError('LOOP', `Run #${runCount} failed`, err);
        }

        if (shutdownRequested) break;

        const nextRun = new Date(Date.now() + intervalMs);
        log('LOOP', `Next consolidation at ${nextRun.toISOString().substring(11, 19)}. Press Ctrl+C to stop.`);

        // Sleep in small chunks for responsive shutdown
        const sleepChunkMs = 10_000;
        let slept = 0;
        while (slept < intervalMs && !shutdownRequested) {
          await new Promise(r => setTimeout(r, Math.min(sleepChunkMs, intervalMs - slept)));
          slept += sleepChunkMs;
        }
      }

      log('LOOP', `Completed ${runCount} consolidation run${runCount !== 1 ? 's' : ''}. Goodbye!`);
      break;
    }

    default:
      console.error(`ERROR: Unknown CONSOLIDATION_MODE "${CONSOLIDATION_MODE}". Use: once or interval.`);
      process.exit(1);
  }
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
