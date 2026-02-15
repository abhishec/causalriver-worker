/**
 * Brain Run Reporter — "Your Eyes for the Brain"
 *
 * Generates comprehensive, human-readable reports showing exactly what happened
 * in any brain operation:
 * - Which layers have data, which are empty
 * - Which operations succeeded, which failed
 * - Which layers triggered which downstream operations
 * - Complete data lineage and failure analysis
 *
 * Usage:
 * ```ts
 * const reporter = createBrainRunReporter({ supabase, organizationId });
 * const report = await reporter.generateRunReport({ hours: 1 });
 * console.log(report.summary);
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

export interface BrainRunReporterConfig {
  supabase: SupabaseClient;
  organizationId: string;
}

export interface LayerStatus {
  layer_number: number;
  layer_name: string;
  has_data: boolean;
  record_count: number;
  latest_timestamp: string | null;
  health_status: 'healthy' | 'degraded' | 'failing' | 'empty';

  // Layer-specific metrics
  success_count: number;
  failure_count: number;
  error_messages: string[];

  // Performance metrics
  avg_latency_ms: number | null;
  max_latency_ms: number | null;
  p95_latency_ms: number | null;

  // Quality metrics (where applicable)
  avg_quality_score: number | null;
  low_quality_count: number;

  // Gaps detected
  gaps: string[];
}

export interface LayerTriggerChain {
  source_layer: number;
  source_operation: string;
  target_layer: number;
  target_operation: string;
  trigger_count: number;
  success_rate: number;
}

export interface BrainRunReport {
  organization_id: string;
  report_generated_at: string;
  time_window: {
    start: string;
    end: string;
    hours: number;
  };

  // Per-layer status
  layers: LayerStatus[];

  // Cross-layer triggers
  trigger_chains: LayerTriggerChain[];

  // Feedback loops
  feedback: {
    total_predictions: number;
    verified_predictions: number;
    correct_predictions: number;
    accuracy: number;
    calibration_status: 'well_calibrated' | 'overconfident' | 'underconfident' | 'insufficient_data';
    unverified_predictions: number;
  };

  // Consolidation runs (if any)
  consolidation: {
    runs_executed: number;
    last_run_status: 'success' | 'partial' | 'failed' | 'none';
    last_run_at: string | null;
    discoveries: string[];
    warnings: string[];
  };

  // Overall health
  overall_health: {
    score: number; // 0-100
    status: 'healthy' | 'degraded' | 'critical';
    active_layers: number;
    empty_layers: number;
    failing_layers: number;
  };

  // Executive summary (human-readable)
  summary: string;

  // Detailed findings
  findings: {
    successes: string[];
    issues: string[];
    recommendations: string[];
  };
}

export interface BrainRunReporter {
  generateRunReport: (options?: { hours?: number }) => Promise<BrainRunReport>;
  getLayerStatus: (layerNumber: number, hours?: number) => Promise<LayerStatus>;
  getFailureAnalysis: (hours?: number) => Promise<{
    failed_operations: Array<{
      layer: number;
      operation_type: string;
      error_count: number;
      error_messages: string[];
    }>;
  }>;
  getTriggerAnalysis: (hours?: number) => Promise<LayerTriggerChain[]>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function createBrainRunReporter(
  config: BrainRunReporterConfig
): BrainRunReporter {
  const { supabase, organizationId } = config;

  const LAYER_TABLES = {
    1: 'obs_signal_ingestion',
    2: 'obs_entity_resolution',
    3: 'obs_semantic_operations',
    4: 'obs_causal_calculations',
    5: 'obs_pattern_learning',
    6: 'obs_agent_executions',
    7: 'obs_connector_operations',
    8: 'obs_deep_dreaming',
    9: 'obs_hierarchical_memory',
    10: 'obs_curiosity_engine',
    11: 'obs_self_modifying_cognition',
    12: 'obs_intelligence_mesh',
    13: 'obs_causal_imagination',
    14: 'obs_theory_of_mind',
    15: 'obs_temporal_consciousness',
  };

  const LAYER_NAMES = {
    1: 'Signal Ingestion',
    2: 'Entity Resolution',
    3: 'Semantic Memory',
    4: 'Causal Graph',
    5: 'Pattern Learning',
    6: 'Agent Orchestration',
    7: 'Connector Sync',
    8: 'Deep Dreaming',
    9: 'Hierarchical Memory',
    10: 'Curiosity Engine',
    11: 'Self-Modifying Cognition',
    12: 'Intelligence Mesh',
    13: 'Causal Imagination',
    14: 'Theory of Mind',
    15: 'Temporal Consciousness',
  };

  // ──────────────────────────────────────────────────────────
  // LAYER STATUS ANALYSIS
  // ──────────────────────────────────────────────────────────

  async function getLayerStatus(
    layerNumber: number,
    hours = 24
  ): Promise<LayerStatus> {
    const table = LAYER_TABLES[layerNumber as keyof typeof LAYER_TABLES];
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Get record count and latest timestamp
    const { data: records, error } = await supabase
      .from(table)
      .select('*')
      .eq('organization_id', organizationId)
      .gte('created_at', since);

    if (error) {
      return {
        layer_number: layerNumber,
        layer_name: LAYER_NAMES[layerNumber as keyof typeof LAYER_NAMES],
        has_data: false,
        record_count: 0,
        latest_timestamp: null,
        health_status: 'empty',
        success_count: 0,
        failure_count: 0,
        error_messages: [],
        avg_latency_ms: null,
        max_latency_ms: null,
        p95_latency_ms: null,
        avg_quality_score: null,
        low_quality_count: 0,
        gaps: [`Failed to query ${table}: ${error.message}`],
      };
    }

    const recordCount = records?.length || 0;
    const hasData = recordCount > 0;

    // Calculate timestamps
    const timestamps = records?.map((r: any) => new Date(r.created_at).getTime()) || [];
    const latestTimestamp = timestamps.length > 0
      ? new Date(Math.max(...timestamps)).toISOString()
      : null;

    // Calculate success/failure counts
    let successCount = 0;
    let failureCount = 0;
    const errorMessages: string[] = [];

    for (const record of records || []) {
      // Layer-specific status detection
      if (layerNumber === 6) {
        // Agents
        if (record.status === 'success') successCount++;
        else if (record.status === 'failed') {
          failureCount++;
          if (record.error_message) errorMessages.push(record.error_message);
        }
      } else if (layerNumber === 7) {
        // Connectors
        if (record.errors_count === 0) successCount++;
        else {
          failureCount++;
          if (record.error_messages) errorMessages.push(...record.error_messages);
        }
      } else if (layerNumber === 4) {
        // Causal calculations
        if (record.is_significant) successCount++;
        else failureCount++;
      } else {
        // Default: assume success if no explicit failure
        successCount++;
      }
    }

    // Calculate latency metrics
    const latencies: number[] = [];
    for (const record of records || []) {
      const latencyKey =
        layerNumber === 1 ? 'ingestion_latency_ms' :
        layerNumber === 2 ? 'resolution_latency_ms' :
        layerNumber === 3 ? 'operation_latency_ms' :
        layerNumber === 4 ? 'calculation_latency_ms' :
        layerNumber === 5 ? 'operation_latency_ms' :
        layerNumber === 6 ? 'execution_latency_ms' :
        'operation_latency_ms';

      if (record[latencyKey]) latencies.push(record[latencyKey]);
    }

    const avgLatency = latencies.length > 0
      ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
      : null;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : null;
    const sortedLatencies = latencies.sort((a, b) => a - b);
    const p95Latency = sortedLatencies.length > 0
      ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)]
      : null;

    // Calculate quality metrics
    let avgQualityScore: number | null = null;
    let lowQualityCount = 0;
    if (layerNumber === 1 || layerNumber === 7) {
      const qualityScores = records
        ?.map((r: any) => r.quality_score)
        .filter((s: any) => s != null) || [];

      if (qualityScores.length > 0) {
        avgQualityScore = qualityScores.reduce((sum: number, s: number) => sum + s, 0) / qualityScores.length;
        lowQualityCount = qualityScores.filter((s: number) => s < 0.7).length;
      }
    }

    // Detect gaps
    const gaps: string[] = [];
    if (!hasData) {
      gaps.push(`No data in last ${hours}h`);
    }
    if (failureCount > 0) {
      gaps.push(`${failureCount} failed operations`);
    }
    if (lowQualityCount > 0) {
      gaps.push(`${lowQualityCount} low-quality records (score < 0.7)`);
    }

    // Determine health status
    let healthStatus: LayerStatus['health_status'] = 'healthy';
    if (!hasData) healthStatus = 'empty';
    else if (failureCount > successCount) healthStatus = 'failing';
    else if (failureCount > 0 || lowQualityCount > recordCount * 0.2) healthStatus = 'degraded';

    return {
      layer_number: layerNumber,
      layer_name: LAYER_NAMES[layerNumber as keyof typeof LAYER_NAMES],
      has_data: hasData,
      record_count: recordCount,
      latest_timestamp: latestTimestamp,
      health_status: healthStatus,
      success_count: successCount,
      failure_count: failureCount,
      error_messages: [...new Set(errorMessages)].slice(0, 5), // Dedupe, max 5
      avg_latency_ms: avgLatency ? Math.round(avgLatency) : null,
      max_latency_ms: maxLatency,
      p95_latency_ms: p95Latency,
      avg_quality_score: avgQualityScore ? Math.round(avgQualityScore * 100) / 100 : null,
      low_quality_count: lowQualityCount,
      gaps,
    };
  }

  // ──────────────────────────────────────────────────────────
  // TRIGGER ANALYSIS
  // ──────────────────────────────────────────────────────────

  async function getTriggerAnalysis(hours = 24): Promise<LayerTriggerChain[]> {
    // Analyze how layers trigger each other
    // For now, return inferred triggers based on timestamps
    // In the future, this could track explicit trigger_event_id fields

    const chains: LayerTriggerChain[] = [];

    // L1 → L4: Signals trigger causal calculations
    // L4 → L5: Causal discoveries trigger pattern learning
    // L5 → L6: Patterns trigger agents
    // L6 → L7: Agents trigger connector operations

    // This is a placeholder - full implementation would
    // analyze actual trigger_event_id fields and timestamps

    return chains;
  }

  // ──────────────────────────────────────────────────────────
  // FAILURE ANALYSIS
  // ──────────────────────────────────────────────────────────

  async function getFailureAnalysis(hours = 24) {
    const failedOperations: Array<{
      layer: number;
      operation_type: string;
      error_count: number;
      error_messages: string[];
    }> = [];

    // Check agent failures (L6)
    const { data: agentFailures } = await supabase
      .from('obs_agent_executions')
      .select('agent_type, error_message')
      .eq('organization_id', organizationId)
      .eq('status', 'failed')
      .gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString());

    if (agentFailures && agentFailures.length > 0) {
      const grouped = agentFailures.reduce((acc: any, f: any) => {
        if (!acc[f.agent_type]) acc[f.agent_type] = [];
        acc[f.agent_type].push(f.error_message);
        return acc;
      }, {});

      for (const [agentType, errors] of Object.entries(grouped) as any) {
        failedOperations.push({
          layer: 6,
          operation_type: agentType,
          error_count: errors.length,
          error_messages: [...new Set(errors as string[])].slice(0, 3),
        });
      }
    }

    // Check connector failures (L7)
    const { data: connectorFailures } = await supabase
      .from('obs_connector_operations')
      .select('connector_type, error_messages, errors_count')
      .eq('organization_id', organizationId)
      .gt('errors_count', 0)
      .gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString());

    if (connectorFailures && connectorFailures.length > 0) {
      const grouped = connectorFailures.reduce((acc: any, f: any) => {
        if (!acc[f.connector_type]) acc[f.connector_type] = [];
        if (f.error_messages) acc[f.connector_type].push(...f.error_messages);
        return acc;
      }, {});

      for (const [connectorType, errors] of Object.entries(grouped) as any) {
        failedOperations.push({
          layer: 7,
          operation_type: connectorType,
          error_count: errors.length,
          error_messages: [...new Set(errors as string[])].slice(0, 3),
        });
      }
    }

    return { failed_operations: failedOperations };
  }

  // ──────────────────────────────────────────────────────────
  // FULL RUN REPORT
  // ──────────────────────────────────────────────────────────

  async function generateRunReport(options?: { hours?: number }): Promise<BrainRunReport> {
    const hours = options?.hours || 24;
    const reportStart = Date.now();
    const timeEnd = new Date();
    const timeStart = new Date(Date.now() - hours * 60 * 60 * 1000);

    // 1. Get status for all 15 layers
    const layerStatuses = await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(n => getLayerStatus(n, hours))
    );

    // 2. Get feedback loop status
    const { data: feedbackData } = await supabase
      .from('obs_feedback_loops')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('created_at', timeStart.toISOString());

    const totalPredictions = feedbackData?.length || 0;
    const verifiedPredictions = feedbackData?.filter((f: any) => f.verified_at != null).length || 0;
    const correctPredictions = feedbackData?.filter((f: any) => f.was_correct === true).length || 0;
    const accuracy = verifiedPredictions > 0 ? correctPredictions / verifiedPredictions : 0;
    const unverifiedPredictions = totalPredictions - verifiedPredictions;

    // Determine calibration status
    let calibrationStatus: BrainRunReport['feedback']['calibration_status'] = 'insufficient_data';
    if (verifiedPredictions >= 10) {
      const avgConfidence = feedbackData
        ?.filter((f: any) => f.verified_at != null)
        .reduce((sum: number, f: any) => sum + (f.confidence || 0), 0) / verifiedPredictions;

      if (Math.abs(avgConfidence - accuracy) < 0.1) calibrationStatus = 'well_calibrated';
      else if (avgConfidence > accuracy + 0.1) calibrationStatus = 'overconfident';
      else calibrationStatus = 'underconfident';
    }

    // 3. Get consolidation status
    const { data: consolidationData } = await supabase
      .from('obs_consolidation_cycles')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('created_at', timeStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    const lastConsolidation = consolidationData?.[0] || null;

    // 4. Calculate overall health
    const activeLayers = layerStatuses.filter(l => l.has_data).length;
    const emptyLayers = layerStatuses.filter(l => !l.has_data).length;
    const failingLayers = layerStatuses.filter(l => l.health_status === 'failing').length;

    const overallScore = layerStatuses.reduce((sum, l) => {
      if (l.health_status === 'healthy') return sum + 100;
      if (l.health_status === 'degraded') return sum + 70;
      if (l.health_status === 'failing') return sum + 30;
      return sum;
    }, 0) / 15;

    const overallStatus: BrainRunReport['overall_health']['status'] =
      overallScore >= 80 ? 'healthy' :
      overallScore >= 50 ? 'degraded' :
      'critical';

    // 5. Get failure analysis
    const failureAnalysis = await getFailureAnalysis(hours);

    // 6. Generate executive summary
    const summaryParts: string[] = [];

    summaryParts.push(`🧠 BRAIN RUN REPORT (Last ${hours}h)`);
    summaryParts.push('');
    summaryParts.push(`📊 Overall Health: ${overallScore.toFixed(0)}/100 (${overallStatus.toUpperCase()})`);
    summaryParts.push(`✅ Active Layers: ${activeLayers}/15`);
    summaryParts.push(`❌ Empty Layers: ${emptyLayers}/15`);
    if (failingLayers > 0) summaryParts.push(`⚠️  Failing Layers: ${failingLayers}/15`);
    summaryParts.push('');

    // Layer-by-layer status
    summaryParts.push('📋 LAYER-BY-LAYER STATUS:');
    for (const layer of layerStatuses) {
      const icon =
        layer.health_status === 'healthy' ? '✅' :
        layer.health_status === 'degraded' ? '⚠️ ' :
        layer.health_status === 'failing' ? '❌' :
        '⭕';

      summaryParts.push(`  ${icon} L${layer.layer_number} ${layer.layer_name}: ${layer.record_count} records`);

      if (layer.has_data) {
        if (layer.success_count > 0) {
          summaryParts.push(`      ✓ ${layer.success_count} successful operations`);
        }
        if (layer.failure_count > 0) {
          summaryParts.push(`      ✗ ${layer.failure_count} failed operations`);
        }
        if (layer.avg_latency_ms) {
          summaryParts.push(`      ⏱  Avg latency: ${layer.avg_latency_ms}ms (p95: ${layer.p95_latency_ms}ms)`);
        }
        if (layer.avg_quality_score) {
          summaryParts.push(`      📈 Avg quality: ${(layer.avg_quality_score * 100).toFixed(0)}%`);
        }
        if (layer.gaps.length > 0) {
          summaryParts.push(`      ⚠️  Gaps: ${layer.gaps.join(', ')}`);
        }
      } else {
        summaryParts.push(`      ⭕ NO DATA in last ${hours}h`);
      }
    }

    summaryParts.push('');

    // Feedback loop status
    if (totalPredictions > 0) {
      summaryParts.push('🔄 FEEDBACK LOOP STATUS:');
      summaryParts.push(`  Total predictions: ${totalPredictions}`);
      summaryParts.push(`  Verified: ${verifiedPredictions} (${((verifiedPredictions/totalPredictions)*100).toFixed(0)}%)`);
      if (verifiedPredictions > 0) {
        summaryParts.push(`  Accuracy: ${(accuracy * 100).toFixed(1)}%`);
        summaryParts.push(`  Calibration: ${calibrationStatus.toUpperCase()}`);
      }
      if (unverifiedPredictions > 0) {
        summaryParts.push(`  ⏳ Pending verification: ${unverifiedPredictions}`);
      }
      summaryParts.push('');
    } else {
      summaryParts.push('🔄 FEEDBACK LOOP: No predictions in window');
      summaryParts.push('');
    }

    // Consolidation status
    if (lastConsolidation) {
      summaryParts.push('🌙 LAST CONSOLIDATION RUN:');
      summaryParts.push(`  Status: ${lastConsolidation.status.toUpperCase()}`);
      summaryParts.push(`  Signals processed: ${lastConsolidation.signals_in_window || 0}`);
      summaryParts.push(`  New relationships: ${lastConsolidation.new_relationships || 0}`);
      summaryParts.push(`  Discoveries: ${(lastConsolidation.discoveries || []).length}`);
      if (lastConsolidation.discoveries && lastConsolidation.discoveries.length > 0) {
        for (const discovery of lastConsolidation.discoveries.slice(0, 3)) {
          summaryParts.push(`    - ${discovery}`);
        }
      }
      if (lastConsolidation.warnings && lastConsolidation.warnings.length > 0) {
        summaryParts.push(`  ⚠️  Warnings: ${lastConsolidation.warnings.length}`);
        for (const warning of lastConsolidation.warnings.slice(0, 2)) {
          summaryParts.push(`    - ${warning}`);
        }
      }
      summaryParts.push('');
    }

    // Failures
    if (failureAnalysis.failed_operations.length > 0) {
      summaryParts.push('❌ FAILURES DETECTED:');
      for (const failure of failureAnalysis.failed_operations) {
        summaryParts.push(`  L${failure.layer} ${failure.operation_type}: ${failure.error_count} errors`);
        for (const msg of failure.error_messages) {
          summaryParts.push(`    - ${msg}`);
        }
      }
      summaryParts.push('');
    }

    const summary = summaryParts.join('\n');

    // 7. Generate findings
    const successes: string[] = [];
    const issues: string[] = [];
    const recommendations: string[] = [];

    for (const layer of layerStatuses) {
      if (layer.has_data && layer.health_status === 'healthy') {
        successes.push(`L${layer.layer_number} ${layer.layer_name} is operating normally (${layer.record_count} records, ${layer.success_count} successes)`);
      }

      if (!layer.has_data) {
        issues.push(`L${layer.layer_number} ${layer.layer_name} has no data in last ${hours}h`);
        recommendations.push(`Investigate why L${layer.layer_number} ${layer.layer_name} is not receiving data`);
      }

      if (layer.failure_count > 0) {
        issues.push(`L${layer.layer_number} ${layer.layer_name} has ${layer.failure_count} failures`);
        recommendations.push(`Review errors in L${layer.layer_number}: ${layer.error_messages.slice(0, 2).join('; ')}`);
      }
    }

    if (lastConsolidation && lastConsolidation.new_relationships === 0) {
      issues.push('Consolidation discovered 0 new causal relationships');
      recommendations.push('Lower minObservations threshold or ensure signals have sufficient data');
    }

    if (verifiedPredictions > 0 && accuracy < 0.5) {
      issues.push(`Low prediction accuracy: ${(accuracy * 100).toFixed(1)}%`);
      recommendations.push('Review causal edge weights and consider retraining');
    }

    // 8. Build final report
    return {
      organization_id: organizationId,
      report_generated_at: new Date().toISOString(),
      time_window: {
        start: timeStart.toISOString(),
        end: timeEnd.toISOString(),
        hours,
      },
      layers: layerStatuses,
      trigger_chains: [], // TODO: implement
      feedback: {
        total_predictions: totalPredictions,
        verified_predictions: verifiedPredictions,
        correct_predictions: correctPredictions,
        accuracy,
        calibration_status: calibrationStatus,
        unverified_predictions: unverifiedPredictions,
      },
      consolidation: {
        runs_executed: consolidationData?.length || 0,
        last_run_status: lastConsolidation?.status || 'none',
        last_run_at: lastConsolidation?.completed_at || null,
        discoveries: (lastConsolidation?.discoveries || []) as string[],
        warnings: (lastConsolidation?.warnings || []) as string[],
      },
      overall_health: {
        score: Math.round(overallScore),
        status: overallStatus,
        active_layers: activeLayers,
        empty_layers: emptyLayers,
        failing_layers: failingLayers,
      },
      summary,
      findings: {
        successes,
        issues,
        recommendations,
      },
    };
  }

  return {
    generateRunReport,
    getLayerStatus,
    getFailureAnalysis,
    getTriggerAnalysis,
  };
}
