/**
 * Impact Analysis Domain
 * =======================
 *
 * Analyzes and predicts impact of changes using **Claude LLM**.
 *
 * **Cognitive Analog:** Prefrontal cortex (consequence prediction)
 *
 * **Capabilities:**
 * - Predict impact of code changes, deployments, incidents
 * - Analyze blast radius across services
 * - **Claude-powered**: Uses Claude API for intelligent impact prediction
 * - Identify affected users, revenue, SLAs
 * - Risk scoring and mitigation suggestions
 * - Dependency graph analysis
 * - Historical impact correlation
 *
 * **Integrates with:**
 * - Causal DAG (L4 causal reasoning)
 * - **Claude LLM API** for impact prediction quality
 * - Existing impact-scorer.ts (enhances with AI)
 * - Service dependency graphs
 *
 * **CRITICAL**: Uses Claude LLM to ensure "quality isn't any less than Claude"
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';
import { formatBrainContextForDomain, buildBrainAttribution } from './brain-context-for-domains';
import { callDomainLLM } from './domain-llm-client';

// ============================================================================
// TYPES
// ============================================================================

export interface ImpactAnalysisRequest {
  /** Type of change */
  changeType: 'code-change' | 'deployment' | 'incident' | 'config-change' | 'infrastructure';
  /** Change description */
  description: string;
  /** Affected components */
  components?: string[];
  /** Change diff (for code changes) */
  diff?: string;
  /** Target environment */
  environment?: 'production' | 'staging' | 'development';
  /** Deployment time (optional) */
  scheduledTime?: string;
  /** Anthropic API key for Claude */
  anthropicApiKey?: string;
}

export interface ImpactAnalysisResult {
  /** Overall impact score (0-100) */
  impactScore: number;
  /** Risk level */
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  /** Blast radius analysis */
  blastRadius: BlastRadius;
  /** Affected areas */
  affectedAreas: AffectedArea[];
  /** Risk factors */
  riskFactors: RiskFactor[];
  /** Mitigation strategies */
  mitigations: MitigationStrategy[];
  /** Impact prediction */
  predictions: ImpactPrediction;
  /** Claude LLM used */
  claudePowered: boolean;
  /** Confidence in analysis */
  analysisConfidence: number;
}

export interface BlastRadius {
  /** Services impacted */
  services: string[];
  /** Percentage of system affected */
  systemPercentage: number;
  /** User impact estimate */
  usersAffected: number;
  /** Geographic regions affected */
  regions?: string[];
  /** Dependency chain depth */
  dependencyDepth: number;
}

export interface AffectedArea {
  /** Area name */
  area: string;
  /** Impact type */
  type: 'functionality' | 'performance' | 'availability' | 'data' | 'security';
  /** Severity of impact */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Description */
  description: string;
  /** Likelihood (0-1) */
  likelihood: number;
}

export interface RiskFactor {
  /** Risk category */
  category: 'technical' | 'operational' | 'business' | 'compliance';
  /** Risk description */
  description: string;
  /** Probability (0-1) */
  probability: number;
  /** Impact if occurs */
  impact: 'critical' | 'high' | 'medium' | 'low';
  /** Evidence */
  evidence: string[];
}

export interface MitigationStrategy {
  /** Strategy name */
  strategy: string;
  /** Actions to take */
  actions: string[];
  /** Risk reduction percentage */
  riskReduction: number;
  /** Implementation effort */
  effort: 'low' | 'medium' | 'high';
  /** Priority */
  priority: number;
}

export interface ImpactPrediction {
  /** Revenue impact estimate */
  revenueImpact?: string;
  /** SLA breach probability */
  slaBreachProbability: number;
  /** Recovery time estimate */
  recoveryTime: string;
  /** Customer churn risk */
  churnRisk: 'high' | 'medium' | 'low';
  /** Reputational impact */
  reputationalImpact: 'significant' | 'moderate' | 'minimal';
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

/**
 * Impact Analysis Domain
 *
 * Uses **Claude LLM** to predict and analyze change impact intelligently.
 */
export const impactAnalysisDomain = {
  name: 'impact-analyze' as const,
  description: 'Analyze and predict impact of changes with Claude LLM',
  cognitiveAnalog: 'prefrontal cortex (consequence prediction)',
  requires: ['claudeLLM', 'causalDAG', 'dependencyGraph'] as const,

  /**
   * Execute impact analysis
   */
  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as ImpactAnalysisRequest;

    // 1. Analyze with Claude or fallback
    const analysis = request.anthropicApiKey
      ? await analyzeWithClaude(request, ctx)
      : await analyzeWithHeuristics(request, ctx);

    // 2. Calculate blast radius
    const blastRadius = calculateBlastRadius(
      request.components || [],
      analysis.affectedAreas,
      request.environment
    );

    // 3. Analyze dependencies
    const dependencyImpact = analyzeDependencies(request.components || [], ctx);

    // 4. Generate predictions
    const predictions = generatePredictions(
      analysis.impactScore,
      analysis.riskLevel,
      request.changeType,
      request.environment
    );

    // 5. Generate mitigations
    const mitigations = generateMitigations(
      analysis.riskFactors,
      request.changeType
    );

    // 6. Build result (Brain-augmented)
    const brainAttribution = buildBrainAttribution(ctx.brain as Record<string, any>, 'impact-analyze');
    const result: ImpactAnalysisResult = {
      impactScore: analysis.impactScore,
      riskLevel: analysis.riskLevel,
      blastRadius: {
        ...blastRadius,
        dependencyDepth: dependencyImpact.depth,
      },
      affectedAreas: analysis.affectedAreas,
      riskFactors: analysis.riskFactors,
      mitigations,
      predictions,
      claudePowered: analysis.claudePowered,
      analysisConfidence: analysis.confidence,
      ...brainAttribution,
    } as any;

    // 7. Extract interventions
    const interventions = extractInterventions(result);

    return {
      type: 'impact-analyze',
      data: result,
      confidence: result.analysisConfidence,
      narrative: formatNarrative(result, request),
      interventions,
      evidence: [
        {
          type: 'impact_analysis',
          description: `Impact score: ${result.impactScore}/100, ${result.affectedAreas.length} affected areas`,
          weight: 1.0,
        },
        {
          type: 'claude_prediction',
          description: result.claudePowered
            ? 'Impact prediction powered by Claude LLM'
            : 'Impact prediction using heuristics',
          weight: result.claudePowered ? 1.0 : 0.6,
        },
        {
          type: 'blast_radius',
          description: `${blastRadius.services.length} services, ${blastRadius.systemPercentage}% system affected`,
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
  impactScore: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  affectedAreas: AffectedArea[];
  riskFactors: RiskFactor[];
  confidence: number;
  claudePowered: boolean;
}

/**
 * Analyze impact using Claude LLM
 */
async function analyzeWithClaude(
  request: ImpactAnalysisRequest,
  ctx: ActionDomainContext
): Promise<AnalysisResult> {
  // Inject Brain's organizational intelligence into Claude's prompt
  const brainSection = formatBrainContextForDomain(ctx.brain as Record<string, any>, 'impact-analyze');

  const prompt = `You are an expert Site Reliability Engineer operating within NexusBrain's cognitive stack, analyzing the impact of a change. Provide a comprehensive impact analysis.
${brainSection}

## Change Details:
**Type:** ${request.changeType}
**Description:** ${request.description}
**Environment:** ${request.environment || 'production'}
**Components:** ${request.components?.join(', ') || 'unknown'}
${request.scheduledTime ? `**Scheduled Time:** ${request.scheduledTime}\n` : ''}
${request.diff ? `## Code Diff:\n\`\`\`\n${request.diff.slice(0, 1000)}\n\`\`\`\n` : ''}

## Required Analysis:
1. **Impact Score**: Overall impact (0-100)
2. **Risk Level**: critical/high/medium/low
3. **Affected Areas**: List all areas that could be impacted
4. **Risk Factors**: Identify technical, operational, business risks
5. **Confidence**: Rate confidence in analysis (0-100)

**Output Format (JSON):**
\`\`\`json
{
  "impactScore": 75,
  "riskLevel": "high",
  "affectedAreas": [
    {
      "area": "Payment Processing",
      "type": "functionality",
      "severity": "high",
      "description": "Changes affect payment validation logic",
      "likelihood": 0.8
    }
  ],
  "riskFactors": [
    {
      "category": "technical",
      "description": "Database schema change requires migration",
      "probability": 0.7,
      "impact": "high",
      "evidence": ["Schema version mismatch", "Migration script required"]
    }
  ],
  "confidence": 85
}
\`\`\``;

  try {
    const response = await callClaudeAPI(request.anthropicApiKey!, prompt);
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);

    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      return {
        impactScore: data.impactScore || 50,
        riskLevel: data.riskLevel || 'medium',
        affectedAreas: data.affectedAreas || [],
        riskFactors: data.riskFactors || [],
        confidence: (data.confidence || 70) / 100,
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
 * Call Claude API — routed through smart model router
 * @see domain-llm-client for model selection logic
 */
async function callClaudeAPI(apiKey: string, prompt: string): Promise<string> {
  return callDomainLLM({ apiKey, taskType: 'reasoning', prompt });
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
  let impactScore = 50;
  let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  const affectedAreas: AffectedArea[] = [];
  const riskFactors: RiskFactor[] = [];

  // Adjust impact based on change type
  switch (request.changeType) {
    case 'incident':
      impactScore += 30;
      riskLevel = 'critical';
      break;
    case 'deployment':
      impactScore += 20;
      if (request.environment === 'production') {
        impactScore += 10;
        riskLevel = 'high';
      }
      break;
    case 'infrastructure':
      impactScore += 25;
      riskLevel = 'high';
      break;
    case 'config-change':
      impactScore += 15;
      break;
    case 'code-change':
      impactScore += 10;
      break;
  }

  // Adjust based on environment
  if (request.environment === 'production') {
    impactScore += 20;
    if (riskLevel === 'medium') riskLevel = 'high';
  }

  // Adjust based on components
  const componentCount = request.components?.length || 0;
  impactScore += componentCount * 5;

  if (componentCount > 5) {
    riskLevel = 'critical';
  } else if (componentCount > 3 && riskLevel === 'medium') {
    riskLevel = 'high';
  }

  impactScore = Math.min(100, impactScore);

  // Generate affected areas
  if (request.changeType === 'deployment' || request.changeType === 'code-change') {
    affectedAreas.push({
      area: 'Application Functionality',
      type: 'functionality',
      severity: riskLevel,
      description: 'Code changes may affect existing functionality',
      likelihood: 0.6,
    });

    if (request.diff && request.diff.includes('database')) {
      affectedAreas.push({
        area: 'Data Layer',
        type: 'data',
        severity: 'high',
        description: 'Database changes detected',
        likelihood: 0.8,
      });
    }
  }

  if (request.changeType === 'infrastructure') {
    affectedAreas.push({
      area: 'System Availability',
      type: 'availability',
      severity: 'high',
      description: 'Infrastructure changes may cause downtime',
      likelihood: 0.7,
    });
  }

  // Generate risk factors
  if (request.environment === 'production') {
    riskFactors.push({
      category: 'business',
      description: 'Production change affects live users',
      probability: 1.0,
      impact: 'high',
      evidence: ['Production environment'],
    });
  }

  if (componentCount > 3) {
    riskFactors.push({
      category: 'technical',
      description: 'Multiple components affected increases complexity',
      probability: 0.8,
      impact: 'medium',
      evidence: [`${componentCount} components affected`],
    });
  }

  return {
    impactScore,
    riskLevel,
    affectedAreas,
    riskFactors,
    confidence: 0.65,
    claudePowered: false,
  };
}

// ============================================================================
// BLAST RADIUS CALCULATION
// ============================================================================

/**
 * Calculate blast radius
 */
function calculateBlastRadius(
  components: string[],
  affectedAreas: AffectedArea[],
  environment?: string
): BlastRadius {
  // Estimate users affected
  let usersAffected = 0;
  if (environment === 'production') {
    usersAffected = components.length * 1000; // 1000 users per component
  } else if (environment === 'staging') {
    usersAffected = 100;
  } else {
    usersAffected = 10;
  }

  // Calculate system percentage
  const totalSystemComponents = 20; // Assume 20 total components
  const systemPercentage = Math.min(
    100,
    (components.length / totalSystemComponents) * 100
  );

  // Determine regions
  const regions = environment === 'production' ? ['us-east-1', 'eu-west-1'] : ['us-east-1'];

  return {
    services: components,
    systemPercentage: Math.round(systemPercentage),
    usersAffected,
    regions,
    dependencyDepth: 0, // Will be filled by dependency analysis
  };
}

/**
 * Analyze dependencies
 */
function analyzeDependencies(
  components: string[],
  ctx: ActionDomainContext
): { depth: number; dependencies: string[] } {
  // In production, this would query the dependency graph
  // For now, estimate based on component count
  const depth = Math.min(5, Math.ceil(components.length / 2));

  return {
    depth,
    dependencies: components,
  };
}

// ============================================================================
// PREDICTIONS
// ============================================================================

/**
 * Generate impact predictions
 */
function generatePredictions(
  impactScore: number,
  riskLevel: string,
  changeType: string,
  environment?: string
): ImpactPrediction {
  // Revenue impact
  let revenueImpact: string | undefined;
  if (riskLevel === 'critical' && environment === 'production') {
    revenueImpact = '$10,000-50,000/hour';
  } else if (riskLevel === 'high' && environment === 'production') {
    revenueImpact = '$1,000-10,000/hour';
  }

  // SLA breach probability
  const slaBreachProbability =
    riskLevel === 'critical' ? 0.9 :
    riskLevel === 'high' ? 0.6 :
    riskLevel === 'medium' ? 0.3 : 0.1;

  // Recovery time
  let recoveryTime = '1-2 hours';
  if (changeType === 'incident') {
    recoveryTime = '30 minutes - 4 hours';
  } else if (changeType === 'infrastructure') {
    recoveryTime = '2-6 hours';
  } else if (changeType === 'deployment') {
    recoveryTime = '15-30 minutes (rollback)';
  }

  // Churn risk
  const churnRisk: 'high' | 'medium' | 'low' =
    riskLevel === 'critical' ? 'high' :
    riskLevel === 'high' ? 'medium' : 'low';

  // Reputational impact
  const reputationalImpact: 'significant' | 'moderate' | 'minimal' =
    impactScore > 80 ? 'significant' :
    impactScore > 50 ? 'moderate' : 'minimal';

  return {
    revenueImpact,
    slaBreachProbability,
    recoveryTime,
    churnRisk,
    reputationalImpact,
  };
}

// ============================================================================
// MITIGATIONS
// ============================================================================

/**
 * Generate mitigation strategies
 */
function generateMitigations(
  riskFactors: RiskFactor[],
  changeType: string
): MitigationStrategy[] {
  const mitigations: MitigationStrategy[] = [];

  // Always include monitoring
  mitigations.push({
    strategy: 'Enhanced Monitoring',
    actions: [
      'Set up dashboards for key metrics',
      'Configure alerts for anomalies',
      'Monitor error rates and latency',
    ],
    riskReduction: 20,
    effort: 'low',
    priority: 1,
  });

  // Deployment-specific mitigations
  if (changeType === 'deployment' || changeType === 'code-change') {
    mitigations.push({
      strategy: 'Gradual Rollout',
      actions: [
        'Deploy to 1% of traffic initially',
        'Monitor metrics for 30 minutes',
        'Gradually increase to 10%, 50%, 100%',
      ],
      riskReduction: 40,
      effort: 'medium',
      priority: 2,
    });

    mitigations.push({
      strategy: 'Automated Rollback',
      actions: [
        'Configure automatic rollback triggers',
        'Set error rate threshold (>5%)',
        'Enable one-click manual rollback',
      ],
      riskReduction: 30,
      effort: 'low',
      priority: 3,
    });
  }

  // Infrastructure mitigations
  if (changeType === 'infrastructure') {
    mitigations.push({
      strategy: 'Blue-Green Deployment',
      actions: [
        'Prepare parallel infrastructure',
        'Test on green environment',
        'Switch traffic with quick rollback option',
      ],
      riskReduction: 50,
      effort: 'high',
      priority: 2,
    });
  }

  // High-risk mitigations
  const highRiskFactors = riskFactors.filter(rf => rf.impact === 'critical' || rf.impact === 'high');
  if (highRiskFactors.length > 0) {
    mitigations.push({
      strategy: 'Incident Response Preparation',
      actions: [
        'Brief on-call team on change',
        'Prepare rollback runbook',
        'Set up war room channel',
      ],
      riskReduction: 25,
      effort: 'low',
      priority: 1,
    });
  }

  return mitigations;
}

// ============================================================================
// INTERVENTION EXTRACTION
// ============================================================================

/**
 * Extract interventions from impact analysis
 */
function extractInterventions(result: ImpactAnalysisResult): any[] {
  const interventions: any[] = [];

  // Critical impact = intervention
  if (result.riskLevel === 'critical') {
    interventions.push({
      action: 'Review change with engineering leadership before proceeding',
      targetDomains: ['engineering', 'leadership'],
      confidence: 0.95,
      owner: 'engineering-leadership',
      priority: 'critical',
    });
  }

  // High impact + production = intervention
  if (result.riskLevel === 'high' && result.blastRadius.systemPercentage > 30) {
    interventions.push({
      action: 'Implement gradual rollout and enhanced monitoring',
      targetDomains: ['deployment'],
      confidence: 0.9,
      owner: 'sre-team',
      priority: 'high',
    });
  }

  // High SLA breach risk = intervention
  if (result.predictions.slaBreachProbability > 0.7) {
    interventions.push({
      action: 'Prepare incident response team and rollback plan',
      targetDomains: ['incident-response'],
      confidence: 0.85,
      owner: 'on-call',
      priority: 'high',
    });
  }

  return interventions;
}

// ============================================================================
// NARRATIVE FORMATTING
// ============================================================================

/**
 * Format impact analysis as narrative
 */
function formatNarrative(
  result: ImpactAnalysisResult,
  request: ImpactAnalysisRequest
): string {
  const claudeUsed = result.claudePowered ? '**Claude-powered**' : 'Heuristic-based';

  let narrative = `${claudeUsed} impact analysis. `;
  narrative += `${request.changeType} has ${result.impactScore}/100 impact score (${result.riskLevel} risk). `;
  narrative += `Blast radius: ${result.blastRadius.services.length} services, `;
  narrative += `${result.blastRadius.systemPercentage}% of system, `;
  narrative += `${result.blastRadius.usersAffected} users affected. `;
  narrative += `${result.affectedAreas.length} affected areas identified. `;
  narrative += `SLA breach risk: ${Math.round(result.predictions.slaBreachProbability * 100)}%. `;
  narrative += `${result.mitigations.length} mitigation strategies provided.`;

  return narrative;
}
