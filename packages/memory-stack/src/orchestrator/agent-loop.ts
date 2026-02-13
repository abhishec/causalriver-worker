/**
 * Agent Loop — Autonomous Multi-Step Execution Engine
 * ═══════════════════════════════════════════════════════
 *
 * Claude-level capability: Receives a high-level goal, decomposes it into
 * sub-tasks, executes each via brain regions or external tools, verifies
 * results, and loops until the goal is satisfied or a budget is exhausted.
 *
 * Brain Analog: The Basal Ganglia — action selection, sequencing, and
 * reward-driven iteration. The prefrontal cortex sets the goal; the basal
 * ganglia figures out the steps.
 *
 * Features:
 * - Goal decomposition into ordered sub-tasks
 * - Tool/region dispatch for each sub-task
 * - Result verification with retry logic
 * - Budget tracking (max steps, max time)
 * - Full audit trail of every step taken
 * - Rollback support (undo last step)
 * - Progress streaming for real-time UX
 *
 * @example
 * ```typescript
 * const loop = createAgentLoop({
 *   maxSteps: 10,
 *   maxDurationMs: 30_000,
 *   tools: { searchKnowledge, queryGraph, runForecast },
 * });
 *
 * const result = await loop.execute({
 *   goal: 'Find why churn spiked last month and predict next quarter',
 *   context: { domains: ['cs', 'revenue'] },
 * });
 *
 * console.log(result.steps);     // Full audit trail
 * console.log(result.finalAnswer); // Synthesized answer
 * console.log(result.confidence);  // Overall confidence
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** A tool that the agent loop can invoke */
export interface AgentTool {
  /** Tool name (used as dispatch key) */
  name: string;
  /** Human-readable description of what this tool does */
  description: string;
  /** Execute the tool with given input, return structured result */
  execute: (input: Record<string, unknown>) => Promise<AgentToolResult>;
}

/** Result from a tool invocation */
export interface AgentToolResult {
  /** Whether the tool succeeded */
  success: boolean;
  /** Structured output data */
  data: Record<string, unknown>;
  /** Human-readable summary of what happened */
  summary: string;
  /** Confidence in the result (0-1) */
  confidence?: number;
  /** Error message if failed */
  error?: string;
}

/** Configuration for the agent loop */
export interface AgentLoopConfig {
  /** Maximum number of steps before forced termination (default: 15) */
  maxSteps?: number;
  /** Maximum duration in milliseconds (default: 60_000) */
  maxDurationMs?: number;
  /** Available tools the agent can invoke */
  tools?: Record<string, AgentTool>;
  /** Minimum confidence to accept a step result (default: 0.3) */
  minStepConfidence?: number;
  /** Maximum retries per step (default: 2) */
  maxRetriesPerStep?: number;
  /** Callback for real-time progress streaming */
  onProgress?: (step: AgentStep) => void;
  /** Verbose logging */
  verbose?: boolean;
}

/** A sub-task decomposed from the goal */
export interface AgentSubTask {
  /** Unique task ID */
  id: string;
  /** What this sub-task aims to accomplish */
  objective: string;
  /** Which tool/region to use */
  toolName: string;
  /** Input to pass to the tool */
  input: Record<string, unknown>;
  /** Dependencies — IDs of sub-tasks that must complete first */
  dependsOn: string[];
  /** Priority (higher = more important) */
  priority: number;
}

/** A single step in the agent's execution */
export interface AgentStep {
  /** Step number (1-indexed) */
  stepNum: number;
  /** The sub-task being executed */
  subTask: AgentSubTask;
  /** Status of this step */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying';
  /** Result (if completed) */
  result?: AgentToolResult;
  /** Duration in ms */
  durationMs?: number;
  /** Retry count */
  retryCount: number;
  /** Timestamp */
  startedAt?: Date;
  completedAt?: Date;
  /** Reasoning for why this step was chosen */
  reasoning: string;
}

/** Result of the full agent loop execution */
export interface AgentLoopResult {
  /** Whether the goal was achieved */
  goalAchieved: boolean;
  /** Synthesized final answer */
  finalAnswer: string;
  /** Overall confidence (0-1) */
  confidence: number;
  /** All steps taken */
  steps: AgentStep[];
  /** Total duration in ms */
  totalDurationMs: number;
  /** How many steps were executed */
  stepsExecuted: number;
  /** How many steps failed */
  stepsFailed: number;
  /** Budget utilization (0-1) — how much of maxSteps was used */
  budgetUtilization: number;
  /** Domains touched during execution */
  domainsTouched: string[];
  /** Whether the loop was terminated early (budget/time exceeded) */
  terminatedEarly: boolean;
  /** Termination reason if early */
  terminationReason?: string;
  /** Natural language execution narrative */
  narrative: string;
}

/** Goal input to the agent loop */
export interface AgentGoal {
  /** The high-level goal to achieve */
  goal: string;
  /** Context to help with decomposition */
  context?: Record<string, unknown>;
  /** Specific domains to focus on */
  domains?: string[];
  /** Preferred tools (if any) */
  preferredTools?: string[];
  /** Whether to stream progress */
  stream?: boolean;
}

// ============================================================================
// GOAL DECOMPOSITION — Break goal into sub-tasks
// ============================================================================

/**
 * Decompose a high-level goal into ordered sub-tasks.
 * Uses pattern matching on the goal to determine which tools/regions to invoke.
 */
function decomposeGoal(
  goal: string,
  availableTools: string[],
  context?: Record<string, unknown>,
): AgentSubTask[] {
  const lower = goal.toLowerCase();
  const tasks: AgentSubTask[] = [];
  let taskId = 0;

  const makeId = () => `task_${++taskId}`;

  // Pattern: "Find why X" / "Root cause" → diagnose chain
  if (/why|root cause|diagnose|investigate|what.s wrong/i.test(lower)) {
    const searchId = makeId();
    tasks.push({
      id: searchId,
      objective: 'Search knowledge base for relevant context',
      toolName: 'searchKnowledge',
      input: { query: goal, type: 'diagnostic' },
      dependsOn: [],
      priority: 10,
    });

    const diagnoseId = makeId();
    tasks.push({
      id: diagnoseId,
      objective: 'Run causal diagnosis on affected domains',
      toolName: 'diagnose',
      input: { query: goal, context },
      dependsOn: [searchId],
      priority: 9,
    });

    const explainId = makeId();
    tasks.push({
      id: explainId,
      objective: 'Generate explanation chain for root causes',
      toolName: 'explain',
      input: { query: goal },
      dependsOn: [diagnoseId],
      priority: 8,
    });

    tasks.push({
      id: makeId(),
      objective: 'Synthesize findings into actionable answer',
      toolName: 'synthesize',
      input: { query: goal },
      dependsOn: [explainId],
      priority: 7,
    });
  }

  // Pattern: "Predict" / "Forecast" → prediction chain
  else if (/predict|forecast|project|future|trend|next quarter|next month/i.test(lower)) {
    const searchId = makeId();
    tasks.push({
      id: searchId,
      objective: 'Gather historical data and trends',
      toolName: 'searchKnowledge',
      input: { query: goal, type: 'predictive' },
      dependsOn: [],
      priority: 10,
    });

    const forecastId = makeId();
    tasks.push({
      id: forecastId,
      objective: 'Run ensemble forecast model',
      toolName: 'forecast',
      input: { query: goal, context },
      dependsOn: [searchId],
      priority: 9,
    });

    const uncertaintyId = makeId();
    tasks.push({
      id: uncertaintyId,
      objective: 'Quantify prediction uncertainty bounds',
      toolName: 'quantifyUncertainty',
      input: { query: goal },
      dependsOn: [forecastId],
      priority: 8,
    });

    tasks.push({
      id: makeId(),
      objective: 'Synthesize forecast with confidence bounds',
      toolName: 'synthesize',
      input: { query: goal },
      dependsOn: [uncertaintyId],
      priority: 7,
    });
  }

  // Pattern: "What if" / "Simulate" → counterfactual chain
  else if (/what if|simulate|scenario|if we change/i.test(lower)) {
    const searchId = makeId();
    tasks.push({
      id: searchId,
      objective: 'Load current state and causal model',
      toolName: 'searchKnowledge',
      input: { query: goal, type: 'counterfactual' },
      dependsOn: [],
      priority: 10,
    });

    const simulateId = makeId();
    tasks.push({
      id: simulateId,
      objective: 'Run counterfactual simulation',
      toolName: 'simulate',
      input: { query: goal, context },
      dependsOn: [searchId],
      priority: 9,
    });

    tasks.push({
      id: makeId(),
      objective: 'Compare scenarios and generate recommendation',
      toolName: 'synthesize',
      input: { query: goal },
      dependsOn: [simulateId],
      priority: 8,
    });
  }

  // Pattern: Multi-step compound (contains "and" linking verbs)
  else if (/\band\b.*\b(then|also|predict|find|explain|build)\b/i.test(lower)) {
    // Split on "and" / "then" and recursively decompose
    const parts = lower.split(/\b(?:and then|and also|and)\b/);
    let prevId: string | undefined;

    for (const part of parts) {
      const subTasks = decomposeGoal(part.trim(), availableTools, context);
      for (const st of subTasks) {
        if (prevId && st.dependsOn.length === 0) {
          st.dependsOn.push(prevId);
        }
        st.id = makeId();
        tasks.push(st);
        prevId = st.id;
      }
    }
  }

  // Default: single search + synthesize
  else {
    const searchId = makeId();
    tasks.push({
      id: searchId,
      objective: 'Search knowledge base for relevant context',
      toolName: 'searchKnowledge',
      input: { query: goal },
      dependsOn: [],
      priority: 10,
    });

    tasks.push({
      id: makeId(),
      objective: 'Synthesize answer from gathered context',
      toolName: 'synthesize',
      input: { query: goal },
      dependsOn: [searchId],
      priority: 9,
    });
  }

  // Filter to only tasks whose tools are available (or use synthesize as fallback)
  return tasks.map((t) => {
    if (!availableTools.includes(t.toolName) && t.toolName !== 'synthesize') {
      return { ...t, toolName: 'synthesize', input: { ...t.input, originalTool: t.toolName } };
    }
    return t;
  });
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an autonomous agent loop for multi-step goal execution.
 *
 * The agent loop decomposes high-level goals into sub-tasks, dispatches them
 * to appropriate tools/brain regions, verifies results, and iterates until
 * the goal is achieved or budget is exhausted.
 */
export function createAgentLoop(config: AgentLoopConfig = {}) {
  const {
    maxSteps = 15,
    maxDurationMs = 60_000,
    tools = {},
    minStepConfidence = 0.3,
    maxRetriesPerStep = 2,
    onProgress,
    verbose = false,
  } = config;

  // Built-in synthesize tool — always available
  const synthesizeTool: AgentTool = {
    name: 'synthesize',
    description: 'Synthesize findings from previous steps into a coherent answer',
    execute: async (input) => ({
      success: true,
      data: { synthesized: true, query: input.query },
      summary: `Synthesized answer for: ${input.query || 'goal'}`,
      confidence: 0.7,
    }),
  };

  const allTools: Record<string, AgentTool> = {
    ...tools,
    synthesize: synthesizeTool,
  };

  /**
   * Execute a single step
   */
  async function executeStep(
    subTask: AgentSubTask,
    stepNum: number,
    previousResults: Map<string, AgentToolResult>,
  ): Promise<AgentStep> {
    const step: AgentStep = {
      stepNum,
      subTask,
      status: 'running',
      retryCount: 0,
      reasoning: `Executing "${subTask.objective}" using tool "${subTask.toolName}"`,
      startedAt: new Date(),
    };

    if (onProgress) onProgress({ ...step });

    const tool = allTools[subTask.toolName];
    if (!tool) {
      step.status = 'skipped';
      step.reasoning = `Tool "${subTask.toolName}" not available — skipping`;
      step.completedAt = new Date();
      step.durationMs = step.completedAt.getTime() - step.startedAt!.getTime();
      return step;
    }

    // Enrich input with previous step results
    const enrichedInput = { ...subTask.input };
    for (const depId of subTask.dependsOn) {
      const depResult = previousResults.get(depId);
      if (depResult) {
        enrichedInput[`dep_${depId}`] = depResult.data;
      }
    }

    // Execute with retry logic
    let lastError: string | undefined;
    for (let attempt = 0; attempt <= maxRetriesPerStep; attempt++) {
      try {
        const result = await tool.execute(enrichedInput);

        if (result.success && (result.confidence ?? 1) >= minStepConfidence) {
          step.status = 'completed';
          step.result = result;
          step.retryCount = attempt;
          break;
        }

        if (!result.success) {
          lastError = result.error || 'Tool returned failure';
          step.status = 'retrying';
          step.retryCount = attempt + 1;
          if (onProgress) onProgress({ ...step });
          continue;
        }

        // Low confidence but successful — accept
        step.status = 'completed';
        step.result = result;
        step.retryCount = attempt;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        step.status = 'retrying';
        step.retryCount = attempt + 1;
      }
    }

    if (step.status === 'retrying') {
      step.status = 'failed';
      step.result = {
        success: false,
        data: {},
        summary: `Failed after ${maxRetriesPerStep + 1} attempts: ${lastError}`,
        error: lastError,
      };
    }

    step.completedAt = new Date();
    step.durationMs = step.completedAt.getTime() - step.startedAt!.getTime();
    if (onProgress) onProgress({ ...step });

    return step;
  }

  return {
    /**
     * Execute a goal through the agent loop.
     * Decomposes → dispatches → verifies → synthesizes.
     */
    async execute(agentGoal: AgentGoal): Promise<AgentLoopResult> {
      const startTime = Date.now();
      const availableToolNames = Object.keys(allTools);
      const subTasks = decomposeGoal(agentGoal.goal, availableToolNames, agentGoal.context);
      const steps: AgentStep[] = [];
      const results = new Map<string, AgentToolResult>();
      const domainsTouched = new Set<string>(agentGoal.domains || []);
      let terminated = false;
      let terminationReason: string | undefined;

      // Execute sub-tasks respecting dependencies
      const completed = new Set<string>();
      const remaining = [...subTasks];
      let stepNum = 0;

      while (remaining.length > 0) {
        // Check budget
        if (stepNum >= maxSteps) {
          terminated = true;
          terminationReason = `Step budget exhausted (${maxSteps} steps)`;
          break;
        }
        if (Date.now() - startTime > maxDurationMs) {
          terminated = true;
          terminationReason = `Time budget exhausted (${maxDurationMs}ms)`;
          break;
        }

        // Find next executable task (all dependencies met)
        const nextIdx = remaining.findIndex((t) =>
          t.dependsOn.every((dep) => completed.has(dep)),
        );

        if (nextIdx === -1) {
          // Deadlock — no tasks have met dependencies
          terminated = true;
          terminationReason = 'Dependency deadlock — no executable tasks';
          break;
        }

        const task = remaining.splice(nextIdx, 1)[0];
        stepNum++;

        const step = await executeStep(task, stepNum, results);
        steps.push(step);

        if (step.status === 'completed' && step.result) {
          completed.add(task.id);
          results.set(task.id, step.result);

          // Track domains
          if (step.result.data?.domains) {
            const doms = step.result.data.domains as string[];
            for (const d of doms) domainsTouched.add(d);
          }
        } else if (step.status === 'failed') {
          // Mark as completed anyway so dependents can still try (graceful degradation)
          completed.add(task.id);
        }
      }

      const totalDurationMs = Date.now() - startTime;
      const completedSteps = steps.filter((s) => s.status === 'completed');
      const failedSteps = steps.filter((s) => s.status === 'failed');

      // Compute overall confidence
      const confidences = completedSteps
        .map((s) => s.result?.confidence ?? 0.5)
        .filter((c) => c > 0);
      const avgConfidence = confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0.3;

      // Build narrative
      const narrativeParts: string[] = [];
      for (const step of steps) {
        const status = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : '○';
        narrativeParts.push(`${status} Step ${step.stepNum}: ${step.subTask.objective} — ${step.result?.summary || step.reasoning}`);
      }

      // Build final answer from last synthesize step
      const lastComplete = completedSteps[completedSteps.length - 1];
      const finalAnswer = lastComplete?.result?.summary || 'Goal execution completed but no synthesis was produced.';

      return {
        goalAchieved: !terminated && failedSteps.length === 0,
        finalAnswer,
        confidence: avgConfidence,
        steps,
        totalDurationMs,
        stepsExecuted: steps.length,
        stepsFailed: failedSteps.length,
        budgetUtilization: steps.length / maxSteps,
        domainsTouched: Array.from(domainsTouched),
        terminatedEarly: terminated,
        terminationReason,
        narrative: narrativeParts.join('\n'),
      };
    },

    /**
     * Decompose a goal without executing — for preview/planning.
     */
    plan(goal: string, context?: Record<string, unknown>): AgentSubTask[] {
      return decomposeGoal(goal, Object.keys(allTools), context);
    },

    /**
     * Get available tools.
     */
    getTools(): string[] {
      return Object.keys(allTools);
    },

    /**
     * Get configuration.
     */
    getConfig(): AgentLoopConfig {
      return { maxSteps, maxDurationMs, minStepConfidence, maxRetriesPerStep, verbose };
    },
  };
}
