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
 * - Threshold-based alerting (metric crosses a boundary)
 * - Trend-based alerts (metric on a concerning trajectory)
 * - Cascade early warning (cascade pattern starting to form)
 * - Knowledge decay alerts (stale information)
 * - Opportunity detection (positive signals that need attention)
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

// ────────────────────────────────────────────────────────────────────────────
// Proactive Intelligence Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

export class ProactiveIntelligenceAgent extends ManusNativeAgent {
  readonly name = 'proactive-intelligence';
  readonly version = '6.0.0';
  readonly description = 'Proactive alerting: threshold breaches, trend changes, cascade warnings, knowledge decay, opportunities';
  readonly brainRegion = 'Amygdala (Proactive Alerting)';
  readonly neurologicalFunction = 'Push-Based Insight Delivery & Threat Detection';

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

      this.log(`Brain state gathered: ${Object.keys(state).length} metrics across ${state.active_domains || 0} active domains`);
    } catch (err) {
      this.log(`State gathering failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { success: true, data: { state } };
  }

  // ── Convert: Run proactive monitoring scan ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success || !fetchResult.data) return { success: false, signals: [], trainingPacks: [] };

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
      } catch {
        // Non-fatal
      }
    }

    return {
      success: true,
      signals: [],
      trainingPacks: [],
      metadata: { scanResult, alerts: scanResult.alerts },
    };
  }

  // ── Motor Commands: Alert notifications ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];
    if (!trainResult.success || !process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) return commands;

    const alerts = (trainResult.metadata?.alerts as ProactiveAlert[]) || [];
    const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'warning');

    if (criticalAlerts.length > 0) {
      const alertLines = criticalAlerts.map(a => {
        const emoji = a.severity === 'critical' ? '🔴' : '🟡';
        return `${emoji} *${a.monitorName}*: ${a.message}`;
      }).join('\n');

      commands.push({
        commandId: `slack-proactive-alerts-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `⚡ *Proactive Intelligence Alerts*\n\n${alertLines}\n\n_${this.brainRegion}_`,
        },
        priority: criticalAlerts.some(a => a.severity === 'critical') ? 'high' : 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }

    return commands;
  }
}

// ── Self-Registration: Auto-register to globalRegistry on import ──────────
import { createClient } from '@supabase/supabase-js';
import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'proactive-intelligence',
  description: 'Proactive alerting: threshold breaches, trend changes, cascade warnings, knowledge decay, opportunities',
  version: '6.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new ProactiveIntelligenceAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', { verbose: config.verbose }) as any;
  },
  schedule: '0 1,5,9,13,17,21 * * *',  // Every 4 hours (offset from DMN)
  resourceRequirements: { cpu: '512', memory: '1024' },
  tags: ['monitoring', 'amygdala', 'proactive', 'alerting'],
});
