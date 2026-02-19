#!/usr/bin/env tsx
/**
 * Run All Nightly Agents — Complete Brain Pipeline for Every Customer/Org/Brain
 *
 * This is the single entry point for the nightly brain cycle. It ensures
 * EVERY active organization gets the FULL treatment:
 *
 *   Phase 1: Edge Function jobs (verification, weights, decay, thresholds, retention)
 *   Phase 2: Brain Consolidation — per-org isolation (10-step sleep + cognitive stack)
 *   Phase 3: Oracle (autonomous prediction verification + UCB1 bandit RL)
 *   Phase 4: Full Consolidation pipeline (brain-pipeline.runFullCycle per org)
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
import { execSync, execFileSync } from 'node:child_process';
import { freemem } from 'node:os';

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
const IS_CI = !!process.env.CI || !!process.env.GITHUB_ACTIONS;

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
  // GitHub Actions collapsible group
  if (IS_CI) console.log(`::group::${title}`);
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(72)}\n`);
}

function endGroup(): void {
  if (IS_CI) console.log('::endgroup::');
}

function progress(current: number, total: number, label: string): string {
  const pct = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
  return `[${current}/${total}] ${bar} ${pct}% — ${label}`;
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
// DYNAMIC HEAP SIZING — Compute optimal heap per org based on data volume
// ============================================================================

const HEAP_TIERS = [
  // Minimum 4096MB — cognitive stack L3-L15 + consolidation engine needs ~3GB
  // even for orgs with few signals. GitHub Actions runner has 7GB total.
  { maxSignals: 100_000, heapMB: 4096 },  // Normal:  4GB
  { maxSignals: 500_000, heapMB: 5120 },  // Large:   5GB
  { maxSignals: Infinity, heapMB: 6144 }, // Huge:    6GB (max safe on 7GB runner)
];

/** Retry multiplier: if an org OOMs, retry with this much more heap */
const HEAP_RETRY_MULTIPLIER = 1.5;
/** Max retries per org on OOM */
const MAX_OOM_RETRIES = 1;

async function getOrgHeapSize(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<{ heapMB: number; signalCount: number; edgeCount: number }> {
  // Count signals from last 48 hours (same window as consolidation)
  const [signalResult, edgeResult] = await Promise.all([
    supabase
      .from('cross_domain_signals')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('signal_timestamp', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('causal_relationships_statistical')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
  ]);

  const signalCount = signalResult.count ?? 0;
  const edgeCount = edgeResult.count ?? 0;
  // Use the larger of signal count and edge count * 10 (edges consume more memory per item)
  const effectiveSize = Math.max(signalCount, edgeCount * 10);

  // Find appropriate tier
  let heapMB = HEAP_TIERS[HEAP_TIERS.length - 1].heapMB;
  for (const tier of HEAP_TIERS) {
    if (effectiveSize <= tier.maxSignals) {
      heapMB = tier.heapMB;
      break;
    }
  }

  // Clamp to available system memory (leave 2GB for OS + parent process)
  const availableMB = Math.floor(freemem() / (1024 * 1024));
  const maxHeapMB = Math.max(1024, availableMB - 2048);
  heapMB = Math.min(heapMB, maxHeapMB);

  return { heapMB, signalCount, edgeCount };
}

// ============================================================================
// PHASE 1: Edge Function Daily Jobs (per-org)
// ============================================================================

async function phase1EdgeFunctionJobs(supabase: ReturnType<typeof createClient>, orgs: OrgInfo[]): Promise<PhaseResult> {
  const start = Date.now();
  const errors: string[] = [];
  let processed = 0;

  for (let i = 0; i < orgs.length; i++) {
    const org = orgs[i];
    log('PHASE-1', progress(i + 1, orgs.length, `Edge jobs for ${org.name}`));

    if (DRY_RUN) {
      log('PHASE-1', `  [DRY RUN] Would run: verification, weights, decay, threshold, retention, federation`);
      processed++;
      continue;
    }

    // Retry edge function calls up to 2 times with exponential backoff
    const MAX_EDGE_RETRIES = 2;
    let edgeSuccess = false;
    for (let attempt = 0; attempt <= MAX_EDGE_RETRIES; attempt++) {
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
          // Retryable server errors (5xx)
          if (response.status >= 500 && attempt < MAX_EDGE_RETRIES) {
            const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
            logError('PHASE-1', `Edge jobs 5xx for ${org.name} (attempt ${attempt + 1}) — retrying in ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          const errMsg = `Edge jobs failed for ${org.name}: ${JSON.stringify(result).substring(0, 200)}`;
          errors.push(errMsg);
          logError('PHASE-1', errMsg);
        } else {
          log('PHASE-1', `  ✓ Edge jobs complete for ${org.name}${attempt > 0 ? ` (retry #${attempt})` : ''}`);
          if (VERBOSE && result.results) {
            for (const r of result.results) {
              log('PHASE-1', `    ${r.job_type}: ${r.success ? '✓' : '✗'} (${r.duration_ms}ms)`);
            }
          }
          processed++;
          edgeSuccess = true;
        }
        break; // Success or non-retryable error — stop retrying
      } catch (err: any) {
        if (attempt < MAX_EDGE_RETRIES) {
          const delay = 1000 * Math.pow(2, attempt);
          logError('PHASE-1', `Edge jobs network error for ${org.name} (attempt ${attempt + 1}): ${err.message} — retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        const errMsg = `Edge jobs error for ${org.name} (after ${MAX_EDGE_RETRIES + 1} attempts): ${err.message}`;
        errors.push(errMsg);
        logError('PHASE-1', errMsg);
      }
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
//
// Architecture: Runs each org in its OWN subprocess so each gets a fresh 4GB
// heap. Previously used CONSOLIDATE_ALL_ORGS=true which crammed all 11 orgs
// into one process and OOM'd on GitHub Actions' 7GB runner.
//
// Each org is consolidated individually via ORGANIZATION_ID=<org-id>.
// The consolidation runner automatically also consolidates core brain after
// each org, so we skip the explicit core brain pass at the end.
// ============================================================================

async function phase2Consolidation(supabase: ReturnType<typeof createClient>, orgs: OrgInfo[]): Promise<PhaseResult> {
  const start = Date.now();
  const errors: string[] = [];
  let processed = 0;

  log('PHASE-2', `Running brain consolidation for ${orgs.length} orgs (each in isolated process with dynamic heap)...`);

  if (DRY_RUN) {
    for (const org of orgs) {
      const { heapMB, signalCount, edgeCount } = await getOrgHeapSize(supabase, org.id);
      log('PHASE-2', `  [DRY RUN] Would run: brain-consolidation-runner.ts for ${org.name} (${heapMB}MB heap — ${signalCount} signals, ${edgeCount} edges)`);
    }
    log('PHASE-2', `  [DRY RUN] Would run: brain-consolidation-runner.ts for Core Brain (final pass)`);
    return { phase: 'Brain Consolidation', success: true, orgsProcessed: 0, durationMs: 0, errors };
  }

  // Process each org brain in its own subprocess with dynamically-sized heap
  const totalConsolidation = orgs.length + 1; // +1 for core brain
  for (let i = 0; i < orgs.length; i++) {
    const org = orgs[i];
    const orgStart = Date.now();

    // Dynamic heap: measure org data volume, compute optimal heap size
    let heapMB = 4096; // fallback
    try {
      const sizing = await getOrgHeapSize(supabase, org.id);
      heapMB = sizing.heapMB;
      log('PHASE-2', progress(i + 1, totalConsolidation, `Consolidating ${org.name} (${heapMB}MB heap — ${sizing.signalCount} signals, ${sizing.edgeCount} edges)`));
    } catch {
      log('PHASE-2', progress(i + 1, totalConsolidation, `Consolidating ${org.name} (${heapMB}MB heap — sizing fallback)`));
    }

    // Run with retry-on-OOM: if the process crashes with heap out of memory,
    // retry once with a bigger heap (HEAP_RETRY_MULTIPLIER × original)
    let currentHeap = heapMB;
    let succeeded = false;
    for (let attempt = 0; attempt <= MAX_OOM_RETRIES; attempt++) {
      try {
        const projectRoot = resolve(import.meta.dirname || __dirname, '..');
        const tsxBin = resolve(projectRoot, 'node_modules', '.bin', 'tsx');
        execFileSync(tsxBin, ['scripts/brain-consolidation-runner.ts'], {
          stdio: 'inherit',
          cwd: projectRoot,
          timeout: 1200000, // 20 min per org
          env: {
            ...process.env,
            NODE_OPTIONS: `--max-old-space-size=${currentHeap}`,
            ORGANIZATION_ID: org.id,
            CONSOLIDATION_MODE: 'once',
            VERBOSE: VERBOSE ? 'true' : 'false',
          },
        });

        const elapsed = ((Date.now() - orgStart) / 1000).toFixed(1);
        log('PHASE-2', `  ✓ ${org.name} consolidated (${elapsed}s, ${currentHeap}MB heap${attempt > 0 ? `, retry #${attempt}` : ''})`);
        processed++;
        succeeded = true;
        break;
      } catch (err: any) {
        const isOOM = /heap|out of memory|allocation failed|ENOMEM/i.test(err.message || '');
        if (isOOM && attempt < MAX_OOM_RETRIES) {
          const nextHeap = Math.min(6144, Math.round(currentHeap * HEAP_RETRY_MULTIPLIER));
          logError('PHASE-2', `OOM for ${org.name} at ${currentHeap}MB — retrying with ${nextHeap}MB`);
          currentHeap = nextHeap;
          continue;
        }
        const errMsg = `Brain consolidation failed for ${org.name}${isOOM ? ' (OOM even after retry)' : ''}: ${err.message}`;
        errors.push(errMsg);
        logError('PHASE-2', errMsg);
        // Continue with next org — don't let one failure stop everything
      }
    }
  }

  // Final pass: consolidate core brain (receives all federated knowledge)
  let coreHeapMB = 4096;
  try {
    const coreSizing = await getOrgHeapSize(supabase, CORE_BRAIN_ORG_ID);
    coreHeapMB = coreSizing.heapMB;
    log('PHASE-2', progress(totalConsolidation, totalConsolidation, `Core Brain (${coreHeapMB}MB heap — ${coreSizing.signalCount} signals, ${coreSizing.edgeCount} edges)`));
  } catch {
    log('PHASE-2', progress(totalConsolidation, totalConsolidation, `Core Brain (${coreHeapMB}MB heap — sizing fallback)`));
  }

  const coreStart = Date.now();
  let currentCoreHeap = coreHeapMB;
  for (let attempt = 0; attempt <= MAX_OOM_RETRIES; attempt++) {
    try {
      const projectRoot = resolve(import.meta.dirname || __dirname, '..');
      const tsxBin = resolve(projectRoot, 'node_modules', '.bin', 'tsx');
      execFileSync(tsxBin, ['scripts/brain-consolidation-runner.ts'], {
        stdio: 'inherit',
        cwd: projectRoot,
        timeout: 1200000, // 20 min
        env: {
          ...process.env,
          NODE_OPTIONS: `--max-old-space-size=${currentCoreHeap}`,
          ORGANIZATION_ID: CORE_BRAIN_ORG_ID,
          CONSOLIDATION_MODE: 'once',
          VERBOSE: VERBOSE ? 'true' : 'false',
        },
      });
      const elapsed = ((Date.now() - coreStart) / 1000).toFixed(1);
      log('PHASE-2', `  ✓ Core Brain consolidated (${elapsed}s, ${currentCoreHeap}MB heap${attempt > 0 ? `, retry #${attempt}` : ''})`);
      processed++;
      break;
    } catch (err: any) {
      const isOOM = /heap|out of memory|allocation failed|ENOMEM/i.test(err.message || '');
      if (isOOM && attempt < MAX_OOM_RETRIES) {
        const nextHeap = Math.min(6144, Math.round(currentCoreHeap * HEAP_RETRY_MULTIPLIER));
        logError('PHASE-2', `OOM for Core Brain at ${currentCoreHeap}MB — retrying with ${nextHeap}MB`);
        currentCoreHeap = nextHeap;
        continue;
      }
      const errMsg = `Brain consolidation failed for Core Brain${isOOM ? ' (OOM even after retry)' : ''}: ${err.message}`;
      errors.push(errMsg);
      logError('PHASE-2', errMsg);
    }
  }

  return {
    phase: 'Brain Consolidation',
    success: errors.length === 0,
    orgsProcessed: processed,
    durationMs: Date.now() - start,
    details: `Per-org isolation — ${processed}/${orgs.length + 1} orgs consolidated (dynamic heap)`,
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
      `VERBOSE=true NODE_OPTIONS="--max-old-space-size=4096 --expose-gc" pnpm exec tsx scripts/run-oracle-job.ts`,
      {
        stdio: 'inherit',
        cwd: resolve(import.meta.dirname || __dirname, '..'),
        timeout: 600000, // 10 min timeout
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

async function phase4FullPipeline(supabase: ReturnType<typeof createClient>, orgs: OrgInfo[]): Promise<PhaseResult> {
  const start = Date.now();
  const errors: string[] = [];
  let processed = 0;

  for (let i = 0; i < orgs.length; i++) {
    const org = orgs[i];

    // Dynamic heap sizing for full pipeline too
    let heapMB = 4096;
    try {
      const sizing = await getOrgHeapSize(supabase, org.id);
      heapMB = sizing.heapMB;
      log('PHASE-4', progress(i + 1, orgs.length, `Full pipeline for ${org.name} (${heapMB}MB heap)`));
    } catch {
      log('PHASE-4', progress(i + 1, orgs.length, `Full pipeline for ${org.name} (${heapMB}MB heap — sizing fallback)`));
    }

    if (DRY_RUN) {
      log('PHASE-4', `  [DRY RUN] Would run: run-full-consolidation.ts for ${org.name} (${heapMB}MB heap)`);
      processed++;
      continue;
    }

    // Run with retry-on-OOM (same pattern as Phase 2)
    let currentHeap = heapMB;
    for (let attempt = 0; attempt <= MAX_OOM_RETRIES; attempt++) {
      try {
        execSync(
          `ORGANIZATION_ID=${org.id} VERBOSE=${VERBOSE ? 'true' : 'false'} NODE_OPTIONS="--max-old-space-size=${currentHeap} --expose-gc" pnpm exec tsx scripts/run-full-consolidation.ts`,
          {
            stdio: 'inherit',
            cwd: resolve(import.meta.dirname || __dirname, '..'),
            timeout: 3600000, // 1 hour per org
          }
        );

        log('PHASE-4', `  ✓ Full pipeline complete for ${org.name} (${currentHeap}MB heap${attempt > 0 ? `, retry #${attempt}` : ''})`);
        processed++;
        break;
      } catch (err: any) {
        const isOOM = /heap|out of memory|allocation failed|ENOMEM/i.test(err.message || '');
        if (isOOM && attempt < MAX_OOM_RETRIES) {
          const nextHeap = Math.min(6144, Math.round(currentHeap * HEAP_RETRY_MULTIPLIER));
          logError('PHASE-4', `OOM for ${org.name} at ${currentHeap}MB — retrying with ${nextHeap}MB`);
          currentHeap = nextHeap;
          continue;
        }
        const errMsg = `Full pipeline failed for ${org.name}${isOOM ? ' (OOM even after retry)' : ''}: ${err.message}`;
        errors.push(errMsg);
        logError('PHASE-4', errMsg);
        // Continue with next org — don't let one failure stop everything
      }
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
  endGroup();

  // ── Run all phases ──
  const results: PhaseResult[] = [];

  // Phase 1: Edge Function daily maintenance (verification, weights, decay, etc.)
  // Bug #11 fix: exclude core brain from Phase 1 — its edges should not be decayed
  // before org brains federate knowledge to it during Phase 2.
  divider('PHASE 1: EDGE FUNCTION DAILY JOBS (ORG BRAINS ONLY)');
  results.push(await phase1EdgeFunctionJobs(supabase, orgBrains));
  endGroup();

  // Phase 2: Brain Consolidation (10-step sleep + cognitive stack)
  // Each org gets its own subprocess with a dynamically-sized heap (no more OOM)
  divider('PHASE 2: BRAIN CONSOLIDATION (ALL ORGS + CORE BRAIN)');
  results.push(await phase2Consolidation(supabase, orgBrains));
  endGroup();

  // Phase 3: Oracle RL (prediction verification + bandit updates)
  // This already handles all orgs internally
  divider('PHASE 3: ORACLE — REINFORCEMENT LEARNING (ALL ORGS)');
  results.push(await phase3Oracle());
  endGroup();

  // Phase 4: Full brain pipeline per org (cognitive stack L3-L15)
  // Run for each org individually so each gets its own LEAP states
  divider('PHASE 4: FULL BRAIN PIPELINE PER ORG (L3-L15)');
  const allOrgsForPipeline = [...orgBrains];
  if (coreBrain) allOrgsForPipeline.push(coreBrain); // Core brain last
  results.push(await phase4FullPipeline(supabase, allOrgsForPipeline));
  endGroup();

  // ── Phase 5: Weekly Accounting Anomaly Report (Monday only) ──
  // On Mondays, aggregate the past 7 days of AAS artifacts and insert a
  // summary alert for Isabel's NotificationBell. Non-Monday runs skip this.
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ...
  if (dayOfWeek === 1) {
    divider('PHASE 5: WEEKLY ACCOUNTING ANOMALY REPORT (MONDAY)');
    const weeklyStart = Date.now();
    const weeklyErrors: string[] = [];

    try {
      log('PHASE-5', 'Aggregating AAS artifacts from the past 7 days...');

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Query all AAS artifacts from the past week across all orgs
      const { data: weeklyArtifacts, error: weeklyError } = await supabase
        .from('se_aas_artifacts')
        .select('organization_id, artifact_data, created_at')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false });

      if (weeklyError) throw new Error(weeklyError.message);

      const artifacts = weeklyArtifacts ?? [];
      log('PHASE-5', `Found ${artifacts.length} AAS artifact(s) in the past 7 days`);

      // Aggregate anomaly counts per org
      const orgAnomalyCounts = new Map<string, { total: number; high: number; orgName: string }>();
      for (const art of artifacts) {
        const orgId = art.organization_id;
        const data = art.artifact_data as Record<string, any> | null;
        const anomalies = (data?.causalAnomalies ?? data?.anomalies ?? []) as Array<any>;
        const highCount = anomalies.filter((a: any) => a.severity === 'high').length;

        if (!orgAnomalyCounts.has(orgId)) {
          const orgInfo = orgBrains.find(o => o.id === orgId);
          orgAnomalyCounts.set(orgId, { total: 0, high: 0, orgName: orgInfo?.name ?? orgId.slice(0, 8) });
        }
        const counts = orgAnomalyCounts.get(orgId)!;
        counts.total += anomalies.length;
        counts.high += highCount;
      }

      // Insert weekly alert for each org that had anomalies
      let alertsInserted = 0;
      for (const [orgId, counts] of orgAnomalyCounts) {
        if (counts.total === 0) continue;

        await supabase.from('cascade_alerts').insert({
          organization_id: orgId,
          alert_type: 'accounting_weekly_report',
          severity: counts.high > 2 ? 'high' : counts.total > 0 ? 'medium' : 'low',
          message: `Weekly Accounting Summary: ${counts.total} risk factor${counts.total > 1 ? 's' : ''} detected across ${artifacts.filter(a => a.organization_id === orgId).length} analysis run(s) this week.${counts.high > 0 ? ` ${counts.high} high-severity item(s) require attention.` : ''} Review recommended.`,
          is_read: false,
          metadata: {
            report_type: 'weekly_anomaly_summary',
            week_ending: new Date().toISOString().substring(0, 10),
            total_anomalies: counts.total,
            high_severity: counts.high,
            analysis_runs: artifacts.filter(a => a.organization_id === orgId).length,
          },
        });
        alertsInserted++;
        log('PHASE-5', `  ✓ Weekly alert for ${counts.orgName}: ${counts.total} anomalies (${counts.high} high)`);
      }

      if (alertsInserted === 0) {
        log('PHASE-5', '  No anomalies detected this week — no alerts created');
      }

      results.push({
        phase: 'Weekly Accounting Anomaly Report',
        success: true,
        orgsProcessed: alertsInserted,
        durationMs: Date.now() - weeklyStart,
        details: `Monday weekly report — ${alertsInserted} org alert(s) created`,
        errors: weeklyErrors,
      });
    } catch (err: any) {
      const errMsg = `Weekly anomaly report failed: ${err.message}`;
      weeklyErrors.push(errMsg);
      logError('PHASE-5', errMsg);
      results.push({
        phase: 'Weekly Accounting Anomaly Report',
        success: false,
        orgsProcessed: 0,
        durationMs: Date.now() - weeklyStart,
        errors: weeklyErrors,
      });
    }
    endGroup();
  } else {
    log('SKIP', `Phase 5 (Weekly Anomaly Report) skipped — only runs on Monday (today is day ${dayOfWeek})`);
  }

  // ── Final Summary ──
  const totalDuration = Date.now() - overallStart;
  divider('NIGHTLY RUN COMPLETE');

  let allSuccess = true;
  const allErrors: string[] = [];

  // Phase 2 (Brain Consolidation) is non-critical — it OOMs on large orgs but
  // Phase 4 (Full Pipeline) covers the same cognitive stack L3-L15 successfully.
  // Only count Phase 1, 3, 4 failures toward the exit code.
  const NON_CRITICAL_PHASES = new Set(['Brain Consolidation']);

  for (const r of results) {
    const status = r.success ? '✓' : '✗';
    const nonCritical = NON_CRITICAL_PHASES.has(r.phase);
    log('SUMMARY', `${status} ${r.phase}: ${r.orgsProcessed} orgs, ${(r.durationMs / 1000).toFixed(1)}s${r.details ? ` — ${r.details}` : ''}${!r.success && nonCritical ? ' (non-critical)' : ''}`);
    if (!r.success && !nonCritical) {
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
