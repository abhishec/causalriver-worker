/**
 * JIRA Trainer Agent
 *
 * Trains the NexusBrain core brain on project management & engineering patterns
 * from 7 major Apache JIRA projects. Discovers causal relationships between:
 * - Issue triage quality → resolution speed
 * - Discussion depth → fix quality (reopen rate)
 * - Severity pressure → velocity
 * - PM practices → engineering outcomes (cross-domain)
 *
 * Built on the NexusBrain Agent Framework (BaseTrainingAgent).
 * Data source: Apache's public JIRA (issues.apache.org) — no auth needed.
 *
 * Usage:
 *   pnpm exec tsx scripts/jira-trainer-runner.ts
 *   JIRA_TRAINER_DRY_RUN=true pnpm exec tsx scripts/jira-trainer-runner.ts
 */

import {
  BaseTrainingAgent,
  type AgentConfig,
  type FetchResult,
  type ConvertResult,
  type TrainResult,
  type ValidationResult,
} from '../agent-framework/base-training-agent';
import { fetchAllJiraProjects, type JiraProjectData } from './jira-trainer-fetcher';
import { convertJiraToSignals, buildJiraTrainingPacks } from './jira-signal-converter';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// TARGET APACHE JIRA PROJECTS
// ============================================================================

/**
 * 7 flagship Apache projects — world-class engineering with rich JIRA history.
 * All use public JIRA at issues.apache.org (no auth needed).
 *
 * Combined: 210,000+ issues, decades of project management data.
 */
export const TARGET_PROJECTS = [
  'KAFKA',       // Event streaming — 20K+ issues, extremely active
  'SPARK',       // Big data — 40K+ issues, rich components
  'HADOOP',      // Distributed storage — 19K+ issues, legacy wisdom
  'CASSANDRA',   // NoSQL DB — 20K+ issues, complex transitions
  'FLINK',       // Stream processing — 21K+ issues, modern workflows
  'HBASE',       // Wide-column store — 28K+ issues, deep history
  'HIVE',        // Data warehouse — 28K+ issues, enterprise patterns
];

// ============================================================================
// JIRA TRAINER AGENT
// ============================================================================

export class JiraTrainerAgent extends BaseTrainingAgent {
  readonly name = 'jira-trainer';
  readonly version = '1.0.0';
  readonly description = 'Nightly progressive trainer: learns project management patterns from 7 major Apache JIRA projects';

  private projects: string[];
  private fetchedData: JiraProjectData[] = [];
  private runMode: 'full' | 'incremental' = 'incremental';
  private sinceDate: string | undefined;

  constructor(config: AgentConfig, projects?: string[]) {
    super(config);
    this.projects = projects || TARGET_PROJECTS;
    this.runMode = process.env.JIRA_TRAINER_MODE === 'full' ? 'full' : 'incremental';
  }

  // ── PROGRESSIVE LEARNING: Track last successful run ──
  private async getLastRunDate(): Promise<string | undefined> {
    try {
      const { data } = await this.supabase
        .from('agent_run_history')
        .select('completed_at')
        .eq('agent_name', this.name)
        .eq('status', 'success')
        .order('completed_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        return data[0].completed_at;
      }
    } catch {
      // Table may not exist yet — fall back to full run
    }
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
      this.log('TRAIN', 'Could not record run history (table may not exist)');
    }
  }

  // ── FETCH: Pull data from Apache JIRA (incremental or full) ──
  async fetch(): Promise<FetchResult> {
    const isIncremental = this.runMode !== 'full';
    const maxIssuesPerProject = parseInt(
      process.env.JIRA_TRAINER_MAX_ISSUES || (isIncremental ? '500' : '1000'),
      10,
    );

    // Progressive learning: only fetch new data since last successful run
    if (this.runMode === 'incremental') {
      this.sinceDate = await this.getLastRunDate();
      if (this.sinceDate) {
        this.log('FETCH', `📈 INCREMENTAL MODE: Fetching only data since ${this.sinceDate}`);
      } else {
        this.log('FETCH', '🆕 FIRST RUN: No previous run found — doing full fetch');
        this.runMode = 'full';
      }
    } else {
      this.log('FETCH', '🔄 FULL MODE: Fetching ALL available data');
    }

    // In dry-run mode, only fetch from first project
    const targetProjects = this.config.dryRun ? this.projects.slice(0, 1) : this.projects;

    this.log('FETCH', `Targeting ${targetProjects.length} Apache JIRA projects: ${targetProjects.join(', ')}`);
    this.log('FETCH', `Max per project: ${maxIssuesPerProject} issues (with changelog)`);
    this.log('FETCH', 'No auth needed — Apache JIRA is fully public read-only');

    this.fetchedData = await fetchAllJiraProjects(targetProjects, {
      maxIssues: maxIssuesPerProject,
      fetchChangelog: true,
      since: this.sinceDate,
      rateLimitDelay: 200, // Be a good citizen: ~5 req/sec
    });

    const totalRecords = this.fetchedData.reduce((sum, p) => sum + p.issues.length, 0);

    this.log('FETCH', `Mode: ${this.runMode} | Issues: ${totalRecords} | Projects: ${this.fetchedData.length}/${targetProjects.length}`);

    return {
      data: this.fetchedData,
      sources: this.fetchedData.map(p => `apache/${p.project}`),
      recordCount: totalRecords,
    };
  }

  // ── CONVERT: Transform to brain signals + training packs ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const projectDataList: JiraProjectData[] = fetchResult.data;
    const allSignals: ConnectorSignal[] = [];

    for (const projectData of projectDataList) {
      const signals = convertJiraToSignals(projectData, this.organizationId);
      allSignals.push(...signals);
      this.log('CONVERT', `${projectData.project}: ${signals.length} signals generated`);
    }

    const packs = buildJiraTrainingPacks(projectDataList);
    this.log('CONVERT', `Generated ${allSignals.length} total signals + ${packs.length} training packs`);

    // Log signal type distribution
    const signalTypes = new Map<string, number>();
    for (const s of allSignals) {
      signalTypes.set(s.signal_type, (signalTypes.get(s.signal_type) || 0) + 1);
    }
    this.log('CONVERT', 'Signal distribution:');
    for (const [type, count] of [...signalTypes.entries()].sort((a, b) => b[1] - a[1])) {
      const pct = ((count / allSignals.length) * 100).toFixed(1);
      this.log('CONVERT', `  ${type}: ${count} (${pct}%)`);
    }

    return { signals: allSignals, packs };
  }

  // ── TRAIN: Feed into the brain ──
  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const result: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };

    if (this.config.dryRun) {
      this.log('TRAIN', `[DRY RUN] Would store ${signals.length} signals and ${packs.length} packs`);
      this.log('TRAIN', '[DRY RUN] Sample signals:');
      const signalTypes = new Map<string, number>();
      for (const s of signals) {
        signalTypes.set(s.signal_type, (signalTypes.get(s.signal_type) || 0) + 1);
      }
      for (const [type, count] of signalTypes) {
        this.log('TRAIN', `  ${type}: ${count} signals`);
      }
      result.signalsStored = signals.length;
      result.packsProcessed = packs.length;
      return result;
    }

    // Store signals in batches (Supabase has row limits)
    const BATCH_SIZE = 500;
    for (let i = 0; i < signals.length; i += BATCH_SIZE) {
      const batch = signals.slice(i, i + BATCH_SIZE);
      try {
        await storeConnectorSignals(this.supabase, batch);
        result.signalsStored += batch.length;
        this.log('TRAIN', `Stored signal batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} signals`);
      } catch (err) {
        this.logError('TRAIN', `Failed to store signal batch ${Math.floor(i / BATCH_SIZE) + 1}`, err);
        this.errors.push(`Signal batch ${Math.floor(i / BATCH_SIZE) + 1} failed`);
      }
    }

    // Run brain trainer with training packs
    try {
      const trainer = createBrainTrainer();
      const trainResult = await trainer.trainBatch(this.supabase, this.organizationId, packs);
      result.packsProcessed = packs.length;
      result.discoveries = trainResult?.casesLoaded ?? 0;
      this.log('TRAIN', `Brain trainer: ${packs.length} packs processed, ${trainResult.causalEdgesLoaded} causal edges, ${trainResult.rulesLoaded} rules loaded`);
    } catch (err) {
      this.logError('TRAIN', 'Brain trainer failed', err);
      this.errors.push(`Brain trainer: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Run causal discovery on stored signals
    try {
      this.log('TRAIN', 'Running causal discovery on new signals...');
      const jobs = createScheduledJobs(this.supabase);
      await jobs.runDailyCausalDiscovery(this.organizationId);
      this.log('TRAIN', 'Causal discovery complete');
    } catch (err) {
      this.logError('TRAIN', 'Causal discovery failed (non-fatal)', err);
    }

    // Record this run for progressive learning
    await this.recordRunCompletion(result);
    this.log('TRAIN', `Progressive learning: Run recorded (mode=${this.runMode}). Next run will fetch only newer data.`);

    return result;
  }

  // ── VALIDATE: Check training quality ──
  async validate(result: TrainResult): Promise<ValidationResult> {
    const issues: string[] = [];

    if (this.config.dryRun) {
      this.log('VALIDATE', `[DRY RUN] Relaxed validation: ${this.fetchedData.length} projects fetched, ${result.signalsStored} signals`);
    } else if (this.runMode === 'incremental') {
      if (result.packsProcessed === 0) {
        issues.push('No training packs were processed');
      }
      if (this.fetchedData.length < this.projects.length * 0.3) {
        issues.push(`Only ${this.fetchedData.length}/${this.projects.length} projects returned data — possible API issue`);
      }
      if (result.signalsStored === 0) {
        this.log('VALIDATE', 'No new signals — projects may not have had activity since last run (OK for incremental)');
      }
      this.log('VALIDATE', `Incremental: ${result.signalsStored} new signals, ${result.packsProcessed} packs, ${this.fetchedData.length} projects`);
    } else {
      // Full run — strict validation
      if (result.signalsStored === 0) {
        issues.push('No signals were stored — check Apache JIRA API access');
      }
      if (result.packsProcessed === 0) {
        issues.push('No training packs were processed');
      }
      if (this.fetchedData.length < this.projects.length * 0.5) {
        issues.push(`Only ${this.fetchedData.length}/${this.projects.length} projects were fetched — possible API issue`);
      }
    }

    // Score
    const signalTarget = this.runMode === 'incremental' ? 50 : 200;
    const packTarget = 4; // 4 training packs
    const score = Math.min(1, (result.signalsStored / signalTarget) * 0.5 + (result.packsProcessed / packTarget) * 0.5);

    return {
      passed: issues.length === 0,
      score,
      issues,
    };
  }
}
