/**
 * StackExchange Trainer Agent — Q&A Engineering Knowledge
 *
 * Learns engineering knowledge patterns from 8 StackOverflow/Code Review categories:
 * testing, SQL, architecture, code-quality, incident, dependency, performance, data-modeling.
 *
 * Signals: se_knowledge_depth, se_community_expertise, se_problem_complexity,
 * se_knowledge_freshness, se_topic_interconnection, se_answer_quality
 * 4 training packs with computed correlations.
 */

import {
  BaseTrainingAgent,
  type AgentConfig,
  type FetchResult,
  type ConvertResult,
  type TrainResult,
  type ValidationResult,
} from '../agent-framework/base-training-agent';
import { fetchAllStackExchangeData, TAG_CATEGORIES, type TagCategoryData } from './stackexchange-trainer-fetcher';
import { convertStackExchangeToSignals, buildStackExchangeTrainingPacks } from './stackexchange-signal-converter';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

export class StackExchangeTrainerAgent extends BaseTrainingAgent {
  readonly name = 'stackexchange-trainer';
  readonly version = '1.0.0';
  readonly description = 'Learns engineering knowledge patterns from 8 StackExchange categories (testing, SQL, architecture, etc.)';

  private fetchedData: TagCategoryData[] = [];

  constructor(config: AgentConfig) {
    super(config);
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
    const categories = this.config.dryRun ? TAG_CATEGORIES.slice(0, 2) : TAG_CATEGORIES;

    this.log('FETCH', `Targeting ${categories.length} StackExchange categories`);
    this.log('FETCH', 'Sources: stackoverflow.com, codereview.stackexchange.com (public, no auth)');

    this.fetchedData = await fetchAllStackExchangeData(categories, {
      maxPages: this.config.dryRun ? 1 : 3,
      rateLimitDelay: 300,
      apiKey: process.env.STACKEXCHANGE_API_KEY,
    });

    const totalQs = this.fetchedData.reduce((sum, c) => sum + c.questions.length, 0);
    this.log('FETCH', `Fetched ${totalQs} questions from ${this.fetchedData.length} categories`);

    return {
      data: this.fetchedData,
      sources: this.fetchedData.map(c => `${c.site}:${c.category}`),
      recordCount: totalQs,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const allSignals: ConnectorSignal[] = [];
    for (const catData of fetchResult.data as TagCategoryData[]) {
      const signals = convertStackExchangeToSignals(catData, this.organizationId);
      allSignals.push(...signals);
      this.log('CONVERT', `${catData.category}: ${signals.length} signals`);
    }
    const packs = buildStackExchangeTrainingPacks(fetchResult.data);
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
    const score = Math.min(1, (result.signalsStored / 50) * 0.5 + (result.packsProcessed / 4) * 0.5);
    return { passed: issues.length === 0, score, issues };
  }
}
