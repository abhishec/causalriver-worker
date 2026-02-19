/**
 * NexusBrain Consolidation Runner — "Brain Sleep" Agent
 *
 * A standalone agent that runs on your laptop and performs periodic
 * brain consolidation — the equivalent of human sleep for the org brain.
 *
 * This agent orchestrates the 10-step consolidation cycle:
 *   1. Fetch signals from last 48 hours
 *   2. Run full causal discovery (3-paradigm ensemble + Bayesian Judge)
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
import { getHeapStatistics } from 'node:v8';

// Log heap limit immediately so we can diagnose OOM issues
const _heapLimitMB = Math.round(getHeapStatistics().heap_size_limit / 1024 / 1024);
console.log(`[HEAP] V8 heap limit: ${_heapLimitMB}MB (NODE_OPTIONS=${process.env.NODE_OPTIONS || 'unset'})`);

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
import { createFederationApprovalManager } from '../packages/memory-stack/src/federation/federation-approval-manager';
import { createBrainPipeline } from '../packages/memory-stack/src/orchestrator/brain-pipeline';
// Region #10: Insula (Anomaly Monitor) — post-consolidation anomaly sweep
import { createAnomalyMonitor } from '../packages/memory-stack/src/orchestrator/anomaly-monitor';
import { createEventBus, generateEventId } from '../packages/memory-stack/src/causality/event-bus';
// Region #10b: Thalamus (Cascade Alert Pipeline) — predict cascade propagation
import {
  createCascadeAlertPipeline,
  type CascadeAlertPayload,
} from '../packages/memory-stack/src/orchestrator/cascade-alert-pipeline';
import type { CachedRelationship } from '../packages/memory-stack/src/bridges/patterns-to-agents';
// Region #11: Working Memory (Context Manager) — record consolidation discoveries
import { createContextManager } from '../packages/memory-stack/src/orchestrator/context-manager';
// LLM Brain Amplifier — Claude as semantic judgment layer
import { createBrainAmplifier } from '../packages/memory-stack/src/orchestrator/llm-brain-amplifier';
// Cost Tracker — centralized LLM cost logging
import { createCostTracker } from '../packages/memory-stack/src/persistence/cost-tracker';
// Memory Pressure Monitor — dynamic OOM prevention
import { createMemoryPressureMonitor, type MemoryPressureMonitor } from '../packages/memory-stack/src/infra/memory-pressure-monitor';

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

// Module-level cost tracker — initialized in main(), used by consolidateOrg()
let costTracker: ReturnType<typeof createCostTracker> | undefined;

// Module-level memory monitor — initialized in main(), used across consolidation
let memoryMonitor: MemoryPressureMonitor | undefined;
let emergencyMode = false;

// LLM Brain Amplifier config (optional — graceful degradation if no key)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const LLM_PROVIDER = (process.env.LLM_PROVIDER || (ANTHROPIC_API_KEY ? 'anthropic' : 'openai')) as 'anthropic' | 'openai';
const LLM_API_KEY = LLM_PROVIDER === 'anthropic' ? ANTHROPIC_API_KEY : OPENAI_API_KEY;

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
    .gte('signal_timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
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
    // Consolidate specific org
    try {
      const orgResult = await consolidateOrg(supabase, ORGANIZATION_ID);
      results.push(orgResult);
    } catch (err) {
      logError('ORG', `Failed to consolidate org ${ORGANIZATION_ID.substring(0, 8)}`, err);
    }

    // Bug #2 fix: Only auto-consolidate core brain if NOT called from the nightly
    // orchestrator (which handles core brain separately in Phase 2B).
    // When SKIP_CORE_BRAIN=true, the orchestrator is managing core brain itself.
    if (process.env.SKIP_CORE_BRAIN !== 'true') {
      try {
        const coreResult = await consolidateOrg(supabase, CORE_BRAIN_ORG_ID);
        results.push(coreResult);
      } catch (err) {
        logError('CORE', 'Failed to consolidate core brain', err);
      }
    } else {
      log('INIT', 'Skipping core brain consolidation (orchestrator handles it separately)');
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

  // ══════════════════════════════════════════════════════════════════════════
  // COGNITIVE STACK: Run Layers 3-15 (Direct Invocation)
  // ══════════════════════════════════════════════════════════════════════════
  // The consolidation engine above ran the 10-step "brain sleep" cycle, but
  // it does NOT fire the cognitive stack (layers 3-15).
  //
  // IMPORTANT: We invoke the cognitive stack DIRECTLY via the brain pipeline's
  // getCognitiveStack().runCycle() — NOT via pipeline.runFullCycle().
  // Why? Because runFullCycle() internally re-runs consolidation + learning,
  // which would DOUBLE the work already done above (wasting compute and
  // potentially corrupting data with duplicate writes).
  //
  // Instead, we:
  //   1. Create the brain pipeline (which initializes the cognitive stack)
  //   2. Restore LEAP states from Supabase (so layers remember prior cycles)
  //   3. Fetch real signals, edges, patterns from the DB (written by consolidation)
  //   4. Call cognitiveStack.runCycle() directly with this real data
  //   5. Persist LEAP states + layer outputs back to Supabase
  // ══════════════════════════════════════════════════════════════════════════
  divider('COGNITIVE STACK: LAYERS 3-15 (Direct Invocation)');
  try {
    log('COGNITIVE', 'Running cognitive stack L3-L15 with real consolidation data...');
    const pipelineStartTime = Date.now();

    const pipeline = createBrainPipeline({
      supabase,
      organizationId: ORGANIZATION_ID,
      verbose: VERBOSE,
    });

    const cognitiveStack = pipeline.getCognitiveStack();

    // Step 1: Restore LEAP states from prior cycles
    try {
      const { data: leapStates } = await supabase
        .from('cognitive_leap_state')
        .select('leap_type, state_data')
        .eq('organization_id', ORGANIZATION_ID);

      if (leapStates && leapStates.length > 0) {
        const layers = cognitiveStack.layers;
        for (const s of leapStates) {
          try {
            if (s.leap_type === 'deep_dreaming' && layers.dreaming.loadState) {
              layers.dreaming.loadState(s.state_data as any);
            } else if (s.leap_type === 'hierarchical_memory' && layers.memory.loadState) {
              layers.memory.loadState(s.state_data as any);
            } else if (s.leap_type === 'theory_of_mind' && layers.theoryOfMind.loadState) {
              layers.theoryOfMind.loadState(s.state_data as any);
            } else if (s.leap_type === 'temporal_consciousness' && layers.temporal.loadState) {
              layers.temporal.loadState(s.state_data as any);
            }
          } catch { /* skip individual load failures */ }
        }
        log('COGNITIVE', `Restored ${leapStates.length} LEAP state(s) from prior cycles`);
      }
    } catch (err) {
      logError('COGNITIVE', 'LEAP state restoration skipped (starting fresh)', err);
    }

    // Step 2: Fetch real data from DB (written by consolidation above)
    const [signalsResult, edgesResult, patternsResult, predictionsResult] = await Promise.all([
      supabase
        .from('cross_domain_signals')
        .select('id, signal_type, signal_value, source_domain, signal_timestamp')
        .eq('organization_id', ORGANIZATION_ID)
        .gte('signal_timestamp', new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString())
        .order('signal_timestamp', { ascending: false })
        .limit(500),
      supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, effect_size, granger_p_value')
        .eq('organization_id', ORGANIZATION_ID)
        .eq('is_significant', true)
        .limit(200),
      supabase
        .from('ai_memory')
        .select('content')
        .eq('organization_id', ORGANIZATION_ID)
        .eq('memory_type', 'pattern')
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('prediction_records')
        .select('id, domain, entity_id, prediction_type, confidence')
        .eq('organization_id', ORGANIZATION_ID)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(100),
    ]);

    // Build cognitive cycle input from real data
    const cogSignals = (signalsResult.data || []).map((s: any, i: number) => ({
      id: `signal_${s.id || i}`,
      source: 'consolidation',
      domain: s.source_domain || 'unknown',
      entityType: 'signal',
      entityId: s.signal_type || 'unknown',
      value: s.signal_value || 0,
      timestamp: new Date(s.signal_timestamp || Date.now()).getTime(),
    }));

    const cogEdges = (edgesResult.data || []).map((e: any) => ({
      source: e.source_domain,
      target: e.target_domain,
      weight: e.effect_size || 0,
      confidence: 1 - (e.granger_p_value || 0.5),
    }));

    const cogPatterns = (patternsResult.data || []).map((p: any) => p.content || '');
    // Add discoveries from this consolidation run
    for (const r of results) {
      if (r.report?.discoveries) cogPatterns.push(...r.report.discoveries);
    }

    const cogPredictions = (predictionsResult.data || []).map((p: any) => ({
      id: p.id,
      domain: p.domain || 'general',
      claim: `${p.prediction_type}: ${p.entity_id}`,
      confidence: p.confidence || 0.5,
      evidence: [],
      method: p.prediction_type || 'unknown',
    }));

    const cogMetrics = results.length > 0 ? [
      { name: 'signals_processed', domain: 'brain', currentValue: results.reduce((sum, r) => sum + r.report.stats.signalsProcessed, 0), previousValue: 0 },
      { name: 'causal_edges', domain: 'brain', currentValue: results.reduce((sum, r) => sum + r.report.stats.causalEdgesDiscovered, 0), previousValue: 0 },
      { name: 'anomalies', domain: 'brain', currentValue: results.reduce((sum, r) => sum + r.report.stats.anomaliesDetected, 0), previousValue: 0 },
    ] : [];

    log('COGNITIVE', `Input: ${cogSignals.length} signals, ${cogEdges.length} edges, ${cogPatterns.length} patterns, ${cogPredictions.length} predictions`);

    // Step 3: Run cognitive stack with real data
    // Bug #5 fix: use try/finally so LEAP states are persisted even on partial failure.
    // If runCycle() crashes mid-way, layers may still have accumulated state worth saving.
    let cogResult: any = null;
    try {
      cogResult = cognitiveStack.runCycle({
        signals: cogSignals,
        causalEdges: cogEdges,
        patterns: cogPatterns,
        predictions: cogPredictions,
        metrics: cogMetrics,
      });

      const pipelineDuration = ((Date.now() - pipelineStartTime) / 1000).toFixed(1);
      log('COGNITIVE', `Cognitive Stack complete in ${pipelineDuration}s`);
      log('COGNITIVE', `  L3  Deep Dreaming:       ${cogResult.dreaming?.associationsFound ?? 0} associations, ${cogResult.dreaming?.crossDomainConnections ?? 0} cross-domain`);
      log('COGNITIVE', `  L4  Hierarchical Memory: ${cogResult.memory?.itemsEncoded ?? 0} items encoded, ${cogResult.memory?.episodesRecorded ?? 0} episodes`);
      log('COGNITIVE', `  L5  Curiosity:           ${cogResult.curiosity?.hypothesesGenerated ?? 0} hypotheses, ${cogResult.curiosity?.knowledgeGaps ?? 0} gaps`);
      log('COGNITIVE', `  L6  Self-Modifying:      ${cogResult.selfModel?.suggestedModifications ?? 0} modifications, calibration=${(cogResult.selfModel?.calibrationScore ?? 0).toFixed(2)}`);
      log('COGNITIVE', `  L7  Intelligence Mesh:   ${cogResult.mesh?.patternsContributed ?? 0} patterns, ${cogResult.mesh?.collectivePatterns ?? 0} collective`);
      log('COGNITIVE', `  L8  Causal Imagination:  ${cogResult.imagination?.scenariosPlanned ?? 0} scenarios, ${cogResult.imagination?.analogiesFound ?? 0} analogies`);
      log('COGNITIVE', `  L9  Theory of Mind:      updated=${cogResult.theoryOfMind?.userModelUpdated ?? false}, intent="${cogResult.theoryOfMind?.predictedIntent ?? 'unknown'}"`);
      log('COGNITIVE', `  L10 Temporal:            ${cogResult.temporal?.rhythmsDetected ?? 0} rhythms, ${cogResult.temporal?.goalsTracked ?? 0} goals tracked`);
      log('COGNITIVE', `  L11 Red Team:            ${cogResult.redTeam?.predictionsTested ?? 0} tests, robustness=${(cogResult.redTeam?.robustnessAvg ?? 0).toFixed(2)}`);
      log('COGNITIVE', `  L12 Experimentation:     ${cogResult.experimentation?.experimentsSuggested ?? 0} experiments suggested`);
      log('COGNITIVE', `  L13 Immune System:       ${cogResult.immune?.signalsChecked ?? 0} checked, ${cogResult.immune?.signalsQuarantined ?? 0} quarantined`);
      log('COGNITIVE', `  L14 Goal Planning:       ${cogResult.planning?.goalsPlanned ?? 0} goals, ${cogResult.planning?.feasiblePaths ?? 0} feasible paths`);
      log('COGNITIVE', `  L15 Narrative:           ${cogResult.narrative ? `"${cogResult.narrative.title}" (${cogResult.narrative.keyInsights?.length ?? 0} insights)` : 'none generated'}`);
    } catch (err) {
      logError('COGNITIVE', 'Cognitive stack runCycle() failed mid-way — will still persist partial LEAP state', err);
    } finally {
      // Step 4: Persist LEAP states to Supabase (ALWAYS runs, even on partial failure)
      try {
        const layers = cognitiveStack.layers;
        for (const [leapType, layer] of Object.entries({
          deep_dreaming: layers.dreaming,
          hierarchical_memory: layers.memory,
          theory_of_mind: layers.theoryOfMind,
          temporal_consciousness: layers.temporal,
        })) {
          if ((layer as any).getState) {
            await supabase.from('cognitive_leap_state').upsert({
              organization_id: ORGANIZATION_ID,
              leap_type: leapType,
              state_data: (layer as any).getState(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,leap_type' });
          }
        }
        log('COGNITIVE', `LEAP states persisted to Supabase${cogResult ? '' : ' (partial — runCycle failed)'}`);
      } catch (err) {
        logError('COGNITIVE', 'LEAP state persistence failed (non-critical)', err);
      }

      // Step 5: Persist layer outputs to ai_memory (only if runCycle succeeded)
      if (cogResult) {
        try {
          if (cogResult.narrative) {
            await supabase.from('ai_memory').upsert({
              organization_id: ORGANIZATION_ID,
              memory_type: 'narrative',
              domain: 'brain',
              content: cogResult.narrative.summary || cogResult.narrative.title,
              importance: cogResult.narrative.confidence || 0.5,
              confidence: cogResult.narrative.confidence || 0.5,
              metadata: {
                source: 'L15_narrative',
                title: cogResult.narrative.title,
                keyInsights: cogResult.narrative.keyInsights?.length ?? 0,
                generatedAt: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,memory_type,domain' });
          }
          if (cogResult.experimentation?.topExperiment) {
            await supabase.from('ai_memory').upsert({
              organization_id: ORGANIZATION_ID,
              memory_type: 'experiment',
              domain: 'brain',
              content: cogResult.experimentation.topExperiment,
              importance: 0.6,
              confidence: 0.5,
              metadata: { source: 'L12_experimentation', suggested: cogResult.experimentation.experimentsSuggested },
              updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,memory_type,domain' });
          }
          if (cogResult.planning?.topRecommendation) {
            await supabase.from('ai_memory').upsert({
              organization_id: ORGANIZATION_ID,
              memory_type: 'goal_plan',
              domain: 'brain',
              content: cogResult.planning.topRecommendation,
              importance: 0.7,
              confidence: 0.5,
              metadata: { source: 'L14_goal_planning', goalsPlanned: cogResult.planning.goalsPlanned },
              updated_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,memory_type,domain' });
          }
          log('COGNITIVE', 'Layer outputs persisted to ai_memory');
        } catch (err) {
          logError('COGNITIVE', 'Layer output persistence failed (non-critical)', err);
        }
      }
    }
  } catch (err) {
    logError('COGNITIVE', 'Cognitive stack L3-L15 failed (pre-runCycle setup error)', err);
    logError('COGNITIVE', 'Continuing with learning steps — consolidation data is still valid', undefined);
  }

  // ── POST-CONSOLIDATION: Real Learning Steps ──
  // Bug #9 fix: skip learning if SKIP_LEARNING=true — the nightly orchestrator
  // runs learning separately in Phase 4 (run-full-consolidation.ts), so running
  // it here in Phase 2 would be redundant (2-3x the Bayesian/embedding/contrastive work).
  if (process.env.SKIP_LEARNING === 'true') {
    log('LEARN', 'Skipping learning steps (orchestrator handles them in Phase 4)');
  } else {
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

    // Get VERIFIED prediction history from prediction_records table (not ai_memory)
    const { data: verifiedPredictions } = await supabase
      .from('prediction_records')
      .select('domain, entity_id, prediction_type, predicted_value, confidence, was_correct')
      .eq('organization_id', ORGANIZATION_ID)
      .not('was_correct', 'is', null)
      .gte('verified_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(200);

    // Also check verified cascade alerts for domain-pair evidence
    const { data: verifiedCascades } = await supabase
      .from('cascade_alerts')
      .select('trigger_domain, predicted_path, severity, anomaly_score, verified_at, prediction_accuracy')
      .eq('organization_id', ORGANIZATION_ID)
      .not('verified_at', 'is', null)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    let bayesianUpdates = 0;

    if (verifiedPredictions && verifiedPredictions.length > 0) {
      for (const p of verifiedPredictions) {
        if (p.prediction_type === 'cascade_propagation' && p.entity_id?.includes('→')) {
          const domains = p.entity_id.split('→');
          for (let i = 0; i < domains.length - 1; i++) {
            bayesian.update({ sourceDomain: domains[i], targetDomain: domains[i + 1], wasCorrect: p.was_correct || false, predictionConfidence: p.confidence || 0.5 });
            bayesianUpdates++;
          }
        } else {
          bayesian.update({ sourceDomain: p.domain || 'unknown', targetDomain: p.entity_id || p.domain || 'unknown', wasCorrect: p.was_correct || false, predictionConfidence: p.confidence || 0.5 });
          bayesianUpdates++;
        }
      }
    }

    if (verifiedCascades && verifiedCascades.length > 0) {
      for (const alert of verifiedCascades) {
        const path = alert.predicted_path || [];
        const wasAccurate = (alert.prediction_accuracy || 0) > 0.5;
        for (let i = 0; i < path.length - 1; i++) {
          bayesian.update({ sourceDomain: path[i], targetDomain: path[i + 1], wasCorrect: wasAccurate, predictionConfidence: alert.anomaly_score > 3 ? 0.8 : 0.5 });
          bayesianUpdates++;
        }
      }
    }

    if (bayesianUpdates > 0) {
      const persisted = await bayesian.persistPosteriors();
      log('LEARN', `Bayesian: ${bayesianUpdates} evidence updates from ${(verifiedPredictions?.length || 0)} predictions + ${(verifiedCascades?.length || 0)} cascade alerts, persisted ${persisted} posteriors`);
      const uncertain = bayesian.getUncertainEdges(0.25);
      if (uncertain.length > 0) {
        log('LEARN', `Bayesian: ${uncertain.length} edges need more evidence (high uncertainty)`);
      }
    } else {
      log('LEARN', 'Bayesian: no verified prediction data yet — posteriors unchanged (waiting for verification cron)');
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
  } // end SKIP_LEARNING guard

  // ── POST-LEARNING: Fast-Path Invalidation + Pre-Warming (Cerebellum) ──
  // After consolidation changes the causal graph, stale fast-path caches
  // must be invalidated so the copilot gets fresh answers.
  // Then pre-warm common query shapes so first queries after sleep are fast.
  divider('CEREBELLUM: FAST-PATH INVALIDATION + PRE-WARMING');
  try {
    const fastPath = createFastPathCompiler({
      supabase,
      organizationId: ORGANIZATION_ID,
      verbose: VERBOSE,
    });
    await fastPath.invalidateAll();

    // Also clear DB-backed fast-path cache (expired + stale entries)
    const { count: cacheCleared } = await supabase
      .from('fast_path_cache')
      .delete()
      .eq('organization_id', ORGANIZATION_ID)
      .lt('expires_at', new Date().toISOString())
      .select('*', { count: 'exact', head: true });

    log('CEREBELLUM', `All fast-paths invalidated, ${cacheCleared ?? 0} expired DB cache entries cleared`);

    // Pre-warm common business query shapes so first queries after
    // consolidation hit compiled paths instead of cold misses.
    // These cover the top query fingerprints across business domains.
    // SKIP in emergency mode — pre-warming is non-essential
    if (emergencyMode) {
      log('CEREBELLUM', 'Skipping pre-warming (emergency memory mode)');
    }
    const warmupQueries = !emergencyMode ? [
      'Why did revenue change this quarter?',
      'What caused churn to increase?',
      'How is customer acquisition trending?',
      'What is driving cost increases?',
      'Compare sales performance across regions',
      'What patterns emerged in marketing spend?',
      'How did engineering velocity change?',
      'What risks should we watch for?',
      'Show me cross-domain correlations',
      'What changed since last consolidation?',
    ] : [];

    let warmed = 0;
    for (const query of warmupQueries) {
      try {
        await fastPath.precompile(query);
        warmed++;
      } catch {
        // Some queries may not have enough graph data — skip silently
      }
    }
    log('CEREBELLUM', `Pre-warmed ${warmed}/${warmupQueries.length} common query shapes`);

    const stats = fastPath.getStats();
    log('CEREBELLUM', `Cache: ${stats.compiledPaths} compiled paths ready`);
  } catch (err) {
    logError('CEREBELLUM', 'Fast-path invalidation/pre-warming failed (non-fatal)', err);
  }

  // ── POST-LEARNING: Anomaly Sweep (Insula) + Cascade Alert Pipeline (Thalamus) ──
  divider('INSULA + THALAMUS: POST-CONSOLIDATION ANOMALY & CASCADE SWEEP');
  let postConsolidationAnomalies = 0;
  let postConsolidationCascadeAlerts = 0;
  try {
    const eventBus = createEventBus({ debounceMs: 0 });
    const anomalyMonitor = createAnomalyMonitor(eventBus, {
      threshold: 2.0,
      windowSize: 30,
    });

    // Build context enricher from freshly-consolidated causal graph
    const { data: causalEdgesForCascade } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, effect_size, granger_p_value, granger_f_statistic, optimal_lag_days, natural_language')
      .eq('organization_id', ORGANIZATION_ID)
      .eq('is_significant', true)
      .order('effect_size', { ascending: false })
      .limit(100);

    const cachedRels: CachedRelationship[] = (causalEdgesForCascade || []).map((e: any) => ({
      sourceDomain: e.source_domain, targetDomain: e.target_domain,
      effectSize: e.effect_size || 0, pValue: e.granger_p_value || 0,
      fStatistic: e.granger_f_statistic || 0, lagDays: e.optimal_lag_days || 0,
      naturalLanguage: e.natural_language || '', discoveredAt: new Date(),
    }));

    const contextEnricher = {
      getContextForAgent: (_orgId: string, domain?: string) => ({
        causalRelationships: domain ? cachedRels.filter(r => r.sourceDomain === domain || r.targetDomain === domain) : cachedRels,
        patterns: [],
      }),
    };

    const cascadeAlerts: CascadeAlertPayload[] = [];
    createCascadeAlertPipeline(eventBus, contextEnricher, {
      minSeverity: 30,
      onAlert: async (alert) => {
        cascadeAlerts.push(alert);
        postConsolidationCascadeAlerts++;
        try {
          // Bug #8 fix: upsert with onConflict to prevent duplicate alerts on re-run
          await supabase.from('cascade_alerts').upsert({
            organization_id: alert.organizationId, alert_id: alert.alertId,
            severity: alert.severity, trigger_domain: alert.triggerDomain,
            trigger_signal_type: alert.triggerSignalType, anomaly_score: alert.anomalyScore,
            predicted_path: alert.predictedPath, expected_impacts: alert.expectedImpacts,
            recommended_interventions: alert.recommendedInterventions,
          }, { onConflict: 'alert_id' });
        } catch { /* non-critical */ }
      },
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
          eventId: generateEventId(),
          organizationId: ORGANIZATION_ID,
          domain: signal.source_domain || 'unknown',
          entityType: 'signal',
          entityId: signal.signal_type || 'unknown',
          eventType: 'signal' as any,
          payload: { signal_type: signal.signal_type, signal_value: signal.signal_value },
          timestamp: new Date(signal.signal_timestamp || Date.now()),
        });
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      const stats = anomalyMonitor.getStats();
      postConsolidationAnomalies = stats.totalAnomaliesDetected;
      log('INSULA', `Swept ${recentSignals.length} signals → ${postConsolidationAnomalies} anomalies across ${stats.windowsTracked} windows`);
      if (postConsolidationCascadeAlerts > 0) {
        log('THALAMUS', `${postConsolidationCascadeAlerts} cascade alert${postConsolidationCascadeAlerts !== 1 ? 's' : ''} generated`);
        for (const a of cascadeAlerts.slice(0, 3)) {
          log('THALAMUS', `  ⚡ [${a.severity}] ${a.triggerDomain} → ${a.predictedPath.join(' → ')}`);
        }
      }
    } else {
      log('INSULA', 'No recent signals to sweep');
    }
  } catch (err) {
    logError('INSULA', 'Post-consolidation anomaly/cascade sweep failed (non-fatal)', err);
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
      contextManager.recordInsight(`[consolidation] ${discovery.substring(0, 150)}`);
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
  // CORPUS CALLOSUM: Federation — Promote discoveries to core brain
  // Includes approval governance: expire stale items, log stats
  //
  // Bug #10 fix: skip if SKIP_FEDERATION=true — the consolidation engine
  // already runs upstream federation as a bonus step inside runConsolidation().
  // Running it again here is redundant (promotes the same knowledge twice).
  // ═══════════════════════════════════════════════════════
  if (process.env.SKIP_FEDERATION === 'true') {
    log('FEDERATION', 'Skipping (consolidation engine already ran federation)');
  } else
  try {
    // Only promote if we consolidated an org brain (not the core brain itself)
    if (ORGANIZATION_ID !== CORE_BRAIN_ORG_ID) {
      // 1. Expire stale pending items (>7 days old)
      const approvalMgr = createFederationApprovalManager(supabase, ORGANIZATION_ID);
      const expiredCount = await approvalMgr.expirePending();
      if (expiredCount > 0) {
        log('FEDERATION', `Expired ${expiredCount} stale pending approval items`);
      }

      // 2. Log approval queue stats
      const approvalStats = await approvalMgr.getStats();
      if (approvalStats.pendingCount > 0) {
        log('FEDERATION', `Approval queue: ${approvalStats.pendingCount} pending, ${approvalStats.approvedToday} approved today, ${approvalStats.rejectedToday} rejected today`);
      }

      // 3. Promote knowledge (routes through approval when require_approval=true)
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

      if (totalPromoted > 0 || promotionResult.itemsQueued > 0) {
        log('FEDERATION', `Promoted ${totalPromoted} items to core brain:`);
        log('FEDERATION', `  Relationships: ${promotionResult.relationshipsPromoted}`);
        log('FEDERATION', `  Memories: ${promotionResult.memoriesPromoted}`);
        log('FEDERATION', `  Rules: ${promotionResult.rulesPromoted}`);
        if (promotionResult.itemsQueued > 0) {
          log('FEDERATION', `  Queued for approval: ${promotionResult.itemsQueued}`);
        }
        if (promotionResult.itemsAutoApproved > 0) {
          log('FEDERATION', `  Auto-approved: ${promotionResult.itemsAutoApproved}`);
        }
        if (promotionResult.itemsSkippedPII > 0) {
          log('FEDERATION', `  Skipped (PII): ${promotionResult.itemsSkippedPII}`);
        }
        if (promotionResult.itemsSkippedExcluded > 0) {
          log('FEDERATION', `  Skipped (excluded domain): ${promotionResult.itemsSkippedExcluded}`);
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

  // Stop memory monitor and log stats
  if (memoryMonitor) {
    const memStats = memoryMonitor.stop();
    divider('MEMORY REPORT');
    log('MEMORY', `Peak heap: ${memStats.peakHeapUsedMB.toFixed(0)}MB | Avg heap: ${memStats.avgHeapUsedMB.toFixed(0)}MB | Peak RSS: ${memStats.peakRssMB.toFixed(0)}MB`);
    log('MEMORY', `Time in normal: ${(memStats.timeInNormalMs / 1000).toFixed(1)}s | elevated: ${(memStats.timeInElevatedMs / 1000).toFixed(1)}s | high: ${(memStats.timeInHighMs / 1000).toFixed(1)}s | critical: ${(memStats.timeInCriticalMs / 1000).toFixed(1)}s`);
    log('MEMORY', `GC triggered: ${memStats.gcTriggered} | Batch reductions: ${memStats.batchReductions} | Emergency mode: ${emergencyMode ? 'YES' : 'no'}`);
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

  // ── Write daily brain snapshot for website dashboard ──────────
  // Powers the live brain dashboard at usebrainos.com
  // One row per org per day — upserts so re-runs overwrite gracefully
  // IMPORTANT: Skip writing if consolidation produced zero data (e.g. lock failures)
  // or if any domains failed — partial data would overwrite a good earlier snapshot.
  // Bug #6 fix: also check `failed > 0` to prevent partial-run overwrites.
  if (totalSignals === 0 && totalNew === 0 && totalEdges === 0) {
    log('SNAPSHOT', 'Skipping snapshot write — consolidation produced zero data (would overwrite good data)');
  } else if (failed > 0) {
    log('SNAPSHOT', `Skipping snapshot write — ${failed} domain(s) failed (partial data would overwrite good snapshot)`);
  } else
  try {
    const totalPatterns = results.reduce((sum, r) => sum + r.report.stats.patternsFound, 0);
    const totalMemories = results.reduce((sum, r) => sum + r.report.stats.memoriesCreated, 0);
    const totalDecayed = results.reduce((sum, r) => sum + r.report.stats.edgesDecayed, 0);

    // Determine which brain regions were active based on what the consolidation did
    const regionsActive: string[] = [];
    if (totalSignals > 0) regionsActive.push('perception');    // Sensory Cortex — ingested data
    if (totalNew > 0) regionsActive.push('memory');            // Hippocampus — formed memories
    if (totalEdges > 0) regionsActive.push('reasoning');       // Neocortex — causal discovery
    if (totalAnomalies > 0) regionsActive.push('instinct');    // Insula — anomaly detection
    if (totalPatterns > 0) regionsActive.push('subconscious'); // DMN — pattern discovery
    if (totalPruned > 0 || totalStrengthened > 0) regionsActive.push('reflexes');  // Cerebellum — pruning/strengthening
    if (totalMemories > 0) regionsActive.push('emotional');    // Amygdala — impact scoring
    regionsActive.push('simulation');                          // PFC — always active during consolidation

    // Get total brain knowledge connections (edges + memories) for cumulative tracking
    // Bug #13 fix: scope total_connections to current org (was globally counting all orgs)
    let totalConnectionsInDB = totalEdges;
    try {
      const { count: edgeCount } = await supabase
        .from('causal_relationships_statistical')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ORGANIZATION_ID);
      const { count: memoryCount } = await supabase
        .from('ai_memory')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ORGANIZATION_ID);
      totalConnectionsInDB = (edgeCount || 0) + (memoryCount || 0);
    } catch {
      // Fall back to session count
    }

    // Get prediction accuracy from ALL verified sources (prediction_records + prediction_outcomes + bayesian posteriors)
    let predictionAccuracy: number | null = null;
    try {
      // Source 1: prediction_records (training packs + real predictions) — most populated
      const { data: verifiedPredictions } = await supabase
        .from('prediction_records')
        .select('was_correct')
        .eq('organization_id', ORGANIZATION_ID)
        .not('was_correct', 'is', null)
        .not('verified_at', 'is', null)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(500);

      // Source 2: prediction_outcomes (feedback loop verified)
      const { data: outcomes } = await supabase
        .from('prediction_outcomes')
        .select('outcome_occurred')
        .eq('organization_id', ORGANIZATION_ID)
        .not('outcome_occurred', 'is', null)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(200);

      // Source 3: Bayesian posteriors — the most honest accuracy measure
      const { data: posteriors } = await supabase
        .from('bayesian_posteriors')
        .select('mean, evidence_count')
        .eq('organization_id', ORGANIZATION_ID)
        .gt('evidence_count', 0);

      // Combine all sources for accuracy calculation
      let correctCount = 0;
      let totalCount = 0;

      if (verifiedPredictions && verifiedPredictions.length > 0) {
        correctCount += verifiedPredictions.filter((p: { was_correct: boolean }) => p.was_correct).length;
        totalCount += verifiedPredictions.length;
      }
      if (outcomes && outcomes.length > 0) {
        correctCount += outcomes.filter((o: { outcome_occurred: boolean }) => o.outcome_occurred).length;
        totalCount += outcomes.length;
      }

      if (totalCount >= 5) {
        predictionAccuracy = Math.round((correctCount / totalCount) * 1000) / 10;
      }

      // If still no accuracy from direct predictions, use Bayesian posterior means
      if (predictionAccuracy === null && posteriors && posteriors.length > 0) {
        const weightedSum = posteriors.reduce((sum: number, p: { mean: number; evidence_count: number }) =>
          sum + p.mean * p.evidence_count, 0);
        const totalEvidence = posteriors.reduce((sum: number, p: { evidence_count: number }) =>
          sum + p.evidence_count, 0);
        if (totalEvidence > 0) {
          predictionAccuracy = Math.round((weightedSum / totalEvidence) * 1000) / 10;
        }
      }
    } catch {
      // Tables may not exist yet — non-critical
    }

    // If no validated predictions yet, carry forward yesterday's accuracy
    if (predictionAccuracy === null) {
      try {
        const { data: lastSnapshot } = await supabase
          .from('brain_daily_snapshots')
          .select('prediction_accuracy')
          .eq('organization_id', ORGANIZATION_ID)
          .not('prediction_accuracy', 'is', null)
          .order('snapshot_date', { ascending: false })
          .limit(1);
        if (lastSnapshot && lastSnapshot.length > 0 && lastSnapshot[0].prediction_accuracy !== null) {
          predictionAccuracy = lastSnapshot[0].prediction_accuracy;
        }
      } catch {
        // Non-critical
      }
    }

    await supabase.from('brain_daily_snapshots').upsert({
      organization_id: ORGANIZATION_ID,
      snapshot_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      total_connections: totalConnectionsInDB,
      new_connections: totalNew,
      total_signals: totalSignals,
      signals_processed: totalSignals,
      prediction_accuracy: predictionAccuracy,
      edges_strengthened: totalStrengthened,
      edges_pruned: totalPruned,
      edges_decayed: totalDecayed,
      anomalies_detected: totalAnomalies,
      patterns_found: totalPatterns,
      memories_created: totalMemories,
      regions_active: regionsActive,
      top_discoveries: allDiscoveries.slice(0, 10),
      consolidation_stats: {
        signalsProcessed: totalSignals,
        causalEdgesDiscovered: totalEdges,
        newRelationships: totalNew,
        anomaliesDetected: totalAnomalies,
        patternsFound: totalPatterns,
        edgesPruned: totalPruned,
        edgesStrengthened: totalStrengthened,
        edgesDecayed: totalDecayed,
        memoriesCreated: totalMemories,
        orgsConsolidated: results.length,
      },
      // Bug #14 fix: pick the narrative from the current org's result (not always results[0])
      narrative: (results.find(r => r.organizationId === ORGANIZATION_ID) ?? results[0])?.report?.narrative || null,
      run_duration_ms: Date.now() - overallStart,
      run_status: failed === 0 ? 'completed' : 'partial',
    }, {
      onConflict: 'organization_id,snapshot_date',
    });

    log('SNAPSHOT', 'Daily brain snapshot written for website dashboard');

    // ── GAP 5: LLM Consolidation Briefing ─────────────────────────────
    // Generate a CTO-grade executive briefing from tonight's consolidation
    // SKIP in emergency mode — LLM calls are expensive and non-essential
    if (emergencyMode) {
      log('LLM', 'Skipping executive briefing (emergency memory mode)');
    }
    if (LLM_API_KEY && !emergencyMode) {
      try {
        const amplifier = createBrainAmplifier({
          provider: LLM_PROVIDER,
          apiKey: LLM_API_KEY,
          verbose: VERBOSE,
          costTracker,
        });

        log('LLM', 'Generating executive consolidation briefing...');
        // Bug #14 fix: use current org's result, aggregate warnings from all domains
        const orgResult = results.find(r => r.organizationId === ORGANIZATION_ID) ?? results[0];
        const allWarnings = results.flatMap(r => r.report?.warnings || []);
        const briefing = await amplifier.generateConsolidationBriefing(
          {
            narrative: orgResult?.report?.narrative || undefined,
            discoveries: allDiscoveries.slice(0, 10),
            warnings: allWarnings,
            stats: orgResult?.report?.stats || {},
          },
          {
            signalsProcessed: totalSignals,
            edgesDiscovered: totalEdges,
            edgesStrengthened: totalStrengthened,
            edgesPruned: totalPruned,
            edgesDecayed: totalDecayed,
            anomaliesDetected: totalAnomalies,
            patternsFound: totalPatterns,
            memoriesCreated: totalMemories,
            runDurationMs: Date.now() - overallStart,
          }
        );

        // Update the snapshot with the executive briefing
        if (briefing.executiveSummary) {
          await supabase.from('brain_daily_snapshots').update({
            executive_summary: briefing.executiveSummary,
            key_findings: briefing.keyFindings,
            strategic_implications: briefing.strategicImplications,
          }).eq('organization_id', ORGANIZATION_ID)
            .eq('snapshot_date', new Date().toISOString().split('T')[0]);

          divider('EXECUTIVE BRIEFING (Claude)');
          console.log(briefing.executiveSummary);
          console.log('');
          if (briefing.keyFindings.length > 0) {
            console.log('Key Findings:');
            for (const f of briefing.keyFindings) console.log(`  • ${f}`);
          }
          if (briefing.risks.length > 0) {
            console.log('Risks:');
            for (const r of briefing.risks) console.log(`  ⚠ ${r}`);
          }
          if (briefing.strategicImplications.length > 0) {
            console.log('Strategic Implications:');
            for (const s of briefing.strategicImplications) console.log(`  → ${s}`);
          }
          console.log('');
        }

        log('LLM', 'Executive briefing generated and stored');
      } catch (err) {
        logError('LLM', 'Failed to generate executive briefing (non-critical)', err);
      }
    }
  } catch (err) {
    logError('SNAPSHOT', 'Failed to write daily snapshot (non-critical)', err);
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: -1 } } });
  costTracker = createCostTracker(supabase, true);

  // Start memory pressure monitor — adapts behavior to prevent OOM
  memoryMonitor = createMemoryPressureMonitor({ verbose: VERBOSE });
  memoryMonitor.onPressure('elevated', (snap) => {
    log('MEMORY', `Elevated pressure — ${snap.heapUsedMB.toFixed(0)}MB / ${snap.heapTotalMB.toFixed(0)}MB (${(snap.usageRatio * 100).toFixed(1)}%)`);
  });
  memoryMonitor.onPressure('high', (snap) => {
    log('MEMORY', `High pressure — triggering GC (${snap.heapUsedMB.toFixed(0)}MB / ${snap.heapTotalMB.toFixed(0)}MB)`);
    memoryMonitor!.tryGC();
  });
  memoryMonitor.onPressure('critical', (snap) => {
    logError('MEMORY', `CRITICAL pressure — entering emergency mode (${snap.heapUsedMB.toFixed(0)}MB / ${snap.heapTotalMB.toFixed(0)}MB)`);
    emergencyMode = true;
    memoryMonitor!.tryGC();
  });
  memoryMonitor.start();

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
      process.exit(0);
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
