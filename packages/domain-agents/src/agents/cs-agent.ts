/**
 * CS Agent - Customer Success Health & Churn Analysis
 * 
 * Goal-directed autonomous agent for customer success intelligence.
 * Uses ReAct loop with tool use and memory integration.
 * 
 * Part of Phase 8.2: Enterprise AI Agent Architecture
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// CS AGENT CONFIGURATION
// ============================================================================

const CS_AGENT_GOAL = `As VP Customer Success, your mission is to analyze client health and identify churn risks.

IMMEDIATE PRIORITIES:
1. Identify all clients in "Critical" or "At Risk" health status
2. For each at-risk client, analyze root causes (NPS, usage, support tickets)
3. Search memory for similar churn patterns and what interventions worked
4. Create CS intervention actions with clear next steps
5. Calculate total ARR at risk from churn

OUTPUT REQUIREMENTS:
- List each at-risk client with health score, ARR, and primary risk factors
- Recommend specific interventions based on what worked historically
- Quantify total ARR at risk and churn probability
- Identify early warning signals before they become critical

SUCCESS METRIC: Every at-risk client has a clear intervention plan with owner and timeline.`;

function buildCSSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.cs;
  
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
1. **Risk Triage** - Clients ranked by ARR at risk × churn probability
2. **Root Cause Analysis** - Why each client is at risk
3. **Intervention Plans** - Specific actions with owners and expected outcomes
4. **Historical Patterns** - What similar situations taught us

IMPORTANT: Use your tools to actively query health data and create interventions. Don't just analyze - ACT on what you find.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface CSAgentInput {
  clients?: any[];
  healthScores?: any[];
  npsScores?: any[];
  usageData?: any[];
  supportTickets?: any[];
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runCSAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: CSAgentInput
): Promise<AgentResult> {
  // Build compact initial context
  const compactContext = {
    summary: {
      totalClients: contextData.clients?.length || 0,
      criticalClients: contextData.healthScores?.filter((hs: any) => hs.health_status === 'Critical').length || 0,
      atRiskClients: contextData.healthScores?.filter((hs: any) => hs.health_status === 'At Risk').length || 0,
      avgNPS: contextData.npsScores?.length ? 
        (contextData.npsScores.reduce((sum: number, n: any) => sum + (n.score || 0), 0) / contextData.npsScores.length).toFixed(1) : 'N/A',
      timestamp: new Date().toISOString()
    },
    // Include at-risk and critical clients
    atRiskClients: contextData.healthScores
      ?.filter((hs: any) => hs.health_status === 'Critical' || hs.health_status === 'At Risk')
      .map((hs: any) => {
        const client = contextData.clients?.find((c: any) => c.id === hs.client_id);
        const latestNPS = contextData.npsScores?.find((n: any) => n.client_id === hs.client_id);
        return {
          clientId: hs.client_id,
          clientName: client?.name || 'Unknown',
          arr: client?.arr || 0,
          healthScore: hs.health_score,
          healthStatus: hs.health_status,
          latestNPS: latestNPS?.score,
          riskFactors: hs.risk_factors || []
        };
      })
      .sort((a: any, b: any) => (b.arr || 0) - (a.arr || 0))
      .slice(0, 20) || [],
    // NPS trend summary
    recentNPSDeclines: contextData.npsScores
      ?.filter((n: any) => n.score_change && n.score_change < -2)
      .slice(0, 10) || []
  };

  // v11.4.0: Inject metric knowledge and brain context
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: CS_AGENT_GOAL,
    agent: {
      domain: 'cs',
      role: DOMAIN_PERSONAS.cs.role,
      systemPrompt: buildCSSystemPrompt(),
      tools: getToolsForDomain('cs')
    },
    initialContext: JSON.stringify(enrichedContext),
    supabase,
    anthropicApiKey,
    organizationId,
    maxIterations: 4,  // v12.0.0: Reduced to 4 for faster synthesis (forces completion on iteration 3)
    reflectionEnabled: true,
    memoryEnabled: true,
    timeoutMs: 35000   // v12.0.0: Reduced from 55s to 35s for tighter batch timing
  });
}

export default runCSAgent;
