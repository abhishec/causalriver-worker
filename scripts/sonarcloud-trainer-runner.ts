/**
 * NexusBrain SonarCloud Trainer — ECS Runner
 *
 * Pulls code quality metrics from public SonarCloud projects.
 * Public, no auth needed.
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
import { SonarCloudTrainerAgent } from './agents/sonarcloud-trainer';

const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001';

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain SonarCloud Trainer (Public Code Quality Metrics)');
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
    name: 'sonarcloud-trainer',
    description: 'Code quality intelligence from public SonarCloud projects',
    version: '1.0.0',
    factory: (config) => new SonarCloudTrainerAgent(config),
    schedule: '0 9 * * 0',  // Weekly on Sunday (quality metrics don't change daily)
    resourceRequirements: { cpu: '512', memory: '2048' },
    tags: ['training', 'sonarcloud', 'code-quality', 'coverage', 'maintainability'],
  });

  const manager = new AgentManager(registry, { supabaseUrl, supabaseKey, organizationId: ORGANIZATION_ID });
  registry.printSummary();

  try {
    const result = await manager.runWithRetry('sonarcloud-trainer', 2, {
      dryRun: process.env.SONARCLOUD_TRAINER_DRY_RUN === 'true',
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  SonarCloud Trainer Complete: ${result.signalsGenerated} signals, ${result.packsProcessed} packs in ${elapsed}s`);
    process.exit(result.errorsEncountered.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n[FATAL] SonarCloud Trainer failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

main().catch((err) => { console.error('[FATAL]', err); process.exit(2); });
