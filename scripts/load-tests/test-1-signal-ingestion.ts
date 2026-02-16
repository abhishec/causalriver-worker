/**
 * Load Test 1: Signal Ingestion
 * ===============================
 *
 * Test: Sustained 100K signals/hour ingestion rate
 * Success Criteria:
 *   - p50 latency: <50ms
 *   - p95 latency: <100ms
 *   - p99 latency: <200ms
 *   - Error rate: 0%
 *   - Duration: 4 hours sustained
 *
 * What This Tests:
 *   - Dual-write performance (connector_signals + cross_domain_signals)
 *   - Database write throughput
 *   - Connection pooling under load
 *   - Memory stability over time
 *
 * Usage:
 *   pnpm exec tsx scripts/load-tests/test-1-signal-ingestion.ts --duration 4h --rate 100000
 *
 * @packageDocumentation
 */

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';
import { storeDualWriteConnectorSignals } from '../../packages/memory-stack/src/ingestion/connector-signal-bridge';
import { parseArgs } from 'util';

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
    duration: { type: 'string', short: 'd', default: '4h' },
    rate: { type: 'string', short: 'r', default: '100000' },
    batch: { type: 'string', short: 'b', default: '100' },
  },
});

function parseDuration(durationStr: string): number {
  const match = durationStr.match(/^(\d+)(h|m|s)$/);
  if (!match) throw new Error(`Invalid duration: ${durationStr}`);
  const [, value, unit] = match;
  const multipliers = { h: 3600000, m: 60000, s: 1000 };
  return parseInt(value, 10) * multipliers[unit as 'h' | 'm' | 's'];
}

const DURATION_MS = parseDuration(values.duration || '4h');
const TARGET_RATE = parseInt(values.rate || '100000', 10); // signals/hour
const BATCH_SIZE = parseInt(values.batch || '100', 10);

// Calculate signals per second
const SIGNALS_PER_SECOND = TARGET_RATE / 3600;
const BATCH_INTERVAL_MS = (BATCH_SIZE / SIGNALS_PER_SECOND) * 1000;

const TEST_ORG_ID = '00000000-0000-4000-b000-000000000001'; // Load test org

// ============================================================================
// METRICS
// ============================================================================

interface Metrics {
  totalSignals: number;
  totalBatches: number;
  errors: number;
  latencies: number[];
  startTime: number;
}

const metrics: Metrics = {
  totalSignals: 0,
  totalBatches: 0,
  errors: 0,
  latencies: [],
  startTime: Date.now(),
};

// ============================================================================
// SIGNAL GENERATION
// ============================================================================

function generateTestSignal() {
  const sources = ['github', 'jira', 'slack', 'hubspot', 'stripe'];
  const types = ['event_created', 'event_updated', 'event_completed'];

  return {
    source: sources[Math.floor(Math.random() * sources.length)],
    signal_type: types[Math.floor(Math.random() * types.length)],
    signal_value: Math.floor(Math.random() * 100),
    signal_timestamp: new Date(),
    metadata: {
      test: true,
      batch: metrics.totalBatches,
    },
  };
}

// ============================================================================
// INGESTION LOGIC
// ============================================================================

async function ingestBatch(): Promise<void> {
  const batchStart = Date.now();

  try {
    // Generate batch of signals
    const signals = Array.from({ length: BATCH_SIZE }, () => generateTestSignal());

    // Dual-write via bridge
    await storeDualWriteConnectorSignals(supabase, signals, TEST_ORG_ID);

    const latency = Date.now() - batchStart;
    metrics.latencies.push(latency);
    metrics.totalSignals += signals.length;
    metrics.totalBatches++;
  } catch (err) {
    metrics.errors++;
    console.error(`  ERROR in batch ${metrics.totalBatches}:`, err instanceof Error ? err.message : String(err));
  }
}

// ============================================================================
// REPORTING
// ============================================================================

function calculatePercentile(arr: number[], percentile: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

function printProgress() {
  const elapsed = Date.now() - metrics.startTime;
  const elapsedSec = elapsed / 1000;
  const elapsedMin = elapsedSec / 60;
  const elapsedHr = elapsedMin / 60;

  const rate = metrics.totalSignals / elapsedSec;
  const ratePerHour = rate * 3600;
  const errorRate = (metrics.errors / metrics.totalBatches) * 100;

  const p50 = calculatePercentile(metrics.latencies, 50);
  const p95 = calculatePercentile(metrics.latencies, 95);
  const p99 = calculatePercentile(metrics.latencies, 99);

  const remainingMs = DURATION_MS - elapsed;
  const remainingMin = Math.max(0, remainingMs / 60000);

  console.log();
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│ LOAD TEST 1: Signal Ingestion — Progress              │');
  console.log('└────────────────────────────────────────────────────────┘');
  console.log();
  console.log(`  Elapsed:           ${elapsedHr.toFixed(2)}h (${elapsedMin.toFixed(1)} min)`);
  console.log(`  Remaining:         ${remainingMin.toFixed(1)} min`);
  console.log(`  Total signals:     ${metrics.totalSignals.toLocaleString()}`);
  console.log(`  Total batches:     ${metrics.totalBatches.toLocaleString()}`);
  console.log(`  Current rate:      ${Math.round(ratePerHour).toLocaleString()} signals/hour`);
  console.log(`  Target rate:       ${TARGET_RATE.toLocaleString()} signals/hour`);
  console.log(`  Rate delta:        ${((ratePerHour / TARGET_RATE) * 100).toFixed(1)}%`);
  console.log();
  console.log(`  Latency p50:       ${p50}ms ${p50 < 50 ? '✅' : '❌ (target: <50ms)'}`);
  console.log(`  Latency p95:       ${p95}ms ${p95 < 100 ? '✅' : '❌ (target: <100ms)'}`);
  console.log(`  Latency p99:       ${p99}ms ${p99 < 200 ? '✅' : '❌ (target: <200ms)'}`);
  console.log(`  Error rate:        ${errorRate.toFixed(2)}% ${errorRate === 0 ? '✅' : '❌ (target: 0%)'}`);
  console.log();
}

function printFinalReport() {
  const totalDuration = (Date.now() - metrics.startTime) / 1000;
  const avgRate = metrics.totalSignals / totalDuration;
  const avgRatePerHour = avgRate * 3600;
  const errorRate = (metrics.errors / metrics.totalBatches) * 100;

  const p50 = calculatePercentile(metrics.latencies, 50);
  const p95 = calculatePercentile(metrics.latencies, 95);
  const p99 = calculatePercentile(metrics.latencies, 99);
  const pMax = Math.max(...metrics.latencies);

  const passed =
    p50 < 50 &&
    p95 < 100 &&
    p99 < 200 &&
    errorRate === 0;

  console.log();
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log(`│ LOAD TEST 1: Signal Ingestion — ${passed ? 'PASSED ✅' : 'FAILED ❌'}          │`);
  console.log('└────────────────────────────────────────────────────────┘');
  console.log();
  console.log('  Summary:');
  console.log(`    Total signals:     ${metrics.totalSignals.toLocaleString()}`);
  console.log(`    Total batches:     ${metrics.totalBatches.toLocaleString()}`);
  console.log(`    Duration:          ${(totalDuration / 60).toFixed(1)} min (${(totalDuration / 3600).toFixed(2)} hr)`);
  console.log(`    Average rate:      ${Math.round(avgRatePerHour).toLocaleString()} signals/hour`);
  console.log(`    Target rate:       ${TARGET_RATE.toLocaleString()} signals/hour`);
  console.log(`    Rate achieved:     ${((avgRatePerHour / TARGET_RATE) * 100).toFixed(1)}%`);
  console.log();
  console.log('  Latency Distribution:');
  console.log(`    p50:  ${p50}ms ${p50 < 50 ? '✅' : '❌ FAIL (target: <50ms)'}`);
  console.log(`    p95:  ${p95}ms ${p95 < 100 ? '✅' : '❌ FAIL (target: <100ms)'}`);
  console.log(`    p99:  ${p99}ms ${p99 < 200 ? '✅' : '❌ FAIL (target: <200ms)'}`);
  console.log(`    max:  ${pMax}ms`);
  console.log();
  console.log('  Error Analysis:');
  console.log(`    Errors:    ${metrics.errors}`);
  console.log(`    Error rate: ${errorRate.toFixed(2)}% ${errorRate === 0 ? '✅' : '❌ FAIL (target: 0%)'}`);
  console.log();

  if (passed) {
    console.log('✅ TEST PASSED: System sustained 100K signals/hour with acceptable latency');
  } else {
    console.log('❌ TEST FAILED: Performance criteria not met');
    console.log('   Review bottlenecks:');
    if (p50 >= 50) console.log('   - p50 latency too high (check DB connection pool)');
    if (p95 >= 100) console.log('   - p95 latency too high (check indexing strategy)');
    if (p99 >= 200) console.log('   - p99 latency too high (check for query timeouts)');
    if (errorRate > 0) console.log(`   - ${errorRate.toFixed(2)}% error rate (check logs for failures)`);
  }
  console.log();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│ LOAD TEST 1: Signal Ingestion                         │');
  console.log('└────────────────────────────────────────────────────────┘');
  console.log();
  console.log(`  Target rate:       ${TARGET_RATE.toLocaleString()} signals/hour`);
  console.log(`  Batch size:        ${BATCH_SIZE}`);
  console.log(`  Batch interval:    ${BATCH_INTERVAL_MS.toFixed(0)}ms`);
  console.log(`  Duration:          ${values.duration}`);
  console.log(`  Test org ID:       ${TEST_ORG_ID}`);
  console.log();
  console.log('  Starting ingestion in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const endTime = Date.now() + DURATION_MS;
  let nextBatchTime = Date.now();

  // Progress reporting every 5 minutes
  const progressInterval = setInterval(printProgress, 5 * 60 * 1000);

  while (Date.now() < endTime) {
    if (Date.now() >= nextBatchTime) {
      await ingestBatch();
      nextBatchTime += BATCH_INTERVAL_MS;
    }

    // Sleep until next batch (or 100ms, whichever is sooner)
    const sleepMs = Math.min(100, Math.max(0, nextBatchTime - Date.now()));
    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }

  clearInterval(progressInterval);
  printFinalReport();
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
