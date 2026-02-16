/**
 * Early Warning System - Analyze Endpoint
 * ========================================
 *
 * Runs P0 Early Warning System analysis:
 * - Velocity Collapse Prediction
 * - Bottleneck Concentration Risk
 *
 * Returns unified alert dashboard data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { runEarlyWarningSystem } from '@nexus-ai/memory-stack';

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

    // Run early warning system
    const report = await runEarlyWarningSystem({
      supabase,
      organizationId,
      lookbackDays,
      forecastDays,
      collapseThreshold: 25, // 25% drop triggers collapse alert
    });

    // ========================================================================
    // Save velocity snapshot
    // ========================================================================
    if (report.velocityMetrics && report.velocityMetrics.length > 0) {
      const latestMetrics = report.velocityMetrics[report.velocityMetrics.length - 1];

      await supabase.from('velocity_snapshots').upsert({
        organization_id: organizationId,
        snapshot_date: new Date().toISOString().split('T')[0],
        window_start: new Date(Date.now() - lookbackDays * 86400000).toISOString(),
        window_end: new Date().toISOString(),
        window_type: '14day',
        team_id: teamId || null,
        repo_id: null, // Organization-level
        prs_merged: latestMetrics.prsMerged || 0,
        mean_pr_cycle_time_hours: latestMetrics.avgReviewTimeHours || null,
        pr_cycle_time_variance: null,
        mean_review_latency_hours: latestMetrics.avgReviewTimeHours || null,
        open_pr_count: latestMetrics.wipCount || 0,
        prs_per_engineer: null,
      }, {
        onConflict: 'organization_id,snapshot_date,window_type,team_id,repo_id',
        ignoreDuplicates: false,
      });
    }

    // ========================================================================
    // Save bottleneck snapshots
    // ========================================================================
    if (report.bottleneckRisks && report.bottleneckRisks.length > 0) {
      for (const bottleneck of report.bottleneckRisks) {
        const topBottleneck = bottleneck.bottlenecks[0] || null;
        await supabase.from('bottleneck_snapshots').upsert({
          organization_id: organizationId,
          snapshot_date: new Date().toISOString().split('T')[0],
          window_start: new Date(Date.now() - lookbackDays * 86400000).toISOString(),
          window_end: new Date().toISOString(),
          team_id: teamId || null,
          top_reviewer_id: topBottleneck?.contributorId || null,
          top_reviewer_share: topBottleneck?.expertiseShare || null,
          reviewer_gini_coefficient: bottleneck.giniCoefficient || null,
          reviewer_hhi: null,
          max_betweenness_centrality: topBottleneck?.centralityScore || null,
          bottleneck_risk_score: bottleneck.top3Concentration || 0,
          risk_level: topBottleneck?.severity || 'low',
        }, {
          onConflict: 'organization_id,snapshot_date,team_id',
          ignoreDuplicates: false,
        });
      }
    }

    // Return report
    return NextResponse.json({
      success: true,
      report,
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
