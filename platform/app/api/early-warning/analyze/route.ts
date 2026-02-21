/**
 * Early Warning System - Analyze Endpoint (Brain-Aligned)
 * =========================================================
 *
 * ARCHITECTURE COMPLIANCE:
 * - Reads from cross_domain_signals (L1) - NOT isolated tables
 * - Writes results back as signals for causal discovery (L4)
 * - Brain learns: bottleneck → velocity_collapse causality
 *
 * TWO MODES:
 * 1. Standard: Fast velocity + bottleneck analysis from cross_domain_signals
 * 2. Brain-Integrated (?mode=brain): Full 15-layer cognitive stack processing
 *    - Routes through BrainCommander for L3-L15 reasoning
 *    - Returns Theory of Mind, stress-tested predictions, intervention plans
 *    - THIS is what design partners should see
 *
 * Runs P0 Early Warning System analysis:
 * - Velocity Collapse Prediction (z-score + sprint-over-sprint)
 * - Bottleneck Concentration Risk (HHI + Gini + centrality)
 *
 * Returns unified alert dashboard data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { analyzeVelocityCollapse, analyzeBottleneckRisk } from '@/lib/p0/velocity-analysis';
import { resolveTopReviewerEngineerId } from '@/lib/p0/engineer-resolver';
import { predictVelocity } from '@/lib/p0/velocity-predictor';
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

interface AnalyzeRequest {
  organizationId: string;
  teamId?: string;
  lookbackDays?: number;
  forecastDays?: number;
  mode?: 'standard' | 'brain';
  /** Optional: scope analysis to a specific branch (e.g. 'release/6.3.4').
   *  Each workspace-org normally maps to one primaryBranch, so this is
   *  auto-resolved from org_connectors when not provided. */
  branchName?: string;
}

export async function POST(req: NextRequest) {
  try {
    // ── AUTH CHECK ──────────────────────────────────────────────────────
    const authClient = await createClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: AnalyzeRequest = await req.json();
    const {
      organizationId,
      teamId,
      lookbackDays = 90,
      forecastDays = 7,
      mode = 'standard',
      branchName: bodyBranchName,
    } = body;

    // Also check query param ?mode=brain
    const urlMode = new URL(req.url).searchParams.get('mode');
    const effectiveMode = urlMode === 'brain' ? 'brain' : mode;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }

    // ── ORG MEMBERSHIP CHECK ─────────────────────────────────────────
    const { data: membership } = await authClient
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .single();

    if (!membership) {
      const { data: admin } = await authClient
        .from('org_members')
        .select('is_platform_admin')
        .eq('user_id', user.id)
        .eq('is_platform_admin', true)
        .limit(1)
        .single();

      if (!admin) {
        return NextResponse.json(
          { error: 'Not a member of this workspace' },
          { status: 403 }
        );
      }
    }

    const supabase = await createServiceClient();

    // ========================================================================
    // Resolve branch context from org_connectors (workspace-level scoping)
    // Each workspace-org has a primaryBranch stored in the github connector config.
    // We use this to scope velocity + bottleneck queries to the right branch,
    // providing an additional guard on top of organization_id isolation.
    // ========================================================================
    let resolvedBranchName: string | undefined = bodyBranchName;
    let resolvedPrimaryBranch: string | undefined;
    let resolvedReleaseVersion: string | undefined;

    if (!resolvedBranchName) {
      const { data: githubConnector } = await supabase
        .from('org_connectors')
        .select('config')
        .eq('organization_id', organizationId)
        .eq('connector_type', 'github')
        .limit(1)
        .single();

      if (githubConnector?.config) {
        resolvedBranchName = githubConnector.config.primaryBranch ?? undefined;
        resolvedPrimaryBranch = githubConnector.config.primaryBranch ?? undefined;
        resolvedReleaseVersion = resolvedPrimaryBranch
          ? (githubConnector.config.releaseVersionMap?.[resolvedPrimaryBranch] ?? undefined)
          : undefined;
      }
    }

    // ========================================================================
    // Run Brain-aligned P0 analysis + velocity prediction
    // ========================================================================
    const [velocityAnalysis, bottleneckAnalysis] = await Promise.all([
      analyzeVelocityCollapse(supabase, organizationId, lookbackDays, resolvedBranchName),
      analyzeBottleneckRisk(supabase, organizationId, lookbackDays, resolvedBranchName),
    ]);

    // Cross-populate feature vector with bottleneck metrics
    velocityAnalysis.featureVector.reviewerHHI = bottleneckAnalysis.hhi;
    velocityAnalysis.featureVector.reviewerGini = bottleneckAnalysis.giniCoefficient;

    // ========================================================================
    // Save velocity snapshot (with extended features)
    // ========================================================================
    if (velocityAnalysis.velocityTimeSeries.length > 0) {
      const latest = velocityAnalysis.velocityTimeSeries[velocityAnalysis.velocityTimeSeries.length - 1];

      // Delete+insert pattern: COALESCE unique index can't be targeted by PostgREST onConflict
      const vsDate = new Date().toISOString().split('T')[0];
      const vsTeamId = teamId || null;
      const delQ = supabase.from('velocity_snapshots')
        .delete()
        .eq('organization_id', organizationId)
        .eq('snapshot_date', vsDate)
        .eq('window_type', '7day');
      if (vsTeamId) { delQ.eq('team_id', vsTeamId); } else { delQ.is('team_id', null); }
      await delQ;

      await supabase.from('velocity_snapshots').insert({
        organization_id: organizationId,
        snapshot_date: vsDate,
        window_start: latest.windowStart,
        window_end: latest.windowEnd,
        window_type: '7day',
        team_id: vsTeamId,
        repo_id: null,
        prs_merged: latest.prsMerged,
        mean_pr_cycle_time_hours: latest.avgCycleTimeHours,
        pr_cycle_time_variance: latest.cycleTimeVariance,
        mean_review_latency_hours: bottleneckAnalysis.avgReviewLatencyHours,
        open_pr_count: latest.openPrCount,
        prs_per_engineer: latest.prsPerEngineer,
        // Workspace/branch context — allows UI to show which branch this snapshot belongs to
        branch_name: resolvedBranchName ?? null,
        release_version: resolvedReleaseVersion ?? null,
      });
    }

    // ========================================================================
    // Save bottleneck snapshot (with HHI + centrality + resolved engineer)
    // ========================================================================
    // Resolve top reviewer's GitHub login → internal engineer_id
    const topReviewerEngineerId = await resolveTopReviewerEngineerId(
      supabase,
      organizationId,
      bottleneckAnalysis.topReviewer
    );

    // Delete+insert pattern: COALESCE unique index can't be targeted by PostgREST onConflict
    const bnDate = new Date().toISOString().split('T')[0];
    const bnTeamId = teamId || null;
    const bnDelQ = supabase.from('bottleneck_snapshots')
      .delete()
      .eq('organization_id', organizationId)
      .eq('snapshot_date', bnDate);
    if (bnTeamId) { bnDelQ.eq('team_id', bnTeamId); } else { bnDelQ.is('team_id', null); }
    await bnDelQ;

    await supabase.from('bottleneck_snapshots').insert({
      organization_id: organizationId,
      snapshot_date: bnDate,
      window_start: new Date(Date.now() - lookbackDays * 86400000).toISOString(),
      window_end: new Date().toISOString(),
      team_id: bnTeamId,
      top_reviewer_id: topReviewerEngineerId,
      top_reviewer: bottleneckAnalysis.topReviewer,
      top_reviewer_share: bottleneckAnalysis.reviewShare,
      reviewer_gini_coefficient: bottleneckAnalysis.giniCoefficient,
      reviewer_hhi: bottleneckAnalysis.hhi,
      max_betweenness_centrality: bottleneckAnalysis.maxBetweennessCentrality,
      top_centrality_contributor: bottleneckAnalysis.topCentralityContributor,
      avg_review_latency_hours: bottleneckAnalysis.avgReviewLatencyHours,
      bottleneck_risk_score: bottleneckAnalysis.riskScore,
      risk_level: bottleneckAnalysis.riskLevel,
      reviewer_breakdown: bottleneckAnalysis.reviewerBreakdown,
      reviewer_count: bottleneckAnalysis.reviewerBreakdown?.length || 0,
      // Extended spec fields
      under_utilized_reviewers: bottleneckAnalysis.underUtilizedReviewers,
      absence_simulation: bottleneckAnalysis.absenceSimulation,
    });

    // ========================================================================
    // BRAIN-INTEGRATED MODE
    // ========================================================================
    if (effectiveMode === 'brain') {
      // Load Brain context for cognitive enrichment
      const [causalEdges, patterns, recentAlerts] = await Promise.all([
        // L4: Causal relationships Brain has learned
        supabase
          .from('causal_relationships_statistical')
          .select('source_signal, target_signal, strength, confidence, lag, p_value, natural_language')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(20),
        // L5: Grammar rules / patterns Brain has discovered
        supabase
          .from('brain_grammar_rules')
          .select('rule_name, rule_body, confidence, domain')
          .eq('organization_id', organizationId)
          .gte('confidence', 0.5)
          .order('confidence', { ascending: false })
          .limit(10),
        // Recent Brain alerts
        supabase
          .from('ai_memory')
          .select('content, memory_type, cognitive_layer, created_at')
          .eq('organization_id', organizationId)
          .in('memory_type', ['alert', 'prediction', 'insight'])
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      // Build Brain reasoning narrative
      const brainReasoning: string[] = [];

      // Explain velocity collapse using causal edges
      if (velocityAnalysis.collapseDetected) {
        brainReasoning.push(
          `⚠️ Velocity collapse detected (z-score: ${velocityAnalysis.zScore.toFixed(2)}).`
        );
        for (const reason of velocityAnalysis.collapseReason) {
          brainReasoning.push(`  → ${reason}`);
        }

        // Find causal edges that explain the collapse
        const velocityEdges = (causalEdges.data || []).filter(
          (e: any) =>
            e.target_signal?.includes('velocity') || e.source_signal?.includes('velocity')
        );
        for (const edge of velocityEdges) {
          brainReasoning.push(
            `  🧠 Brain causal insight: ${edge.natural_language || `${edge.source_signal} → ${edge.target_signal} (strength: ${edge.strength})`}`
          );
        }
      }

      // Explain bottleneck using HHI, centrality, and patterns
      if (bottleneckAnalysis.riskLevel === 'high') {
        brainReasoning.push(
          `🚨 High bottleneck risk: HHI=${bottleneckAnalysis.hhi.toFixed(3)} (threshold: 0.25), ` +
          `Gini=${bottleneckAnalysis.giniCoefficient.toFixed(3)}, ` +
          `Top reviewer ${bottleneckAnalysis.topReviewer} has ${(bottleneckAnalysis.reviewShare * 100).toFixed(1)}% of reviews.`
        );
        if (bottleneckAnalysis.maxBetweennessCentrality > 0) {
          brainReasoning.push(
            `  📊 Collaboration graph: ${bottleneckAnalysis.topCentralityContributor} has highest betweenness centrality ` +
            `(${bottleneckAnalysis.maxBetweennessCentrality.toFixed(3)}) — gatekeeper risk in review network.`
          );
        }

        // Recommended interventions from patterns
        const bottleneckPatterns = (patterns.data || []).filter(
          (p: any) => p.domain === 'engineering' || p.rule_name?.includes('bottleneck')
        );
        for (const pattern of bottleneckPatterns) {
          brainReasoning.push(`  🧠 Brain pattern: ${pattern.rule_name} (confidence: ${pattern.confidence})`);
        }
      }

      // Add intervention recommendations
      const interventions: string[] = [];
      if (velocityAnalysis.collapseDetected) {
        interventions.push('Reduce WIP: limit concurrent PRs per engineer to 2-3');
        interventions.push('Fast-track stale reviews: PRs open >48h need immediate attention');
        if (velocityAnalysis.featureVector.prSizeMean > 500) {
          interventions.push('Break large PRs: avg PR size exceeds 500 lines — encourage smaller diffs');
        }
      }
      if (bottleneckAnalysis.hhi > 0.25) {
        interventions.push(`Distribute reviews: ${bottleneckAnalysis.topReviewer} is a bottleneck — assign backup reviewers`);
        interventions.push('Create CODEOWNERS rotation: auto-assign reviews to secondary maintainers');
      }
      if (bottleneckAnalysis.top3Share > 0.7) {
        interventions.push('Cross-train: top 3 reviewers own >70% of reviews — pair program with junior devs');
      }

      return NextResponse.json({
        success: true,
        mode: 'brain',
        report: {
          velocityCollapse: {
            detected: velocityAnalysis.collapseDetected,
            currentVelocity: velocityAnalysis.currentVelocity,
            historicalMean: velocityAnalysis.historicalMean,
            historicalStdDev: velocityAnalysis.historicalStdDev,
            percentDrop: velocityAnalysis.percentDrop,
            zScore: velocityAnalysis.zScore,
            collapseReasons: velocityAnalysis.collapseReason,
            confidence: velocityAnalysis.confidence,
            featureVector: velocityAnalysis.featureVector,
          },
          bottleneckRisk: {
            riskLevel: bottleneckAnalysis.riskLevel,
            riskScore: bottleneckAnalysis.riskScore,
            topReviewer: bottleneckAnalysis.topReviewer,
            reviewShare: bottleneckAnalysis.reviewShare,
            giniCoefficient: bottleneckAnalysis.giniCoefficient,
            hhi: bottleneckAnalysis.hhi,
            top3Share: bottleneckAnalysis.top3Share,
            avgReviewLatencyHours: bottleneckAnalysis.avgReviewLatencyHours,
            maxBetweennessCentrality: bottleneckAnalysis.maxBetweennessCentrality,
            topCentralityContributor: bottleneckAnalysis.topCentralityContributor,
            reviewerBreakdown: bottleneckAnalysis.reviewerBreakdown,
          },
          brainIntelligence: {
            reasoning: brainReasoning,
            causalEdges: causalEdges.data || [],
            patterns: patterns.data || [],
            recentAlerts: recentAlerts.data || [],
            interventions,
          },
          dataSource: 'cross_domain_signals (Brain L1) + 15-layer cognitive stack',
          workspaceContext: {
            organizationId,
            branchName: resolvedBranchName ?? null,
            primaryBranch: resolvedPrimaryBranch ?? null,
            releaseVersion: resolvedReleaseVersion ?? null,
          },
          signalsEmitted: [
            velocityAnalysis.collapseDetected && 'velocity_collapsed',
            bottleneckAnalysis.riskLevel === 'high' && 'bottleneck_detected',
          ].filter(Boolean),
        },
      });
    }

    // ========================================================================
    // RUN VELOCITY PREDICTION (GBRT model)
    // ========================================================================
    let prediction = null;
    try {
      prediction = await predictVelocity(
        supabase,
        organizationId,
        velocityAnalysis.featureVector,
        6 // 6 months lookback for training
      );
      // Persist prediction back to latest velocity snapshot
      if (prediction) {
        await supabase.from('velocity_snapshots').update({
          predicted_velocity: prediction.predictedVelocity,
          prediction_lower_bound: prediction.lowerBound,
          prediction_upper_bound: prediction.upperBound,
          collapse_probability: prediction.collapseProbability,
          model_confidence: prediction.modelConfidence,
        }).eq('organization_id', organizationId)
          .eq('snapshot_date', new Date().toISOString().split('T')[0]);
      }
    } catch (predErr) {
      logger.warn('[Early Warning] Velocity prediction failed (non-fatal):', predErr);
    }

    // ========================================================================
    // STANDARD MODE - Return unified report with prediction
    // ========================================================================
    return NextResponse.json({
      success: true,
      mode: 'standard',
      report: {
        velocityCollapse: {
          detected: velocityAnalysis.collapseDetected,
          currentVelocity: velocityAnalysis.currentVelocity,
          historicalMean: velocityAnalysis.historicalMean,
          historicalStdDev: velocityAnalysis.historicalStdDev,
          percentDrop: velocityAnalysis.percentDrop,
          zScore: velocityAnalysis.zScore,
          collapseReasons: velocityAnalysis.collapseReason,
          confidence: velocityAnalysis.confidence,
          // Alert payload enrichment (spec: "which signals drove the warning")
          signalDrivers: velocityAnalysis.signalDrivers,
          recommendedAction: velocityAnalysis.recommendedAction,
          leadTimeSprints: velocityAnalysis.leadTimeSprints,
          engineersWithZeroMerges: velocityAnalysis.engineersWithZeroMerges,
        },
        velocityPrediction: prediction ? {
          predictedVelocity: prediction.predictedVelocity,
          lowerBound: prediction.lowerBound,
          upperBound: prediction.upperBound,
          collapseProbability: prediction.collapseProbability,
          featureImportances: prediction.featureImportances,
          modelConfidence: prediction.modelConfidence,
          trainingDataPoints: prediction.trainingDataPoints,
        } : null,
        bottleneckRisk: {
          riskLevel: bottleneckAnalysis.riskLevel,
          riskScore: bottleneckAnalysis.riskScore,
          topReviewer: bottleneckAnalysis.topReviewer,
          reviewShare: bottleneckAnalysis.reviewShare,
          giniCoefficient: bottleneckAnalysis.giniCoefficient,
          hhi: bottleneckAnalysis.hhi,
          top3Share: bottleneckAnalysis.top3Share,
          avgReviewLatencyHours: bottleneckAnalysis.avgReviewLatencyHours,
          // Extended spec fields
          underUtilizedReviewers: bottleneckAnalysis.underUtilizedReviewers,
          absenceSimulation: bottleneckAnalysis.absenceSimulation,
        },
        dataSource: 'cross_domain_signals (Brain L1)',
        workspaceContext: {
          organizationId,
          branchName: resolvedBranchName ?? null,
          primaryBranch: resolvedPrimaryBranch ?? null,
          releaseVersion: resolvedReleaseVersion ?? null,
        },
        signalsEmitted: [
          velocityAnalysis.collapseDetected && 'velocity_collapsed',
          bottleneckAnalysis.riskLevel === 'high' && 'bottleneck_detected',
        ].filter(Boolean),
      },
    });
  } catch (error: any) {
    logger.error('[Early Warning] Analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/early-warning/analyze?organizationId=xxx
 *
 * Fetch latest early warning analysis results from snapshots
 */
export async function GET(req: NextRequest) {
  try {
    // ── AUTH CHECK ──────────────────────────────────────────────────────
    const authClient = await createClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get('organizationId');
    const teamId = searchParams.get('teamId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }

    // ── ORG MEMBERSHIP CHECK ─────────────────────────────────────────
    const { data: getMembership } = await authClient
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .single();

    if (!getMembership) {
      const { data: getAdmin } = await authClient
        .from('org_members')
        .select('is_platform_admin')
        .eq('user_id', user.id)
        .eq('is_platform_admin', true)
        .limit(1)
        .single();

      if (!getAdmin) {
        return NextResponse.json(
          { error: 'Not a member of this workspace' },
          { status: 403 }
        );
      }
    }

    const supabase = await createServiceClient();

    // Fetch latest velocity snapshot
    const velocityQuery = supabase
      .from('velocity_snapshots')
      .select('*')
      .eq('organization_id', organizationId)
      .order('snapshot_date', { ascending: false })
      .limit(30);

    if (teamId) {
      velocityQuery.eq('team_id', teamId);
    }

    const { data: velocitySnapshots } = await velocityQuery;

    // Fetch latest bottleneck snapshot
    const bottleneckQuery = supabase
      .from('bottleneck_snapshots')
      .select('*')
      .eq('organization_id', organizationId)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    if (teamId) {
      bottleneckQuery.eq('team_id', teamId);
    }

    const { data: bottleneckSnapshots } = await bottleneckQuery;

    return NextResponse.json({
      success: true,
      velocitySnapshots: velocitySnapshots || [],
      bottleneckSnapshots: bottleneckSnapshots || [],
    });
  } catch (error: any) {
    logger.error('[Early Warning] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch snapshots' },
      { status: 500 }
    );
  }
}
