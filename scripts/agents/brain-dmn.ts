/**
 * NexusBrain DMN Agent (V6 Manus)
 *
 * Brain Region: Default Mode Network (DMN)
 * Neurological Function: Background Insight Scanning
 *
 * Performs lightweight background scans (every 2-4 hours) for surprising patterns:
 * - Unexpected cross-domain correlations
 * - Emerging cascade patterns
 * - What-changed analysis
 * - Knowledge gap detection
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import {
  createBackgroundInsightEngine,
  type DMNScanResult,
  type ProactiveInsight,
} from '../../packages/memory-stack/src/orchestrator/background-insight-engine';
import { createActiveExplorer } from '../../packages/memory-stack/src/orchestrator/active-explorer';
import { createWhatIfSimulator } from '../../packages/memory-stack/src/orchestrator/whatif-simulator';

// ────────────────────────────────────────────────────────────────────────────
// DMN Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

export interface DMNConfig {
  minSurpriseScore?: number;
  maxInsightsPerScan?: number;
  scanAllOrgs?: boolean;
}

export class DMNAgent extends ManusNativeAgent {
  readonly brainRegion = 'Default Mode Network (DMN)';
  readonly neurologicalFunction = 'Background Insight Scanning';

  private config: DMNConfig;
  private coreBrainOrgId = '00000000-0000-4000-a000-000000000001';

  constructor(
    supabase: any,
    organizationId: string,
    config: DMNConfig & { verbose?: boolean } = {}
  ) {
    super(supabase, organizationId, { verbose: config.verbose });
    this.config = {
      minSurpriseScore: config.minSurpriseScore || 0.5,
      maxInsightsPerScan: config.maxInsightsPerScan || 10,
      scanAllOrgs: config.scanAllOrgs || false,
    };
  }

  // ── Fetch: Scan for insights ──
  async fetch(): Promise<FetchResult> {
    this.log('Starting DMN background scan...');

    const orgIds = this.config.scanAllOrgs
      ? await this.getActiveOrgIds()
      : [this.organizationId];

    this.log(`Scanning ${orgIds.length} organization(s)`);

    const results: DMNScanResult[] = [];

    for (const orgId of orgIds) {
      try {
        const result = await this.scanOrg(orgId);
        results.push(result);
        this.log(`Scanned ${orgId.substring(0, 8)}: ${result.insights.length} insights`);
      } catch (err) {
        this.log(`Failed to scan ${orgId.substring(0, 8)}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return {
      success: true,
      data: { scanResults: results },
    };
  }

  // ── Convert: Enrich insights with context ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success || !fetchResult.data) {
      return { success: false, signals: [], trainingPacks: [] };
    }

    const { scanResults } = fetchResult.data as { scanResults: DMNScanResult[] };
    const allInsights = scanResults.flatMap(r => r.insights);

    this.log(`Total insights: ${allInsights.length}`);

    // Run active exploration to identify knowledge gaps
    try {
      const explorer = createActiveExplorer({
        supabase: this.supabase,
        organizationId: this.organizationId,
        maxRequests: 5,
        verbose: this.verbose,
      });

      const exploration = await explorer.explore();
      if (exploration.requests.length > 0) {
        this.log(`Graph health: ${(exploration.graphHealth * 100).toFixed(0)}%, ${exploration.requests.length} data requests`);
      }
    } catch (err) {
      this.log('Active exploration failed (non-fatal)');
    }

    // Run What-If simulation on top insight
    if (allInsights.length > 0) {
      try {
        const simulator = createWhatIfSimulator({
          supabase: this.supabase,
          organizationId: this.organizationId,
          maxCascadeDepth: 3,
          verbose: this.verbose,
        });

        const topInsight = allInsights[0];
        if (topInsight.domains.length > 0) {
          const narrative = await simulator.whatIf(
            topInsight.domains[0],
            topInsight.importance > 0.5 ? 'increase' : 'decrease',
            Math.round(topInsight.importance * 30),
          );
          this.log(`What-If simulation: ${narrative.substring(0, 150)}...`);
        }
      } catch (err) {
        this.log('What-If simulation failed (non-fatal)');
      }
    }

    return {
      success: true,
      signals: [],
      trainingPacks: [],
      metadata: { insights: allInsights },
    };
  }

  // ── Helper: Get active organization IDs ──
  private async getActiveOrgIds(): Promise<string[]> {
    const { data: orgs } = await this.supabase
      .from('cross_domain_signals')
      .select('organization_id')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(500);

    if (!orgs) return [];

    const uniqueOrgs = [...new Set(orgs.map((o: any) => o.organization_id))];
    return uniqueOrgs.filter((id: string) => id !== this.coreBrainOrgId);
  }

  // ── Helper: Scan single organization ──
  private async scanOrg(orgId: string): Promise<DMNScanResult> {
    const engine = createBackgroundInsightEngine({
      supabase: this.supabase,
      organizationId: orgId,
      minSurpriseScore: this.config.minSurpriseScore!,
      maxInsightsPerScan: this.config.maxInsightsPerScan!,
      verbose: this.verbose,
    });

    const result = await engine.scan();

    if (this.verbose && result.insights.length > 0) {
      this.log(`  Insights (${orgId.substring(0, 8)}):`);
      for (const insight of result.insights.slice(0, 3)) {
        const emoji = {
          unexpected_correlation: '🔗',
          emerging_cascade: '⚡',
          what_changed: '📊',
          knowledge_gap: '🔍',
          prediction_opportunity: '🎯',
        }[insight.type] || '💡';
        this.log(`    ${emoji} [${(insight.importance * 100).toFixed(0)}%] ${insight.title}`);
      }
    }

    return result;
  }

  // ── Motor Commands: Define agent-specific actions ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];

    const insights = (trainResult.metadata?.insights as ProactiveInsight[]) || [];
    const topInsights = insights.slice(0, 5);

    // Slack notification for high-importance insights
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID && topInsights.length > 0) {
      for (const insight of topInsights.filter(i => i.importance >= 0.7)) {
        const emoji = {
          unexpected_correlation: '🔗',
          emerging_cascade: '⚡',
          what_changed: '📊',
          knowledge_gap: '🔍',
          prediction_opportunity: '🎯',
        }[insight.type] || '💡';

        commands.push({
          commandId: `slack-insight-${insight.id}`,
          organizationId: this.organizationId,
          actionType: 'slack_send_message',
          target: process.env.SLACK_CHANNEL_ID,
          payload: {
            text: `${emoji} *${insight.title}*\n\n${insight.explanation}\n\n_Importance: ${(insight.importance * 100).toFixed(0)}% | Domains: ${insight.domains.join(', ')}_`,
          },
          priority: insight.importance >= 0.9 ? 'high' : 'normal',
          requiresApproval: false,
          createdAt: new Date(),
        });
      }
    }

    // Email notification for critical insights (importance >= 0.9)
    if (process.env.SMTP_ENABLED === 'true' && process.env.ADMIN_EMAIL) {
      const criticalInsights = topInsights.filter(i => i.importance >= 0.9);
      if (criticalInsights.length > 0) {
        const insightList = criticalInsights.map(i => `• ${i.title} (${i.domains.join(', ')})`).join('\n');

        commands.push({
          commandId: `email-critical-insights-${Date.now()}`,
          organizationId: this.organizationId,
          actionType: 'email_send',
          target: process.env.ADMIN_EMAIL,
          payload: {
            subject: `[NexusBrain] ${criticalInsights.length} Critical Insight${criticalInsights.length !== 1 ? 's' : ''}`,
            body: `The DMN agent detected critical insights requiring attention:\n\n${insightList}\n\nReview the brain dashboard for details.`,
          },
          priority: 'high',
          requiresApproval: false,
          createdAt: new Date(),
        });
      }
    }

    return commands;
  }
}
