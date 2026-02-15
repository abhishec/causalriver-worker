#!/usr/bin/env tsx
/**
 * NexusBrain Monitoring & Auto-Healing Script
 * ══════════════════════════════════════════════════════════════
 *
 * This script continuously monitors the NexusBrain infrastructure
 * and automatically heals any issues it detects.
 *
 * Features:
 * - Monitors Amplify deployments
 * - Monitors Supabase automatic mode
 * - Monitors AWS infrastructure
 * - Auto-heals failures
 * - Sends alerts
 *
 * Usage:
 *   tsx scripts/monitor-and-heal.ts
 *   tsx scripts/monitor-and-heal.ts --once (run once, don't loop)
 *   tsx scripts/monitor-and-heal.ts --verbose (detailed logs)
 */

import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { resolve } from 'path';

// Load environment variables
loadEnv({ path: resolve(__dirname, '../.env') });

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const config = {
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  amplifyAppId: 'd1949jfiizz0x0',
  awsRegion: 'us-east-1',
  checkInterval: 5 * 60 * 1000, // 5 minutes
  retryAttempts: 3,
  retryDelay: 60 * 1000, // 1 minute
};

const args = process.argv.slice(2);
const runOnce = args.includes('--once');
const verbose = args.includes('--verbose');

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

function log(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const timestamp = new Date().toISOString();
  const emoji = {
    info: '📊',
    warn: '⚠️ ',
    error: '❌',
    success: '✅',
  }[level];

  console.log(`[${timestamp}] ${emoji} ${message}`);
}

function execCommand(command: string, ignoreErrors = false): string {
  try {
    if (verbose) log(`Executing: ${command}`, 'info');
    return execSync(command, { encoding: 'utf-8' });
  } catch (error: any) {
    if (!ignoreErrors) {
      log(`Command failed: ${command}`, 'error');
      log(error.message, 'error');
    }
    return '';
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// Health Checks
// ═══════════════════════════════════════════════════════════════

interface HealthStatus {
  healthy: boolean;
  component: string;
  details: string;
  timestamp: Date;
}

async function checkAmplifyHealth(): Promise<HealthStatus> {
  try {
    log('Checking Amplify deployment status...', 'info');

    const output = execCommand(
      `aws amplify get-app --app-id ${config.amplifyAppId} --region ${config.awsRegion} --query 'app.productionBranch.status' --output text`,
      true
    );

    const status = output.trim();
    const healthy = status === 'SUCCEED';

    return {
      healthy,
      component: 'Amplify',
      details: `Deployment status: ${status}`,
      timestamp: new Date(),
    };
  } catch (error: any) {
    return {
      healthy: false,
      component: 'Amplify',
      details: `Error checking Amplify: ${error.message}`,
      timestamp: new Date(),
    };
  }
}

async function checkSupabaseHealth(): Promise<HealthStatus> {
  try {
    log('Checking Supabase automatic mode...', 'info');

    const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

    // Check table-based auth
    const { data: creds, error: credError } = await supabase
      .from('system_credentials')
      .select('credential_type')
      .eq('credential_type', 'supabase_service_role_key')
      .single();

    if (credError || !creds) {
      return {
        healthy: false,
        component: 'Supabase',
        details: 'Table-based auth not found',
        timestamp: new Date(),
      };
    }

    // Check cron jobs
    const { data: jobs, error: jobError } = await supabase.rpc('get_nexusbrain_cron_status');

    if (jobError || !jobs || jobs.length !== 5) {
      return {
        healthy: false,
        component: 'Supabase',
        details: `Expected 5 cron jobs, found ${jobs?.length || 0}`,
        timestamp: new Date(),
      };
    }

    // Check recent activity (within last 2 hours)
    const { data: activity } = await supabase
      .from('ai_agent_activity')
      .select('created_at')
      .eq('agent_type', 'cron')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastRun = activity?.[0]?.created_at;
    const hoursSinceRun = lastRun
      ? (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60)
      : Infinity;

    if (hoursSinceRun > 2) {
      return {
        healthy: false,
        component: 'Supabase',
        details: `No cron activity in ${hoursSinceRun.toFixed(1)} hours`,
        timestamp: new Date(),
      };
    }

    return {
      healthy: true,
      component: 'Supabase',
      details: `All systems operational, last run ${Math.floor(hoursSinceRun * 60)} min ago`,
      timestamp: new Date(),
    };
  } catch (error: any) {
    return {
      healthy: false,
      component: 'Supabase',
      details: `Error checking Supabase: ${error.message}`,
      timestamp: new Date(),
    };
  }
}

async function checkAWSInfrastructure(): Promise<HealthStatus> {
  try {
    log('Checking AWS infrastructure...', 'info');

    // Check CloudFormation stack
    const stackStatus = execCommand(
      `aws cloudformation describe-stacks --stack-name nexusbrain-production --region ${config.awsRegion} --query 'Stacks[0].StackStatus' --output text`,
      true
    ).trim();

    if (stackStatus && !stackStatus.includes('COMPLETE')) {
      return {
        healthy: false,
        component: 'AWS Infrastructure',
        details: `Stack status: ${stackStatus}`,
        timestamp: new Date(),
      };
    }

    // Check ECS cluster
    const clusterStatus = execCommand(
      `aws ecs describe-clusters --clusters production-nexusbrain --region ${config.awsRegion} --query 'clusters[0].status' --output text`,
      true
    ).trim();

    if (clusterStatus && clusterStatus !== 'ACTIVE') {
      return {
        healthy: false,
        component: 'AWS Infrastructure',
        details: `ECS cluster status: ${clusterStatus}`,
        timestamp: new Date(),
      };
    }

    return {
      healthy: true,
      component: 'AWS Infrastructure',
      details: 'All AWS resources operational',
      timestamp: new Date(),
    };
  } catch (error: any) {
    return {
      healthy: false,
      component: 'AWS Infrastructure',
      details: `Error checking AWS: ${error.message}`,
      timestamp: new Date(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Auto-Healing Functions
// ═══════════════════════════════════════════════════════════════

async function healAmplify(): Promise<boolean> {
  try {
    log('Auto-healing Amplify deployment...', 'warn');

    // Trigger new deployment
    execCommand(
      `aws amplify start-job --app-id ${config.amplifyAppId} --branch-name main --job-type RELEASE --region ${config.awsRegion}`
    );

    log('Amplify deployment triggered, waiting for completion...', 'info');

    // Wait a bit for deployment to start
    await sleep(30000);

    // Check status
    const status = await checkAmplifyHealth();

    if (status.healthy) {
      log('Amplify auto-heal successful!', 'success');
      return true;
    }

    log('Amplify auto-heal in progress, check again later', 'info');
    return false;
  } catch (error: any) {
    log(`Amplify auto-heal failed: ${error.message}`, 'error');
    return false;
  }
}

async function healSupabase(): Promise<boolean> {
  try {
    log('Auto-healing Supabase...', 'warn');

    const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

    // Trigger manual cron job to verify it works
    log('Triggering manual cron verification...', 'info');

    const { error } = await supabase.functions.invoke('nexus-cron', {
      body: { tasks: ['prediction_verification'] },
    });

    if (error) {
      log(`Manual cron trigger failed: ${error.message}`, 'error');
      return false;
    }

    log('Manual cron triggered successfully', 'success');

    // Wait and verify
    await sleep(10000);

    const status = await checkSupabaseHealth();

    if (status.healthy) {
      log('Supabase auto-heal successful!', 'success');
      return true;
    }

    log('Supabase still unhealthy after auto-heal', 'warn');
    return false;
  } catch (error: any) {
    log(`Supabase auto-heal failed: ${error.message}`, 'error');
    return false;
  }
}

async function sendAlert(component: string, details: string, severity: 'warning' | 'critical') {
  try {
    log(`Sending ${severity} alert for ${component}`, 'warn');

    const slackWebhook = process.env.SLACK_WEBHOOK_URL;

    if (slackWebhook) {
      const payload = {
        text: `${severity === 'critical' ? '🚨' : '⚠️'} NexusBrain Alert`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `${severity === 'critical' ? '🚨' : '⚠️'} ${component} ${severity === 'critical' ? 'CRITICAL' : 'Warning'}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Component:* ${component}\n*Details:* ${details}\n*Time:* ${new Date().toISOString()}`,
            },
          },
        ],
      };

      execCommand(`curl -X POST -H 'Content-type: application/json' --data '${JSON.stringify(payload)}' ${slackWebhook}`, true);

      log('Alert sent to Slack', 'success');
    } else {
      log('SLACK_WEBHOOK_URL not configured, skipping alert', 'warn');
    }
  } catch (error: any) {
    log(`Failed to send alert: ${error.message}`, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Monitoring Loop
// ═══════════════════════════════════════════════════════════════

async function runHealthChecks() {
  log('Starting health checks...', 'info');

  const results: HealthStatus[] = [];

  // Run all health checks in parallel
  const [amplifyHealth, supabaseHealth, awsHealth] = await Promise.all([
    checkAmplifyHealth(),
    checkSupabaseHealth(),
    checkAWSInfrastructure(),
  ]);

  results.push(amplifyHealth, supabaseHealth, awsHealth);

  // Log results
  for (const result of results) {
    if (result.healthy) {
      log(`${result.component}: HEALTHY - ${result.details}`, 'success');
    } else {
      log(`${result.component}: UNHEALTHY - ${result.details}`, 'error');
    }
  }

  // Auto-heal if needed
  let healed = false;

  for (const result of results) {
    if (!result.healthy) {
      log(`Attempting auto-heal for ${result.component}...`, 'warn');

      let healSuccess = false;

      // Retry healing with backoff
      for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
        log(`Heal attempt ${attempt}/${config.retryAttempts}`, 'info');

        if (result.component === 'Amplify') {
          healSuccess = await healAmplify();
        } else if (result.component === 'Supabase') {
          healSuccess = await healSupabase();
        }

        if (healSuccess) {
          healed = true;
          break;
        }

        if (attempt < config.retryAttempts) {
          log(`Waiting ${config.retryDelay / 1000}s before retry...`, 'info');
          await sleep(config.retryDelay);
        }
      }

      if (!healSuccess) {
        log(`Auto-heal failed for ${result.component} after ${config.retryAttempts} attempts`, 'error');
        await sendAlert(result.component, result.details, 'critical');
      }
    }
  }

  // Summary
  const healthyCount = results.filter(r => r.healthy).length;
  const totalCount = results.length;

  log(`Health check complete: ${healthyCount}/${totalCount} components healthy`, healthyCount === totalCount ? 'success' : 'warn');

  if (healed) {
    log('Auto-healing completed', 'success');
  }

  return {
    healthy: healthyCount === totalCount,
    results,
    healed,
  };
}

async function main() {
  log('NexusBrain Monitoring & Auto-Healing Started', 'success');
  log(`Mode: ${runOnce ? 'Single run' : 'Continuous monitoring'}`, 'info');
  log(`Check interval: ${config.checkInterval / 1000}s`, 'info');

  if (runOnce) {
    // Run once and exit
    const result = await runHealthChecks();
    process.exit(result.healthy ? 0 : 1);
  } else {
    // Continuous monitoring
    while (true) {
      try {
        await runHealthChecks();
      } catch (error: any) {
        log(`Unexpected error in monitoring loop: ${error.message}`, 'error');
      }

      log(`Waiting ${config.checkInterval / 1000}s until next check...`, 'info');
      await sleep(config.checkInterval);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
  });
}

export { runHealthChecks, checkAmplifyHealth, checkSupabaseHealth, checkAWSInfrastructure };
