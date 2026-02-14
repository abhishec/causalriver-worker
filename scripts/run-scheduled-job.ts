#!/usr/bin/env tsx
/**
 * Run Scheduled Job - Manual Trigger Script
 *
 * Manually triggers any scheduled brain maintenance job for testing/debugging.
 *
 * Usage:
 *   pnpm run-scheduled-job <job-type> [organization-id]
 *
 * Examples:
 *   pnpm run-scheduled-job verification
 *   pnpm run-scheduled-job weights abc123...
 *   pnpm run-scheduled-job all_daily
 *
 * Available job types:
 *   - consolidation      Full 10-step brain consolidation
 *   - verification       Process pending prediction verifications
 *   - weights            Update causal edge weights from outcomes
 *   - decay              Apply evidence decay to causal graph
 *   - threshold          ROC-based threshold tuning
 *   - retention          Clean up stale data
 *   - federation         Promote knowledge to core brain
 *   - all_daily          Run all daily jobs in sequence
 */

import { createClient } from '@supabase/supabase-js';
import {
  createScheduledJobs,
  type ScheduledJobsConfig,
} from '../packages/memory-stack/src/orchestrator/scheduled-jobs';
import { createConsolidationEngine } from '../packages/memory-stack/src/orchestrator/consolidation-engine';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ============================================================================
// JOB TYPES
// ============================================================================

type JobType =
  | 'consolidation'
  | 'verification'
  | 'weights'
  | 'decay'
  | 'threshold'
  | 'retention'
  | 'federation'
  | 'all_daily';

const JOB_DESCRIPTIONS: Record<JobType, string> = {
  consolidation: 'Full 10-step brain consolidation (nightly learning cycle)',
  verification: 'Process pending prediction verifications',
  weights: 'Update causal edge weights based on prediction outcomes',
  decay: 'Apply evidence decay to causal graph edges',
  threshold: 'Optimize signal thresholds using ROC analysis (weekly)',
  retention: 'Clean up stale data (signals, predictions, weights)',
  federation: 'Promote anonymized knowledge to core brain',
  all_daily: 'Run all daily jobs in sequence (Phase A → B → C)',
};

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const jobType = args[0] as JobType;
  const organizationId = args[1] || null;

  if (!JOB_DESCRIPTIONS[jobType]) {
    console.error(`❌ Unknown job type: ${jobType}`);
    console.error('   Run with --help to see available job types');
    process.exit(1);
  }

  console.log(`🧠 NexusBrain Scheduled Job Runner\n`);
  console.log(`📋 Job Type: ${jobType}`);
  console.log(`📝 Description: ${JOB_DESCRIPTIONS[jobType]}`);
  console.log(`🏢 Organization: ${organizationId || 'ALL active organizations'}`);
  console.log(`⏰ Started: ${new Date().toISOString()}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const startTime = Date.now();

    // Get organizations to process
    const orgIds = organizationId
      ? [organizationId]
      : await getActiveOrganizations(supabase);

    console.log(`🎯 Processing ${orgIds.length} organization(s)...\n`);

    // Process each organization
    for (let i = 0; i < orgIds.length; i++) {
      const orgId = orgIds[i];
      console.log(`\n[${ i + 1}/${orgIds.length}] Processing org: ${orgId}`);
      console.log('─'.repeat(60));

      const result = await runJob(supabase, jobType, orgId);

      if (result.success) {
        console.log(`✅ Success (${result.duration_ms}ms)`);
        if (result.summary) {
          console.log(`📊 ${result.summary}`);
        }
      } else {
        console.error(`❌ Error: ${result.error}`);
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ All jobs completed in ${totalDuration}ms`);
    console.log(`⏰ Finished: ${new Date().toISOString()}`);
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// ============================================================================
// JOB EXECUTION
// ============================================================================

interface JobResult {
  success: boolean;
  duration_ms: number;
  summary?: string;
  data?: any;
  error?: string;
}

async function runJob(
  supabase: any,
  jobType: JobType,
  organizationId: string
): Promise<JobResult> {
  const startTime = Date.now();

  try {
    const jobs = createScheduledJobs(supabase, {
      lookbackDays: 90,
      minObservations: 5,
      jobTimeoutMs: 600_000, // 10 minutes for manual runs
    });

    let result: any;
    let summary: string;

    switch (jobType) {
      case 'consolidation': {
        const engine = await createConsolidationEngine(supabase, organizationId);
        result = await engine.consolidate();
        summary = `Steps completed: ${result.steps.filter((s: any) => s.status === 'success').length}/${result.steps.length}`;
        break;
      }

      case 'verification': {
        result = await jobs.runPendingVerifications(organizationId);
        summary = `Verifications processed: ${result.verificationsProcessed}`;
        break;
      }

      case 'weights': {
        result = await jobs.runWeightUpdates(organizationId);
        summary = `Weights updated: ${result.weightsUpdated.length}, Degrading: ${result.degradingRelationships.length}`;
        break;
      }

      case 'decay': {
        result = await jobs.runEvidenceDecay(organizationId);
        summary = `Edges decayed: ${result.edgesDecayed}, Removed: ${result.edgesRemoved}`;
        break;
      }

      case 'threshold': {
        result = await jobs.runThresholdOptimization(organizationId);
        summary = `Thresholds analyzed: ${result.results.length}, Updates applied: ${result.updatesApplied}`;
        break;
      }

      case 'retention': {
        result = await jobs.runDataRetention(organizationId);
        summary = `Deleted - Signals: ${result.signalsDeleted}, Predictions: ${result.predictionsDeleted}, Weights: ${result.weightsDeleted}`;
        break;
      }

      case 'federation': {
        result = await jobs.runUpstreamFederation(organizationId);
        summary = `Promoted - Edges: ${result.edgesPromoted}, Patterns: ${result.patternsPromoted}, Rules: ${result.rulesPromoted}`;
        break;
      }

      case 'all_daily': {
        result = await jobs.runAllDailyJobs(organizationId);
        const successCount = Object.values(result).filter(
          (r: any) => !r.error
        ).length;
        summary = `Jobs completed: ${successCount}/6`;
        break;
      }

      default:
        throw new Error(`Unhandled job type: ${jobType}`);
    }

    return {
      success: true,
      duration_ms: Date.now() - startTime,
      summary,
      data: result,
    };
  } catch (error: any) {
    return {
      success: false,
      duration_ms: Date.now() - startTime,
      error: error.message || String(error),
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function getActiveOrganizations(supabase: any): Promise<string[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching organizations:', error.message);
    return [];
  }

  if (!data || data.length === 0) {
    console.warn('⚠️  No active organizations found');
    return [];
  }

  console.log(`📋 Found ${data.length} active organization(s):`);
  data.forEach((org: any, i: number) => {
    console.log(`   ${i + 1}. ${org.name} (${org.id})`);
  });

  return data.map((org: any) => org.id);
}

function printHelp() {
  console.log(`
🧠 NexusBrain Scheduled Job Runner

USAGE:
  pnpm run-scheduled-job <job-type> [organization-id]

JOB TYPES:
  consolidation      ${JOB_DESCRIPTIONS.consolidation}
  verification       ${JOB_DESCRIPTIONS.verification}
  weights            ${JOB_DESCRIPTIONS.weights}
  decay              ${JOB_DESCRIPTIONS.decay}
  threshold          ${JOB_DESCRIPTIONS.threshold}
  retention          ${JOB_DESCRIPTIONS.retention}
  federation         ${JOB_DESCRIPTIONS.federation}
  all_daily          ${JOB_DESCRIPTIONS.all_daily}

EXAMPLES:
  # Run verification for all active orgs
  pnpm run-scheduled-job verification

  # Run weight updates for specific org
  pnpm run-scheduled-job weights abc123-def456-...

  # Run full daily suite for all orgs
  pnpm run-scheduled-job all_daily

  # Run brain consolidation for specific org
  pnpm run-scheduled-job consolidation abc123-def456-...

ENVIRONMENT VARIABLES:
  SUPABASE_URL               Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY  Service role key (admin access)

NOTES:
  - Jobs run sequentially for each organization
  - All jobs have 10-minute timeout for manual runs
  - Job execution is logged to scheduled_job_runs table
  - See scheduled-jobs.ts for job implementation details
`);
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error) => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
