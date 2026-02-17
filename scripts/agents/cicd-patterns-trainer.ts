/**
 * CI/CD Patterns Trainer Agent — GitHub Actions Workflow Intelligence
 *
 * Learns CI/CD pipeline patterns from 30 top open-source repos.
 * Signals: cicd_pipeline_complexity, cicd_security_posture, cicd_reliability_patterns,
 * cicd_success_rate, cicd_action_diversity, cicd_trigger_diversity
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
import { fetchAllCICDData, TARGET_CICD_REPOS, type RepoWorkflowData } from './cicd-patterns-trainer-fetcher';
import { convertCICDToSignals, buildCICDTrainingPacks } from './cicd-patterns-signal-converter';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

export class CICDPatternsTrainerAgent extends BaseTrainingAgent {
  readonly name = 'cicd-patterns-trainer';
  readonly version = '1.0.0';
  readonly description = 'Learns CI/CD pipeline patterns from 30 top GitHub repos (workflows, actions, build patterns)';

  private fetchedData: RepoWorkflowData[] = [];

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
    const repos = this.config.dryRun ? TARGET_CICD_REPOS.slice(0, 3) : TARGET_CICD_REPOS;

    this.log('FETCH', `Targeting ${repos.length} repos for CI/CD workflow analysis`);
    this.log('FETCH', 'Sources: GitHub Contents API + raw.githubusercontent.com');

    this.fetchedData = await fetchAllCICDData(repos, {
      rateLimitDelay: 400,
      githubToken: process.env.GITHUB_TOKEN,
      maxWorkflowRuns: this.config.dryRun ? 10 : 50,
    });

    const totalWfs = this.fetchedData.reduce((sum, r) => sum + r.workflows.length, 0);
    this.log('FETCH', `Fetched ${totalWfs} workflow files from ${this.fetchedData.length} repos`);

    return {
      data: this.fetchedData,
      sources: this.fetchedData.map(r => r.fullName),
      recordCount: totalWfs,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const allSignals: ConnectorSignal[] = [];
    for (const repoData of fetchResult.data as RepoWorkflowData[]) {
      const signals = convertCICDToSignals(repoData, this.organizationId);
      allSignals.push(...signals);
      if (signals.length > 0) {
        this.log('CONVERT', `${repoData.fullName}: ${signals.length} signals (${repoData.workflows.length} workflows)`);
      }
    }
    const packs = buildCICDTrainingPacks(fetchResult.data);
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
