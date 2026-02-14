/**
 * NexusBrain Monthly Deep Analysis Agent (V6 Manus)
 *
 * Brain Region: Hippocampus (Monthly Deep Analysis)
 * Neurological Function: Full Historical Causal Discovery & Growth Tracking
 *
 * Runs on the 1st of each month — full historical deep analysis:
 *   1. Hippocampus: Full causal discovery on ALL historical data (not just 48h)
 *   2. LTP: Auto-generate training packs from monthly discoveries
 *   3. Monthly brain growth report (compare with last month)
 *
 * This is the brain's equivalent of a deep sleep cycle —
 * processing ALL accumulated memories to find hidden patterns
 * that the nightly 48h window would miss.
 *
 * Schedule: 1st of each month at 3:00 AM UTC
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';

// ────────────────────────────────────────────────────────────────────────────
// Monthly Deep Analysis Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

interface DiscoveryResults {
  relationships: any[];
  newRelationships: number;
}

interface GrowthReport {
  newSignals: number;
  totalSignals: number;
  newEdges: number;
  totalEdges: number;
  learningRuns: number;
  totalMemories: number;
  month: string;
}

export class MonthlyDeepAnalysisAgent extends ManusNativeAgent {
  readonly name = 'monthly-deep-analysis';
  readonly version = '6.0.0';
  readonly description = 'Full historical causal discovery on ALL data + monthly growth report';
  readonly brainRegion = 'Hippocampus (Monthly Deep Analysis)';
  readonly neurologicalFunction = 'Full Historical Causal Discovery & Growth Tracking';

  // ── Fetch: Load ALL historical signals for discovery ──
  async fetch(): Promise<FetchResult> {
    this.log(`Starting monthly deep analysis (${new Date().toISOString().substring(0, 7)})...`);

    let discoveryResults: DiscoveryResults | null = null;

    try {
      const { data: allSignals, error: sigError } = await this.supabase
        .from('cross_domain_signals')
        .select('*')
        .eq('organization_id', this.organizationId)
        .order('signal_timestamp', { ascending: true });

      if (sigError) throw new Error(sigError.message);

      this.log(`Loaded ${allSignals?.length ?? 0} total historical signals`);

      if (allSignals && allSignals.length > 0) {
        // Group by domain
        const domains = [...new Set(allSignals.map(s => s.source_domain || 'unknown'))];
        this.log(`Domains: ${domains.join(', ')} (${domains.length} total)`);

        try {
          const { runCausalDiscovery } = await import('../../packages/memory-stack/src/causality/causal-discovery-runner');

          const signals = allSignals.map(s => ({
            source_domain: s.source_domain,
            signal_type: s.signal_type,
            signal_value: typeof s.signal_value === 'number' ? s.signal_value : parseFloat(s.signal_value) || 0,
            signal_timestamp: s.signal_timestamp ? new Date(s.signal_timestamp) : new Date(s.created_at),
          }));

          discoveryResults = await runCausalDiscovery(signals, this.organizationId, {
            minSampleSize: 20,
            maxLagDays: 90,
            pValueThreshold: 0.05,
          });

          this.log(`Found ${discoveryResults!.relationships?.length ?? 0} causal relationships (${discoveryResults!.newRelationships ?? 0} new)`);
        } catch (err) {
          this.log(`Causal discovery failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      this.log(`Failed to load signals: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { success: true, data: { discoveryResults } };
  }

  // ── Convert: Auto-generate training packs + growth report ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success) return { success: false, signals: [], trainingPacks: [] };

    const { discoveryResults } = fetchResult.data as { discoveryResults: DiscoveryResults | null };

    // Auto-generate training pack from discoveries
    if (discoveryResults?.relationships && discoveryResults.relationships.length > 0) {
      try {
        const { createBrainTrainer } = await import('../../packages/memory-stack/src/learning/brain-trainer');
        const trainer = createBrainTrainer();

        const monthlyPack = {
          id: `monthly-discovery-${new Date().toISOString().substring(0, 7)}`,
          name: `Monthly Discovery ${new Date().toISOString().substring(0, 7)}`,
          description: 'Auto-generated from full historical causal discovery',
          domain: 'cross-domain',
          edges: discoveryResults.relationships.slice(0, 50).map((r: any) => ({
            source: r.source_domain || r.source,
            target: r.target_domain || r.target,
            weight: r.weight || r.confidence || 0.5,
            lag_days: r.lag_days || 0,
            mechanism: r.mechanism || `Monthly discovery: ${r.source} -> ${r.target}`,
          })),
          rules: [],
          cascades: [],
          outcomes: [],
          narratives: [],
        };

        const stats = await trainer.train(this.supabase, this.organizationId, monthlyPack);
        this.log(`Monthly pack trained: ${stats.edgesTrained} edges, ${stats.rulesTrained} rules`);
      } catch (err) {
        this.log(`Training from discoveries failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Monthly growth report
    let growthReport: GrowthReport | null = null;
    try {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const [{ count: newSignals }, { count: totalSignals }, { count: newEdges }, { count: totalEdges }, { count: learningRuns }, { count: totalMemories }] = await Promise.all([
        this.supabase.from('cross_domain_signals').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId).gte('created_at', oneMonthAgo.toISOString()),
        this.supabase.from('cross_domain_signals').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId),
        this.supabase.from('causal_relationships_statistical').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId).gte('created_at', oneMonthAgo.toISOString()),
        this.supabase.from('causal_relationships_statistical').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId),
        this.supabase.from('learning_runs').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId).gte('started_at', oneMonthAgo.toISOString()),
        this.supabase.from('ai_memory').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId),
      ]);

      growthReport = {
        newSignals: newSignals ?? 0,
        totalSignals: totalSignals ?? 0,
        newEdges: newEdges ?? 0,
        totalEdges: totalEdges ?? 0,
        learningRuns: learningRuns ?? 0,
        totalMemories: totalMemories ?? 0,
        month: new Date().toISOString().substring(0, 7),
      };

      this.log('MONTHLY GROWTH:');
      this.log(`  Signals: ${growthReport.newSignals} new (${growthReport.totalSignals} total)`);
      this.log(`  Edges: ${growthReport.newEdges} new (${growthReport.totalEdges} total)`);
      this.log(`  Learning runs: ${growthReport.learningRuns}`);
      this.log(`  Memories: ${growthReport.totalMemories}`);

      // Store growth report as brain memory
      await this.supabase.from('ai_memory').insert({
        organization_id: this.organizationId,
        memory_type: 'insight',
        content: `Monthly Brain Report (${growthReport.month}): ${growthReport.newSignals} new signals, ${growthReport.newEdges} new edges, ${growthReport.learningRuns} learning runs. Total: ${growthReport.totalSignals} signals, ${growthReport.totalEdges} edges, ${growthReport.totalMemories} memories.`,
        domain: 'brain-health',
        confidence: 1.0,
        metadata: { report_type: 'monthly_growth', ...growthReport },
      });
    } catch (err) {
      this.log(`Growth report failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      success: true,
      signals: [],
      trainingPacks: [],
      metadata: { discoveryResults, growthReport },
    };
  }

  // ── Motor Commands: Monthly growth notification ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];
    if (!trainResult.success || !process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) return commands;

    const { discoveryResults, growthReport } = trainResult.metadata || {};
    const growth = growthReport as GrowthReport | undefined;
    const discovery = discoveryResults as DiscoveryResults | undefined;

    if (growth) {
      commands.push({
        commandId: `slack-monthly-report-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `📊 *Monthly Brain Growth Report (${growth.month})*\n\n` +
            `*New this month:*\n` +
            `• Signals: +${growth.newSignals} (${growth.totalSignals} total)\n` +
            `• Causal edges: +${growth.newEdges} (${growth.totalEdges} total)\n` +
            `• Learning runs: ${growth.learningRuns}\n` +
            `• Memories: ${growth.totalMemories}\n\n` +
            `*Discovery:* ${discovery?.relationships?.length ?? 0} relationships found (${discovery?.newRelationships ?? 0} new)\n\n` +
            `_${this.brainRegion}_`,
        },
        priority: 'normal',
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
  name: 'monthly-deep-analysis',
  description: 'Full historical causal discovery on ALL data + monthly growth report',
  version: '6.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new MonthlyDeepAnalysisAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', { verbose: config.verbose }) as any;
  },
  schedule: '0 3 1 * *',  // 1st of each month at 3 AM UTC
  resourceRequirements: { cpu: '2048', memory: '8192' },
  tags: ['analysis', 'hippocampus', 'deep-sleep', 'monthly'],
});
