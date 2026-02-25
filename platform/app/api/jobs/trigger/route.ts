export const dynamic = "force-dynamic";
/**
 * Scheduled Jobs Trigger API
 * ==========================
 *
 * POST /api/jobs/trigger
 *   Triggers a specific scheduled job for an organization.
 *   This is the Next.js API proxy for the Supabase Edge Function.
 *
 *   Two execution modes:
 *   1. Edge Function (default): Invokes the Deno Edge Function via Supabase Functions API.
 *      Used for lightweight maintenance (verification, decay, retention, federation).
 *   2. Node.js (mode: "node"): Runs the full scheduled-jobs module from @nexus-ai/memory-stack.
 *      Used for heavy jobs that need Node.js (consolidation, causal discovery, cognitive stack).
 *
 * GET /api/jobs/trigger
 *   Returns available job types and recent execution history.
 *
 * Auth: Requires authenticated user who is either:
 *   - A member of the target organization, OR
 *   - A platform admin
 *
 * Body: {
 *   job_type: 'verification' | 'weights' | 'decay' | 'threshold_optimization' |
 *             'retention' | 'federation' | 'sleep_cycle' | 'consolidation' | 'all_daily' |
 *             'causal_discovery' | 'connector_sync' | 'training_packs' | 'prediction_outcomes',
 *   organization_id?: string,   // Defaults to user's current org
 *   mode?: 'edge' | 'node',     // Default: 'edge' for light jobs, 'node' for heavy
 * }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { checkSessionRateLimit } from "@/lib/security-middleware";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// Job types that run well in the Deno Edge Function
const EDGE_FUNCTION_JOBS = [
  'verification',
  'weights',
  'decay',
  'threshold_optimization',
  'retention',
  'federation',
  'sleep_cycle',
  'consolidation',
  'all_daily',
] as const;

// Job types that require Node.js (full memory-stack module)
const NODE_JOBS = [
  'causal_discovery',
  'connector_sync',
  'training_packs',
  'prediction_outcomes',
  'evolution_cycle',
  'learning_cycle',
  'consolidation_full',
  'all_daily_full',
] as const;

type EdgeJobType = typeof EDGE_FUNCTION_JOBS[number];
type NodeJobType = typeof NODE_JOBS[number];
type AllJobType = EdgeJobType | NodeJobType;

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limit ───────────────────────────────────────────────
    const rateLimit = await checkSessionRateLimit(user.id, "/api/jobs/trigger");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Job triggers are rate-limited to 5/min." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // ── Parse body ───────────────────────────────────────────────
    const body = await request.json();
    const { job_type, organization_id, mode } = body as {
      job_type?: AllJobType;
      organization_id?: string;
      mode?: 'edge' | 'node';
    };

    if (!job_type) {
      return NextResponse.json(
        { error: "job_type is required" },
        { status: 400 }
      );
    }

    // ── Resolve org ──────────────────────────────────────────────
    const workspaceId = organization_id || await getCurrentWorkspaceId();

    // ── Verify membership ────────────────────────────────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("role, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!membership) {
      // Check platform admin
      const { data: admin } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .single();

      if (!admin) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    const startTime = Date.now();

    // ── Determine execution mode ─────────────────────────────────
    const isNodeJob = (NODE_JOBS as readonly string[]).includes(job_type);
    const executionMode = mode || (isNodeJob ? 'node' : 'edge');

    let result: any;

    if (executionMode === 'edge' && (EDGE_FUNCTION_JOBS as readonly string[]).includes(job_type)) {
      // ── Execute via Edge Function ────────────────────────────
      result = await executeViaEdgeFunction(job_type as EdgeJobType, workspaceId);
    } else {
      // ── Execute via Node.js (memory-stack) ───────────────────
      result = await executeViaNodeJs(job_type, workspaceId);
    }

    const durationMs = Date.now() - startTime;

    // ── Log the job run ──────────────────────────────────────────
    const service = await createServiceClient();
    await service.from("scheduled_job_runs").insert({
      organization_id: workspaceId,
      job_name: `api-trigger-${job_type}`,
      job_type,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      status: result.error ? "error" : "success",
      result: JSON.stringify(result),
      error_message: result.error || null,
      duration_ms: durationMs,
    });

    return NextResponse.json({
      success: !result.error,
      job_type,
      organization_id: workspaceId,
      execution_mode: executionMode,
      duration_ms: durationMs,
      result,
    });
  } catch (error: any) {
    logger.error("[JobsTrigger] Error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = request.nextUrl.searchParams.get("organizationId") || await getCurrentWorkspaceId();

    // Get recent job runs
    const service = await createServiceClient();
    const { data: recentRuns } = await service
      .from("scheduled_job_runs")
      .select("job_name, job_type, status, started_at, completed_at, duration_ms, error_message")
      .eq("organization_id", workspaceId)
      .order("started_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      available_jobs: {
        edge_function: EDGE_FUNCTION_JOBS,
        node_js: NODE_JOBS,
      },
      recent_runs: recentRuns || [],
      usage: {
        post: "POST /api/jobs/trigger with { job_type, organization_id?, mode? }",
        example: '{ "job_type": "all_daily", "mode": "edge" }',
      },
    });
  } catch (error: any) {
    logger.error("[JobsTrigger] GET error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

// ============================================================================
// EXECUTION STRATEGIES
// ============================================================================

/**
 * Execute via Supabase Edge Function (Deno runtime).
 * Used for lightweight maintenance jobs.
 */
async function executeViaEdgeFunction(
  jobType: EdgeJobType,
  organizationId: string
): Promise<any> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { error: "Supabase configuration missing" };
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/scheduled-jobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_type: jobType,
          organization_id: organizationId,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `Edge Function error: ${response.status} ${errorText}` };
    }

    return await response.json();
  } catch (err: any) {
    return { error: `Edge Function unreachable: ${err.message}` };
  }
}

/**
 * Execute via Node.js (full memory-stack module).
 * Used for heavy jobs (causal discovery, consolidation, cognitive stack).
 */
async function executeViaNodeJs(
  jobType: string,
  organizationId: string
): Promise<any> {
  try {
    const { createScheduledJobs } = await import("@nexus-ai/memory-stack");
    const { createServiceClient } = await import("@/lib/supabase/server");
    const service = await createServiceClient();

    const jobs = createScheduledJobs(service);

    switch (jobType) {
      case 'causal_discovery':
        return await jobs.runDailyCausalDiscovery(organizationId);

      case 'training_packs':
        return await jobs.runTrainingPackApplication(organizationId);

      case 'prediction_outcomes':
        return await jobs.runPredictionOutcomeVerification(organizationId);

      case 'evolution_cycle': {
        const { runBrainEvolutionCycle } = await import("@nexus-ai/memory-stack");
        return await runBrainEvolutionCycle(service, organizationId, "full");
      }

      case 'learning_cycle': {
        const { createClosedLoopLearningEngine } = await import("@nexus-ai/memory-stack");
        const engine = createClosedLoopLearningEngine({
          supabase: service,
          organizationId,
        });
        return await engine.runLearningCycle();
      }

      case 'consolidation_full':
        return await jobs.runConsolidationCycle(organizationId);

      case 'all_daily_full':
        return await jobs.runAllDailyJobs(organizationId);

      // Node.js fallback for edge-compatible jobs
      case 'verification':
        return await jobs.runPendingVerifications(organizationId);

      case 'weights':
        return await jobs.runWeightUpdates(organizationId);

      case 'decay':
        return await jobs.runEvidenceDecay(organizationId);

      case 'threshold_optimization':
        return await jobs.runThresholdOptimization(organizationId);

      case 'retention':
        return await jobs.runDataRetention(organizationId);

      case 'federation':
        return await jobs.runUpstreamFederation(organizationId);

      default:
        return { error: `Unknown job type: ${jobType}` };
    }
  } catch (err: any) {
    return { error: `Node.js execution failed: ${err.message}` };
  }
}
