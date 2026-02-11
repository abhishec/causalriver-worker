/**
 * Engineering Agent - CTO-Level Technology & Engineering Intelligence
 *
 * Goal-directed autonomous agent for engineering intelligence.
 * Owns engineering velocity, system reliability, deployment health, tech debt, and team capacity.
 * Uses ReAct loop with tool use and memory integration.
 *
 * Part of Phase 11.5: Complete Domain Agent Coverage
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// ENGINEERING AGENT CONFIGURATION
// ============================================================================

const ENGINEERING_AGENT_GOAL = `As CTO / VP Engineering, your mission is to ensure engineering velocity, system reliability, and technical excellence.

IMMEDIATE PRIORITIES:
1. Assess engineering velocity trends - sprint completion rates and throughput
2. Review system reliability - incidents, MTTR, uptime, and SLA compliance
3. Evaluate deployment health - deployment frequency, change failure rate (DORA metrics)
4. Identify tech debt hotspots that risk feature delivery or system stability
5. Search memory for engineering patterns and incident root cause trends

OUTPUT REQUIREMENTS:
- Engineering velocity dashboard: sprint throughput, cycle time, completion rates
- Reliability report: incidents, MTTR, uptime %, SLA status
- DORA metrics: deployment frequency, lead time, change failure rate, MTTR
- Tech debt assessment: critical items blocking feature delivery
- Team capacity analysis: utilization, bottlenecks, hiring needs
- Recommended engineering actions with owners and deadlines

CRITICAL RULE: Engineering metrics must always be connected to business impact. A slow sprint isn't just a velocity issue - it's a revenue risk if features are delayed.`;

function buildEngineeringSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.engineering;

  return `${persona.identity}

## Your Role
${persona.role}

## Priorities (in order)
${persona.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Cross-Domain Awareness
${persona.crossDomainAwareness.map(c => `- ${c}`).join('\n')}

## Voice & Style
${persona.voice}

## CFO-Level Metrics You Track
${persona.cfoLevelMetrics?.map(m => `- ${m}`).join('\n') || ''}

## Behavioral Guardrails
${persona.behavioralGuardrails.map(g => `- ${g}`).join('\n')}

## Output Format
Always structure your analysis with:
1. **Velocity Health** - Sprint completion, throughput trends, cycle time
2. **Reliability Status** - Incidents, MTTR, uptime, SLA compliance
3. **Deployment Health** - DORA metrics and deployment pipeline status
4. **Tech Debt & Risks** - Critical items with business impact
5. **Recommended Actions** - Specific engineering actions with owners

IMPORTANT: Every engineering metric must be tied to business impact. Translate technical health into revenue, client, and delivery implications.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface EngineeringAgentInput {
  // Engineering-specific data
  sprints?: any[];
  incidents?: any[];
  deployments?: any[];
  techDebtItems?: any[];
  teamCapacity?: any[];
  // Cross-domain context
  productFeatures?: any[];
  vpProductDelayAnalysis?: any;
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runEngineeringAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: EngineeringAgentInput
): Promise<AgentResult> {
  const now = new Date();

  // Build compact initial context from available data
  const compactContext = {
    summary: {
      // Sprint metrics
      activeSprints: contextData.sprints?.filter((s: any) => s.status === 'active').length || 0,
      recentIncidents: contextData.incidents?.filter((i: any) => {
        const created = new Date(i.created_at || i.timestamp);
        const daysSince = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 7;
      }).length || 0,
      recentDeployments: contextData.deployments?.filter((d: any) => {
        const created = new Date(d.deployed_at || d.created_at);
        const daysSince = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 7;
      }).length || 0,
      techDebtCount: contextData.techDebtItems?.length || 0,
      timestamp: now.toISOString()
    },
    // Recent incidents requiring attention
    recentIncidents: (contextData.incidents || [])
      .sort((a: any, b: any) => new Date(b.created_at || b.timestamp).getTime() - new Date(a.created_at || a.timestamp).getTime())
      .slice(0, 10)
      .map((i: any) => ({
        id: i.id,
        title: i.title || i.summary,
        severity: i.severity,
        status: i.status,
        createdAt: i.created_at || i.timestamp,
        resolvedAt: i.resolved_at,
        mttrMinutes: i.resolved_at && i.created_at
          ? Math.ceil((new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / (1000 * 60))
          : null
      })),
    // Tech debt items ranked by severity
    criticalTechDebt: (contextData.techDebtItems || [])
      .filter((t: any) => t.priority === 'critical' || t.priority === 'high')
      .slice(0, 10)
      .map((t: any) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        impact: t.business_impact || t.impact,
        estimatedEffort: t.estimated_effort
      })),
    // Product feature delays (engineering dependency)
    featureDelays: contextData.vpProductDelayAnalysis ? {
      delayedCount: contextData.vpProductDelayAnalysis.delayedFeaturesCount,
      atRiskCount: contextData.vpProductDelayAnalysis.featuresAtRiskCount,
      arrAtRisk: contextData.vpProductDelayAnalysis.totalArrAtRisk
    } : null
  };

  // v11.5.0: Inject metric knowledge and brain context
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: ENGINEERING_AGENT_GOAL,
    agent: {
      domain: 'engineering',
      role: DOMAIN_PERSONAS.engineering.role,
      systemPrompt: buildEngineeringSystemPrompt(),
      tools: getToolsForDomain('engineering')
    },
    initialContext: JSON.stringify(enrichedContext),
    supabase,
    anthropicApiKey,
    organizationId,
    maxIterations: 4,
    reflectionEnabled: true,
    memoryEnabled: true,
    timeoutMs: 35000
  });
}

export default runEngineeringAgent;
