/**
 * Marketing Agent - CMO-Level Demand Generation & Brand Intelligence
 *
 * Goal-directed autonomous agent for marketing intelligence.
 * Owns MQL generation, campaign performance, funnel health, and marketing ROI.
 * Uses ReAct loop with tool use and memory integration.
 *
 * Part of Phase 11.5: Complete Domain Agent Coverage
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// MARKETING AGENT CONFIGURATION
// ============================================================================

const MARKETING_AGENT_GOAL = `As VP Marketing / CMO, your mission is to drive growth through demand generation and ensure marketing ROI.

IMMEDIATE PRIORITIES:
1. Assess all active marketing goals - identify which are on-track vs. at-risk
2. Analyze campaign performance and budget utilization across active campaigns
3. Evaluate funnel conversion rates: Lead -> MQL -> SQL -> Opportunity
4. Identify top-performing and underperforming campaigns with ROI analysis
5. Search memory for campaign patterns that historically drove best conversion

OUTPUT REQUIREMENTS:
- Goal progress dashboard with at-risk goals highlighted and remediation plans
- Campaign performance ranked by ROI with budget reallocation recommendations
- Funnel health analysis with conversion drop-off points identified
- Pipeline contribution metrics (marketing-sourced vs. total pipeline)
- Budget utilization rate with forecast to end-of-period

CRITICAL RULE: Every campaign must have measurable outcomes. No vanity metrics - focus on pipeline contribution and MQL quality.`;

function buildMarketingSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.marketing;

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
1. **Goal Health** - Which marketing goals are on-track, at-risk, or blocked
2. **Campaign Performance** - Top/bottom campaigns with ROI and budget analysis
3. **Funnel Health** - Conversion rates and drop-off identification
4. **Pipeline Contribution** - Marketing-sourced pipeline vs. total

IMPORTANT: Use your tools to actively query data and surface insights. Connect marketing performance to pipeline and revenue impact.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface MarketingAgentInput {
  marketingGoals?: any[];
  campaigns?: any[];
  vpMarketingAnalysis?: any;
  deals?: any[];
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runMarketingAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: MarketingAgentInput
): Promise<AgentResult> {
  const goals = contextData.marketingGoals || [];
  const campaigns = contextData.campaigns || [];
  const analysis = contextData.vpMarketingAnalysis || {};

  // Build compact initial context
  const compactContext = {
    summary: {
      activeGoalCount: analysis.activeGoalCount || goals.filter((g: any) => g.status === 'Active').length,
      goalsAtRiskCount: analysis.goalsAtRiskCount || 0,
      campaignCount: analysis.campaignCount || campaigns.length,
      activeCampaignCount: analysis.activeCampaignCount || campaigns.filter((c: any) => c.status === 'Active').length,
      totalBudget: analysis.totalBudget || 0,
      totalSpent: analysis.totalSpent || 0,
      budgetUtilization: analysis.budgetUtilization || 0,
      timestamp: new Date().toISOString()
    },
    // Goals at risk (need immediate attention)
    goalsAtRisk: (analysis.goalsAtRisk || goals.filter((g: any) => {
      if (!g.targetValue || g.targetValue === 0) return false;
      const progress = ((g.currentValue || 0) / g.targetValue) * 100;
      return progress < 50;
    })).slice(0, 10),
    // Goal distribution by type
    goalsByType: analysis.goalsByType || {},
    // Active campaigns with performance data
    activeCampaigns: campaigns
      .filter((c: any) => c.status === 'Active')
      .slice(0, 15)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.campaignType || c.campaign_type,
        status: c.status,
        budget: c.budget || c.budget_allocated,
        spent: c.spent || c.budget_spent,
        roi: c.budget && c.budget > 0 ? Math.round(((c.revenue || 0) / c.budget) * 100) : 0,
        startDate: c.startDate || c.start_date,
        endDate: c.endDate || c.end_date
      })),
    // Pipeline contribution (from deals if available)
    pipelineContext: {
      totalDeals: contextData.deals?.length || 0,
      marketingSourced: contextData.deals?.filter((d: any) =>
        d.lead_source === 'marketing' || d.source === 'inbound'
      ).length || 0
    }
  };

  // v11.5.0: Inject metric knowledge and brain context for VC/PE-grade analysis
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: MARKETING_AGENT_GOAL,
    agent: {
      domain: 'marketing',
      role: DOMAIN_PERSONAS.marketing.role,
      systemPrompt: buildMarketingSystemPrompt(),
      tools: getToolsForDomain('marketing')
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

export default runMarketingAgent;
