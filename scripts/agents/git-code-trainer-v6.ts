/**
 * Git Code Trainer Agent (V6 Manus)
 *
 * Brain Region: Cerebellum (Fast-Path Compiler / Code Intelligence)
 * Neurological Function: Engineering Pattern Recognition
 *
 * Trains NexusBrain on engineering patterns from 27 major open-source GitHub repos (100k+ stars).
 * Discovers causal relationships between:
 * - PR review practices → code quality
 * - CI/CD health → deployment reliability
 * - Contributor patterns → project risk
 * - Issue management → project health
 */

import type { FetchResult, ConvertResult, TrainResult } from '../agent-framework/brain-native-agent-v5-manus';
import { ManusNativeAgent } from '../agent-framework/brain-native-agent-v5-manus';
import type { MotorCommand } from '../../packages/memory-stack/src/orchestrator/motor-command-engine';
import { fetchAllRepos, type RepoData } from './git-code-trainer-fetcher';
import { convertRepoToSignals, buildGitTrainingPacks } from './git-signal-converter';
import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';

// ────────────────────────────────────────────────────────────────────────────
// Target Repositories (27 most active 100k+ star repos)
// ────────────────────────────────────────────────────────────────────────────

export const TARGET_REPOS = [
  // Tier 1: Mega repos (400k+ stars)
  'freeCodeCamp/freeCodeCamp', 'facebook/react', 'torvalds/linux',
  'tensorflow/tensorflow', 'microsoft/vscode', 'n8n-io/n8n',
  'ollama/ollama', 'vercel/next.js', 'golang/go', 'langchain-ai/langchain',
  // Tier 2: Major projects (100k-200k stars)
  'nodejs/node', 'kubernetes/kubernetes', 'rust-lang/rust', 'python/cpython',
  // Tier 3: Critical ecosystem
  'supabase/supabase', 'prisma/prisma', 'huggingface/transformers',
  'sveltejs/svelte', 'vuejs/core', 'denoland/deno', 'docker/compose',
  // Tier 4: Enterprise / Infrastructure
  'hashicorp/terraform', 'grafana/grafana', 'elastic/elasticsearch', 'apache/kafka',
  // Tier 5: Data & DevOps
  'apache/spark', 'ansible/ansible',
];

// ────────────────────────────────────────────────────────────────────────────
// Git Code Trainer Agent (V6 Manus)
// ────────────────────────────────────────────────────────────────────────────

export interface GitCodeTrainerConfig {
  repos?: string[];
  maxPRs?: number;
  maxIssues?: number;
  maxCommits?: number;
  dryRun?: boolean;
}

export class GitCodeTrainerAgent extends ManusNativeAgent {
  readonly brainRegion = 'Cerebellum (Fast-Path Compiler / Code Intelligence)';
  readonly neurologicalFunction = 'Engineering Pattern Recognition';

  private config: GitCodeTrainerConfig;
  private fetchedData: RepoData[] = [];

  constructor(
    supabase: any,
    organizationId: string,
    config: GitCodeTrainerConfig & { verbose?: boolean } = {}
  ) {
    super(supabase, organizationId, { verbose: config.verbose });
    this.config = {
      repos: config.repos || TARGET_REPOS,
      maxPRs: config.maxPRs || parseInt(process.env.GIT_TRAINER_MAX_PRS || '200', 10),
      maxIssues: config.maxIssues || parseInt(process.env.GIT_TRAINER_MAX_ISSUES || '200', 10),
      maxCommits: config.maxCommits || parseInt(process.env.GIT_TRAINER_MAX_COMMITS || '200', 10),
      dryRun: config.dryRun || process.env.GIT_TRAINER_DRY_RUN === 'true',
    };
  }

  // ── Fetch: Pull data from GitHub ──
  async fetch(): Promise<FetchResult> {
    const targetRepos = this.config.dryRun ? this.config.repos!.slice(0, 1) : this.config.repos!;

    this.log(`Fetching ${targetRepos.length} GitHub repositories...`);
    this.log(`Max per repo: ${this.config.maxPRs} PRs, ${this.config.maxIssues} issues, ${this.config.maxCommits} commits`);

    if (process.env.GITHUB_TOKEN) {
      this.log('Using authenticated GitHub API (5000 req/hr)');
    } else {
      this.log('Using unauthenticated GitHub API (60 req/hr) — set GITHUB_TOKEN for faster fetching');
    }

    this.fetchedData = await fetchAllRepos(targetRepos, {
      maxPRs: this.config.maxPRs!,
      maxIssues: this.config.maxIssues!,
      maxCommits: this.config.maxCommits!,
      maxWorkflowRuns: 100,
      fetchReviews: true,
      maxReviewPRs: 50,
      fetchFileChanges: true,
      maxFileChangePRs: 50,
      rateLimitDelay: process.env.GITHUB_TOKEN ? 50 : 500,
    });

    const totalRecords = this.fetchedData.reduce(
      (sum, repo) => sum + repo.pulls.length + repo.issues.length + repo.commits.length + repo.workflowRuns.length,
      0,
    );

    this.log(`Fetched ${totalRecords} total records from ${this.fetchedData.length} repos`);

    return {
      success: true,
      data: { repos: this.fetchedData, totalRecords },
    };
  }

  // ── Convert: Transform to brain signals + training packs ──
  async convert(fetchResult: FetchResult): Promise<ConvertResult> {
    if (!fetchResult.success || !fetchResult.data) {
      return { success: false, signals: [], trainingPacks: [] };
    }

    const { repos } = fetchResult.data as { repos: RepoData[] };
    const allSignals: ConnectorSignal[] = [];

    for (const repoData of repos) {
      const signals = convertRepoToSignals(repoData, this.organizationId);
      allSignals.push(...signals);
      if (this.verbose) {
        this.log(`  ${repoData.owner}/${repoData.repo}: ${signals.length} signals`);
      }
    }

    const packs = buildGitTrainingPacks(repos);
    this.log(`Generated ${allSignals.length} signals + ${packs.length} training packs`);

    return {
      success: true,
      signals: allSignals,
      trainingPacks: packs,
    };
  }

  // ── Motor Commands: Define agent-specific actions ──
  protected async generateMotorCommands(trainResult: TrainResult): Promise<MotorCommand[]> {
    const commands: MotorCommand[] = [];

    // GitHub issue for training completion (on full run, not dry-run)
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO && !this.config.dryRun) {
      commands.push({
        commandId: `github-training-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'github_create_issue',
        target: `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
        payload: {
          title: `[Git Trainer] Training complete: ${trainResult.packsTrainedCount} packs processed`,
          body: `The Git Code Trainer agent completed training on ${this.fetchedData.length} repositories.\n\n**Stats:**\n- Signals stored: ${trainResult.signalsStored}\n- Packs trained: ${trainResult.packsTrainedCount}\n- Brain region: ${this.brainRegion}\n\nThis training enhances the brain's engineering pattern recognition capabilities.`,
          labels: ['brain', 'training', 'git', 'auto-generated'],
        },
        priority: 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }

    // Slack notification for major training runs (>10 repos)
    if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID && this.fetchedData.length > 10) {
      commands.push({
        commandId: `slack-training-${Date.now()}`,
        organizationId: this.organizationId,
        actionType: 'slack_send_message',
        target: process.env.SLACK_CHANNEL_ID,
        payload: {
          text: `🧠 *Git Code Trainer Complete*\n• Repos: ${this.fetchedData.length}\n• Signals: ${trainResult.signalsStored}\n• Packs: ${trainResult.packsTrainedCount}\n• Brain Region: ${this.brainRegion}`,
        },
        priority: 'normal',
        requiresApproval: false,
        createdAt: new Date(),
      });
    }

    return commands;
  }
}

// ── Self-Registration: Auto-register to globalRegistry on import ──────────
import { createClient } from '@supabase/supabase-js';
import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'git-code-trainer',
  description: 'Trains NexusBrain on engineering patterns from 27 major open-source GitHub repos (100k+ stars)',
  version: '6.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new GitCodeTrainerAgent(supabase, config.organizationId || '00000000-0000-4000-a000-000000000001', {
      maxPRs: 200,
      maxIssues: 200,
      maxCommits: 200,
      dryRun: false,
      verbose: config.verbose,
    }) as any;
  },
  schedule: '0 2 * * 0',  // Sunday at 2 AM UTC
  resourceRequirements: { cpu: '2048', memory: '8192' },
  tags: ['training', 'github', 'engineering', 'cerebellum', 'code-intelligence'],
});
