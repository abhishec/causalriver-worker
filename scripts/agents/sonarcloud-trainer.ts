/**
 * SonarCloud Trainer Agent — Public Code Quality Intelligence
 *
 * Learns code quality patterns from public SonarCloud projects.
 * Signals: sonar_code_health, sonar_test_coverage, sonar_duplication,
 * sonar_maintainability, sonar_security_rating, sonar_quality_gate
 * 3 training packs with computed correlations.
 */

import {
  BaseTrainingAgent,
  type AgentConfig,
  type FetchResult,
  type ConvertResult,
  type TrainResult,
  type ValidationResult,
} from '../agent-framework/base-training-agent';
import { fetchAllSonarCloudData, type OrgQualityData } from './sonarcloud-trainer-fetcher';
import { convertSonarCloudToSignals, buildSonarCloudTrainingPacks } from './sonarcloud-signal-converter';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

export class SonarCloudTrainerAgent extends BaseTrainingAgent {
  readonly name = 'sonarcloud-trainer';
  readonly version = '1.0.0';
  readonly description = 'Learns code quality patterns from public SonarCloud projects (coverage, bugs, maintainability)';

  private fetchedData: OrgQualityData[] = [];

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
    this.log('FETCH', 'Searching SonarCloud for public project quality metrics');
    this.log('FETCH', 'Source: sonarcloud.io (public, no auth)');

    this.fetchedData = await fetchAllSonarCloudData({
      rateLimitDelay: this.config.dryRun ? 200 : 500,
      maxProjectsPerOrg: this.config.dryRun ? 5 : 20,
    });

    const totalProjects = this.fetchedData.reduce((sum, o) => sum + o.projects.length, 0);
    this.log('FETCH', `Fetched quality metrics for ${totalProjects} projects from ${this.fetchedData.length} orgs`);

    return {
      data: this.fetchedData,
      sources: this.fetchedData.map(o => o.organization),
      recordCount: totalProjects,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const allSignals: ConnectorSignal[] = [];
    for (const orgData of fetchResult.data as OrgQualityData[]) {
      const signals = convertSonarCloudToSignals(orgData, this.organizationId);
      allSignals.push(...signals);
      this.log('CONVERT', `${orgData.organization}: ${signals.length} signals (${orgData.projects.length} projects)`);
    }
    const packs = buildSonarCloudTrainingPacks(fetchResult.data);
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
    const score = Math.min(1, (result.signalsStored / 30) * 0.5 + (result.packsProcessed / 3) * 0.5);
    return { passed: issues.length === 0, score, issues };
  }
}
