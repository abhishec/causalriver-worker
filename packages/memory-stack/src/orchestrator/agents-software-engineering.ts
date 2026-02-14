/**
 * Software Engineering Agents — SE-aaS Agent Workforce
 * =====================================================
 *
 * The 4 agents that orchestrate the 7 software engineering domains
 * to deliver "Software Engineering as a Service":
 *
 *   1. brain-codebase-mapper     — Autonomous: Maps codebase structure on repo connect
 *   2. brain-feature-builder     — Task: Implements features from specs
 *   3. brain-code-reviewer       — Task: Reviews PRs with confidence-based triage
 *   4. brain-tech-debt-optimizer — Autonomous: Identifies and prioritizes refactoring
 *
 * These agents compose the 7 cognitive primitives (domains) to deliver
 * engineering intelligence that matches a senior 10x engineer.
 *
 * @packageDocumentation
 */

import {
  defineAgent,
  type AgentDefinition,
  type AgentExecutionContext,
} from './agent-registry';

// ============================================================================
// AGENT 1: BRAIN-CODEBASE-MAPPER — Autonomous Codebase Analysis
// ============================================================================

/**
 * Brain Codebase Mapper — Ramping up on a new codebase
 *
 * Trigger: When a new repository is connected
 * Domains: codebase-comprehend → pattern-memory → correlate
 * Output: Architecture map, dependency graph, tech debt inventory
 * Human Analog: Senior engineer spending 2 weeks learning a new codebase
 */
export const brainCodebaseMapperAgent: AgentDefinition<
  { repository: string; branch?: string },
  {
    architecture: unknown;
    dependencies: unknown;
    techDebt: unknown[];
    patterns: unknown[];
    complexity: number;
    recommendations: unknown[];
  }
> = defineAgent({
  name: 'brain-codebase-mapper',
  description: 'Analyzes codebase structure, dependencies, patterns, and tech debt on repository connect',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['codebase-comprehend', 'pattern-memory', 'correlate'],
  triggers: ['event:repo_connected', 'command:analyze_codebase'],
  tools: ['codebase-comprehend', 'pattern-memory', 'correlate'],
  timeoutMs: 600000, // 10 minutes for large codebases
  maxRetries: 2,
  inputSchema: {
    repository: 'Git repository URL or local path',
    branch: 'Git branch to analyze (default: main)',
  },
  outputSchema: {
    architecture: 'High-level architecture summary',
    dependencies: 'Dependency graph (upstream/downstream)',
    techDebt: 'List of tech debt items with severity',
    patterns: 'Detected architectural patterns',
    complexity: 'Codebase complexity score (0-1)',
    recommendations: 'Prioritized refactoring recommendations',
  },
  tags: ['software-engineering', 'analysis', 'autonomous'],

  execute: async (input, ctx) => {
    ctx.log(`[brain-codebase-mapper] Analyzing codebase: ${input.repository}`);

    // Step 1: Comprehend codebase structure
    ctx.reportProgress(0.1, 'Comprehending codebase structure...');
    const comprehendResult = await ctx.callAgent('codebase-comprehend', {
      domain: input.repository,
      question: `Analyze the architecture and dependencies of ${input.repository}`,
    });

    if (comprehendResult.status === 'failed') {
      throw new Error(`Codebase comprehension failed: ${comprehendResult.error}`);
    }

    const comprehendData = (comprehendResult.result as Record<string, unknown>).data as {
      architecture: unknown;
      dependencies: { upstream: unknown[]; downstream: unknown[] };
      techDebt: unknown[];
      patterns: unknown[];
      complexity: number;
    };

    ctx.log(`[brain-codebase-mapper] Found ${comprehendData.techDebt.length} tech debt items`);

    // Step 2: Store patterns in memory for future reference
    ctx.reportProgress(0.5, 'Storing architectural patterns...');
    if (comprehendData.patterns.length > 0) {
      await ctx.callAgent('pattern-memory', {
        action: 'store',
        patterns: comprehendData.patterns,
        domain: input.repository,
      });
    }

    // Step 3: Correlate with similar codebases (if brain has seen similar patterns)
    ctx.reportProgress(0.8, 'Correlating with known patterns...');
    const correlateResult = await ctx.callAgent('correlate', {
      domain: input.repository,
      question: 'What patterns correlate with this codebase architecture?',
    });

    const correlations = correlateResult.status === 'completed'
      ? (correlateResult.result as Record<string, unknown>).data
      : { correlations: [] };

    ctx.log(`[brain-codebase-mapper] Found ${(correlations as { correlations: unknown[] }).correlations.length} architectural correlations`);

    // Step 4: Build recommendations based on tech debt and complexity
    ctx.reportProgress(0.9, 'Generating recommendations...');
    const recommendations = comprehendData.techDebt.slice(0, 10).map((debt: any) => ({
      priority: debt.severity === 'high' ? 'critical' : debt.severity === 'medium' ? 'high' : 'normal',
      action: `Refactor: ${debt.description}`,
      effort: debt.type === 'circular-dependency' ? 'high' : 'medium',
      impact: debt.severity === 'high' ? 'Reduces risk, improves maintainability' : 'Improves code quality',
    }));

    ctx.reportProgress(1.0, 'Codebase analysis complete');

    return {
      architecture: comprehendData.architecture,
      dependencies: comprehendData.dependencies,
      techDebt: comprehendData.techDebt,
      patterns: comprehendData.patterns,
      complexity: comprehendData.complexity,
      recommendations,
    };
  },
});

// ============================================================================
// AGENT 2: BRAIN-FEATURE-BUILDER — Task Agent for Feature Implementation
// ============================================================================

/**
 * Brain Feature Builder — Implementing features from specs
 *
 * Trigger: Manual or event:feature_requested
 * Domains: spec-completeness → requirement-clarify → pattern-enforce → code-generate
 * Output: Complete implementation (code, tests, docs, migrations)
 * Human Analog: Mid-level engineer implementing a feature from a spec
 */
export const brainFeatureBuilderAgent: AgentDefinition<
  {
    featureName: string;
    specification: string;
    targetDomain: string;
  },
  {
    completenessCheck: unknown;
    questions: unknown[];
    implementation: unknown;
    artifacts: string[];
    confidence: number;
  }
> = defineAgent({
  name: 'brain-feature-builder',
  description: 'Implements features from specifications: checks completeness, clarifies requirements, enforces patterns, generates code',
  level: 'task',
  version: '1.0.0',
  domains: ['spec-completeness', 'requirement-clarify', 'pattern-enforce', 'code-generate'],
  triggers: ['event:feature_requested', 'command:build_feature', 'manual'],
  tools: ['spec-completeness', 'requirement-clarify', 'pattern-enforce', 'code-generate'],
  timeoutMs: 300000, // 5 minutes
  maxRetries: 1,
  inputSchema: {
    featureName: 'Name of the feature to build',
    specification: 'Feature specification or requirements document',
    targetDomain: 'Target code domain/module',
  },
  outputSchema: {
    completenessCheck: 'Spec completeness analysis',
    questions: 'Clarifying questions (if spec incomplete)',
    implementation: 'Generated code artifacts',
    artifacts: 'List of generated files',
    confidence: 'Implementation confidence score',
  },
  tags: ['software-engineering', 'implementation', 'task'],

  execute: async (input, ctx) => {
    ctx.log(`[brain-feature-builder] Building feature: ${input.featureName}`);

    // Step 1: Check spec completeness
    ctx.reportProgress(0.2, 'Checking specification completeness...');
    const completenessResult = await ctx.callAgent('spec-completeness', {
      domain: input.targetDomain,
      question: input.specification,
    });

    if (completenessResult.status === 'failed') {
      throw new Error(`Spec completeness check failed: ${completenessResult.error}`);
    }

    const completenessData = (completenessResult.result as Record<string, unknown>).data as {
      completenessScore: number;
      missingRequirements: unknown[];
      edgeCases: unknown[];
    };

    ctx.log(`[brain-feature-builder] Spec completeness: ${(completenessData.completenessScore * 100).toFixed(0)}%`);

    // Step 2: Generate clarifying questions if spec is incomplete
    let questions: unknown[] = [];
    if (completenessData.completenessScore < 0.7) {
      ctx.reportProgress(0.4, 'Generating clarifying questions...');
      const clarifyResult = await ctx.callAgent('requirement-clarify', {
        domain: input.targetDomain,
        question: input.specification,
      });

      questions = ((clarifyResult.result as Record<string, unknown>).data as { questions: unknown[] }).questions;
      ctx.log(`[brain-feature-builder] Generated ${questions.length} clarifying questions`);

      // If spec is too incomplete, return early with questions
      if (completenessData.completenessScore < 0.5) {
        return {
          completenessCheck: completenessData,
          questions,
          implementation: null,
          artifacts: [],
          confidence: completenessData.completenessScore,
        };
      }
    }

    // Step 3: Enforce architectural patterns
    ctx.reportProgress(0.6, 'Enforcing architectural patterns...');
    const patternResult = await ctx.callAgent('pattern-enforce', {
      domain: input.targetDomain,
      question: `Apply best practices for: ${input.specification}`,
    });

    const patternData = (patternResult.result as Record<string, unknown>).data as {
      violations: unknown[];
      qualityScore: number;
    };

    ctx.log(`[brain-feature-builder] Quality score: ${(patternData.qualityScore * 100).toFixed(0)}%`);

    // Step 4: Generate code implementation
    ctx.reportProgress(0.8, 'Generating implementation...');
    const generateResult = await ctx.callAgent('code-generate', {
      domain: input.targetDomain,
      question: `Implement: ${input.specification}`,
    });

    const generateData = (generateResult.result as Record<string, unknown>).data as {
      codeArtifacts: Array<{ name: string; type: string }>;
      completeness: number;
    };

    ctx.log(`[brain-feature-builder] Generated ${generateData.codeArtifacts.length} artifacts`);

    const confidence = (completenessData.completenessScore + patternData.qualityScore + generateData.completeness) / 3;

    ctx.reportProgress(1.0, 'Feature implementation complete');

    return {
      completenessCheck: completenessData,
      questions,
      implementation: generateData,
      artifacts: generateData.codeArtifacts.map(a => a.name),
      confidence,
    };
  },
});

// ============================================================================
// AGENT 3: BRAIN-CODE-REVIEWER — Task Agent for PR Review
// ============================================================================

/**
 * Brain Code Reviewer — AI-powered code review with confidence triage
 *
 * Trigger: When a PR is opened
 * Domains: consistency-verify → review-triage → pattern-enforce → recommend
 * Output: Review comments, triage decision (auto-approve / needs review / critical)
 * Human Analog: Tech lead reviewing PRs
 */
export const brainCodeReviewerAgent: AgentDefinition<
  {
    pullRequestId: string;
    changedFiles: string[];
    description: string;
  },
  {
    triageDecision: 'auto-approve' | 'quick-review' | 'detailed-review' | 'critical';
    confidence: number;
    consistencyIssues: unknown[];
    patternViolations: unknown[];
    recommendations: unknown[];
    reviewComments: string[];
  }
> = defineAgent({
  name: 'brain-code-reviewer',
  description: 'Reviews pull requests with confidence-based triage: auto-approve safe changes, flag risky changes for human review',
  level: 'task',
  version: '1.0.0',
  domains: ['consistency-verify', 'review-triage', 'pattern-enforce', 'recommend'],
  triggers: ['event:pr_opened', 'command:review_pr', 'manual'],
  tools: ['consistency-verify', 'review-triage', 'pattern-enforce', 'recommend'],
  timeoutMs: 180000, // 3 minutes
  maxRetries: 1,
  inputSchema: {
    pullRequestId: 'PR identifier',
    changedFiles: 'List of changed file paths',
    description: 'PR description/summary',
  },
  outputSchema: {
    triageDecision: 'Review triage category',
    confidence: 'Review confidence score',
    consistencyIssues: 'Cross-consistency issues found',
    patternViolations: 'Architectural pattern violations',
    recommendations: 'Actionable recommendations',
    reviewComments: 'Human-readable review comments',
  },
  tags: ['software-engineering', 'review', 'task'],

  execute: async (input, ctx) => {
    ctx.log(`[brain-code-reviewer] Reviewing PR: ${input.pullRequestId}`);

    const reviewComments: string[] = [];

    // Step 1: Verify consistency across code, tests, docs
    ctx.reportProgress(0.25, 'Verifying consistency...');
    const consistencyResult = await ctx.callAgent('consistency-verify', {
      domain: input.changedFiles[0] || 'unknown',
      question: `Verify consistency for: ${input.description}`,
    });

    const consistencyData = (consistencyResult.result as Record<string, unknown>).data as {
      inconsistencies: unknown[];
      alignmentScore: number;
    };

    ctx.log(`[brain-code-reviewer] Alignment score: ${(consistencyData.alignmentScore * 100).toFixed(0)}%`);

    if (consistencyData.inconsistencies.length > 0) {
      reviewComments.push(`⚠️  Found ${consistencyData.inconsistencies.length} consistency issues — review required`);
    }

    // Step 2: Check pattern compliance
    ctx.reportProgress(0.5, 'Checking pattern compliance...');
    const patternResult = await ctx.callAgent('pattern-enforce', {
      domain: input.changedFiles[0] || 'unknown',
      question: `Check patterns for: ${input.description}`,
    });

    const patternData = (patternResult.result as Record<string, unknown>).data as {
      violations: unknown[];
      qualityScore: number;
    };

    ctx.log(`[brain-code-reviewer] Quality score: ${(patternData.qualityScore * 100).toFixed(0)}%`);

    if (patternData.violations.length > 0) {
      reviewComments.push(`📋 Found ${patternData.violations.length} pattern violations`);
    }

    // Step 3: Triage based on confidence
    ctx.reportProgress(0.75, 'Triaging review...');
    const triageResult = await ctx.callAgent('review-triage', {
      domain: input.changedFiles[0] || 'unknown',
      question: `Triage PR: ${input.description}`,
    });

    const triageData = (triageResult.result as Record<string, unknown>).data as {
      triageResults: Array<{ category: 'auto-approve' | 'quick-review' | 'detailed-review' | 'critical'; confidence: number; risks: string[] }>;
      confidenceScore: number;
    };

    const primaryTriage = triageData.triageResults[0];
    const triageDecision = primaryTriage.category;
    const confidence = triageData.confidenceScore;

    ctx.log(`[brain-code-reviewer] Triage decision: ${triageDecision} (${(confidence * 100).toFixed(0)}% confidence)`);

    // Step 4: Generate recommendations
    ctx.reportProgress(0.9, 'Generating recommendations...');
    const recommendResult = await ctx.callAgent('recommend', {
      domain: input.changedFiles[0] || 'unknown',
      question: `Recommend improvements for: ${input.description}`,
    });

    const recommendations = ((recommendResult.result as Record<string, unknown>).data as { recommendations: unknown[] }).recommendations || [];

    // Build final review comment
    if (triageDecision === 'auto-approve') {
      reviewComments.push('✅ LGTM — Auto-approved (low risk, follows patterns)');
    } else if (triageDecision === 'quick-review') {
      reviewComments.push('👀 Quick review recommended — standard change');
    } else if (triageDecision === 'detailed-review') {
      reviewComments.push(`🔍 Detailed review required — risks: ${primaryTriage.risks.join(', ')}`);
    } else {
      reviewComments.push(`🚨 CRITICAL — Mandatory review required — risks: ${primaryTriage.risks.join(', ')}`);
    }

    ctx.reportProgress(1.0, 'Code review complete');

    return {
      triageDecision,
      confidence,
      consistencyIssues: consistencyData.inconsistencies,
      patternViolations: patternData.violations,
      recommendations,
      reviewComments,
    };
  },
});

// ============================================================================
// AGENT 4: BRAIN-TECH-DEBT-OPTIMIZER — Autonomous Refactoring Planner
// ============================================================================

/**
 * Brain Tech Debt Optimizer — Proactive tech debt identification and prioritization
 *
 * Trigger: Weekly schedule or manual
 * Domains: codebase-comprehend → pattern-memory → risk-cascade → recommend
 * Output: Prioritized refactoring backlog
 * Human Analog: Staff engineer identifying and prioritizing refactoring work
 */
export const brainTechDebtOptimizerAgent: AgentDefinition<
  { scope?: string },
  {
    techDebtItems: unknown[];
    prioritizedBacklog: unknown[];
    riskCascades: unknown[];
    estimatedEffort: string;
  }
> = defineAgent({
  name: 'brain-tech-debt-optimizer',
  description: 'Analyzes codebase for tech debt, identifies cascading risks, and prioritizes refactoring work',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['codebase-comprehend', 'pattern-memory', 'risk-cascade', 'recommend'],
  triggers: ['schedule:weekly', 'command:optimize_tech_debt', 'manual'],
  tools: ['codebase-comprehend', 'pattern-memory', 'risk-cascade', 'recommend'],
  timeoutMs: 600000, // 10 minutes
  maxRetries: 2,
  inputSchema: {
    scope: 'Optional scope filter (e.g., "auth", "api", "database")',
  },
  outputSchema: {
    techDebtItems: 'All detected tech debt items',
    prioritizedBacklog: 'Prioritized refactoring backlog',
    riskCascades: 'Cascading failure risks',
    estimatedEffort: 'Total estimated effort',
  },
  tags: ['software-engineering', 'optimization', 'autonomous'],

  execute: async (input, ctx) => {
    ctx.log(`[brain-tech-debt-optimizer] Optimizing tech debt${input.scope ? ` (scope: ${input.scope})` : ''}`);

    // Step 1: Comprehend codebase to identify tech debt
    ctx.reportProgress(0.2, 'Analyzing codebase for tech debt...');
    const comprehendResult = await ctx.callAgent('codebase-comprehend', {
      domain: input.scope || 'all',
      question: 'Identify all tech debt, high coupling, and circular dependencies',
    });

    const techDebtItems = ((comprehendResult.result as Record<string, unknown>).data as { techDebt: unknown[] }).techDebt;
    ctx.log(`[brain-tech-debt-optimizer] Found ${techDebtItems.length} tech debt items`);

    // Step 2: Check pattern memory for similar past issues
    ctx.reportProgress(0.4, 'Checking historical patterns...');
    const patternResult = await ctx.callAgent('pattern-memory', {
      action: 'match',
      domain: input.scope || 'all',
      question: 'What patterns have caused issues before?',
    });

    const historicalPatterns = ((patternResult.result as Record<string, unknown>).data as { matches: unknown[] }).matches || [];
    ctx.log(`[brain-tech-debt-optimizer] Found ${historicalPatterns.length} historical patterns`);

    // Step 3: Analyze risk cascades (what breaks if this tech debt causes failure?)
    ctx.reportProgress(0.6, 'Analyzing risk cascades...');
    const riskResult = await ctx.callAgent('risk-cascade', {
      domain: input.scope || 'all',
      question: 'What are the cascading failure risks from tech debt?',
    });

    const riskCascades = ((riskResult.result as Record<string, unknown>).data as { cascades: unknown[] }).cascades || [];
    ctx.log(`[brain-tech-debt-optimizer] Found ${riskCascades.length} risk cascades`);

    // Step 4: Prioritize refactoring work
    ctx.reportProgress(0.8, 'Prioritizing refactoring backlog...');
    const recommendResult = await ctx.callAgent('recommend', {
      domain: input.scope || 'all',
      question: 'Prioritize tech debt refactoring based on risk and effort',
    });

    const prioritizedBacklog = ((recommendResult.result as Record<string, unknown>).data as { recommendations: unknown[] }).recommendations || [];
    ctx.log(`[brain-tech-debt-optimizer] Generated ${prioritizedBacklog.length} prioritized recommendations`);

    // Estimate total effort
    const estimatedEffort = prioritizedBacklog.length < 5 ? '1-2 sprints' :
                           prioritizedBacklog.length < 15 ? '1 quarter' :
                           '2+ quarters';

    ctx.reportProgress(1.0, 'Tech debt optimization complete');

    return {
      techDebtItems,
      prioritizedBacklog,
      riskCascades,
      estimatedEffort,
    };
  },
});

// ============================================================================
// EXPORT ALL SOFTWARE ENGINEERING AGENTS
// ============================================================================

export const ALL_SOFTWARE_ENGINEERING_AGENTS: AgentDefinition[] = [
  brainCodebaseMapperAgent as AgentDefinition,
  brainFeatureBuilderAgent as AgentDefinition,
  brainCodeReviewerAgent as AgentDefinition,
  brainTechDebtOptimizerAgent as AgentDefinition,
];

/**
 * Register all 4 software engineering agents into a registry.
 */
export function registerSoftwareEngineeringAgents(
  registry: { register: (def: AgentDefinition) => void },
): void {
  for (const agent of ALL_SOFTWARE_ENGINEERING_AGENTS) {
    registry.register(agent);
  }
}
