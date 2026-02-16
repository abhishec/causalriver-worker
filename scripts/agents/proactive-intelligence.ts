/**
 * NexusBrain Proactive Intelligence Agent (V6 Manus)
 *
 * Brain Region: Amygdala (Proactive Alerting)
 * Neurological Function: Push-Based Insight Delivery & Threat Detection
 *
 * Instead of waiting for questions, proactively surfaces insights, warnings,
 * and opportunities based on continuous monitoring of the brain's state.
 *
 * Features:
 * - P0 Early Warning: Velocity Collapse + Bottleneck Concentration (Brain-Integrated)
 * - Threshold-based alerting (metric crosses a boundary)
 * - Trend-based alerts (metric on a concerning trajectory)
 * - Cascade early warning (cascade pattern starting to form)
 * - Knowledge decay alerts (stale information)
 * - Opportunity detection (positive signals that need attention)
 *
 * Architecture: Routes through BrainCommander → 15-Layer Cognitive Stack
 * - L3 Dreaming: Causal discovery (Granger causality in cognitive context)
 * - L5 Curiosity: Root cause exploration (WHY bottlenecks exist)
 * - L6 Self-Modifying: Confidence calibration from historical accuracy
 * - L9 Theory of Mind: Contributor perspective modeling (burnout, engagement)
 * - L11 Red Team: Stress-test predictions with adversarial scenarios
 * - L14 Goal-Backward: Intervention plans with steps, owners, success probability
 * - L15 Narrative: AI-generated executive summaries (not string templates)
 *
 * Schedule: Every 4 hours (offset from DMN: 1,5,9,13,17,21 UTC)
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import {
  createProactiveIntelligence,
  type ProactiveScanResult,
  type ProactiveAlert,
} from '../../packages/memory-stack/src/orchestrator/proactive-intelligence';
import {
  runBrainEarlyWarning,
  type BrainEarlyWarningReport,
} from '../../packages/memory-stack/src/orchestrator/early-warning-brain-integration';

// ────────────────────────────────────────────────────────────────────────────
// Proactive Intelligence Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

export class ProactiveIntelligenceAgent extends ManusNativeAgent {
  readonly name = 'proactive-intelligence';
  readonly version = '8.0.0';
  readonly description = 'P0 Early Warning (Brain-Integrated) + Proactive alerting: velocity collapse, bottleneck concentration, cascade warnings, knowledge decay';
  readonly brainRegion = 'Amygdala (Proactive Alerting)';
  readonly neurologicalFunction = 'Push-Based Insight Delivery & Threat Detection';

  /** Last Brain early warning report for motor command generation */
  private lastBrainReport: BrainEarlyWarningReport | null = null;

  // ── Fetch: Gather current brain state ──
  async fetch(): Promise<FetchResult> {
    this.log('Gathering brain state for proactive monitoring...');

    const state: Record<string, unknown> = {};

    try {
      // Get latest signal metrics by domain
      const { data: recentSignals } = await this.supabase
        .from('cross_domain_signals')
        .select('source_domain, signal_type, signal_value, signal_timestamp')
        .eq('organization_id', this.organizationId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (recentSignals && recentSignals.length > 0) {
        // Aggregate by domain
        const domainMetrics: Record<string, { count: number; avgValue: number; latestValue: number }> = {};
        for (const sig of recentSignals) {
          const domain = sig.source_domain || 'unknown';
          if (!domainMetrics[domain]) {
            domainMetrics[domain] = { count: 0, avgValue: 0, latestValue: 0 };
          }
          domainMetrics[domain].count++;
          const val = typeof sig.signal_value === 'number' ? sig.signal_value : parseFloat(sig.signal_value) || 0;
          domainMetrics[domain].avgValue += val;
          if (domainMetrics[domain].count === 1) {
            domainMetrics[domain].latestValue = val;
          }
        }

        for (const [domain, metrics] of Object.entries(domainMetrics)) {
          metrics.avgValue = metrics.avgValue / metrics.count;
          state[`${domain}_signal_count`] = metrics.count;
          state[`${domain}_avg_value`] = metrics.avgValue;
          state[`${domain}_latest_value`] = metrics.latestValue;
        }

        state.total_signals_24h = recentSignals.length;
        state.active_domains = Object.keys(domainMetrics).length;
      }

      // Get prediction accuracy
      const { data: predictions } = await this.supabase
        .from('prediction_records')
        .select('verified, outcome_correct')
        .eq('organization_id', this.organizationId)
        .eq('verified', true)
        .limit(100);

      if (predictions && predictions.length > 0) {
        const correct = predictions.filter(p => p.outcome_correct).length;
        state.prediction_accuracy = correct / predictions.length;
        state.predictions_verified = predictions.length;
      }

      // Get causal graph health
      const { count: edgeCount } = await this.supabase
        .from('causal_relationships_statistical')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', this.organizationId);

      const { count: staleCount } = await this.supabase
        .from('causal_relationships_statistical')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', this.organizationId)
        .lt('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      state.causal_edges = edgeCount ?? 0;
      state.stale_edges = staleCount ?? 0;
      state.stale_edge_ratio = edgeCount ? (staleCount ?? 0) / edgeCount : 0;

      // Get LLM cost info
      const { data: costData } = await this.supabase
        .from('llm_cost_log')
        .select('estimated_cost')
        .eq('organization_id', this.organizationId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (costData) {
        const totalCost24h = costData.reduce((sum, d) => sum + (d.estimated_cost || 0), 0);
        state.llm_cost_24h = totalCost24h;
      }

      // ── P0 EARLY WARNING: Engineering Velocity & Bottleneck Signals ──
      // Gather engineering-specific signals for P0 analysis
      const { data: engineeringSignals } = await this.supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, signal_metadata, created_at')
        .eq('organization_id', this.organizationId)
        .eq('source_domain', 'engineering')
        .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (engineeringSignals && engineeringSignals.length > 0) {
        const prMerged = engineeringSignals.filter(s => s.signal_type === 'pr_merged');
        const prReviewed = engineeringSignals.filter(s => s.signal_type === 'pr_reviewed');
        state.engineering_signals_14d = engineeringSignals.length;
        state.prs_merged_14d = prMerged.length;
        state.prs_reviewed_14d = prReviewed.length;
        state.has_engineering_data = true;
      }

      this.log(`Brain state gathered: ${Object.keys(state).length} metrics across ${state.active_domains || 0} active domains`);
    } catch (err) {
      this.log(`State gathering failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const sources = ['cross_domain_signals', 'prediction_records', 'causal_relationships_statistical', 'llm_cost_log'];
    return {
      data: { state },
      sources,
      recordCount: Object.keys(state).length,
    };
  }

  // ── Convert: Run proactive monitoring scan ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.data) return { signals: [], packs: [] };

    const { state } = fetchResult.data as { state: Record<string, unknown> };

    const proactive = createProactiveIntelligence({
      alertCooldownMs: 4 * 60 * 60 * 1000,
      maxAlertsPerScan: 10,
      trackHistory: true,
      verbose: this.verbose,
    });

    // Add built-in monitors for brain health
    proactive.addMonitor({
      id: 'stale-edges',
      name: 'Stale Edge Ratio',
      domain: 'brain-health',
      check: (s) => (s.stale_edge_ratio as number) > 0.3,
      severity: 'warning',
      message: 'More than 30% of causal edges are stale (>30 days old)',
      enabled: true,
    });

    proactive.addMonitor({
      id: 'prediction-accuracy-drop',
      name: 'Prediction Accuracy Drop',
      domain: 'brain-health',
      check: (s) => (s.prediction_accuracy as number) < 0.5 && (s.predictions_verified as number) >= 10,
      severity: 'critical',
      message: 'Prediction accuracy dropped below 50%',
      enabled: true,
    });

    proactive.addMonitor({
      id: 'cost-spike',
      name: 'LLM Cost Spike',
      domain: 'cost',
      check: (s) => (s.llm_cost_24h as number) > 1.0,
      severity: 'warning',
      message: 'LLM costs exceeded $1.00 in the last 24 hours',
      enabled: true,
    });

    proactive.addMonitor({
      id: 'signal-drought',
      name: 'Signal Drought',
      domain: 'brain-health',
      check: (s) => (s.total_signals_24h as number) < 10,
      severity: 'info',
      message: 'Very few signals received in the last 24 hours — brain may be under-stimulated',
      enabled: true,
    });

    proactive.addMonitor({
      id: 'graph-growth',
      name: 'Causal Graph Growth',
      domain: 'brain-health',
      check: (s) => (s.causal_edges as number) > 500,
      severity: 'opportunity',
      message: 'Causal graph has grown past 500 edges — consider federation or domain-specific models',
      enabled: true,
    });

    // Load previous alert timestamps from DB for throttling continuity across restarts.
    // Without this, every agent restart resets the cooldown and sends duplicate alerts.
    try {
      const cooldownMs = 4 * 60 * 60 * 1000; // Must match alertCooldownMs above
      const { data: recentAlerts } = await this.supabase
        .from('ai_memory')
        .select('metadata, created_at')
        .eq('organization_id', this.organizationId)
        .eq('memory_type', 'alert')
        .gte('created_at', new Date(Date.now() - cooldownMs).toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (recentAlerts && recentAlerts.length > 0) {
        const restoredMonitorIds = new Set<string>();
        for (const alert of recentAlerts) {
          const monitorId = (alert.metadata as Record<string, unknown>)?.monitor_id as string;
          if (monitorId && !restoredMonitorIds.has(monitorId)) {
            const firedAt = new Date(alert.created_at).getTime();
            proactive.setLastFired?.(monitorId, firedAt);
            restoredMonitorIds.add(monitorId);
          }
        }
        if (restoredMonitorIds.size > 0) {
          this.log(`Restored throttling state for ${restoredMonitorIds.size} monitor(s) from DB`);
        }
      }
    } catch (err) {
      // Non-critical: throttling state restoration from DB failed — errors here don't block the main flow
    }

    // Run the scan
    const scanResult = await proactive.scan(state);

    this.log(`Proactive scan: ${scanResult.monitorsChecked} monitors checked, ${scanResult.monitorsFired} fired, ${scanResult.monitorsThrottled} throttled`);
    this.log(`Alerts: ${scanResult.healthSummary.criticalAlerts} critical, ${scanResult.healthSummary.warningAlerts} warnings, ${scanResult.healthSummary.infoAlerts} info, ${scanResult.healthSummary.opportunities} opportunities`);

    if (scanResult.alerts.length > 0) {
      for (const alert of scanResult.alerts) {
        const emoji = { critical: '🔴', warning: '🟡', info: '🔵', opportunity: '🟢' }[alert.severity];
        this.log(`  ${emoji} [${alert.severity}] ${alert.message}`);
      }
    }

    // Persist alerts
    for (const alert of scanResult.alerts) {
      try {
        await this.supabase.from('ai_memory').insert({
          organization_id: this.organizationId,
          memory_type: 'alert',
          content: `[${alert.severity.toUpperCase()}] ${alert.monitorName}: ${alert.message}`,
          domain: alert.domain,
          confidence: alert.severity === 'critical' ? 1.0 : alert.severity === 'warning' ? 0.8 : 0.5,
          metadata: {
            alert_id: alert.id,
            monitor_id: alert.monitorId,
            severity: alert.severity,
            recommendations: alert.recommendations,
            related_domains: alert.relatedDomains,
          },
        });
      } catch (err) {
        // Non-critical: alert persistence to ai_memory failed — errors here don't block the main flow
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // P0 EARLY WARNING: Brain-Integrated Analysis (15-Layer Cognitive Stack)
    // ════════════════════════════════════════════════════════════════════════
    //
    // This is the CRITICAL integration that makes design partners see Brain
    // intelligence instead of raw metrics dashboards.
    //
    // Routes through: BrainCommander → L3 Dreaming → L5 Curiosity →
    //   L6 Calibration → L9 Theory of Mind → L11 Red Team →
    //   L14 Goal-Backward Planning → L15 Narrative Intelligence
    //
    if (state.has_engineering_data) {
      try {
        this.log('Running P0 Brain Early Warning (15-layer cognitive stack)...');

        // Get BrainCommander from comprehensive brain systems
        const brainCommander = this.getBrainSystem?.('brainCommander');

        if (brainCommander) {
          const brainReport = await runBrainEarlyWarning({
            brainCommander,
            supabase: this.supabase,
            organizationId: this.organizationId,
            domains: ['backend', 'frontend', 'infrastructure'],
            lookbackDays: 90,
            forecastDays: 7,
          });

          // Store for motor command generation (Slack notifications with Brain narrative)
          this.lastBrainReport = brainReport;

          this.log(`Brain Early Warning: Risk=${brainReport.overallRisk}/100, Confidence=${(brainReport.confidence * 100).toFixed(0)}%`);

          if (brainReport.bottleneckRisks.length > 0) {
            this.log(`  Bottleneck risks: ${brainReport.bottleneckRisks.length} domains affected`);
            for (const risk of brainReport.bottleneckRisks) {
              this.log(`    ${risk.domain}: Gini=${risk.metrics.giniCoefficient.toFixed(2)}, Contributors=${risk.affectedContributors.length}`);
            }
          }

          if (brainReport.velocityCollapse) {
            this.log(`  Velocity collapse predicted: ${brainReport.velocityCollapse.prediction.predictedDrop.toFixed(0)}% drop in ${brainReport.velocityCollapse.prediction.daysUntilCollapse} days`);
          }

          if (brainReport.rootCauses.length > 0) {
            this.log(`  Root causes (L5 Curiosity): ${brainReport.rootCauses.map(r => r.rootCause).join(', ')}`);
          }

          if (brainReport.stressTestResults.length > 0) {
            this.log(`  Stress tests (L11 Red Team): ${brainReport.stressTestResults.length} scenarios evaluated`);
          }

          // Persist Brain early warning as high-fidelity alert
          if (brainReport.overallRisk >= 40) {
            await this.supabase.from('ai_memory').insert({
              organization_id: this.organizationId,
              memory_type: 'alert',
              content: brainReport.narrative,
              domain: 'engineering',
              confidence: brainReport.confidence,
              metadata: {
                alert_id: `brain-early-warning-${Date.now()}`,
                monitor_id: 'p0-brain-early-warning',
                severity: brainReport.overallRisk >= 60 ? 'critical' : 'warning',
                overall_risk: brainReport.overallRisk,
                bottleneck_count: brainReport.bottleneckRisks.length,
                velocity_collapse: !!brainReport.velocityCollapse,
                root_causes: brainReport.rootCauses.map(r => r.rootCause),
                intervention_goal: brainReport.interventionPlan.goal,
                intervention_paths: brainReport.interventionPlan.feasiblePaths.length,
                stress_tests_passed: brainReport.stressTestResults.filter(s => s.holdsUnderStress).length,
                stress_tests_total: brainReport.stressTestResults.length,
                cognitive_layers_used: ['L3', 'L5', 'L6', 'L9', 'L11', 'L14', 'L15'],
              },
            });
          }

          // Emit Brain early warning results as signals for causal discovery feedback loop
          if (brainReport.overallRisk >= 40) {
            await this.supabase.from('cross_domain_signals').insert({
              organization_id: this.organizationId,
              source_domain: 'engineering',
              signal_type: 'brain_early_warning',
              signal_value: brainReport.overallRisk,
              entity_type: 'early_warning_report',
              entity_id: `brain-ew-${Date.now()}`,
              signal_metadata: {
                confidence: brainReport.confidence,
                bottleneck_count: brainReport.bottleneckRisks.length,
                velocity_collapse: !!brainReport.velocityCollapse,
                cognitive_stack: true,
              },
              created_at: new Date().toISOString(),
            });
          }
        } else {
          this.log('BrainCommander not available — skipping P0 Brain Early Warning (will use threshold monitors only)');
        }
      } catch (err) {
        this.log(`P0 Brain Early Warning failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      signals: [],
      packs: [],
    };
  }

  // ── Motor Commands: Brain-Intelligence Alert Notifications ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];
    if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) return commands;

    // ── P0 Brain Early Warning: Send AI narrative (not raw metrics) ──
    if (this.lastBrainReport && this.lastBrainReport.overallRisk >= 40) {
      const report = this.lastBrainReport;

      // Build Brain-intelligence message (L15 Narrative, not string templates)
      const brainMessage = this.formatBrainEarlyWarningSlack(report);

      commands.push({
        commandId: `slack-brain-early-warning-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: { text: brainMessage },
        priority: report.overallRisk >= 60 ? 'high' : 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }

    // ── Brain Health Alerts (existing monitors) ──
    const { data: recentAlerts } = await this.supabase
      .from('ai_memory')
      .select('content, metadata')
      .eq('organization_id', this.organizationId)
      .eq('memory_type', 'alert')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    const alerts: ProactiveAlert[] = (recentAlerts || []).map(a => ({
      id: (a.metadata as any)?.alert_id || '',
      monitorId: (a.metadata as any)?.monitor_id || '',
      monitorName: a.content?.split(': ')[0]?.replace(/^\[.*?\]\s*/, '') || 'Unknown',
      severity: (a.metadata as any)?.severity || 'info',
      message: a.content?.split(': ').slice(1).join(': ') || '',
      domain: 'brain-health',
      recommendations: (a.metadata as any)?.recommendations || [],
      relatedDomains: (a.metadata as any)?.related_domains || [],
      firedAt: new Date(),
    }));

    // Only send non-P0 alerts (P0 handled above with Brain narrative)
    const healthAlerts = alerts.filter(a =>
      (a.severity === 'critical' || a.severity === 'warning') &&
      a.monitorId !== 'p0-brain-early-warning'
    );

    if (healthAlerts.length > 0) {
      const alertLines = healthAlerts.map(a => {
        const emoji = a.severity === 'critical' ? '🔴' : '🟡';
        return `${emoji} *${a.monitorName}*: ${a.message}`;
      }).join('\n');

      commands.push({
        commandId: `slack-proactive-alerts-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `⚡ *Brain Health Alerts*\n\n${alertLines}\n\n_${this.brainRegion}_`,
        },
        priority: healthAlerts.some(a => a.severity === 'critical') ? 'high' : 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }

    return commands;
  }

  /**
   * Format Brain Early Warning report as Slack message with full AI narrative
   *
   * This is what design partners see — Brain intelligence, not raw metrics.
   * Uses L15 Narrative Intelligence output, L9 Theory of Mind assessments,
   * L14 Goal-Backward intervention plans, and L11 Red Team stress tests.
   */
  private formatBrainEarlyWarningSlack(report: BrainEarlyWarningReport): string {
    const riskEmoji = report.overallRisk >= 60 ? '🚨' : '⚠️';
    const confidenceBar = '█'.repeat(Math.round(report.confidence * 10)) + '░'.repeat(10 - Math.round(report.confidence * 10));

    let msg = `${riskEmoji} *Brain Early Warning Report*\n`;
    msg += `Risk: *${report.overallRisk}/100* | Confidence: ${confidenceBar} ${(report.confidence * 100).toFixed(0)}%\n\n`;

    // L15 Narrative Intelligence: AI-generated summary (not string template)
    if (report.narrative && report.narrative !== 'Early warning analysis completed. See details below.') {
      msg += `${report.narrative}\n\n`;
    }

    // L9 Theory of Mind: Contributor assessments
    for (const risk of report.bottleneckRisks) {
      if (risk.affectedContributors.length > 0) {
        msg += `*Theory of Mind Assessment (L9):*\n`;
        for (const contributor of risk.affectedContributors.slice(0, 3)) {
          const burnout = contributor.perspective.burnoutRisk === 'high' ? '🔴' : contributor.perspective.burnoutRisk === 'medium' ? '🟡' : '🟢';
          msg += `• ${contributor.name}: ${(contributor.expertiseShare * 100).toFixed(0)}% expertise share | Burnout risk: ${burnout} | Engagement: ${(contributor.perspective.engagementPotential * 100).toFixed(0)}%\n`;
        }
        msg += '\n';
      }
    }

    // Velocity Collapse
    if (report.velocityCollapse) {
      const vc = report.velocityCollapse;
      msg += `*Velocity Collapse (L3 Dreaming):*\n`;
      msg += `Predicted ${vc.prediction.predictedDrop.toFixed(0)}% drop in ${vc.prediction.daysUntilCollapse} days\n`;
      if (vc.dreamingInsights.length > 0) {
        msg += `Causal insight: ${vc.dreamingInsights[0]}\n`;
      }
      msg += '\n';
    }

    // L5 Root Causes
    if (report.rootCauses.length > 0) {
      msg += `*Root Causes (L5 Curiosity):*\n`;
      for (const rc of report.rootCauses.slice(0, 3)) {
        msg += `• ${rc.rootCause} (${(rc.confidence * 100).toFixed(0)}% confidence)\n`;
      }
      msg += '\n';
    }

    // L14 Intervention Plan
    if (report.interventionPlan.feasiblePaths.length > 0) {
      const topPath = report.interventionPlan.feasiblePaths[0];
      msg += `*Intervention Plan (L14 Goal-Backward):*\n`;
      msg += `Goal: ${report.interventionPlan.goal}\n`;
      msg += `${topPath.description} (${(topPath.successProbability * 100).toFixed(0)}% success probability, ${topPath.effortWeeks} weeks)\n`;
      if (topPath.steps.length > 0) {
        for (const step of topPath.steps.slice(0, 3)) {
          msg += `  ${step.stepNumber}. ${step.action} (${step.owner}, ${step.durationDays}d)\n`;
        }
      }
      msg += '\n';
    }

    // L11 Stress Test Results
    if (report.stressTestResults.length > 0) {
      const passed = report.stressTestResults.filter(s => s.holdsUnderStress).length;
      msg += `*Stress Tests (L11 Red Team):* ${passed}/${report.stressTestResults.length} scenarios passed\n`;
      for (const test of report.stressTestResults.slice(0, 2)) {
        const icon = test.holdsUnderStress ? '✅' : '❌';
        msg += `${icon} "${test.adversarialScenario}" → confidence: ${(test.adjustedConfidence * 100).toFixed(0)}%\n`;
      }
      msg += '\n';
    }

    msg += `_Powered by NexusBrain 15-Layer Cognitive Stack | ${new Date().toISOString().split('T')[0]}_`;

    return msg;
  }
}

// ── Self-Registration: Auto-register to globalRegistry on import ──────────
import { createClient } from '@supabase/supabase-js';
import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'proactive-intelligence',
  description: 'P0 Early Warning (Brain-Integrated) + Proactive alerting: velocity collapse, bottleneck concentration, cascade warnings',
  version: '8.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new ProactiveIntelligenceAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', { verbose: config.verbose }) as any;
  },
  schedule: '0 1,5,9,13,17,21 * * *',  // Every 4 hours (offset from DMN)
  resourceRequirements: { cpu: '512', memory: '1024' },
  tags: ['monitoring', 'amygdala', 'proactive', 'alerting'],
});
