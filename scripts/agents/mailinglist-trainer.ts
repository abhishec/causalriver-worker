/**
 * Mailing List Trainer Agent — Apache Pony Mail Archive
 *
 * Deep engineering communication intelligence from 7 Apache dev mailing lists.
 * Signals: thread_depth, response_velocity, contributor_diversity,
 * activity_level, cross_thread_participation
 * 2 training packs with computed correlations.
 */

import {
  BaseTrainingAgent,
  type AgentConfig,
  type FetchResult,
  type ConvertResult,
  type TrainResult,
  type ValidationResult,
} from '../agent-framework/base-training-agent';
import { fetchAllMailingListData, TARGET_LISTS, type MailingListData } from './mailinglist-trainer-fetcher';
import { convertMailingListToSignals, buildMailingListTrainingPacks } from './mailinglist-signal-converter';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

export class MailingListTrainerAgent extends BaseTrainingAgent {
  readonly name = 'mailinglist-trainer';
  readonly version = '1.0.0';
  readonly description = 'Learns engineering communication patterns from 7 Apache dev mailing lists (Kafka, Spark, Hadoop, etc.)';

  private lists: Array<{ list: string; domain: string }>;
  private fetchedData: MailingListData[] = [];

  constructor(config: AgentConfig, lists?: Array<{ list: string; domain: string }>) {
    super(config);
    this.lists = lists || TARGET_LISTS;
  }

  private async recordRunCompletion(result: TrainResult): Promise<void> {
    try {
      await this.supabase.from('agent_run_history').insert({
        agent_name: this.name, agent_version: this.version,
        organization_id: this.organizationId, status: 'success',
        signals_stored: result.signalsStored, packs_processed: result.packsProcessed,
        discoveries: result.discoveries, run_mode: 'full',
        completed_at: new Date().toISOString(),
      });
    } catch { this.log('TRAIN', 'Could not record run history'); }
  }

  async fetch(): Promise<FetchResult> {
    const monthsBack = parseInt(process.env.MAILINGLIST_MONTHS || '3', 10);
    const targets = this.config.dryRun ? this.lists.slice(0, 1) : this.lists;

    this.log('FETCH', `Targeting ${targets.length} Apache dev mailing lists (${monthsBack} months back)`);
    this.log('FETCH', 'Source: lists.apache.org (public, no auth needed)');

    this.fetchedData = await fetchAllMailingListData(targets, {
      monthsBack,
      rateLimitDelay: 500,
    });

    const totalMsgs = this.fetchedData.reduce((sum, l) => sum + l.messages.length, 0);
    this.log('FETCH', `Fetched ${totalMsgs} messages from ${this.fetchedData.length} lists`);

    return {
      data: this.fetchedData,
      sources: this.fetchedData.map(l => l.listName),
      recordCount: totalMsgs,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const allSignals: ConnectorSignal[] = [];
    for (const listData of fetchResult.data as MailingListData[]) {
      const signals = convertMailingListToSignals(listData, this.organizationId);
      allSignals.push(...signals);
      this.log('CONVERT', `${listData.listName}: ${signals.length} signals`);
    }
    const packs = buildMailingListTrainingPacks(fetchResult.data);
    this.log('CONVERT', `Generated ${allSignals.length} signals + ${packs.length} packs`);
    return { signals: allSignals, packs };
  }

  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const result: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };

    if (this.config.dryRun) {
      this.log('TRAIN', `[DRY RUN] ${signals.length} signals, ${packs.length} packs`);
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
      } catch (err) {
        this.logError('TRAIN', 'Batch failed', err);
        this.errors.push('Batch failed');
      }
    }

    try {
      const trainer = createBrainTrainer();
      const trainResult = await trainer.trainBatch(this.supabase, this.organizationId, packs);
      result.packsProcessed = packs.length;
      result.discoveries = trainResult?.casesLoaded ?? 0;
    } catch (err) {
      this.logError('TRAIN', 'Brain trainer failed', err);
      this.errors.push(`Brain trainer: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const jobs = createScheduledJobs(this.supabase);
      await jobs.runDailyCausalDiscovery(this.organizationId);
    } catch (err) { this.logError('TRAIN', 'Causal discovery failed (non-fatal)', err); }

    await this.recordRunCompletion(result);
    return result;
  }

  async validate(result: TrainResult): Promise<ValidationResult> {
    const issues: string[] = [];
    if (!this.config.dryRun && result.signalsStored === 0) issues.push('No signals stored');
    const score = Math.min(1, (result.signalsStored / 50) * 0.5 + (result.packsProcessed / 2) * 0.5);
    return { passed: issues.length === 0, score, issues };
  }
}
