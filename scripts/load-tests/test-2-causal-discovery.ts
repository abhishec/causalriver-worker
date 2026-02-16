/**
 * Load Test 2: Causal Discovery at 10M Scale
 * ============================================
 *
 * Test: Run full consolidation cycle on 10M signals
 * Success Criteria:
 *   - Completion time: <30 minutes
 *   - Memory usage: <16GB
 *   - CPU usage: <80% average
 *   - Causal edges discovered: >1000
 *
 * What This Tests:
 *   - 3-Paradigm causal discovery performance (APEX + PC + VarLiNGAM + Transfer Entropy)
 *   - Bayesian Judge resolution speed
 *   - Pattern mining at scale (Apriori + PrefixSpan)
 *   - Database query performance with 10M rows
 *
 * Prerequisites:
 *   - Run seed-10m-signals.ts first
 *   - Use test org: 00000000-0000-4000-a000-000000000000
 *
 * Usage:
 *   pnpm exec tsx scripts/load-tests/test-2-causal-discovery.ts --org 00000000-0000-4000-a000-000000000000
 *
 * @packageDocumentation
 */

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';
import { createConsolidationEngine } from '../../packages/memory-stack/src/orchestrator/consolidation-engine';
import { parseArgs } from 'util';
import * as os from 'os';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    org: { type: 'string', short: 'o', default: '00000000-0000-4000-a000-000000000000' },
    quick: { type: 'boolean', short: 'q', default: false },
  },
});

const TEST_ORG_ID = values.org || '00000000-0000-4000-a000-000000000000';
const QUICK_MODE = values.quick || false;

// ============================================================================
// SYSTEM METRICS
// ============================================================================

interface SystemMetrics {
  startMemoryMB: number;
  peakMemoryMB: number;
  cpuSamples: number[];
  startTime: number;
}

const sysMetrics: SystemMetrics = {
  startMemoryMB: 0,
  peakMemoryMB: 0,
  cpuSamples: [],
  startTime: 0,
};

function getMemoryUsageMB(): number {
  const used = process.memoryUsage();
  return used.heapUsed / 1024 / 1024;
}

function getCPUUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }

  return ((totalTick - totalIdle) / totalTick) * 100;
}

let metricsInterval: NodeJS.Timeout | null = null;

function startMetricsCollection() {
  sysMetrics.startMemoryMB = getMemoryUsageMB();
  sysMetrics.peakMemoryMB = sysMetrics.startMemoryMB;
  sysMetrics.startTime = Date.now();

  metricsInterval = setInterval(() => {
    const memMB = getMemoryUsageMB();
    sysMetrics.peakMemoryMB = Math.max(sysMetrics.peakMemoryMB, memMB);

    const cpuPct = getCPUUsage();
    sysMetrics.cpuSamples.push(cpuPct);
  }, 5000); // Sample every 5 seconds
}

function stopMetricsCollection() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }
}

// ============================================================================
// PRE-TEST VALIDATION
// ============================================================================

async function validateTestData(): Promise<number> {
  console.log(`  Validating test data for org ${TEST_ORG_ID}...`);

  const { count, error } = await supabase
    .from('cross_domain_signals')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', TEST_ORG_ID);

  if (error) {
    throw new Error(`Failed to count signals: ${error.message}`);
  }

  const signalCount = count || 0;
  console.log(`  Found ${signalCount.toLocaleString()} signals`);

  // Quick mode requires 10K+ signals, full mode requires 1M+
  const minSignals = QUICK_MODE ? 10000 : 1000000;
  if (signalCount < minSignals) {
    throw new Error(`Insufficient test data. Expected >${(minSignals / 1000).toLocaleString()}K signals, found ${signalCount.toLocaleString()}. Run seed-10m-signals.ts first.`);
  }

  return signalCount;
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function main() {
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│ LOAD TEST 2: Causal Discovery at 10M Scale            │');
  console.log('└────────────────────────────────────────────────────────┘');
  console.log();
  console.log(`  Test organization: ${TEST_ORG_ID}`);
  console.log();

  // Validate test data
  const signalCount = await validateTestData();

  console.log();
  console.log('  Starting consolidation engine...');
  console.log();

  // Start metrics collection
  startMetricsCollection();

  const testStart = Date.now();

  try {
    // Create consolidation engine
    const consolidationEngine = createConsolidationEngine({
      supabase,
      organizationId: TEST_ORG_ID,
      verbose: true,
    });

    // Run full consolidation cycle
    const result = await consolidationEngine.runConsolidation();

    const testEnd = Date.now();
    const durationMs = testEnd - testStart;
    const durationMin = durationMs / 60000;

    stopMetricsCollection();

    // Calculate metrics
    const avgCPU = sysMetrics.cpuSamples.length > 0
      ? sysMetrics.cpuSamples.reduce((a, b) => a + b, 0) / sysMetrics.cpuSamples.length
      : 0;

    const memoryDeltaMB = sysMetrics.peakMemoryMB - sysMetrics.startMemoryMB;

    // Extract stats from result
    const edgesDiscovered = result.report.stats.causalEdgesDiscovered;
    const newRels = result.report.stats.newRelationships;
    const patternsMined = result.report.stats.patternsFound;
    const anomaliesDetected = result.report.stats.anomaliesDetected;

    // Success criteria (relaxed for quick mode)
    const minEdges = QUICK_MODE ? 10 : 1000; // Quick mode: 10+ edges, Full: 1000+ edges
    const passed =
      durationMin < 30 &&
      sysMetrics.peakMemoryMB < 16384 && // 16GB
      avgCPU < 80 &&
      edgesDiscovered >= minEdges;

    console.log();
    console.log('┌────────────────────────────────────────────────────────┐');
    console.log(`│ LOAD TEST 2: Causal Discovery — ${passed ? 'PASSED ✅' : 'FAILED ❌'}         │`);
    console.log('└────────────────────────────────────────────────────────┘');
    console.log();
    console.log('  Test Results:');
    console.log(`    Input signals:         ${signalCount.toLocaleString()}`);
    console.log(`    Edges discovered:      ${edgesDiscovered.toLocaleString()} ${edgesDiscovered >= minEdges ? '✅' : `❌ FAIL (target: >${minEdges})`}`);
    console.log(`    New relationships:     ${newRels}`);
    console.log(`    Patterns mined:        ${patternsMined}`);
    console.log(`    Anomalies detected:    ${anomaliesDetected}`);
    console.log();
    console.log('  Performance:');
    console.log(`    Duration:              ${durationMin.toFixed(2)} min ${durationMin < 30 ? '✅' : '❌ FAIL (target: <30 min)'}`);
    console.log(`    Peak memory:           ${sysMetrics.peakMemoryMB.toFixed(0)} MB ${sysMetrics.peakMemoryMB < 16384 ? '✅' : '❌ FAIL (target: <16GB)'}`);
    console.log(`    Memory delta:          +${memoryDeltaMB.toFixed(0)} MB`);
    console.log(`    Average CPU:           ${avgCPU.toFixed(1)}% ${avgCPU < 80 ? '✅' : '❌ FAIL (target: <80%)'}`);
    console.log();
    console.log('  Consolidation Details:');
    console.log(`    Run ID:                ${result.runId || 'N/A'}`);
    console.log(`    Status:                ${result.status.toUpperCase()}`);
    console.log(`    Duration (engine):     ${result.totalDurationMs ? (result.totalDurationMs / 1000).toFixed(1) : 'N/A'}s`);
    console.log();

    if (passed) {
      console.log('✅ TEST PASSED: System completed 10M-scale causal discovery in <30 min');
    } else {
      console.log('❌ TEST FAILED: Performance criteria not met');
      console.log('   Review bottlenecks:');
      if (durationMin >= 30) console.log(`   - Duration too long (${durationMin.toFixed(2)} min)`);
      if (sysMetrics.peakMemoryMB >= 16384) console.log(`   - Memory usage too high (${sysMetrics.peakMemoryMB.toFixed(0)} MB)`);
      if (avgCPU >= 80) console.log(`   - CPU usage too high (${avgCPU.toFixed(1)}%)`);
      if (edgesDiscovered < minEdges) console.log(`   - Too few edges discovered (${edgesDiscovered}, expected >${minEdges})`);
    }
    console.log();

    process.exit(passed ? 0 : 1);
  } catch (err) {
    stopMetricsCollection();
    console.error('\n❌ TEST FAILED WITH ERROR:');
    console.error(err instanceof Error ? err.message : String(err));
    console.error('\nStack trace:');
    console.error(err instanceof Error ? err.stack : 'N/A');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
