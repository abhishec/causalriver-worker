/**
 * NexusBrain JIRA Trainer — ECS Runner
 *
 * Standalone entry point for the JIRA Trainer Agent.
 * Designed to run as an ECS Fargate task (one-shot).
 *
 * Data source: Apache's public JIRA (issues.apache.org)
 * Projects: Kafka, Spark, Hadoop, Cassandra, Flink, HBase, Hive
 * No authentication needed — Apache JIRA is fully public read-only.
 *
 * Usage:
 *   # Full run (all 7 Apache projects → brain training)
 *   pnpm exec tsx scripts/jira-trainer-runner.ts
 *
 *   # Dry-run (1 project, no persistence)
 *   JIRA_TRAINER_DRY_RUN=true pnpm exec tsx scripts/jira-trainer-runner.ts
 *
 *   # Full mode (ignore incremental, re-fetch everything)
 *   JIRA_TRAINER_MODE=full pnpm exec tsx scripts/jira-trainer-runner.ts
 *
 * Environment Variables:
 *   SUPABASE_URL              — Required
 *   SUPABASE_SERVICE_ROLE_KEY — Required
 *   JIRA_TRAINER_DRY_RUN      — Optional (true = fetch 1 project, no persist)
 *   JIRA_TRAINER_MODE          — Optional ('full' | 'incremental', default: incremental)
 *   JIRA_TRAINER_MAX_ISSUES    — Optional (max issues per project, default: 500)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Load .env (zero-dependency, same pattern as git-code-trainer-runner.ts) ──
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
import { JiraTrainerAgent } from './agents/jira-trainer';

// ── Configuration ──
const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001'; // Core brain org

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain JIRA Trainer Agent');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Mode: ${process.env.JIRA_TRAINER_DRY_RUN === 'true' ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log(`  Source: Apache JIRA (issues.apache.org) — public, no auth`);
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
    name: 'jira-trainer',
    description: 'Trains the core brain on PM patterns from 7 Apache JIRA projects (Kafka, Spark, Hadoop, etc.)',
    version: '1.0.0',
    factory: (config) => new JiraTrainerAgent(config),
    schedule: '0 2 * * *', // Nightly: 2 AM UTC (after git-trainer at 1 AM)
    resourceRequirements: {
      cpu: '1024',   // 1 vCPU (lighter than git-trainer — fewer API calls)
      memory: '4096', // 4 GB
    },
    tags: ['training', 'jira', 'project-management', 'apache'],
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
    const result = await manager.runWithRetry('jira-trainer', 2, {
      dryRun: process.env.JIRA_TRAINER_DRY_RUN === 'true',
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  JIRA Trainer — Run Complete');
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
    console.error(`\n[FATAL] JIRA Trainer failed after ${elapsed}s:`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

// ── Entry point ──
main().catch((err) => {
  console.error('[FATAL] Unhandled error:', err);
  process.exit(2);
});
