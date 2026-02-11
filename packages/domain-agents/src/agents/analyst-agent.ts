/**
 * Analyst Agent - Chief Intelligence Analyst / Cross-Domain Pattern Discovery
 *
 * Goal-directed autonomous agent for cross-domain pattern discovery.
 * The "Sherlock Holmes" of business data - finds patterns humans miss.
 * Looks ACROSS all domains simultaneously for anomalies, correlations, and opportunities.
 * Uses ReAct loop with tool use and memory integration.
 *
 * Part of Phase 11.5: Complete Domain Agent Coverage
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// ANALYST AGENT CONFIGURATION
// ============================================================================

const ANALYST_AGENT_GOAL = `As Chief Intelligence Analyst, your mission is to discover NON-OBVIOUS patterns across all domains that humans would miss.

Unlike domain-specific VPs, you look ACROSS Finance, CS, Revenue, AM, Services, People, Product, and Marketing simultaneously. You find correlations no single domain would notice.

IMMEDIATE PRIORITIES:
1. Look for ANOMALIES - what deviates from expected patterns across any domain?
2. Discover OPPORTUNITIES - upsells, expansions, wins hiding in cross-domain data
3. Identify EARLY WARNINGS - small signals that predict big problems (multi-domain)
4. Map CAUSAL CHAINS - when X happens in domain A, what follows in domain B?
5. Search memory for historical patterns that match current cross-domain signals

OUTPUT REQUIREMENTS:
- Each discovery must include: specific client names, $ impact, confidence level, and causal explanation
- Only surface NON-OBVIOUS insights (dashboards already show the obvious)
- Rank discoveries by business impact ($ at risk or $ opportunity)
- Explain the causal chain behind each discovery
- Assign a confidence score (0-100%) to each finding

CRITICAL RULE: You are the pattern-finding engine. NEVER state the obvious. NEVER just describe data. ALWAYS explain WHY and what to DO about it.`;

function buildAnalystSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.analyst;

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
1. **Novel Discoveries** - Non-obvious patterns with confidence scores
2. **Causal Chains** - When X happens in domain A, Y follows in domain B
3. **Anomalies** - What deviates from expected, with root cause hypothesis
4. **Opportunities** - Hidden revenue or efficiency gains with $ quantification

IMPORTANT: You are the Sherlock Holmes of business data. If a dashboard already shows it, don't report it. Find what's HIDDEN.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface AnalystAgentInput {
  // Cross-domain summary data
  summary?: any;
  cfoAnalysis?: any;
  vpSalesAnalysis?: any;
  vpCSAnalysis?: any;
  vpAMAnalysis?: any;
  vpServicesAnalysis?: any;
  vpMarketingAnalysis?: any;
  vpPeopleAnalysis?: any;
  vpProductDelayAnalysis?: any;
  // Key operational data
  criticalClients?: any[];
  atRiskClients?: any[];
  overdueInvoices?: any[];
  topDeals?: any[];
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runAnalystAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: AnalystAgentInput
): Promise<AgentResult> {
  // The analyst gets a cross-domain view - compile signals from all domains
  const compactContext = {
    crossDomainSnapshot: {
      timestamp: new Date().toISOString(),
      // Organization-level summary
      orgSummary: contextData.summary || {},
      // Finance signals
      financeSignals: {
        cfoAnalysis: contextData.cfoAnalysis ? {
          overdueAmount: contextData.cfoAnalysis.overdueAmount,
          dso: contextData.cfoAnalysis.dso,
          cashRunway: contextData.cfoAnalysis.cashRunway,
          collectionEfficiency: contextData.cfoAnalysis.collectionEfficiency
        } : null,
        overdueInvoices: (contextData.overdueInvoices || []).slice(0, 10)
      },
      // CS signals
      csSignals: contextData.vpCSAnalysis ? {
        healthDistribution: contextData.vpCSAnalysis.healthDistribution,
        churnVelocity: contextData.vpCSAnalysis.churnVelocity,
        npsDistribution: contextData.vpCSAnalysis.npsDistribution,
        engagementGaps: contextData.vpCSAnalysis.engagementGaps
      } : null,
      // Revenue signals
      revenueSignals: contextData.vpSalesAnalysis ? {
        pipelineCoverage: contextData.vpSalesAnalysis.pipelineCoverage,
        winRates: contextData.vpSalesAnalysis.winRates,
        dealVelocity: contextData.vpSalesAnalysis.dealVelocity
      } : null,
      // AM signals
      amSignals: contextData.vpAMAnalysis ? {
        nrrComponents: contextData.vpAMAnalysis.nrrComponents,
        expansionVelocity: contextData.vpAMAnalysis.expansionVelocity,
        renewalRisk: contextData.vpAMAnalysis.renewalRisk
      } : null,
      // Services signals
      servicesSignals: contextData.vpServicesAnalysis ? {
        projectHealth: contextData.vpServicesAnalysis.projectHealth,
        milestoneVariance: contextData.vpServicesAnalysis.milestoneVariance,
        deliveryCapacity: contextData.vpServicesAnalysis.deliveryCapacity
      } : null,
      // Marketing signals
      marketingSignals: contextData.vpMarketingAnalysis ? {
        goalsAtRisk: contextData.vpMarketingAnalysis.goalsAtRiskCount,
        budgetUtilization: contextData.vpMarketingAnalysis.budgetUtilization,
        campaignCount: contextData.vpMarketingAnalysis.campaignCount
      } : null,
      // People signals
      peopleSignals: contextData.vpPeopleAnalysis ? {
        headcount: contextData.vpPeopleAnalysis.totalHeadcount,
        onboarding: contextData.vpPeopleAnalysis.onboardingCount,
        exiting: contextData.vpPeopleAnalysis.exitingCount,
        attritionRisk: contextData.vpPeopleAnalysis.attritionRisk,
        tenureDistribution: contextData.vpPeopleAnalysis.tenureDistribution
      } : null,
      // Product signals
      productSignals: contextData.vpProductDelayAnalysis ? {
        delayedFeatures: contextData.vpProductDelayAnalysis.delayedFeaturesCount,
        clientsAffected: contextData.vpProductDelayAnalysis.clientsAffectedCount,
        arrAtRisk: contextData.vpProductDelayAnalysis.totalArrAtRisk
      } : null
    },
    // High-priority entities across domains
    criticalClients: (contextData.criticalClients || []).slice(0, 10),
    atRiskClients: (contextData.atRiskClients || []).slice(0, 10),
    topDeals: (contextData.topDeals || []).slice(0, 10)
  };

  // v11.5.0: Inject metric knowledge and brain context
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: ANALYST_AGENT_GOAL,
    agent: {
      domain: 'analyst',
      role: DOMAIN_PERSONAS.analyst.role,
      systemPrompt: buildAnalystSystemPrompt(),
      tools: getToolsForDomain('analyst')
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

export default runAnalystAgent;
