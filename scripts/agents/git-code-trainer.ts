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
import { createSupabaseRepository } from '../../packages/memory-stack/src/persistence/supabase-repository';
import { createScheduledJobs } from '../../packages/memory-stack/src/orchestrator/scheduled-jobs';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

// ============================================================================
// TARGET REPOSITORIES
// ============================================================================

/** 20 major open-source repos covering diverse languages and engineering patterns */
export const TARGET_REPOS = [
  // ── Web Frameworks ──
  'vercel/next.js',           // TypeScript — 8000+ PRs, rich CI, Vercel ecosystem
  'facebook/react',           // JavaScript — 15000+ PRs, industry-defining
  'vuejs/core',               // TypeScript — 3000+ PRs, community-driven
  'sveltejs/svelte',          // TypeScript — 3500+ PRs, compiler-based framework

  // ── Backend / Runtime ──
  'nodejs/node',              // C++/JS — 20000+ PRs, foundation of server JS
  'denoland/deno',            // Rust/TS — 5000+ PRs, security-first runtime
  'kubernetes/kubernetes',    // Go — 100000+ PRs, container orchestration king
  'docker/compose',           // Go — 5000+ PRs, multi-container orchestration

  // ── Databases / Data ──
  'supabase/supabase',        // TypeScript — 7000+ PRs, open-source Firebase
  'prisma/prisma',            // TypeScript/Rust — 10000+ PRs, ORM

  // ── ML / AI ──
  'huggingface/transformers', // Python — 20000+ PRs, ML model hub
  'langchain-ai/langchain',  // Python — 10000+ PRs, LLM orchestration

  // ── Dev Tools ──
  'microsoft/vscode',         // TypeScript — 15000+ PRs, dominant editor
  'rust-lang/rust',           // Rust — 80000+ PRs, language compiler
  'golang/go',                // Go — 50000+ PRs, language & toolchain

  // ── Cloud / Infra ──
  'hashicorp/terraform',      // Go — 20000+ PRs, infrastructure as code
  'grafana/grafana',          // Go/TS — 40000+ PRs, observability

  // ── Enterprise / Platforms ──
  'elastic/elasticsearch',    // Java — 50000+ PRs, search engine
  'apache/kafka',             // Java/Scala — 10000+ PRs, event streaming
  'python/cpython',           // C/Python — 30000+ PRs, Python language
];

// ============================================================================
// GIT CODE TRAINER AGENT
// ============================================================================

export class GitCodeTrainerAgent extends BaseTrainingAgent {
  readonly name = 'git-code-trainer';
  readonly version = '1.0.0';
  readonly description = 'Trains the core brain on engineering patterns from 20 major open-source GitHub repos';

  private repos: string[];
  private fetchedData: RepoData[] = [];

  constructor(config: AgentConfig, repos?: string[]) {
    super(config);
    this.repos = repos || TARGET_REPOS;
  }

  // ── FETCH: Pull data from GitHub ──
  async fetch(): Promise<FetchResult> {
    const maxPRsPerRepo = parseInt(process.env.GIT_TRAINER_MAX_PRS || '200', 10);
    const maxIssuesPerRepo = parseInt(process.env.GIT_TRAINER_MAX_ISSUES || '200', 10);
    const maxCommitsPerRepo = parseInt(process.env.GIT_TRAINER_MAX_COMMITS || '200', 10);

    // In dry-run mode, only fetch from first repo
    const targetRepos = this.config.dryRun ? this.repos.slice(0, 1) : this.repos;

    this.log('FETCH', `Targeting ${targetRepos.length} repositories`);
    this.log('FETCH', `Max per repo: ${maxPRsPerRepo} PRs, ${maxIssuesPerRepo} issues, ${maxCommitsPerRepo} commits`);

    if (process.env.GITHUB_TOKEN) {
      this.log('FETCH', 'GITHUB_TOKEN found — using authenticated API (5000 req/hr)');
    } else {
      this.log('FETCH', 'No GITHUB_TOKEN — using unauthenticated API (60 req/hr). Set GITHUB_TOKEN for faster fetching.');
    }

    this.fetchedData = await fetchAllRepos(targetRepos, {
      maxPRs: maxPRsPerRepo,
      maxIssues: maxIssuesPerRepo,
      maxCommits: maxCommitsPerRepo,
      maxWorkflowRuns: 100,
      fetchReviews: true,
      maxReviewPRs: 50,
      fetchFileChanges: true,
      maxFileChangePRs: 50,
      rateLimitDelay: process.env.GITHUB_TOKEN ? 50 : 500, // Slower without token
    });

    const totalRecords = this.fetchedData.reduce(
      (sum, repo) => sum + repo.pulls.length + repo.issues.length + repo.commits.length + repo.workflowRuns.length,
      0,
    );

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
      const repo = createSupabaseRepository(this.supabase);
      const trainer = createBrainTrainer(repo, this.organizationId);
      const trainResult = await trainer.train(packs);
      result.packsProcessed = packs.length;
      result.discoveries = trainResult?.memoriesCreated ?? 0;
      this.log('TRAIN', `Brain trainer: ${packs.length} packs processed, ${result.discoveries} memories created`);
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

    return result;
  }

  // ── VALIDATE: Check training quality ──
  async validate(result: TrainResult): Promise<ValidationResult> {
    const issues: string[] = [];

    // In dry-run mode, relax validation (we intentionally only fetch 1 repo)
    if (!this.config.dryRun) {
      if (result.signalsStored === 0) {
        issues.push('No signals were stored — check GitHub API access');
      }
      if (result.packsProcessed === 0) {
        issues.push('No training packs were processed');
      }
      if (this.fetchedData.length < this.repos.length * 0.5) {
        issues.push(`Only ${this.fetchedData.length}/${this.repos.length} repos were fetched — possible API rate limiting`);
      }
    } else {
      this.log('VALIDATE', `[DRY RUN] Relaxed validation: ${this.fetchedData.length} repos fetched, ${result.signalsStored} signals`);
    }

    const score = Math.min(1, (result.signalsStored / 500) * 0.5 + (result.packsProcessed / 8) * 0.5);

    return {
      passed: issues.length === 0,
      score,
      issues,
    };
  }
}
