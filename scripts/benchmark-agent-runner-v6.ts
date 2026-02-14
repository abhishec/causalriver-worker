/**
 * Benchmark Agent Runner (V6 Manus)
 *
 * Executes the Benchmark Agent using the V6 ManusNativeAgent template.
 * Auto-registers to Agent Registry for Brain Orchestrator discovery.
 *
 * Usage:
 *   # Run LongMemEval benchmark
 *   pnpm exec tsx scripts/benchmark-agent-runner-v6.ts
 *
 *   # Run CauseMe benchmark
 *   BENCHMARK_TYPE=causeme pnpm exec tsx scripts/benchmark-agent-runner-v6.ts
 *
 *   # Run both benchmarks
 *   BENCHMARK_TYPE=both pnpm exec tsx scripts/benchmark-agent-runner-v6.ts
 *
 *   # Run every 7 days (interval mode)
 *   BENCHMARK_MODE=interval pnpm exec tsx scripts/benchmark-agent-runner-v6.ts
 *
 *   # Custom question limit
 *   BENCHMARK_MAX_QUESTIONS=100 pnpm exec tsx scripts/benchmark-agent-runner-v6.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { BenchmarkAgent } from './agents/benchmark';
import { globalRegistry } from './agent-framework/agent-registry';

// ────────────────────────────────────────────────────────────────────────────
// Load .env (zero-dependency)
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || CORE_BRAIN_ORG_ID;
const BENCHMARK_MODE = (process.env.BENCHMARK_MODE || 'once') as 'once' | 'interval';
const BENCHMARK_INTERVAL_HOURS = parseInt(process.env.BENCHMARK_INTERVAL_HOURS || '168', 10); // Default: 7 days
const BENCHMARK_TYPE = (process.env.BENCHMARK_TYPE || 'longmemeval') as 'causeme' | 'longmemeval' | 'both';
const BENCHMARK_MAX_QUESTIONS = process.env.BENCHMARK_MAX_QUESTIONS ? parseInt(process.env.BENCHMARK_MAX_QUESTIONS, 10) : 50;
const BENCHMARK_MAX_WORKERS = parseInt(process.env.BENCHMARK_MAX_WORKERS || '10', 10);
const ACCURACY_THRESHOLD = parseFloat(process.env.ACCURACY_THRESHOLD || '70');
const VERBOSE = process.env.VERBOSE === 'true';

// ────────────────────────────────────────────────────────────────────────────
// Runner
// ────────────────────────────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  console.log('═'.repeat(70));
  console.log('  BENCHMARK AGENT (V6 Manus)');
  console.log('═'.repeat(70));
  console.log(`Organization: ${ORGANIZATION_ID}`);
  console.log(`Mode: ${BENCHMARK_MODE}`);
  console.log(`Benchmark Type: ${BENCHMARK_TYPE}`);
  console.log(`Max Questions: ${BENCHMARK_MAX_QUESTIONS}`);
  console.log(`Max Workers: ${BENCHMARK_MAX_WORKERS}`);
  console.log(`Accuracy Threshold: ${ACCURACY_THRESHOLD}%`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const agent = new BenchmarkAgent(supabase, ORGANIZATION_ID, {
    benchmarkType: BENCHMARK_TYPE,
    maxQuestions: BENCHMARK_MAX_QUESTIONS,
    maxWorkers: BENCHMARK_MAX_WORKERS,
    accuracyThreshold: ACCURACY_THRESHOLD,
    verbose: VERBOSE,
  });

  // Auto-register to Agent Registry
  globalRegistry.register({
    name: 'benchmark-agent',
    displayName: 'Benchmark Agent',
    description: 'Runs benchmark datasets (CauseMe, LongMemEval) to validate causal accuracy',
    version: '6.0.0',
    agent,
    tags: ['benchmark', 'evaluation', 'accuracy', 'cerebellum'],
  });

  console.log('✓ Agent registered to global registry');
  console.log('');

  // Execute full pipeline
  const result = await agent.run({
    enableMotorCommands: true,
    enableCalibration: true,
    enableBrainPipeline: true,
  });

  console.log('');
  console.log('═'.repeat(70));
  console.log('  RUN COMPLETE');
  console.log('═'.repeat(70));
  console.log(`Status: ${result.status}`);
  console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length}`);
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  } else {
    console.log('All stages completed successfully ✓');
  }
  console.log('');
}

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

  // Verify OpenAI API key for LongMemEval
  if ((BENCHMARK_TYPE === 'longmemeval' || BENCHMARK_TYPE === 'both') && !process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY is required for LongMemEval benchmark.');
    process.exit(1);
  }

  // Test connection
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  try {
    const { error } = await supabase.from('cross_domain_signals').select('id', { count: 'exact', head: true });
    if (error) {
      console.error(`ERROR: Supabase connection failed: ${error.message}`);
      process.exit(1);
    }
    console.log('✓ Supabase connection verified');
  } catch (err) {
    console.error('ERROR: Cannot connect to Supabase.');
    if (err instanceof Error) console.error(err.message);
    process.exit(1);
  }

  // Execute based on mode
  switch (BENCHMARK_MODE) {
    case 'once':
      await runOnce();
      process.exit(0);
      break;

    case 'interval': {
      const intervalMs = BENCHMARK_INTERVAL_HOURS * 60 * 60 * 1000;
      console.log(`Running in interval mode — every ${BENCHMARK_INTERVAL_HOURS} hours (${(BENCHMARK_INTERVAL_HOURS / 24).toFixed(1)} days)\n`);

      let runCount = 0;
      let shutdownRequested = false;

      process.on('SIGINT', () => {
        shutdownRequested = true;
        console.log('\nShutdown requested. Finishing current benchmark...');
      });

      while (!shutdownRequested) {
        runCount++;
        console.log(`Starting benchmark run #${runCount}\n`);

        try {
          await runOnce();
        } catch (err) {
          console.error(`Run #${runCount} failed:`, err);
        }

        if (shutdownRequested) break;

        const nextRun = new Date(Date.now() + intervalMs);
        console.log(`Next benchmark at ${nextRun.toISOString().replace('T', ' ').substring(0, 19)}. Press Ctrl+C to stop.\n`);

        // Sleep in small chunks to respond to shutdown quickly
        const sleepChunkMs = 10_000;
        let slept = 0;
        while (slept < intervalMs && !shutdownRequested) {
          await new Promise(r => setTimeout(r, Math.min(sleepChunkMs, intervalMs - slept)));
          slept += sleepChunkMs;
        }
      }

      console.log(`Completed ${runCount} benchmark run${runCount !== 1 ? 's' : ''}. Goodbye!`);
      break;
    }

    default:
      console.error(`ERROR: Unknown BENCHMARK_MODE "${BENCHMARK_MODE}". Use: once or interval.`);
      process.exit(1);
  }
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
