/**
 * Agent Message Bus — Agent-to-Agent Orchestration Layer
 * ======================================================
 *
 * Provides an RPC-like message bus for agents to:
 *   - Spawn child agents and await their results
 *   - Broadcast capability requests to discover available agents
 *   - Delegate sub-tasks to specialized agents
 *   - Track agent coordination chains for observability
 *
 * Architecture:
 *   AgentMessage → AgentBus.dispatch() → executeAgent() → response
 *   Parent agent spawns child → child runs L1-L30 stack → result flows back
 *
 * This sits between chain-executor (pre-defined chains) and direct
 * executeAgent() calls, enabling dynamic runtime composition.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeAgent } from "./execute";
import type { ExecuteAgentResult } from "./execute";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentMessage {
  /** Unique message ID */
  id: string;
  /** Parent agent that initiated the request (null = user/system-initiated) */
  parentAgentType?: string;
  /** Parent task ID for tracing */
  parentTaskId?: string;
  /** Target agent type to invoke */
  targetAgentType: string;
  /** The task/prompt to send */
  prompt: string;
  /** Priority: higher = execute sooner in queue */
  priority: number;
  /** Maximum time to wait (ms) */
  timeoutMs: number;
  /** Context to pass (episodic, artifacts from parent) */
  context?: AgentContext;
  /** Callback strategy */
  responseStrategy: "await" | "fire_and_forget" | "callback";
}

export interface AgentContext {
  /** Episodic context from parent agent */
  episodicContext?: string[];
  /** Artifacts from parent to share */
  artifacts?: Record<string, unknown>[];
  /** Organization-specific context */
  organizationId: string;
  /** User who originated the chain */
  userId: string;
  /** Conversation thread ID */
  conversationId?: string;
  /** Depth level for recursion protection */
  depth: number;
}

export interface AgentResponse {
  messageId: string;
  status: "completed" | "failed" | "timeout" | "rejected";
  result?: ExecuteAgentResult;
  error?: string;
  durationMs: number;
  /** Full trace of agent interactions */
  trace: AgentTraceEntry[];
}

export interface AgentTraceEntry {
  timestamp: string;
  agentType: string;
  taskId?: string;
  action: "spawned" | "completed" | "failed" | "timeout" | "delegated";
  durationMs?: number;
  confidence?: number;
  parentTaskId?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum agent delegation depth to prevent infinite recursion */
const MAX_DEPTH = 5;

/** Default timeout for agent execution (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Maximum concurrent agent executions in a single bus dispatch */
const MAX_CONCURRENT = 10;

// ── Agent Bus Implementation ───────────────────────────────────────────────

/**
 * Dispatch a single agent message and await the response.
 */
export async function dispatch(
  supabase: SupabaseClient,
  message: AgentMessage,
): Promise<AgentResponse> {
  const startTime = Date.now();
  const trace: AgentTraceEntry[] = [];

  // ── Depth guard ──────────────────────────────────────────
  const depth = message.context?.depth ?? 0;
  if (depth >= MAX_DEPTH) {
    logger.warn(`[AgentBus] Max depth (${MAX_DEPTH}) reached for ${message.targetAgentType}`);
    return {
      messageId: message.id,
      status: "rejected",
      error: `Max delegation depth (${MAX_DEPTH}) exceeded`,
      durationMs: Date.now() - startTime,
      trace,
    };
  }

  trace.push({
    timestamp: new Date().toISOString(),
    agentType: message.targetAgentType,
    action: "spawned",
    parentTaskId: message.parentTaskId,
  });

  try {
    // ── Execute with timeout ────────────────────────────────
    const timeout = message.timeoutMs || DEFAULT_TIMEOUT_MS;
    const result = await Promise.race<ExecuteAgentResult | "TIMEOUT">([
      executeAgent(supabase, {
        prompt: message.prompt,
        agentType: message.targetAgentType,
        organizationId: message.context?.organizationId || "",
        userId: message.context?.userId || "",
        autoExecuteThreshold: 0.8,
        source: "api",
        conversationId: message.context?.conversationId,
        episodicContext: message.context?.episodicContext || [],
      }),
      new Promise<"TIMEOUT">((resolve) => setTimeout(() => resolve("TIMEOUT"), timeout)),
    ]);

    if (result === "TIMEOUT") {
      trace.push({
        timestamp: new Date().toISOString(),
        agentType: message.targetAgentType,
        action: "timeout",
        durationMs: timeout,
      });
      return {
        messageId: message.id,
        status: "timeout",
        error: `Agent ${message.targetAgentType} timed out after ${timeout}ms`,
        durationMs: Date.now() - startTime,
        trace,
      };
    }

    const durationMs = Date.now() - startTime;

    trace.push({
      timestamp: new Date().toISOString(),
      agentType: message.targetAgentType,
      taskId: result.taskId,
      action: result.status === "failed" ? "failed" : "completed",
      durationMs,
      confidence: result.confidence,
    });

    // ── Persist trace to cross_domain_signals ──────────────
    if (message.context?.organizationId) {
      await supabase.from("cross_domain_signals").insert({
        organization_id: message.context.organizationId,
        source_domain: "brain.agent_bus",
        signal_type: "agent_delegation",
        signal_value: result.confidence || 0.5,
        entity_type: "agent_bus_message",
        entity_id: message.id,
        signal_metadata: {
          parentAgentType: message.parentAgentType,
          parentTaskId: message.parentTaskId,
          targetAgentType: message.targetAgentType,
          status: result.status,
          confidence: result.confidence,
          durationMs,
          depth,
          responseStrategy: message.responseStrategy,
        },
      });
      // Fire-and-forget: non-critical signal
    }

    return {
      messageId: message.id,
      status: result.status === "failed" ? "failed" : "completed",
      result,
      durationMs,
      trace,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    trace.push({
      timestamp: new Date().toISOString(),
      agentType: message.targetAgentType,
      action: "failed",
      durationMs: Date.now() - startTime,
    });
    return {
      messageId: message.id,
      status: "failed",
      error: errMsg,
      durationMs: Date.now() - startTime,
      trace,
    };
  }
}

/**
 * Dispatch multiple agent messages in parallel with concurrency limit.
 * Returns results in the same order as input messages.
 */
export async function dispatchParallel(
  supabase: SupabaseClient,
  messages: AgentMessage[],
): Promise<AgentResponse[]> {
  // Limit concurrency
  const limited = messages.slice(0, MAX_CONCURRENT);
  if (messages.length > MAX_CONCURRENT) {
    logger.warn(`[AgentBus] Capping parallel dispatch to ${MAX_CONCURRENT} (requested ${messages.length})`);
  }
  return Promise.all(limited.map(msg => dispatch(supabase, msg)));
}

/**
 * Decompose a complex task into sub-tasks and dispatch to specialized agents.
 * This is the "task decomposition" primitive for swarm intelligence.
 *
 * @param task The complex task description
 * @param availableAgents List of agent types that can be delegated to
 * @param context Shared context for all sub-tasks
 */
export async function decomposeAndDispatch(
  supabase: SupabaseClient,
  params: {
    task: string;
    decompositionAgentType?: string;
    availableAgents: string[];
    context: AgentContext;
    maxSubTasks?: number;
  },
): Promise<{ decomposition: AgentResponse; subTaskResults: AgentResponse[] }> {
  const {
    task,
    decompositionAgentType = "general",
    availableAgents,
    context,
    maxSubTasks = 5,
  } = params;

  // Step 1: Ask a coordinator agent to decompose the task
  const decompositionPrompt = [
    `You are a task decomposition coordinator. Break the following task into specific sub-tasks,`,
    `each assignable to one of these available agents: ${availableAgents.join(", ")}.`,
    ``,
    `Task: ${task}`,
    ``,
    `Return a JSON array of sub-tasks, each with:`,
    `- "agent": one of the available agent types`,
    `- "prompt": the specific sub-task prompt`,
    `- "priority": 1 (highest) to 5 (lowest)`,
    ``,
    `Maximum ${maxSubTasks} sub-tasks. Focus on the most impactful decomposition.`,
  ].join("\n");

  const decompositionMsg: AgentMessage = {
    id: `decomp_${Date.now()}`,
    targetAgentType: decompositionAgentType,
    prompt: decompositionPrompt,
    priority: 10,
    timeoutMs: 15_000,
    context: { ...context, depth: context.depth + 1 },
    responseStrategy: "await",
  };

  const decomposition = await dispatch(supabase, decompositionMsg);

  // Step 2: Parse sub-tasks from decomposition result
  let subTasks: { agent: string; prompt: string; priority: number }[] = [];
  try {
    const summary = decomposition.result?.resultSummary || "";
    // Try to extract JSON array from the response
    const jsonMatch = summary.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      subTasks = JSON.parse(jsonMatch[0]);
    }
  } catch {
    logger.warn("[AgentBus] Could not parse decomposition result, using original task");
    // Fallback: dispatch the original task to the first available agent
    subTasks = [{ agent: availableAgents[0], prompt: task, priority: 1 }];
  }

  // Step 3: Dispatch sub-tasks
  const subMessages: AgentMessage[] = subTasks
    .filter(st => availableAgents.includes(st.agent))
    .slice(0, maxSubTasks)
    .map((st, i) => ({
      id: `subtask_${Date.now()}_${i}`,
      parentAgentType: decompositionAgentType,
      parentTaskId: decomposition.result?.taskId,
      targetAgentType: st.agent,
      prompt: st.prompt,
      priority: st.priority,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      context: { ...context, depth: context.depth + 2 },
      responseStrategy: "await" as const,
    }));

  const subTaskResults = await dispatchParallel(supabase, subMessages);

  return { decomposition, subTaskResults };
}

/**
 * Create a message ID for tracing.
 */
export function createMessageId(prefix: string = "msg"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
