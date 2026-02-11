/**
 * Finance Agent - CFO-Level Financial Analysis
 * 
 * Goal-directed autonomous agent for financial intelligence.
 * Uses ReAct loop with tool use and memory integration.
 * 
 * Part of Phase 8.2: Enterprise AI Agent Architecture
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// FINANCE AGENT CONFIGURATION
// ============================================================================

const FINANCE_AGENT_GOAL = `As VP Finance / CFO, your mission is to analyze the organization's financial health and collections posture.

IMMEDIATE PRIORITIES:
1. Identify the TOP 5 collection priorities based on overdue amount and days overdue
2. For each priority, assess the client's payment history and health score
3. Create collection actions assigned to Account Managers (AM contacts first, CFO escalates)
4. Search memory for similar payment patterns that worked before
5. Calculate DSO impact and cash runway implications

OUTPUT REQUIREMENTS:
- List each overdue invoice with client name, amount, and days overdue
- Recommend specific collection actions with assigned owners
- Quantify total AR at risk and potential cash impact
- Identify any payment pattern anomalies

CRITICAL RULE: AM contacts client FIRST for collections. CFO only escalates after 2+ AM attempts or amount > $500K.`;

function buildFinanceSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.finance;
  
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
1. **Key Findings** - The most critical issues requiring attention
2. **Recommended Actions** - Specific next steps with owners and due dates
3. **Financial Impact** - Dollar amounts and days-to-action urgency
4. **Pattern Insights** - What memory/history tells us about similar situations

IMPORTANT: Use your tools to actively query data and create actions. Don't just analyze - ACT on what you find.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface FinanceAgentInput {
  invoices?: any[];
  clients?: any[];
  contracts?: any[];
  paymentHistory?: any[];
  healthScores?: any[];
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runFinanceAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: FinanceAgentInput
): Promise<AgentResult> {
  // Build compact initial context (limit data to avoid token bloat)
  const compactContext = {
    summary: {
      totalInvoices: contextData.invoices?.length || 0,
      overdueInvoices: contextData.invoices?.filter((i: any) => i.status === 'overdue').length || 0,
      totalOverdueAmount: contextData.invoices
        ?.filter((i: any) => i.status === 'overdue')
        .reduce((sum: number, i: any) => sum + (i.amount || 0), 0) || 0,
      clientCount: contextData.clients?.length || 0,
      timestamp: new Date().toISOString()
    },
    // Include top 30 overdue invoices by amount
    topOverdueInvoices: contextData.invoices
      ?.filter((i: any) => i.status === 'overdue')
      .sort((a: any, b: any) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 30)
      .map((i: any) => ({
        id: i.id,
        clientId: i.client_id,
        clientName: i.clients?.name || 'Unknown',
        amount: i.amount,
        dueDate: i.due_date,
        daysOverdue: Math.ceil((Date.now() - new Date(i.due_date).getTime()) / (1000 * 60 * 60 * 24))
      })) || [],
    // Include client health context
    clientHealthMap: contextData.healthScores?.reduce((map: any, hs: any) => {
      map[hs.client_id] = { score: hs.health_score, status: hs.health_status };
      return map;
    }, {}) || {}
  };

  // v11.4.0: Inject metric knowledge and brain context for VC/PE-grade analysis
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: FINANCE_AGENT_GOAL,
    agent: {
      domain: 'finance',
      role: DOMAIN_PERSONAS.finance.role,
      systemPrompt: buildFinanceSystemPrompt(),
      tools: getToolsForDomain('finance')
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

export default runFinanceAgent;
