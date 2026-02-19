#!/usr/bin/env tsx
/**
 * Run All Nightly Agents — Complete Brain Pipeline for Every Customer/Org/Brain
 *
 * This is the single entry point for the nightly brain cycle. It ensures
 * EVERY active organization gets the FULL treatment:
 *
 *   Phase 1: Edge Function jobs (verification, weights, decay, thresholds, retention)
 *   Phase 2: Brain Consolidation (10-step sleep + cognitive stack L3-L15)
 *   Phase 3: Federation (org → core, core → org)
 *   Phase 4: Oracle (autonomous prediction verification + UCB1 bandit RL)
 *   Phase 5: Full Consolidation pipeline (brain-pipeline.runFullCycle per org)
 *
 * For every customer → every org → every brain.
 *
 * USAGE:
 *   pnpm run nightly                     # Run everything
 *   VERBOSE=true pnpm run nightly        # Verbose mode
 *   DRY_RUN=true pnpm run nightly        # List what would run, don't execute
 *
 * SCHEDULING:
 *   Runs via .github/workflows/brain-consolidation.yml at 2 AM UTC nightly.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// ── Load .env ──
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

// ── Config ──
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const VERBOSE = process.env.VERBOSE === 'true';
const DRY_RUN = process.env.DRY_RUN === 'true';
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ── Logging ──
function log(phase: string, msg: string): void {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[${time}] [${phase}] ${msg}`);
}

function logError(phase: string, msg: string, err?: unknown): void {
  const time = new Date().toISOString().substring(11, 19);
  console.error(`[${time}] [${phase}] ERROR: ${msg}`);
  if (err instanceof Error) console.error(`  ${err.message}`);
}

function divider(title: string): void {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(72)}\n`);
}

// ── Types ──
interface OrgInfo {
  id: string;
  name: string;
  customer_name?: string;
}

interface PhaseResult {
  phase: string;
  success: boolean;
  orgsProcessed: number;
  durationMs: number;
  details?: string;
  errors: string[];
}

// ============================================================================
// PHASE 1: Edge Function Daily Jobs (per-org)
// ============================================================================

async function phase1EdgeFunctionJobs(supabase: ReturnType<typeof createClient>, orgs: OrgInfo[]): Promise<PhaseResult> {
  const start = Date.now();
  const errors: string[] = [];
  let processed = 0;

  for (const org of orgs) {
    log('PHASE-1', `Running daily edge jobs for ${org.name} (${org.id.substring(0, 8)}...)`);

    if (DRY_RUN) {
      log('PHASE-1', `  [DRY RUN] Would run: verification, weights, decay, threshold, retention, federation`);
      processed++;
      continue;
    }

    try {
      const url = `${SUPABASE_URL}/functions/v1/scheduled-jobs`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          job_type: 'all_daily',
          organization_id: org.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        const errMsg = `Edge jobs failed for ${org.name}: ${JSON.stringify(result).substring(0, 200)}`;
        errors.push(errMsg);
        logError('PHASE-1', errMsg);
      } else {
        log('PHASE-1', `  ✓ Edge jobs complete for ${org.name}`);
        if (VERBOSE && result.results) {
          for (const r of result.results) {
            log('PHASE-1', `    ${r.job_type}: ${r.success ? '✓' : '✗'} (${r.duration_ms}ms)`);
          }
        }
        processed++;
      }
    } catch (err: any) {
      const errMsg = `Edge jobs error for ${org.name}: ${err.message}`;
      errors.push(errMsg);
      logError('PHASE-1', errMsg);
    }
  }

  return {
    phase: 'Edge Function Daily Jobs',
    success: errors.length === 0,
    orgsProcessed: processed,
    durationMs: Date.now() - start,
    errors,
  };
}

// ============================================================================
// PHASE 2: Brain Consolidation (10-step sleep + cognitive stack L3-L15)
// ============================================================================

async function phase2Consolidation(): Promise<PhaseResult> {
  const start = Date.now();
  const errors: string[] = [];

  log('PHASE-2', 'Running full brain consolidation for ALL orgs + core brain...');

  if (DRY_RUN) {
    log('PHASE-2', '[DRY RUN] Would run: brain-consolidation-runner.ts with CONSOLIDATE_ALL_ORGS=true');
    return { phase: 'Brain Consolidation', success: true, orgsProcessed: 0, durationMs: 0, errors };
  }

  try {
    execSync(
      `NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/brain-consolidation-runner.ts`,
      {
        stdio: 'inherit',
        cwd: resolve(import.meta.dirname || __dirname, '..'),
        timeout: 7200000, // 2 hour timeout
        env: {
          ...process.env,
          CONSOLIDATE_ALL_ORGS: 'true',
          CONSOLIDATION_MODE: 'once',
          VERBOSE: VERBOSE ? 'true' : 'false',
        },
      }
    );

    log('PHASE-2', '✓ Brain consolidation complete for all orgs');
  } catch (err: any) {
    const errMsg = `Brain consolidation failed: ${err.message}`;
    errors.push(errMsg);
    logError('PHASE-2', errMsg);
  }

  return {
    phase: 'Brain Consolidation',
    success: errors.length === 0,
    orgsProcessed: 1, // Runs all orgs internally
    durationMs: Date.now() - start,
    details: 'CONSOLIDATE_ALL_ORGS=true — iterates all active orgs + core brain',
    errors,
  };
}

// ============================================================================
// PHASE 3: Oracle — RL Prediction Verification + Bandit Updates (per-org)
// ============================================================================

async function phase3Oracle(): Promise<PhaseResult> {
  const start = Date.now();
  const errors: string[] = [];

  log('PHASE-3', 'Running Outcome Oracle (RL verification) for ALL orgs...');

  if (DRY_RUN) {
    log('PHASE-3', '[DRY RUN] Would run: run-oracle-job.ts for all orgs');
    return { phase: 'Oracle (RL)', success: true, orgsProcessed: 0, durationMs: 0, errors };
  }

  try {
    // Oracle already iterates all orgs when ORGANIZATION_ID is unset
    execSync(
      `NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/run-oracle-job.ts`,
      {
        stdio: 'inherit',
        cwd: resolve(import.meta.dirname || __dirname, '..'),
        timeout: 600000, // 10 min timeout
        env: {
          ...process.env,
          VERBOSE: 'true',
        },
      }
    );

    log('PHASE-3', '✓ Oracle complete — predictions verified, bandit arms updated');
  } catch (err: any) {
    const errMsg = `Oracle job failed: ${err.message}`;
    errors.push(errMsg);
    logError('PHASE-3', errMsg);
  }

  return {
    phase: 'Oracle (RL)',
    success: errors.length === 0,
    orgsProcessed: 1, // Runs all orgs internally
    durationMs: Date.now() - start,
    details: 'Autonomous prediction verification + UCB1 bandit arm updates',
    errors,
  };
}

// ============================================================================
// PHASE 4: Full Consolidation Pipeline (brain-pipeline.runFullCycle per org)
// ============================================================================

async function phase4FullPipeline(orgs: OrgInfo[]): Promise<PhaseResult> {
  const start = Date.now();
  const errors: string[] = [];
  let processed = 0;

  for (const org of orgs) {
    log('PHASE-4', `Running full brain pipeline (L3-L15) for ${org.name}...`);

    if (DRY_RUN) {
      log('PHASE-4', `  [DRY RUN] Would run: run-full-consolidation.ts for ${org.name}`);
      processed++;
      continue;
    }

    try {
      execSync(
        `NODE_OPTIONS="--max-old-space-size=4096" npx tsx scripts/run-full-consolidation.ts`,
        {
          stdio: 'inherit',
          cwd: resolve(import.meta.dirname || __dirname, '..'),
          timeout: 3600000, // 1 hour per org
          env: {
            ...process.env,
            ORGANIZATION_ID: org.id,
            VERBOSE: VERBOSE ? 'true' : 'false',
          },
        }
      );

      log('PHASE-4', `  ✓ Full pipeline complete for ${org.name}`);
      processed++;
    } catch (err: any) {
      const errMsg = `Full pipeline failed for ${org.name}: ${err.message}`;
      errors.push(errMsg);
      logError('PHASE-4', errMsg);
      // Continue with next org — don't let one failure stop everything
    }
  }

  return {
    phase: 'Full Brain Pipeline (L3-L15)',
    success: errors.length === 0,
    orgsProcessed: processed,
    durationMs: Date.now() - start,
    details: 'Cognitive stack L3-L15 per org',
    errors,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const overallStart = Date.now();

  divider('NEXUSBRAIN NIGHTLY — ALL AGENTS, ALL CUSTOMERS, ALL ORGS');
  log('INIT', `Started: ${new Date().toISOString()}`);
  log('INIT', `Verbose: ${VERBOSE}`);
  log('INIT', `Dry Run: ${DRY_RUN}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Discover all customers and orgs ──
  log('INIT', 'Discovering customers and organizations...');

  const { data: allOrgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, customer:customer_id(name)')
    .order('created_at', { ascending: true });

  if (orgError) {
    logError('INIT', `Failed to fetch organizations: ${orgError.message}`);
    process.exit(1);
  }

  const orgs: OrgInfo[] = (allOrgs || []).map((o: any) => ({
    id: o.id,
    name: o.name || o.id.substring(0, 8),
    customer_name: o.customer?.name || 'Unknown',
  }));

  // Separate core brain from org brains
  const coreBrain = orgs.find(o => o.id === CORE_BRAIN_ORG_ID);
  const orgBrains = orgs.filter(o => o.id !== CORE_BRAIN_ORG_ID);

  log('INIT', `Found ${orgs.length} organizations (${orgBrains.length} org brains + core brain)`);

  // Log per-customer breakdown
  const customerMap = new Map<string, OrgInfo[]>();
  for (const org of orgBrains) {
    const key = org.customer_name || 'Unknown';
    if (!customerMap.has(key)) customerMap.set(key, []);
    customerMap.get(key)!.push(org);
  }
  for (const [customer, customerOrgs] of customerMap) {
    log('INIT', `  Customer: ${customer} — ${customerOrgs.length} org(s): ${customerOrgs.map(o => o.name).join(', ')}`);
  }
  if (coreBrain) {
    log('INIT', `  Core Brain: ${coreBrain.name}`);
  }

  // ── Run all phases ──
  const results: PhaseResult[] = [];

  // Phase 1: Edge Function daily maintenance (verification, weights, decay, etc.)
  divider('PHASE 1: EDGE FUNCTION DAILY JOBS (ALL ORGS)');
  results.push(await phase1EdgeFunctionJobs(supabase, orgs));

  // Phase 2: Brain Consolidation (10-step sleep + cognitive stack)
  // This already handles all orgs internally via CONSOLIDATE_ALL_ORGS=true
  divider('PHASE 2: BRAIN CONSOLIDATION (ALL ORGS + CORE BRAIN)');
  results.push(await phase2Consolidation());

  // Phase 3: Oracle RL (prediction verification + bandit updates)
  // This already handles all orgs internally
  divider('PHASE 3: ORACLE — REINFORCEMENT LEARNING (ALL ORGS)');
  results.push(await phase3Oracle());

  // Phase 4: Full brain pipeline per org (cognitive stack L3-L15)
  // Run for each org individually so each gets its own LEAP states
  divider('PHASE 4: FULL BRAIN PIPELINE PER ORG (L3-L15)');
  const allOrgsForPipeline = [...orgBrains];
  if (coreBrain) allOrgsForPipeline.push(coreBrain); // Core brain last
  results.push(await phase4FullPipeline(allOrgsForPipeline));

  // ── Final Summary ──
  const totalDuration = Date.now() - overallStart;
  divider('NIGHTLY RUN COMPLETE');

  let allSuccess = true;
  const allErrors: string[] = [];

  for (const r of results) {
    const status = r.success ? '✓' : '✗';
    log('SUMMARY', `${status} ${r.phase}: ${r.orgsProcessed} orgs, ${(r.durationMs / 1000).toFixed(1)}s${r.details ? ` — ${r.details}` : ''}`);
    if (!r.success) {
      allSuccess = false;
      allErrors.push(...r.errors);
    }
  }

  log('SUMMARY', '');
  log('SUMMARY', `Total duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);
  log('SUMMARY', `Organizations: ${orgs.length}`);
  log('SUMMARY', `Customers: ${customerMap.size}`);
  log('SUMMARY', `Status: ${allSuccess ? 'ALL PASSED' : `${allErrors.length} ERROR(S)`}`);

  if (allErrors.length > 0) {
    log('ERRORS', `${allErrors.length} error(s):`);
    for (const e of allErrors) {
      log('ERRORS', `  ✗ ${e}`);
    }
  }

  // Log to DB for observability
  try {
    await supabase.from('scheduled_job_runs').insert({
      organization_id: CORE_BRAIN_ORG_ID,
      job_name: 'nightly-all-agents',
      job_type: 'nightly_all',
      started_at: new Date(overallStart).toISOString(),
      completed_at: new Date().toISOString(),
      status: allSuccess ? 'success' : 'partial',
      result: JSON.stringify({
        phases: results.map(r => ({
          phase: r.phase,
          success: r.success,
          orgsProcessed: r.orgsProcessed,
          durationMs: r.durationMs,
          errorCount: r.errors.length,
        })),
        totalOrgs: orgs.length,
        totalCustomers: customerMap.size,
      }),
      error_message: allErrors.length > 0 ? allErrors.join('; ').substring(0, 1000) : null,
      duration_ms: totalDuration,
    });
  } catch {
    // Non-critical
  }

  console.log('');
  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
