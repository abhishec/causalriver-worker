/**
 * AM Agent - Account Management Intelligence
 * 
 * Goal-directed autonomous agent for existing client relationships.
 * Owns renewals, expansions, upsells, and client health.
 * Uses ReAct loop with tool use and memory integration.
 * 
 * Part of Phase 8.2: Enterprise AI Agent Architecture
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// AM AGENT CONFIGURATION
// ============================================================================

const AM_AGENT_GOAL = `As VP Account Management, your mission is to maximize Net Revenue Retention (NRR) through renewals and expansions.

CRITICAL OWNERSHIP: You are FIRST CONTACT for ALL existing client issues including collections!
- Invoice issues → You contact client first (not Finance)
- Health drops → You investigate root cause
- Renewals → 100% your territory
- Expansions/upsells → 100% your territory

IMMEDIATE PRIORITIES:
1. Identify renewals due in next 90 days with at-risk indicators
2. Calculate NRR trajectory (expansions - churn - downgrades)
3. Identify top expansion opportunities by white space analysis
4. Create renewal and expansion actions with clear owners
5. Review collection issues that need AM follow-up

OUTPUT REQUIREMENTS:
- Renewal pipeline with risk assessment and ARR at stake
- Expansion opportunities with estimated $ value
- NRR components breakdown
- Client engagement gaps requiring attention

SUCCESS METRIC: NRR > 100% means you're growing the existing base.`;

function buildAMSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS['account-management'];
  
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
1. **Renewal Pipeline** - Upcoming renewals with risk/opportunity indicators
2. **Expansion Opportunities** - White space analysis with $ potential
3. **NRR Health** - Components and trajectory
4. **Client Engagement** - Relationship health and gaps

IMPORTANT: You OWN the client relationship. Don't defer to other teams for client issues.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface AMAgentInput {
  clients?: any[];
  contracts?: any[];
  healthScores?: any[];
  expansionDeals?: any[];
  renewalDeals?: any[];
  invoices?: any[];
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runAMAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: AMAgentInput
): Promise<AgentResult> {
  // Calculate upcoming renewals (next 90 days)
  const now = new Date();
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  
  const upcomingRenewals = contextData.contracts?.filter((c: any) => {
    const endDate = c.end_date ? new Date(c.end_date) : null;
    return endDate && endDate <= ninetyDaysFromNow && endDate >= now && c.status === 'active';
  }) || [];

  // Get client health context
  const healthMap = contextData.healthScores?.reduce((map: any, hs: any) => {
    map[hs.client_id] = hs;
    return map;
  }, {}) || {};

  // Identify at-risk renewals
  const atRiskRenewals = upcomingRenewals.filter((c: any) => {
    const health = healthMap[c.client_id];
    return health && (health.health_status === 'Critical' || health.health_status === 'At Risk');
  });

  // Calculate expansion/renewal deals
  const expansionDeals = contextData.expansionDeals || 
    contextData.contracts?.filter((c: any) => c.category === 'expansion') || [];

  // Identify overdue invoices needing AM follow-up
  const overdueInvoices = contextData.invoices?.filter((i: any) => i.status === 'overdue') || [];

  const compactContext = {
    summary: {
      totalClients: contextData.clients?.length || 0,
      upcomingRenewals: upcomingRenewals.length,
      atRiskRenewals: atRiskRenewals.length,
      renewalARR: upcomingRenewals.reduce((sum: number, c: any) => sum + (c.contract_value || c.arr || 0), 0),
      atRiskARR: atRiskRenewals.reduce((sum: number, c: any) => sum + (c.contract_value || c.arr || 0), 0),
      expansionDeals: expansionDeals.length,
      overdueInvoicesNeedingFollowup: overdueInvoices.length,
      timestamp: new Date().toISOString()
    },
    // Renewals with enriched data
    renewalPipeline: upcomingRenewals.slice(0, 20).map((c: any) => {
      const client = contextData.clients?.find((cl: any) => cl.id === c.client_id);
      const health = healthMap[c.client_id];
      return {
        contractId: c.id,
        clientId: c.client_id,
        clientName: client?.name || 'Unknown',
        arr: c.contract_value || c.arr,
        endDate: c.end_date,
        daysToRenewal: Math.ceil((new Date(c.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        healthScore: health?.health_score,
        healthStatus: health?.health_status,
        isAtRisk: health?.health_status === 'Critical' || health?.health_status === 'At Risk'
      };
    }).sort((a: any, b: any) => a.daysToRenewal - b.daysToRenewal),
    // Expansion opportunities
    expansionPipeline: expansionDeals.slice(0, 10).map((d: any) => ({
      id: d.id,
      clientName: d.company_name || d.client_name,
      value: d.deal_value || d.amount,
      stage: d.stage,
      type: d.category || 'expansion'
    })),
    // Collection items needing AM attention
    collectionFollowups: overdueInvoices.slice(0, 10).map((i: any) => ({
      invoiceId: i.id,
      clientName: i.clients?.name,
      amount: i.amount,
      daysOverdue: Math.ceil((now.getTime() - new Date(i.due_date).getTime()) / (1000 * 60 * 60 * 24))
    }))
  };

  // v11.4.0: Inject metric knowledge and brain context
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: AM_AGENT_GOAL,
    agent: {
      domain: 'account-management',
      role: DOMAIN_PERSONAS['account-management'].role,
      systemPrompt: buildAMSystemPrompt(),
      tools: getToolsForDomain('account-management')
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

export default runAMAgent;
