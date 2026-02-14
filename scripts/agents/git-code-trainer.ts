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
  readonly version = '1.0.0';
  readonly description = 'Trains the core brain on engineering patterns from 27 major open-source GitHub repos (100k+ stars)';

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

// ── Self-Registration: Auto-register to globalRegistry on import ──────────
import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'git-code-trainer',
  description: 'Trains the core brain on engineering patterns from 27 major open-source GitHub repos (100k+ stars)',
  version: '1.0.0',
  factory: (config) => new GitCodeTrainerAgent(config),
  schedule: '0 2 * * 0',  // Sunday at 2 AM UTC
  resourceRequirements: { cpu: '2048', memory: '8192' },
  tags: ['training', 'code-intelligence', 'github'],
});
