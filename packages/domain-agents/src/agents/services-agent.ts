/**
 * Services Agent - Delivery & Implementation Intelligence
 * 
 * Goal-directed autonomous agent for services delivery.
 * Owns project health, milestones, and resource utilization.
 * Uses ReAct loop with tool use and memory integration.
 * 
 * Part of Phase 8.2: Enterprise AI Agent Architecture
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// SERVICES AGENT CONFIGURATION
// ============================================================================

const SERVICES_AGENT_GOAL = `As VP Services, your mission is to ensure successful project delivery and client implementation.

CRITICAL CONTEXT: You own the client relationship DURING implementation. CS takes over POST go-live.

IMMEDIATE PRIORITIES:
1. Identify projects with Red or Yellow health status
2. Analyze milestone slippage and schedule risks
3. Review resource utilization and capacity constraints
4. Create project actions for at-risk deliverables
5. Connect delivery delays to downstream revenue recognition

OUTPUT REQUIREMENTS:
- Project health summary with RAG status breakdown
- At-risk milestones with impact assessment
- Resource utilization and bottleneck identification
- Revenue recognition risks from delayed go-lives

SUCCESS METRIC: All projects have clear delivery paths with no surprise delays.`;

function buildServicesSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.services;
  
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
1. **Project Health** - RAG status distribution and trends
2. **At-Risk Milestones** - Critical path items requiring attention
3. **Resource Analysis** - Capacity and allocation issues
4. **Revenue Impact** - Delivery delays affecting recognition

IMPORTANT: Connect delivery to revenue. A delayed go-live = delayed revenue recognition = cash impact.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface ServicesAgentInput {
  projects?: any[];
  milestones?: any[];
  resources?: any[];
  timesheets?: any[];
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runServicesAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: ServicesAgentInput
): Promise<AgentResult> {
  const now = new Date();
  
  // Calculate project health distribution
  const activeProjects = contextData.projects?.filter((p: any) => 
    p.status === 'active' || p.status === 'in_progress'
  ) || [];
  
  const projectsByHealth = {
    red: activeProjects.filter((p: any) => p.health === 'Red' || p.health_status === 'Red'),
    yellow: activeProjects.filter((p: any) => p.health === 'Yellow' || p.health_status === 'Yellow'),
    green: activeProjects.filter((p: any) => p.health === 'Green' || p.health_status === 'Green')
  };

  // Identify at-risk milestones (overdue or due in next 7 days)
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const atRiskMilestones = contextData.milestones?.filter((m: any) => {
    if (m.status === 'completed') return false;
    const dueDate = m.due_date ? new Date(m.due_date) : null;
    return dueDate && (dueDate < now || dueDate <= sevenDaysFromNow);
  }) || [];

  // Calculate revenue at risk from delayed projects
  const revenueAtRisk = projectsByHealth.red.reduce((sum: number, p: any) => 
    sum + (p.contract_value || p.project_value || 0), 0);

  const compactContext = {
    summary: {
      totalActiveProjects: activeProjects.length,
      redProjects: projectsByHealth.red.length,
      yellowProjects: projectsByHealth.yellow.length,
      greenProjects: projectsByHealth.green.length,
      atRiskMilestones: atRiskMilestones.length,
      revenueAtRisk,
      timestamp: new Date().toISOString()
    },
    // Red/Yellow projects requiring attention
    atRiskProjects: [...projectsByHealth.red, ...projectsByHealth.yellow]
      .slice(0, 15)
      .map((p: any) => ({
        id: p.id,
        name: p.project_name || p.name,
        clientName: p.client_name || p.clients?.name,
        health: p.health || p.health_status,
        value: p.contract_value || p.project_value,
        goLiveDate: p.go_live_date || p.end_date,
        daysRemaining: p.go_live_date ? 
          Math.ceil((new Date(p.go_live_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
        riskFactors: p.risk_factors || []
      })),
    // Critical milestones
    criticalMilestones: atRiskMilestones.slice(0, 10).map((m: any) => ({
      id: m.id,
      name: m.milestone_name || m.name,
      projectId: m.project_id,
      dueDate: m.due_date,
      isOverdue: new Date(m.due_date) < now,
      daysOverdue: new Date(m.due_date) < now ? 
        Math.ceil((now.getTime() - new Date(m.due_date).getTime()) / (1000 * 60 * 60 * 24)) : 0
    })),
    // Resource utilization (if available)
    resourceUtilization: contextData.resources?.slice(0, 10).map((r: any) => ({
      name: r.name || r.resource_name,
      utilization: r.utilization_pct || r.utilization,
      availableHours: r.available_hours
    })) || []
  };

  // v11.4.0: Inject metric knowledge and brain context
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: SERVICES_AGENT_GOAL,
    agent: {
      domain: 'services',
      role: DOMAIN_PERSONAS.services.role,
      systemPrompt: buildServicesSystemPrompt(),
      tools: getToolsForDomain('services')
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

export default runServicesAgent;
