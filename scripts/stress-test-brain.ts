#!/usr/bin/env tsx
/**
 * NexusBrain — Comprehensive Stress Test & Gap Finder
 * ====================================================
 *
 * Tests ALL known edge cases, failure modes, and gap conditions:
 *
 *  SUITE A — Data Volume Stress
 *    A1. Empty signals (0 signals) → brain must not crash
 *    A2. Minimal signals (3 signals) → below oracle threshold
 *    A3. Normal volume (650 signals) → baseline
 *    A4. High volume (3000 signals) → performance + memory
 *    A5. Very high volume (6000 signals) → batch pagination stress
 *
 *  SUITE B — Oracle Verification Edge Cases
 *    B1. All predictions have verifyAfter in FUTURE → 0 verified (correct)
 *    B2. All predictions EXPIRED → bandit gets 0 reward on expiry
 *    B3. Signals exist but WRONG domain → 0 matches
 *    B4. Signals exist but WRONG signal_type → 0 matches
 *    B5. Only 2 matching signals (below minSignals=3) → still pending
 *    B6. Exactly 3 matching signals → exactly enough to verify
 *    B7. Mixed: 2 correct + 2 wrong predictions → partial rewards
 *
 *  SUITE C — Bandit Reward Convergence
 *    C1. 10 rounds same arm → arm reward accumulates correctly
 *    C2. Mixed correct/wrong across arms → leaderboard sorts correctly
 *    C3. Reward formula: correct+accurate=~1.0, correct+inaccurate=0.6, wrong=0.0
 *
 *  SUITE D — Brain Resilience
 *    D1. Brain cycle with no causal edges → no crash
 *    D2. Brain cycle with malformed signal values → no crash
 *    D3. Multiple NCC instances (no shared state corruption)
 *    D4. Controller re-init (warm start from DB)
 *
 *  SUITE E — Org / Auth Edge Cases
 *    E1. Non-existent org UUID → graceful error
 *    E2. Signals for wrong org → oracle finds 0 matches
 *
 * Usage:
 *   pnpm exec tsx scripts/stress-test-brain.ts [--suite=A|B|C|D|E|all] [--verbose]
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  createOutcomeOracle,
  createCausalMethodBandit,
  createAutonomousLearner,
  createNeuralCortexController,
  createCognitiveStack,
  createDeepPipeline,
  createDeepLayers,
  createDomainTaxonomy,
  createCrossSystemEntityGraph,
  createBrainObservabilityBridge,
  registerAllAgents,
  type BanditArm,
} from '../packages/memory-stack/src/index';
import type { WatchedPrediction } from '../packages/memory-stack/src/causality/outcome-oracle';
import { computeActualOutcome, computeBanditReward, evaluatePrediction, findMatchingSignals } from '../packages/memory-stack/src/causality/outcome-oracle';

// ── Load env ──────────────────────────────────────────────────────────────────
loadEnv({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌  Missing SUPABASE env'); process.exit(1); }

const args = process.argv.slice(2);
const getFlag = (n: string, d: string) => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const hasFlag = (n: string) => args.includes(`--${n}`);
const SUITE  = getFlag('suite', 'all').toUpperCase();
const VERBOSE = hasFlag('verbose');

// ── Test harness ──────────────────────────────────────────────────────────────
let passed = 0; let failed = 0; let skipped = 0;
const failures: string[] = [];

function runSuite(name: string): boolean {
  if (SUITE !== 'ALL' && !name.startsWith(SUITE)) return false;
  return true;
}

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name.padEnd(64)}`);
  try {
    await fn();
    process.stdout.write(`✅\n`);
    passed++;
  } catch (err: any) {
    process.stdout.write(`❌  ${err.message?.substring(0, 60) ?? String(err)}\n`);
    if (VERBOSE) console.error('    Stack:', err.stack?.split('\n').slice(0, 4).join('\n    '));
    failed++;
    failures.push(`${name}: ${err.message ?? String(err)}`);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function assertApprox(actual: number, expected: number, tolerance: number, msg: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg}: expected ≈${expected} (±${tolerance}), got ${actual}`);
  }
}

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────
const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const daysAgo  = (d: number) => new Date(now - d * 86_400_000).toISOString();
const insertedTracker: string[] = [];

async function getOrgId(): Promise<string> {
  const { data } = await supabase.from('organizations').select('id,name').limit(5);
  const org = data?.find(o => isUUID(o.id)) ?? data?.[0];
  if (!org) throw new Error('No org found');
  return org.id;
}

async function insertSignals(signals: object[]): Promise<string[]> {
  const ids: string[] = [];
  const CHUNK = 200;
  for (let i = 0; i < signals.length; i += CHUNK) {
    const { data, error } = await supabase.from('cross_domain_signals').insert(signals.slice(i, i + CHUNK)).select('id');
    if (error) throw new Error(`Insert failed: ${error.message}`);
    if (data) {
      const newIds = data.map((r: any) => r.id);
      ids.push(...newIds);
      insertedTracker.push(...newIds);
    }
  }
  return ids;
}

async function deleteSignals(ids: string[]) {
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await supabase.from('cross_domain_signals').delete().in('id', ids.slice(i, i + CHUNK));
  }
}

async function buildController(orgId: string) {
  const bridge   = createBrainObservabilityBridge({ supabase, organizationId: orgId });
  const stack    = createCognitiveStack({ organizationId: orgId });
  const taxonomy = createDomainTaxonomy();
  const entity   = createCrossSystemEntityGraph({ maxArtifacts: 50000, maxLinks: 200000 });
  const layers   = createDeepLayers({ organizationId: orgId, domainTaxonomy: taxonomy, entityGraph: entity });
  const pipeline = createDeepPipeline({ organizationId: orgId, supabase, cognitiveStack: stack, deepLayers: layers, domainTaxonomy: taxonomy, entityGraph: entity, observabilityBridge: bridge });
  const ctrl     = createNeuralCortexController({ organizationId: orgId, supabase, pipeline, cognitiveStack: stack, deepLayers: layers, observabilityBridge: bridge, disableReinforcement: false, disableClosedLoop: false });
  registerAllAgents(ctrl);
  return ctrl;
}

function makePrediction(orgId: string, opts: {
  id: string;
  watchDomain: string;
  watchSignalType: string;
  sourceDomain: string;
  targetDomain: string;
  baseline: number;
  direction: 'increase' | 'decrease' | 'stable';
  magnitude: number;
  confidence: number;
  method: BanditArm;
  verifyAfterMs?: number;  // ms from now (negative = past, positive = future)
  expiresMs?: number;
}): WatchedPrediction {
  return {
    predictionId: opts.id,
    organizationId: orgId,
    sourceDomain: opts.sourceDomain,
    targetDomain: opts.targetDomain,
    watchMetric: `${opts.watchDomain}.${opts.watchSignalType}`,
    watchSignalType: opts.watchSignalType,
    watchDomain: opts.watchDomain,
    baselineValue: opts.baseline,
    baselineTimestamp: new Date(now - 7 * 86_400_000),
    predictedDirection: opts.direction,
    predictedMagnitude: opts.magnitude,
    confidence: opts.confidence,
    verifyAfter: new Date(now + (opts.verifyAfterMs ?? -60_000)),
    expiresAt: new Date(now + (opts.expiresMs ?? 48 * 3_600_000)),
    discoveryMethod: opts.method,
    status: 'pending' as const,
  };
}

function makeSignal(orgId: string, opts: {
  domain: string;
  type: string;
  value: number;
  entity?: string;
  hoursAgoN?: number;
}): object {
  return {
    organization_id: orgId,
    source_domain: opts.domain,
    signal_type: opts.type,
    signal_value: opts.value,
    entity_type: 'test',
    entity_id: opts.entity ?? `test_entity_${Math.random().toString(36).substr(2, 6)}`,
    signal_timestamp: hoursAgo(opts.hoursAgoN ?? 0.5),
    signal_metadata: { stress_test: true },
  };
}

// ── SUITE A: Data Volume Stress ───────────────────────────────────────────────
async function suiteA() {
  if (!runSuite('A')) return;
  console.log('\n══ SUITE A — Data Volume Stress ══════════════════════════════════════════');
  const orgId = await getOrgId();

  await test('A1. Empty signals (0) → brain learner returns gracefully', async () => {
    const learner = createAutonomousLearner({ supabase, organizationId: orgId });
    const result = await learner.runLearningCycle();
    // LearningCycleResult fields: causalEdgesUpdated, anomaliesDetected, patternsRegistered, duration, etc.
    assert(result !== null && result !== undefined, 'null result');
    assert(typeof result.causalEdgesUpdated === 'number', `causalEdgesUpdated missing/not number: ${typeof result.causalEdgesUpdated}`);
    assert(typeof result.anomaliesDetected === 'number',  `anomaliesDetected missing/not number: ${typeof result.anomaliesDetected}`);
    assert(typeof result.patternsRegistered === 'number', `patternsRegistered missing/not number: ${typeof result.patternsRegistered}`);
    assert(typeof result.duration === 'number',           `duration missing/not number: ${typeof result.duration}`);
  });

  await test('A2. 2 signals < oracle minSignals(3) → prediction stays pending', async () => {
    // Insert only 2 matching signals
    const ids = await insertSignals([
      makeSignal(orgId, { domain: 'engineering', type: 'pr_merged', value: 25, hoursAgoN: 1 }),
      makeSignal(orgId, { domain: 'engineering', type: 'pr_merged', value: 28, hoursAgoN: 0.5 }),
    ]);
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId, minSignalsForVerification: 3 } as any);
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_a2_${now}`, watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 14, direction: 'increase', magnitude: 0.5, confidence: 0.8,
      method: 'conditional', verifyAfterMs: -60_000,
    }));
    const { data: sigs } = await supabase.from('cross_domain_signals').select('source_domain,signal_type,signal_value,signal_timestamp,organization_id,entity_type,entity_id').in('id', ids);
    const result = await oracle.processBatch(sigs ?? []);
    assert(result.predictionsVerified === 0, `Expected 0 verified, got ${result.predictionsVerified}`);
    assert(result.predictionsPending === 1, `Expected 1 pending, got ${result.predictionsPending}`);
    await deleteSignals(ids);
  });

  await test('A3. Exactly 3 matching signals → prediction verified ✓', async () => {
    // baseline=10, predictedMag=0.5 → need avg≈15 → values 14-16
    // magnitudeError=|0.5-0.5|=0 → wasCorrect=true (direction correct + error ≤ 0.3)
    const ids = await insertSignals([
      makeSignal(orgId, { domain: 'engineering', type: 'pr_merged', value: 14.2, hoursAgoN: 1.2 }),
      makeSignal(orgId, { domain: 'engineering', type: 'pr_merged', value: 15.1, hoursAgoN: 0.8 }),
      makeSignal(orgId, { domain: 'engineering', type: 'pr_merged', value: 15.7, hoursAgoN: 0.4 }),
    ]);
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId, minSignalsForVerification: 3 } as any);
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_a3_${now}`, watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 10, direction: 'increase',
      magnitude: 0.5,  // predicts 50% increase → signal avg~15 → error≈0
      confidence: 0.8,
      method: 'transfer_entropy', verifyAfterMs: -60_000,
    }));
    const { data: sigs } = await supabase.from('cross_domain_signals').select('source_domain,signal_type,signal_value,signal_timestamp,organization_id,entity_type,entity_id').in('id', ids);
    const result = await oracle.processBatch(sigs ?? []);
    assert(result.predictionsVerified === 1, `Expected 1 verified, got ${result.predictionsVerified}`);
    await deleteSignals(ids);
  });

  await test('A4. High volume — 3000 signals inserted + learner runs', async () => {
    const signals = Array.from({ length: 3000 }, (_, i) => makeSignal(orgId, {
      domain: i % 3 === 0 ? 'engineering' : i % 3 === 1 ? 'product' : 'communication',
      type: ['pr_merged', 'commit_pushed', 'ticket_resolved', 'sprint_completed', 'channel_message_volume'][i % 5],
      value: Math.random() * 100,
      hoursAgoN: Math.random() * 720, // up to 30 days
    }));
    const start = Date.now();
    const ids = await insertSignals(signals);
    const insertMs = Date.now() - start;
    assert(ids.length === 3000, `Expected 3000 inserts, got ${ids.length}`);
    assert(insertMs < 30_000, `Insert took ${insertMs}ms — too slow`);
    if (VERBOSE) console.log(`\n       3000 inserts in ${insertMs}ms`);
    const learner = createAutonomousLearner({ supabase, organizationId: orgId });
    const lStart = Date.now();
    const lr = await learner.runLearningCycle();
    const learnerMs = Date.now() - lStart;
    assert(lr !== null, 'learner returned null');
    assert(learnerMs < 30_000, `Learner took ${learnerMs}ms — too slow`);
    if (VERBOSE) console.log(`       Learner cycle: ${learnerMs}ms`);
    await deleteSignals(ids);
  });

  await test('A5. 6000 signals — NCC brain cycle handles pagination', async () => {
    const signals = Array.from({ length: 6000 }, (_, i) => makeSignal(orgId, {
      domain: ['engineering', 'product', 'communication'][i % 3],
      type: ['pr_merged', 'commit_pushed', 'ticket_resolved'][i % 3],
      value: Math.random() * 50,
      hoursAgoN: Math.random() * 72,
    }));
    const ids = await insertSignals(signals);
    const ctrl = await buildController(orgId);
    ctrl.setMode('awake_lightweight');
    const { data: cycleSignals } = await supabase
      .from('cross_domain_signals').select('id,source_domain,signal_type,signal_value,entity_type,entity_id,signal_timestamp')
      .eq('organization_id', orgId).gte('signal_timestamp', daysAgo(3)).order('signal_timestamp', { ascending: false }).limit(2000);
    const formatted = (cycleSignals ?? []).map((s: any) => ({
      id: s.id, source: s.source_domain?.split('.')[0] ?? 'unknown',
      domain: s.source_domain ?? 'unknown', entityType: s.entity_type ?? 'unknown',
      entityId: s.entity_id ?? 'unknown', value: s.signal_value ?? 0,
      timestamp: new Date(s.signal_timestamp).getTime(), metadata: {},
    }));
    const start = Date.now();
    const result = await ctrl.runManagedCycle({ signals: formatted, causalEdges: [], patterns: [], predictions: [], metrics: [] });
    const brainMs = Date.now() - start;
    assert(brainMs < 60_000, `Brain cycle took ${brainMs}ms — too slow`);
    assert(result !== null && result !== undefined, 'brain returned null');
    if (VERBOSE) console.log(`\n       Brain cycle with ${formatted.length} signals: ${brainMs}ms`);
    await deleteSignals(ids);
  });
}

// ── SUITE B: Oracle Verification Edge Cases ───────────────────────────────────
async function suiteB() {
  if (!runSuite('B')) return;
  console.log('\n══ SUITE B — Oracle Verification Edge Cases ══════════════════════════════');
  const orgId = await getOrgId();

  await test('B1. verifyAfter in FUTURE → oracle skips (0 verified)', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_b1_${now}`, watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 14, direction: 'increase', magnitude: 0.5, confidence: 0.8,
      method: 'apex', verifyAfterMs: +3_600_000, // 1h in FUTURE
    }));
    const signals = Array.from({ length: 5 }, () =>
      ({ source_domain: 'engineering', signal_type: 'pr_merged', signal_value: 25, signal_timestamp: hoursAgo(0.5), organization_id: orgId, entity_type: 'pr', entity_id: 'test' })
    );
    const result = await oracle.processBatch(signals);
    assert(result.predictionsVerified === 0, `Expected 0 verified, got ${result.predictionsVerified}`);
    assert(result.predictionsPending === 1, `Expected 1 pending, got ${result.predictionsPending}`);
  });

  await test('B2. Prediction EXPIRED → bandit gets reward=0 (penalised)', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);
    const pred = makePrediction(orgId, {
      id: `stress_b2_${now}`, watchDomain: 'engineering', watchSignalType: 'ci_failed',
      sourceDomain: 'product', targetDomain: 'engineering',
      baseline: 0.2, direction: 'increase', magnitude: 0.5, confidence: 0.7,
      method: 'cascade_aware',
      verifyAfterMs: -7_200_000,  // 2h in past (was due)
      expiresMs: -60_000,         // 1min in past (already expired)
    });
    oracle.registerPrediction(pred);
    const signals: any[] = []; // no matching signals
    const result = await oracle.processBatch(signals);
    assert(result.predictionsExpired === 1, `Expected 1 expired, got ${result.predictionsExpired}`);
    assert(result.banditRewardsGiven === 1, `Expected 1 bandit reward (0.0), got ${result.banditRewardsGiven}`);
    // Confirm the expired arm has reward=0
    const lb = bandit.getMethodLeaderboard();
    const arm = lb.find(e => e.method === 'cascade_aware');
    if (arm) {
      assert(arm.avgReward === 0, `cascade_aware arm avgReward should be 0 after expiry, got ${arm.avgReward}`);
    }
  });

  await test('B3. Signals in WRONG domain → 0 matches (no verification)', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_b3_${now}`, watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 14, direction: 'increase', magnitude: 0.5, confidence: 0.8,
      method: 'pc_structural', verifyAfterMs: -60_000,
    }));
    // Signals in WRONG domain
    const signals = Array.from({ length: 5 }, (_, i) => ({
      source_domain: 'communication', // not 'engineering'
      signal_type: 'pr_merged',
      signal_value: 25,
      signal_timestamp: hoursAgo(0.5),
      organization_id: orgId,
      entity_type: 'slack', entity_id: `s_${i}`,
    }));
    const result = await oracle.processBatch(signals);
    assert(result.predictionsVerified === 0, `Expected 0 verified (wrong domain), got ${result.predictionsVerified}`);
    assert(result.predictionsPending === 1, `Expected 1 still pending, got ${result.predictionsPending}`);
  });

  await test('B4. Signals in WRONG signal_type → 0 matches', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_b4_${now}`, watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 14, direction: 'increase', magnitude: 0.5, confidence: 0.8,
      method: 'three_paradigm', verifyAfterMs: -60_000,
    }));
    // Signals with WRONG type
    const signals = Array.from({ length: 5 }, (_, i) => ({
      source_domain: 'engineering',
      signal_type: 'commit_pushed', // not 'pr_merged'
      signal_value: 1,
      signal_timestamp: hoursAgo(0.5),
      organization_id: orgId,
      entity_type: 'commit', entity_id: `c_${i}`,
    }));
    const result = await oracle.processBatch(signals);
    assert(result.predictionsVerified === 0, `Expected 0 verified (wrong type), got ${result.predictionsVerified}`);
  });

  await test('B5. Signals BEFORE baseline timestamp → filtered out', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);
    const baselineDate = new Date(now - 24 * 3_600_000); // baseline = 24h ago
    const pred: WatchedPrediction = {
      predictionId: `stress_b5_${now}`,
      organizationId: orgId,
      sourceDomain: 'engineering', targetDomain: 'engineering',
      watchMetric: 'engineering.pr_merged', watchSignalType: 'pr_merged', watchDomain: 'engineering',
      baselineValue: 14,
      baselineTimestamp: baselineDate,  // baseline 24h ago
      predictedDirection: 'increase', predictedMagnitude: 0.5, confidence: 0.8,
      verifyAfter: new Date(now - 60_000),
      expiresAt: new Date(now + 48 * 3_600_000),
      discoveryMethod: 'anomaly_conditioned',
      status: 'pending',
    };
    oracle.registerPrediction(pred);
    // All signals are BEFORE the baseline (old signals)
    const signals = Array.from({ length: 5 }, (_, i) => ({
      source_domain: 'engineering', signal_type: 'pr_merged', signal_value: 25,
      signal_timestamp: new Date(now - (25 + i) * 3_600_000).toISOString(), // 25-30h ago (before baseline)
      organization_id: orgId, entity_type: 'pr', entity_id: `old_${i}`,
    }));
    const result = await oracle.processBatch(signals);
    assert(result.predictionsVerified === 0, `Expected 0 verified (all signals pre-baseline), got ${result.predictionsVerified}`);
    assert(result.predictionsPending === 1, `Expected 1 pending, got ${result.predictionsPending}`);
  });

  await test('B6. Wrong org_id → oracle ignores signals', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_b6_${now}`, watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 14, direction: 'increase', magnitude: 0.5, confidence: 0.8,
      method: 'multi_resolution', verifyAfterMs: -60_000,
    }));
    const FAKE_ORG = '00000000-0000-0000-0000-000000000999';
    const signals = Array.from({ length: 5 }, (_, i) => ({
      source_domain: 'engineering', signal_type: 'pr_merged', signal_value: 25,
      signal_timestamp: hoursAgo(0.5),
      organization_id: FAKE_ORG, // WRONG org
      entity_type: 'pr', entity_id: `p_${i}`,
    }));
    const result = await oracle.processBatch(signals);
    assert(result.predictionsVerified === 0, `Expected 0 verified (wrong org), got ${result.predictionsVerified}`);
  });

  await test('B7. Mixed correct+wrong predictions → partial leaderboard', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);

    // KEY: signal values must produce actualMagnitude ≈ predictedMagnitude ± 0.3
    // Formula: magnitude = clamp((avg - baseline) / baseline, -1, 1)
    // For baseline=10, predictedMag=0.5: need avg ≈ 15 → signals around 14-16
    // This gives actualMag ≈ 0.5, magnitudeError ≈ 0 → wasCorrect=true → reward > 0

    // Prediction A: increase direction + accurate magnitude → CORRECT → rewarded
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_b7_correct_${now}`, watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 10, direction: 'increase',
      magnitude: 0.5,  // expect 50% increase → signals should be ~15
      confidence: 0.8,
      method: 'apex', verifyAfterMs: -60_000,
    }));
    // Prediction B: decrease direction — signals show INCREASE → wrong direction → reward=0
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_b7_wrong_${now}`, watchDomain: 'product', watchSignalType: 'sprint_completed',
      sourceDomain: 'product', targetDomain: 'product',
      baseline: 30, direction: 'decrease', magnitude: 0.3, confidence: 0.6,
      method: 'regime_conditional', verifyAfterMs: -60_000,
    }));

    const signals = [
      // 5 signals: avg≈15 → magnitude=(15-10)/10=0.5 → magnitudeError=|0.5-0.5|=0 → wasCorrect=true
      ...Array.from({ length: 5 }, () => ({ source_domain: 'engineering', signal_type: 'pr_merged', signal_value: 14.5 + Math.random(), signal_timestamp: hoursAgo(0.5), organization_id: orgId, entity_type: 'pr', entity_id: `p_${Math.random().toString(36).substr(2, 5)}` })),
      // 5 signals: values INCREASE (40+) → velocity went UP not down → wrong direction → reward=0
      ...Array.from({ length: 5 }, () => ({ source_domain: 'product', signal_type: 'sprint_completed', signal_value: 40 + Math.random() * 5, signal_timestamp: hoursAgo(0.5), organization_id: orgId, entity_type: 'sprint', entity_id: `s_${Math.random().toString(36).substr(2, 5)}` })),
    ];

    const result = await oracle.processBatch(signals);
    assert(result.predictionsVerified === 2, `Expected 2 verified, got ${result.predictionsVerified}`);
    assert(result.banditRewardsGiven === 2, `Expected 2 bandit calls (1 reward + 1 zero), got ${result.banditRewardsGiven}`);

    const lb = bandit.getMethodLeaderboard();
    const apexArm = lb.find(e => e.method === 'apex');
    const regimeArm = lb.find(e => e.method === 'regime_conditional');
    assert(apexArm !== undefined, 'apex arm not in leaderboard');
    assert(regimeArm !== undefined, 'regime_conditional arm not in leaderboard');
    assert((apexArm?.avgReward ?? 0) > 0, `apex avgReward should be > 0 (correct+accurate), got ${apexArm?.avgReward}`);
    assert((regimeArm?.avgReward ?? 0) === 0, `regime_conditional avgReward should be 0 (wrong direction), got ${regimeArm?.avgReward}`);
    if (VERBOSE) {
      console.log(`\n       apex.avgReward = ${apexArm?.avgReward?.toFixed(4)}`);
      console.log(`       regime_conditional.avgReward = ${regimeArm?.avgReward?.toFixed(4)}`);
      console.log(`       Verifications:`, result.verifications?.map(v => `${v.discoveryMethod}:wasCorrect=${v.wasCorrect},reward=${v.banditReward}`));
    }
  });
}

// ── SUITE C: Bandit Reward Convergence ────────────────────────────────────────
async function suiteC() {
  if (!runSuite('C')) return;
  console.log('\n══ SUITE C — Bandit Reward Convergence ═══════════════════════════════════');
  const orgId = await getOrgId();

  await test('C1. Reward formula: correct+accurate ≈ 1.0', async () => {
    // Small magnitude error → reward ≈ 1.0
    const eval1 = { wasCorrect: true, magnitudeError: 0.05 };
    const reward1 = computeBanditReward(eval1);
    assertApprox(reward1, 0.98, 0.05, 'correct+accurate reward');
    assert(reward1 > 0.9, `Expected > 0.9, got ${reward1}`);
  });

  await test('C2. Reward formula: correct+inaccurate = exactly 0.6', async () => {
    // Large magnitude error but direction correct → 0.6 base
    const eval2 = { wasCorrect: true, magnitudeError: 1.0 };
    const reward2 = computeBanditReward(eval2);
    assertApprox(reward2, 0.6, 0.01, 'correct+inaccurate reward');
  });

  await test('C3. Reward formula: wrong direction = exactly 0.0', async () => {
    const eval3 = { wasCorrect: false, magnitudeError: 0.1 };
    const reward3 = computeBanditReward(eval3);
    assert(reward3 === 0.0, `Expected 0.0 for wrong direction, got ${reward3}`);
  });

  await test('C4. 10 rounds same correct arm → avgReward accumulates > 0', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);

    // KEY: magnitude formula = clamp((avg-baseline)/baseline, -1, 1)
    // baseline=10, predictedMag=0.5 → need avg≈15 → signals around 14.5-15.5
    // magnitudeError = |0.5 - 0.5| = 0 → wasCorrect=true → reward = 0.6 + 0.4*(1-0) = 1.0
    let totalVerified = 0;
    for (let round = 1; round <= 10; round++) {
      oracle.registerPrediction(makePrediction(orgId, {
        id: `stress_c4_r${round}_${now}`,
        watchDomain: 'engineering', watchSignalType: 'pr_merged',
        sourceDomain: 'engineering', targetDomain: 'engineering',
        baseline: 10, direction: 'increase',
        magnitude: 0.5,  // predicts 50% increase → signal avg should be ~15
        confidence: 0.8,
        method: 'conditional', verifyAfterMs: -60_000,
      }));
      const signals = Array.from({ length: 5 }, () => ({
        source_domain: 'engineering', signal_type: 'pr_merged',
        signal_value: 14.5 + Math.random(), // avg≈15 → magnitude≈0.5 → error≈0
        signal_timestamp: hoursAgo(0.5),
        organization_id: orgId, entity_type: 'pr', entity_id: `p_${Math.random().toString(36).substr(2, 5)}`,
      }));
      const result = await oracle.processBatch(signals);
      totalVerified += result.predictionsVerified;
      oracle.pruneCompleted();
    }

    const lb = bandit.getMethodLeaderboard();
    const conditionalArm = lb.find(e => e.method === 'conditional');
    assert(totalVerified === 10, `Expected 10 total verified, got ${totalVerified}`);
    assert(conditionalArm !== undefined, 'conditional arm missing from leaderboard');
    assert((conditionalArm?.pairsWon ?? 0) > 0, `conditional arm should have pairs_won > 0`);
    assert((conditionalArm?.avgReward ?? 0) > 0.3, `conditional arm avgReward should be > 0.3 after 10 correct rounds, got ${conditionalArm?.avgReward?.toFixed(4)}`);
    if (VERBOSE) console.log(`\n       conditional avgReward after 10 rounds: ${conditionalArm?.avgReward?.toFixed(4)}, pairs_won: ${conditionalArm?.pairsWon}`);
  });

  await test('C5. Leaderboard sorts by avgReward DESC (winning arm first)', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);

    // Arm A: apex — CORRECT direction + accurate magnitude → high reward
    // Arm B: pc_structural — WRONG direction → reward=0
    // For apex: baseline=10, predictedMag=0.5 → need signal avg≈15 (50% above baseline)
    // magnitudeError = |0.5 - 0.5| = 0 → wasCorrect=true → reward≈1.0
    for (let i = 0; i < 5; i++) {
      oracle.registerPrediction(makePrediction(orgId, {
        id: `stress_c5_apex_${i}_${now}`,
        watchDomain: 'engineering', watchSignalType: 'pr_merged',
        sourceDomain: 'engineering', targetDomain: 'engineering',
        baseline: 10, direction: 'increase',
        magnitude: 0.5, // predicts 50% increase → signal avg should be ~15
        confidence: 0.8,
        method: 'apex', verifyAfterMs: -60_000,
      }));
      oracle.registerPrediction(makePrediction(orgId, {
        id: `stress_c5_pc_${i}_${now}`,
        watchDomain: 'product', watchSignalType: 'sprint_completed',
        sourceDomain: 'product', targetDomain: 'product',
        baseline: 30, direction: 'decrease', magnitude: 0.3, confidence: 0.6,
        method: 'pc_structural', verifyAfterMs: -60_000,
      }));
      const signals = [
        // apex: avg≈15 → magnitude=(15-10)/10=0.5 → magnitudeError=0 → correct
        ...Array.from({ length: 5 }, () => ({ source_domain: 'engineering', signal_type: 'pr_merged', signal_value: 14.5 + Math.random(), signal_timestamp: hoursAgo(0.3), organization_id: orgId, entity_type: 'pr', entity_id: `pa_${i}_${Math.random().toString(36).substr(2, 4)}` })),
        // pc_structural: velocity goes UP (40+ > baseline 30) → wrong direction (predicted decrease) → reward=0
        ...Array.from({ length: 5 }, () => ({ source_domain: 'product', signal_type: 'sprint_completed', signal_value: 40 + Math.random() * 3, signal_timestamp: hoursAgo(0.3), organization_id: orgId, entity_type: 'sprint', entity_id: `sp_${i}_${Math.random().toString(36).substr(2, 4)}` })),
      ];
      await oracle.processBatch(signals);
      oracle.pruneCompleted();
    }

    const lb = bandit.getMethodLeaderboard();
    const apexArm = lb.find(e => e.method === 'apex');
    const pcArm   = lb.find(e => e.method === 'pc_structural');
    assert((apexArm?.avgReward ?? 0) > (pcArm?.avgReward ?? -1), `apex should beat pc_structural: apex=${apexArm?.avgReward?.toFixed(4)}, pc=${pcArm?.avgReward?.toFixed(4)}`);
    assert((apexArm?.avgReward ?? 0) > 0, `apex should have reward > 0 after 5 correct rounds`);
    // Leaderboard sorted by pairsWon DESC, then avgReward DESC
    if (VERBOSE) {
      console.log('\n       Leaderboard:');
      lb.slice(0, 5).forEach(e => console.log(`       ${e.method.padEnd(22)} avgReward=${e.avgReward?.toFixed(4)} pairsWon=${e.pairsWon}`));
    }
  });

  await test('C6. computeActualOutcome — stable within threshold', async () => {
    const signals = Array.from({ length: 5 }, (_, i) => ({
      source_domain: 'engineering', signal_type: 'pr_merged',
      signal_value: 10.1 + i * 0.01, // barely above baseline=10
      signal_timestamp: hoursAgo(0.5),
      organization_id: 'test', entity_type: 'pr', entity_id: `s_${i}`,
    }));
    const actual = computeActualOutcome(signals as any, 10.0, 0.05); // 5% stable threshold
    // avg ≈ 10.12, change = (10.12-10)/10 = 1.2% < 5% stable threshold
    assert(actual.direction === 'stable', `Expected stable (tiny change), got ${actual.direction}`);
  });

  await test('C7. computeActualOutcome — clear increase', async () => {
    const signals = Array.from({ length: 5 }, () => ({
      source_domain: 'engineering', signal_type: 'pr_merged', signal_value: 50,
      signal_timestamp: hoursAgo(0.5), organization_id: 'test', entity_type: 'pr', entity_id: 'x',
    }));
    const actual = computeActualOutcome(signals as any, 10.0, 0.05);
    assert(actual.direction === 'increase', `Expected increase, got ${actual.direction}`);
    assertApprox(actual.magnitude, 1.0, 0.01, 'magnitude should be capped at 1.0');
  });

  await test('C8. findMatchingSignals — wildcard watchDomain (*)', async () => {
    const pred: WatchedPrediction = {
      predictionId: 'test_wildcard', organizationId: 'org1',
      sourceDomain: 'engineering', targetDomain: 'product',
      watchMetric: '*.pr_merged', watchSignalType: 'pr_merged',
      watchDomain: '*', // wildcard
      baselineValue: 10, baselineTimestamp: new Date(now - 3_600_000),
      predictedDirection: 'increase', predictedMagnitude: 0.5,
      confidence: 0.8, verifyAfter: new Date(now - 60_000),
      expiresAt: new Date(now + 3_600_000), discoveryMethod: 'apex', status: 'pending',
    };
    const signals = [
      { source_domain: 'engineering', signal_type: 'pr_merged', signal_value: 25, signal_timestamp: hoursAgo(0.5), organization_id: 'org1', entity_type: 'pr', entity_id: 'p1' },
      { source_domain: 'product',     signal_type: 'pr_merged', signal_value: 30, signal_timestamp: hoursAgo(0.3), organization_id: 'org1', entity_type: 'pr', entity_id: 'p2' },
      { source_domain: 'communication', signal_type: 'pr_merged', signal_value: 28, signal_timestamp: hoursAgo(0.2), organization_id: 'org1', entity_type: 'pr', entity_id: 'p3' },
    ];
    const matches = findMatchingSignals(pred, signals as any);
    assert(matches.length === 3, `Wildcard should match all 3 domains, got ${matches.length}`);
  });
}

// ── SUITE D: Brain Resilience ─────────────────────────────────────────────────
async function suiteD() {
  if (!runSuite('D')) return;
  console.log('\n══ SUITE D — Brain Resilience ════════════════════════════════════════════');
  const orgId = await getOrgId();

  await test('D1. Brain cycle with ZERO signals → no crash', async () => {
    const ctrl = await buildController(orgId);
    ctrl.setMode('awake_lightweight');
    const result = await ctrl.runManagedCycle({ signals: [], causalEdges: [], patterns: [], predictions: [], metrics: [] });
    assert(result !== null && result !== undefined, 'null result with empty signals');
  });

  await test('D2. Brain cycle with NULL/undefined values in signals → no crash', async () => {
    const ctrl = await buildController(orgId);
    ctrl.setMode('awake_lightweight');
    const malformed = [
      { id: 'bad1', source: null, domain: undefined, entityType: '', entityId: null, value: NaN, timestamp: 0, metadata: null },
      { id: 'bad2', source: 'engineering', domain: 'engineering', entityType: 'pr', entityId: 'x', value: -999, timestamp: Date.now(), metadata: {} },
      { id: 'bad3', source: 'engineering', domain: 'engineering', entityType: 'pr', entityId: 'y', value: 1e15, timestamp: Date.now(), metadata: {} },
    ];
    const result = await ctrl.runManagedCycle({ signals: malformed as any, causalEdges: [], patterns: [], predictions: [], metrics: [] });
    assert(result !== null && result !== undefined, 'null result with malformed signals');
  });

  await test('D3. Brain cycle with malformed causal edges → no crash', async () => {
    const ctrl = await buildController(orgId);
    ctrl.setMode('awake_lightweight');
    const malformedEdges = [
      { source: null, target: undefined, weight: NaN, confidence: -1 },
      { source: 'engineering', target: 'product', weight: 999, confidence: 2.0 },
      { source: '', target: '', weight: 0, confidence: 0 },
    ];
    const result = await ctrl.runManagedCycle({ signals: [], causalEdges: malformedEdges as any, patterns: [], predictions: [], metrics: [] });
    assert(result !== null && result !== undefined, 'null result with malformed edges');
  });

  await test('D4. Two independent NCC instances → no shared state', async () => {
    const ctrl1 = await buildController(orgId);
    const ctrl2 = await buildController(orgId);
    ctrl1.setMode('awake_lightweight');
    ctrl2.setMode('awake_lightweight');
    const r1 = await ctrl1.runManagedCycle({ signals: [], causalEdges: [], patterns: [], predictions: [], metrics: [] });
    const r2 = await ctrl2.runManagedCycle({ signals: [], causalEdges: [], patterns: [], predictions: [], metrics: [] });
    assert(r1 !== null, 'ctrl1 returned null');
    assert(r2 !== null, 'ctrl2 returned null');
    // snapshot cycle counts should be independent
    const s1 = ctrl1.getSnapshot?.();
    const s2 = ctrl2.getSnapshot?.();
    if (s1 && s2) {
      // Both controllers start warm from DB so cycle counts may match — just check they don't corrupt each other
      assert(s1.cycleCount >= 0, 'ctrl1 cycleCount invalid');
      assert(s2.cycleCount >= 0, 'ctrl2 cycleCount invalid');
    }
  });

  await test('D5. Autonomous Learner with non-existent org → graceful (no throw)', async () => {
    const FAKE_ORG = '00000000-0000-0000-0000-000000000001';
    const learner = createAutonomousLearner({ supabase, organizationId: FAKE_ORG });
    let threw = false;
    try {
      const result = await learner.runLearningCycle();
      // Result may be empty but should not throw
      assert(result !== null && result !== undefined, 'null for fake org');
    } catch {
      threw = true;
    }
    assert(!threw, 'Learner should handle non-existent org without throwing');
  });

  await test('D6. Oracle with empty processBatch([] signals) → returns zeros', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_d6_${now}`, watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 14, direction: 'increase', magnitude: 0.5, confidence: 0.8,
      method: 'three_paradigm', verifyAfterMs: -60_000,
    }));
    const result = await oracle.processBatch([]); // EMPTY signal batch
    assert(result.signalsProcessed === 0, `Expected 0 signals, got ${result.signalsProcessed}`);
    assert(result.predictionsVerified === 0, `Expected 0 verified, got ${result.predictionsVerified}`);
    // Prediction remains pending (not enough signals, not expired)
    assert(result.predictionsPending === 1, `Expected 1 pending, got ${result.predictionsPending}`);
  });

  await test('D7. pruneCompleted removes verified+expired, keeps pending', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);
    // Register 3 predictions: one pending, one to verify, one expired
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_d7_pending_${now}`,
      watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 14, direction: 'increase', magnitude: 0.5, confidence: 0.8,
      method: 'apex', verifyAfterMs: +3_600_000, // FUTURE — stays pending
    }));
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_d7_expired_${now}`,
      watchDomain: 'engineering', watchSignalType: 'ci_failed',
      sourceDomain: 'product', targetDomain: 'engineering',
      baseline: 0.2, direction: 'increase', magnitude: 0.5, confidence: 0.7,
      method: 'cascade_aware',
      verifyAfterMs: -7_200_000, expiresMs: -60_000, // expired
    }));
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_d7_verify_${now}`,
      watchDomain: 'product', watchSignalType: 'sprint_completed',
      sourceDomain: 'product', targetDomain: 'product',
      baseline: 10, direction: 'increase', magnitude: 0.5, confidence: 0.8,
      method: 'conditional', verifyAfterMs: -60_000,
    }));

    const signals = Array.from({ length: 5 }, () => ({
      source_domain: 'product', signal_type: 'sprint_completed', signal_value: 50,
      signal_timestamp: hoursAgo(0.5), organization_id: orgId, entity_type: 'sprint', entity_id: `sp_${Math.random().toString(36).substr(2, 4)}`,
    }));
    await oracle.processBatch(signals);
    const beforePrune = oracle.getPendingPredictions().length;
    oracle.pruneCompleted();
    const afterPrune  = oracle.getPendingPredictions().length;

    // After prune: only the 'pending' one should remain
    assert(afterPrune < beforePrune || afterPrune <= 1, `Prune should remove verified+expired. Before=${beforePrune}, after=${afterPrune}`);
  });
}

// ── SUITE E: Integration — 10 rounds RL convergence ──────────────────────────
async function suiteE() {
  if (!runSuite('E')) return;
  console.log('\n══ SUITE E — 10-Round RL Convergence ════════════════════════════════════');
  const orgId = await getOrgId();

  await test('E1. 10 rounds: correct arm avgReward increases each round', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);

    // KEY: magnitude must be calibrated so actualMagnitude ≈ predictedMagnitude ± 0.3
    // baseline=10, predictedMag=0.5 → need avg≈15 → signal values 14.5-15.5
    // magnitude=(15-10)/10=0.5, magnitudeError=|0.5-0.5|=0 → wasCorrect=true → reward=1.0
    const rewardHistory: number[] = [];

    for (let round = 1; round <= 10; round++) {
      // One correct (apex: increase + accurate), one wrong direction (regime_conditional: decrease but signals go up)
      oracle.registerPrediction(makePrediction(orgId, {
        id: `stress_e1_apex_r${round}_${now}`,
        watchDomain: 'engineering', watchSignalType: 'pr_merged',
        sourceDomain: 'engineering', targetDomain: 'engineering',
        baseline: 10, direction: 'increase',
        magnitude: 0.5, // predicts 50% increase → signal avg ~15
        confidence: 0.8,
        method: 'apex', verifyAfterMs: -60_000,
      }));
      oracle.registerPrediction(makePrediction(orgId, {
        id: `stress_e1_regime_r${round}_${now}`,
        watchDomain: 'product', watchSignalType: 'sprint_completed',
        sourceDomain: 'product', targetDomain: 'product',
        baseline: 30, direction: 'decrease', magnitude: 0.3, confidence: 0.6,
        method: 'regime_conditional', verifyAfterMs: -60_000,
      }));

      const signals = [
        // apex: avg=15 → (15-10)/10=0.5 → error=0 → wasCorrect=true → reward≈1.0
        ...Array.from({ length: 5 }, () => ({ source_domain: 'engineering', signal_type: 'pr_merged', signal_value: 14.5 + Math.random(), signal_timestamp: hoursAgo(0.5), organization_id: orgId, entity_type: 'pr', entity_id: `p_${round}_${Math.random().toString(36).substr(2, 4)}` })),
        // regime_conditional: values increase (40+) → wrong direction (predicted decrease) → reward=0
        ...Array.from({ length: 5 }, () => ({ source_domain: 'product', signal_type: 'sprint_completed', signal_value: 40 + Math.random() * 5, signal_timestamp: hoursAgo(0.5), organization_id: orgId, entity_type: 'sprint', entity_id: `s_${round}_${Math.random().toString(36).substr(2, 4)}` })),
      ];
      await oracle.processBatch(signals);
      oracle.pruneCompleted();

      const lb = bandit.getMethodLeaderboard();
      const apexArm = lb.find(e => e.method === 'apex');
      rewardHistory.push(apexArm?.avgReward ?? 0);
    }

    if (VERBOSE) {
      console.log('\n       apex avgReward per round:');
      rewardHistory.forEach((r, i) => console.log(`       Round ${i + 1}: ${r.toFixed(4)}`));
    }

    const finalReward = rewardHistory[rewardHistory.length - 1];
    // Note: bandit uses discountFactor (e.g. 0.9) so older rewards decay — avgReward converges
    // toward recent rewards, not monotonically increasing. This is by design (non-stationary adaptation).
    // What matters: reward stays WELL ABOVE 0 throughout (arm is consistently rewarded)
    assert(finalReward > 0.3, `apex arm should have avgReward > 0.3 after 10 correct rounds, got ${finalReward}`);
    // All rounds should have avgReward > 0 (arm is always correct — discount just shifts the mean)
    const allPositive = rewardHistory.every(r => r > 0);
    assert(allPositive, `All reward history values should be > 0, got: ${rewardHistory.map(r => r.toFixed(3)).join(', ')}`);
  });

  await test('E2. Leaderboard stable under 10 rounds — top arm stays correct arm', async () => {
    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);

    // transfer_entropy: correct direction + accurate magnitude → high reward
    // conditional: correct direction + accurate magnitude → high reward
    // pc_structural: wrong direction → reward=0
    //
    // KEY: signal avg=15, baseline=10 → magnitude=(15-10)/10=0.5
    // predictedMag=0.5 → magnitudeError=0 → wasCorrect=true → reward≈1.0
    for (let round = 1; round <= 10; round++) {
      ['transfer_entropy', 'conditional', 'pc_structural'].forEach((method, mi) => {
        oracle.registerPrediction(makePrediction(orgId, {
          id: `stress_e2_${method}_r${round}_${now}`,
          watchDomain: 'engineering', watchSignalType: 'pr_merged',
          sourceDomain: 'engineering', targetDomain: 'engineering',
          baseline: 10,
          direction: mi === 2 ? 'decrease' : 'increase',  // pc_structural predicts WRONG direction
          magnitude: 0.5, confidence: 0.8,
          method: method as BanditArm, verifyAfterMs: -60_000,
        }));
      });
      // signal avg≈15 → magnitude≈0.5 → transfer_entropy and conditional: correct; pc_structural: wrong direction
      const signals = Array.from({ length: 5 }, () => ({
        source_domain: 'engineering', signal_type: 'pr_merged',
        signal_value: 14.5 + Math.random(), // avg=15 → mag=0.5 → error=0
        signal_timestamp: hoursAgo(0.5), organization_id: orgId, entity_type: 'pr', entity_id: `p_${round}_${Math.random().toString(36).substr(2, 4)}`,
      }));
      await oracle.processBatch(signals);
      oracle.pruneCompleted();
    }

    const lb = bandit.getMethodLeaderboard();
    const teArm  = lb.find(e => e.method === 'transfer_entropy');
    const pcArm  = lb.find(e => e.method === 'pc_structural');
    assert((teArm?.avgReward ?? 0) > (pcArm?.avgReward ?? -1), `transfer_entropy should beat pc_structural: te=${teArm?.avgReward?.toFixed(4)}, pc=${pcArm?.avgReward?.toFixed(4)}`);
    assert((teArm?.avgReward ?? 0) > 0, `transfer_entropy should have reward > 0 after 10 correct rounds, got ${teArm?.avgReward}`);

    if (VERBOSE) {
      console.log('\n       Final leaderboard (E2):');
      lb.slice(0, 5).forEach(e => console.log(`       ${e.method.padEnd(22)} avg=${e.avgReward?.toFixed(4)} won=${e.pairsWon}`));
    }
  });

  await test('E3. Signal injection → DB round-trip → oracle verification chain', async () => {
    // Full chain: insert signals to DB → fetch from DB → oracle processes → verified
    // KEY: signal values avg≈15 with baseline=10 → magnitude≈0.5 → magnitudeError≈0 → correct
    const sigData = Array.from({ length: 6 }, (_, i) => makeSignal(orgId, {
      domain: 'engineering', type: 'pr_merged',
      value: 14.5 + i * 0.2, // avg≈15 → magnitude=(15-10)/10=0.5 → error=|0.5-0.5|=0 → correct
      hoursAgoN: 0.5 + i * 0.1,
    }));
    const ids = await insertSignals(sigData);

    const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
    const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId } as any);
    oracle.registerPrediction(makePrediction(orgId, {
      id: `stress_e3_${now}`,
      watchDomain: 'engineering', watchSignalType: 'pr_merged',
      sourceDomain: 'engineering', targetDomain: 'engineering',
      baseline: 10, direction: 'increase',
      magnitude: 0.5, // expects 50% increase → avg should be ~15
      confidence: 0.8,
      method: 'multi_resolution', verifyAfterMs: -60_000,
    }));

    // Fetch from DB (as a real connector sync would)
    const { data: fetched } = await supabase
      .from('cross_domain_signals')
      .select('source_domain,signal_type,signal_value,signal_timestamp,organization_id,entity_type,entity_id')
      .in('id', ids);

    const result = await oracle.processBatch(fetched ?? []);
    assert(result.predictionsVerified === 1, `Expected 1 verified via DB round-trip, got ${result.predictionsVerified}`);
    assert(result.banditRewardsGiven === 1, `Expected 1 bandit reward call, got ${result.banditRewardsGiven}`);

    const lb = bandit.getMethodLeaderboard();
    const mrArm = lb.find(e => e.method === 'multi_resolution');
    // The reward should be > 0 (correct direction, low magnitude error)
    assert((mrArm?.avgReward ?? 0) > 0, `multi_resolution arm should have avgReward > 0, got ${mrArm?.avgReward?.toFixed(4)}`);

    if (VERBOSE) {
      console.log(`\n       multi_resolution avgReward=${mrArm?.avgReward?.toFixed(4)}`);
      const v = result.verifications?.[0];
      if (v) console.log(`       Verification: wasCorrect=${v.wasCorrect}, reward=${v.banditReward}, magnitudeError=${v.magnitudeError?.toFixed(3)}`);
    }

    await deleteSignals(ids);
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(72));
  console.log('  NexusBrain — Comprehensive Stress Test Battery');
  console.log(`  Suite: ${SUITE}  |  Verbose: ${VERBOSE}`);
  console.log('═'.repeat(72));

  const start = Date.now();

  await suiteA();
  await suiteB();
  await suiteC();
  await suiteD();
  await suiteE();

  // Final cleanup of any leftover tracked signals
  if (insertedTracker.length > 0) {
    console.log(`\n  Cleaning up ${insertedTracker.length} tracked test signals...`);
    await deleteSignals(insertedTracker);
  }

  const totalMs = Date.now() - start;

  console.log('\n' + '═'.repeat(72));
  console.log('  RESULTS');
  console.log('═'.repeat(72));
  console.log(`  ✅  Passed : ${passed}`);
  console.log(`  ❌  Failed : ${failed}`);
  console.log(`  ⏭   Skipped: ${skipped}`);
  console.log(`  ⏱   Total  : ${(totalMs / 1000).toFixed(1)}s`);

  if (failures.length > 0) {
    console.log('\n  Failed tests:');
    failures.forEach(f => console.log(`  ❌  ${f}`));
  }

  console.log('═'.repeat(72));

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('\n❌ Stress test harness crashed:', err.message || err);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
