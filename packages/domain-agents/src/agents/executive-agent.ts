/**
 * Executive Agent - Cross-Domain Synthesis & Strategy
 * 
 * Goal-directed autonomous agent for executive intelligence.
 * Synthesizes outputs from all domain agents into strategic briefing.
 * Uses ReAct loop with memory integration for pattern detection.
 * 
 * Part of Phase 8.2: Enterprise AI Agent Architecture
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { MEMORY_TOOLS } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// EXECUTIVE AGENT CONFIGURATION
// ============================================================================

const EXECUTIVE_AGENT_GOAL = `As CEO/COO, your mission is to synthesize domain intelligence into a strategic executive briefing.

CONTEXT: You have received analysis from Finance, CS, Revenue, AM, and Services agents. Your job is to:
1. Connect the dots across domains that individual VPs might miss
2. Identify the TOP 3 strategic priorities for today
3. Surface cross-domain risks (e.g., delivery delay → renewal risk → cash impact)
4. Recommend board-level actions and owners

OUTPUT REQUIREMENTS:
- Executive Summary (2-3 sentences on overall business health)
- Top 3 Strategic Priorities with clear next actions
- Cross-Domain Risk Map (what connects across silos)
- Key Metrics Dashboard snapshot
- Board Attention Items (if any)

VOICE: Strategic, visionary, connecting dots. Speak in board-ready language.`;

function buildExecutiveSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.executive;
  
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
Structure your executive briefing as:
1. **Executive Summary** - 2-3 sentence business health assessment
2. **Today's Top 3 Priorities** - Most critical items requiring attention
3. **Cross-Domain Connections** - Risks/opportunities that span silos
4. **Key Metrics Snapshot** - The numbers that matter
5. **Board Items** - Issues requiring board visibility (if any)

IMPORTANT: Your value is in SYNTHESIS - connecting dots that domain leaders miss.`;
}

// Executive-specific tools for cross-domain analysis
const EXECUTIVE_TOOLS = [
  ...MEMORY_TOOLS,
  {
    name: 'detect_cross_domain_patterns',
    description: 'Analyze outputs from domain agents to find cross-domain patterns and risks',
    input_schema: {
      type: 'object' as const,
      properties: {
        focus_area: { 
          type: 'string', 
          description: 'Area to focus pattern detection on',
          enum: ['risk', 'opportunity', 'bottleneck', 'all']
        }
      }
    }
  },
  {
    name: 'generate_strategic_recommendation',
    description: 'Generate a board-level strategic recommendation based on cross-domain analysis',
    input_schema: {
      type: 'object' as const,
      properties: {
        issue: { type: 'string', description: 'The strategic issue to address' },
        domains_involved: { type: 'string', description: 'Comma-separated list of domains' }
      },
      required: ['issue']
    }
  }
];

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface DomainAgentOutput {
  domain: string;
  success: boolean;
  summary: string;
  keyFindings: any[];
  actionsCreated: number;
  alertsGenerated: number;
  toolsUsed: string[];
}

export interface ExecutiveAgentInput {
  domainOutputs: Record<string, DomainAgentOutput>;
  organizationMetrics: {
    totalARR?: number;
    nrr?: number;
    dso?: number;
    pipelineCoverage?: number;
    cashRunway?: number;
    activeGoals?: any[];
  };
  metricKnowledge?: string;
  nexusBrainContext?: string;
}

export async function runExecutiveAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: ExecutiveAgentInput
): Promise<AgentResult> {
  // Build synthesis context from domain outputs
  const domainSummaries = Object.entries(contextData.domainOutputs).map(([domain, output]) => ({
    domain,
    status: output.success ? 'completed' : 'failed',
    summary: output.summary,
    keyFindings: output.keyFindings?.slice(0, 5) || [],
    actionsCreated: output.actionsCreated,
    alertsGenerated: output.alertsGenerated
  }));

  // Calculate overall health indicators
  const totalActions = domainSummaries.reduce((sum, d) => sum + (d.actionsCreated || 0), 0);
  const totalAlerts = domainSummaries.reduce((sum, d) => sum + (d.alertsGenerated || 0), 0);
  const failedDomains = domainSummaries.filter(d => d.status === 'failed');

  const compactContext = {
    executiveDashboard: {
      timestamp: new Date().toISOString(),
      domainsCovered: domainSummaries.length,
      domainsSucceeded: domainSummaries.filter(d => d.status === 'completed').length,
      totalActionsCreated: totalActions,
      totalAlertsGenerated: totalAlerts
    },
    organizationMetrics: contextData.organizationMetrics,
    domainIntelligence: domainSummaries,
    failedDomains: failedDomains.map(d => d.domain),
    activeGoals: contextData.organizationMetrics.activeGoals?.slice(0, 5).map((g: any) => ({
      name: g.goal_name,
      status: g.status,
      progress: g.progress_percentage
    })) || []
  };

  // v11.4.0: Inject metric knowledge and brain context for VC/PE-grade executive synthesis
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: EXECUTIVE_AGENT_GOAL,
    agent: {
      domain: 'executive',
      role: DOMAIN_PERSONAS.executive.role,
      systemPrompt: buildExecutiveSystemPrompt(),
      tools: EXECUTIVE_TOOLS
    },
    initialContext: JSON.stringify(enrichedContext),
    supabase,
    anthropicApiKey,
    organizationId,
    maxIterations: 3, // Executive needs fewer iterations - synthesis focused
    reflectionEnabled: true,
    memoryEnabled: true,
    timeoutMs: 30000 // Faster timeout for synthesis
  });
}

export default runExecutiveAgent;
