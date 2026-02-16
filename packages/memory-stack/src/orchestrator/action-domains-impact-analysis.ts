/**
 * Impact Analysis Domain
 * =======================
 *
 * Analyzes the impact of code changes across system components using **Claude LLM**.
 *
 * **Cognitive Analog:** Prefrontal cortex — predicting consequences of actions
 *
 * **Capabilities:**
 * - Analyze blast radius of code changes
 * - Identify affected components and services
 * - Map dependency chains
 * - **Claude-powered**: Uses Claude API for intelligent impact analysis
 * - Assess risk levels
 * - Identify test coverage gaps
 * - Recommend reviewers
 *
 * **CRITICAL**: Uses Claude LLM to ensure "quality isn't any less than Claude"
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface ImpactAnalysisRequest {
  /** Changed files or components */
  changedFiles: string[];
  /** Type of change */
  changeType: 'add' | 'modify' | 'delete' | 'refactor';
  /** Description of the change */
  changeDescription: string;
  /** Codebase context (file tree, modules) */
  codebaseContext?: string;
  /** Known dependency graph (module → dependencies) */
  dependencyGraph?: Record<string, string[]>;
  /** PR diff or patch content */
  diff?: string;
  /** Programming language */
  language?: string;
  /** Anthropic API key for Claude */
  anthropicApiKey?: string;
}

export interface ImpactAnalysisResult {
  /** Affected components/modules */
  affectedComponents: AffectedComponent[];
  /** Overall risk score (0-100) */
  riskScore: number;
  /** Risk level */
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  /** Blast radius (number of affected components) */
  blastRadius: number;
  /** Dependency chains that are impacted */
  dependencyChains: DependencyChain[];
  /** Test coverage gaps */
  testCoverageGaps: TestCoverageGap[];
  /** Recommended reviewers */
  recommendedReviewers: string[];
  /** Summary */
  summary: string;
  /** Claude LLM used */
  claudePowered: boolean;
}

export interface AffectedComponent {
  /** Component/file path */
  path: string;
  /** Impact type */
  impactType: 'direct' | 'transitive' | 'potential';
  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Reason for impact */
  reason: string;
  /** Distance from change (hops) */
  distance: number;
}

export interface DependencyChain {
  /** Chain of components */
  chain: string[];
  /** Risk level of this chain */
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  /** Description */
  description: string;
}

export interface TestCoverageGap {
  /** Component lacking coverage */
  component: string;
  /** Type of gap */
  gapType: 'no-tests' | 'outdated-tests' | 'missing-edge-cases' | 'integration-gap';
  /** Recommendation */
  recommendation: string;
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

/**
 * Impact Analysis Domain
 *
 * Uses **Claude LLM** to analyze code change impact intelligently.
 */
export const impactAnalysisDomain = {
  name: 'impact-analysis' as const,
  description: 'Analyze code change impact with Claude LLM',
  cognitiveAnalog: 'prefrontal cortex (predicting consequences of actions)',
  requires: ['claudeLLM', 'causalDAG'] as const,

  /**
   * Execute impact analysis
   */
  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as ImpactAnalysisRequest;

    // 1. Analyze impact with Claude or fallback
    const analysis = request.anthropicApiKey
      ? await analyzeWithClaude(request, ctx)
      : await analyzeWithHeuristics(request, ctx);

    // 2. Identify test coverage gaps
    const testCoverageGaps = identifyTestGaps(request, analysis.affectedComponents);

    // 3. Recommend reviewers
    const recommendedReviewers = recommendReviewers(request, analysis.affectedComponents);

    // 4. Build result
    const result: ImpactAnalysisResult = {
      affectedComponents: analysis.affectedComponents,
      riskScore: analysis.riskScore,
      riskLevel: analysis.riskLevel,
      blastRadius: analysis.affectedComponents.length,
      dependencyChains: analysis.dependencyChains,
      testCoverageGaps,
      recommendedReviewers,
      summary: analysis.summary,
      claudePowered: analysis.claudePowered,
    };

    // 5. Extract interventions
    const interventions = extractInterventions(result);

    return {
      type: 'impact-analysis',
      data: result,
      confidence: analysis.claudePowered ? 0.85 : 0.65,
      narrative: formatNarrative(result, request),
      interventions,
      evidence: [
        {
          type: 'blast_radius',
          description: `${result.blastRadius} components affected by change`,
          weight: 1.0,
        },
        {
          type: 'analysis_method',
          description: result.claudePowered
            ? 'Impact analysis powered by Claude LLM for maximum accuracy'
            : 'Impact analysis using heuristic dependency traversal',
          weight: result.claudePowered ? 1.0 : 0.6,
        },
        {
          type: 'risk_assessment',
          description: `Risk level: ${result.riskLevel} (score: ${result.riskScore}/100)`,
          weight: 0.9,
        },
      ],
    };
  },
};

// ============================================================================
// CLAUDE LLM ANALYSIS
// ============================================================================

interface AnalysisResult {
  affectedComponents: AffectedComponent[];
  riskScore: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  dependencyChains: DependencyChain[];
  summary: string;
  claudePowered: boolean;
}

/**
 * Analyze impact using Claude LLM
 */
async function analyzeWithClaude(
  request: ImpactAnalysisRequest,
  ctx: ActionDomainContext
): Promise<AnalysisResult> {
  const depGraphStr = request.dependencyGraph
    ? `\n## Dependency Graph:\n${JSON.stringify(request.dependencyGraph, null, 2)}\n`
    : '';

  const prompt = `You are an expert software architect analyzing the impact of a code change. Analyze the following change and identify all affected components.

## Change Details:
**Changed Files:** ${request.changedFiles.join(', ')}
**Change Type:** ${request.changeType}
**Description:** ${request.changeDescription}
**Language:** ${request.language || 'unknown'}

${request.codebaseContext ? `## Codebase Context:\n${request.codebaseContext}\n` : ''}
${depGraphStr}
${request.diff ? `## Diff:\n${request.diff.slice(0, 3000)}\n` : ''}

## Required Analysis:
1. **Affected Components**: List all directly and transitively affected components
2. **Risk Score**: Rate overall risk 0-100
3. **Dependency Chains**: Identify critical dependency paths impacted
4. **Summary**: Concise impact summary

**Output Format (JSON):**
\`\`\`json
{
  "affectedComponents": [
    {
      "path": "src/services/payment.ts",
      "impactType": "direct",
      "severity": "high",
      "reason": "Direct modification of payment logic",
      "distance": 0
    }
  ],
  "riskScore": 75,
  "dependencyChains": [
    {
      "chain": ["payment.ts", "checkout.ts", "order.ts"],
      "riskLevel": "high",
      "description": "Payment change cascades to checkout and order flows"
    }
  ],
  "summary": "High-risk change affecting payment pipeline"
}
\`\`\``;

  try {
    const response = await callClaudeAPI(request.anthropicApiKey!, prompt);
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);

    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      const riskScore = data.riskScore || 50;
      return {
        affectedComponents: data.affectedComponents || [],
        riskScore,
        riskLevel: riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 40 ? 'medium' : 'low',
        dependencyChains: data.dependencyChains || [],
        summary: data.summary || '',
        claudePowered: true,
      };
    }

    return analyzeWithHeuristics(request, ctx);
  } catch (error) {
    console.warn('Claude impact analysis failed, using fallback:', error);
    return analyzeWithHeuristics(request, ctx);
  }
}

/**
 * Call Claude API
 */
async function callClaudeAPI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ============================================================================
// HEURISTIC ANALYSIS (FALLBACK)
// ============================================================================

/**
 * Analyze using heuristics
 */
async function analyzeWithHeuristics(
  request: ImpactAnalysisRequest,
  ctx: ActionDomainContext
): Promise<AnalysisResult> {
  const affectedComponents: AffectedComponent[] = [];
  const dependencyChains: DependencyChain[] = [];

  // Direct impacts — changed files themselves
  for (const file of request.changedFiles) {
    affectedComponents.push({
      path: file,
      impactType: 'direct',
      severity: request.changeType === 'delete' ? 'high' : 'medium',
      reason: `Directly ${request.changeType}d`,
      distance: 0,
    });
  }

  // Transitive impacts via dependency graph
  if (request.dependencyGraph) {
    const visited = new Set<string>(request.changedFiles);
    const queue = [...request.changedFiles];

    let distance = 1;
    while (queue.length > 0 && distance <= 3) {
      const nextQueue: string[] = [];

      for (const file of queue) {
        // Find dependents (things that depend on this file)
        for (const [module, deps] of Object.entries(request.dependencyGraph)) {
          if (deps.includes(file) && !visited.has(module)) {
            visited.add(module);
            nextQueue.push(module);

            affectedComponents.push({
              path: module,
              impactType: 'transitive',
              severity: distance === 1 ? 'medium' : 'low',
              reason: `Depends on ${file}`,
              distance,
            });
          }
        }
      }

      queue.length = 0;
      queue.push(...nextQueue);
      distance++;
    }

    // Build dependency chains
    for (const file of request.changedFiles) {
      const chain = [file];
      let current = file;

      for (const [module, deps] of Object.entries(request.dependencyGraph)) {
        if (deps.includes(current)) {
          chain.push(module);
          current = module;
        }
      }

      if (chain.length > 1) {
        dependencyChains.push({
          chain,
          riskLevel: chain.length > 3 ? 'high' : 'medium',
          description: `${file} change cascades through ${chain.length - 1} dependent(s)`,
        });
      }
    }
  }

  // Calculate risk score
  let riskScore = 0;
  riskScore += Math.min(30, affectedComponents.length * 5); // blast radius
  riskScore += request.changeType === 'delete' ? 25 : request.changeType === 'refactor' ? 20 : 10;
  riskScore += affectedComponents.filter(c => c.severity === 'high' || c.severity === 'critical').length * 10;
  riskScore += dependencyChains.filter(c => c.riskLevel === 'high').length * 10;
  riskScore = Math.min(100, riskScore);

  const riskLevel: AnalysisResult['riskLevel'] =
    riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 40 ? 'medium' : 'low';

  return {
    affectedComponents,
    riskScore,
    riskLevel,
    dependencyChains,
    summary: `${riskLevel} risk change affecting ${affectedComponents.length} component(s). ${request.changeType === 'delete' ? 'Deletion increases risk.' : ''}`,
    claudePowered: false,
  };
}

// ============================================================================
// TEST COVERAGE GAPS
// ============================================================================

/**
 * Identify test coverage gaps
 */
function identifyTestGaps(
  request: ImpactAnalysisRequest,
  affectedComponents: AffectedComponent[]
): TestCoverageGap[] {
  const gaps: TestCoverageGap[] = [];

  for (const component of affectedComponents) {
    // Check if test file exists (heuristic: look for test patterns)
    const hasTestFile = request.changedFiles.some(f =>
      f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')
    );

    if (!hasTestFile && component.impactType === 'direct') {
      gaps.push({
        component: component.path,
        gapType: 'no-tests',
        recommendation: `Add tests for ${component.path} to cover the ${request.changeType} change`,
      });
    }

    if (component.impactType === 'transitive' && component.severity !== 'low') {
      gaps.push({
        component: component.path,
        gapType: 'integration-gap',
        recommendation: `Add integration test verifying ${component.path} works after upstream change`,
      });
    }
  }

  return gaps;
}

// ============================================================================
// REVIEWER RECOMMENDATIONS
// ============================================================================

/**
 * Recommend reviewers based on affected components
 */
function recommendReviewers(
  request: ImpactAnalysisRequest,
  affectedComponents: AffectedComponent[]
): string[] {
  const reviewers: string[] = [];

  // Heuristic: recommend reviewers based on file paths
  const domains = new Set<string>();
  for (const component of affectedComponents) {
    const parts = component.path.split('/');
    if (parts.length >= 2) {
      domains.add(parts[1]); // e.g., 'services', 'api', 'components'
    }
  }

  for (const domain of domains) {
    reviewers.push(`${domain}-team-lead`);
  }

  // High-risk changes need senior review
  const highRiskCount = affectedComponents.filter(
    c => c.severity === 'critical' || c.severity === 'high'
  ).length;

  if (highRiskCount > 0) {
    reviewers.push('senior-engineer');
  }

  if (affectedComponents.length > 5) {
    reviewers.push('architect');
  }

  return [...new Set(reviewers)];
}

// ============================================================================
// INTERVENTION EXTRACTION
// ============================================================================

/**
 * Extract interventions from analysis
 */
function extractInterventions(result: ImpactAnalysisResult): any[] {
  const interventions: any[] = [];

  if (result.riskLevel === 'critical' || result.riskLevel === 'high') {
    interventions.push({
      action: 'Require additional code review before merging',
      targetDomains: ['engineering'],
      confidence: 0.9,
      owner: 'engineering',
      priority: result.riskLevel === 'critical' ? 'critical' : 'high',
    });
  }

  if (result.testCoverageGaps.length > 0) {
    interventions.push({
      action: `Address ${result.testCoverageGaps.length} test coverage gap(s) before deployment`,
      targetDomains: ['engineering'],
      confidence: 0.85,
      owner: 'engineering',
      priority: 'high',
    });
  }

  if (result.blastRadius > 5) {
    interventions.push({
      action: 'Consider breaking this change into smaller PRs to reduce blast radius',
      targetDomains: ['engineering'],
      confidence: 0.75,
      owner: 'engineering',
      priority: 'medium',
    });
  }

  return interventions;
}

// ============================================================================
// NARRATIVE FORMATTING
// ============================================================================

/**
 * Format analysis as narrative
 */
function formatNarrative(
  result: ImpactAnalysisResult,
  request: ImpactAnalysisRequest
): string {
  const claudeUsed = result.claudePowered ? '**Claude-powered**' : 'Heuristic-based';

  let narrative = `${claudeUsed} impact analysis. `;
  narrative += `${request.changedFiles.length} file(s) changed (${request.changeType}). `;
  narrative += `Blast radius: ${result.blastRadius} component(s) affected. `;
  narrative += `Risk: ${result.riskLevel} (${result.riskScore}/100). `;
  narrative += `${result.dependencyChains.length} dependency chain(s) impacted. `;
  narrative += `${result.testCoverageGaps.length} test gap(s) identified.`;

  return narrative;
}
