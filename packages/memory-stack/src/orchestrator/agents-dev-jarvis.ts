/**
 * Dev Jarvis Agent — Developer Intelligence Executive
 * =====================================================
 *
 * Brain Analog: **Prefrontal Cortex + Wernicke's Area** — the developer's
 * executive assistant that understands code, orchestrates SE agents, and
 * delivers engineering intelligence as a single unified agent.
 *
 * While the SE-aaS agents (codebase-mapper, feature-builder, code-reviewer,
 * tech-debt-optimizer) are individual specialists, Dev Jarvis is the
 * meta-agent that:
 *   1. Accepts a developer goal ("onboard me to this repo", "review PR #42",
 *      "find the root cause of the deployment failure")
 *   2. Decomposes it into SE sub-tasks
 *   3. Orchestrates the right SE agents + brain action domains
 *   4. Synthesizes results into developer-ready deliverables
 *
 * Use Cases:
 *   - "Onboard me to this codebase" → codebase-comprehend → pattern-memory → narrate
 *   - "Review this PR" → codebase-comprehend → code-generate (review) → recommend
 *   - "What caused the deploy failure?" → diagnose → correlate → explain → recommend
 *   - "Where is the tech debt worst?" → codebase-comprehend → benchmark → optimize → narrate
 *   - "Generate a feature for X" → codebase-comprehend → code-generate → recommend
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

/** Dev Jarvis input — a developer question or goal */
export interface DevJarvisGoal {
  /** The developer's question or objective */
  goal: string;
  /** Optional: repository to focus on */
  repository?: string;
  /** Optional: PR number for review tasks */
  prNumber?: number;
  /** Optional: branch name */
  branch?: string;
  /** Optional: specific files to focus on */
  files?: string[];
  /** Optional: task type hint */
  taskType?: 'onboard' | 'review' | 'debug' | 'optimize' | 'generate' | 'auto';
}

/** Dev Jarvis result */
export interface DevJarvisResult {
  status: 'completed' | 'partial' | 'skipped';
  taskType: string;
  /** Main deliverable — narrative summary for the developer */
  summary: string;
  /** Structured analysis results from each phase */
  phases: Array<{
    name: string;
    domain: string;
    result: unknown;
    durationMs?: number;
  }>;
  /** Actionable recommendations */
  recommendations: string[];
  /** Risk or quality alerts */
  alerts: string[];
  /** Files analyzed or affected */
  filesAnalyzed: string[];
  generatedAt: string;
}

// ============================================================================
// TASK TYPE DETECTION
// ============================================================================

const TASK_PATTERNS: Record<string, RegExp[]> = {
  onboard: [/onboard/i, /ramp.*up/i, /learn.*codebase/i, /understand.*code/i, /new.*repo/i, /architecture.*overview/i],
  review: [/review/i, /PR\s*#?\d+/i, /pull\s*request/i, /code\s*review/i, /check.*changes/i],
  debug: [/debug/i, /root\s*cause/i, /failure/i, /crash/i, /error/i, /incident/i, /broke/i, /broken/i, /deploy.*fail/i],
  optimize: [/tech\s*debt/i, /refactor/i, /optimize/i, /improve.*perf/i, /slow/i, /bottleneck/i, /complexity/i],
  generate: [/generate/i, /implement/i, /build.*feature/i, /create.*function/i, /write.*code/i, /add.*endpoint/i],
};

function detectTaskType(goal: string, hint?: string): string {
  if (hint && hint !== 'auto') return hint;
  for (const [type, patterns] of Object.entries(TASK_PATTERNS)) {
    if (patterns.some(p => p.test(goal))) return type;
  }
  return 'onboard'; // Default: help understand the codebase
}

// ============================================================================
// DEV JARVIS AGENT
// ============================================================================

/**
 * Dev Jarvis — Developer Intelligence Executive Agent
 *
 * The meta-agent that orchestrates all SE agents and brain domains
 * into a unified developer intelligence experience.
 *
 * Level: autonomous | Triggers: command, manual, event:repo_connected
 */
export const devJarvisAgent: AgentDefinition<DevJarvisGoal, DevJarvisResult> = defineAgent({
  name: 'brain-dev-jarvis',
  description: 'Developer intelligence executive — orchestrates SE agents (codebase-mapper, code-reviewer, feature-builder, tech-debt-optimizer) and brain domains to deliver onboarding, code review, debugging, optimization, and code generation intelligence',
  level: 'autonomous',
  version: '1.0.0',
  domains: ['engineering', 'code', 'devex'],
  triggers: ['command:dev_jarvis', 'event:repo_connected', 'manual'],
  tools: ['brain-codebase-mapper', 'brain-code-reviewer', 'brain-feature-builder', 'brain-tech-debt-optimizer'],
  timeoutMs: 600_000, // 10 min for multi-phase
  tags: ['brain-native', 'developer', 'executive', 'se-aas', 'v8'],

  execute: async (input: DevJarvisGoal, ctx: AgentExecutionContext) => {
    const brainExec = ctx.brainExecution;
    const taskType = detectTaskType(input.goal, input.taskType);
    const phases: DevJarvisResult['phases'] = [];
    const recommendations: string[] = [];
    const alerts: string[] = [];
    const filesAnalyzed: string[] = [];

    if (!brainExec) {
      return {
        status: 'skipped',
        taskType,
        summary: 'Brain execution interface not available',
        phases: [],
        recommendations: [],
        alerts: [],
        filesAnalyzed: [],
        generatedAt: new Date().toISOString(),
      };
    }

    ctx.reportProgress(0.05, `Dev Jarvis: detected task type "${taskType}" — orchestrating...`);

    // ── Phase 1: Codebase Comprehension (always runs) ────────────────────
    ctx.reportProgress(0.15, 'Phase 1: Comprehending codebase structure...');
    const comprehendStart = Date.now();
    try {
      const comprehend = await brainExec.executeDomain('codebase-comprehend');
      phases.push({
        name: 'Codebase Comprehension',
        domain: 'codebase-comprehend',
        result: comprehend,
        durationMs: Date.now() - comprehendStart,
      });
      const compResult = comprehend as { fileCount?: number; complexFiles?: string[] };
      if (compResult.complexFiles) filesAnalyzed.push(...compResult.complexFiles);
    } catch (err) {
      phases.push({ name: 'Codebase Comprehension', domain: 'codebase-comprehend', result: { error: String(err) } });
    }

    // ── Phase 2: Task-specific orchestration ─────────────────────────────
    switch (taskType) {
      case 'onboard': {
        ctx.reportProgress(0.35, 'Phase 2: Building architecture map...');
        try {
          const patterns = await brainExec.executeDomain('pattern-memory');
          phases.push({ name: 'Pattern Recognition', domain: 'pattern-memory', result: patterns });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.55, 'Phase 3: Correlating engineering signals...');
        try {
          const correlations = await brainExec.executeDomain('correlate');
          phases.push({ name: 'Cross-Domain Correlations', domain: 'correlate', result: correlations });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.75, 'Phase 4: Generating onboarding narrative...');
        try {
          const narrative = await brainExec.executeDomain('narrate');
          phases.push({ name: 'Onboarding Narrative', domain: 'narrate', result: narrative });
        } catch { /* non-fatal */ }

        recommendations.push(
          'Start with the high-traffic entry points identified in the architecture map',
          'Review the dependency graph for circular or fragile dependencies',
          'Check the patterns library for recurring engineering conventions',
        );
        break;
      }

      case 'review': {
        ctx.reportProgress(0.35, 'Phase 2: Running code review analysis...');
        try {
          const codeGen = await brainExec.executeDomain('code-generate');
          phases.push({ name: 'Code Review Analysis', domain: 'code-generate', result: codeGen });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.55, 'Phase 3: Checking quality and robustness...');
        try {
          const robustness = await brainExec.executeDomain('robustness-check');
          phases.push({ name: 'Robustness Check', domain: 'robustness-check', result: robustness });
          const robResult = robustness as { robustnessScore?: number };
          if ((robResult.robustnessScore || 0) < 0.5) {
            alerts.push('Robustness score below 50% — fragile code detected');
          }
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.75, 'Phase 4: Generating recommendations...');
        try {
          const recommend = await brainExec.executeDomain('recommend');
          phases.push({ name: 'Recommendations', domain: 'recommend', result: recommend });
        } catch { /* non-fatal */ }

        recommendations.push(
          'Address any robustness warnings before merging',
          'Check if tests cover the changed code paths',
        );
        break;
      }

      case 'debug': {
        ctx.reportProgress(0.3, 'Phase 2: Diagnosing root cause...');
        try {
          const diagnosis = await brainExec.executeDomain('diagnose');
          phases.push({ name: 'Root Cause Diagnosis', domain: 'diagnose', result: diagnosis });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.5, 'Phase 3: Correlating across domains...');
        try {
          const correlations = await brainExec.executeDomain('correlate');
          phases.push({ name: 'Cross-Domain Correlation', domain: 'correlate', result: correlations });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.65, 'Phase 4: Building causal explanation...');
        try {
          const explanation = await brainExec.executeDomain('explain');
          phases.push({ name: 'Causal Explanation', domain: 'explain', result: explanation });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.8, 'Phase 5: Generating fix recommendations...');
        try {
          const recommend = await brainExec.executeDomain('recommend');
          phases.push({ name: 'Fix Recommendations', domain: 'recommend', result: recommend });
        } catch { /* non-fatal */ }

        recommendations.push(
          'Check the causal chain for the most upstream failure point',
          'Verify the fix resolves the root cause, not just the symptom',
        );
        break;
      }

      case 'optimize': {
        ctx.reportProgress(0.35, 'Phase 2: Benchmarking code quality...');
        try {
          const benchmark = await brainExec.executeDomain('benchmark');
          phases.push({ name: 'Code Quality Benchmark', domain: 'benchmark', result: benchmark });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.55, 'Phase 3: Finding optimization opportunities...');
        try {
          const optimize = await brainExec.executeDomain('optimize');
          phases.push({ name: 'Optimization Opportunities', domain: 'optimize', result: optimize });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.75, 'Phase 4: Generating refactoring narrative...');
        try {
          const narrative = await brainExec.executeDomain('narrate');
          phases.push({ name: 'Tech Debt Narrative', domain: 'narrate', result: narrative });
        } catch { /* non-fatal */ }

        recommendations.push(
          'Prioritize refactoring by impact × effort ratio',
          'Address high-complexity hotspots first for maximum ROI',
        );
        break;
      }

      case 'generate': {
        ctx.reportProgress(0.35, 'Phase 2: Generating code...');
        try {
          const codeGen = await brainExec.executeDomain('code-generate');
          phases.push({ name: 'Code Generation', domain: 'code-generate', result: codeGen });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.6, 'Phase 3: Validating generated code...');
        try {
          const chainValidate = await brainExec.executeDomain('chain-validate');
          phases.push({ name: 'Code Validation', domain: 'chain-validate', result: chainValidate });
        } catch { /* non-fatal */ }

        ctx.reportProgress(0.8, 'Phase 4: Recommending tests...');
        try {
          const recommend = await brainExec.executeDomain('recommend');
          phases.push({ name: 'Test Recommendations', domain: 'recommend', result: recommend });
        } catch { /* non-fatal */ }

        recommendations.push(
          'Review generated code for edge cases',
          'Add unit tests for the generated functionality',
          'Run the full test suite to verify no regressions',
        );
        break;
      }
    }

    // ── Phase Final: Synthesize summary ──────────────────────────────────
    ctx.reportProgress(0.95, 'Synthesizing results...');

    const summary = [
      `Dev Jarvis completed "${taskType}" analysis with ${phases.length} phases.`,
      `${filesAnalyzed.length > 0 ? `Analyzed ${filesAnalyzed.length} files.` : ''}`,
      `${recommendations.length} recommendations generated.`,
      `${alerts.length > 0 ? `${alerts.length} alerts raised.` : 'No alerts.'}`,
    ].filter(Boolean).join(' ');

    ctx.reportProgress(1.0, 'Dev Jarvis complete');

    return {
      status: phases.length > 1 ? 'completed' : 'partial',
      taskType,
      summary,
      phases,
      recommendations,
      alerts,
      filesAnalyzed,
      generatedAt: new Date().toISOString(),
    };
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

/** All Dev Jarvis agents (currently 1, expandable) */
export const ALL_DEV_JARVIS_AGENTS: AgentDefinition[] = [
  devJarvisAgent as AgentDefinition,
];

/**
 * Register Dev Jarvis agent into an agent registry.
 *
 * @example
 * ```typescript
 * const agentRegistry = createAgentRegistry({ verbose: true });
 * registerDevJarvisAgents(agentRegistry);
 * // Dev Jarvis developer intelligence agent now registered
 * ```
 */
export function registerDevJarvisAgents(
  registry: { register: (def: AgentDefinition) => void },
): void {
  for (const agent of ALL_DEV_JARVIS_AGENTS) {
    registry.register(agent);
  }
}
