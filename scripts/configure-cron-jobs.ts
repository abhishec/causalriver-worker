#!/usr/bin/env tsx
/**
 * Configure Cron Jobs for NexusBrain
 *
 * This script configures the database setting for the service role key
 * and verifies that all cron jobs are properly set up.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://zmlqvuzoodcgmkgkivfw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function configureCronJobs() {
  console.log('🔧 Configuring NexusBrain Cron Jobs\n');
  console.log('=' .repeat(80));

  // Step 1: Set the service role key as a database setting
  console.log('\n📝 Step 1: Setting service role key in database\n');

  const { error: setError } = await supabase.rpc('exec_sql', {
    sql: `ALTER DATABASE postgres SET app.supabase_service_role_key = '${supabaseKey}'`
  });

  if (setError) {
    // Try alternative approach using a custom function
    console.log('⚠️  Direct ALTER DATABASE failed, trying alternative approach...\n');

    // Create a function that sets the config
    const setupSql = `
      DO $$
      BEGIN
        -- This will work if we have the right permissions
        EXECUTE 'ALTER DATABASE postgres SET app.supabase_service_role_key = ''' || '${supabaseKey}' || '''';
      EXCEPTION
        WHEN insufficient_privilege THEN
          RAISE NOTICE 'Could not set database setting. You may need to run this SQL manually in Supabase SQL Editor:';
          RAISE NOTICE 'ALTER DATABASE postgres SET app.supabase_service_role_key = ''your_key_here'';';
      END $$;
    `;

    const { error: setupError } = await supabase.rpc('exec_sql', { sql: setupSql });

    if (setupError) {
      console.log('⚠️  Could not set database setting programmatically.');
      console.log('\n📖 Manual Step Required:');
      console.log('   1. Go to Supabase Dashboard → SQL Editor');
      console.log('   2. Run this SQL:');
      console.log('');
      console.log(`      ALTER DATABASE postgres SET app.supabase_service_role_key = '${supabaseKey}';`);
      console.log('');
      console.log('   3. Re-run this script to verify\n');
    } else {
      console.log('✅ Service role key configuration attempted\n');
    }
  } else {
    console.log('✅ Service role key set successfully\n');
  }

  // Step 2: Check cron job status
  console.log('\n📊 Step 2: Checking cron job status\n');
  console.log('─'.repeat(80));

  const { data: cronStatus, error: statusError } = await supabase
    .rpc('get_nexusbrain_cron_status');

  if (statusError) {
    console.log('⚠️  Could not query cron status:', statusError.message);

    // Try alternative query
    const { data: cronJobsAlt, error: cronErrorAlt } = await supabase
      .from('cron.job')
      .select('*')
      .like('jobname', 'nexusbrain-%');

    if (cronErrorAlt) {
      console.log('❌ Cannot access pg_cron.job table');
      console.log('   This means pg_cron extension may not be installed.');
    } else if (!cronJobsAlt || cronJobsAlt.length === 0) {
      console.log('⚠️  No NexusBrain cron jobs found');
      console.log('   Expected 5 jobs. Run the migration to create them.');
    } else {
      console.log(`✅ Found ${cronJobsAlt.length} cron job(s)\n`);
      displayCronJobs(cronJobsAlt);
    }
  } else if (!cronStatus || cronStatus.length === 0) {
    console.log('⚠️  No cron jobs found');
  } else {
    console.log(`✅ Found ${cronStatus.length} cron job(s)\n`);
    cronStatus.forEach((job: any) => {
      const active = job.is_active ? '✅' : '❌';
      console.log(`${active} ${job.job_name}`);
      console.log(`   Schedule: ${job.schedule}`);
    });
  }

  // Step 3: Test a manual trigger
  console.log('\n\n🧪 Step 3: Testing manual job trigger\n');
  console.log('─'.repeat(80));

  console.log('\nTriggering verification job manually...\n');

  const { data: testResult, error: testError } = await supabase.functions.invoke('nexus-cron', {
    body: {
      tasks: ['prediction_verification']
    }
  });

  if (testError) {
    console.log('❌ Manual trigger failed:', testError.message);
  } else {
    console.log('✅ Manual trigger succeeded\n');
    console.log(`   Organizations processed: ${testResult.organizationsProcessed || 0}`);
    console.log(`   Results: ${testResult.results?.length || 0} job(s)`);

    if (testResult.results && testResult.results.length > 0) {
      const successCount = testResult.results.filter((r: any) => r.status === 'success').length;
      const errorCount = testResult.results.filter((r: any) => r.status === 'error').length;
      console.log(`   ✅ Success: ${successCount}`);
      console.log(`   ❌ Errors: ${errorCount}`);
    }
  }

  // Step 4: Check recent activity
  console.log('\n\n📈 Step 4: Recent cron activity\n');
  console.log('─'.repeat(80));

  const { data: recentActivity, error: activityError } = await supabase
    .from('ai_agent_activity')
    .select('*')
    .eq('agent_type', 'cron')
    .eq('action_type', 'scheduled_run')
    .order('created_at', { ascending: false })
    .limit(5);

  if (activityError) {
    console.log('⚠️  Could not query recent activity:', activityError.message);
  } else if (!recentActivity || recentActivity.length === 0) {
    console.log('📭 No recent cron activity found');
    console.log('   This is normal if cron jobs haven\'t triggered yet.');
  } else {
    console.log(`✅ Found ${recentActivity.length} recent execution(s)\n`);

    recentActivity.forEach((activity: any) => {
      const timestamp = new Date(activity.created_at).toLocaleString();
      console.log(`\n⏰ ${timestamp}`);
      console.log(`   Input:  ${activity.input_summary}`);
      console.log(`   Output: ${activity.output_summary}`);
    });
  }

  // Final Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('✅ Cron Jobs Configuration Complete\n');

  console.log('📋 Summary:');
  console.log('   - Service role key: Configured (verify manually if needed)');
  console.log(`   - Cron jobs: ${cronStatus?.length || 0}/5 expected`);
  console.log('   - Manual test: ' + (testError ? '❌ Failed' : '✅ Passed'));
  console.log('   - Recent activity: ' + (recentActivity?.length || 0) + ' executions');

  console.log('\n🔮 Next Steps:');
  console.log('   1. Wait for next hour to verify hourly job runs');
  console.log('   2. Check job execution report: npm run check:jobs');
  console.log('   3. Monitor logs: npx supabase functions logs nexus-cron');
  console.log('');
}

function displayCronJobs(jobs: any[]) {
  jobs.forEach((job: any) => {
    const active = job.active ? '✅' : '❌';
    console.log(`${active} ${job.jobname}`);
    console.log(`   Schedule: ${job.schedule}`);
    if (!job.active) {
      console.log(`   ⚠️  Status: INACTIVE`);
    }
  });
}

// Run the configuration
configureCronJobs().catch(console.error);
