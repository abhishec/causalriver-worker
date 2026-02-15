/**
 * Early Warning System for Engineering Teams
 * ============================================
 *
 * Unified system combining:
 * 1. Engineering Bottleneck Concentration Risk Detection
 * 2. Deploy Velocity Collapse Prediction
 *
 * Provides proactive alerts BEFORE problems impact delivery.
 *
 * Usage:
 * ```typescript
 * const warnings = await runEarlyWarningSystem({
 *   supabase,
 *   organizationId: 'acme-corp',
 *   domains: ['backend', 'frontend', 'infrastructure']
 * });
 * ```
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  detectBottlenecks,
  detectAllBottlenecks,
  getBottleneckHeatmap,
  generateBottleneckAlerts,
  type BottleneckMetrics,
  type BottleneckAlertEvent,
} from './bottleneck-detector';
import {
  predictVelocityCollapse,
  buildVelocityTimeSeries,
  getCurrentWIP,
  formatVelocityAlert,
  type VelocityCollapseAlert,
  type VelocityMetrics,
} from './velocity-tracker';

// ============================================================================
// TYPES
// ============================================================================

export interface EarlyWarningConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Domains to monitor for bottlenecks */
  domains?: string[];
  /** Days to look back for velocity data */
  lookbackDays?: number;
  /** Days ahead to forecast velocity */
  forecastDays?: number;
  /** Velocity collapse threshold (% drop) */
  collapseThreshold?: number;
}

export interface EarlyWarningReport {
  /** Organization ID */
  organizationId: string;
  /** Overall risk score (0-100) */
  overallRisk: number;
  /** Bottleneck concentration risks */
  bottleneckRisks: BottleneckMetrics[];
  /** Bottleneck alerts */
  bottleneckAlerts: BottleneckAlertEvent[];
  /** Velocity collapse prediction */
  velocityCollapse: VelocityCollapseAlert | null;
  /** Velocity time series */
  velocityMetrics: VelocityMetrics[];
  /** Bottleneck risk heatmap */
  bottleneckHeatmap: Record<string, number>;
  /** Summary message */
  summary: string;
  /** Generated at */
  generatedAt: string;
}

// ============================================================================
// EARLY WARNING SYSTEM
// ============================================================================

/**
 * Run complete early warning system
 */
export async function runEarlyWarningSystem(
  config: EarlyWarningConfig
): Promise<EarlyWarningReport> {
  const {
    supabase,
    organizationId,
    domains = ['backend', 'frontend', 'infrastructure', 'data'],
    lookbackDays = 90,
    forecastDays = 7,
    collapseThreshold = 30,
  } = config;

  // 1. Detect bottleneck concentration risks
  const bottleneckRisks = await detectAllBottlenecks(
    { supabase, organizationId, lookbackDays },
    domains
  );

  // 2. Generate bottleneck alerts
  const bottleneckAlerts: BottleneckAlertEvent[] = [];
  for (const metrics of bottleneckRisks) {
    const alerts = generateBottleneckAlerts(metrics);
    bottleneckAlerts.push(...alerts);
  }

  // 3. Get bottleneck risk heatmap
  const bottleneckHeatmap = await getBottleneckHeatmap(
    { supabase, organizationId, lookbackDays },
    domains
  );

  // 4. Predict velocity collapse
  const velocityCollapse = await predictVelocityCollapse({
    supabase,
    organizationId,
    lookbackDays,
    forecastDays,
    collapseThreshold,
  });

  // 5. Build velocity time series for reference
  const velocityMetrics = await buildVelocityTimeSeries({
    supabase,
    organizationId,
    lookbackDays,
  });

  // 6. Calculate overall risk score
  const bottleneckRisk =
    Object.values(bottleneckHeatmap).reduce((a, b) => a + b, 0) /
    Math.max(Object.keys(bottleneckHeatmap).length, 1);

  const velocityRisk = velocityCollapse
    ? Math.min(100, velocityCollapse.predictedDrop * 2)
    : 0;

  const overallRisk = Math.round((bottleneckRisk * 0.4 + velocityRisk * 0.6));

  // 7. Generate summary
  let summary = `## Early Warning Report for ${organizationId}\n\n`;
  summary += `**Overall Risk Score:** ${overallRisk}/100\n\n`;

  if (bottleneckAlerts.length > 0) {
    summary += `⚠️ **${bottleneckAlerts.length} Bottleneck Risk(s) Detected**\n`;
    for (const alert of bottleneckAlerts.slice(0, 3)) {
      summary += `- ${alert.message}\n`;
    }
    summary += '\n';
  }

  if (velocityCollapse) {
    summary += formatVelocityAlert(velocityCollapse);
  } else {
    summary += `✅ **No velocity collapse predicted** in next ${forecastDays} days\n`;
  }

  if (overallRisk < 30) {
    summary += '\n✅ **Team health is good** - no critical risks detected';
  } else if (overallRisk < 60) {
    summary += '\n⚡ **Moderate risk** - monitor trends and implement recommended actions';
  } else {
    summary += '\n🚨 **HIGH RISK** - immediate intervention required to prevent delivery impact';
  }

  return {
    organizationId,
    overallRisk,
    bottleneckRisks,
    bottleneckAlerts,
    velocityCollapse,
    velocityMetrics,
    bottleneckHeatmap,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Run early warning system and emit alerts
 */
export async function runEarlyWarningWithAlerts(
  config: EarlyWarningConfig
): Promise<EarlyWarningReport> {
  const report = await runEarlyWarningSystem(config);

  // Emit alerts to cascade system (optional - can integrate with existing alerting)
  if (report.overallRisk >= 60 || report.velocityCollapse?.severity === 'critical') {
    console.warn('🚨 CRITICAL EARLY WARNING ALERT:', {
      organizationId: report.organizationId,
      risk: report.overallRisk,
      bottlenecks: report.bottleneckAlerts.length,
      velocityCollapse: !!report.velocityCollapse,
    });
  }

  return report;
}

/**
 * Get summary statistics for dashboard
 */
export function getEarlyWarningSummary(report: EarlyWarningReport): {
  totalBottlenecks: number;
  criticalBottlenecks: number;
  velocityRisk: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  topRecommendations: string[];
} {
  const criticalBottlenecks = report.bottleneckAlerts.filter(
    (a) => a.severity === 'critical'
  ).length;

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (report.overallRisk >= 80) riskLevel = 'critical';
  else if (report.overallRisk >= 60) riskLevel = 'high';
  else if (report.overallRisk >= 40) riskLevel = 'medium';

  const topRecommendations: string[] = [];

  // Collect top recommendations from bottlenecks
  for (const metrics of report.bottleneckRisks) {
    for (const bottleneck of metrics.bottlenecks.slice(0, 2)) {
      topRecommendations.push(...bottleneck.recommendations.slice(0, 2));
    }
  }

  // Add velocity interventions
  if (report.velocityCollapse) {
    for (const intervention of report.velocityCollapse.interventions.slice(0, 3)) {
      topRecommendations.push(intervention.description);
    }
  }

  // Deduplicate and limit to top 5
  const uniqueRecommendations = Array.from(new Set(topRecommendations)).slice(0, 5);

  return {
    totalBottlenecks: report.bottleneckAlerts.length,
    criticalBottlenecks,
    velocityRisk: !!report.velocityCollapse,
    riskLevel,
    topRecommendations: uniqueRecommendations,
  };
}
