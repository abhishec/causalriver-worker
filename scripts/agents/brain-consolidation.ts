/**
 * NexusBrain Brain Consolidation Agent (V6 Manus)
 *
 * Brain Region: Default Mode Network (DMN / Region #8)
 * Neurological Function: Brain Sleep & Memory Consolidation
 *
 * Performs periodic brain consolidation — the equivalent of human sleep for the org brain.
 * 10-step cycle: fetch signals → causal discovery → anomaly detection → pattern mining →
 * training pack generation → brain training → pruning → strengthening → federation → report.
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import {
  createConsolidationEngine,
  type ConsolidationResult,
} from '../../packages/memory-stack/src/orchestrator/consolidation-engine';
import { createPublicDataLearner } from '../../packages/memory-stack/src/learning/public-data-learner';

// ────────────────────────────────────────────────────────────────────────────
// Brain Consolidation Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

export interface BrainConsolidationConfig {
  lookbackHours?: number;
  pruneAfterDays?: number;
  runFederation?: boolean;
  consolidateAllOrgs?: boolean;
}

export class BrainConsolidationAgent extends ManusNativeAgent {
  readonly name = 'brain-consolidation';
  readonly version = '7.0.0';
  readonly description = '10-step brain sleep cycle: causal discovery, anomaly detection, pattern mining, pruning, strengthening';
  readonly brainRegion = 'Default Mode Network (DMN / Region #8)';
  readonly neurologicalFunction = 'Brain Sleep & Memory Consolidation';

  private config: BrainConsolidationConfig;
  private coreBrainOrgId = '00000000-0000-4000-a000-000000000001';

  constructor(
    supabase: any,
    organizationId: string,
    config: BrainConsolidationConfig & { verbose?: boolean } = {}
  ) {
    super(supabase, organizationId, { verbose: config.verbose });
    this.config = {
      lookbackHours: config.lookbackHours || 48,
      pruneAfterDays: config.pruneAfterDays || 30,
      runFederation: config.runFederation ?? (organizationId !== this.coreBrainOrgId),
      consolidateAllOrgs: config.consolidateAllOrgs || false,
    };
  }

  // ── Fetch: Pull signals from last N hours + public data ──
  async fetch(): Promise<FetchResult> {
    this.log('Fetching signals for consolidation...');

    // Step 0: Feed the brain with fresh public data
    try {
      const dataLearner = createPublicDataLearner({
        supabase: this.supabase,
        organizationId: this.coreBrainOrgId,
        fredApiKey: process.env.FRED_API_KEY,
        verbose: this.verbose,
      });

      const ingestion = await dataLearner.ingest();
      this.log(`Public data: ${ingestion.summary}`);
    } catch (err) {
      this.log('Public data ingestion failed (non-fatal)');
    }

    // Get organizations to consolidate
    const orgIds = this.config.consolidateAllOrgs
      ? await this.getActiveOrgIds()
      : [this.organizationId];

    // Always include core brain (receives federated knowledge)
    if (!orgIds.includes(this.coreBrainOrgId)) {
      orgIds.push(this.coreBrainOrgId);
    }

    this.log(`Consolidating ${orgIds.length} organization(s)`);

    return {
      success: true,
      data: { orgIds },
    };
  }

  // ── Convert: Run consolidation for each org ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success || !fetchResult.data) {
      return { success: false, signals: [], trainingPacks: [] };
    }

    const { orgIds } = fetchResult.data as { orgIds: string[] };
    const results: ConsolidationResult[] = [];

    for (const orgId of orgIds) {
      try {
        const result = await this.consolidateOrg(orgId);
        results.push(result);
        this.log(`Consolidated ${orgId.substring(0, 8)}: ${result.status}`);
      } catch (err) {
        this.log(`Failed to consolidate ${orgId.substring(0, 8)}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Return consolidation results as signals (for motor commands)
    return {
      success: true,
      signals: [],
      trainingPacks: [],
      metadata: { consolidationResults: results },
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

  // ── Helper: Consolidate single organization ──
  private async consolidateOrg(orgId: string): Promise<ConsolidationResult> {
    const isCore = orgId === this.coreBrainOrgId;

    const engine = createConsolidationEngine({
      supabase: this.supabase,
      organizationId: orgId,
      lookbackHours: this.config.lookbackHours!,
      pruneAfterDays: this.config.pruneAfterDays!,
      runFederation: !isCore && this.config.runFederation!,
      verbose: this.verbose,
    });

    const result = isCore
      ? await engine.runConsolidation()
      : await engine.runOrgConsolidation();

    // Log consolidation stats
    if (this.verbose) {
      this.log(`  ${isCore ? 'Core Brain' : `Org ${orgId.substring(0, 8)}`}: ${result.status}`);
      this.log(`  Signals: ${result.report.stats.signalsProcessed}`);
      this.log(`  Edges discovered: ${result.report.stats.causalEdgesDiscovered}`);
      this.log(`  New relationships: ${result.report.stats.newRelationships}`);
      this.log(`  Anomalies: ${result.report.stats.anomaliesDetected}`);
      this.log(`  Patterns: ${result.report.stats.patternsFound}`);
      this.log(`  Pruned: ${result.report.stats.edgesPruned}, Strengthened: ${result.report.stats.edgesStrengthened}`);

      if (result.report.discoveries.length > 0) {
        this.log('  Discoveries:');
        for (const d of result.report.discoveries.slice(0, 3)) {
          this.log(`    + ${d}`);
        }
      }
    }

    return result;
  }

  // ── Motor Commands: Define agent-specific actions ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];

    // Extract consolidation results from metadata
    const results = (trainResult.metadata?.consolidationResults as ConsolidationResult[]) || [];
    const allDiscoveries = results.flatMap(r => r.report.discoveries);
    const totalNew = results.reduce((sum, r) => sum + r.report.stats.newRelationships, 0);
    const totalAnomalies = results.reduce((sum, r) => sum + r.report.stats.anomaliesDetected, 0);

    // Slack notification for major discoveries
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID && allDiscoveries.length > 0) {
      const topDiscoveries = allDiscoveries.slice(0, 5).map(d => `• ${d}`).join('\n');

      commands.push({
        commandId: `slack-consolidation-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `🧠 *Brain Consolidation Complete*\n\n*Discoveries: ${allDiscoveries.length}*\n${topDiscoveries}\n\n*Stats:*\n• New relationships: ${totalNew}\n• Anomalies: ${totalAnomalies}\n• Brain Region: ${this.brainRegion}`,
        },
        priority: 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }

    // GitHub issue for critical anomalies (threshold: 10+)
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO && totalAnomalies >= 10) {
      commands.push({
        commandId: `github-anomaly-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'github_create_issue',
        target: `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
        payload: {
          title: `[Brain Alert] ${totalAnomalies} anomalies detected in consolidation`,
          body: `The brain consolidation agent detected ${totalAnomalies} statistical anomalies.\n\nThis may indicate data quality issues or significant business changes.\n\nReview the consolidation report for details.`,
          labels: ['brain', 'anomaly', 'auto-generated'],
        },
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
  name: 'brain-consolidation',
  description: '10-step brain sleep cycle: causal discovery, anomaly detection, pattern mining, pruning, strengthening',
  version: '6.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new BrainConsolidationAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', { verbose: config.verbose }) as any;
  },
  schedule: '0 2 * * *',  // Daily at 2 AM UTC
  resourceRequirements: { cpu: '2048', memory: '8192' },
  tags: ['training', 'dmn', 'consolidation', 'brain-sleep'],
});
