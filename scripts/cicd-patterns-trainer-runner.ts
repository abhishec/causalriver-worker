/**
 * NexusBrain CI/CD Patterns Trainer — ECS Runner
 *
 * Pulls GitHub Actions workflow files from 30 top repos.
 * Needs GITHUB_TOKEN for higher rate limits.
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
  } catch { /* ECS env */ }
}
loadEnv();

import { AgentRegistry } from './agent-framework/agent-registry';
import { AgentManager } from './agent-framework/agent-manager';
import { CICDPatternsTrainerAgent } from './agents/cicd-patterns-trainer';

const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001';

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain CI/CD Patterns Trainer (GitHub Actions Workflows)');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════════════════\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const registry = new AgentRegistry();
  registry.register({
    name: 'cicd-patterns-trainer',
    description: 'CI/CD pipeline intelligence from 30 top GitHub repos',
    version: '1.0.0',
    factory: (config) => new CICDPatternsTrainerAgent(config),
    schedule: '0 8 * * *',
    resourceRequirements: { cpu: '1024', memory: '4096' },
    tags: ['training', 'cicd', 'github-actions', 'pipeline', 'deployment'],
  });

  const manager = new AgentManager(registry, { supabaseUrl, supabaseKey, organizationId: ORGANIZATION_ID });
  registry.printSummary();

  try {
    const result = await manager.runWithRetry('cicd-patterns-trainer', 2, {
      dryRun: process.env.CICD_TRAINER_DRY_RUN === 'true',
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  CI/CD Trainer Complete: ${result.signalsGenerated} signals, ${result.packsProcessed} packs in ${elapsed}s`);
    process.exit(result.errorsEncountered.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n[FATAL] CI/CD Trainer failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

main().catch((err) => { console.error('[FATAL]', err); process.exit(2); });
