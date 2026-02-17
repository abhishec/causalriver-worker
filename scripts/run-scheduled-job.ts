#!/usr/bin/env tsx
/**
 * Run Scheduled Job - Manual Trigger Script
 *
 * Calls the Supabase Edge Function to trigger scheduled jobs manually.
 * This replaces the old approach of importing @nexus-ai/memory-stack.
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
loadEnv({ path: resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

type JobType =
  | 'consolidation'
  | 'full_consolidation'
  | 'verification'
  | 'weights'
  | 'decay'
  | 'threshold_optimization'
  | 'retention'
  | 'federation'
  | 'oracle'
  | 'all_daily';

const JOB_DESCRIPTIONS: Record<JobType, string> = {
  consolidation: 'Light brain consolidation (Edge Function — maintenance + health snapshot)',
  full_consolidation: 'Full brain pipeline (Node.js — consolidation + cognitive stack L3-L15)',
  verification: 'Process pending prediction verifications',
  weights: 'Update causal edge weights',
  decay: 'Apply evidence decay',
  threshold_optimization: 'Optimize signal thresholds',
  retention: 'Clean up stale data',
  federation: 'Promote knowledge to core brain',
  oracle: 'Gap 4: Autonomous Oracle — verify pending predictions across all orgs, reward/penalise UCB1 bandit arms',
  all_daily: 'Run all daily jobs',
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Missing job type argument');
    console.error('\nUsage: pnpm run job:verification');
    console.error('   or: tsx scripts/run-scheduled-job.ts verification');
    process.exit(1);
  }

  const jobType = args[0] as JobType;
  const organizationId = args[1] || null;

  if (!JOB_DESCRIPTIONS[jobType]) {
    console.error(`❌ Unknown job type: ${jobType}`);
    console.error('\nAvailable jobs:');
    Object.entries(JOB_DESCRIPTIONS).forEach(([type, desc]) => {
      console.error(`  - ${type}: ${desc}`);
    });
    process.exit(1);
  }

  console.log(`🧠 NexusBrain Scheduled Job Runner\n`);
  console.log(`📋 Job Type: ${jobType}`);
  console.log(`📝 Description: ${JOB_DESCRIPTIONS[jobType]}`);
  console.log(`🏢 Organization: ${organizationId || 'ALL'}`);
  console.log(`⏰ Started: ${new Date().toISOString()}\n`);

  try {
    const startTime = Date.now();

    // ── Oracle: runs locally via Node.js using the memory-stack directly ─────
    // Calls createOutcomeOracle.processBatch() for all orgs, then persists
    // bandit arm updates. Equivalent to POST /api/oracle/process for all orgs.
    if (jobType === 'oracle') {
      console.log(`🔮 Running Outcome Oracle (Gap 4) across all orgs...\n`);
      const { execSync } = await import('child_process');
      const envVars = [
        organizationId ? `ORGANIZATION_ID=${organizationId}` : '',
        'VERBOSE=true',
      ].filter(Boolean).join(' ');

      try {
        execSync(
          `${envVars} tsx scripts/run-oracle-job.ts`,
          { stdio: 'inherit', cwd: resolve(__dirname, '..'), timeout: 600000 } // 10min timeout
        );
        const duration = Date.now() - startTime;
        console.log(`\n✅ Oracle job completed in ${(duration / 1000).toFixed(1)}s`);
        console.log('🔮 Pending predictions verified, bandit arms updated');
      } catch (execError: any) {
        console.error('❌ Oracle job failed:', execError.message || execError);
        process.exit(1);
      }
      return;
    }

    // ── Full Consolidation: runs locally via Node.js (NOT Edge Function) ──
    // This is the ONLY path to populate cognitive stack layers L3-L15.
    // The Edge Function runs Deno and can't import Node.js brain-pipeline modules.
    if (jobType === 'full_consolidation') {
      console.log(`🧬 Running full brain pipeline locally (Node.js)...\n`);
      const { execSync } = await import('child_process');
      const envVars = [
        organizationId ? `ORGANIZATION_ID=${organizationId}` : '',
        'VERBOSE=true',
      ].filter(Boolean).join(' ');

      try {
        execSync(
          `${envVars} tsx scripts/run-full-consolidation.ts`,
          { stdio: 'inherit', cwd: resolve(__dirname, '..'), timeout: 7200000 } // 2hr timeout
        );
        const duration = Date.now() - startTime;
        console.log(`\n✅ Full consolidation completed in ${(duration / 1000).toFixed(1)}s`);
        console.log('🧬 Cognitive stack L3-L15 populated');
      } catch (execError: any) {
        console.error('❌ Full consolidation failed:', execError.message || execError);
        process.exit(1);
      }
      return;
    }

    // Call Edge Function
    const url = `${SUPABASE_URL}/functions/v1/scheduled-jobs`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        job_type: jobType,
        organization_id: organizationId,
      }),
    });

    const result = await response.json();
    const duration = Date.now() - startTime;

    if (!response.ok) {
      console.error('❌ Job failed:');
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    console.log('✅ Job completed successfully!\n');
    console.log('📊 Results:');
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n⏱️  Duration: ${duration}ms`);
  } catch (error: any) {
    console.error('❌ Error running job:');
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
