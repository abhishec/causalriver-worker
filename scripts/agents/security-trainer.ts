/**
 * Security Trainer Agent — OSV/GHSA Vulnerability Intelligence
 *
 * Trains the core brain on security landscape patterns from GitHub Advisory Database.
 * Covers npm, PyPI, Go, Maven, crates.io ecosystems.
 *
 * Signals: severity_distribution, patch_rate, critical_density, vuln_volume, cwe_diversity
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
import { fetchAllSecurityData, TARGET_ECOSYSTEMS, type EcosystemSecurityData } from './security-trainer-fetcher';
import { convertSecurityToSignals, buildSecurityTrainingPacks } from './security-signal-converter';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

export class SecurityTrainerAgent extends BaseTrainingAgent {
  readonly name = 'security-trainer';
  readonly version = '1.0.0';
  readonly description = 'Learns security landscape patterns from GHSA/OSV across 5 ecosystems (npm, PyPI, Go, Maven, crates.io)';

  private ecosystems: string[];
  private fetchedData: EcosystemSecurityData[] = [];
  private runMode: 'full' | 'incremental' = 'incremental';
  private sinceDate: string | undefined;

  constructor(config: AgentConfig, ecosystems?: string[]) {
    super(config);
    this.ecosystems = ecosystems || TARGET_ECOSYSTEMS;
    this.runMode = process.env.SECURITY_TRAINER_MODE === 'full' ? 'full' : 'incremental';
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
        agent_name: this.name, agent_version: this.version,
        organization_id: this.organizationId, status: 'success',
        signals_stored: result.signalsStored, packs_processed: result.packsProcessed,
        discoveries: result.discoveries, run_mode: this.runMode,
        completed_at: new Date().toISOString(),
      });
    } catch { this.log('TRAIN', 'Could not record run history'); }
  }

  async fetch(): Promise<FetchResult> {
    const maxVulns = parseInt(process.env.SECURITY_TRAINER_MAX || '500', 10);

    if (this.runMode === 'incremental') {
      this.sinceDate = await this.getLastRunDate();
      if (this.sinceDate) {
        this.log('FETCH', `📈 INCREMENTAL: Since ${this.sinceDate}`);
      } else {
        this.log('FETCH', '🆕 FIRST RUN: Full fetch');
        this.runMode = 'full';
      }
    }

    const targets = this.config.dryRun ? this.ecosystems.slice(0, 1) : this.ecosystems;
    this.log('FETCH', `Targeting ${targets.length} ecosystems: ${targets.join(', ')}`);

    this.fetchedData = await fetchAllSecurityData(targets, {
      maxVulns,
      since: this.sinceDate,
      rateLimitDelay: 100,
    });

    const totalRecords = this.fetchedData.reduce((sum, e) => sum + e.vulnerabilities.length, 0);
    this.log('FETCH', `Mode: ${this.runMode} | Vulns: ${totalRecords} | Ecosystems: ${this.fetchedData.length}/${targets.length}`);

    return {
      data: this.fetchedData,
      sources: this.fetchedData.map(e => `ghsa/${e.ecosystem}`),
      recordCount: totalRecords,
    };
  }

  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const allSignals: ConnectorSignal[] = [];
    for (const ecoData of fetchResult.data as EcosystemSecurityData[]) {
      const signals = convertSecurityToSignals(ecoData, this.organizationId);
      allSignals.push(...signals);
      this.log('CONVERT', `${ecoData.ecosystem}: ${signals.length} signals`);
    }
    const packs = buildSecurityTrainingPacks(fetchResult.data);
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
        this.logError('TRAIN', `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed`, err);
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
    if (!this.config.dryRun && this.runMode !== 'incremental' && result.signalsStored === 0) {
      issues.push('No signals stored');
    }
    const score = Math.min(1, (result.signalsStored / 50) * 0.5 + (result.packsProcessed / 2) * 0.5);
    return { passed: issues.length === 0, score, issues };
  }
}
