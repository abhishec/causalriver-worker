/**
 * Agent Registry V1 — Open Claw Agent Framework
 * ===============================================
 *
 * Brain Analog: Basal Ganglia + Cerebellum (action selection + learned sequences)
 *
 * Design Philosophy: "Manus-style Open Architecture"
 *   - Creating an agent should be 5 lines of code
 *   - Agents are self-registering — just import and call register()
 *   - Every agent gets brain context automatically
 *   - Agents compose freely — an agent can call other agents
 *   - Built-in observability — every agent run is logged
 *
 * Three agent levels:
 *   1. Tool Agent — wraps a single function (e.g., "send slack message")
 *   2. Task Agent — chains multiple tools for a workflow (e.g., "triage alert")
 *   3. Autonomous Agent — uses brain context to decide its own actions
 *
 * Example — Creating a Tool Agent (5 lines):
 * ```typescript
 * const slackNotifier = defineAgent({
 *   name: 'slack-notifier',
 *   description: 'Send a message to a Slack channel',
 *   level: 'tool',
 *   execute: async (input, ctx) => {
 *     await ctx.connectors.slack.sendMessage(input.channel, input.message);
 *     return { success: true, message: 'Sent' };
 *   },
 * });
 * registry.register(slackNotifier);
 * ```
 *
 * Example — Creating a Task Agent (chains tools):
 * ```typescript
 * const triageAlert = defineAgent({
 *   name: 'triage-alert',
 *   description: 'Analyze an alert, diagnose root cause, notify the right team',
 *   level: 'task',
 *   tools: ['brain-diagnose', 'slack-notifier', 'jira-creator'],
 *   execute: async (input, ctx) => {
 *     const diagnosis = await ctx.callAgent('brain-diagnose', { domain: input.domain });
 *     const owner = diagnosis.result.owner;
 *     await ctx.callAgent('slack-notifier', { channel: owner, message: diagnosis.result.summary });
 *     await ctx.callAgent('jira-creator', { title: `Root cause: ${diagnosis.result.rootCause}` });
 *     return { triaged: true, rootCause: diagnosis.result.rootCause };
 *   },
 * });
 * ```
 *
 * Example — Creating an Autonomous Agent (uses brain):
 * ```typescript
 * const strategicAdvisor = defineAgent({
 *   name: 'strategic-advisor',
 *   description: 'Analyze cross-domain trends and proactively surface insights',
 *   level: 'autonomous',
 *   triggers: ['schedule:daily', 'event:anomaly_detected'],
 *   execute: async (input, ctx) => {
 *     const brain = ctx.brainContext;
 *     const anomalies = brain.recentAnomalies;
 *     for (const anomaly of anomalies) {
 *       const diagnosis = await ctx.callAgent('brain-diagnose', { domain: anomaly.domain });
 *       if (diagnosis.result.confidence > 0.7) {
 *         await ctx.callAgent('triage-alert', { domain: anomaly.domain });
 *       }
 *     }
 *     return { analyzed: anomalies.length, triaged: ... };
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Agent complexity level */
export type AgentLevel = 'tool' | 'task' | 'autonomous';

/** Agent execution status */
export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/** When an agent should be triggered */
export type AgentTrigger =
  | `schedule:${string}`    // Cron/interval: 'schedule:daily', 'schedule:hourly', 'schedule:*/5m'
  | `event:${string}`       // Brain event: 'event:anomaly_detected', 'event:cascade_forming'
  | `signal:${string}`      // Signal threshold: 'signal:churn_rate>0.1'
  | `agent:${string}`       // After another agent: 'agent:triage-alert:completed'
  | `manual`;               // Only triggered manually

/** The agent definition — what you write to create an agent */
export interface AgentDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique agent name (kebab-case) */
  name: string;
  /** Human-readable description (1-2 sentences) */
  description: string;
  /** Agent complexity level */
  level: AgentLevel;
  /** Version string for tracking */
  version?: string;
  /** Which domain(s) this agent operates in */
  domains?: string[];
  /** What triggers this agent to run */
  triggers?: AgentTrigger[];
  /** Other agents this agent depends on (for task/autonomous agents) */
  tools?: string[];
  /** Maximum execution time in ms (default: 60000 for tool, 300000 for task, 600000 for autonomous) */
  timeoutMs?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Input schema description (for documentation and validation) */
  inputSchema?: Record<string, string>;
  /** Output schema description */
  outputSchema?: Record<string, string>;
  /** Tags for discovery and filtering */
  tags?: string[];
  /** The agent's execute function */
  execute: (input: TInput, context: AgentExecutionContext) => Promise<TOutput>;
}

/** Runtime context provided to every agent during execution */
export interface AgentExecutionContext {
  /** Call another registered agent by name */
  callAgent: <T = unknown>(agentName: string, input: unknown) => Promise<AgentRunResult<T>>;
  /** Access to the brain's knowledge (causal edges, patterns, rules) */
  brainContext: {
    causalEdges: Array<{ source: string; target: string; effectSize: number; lagDays: number }>;
    rules: Array<{ content: string; domain: string; importance: number }>;
    patterns: Array<{ content: string; domain: string }>;
    domains: string[];
  };
  /** Access to registered connectors for motor commands */
  connectors: Record<string, unknown>;
  /** Log messages during execution */
  log: (...args: unknown[]) => void;
  /** Report progress (0-1) */
  reportProgress: (progress: number, message?: string) => void;
  /** The current agent run ID */
  runId: string;
  /** Parent agent run ID (if called by another agent) */
  parentRunId?: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/** Result of an agent run */
export interface AgentRunResult<T = unknown> {
  /** Run ID for tracking */
  runId: string;
  /** Agent name */
  agentName: string;
  /** Execution status */
  status: AgentRunStatus;
  /** The agent's output (if completed) */
  result: T;
  /** Error message (if failed) */
  error?: string;
  /** Execution duration in ms */
  durationMs: number;
  /** When the run started */
  startedAt: string;
  /** When the run completed */
  completedAt: string;
  /** Progress updates during execution */
  progressLog: Array<{ progress: number; message?: string; timestamp: string }>;
  /** Sub-agent calls made during execution */
  subAgentCalls: Array<{ agentName: string; runId: string; success: boolean; durationMs: number }>;
  /** Depth in the call chain (0 = top-level) */
  depth: number;
}

/** Registered agent with metadata */
export interface RegisteredAgent {
  /** The agent definition */
  definition: AgentDefinition;
  /** When this agent was registered */
  registeredAt: string;
  /** Total runs */
  totalRuns: number;
  /** Successful runs */
  successfulRuns: number;
  /** Failed runs */
  failedRuns: number;
  /** Average execution time (ms) */
  avgDurationMs: number;
  /** Whether this agent is currently enabled */
  enabled: boolean;
}

/** Agent registry configuration */
export interface AgentRegistryConfig {
  /** Maximum call depth (prevents infinite recursion) */
  maxCallDepth?: number;
  /** Default brain context to inject into agents */
  defaultBrainContext?: AgentExecutionContext['brainContext'];
  /** Default connectors available to agents */
  defaultConnectors?: Record<string, unknown>;
  /** Callback when any agent completes */
  onAgentCompleted?: (result: AgentRunResult) => void;
  /** Callback when any agent fails */
  onAgentFailed?: (result: AgentRunResult) => void;
  /** Verbose logging */
  verbose?: boolean;
}

// ============================================================================
// HELPER — DEFINE AGENT
// ============================================================================

/** Create an agent definition (type-safe factory function) */
export function defineAgent<TInput = unknown, TOutput = unknown>(
  definition: AgentDefinition<TInput, TOutput>,
): AgentDefinition<TInput, TOutput> {
  return {
    version: '1.0.0',
    triggers: ['manual'],
    maxRetries: definition.level === 'tool' ? 2 : 1,
    timeoutMs: definition.level === 'tool' ? 60_000 : definition.level === 'task' ? 300_000 : 600_000,
    tags: [],
    ...definition,
  };
}

// ============================================================================
// AGENT REGISTRY
// ============================================================================

/** Create the Agent Registry — the brain's workforce manager */
export function createAgentRegistry(config: AgentRegistryConfig = {}) {
  const {
    maxCallDepth = 5,
    defaultBrainContext = { causalEdges: [], rules: [], patterns: [], domains: [] },
    defaultConnectors = {},
    onAgentCompleted,
    onAgentFailed,
    verbose = false,
  } = config;

  const agents = new Map<string, RegisteredAgent>();
  const runHistory: AgentRunResult[] = [];
  let runCounter = 0;

  const log = verbose ? (...args: unknown[]) => console.log('[AgentRegistry]', ...args) : () => {};

  // ── Register Agent ──

  function register(definition: AgentDefinition): void {
    if (agents.has(definition.name)) {
      log(`Overwriting agent: ${definition.name}`);
    }
    agents.set(definition.name, {
      definition,
      registeredAt: new Date().toISOString(),
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      avgDurationMs: 0,
      enabled: true,
    });
    log(`Registered: ${definition.name} (${definition.level})`);
  }

  // ── Unregister Agent ──

  function unregister(name: string): boolean {
    return agents.delete(name);
  }

  // ── Run Agent ──

  async function runAgent<T = unknown>(
    name: string,
    input: unknown,
    options: {
      brainContext?: AgentExecutionContext['brainContext'];
      connectors?: Record<string, unknown>;
      parentRunId?: string;
      depth?: number;
    } = {},
  ): Promise<AgentRunResult<T>> {
    const agent = agents.get(name);
    if (!agent) {
      return {
        runId: `run_${Date.now()}_${++runCounter}`,
        agentName: name,
        status: 'failed',
        result: null as unknown as T,
        error: `Agent "${name}" not found. Available agents: ${Array.from(agents.keys()).join(', ')}`,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        progressLog: [],
        subAgentCalls: [],
        depth: options.depth || 0,
      };
    }

    if (!agent.enabled) {
      return {
        runId: `run_${Date.now()}_${++runCounter}`,
        agentName: name,
        status: 'failed',
        result: null as unknown as T,
        error: `Agent "${name}" is disabled`,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        progressLog: [],
        subAgentCalls: [],
        depth: options.depth || 0,
      };
    }

    const depth = options.depth || 0;
    if (depth >= maxCallDepth) {
      return {
        runId: `run_${Date.now()}_${++runCounter}`,
        agentName: name,
        status: 'failed',
        result: null as unknown as T,
        error: `Maximum call depth (${maxCallDepth}) exceeded. Possible infinite recursion.`,
        durationMs: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        progressLog: [],
        subAgentCalls: [],
        depth,
      };
    }

    const runId = `run_${Date.now()}_${++runCounter}`;
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const progressLog: Array<{ progress: number; message?: string; timestamp: string }> = [];
    const subAgentCalls: Array<{ agentName: string; runId: string; success: boolean; durationMs: number }> = [];

    // Build execution context
    const context: AgentExecutionContext = {
      callAgent: async <TChild = unknown>(childName: string, childInput: unknown): Promise<AgentRunResult<TChild>> => {
        const childResult = await runAgent<TChild>(childName, childInput, {
          brainContext: options.brainContext || defaultBrainContext,
          connectors: options.connectors || defaultConnectors,
          parentRunId: runId,
          depth: depth + 1,
        });
        subAgentCalls.push({
          agentName: childName,
          runId: childResult.runId,
          success: childResult.status === 'completed',
          durationMs: childResult.durationMs,
        });
        return childResult;
      },
      brainContext: options.brainContext || defaultBrainContext,
      connectors: options.connectors || defaultConnectors,
      log: (...args: unknown[]) => log(`[${name}]`, ...args),
      reportProgress: (progress: number, message?: string) => {
        progressLog.push({ progress, message, timestamp: new Date().toISOString() });
      },
      runId,
      parentRunId: options.parentRunId,
    };

    log(`Running: ${name} (depth=${depth})`);

    try {
      // Execute with timeout
      const timeoutMs = agent.definition.timeoutMs || 60_000;
      const resultPromise = agent.definition.execute(input, context);

      const result = await Promise.race([
        resultPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Agent "${name}" timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      const runResult: AgentRunResult<T> = {
        runId,
        agentName: name,
        status: 'completed',
        result: result as T,
        durationMs: Date.now() - start,
        startedAt,
        completedAt: new Date().toISOString(),
        progressLog,
        subAgentCalls,
        depth,
      };

      // Update stats
      agent.totalRuns++;
      agent.successfulRuns++;
      agent.avgDurationMs = Math.round(
        (agent.avgDurationMs * (agent.totalRuns - 1) + runResult.durationMs) / agent.totalRuns
      );

      runHistory.push(runResult as AgentRunResult);
      if (onAgentCompleted) onAgentCompleted(runResult as AgentRunResult);

      log(`Completed: ${name} (${runResult.durationMs}ms)`);
      return runResult;

    } catch (err) {
      const runResult: AgentRunResult<T> = {
        runId,
        agentName: name,
        status: (err as Error)?.message?.includes('timed out') ? 'timeout' : 'failed',
        result: null as unknown as T,
        error: (err as Error)?.message || 'Unknown error',
        durationMs: Date.now() - start,
        startedAt,
        completedAt: new Date().toISOString(),
        progressLog,
        subAgentCalls,
        depth,
      };

      agent.totalRuns++;
      agent.failedRuns++;

      runHistory.push(runResult as AgentRunResult);
      if (onAgentFailed) onAgentFailed(runResult as AgentRunResult);

      log(`Failed: ${name} — ${runResult.error}`);
      return runResult;
    }
  }

  // ── Query Agents ──

  function listAgents(filter?: { level?: AgentLevel; domain?: string; tag?: string; enabled?: boolean }): RegisteredAgent[] {
    let result = Array.from(agents.values());
    if (filter?.level) result = result.filter(a => a.definition.level === filter.level);
    if (filter?.domain) result = result.filter(a => a.definition.domains?.includes(filter.domain!));
    if (filter?.tag) result = result.filter(a => a.definition.tags?.includes(filter.tag!));
    if (filter?.enabled !== undefined) result = result.filter(a => a.enabled === filter.enabled);
    return result;
  }

  function getAgent(name: string): RegisteredAgent | null {
    return agents.get(name) || null;
  }

  function enableAgent(name: string): boolean {
    const agent = agents.get(name);
    if (agent) { agent.enabled = true; return true; }
    return false;
  }

  function disableAgent(name: string): boolean {
    const agent = agents.get(name);
    if (agent) { agent.enabled = false; return true; }
    return false;
  }

  // ── Run History ──

  function getRunHistory(filter?: { agentName?: string; status?: AgentRunStatus; limit?: number }): AgentRunResult[] {
    let result = [...runHistory];
    if (filter?.agentName) result = result.filter(r => r.agentName === filter.agentName);
    if (filter?.status) result = result.filter(r => r.status === filter.status);
    result.reverse(); // Most recent first
    if (filter?.limit) result = result.slice(0, filter.limit);
    return result;
  }

  // ── Stats ──

  function getStats() {
    return {
      totalAgents: agents.size,
      byLevel: {
        tool: listAgents({ level: 'tool' }).length,
        task: listAgents({ level: 'task' }).length,
        autonomous: listAgents({ level: 'autonomous' }).length,
      },
      totalRuns: runHistory.length,
      successRate: runHistory.length > 0
        ? Math.round(runHistory.filter(r => r.status === 'completed').length / runHistory.length * 100)
        : 0,
      avgDurationMs: runHistory.length > 0
        ? Math.round(runHistory.reduce((sum, r) => sum + r.durationMs, 0) / runHistory.length)
        : 0,
    };
  }

  // ── Public API ──

  return {
    /** Register a new agent */
    register,
    /** Unregister an agent */
    unregister,
    /** Run an agent by name */
    runAgent,
    /** List all registered agents (with optional filter) */
    listAgents,
    /** Get a specific agent's registration */
    getAgent,
    /** Enable a disabled agent */
    enableAgent,
    /** Disable an agent (won't be runnable) */
    disableAgent,
    /** Get run history (with optional filter) */
    getRunHistory,
    /** Get registry statistics */
    getStats,
    /** Check if an agent exists */
    hasAgent: (name: string) => agents.has(name),
    /** Get all agent names */
    getAgentNames: () => Array.from(agents.keys()),
  };
}

/** Convenience type for the agent registry instance */
export type AgentRegistry = ReturnType<typeof createAgentRegistry>;
