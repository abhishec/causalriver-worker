/**
 * Revenue Agent - VP Sales Pipeline Intelligence
 * 
 * Goal-directed autonomous agent for new business pipeline.
 * Uses ReAct loop with tool use and memory integration.
 * 
 * Part of Phase 8.2: Enterprise AI Agent Architecture
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// REVENUE AGENT CONFIGURATION
// ============================================================================

const REVENUE_AGENT_GOAL = `As VP Sales, your mission is to analyze NEW LOGO pipeline health and identify deals at risk.

IMPORTANT: You focus ONLY on NEW BUSINESS deals. Expansions, renewals, and upsells belong to Account Management.

IMMEDIATE PRIORITIES:
1. Calculate pipeline coverage ratio (must be 3x or higher for quota attainment)
2. Identify stalled deals (>14 days in stage without activity)
3. Analyze deal velocity by stage - where are deals getting stuck?
4. Search memory for similar deal patterns and what drove wins
5. Create deal tasks for at-risk opportunities

OUTPUT REQUIREMENTS:
- Pipeline coverage ratio with weighted vs unweighted values
- List of stalled/at-risk deals with recommended next actions
- Stage conversion analysis with bottleneck identification
- Win/loss pattern insights from memory

SUCCESS METRIC: Every at-risk deal has a clear next action and owner.`;

function buildRevenueSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.revenue;
  
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
1. **Pipeline Health** - Coverage ratio, weighted value, forecast confidence
2. **At-Risk Deals** - Stalled opportunities with root cause analysis
3. **Stage Velocity** - Where deals are getting stuck and why
4. **Win Patterns** - What historical patterns predict success

IMPORTANT: Filter for NEW LOGO deals only. Expansions/renewals are AM territory.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface RevenueAgentInput {
  deals?: any[];
  quota?: number;
  winLossHistory?: any[];
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runRevenueAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: RevenueAgentInput
): Promise<AgentResult> {
  // Filter to new logo deals only
  const newLogoDeals = contextData.deals?.filter((d: any) => 
    d.category === 'new_logo' || d.deal_type === 'new_logo' || 
    (!d.category && !d.deal_type) // Default to new logo if not specified
  ) || [];

  // Calculate pipeline metrics
  const openDeals = newLogoDeals.filter((d: any) => 
    !['closed_won', 'closed_lost', 'churned'].includes(d.stage?.toLowerCase() || '')
  );
  const totalPipeline = openDeals.reduce((sum: number, d: any) => sum + (d.deal_value || d.amount || 0), 0);
  const weightedPipeline = openDeals.reduce((sum: number, d: any) => {
    const prob = d.probability || 0.5;
    return sum + ((d.deal_value || d.amount || 0) * prob);
  }, 0);

  // Identify stalled deals (>14 days since last activity)
  const now = new Date();
  const stalledDeals = openDeals.filter((d: any) => {
    const lastActivity = d.last_activity_date || d.updated_at;
    if (!lastActivity) return true;
    const daysSinceActivity = Math.ceil((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceActivity > 14;
  });

  const compactContext = {
    summary: {
      totalNewLogoDeals: newLogoDeals.length,
      openDeals: openDeals.length,
      totalPipeline,
      weightedPipeline,
      quota: contextData.quota || 0,
      pipelineCoverage: contextData.quota ? (totalPipeline / contextData.quota).toFixed(2) : 'N/A',
      stalledDealsCount: stalledDeals.length,
      timestamp: new Date().toISOString()
    },
    // Top deals by value
    topDeals: openDeals
      .sort((a: any, b: any) => (b.deal_value || b.amount || 0) - (a.deal_value || a.amount || 0))
      .slice(0, 15)
      .map((d: any) => ({
        id: d.id,
        name: d.deal_name || d.name,
        company: d.company_name,
        value: d.deal_value || d.amount,
        stage: d.stage,
        probability: d.probability,
        closeDate: d.expected_close_date || d.close_date,
        daysInStage: d.days_in_stage,
        owner: d.owner_name
      })),
    // Stalled deals requiring attention
    stalledDeals: stalledDeals.slice(0, 10).map((d: any) => ({
      id: d.id,
      name: d.deal_name || d.name,
      company: d.company_name,
      value: d.deal_value || d.amount,
      stage: d.stage,
      lastActivity: d.last_activity_date || d.updated_at
    })),
    // Stage distribution
    stageDistribution: openDeals.reduce((acc: any, d: any) => {
      const stage = d.stage || 'Unknown';
      if (!acc[stage]) acc[stage] = { count: 0, value: 0 };
      acc[stage].count++;
      acc[stage].value += (d.deal_value || d.amount || 0);
      return acc;
    }, {})
  };

  // v11.4.0: Inject metric knowledge and brain context
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: REVENUE_AGENT_GOAL,
    agent: {
      domain: 'revenue',
      role: DOMAIN_PERSONAS.revenue.role,
      systemPrompt: buildRevenueSystemPrompt(),
      tools: getToolsForDomain('revenue')
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

export default runRevenueAgent;
