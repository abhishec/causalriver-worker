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
  | `command:${string}`     // User command: 'command:build_balance_sheet', 'command:run_audit'
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
    causalEdges: Array<{
      source: string; target: string; effectSize: number; lagDays: number;
      metric?: string; pValue?: number; coefficientSign?: number;
    }>;
    rules: Array<{ content: string; domain: string; importance: number }>;
    patterns: Array<{ content: string; domain: string }>;
    domains: string[];
  };
  /** Access to registered connectors for motor commands */
  connectors: Record<string, unknown>;
  /**
   * Brain execution interface — allows agents to invoke brain action domains
   * (forecast, simulate, explain, diagnose, etc.) directly.
   *
   * Provided by the orchestrator when running brain-native agents.
   * Agents should check for `undefined` before using.
   */
  brainExecution?: {
    /** Execute an action domain by name */
    executeDomain: (domainName: string, overrides?: Record<string, unknown>) => Promise<unknown>;
    /** Get available action domains */
    getAvailableDomains: () => string[];
    /** Get brain stats */
    getBrainStats: () => Record<string, unknown>;
    /** Format result for prompt */
    formatForPrompt: (domainName: string, result: unknown) => string;
  };
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
  /** Brain execution interface for brain-native agents */
  brainExecution?: AgentExecutionContext['brainExecution'];
  /** Supabase client for loading brain context from database */
  supabase?: unknown;
  /** Organization ID for loading brain context */
  organizationId?: string;
  /** Callback when any agent completes */
  onAgentCompleted?: (result: AgentRunResult) => void;
  /** Callback when any agent fails */
  onAgentFailed?: (result: AgentRunResult) => void;
  /** Verbose logging */
  verbose?: boolean;
}

// ============================================================================
// EVENT BUS — Cross-Agent Communication
// ============================================================================

/** Event types for inter-agent communication */
export type AgentEvent =
  | { type: 'agent_completed'; agentName: string; runId: string; result: unknown }
  | { type: 'agent_failed'; agentName: string; runId: string; error: string }
  | { type: 'signal_ingested'; domain: string; count: number }
  | { type: 'anomaly_detected'; domain: string; metric: string; severity: string }
  | { type: 'training_completed'; agentName: string; signalsStored: number; packsProcessed: number };

type EventListener = (event: AgentEvent) => void;

/** Simple in-memory event bus for agent triggers */
export function createAgentEventBus() {
  const listeners = new Map<string, Set<EventListener>>();

  function on(eventType: string, listener: EventListener): () => void {
    if (!listeners.has(eventType)) listeners.set(eventType, new Set());
    listeners.get(eventType)!.add(listener);
    return () => listeners.get(eventType)?.delete(listener);
  }

  function emit(event: AgentEvent): void {
    const typeListeners = listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try { listener(event); } catch { /* swallow listener errors */ }
      }
    }
    // Also emit to wildcard listeners
    const wildcardListeners = listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try { listener(event); } catch { /* swallow */ }
      }
    }
  }

  return { on, emit };
}

export type AgentEventBus = ReturnType<typeof createAgentEventBus>;

// ============================================================================
// SIGNAL LOADER — Loads brain context from database
// ============================================================================

/**
 * Load causal edges from the database into brainContext format.
 * This bridges the gap between git-trained data in Supabase and agent runtime.
 */
export async function loadBrainContextFromDatabase(
  supabase: any,
  organizationId: string,
): Promise<AgentExecutionContext['brainContext']> {
  const context: AgentExecutionContext['brainContext'] = {
    causalEdges: [],
    rules: [],
    patterns: [],
    domains: [],
  };

  try {
    // 1. Load causal edges from causal_edges table
    const { data: edges } = await supabase
      .from('causal_edges')
      .select('source_domain, target_domain, effect_size, lag_days, p_value, coefficient_sign, metric')
      .eq('organization_id', organizationId)
      .order('effect_size', { ascending: false })
      .limit(200);

    if (edges && edges.length > 0) {
      context.causalEdges = edges.map((e: any) => ({
        source: e.source_domain,
        target: e.target_domain,
        metric: e.metric,
        effectSize: e.effect_size ?? 0,
        lagDays: e.lag_days ?? 0,
        pValue: e.p_value,
        coefficientSign: e.coefficient_sign,
      }));

      // Extract unique domains from edges
      const domainSet = new Set<string>();
      for (const e of edges) {
        if (e.source_domain) domainSet.add(e.source_domain);
        if (e.target_domain) domainSet.add(e.target_domain);
      }
      context.domains = Array.from(domainSet);
    }

    // 2. Load active rules from brain_rules table
    const { data: rules } = await supabase
      .from('brain_rules')
      .select('content, domain, importance, title')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('importance', { ascending: false })
      .limit(100);

    if (rules && rules.length > 0) {
      context.rules = rules.map((r: any) => ({
        content: r.content || r.title || '',
        domain: r.domain || 'general',
        importance: r.importance ?? 0.5,
      }));
    }

    // 3. Load patterns from brain_patterns table
    const { data: patterns } = await supabase
      .from('brain_patterns')
      .select('content, domain, name')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (patterns && patterns.length > 0) {
      context.patterns = patterns.map((p: any) => ({
        content: p.content || p.name || '',
        domain: p.domain || 'general',
      }));
    }
  } catch {
    // Graceful degradation — return empty context if DB fails
  }

  return context;
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
    brainExecution: defaultBrainExecution,
    supabase: supabaseClient,
    organizationId: configOrgId,
    onAgentCompleted,
    onAgentFailed,
    verbose = false,
  } = config;

  const agents = new Map<string, RegisteredAgent>();
  const runHistory: AgentRunResult[] = [];
  let runCounter = 0;
  let cachedBrainContext: AgentExecutionContext['brainContext'] | null = null;
  let brainContextLoadedAt = 0;
  const BRAIN_CONTEXT_TTL = 5 * 60 * 1000; // Cache for 5 minutes

  const eventBus = createAgentEventBus();

  const log = verbose ? (...args: unknown[]) => console.log('[AgentRegistry]', ...args) : () => {};

  // ── Load Brain Context (with caching) ──

  async function getBrainContext(): Promise<AgentExecutionContext['brainContext']> {
    const now = Date.now();
    if (cachedBrainContext && (now - brainContextLoadedAt) < BRAIN_CONTEXT_TTL) {
      return cachedBrainContext;
    }

    if (supabaseClient && configOrgId) {
      try {
        cachedBrainContext = await loadBrainContextFromDatabase(supabaseClient, configOrgId);
        brainContextLoadedAt = now;
        log(`Brain context loaded: ${cachedBrainContext.causalEdges.length} edges, ${cachedBrainContext.rules.length} rules, ${cachedBrainContext.patterns.length} patterns`);
        return cachedBrainContext;
      } catch {
        log('Failed to load brain context from DB, using default');
      }
    }
    return defaultBrainContext;
  }

  /** Invalidate brain context cache (e.g., after training) */
  function invalidateBrainContext(): void {
    cachedBrainContext = null;
    brainContextLoadedAt = 0;
    log('Brain context cache invalidated');
  }

  // ── Trigger Evaluation ──

  function evaluateTrigger(trigger: AgentTrigger, event: AgentEvent): boolean {
    if (trigger === 'manual') return false; // Manual-only agents never auto-trigger

    // Agent completion triggers: 'agent:git-code-trainer:completed'
    if (trigger.startsWith('agent:') && event.type === 'agent_completed') {
      const parts = trigger.slice(6).split(':'); // ['git-code-trainer', 'completed']
      return parts[0] === event.agentName && (parts[1] === undefined || parts[1] === 'completed');
    }

    // Event triggers: 'event:anomaly_detected'
    if (trigger.startsWith('event:') && event.type === trigger.slice(6)) {
      return true;
    }

    // Training completed triggers
    if (trigger.startsWith('agent:') && event.type === 'training_completed') {
      const agentName = trigger.slice(6).split(':')[0];
      return agentName === event.agentName;
    }

    return false;
  }

  /** Find agents that should trigger for a given event */
  function getTriggeredAgents(event: AgentEvent): RegisteredAgent[] {
    return Array.from(agents.values()).filter(agent => {
      if (!agent.enabled) return false;
      return agent.definition.triggers?.some(t => evaluateTrigger(t, event)) ?? false;
    });
  }

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

    // Load brain context (from DB if available, otherwise use provided or default)
    const activeBrainContext = options.brainContext || await getBrainContext();

    // Build execution context
    const context: AgentExecutionContext = {
      callAgent: async <TChild = unknown>(childName: string, childInput: unknown): Promise<AgentRunResult<TChild>> => {
        const childResult = await runAgent<TChild>(childName, childInput, {
          brainContext: activeBrainContext,
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
      brainContext: activeBrainContext,
      connectors: options.connectors || defaultConnectors,
      brainExecution: defaultBrainExecution,
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

      // Emit event for inter-agent communication
      const completionEvent: AgentEvent = {
        type: 'agent_completed',
        agentName: name,
        runId,
        result: result,
      };
      eventBus.emit(completionEvent);

      // Auto-trigger dependent agents (non-blocking)
      const triggeredAgents = getTriggeredAgents(completionEvent);
      if (triggeredAgents.length > 0) {
        log(`Triggering ${triggeredAgents.length} dependent agents after ${name} completed`);
        for (const triggered of triggeredAgents) {
          // Fire-and-forget — don't block the current agent
          runAgent(triggered.definition.name, { triggeredBy: name, triggerEvent: completionEvent })
            .catch(err => log(`Triggered agent ${triggered.definition.name} failed: ${err}`));
        }
      }

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

      // Emit failure event
      eventBus.emit({
        type: 'agent_failed',
        agentName: name,
        runId,
        error: runResult.error || 'Unknown error',
      });

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
    /** Event bus for inter-agent communication */
    eventBus,
    /** Emit an event to trigger dependent agents */
    emitEvent: (event: AgentEvent) => {
      eventBus.emit(event);
      // Also evaluate triggers
      const triggered = getTriggeredAgents(event);
      for (const agent of triggered) {
        runAgent(agent.definition.name, { triggeredBy: event.type, triggerEvent: event })
          .catch(err => log(`Event-triggered agent ${agent.definition.name} failed: ${err}`));
      }
    },
    /** Invalidate brain context cache (call after training) */
    invalidateBrainContext,
    /** Get current brain context (loads from DB if configured) */
    getBrainContext,
  };
}

/** Convenience type for the agent registry instance */
export type AgentRegistry = ReturnType<typeof createAgentRegistry>;
