/**
 * NexusBrain GitHub Discussions Trainer — ECS Runner
 *
 * Standalone entry point for the Discussions Trainer Agent.
 * Designed to run as an ECS Fargate task (one-shot).
 *
 * Usage:
 *   pnpm exec tsx scripts/discussions-trainer-runner.ts
 *   DISCUSSIONS_TRAINER_DRY_RUN=true pnpm exec tsx scripts/discussions-trainer-runner.ts
 *
 * Environment Variables:
 *   SUPABASE_URL              — Required
 *   SUPABASE_SERVICE_ROLE_KEY — Required
 *   GITHUB_TOKEN              — Required (GraphQL API needs auth)
 *   DISCUSSIONS_TRAINER_DRY_RUN — Optional
 *   DISCUSSIONS_TRAINER_MODE   — Optional ('full' | 'incremental')
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* ECS uses env vars directly */ }
}
loadEnv();

import { AgentRegistry } from './agent-framework/agent-registry';
import { AgentManager } from './agent-framework/agent-manager';
import { DiscussionsTrainerAgent } from './agents/discussions-trainer';

const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001';

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain GitHub Discussions Trainer Agent');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Mode: ${process.env.DISCUSSIONS_TRAINER_DRY_RUN === 'true' ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log('════════════════════════════════════════════════════════════\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const registry = new AgentRegistry();
  registry.register({
    name: 'discussions-trainer',
    description: 'Trains the core brain on communication patterns from GitHub Discussions (Slack proxy)',
    version: '1.0.0',
    factory: (config) => new DiscussionsTrainerAgent(config),
    schedule: '0 3 * * *',
    resourceRequirements: { cpu: '1024', memory: '4096' },
    tags: ['training', 'discussions', 'communication', 'github'],
  });

  const manager = new AgentManager(registry, { supabaseUrl, supabaseKey, organizationId: ORGANIZATION_ID });
  registry.printSummary();

  try {
    const result = await manager.runWithRetry('discussions-trainer', 2, {
      dryRun: process.env.DISCUSSIONS_TRAINER_DRY_RUN === 'true',
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  Discussions Trainer Complete: ${result.signalsGenerated} signals, ${result.packsProcessed} packs, ${result.errorsEncountered.length} errors in ${elapsed}s`);
    process.exit(result.errorsEncountered.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n[FATAL] Discussions Trainer failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

main().catch((err) => { console.error('[FATAL]', err); process.exit(2); });
