/**
 * Git Code Trainer Agent
 * 
 * Trains the NexusBrain core brain on engineering patterns from 20 major
 * open-source GitHub repositories. Discovers causal relationships between:
 * - PR review practices → code quality
 * - CI/CD health → deployment reliability
 * - Contributor patterns → project risk
 * - Issue management → project health
 * 
 * Built on the NexusBrain Agent Framework (BaseTrainingAgent).
 * 
 * Usage:
 *   pnpm exec tsx scripts/git-code-trainer-runner.ts
 *   GIT_TRAINER_DRY_RUN=true pnpm exec tsx scripts/git-code-trainer-runner.ts
 */

import {
  BaseTrainingAgent,
  type AgentConfig,
  type FetchResult,
  type ConvertResult,
  type TrainResult,
  type ValidationResult,
} from '../agent-framework/base-training-agent';
import { fetchAllRepos, type RepoData } from './git-code-trainer-fetcher';
import { convertRepoToSignals, buildGitTrainingPacks } from './git-signal-converter';
import { storeConnectorSignals } from '../../packages/memory-stack/src/connectors/connector-framework';
import { createBrainTrainer } from '../../packages/memory-stack/src/learning/brain-trainer';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// TARGET REPOSITORIES
// ============================================================================

/** 27 most active 100k+ star repos — the gold standard for code intelligence training */
export const TARGET_REPOS = [
  // ── Tier 1: Mega repos (400k+ stars) ──
  'freeCodeCamp/freeCodeCamp', // 437k★ TypeScript — massive TS codebase, 536MB
  'facebook/react',            // 243k★ JavaScript — the gold standard, 1112 issues
  'torvalds/linux',            // 217k★ C — largest codebase (5.9GB!)
  'tensorflow/tensorflow',     // 194k★ C++ — ML infra, 3500 issues
  'microsoft/vscode',          // 182k★ TypeScript — 1.1GB, 13846 open issues
  'n8n-io/n8n',                // 174k★ TypeScript — workflow automation, very active
  'ollama/ollama',             // 163k★ Go — AI infra, compact codebase
  'vercel/next.js',            // 138k★ JavaScript — 2.4GB, React framework
  'golang/go',                 // 132k★ Go — the Go language itself
  'langchain-ai/langchain',   // 127k★ Python — AI/LLM framework

  // ── Tier 2: Major projects (100k-200k stars) ──
  'nodejs/node',               // C++/JS — foundation of server JS
  'kubernetes/kubernetes',     // Go — container orchestration king
  'rust-lang/rust',            // Rust — language compiler
  'python/cpython',            // C/Python — Python language

  // ── Tier 3: Critical ecosystem repos ──
  'supabase/supabase',         // TypeScript — open-source Firebase
  'prisma/prisma',             // TypeScript/Rust — ORM
  'huggingface/transformers',  // Python — ML model hub
  'sveltejs/svelte',           // TypeScript — compiler-based framework
  'vuejs/core',                // TypeScript — community-driven
  'denoland/deno',             // Rust/TS — security-first runtime
  'docker/compose',            // Go — multi-container orchestration

  // ── Tier 4: Enterprise / Infrastructure ──
  'hashicorp/terraform',       // Go — infrastructure as code
  'grafana/grafana',           // Go/TS — observability
  'elastic/elasticsearch',     // Java — search engine
  'apache/kafka',              // Java/Scala — event streaming

  // ── Tier 5: Data & DevOps ──
  'apache/spark',              // Scala/Java — big data processing
  'ansible/ansible',           // Python — IT automation
];

// ============================================================================
// GIT CODE TRAINER AGENT
// ============================================================================

export class GitCodeTrainerAgent extends BaseTrainingAgent {
  readonly name = 'git-code-trainer';
  readonly version = '2.0.0';
  readonly description = 'Nightly progressive trainer: learns engineering patterns from 27 major open-source GitHub repos, getting smarter every day';

  private repos: string[];
  private fetchedData: RepoData[] = [];
  private runMode: 'full' | 'incremental' = 'incremental';
  private sinceDate: string | undefined;

  constructor(config: AgentConfig, repos?: string[]) {
    super(config);
    this.repos = repos || TARGET_REPOS;
    // Force full run on first run or when env says so
    this.runMode = process.env.GIT_TRAINER_MODE === 'full' ? 'full' : 'incremental';
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
      // Non-critical — logging only
      this.log('TRAIN', 'Could not record run history (table may not exist)');
    }
  }

  // ── FETCH: Pull data from GitHub (incremental or full) ──
  async fetch(): Promise<FetchResult> {
    // ── Aggressive data limits for maximum brain training ──
    // Full runs: Pull as much data as GitHub API allows (~1000/repo × 27 repos = ~27,000 PRs)
    // Incremental runs: Pull only new data since last run (~100-500/repo on active days)
    // Over time, nightly incremental runs accumulate 100k+ data points in the brain
    const isIncremental = this.runMode !== 'full';
    const maxPRsPerRepo = parseInt(process.env.GIT_TRAINER_MAX_PRS || (isIncremental ? '500' : '1000'), 10);
    const maxIssuesPerRepo = parseInt(process.env.GIT_TRAINER_MAX_ISSUES || (isIncremental ? '500' : '1000'), 10);
    const maxCommitsPerRepo = parseInt(process.env.GIT_TRAINER_MAX_COMMITS || (isIncremental ? '500' : '1000'), 10);
    const maxWorkflowRuns = parseInt(process.env.GIT_TRAINER_MAX_WORKFLOWS || (isIncremental ? '200' : '500'), 10);
    const maxReviewPRs = parseInt(process.env.GIT_TRAINER_MAX_REVIEW_PRS || (isIncremental ? '100' : '200'), 10);
    const maxFileChangePRs = parseInt(process.env.GIT_TRAINER_MAX_FILE_CHANGE_PRS || (isIncremental ? '100' : '200'), 10);

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
      this.log('FETCH', '🔄 FULL MODE: Fetching ALL available data (max throughput)');
    }

    // In dry-run mode, only fetch from first repo
    const targetRepos = this.config.dryRun ? this.repos.slice(0, 1) : this.repos;

    this.log('FETCH', `Targeting ${targetRepos.length} repositories`);
    this.log('FETCH', `Max per repo: ${maxPRsPerRepo} PRs, ${maxIssuesPerRepo} issues, ${maxCommitsPerRepo} commits, ${maxWorkflowRuns} workflows`);
    this.log('FETCH', `Reviews for ${maxReviewPRs} PRs, file changes for ${maxFileChangePRs} PRs`);
    this.log('FETCH', `Estimated total capacity: ${targetRepos.length * (maxPRsPerRepo + maxIssuesPerRepo + maxCommitsPerRepo + maxWorkflowRuns)} records across ${targetRepos.length} repos`);

    if (process.env.GITHUB_TOKEN) {
      this.log('FETCH', 'GITHUB_TOKEN found — using authenticated API (5000 req/hr)');
    } else {
      this.log('FETCH', '⚠️  No GITHUB_TOKEN — using unauthenticated API (60 req/hr). Set GITHUB_TOKEN for faster fetching!');
    }

    this.fetchedData = await fetchAllRepos(targetRepos, {
      maxPRs: maxPRsPerRepo,
      maxIssues: maxIssuesPerRepo,
      maxCommits: maxCommitsPerRepo,
      maxWorkflowRuns,
      fetchReviews: true,
      maxReviewPRs,
      fetchFileChanges: true,
      maxFileChangePRs,
      rateLimitDelay: process.env.GITHUB_TOKEN ? 50 : 500, // Slower without token
      since: this.sinceDate, // Only fetch data newer than last run
    });

    const totalRecords = this.fetchedData.reduce(
      (sum, repo) => sum + repo.pulls.length + repo.issues.length + repo.commits.length + repo.workflowRuns.length,
      0,
    );

    // Log per-signal-type breakdown for visibility
    const signalEstimate = totalRecords * 2; // Rough: each record generates ~2 signals on average
    this.log('FETCH', `Mode: ${this.runMode} | Records: ${totalRecords} | Repos: ${this.fetchedData.length}/${targetRepos.length}`);
    this.log('FETCH', `Estimated signals: ~${signalEstimate} | Cumulative brain training grows every night`);

    return {
      data: this.fetchedData,
      sources: this.fetchedData.map(r => `${r.owner}/${r.repo}`),
      recordCount: totalRecords,
    };
  }

  // ── CONVERT: Transform to brain signals + training packs ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    const repoDataList: RepoData[] = fetchResult.data;
    const allSignals: ConnectorSignal[] = [];

    for (const repoData of repoDataList) {
      const signals = convertRepoToSignals(repoData, this.organizationId);
      allSignals.push(...signals);
      this.log('CONVERT', `${repoData.owner}/${repoData.repo}: ${signals.length} signals generated`);
    }

    const packs = buildGitTrainingPacks(repoDataList);
    this.log('CONVERT', `Generated ${allSignals.length} total signals + ${packs.length} training packs`);

    return { signals: allSignals, packs };
  }

  // ── TRAIN: Feed into the brain ──
  async train(signals: ConnectorSignal[], packs: TrainingPack[]): Promise<TrainResult> {
    const result: TrainResult = { signalsStored: 0, packsProcessed: 0, discoveries: 0 };

    if (this.config.dryRun) {
      this.log('TRAIN', `[DRY RUN] Would store ${signals.length} signals and ${packs.length} packs`);
      this.log('TRAIN', `[DRY RUN] Sample signals:`);
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
      const jobs = createScheduledJobs(this.supabase, this.organizationId);
      await jobs.runDailyCausalDiscovery();
      this.log('TRAIN', 'Causal discovery complete');
    } catch (err) {
      this.logError('TRAIN', 'Causal discovery failed (non-fatal)', err);
    }

    // Record this run for progressive learning (next run will use this timestamp)
    await this.recordRunCompletion(result);
    this.log('TRAIN', `Progressive learning: Run recorded (mode=${this.runMode}). Next run will fetch only newer data.`);

    return result;
  }

  // ── VALIDATE: Check training quality ──
  async validate(result: TrainResult): Promise<ValidationResult> {
    const issues: string[] = [];

    if (this.config.dryRun) {
      this.log('VALIDATE', `[DRY RUN] Relaxed validation: ${this.fetchedData.length} repos fetched, ${result.signalsStored} signals`);
    } else if (this.runMode === 'incremental') {
      // Incremental runs may have fewer signals (only new data) — that's OK
      if (result.packsProcessed === 0) {
        issues.push('No training packs were processed');
      }
      if (this.fetchedData.length < this.repos.length * 0.3) {
        issues.push(`Only ${this.fetchedData.length}/${this.repos.length} repos returned data — possible API rate limiting`);
      }
      // It's valid for an incremental run to have 0 new signals (quiet day)
      if (result.signalsStored === 0) {
        this.log('VALIDATE', 'No new signals — repos may not have had activity since last run (OK for incremental)');
      }
      this.log('VALIDATE', `Incremental: ${result.signalsStored} new signals, ${result.packsProcessed} packs, ${this.fetchedData.length} repos`);
    } else {
      // Full run — strict validation
      if (result.signalsStored === 0) {
        issues.push('No signals were stored — check GitHub API access');
      }
      if (result.packsProcessed === 0) {
        issues.push('No training packs were processed');
      }
      if (this.fetchedData.length < this.repos.length * 0.5) {
        issues.push(`Only ${this.fetchedData.length}/${this.repos.length} repos were fetched — possible API rate limiting`);
      }
    }

    // Score: incremental runs get a boost since fewer signals is expected
    const signalTarget = this.runMode === 'incremental' ? 100 : 500;
    const packTarget = 13; // Updated: now 13 training packs (8 original + 5 new)
    const score = Math.min(1, (result.signalsStored / signalTarget) * 0.5 + (result.packsProcessed / packTarget) * 0.5);

    return {
      passed: issues.length === 0,
      score,
      issues,
    };
  }
}

// ── Self-Registration: DISABLED — Superseded by git-code-trainer-v6.ts ─────
// The V6 ManusNativeAgent version (git-code-trainer-v6.ts) is now the active
// version imported by brain-orchestrator.ts. This V1 file is kept for reference
// but its registration is disabled to prevent duplicate name conflicts.
// import { globalRegistry } from '../agent-framework/agent-registry';
// globalRegistry.register({ name: 'git-code-trainer', ... });
