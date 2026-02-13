/**
 * NexusBrain Git Code Trainer — ECS Runner
 *
 * Standalone entry point for the Git Code Trainer Agent.
 * Designed to run as an ECS Fargate task (one-shot).
 *
 * Usage:
 *   # Full run (all 20 repos → brain training)
 *   pnpm exec tsx scripts/git-code-trainer-runner.ts
 *
 *   # Dry-run (1 repo, no persistence)
 *   GIT_TRAINER_DRY_RUN=true pnpm exec tsx scripts/git-code-trainer-runner.ts
 *
 *   # With GitHub token for higher rate limits
 *   GITHUB_TOKEN=ghp_... pnpm exec tsx scripts/git-code-trainer-runner.ts
 *
 * Environment Variables:
 *   SUPABASE_URL              — Required
 *   SUPABASE_SERVICE_ROLE_KEY — Required
 *   GITHUB_TOKEN              — Optional (5000 vs 60 req/hr)
 *   GIT_TRAINER_DRY_RUN       — Optional (true = fetch 1 repo, no persist)
 *   GIT_TRAINER_MAX_PRS       — Optional (default: 200)
 *   GIT_TRAINER_MAX_ISSUES    — Optional (default: 200)
 *   GIT_TRAINER_MAX_COMMITS   — Optional (default: 200)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Load .env (zero-dependency, same pattern as autonomous-trainer.ts) ──
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

// ── Imports (after env loaded) ──
import { AgentRegistry } from './agent-framework/agent-registry';
import { AgentManager } from './agent-framework/agent-manager';
import { GitCodeTrainerAgent } from './agents/git-code-trainer';

// ── Configuration ──
const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001'; // Core brain org

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain Git Code Trainer Agent');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Mode: ${process.env.GIT_TRAINER_DRY_RUN === 'true' ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log(`  GitHub Token: ${process.env.GITHUB_TOKEN ? 'YES (5000 req/hr)' : 'NO (60 req/hr)'}`);
  console.log('════════════════════════════════════════════════════════════\n');

  // Validate required env vars
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Missing required environment variables:');
    if (!supabaseUrl) console.error('  - SUPABASE_URL');
    if (!supabaseKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    console.error('\nSet these in .env or as environment variables.');
    process.exit(1);
  }

  // ── Set up registry + manager ──
  const registry = new AgentRegistry();
  registry.register({
    name: 'git-code-trainer',
    description: 'Trains the core brain on engineering patterns from 20 major GitHub repos',
    version: '1.0.0',
    factory: (config) => new GitCodeTrainerAgent(config),
    schedule: '0 2 * * 0', // Weekly: Sunday 2 AM UTC
    resourceRequirements: {
      cpu: '2048',   // 2 vCPU
      memory: '8192', // 8 GB
    },
    tags: ['training', 'github', 'engineering'],
  });

  const manager = new AgentManager(registry, {
    supabaseUrl,
    supabaseKey,
    organizationId: ORGANIZATION_ID,
  });

  // ── Print registry ──
  registry.printSummary();

  // ── Run the agent ──
  try {
    const result = await manager.runWithRetry('git-code-trainer', 2, {
      dryRun: process.env.GIT_TRAINER_DRY_RUN === 'true',
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  Git Code Trainer — Run Complete');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`  Duration:    ${elapsed}s`);
    console.log(`  Signals:     ${result.signalsGenerated}`);
    console.log(`  Packs:       ${result.packsProcessed}`);
    console.log(`  Errors:      ${result.errorsEncountered.length}`);
    console.log(`  Summary:     ${result.summary}`);

    if (result.errorsEncountered.length > 0) {
      console.log('\n  Errors:');
      for (const err of result.errorsEncountered) {
        console.log(`    - ${err}`);
      }
    }

    console.log('════════════════════════════════════════════════════════════\n');

    // Exit with appropriate code
    process.exit(result.errorsEncountered.length > 0 ? 1 : 0);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[FATAL] Git Code Trainer failed after ${elapsed}s:`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

// ── Entry point ──
main().catch((err) => {
  console.error('[FATAL] Unhandled error:', err);
  process.exit(2);
});
