#!/usr/bin/env tsx
/**
 * Run early-warning analysis directly (bypasses API auth)
 * Calls the same functions as /api/early-warning/analyze
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../platform/.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const orgId = '00000000-0000-4000-b000-000000000001';

// Import the analysis functions from the platform lib
// We need to use dynamic import since they're in the platform directory
async function main() {
  console.log('=== RUNNING EARLY WARNING ANALYSIS ===\n');
  console.log('Org:', orgId);
  console.log('Supabase URL:', supabaseUrl.substring(0, 30) + '...');

  // We'll call the functions directly by importing from the platform lib
  // First, let's set up the path aliases
  const platformLib = path.resolve(__dirname, '../platform/lib/p0');

  // Import dynamically
  const { analyzeVelocityCollapse, analyzeBottleneckRisk } = await import(
    platformLib + '/velocity-analysis'
  );

  // Run velocity collapse analysis
  console.log('\n--- Velocity Collapse Analysis ---');
  try {
    const velocityResult = await analyzeVelocityCollapse(supabase, orgId);
    console.log('Current velocity:', velocityResult.currentVelocity, 'PRs/week');
    console.log('Historical mean:', velocityResult.historicalMean);
    console.log('Historical stddev:', velocityResult.historicalStdDev);
    console.log('Percent drop:', velocityResult.percentDrop + '%');
    console.log('Z-score:', velocityResult.zScore);
    console.log('Collapse detected:', velocityResult.collapseDetected);
    console.log('Confidence:', velocityResult.confidence);
    console.log('Velocity time series points:', velocityResult.velocityTimeSeries?.length || 0);
    console.log('Collapse reasons:', velocityResult.collapseReason);

    // Upsert to velocity_snapshots
    // UNIQUE constraint: (organization_id, snapshot_date, window_type, team_id, repo_id)
    const snapshotData = {
      organization_id: orgId,
      team_id: orgId,
      repo_id: null as string | null,
      snapshot_date: new Date().toISOString().split('T')[0],  // DATE type needs YYYY-MM-DD
      window_type: '7day',
      prs_merged: velocityResult.currentVelocity,
      story_points_completed: 0,
      mean_pr_cycle_time_hours: velocityResult.velocityTimeSeries?.[0]?.avgCycleTimeHours || 0,
      pr_cycle_time_variance: velocityResult.velocityTimeSeries?.[0]?.cycleTimeVariance || 0,
      open_pr_count: velocityResult.velocityTimeSeries?.[0]?.openPrCount || 0,
      prs_per_engineer: velocityResult.velocityTimeSeries?.[0]?.prsPerEngineer || 0,
      z_score: velocityResult.zScore,
      percent_drop: velocityResult.percentDrop,
      collapse_detected: velocityResult.collapseDetected,
      historical_mean: velocityResult.historicalMean,
      historical_stddev: velocityResult.historicalStdDev,
    };
    // Delete-then-insert pattern (COALESCE unique index doesn't support onConflict via PostgREST)
    await supabase.from('velocity_snapshots')
      .delete()
      .eq('organization_id', orgId)
      .eq('snapshot_date', snapshotData.snapshot_date)
      .eq('window_type', '7day')
      .is('team_id', null);
    const { error: vsErr } = await supabase.from('velocity_snapshots').insert(snapshotData);
    console.log('velocity_snapshots upsert:', vsErr ? 'ERROR: ' + vsErr.message : 'OK');
  } catch (e: any) {
    console.error('Velocity analysis error:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  }

  // Run bottleneck risk analysis
  console.log('\n--- Bottleneck Risk Analysis ---');
  try {
    const bottleneckResult = await analyzeBottleneckRisk(supabase, orgId);
    console.log('Top reviewer:', bottleneckResult.topReviewer);
    console.log('Review share:', (bottleneckResult.reviewShare * 100).toFixed(1) + '%');
    console.log('Gini coefficient:', bottleneckResult.giniCoefficient.toFixed(3));
    console.log('HHI:', bottleneckResult.hhi.toFixed(3));
    console.log('Top-3 share:', (bottleneckResult.top3Share * 100).toFixed(1) + '%');
    console.log('Max betweenness centrality:', bottleneckResult.maxBetweennessCentrality.toFixed(3));
    console.log('Top centrality contributor:', bottleneckResult.topCentralityContributor);
    console.log('Risk score:', bottleneckResult.riskScore.toFixed(1) + '/100');
    console.log('Risk level:', bottleneckResult.riskLevel);
    console.log('Avg review latency:', bottleneckResult.avgReviewLatencyHours?.toFixed(1) + 'h');
    console.log('Reviewer breakdown:', bottleneckResult.reviewerBreakdown?.length || 0, 'reviewers');

    // Upsert to bottleneck_snapshots
    // UNIQUE constraint: (organization_id, snapshot_date, team_id)
    const bnSnapshot = {
      organization_id: orgId,
      snapshot_date: new Date().toISOString().split('T')[0],  // DATE type needs YYYY-MM-DD
      team_id: null as string | null,
      reviewer_gini_coefficient: bottleneckResult.giniCoefficient,
      reviewer_hhi: bottleneckResult.hhi,
      max_betweenness_centrality: bottleneckResult.maxBetweennessCentrality,
      bottleneck_risk_score: bottleneckResult.riskScore,
      risk_level: bottleneckResult.riskLevel,
      top_reviewer_share: bottleneckResult.reviewShare,
      top_reviewer: bottleneckResult.topReviewer,
      top_centrality_contributor: bottleneckResult.topCentralityContributor,
      avg_review_latency_hours: bottleneckResult.avgReviewLatencyHours,
      reviewer_count: bottleneckResult.reviewerBreakdown?.length || 0,
      reviewer_breakdown: bottleneckResult.reviewerBreakdown || [],
    };
    // Delete-then-insert pattern (COALESCE unique index doesn't support onConflict via PostgREST)
    await supabase.from('bottleneck_snapshots')
      .delete()
      .eq('organization_id', orgId)
      .eq('snapshot_date', bnSnapshot.snapshot_date)
      .is('team_id', null);
    const { error: bnErr } = await supabase.from('bottleneck_snapshots').insert(bnSnapshot);
    console.log('bottleneck_snapshots upsert:', bnErr ? 'ERROR: ' + bnErr.message : 'OK');
  } catch (e: any) {
    console.error('Bottleneck analysis error:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  }

  console.log('\n=== DONE ===');
}

main().catch(e => console.error(e));
