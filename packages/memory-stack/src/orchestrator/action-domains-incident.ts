/**
 * Incident Diagnosis Domain
 * ==========================
 *
 * Diagnoses production incidents using **Claude LLM** for root cause analysis.
 *
 * **Cognitive Analog:** Medical diagnosis (symptom → diagnosis → treatment)
 *
 * **Capabilities:**
 * - Analyze error logs, stack traces, metrics
 * - Identify root causes using causal reasoning
 * - Correlate incidents across services
 * - **Claude-powered**: Uses Claude API for intelligent diagnosis
 * - Generate remediation steps
 * - Predict incident severity and impact
 * - Link to similar past incidents
 *
 * **Integrates with:**
 * - Causal DAG (L4 causal reasoning)
 * - **Claude LLM API** for diagnostic quality
 * - Log aggregation systems
 * - Metrics databases
 *
 * **CRITICAL**: Uses Claude LLM to ensure "quality isn't any less than Claude"
 *
 * @packageDocumentation
 */

import type { ActionDomainContext, ActionDomainResult } from './domain-action-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface IncidentDiagnosisRequest {
  /** Incident description */
  description: string;
  /** Error logs */
  logs?: string[];
  /** Stack trace */
  stackTrace?: string;
  /** Metrics/telemetry */
  metrics?: Record<string, number>;
  /** Affected services */
  affectedServices?: string[];
  /** Incident timestamp */
  timestamp?: string;
  /** Severity level */
  severity?: 'critical' | 'high' | 'medium' | 'low';
  /** Anthropic API key for Claude */
  anthropicApiKey?: string;
}

export interface IncidentDiagnosisResult {
  /** Root causes identified */
  rootCauses: RootCause[];
  /** Diagnosis summary */
  diagnosis: string;
  /** Remediation steps */
  remediationSteps: RemediationStep[];
  /** Similar past incidents */
  similarIncidents: SimilarIncident[];
  /** Predicted impact */
  impact: ImpactAssessment;
  /** Confidence in diagnosis */
  diagnosticConfidence: number;
  /** Claude LLM used */
  claudePowered: boolean;
  /** Time to resolve estimate */
  estimatedTimeToResolve: string;
}

export interface RootCause {
  /** Cause type */
  type: 'code-bug' | 'configuration' | 'infrastructure' | 'dependency' | 'data-corruption' | 'resource-exhaustion';
  /** Description of root cause */
  description: string;
  /** Evidence supporting this cause */
  evidence: string[];
  /** Likelihood (0-1) */
  likelihood: number;
  /** Component/service affected */
  component: string;
}

export interface RemediationStep {
  /** Step number */
  step: number;
  /** Action to take */
  action: string;
  /** Command/code to execute */
  command?: string;
  /** Expected outcome */
  expectedOutcome: string;
  /** Priority */
  priority: 'immediate' | 'high' | 'medium' | 'low';
  /** Time estimate */
  timeEstimate: string;
}

export interface SimilarIncident {
  /** Incident ID */
  id: string;
  /** Description */
  description: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** Resolution that worked */
  resolution?: string;
  /** Time to resolve */
  timeToResolve?: string;
}

export interface ImpactAssessment {
  /** Services impacted */
  services: string[];
  /** Users affected (estimate) */
  usersAffected: number;
  /** Business impact level */
  businessImpact: 'critical' | 'high' | 'medium' | 'low';
  /** Financial impact estimate */
  estimatedCost?: string;
  /** SLA breach risk */
  slaBreachRisk: number;
}

// ============================================================================
// DOMAIN DEFINITION
// ============================================================================

/**
 * Incident Diagnosis Domain
 *
 * Uses **Claude LLM** to diagnose production incidents intelligently.
 */
export const incidentDiagnosisDomain = {
  name: 'incident-diagnose' as const,
  description: 'Diagnose production incidents with Claude LLM',
  cognitiveAnalog: 'medical diagnosis (symptom → diagnosis → treatment)',
  requires: ['claudeLLM', 'causalDAG', 'logAggregator'] as const,

  /**
   * Execute incident diagnosis
   */
  async execute(ctx: ActionDomainContext): Promise<ActionDomainResult> {
    const request = ctx.input as IncidentDiagnosisRequest;

    // 1. Analyze incident with Claude or fallback
    const diagnosis = request.anthropicApiKey
      ? await diagnoseWithClaude(request, ctx)
      : await diagnoseWithHeuristics(request, ctx);

    // 2. Find similar past incidents
    const similarIncidents = await findSimilarIncidents(request, ctx);

    // 3. Assess impact
    const impact = assessImpact(request, diagnosis.rootCauses);

    // 4. Estimate time to resolve
    const estimatedTimeToResolve = estimateTimeToResolve(
      diagnosis.rootCauses,
      similarIncidents
    );

    // 5. Build result
    const result: IncidentDiagnosisResult = {
      rootCauses: diagnosis.rootCauses,
      diagnosis: diagnosis.summary,
      remediationSteps: diagnosis.remediationSteps,
      similarIncidents,
      impact,
      diagnosticConfidence: diagnosis.confidence,
      claudePowered: diagnosis.claudePowered,
      estimatedTimeToResolve,
    };

    // 6. Extract interventions
    const interventions = extractInterventions(result);

    return {
      type: 'incident-diagnose',
      data: result,
      confidence: result.diagnosticConfidence,
      narrative: formatNarrative(result, request),
      interventions,
      evidence: [
        {
          type: 'root_cause_analysis',
          description: `Identified ${result.rootCauses.length} root causes`,
          weight: 1.0,
        },
        {
          type: 'claude_diagnosis',
          description: result.claudePowered
            ? 'Diagnosis powered by Claude LLM for maximum accuracy'
            : 'Diagnosis using heuristics',
          weight: result.claudePowered ? 1.0 : 0.6,
        },
        {
          type: 'impact_assessment',
          description: `${result.impact.businessImpact} business impact, ${result.impact.usersAffected} users affected`,
          weight: 0.9,
        },
      ],
    };
  },
};

// ============================================================================
// CLAUDE LLM DIAGNOSIS
// ============================================================================

interface DiagnosisResult {
  rootCauses: RootCause[];
  summary: string;
  remediationSteps: RemediationStep[];
  confidence: number;
  claudePowered: boolean;
}

/**
 * Diagnose incident using Claude LLM
 */
async function diagnoseWithClaude(
  request: IncidentDiagnosisRequest,
  ctx: ActionDomainContext
): Promise<DiagnosisResult> {
  const prompt = `You are an expert Site Reliability Engineer diagnosing a production incident. Analyze the following incident and provide a comprehensive diagnosis.

## Incident Details:
**Description:** ${request.description}
**Severity:** ${request.severity || 'unknown'}
**Timestamp:** ${request.timestamp || 'unknown'}
**Affected Services:** ${request.affectedServices?.join(', ') || 'unknown'}

${request.logs ? `## Error Logs:\n${request.logs.slice(0, 10).join('\n')}\n` : ''}
${request.stackTrace ? `## Stack Trace:\n${request.stackTrace}\n` : ''}
${request.metrics ? `## Metrics:\n${JSON.stringify(request.metrics, null, 2)}\n` : ''}

## Required Analysis:
1. **Root Causes**: Identify all possible root causes with likelihood scores
2. **Evidence**: List evidence supporting each root cause
3. **Diagnosis**: Provide a clear diagnosis summary
4. **Remediation**: Step-by-step remediation plan
5. **Confidence**: Rate your diagnostic confidence (0-100)

**Output Format (JSON):**
\`\`\`json
{
  "rootCauses": [
    {
      "type": "code-bug",
      "description": "Null pointer exception in payment service",
      "evidence": ["Stack trace shows NPE", "Logs indicate missing validation"],
      "likelihood": 0.9,
      "component": "payment-service"
    }
  ],
  "diagnosis": "Summary of the incident and root cause",
  "remediationSteps": [
    {
      "step": 1,
      "action": "Rollback to previous version",
      "command": "kubectl rollout undo deployment/payment-service",
      "expectedOutcome": "Service restored to stable state",
      "priority": "immediate",
      "timeEstimate": "5 minutes"
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
        rootCauses: data.rootCauses || [],
        summary: data.diagnosis || '',
        remediationSteps: data.remediationSteps || [],
        confidence: (data.confidence || 70) / 100,
        claudePowered: true,
      };
    }

    // Fallback if no JSON found
    return diagnoseWithHeuristics(request, ctx);
  } catch (error) {
    console.warn('Claude diagnosis failed, using fallback:', error);
    return diagnoseWithHeuristics(request, ctx);
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
// HEURISTIC DIAGNOSIS (FALLBACK)
// ============================================================================

/**
 * Diagnose using heuristics
 */
async function diagnoseWithHeuristics(
  request: IncidentDiagnosisRequest,
  ctx: ActionDomainContext
): Promise<DiagnosisResult> {
  const rootCauses: RootCause[] = [];
  const remediationSteps: RemediationStep[] = [];

  // Analyze stack trace
  if (request.stackTrace) {
    if (request.stackTrace.includes('NullPointerException') || request.stackTrace.includes('Cannot read property')) {
      rootCauses.push({
        type: 'code-bug',
        description: 'Null reference error detected',
        evidence: ['Stack trace shows null reference'],
        likelihood: 0.8,
        component: request.affectedServices?.[0] || 'unknown',
      });
    }

    if (request.stackTrace.includes('OutOfMemoryError')) {
      rootCauses.push({
        type: 'resource-exhaustion',
        description: 'Memory exhaustion detected',
        evidence: ['OutOfMemoryError in stack trace'],
        likelihood: 0.9,
        component: request.affectedServices?.[0] || 'unknown',
      });
    }
  }

  // Analyze logs
  if (request.logs) {
    const errorLogs = request.logs.filter(log =>
      log.toLowerCase().includes('error') || log.toLowerCase().includes('exception')
    );

    if (errorLogs.length > 0) {
      rootCauses.push({
        type: 'code-bug',
        description: 'Multiple errors detected in logs',
        evidence: [`${errorLogs.length} error logs found`],
        likelihood: 0.7,
        component: request.affectedServices?.[0] || 'unknown',
      });
    }
  }

  // Analyze metrics
  if (request.metrics) {
    if (request.metrics.cpu_usage && request.metrics.cpu_usage > 90) {
      rootCauses.push({
        type: 'resource-exhaustion',
        description: 'High CPU usage detected',
        evidence: [`CPU usage at ${request.metrics.cpu_usage}%`],
        likelihood: 0.8,
        component: 'infrastructure',
      });
    }

    if (request.metrics.error_rate && request.metrics.error_rate > 0.05) {
      rootCauses.push({
        type: 'code-bug',
        description: 'Elevated error rate',
        evidence: [`Error rate at ${(request.metrics.error_rate * 100).toFixed(1)}%`],
        likelihood: 0.75,
        component: request.affectedServices?.[0] || 'unknown',
      });
    }
  }

  // Default cause if none identified
  if (rootCauses.length === 0) {
    rootCauses.push({
      type: 'code-bug',
      description: 'Unknown issue - requires manual investigation',
      evidence: ['Insufficient information for diagnosis'],
      likelihood: 0.5,
      component: request.affectedServices?.[0] || 'unknown',
    });
  }

  // Generate remediation steps
  const topCause = rootCauses.sort((a, b) => b.likelihood - a.likelihood)[0];

  if (topCause.type === 'resource-exhaustion') {
    remediationSteps.push({
      step: 1,
      action: 'Scale up resources',
      command: 'kubectl scale deployment --replicas=5',
      expectedOutcome: 'Increased capacity to handle load',
      priority: 'immediate',
      timeEstimate: '5 minutes',
    });
  } else if (topCause.type === 'code-bug') {
    remediationSteps.push({
      step: 1,
      action: 'Rollback to previous stable version',
      command: 'kubectl rollout undo deployment',
      expectedOutcome: 'Service restored to working state',
      priority: 'immediate',
      timeEstimate: '10 minutes',
    });
  }

  remediationSteps.push({
    step: remediationSteps.length + 1,
    action: 'Monitor metrics and logs',
    expectedOutcome: 'Verify issue is resolved',
    priority: 'high',
    timeEstimate: '15 minutes',
  });

  return {
    rootCauses,
    summary: `Diagnosed ${rootCauses.length} potential root cause(s). Primary cause: ${topCause.description}`,
    remediationSteps,
    confidence: 0.6,
    claudePowered: false,
  };
}

// ============================================================================
// SIMILAR INCIDENTS
// ============================================================================

/**
 * Find similar past incidents
 */
async function findSimilarIncidents(
  request: IncidentDiagnosisRequest,
  ctx: ActionDomainContext
): Promise<SimilarIncident[]> {
  // In production, this would query incident database
  // For now, return mock data
  const similarIncidents: SimilarIncident[] = [];

  // Check for keyword matches
  const keywords = request.description.toLowerCase().split(' ');

  if (keywords.includes('timeout') || keywords.includes('slow')) {
    similarIncidents.push({
      id: 'INC-2024-001',
      description: 'API timeout issues',
      similarity: 0.75,
      resolution: 'Increased timeout configuration and optimized query',
      timeToResolve: '2 hours',
    });
  }

  if (keywords.includes('memory') || keywords.includes('oom')) {
    similarIncidents.push({
      id: 'INC-2024-002',
      description: 'Out of memory errors',
      similarity: 0.8,
      resolution: 'Increased heap size and fixed memory leak',
      timeToResolve: '4 hours',
    });
  }

  return similarIncidents;
}

// ============================================================================
// IMPACT ASSESSMENT
// ============================================================================

/**
 * Assess incident impact
 */
function assessImpact(
  request: IncidentDiagnosisRequest,
  rootCauses: RootCause[]
): ImpactAssessment {
  const services = request.affectedServices || [];

  // Estimate users affected based on severity
  let usersAffected = 0;
  switch (request.severity) {
    case 'critical':
      usersAffected = 10000;
      break;
    case 'high':
      usersAffected = 1000;
      break;
    case 'medium':
      usersAffected = 100;
      break;
    default:
      usersAffected = 10;
  }

  // Determine business impact
  let businessImpact: ImpactAssessment['businessImpact'] = 'low';
  if (request.severity === 'critical' || services.length > 3) {
    businessImpact = 'critical';
  } else if (request.severity === 'high' || services.length > 1) {
    businessImpact = 'high';
  } else if (request.severity === 'medium') {
    businessImpact = 'medium';
  }

  // Calculate SLA breach risk
  const slaBreachRisk = request.severity === 'critical' ? 0.9 :
                         request.severity === 'high' ? 0.6 :
                         request.severity === 'medium' ? 0.3 : 0.1;

  return {
    services,
    usersAffected,
    businessImpact,
    slaBreachRisk,
    estimatedCost: businessImpact === 'critical' ? '$10,000+/hour' :
                   businessImpact === 'high' ? '$1,000+/hour' : undefined,
  };
}

/**
 * Estimate time to resolve
 */
function estimateTimeToResolve(
  rootCauses: RootCause[],
  similarIncidents: SimilarIncident[]
): string {
  // Use similar incidents if available
  if (similarIncidents.length > 0) {
    return similarIncidents[0].timeToResolve || '2-4 hours';
  }

  // Estimate based on root cause type
  const topCause = rootCauses[0];
  switch (topCause?.type) {
    case 'configuration':
      return '30 minutes - 1 hour';
    case 'code-bug':
      return '2-4 hours';
    case 'infrastructure':
      return '1-2 hours';
    case 'dependency':
      return '1-3 hours';
    case 'data-corruption':
      return '4-8 hours';
    case 'resource-exhaustion':
      return '15-30 minutes';
    default:
      return '2-4 hours';
  }
}

// ============================================================================
// INTERVENTION EXTRACTION
// ============================================================================

/**
 * Extract interventions from diagnosis
 */
function extractInterventions(result: IncidentDiagnosisResult): any[] {
  const interventions: any[] = [];

  // Critical impact = immediate intervention
  if (result.impact.businessImpact === 'critical') {
    interventions.push({
      action: 'Execute immediate remediation steps',
      targetDomains: ['incident-response'],
      confidence: 0.95,
      owner: 'on-call-engineer',
      priority: 'critical',
    });
  }

  // High likelihood root cause = targeted intervention
  const highLikelihoodCauses = result.rootCauses.filter(rc => rc.likelihood > 0.8);
  if (highLikelihoodCauses.length > 0) {
    interventions.push({
      action: `Address high-likelihood root causes: ${highLikelihoodCauses.map(c => c.type).join(', ')}`,
      targetDomains: ['engineering'],
      confidence: 0.9,
      owner: 'engineering',
      priority: 'high',
    });
  }

  return interventions;
}

// ============================================================================
// NARRATIVE FORMATTING
// ============================================================================

/**
 * Format diagnosis as narrative
 */
function formatNarrative(
  result: IncidentDiagnosisResult,
  request: IncidentDiagnosisRequest
): string {
  const claudeUsed = result.claudePowered ? '**Claude-powered**' : 'Heuristic-based';

  let narrative = `${claudeUsed} incident diagnosis. `;
  narrative += `Identified ${result.rootCauses.length} root cause(s). `;
  narrative += `Top cause: ${result.rootCauses[0]?.description || 'unknown'} `;
  narrative += `(${Math.round(result.rootCauses[0]?.likelihood * 100 || 0)}% likelihood). `;
  narrative += `Impact: ${result.impact.businessImpact}, `;
  narrative += `${result.impact.usersAffected} users affected. `;
  narrative += `ETA to resolve: ${result.estimatedTimeToResolve}. `;
  narrative += `${result.remediationSteps.length} remediation step(s) provided.`;

  return narrative;
}
