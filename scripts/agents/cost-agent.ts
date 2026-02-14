/**
 * NexusBrain Cost Agent (V6 Manus)
 *
 * Brain Region: Hypothalamus (Cost Tracker)
 * Neurological Function: Resource Monitoring & Cost Optimization
 *
 * Monitors LLM token costs and AWS infrastructure spending.
 * Detects budget overruns, cost spikes, and anomalies.
 * Sends Slack alerts when thresholds are breached.
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import { createCostTracker, type CostReport } from '../../packages/memory-stack/src/persistence/cost-tracker';

// ────────────────────────────────────────────────────────────────────────────
// Cost Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

export interface CostAgentConfig {
  lookbackDays?: number;
  budgetAlertThreshold?: number;
  anomalySpikeMultiplier?: number;
}

interface CostAnomaly {
  date: string;
  type: 'spike' | 'budget_breach';
  description: string;
  amount: number;
  threshold: number;
}

interface AWSCostData {
  total: number;
  fargate: number;
  cloudwatch: number;
  ecr: number;
  dataTransfer: number;
  other: number;
}

export class CostAgent extends ManusNativeAgent {
  readonly name = 'cost-agent';
  readonly version = '7.0.0';
  readonly description = 'Monitors LLM token costs and AWS infrastructure spending, detects budget overruns and cost anomalies';
  readonly brainRegion = 'Hypothalamus (Cost Tracker)';
  readonly neurologicalFunction = 'Resource Monitoring & Cost Optimization';

  private config: CostAgentConfig;

  constructor(
    supabase: any,
    organizationId: string,
    config: CostAgentConfig & { verbose?: boolean } = {}
  ) {
    super(supabase, organizationId, { verbose: config.verbose });
    this.config = {
      lookbackDays: config.lookbackDays || 30,
      budgetAlertThreshold: config.budgetAlertThreshold || 80,
      anomalySpikeMultiplier: config.anomalySpikeMultiplier || 2.0,
    };
  }

  // ── Fetch: Load cost data from database and AWS ──
  async fetch(): Promise<FetchResult> {
    this.log('Fetching cost data...');
    const costTracker = createCostTracker(this.supabase, this.organizationId);
    const llmReport = await costTracker.generateReport(this.config.lookbackDays!);
    this.log(`LLM: $${llmReport.totalCost.toFixed(4)} (${llmReport.totalCalls} calls), Period: ${llmReport.periodStart} to ${llmReport.periodEnd}`);

    let awsCosts: AWSCostData | null = null;
    try {
      awsCosts = await this.fetchAWSCosts(llmReport.periodStart, llmReport.periodEnd);
      if (awsCosts) this.log(`AWS: $${awsCosts.total.toFixed(2)}`);
    } catch {
      this.log('AWS fetch failed (non-fatal)');
    }
    return { success: true, data: { llmReport, awsCosts } };
  }

  // ── Convert: Analyze trends and detect anomalies ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success || !fetchResult.data) return { success: false, signals: [], trainingPacks: [] };

    const { llmReport, awsCosts } = fetchResult.data as { llmReport: CostReport; awsCosts: AWSCostData | null };
    this.log('Analyzing cost trends...');

    const anomalies = this.detectAnomalies(llmReport);
    if (anomalies.length > 0) {
      this.log(`Detected ${anomalies.length} anomal${anomalies.length !== 1 ? 'ies' : 'y'}`);
      anomalies.forEach(a => this.log(`  - ${a.type}: ${a.description}`));
    } else {
      this.log('No anomalies detected');
    }

    const monthlyBudget = parseFloat(process.env.MONTHLY_BUDGET || '1000');
    const totalCost = llmReport.totalCost + (awsCosts?.total || 0);
    const budgetUsedPct = (totalCost / monthlyBudget) * 100;
    this.log(`Budget: ${budgetUsedPct.toFixed(1)}% ($${totalCost.toFixed(2)} / $${monthlyBudget.toFixed(2)})`);

    if (awsCosts) await this.storeAWSCosts(awsCosts, llmReport.periodEnd);

    return {
      success: true,
      signals: [],
      trainingPacks: [],
      metadata: { llmReport, awsCosts, anomalies, budgetUsedPct, monthlyBudget },
    };
  }

  // ── Helper: Fetch AWS costs from Cost Explorer ──
  private async fetchAWSCosts(periodStart: string, periodEnd: string): Promise<AWSCostData | null> {
    try {
      const { execSync } = await import('child_process');
      const cmd = `aws ce get-cost-and-usage --time-period Start=${periodStart},End=${periodEnd} --granularity DAILY --metrics "UnblendedCost" --group-by Type=DIMENSION,Key=SERVICE --region us-east-1 2>/dev/null`;
      const result = execSync(cmd, { encoding: 'utf-8', timeout: 30_000 });
      const data = JSON.parse(result);
      const costs: Record<string, number> = {};

      for (const period of data.ResultsByTime || []) {
        for (const group of period.Groups || []) {
          const service = group.Keys?.[0] || 'Unknown';
          const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
          costs[service] = (costs[service] || 0) + amount;
        }
      }

      const fargate = costs['Amazon Elastic Container Service'] || 0;
      const cloudwatch = costs['AmazonCloudWatch'] || costs['Amazon CloudWatch'] || 0;
      const ecr = costs['Amazon EC2 Container Registry (ECR)'] || 0;
      const dataTransfer = costs['AWS Data Transfer'] || 0;
      const total = Object.values(costs).reduce((sum, v) => sum + v, 0);
      const other = total - (fargate + cloudwatch + ecr + dataTransfer);

      return { total, fargate, cloudwatch, ecr, dataTransfer, other };
    } catch {
      return null;
    }
  }

  // ── Helper: Detect cost anomalies ──
  private detectAnomalies(llmReport: CostReport): CostAnomaly[] {
    const anomalies: CostAnomaly[] = [];
    if (llmReport.dailyTrend.length < 2) return anomalies;

    const nonZeroDays = llmReport.dailyTrend.filter(d => d.totalCost > 0);
    if (nonZeroDays.length === 0) return anomalies;

    const avgDailyCost = nonZeroDays.reduce((sum, d) => sum + d.totalCost, 0) / nonZeroDays.length;
    const threshold = avgDailyCost * this.config.anomalySpikeMultiplier!;

    for (const day of llmReport.dailyTrend) {
      if (day.totalCost > threshold) {
        anomalies.push({
          date: day.date,
          type: 'spike',
          description: `Cost spike: $${day.totalCost.toFixed(4)} (${this.config.anomalySpikeMultiplier}x avg)`,
          amount: day.totalCost,
          threshold,
        });
      }
    }
    return anomalies;
  }

  // ── Helper: Store AWS costs ──
  private async storeAWSCosts(awsCosts: AWSCostData, periodEnd: string): Promise<void> {
    try {
      await this.supabase.from('cost_tracker').insert({
        organization_id: this.organizationId,
        service: 'aws',
        cost_amount: awsCosts.total,
        metadata: {
          fargate: awsCosts.fargate,
          cloudwatch: awsCosts.cloudwatch,
          ecr: awsCosts.ecr,
          dataTransfer: awsCosts.dataTransfer,
          other: awsCosts.other,
          periodEnd,
        },
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      this.log('Failed to store AWS costs (non-fatal)');
    }
  }

  // ── Motor Commands: Generate Slack alerts ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];
    const { anomalies, budgetUsedPct, monthlyBudget, llmReport, awsCosts } = trainResult.metadata || {};
    if (!trainResult.success || !process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) return commands;

    // Budget threshold alert
    if (budgetUsedPct >= this.config.budgetAlertThreshold!) {
      const totalCost = llmReport.totalCost + (awsCosts?.total || 0);
      commands.push({
        commandId: `slack-budget-alert-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `⚠️ *Budget Alert*\nBudget: *${budgetUsedPct.toFixed(1)}%*\nCost: $${totalCost.toFixed(2)} / $${monthlyBudget.toFixed(2)}\nLLM: $${llmReport.totalCost.toFixed(4)} | AWS: $${(awsCosts?.total || 0).toFixed(2)}\n\n_${this.brainRegion}_`,
        },
        priority: budgetUsedPct >= 100 ? 'high' : 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }

    // Anomaly alerts
    if (anomalies?.length > 0) {
      const anomalyText = anomalies.map((a: CostAnomaly) => `• ${a.date}: ${a.description}`).join('\n');
      commands.push({
        commandId: `slack-anomaly-alert-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: { text: `🚨 *Cost Anomalies*\n\n${anomalyText}\n\n_${this.brainRegion}_` },
        priority: 'high',
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
  name: 'cost-agent',
  description: 'Monitors LLM token costs and AWS infrastructure spending, detects budget overruns and cost anomalies',
  version: '6.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new CostAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', { verbose: config.verbose }) as any;
  },
  schedule: '0 3 * * *',  // Daily at 3 AM UTC
  resourceRequirements: { cpu: '512', memory: '1024' },
  tags: ['monitoring', 'hypothalamus', 'cost-tracking'],
});
