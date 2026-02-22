#!/usr/bin/env tsx
/**
 * Run Oracle Job — Gap 4: Autonomous Outcome Oracle
 *
 * Runs createOutcomeOracle.processBatch() across all orgs (or a single org),
 * verifying pending predictions against recent connector signals and rewarding
 * the UCB1 bandit arms (Gap 1) that made correct predictions.
 *
 * Called by:
 *   pnpm run job:oracle
 *   tsx scripts/run-scheduled-job.ts oracle [organizationId?]
 *
 * Environment:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ORGANIZATION_ID (optional — runs ALL orgs if unset)
 *   VERBOSE (optional — enables detailed logging)
 *   LOOKBACK_HOURS (optional — how far back to fetch signals, default: 48)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  createOutcomeOracle,
  createCausalMethodBandit,
} from '../packages/memory-stack/src/index';

// Load environment variables from .env (no dotenv dependency)
function loadEnvFile(): void {
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
    // .env file not found — rely on environment variables
  }
}
loadEnvFile();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_ORG = process.env.ORGANIZATION_ID || null;
const VERBOSE = process.env.VERBOSE === 'true';
const LOOKBACK_HOURS = parseInt(process.env.LOOKBACK_HOURS || '48', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

function log(msg: string) {
  if (VERBOSE) console.log(msg);
}

async function processOracleForOrg(
  supabase: ReturnType<typeof createSupabaseClient>,
  orgId: string
): Promise<{
  orgId: string;
  signalsProcessed: number;
  predictionsVerified: number;
  predictionsExpired: number;
  predictionsPending: number;
  banditRewardsGiven: number;
}> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // Fetch recent signals across all domains
  const { data: signals, error: signalError } = await supabase
    .from('cross_domain_signals')
    .select(
      'source_domain, signal_type, signal_value, signal_timestamp, organization_id, entity_type, entity_id'
    )
    .eq('organization_id', orgId)
    .gte('signal_timestamp', since)
    .order('signal_timestamp', { ascending: false })
    .limit(2000);

  if (signalError) {
    console.warn(`  ⚠️  Signal fetch error for org ${orgId}: ${signalError.message}`);
    return { orgId, signalsProcessed: 0, predictionsVerified: 0, predictionsExpired: 0, predictionsPending: 0, banditRewardsGiven: 0 };
  }

  if (!signals || signals.length === 0) {
    log(`  📭 No signals found for org ${orgId} (last ${LOOKBACK_HOURS}h)`);
    return { orgId, signalsProcessed: 0, predictionsVerified: 0, predictionsExpired: 0, predictionsPending: 0, banditRewardsGiven: 0 };
  }

  // Create bandit + oracle, loading prior bandit state from DB so the UCB1 arms
  // retain learned preferences across nightly runs (without this, the brain forgets
  // which causal discovery method works best and explores uniformly every night).
  const bandit = createCausalMethodBandit({ supabase, organizationId: orgId });
  const { loaded: banditArmsLoaded } = await bandit.loadState();
  if (banditArmsLoaded > 0) {
    log(`  Bandit: loaded ${banditArmsLoaded} arm states from prior runs`);
  }
  const oracle = createOutcomeOracle({ supabase, bandit, organizationId: orgId });

  // Load pending predictions from DB
  await oracle.loadFromSupabase(orgId);
  const pendingCount = oracle.getPendingPredictions().length;

  if (pendingCount === 0) {
    log(`  📭 No pending predictions for org ${orgId}`);
    return { orgId, signalsProcessed: signals.length, predictionsVerified: 0, predictionsExpired: 0, predictionsPending: 0, banditRewardsGiven: 0 };
  }

  log(`  🔮 Processing ${pendingCount} predictions against ${signals.length} signals...`);

  // Run oracle
  const result = await oracle.processBatch(signals);

  // Persist bandit state
  await bandit.persistState().catch((err: any) => {
    log(`  ⚠️  Bandit persist warning: ${err.message}`);
  });

  // Prune completed predictions
  oracle.pruneCompleted();

  log(`  Verified: ${result.predictionsVerified}, Expired: ${result.predictionsExpired}, Pending: ${result.predictionsPending}, Bandit rewards: ${result.banditRewardsGiven}`);

  return {
    orgId,
    signalsProcessed: signals.length,
    predictionsVerified: result.predictionsVerified,
    predictionsExpired: result.predictionsExpired,
    predictionsPending: result.predictionsPending,
    banditRewardsGiven: result.banditRewardsGiven,
  };
}

async function main() {
  console.log('🔮 NexusBrain Outcome Oracle Job (Gap 4)\n');
  console.log(`⏰ Started: ${new Date().toISOString()}`);
  console.log(`📊 Lookback: ${LOOKBACK_HOURS} hours`);
  console.log(`🏢 Organization: ${TARGET_ORG || 'ALL'}\n`);

  const startTime = Date.now();
  const supabase = createSupabaseClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // Get orgs to process
  let orgs: { id: string; name: string }[];

  if (TARGET_ORG) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', TARGET_ORG)
      .single();
    orgs = org ? [org] : [];
  } else {
    const { data: allOrgs } = await supabase
      .from('organizations')
      .select('id, name')
      .order('created_at', { ascending: false });
    orgs = allOrgs || [];
  }

  if (orgs.length === 0) {
    console.log('⚠️  No organizations found.');
    process.exit(0);
  }

  console.log(`📋 Processing ${orgs.length} organization(s)...\n`);

  let totalVerified = 0;
  let totalExpired = 0;
  let totalSignals = 0;
  let totalBanditRewards = 0;
  let orgsProcessed = 0;

  for (const org of orgs) {
    console.log(`[ORACLE] ${org.name} (${org.id})`);
    try {
      const result = await processOracleForOrg(supabase, org.id);
      totalVerified += result.predictionsVerified;
      totalExpired += result.predictionsExpired;
      totalSignals += result.signalsProcessed;
      totalBanditRewards += result.banditRewardsGiven;
      orgsProcessed++;

      if (result.predictionsVerified > 0 || result.predictionsExpired > 0) {
        console.log(
          `   ${result.predictionsVerified} verified | ` +
          `${result.predictionsExpired} expired | ` +
          `${result.predictionsPending} pending | ` +
          `${result.banditRewardsGiven} bandit rewards`
        );
      } else {
        console.log(`   No predictions due for verification`);
      }
    } catch (err: any) {
      console.error(`   ERROR: ${err.message}`);
    }
  }

  const duration = Date.now() - startTime;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Oracle job complete in ${(duration / 1000).toFixed(1)}s`);
  console.log(`  Organizations processed: ${orgsProcessed}`);
  console.log(`  Total signals processed:  ${totalSignals}`);
  console.log(`  Predictions verified:     ${totalVerified}`);
  console.log(`  Predictions expired:      ${totalExpired}`);
  console.log(`  Bandit rewards given:     ${totalBanditRewards}`);
}

main().catch((err) => {
  console.error('❌ Oracle job failed:', err.message || err);
  process.exit(1);
});
