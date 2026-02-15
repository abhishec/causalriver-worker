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
  | 'verification'
  | 'weights'
  | 'decay'
  | 'threshold_optimization'
  | 'retention'
  | 'federation'
  | 'all_daily';

const JOB_DESCRIPTIONS: Record<JobType, string> = {
  consolidation: 'Full brain consolidation',
  verification: 'Process pending prediction verifications',
  weights: 'Update causal edge weights',
  decay: 'Apply evidence decay',
  threshold_optimization: 'Optimize signal thresholds',
  retention: 'Clean up stale data',
  federation: 'Promote knowledge to core brain',
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
