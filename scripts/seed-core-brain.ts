/**
 * Seed Core Brain — Populate the universal knowledge base
 *
 * Loads all training packs (built-in library + static modules) into
 * the Core Brain organization (CORE_BRAIN_ORG_ID). This data becomes
 * the baseline intelligence that all organizations inherit via
 * query-time federation in nexus-query.
 *
 * Idempotent: Uses upsert with conflict resolution, safe to re-run.
 *
 * Usage:
 *   # Full seed (populates core brain)
 *   pnpm exec tsx scripts/seed-core-brain.ts
 *
 *   # Verify existing core brain data (read-only)
 *   pnpm exec tsx scripts/seed-core-brain.ts --verify
 *
 *   # Dry run (validate packs without writing)
 *   pnpm exec tsx scripts/seed-core-brain.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env from project root
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

// ── NexusBrain Imports ──
import { createBrainTrainer } from '../packages/memory-stack/src/learning/brain-trainer';
import { getAllTrainingPacks } from '../packages/memory-stack/src/learning/training-library';
import type { TrainingPack } from '../packages/memory-stack/src/learning/brain-trainer';

// ── Static Training Pack Modules ──
import { MACRO_ECONOMIC_PACKS } from './training-data/macro-economic-packs';
import { TECH_INDUSTRY_PACKS } from './training-data/tech-industry-packs';
import { BUSINESS_CASE_STUDY_PACKS } from './training-data/business-case-study-packs';
import { SALES_AND_REVENUE_PACKS } from './training-data/sales-and-revenue-packs';
import { PEOPLE_AND_CULTURE_PACKS } from './training-data/people-and-culture-packs';
import { STRATEGY_AND_SCALING_PACKS } from './training-data/strategy-and-scaling-packs';
import { INDUSTRY_VERTICAL_PACKS } from './training-data/industry-vertical-packs';
import { OPERATIONS_DEEP_DIVE_PACKS } from './training-data/operations-deep-dive-packs';
import { ADVANCED_CAUSAL_PACKS } from './training-data/advanced-causal-packs';
import { VC_METRICS_PACKS } from './training-data/vc-metrics-packs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const isVerify = process.argv.includes('--verify');
  const isDryRun = process.argv.includes('--dry-run');

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          NexusBrain Core Brain Seed                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Mode: ${isVerify ? 'VERIFY (read-only)' : isDryRun ? 'DRY RUN (validate only)' : 'SEED (write)'}`);
  console.log(`  Core Brain Org ID: ${CORE_BRAIN_ORG_ID}`);
  console.log();

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Verify Mode ──
  if (isVerify) {
    await verifyCoreBrain(supabase);
    return;
  }

  // ── Collect all training packs ──
  const libraryPacks = getAllTrainingPacks();
  const staticPacks: TrainingPack[] = [
    ...MACRO_ECONOMIC_PACKS,
    ...TECH_INDUSTRY_PACKS,
    ...BUSINESS_CASE_STUDY_PACKS,
    ...SALES_AND_REVENUE_PACKS,
    ...PEOPLE_AND_CULTURE_PACKS,
    ...STRATEGY_AND_SCALING_PACKS,
    ...INDUSTRY_VERTICAL_PACKS,
    ...OPERATIONS_DEEP_DIVE_PACKS,
    ...ADVANCED_CAUSAL_PACKS,
    ...VC_METRICS_PACKS,
  ];

  // Deduplicate by pack ID (library packs take priority)
  const seenIds = new Set<string>();
  const allPacks: TrainingPack[] = [];
  for (const pack of [...libraryPacks, ...staticPacks]) {
    if (!seenIds.has(pack.id)) {
      seenIds.add(pack.id);
      allPacks.push(pack);
    }
  }

  console.log(`  Training packs: ${allPacks.length} total`);
  console.log(`    - Library: ${libraryPacks.length}`);
  console.log(`    - Static modules: ${staticPacks.length}`);
  console.log(`    - After dedup: ${allPacks.length}`);
  console.log();

  // ── Create trainer ──
  const trainer = createBrainTrainer();

  // ── Dry Run: validate only ──
  if (isDryRun) {
    console.log('── Dry Run: Validating packs ──');
    let valid = 0;
    let invalid = 0;
    for (const pack of allPacks) {
      const result = trainer.validatePack(pack);
      if (result.valid) {
        valid++;
      } else {
        invalid++;
        console.log(`  INVALID: ${pack.id} — ${result.errors.join(', ')}`);
      }
      if (result.warnings.length > 0) {
        console.log(`  WARN: ${pack.id} — ${result.warnings.join(', ')}`);
      }
    }
    console.log();
    console.log(`  Valid: ${valid}, Invalid: ${invalid}`);
    return;
  }

  // ── Full Seed: Train all packs into core brain ──
  console.log('── Seeding Core Brain ──');
  let totalCausal = 0;
  let totalRules = 0;
  let totalCascades = 0;
  let totalPatterns = 0;
  let totalOutcomes = 0;
  let successes = 0;
  let failures = 0;

  for (const pack of allPacks) {
    try {
      const result = await trainer.train(supabase, CORE_BRAIN_ORG_ID, pack);
      if (result.success) {
        successes++;
        totalCausal += result.causalEdges;
        totalRules += result.rules;
        totalCascades += result.cascades;
        totalPatterns += result.patterns;
        totalOutcomes += result.outcomes;
        console.log(`  ✓ ${pack.id}: ${result.causalEdges} edges, ${result.rules} rules, ${result.cascades} cascades`);
      } else {
        failures++;
        console.log(`  ✗ ${pack.id}: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      failures++;
      console.log(`  ✗ ${pack.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log();
  console.log('── Seed Summary ──');
  console.log(`  Packs: ${successes} succeeded, ${failures} failed`);
  console.log(`  Causal relationships: ${totalCausal}`);
  console.log(`  Rules/memories: ${totalRules}`);
  console.log(`  Cascade rules: ${totalCascades}`);
  console.log(`  Patterns: ${totalPatterns}`);
  console.log(`  Outcomes: ${totalOutcomes}`);
  console.log();

  // ── Verify after seeding ──
  await verifyCoreBrain(supabase);
}

async function verifyCoreBrain(supabase: ReturnType<typeof createClient>) {
  console.log('── Core Brain Verification ──');

  const tables = [
    { name: 'causal_relationships_statistical', label: 'Causal Relationships' },
    { name: 'ai_memory', label: 'Memories' },
    { name: 'org_cascade_rules', label: 'Cascade Rules' },
    { name: 'prediction_records', label: 'Prediction Records' },
    { name: 'brain_grammar_rules', label: 'Grammar Rules' },
  ];

  let totalRows = 0;
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table.name)
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', CORE_BRAIN_ORG_ID);

    const c = count ?? 0;
    totalRows += c;
    const status = error ? `ERROR: ${error.message}` : c > 0 ? `${c} rows` : '0 rows (EMPTY)';
    console.log(`  ${table.label}: ${status}`);
  }

  console.log();
  if (totalRows > 0) {
    console.log(`  Core brain has ${totalRows} total data points.`);
    console.log('  Federation is ACTIVE — all org queries will inherit this knowledge.');
  } else {
    console.log('  Core brain is EMPTY — run without --verify to seed it.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
