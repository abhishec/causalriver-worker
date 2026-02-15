/**
 * PR Analyzer — Automated Pull Request Code Review
 * ==================================================
 *
 * Brain Analog: Code Review Specialist (Wernicke's Area for language comprehension
 *               + Prefrontal Cortex for quality assessment)
 *
 * When a PR is opened/updated, this orchestrator:
 * 1. Analyzes changed files for impact (dependency graph)
 * 2. Identifies potential risks (cognitive stack reasoning)
 * 3. Suggests expert reviewers (expertise graph)
 * 4. Detects code smells and technical debt
 * 5. Generates structured review comments
 *
 * Integrates with BrainCommander for full cognitive stack analysis.
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrainCommander, type CommandResult } from './brain-commander';
import type { NexusRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

export interface PRAnalysisConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Anthropic API key for LLM-powered analysis */
  anthropicApiKey?: string;
  /** Repository for data access */
  repository?: NexusRepository;
}

export interface PRFileChange {
  /** File path */
  filename: string;
  /** Number of additions */
  additions: number;
  /** Number of deletions */
  deletions: number;
  /** Number of changes */
  changes: number;
  /** Change status */
  status: 'added' | 'removed' | 'modified' | 'renamed';
  /** Patch content (diff) */
  patch?: string;
}

export interface PRMetadata {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR description */
  body: string;
  /** Author username */
  author: string;
  /** Base branch */
  baseBranch: string;
  /** Head branch */
  headBranch: string;
  /** Changed files */
  files: PRFileChange[];
  /** Total additions */
  additions: number;
  /** Total deletions */
  deletions: number;
  /** Labels */
  labels: string[];
}

export interface PRAnalysisResult {
  /** Overall risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Risk score (0-1) */
  riskScore: number;
  /** Impact analysis */
  impact: {
    /** Affected domains/services */
    affectedDomains: string[];
    /** Files that will be impacted by these changes */
    impactedFiles: string[];
    /** Cascade depth (how many layers deep the impact goes) */
    cascadeDepth: number;
  };
  /** Suggested reviewers */
  reviewers: Array<{
    username: string;
    expertise: string[];
    score: number;
    reason: string;
  }>;
  /** Code quality issues */
  issues: Array<{
    severity: 'info' | 'warning' | 'error';
    type: string;
    file: string;
    line?: number;
    message: string;
    suggestion?: string;
  }>;
  /** Technical debt indicators */
  technicalDebt: {
    complexity: number;
    duplicateCode: boolean;
    testCoverage: 'low' | 'medium' | 'high' | 'unknown';
    documentationNeeded: boolean;
  };
  /** Positive findings */
  strengths: string[];
  /** Brain Commander analysis */
  brainAnalysis?: CommandResult;
  /** Formatted review comment */
  reviewComment: string;
  /** Analysis metadata */
  meta: {
    analyzedAt: string;
    analysisTimeMs: number;
    cognitiveLayersUsed: number;
  };
}

// ============================================================================
// PR ANALYZER
// ============================================================================

/**
 * Create a PR analyzer that uses the full cognitive stack
 */
export function createPRAnalyzer(config: PRAnalysisConfig) {
  const { supabase, organizationId, anthropicApiKey, repository } = config;

  // Initialize brain commander for deep analysis
  // Note: Cognitive stack is always enabled as of v2.0
  const brainCommander = createBrainCommander({
    supabase,
    organizationId,
    anthropicApiKey,
    enableActions: true,
    enableQualityGate: true,
  });

  return {
    /**
     * Analyze a pull request and generate review comments
     */
    async analyzePR(pr: PRMetadata): Promise<PRAnalysisResult> {
      const startTime = Date.now();

      // 1. Extract changed file paths for impact analysis
      const changedFiles = pr.files.map((f) => f.filename);
      const totalChanges = pr.additions + pr.deletions;

      // 2. Build query for brain commander
      const query = buildPRAnalysisQuery(pr, changedFiles);

      // 3. Run through cognitive stack for deep analysis
      const brainResult = await brainCommander.command(query, {
        userId: `github:${pr.author}`,
      });

      // 4. Calculate risk score based on multiple factors
      const riskScore = calculateRiskScore({
        filesChanged: changedFiles.length,
        linesChanged: totalChanges,
        hasTests: changedFiles.some((f) => f.includes('test') || f.includes('spec')),
        affectedDomains: brainResult.intelligence.impactAnalysis
          ? Object.keys(brainResult.intelligence.impactAnalysis)
          : [],
      });

      // 5. Determine risk level
      const riskLevel = getRiskLevel(riskScore);

      // 6. Extract impact analysis from brain
      const impact = extractImpactAnalysis(brainResult, changedFiles);

      // 7. Suggest reviewers based on expertise graph
      const reviewers = await suggestReviewers(
        supabase,
        organizationId,
        changedFiles,
        pr.author
      );

      // 8. Detect code quality issues
      const issues = detectCodeIssues(pr.files, totalChanges);

      // 9. Assess technical debt
      const technicalDebt = assessTechnicalDebt(pr.files, totalChanges);

      // 10. Identify strengths
      const strengths = identifyStrengths(pr);

      // 11. Generate formatted review comment
      const reviewComment = formatReviewComment({
        pr,
        riskLevel,
        riskScore,
        impact,
        reviewers,
        issues,
        technicalDebt,
        strengths,
      });

      return {
        riskLevel,
        riskScore,
        impact,
        reviewers,
        issues,
        technicalDebt,
        strengths,
        brainAnalysis: brainResult,
        reviewComment,
        meta: {
          analyzedAt: new Date().toISOString(),
          analysisTimeMs: Date.now() - startTime,
          cognitiveLayersUsed: brainResult.cognitiveStack ? 13 : 0,
        },
      };
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildPRAnalysisQuery(pr: PRMetadata, changedFiles: string[]): string {
  return `Analyze the impact of pull request #${pr.number}: "${pr.title}"

Changed files (${changedFiles.length}):
${changedFiles.slice(0, 20).map((f, i) => `${i + 1}. ${f}`).join('\n')}
${changedFiles.length > 20 ? `... and ${changedFiles.length - 20} more files` : ''}

What are the risks and impacts of merging this PR?
Which services or components will be affected?
What should reviewers pay special attention to?`;
}

function calculateRiskScore(factors: {
  filesChanged: number;
  linesChanged: number;
  hasTests: boolean;
  affectedDomains: string[];
}): number {
  let score = 0;

  // Files changed factor (0-0.3)
  score += Math.min(factors.filesChanged / 50, 0.3);

  // Lines changed factor (0-0.3)
  score += Math.min(factors.linesChanged / 1000, 0.3);

  // No tests penalty (0.2)
  if (!factors.hasTests) {
    score += 0.2;
  }

  // Multiple domains affected (0-0.2)
  score += Math.min(factors.affectedDomains.length / 10, 0.2);

  return Math.min(score, 1);
}

function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

function extractImpactAnalysis(
  brainResult: CommandResult,
  changedFiles: string[]
): PRAnalysisResult['impact'] {
  const affectedDomains: string[] = [];
  let maxDepth = 0;

  if (brainResult.intelligence?.impactAnalysis) {
    for (const [domain, analysis] of Object.entries(brainResult.intelligence.impactAnalysis)) {
      affectedDomains.push(domain);
      maxDepth = Math.max(maxDepth, analysis.maxCascadeDepth);
    }
  }

  return {
    affectedDomains,
    impactedFiles: changedFiles,
    cascadeDepth: maxDepth,
  };
}

async function suggestReviewers(
  supabase: SupabaseClient,
  organizationId: string,
  changedFiles: string[],
  author: string
): Promise<PRAnalysisResult['reviewers']> {
  // Query expertise graph for contributors with expertise in changed files
  const { data: experts } = await supabase
    .from('contributor_expertise')
    .select('contributor_id, topic, expertise_score')
    .eq('organization_id', organizationId)
    .in('topic', changedFiles.map((f) => `code_change:${f}`))
    .order('expertise_score', { ascending: false })
    .limit(10);

  if (!experts || experts.length === 0) {
    return [];
  }

  // Aggregate scores by contributor
  const contributorScores = new Map<string, { topics: string[]; totalScore: number }>();
  for (const exp of experts) {
    if (exp.contributor_id === author) continue; // Don't suggest the author

    const existing = contributorScores.get(exp.contributor_id);
    if (existing) {
      existing.topics.push(exp.topic);
      existing.totalScore += exp.expertise_score;
    } else {
      contributorScores.set(exp.contributor_id, {
        topics: [exp.topic],
        totalScore: exp.expertise_score,
      });
    }
  }

  // Convert to sorted array
  const reviewers = Array.from(contributorScores.entries())
    .map(([username, data]) => ({
      username,
      expertise: data.topics.map((t) => t.replace('code_change:', '')),
      score: data.totalScore,
      reason: `Expertise in ${data.topics.length} changed file(s)`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return reviewers;
}

function detectCodeIssues(
  files: PRFileChange[],
  totalChanges: number
): PRAnalysisResult['issues'] {
  const issues: PRAnalysisResult['issues'] = [];

  // Check for large PRs
  if (totalChanges > 500) {
    issues.push({
      severity: 'warning',
      type: 'large_pr',
      file: 'PR',
      message: `This PR has ${totalChanges} line changes. Consider breaking it into smaller PRs for easier review.`,
      suggestion: 'Split into multiple focused PRs',
    });
  }

  // Check for missing tests
  const hasTestChanges = files.some(
    (f) => f.filename.includes('test') || f.filename.includes('spec')
  );
  const hasCodeChanges = files.some(
    (f) =>
      (f.filename.endsWith('.ts') ||
        f.filename.endsWith('.js') ||
        f.filename.endsWith('.tsx') ||
        f.filename.endsWith('.jsx')) &&
      !f.filename.includes('test') &&
      !f.filename.includes('spec')
  );

  if (hasCodeChanges && !hasTestChanges) {
    issues.push({
      severity: 'warning',
      type: 'missing_tests',
      file: 'PR',
      message: 'No test files modified. Consider adding tests for new functionality.',
      suggestion: 'Add unit or integration tests',
    });
  }

  // Check for package.json changes without lock file
  const hasPackageJson = files.some((f) => f.filename === 'package.json');
  const hasLockFile = files.some(
    (f) => f.filename === 'package-lock.json' || f.filename === 'pnpm-lock.yaml'
  );

  if (hasPackageJson && !hasLockFile) {
    issues.push({
      severity: 'error',
      type: 'missing_lock_file',
      file: 'package.json',
      message: 'package.json modified without updating lock file',
      suggestion: 'Run npm install or pnpm install to update lock file',
    });
  }

  return issues;
}

function assessTechnicalDebt(
  files: PRFileChange[],
  totalChanges: number
): PRAnalysisResult['technicalDebt'] {
  const avgChangesPerFile = files.length > 0 ? totalChanges / files.length : 0;

  return {
    complexity: avgChangesPerFile > 100 ? 8 : avgChangesPerFile > 50 ? 5 : 2,
    duplicateCode: false, // Would need AST analysis
    testCoverage: files.some((f) => f.filename.includes('test')) ? 'medium' : 'low',
    documentationNeeded: files.some((f) => f.filename.endsWith('.md')) === false,
  };
}

function identifyStrengths(pr: PRMetadata): string[] {
  const strengths: string[] = [];

  // Good PR title/description
  if (pr.title.length > 10 && pr.body.length > 50) {
    strengths.push('Well-documented PR with clear title and description');
  }

  // Includes tests
  if (pr.files.some((f) => f.filename.includes('test') || f.filename.includes('spec'))) {
    strengths.push('Includes test coverage');
  }

  // Focused PR (small number of files)
  if (pr.files.length <= 5 && pr.additions + pr.deletions <= 200) {
    strengths.push('Focused PR with limited scope');
  }

  // Includes documentation
  if (pr.files.some((f) => f.filename.endsWith('.md'))) {
    strengths.push('Includes documentation updates');
  }

  return strengths;
}

function formatReviewComment(params: {
  pr: PRMetadata;
  riskLevel: string;
  riskScore: number;
  impact: PRAnalysisResult['impact'];
  reviewers: PRAnalysisResult['reviewers'];
  issues: PRAnalysisResult['issues'];
  technicalDebt: PRAnalysisResult['technicalDebt'];
  strengths: string[];
}): string {
  const { pr, riskLevel, riskScore, impact, reviewers, issues, technicalDebt, strengths } = params;

  const riskEmoji =
    riskLevel === 'critical' ? '🔴' : riskLevel === 'high' ? '🟡' : riskLevel === 'medium' ? '🟢' : '✅';

  let comment = `## 🤖 NexusBrain Code Review\n\n`;

  // Risk Assessment
  comment += `### ${riskEmoji} Risk Assessment: ${riskLevel.toUpperCase()}\n`;
  comment += `**Risk Score**: ${(riskScore * 100).toFixed(0)}/100\n\n`;

  // Impact Analysis
  if (impact.affectedDomains.length > 0) {
    comment += `### 📊 Impact Analysis\n`;
    comment += `- **Affected Domains**: ${impact.affectedDomains.join(', ')}\n`;
    comment += `- **Changed Files**: ${impact.impactedFiles.length}\n`;
    comment += `- **Cascade Depth**: ${impact.cascadeDepth} layer(s)\n\n`;
  }

  // Suggested Reviewers
  if (reviewers.length > 0) {
    comment += `### 👥 Suggested Reviewers\n`;
    for (const reviewer of reviewers) {
      comment += `- **@${reviewer.username}** (${reviewer.reason})\n`;
    }
    comment += `\n`;
  }

  // Issues
  if (issues.length > 0) {
    comment += `### ⚠️ Issues Detected\n`;
    for (const issue of issues) {
      const emoji = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      comment += `${emoji} **${issue.type}**: ${issue.message}\n`;
      if (issue.suggestion) {
        comment += `   💡 *Suggestion*: ${issue.suggestion}\n`;
      }
    }
    comment += `\n`;
  }

  // Strengths
  if (strengths.length > 0) {
    comment += `### ✨ Strengths\n`;
    for (const strength of strengths) {
      comment += `- ✅ ${strength}\n`;
    }
    comment += `\n`;
  }

  // Technical Debt
  comment += `### 📈 Technical Debt Assessment\n`;
  comment += `- **Complexity**: ${technicalDebt.complexity}/10\n`;
  comment += `- **Test Coverage**: ${technicalDebt.testCoverage}\n`;
  if (technicalDebt.documentationNeeded) {
    comment += `- ⚠️ Consider adding documentation\n`;
  }
  comment += `\n`;

  // Footer
  comment += `---\n`;
  comment += `*Analyzed by [NexusBrain](https://nexusbrain.ai) • Powered by 15-layer cognitive reasoning*\n`;

  return comment;
}
