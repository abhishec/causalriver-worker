/**
 * NexusBrain Scheduled Jobs Edge Function
 *
 * Invoked by pg_cron to run periodic brain maintenance tasks.
 * Routes job requests to the appropriate scheduled-jobs module function.
 *
 * Job Types:
 * - consolidation: Full 10-step brain consolidation
 * - verification: Process pending prediction verifications
 * - weights: Update causal edge weights from outcomes
 * - decay: Apply evidence decay to causal graph
 * - threshold_optimization: ROC-based threshold tuning
 * - retention: Clean up stale data
 * - federation: Promote knowledge to core brain
 * - all_daily: Run all daily jobs in sequence
 *
 * Usage:
 * POST /functions/v1/scheduled-jobs
 * {
 *   "job_type": "verification",
 *   "organization_id": "..." // optional, defaults to all active orgs
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// TYPES
// ============================================================================

interface JobRequest {
  job_type:
    | 'consolidation'
    | 'verification'
    | 'weights'
    | 'decay'
    | 'threshold_optimization'
    | 'retention'
    | 'federation'
    | 'all_daily';
  organization_id?: string;
}

interface JobResult {
  success: boolean;
  job_type: string;
  organization_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  result?: any;
  error?: string;
}

// ============================================================================
// ENVIRONMENT
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body: JobRequest = await req.json();
    const { job_type, organization_id } = body;

    if (!job_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: job_type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get organizations to process
    const orgIds = organization_id
      ? [organization_id]
      : await getActiveOrganizations(supabase);

    console.log(
      `[scheduled-jobs] Processing ${job_type} for ${orgIds.length} organizations`
    );

    // Process each organization
    const results: JobResult[] = [];
    for (const orgId of orgIds) {
      const result = await processJob(supabase, job_type, orgId);
      results.push(result);

      // Log job run to database
      await logJobRun(supabase, result);
    }

    // Return aggregated results
    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        success: errorCount === 0,
        job_type,
        organizations_processed: orgIds.length,
        successes: successCount,
        errors: errorCount,
        results,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[scheduled-jobs] Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

// ============================================================================
// JOB PROCESSING
// ============================================================================

async function processJob(
  supabase: any,
  jobType: string,
  organizationId: string
): Promise<JobResult> {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  try {
    console.log(`[${jobType}] Starting for org ${organizationId}`);

    // Import the scheduled-jobs module dynamically
    // NOTE: This assumes @nexus-ai/memory-stack is built and available
    // For Deno Edge Functions, you may need to bundle this or use import maps
    const { createScheduledJobs } = await import(
      '@nexus-ai/memory-stack/orchestrator/scheduled-jobs'
    );

    const jobs = createScheduledJobs(supabase);
    let result: any;

    // Route to appropriate job
    switch (jobType) {
      case 'consolidation':
        // Consolidation uses a separate module
        const { createConsolidationEngine } = await import(
          '@nexus-ai/memory-stack/orchestrator/consolidation-engine'
        );
        const engine = await createConsolidationEngine(supabase, organizationId);
        result = await engine.consolidate();
        break;

      case 'verification':
        result = await jobs.runPendingVerifications(organizationId);
        break;

      case 'weights':
        result = await jobs.runWeightUpdates(organizationId);
        break;

      case 'decay':
        result = await jobs.runEvidenceDecay(organizationId);
        break;

      case 'threshold_optimization':
        result = await jobs.runThresholdOptimization(organizationId);
        break;

      case 'retention':
        result = await jobs.runDataRetention(organizationId);
        break;

      case 'federation':
        result = await jobs.runUpstreamFederation(organizationId);
        break;

      case 'all_daily':
        result = await jobs.runAllDailyJobs(organizationId);
        break;

      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    console.log(
      `[${jobType}] Completed for org ${organizationId} in ${durationMs}ms`
    );

    return {
      success: true,
      job_type: jobType,
      organization_id: organizationId,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      result,
    };
  } catch (error: any) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    console.error(
      `[${jobType}] Error for org ${organizationId}:`,
      error.message
    );

    return {
      success: false,
      job_type: jobType,
      organization_id: organizationId,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      error: error.message || String(error),
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get all active organization IDs
 */
async function getActiveOrganizations(supabase: any): Promise<string[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[scheduled-jobs] Error fetching organizations:', error);
    return [];
  }

  return data?.map((org: any) => org.id) || [];
}

/**
 * Log job run to database for monitoring
 */
async function logJobRun(supabase: any, result: JobResult): Promise<void> {
  const { error } = await supabase.from('scheduled_job_runs').insert({
    organization_id: result.organization_id,
    job_name: `scheduled-${result.job_type}`,
    job_type: result.job_type,
    started_at: result.started_at,
    completed_at: result.completed_at,
    status: result.success ? 'success' : 'error',
    result: result.result ? JSON.stringify(result.result) : null,
    error_message: result.error || null,
    duration_ms: result.duration_ms,
  });

  if (error) {
    console.error('[scheduled-jobs] Error logging job run:', error);
  }
}

// ============================================================================
// DEPLOYMENT NOTES
// ============================================================================

/*
DEPLOYMENT:

1. Build @nexus-ai/memory-stack package:
   cd packages/memory-stack
   pnpm build

2. Deploy Edge Function:
   supabase functions deploy scheduled-jobs

3. Set environment variables in Supabase dashboard:
   - SUPABASE_URL (auto-set)
   - SUPABASE_SERVICE_ROLE_KEY (auto-set)

4. Test manually:
   curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-jobs \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"job_type": "verification"}'

5. Verify cron jobs are calling this function:
   SELECT * FROM cron.job ORDER BY jobname;

MONITORING:
- Function logs: Supabase Dashboard > Edge Functions > scheduled-jobs > Logs
- Job runs: SELECT * FROM scheduled_job_runs ORDER BY created_at DESC;
- Error rate: See scheduled_job_runs.job_type COMMENT for query
*/
