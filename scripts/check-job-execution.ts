#!/usr/bin/env tsx
/**
 * Check Scheduled Job Execution Report
 *
 * This script queries the database to see what jobs ran last night
 * and provides a detailed report of execution status.
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
loadEnv({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://zmlqvuzoodcgmkgkivfw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('\nSet it with:');
  console.log('export SUPABASE_SERVICE_ROLE_KEY=your_key_here');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface JobRun {
  id: string;
  organization_id: string;
  job_name: string;
  job_type: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  result: any;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

async function checkJobExecution() {
  console.log('🔍 Checking Scheduled Job Execution Report\n');
  console.log('=' .repeat(80));

  // 1. Check if scheduled_job_runs table exists and has data
  console.log('\n📊 1. CHECKING JOB RUNS TABLE\n');

  const { data: jobRuns, error: jobRunsError } = await supabase
    .from('scheduled_job_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);

  if (jobRunsError) {
    console.log('⚠️  scheduled_job_runs table query error:', jobRunsError.message);
    console.log('   (This is expected if no jobs have run yet)');
  } else if (!jobRuns || jobRuns.length === 0) {
    console.log('📭 No job runs found in scheduled_job_runs table');
    console.log('   This means either:');
    console.log('   - Jobs haven\'t triggered yet (check schedule times)');
    console.log('   - pg_cron is not configured (see PRODUCTION-READINESS-REPORT.md)');
    console.log('   - Edge Function is not receiving cron triggers');
  } else {
    console.log(`✅ Found ${jobRuns.length} job run(s) in history\n`);

    // Group by date
    const runsByDate = new Map<string, JobRun[]>();
    jobRuns.forEach((run: JobRun) => {
      const date = new Date(run.started_at).toISOString().split('T')[0];
      if (!runsByDate.has(date)) {
        runsByDate.set(date, []);
      }
      runsByDate.get(date)!.push(run);
    });

    // Report by date (most recent first)
    for (const [date, runs] of Array.from(runsByDate.entries()).sort().reverse()) {
      console.log(`\n📅 ${date}`);
      console.log('─'.repeat(80));

      for (const run of runs) {
        const startTime = new Date(run.started_at).toLocaleTimeString();
        const duration = run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)}s` : 'N/A';
        const statusIcon = run.status === 'success' ? '✅' : run.status === 'failed' ? '❌' : '⏳';

        console.log(`\n${statusIcon} ${run.job_type.toUpperCase()} - ${startTime}`);
        console.log(`   Job Name: ${run.job_name}`);
        console.log(`   Status: ${run.status}`);
        console.log(`   Duration: ${duration}`);

        if (run.error_message) {
          console.log(`   ❌ Error: ${run.error_message}`);
        }

        if (run.result) {
          const result = run.result as any;
          if (result.summary) {
            console.log(`   📝 Summary: ${result.summary}`);
          }
          if (result.processed !== undefined) {
            console.log(`   📊 Processed: ${result.processed} items`);
          }
        }
      }
    }
  }

  // 2. Check pg_cron job schedule
  console.log('\n\n📅 2. CHECKING CRON JOB SCHEDULE\n');
  console.log('─'.repeat(80));

  const { data: cronJobs, error: cronError } = await supabase
    .rpc('get_cron_jobs')
    .select('*');

  if (cronError) {
    console.log('⚠️  Could not query pg_cron jobs:', cronError.message);
    console.log('\nTrying alternative query...\n');

    // Try direct SQL query
    const { data: cronJobsAlt, error: cronErrorAlt } = await supabase
      .from('cron.job')
      .select('*');

    if (cronErrorAlt) {
      console.log('❌ Cannot access pg_cron.job table');
      console.log('   This means pg_cron is likely not configured.');
      console.log('\n📖 Fix: See PRODUCTION-READINESS-REPORT.md Section 14');
      console.log('   You need to run the pg_cron configuration SQL commands.');
    } else {
      displayCronJobs(cronJobsAlt);
    }
  } else {
    displayCronJobs(cronJobs);
  }

  // 3. Check last 24 hours activity
  console.log('\n\n⏰ 3. LAST 24 HOURS ACTIVITY\n');
  console.log('─'.repeat(80));

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { data: recentRuns, error: recentError } = await supabase
    .from('scheduled_job_runs')
    .select('*')
    .gte('started_at', yesterday.toISOString())
    .order('started_at', { ascending: false });

  if (recentError) {
    console.log('⚠️  Could not query recent runs:', recentError.message);
  } else if (!recentRuns || recentRuns.length === 0) {
    console.log('📭 No jobs ran in the last 24 hours');
    console.log('\n🔧 Expected Jobs (if pg_cron is configured):');
    console.log('   - Hourly: verification (every hour at :00)');
    console.log('   - Daily:  retention (02:00 UTC)');
    console.log('   - Daily:  consolidation (04:00 UTC)');
    console.log('   - Daily:  weights (05:00 UTC)');
    console.log('   - Daily:  decay (06:00 UTC)');
    console.log('   - Daily:  federation (07:00 UTC)');
    console.log('   - Weekly: threshold (Sunday 03:00 UTC)');
  } else {
    console.log(`✅ Found ${recentRuns.length} job run(s) in last 24 hours\n`);

    const summary = {
      total: recentRuns.length,
      success: recentRuns.filter((r: JobRun) => r.status === 'success').length,
      failed: recentRuns.filter((r: JobRun) => r.status === 'failed').length,
      running: recentRuns.filter((r: JobRun) => r.status === 'running').length,
    };

    console.log(`   Total:   ${summary.total}`);
    console.log(`   ✅ Success: ${summary.success}`);
    console.log(`   ❌ Failed:  ${summary.failed}`);
    console.log(`   ⏳ Running: ${summary.running}`);

    // Job type breakdown
    const byType = new Map<string, number>();
    recentRuns.forEach((run: JobRun) => {
      byType.set(run.job_type, (byType.get(run.job_type) || 0) + 1);
    });

    console.log('\n   By Job Type:');
    for (const [type, count] of Array.from(byType.entries()).sort()) {
      console.log(`   - ${type}: ${count}`);
    }
  }

  // 4. Recommendations
  console.log('\n\n💡 4. RECOMMENDATIONS\n');
  console.log('─'.repeat(80));

  if (!jobRuns || jobRuns.length === 0) {
    console.log('\n⚠️  No job execution history found. Action required:\n');
    console.log('1️⃣  Configure pg_cron database settings');
    console.log('   → See: PRODUCTION-READINESS-REPORT.md Section 14');
    console.log('   → Run the SQL commands to enable cron.schedule access\n');

    console.log('2️⃣  Verify Edge Function deployment');
    console.log('   → Run: npx supabase functions list');
    console.log('   → Check: scheduled-jobs should be deployed\n');

    console.log('3️⃣  Test manual job trigger');
    console.log('   → Run: npm run job:verification');
    console.log('   → This should create entries in scheduled_job_runs table\n');
  } else {
    const recentCount = recentRuns?.length || 0;
    if (recentCount === 0) {
      console.log('\n⚠️  Jobs have run before but not in last 24 hours\n');
      console.log('   Possible causes:');
      console.log('   - Cron schedule might be paused');
      console.log('   - Database settings changed');
      console.log('   - Edge Function deployment issue\n');
      console.log('   Action: Run manual test → npm run job:verification');
    } else {
      console.log('\n✅ System is healthy and jobs are running!\n');
      console.log('   Continue monitoring with:');
      console.log('   → npm run check:jobs (run this script)');
      console.log('   → npx supabase functions logs scheduled-jobs\n');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Job Execution Report Complete\n');
}

function displayCronJobs(jobs: any[]) {
  if (!jobs || jobs.length === 0) {
    console.log('📭 No cron jobs found in pg_cron.job table');
    console.log('   Expected 7 jobs:');
    console.log('   - nexusbrain-hourly-verification');
    console.log('   - nexusbrain-daily-retention');
    console.log('   - nexusbrain-daily-consolidation');
    console.log('   - nexusbrain-daily-weights');
    console.log('   - nexusbrain-daily-decay');
    console.log('   - nexusbrain-daily-federation');
    console.log('   - nexusbrain-weekly-threshold');
    return;
  }

  console.log(`✅ Found ${jobs.length} scheduled cron job(s)\n`);

  const nexusBrainJobs = jobs.filter(j =>
    j.jobname && j.jobname.startsWith('nexusbrain-')
  );

  if (nexusBrainJobs.length === 0) {
    console.log('⚠️  No NexusBrain jobs found (looking for jobname starting with "nexusbrain-")');
  } else {
    console.log(`   NexusBrain Jobs: ${nexusBrainJobs.length}/7 expected\n`);

    for (const job of nexusBrainJobs) {
      const active = job.active !== false ? '✅' : '❌';
      console.log(`${active} ${job.jobname}`);
      console.log(`   Schedule: ${job.schedule}`);
      if (job.active === false) {
        console.log(`   ⚠️  Status: INACTIVE`);
      }
    }
  }
}

// Run the check
checkJobExecution().catch(console.error);
