/**
 * Autonomous Trainer Runner (V6 Manus)
 *
 * Executes the Autonomous Training Agent using the V6 ManusNativeAgent template.
 * Auto-registers to Agent Registry for Brain Orchestrator discovery.
 *
 * Usage:
 *   # One-time training run
 *   pnpm exec tsx scripts/autonomous-trainer-runner.ts
 *
 *   # Run every 6 hours
 *   TRAINER_MODE=interval pnpm exec tsx scripts/autonomous-trainer-runner.ts
 *
 *   # With real FRED API key (free at research.stlouisfed.org)
 *   FRED_API_KEY=your_key pnpm exec tsx scripts/autonomous-trainer-runner.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { AutonomousTrainerAgent } from './agents/autonomous-trainer';
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
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || '00000000-0000-4000-a000-000000000001';
const TRAINER_MODE = (process.env.TRAINER_MODE || 'once') as 'once' | 'interval';
const TRAINER_INTERVAL_MINUTES = parseInt(process.env.TRAINER_INTERVAL_MINUTES || '360', 10);

// ────────────────────────────────────────────────────────────────────────────
// Runner
// ────────────────────────────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('  AUTONOMOUS TRAINER (V6 Manus)');
  console.log('═'.repeat(60));
  console.log(`Organization: ${ORGANIZATION_ID}`);
  console.log(`Mode: ${TRAINER_MODE}`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: -1 } } });
  const agent = new AutonomousTrainerAgent(supabase, ORGANIZATION_ID, { verbose: true });

  // Auto-register to Agent Registry
  globalRegistry.register({
    name: 'autonomous-trainer',
    displayName: 'Autonomous Trainer',
    description: 'Trains NexusBrain using public data (FRED, GitHub, Wikipedia, etc.)',
    version: '6.0.0',
    agent,
    tags: ['training', 'public-data', 'sensory-cortex'],
  });

  console.log('✓ Agent registered to global registry');
  console.log('');

  // Execute full pipeline: init → fetch → convert → train → validate → consolidate → report
  const result = await agent.run({
    enableMotorCommands: true,
    enableCalibration: true,
    enableBrainPipeline: true,
  });

  console.log('');
  console.log('═'.repeat(60));
  console.log('  RUN COMPLETE');
  console.log('═'.repeat(60));
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

  // Test connection
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: -1 } } });
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
  switch (TRAINER_MODE) {
    case 'once':
      await runOnce();
      process.exit(0);
      break;

    case 'interval': {
      const intervalMs = TRAINER_INTERVAL_MINUTES * 60 * 1000;
      console.log(`Running in interval mode — every ${TRAINER_INTERVAL_MINUTES} minutes\n`);

      let runCount = 0;
      let shutdownRequested = false;

      process.on('SIGINT', () => {
        shutdownRequested = true;
        console.log('\nShutdown requested. Finishing current run...');
      });

      while (!shutdownRequested) {
        runCount++;
        console.log(`Starting run #${runCount}\n`);

        try {
          await runOnce();
        } catch (err) {
          console.error(`Run #${runCount} failed:`, err);
        }

        if (shutdownRequested) break;

        console.log(`Next run in ${TRAINER_INTERVAL_MINUTES} minutes. Press Ctrl+C to stop.\n`);

        // Sleep in small chunks to respond to shutdown quickly
        const sleepChunkMs = 10_000;
        let slept = 0;
        while (slept < intervalMs && !shutdownRequested) {
          await new Promise(r => setTimeout(r, Math.min(sleepChunkMs, intervalMs - slept)));
          slept += sleepChunkMs;
        }
      }

      console.log(`Completed ${runCount} runs. Goodbye!`);
      break;
    }

    default:
      console.error(`ERROR: Unknown TRAINER_MODE "${TRAINER_MODE}". Use: once or interval.`);
      process.exit(1);
  }
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
