/**
 * Federation Agent Runner
 *
 * Executes the Federation Agent using the V6 ManusNativeAgent template.
 * Ensures bidirectional Core ↔ Org brain knowledge flow.
 *
 * Usage:
 *   pnpm exec tsx scripts/federation-agent-runner.ts
 *
 * Environment Variables:
 *   - SUPABASE_URL (required)
 *   - SUPABASE_SERVICE_ROLE_KEY (required)
 *   - SLACK_BOT_TOKEN (optional, for notifications)
 *   - SLACK_CHANNEL_ID (optional, for notifications)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { FederationAgent } from './agents/federation-agent';

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
    // .env file not found — rely on environment variables (expected in ECS)
  }
}

loadEnv();

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CORE_ORG_ID = '00000000-0000-4000-a000-000000000001';
const MIN_EFFECT_SIZE = parseFloat(process.env.FEDERATION_MIN_EFFECT_SIZE || '0.15');
const MIN_CONFIDENCE = parseFloat(process.env.FEDERATION_MIN_CONFIDENCE || '0.7');
const MAX_ITEMS_PER_RUN = parseInt(process.env.FEDERATION_MAX_ITEMS_PER_RUN || '20', 10);

// ────────────────────────────────────────────────────────────────────────────
// Runner
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  FEDERATION AGENT (V6 Manus)');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Organization: ${CORE_ORG_ID} (Core Brain)`);
  console.log(`Min Effect Size: ${MIN_EFFECT_SIZE}`);
  console.log(`Min Confidence: ${MIN_CONFIDENCE}`);
  console.log(`Max Items/Run: ${MAX_ITEMS_PER_RUN}`);
  console.log('');

  // Validate environment
  if (!SUPABASE_URL) {
    console.error('ERROR: SUPABASE_URL is not set.');
    process.exit(1);
  }
  if (!SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { params: { eventsPerSecond: -1 } } });
  const agent = new FederationAgent(supabase, CORE_ORG_ID, {
    minEffectSize: MIN_EFFECT_SIZE,
    minConfidence: MIN_CONFIDENCE,
    maxItemsPerRun: MAX_ITEMS_PER_RUN,
    verbose: true,
  });

  console.log('✓ Federation Agent initialized');
  console.log('');

  // Test connection
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

  console.log('');

  // Execute full pipeline
  const result = await agent.run({
    enableMotorCommands: true,
    enableCalibration: true,
    enableBrainPipeline: true,
  });

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  RUN COMPLETE');
  console.log('════════════════════════════════════════════════════════════');
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

  process.exit(result.errors.length > 0 ? 1 : 0);
}

// ── Entry Point ──
main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
