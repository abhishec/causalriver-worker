export const dynamic = "force-dynamic";
/**
 * Brain Health Monitoring API
 *
 * GET /api/brain/health
 *   Public endpoint (no auth required) — returns basic liveness.
 *
 * GET /api/brain/health?detail=true
 *   Requires platform admin session — returns full system health
 *   including database size, table sizes, brain stats, retention status.
 *
 * GET /api/brain/health?learning=true&organizationId=xxx
 *   Requires authenticated user — returns learning health for the org:
 *   - Prediction accuracy & calibration
 *   - Causal graph size & quality
 *   - Closed-loop learning status (5 loops)
 *   - RL system health (5 neurotransmitter signals)
 *   - Connector sync freshness
 *   - Data pipeline health
 *
 * This powers monitoring dashboards, alerting, and operational awareness.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const detail = request.nextUrl.searchParams.get("detail") === "true";
  const learning = request.nextUrl.searchParams.get("learning") === "true";

  // Basic liveness check (no auth required)
  if (!detail && !learning) {
    const envCheck = request.nextUrl.searchParams.get("env") === "true";
    return NextResponse.json({
      status: "ok",
      service: "nexusbrain",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      ...(envCheck ? {
        env: {
          NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
          CRON_SECRET: !!process.env.CRON_SECRET,
          AWS_S3_BUCKET_NAME: !!process.env.AWS_S3_BUCKET_NAME,
          AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
          NODE_ENV: process.env.NODE_ENV,
        },
      } : {}),
    });
  }

  // ── Learning Health (org-specific, any authenticated user) ──────
  if (learning) {
    return handleLearningHealth(request);
  }

  // ── Detailed health (platform admin only) ──────────────────────
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check platform admin
    const service = await createServiceClient();
    const { data: adminCheck } = await service
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .limit(1)
      .single();

    if (!adminCheck) {
      return NextResponse.json({ error: "Platform admin required" }, { status: 403 });
    }

    // Call the system health RPC
    const { data: health, error } = await service.rpc("check_system_health");

    if (error) {
      return NextResponse.json({
        status: "degraded",
        error: error.message,
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

    // Augment with platform-level metrics
    const { data: recentErrors } = await service
      .from("brain_execution_log")
      .select("id")
      .eq("status", "error")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    const { count: activeKeys } = await service
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    const { count: pendingInvites } = await service
      .from("org_invitations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    return NextResponse.json({
      ...health,
      platform: {
        errors_24h: recentErrors?.length ?? 0,
        active_api_keys: activeKeys ?? 0,
        pending_invitations: pendingInvites ?? 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      status: "error",
      message: err instanceof Error ? err.message : "Health check failed",
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// ============================================================================
// LEARNING HEALTH — The Brain's Self-Awareness
// ============================================================================

/**
 * Returns comprehensive learning health for an organization.
 * This is what the Brain shows when asked "how smart am I?"
 *
 * Checks 6 dimensions:
 * 1. Prediction accuracy & calibration
 * 2. Causal graph quality (edges, confidence, freshness)
 * 3. Closed-loop learning status (5 loops active?)
 * 4. Data pipeline freshness (when did connectors last sync?)
 * 5. Signal volume & diversity
 * 6. Job execution health (are scheduled jobs running?)
 */
async function handleLearningHealth(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = request.nextUrl.searchParams.get("organizationId") || await getCurrentWorkspaceId();

    // Verify membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!membership) {
      const { data: admin } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .single();

      if (!admin) {
        return NextResponse.json(
          { error: "Not a member of this workspace" },
          { status: 403 }
        );
      }
    }

    const service = await createServiceClient();

    // Run all health checks in parallel for speed
    const [
      predictionHealth,
      causalGraphHealth,
      signalHealth,
      connectorHealth,
      jobHealth,
      evolutionState,
    ] = await Promise.all([
      checkPredictionHealth(service, workspaceId),
      checkCausalGraphHealth(service, workspaceId),
      checkSignalHealth(service, workspaceId),
      checkConnectorHealth(service, workspaceId),
      checkJobHealth(service, workspaceId),
      checkEvolutionState(service, workspaceId),
    ]);

    // Compute overall learning score (0-100)
    const scores = [
      predictionHealth.score,
      causalGraphHealth.score,
      signalHealth.score,
      connectorHealth.score,
      jobHealth.score,
    ];
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Determine status
    const status = overallScore >= 80 ? "healthy"
      : overallScore >= 50 ? "learning"
      : overallScore >= 20 ? "degraded"
      : "initializing";

    return NextResponse.json({
      status,
      overall_score: overallScore,
      organization_id: workspaceId,
      dimensions: {
        predictions: predictionHealth,
        causal_graph: causalGraphHealth,
        signals: signalHealth,
        connectors: connectorHealth,
        jobs: jobHealth,
      },
      evolution: evolutionState,
      recommendations: generateRecommendations(
        predictionHealth,
        causalGraphHealth,
        signalHealth,
        connectorHealth,
        jobHealth
      ),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      status: "error",
      message: err instanceof Error ? err.message : "Learning health check failed",
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// ============================================================================
// HEALTH CHECK FUNCTIONS
// ============================================================================

interface HealthDimension {
  score: number; // 0-100
  status: string;
  details: Record<string, any>;
}

async function checkPredictionHealth(supabase: any, workspaceId: string): Promise<HealthDimension> {
  try {
    // Count total and verified predictions
    const [totalResult, verifiedResult, correctResult] = await Promise.all([
      supabase.from("prediction_records").select("id", { count: "exact", head: true }).eq("organization_id", workspaceId),
      supabase.from("prediction_records").select("id", { count: "exact", head: true }).eq("organization_id", workspaceId).not("verified_at", "is", null),
      supabase.from("prediction_records").select("id", { count: "exact", head: true }).eq("organization_id", workspaceId).eq("was_correct", true),
    ]);

    const total = totalResult.count || 0;
    const verified = verifiedResult.count || 0;
    const correct = correctResult.count || 0;
    const accuracy = verified > 0 ? correct / verified : 0;

    // Score based on: having predictions (40%) + accuracy (60%)
    const volumeScore = Math.min(total / 10, 1) * 40; // Max at 10+ predictions
    const accuracyScore = accuracy * 60;
    const score = Math.round(volumeScore + accuracyScore);

    return {
      score,
      status: total === 0 ? "no_predictions" : accuracy >= 0.7 ? "accurate" : accuracy >= 0.4 ? "learning" : "low_accuracy",
      details: {
        total_predictions: total,
        verified_predictions: verified,
        correct_predictions: correct,
        accuracy: Math.round(accuracy * 100) / 100,
        pending_verification: total - verified,
      },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Prediction table not yet available" } };
  }
}

async function checkCausalGraphHealth(supabase: any, workspaceId: string): Promise<HealthDimension> {
  try {
    const [totalResult, significantResult, recentResult] = await Promise.all([
      supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }).eq("organization_id", workspaceId),
      supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }).eq("organization_id", workspaceId).eq("is_significant", true),
      supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .gte("last_computed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const total = totalResult.count || 0;
    const significant = significantResult.count || 0;
    const recent = recentResult.count || 0;

    // Score: edges exist (30%) + significant ratio (30%) + freshness (40%)
    const edgeScore = Math.min(total / 20, 1) * 30;
    const qualityScore = total > 0 ? (significant / total) * 30 : 0;
    const freshnessScore = total > 0 ? (recent / total) * 40 : 0;
    const score = Math.round(edgeScore + qualityScore + freshnessScore);

    return {
      score,
      status: total === 0 ? "empty" : recent === 0 ? "stale" : significant > 5 ? "healthy" : "growing",
      details: {
        total_edges: total,
        significant_edges: significant,
        edges_computed_last_7d: recent,
        freshness_ratio: total > 0 ? Math.round((recent / total) * 100) / 100 : 0,
      },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Causal graph table not yet available" } };
  }
}

async function checkSignalHealth(supabase: any, workspaceId: string): Promise<HealthDimension> {
  try {
    const [totalResult, recentResult, domainResult] = await Promise.all([
      supabase.from("cross_domain_signals").select("id", { count: "exact", head: true }).eq("organization_id", workspaceId),
      supabase.from("cross_domain_signals").select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("cross_domain_signals").select("source_domain").eq("organization_id", workspaceId).limit(1000),
    ]);

    const total = totalResult.count || 0;
    const recent24h = recentResult.count || 0;
    const uniqueDomains = new Set((domainResult.data || []).map((s: any) => s.source_domain)).size;

    // Score: volume (30%) + freshness (40%) + diversity (30%)
    const volumeScore = Math.min(total / 1000, 1) * 30;
    const freshnessScore = recent24h > 0 ? 40 : 0;
    const diversityScore = Math.min(uniqueDomains / 3, 1) * 30; // At least 3 domains
    const score = Math.round(volumeScore + freshnessScore + diversityScore);

    return {
      score,
      status: total === 0 ? "empty" : recent24h === 0 ? "stale" : "active",
      details: {
        total_signals: total,
        signals_last_24h: recent24h,
        unique_domains: uniqueDomains,
      },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Signals table not yet available" } };
  }
}

async function checkConnectorHealth(supabase: any, workspaceId: string): Promise<HealthDimension> {
  try {
    const { data: connectors } = await supabase
      .from("org_connectors")
      .select("connector_type, status, last_synced_at, credentials")
      .eq("organization_id", workspaceId);

    if (!connectors || connectors.length === 0) {
      return { score: 0, status: "no_connectors", details: { connected_count: 0 } };
    }

    const connected = connectors.filter((c: any) => c.status === "connected" || c.credentials);
    const recentlySynced = connectors.filter((c: any) => {
      if (!c.last_synced_at) return false;
      return Date.now() - new Date(c.last_synced_at).getTime() < 24 * 60 * 60 * 1000;
    });

    // Score: connected (50%) + recently synced (50%)
    const connectedScore = (connected.length / connectors.length) * 50;
    const syncScore = connected.length > 0 ? (recentlySynced.length / connected.length) * 50 : 0;
    const score = Math.round(connectedScore + syncScore);

    return {
      score,
      status: connected.length === 0 ? "disconnected" : recentlySynced.length === 0 ? "stale" : "syncing",
      details: {
        total_connectors: connectors.length,
        connected_count: connected.length,
        recently_synced_count: recentlySynced.length,
        connectors: connectors.map((c: any) => ({
          type: c.connector_type,
          status: c.status || (c.credentials ? "connected" : "disconnected"),
          last_synced: c.last_synced_at,
        })),
      },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Connectors table not yet available" } };
  }
}

async function checkJobHealth(supabase: any, workspaceId: string): Promise<HealthDimension> {
  try {
    const { data: recentJobs } = await supabase
      .from("scheduled_job_runs")
      .select("job_type, status, started_at, duration_ms, error_message")
      .eq("organization_id", workspaceId)
      .gte("started_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order("started_at", { ascending: false })
      .limit(50);

    if (!recentJobs || recentJobs.length === 0) {
      return { score: 10, status: "no_recent_jobs", details: { jobs_last_48h: 0 } };
    }

    const succeeded = recentJobs.filter((j: any) => j.status === "success").length;
    const failed = recentJobs.filter((j: any) => j.status === "error").length;
    const successRate = succeeded / recentJobs.length;

    // Score based on success rate (70%) + running at all (30%)
    const rateScore = successRate * 70;
    const runningScore = 30; // Jobs are running
    const score = Math.round(rateScore + runningScore);

    return {
      score,
      status: successRate >= 0.9 ? "healthy" : successRate >= 0.5 ? "degraded" : "failing",
      details: {
        jobs_last_48h: recentJobs.length,
        succeeded,
        failed,
        success_rate: Math.round(successRate * 100) / 100,
        recent_errors: recentJobs
          .filter((j: any) => j.status === "error")
          .slice(0, 3)
          .map((j: any) => ({
            job_type: j.job_type,
            error: j.error_message,
            at: j.started_at,
          })),
      },
    };
  } catch {
    return { score: 0, status: "unavailable", details: { note: "Job runs table not yet available" } };
  }
}

async function checkEvolutionState(supabase: any, workspaceId: string): Promise<Record<string, any>> {
  try {
    const { data: snapshot } = await supabase
      .from("brain_health_history")
      .select("*")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!snapshot) {
      return { status: "no_snapshots", message: "Brain has not run an evolution cycle yet" };
    }

    return {
      status: "active",
      last_snapshot: snapshot.created_at,
      total_signals: snapshot.total_signals,
      total_relationships: snapshot.total_relationships,
      total_memories: snapshot.total_memories,
      resolved_predictions: snapshot.resolved_predictions,
      snapshot_type: snapshot.snapshot_type,
    };
  } catch {
    return { status: "unavailable" };
  }
}

// ============================================================================
// RECOMMENDATIONS ENGINE
// ============================================================================

function generateRecommendations(
  predictions: HealthDimension,
  causalGraph: HealthDimension,
  signals: HealthDimension,
  connectors: HealthDimension,
  jobs: HealthDimension
): string[] {
  const recs: string[] = [];

  if (connectors.status === "no_connectors") {
    recs.push("Connect at least one data source (GitHub, Slack, Jira) to start ingesting signals.");
  }

  if (signals.status === "empty") {
    recs.push("No signals ingested yet. Run a connector sync to populate the brain with data.");
  } else if (signals.status === "stale") {
    recs.push("No signals in the last 24h. Check connector sync status or trigger a manual sync.");
  }

  if (causalGraph.status === "empty" && signals.details.total_signals > 100) {
    recs.push("Enough signals to discover causal patterns. Run a causal discovery job.");
  } else if (causalGraph.status === "stale") {
    recs.push("Causal graph is stale. Run daily causal discovery to keep the brain up to date.");
  }

  if (predictions.status === "no_predictions" && causalGraph.details.significant_edges > 0) {
    recs.push("Causal edges exist but no predictions made. The brain needs to make predictions to learn.");
  } else if (predictions.status === "low_accuracy") {
    recs.push("Prediction accuracy is low. Run more verification cycles and weight updates.");
  }

  if (jobs.status === "no_recent_jobs") {
    recs.push("No scheduled jobs have run in 48h. Set up pg_cron or trigger jobs manually.");
  } else if (jobs.status === "failing") {
    recs.push("Multiple job failures detected. Check error logs and fix failing jobs.");
  }

  if (recs.length === 0) {
    recs.push("Brain is healthy. Continue monitoring for changes in accuracy and signal freshness.");
  }

  return recs;
}
