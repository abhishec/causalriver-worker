/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SE-aaS Training Agent — Unified Brain Training for Software Engineering as a Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The SE-aaS Training Agent is the single unified orchestrator that trains the
 * NexusBrain core brain with engineering intelligence from 9 public data sources.
 *
 * Each sub-trainer maps to specific SE-aaS product requirements:
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ SE-aaS TRAINING AGENT                                                       │
 * │                                                                              │
 * │  Sub-Trainers:                    SE-aaS Requirements Served:                │
 * │  ─────────────                    ──────────────────────────                  │
 * │  1. git-trainer (27 repos)        → Deploy Velocity, Bottleneck, PR Review,  │
 * │                                     Impact Analysis, Architecture, Dead Code │
 * │  2. jira-trainer (7 Apache)       → Incident Diagnosis, Impact Analysis      │
 * │  3. discussions-trainer (10 repos)→ Codebase Q&A, HLD/LLD Generator          │
 * │  4. security-trainer (5 ecosys)   → Dependency Upgrade, Incident Diagnosis   │
 * │  5. deps-trainer (80 packages)    → Dependency Upgrade Agent                 │
 * │  6. mailinglist-trainer (7 lists) → HLD/LLD Generator, Architecture          │
 * │  7. stackexchange-trainer (8 cat) → Test Case Gen, SQL Analyzer, TDD,       │
 * │                                     Performance Profiler, Data Lineage       │
 * │  8. cicd-patterns-trainer (30 repos)→ Deploy Velocity, CI/CD Intelligence    │
 * │  9. sonarcloud-trainer (projects) → Dead Code Detector, Test Coverage        │
 * │                                                                              │
 * │  Total: 73 signal types, 37 training packs                                  │
 * │  Brain: 416,024+ signals → Causal Discovery → Federation → Org Brains       │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * NIGHTLY SCHEDULE (UTC):
 *   1 AM  → git-trainer
 *   2 AM  → jira-trainer
 *   3 AM  → discussions-trainer
 *   4 AM  → security-trainer
 *   5 AM  → deps-trainer
 *   6 AM  → mailinglist-trainer
 *   7 AM  → stackexchange-trainer
 *   8 AM  → cicd-patterns-trainer
 *   9 AM  → sonarcloud-trainer (weekly)
 *   ─────────────────────────────────
 *   Federation runs every 6 hours → pushes learned patterns to all org brains
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): void {
  try {
    const envPath = resolve(import.meta.dirname || __dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* ECS env */ }
}
loadEnv();

import { AgentRegistry } from './agent-framework/agent-registry';
import { AgentManager } from './agent-framework/agent-manager';

// Import all 9 sub-trainers
import { GitCodeTrainerAgent } from './agents/git-code-trainer';
import { JiraTrainerAgent } from './agents/jira-trainer';
import { DiscussionsTrainerAgent } from './agents/discussions-trainer';
import { SecurityTrainerAgent } from './agents/security-trainer';
import { DepsTrainerAgent } from './agents/deps-trainer';
import { MailingListTrainerAgent } from './agents/mailinglist-trainer';
import { StackExchangeTrainerAgent } from './agents/stackexchange-trainer';
import { CICDPatternsTrainerAgent } from './agents/cicd-patterns-trainer';
import { SonarCloudTrainerAgent } from './agents/sonarcloud-trainer';

// ============================================================================
// SE-aaS REQUIREMENT → TRAINER MAPPING
// ============================================================================

interface SEaaSRequirement {
  id: string;
  name: string;
  priority: 'P0' | 'P1';
  trainers: string[];          // Which sub-trainers feed this requirement
  signalTypes: string[];       // Which signal types are relevant
  coverage: 'full' | 'partial' | 'none';
  notes: string;
}

export const SEAS_REQUIREMENTS: SEaaSRequirement[] = [
  // ── P0: Early Warning System ──
  {
    id: 'P0-A', name: 'Deploy Velocity Collapse Warning', priority: 'P0',
    trainers: ['git-trainer', 'cicd-patterns-trainer'],
    signalTypes: ['pr_merge_velocity', 'deploy_frequency', 'ci_pass_rate', 'cicd_success_rate', 'cicd_pipeline_complexity'],
    coverage: 'full',
    notes: 'Fully covered by git-trainer PR velocity + CI/CD patterns. Granger causality detects velocity collapse 2-3 days early.',
  },
  {
    id: 'P0-B', name: 'Bottleneck Concentration Risk', priority: 'P0',
    trainers: ['git-trainer'],
    signalTypes: ['contributor_concentration', 'cross_team_review', 'new_contributor_rate'],
    coverage: 'full',
    notes: 'Git-trainer computes bus factor, contributor concentration, and cross-team review patterns.',
  },
  // ── P1: AI Capabilities ──
  {
    id: 'P1-1', name: 'TDD Code Generation Agent', priority: 'P1',
    trainers: ['git-trainer', 'stackexchange-trainer'],
    signalTypes: ['test_coverage_signal', 'se_knowledge_depth', 'se_problem_complexity'],
    coverage: 'partial',
    notes: 'StackExchange testing category (1,114 Q&A) + git test coverage signals. Needs code generation model integration.',
  },
  {
    id: 'P1-2', name: 'Boilerplate Generator', priority: 'P1',
    trainers: ['git-trainer', 'cicd-patterns-trainer', 'stackexchange-trainer'],
    signalTypes: ['code_churn_rate', 'cicd_action_diversity', 'se_topic_interconnection'],
    coverage: 'partial',
    notes: 'CI/CD workflow patterns provide template intelligence. StackExchange architecture patterns. Needs template extraction engine.',
  },
  {
    id: 'P1-3', name: 'PR Review Assistant', priority: 'P1',
    trainers: ['git-trainer'],
    signalTypes: ['pr_review_depth', 'review_sentiment', 'cross_team_review', 'pr_size_risk', 'security_review_coverage', 'api_change_risk'],
    coverage: 'full',
    notes: '6 dedicated PR review signal types from 27 repos. Fully trained on review patterns.',
  },
  {
    id: 'P1-4', name: 'Dependency Upgrade Agent', priority: 'P1',
    trainers: ['deps-trainer', 'security-trainer'],
    signalTypes: ['dep_freshness', 'dep_deprecation_risk', 'dep_release_cadence', 'dep_complexity', 'dep_maintainer_bus_factor', 'security_severity_distribution', 'security_patch_rate'],
    coverage: 'full',
    notes: '80 npm/PyPI packages tracked + 5 ecosystem vulnerability intelligence. Full upgrade risk assessment.',
  },
  {
    id: 'P1-5', name: 'HLD/LLD Generator', priority: 'P1',
    trainers: ['discussions-trainer', 'mailinglist-trainer', 'stackexchange-trainer'],
    signalTypes: ['discussion_engagement_depth', 'mailinglist_thread_depth', 'se_knowledge_depth', 'architecture_coupling'],
    coverage: 'partial',
    notes: 'Design discussion patterns from GitHub Discussions + Apache mailing lists + architecture StackExchange. Needs diagram generation.',
  },
  {
    id: 'P1-6', name: 'Data Model Lineage Mapper', priority: 'P1',
    trainers: ['stackexchange-trainer', 'jira-trainer'],
    signalTypes: ['se_knowledge_depth', 'se_problem_complexity', 'jira_component_coupling'],
    coverage: 'partial',
    notes: 'StackExchange data-modeling category (1,174 Q&A on database-design, normalization, ER). Needs SQL parser integration.',
  },
  {
    id: 'P1-7', name: 'Impact Analysis Agent', priority: 'P1',
    trainers: ['git-trainer', 'jira-trainer'],
    signalTypes: ['architecture_coupling', 'code_churn_rate', 'jira_component_coupling', 'breaking_change_frequency'],
    coverage: 'full',
    notes: 'Architecture coupling + component coupling + breaking change detection across 27 repos and 7 JIRA projects.',
  },
  {
    id: 'P1-8', name: 'SQL Query Analyzer', priority: 'P1',
    trainers: ['stackexchange-trainer'],
    signalTypes: ['se_knowledge_depth', 'se_problem_complexity', 'se_answer_quality'],
    coverage: 'partial',
    notes: 'StackExchange SQL category (986 Q&A on query-optimization, indexing, database-performance). Needs query parser.',
  },
  {
    id: 'P1-9', name: 'Log Query Agent', priority: 'P1',
    trainers: ['stackexchange-trainer'],
    signalTypes: ['se_knowledge_depth', 'se_problem_complexity'],
    coverage: 'partial',
    notes: 'StackExchange incident category (1,024 Q&A on logging, error-handling, monitoring, observability). Needs log connector.',
  },
  {
    id: 'P1-10', name: 'Incident Diagnosis Agent', priority: 'P1',
    trainers: ['git-trainer', 'jira-trainer', 'security-trainer', 'stackexchange-trainer'],
    signalTypes: ['ci_failure_streak', 'hotfix_urgency_index', 'jira_blocker_density', 'jira_reopen_rate', 'security_critical_density', 'se_knowledge_depth'],
    coverage: 'partial',
    notes: 'CI failure patterns + JIRA blocker/reopen signals + security vulnerability intelligence + incident Q&A. Needs APM data.',
  },
  {
    id: 'P1-11', name: 'Performance Profiler', priority: 'P1',
    trainers: ['stackexchange-trainer', 'sonarcloud-trainer'],
    signalTypes: ['se_knowledge_depth', 'se_problem_complexity', 'sonar_code_health'],
    coverage: 'partial',
    notes: 'StackExchange performance category (1,161 Q&A on profiling, memory-leaks, optimization). SonarCloud code health. Needs APM integration.',
  },
  {
    id: 'P1-12', name: 'Codebase Q&A Agent', priority: 'P1',
    trainers: ['git-trainer', 'discussions-trainer', 'stackexchange-trainer'],
    signalTypes: ['documentation_ratio', 'discussion_resolution_rate', 'discussion_content_quality', 'se_knowledge_depth'],
    coverage: 'full',
    notes: 'Documentation patterns + GitHub Discussion resolution patterns + StackExchange knowledge depth. Full Q&A intelligence.',
  },
  {
    id: 'P1-13', name: 'Architecture Extractor', priority: 'P1',
    trainers: ['git-trainer', 'cicd-patterns-trainer', 'stackexchange-trainer'],
    signalTypes: ['architecture_coupling', 'cicd_pipeline_complexity', 'se_knowledge_depth'],
    coverage: 'full',
    notes: 'Architecture coupling signals + CI/CD pipeline structure + architecture StackExchange (1,152 Q&A). Strong training data.',
  },
  {
    id: 'P1-14', name: 'Dead Code Detector', priority: 'P1',
    trainers: ['git-trainer', 'sonarcloud-trainer'],
    signalTypes: ['code_churn_rate', 'sonar_code_health', 'sonar_duplication', 'sonar_maintainability'],
    coverage: 'partial',
    notes: 'Code churn + SonarCloud duplication/maintainability. Needs static analysis integration.',
  },
  {
    id: 'P1-15', name: 'Test Case Generator', priority: 'P1',
    trainers: ['git-trainer', 'stackexchange-trainer', 'sonarcloud-trainer'],
    signalTypes: ['test_coverage_signal', 'se_knowledge_depth', 'se_problem_complexity', 'sonar_test_coverage'],
    coverage: 'partial',
    notes: 'Test coverage signals + 1,114 StackExchange testing Q&A + SonarCloud coverage data. Needs test framework integration.',
  },
  {
    id: 'P1-16', name: 'Test Data Generator', priority: 'P1',
    trainers: ['stackexchange-trainer'],
    signalTypes: ['se_knowledge_depth', 'se_problem_complexity'],
    coverage: 'partial',
    notes: 'StackExchange data-modeling (1,174 Q&A on schema design, cardinality). Needs schema analysis engine.',
  },
];

// ============================================================================
// COVERAGE REPORT
// ============================================================================

function printCoverageReport(): void {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SE-aaS TRAINING AGENT — REQUIREMENT COVERAGE REPORT');
  console.log('════════════════════════════════════════════════════════════\n');

  const full = SEAS_REQUIREMENTS.filter(r => r.coverage === 'full');
  const partial = SEAS_REQUIREMENTS.filter(r => r.coverage === 'partial');
  const none = SEAS_REQUIREMENTS.filter(r => r.coverage === 'none');

  console.log(`  ✅ FULL COVERAGE (${full.length}/18):`);
  for (const r of full) {
    console.log(`     ${r.id} ${r.name}`);
    console.log(`        Trainers: ${r.trainers.join(', ')}`);
  }

  console.log(`\n  ⚠️  PARTIAL COVERAGE (${partial.length}/18):`);
  for (const r of partial) {
    console.log(`     ${r.id} ${r.name}`);
    console.log(`        Trainers: ${r.trainers.join(', ')}`);
    console.log(`        Gap: ${r.notes.split('. Needs ')[1] || 'Integration needed'}`);
  }

  if (none.length > 0) {
    console.log(`\n  ❌ NO COVERAGE (${none.length}/18):`);
    for (const r of none) {
      console.log(`     ${r.id} ${r.name}`);
    }
  }

  const totalSignalTypes = new Set(SEAS_REQUIREMENTS.flatMap(r => r.signalTypes));
  const totalTrainers = new Set(SEAS_REQUIREMENTS.flatMap(r => r.trainers));
  console.log(`\n  SUMMARY:`);
  console.log(`    Total Signal Types: ${totalSignalTypes.size}`);
  console.log(`    Total Trainers: ${totalTrainers.size}`);
  console.log(`    Full Coverage: ${full.length}/18 (${Math.round(full.length / 18 * 100)}%)`);
  console.log(`    Partial Coverage: ${partial.length}/18 (${Math.round(partial.length / 18 * 100)}%)`);
  console.log(`    No Coverage: ${none.length}/18 (${Math.round(none.length / 18 * 100)}%)`);
  console.log('════════════════════════════════════════════════════════════\n');
}

// ============================================================================
// MAIN — SE-aaS TRAINING AGENT
// ============================================================================

const ORGANIZATION_ID = '00000000-0000-4000-a000-000000000001';

const SUB_TRAINERS: Array<{
  name: string;
  description: string;
  factory: (config: any) => any;
  schedule: string;
  cpu: string;
  memory: string;
  requirements: string[];  // SE-aaS requirement IDs served
  envKey: string;          // Dry-run env var name
}> = [
  {
    name: 'git-trainer', description: 'GitHub engineering patterns from 27 repos',
    factory: (config) => new GitCodeTrainerAgent(config),
    schedule: '0 1 * * *', cpu: '2048', memory: '8192',
    requirements: ['P0-A', 'P0-B', 'P1-1', 'P1-2', 'P1-3', 'P1-7', 'P1-10', 'P1-12', 'P1-13', 'P1-14', 'P1-15'],
    envKey: 'GIT_TRAINER_DRY_RUN',
  },
  {
    name: 'jira-trainer', description: 'Apache JIRA PM patterns from 7 projects',
    factory: (config) => new JiraTrainerAgent(config),
    schedule: '0 2 * * *', cpu: '1024', memory: '4096',
    requirements: ['P1-6', 'P1-7', 'P1-10'],
    envKey: 'JIRA_TRAINER_DRY_RUN',
  },
  {
    name: 'discussions-trainer', description: 'GitHub Discussions communication patterns',
    factory: (config) => new DiscussionsTrainerAgent(config),
    schedule: '0 3 * * *', cpu: '1024', memory: '4096',
    requirements: ['P1-5', 'P1-12'],
    envKey: 'DISCUSSIONS_TRAINER_DRY_RUN',
  },
  {
    name: 'security-trainer', description: 'GHSA/OSV vulnerability intelligence',
    factory: (config) => new SecurityTrainerAgent(config),
    schedule: '0 4 * * *', cpu: '512', memory: '2048',
    requirements: ['P1-4', 'P1-10'],
    envKey: 'SECURITY_TRAINER_DRY_RUN',
  },
  {
    name: 'deps-trainer', description: 'npm/PyPI dependency intelligence',
    factory: (config) => new DepsTrainerAgent(config),
    schedule: '0 5 * * *', cpu: '512', memory: '2048',
    requirements: ['P1-4'],
    envKey: 'DEPS_TRAINER_DRY_RUN',
  },
  {
    name: 'mailinglist-trainer', description: 'Apache dev mailing list communication',
    factory: (config) => new MailingListTrainerAgent(config),
    schedule: '0 6 * * *', cpu: '512', memory: '2048',
    requirements: ['P1-5'],
    envKey: 'MAILINGLIST_TRAINER_DRY_RUN',
  },
  {
    name: 'stackexchange-trainer', description: 'StackExchange Q&A engineering knowledge',
    factory: (config) => new StackExchangeTrainerAgent(config),
    schedule: '0 7 * * *', cpu: '512', memory: '2048',
    requirements: ['P1-1', 'P1-2', 'P1-5', 'P1-6', 'P1-8', 'P1-9', 'P1-10', 'P1-11', 'P1-12', 'P1-13', 'P1-15', 'P1-16'],
    envKey: 'STACKEXCHANGE_TRAINER_DRY_RUN',
  },
  {
    name: 'cicd-patterns-trainer', description: 'GitHub Actions CI/CD workflow patterns',
    factory: (config) => new CICDPatternsTrainerAgent(config),
    schedule: '0 8 * * *', cpu: '1024', memory: '4096',
    requirements: ['P0-A', 'P1-2', 'P1-13'],
    envKey: 'CICD_TRAINER_DRY_RUN',
  },
  {
    name: 'sonarcloud-trainer', description: 'SonarCloud public code quality metrics',
    factory: (config) => new SonarCloudTrainerAgent(config),
    schedule: '0 9 * * 0', cpu: '512', memory: '2048',
    requirements: ['P1-11', 'P1-14', 'P1-15'],
    envKey: 'SONARCLOUD_TRAINER_DRY_RUN',
  },
];

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('════════════════════════════════════════════════════════════');
  console.log('  NexusBrain SE-aaS Training Agent');
  console.log('  Unified Brain Training for Software Engineering as a Service');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Sub-Trainers: ${SUB_TRAINERS.length}`);
  console.log(`  SE-aaS Requirements: ${SEAS_REQUIREMENTS.length}`);
  console.log('════════════════════════════════════════════════════════════\n');

  // Print coverage report
  printCoverageReport();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Determine which trainers to run
  const targetTrainer = process.env.SEAS_TRAINER;  // Run specific trainer
  const dryRun = process.env.SEAS_DRY_RUN === 'true';

  const trainers = targetTrainer
    ? SUB_TRAINERS.filter(t => t.name === targetTrainer)
    : SUB_TRAINERS;

  if (trainers.length === 0) {
    console.error(`ERROR: Unknown trainer '${targetTrainer}'`);
    console.error('Valid trainers: ' + SUB_TRAINERS.map(t => t.name).join(', '));
    process.exit(1);
  }

  const registry = new AgentRegistry();
  for (const t of trainers) {
    registry.register({
      name: t.name,
      description: t.description,
      version: '1.0.0',
      factory: t.factory,
      schedule: t.schedule,
      resourceRequirements: { cpu: t.cpu, memory: t.memory },
      tags: ['seas-training', ...t.requirements],
    });
  }

  const manager = new AgentManager(registry, { supabaseUrl, supabaseKey, organizationId: ORGANIZATION_ID });

  console.log(`Running ${trainers.length} sub-trainer(s)${dryRun ? ' [DRY RUN]' : ''}...\n`);

  const results: Array<{ name: string; signals: number; packs: number; errors: number; duration: number }> = [];

  for (const t of trainers) {
    const trainerStart = Date.now();
    try {
      const isDry = dryRun || process.env[t.envKey] === 'true';
      const result = await manager.runWithRetry(t.name, 2, { dryRun: isDry });
      results.push({
        name: t.name,
        signals: result.signalsGenerated,
        packs: result.packsProcessed,
        errors: result.errorsEncountered.length,
        duration: (Date.now() - trainerStart) / 1000,
      });
    } catch (err) {
      console.error(`[SE-aaS] ${t.name} FAILED: ${err instanceof Error ? err.message : String(err)}`);
      results.push({ name: t.name, signals: 0, packs: 0, errors: 1, duration: (Date.now() - trainerStart) / 1000 });
    }
  }

  // Print summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalSignals = results.reduce((s, r) => s + r.signals, 0);
  const totalPacks = results.reduce((s, r) => s + r.packs, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SE-aaS TRAINING AGENT — RUN SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  for (const r of results) {
    const icon = r.errors > 0 ? '⚠️' : '✅';
    console.log(`  ${icon} ${r.name}: ${r.signals} signals, ${r.packs} packs (${r.duration.toFixed(0)}s)`);
  }
  console.log('────────────────────────────────────────────────────────────');
  console.log(`  TOTAL: ${totalSignals} signals, ${totalPacks} packs, ${totalErrors} errors in ${elapsed}s`);
  console.log('════════════════════════════════════════════════════════════\n');

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => { console.error('[FATAL]', err); process.exit(2); });
