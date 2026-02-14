/**
 * Jarvis Agents — Executive Intelligence Layer
 * ==============================================
 *
 * Brain Analog: Prefrontal Cortex Executive Function
 *   — goal decomposition, multi-step planning, cross-domain orchestration
 *
 * Jarvis is the brain's executive agent — the orchestrator that coordinates
 * all other agents and action domains to deliver end-to-end intelligence.
 *
 * Unlike individual agents (revenue-watcher, anomaly-diagnostician) that
 * focus on a single concern, Jarvis:
 *   1. Accepts a high-level goal or question
 *   2. Decomposes it into sub-tasks
 *   3. Routes sub-tasks to the right agents/domains
 *   4. Synthesizes results into actionable intelligence
 *   5. Generates executive-ready deliverables
 *
 * Agents:
 *   1. brain-jarvis-orchestrator — Autonomous: Goal decomposition + multi-agent coordination
 *   2. brain-jarvis-analyst       — Task: Deep-dive analysis with cross-domain synthesis
 *   3. brain-jarvis-monitor       — Autonomous: Continuous multi-domain health monitoring
 *
 * Design: Works for any org (multi-tenant). Brain context comes from the
 *         AgentExecutionContext, which is org-scoped by the caller.
 *
 * @packageDocumentation
 */

import {
  defineAgent,
  type AgentDefinition,
  type AgentExecutionContext,
} from './agent-registry';
import type { BrainExecutionInterface } from './brain-agent-fusion';

// ============================================================================
// TYPES
// ============================================================================

/** Jarvis goal input — what the executive layer receives */
export interface JarvisGoal {
  /** The high-level question or objective */
  goal: string;
  /** Optional: restrict to specific domains */
  domains?: string[];
  /** Optional: current entity metrics for grounding */
  entityState?: Record<string, unknown>;
  /** Optional: desired output format */
  format?: 'executive' | 'detailed' | 'actionable';
  /** Optional: urgency level */
  urgency?: 'low' | 'normal' | 'high' | 'critical';
}

/** Jarvis orchestration result */
export interface JarvisResult {
  /** Overall status */
  status: 'completed' | 'partial' | 'failed';
  /** Executive summary (2-3 sentences) */
  summary: string;
  /** Detailed findings from each sub-task */
  findings: JarvisFinding[];
  /** Cross-domain synthesis */
  synthesis: {
    /** Key themes across domains */
    themes: string[];
    /** Root causes identified */
    rootCauses: string[];
    /** Cascade risks (cross-domain effects) */
    cascadeRisks: string[];
  };
  /** Recommended actions (prioritized) */
  actions: JarvisAction[];
  /** Confidence in the overall analysis */
  confidence: number;
  /** Which sub-agents were called */
  agentsUsed: string[];
  /** Timing metadata */
  timing: {
    totalMs: number;
    breakdownMs: Record<string, number>;
  };
}

/** Individual finding from a sub-agent or domain */
export interface JarvisFinding {
  /** Which agent or domain produced this */
  source: string;
  /** Domain this finding belongs to */
  domain: string;
  /** Finding narrative */
  narrative: string;
  /** Confidence in this specific finding */
  confidence: number;
  /** Severity: how important is this */
  severity: 'info' | 'warning' | 'critical';
  /** Supporting data */
  data?: Record<string, unknown>;
}

/** Recommended action from Jarvis */
export interface JarvisAction {
  /** What to do */
  action: string;
  /** Who should do it */
  owner: string;
  /** Which domains this affects */
  targetDomains: string[];
  /** Expected impact description */
  expectedImpact: string;
  /** Priority: 1 = highest */
  priority: number;
  /** Effort estimate */
  effort: 'low' | 'medium' | 'high';
  /** Confidence in this recommendation */
  confidence: number;
}

/** Monitor result from continuous health monitoring */
export interface JarvisMonitorResult {
  /** Overall health score (0-1) */
  healthScore: number;
  /** Per-domain health */
  domainHealth: Record<string, {
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    alerts: string[];
  }>;
  /** Active alerts */
  alerts: Array<{
    severity: 'info' | 'warning' | 'critical';
    domain: string;
    message: string;
    timestamp: string;
  }>;
  /** Recommendations */
  recommendations: string[];
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// HELPER: GOAL DECOMPOSITION
// ============================================================================

/** All known domains the brain understands */
const ALL_BRAIN_DOMAINS = [
  'finance', 'growth', 'cs', 'marketing', 'product',
  'strategy', 'engineering', 'people', 'revenue', 'operations',
];

/** Domain keyword detection for goal routing */
const GOAL_DOMAIN_KEYWORDS: Record<string, string[]> = {
  finance: ['cash', 'financial', 'revenue', 'burn', 'runway', 'arr', 'mrr', 'margin', 'budget', 'cost', 'pricing', 'roi', 'balance sheet', 'p&l', 'pnl'],
  growth: ['growth', 'scaling', 'scale', 'expand', 'fundraise', 'traction', 'pmf'],
  cs: ['customer', 'churn', 'retention', 'nrr', 'renewal', 'upsell', 'nps', 'csat', 'support'],
  marketing: ['marketing', 'cac', 'acquisition', 'funnel', 'conversion', 'leads', 'pipeline', 'campaign', 'seo'],
  product: ['product', 'feature', 'adoption', 'usage', 'engagement', 'dau', 'mau', 'activation', 'roadmap'],
  strategy: ['strategy', 'forecasting', 'scenario', 'competitive', 'market', 'tam', 'plan'],
  engineering: ['engineering', 'code', 'deploy', 'technical debt', 'architecture', 'devops', 'incidents', 'velocity'],
  people: ['hiring', 'talent', 'culture', 'team', 'retention', 'attrition', 'compensation', 'headcount'],
  revenue: ['revenue', 'sales', 'bookings', 'deal', 'quota', 'win rate', 'close rate'],
  operations: ['operations', 'ops', 'process', 'efficiency', 'workflow', 'automation'],
};

/** Detect which domains a goal touches */
function detectGoalDomains(goal: string): string[] {
  const lower = goal.toLowerCase();
  const domains: string[] = [];
  for (const [domain, keywords] of Object.entries(GOAL_DOMAIN_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      domains.push(domain);
    }
  }
  // If no specific domains detected, check for broad/strategic goals
  if (domains.length === 0) {
    if (['overall', 'company', 'business', 'health', 'status', 'how are we'].some(kw => lower.includes(kw))) {
      return ['finance', 'growth', 'cs', 'product', 'engineering']; // Cross-domain
    }
    return ['strategy']; // Default to strategy for unclassified goals
  }
  return domains;
}

/** Detect the intent/action type for a goal */
function detectGoalIntent(goal: string): string {
  const lower = goal.toLowerCase();
  if (['forecast', 'predict', 'project', 'estimate', 'what will'].some(k => lower.includes(k))) return 'forecast';
  if (['what if', 'simulate', 'scenario', 'happen if', 'impact of'].some(k => lower.includes(k))) return 'simulate';
  if (['diagnose', 'why', 'root cause', 'problem', 'declining', 'wrong'].some(k => lower.includes(k))) return 'diagnose';
  if (['optimize', 'improve', 'increase', 'reduce', 'maximize', 'minimize'].some(k => lower.includes(k))) return 'optimize';
  if (['benchmark', 'compare', 'versus', 'vs', 'relative to'].some(k => lower.includes(k))) return 'benchmark';
  if (['risk', 'threat', 'vulnerability', 'danger'].some(k => lower.includes(k))) return 'risk-assess';
  if (['plan', 'strategy', 'roadmap', 'goal', 'objective'].some(k => lower.includes(k))) return 'plan';
  if (['monitor', 'watch', 'track', 'alert', 'status', 'health'].some(k => lower.includes(k))) return 'monitor';
  if (['explain', 'how', 'what is', 'describe', 'understand'].some(k => lower.includes(k))) return 'explain';
  if (['audit', 'review', 'check', 'verify', 'validate'].some(k => lower.includes(k))) return 'audit';
  return 'analyze'; // Default
}

/** Map intent to which sub-agents to call */
function selectSubAgents(intent: string, domains: string[]): string[] {
  const agents: string[] = [];

  switch (intent) {
    case 'forecast':
      agents.push('brain-revenue-watcher');
      break;
    case 'diagnose':
      agents.push('brain-anomaly-diagnostician');
      break;
    case 'optimize':
      agents.push('brain-optimizer');
      break;
    case 'risk-assess':
      agents.push('brain-risk-sentinel');
      break;
    case 'plan':
      agents.push('brain-strategic-planner');
      break;
    case 'monitor':
      agents.push('brain-org-health');
      break;
    case 'benchmark':
      agents.push('brain-benchmark-auditor');
      break;
    case 'audit':
      if (domains.includes('finance')) {
        agents.push('brain-financial-auditor');
      }
      agents.push('brain-benchmark-auditor');
      break;
    default:
      // For general analysis, pick based on domains
      if (domains.includes('finance') || domains.includes('revenue')) {
        agents.push('brain-revenue-watcher');
      }
      if (domains.length > 2) {
        agents.push('brain-org-health');
      }
      break;
  }

  return agents;
}

/** Map intent to which brain action domains to execute */
function selectActionDomains(intent: string, domains: string[]): string[] {
  const actions: string[] = [];

  switch (intent) {
    case 'forecast':
      actions.push('forecast');
      if (domains.includes('finance')) actions.push('narrate');
      break;
    case 'simulate':
      actions.push('simulate');
      actions.push('risk-cascade');
      break;
    case 'diagnose':
      actions.push('diagnose');
      actions.push('correlate');
      break;
    case 'optimize':
      actions.push('optimize');
      actions.push('recommend');
      break;
    case 'risk-assess':
      actions.push('risk-cascade');
      actions.push('anomaly-predict');
      break;
    case 'plan':
      actions.push('goal-decompose');
      actions.push('resource-allocate');
      actions.push('scenario-tree');
      break;
    case 'explain':
      actions.push('explain');
      actions.push('narrate');
      break;
    case 'audit':
      actions.push('audit');
      actions.push('cross-validate');
      break;
    case 'benchmark':
      actions.push('benchmark');
      break;
    default:
      actions.push('narrate');
      actions.push('recommend');
      break;
  }

  return actions;
}

// ============================================================================
// AGENT 1: BRAIN-JARVIS-ORCHESTRATOR — Executive Goal Orchestration
// ============================================================================

/**
 * Jarvis Orchestrator — Executive Intelligence
 *
 * The brain's executive function. Accepts high-level goals, decomposes them,
 * coordinates sub-agents and action domains, and synthesizes results.
 *
 * This is what makes the brain truly useful — instead of asking "forecast revenue",
 * you ask "How healthy is our business?" and Jarvis figures out what to run.
 *
 * Works for any org. Brain context is injected by the AgentRegistry at runtime.
 */
export const jarvisOrchestratorAgent: AgentDefinition<JarvisGoal, JarvisResult> = defineAgent({
  name: 'brain-jarvis-orchestrator',
  description: 'Executive intelligence agent — decomposes goals into sub-tasks, coordinates agents and action domains, synthesizes cross-domain results into actionable intelligence',
  level: 'autonomous',
  version: '1.0.0',
  domains: ALL_BRAIN_DOMAINS,
  triggers: ['command:jarvis_execute', 'command:analyze', 'manual'],
  tools: [
    'brain-revenue-watcher', 'brain-anomaly-diagnostician', 'brain-optimizer',
    'brain-risk-sentinel', 'brain-strategic-planner', 'brain-org-health',
    'brain-benchmark-auditor', 'brain-financial-auditor',
  ],
  timeoutMs: 600_000, // 10 minutes for complex orchestration
  maxRetries: 1,
  tags: ['brain-native', 'executive', 'orchestrator', 'jarvis', 'v8'],
  inputSchema: {
    goal: 'High-level business question or objective',
    domains: 'Optional: restrict analysis to specific domains',
    entityState: 'Optional: current metrics for grounding',
    format: 'Optional: executive | detailed | actionable',
    urgency: 'Optional: low | normal | high | critical',
  },
  outputSchema: {
    status: 'completed | partial | failed',
    summary: 'Executive summary (2-3 sentences)',
    findings: 'Array of findings from sub-agents',
    synthesis: 'Cross-domain themes, root causes, cascade risks',
    actions: 'Prioritized recommended actions',
    confidence: 'Overall confidence (0-1)',
    agentsUsed: 'Which sub-agents were called',
    timing: 'Execution timing breakdown',
  },

  execute: async (input: JarvisGoal, ctx: AgentExecutionContext): Promise<JarvisResult> => {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    const findings: JarvisFinding[] = [];
    const agentsUsed: string[] = [];
    const allNarratives: string[] = [];

    ctx.log(`[jarvis] Goal: "${input.goal}"`);
    ctx.log(`[jarvis] Urgency: ${input.urgency || 'normal'}`);

    // ── Step 1: Decompose the goal ────────────────────────────────────
    ctx.reportProgress(0.1, 'Decomposing goal...');
    const targetDomains = input.domains?.length ? input.domains : detectGoalDomains(input.goal);
    const intent = detectGoalIntent(input.goal);
    const subAgents = selectSubAgents(intent, targetDomains);
    const actionDomains = selectActionDomains(intent, targetDomains);

    ctx.log(`[jarvis] Detected intent: ${intent}`);
    ctx.log(`[jarvis] Target domains: ${targetDomains.join(', ')}`);
    ctx.log(`[jarvis] Sub-agents: ${subAgents.join(', ')}`);
    ctx.log(`[jarvis] Action domains: ${actionDomains.join(', ')}`);

    // ── Step 2: Execute action domains via brain ──────────────────────
    ctx.reportProgress(0.25, 'Running brain action domains...');
    const brainExec = (ctx as unknown as { brainExecution: BrainExecutionInterface }).brainExecution;

    if (brainExec) {
      for (const domainName of actionDomains) {
        const domainStart = Date.now();
        try {
          const result = await brainExec.executeDomain(domainName, {
            question: input.goal,
            domains: targetDomains,
            entityState: input.entityState,
          });
          const domainResult = result as {
            confidence?: number;
            narrative?: string;
            data?: Record<string, unknown>;
            interventions?: Array<{ action: string }>;
          };

          timings[`domain:${domainName}`] = Date.now() - domainStart;

          if (domainResult.narrative) {
            allNarratives.push(domainResult.narrative);
            findings.push({
              source: `domain:${domainName}`,
              domain: targetDomains[0] || 'strategy',
              narrative: domainResult.narrative,
              confidence: domainResult.confidence || 0.5,
              severity: (domainResult.confidence || 0) < 0.3 ? 'critical' :
                (domainResult.confidence || 0) < 0.6 ? 'warning' : 'info',
              data: domainResult.data,
            });
          }
        } catch (err) {
          ctx.log(`[jarvis] Domain ${domainName} failed: ${err}`);
          timings[`domain:${domainName}`] = Date.now() - domainStart;
        }
      }
    }

    // ── Step 3: Execute sub-agents ────────────────────────────────────
    ctx.reportProgress(0.5, 'Coordinating sub-agents...');

    for (const agentName of subAgents) {
      const agentStart = Date.now();
      try {
        const result = await ctx.callAgent(agentName, {
          question: input.goal,
          domains: targetDomains,
          entityState: input.entityState,
        });
        agentsUsed.push(agentName);
        timings[`agent:${agentName}`] = Date.now() - agentStart;

        if (result.status === 'completed' && result.result) {
          const agentResult = result.result as Record<string, unknown>;

          // Extract narrative from sub-agent result
          const narrative = (agentResult.narrative as string) ||
            (agentResult.status as string) ||
            `${agentName} completed`;
          allNarratives.push(narrative);

          // Extract alerts if present
          const alerts = (agentResult.alerts as string[]) || [];
          for (const alert of alerts) {
            findings.push({
              source: `agent:${agentName}`,
              domain: targetDomains[0] || 'operations',
              narrative: alert,
              confidence: (agentResult.confidence as number) || 0.7,
              severity: 'warning',
            });
          }

          findings.push({
            source: `agent:${agentName}`,
            domain: targetDomains[0] || 'operations',
            narrative,
            confidence: (agentResult.confidence as number) || 0.7,
            severity: alerts.length > 0 ? 'warning' : 'info',
            data: agentResult,
          });
        }
      } catch (err) {
        ctx.log(`[jarvis] Agent ${agentName} failed: ${err}`);
        timings[`agent:${agentName}`] = Date.now() - agentStart;
      }
    }

    // ── Step 4: Synthesize cross-domain insights ─────────────────────
    ctx.reportProgress(0.75, 'Synthesizing cross-domain intelligence...');

    // Extract themes from causal edges
    const themes: string[] = [];
    const rootCauses: string[] = [];
    const cascadeRisks: string[] = [];

    // Use brain context to identify cross-domain patterns
    if (ctx.brainContext.causalEdges.length > 0) {
      // Find edges that cross domains
      const crossDomainEdges = ctx.brainContext.causalEdges.filter(
        e => !targetDomains.every(d => e.source.includes(d) || e.target.includes(d))
      );

      if (crossDomainEdges.length > 0) {
        themes.push(`${crossDomainEdges.length} cross-domain causal relationships detected`);
      }

      // Identify strong causal drivers
      const strongEdges = ctx.brainContext.causalEdges.filter(e => Math.abs(e.effectSize) > 0.3);
      for (const edge of strongEdges.slice(0, 5)) {
        rootCauses.push(
          `${edge.source} → ${edge.target} (effect: ${(edge.effectSize * 100).toFixed(0)}%, lag: ${edge.lagDays}d)`
        );
      }
    }

    // Identify cascade risks from findings
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    for (const critical of criticalFindings) {
      cascadeRisks.push(`${critical.domain}: ${critical.narrative}`);
    }

    // Theme extraction from patterns
    if (ctx.brainContext.patterns.length > 0) {
      const domainPatterns = ctx.brainContext.patterns
        .filter(p => targetDomains.includes(p.domain))
        .slice(0, 3);
      for (const pattern of domainPatterns) {
        themes.push(pattern.content.substring(0, 120));
      }
    }

    // ── Step 5: Generate prioritized actions ─────────────────────────
    ctx.reportProgress(0.9, 'Generating action recommendations...');

    const actions: JarvisAction[] = [];
    let priority = 1;

    // Actions from findings with interventions
    for (const finding of findings) {
      if (finding.data?.interventions) {
        const interventions = finding.data.interventions as Array<{
          action: string;
          targetDomains?: string[];
          expectedImpact?: string;
          confidence?: number;
          owner?: string;
          effort?: string;
        }>;
        for (const intervention of interventions.slice(0, 3)) {
          actions.push({
            action: intervention.action,
            owner: intervention.owner || 'Leadership',
            targetDomains: intervention.targetDomains || [finding.domain],
            expectedImpact: intervention.expectedImpact || 'Improve performance',
            priority: priority++,
            effort: (intervention.effort as 'low' | 'medium' | 'high') || 'medium',
            confidence: intervention.confidence || finding.confidence,
          });
        }
      }
    }

    // If no actions from sub-agents, generate from brain rules
    if (actions.length === 0 && ctx.brainContext.rules.length > 0) {
      const relevantRules = ctx.brainContext.rules
        .filter(r => targetDomains.includes(r.domain))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 3);

      for (const rule of relevantRules) {
        actions.push({
          action: rule.content.substring(0, 200),
          owner: 'Leadership',
          targetDomains: [rule.domain],
          expectedImpact: 'Based on brain-discovered pattern',
          priority: priority++,
          effort: 'medium',
          confidence: rule.importance,
        });
      }
    }

    // ── Step 6: Compute overall confidence ───────────────────────────
    const avgConfidence = findings.length > 0
      ? findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length
      : 0.5;

    // Factor in data coverage
    const domainCoverage = targetDomains.length > 0
      ? Math.min(1, (ctx.brainContext.causalEdges.length + ctx.brainContext.patterns.length) / 10)
      : 0.5;

    const overallConfidence = avgConfidence * 0.7 + domainCoverage * 0.3;

    // ── Step 7: Build executive summary ──────────────────────────────
    ctx.reportProgress(1.0, 'Complete');
    const totalMs = Date.now() - startTime;

    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const warningCount = findings.filter(f => f.severity === 'warning').length;

    let summary = `Analyzed "${input.goal}" across ${targetDomains.length} domains with ${findings.length} findings.`;
    if (criticalCount > 0) {
      summary += ` ⚠️ ${criticalCount} critical issues require immediate attention.`;
    } else if (warningCount > 0) {
      summary += ` ${warningCount} areas need monitoring.`;
    } else {
      summary += ' No critical issues detected.';
    }
    summary += ` Overall confidence: ${(overallConfidence * 100).toFixed(0)}%.`;

    const result: JarvisResult = {
      status: findings.length > 0 ? 'completed' : 'partial',
      summary,
      findings,
      synthesis: {
        themes: themes.length > 0 ? themes : ['Insufficient data for thematic analysis'],
        rootCauses: rootCauses.length > 0 ? rootCauses : ['No strong causal drivers identified'],
        cascadeRisks: cascadeRisks.length > 0 ? cascadeRisks : ['No active cascade risks'],
      },
      actions,
      confidence: overallConfidence,
      agentsUsed,
      timing: {
        totalMs,
        breakdownMs: timings,
      },
    };

    ctx.log(`[jarvis] Complete: ${result.status} in ${totalMs}ms, ${findings.length} findings, ${actions.length} actions`);
    return result;
  },
});

// ============================================================================
// AGENT 2: BRAIN-JARVIS-ANALYST — Deep Cross-Domain Analysis
// ============================================================================

/**
 * Jarvis Analyst — Deep-Dive Analysis
 *
 * When you need more than a quick answer — Jarvis Analyst runs a thorough
 * multi-domain analysis using multiple brain action domains in sequence.
 *
 * The key difference from the Orchestrator: Analyst focuses on DEPTH
 * (running diagnose + explain + correlate + forecast for a single topic),
 * while Orchestrator focuses on BREADTH (coordinating many agents).
 */
export const jarvisAnalystAgent: AgentDefinition<
  { question: string; domains?: string[]; depth?: 'moderate' | 'deep' },
  {
    analysis: JarvisFinding[];
    causalChain: string[];
    forecast: { narrative: string; confidence: number } | null;
    recommendations: string[];
    confidence: number;
  }
> = defineAgent({
  name: 'brain-jarvis-analyst',
  description: 'Deep-dive analysis agent — runs diagnose, explain, correlate, and forecast in sequence for thorough cross-domain understanding',
  level: 'task',
  version: '1.0.0',
  domains: ALL_BRAIN_DOMAINS,
  triggers: ['command:jarvis_analyze', 'manual'],
  tools: ['brain-anomaly-diagnostician', 'brain-benchmark-auditor'],
  timeoutMs: 300_000, // 5 minutes
  maxRetries: 1,
  tags: ['brain-native', 'analysis', 'deep-dive', 'jarvis', 'v8'],
  inputSchema: {
    question: 'The specific business question to analyze deeply',
    domains: 'Optional: restrict to specific domains',
    depth: 'Optional: moderate or deep analysis',
  },

  execute: async (input, ctx) => {
    const brainExec = (ctx as unknown as { brainExecution: BrainExecutionInterface }).brainExecution;
    const findings: JarvisFinding[] = [];
    const causalChain: string[] = [];

    ctx.log(`[jarvis-analyst] Deep analysis: "${input.question}"`);
    const targetDomains = input.domains?.length ? input.domains : detectGoalDomains(input.question);

    // Step 1: Diagnose — what's happening?
    ctx.reportProgress(0.2, 'Diagnosing...');
    if (brainExec) {
      try {
        const diagResult = await brainExec.executeDomain('diagnose', { question: input.question });
        const diag = diagResult as { narrative?: string; confidence?: number; data?: Record<string, unknown> };
        if (diag.narrative) {
          findings.push({
            source: 'domain:diagnose',
            domain: targetDomains[0] || 'strategy',
            narrative: diag.narrative,
            confidence: diag.confidence || 0.5,
            severity: (diag.confidence || 0) < 0.5 ? 'warning' : 'info',
            data: diag.data,
          });
        }
      } catch (err) {
        ctx.log(`[jarvis-analyst] Diagnose failed: ${err}`);
      }
    }

    // Step 2: Explain — why is this happening?
    ctx.reportProgress(0.4, 'Explaining causal chain...');
    if (brainExec) {
      try {
        const explainResult = await brainExec.executeDomain('explain', { question: input.question });
        const explain = explainResult as { narrative?: string; confidence?: number; data?: Record<string, unknown> };
        if (explain.narrative) {
          findings.push({
            source: 'domain:explain',
            domain: targetDomains[0] || 'strategy',
            narrative: explain.narrative,
            confidence: explain.confidence || 0.5,
            severity: 'info',
            data: explain.data,
          });
        }
      } catch (err) {
        ctx.log(`[jarvis-analyst] Explain failed: ${err}`);
      }
    }

    // Step 3: Correlate — what's connected?
    ctx.reportProgress(0.6, 'Correlating cross-domain signals...');
    // Use brain context for causal chain construction
    const relevantEdges = ctx.brainContext.causalEdges
      .filter(e => targetDomains.some(d => e.source.includes(d) || e.target.includes(d)))
      .sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize))
      .slice(0, 10);

    for (const edge of relevantEdges) {
      causalChain.push(
        `${edge.source} → ${edge.target} (effect: ${(edge.effectSize * 100).toFixed(0)}%, lag: ${edge.lagDays}d)`
      );
    }

    // Step 4: Forecast — what will happen?
    ctx.reportProgress(0.8, 'Generating forecast...');
    let forecast: { narrative: string; confidence: number } | null = null;
    if (brainExec) {
      try {
        const forecastResult = await brainExec.executeDomain('forecast', { question: input.question });
        const fc = forecastResult as { narrative?: string; confidence?: number };
        if (fc.narrative) {
          forecast = { narrative: fc.narrative, confidence: fc.confidence || 0.5 };
          findings.push({
            source: 'domain:forecast',
            domain: targetDomains[0] || 'finance',
            narrative: fc.narrative,
            confidence: fc.confidence || 0.5,
            severity: (fc.confidence || 0) < 0.4 ? 'warning' : 'info',
          });
        }
      } catch (err) {
        ctx.log(`[jarvis-analyst] Forecast failed: ${err}`);
      }
    }

    // Step 5: Generate recommendations from rules
    const recommendations: string[] = [];
    const relevantRules = ctx.brainContext.rules
      .filter(r => targetDomains.includes(r.domain))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5);

    for (const rule of relevantRules) {
      recommendations.push(rule.content.substring(0, 200));
    }

    ctx.reportProgress(1.0, 'Analysis complete');

    const avgConfidence = findings.length > 0
      ? findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length
      : 0.5;

    return {
      analysis: findings,
      causalChain,
      forecast,
      recommendations,
      confidence: avgConfidence,
    };
  },
});

// ============================================================================
// AGENT 3: BRAIN-JARVIS-MONITOR — Continuous Multi-Domain Health Monitor
// ============================================================================

/**
 * Jarvis Monitor — Continuous Health Surveillance
 *
 * Runs on schedule to check organizational health across all domains.
 * Generates alerts when metrics deviate from expected ranges.
 * Think of it as a "vital signs monitor" for the business.
 *
 * Unlike org-health (which runs weekly), Jarvis Monitor runs more
 * frequently and focuses on early warning signals across domains.
 */
export const jarvisMonitorAgent: AgentDefinition<
  { domains?: string[]; thresholds?: Record<string, number> },
  JarvisMonitorResult
> = defineAgent({
  name: 'brain-jarvis-monitor',
  description: 'Continuous multi-domain health monitor — scans all domains for anomalies, trend shifts, and cascade risks at regular intervals',
  level: 'autonomous',
  version: '1.0.0',
  domains: ALL_BRAIN_DOMAINS,
  triggers: ['schedule:4h', 'event:metric_threshold_breached', 'command:jarvis_health_check'],
  tools: ['brain-risk-sentinel', 'brain-anomaly-diagnostician', 'brain-pattern-recon'],
  timeoutMs: 300_000, // 5 minutes
  maxRetries: 2,
  tags: ['brain-native', 'monitoring', 'health', 'continuous', 'jarvis', 'v8'],

  execute: async (input, ctx) => {
    const brainExec = (ctx as unknown as { brainExecution: BrainExecutionInterface }).brainExecution;
    const targetDomains = input.domains?.length ? input.domains : ALL_BRAIN_DOMAINS;
    const alerts: JarvisMonitorResult['alerts'] = [];
    const domainHealth: JarvisMonitorResult['domainHealth'] = {};
    const recommendations: string[] = [];

    ctx.log(`[jarvis-monitor] Health scan: ${targetDomains.length} domains`);

    // Step 1: Check each domain via brain patterns and rules
    ctx.reportProgress(0.2, 'Scanning domain health...');

    for (const domain of targetDomains) {
      // Get domain-specific patterns
      const domainPatterns = ctx.brainContext.patterns
        .filter(p => p.domain === domain);

      // Get domain-specific causal edges
      const domainEdges = ctx.brainContext.causalEdges
        .filter(e => e.source.includes(domain) || e.target.includes(domain));

      // Get domain-specific rules
      const domainRules = ctx.brainContext.rules
        .filter(r => r.domain === domain);

      // Compute health score based on data availability and edge health
      const dataScore = Math.min(1, (domainPatterns.length + domainEdges.length + domainRules.length) / 10);
      const negativeEdges = domainEdges.filter(e => e.effectSize < -0.2);
      const healthPenalty = negativeEdges.length * 0.1;
      const healthScore = Math.max(0, Math.min(1, dataScore - healthPenalty));

      // Determine trend
      const trend: 'improving' | 'stable' | 'declining' =
        negativeEdges.length > 2 ? 'declining' :
          negativeEdges.length === 0 && domainEdges.length > 0 ? 'improving' : 'stable';

      const domainAlerts: string[] = [];

      // Check for concerning patterns
      for (const edge of negativeEdges) {
        const alert = `Negative causal signal: ${edge.source} → ${edge.target} (${(edge.effectSize * 100).toFixed(0)}%)`;
        domainAlerts.push(alert);
        alerts.push({
          severity: Math.abs(edge.effectSize) > 0.5 ? 'critical' : 'warning',
          domain,
          message: alert,
          timestamp: new Date().toISOString(),
        });
      }

      domainHealth[domain] = {
        score: healthScore,
        trend,
        alerts: domainAlerts,
      };
    }

    // Step 2: Run risk sentinel for cascade detection
    ctx.reportProgress(0.5, 'Checking cascade risks...');
    try {
      const riskResult = await ctx.callAgent('brain-risk-sentinel', {
        domains: targetDomains,
      });
      if (riskResult.status === 'completed') {
        const riskData = riskResult.result as Record<string, unknown>;
        const cascadeAlerts = (riskData.alerts as string[]) || [];
        for (const alert of cascadeAlerts) {
          alerts.push({
            severity: 'warning',
            domain: 'cross-domain',
            message: alert,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      ctx.log(`[jarvis-monitor] Risk sentinel unavailable: ${err}`);
    }

    // Step 3: Run anomaly check
    ctx.reportProgress(0.7, 'Checking for anomalies...');
    if (brainExec) {
      try {
        const anomalyResult = await brainExec.executeDomain('anomaly-predict', {
          domains: targetDomains,
        });
        const anomaly = anomalyResult as { data?: { predictions?: Array<{ domain: string; risk: number; message: string }> } };
        if (anomaly.data?.predictions) {
          for (const pred of anomaly.data.predictions) {
            if (pred.risk > 0.6) {
              alerts.push({
                severity: pred.risk > 0.8 ? 'critical' : 'warning',
                domain: pred.domain,
                message: pred.message,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      } catch (err) {
        ctx.log(`[jarvis-monitor] Anomaly predict failed: ${err}`);
      }
    }

    // Step 4: Generate recommendations
    ctx.reportProgress(0.9, 'Generating recommendations...');

    const decliningDomains = Object.entries(domainHealth)
      .filter(([, h]) => h.trend === 'declining')
      .map(([d]) => d);

    if (decliningDomains.length > 0) {
      recommendations.push(`Investigate declining domains: ${decliningDomains.join(', ')}`);
    }

    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      recommendations.push(`${criticalAlerts.length} critical alerts require immediate attention`);
    }

    // Use brain rules for domain-specific recommendations
    for (const domain of decliningDomains.slice(0, 3)) {
      const domainRules = ctx.brainContext.rules
        .filter(r => r.domain === domain)
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 1);

      for (const rule of domainRules) {
        recommendations.push(`[${domain}] ${rule.content.substring(0, 150)}`);
      }
    }

    // Step 5: Compute overall health
    const healthScores = Object.values(domainHealth).map(h => h.score);
    const overallHealth = healthScores.length > 0
      ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length
      : 0.5;

    ctx.reportProgress(1.0, 'Monitor scan complete');

    return {
      healthScore: overallHealth,
      domainHealth,
      alerts,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  },
});

// ============================================================================
// EXPORT ALL JARVIS AGENTS
// ============================================================================

/** All 3 Jarvis agents */
export const ALL_JARVIS_AGENTS: AgentDefinition[] = [
  jarvisOrchestratorAgent as AgentDefinition,
  jarvisAnalystAgent as AgentDefinition,
  jarvisMonitorAgent as AgentDefinition,
];

/**
 * Register all 3 Jarvis agents into an agent registry.
 *
 * @example
 * ```typescript
 * const agentRegistry = createAgentRegistry({ verbose: true });
 * registerJarvisAgents(agentRegistry);
 * // 3 Jarvis executive intelligence agents now registered
 * ```
 */
export function registerJarvisAgents(
  registry: { register: (def: AgentDefinition) => void },
): void {
  for (const agent of ALL_JARVIS_AGENTS) {
    registry.register(agent);
  }
}
