/**
 * Git Code Trainer Runner (V6 Manus)
 *
 * Executes the Git Code Trainer Agent using the V6 ManusNativeAgent template.
 * Auto-registers to Agent Registry for Brain Orchestrator discovery.
 *
 * Usage:
 *   # Full run (27 repos → brain training)
 *   pnpm exec tsx scripts/git-code-trainer-runner-v6.ts
 *
 *   # Dry-run (1 repo, no persistence)
 *   GIT_TRAINER_DRY_RUN=true pnpm exec tsx scripts/git-code-trainer-runner-v6.ts
 *
 *   # With GitHub token for higher rate limits
 *   GITHUB_TOKEN=ghp_... pnpm exec tsx scripts/git-code-trainer-runner-v6.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GitCodeTrainerAgent } from './agents/git-code-trainer-v6';
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
    // .env file not found — rely on environment variables (expected in ECS)
  }
}

loadEnv();

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001'; // Core brain org
const DRY_RUN = process.env.GIT_TRAINER_DRY_RUN === 'true';
const MAX_PRS = parseInt(process.env.GIT_TRAINER_MAX_PRS || '200', 10);
const MAX_ISSUES = parseInt(process.env.GIT_TRAINER_MAX_ISSUES || '200', 10);
const MAX_COMMITS = parseInt(process.env.GIT_TRAINER_MAX_COMMITS || '200', 10);

// ────────────────────────────────────────────────────────────────────────────
// Runner
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  GIT CODE TRAINER (V6 Manus)');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Organization: ${ORGANIZATION_ID}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log(`GitHub Token: ${process.env.GITHUB_TOKEN ? 'YES (5000 req/hr)' : 'NO (60 req/hr)'}`);
  console.log(`Max per repo: ${MAX_PRS} PRs, ${MAX_ISSUES} issues, ${MAX_COMMITS} commits`);
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const agent = new GitCodeTrainerAgent(supabase, ORGANIZATION_ID, {
    maxPRs: MAX_PRS,
    maxIssues: MAX_ISSUES,
    maxCommits: MAX_COMMITS,
    dryRun: DRY_RUN,
    verbose: true,
  });

  // Auto-register to Agent Registry
  globalRegistry.register({
    name: 'git-code-trainer',
    displayName: 'Git Code Trainer',
    description: 'Trains NexusBrain on engineering patterns from 27 major open-source GitHub repos (100k+ stars)',
    version: '6.0.0',
    agent,
    tags: ['training', 'github', 'engineering', 'cerebellum'],
  });

  console.log('✓ Agent registered to global registry');
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
