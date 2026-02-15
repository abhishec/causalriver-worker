#!/usr/bin/env tsx
/**
 * CI Healer Runner — Entrypoint for the CI Self-Healing Agent
 *
 * Invoked by:
 *   - GitHub Actions workflow: `.github/workflows/ci-self-heal.yml`
 *   - CLI: `pnpm exec tsx scripts/run-ci-healer.ts [--run-id <id>] [--mode <heal|diagnose|retry>] [--dry-run]`
 *
 * Environment Variables:
 *   CI_RUN_ID             — GitHub Actions run ID to analyze
 *   CI_HEAL_MODE          — heal | diagnose | retry (default: heal)
 *   CI_HEAL_ATTEMPT       — Current attempt number (default: 1)
 *   SUPABASE_URL          — Required for brain signal storage
 *   SUPABASE_SERVICE_ROLE_KEY — Required for brain signal storage
 *   GITHUB_TOKEN          — Required for GitHub API access
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env for local development
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
    // .env not found — rely on environment variables
  }
}
loadEnv();

import { CIHealerAgent, type CIHealerConfig } from './agents/ci-healer-agent';

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const runId = getArg('--run-id') || process.env.CI_RUN_ID;
  const mode = (getArg('--mode') || process.env.CI_HEAL_MODE || 'heal') as 'heal' | 'diagnose' | 'retry';
  const dryRun = args.includes('--dry-run');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.');
    console.warn('   Brain signal storage will be skipped. Agent will still diagnose/heal.');
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain CI Healer Agent');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Run ID:    ${runId || '(scan recent failures)'}`);
  console.log(`  Mode:      ${mode}`);
  console.log(`  Dry Run:   ${dryRun}`);
  console.log(`  Attempt:   ${process.env.CI_HEAL_ATTEMPT || '1'}`);
  console.log(`  Repo:      ${process.env.GITHUB_REPOSITORY || 'local'}`);
  console.log('════════════════════════════════════════════════════════════\n');

  const config: CIHealerConfig = {
    supabaseUrl: supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey: supabaseKey || 'placeholder',
    organizationId: process.env.DEFAULT_ORG_ID || '00000000-0000-4000-a000-000000000001',
    runId,
    mode,
    dryRun: dryRun || !supabaseUrl, // If no Supabase, run in dry-run mode
    maxHealAttempts: 3,
    repository: process.env.GITHUB_REPOSITORY,
    verbose: true,
  };

  const agent = new CIHealerAgent(config);
  const result = await agent.run();

  // Exit with appropriate code
  const hasErrors = result.errorsEncountered.length > 0;
  const allFailed = result.stages.every(s => s.status === 'failed');

  if (allFailed) {
    console.error('\n❌ CI Healer failed completely');
    process.exit(1);
  }

  if (hasErrors) {
    console.warn(`\n⚠️  CI Healer completed with ${result.errorsEncountered.length} warnings`);
    process.exit(0); // Don't fail — healing is best-effort
  }

  console.log('\n✅ CI Healer completed successfully');
  process.exit(0);
}

main().catch(err => {
  console.error('CI Healer crashed:', err);
  process.exit(1);
});
