/**
 * Brain Consolidation Runner (V6 Manus)
 *
 * Executes the Brain Consolidation Agent using the V6 ManusNativeAgent template.
 * Auto-registers to Agent Registry for Brain Orchestrator discovery.
 *
 * Usage:
 *   # One-time consolidation (core brain)
 *   pnpm exec tsx scripts/brain-consolidation-runner-v6.ts
 *
 *   # Run nightly at 2 AM (interval mode, every 24h)
 *   CONSOLIDATION_MODE=interval pnpm exec tsx scripts/brain-consolidation-runner-v6.ts
 *
 *   # Consolidate ALL active orgs
 *   CONSOLIDATE_ALL_ORGS=true pnpm exec tsx scripts/brain-consolidation-runner-v6.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { BrainConsolidationAgent } from './agents/brain-consolidation';
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
const CONSOLIDATE_ALL_ORGS = process.env.CONSOLIDATE_ALL_ORGS === 'true';
const CONSOLIDATION_MODE = (process.env.CONSOLIDATION_MODE || 'once') as 'once' | 'interval';
const CONSOLIDATION_INTERVAL_HOURS = parseInt(process.env.CONSOLIDATION_INTERVAL_HOURS || '24', 10);
const LOOKBACK_HOURS = parseInt(process.env.LOOKBACK_HOURS || '48', 10);
const PRUNE_AFTER_DAYS = parseInt(process.env.PRUNE_AFTER_DAYS || '30', 10);
const VERBOSE = process.env.VERBOSE === 'true';

// ────────────────────────────────────────────────────────────────────────────
// Runner
// ────────────────────────────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  console.log('═'.repeat(70));
  console.log('  BRAIN CONSOLIDATION (V6 Manus)');
  console.log('═'.repeat(70));
  console.log(`Organization: ${ORGANIZATION_ID}`);
  console.log(`Mode: ${CONSOLIDATION_MODE}`);
  console.log(`Lookback: ${LOOKBACK_HOURS} hours`);
  console.log(`Prune threshold: ${PRUNE_AFTER_DAYS} days`);
  console.log(`Consolidate all orgs: ${CONSOLIDATE_ALL_ORGS}`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const agent = new BrainConsolidationAgent(supabase, ORGANIZATION_ID, {
    lookbackHours: LOOKBACK_HOURS,
    pruneAfterDays: PRUNE_AFTER_DAYS,
    consolidateAllOrgs: CONSOLIDATE_ALL_ORGS,
    verbose: VERBOSE,
  });

  // Auto-register to Agent Registry
  globalRegistry.register({
    name: 'brain-consolidation',
    displayName: 'Brain Consolidation',
    description: 'Performs brain sleep consolidation (10-step cycle: causal discovery, pruning, strengthening, federation)',
    version: '6.0.0',
    agent,
    tags: ['consolidation', 'sleep', 'dmn', 'federation'],
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
    console.error('ERROR: SUPABASE_URL is not set.');
    process.exit(1);
  }
  if (!SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set.');
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
  switch (CONSOLIDATION_MODE) {
    case 'once':
      await runOnce();
      process.exit(0);
      break;

    case 'interval': {
      const intervalMs = CONSOLIDATION_INTERVAL_HOURS * 60 * 60 * 1000;
      console.log(`Running in interval mode — every ${CONSOLIDATION_INTERVAL_HOURS} hours\n`);

      let runCount = 0;
      let shutdownRequested = false;

      process.on('SIGINT', () => {
        shutdownRequested = true;
        console.log('\nShutdown requested. Finishing current consolidation...');
      });

      while (!shutdownRequested) {
        runCount++;
        console.log(`Starting consolidation run #${runCount}\n`);

        try {
          await runOnce();
        } catch (err) {
          console.error(`Run #${runCount} failed:`, err);
        }

        if (shutdownRequested) break;

        const nextRun = new Date(Date.now() + intervalMs);
        console.log(`Next consolidation at ${nextRun.toISOString().substring(11, 19)}. Press Ctrl+C to stop.\n`);

        // Sleep in small chunks to respond to shutdown quickly
        const sleepChunkMs = 10_000;
        let slept = 0;
        while (slept < intervalMs && !shutdownRequested) {
          await new Promise(r => setTimeout(r, Math.min(sleepChunkMs, intervalMs - slept)));
          slept += sleepChunkMs;
        }
      }

      console.log(`Completed ${runCount} consolidation run${runCount !== 1 ? 's' : ''}. Goodbye!`);
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
