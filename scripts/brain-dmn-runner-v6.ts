/**
 * DMN Runner (V6 Manus)
 *
 * Executes the DMN Agent using the V6 ManusNativeAgent template.
 * Auto-registers to Agent Registry for Brain Orchestrator discovery.
 *
 * Usage:
 *   # One-time DMN scan
 *   pnpm exec tsx scripts/brain-dmn-runner-v6.ts
 *
 *   # Run every 4 hours (interval mode)
 *   DMN_MODE=interval pnpm exec tsx scripts/brain-dmn-runner-v6.ts
 *
 *   # Scan all organizations
 *   SCAN_ALL_ORGS=true pnpm exec tsx scripts/brain-dmn-runner-v6.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DMNAgent } from './agents/brain-dmn';
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
const SCAN_ALL_ORGS = process.env.SCAN_ALL_ORGS === 'true';
const DMN_MODE = (process.env.DMN_MODE || 'once') as 'once' | 'interval';
const DMN_INTERVAL_HOURS = parseInt(process.env.DMN_INTERVAL_HOURS || '4', 10);
const MIN_SURPRISE_SCORE = parseFloat(process.env.MIN_SURPRISE_SCORE || '0.5');
const MAX_INSIGHTS_PER_SCAN = parseInt(process.env.MAX_INSIGHTS_PER_SCAN || '10', 10);
const VERBOSE = process.env.VERBOSE === 'true';

// ────────────────────────────────────────────────────────────────────────────
// Runner
// ────────────────────────────────────────────────────────────────────────────

async function runOnce(): Promise<void> {
  console.log('═'.repeat(70));
  console.log('  DMN BACKGROUND SCAN (V6 Manus)');
  console.log('═'.repeat(70));
  console.log(`Organization: ${ORGANIZATION_ID}`);
  console.log(`Mode: ${DMN_MODE}`);
  console.log(`Min Surprise Score: ${MIN_SURPRISE_SCORE}`);
  console.log(`Max Insights: ${MAX_INSIGHTS_PER_SCAN}`);
  console.log(`Scan all orgs: ${SCAN_ALL_ORGS}`);
  console.log('');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const agent = new DMNAgent(supabase, ORGANIZATION_ID, {
    minSurpriseScore: MIN_SURPRISE_SCORE,
    maxInsightsPerScan: MAX_INSIGHTS_PER_SCAN,
    scanAllOrgs: SCAN_ALL_ORGS,
    verbose: VERBOSE,
  });

  // Auto-register to Agent Registry
  globalRegistry.register({
    name: 'dmn',
    displayName: 'Default Mode Network',
    description: 'Performs background insight scanning for unexpected correlations and emerging patterns',
    version: '6.0.0',
    agent,
    tags: ['dmn', 'insights', 'background-scan', 'proactive'],
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
  switch (DMN_MODE) {
    case 'once':
      await runOnce();
      process.exit(0);
      break;

    case 'interval': {
      const intervalMs = DMN_INTERVAL_HOURS * 60 * 60 * 1000;
      console.log(`Running in interval mode — every ${DMN_INTERVAL_HOURS} hours\n`);

      let runCount = 0;
      let shutdownRequested = false;

      process.on('SIGINT', () => {
        shutdownRequested = true;
        console.log('\nShutdown requested. Finishing current scan...');
      });

      while (!shutdownRequested) {
        runCount++;
        console.log(`Starting DMN scan #${runCount}\n`);

        try {
          await runOnce();
        } catch (err) {
          console.error(`Run #${runCount} failed:`, err);
        }

        if (shutdownRequested) break;

        const nextRun = new Date(Date.now() + intervalMs);
        console.log(`Next scan at ${nextRun.toISOString().substring(11, 19)}. Press Ctrl+C to stop.\n`);

        // Sleep in small chunks to respond to shutdown quickly
        const sleepChunkMs = 10_000;
        let slept = 0;
        while (slept < intervalMs && !shutdownRequested) {
          await new Promise(r => setTimeout(r, Math.min(sleepChunkMs, intervalMs - slept)));
          slept += sleepChunkMs;
        }
      }

      console.log(`Completed ${runCount} DMN scan${runCount !== 1 ? 's' : ''}. Goodbye!`);
      break;
    }

    default:
      console.error(`ERROR: Unknown DMN_MODE "${DMN_MODE}". Use: once or interval.`);
      process.exit(1);
  }
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
