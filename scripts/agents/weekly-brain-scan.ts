/**
 * NexusBrain Weekly Brain Scan Agent (V6 Manus)
 *
 * Brain Region: Cerebellum (Weekly Evaluator)
 * Neurological Function: Comprehensive Brain Health Assessment
 *
 * Runs every Sunday — 11-region brain scan + performance benchmarks:
 *   1. Run benchmark suite (Sachs, ALARM, SaaS, Cascade, Anomaly)
 *   2. Evaluate brain maturity across all 11 brain regions
 *   3. Compare with previous week's regional scores
 *   4. Prune edges unvalidated for 60+ days
 *   5. Store results for trend tracking
 *
 * Schedule: Every Sunday at 4:00 AM UTC
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';

// ────────────────────────────────────────────────────────────────────────────
// Weekly Brain Scan Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

interface RegionScore {
  score: number;
  level: string;
}

interface MaturityReport {
  overallLevel: string;
  overallScore: number;
  allRegionsExpert: boolean;
  regionScores: Record<string, RegionScore>;
}

interface BrainHealthStats {
  edgeCount: number;
  signalCount: number;
  memoryCount: number;
  predictionCount: number;
  staleEdgesPruned: number;
}

export class WeeklyBrainScanAgent extends ManusNativeAgent {
  readonly name = 'weekly-brain-scan';
  readonly version = '7.0.0';
  readonly description = '11-region brain scan + benchmarks + stale edge pruning + health summary';
  readonly brainRegion = 'Cerebellum (Weekly Evaluator)';
  readonly neurologicalFunction = 'Comprehensive Brain Health Assessment';

  // ── Fetch: Run benchmark suite ──
  async fetch(): Promise<FetchResult> {
    this.log('Starting weekly brain scan...');

    let benchmarkReport: any = null;
    let maturityReport: MaturityReport | null = null;

    try {
      const { createBenchmarkRunner } = await import('../../packages/memory-stack/src/benchmarks/benchmark-runner');
      const runner = createBenchmarkRunner({
        benchmarks: ['sachs', 'alarm', 'saas', 'cascade', 'anomaly'],
        trainFromResults: false,
        trainFromLibrary: false,
        verbose: this.verbose,
      });

      benchmarkReport = runner.runFullSuite();

      if (benchmarkReport?.maturity) {
        maturityReport = benchmarkReport.maturity;
        this.log(`Brain Maturity: ${maturityReport!.overallLevel} (${maturityReport!.overallScore}/100)`);
      }
    } catch (err) {
      this.log(`Benchmark suite failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      success: true,
      data: { benchmarkReport, maturityReport },
    };
  }

  // ── Convert: Evaluate regions + prune stale edges ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success) return { success: false, signals: [], trainingPacks: [] };

    const { maturityReport } = fetchResult.data as { maturityReport: MaturityReport | null };

    // Log 11-region scores
    if (maturityReport?.regionScores) {
      const rs = maturityReport.regionScores;
      this.log('11-REGION BRAIN SCAN:');
      this.log(`  PERCEPTION:     Sensory Cortex ${rs.sensoryCortex?.score ?? 'N/A'}/100`);
      this.log(`  MEMORY:         Hippocampus ${rs.hippocampus?.score ?? 'N/A'}/100, Basal Ganglia ${rs.basalGanglia?.score ?? 'N/A'}/100, LTP ${rs.ltp?.score ?? 'N/A'}/100`);
      this.log(`  REASONING:      Prefrontal Cortex ${rs.prefrontalCortex?.score ?? 'N/A'}/100, DMN ${rs.dmn?.score ?? 'N/A'}/100`);
      this.log(`  DETECTION:      Thalamus ${rs.thalamus?.score ?? 'N/A'}/100, Insula ${rs.insula?.score ?? 'N/A'}/100, Amygdala ${rs.amygdala?.score ?? 'N/A'}/100`);
      this.log(`  COORDINATION:   Cerebellum ${rs.cerebellum?.score ?? 'N/A'}/100, Corpus Callosum ${rs.corpusCallosum?.score ?? 'N/A'}/100`);
      this.log(`  All Expert: ${maturityReport.allRegionsExpert ? 'YES' : 'NO'}`);
    }

    // Prune stale edges (60+ days, low evidence)
    let staleEdgesPruned = 0;
    try {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: staleEdges } = await this.supabase
        .from('causal_relationships_statistical')
        .select('id, source_domain, target_domain, evidence_weight')
        .eq('organization_id', this.organizationId)
        .lt('updated_at', sixtyDaysAgo.toISOString())
        .lt('evidence_weight', 0.3);

      if (staleEdges && staleEdges.length > 0) {
        const staleIds = staleEdges.map(e => e.id);
        const { error: deleteError } = await this.supabase
          .from('causal_relationships_statistical')
          .delete()
          .in('id', staleIds);

        if (!deleteError) {
          staleEdgesPruned = staleEdges.length;
          this.log(`Pruned ${staleEdgesPruned} stale synapses (>60 days, evidence <0.3)`);
        }
      } else {
        this.log('No stale synapses to prune — graph is healthy');
      }
    } catch (err) {
      this.log(`Pruning failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Brain health stats
    const healthStats: BrainHealthStats = { edgeCount: 0, signalCount: 0, memoryCount: 0, predictionCount: 0, staleEdgesPruned };
    try {
      const { count: edges } = await this.supabase.from('causal_relationships_statistical').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId);
      const { count: signals } = await this.supabase.from('cross_domain_signals').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId);
      const { count: memories } = await this.supabase.from('ai_memory').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId);
      const { count: predictions } = await this.supabase.from('prediction_records').select('*', { count: 'exact', head: true }).eq('organization_id', this.organizationId);

      healthStats.edgeCount = edges ?? 0;
      healthStats.signalCount = signals ?? 0;
      healthStats.memoryCount = memories ?? 0;
      healthStats.predictionCount = predictions ?? 0;

      this.log(`Brain Health: ${healthStats.edgeCount} edges, ${healthStats.signalCount} signals, ${healthStats.memoryCount} memories, ${healthStats.predictionCount} predictions`);
    } catch (err) {
      this.log(`Health stats failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      success: true,
      signals: [],
      trainingPacks: [],
      metadata: { maturityReport, healthStats, staleEdgesPruned },
    };
  }

  // ── Motor Commands: Weekly health report notifications ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];
    if (!trainResult.success || !process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL_ID) return commands;

    const { maturityReport, healthStats } = trainResult.metadata || {};
    const report = maturityReport as MaturityReport | undefined;
    const stats = healthStats as BrainHealthStats | undefined;

    if (report || stats) {
      const maturityLine = report
        ? `*Maturity:* ${report.overallLevel} (${report.overallScore}/100) | All Expert: ${report.allRegionsExpert ? 'YES' : 'NO'}`
        : 'Maturity: N/A (benchmark failed)';

      const healthLine = stats
        ? `*Health:* ${stats.edgeCount} edges | ${stats.signalCount} signals | ${stats.memoryCount} memories | ${stats.predictionCount} predictions`
        : '';

      const pruneLine = stats?.staleEdgesPruned
        ? `*Pruned:* ${stats.staleEdgesPruned} stale synapses`
        : '';

      commands.push({
        commandId: `slack-weekly-scan-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `🧠 *Weekly Brain Scan Complete*\n\n${maturityLine}\n${healthLine}\n${pruneLine}\n\n_${this.brainRegion}_`,
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
  name: 'weekly-brain-scan',
  description: '11-region brain scan + benchmarks + stale edge pruning + health summary',
  version: '6.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new WeeklyBrainScanAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', { verbose: config.verbose }) as any;
  },
  schedule: '0 4 * * 0',  // Sunday at 4 AM UTC
  resourceRequirements: { cpu: '1024', memory: '4096' },
  tags: ['scan', 'cerebellum', 'health', 'weekly'],
});
