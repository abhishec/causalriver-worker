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
 * - Velocity Collapse Prediction
 * - Bottleneck Concentration Risk
 *
 * Returns unified alert dashboard data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { analyzeVelocityCollapse, analyzeBottleneckRisk } from '@/lib/p0/velocity-analysis';

export const dynamic = 'force-dynamic';

interface AnalyzeRequest {
  organizationId: string;
  teamId?: string;
  lookbackDays?: number;
  forecastDays?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json();
    const {
      organizationId,
      teamId,
      lookbackDays = 90,
      forecastDays = 7,
    } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    // ========================================================================
    // Run Brain-aligned P0 analysis
    // ========================================================================
    // Reads from cross_domain_signals (engineering domain)
    // Emits collapse/bottleneck signals back to Brain
    const [velocityAnalysis, bottleneckAnalysis] = await Promise.all([
      analyzeVelocityCollapse(supabase, organizationId, lookbackDays),
      analyzeBottleneckRisk(supabase, organizationId, lookbackDays),
    ]);

    // ========================================================================
    // Save velocity snapshot (for dashboard)
    // ========================================================================
    if (velocityAnalysis.velocityTimeSeries.length > 0) {
      const latest = velocityAnalysis.velocityTimeSeries[velocityAnalysis.velocityTimeSeries.length - 1];

      await supabase.from('velocity_snapshots').upsert({
        organization_id: organizationId,
        snapshot_date: new Date().toISOString().split('T')[0],
        window_start: latest.windowStart,
        window_end: latest.windowEnd,
        window_type: '7day',
        team_id: teamId || null,
        repo_id: null,
        prs_merged: latest.prsMerged,
        mean_pr_cycle_time_hours: latest.avgCycleTimeHours,
        pr_cycle_time_variance: null,
        mean_review_latency_hours: null,
        open_pr_count: latest.wipCount,
        prs_per_engineer: null,
      }, {
        onConflict: 'organization_id,snapshot_date,window_type,team_id,repo_id',
        ignoreDuplicates: false,
      });
    }

    // ========================================================================
    // Save bottleneck snapshot (for dashboard)
    // ========================================================================
    await supabase.from('bottleneck_snapshots').upsert({
      organization_id: organizationId,
      snapshot_date: new Date().toISOString().split('T')[0],
      window_start: new Date(Date.now() - lookbackDays * 86400000).toISOString(),
      window_end: new Date().toISOString(),
      team_id: teamId || null,
      top_reviewer_id: null, // Would need engineer_id mapping
      top_reviewer_share: bottleneckAnalysis.reviewShare,
      reviewer_gini_coefficient: bottleneckAnalysis.giniCoefficient,
      reviewer_hhi: null,
      max_betweenness_centrality: null,
      bottleneck_risk_score: bottleneckAnalysis.riskScore,
      risk_level: bottleneckAnalysis.riskLevel,
    }, {
      onConflict: 'organization_id,snapshot_date,team_id',
      ignoreDuplicates: false,
    });

    // ========================================================================
    // Return unified report
    // ========================================================================
    return NextResponse.json({
      success: true,
      report: {
        velocityCollapse: {
          detected: velocityAnalysis.collapseDetected,
          currentVelocity: velocityAnalysis.currentVelocity,
          historicalMean: velocityAnalysis.historicalMean,
          percentDrop: velocityAnalysis.percentDrop,
          confidence: velocityAnalysis.confidence,
        },
        bottleneckRisk: {
          riskLevel: bottleneckAnalysis.riskLevel,
          riskScore: bottleneckAnalysis.riskScore,
          topReviewer: bottleneckAnalysis.topReviewer,
          reviewShare: bottleneckAnalysis.reviewShare,
          giniCoefficient: bottleneckAnalysis.giniCoefficient,
        },
        dataSource: 'cross_domain_signals (Brain L1)',
        signalsEmitted: [
          velocityAnalysis.collapseDetected && 'velocity_collapsed',
          bottleneckAnalysis.riskLevel === 'high' && 'bottleneck_detected',
        ].filter(Boolean),
      },
    });
  } catch (error: any) {
    console.error('[Early Warning] Analysis error:', error);
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
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get('organizationId');
    const teamId = searchParams.get('teamId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required' },
        { status: 400 }
      );
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
    console.error('[Early Warning] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch snapshots' },
      { status: 500 }
    );
  }
}
