#!/usr/bin/env tsx
/**
 * Manual Job Trigger Test
 *
 * Tests that we can manually trigger scheduled jobs via the Edge Function
 * and that they execute successfully, populating scheduled_job_runs.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function triggerJob(jobType: string, orgId: string) {
  console.log(`\n🚀 Triggering ${jobType} job for org ${orgId}...`);

  const startTime = Date.now();

  try {
    const { data, error } = await supabase.functions.invoke('scheduled-jobs', {
      body: {
        job_type: jobType,
        organization_id: orgId,
      },
    });

    const duration = Date.now() - startTime;

    if (error) {
      console.error(`❌ Error invoking ${jobType}:`, error);
      return { success: false, error };
    }

    console.log(`✅ ${jobType} completed in ${duration}ms`);
    console.log('Response:', JSON.stringify(data, null, 2));

    return { success: true, data, duration };
  } catch (err) {
    console.error(`❌ Exception during ${jobType}:`, err);
    return { success: false, error: err };
  }
}

async function checkJobRuns() {
  console.log('\n📊 Checking scheduled_job_runs table...');

  const { data: runs, error, count } = await supabase
    .from('scheduled_job_runs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('❌ Error fetching job runs:', error);
    return;
  }

  console.log(`Found ${count} job runs in database`);

  if (runs && runs.length > 0) {
    console.log('\nRecent runs:');
    for (const run of runs) {
      const status = run.status === 'success' ? '✅' : run.status === 'error' ? '❌' : '⏳';
      console.log(
        `${status} ${run.job_type} (${run.job_name}) - ${run.status} - ${run.started_at}`
      );
      if (run.error_message) {
        console.log(`   Error: ${run.error_message}`);
      }
    }
  } else {
    console.log('⚠️  No job runs found yet');
  }
}

async function main() {
  console.log('🧪 NexusBrain Manual Job Trigger Test');
  console.log('═'.repeat(80));

  const coreOrgId = '00000000-0000-4000-a000-000000000001';

  // Test different job types
  const jobTypes = ['verification', 'decay', 'threshold_optimization'];

  console.log('\n📋 Testing job types:', jobTypes.join(', '));

  for (const jobType of jobTypes) {
    await triggerJob(jobType, coreOrgId);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s between jobs
  }

  // Check results
  await checkJobRuns();

  console.log('\n═'.repeat(80));
  console.log('✅ Manual job trigger test complete\n');
}

main();
