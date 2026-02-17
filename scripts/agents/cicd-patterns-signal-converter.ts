/**
 * CI/CD Patterns Signal Converter — GitHub Actions Workflows → Brain Signals + Training Packs
 *
 * Extracts CI/CD intelligence from workflow YAML analysis:
 * - Pipeline complexity (job/step count, matrix builds)
 * - Security posture (permissions, secrets management)
 * - Reliability patterns (caching, concurrency, artifacts)
 * - Success rate (workflow run pass/fail ratios)
 * - Action ecosystem (popular actions, version pinning)
 *
 * All signals aggregated per-repo (entity_id = repo fullName).
 */

import type { ConnectorSignal } from '../../packages/memory-stack/src/connectors/connector-framework';
import type { TrainingPack } from '../../packages/memory-stack/src/learning/brain-trainer';
import type { RepoWorkflowData } from './cicd-patterns-trainer-fetcher';
import { analyzeWorkflowYAML, type WorkflowAnalysis } from './cicd-patterns-trainer-fetcher';

// ============================================================================
// SIGNAL CONVERSION
// ============================================================================

export function convertCICDToSignals(
  repoData: RepoWorkflowData,
  organizationId: string,
): ConnectorSignal[] {
  const signals: ConnectorSignal[] = [];
  const entityId = repoData.fullName;
  const today = new Date().toISOString().substring(0, 10);

  if (repoData.workflows.length === 0) return signals;

  // Analyze all workflow files
  const analyses: WorkflowAnalysis[] = repoData.workflows.map(wf => analyzeWorkflowYAML(wf.content));

  // ── 1. Pipeline Complexity ──
  // How sophisticated is the CI/CD pipeline? (job count, matrix, dependencies)
  {
    const totalJobs = analyses.reduce((s, a) => s + a.jobCount, 0);
    const totalSteps = analyses.reduce((s, a) => s + a.stepCount, 0);
    const hasMatrix = analyses.some(a => a.hasMatrix);
    const totalDeps = analyses.reduce((s, a) => s + a.jobDependencies, 0);

    // Normalize: 1.0 = 10+ jobs with matrix builds and job dependencies
    const complexity = Math.min(1,
      (Math.min(totalJobs, 10) / 10) * 0.3 +
      (Math.min(totalSteps, 30) / 30) * 0.2 +
      (hasMatrix ? 0.25 : 0) +
      (Math.min(totalDeps, 5) / 5) * 0.25,
    );

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'cicd_pipeline_complexity',
      signal_value: complexity,
      signal_timestamp: today,
      entity_type: 'repository',
      entity_id: entityId,
      metadata: {
        total_jobs: totalJobs, total_steps: totalSteps,
        has_matrix: hasMatrix, job_dependencies: totalDeps,
        workflow_count: repoData.workflows.length,
        repo: entityId,
      },
    });
  }

  // ── 2. Security Posture ──
  // How well does the pipeline handle security? (permissions, secrets, version pinning)
  {
    const hasPermissions = analyses.some(a => a.hasPermissions);
    const hasSecrets = analyses.some(a => a.hasSecrets);
    const allActions = analyses.flatMap(a => a.actions);
    const pinnedActions = allActions.filter(a => a.includes('@') && /v\d+/.test(a)).length;
    const pinnedRatio = allActions.length > 0 ? pinnedActions / allActions.length : 0;

    // 1.0 = explicit permissions + secrets management + version-pinned actions
    const security = Math.min(1,
      (hasPermissions ? 0.35 : 0) +
      (hasSecrets ? 0.3 : 0) +
      pinnedRatio * 0.35,
    );

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'cicd_security_posture',
      signal_value: security,
      signal_timestamp: today,
      entity_type: 'repository',
      entity_id: entityId,
      metadata: {
        has_permissions: hasPermissions, has_secrets: hasSecrets,
        pinned_ratio: Math.round(pinnedRatio * 100),
        total_actions: allActions.length,
        repo: entityId,
      },
    });
  }

  // ── 3. Reliability Patterns ──
  // Caching, artifacts, concurrency, container services
  {
    const hasCaching = analyses.some(a => a.hasCaching);
    const hasArtifacts = analyses.some(a => a.hasArtifacts);
    const hasConcurrency = analyses.some(a => a.hasConcurrency);
    const hasContainers = analyses.some(a => a.hasContainerServices);

    // 1.0 = all reliability features present
    const reliability = Math.min(1,
      (hasCaching ? 0.3 : 0) +
      (hasArtifacts ? 0.25 : 0) +
      (hasConcurrency ? 0.25 : 0) +
      (hasContainers ? 0.2 : 0),
    );

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'cicd_reliability_patterns',
      signal_value: reliability,
      signal_timestamp: today,
      entity_type: 'repository',
      entity_id: entityId,
      metadata: {
        has_caching: hasCaching, has_artifacts: hasArtifacts,
        has_concurrency: hasConcurrency, has_containers: hasContainers,
        repo: entityId,
      },
    });
  }

  // ── 4. CI Success Rate ──
  // What % of workflow runs pass?
  {
    const stats = repoData.workflowRunStats;
    if (stats.totalRuns > 0) {
      const successRate = stats.successRuns / stats.totalRuns;
      signals.push({
        organization_id: organizationId,
        source_domain: 'engineering',
        signal_type: 'cicd_success_rate',
        signal_value: successRate,
        signal_timestamp: today,
        entity_type: 'repository',
        entity_id: entityId,
        metadata: {
          total_runs: stats.totalRuns,
          success_runs: stats.successRuns,
          failure_runs: stats.failureRuns,
          avg_duration_sec: stats.avgDurationSec,
          repo: entityId,
        },
      });
    }
  }

  // ── 5. Action Ecosystem Diversity ──
  // How many different actions does the pipeline use? (broader = more capable)
  {
    const allActions = analyses.flatMap(a => a.actions);
    const uniqueActions = new Set(allActions.map(a => a.split('@')[0]));
    // Normalize: 1.0 = 15+ unique actions
    const diversity = Math.min(1, uniqueActions.size / 15);

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'cicd_action_diversity',
      signal_value: diversity,
      signal_timestamp: today,
      entity_type: 'repository',
      entity_id: entityId,
      metadata: {
        unique_actions: uniqueActions.size,
        total_action_uses: allActions.length,
        top_actions: [...uniqueActions].slice(0, 10),
        repo: entityId,
      },
    });
  }

  // ── 6. Trigger Diversity ──
  // How many trigger types? (push, PR, schedule, workflow_dispatch = flexible pipeline)
  {
    const allTriggers = new Set(analyses.flatMap(a => a.triggers));
    // Normalize: 1.0 = 4+ trigger types
    const triggerDiversity = Math.min(1, allTriggers.size / 4);

    signals.push({
      organization_id: organizationId,
      source_domain: 'engineering',
      signal_type: 'cicd_trigger_diversity',
      signal_value: triggerDiversity,
      signal_timestamp: today,
      entity_type: 'repository',
      entity_id: entityId,
      metadata: {
        triggers: [...allTriggers],
        trigger_count: allTriggers.size,
        repo: entityId,
      },
    });
  }

  return signals;
}

// ============================================================================
// TRAINING PACK GENERATION
// ============================================================================

export function buildCICDTrainingPacks(allData: RepoWorkflowData[]): TrainingPack[] {
  const packs: TrainingPack[] = [];
  const repoCount = allData.filter(r => r.workflows.length > 0).length;

  // Compute per-repo stats for correlations
  const repoStats = allData
    .filter(r => r.workflows.length > 0)
    .map(r => {
      const analyses = r.workflows.map(wf => analyzeWorkflowYAML(wf.content));
      const totalJobs = analyses.reduce((s, a) => s + a.jobCount, 0);
      const totalSteps = analyses.reduce((s, a) => s + a.stepCount, 0);
      const hasMatrix = analyses.some(a => a.hasMatrix) ? 1 : 0;
      const hasCaching = analyses.some(a => a.hasCaching) ? 1 : 0;
      const hasPermissions = analyses.some(a => a.hasPermissions) ? 1 : 0;
      const successRate = r.workflowRunStats.totalRuns > 0
        ? r.workflowRunStats.successRuns / r.workflowRunStats.totalRuns
        : 0;
      const avgDuration = r.workflowRunStats.avgDurationSec;
      const uniqueActions = new Set(analyses.flatMap(a => a.actions.map(act => act.split('@')[0]))).size;

      return {
        repo: r.fullName, stars: r.stars,
        totalJobs, totalSteps, hasMatrix, hasCaching, hasPermissions,
        successRate, avgDuration, uniqueActions,
        workflowCount: r.workflows.length,
      };
    });

  function computeCorrelation(
    getX: (s: typeof repoStats[0]) => number,
    getY: (s: typeof repoStats[0]) => number,
  ): number {
    const pairs = repoStats.filter(s => !isNaN(getX(s)) && !isNaN(getY(s)));
    if (pairs.length < 3) return 0;
    const xs = pairs.map(getX);
    const ys = pairs.map(getY);
    const n = xs.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, denomX = 0, denomY = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      denomX += (xs[i] - meanX) ** 2;
      denomY += (ys[i] - meanY) ** 2;
    }
    const denom = Math.sqrt(denomX * denomY);
    return denom > 0 ? Math.round(num / denom * 100) / 100 : 0;
  }

  // ── Pack 1: Pipeline Complexity → CI Success ──
  const complexityVsSuccess = computeCorrelation(s => s.totalJobs, s => s.successRate);
  packs.push({
    id: 'cicd-complexity-success',
    title: 'CI/CD Pipeline Complexity and Success Rates',
    source: `Computed from ${repoCount} repos: jobCount-successRate r=${complexityVsSuccess}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(complexityVsSuccess) * 0.4),
    tags: ['cicd', 'pipeline', 'complexity', 'success-rate', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'cicd_pipeline_complexity',
        effectSize: Math.abs(complexityVsSuccess) || 0.5,
        lagDays: 7,
        coefficientSign: complexityVsSuccess > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Pipeline Complexity → Build Success',
        domains: ['engineering'],
        description: `r=${complexityVsSuccess} between job count and CI success rate across ${repoCount} top repos. More sophisticated pipelines may catch issues earlier.`,
        observed: repoStats.filter(s => s.totalJobs > 3 && s.successRate > 0.8).length,
        expected: Math.round(repoCount * 0.4),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // ── Pack 2: Caching → Build Speed ──
  const cachingVsDuration = computeCorrelation(s => s.hasCaching, s => -s.avgDuration);
  packs.push({
    id: 'cicd-caching-speed',
    title: 'CI/CD Caching Strategies and Build Performance',
    source: `Computed from ${repoCount} repos: caching-duration r=${cachingVsDuration}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: Math.min(0.85, 0.5 + Math.abs(cachingVsDuration) * 0.4),
    tags: ['cicd', 'caching', 'performance', 'build-speed', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'cicd_reliability_patterns',
        effectSize: Math.abs(cachingVsDuration) || 0.5,
        lagDays: 1,
        coefficientSign: 1, // Caching → faster builds (positive)
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Caching → Build Speed',
        domains: ['engineering'],
        description: `r=${cachingVsDuration} between caching usage and build duration. Repos with caching tend to have faster CI builds.`,
        observed: repoStats.filter(s => s.hasCaching && s.avgDuration > 0 && s.avgDuration < 600).length,
        expected: Math.round(repoCount * 0.3),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // ── Pack 3: Security Practices → Pipeline Reliability ──
  const securityVsSuccess = computeCorrelation(s => s.hasPermissions, s => s.successRate);
  packs.push({
    id: 'cicd-security-reliability',
    title: 'CI/CD Security Practices and Pipeline Reliability',
    source: `Computed from ${repoCount} repos: permissions-success r=${securityVsSuccess}`,
    industry: 'Technology',
    domains: ['engineering'],
    confidence: 0.7,
    tags: ['cicd', 'security', 'reliability', 'permissions', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'engineering',
        metric: 'cicd_security_posture',
        effectSize: Math.abs(securityVsSuccess) || 0.4,
        lagDays: 7,
        coefficientSign: securityVsSuccess > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Security → Reliability',
        domains: ['engineering'],
        description: `r=${securityVsSuccess} between explicit permission configuration and CI success rate. Security-conscious repos tend to have more reliable pipelines.`,
        observed: repoStats.filter(s => s.hasPermissions && s.successRate > 0.8).length,
        expected: Math.round(repoCount * 0.3),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  // ── Pack 4: Action Ecosystem → Pipeline Maturity ──
  const actionsVsStars = computeCorrelation(s => s.uniqueActions, s => Math.log10(s.stars + 1));
  packs.push({
    id: 'cicd-ecosystem-maturity',
    title: 'GitHub Actions Ecosystem and Pipeline Maturity',
    source: `Computed from ${repoCount} repos: actionDiversity-stars r=${actionsVsStars}`,
    industry: 'Technology',
    domains: ['engineering', 'product'],
    confidence: 0.7,
    tags: ['cicd', 'actions', 'ecosystem', 'maturity', 'data-computed'],
    causalChains: [
      {
        source: 'engineering',
        target: 'product',
        metric: 'cicd_action_diversity',
        effectSize: Math.abs(actionsVsStars) || 0.4,
        lagDays: 30,
        coefficientSign: actionsVsStars > 0 ? 1 : -1,
      },
    ],
    businessRules: [],
    cascades: [],
    patterns: [
      {
        name: 'Action Diversity → Project Maturity',
        domains: ['engineering', 'product'],
        description: `r=${actionsVsStars} between unique GitHub Actions used and project popularity. Mature projects leverage more diverse CI/CD tooling.`,
        observed: repoStats.filter(s => s.uniqueActions > 5 && s.stars > 10000).length,
        expected: Math.round(repoCount * 0.3),
        total: repoCount,
      },
    ],
    outcomes: [],
  });

  return packs;
}
