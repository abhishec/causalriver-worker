/**
 * NexusBrain Security Trainer — ECS Runner
 *
 * Pulls vulnerability data from GitHub Advisory Database (GHSA)
 * for npm, PyPI, Go, Maven, crates.io ecosystems.
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
import { SecurityTrainerAgent } from './agents/security-trainer';

const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001';

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain Security Trainer (GHSA/OSV)');
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
    name: 'security-trainer',
    description: 'Security landscape intelligence from GHSA across 5 ecosystems',
    version: '1.0.0',
    factory: (config) => new SecurityTrainerAgent(config),
    schedule: '0 4 * * *',
    resourceRequirements: { cpu: '512', memory: '2048' },
    tags: ['training', 'security', 'vulnerability', 'ghsa'],
  });

  const manager = new AgentManager(registry, { supabaseUrl, supabaseKey, organizationId: ORGANIZATION_ID });
  registry.printSummary();

  try {
    const result = await manager.runWithRetry('security-trainer', 2, {
      dryRun: process.env.SECURITY_TRAINER_DRY_RUN === 'true',
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  Security Trainer Complete: ${result.signalsGenerated} signals, ${result.packsProcessed} packs in ${elapsed}s`);
    process.exit(result.errorsEncountered.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(`\n[FATAL] Security Trainer failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

main().catch((err) => { console.error('[FATAL]', err); process.exit(2); });
