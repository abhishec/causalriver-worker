/**
 * GitHub Discussions Trainer Agent
 *
 * Best Slack proxy: Threaded conversations anchored to code.
 * Targets repos with active Discussions: Next.js, React, Svelte, Vue, Deno, etc.
 *
 * Signal types: response_latency, resolution_rate, engagement_depth,
 * content_quality, contributor_diversity, category_balance
 *
 * 3 training packs with computed Pearson r correlations.
 */

import {
  BaseTrainingAgent,
  type AgentConfig,
  type FetchResult,
  type ConvertResult,
  type TrainResult,
  type ValidationResult,
} from '../agent-framework/base-training-agent';
import { fetchAllDiscussions, type RepoDiscussionData } from './discussions-trainer-fetcher';
import { convertDiscussionsToSignals, buildDiscussionsTrainingPacks } from './discussions-signal-converter';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

export const TARGET_REPOS = [
  'vercel/next.js',         // 27K+ discussions
  'facebook/react',         // Active discussions
  'sveltejs/svelte',        // Good community engagement
  'vuejs/core',             // Community-driven
  'denoland/deno',          // Security-first runtime
  'nodejs/node',            // Foundation of server JS
  'rust-lang/rust',         // Language discussions
  'microsoft/vscode',       // IDE discussions
  'supabase/supabase',      // BaaS discussions
  'langchain-ai/langchain', // AI/LLM discussions
];

export class DiscussionsTrainerAgent extends BaseTrainingAgent {
  readonly name = 'discussions-trainer';
  readonly version = '1.0.0';
  readonly description = 'Learns communication patterns from GitHub Discussions (Slack proxy) across 10 major repos';

  private repos: string[];
  private fetchedData: RepoDiscussionData[] = [];
  private runMode: 'full' | 'incremental' = 'incremental';
  private sinceDate: string | undefined;

  constructor(config: AgentConfig, repos?: string[]) {
    super(config);
    this.repos = repos || TARGET_REPOS;
    this.runMode = process.env.DISCUSSIONS_TRAINER_MODE === 'full' ? 'full' : 'incremental';
  }

  private async getLastRunDate(): Promise<string | undefined> {
    try {
      const { data } = await this.supabase
        .from('agent_run_history')
        .select('completed_at')
        .eq('agent_name', this.name)
        .eq('status', 'success')
        .order('completed_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) return data[0].completed_at;
    } catch { /* first run */ }
    return undefined;
  }

  private async recordRunCompletion(result: TrainResult): Promise<void> {
    try {
      await this.supabase.from('agent_run_history').insert({
        agent_name: this.name,
        agent_version: this.version,
        organization_id: this.organizationId,
        status: 'success',
        signals_stored: result.signalsStored,
        packs_processed: result.packsProcessed,
        discoveries: result.discoveries,
        run_mode: this.runMode,
        completed_at: new Date().toISOString(),
      });
    } catch {
      this.log('TRAIN', 'Could not record run history');
    }
  }

  async fetch(): Promise<FetchResult> {
    const isIncremental = this.runMode !== 'full';
    const maxDiscussions = parseInt(
      process.env.DISCUSSIONS_TRAINER_MAX || (isIncremental ? '200' : '500'),
      10,
    );

    if (this.runMode === 'incremental') {
      this.sinceDate = await this.getLastRunDate();
      if (this.sinceDate) {
        this.log('FETCH', `📈 INCREMENTAL MODE: Since ${this.sinceDate}`);
      } else {
        this.log('FETCH', '🆕 FIRST RUN: Full fetch');
        this.runMode = 'full';
      }
    }

    const targetRepos = this.config.dryRun ? this.repos.slice(0, 1) : this.repos;
    this.log('FETCH', `Targeting ${targetRepos.length} repos, max ${maxDiscussions} discussions each`);

    if (!process.env.GITHUB_TOKEN) {
      this.log('FETCH', '⚠️ No GITHUB_TOKEN — GitHub GraphQL API requires authentication!');
    }

    this.fetchedData = await fetchAllDiscussions(targetRepos, {
      maxDiscussions,
      since: this.sinceDate,
      rateLimitDelay: 100,
    });

    const totalRecords = this.fetchedData.reduce((sum, r) => sum + r.discussions.length, 0);
    this.log('FETCH', `Mode: ${this.runMode} | Discussions: ${totalRecords} | Repos: ${this.fetchedData.length}/${targetRepos.length}`);

    return {
      data: this.fetchedData,
      sources: this.fetchedData.map(r => `${r.owner}/${r.repo}`),
      recordCount: totalRecords,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const repoDataList: RepoDiscussionData[] = fetchResult.data;
    const allSignals: ConnectorSignal[] = [];

    for (const repoData of repoDataList) {
      const signals = convertDiscussionsToSignals(repoData, this.organizationId);
      allSignals.push(...signals);
      this.log('CONVERT', `${repoData.owner}/${repoData.repo}: ${signals.length} signals`);
    }

    const packs = buildDiscussionsTrainingPacks(repoDataList);
    this.log('CONVERT', `Generated ${allSignals.length} total signals + ${packs.length} training packs`);

    return { signals: allSignals, packs };
  }

  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const result: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };

    if (this.config.dryRun) {
      this.log('TRAIN', `[DRY RUN] Would store ${signals.length} signals and ${packs.length} packs`);
      result.signalsStored = signals.length;
      result.packsProcessed = packs.length;
      return result;
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < signals.length; i += BATCH_SIZE) {
      const batch = signals.slice(i, i + BATCH_SIZE);
      try {
        await storeConnectorSignals(this.supabase, batch);
        result.signalsStored += batch.length;
        this.log('TRAIN', `Stored batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} signals`);
      } catch (err) {
        this.logError('TRAIN', `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed`, err);
        this.errors.push(`Signal batch ${Math.floor(i / BATCH_SIZE) + 1} failed`);
      }
    }

    try {
      const trainer = createBrainTrainer();
      const trainResult = await trainer.trainBatch(this.supabase, this.organizationId, packs);
      result.packsProcessed = packs.length;
      result.discoveries = trainResult?.casesLoaded ?? 0;
      this.log('TRAIN', `Brain trainer: ${packs.length} packs, ${trainResult.causalEdgesLoaded} edges`);
    } catch (err) {
      this.logError('TRAIN', 'Brain trainer failed', err);
      this.errors.push(`Brain trainer: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      this.log('TRAIN', 'Running causal discovery...');
      const jobs = createScheduledJobs(this.supabase);
      await jobs.runDailyCausalDiscovery(this.organizationId);
      this.log('TRAIN', 'Causal discovery complete');
    } catch (err) {
      this.logError('TRAIN', 'Causal discovery failed (non-fatal)', err);
    }

    await this.recordRunCompletion(result);
    this.log('TRAIN', `Progressive learning recorded (mode=${this.runMode})`);
    return result;
  }

  async validate(result: TrainResult): Promise<ValidationResult> {
    const issues: string[] = [];
    if (!this.config.dryRun && this.runMode !== 'incremental') {
      if (result.signalsStored === 0) issues.push('No signals stored');
      if (result.packsProcessed === 0) issues.push('No packs processed');
    }
    const signalTarget = this.runMode === 'incremental' ? 30 : 100;
    const score = Math.min(1, (result.signalsStored / signalTarget) * 0.5 + (result.packsProcessed / 3) * 0.5);
    return { passed: issues.length === 0, score, issues };
  }
}
