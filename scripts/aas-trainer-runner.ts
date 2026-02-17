/**
 * NexusBrain AAS Trainer — ECS Runner
 *
 * Standalone entry point for the Account as a Service Trainer Agent.
 * Designed to run as an ECS Fargate task (one-shot) or locally.
 *
 * Seeds the CORE brain with accounting intelligence from public data so
 * NexusBrain can produce Trial Balance, P&L, Balance Sheet, GST computation,
 * and transaction interpretations that beat Claude baseline on Phase 1 validation.
 *
 * Data sources (all free, no auth):
 *   - SEC EDGAR XBRL (20 SaaS companies)
 *   - FASB GAAP Taxonomy (450+ account classifications, hardcoded)
 *   - Damodaran 2024 Industry Benchmarks (hardcoded)
 *   - ATO Small Business Benchmarks (hardcoded)
 *   - ERPNext CoA Singapore + Australia (GitHub raw)
 *   - 22 Synthetic SaaS accounting scenarios (computed)
 *
 * Usage:
 *   # Full run
 *   pnpm exec tsx scripts/aas-trainer-runner.ts
 *
 *   # Dry run (fetch 3 EDGAR companies, no persistence)
 *   AAS_TRAINER_DRY_RUN=true pnpm exec tsx scripts/aas-trainer-runner.ts
 *
 *   # Full mode (ignore incremental)
 *   AAS_TRAINER_MODE=full pnpm exec tsx scripts/aas-trainer-runner.ts
 *
 * Environment Variables:
 *   SUPABASE_URL              — Required
 *   SUPABASE_SERVICE_ROLE_KEY — Required
 *   AAS_TRAINER_DRY_RUN       — Optional (true = 3 companies, no persist)
 *   AAS_TRAINER_MODE          — Optional ('full' | 'incremental', default: incremental)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Load .env (zero-dependency) ──────────────────────────────────────────────
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
  } catch {
    // .env not found — rely on environment variables (ECS injects via SSM)
  }
}
loadEnv();

// ── Imports (after env loaded) ───────────────────────────────────────────────
import { AgentRegistry } from './agent-framework/agent-registry';
import { AgentManager } from './agent-framework/agent-manager';
import { AASTrainerAgent } from './agents/aas-trainer';

// ── Configuration ────────────────────────────────────────────────────────────
const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001'; // CORE brain org

async function main(): Promise<void> {
  const startTime = Date.now();
  const isDryRun = process.env.AAS_TRAINER_DRY_RUN === 'true';
  const mode = process.env.AAS_TRAINER_MODE || 'incremental';

  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain AAS Trainer — Account as a Service');
  console.log(`  Started:  ${new Date().toISOString()}`);
  console.log(`  Mode:     ${isDryRun ? 'DRY RUN' : mode.toUpperCase()}`);
  console.log(`  Target:   CORE brain (${ORGANIZATION_ID})`);
  console.log('  Sources:  SEC EDGAR · FASB CoA · Damodaran · ATO · ERPNext · Synthetic');
  console.log('  Goal:     Beat Claude baseline on TB, P&L, BS, GST, Interpretations');
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

  // ── Set up registry + manager ──────────────────────────────────────────────
  const registry = new AgentRegistry();
  registry.register({
    name: 'aas-trainer',
    description: 'Account as a Service trainer: seeds CORE with accounting intelligence for Trial Balance, P&L, Balance Sheet, GST computation',
    version: '1.0.0',
    factory: (config) => new AASTrainerAgent(config),
    schedule: '0 3 * * *', // Daily 3 AM UTC
    resourceRequirements: {
      cpu: '1024',    // 1 vCPU
      memory: '4096', // 4 GB
    },
    tags: ['training', 'accounting', 'aas', 'finance', 'gst', 'phase1-validation'],
  });

  const manager = new AgentManager(registry, {
    supabaseUrl,
    supabaseKey,
    organizationId: ORGANIZATION_ID,
  });

  registry.printSummary();

  // ── Run ────────────────────────────────────────────────────────────────────
  try {
    const result = await manager.runWithRetry('aas-trainer', 2, {
      dryRun: isDryRun,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('  AAS Trainer — Run Complete');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`  Duration:    ${elapsed}s`);
    console.log(`  Signals:     ${result.signalsGenerated}`);
    console.log(`  Packs:       ${result.packsProcessed}`);
    console.log(`  Errors:      ${result.errorsEncountered.length}`);
    console.log(`  Summary:     ${result.summary}`);

    if (result.errorsEncountered.length > 0) {
      console.log('\n  Errors:');
      for (const err of result.errorsEncountered) {
        console.log(`    ✗ ${err}`);
      }
    }

    if (result.errorsEncountered.length === 0) {
      console.log('\n  ✓ CORE brain now has accounting intelligence for:');
      console.log('    • Trial Balance (FASB taxonomy + double-entry rules)');
      console.log('    • P&L (SFRS 15 revenue recognition + SaaS benchmarks)');
      console.log('    • Balance Sheet (A = L + E causal chain)');
      console.log('    • GST computation (SG 9% + AU 10% + reverse charge)');
      console.log('    • Transaction interpretations (150 SaaS examples)');
    }

    console.log('════════════════════════════════════════════════════════════\n');

    process.exit(result.errorsEncountered.length > 0 ? 1 : 0);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[FATAL] AAS Trainer failed after ${elapsed}s:`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('[FATAL] Unhandled error:', err);
  process.exit(2);
});
