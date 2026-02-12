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
import { createAttentionPolicyLearner } from '../packages/memory-stack/src/learning/attention-policy-learner';
import { createPublicDataLearner } from '../packages/memory-stack/src/learning/public-data-learner';
import { createFastPathCompiler } from '../packages/memory-stack/src/orchestrator/fast-path-compiler';
import { createUpstreamPromoter } from '../packages/memory-stack/src/federation/upstream-promoter';
import { createBrainPipeline } from '../packages/memory-stack/src/orchestrator/brain-pipeline';
// Region #10: Insula (Anomaly Monitor) — post-consolidation anomaly sweep
import { createAnomalyMonitor } from '../packages/memory-stack/src/orchestrator/anomaly-monitor';
import { createEventBus } from '../packages/memory-stack/src/causality/event-bus';
// Region #11: Working Memory (Context Manager) — record consolidation discoveries
import { createContextManager } from '../packages/memory-stack/src/orchestrator/context-manager';

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

    // Load previous transform (so we continue learning, not restart)
    const loadedTransform = await tuner.loadFromDatabase();
    if (loadedTransform) {
      log('LEARN', 'Embedding tuner: loaded saved transform from DB');
    }

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

    // Load previous model state (continue learning, not restart)
    const loadedModel = await learner.loadFromDatabase(supabase, ORGANIZATION_ID);
    if (loadedModel) {
      log('LEARN', 'Contrastive: loaded saved model from DB');
    }

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

      // Persist trained model
      await learner.persistToDatabase(supabase, ORGANIZATION_ID);
    } else {
      log('LEARN', 'Contrastive: not enough edges — skipping');
    }
  } catch (err) {
    logError('LEARN', 'Contrastive learning failed (non-fatal)', err);
  }

  // Attention Policy Learner — learn from user feedback on alerts
  try {
    const policyLearner = createAttentionPolicyLearner({ verbose: VERBOSE });

    // Load saved policy
    const loadedPolicy = await policyLearner.loadFromDatabase(supabase, ORGANIZATION_ID);
    if (loadedPolicy) {
      log('LEARN', 'Attention Policy: loaded saved policy from DB');
    }

    // Get recent attention feedback from user interactions
    const { data: feedback } = await supabase
      .from('attention_decisions')
      .select('event_id, action, components')
      .eq('organization_id', ORGANIZATION_ID)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(200);

    if (feedback && feedback.length > 0) {
      const feedbackBatch = feedback
        .filter((f: any) => f.components && f.action)
        .map((f: any) => ({
          eventId: f.event_id,
          action: f.action as 'acted_on' | 'acknowledged' | 'ignored' | 'dismissed' | 'misfire',
          components: f.components,
        }));

      if (feedbackBatch.length > 0) {
        const result = policyLearner.processFeedbackBatch(feedbackBatch);
        const policy = policyLearner.getPolicy();
        log('LEARN', `Attention Policy: processed ${result.updatesApplied} feedback, avgReward=${result.avgReward.toFixed(3)}, shift=${result.policyShift.toFixed(4)}`);
        log('LEARN', `Attention Policy: weights=[cascade=${policy.weightCascadeReach.toFixed(3)}, dollar=${policy.weightDollarEffect.toFixed(3)}, strategic=${policy.weightStrategicAlignment.toFixed(3)}, novelty=${policy.weightNovelty.toFixed(3)}]`);

        await policyLearner.persistToDatabase(supabase, ORGANIZATION_ID);
      }
    } else {
      log('LEARN', 'Attention Policy: no recent feedback — using default weights');
      // Still persist initial state so we have a baseline
      await policyLearner.persistToDatabase(supabase, ORGANIZATION_ID);
    }
  } catch (err) {
    logError('LEARN', 'Attention policy learning failed (non-fatal)', err);
  }

  // ── POST-LEARNING: Fast-Path Invalidation (Cerebellum) ──
  // After consolidation changes the causal graph, stale fast-path caches
  // must be invalidated so the copilot gets fresh answers.
  divider('CEREBELLUM: FAST-PATH INVALIDATION');
  try {
    const fastPath = createFastPathCompiler({
      supabase,
      organizationId: ORGANIZATION_ID,
      verbose: VERBOSE,
    });
    await fastPath.invalidateAll();
    log('CEREBELLUM', 'All fast-paths invalidated — copilot will recompile on next query');
  } catch (err) {
    logError('CEREBELLUM', 'Fast-path invalidation failed (non-fatal)', err);
  }

  // ── POST-LEARNING: Anomaly Sweep (Insula) ──
  // After consolidation changes the graph, sweep recent signals for anomalies
  // that the new causal structure might reveal
  divider('INSULA: POST-CONSOLIDATION ANOMALY SWEEP');
  let postConsolidationAnomalies = 0;
  try {
    const eventBus = createEventBus();
    const anomalyMonitor = createAnomalyMonitor(eventBus, {
      threshold: 2.0, // Slightly more sensitive after consolidation
      windowSize: 30,
    });

    const { data: recentSignals } = await supabase
      .from('cross_domain_signals')
      .select('signal_type, signal_value, source_domain, signal_timestamp')
      .eq('organization_id', ORGANIZATION_ID)
      .gte('signal_timestamp', new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString())
      .order('signal_timestamp', { ascending: true })
      .limit(1000);

    if (recentSignals && recentSignals.length > 0) {
      for (const signal of recentSignals) {
        eventBus.emit({
          eventId: `consol_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          organizationId: ORGANIZATION_ID,
          domain: signal.source_domain || 'unknown',
          entityType: 'metric',
          entityId: signal.signal_type || 'unknown',
          eventType: 'signal' as any,
          payload: {
            signal_type: signal.signal_type,
            signal_value: signal.signal_value,
          },
          timestamp: new Date(signal.signal_timestamp || Date.now()),
        });
      }
      // Allow debounced event processing
      await new Promise(resolve => setTimeout(resolve, 100));
      const stats = anomalyMonitor.getStats();
      postConsolidationAnomalies = stats.totalAnomaliesDetected;
      log('INSULA', `Swept ${recentSignals.length} signals → ${postConsolidationAnomalies} anomalies across ${stats.windowsTracked} windows`);
    } else {
      log('INSULA', 'No recent signals to sweep');
    }
  } catch (err) {
    logError('INSULA', 'Post-consolidation anomaly sweep failed (non-fatal)', err);
  }

  // ── POST-LEARNING: Context Recording (Working Memory) ──
  // Record consolidation discoveries into Working Memory so subsequent
  // copilot queries and DMN scans have awareness of what was just learned
  divider('WORKING MEMORY: RECORDING CONSOLIDATION DISCOVERIES');
  try {
    const contextManager = createContextManager({
      supabase,
      organizationId: ORGANIZATION_ID,
    });

    const allDiscoveriesForContext = results.flatMap(r => r.report.discoveries);
    for (const discovery of allDiscoveriesForContext) {
      contextManager.recordInsight({
        id: `consolidation-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'what_changed',
        domains: [], // Discoveries are cross-domain
        title: discovery.substring(0, 80),
        explanation: discovery,
        importance: 0.7,
        discoveredAt: new Date().toISOString(),
      });
    }
    log('MEMORY', `Recorded ${allDiscoveriesForContext.length} consolidation discoveries into Working Memory`);
  } catch (err) {
    logError('MEMORY', 'Context recording failed (non-fatal)', err);
  }

  // ── POST-LEARNING: Brain Health Check (Neurological Exam) ──
  divider('NEUROLOGICAL EXAM: BRAIN HEALTH');
  try {
    const brain = createBrainPipeline({
      supabase,
      organizationId: ORGANIZATION_ID,
      verbose: VERBOSE,
    });
    const health = brain.getHealth();
    log('HEALTH', `Overall: ${health.overallHealth.toUpperCase()}`);
    for (const region of health.regions) {
      const statusEmoji = region.status === 'ok' ? '✓' : region.status === 'not_initialized' ? '○' : '✗';
      log('HEALTH', `  ${statusEmoji} ${region.name} (${region.brainAnalog}): ${region.status} — ${region.details || ''}`);
    }
  } catch (err) {
    logError('HEALTH', 'Brain health check failed (non-fatal)', err);
  }

  // Final Summary
  const totalDuration = ((Date.now() - overallStart) / 1000).toFixed(1);
  const successful = results.filter(r => r.status === 'success').length;
  const partial = results.filter(r => r.status === 'partial').length;
  const failed = results.filter(r => r.status === 'failed').length;

  // ═══════════════════════════════════════════════════════
  // CEREBELLUM: Invalidate stale fast-path caches in DB
  // ═══════════════════════════════════════════════════════
  try {
    // Clear the DB-backed fast-path cache since the graph just changed
    const { count: cacheCleared } = await supabase
      .from('fast_path_cache')
      .delete()
      .eq('organization_id', ORGANIZATION_ID)
      .lt('expires_at', new Date().toISOString())
      .select('*', { count: 'exact', head: true });

    // Also invalidate any cached paths that touch domains with new discoveries
    const changedDomains = results
      .flatMap(r => r.report.discoveries)
      .filter(d => d.includes('→'))
      .flatMap(d => d.match(/\b\w+\b/g) || []);

    if (changedDomains.length > 0) {
      const { count: domainCleared } = await supabase
        .from('fast_path_cache')
        .delete()
        .eq('organization_id', ORGANIZATION_ID)
        .select('*', { count: 'exact', head: true });

      log('CEREBELLUM', `Cleared ${(cacheCleared ?? 0) + (domainCleared ?? 0)} stale fast-path cache entries`);
    } else {
      log('CEREBELLUM', `Cleared ${cacheCleared ?? 0} expired fast-path cache entries`);
    }

    // Pre-warm common query patterns
    const compiler = createFastPathCompiler({
      supabase,
      organizationId: ORGANIZATION_ID,
      verbose: false,
    });

    const commonQueries = [
      'Why did churn increase?',
      'What is driving revenue growth?',
      'How does engineering velocity affect product quality?',
      'What are the biggest risks right now?',
      'What changed in the last week?',
    ];

    let prewarmed = 0;
    for (const query of commonQueries) {
      try {
        await compiler.precompile(query);
        prewarmed++;
      } catch {
        // Non-critical — skip failed precompiles
      }
    }
    log('CEREBELLUM', `Pre-warmed ${prewarmed} common fast-path patterns`);
  } catch (err) {
    logError('CEREBELLUM', 'Fast-path cache management failed', err);
  }

  // ═══════════════════════════════════════════════════════
  // CORPUS CALLOSUM: Federation — Promote discoveries to core brain
  // ═══════════════════════════════════════════════════════
  try {
    // Only promote if we consolidated an org brain (not the core brain itself)
    if (ORGANIZATION_ID !== CORE_BRAIN_ORG_ID) {
      const promoter = createUpstreamPromoter(supabase, ORGANIZATION_ID, {
        minEffectSize: 0.15,
        minConfidence: 0.7,
        minSampleSize: 30,
        maxItemsPerRun: 20,
      });

      const promotionResult = await promoter.promoteKnowledge();
      const totalPromoted = promotionResult.relationshipsPromoted +
        promotionResult.memoriesPromoted +
        promotionResult.rulesPromoted;

      if (totalPromoted > 0) {
        log('FEDERATION', `Promoted ${totalPromoted} items to core brain:`);
        log('FEDERATION', `  Relationships: ${promotionResult.relationshipsPromoted}`);
        log('FEDERATION', `  Memories: ${promotionResult.memoriesPromoted}`);
        log('FEDERATION', `  Rules: ${promotionResult.rulesPromoted}`);
        if (promotionResult.itemsSkippedPII > 0) {
          log('FEDERATION', `  Skipped (PII): ${promotionResult.itemsSkippedPII}`);
        }
      } else {
        log('FEDERATION', 'No items above promotion threshold (or already promoted)');
      }
    } else {
      log('FEDERATION', 'Core brain consolidation — no upstream promotion needed');
    }
  } catch (err) {
    logError('FEDERATION', 'Upstream promotion failed', err);
  }

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

  // Log the learning run for observability
  try {
    await supabase.from('learning_runs').insert({
      organization_id: ORGANIZATION_ID,
      run_type: 'consolidation',
      status: failed === 0 ? 'completed' : 'partial',
      started_at: new Date(overallStart).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - overallStart,
      signals_processed: totalSignals,
      edges_updated: totalEdges,
      metrics: {
        newDiscoveries: totalNew,
        anomaliesDetected: totalAnomalies,
        edgesPruned: totalPruned,
        edgesStrengthened: totalStrengthened,
        orgsConsolidated: results.length,
        discoveries: allDiscoveries.slice(0, 10),
      },
    });
  } catch {
    // Non-critical
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
