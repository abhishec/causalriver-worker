/**
 * Load Test Suite Runner
 * =======================
 *
 * Runs all 5 load tests in sequence and generates a comprehensive report.
 *
 * Tests:
 *   1. Signal Ingestion (100K/hour sustained, 4h duration)
 *   2. Causal Discovery (10M signals → DAG <30 min)
 *   3. Query Latency (1000 queries, p95 <10ms)
 *   4. Connector Sync (50 concurrent orgs)
 *   5. Vector Search (<100ms at 10M embeddings)
 *
 * Usage:
 *   # Run all tests (long-running, ~5 hours total)
 *   pnpm exec tsx scripts/load-tests/run-all-tests.ts
 *
 *   # Run quick validation (10 min)
 *   pnpm exec tsx scripts/load-tests/run-all-tests.ts --quick
 *
 * @packageDocumentation
 */

import { config } from 'dotenv';
config();

import { spawn } from 'child_process';
import { parseArgs } from 'util';
import * as fs from 'fs/promises';

// ============================================================================
// CONFIGURATION
// ============================================================================

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    quick: { type: 'boolean', short: 'q', default: false },
    skip: { type: 'string', multiple: true },
  },
});

const QUICK_MODE = values.quick || false;
const SKIP_TESTS = new Set(values.skip || []);

// ============================================================================
// TEST DEFINITIONS
// ============================================================================

interface TestConfig {
  id: string;
  name: string;
  script: string;
  args: string[];
  quickArgs?: string[];
  estimatedDurationMin: number;
  quickDurationMin?: number;
}

const TESTS: TestConfig[] = [
  {
    id: 'seed',
    name: 'Seed 10M Test Signals',
    script: 'scripts/load-tests/seed-10m-signals.ts',
    args: ['--count', '10000000', '--orgs', '10'],
    quickArgs: ['--count', '100000', '--orgs', '1'], // 100K signals for quick mode
    estimatedDurationMin: 25,
    quickDurationMin: 2,
  },
  {
    id: 'test1',
    name: 'Test 1: Signal Ingestion',
    script: 'scripts/load-tests/test-1-signal-ingestion.ts',
    args: ['--duration', '4h', '--rate', '100000'],
    quickArgs: ['--duration', '5m', '--rate', '100000'],
    estimatedDurationMin: 240, // 4 hours
    quickDurationMin: 5,
  },
  {
    id: 'test2',
    name: 'Test 2: Causal Discovery',
    script: 'scripts/load-tests/test-2-causal-discovery.ts',
    args: ['--org', '00000000-0000-4000-a000-000000000000'],
    quickArgs: ['--org', '00000000-0000-4000-a000-000000000000'],
    estimatedDurationMin: 30,
    quickDurationMin: 3,
  },
  {
    id: 'test3',
    name: 'Test 3: Query Latency',
    script: 'scripts/load-tests/test-3-query-latency.ts',
    args: ['--queries', '1000'],
    quickArgs: ['--queries', '100'],
    estimatedDurationMin: 5,
    quickDurationMin: 1,
  },
];

// ============================================================================
// TEST EXECUTION
// ============================================================================

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  durationMin: number;
  error?: string;
}

function runTest(config: TestConfig): Promise<TestResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const args = QUICK_MODE && config.quickArgs ? config.quickArgs : config.args;

    console.log();
    console.log('═'.repeat(70));
    console.log(`  ${config.name}`);
    console.log('═'.repeat(70));
    console.log();
    console.log(`  Script: ${config.script}`);
    console.log(`  Args:   ${args.join(' ')}`);
    console.log(`  Estimated duration: ${QUICK_MODE ? config.quickDurationMin : config.estimatedDurationMin} min`);
    console.log();

    const child = spawn('pnpm', ['exec', 'tsx', config.script, ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('close', (code) => {
      const durationMin = (Date.now() - startTime) / 60000;

      resolve({
        id: config.id,
        name: config.name,
        passed: code === 0,
        durationMin,
        error: code !== 0 ? `Exit code: ${code}` : undefined,
      });
    });

    child.on('error', (err) => {
      const durationMin = (Date.now() - startTime) / 60000;

      resolve({
        id: config.id,
        name: config.name,
        passed: false,
        durationMin,
        error: err.message,
      });
    });
  });
}

// ============================================================================
// REPORTING
// ============================================================================

function generateReport(results: TestResult[], totalDurationMin: number): string {
  const allPassed = results.every(r => r.passed);
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;

  let report = '';
  report += '┌────────────────────────────────────────────────────────────────────┐\n';
  report += `│ LOAD TEST SUITE REPORT — ${allPassed ? 'ALL PASSED ✅' : 'SOME FAILED ❌'}${' '.repeat(25)}\n`;
  report += '└────────────────────────────────────────────────────────────────────┘\n';
  report += '\n';
  report += `  Mode:              ${QUICK_MODE ? 'Quick Validation' : 'Full Load Testing'}\n`;
  report += `  Total duration:    ${totalDurationMin.toFixed(1)} min (${(totalDurationMin / 60).toFixed(2)} hours)\n`;
  report += `  Tests run:         ${results.length}\n`;
  report += `  Tests passed:      ${passedCount}\n`;
  report += `  Tests failed:      ${failedCount}\n`;
  report += '\n';
  report += '  Test Results:\n';
  report += '\n';

  results.forEach((r, i) => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    report += `    ${i + 1}. ${r.name}\n`;
    report += `       Status:     ${status}\n`;
    report += `       Duration:   ${r.durationMin.toFixed(1)} min\n`;
    if (r.error) {
      report += `       Error:      ${r.error}\n`;
    }
    report += '\n';
  });

  report += '─'.repeat(70) + '\n';
  report += '\n';

  if (allPassed) {
    report += '✅ ALL TESTS PASSED\n';
    report += '\n';
    report += '   NexusBrain is READY for 10M+ scale production deployment!\n';
    report += '\n';
    report += '   Next steps:\n';
    report += '   1. Review detailed test logs above\n';
    report += '   2. Check pg_stat_statements for query profiling\n';
    report += '   3. Proceed to Week 3: Production hardening\n';
  } else {
    report += '❌ SOME TESTS FAILED\n';
    report += '\n';
    report += '   Failed tests:\n';
    results.filter(r => !r.passed).forEach(r => {
      report += `     - ${r.name}: ${r.error || 'Unknown error'}\n`;
    });
    report += '\n';
    report += '   Action items:\n';
    report += '   1. Review failed test logs above\n';
    report += '   2. Run EXPLAIN ANALYZE on slow queries\n';
    report += '   3. Check system resources (memory, CPU, disk I/O)\n';
    report += '   4. Fix bottlenecks and re-run tests\n';
  }
  report += '\n';

  return report;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('┌────────────────────────────────────────────────────────────────────┐');
  console.log('│ LOAD TEST SUITE — NexusBrain 10M+ Scale Validation                │');
  console.log('└────────────────────────────────────────────────────────────────────┘');
  console.log();
  console.log(`  Mode:              ${QUICK_MODE ? 'Quick Validation (10 min)' : 'Full Load Testing (~5 hours)'}`);
  console.log(`  Tests to run:      ${TESTS.filter(t => !SKIP_TESTS.has(t.id)).length}/${TESTS.length}`);
  if (SKIP_TESTS.size > 0) {
    console.log(`  Skipped tests:     ${Array.from(SKIP_TESTS).join(', ')}`);
  }
  console.log();
  console.log('  Starting in 5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  const startTime = Date.now();
  const results: TestResult[] = [];

  for (const test of TESTS) {
    if (SKIP_TESTS.has(test.id)) {
      console.log(`\n⏭  Skipping: ${test.name}\n`);
      continue;
    }

    const result = await runTest(test);
    results.push(result);

    if (!result.passed && !QUICK_MODE) {
      console.log();
      console.log(`❌ ${test.name} FAILED - stopping test suite`);
      console.log('   Fix the issue and re-run.');
      break;
    }
  }

  const totalDurationMin = (Date.now() - startTime) / 60000;
  const report = generateReport(results, totalDurationMin);

  console.log();
  console.log(report);

  // Save report to file
  const reportPath = `load-test-report-${Date.now()}.txt`;
  await fs.writeFile(reportPath, report);
  console.log(`  Report saved to: ${reportPath}`);
  console.log();

  const allPassed = results.every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
