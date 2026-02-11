/**
 * Product Agent - VP Product Level Lifecycle & Roadmap Intelligence
 *
 * Goal-directed autonomous agent for product intelligence.
 * Owns feature roadmap, version lifecycle, adoption tracking, and delay impact analysis.
 * Uses ReAct loop with tool use and memory integration.
 *
 * Part of Phase 11.5: Complete Domain Agent Coverage
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// PRODUCT AGENT CONFIGURATION
// ============================================================================

const PRODUCT_AGENT_GOAL = `As VP Product, your mission is to manage the product lifecycle, ensure roadmap delivery, and maximize feature adoption.

IMMEDIATE PRIORITIES:
1. Identify DELAYED features - any feature past its release date that isn't shipped
2. For each delayed feature, calculate client impact: which clients are affected and their ARR
3. Identify features AT RISK - approaching release date but still in planning/development
4. Assess version adoption: what % of clients are on current vs. deprecated versions
5. Search memory for patterns in feature delays and their downstream impacts

OUTPUT REQUIREMENTS:
- Feature delay dashboard: delayed features with days overdue, affected clients, ARR at risk
- At-risk features approaching deadlines with status assessment
- Version currency analysis: clients on current vs. deprecated versions with migration urgency
- Module penetration analysis: cross-sell opportunities from underutilized modules
- Recommended product actions: escalate delays, communicate to clients, reprioritize roadmap

CRITICAL RULE: Feature delays have cascading impacts on Services (blocked implementations), AM (blocked expansion), and CS (disappointed clients). Always quantify the downstream impact.`;

function buildProductSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.product;

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
1. **Feature Delay Impact** - Delayed features with client and ARR impact
2. **At-Risk Features** - Approaching deadlines, status assessment
3. **Version Health** - Adoption rates, deprecated exposure
4. **Recommended Actions** - Escalations, communications, reprioritizations

IMPORTANT: Feature delays are never just a product issue - they cascade into Services, AM, CS, and Revenue. Always quantify the cross-domain impact.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface ProductAgentInput {
  productFeatures?: any[];
  vpProductDelayAnalysis?: any;
  clients?: any[];
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runProductAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: ProductAgentInput
): Promise<AgentResult> {
  const features = contextData.productFeatures || [];
  const analysis = contextData.vpProductDelayAnalysis || {};
  const now = new Date();

  // Classify features
  const delayedFeatures = features.filter((f: any) => {
    if (!f.releaseDate && !f.release_date) return false;
    const releaseDate = new Date(f.releaseDate || f.release_date);
    return releaseDate < now && f.status !== 'released' && f.status !== 'deployed';
  });

  const atRiskFeatures = features.filter((f: any) => {
    if (!f.releaseDate && !f.release_date) return false;
    const releaseDate = new Date(f.releaseDate || f.release_date);
    const daysUntil = Math.floor((releaseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil > 0 && daysUntil <= 14 &&
           (f.status === 'planning' || f.status === 'in_development');
  });

  // Build compact initial context
  const compactContext = {
    summary: {
      totalFeaturesTracked: analysis.totalFeaturesTracked || features.length,
      delayedFeaturesCount: analysis.delayedFeaturesCount || delayedFeatures.length,
      featuresAtRiskCount: analysis.featuresAtRiskCount || atRiskFeatures.length,
      clientsAffectedCount: analysis.clientsAffectedCount || 0,
      totalArrAtRisk: analysis.totalArrAtRisk || 0,
      timestamp: now.toISOString()
    },
    // Delayed features with client impact
    delayedFeatures: (analysis.delayedFeatures || delayedFeatures.map((f: any) => ({
      id: f.id,
      featureNumber: f.featureNumber || f.feature_number,
      name: f.name,
      status: f.status,
      theme: f.theme,
      priority: f.priority,
      releaseDate: f.releaseDate || f.release_date,
      daysOverdue: Math.ceil((now.getTime() - new Date(f.releaseDate || f.release_date).getTime()) / (1000 * 60 * 60 * 24)),
      clientName: f.clientName || f.client_name,
      clientArr: f.clientArr || f.client_arr || 0,
      connectedClientsCount: f.connectedClientsCount || 0
    }))).slice(0, 15),
    // At-risk features (approaching deadline)
    atRiskFeatures: (analysis.featuresAtRisk || atRiskFeatures.map((f: any) => ({
      id: f.id,
      featureNumber: f.featureNumber || f.feature_number,
      name: f.name,
      status: f.status,
      releaseDate: f.releaseDate || f.release_date,
      daysUntilDeadline: Math.floor((new Date(f.releaseDate || f.release_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      clientName: f.clientName || f.client_name
    }))).slice(0, 10),
    // Clients affected by delays (from pre-analysis if available)
    clientsAffectedByDelays: analysis.clientsAffected || [],
    // Feature status distribution
    featureStatusDistribution: features.reduce((acc: Record<string, number>, f: any) => {
      const status = f.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}),
    // Feature themes distribution
    featureThemes: features.reduce((acc: Record<string, number>, f: any) => {
      const theme = f.theme || 'Untagged';
      acc[theme] = (acc[theme] || 0) + 1;
      return acc;
    }, {})
  };

  // v11.5.0: Inject metric knowledge and brain context
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: PRODUCT_AGENT_GOAL,
    agent: {
      domain: 'product',
      role: DOMAIN_PERSONAS.product.role,
      systemPrompt: buildProductSystemPrompt(),
      tools: getToolsForDomain('product')
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

export default runProductAgent;
