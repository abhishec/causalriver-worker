/**
 * People Agent - CHRO-Level Talent & Workforce Intelligence
 *
 * Goal-directed autonomous agent for people/HR intelligence.
 * Owns talent acquisition, onboarding, retention, engagement, and workforce planning.
 * Uses ReAct loop with tool use and memory integration.
 *
 * Part of Phase 11.5: Complete Domain Agent Coverage
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runAgentLoop, type AgentResult } from "../../_shared/agent-loop.ts";
import { getToolsForDomain } from "../../_shared/tool-registry.ts";
import { DOMAIN_PERSONAS } from "../../_shared/domain-personas.ts";

// ============================================================================
// PEOPLE AGENT CONFIGURATION
// ============================================================================

const PEOPLE_AGENT_GOAL = `As VP People / CHRO, your mission is to ensure the organization has the right talent, at the right time, fully engaged and productive.

IMMEDIATE PRIORITIES:
1. Identify onboarding delays - employees in onboarding status > 30 days are at risk
2. Assess attrition risk - employees in notice period or exiting status need transition plans
3. Review headcount distribution across departments for resource gaps
4. Analyze tenure distribution for succession planning risks
5. Search memory for engagement patterns and retention strategies that worked

OUTPUT REQUIREMENTS:
- Onboarding health: who is onboarding, how long, any delays
- Attrition dashboard: who is exiting, which departments affected, knowledge transfer status
- Department headcount analysis with gap identification
- Tenure risk analysis: too many new hires (instability) or too many tenured (complacency)
- Recommended people actions with owners and timelines

CRITICAL RULE: Every people issue has a downstream operational impact. Always quantify the capacity and delivery risk.`;

function buildPeopleSystemPrompt(): string {
  const persona = DOMAIN_PERSONAS.people;

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
1. **Workforce Health** - Headcount, onboarding, attrition snapshot
2. **Risk Areas** - Onboarding delays, exits, engagement gaps
3. **Department Analysis** - Headcount distribution and capacity risks
4. **Recommended Actions** - Specific people actions with owners and deadlines

IMPORTANT: People issues directly impact delivery capacity, client satisfaction, and revenue. Always connect HR metrics to business impact.`;
}

// ============================================================================
// AGENT EXECUTION
// ============================================================================

export interface PeopleAgentInput {
  employees?: any[];
  departments?: any[];
  vpPeopleAnalysis?: any;
  metricKnowledge?: string;
  nexusBrainContext?: string;
  blackboardContext?: string;
}

export async function runPeopleAgent(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  anthropicApiKey: string,
  contextData: PeopleAgentInput
): Promise<AgentResult> {
  const employees = contextData.employees || [];
  const departments = contextData.departments || [];
  const analysis = contextData.vpPeopleAnalysis || {};
  const now = new Date();

  // Build compact initial context
  const compactContext = {
    summary: {
      totalHeadcount: analysis.totalHeadcount || employees.filter((e: any) =>
        (e.status || e.employment_status || '').toLowerCase() === 'active'
      ).length,
      onboardingCount: analysis.onboardingCount || employees.filter((e: any) =>
        (e.status || e.employment_status || '').toLowerCase() === 'onboarding'
      ).length,
      exitingCount: analysis.exitingCount || employees.filter((e: any) =>
        ['notice period', 'notice_period', 'exiting'].includes((e.status || e.employment_status || '').toLowerCase())
      ).length,
      probationCount: analysis.probationCount || 0,
      departmentCount: departments.length,
      attritionRisk: analysis.attritionRisk || 'Unknown',
      timestamp: now.toISOString()
    },
    // Tenure distribution
    tenureDistribution: analysis.tenureDistribution || {
      newHires: 0,
      midTenure: 0,
      tenured: 0
    },
    // Department headcount distribution
    departmentDistribution: analysis.departmentDistribution || departments.map((d: any) => ({
      departmentId: d.id,
      departmentName: d.name || d.departmentName,
      departmentCode: d.code || d.departmentCode,
      headcount: employees.filter((e: any) => e.departmentId === d.id || e.department_id === d.id).length
    })),
    // Onboarding employees (potential delays)
    onboardingEmployees: (analysis.onboardingEmployees || employees
      .filter((e: any) => (e.status || e.employment_status || '').toLowerCase() === 'onboarding')
      .map((e: any) => ({
        id: e.id,
        name: e.name || `${e.first_name || ''} ${e.last_name || ''}`.trim(),
        role: e.role || e.role_designation,
        joinDate: e.joinDate || e.date_of_joining || e.hire_date,
        departmentId: e.departmentId || e.department_id,
        daysInOnboarding: e.joinDate || e.date_of_joining || e.hire_date
          ? Math.ceil((now.getTime() - new Date(e.joinDate || e.date_of_joining || e.hire_date).getTime()) / (1000 * 60 * 60 * 24))
          : null
      }))
    ).slice(0, 15),
    // Exiting employees (knowledge transfer risk)
    exitingEmployees: (analysis.exitingEmployees || employees
      .filter((e: any) => ['notice period', 'notice_period', 'exiting'].includes((e.status || e.employment_status || '').toLowerCase()))
      .map((e: any) => ({
        id: e.id,
        name: e.name || `${e.first_name || ''} ${e.last_name || ''}`.trim(),
        role: e.role || e.role_designation,
        departmentId: e.departmentId || e.department_id
      }))
    ).slice(0, 10)
  };

  // v11.5.0: Inject metric knowledge and brain context
  const enrichedContext = {
    ...compactContext,
    ...(contextData.metricKnowledge ? { metricReference: contextData.metricKnowledge } : {}),
    ...(contextData.nexusBrainContext ? { brainIntelligence: contextData.nexusBrainContext } : {}),
  };

  return await runAgentLoop({
    goal: PEOPLE_AGENT_GOAL,
    agent: {
      domain: 'people',
      role: DOMAIN_PERSONAS.people.role,
      systemPrompt: buildPeopleSystemPrompt(),
      tools: getToolsForDomain('people')
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

export default runPeopleAgent;
