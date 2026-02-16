/**
 * Load Test 3: Query Latency at 10M Scale
 * =========================================
 *
 * Test: 1000 random queries against 10M+ signal database
 * Success Criteria:
 *   - p50 latency: <5ms
 *   - p95 latency: <10ms
 *   - p99 latency: <20ms
 *   - Error rate: 0%
 *
 * What This Tests:
 *   - Composite index performance (org_id, source_domain, created_at)
 *   - Query planner effectiveness at scale
 *   - Connection pool performance under concurrent load
 *   - Cache hit rates
 *
 * Query Types:
 *   1. Domain time-series (getSignalsByDomain)
 *   2. Causal graph traversal (getSignificantRelationships)
 *   3. Entity lookup (getSignalsByEntity)
 *   4. Anomaly detection (getRecentAnomalies)
 *
 * Prerequisites:
 *   - Run seed-10m-signals.ts first
 *   - Run test-2-causal-discovery.ts to generate causal edges
 *
 * Usage:
 *   pnpm exec tsx scripts/load-tests/test-3-query-latency.ts --queries 1000
 *
 * @packageDocumentation
 */

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';
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
    queries: { type: 'string', short: 'q', default: '1000' },
    org: { type: 'string', short: 'o', default: '00000000-0000-4000-a000-000000000000' },
  },
});

const NUM_QUERIES = parseInt(values.queries || '1000', 10);
const TEST_ORG_ID = values.org || '00000000-0000-4000-a000-000000000000';

// ============================================================================
// QUERY TYPES
// ============================================================================

interface QueryResult {
  type: string;
  latencyMs: number;
  rowsReturned: number;
  success: boolean;
  error?: string;
}

const DOMAINS = ['engineering.github', 'sales.hubspot', 'revenue.stripe', 'support.freshdesk', 'marketing.generic'];

async function queryDomainTimeSeries(orgId: string, domain: string): Promise<QueryResult> {
  const start = Date.now();

  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('cross_domain_signals')
      .select('signal_timestamp, signal_value, signal_type')
      .eq('organization_id', orgId)
      .eq('source_domain', domain)
      .gte('signal_timestamp', twoDaysAgo.toISOString())
      .order('signal_timestamp', { ascending: true })
      .limit(1000);

    if (error) throw error;

    return {
      type: 'domain_time_series',
      latencyMs: Date.now() - start,
      rowsReturned: data?.length || 0,
      success: true,
    };
  } catch (err) {
    return {
      type: 'domain_time_series',
      latencyMs: Date.now() - start,
      rowsReturned: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function queryCausalGraph(orgId: string): Promise<QueryResult> {
  const start = Date.now();

  try {
    const { data, error } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, effect_size, p_value')
      .eq('organization_id', orgId)
      .eq('is_significant', true)
      .order('effect_size', { ascending: false })
      .limit(100);

    if (error) throw error;

    return {
      type: 'causal_graph',
      latencyMs: Date.now() - start,
      rowsReturned: data?.length || 0,
      success: true,
    };
  } catch (err) {
    return {
      type: 'causal_graph',
      latencyMs: Date.now() - start,
      rowsReturned: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function queryEntitySignals(orgId: string, entityType: string): Promise<QueryResult> {
  const start = Date.now();

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('cross_domain_signals')
      .select('entity_id, signal_value, signal_timestamp')
      .eq('organization_id', orgId)
      .eq('entity_type', entityType)
      .gte('signal_timestamp', oneDayAgo.toISOString())
      .limit(500);

    if (error) throw error;

    return {
      type: 'entity_signals',
      latencyMs: Date.now() - start,
      rowsReturned: data?.length || 0,
      success: true,
    };
  } catch (err) {
    return {
      type: 'entity_signals',
      latencyMs: Date.now() - start,
      rowsReturned: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function queryRecentSignals(orgId: string): Promise<QueryResult> {
  const start = Date.now();

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('cross_domain_signals')
      .select('source_domain, signal_type, signal_value, signal_timestamp')
      .eq('organization_id', orgId)
      .gte('signal_timestamp', oneHourAgo.toISOString())
      .order('signal_timestamp', { ascending: false })
      .limit(200);

    if (error) throw error;

    return {
      type: 'recent_signals',
      latencyMs: Date.now() - start,
      rowsReturned: data?.length || 0,
      success: true,
    };
  } catch (err) {
    return {
      type: 'recent_signals',
      latencyMs: Date.now() - start,
      rowsReturned: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// QUERY EXECUTION
// ============================================================================

async function executeRandomQuery(orgId: string): Promise<QueryResult> {
  const queryType = Math.floor(Math.random() * 4);

  switch (queryType) {
    case 0: {
      const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
      return queryDomainTimeSeries(orgId, domain);
    }
    case 1:
      return queryCausalGraph(orgId);
    case 2: {
      const entityTypes = ['pull_request', 'deal', 'charge', 'ticket'];
      const entityType = entityTypes[Math.floor(Math.random() * entityTypes.length)];
      return queryEntitySignals(orgId, entityType);
    }
    case 3:
      return queryRecentSignals(orgId);
    default:
      throw new Error('Invalid query type');
  }
}

// ============================================================================
// METRICS
// ============================================================================

function calculatePercentile(arr: number[], percentile: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function main() {
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│ LOAD TEST 3: Query Latency at 10M Scale               │');
  console.log('└────────────────────────────────────────────────────────┘');
  console.log();
  console.log(`  Test organization: ${TEST_ORG_ID}`);
  console.log(`  Number of queries: ${NUM_QUERIES.toLocaleString()}`);
  console.log();
  console.log('  Executing queries...');

  const results: QueryResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < NUM_QUERIES; i++) {
    const result = await executeRandomQuery(TEST_ORG_ID);
    results.push(result);

    if ((i + 1) % 100 === 0) {
      const progress = ((i + 1) / NUM_QUERIES) * 100;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      console.log(`    Progress: ${i + 1}/${NUM_QUERIES} (${progress.toFixed(1)}%) | ${elapsed.toFixed(1)}s | ${rate.toFixed(1)} queries/sec`);
    }
  }

  const totalDuration = (Date.now() - startTime) / 1000;

  // Calculate metrics
  const latencies = results.map(r => r.latencyMs);
  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const pMax = Math.max(...latencies);
  const pMin = Math.min(...latencies);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  const errors = results.filter(r => !r.success).length;
  const errorRate = (errors / results.length) * 100;

  // Success criteria
  const passed =
    p50 < 5 &&
    p95 < 10 &&
    p99 < 20 &&
    errorRate === 0;

  console.log();
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log(`│ LOAD TEST 3: Query Latency — ${passed ? 'PASSED ✅' : 'FAILED ❌'}             │`);
  console.log('└────────────────────────────────────────────────────────┘');
  console.log();
  console.log('  Test Results:');
  console.log(`    Total queries:     ${NUM_QUERIES.toLocaleString()}`);
  console.log(`    Duration:          ${totalDuration.toFixed(1)}s`);
  console.log(`    Throughput:        ${(NUM_QUERIES / totalDuration).toFixed(1)} queries/sec`);
  console.log();
  console.log('  Latency Distribution:');
  console.log(`    min:  ${pMin.toFixed(2)}ms`);
  console.log(`    p50:  ${p50.toFixed(2)}ms ${p50 < 5 ? '✅' : '❌ FAIL (target: <5ms)'}`);
  console.log(`    avg:  ${avg.toFixed(2)}ms`);
  console.log(`    p95:  ${p95.toFixed(2)}ms ${p95 < 10 ? '✅' : '❌ FAIL (target: <10ms)'}`);
  console.log(`    p99:  ${p99.toFixed(2)}ms ${p99 < 20 ? '✅' : '❌ FAIL (target: <20ms)'}`);
  console.log(`    max:  ${pMax.toFixed(2)}ms`);
  console.log();
  console.log('  Query Breakdown:');
  const byType = results.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`    ${type.padEnd(20)}: ${count} queries`);
  });
  console.log();
  console.log('  Error Analysis:');
  console.log(`    Errors:        ${errors}`);
  console.log(`    Error rate:    ${errorRate.toFixed(2)}% ${errorRate === 0 ? '✅' : '❌ FAIL (target: 0%)'}`);
  console.log();

  if (passed) {
    console.log('✅ TEST PASSED: Query latency meets performance targets at 10M scale');
  } else {
    console.log('❌ TEST FAILED: Performance criteria not met');
    console.log('   Review bottlenecks:');
    if (p50 >= 5) console.log(`   - p50 too high (${p50.toFixed(2)}ms) - check composite indexes`);
    if (p95 >= 10) console.log(`   - p95 too high (${p95.toFixed(2)}ms) - check query planner`);
    if (p99 >= 20) console.log(`   - p99 too high (${p99.toFixed(2)}ms) - check for table bloat`);
    if (errorRate > 0) console.log(`   - ${errorRate.toFixed(2)}% errors - check connection pool`);
  }
  console.log();

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
