/**
 * Dependency Intelligence Trainer Agent
 *
 * Trains the core brain on dependency health patterns from npm + PyPI.
 * 40 npm packages + 40 PyPI packages = 80 of the most-depended-on packages.
 *
 * Signals: dep_freshness, dep_deprecation_risk, dep_release_cadence,
 * dep_complexity, dep_maintainer_bus_factor
 *
 * 2 training packs with computed Pearson r correlations.
 */

import {
  BaseTrainingAgent,
  type AgentConfig,
  type FetchResult,
  type ConvertResult,
  type TrainResult,
  type ValidationResult,
} from '../agent-framework/base-training-agent';
import { fetchAllDependencyData, type RegistryData } from './deps-trainer-fetcher';
import { convertDepsToSignals, buildDepsTrainingPacks } from './deps-signal-converter';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

export class DepsTrainerAgent extends BaseTrainingAgent {
  readonly name = 'deps-trainer';
  readonly version = '1.0.0';
  readonly description = 'Learns dependency health patterns from 80 top npm/PyPI packages (freshness, deprecation, complexity, bus factor)';

  private fetchedData: RegistryData[] = [];

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
    this.log('FETCH', 'Fetching dependency data from npm + PyPI registries (public, no auth)');

    this.fetchedData = await fetchAllDependencyData({
      rateLimitDelay: 100,
    });

    const totalPkgs = this.fetchedData.reduce((sum, r) => sum + r.packages.length, 0);
    this.log('FETCH', `Fetched ${totalPkgs} packages across ${this.fetchedData.length} ecosystems`);

    return {
      data: this.fetchedData,
      sources: this.fetchedData.map(r => `registry/${r.ecosystem}`),
      recordCount: totalPkgs,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const allSignals: ConnectorSignal[] = [];
    for (const regData of fetchResult.data as RegistryData[]) {
      const signals = convertDepsToSignals(regData, this.organizationId);
      allSignals.push(...signals);
      this.log('CONVERT', `${regData.ecosystem}: ${signals.length} signals from ${regData.packages.length} packages`);
    }
    const packs = buildDepsTrainingPacks(fetchResult.data);
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
        this.logError('TRAIN', `Batch failed`, err);
        this.errors.push(`Batch failed`);
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
    const score = Math.min(1, (result.signalsStored / 100) * 0.5 + (result.packsProcessed / 2) * 0.5);
    return { passed: issues.length === 0, score, issues };
  }
}
