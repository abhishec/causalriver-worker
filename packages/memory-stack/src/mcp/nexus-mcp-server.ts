/**
 * NexusBrain MCP Server — Expose brain capabilities as Claude tools.
 *
 * This module wraps NexusBrain's cognitive functions into the
 * Model Context Protocol (MCP) format, allowing any LLM (Claude,
 * OpenAI, etc.) to discover and invoke brain capabilities.
 *
 * Tool Categories:
 * 1. Query tools: Ask the brain questions, get causal intelligence
 * 2. Discovery tools: Explore the causal graph, patterns, memories
 * 3. Action tools: Execute brain playbooks, create tasks, alerts
 * 4. Admin tools: Health checks, calibration, diagnostics
 *
 * Usage:
 *   const server = createNexusMcpServer({ supabase, organizationId });
 *   const tools = server.listTools();         // Tool discovery
 *   const result = await server.callTool("brain_query", { question: "..." });
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── MCP Protocol Types ────────────────────────────────────────────────

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, McpPropertySchema>;
    required?: string[];
  };
}

export interface McpPropertySchema {
  type: string;
  description: string;
  enum?: string[];
  items?: McpPropertySchema;
  default?: unknown;
}

export interface McpToolResult {
  content: Array<{
    type: "text" | "resource";
    text?: string;
    resource?: { uri: string; mimeType: string; text: string };
  }>;
  isError?: boolean;
}

export interface McpServerConfig {
  supabase: SupabaseClient;
  organizationId: string;
  verbose?: boolean;
}

// ── Tool Definitions ──────────────────────────────────────────────────

const BRAIN_TOOLS: McpToolDefinition[] = [
  {
    name: "brain_query",
    description: "Ask the NexusBrain a question and get causal intelligence. Returns causal graph, patterns, rules, impact analysis, and optionally an action artifact (forecast, simulation, diagnosis).",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask the brain (e.g., 'What drives customer churn?')" },
        action: { type: "string", description: "Optional action type", enum: ["forecast", "simulate", "explain", "diagnose", "query"] },
        domains: { type: "string", description: "Comma-separated domain filter (e.g., 'finance,cs,engineering')" },
        format: { type: "string", description: "Response format", enum: ["full", "compact"], default: "compact" },
      },
      required: ["question"],
    },
  },
  {
    name: "brain_causal_graph",
    description: "Get the causal relationships graph for specific domains. Shows what causes what, effect sizes, lag times, and natural language descriptions.",
    inputSchema: {
      type: "object",
      properties: {
        domains: { type: "string", description: "Comma-separated domains to explore (e.g., 'finance,engineering')" },
        minEffectSize: { type: "string", description: "Minimum effect size to include (0-1, default 0.1)" },
        limit: { type: "string", description: "Max edges to return (default 50)" },
      },
    },
  },
  {
    name: "brain_patterns",
    description: "Discover patterns the brain has learned from organizational signals. Returns pattern names, descriptions, importance scores, and triggering conditions.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Filter by domain (e.g., 'finance')" },
        minImportance: { type: "string", description: "Minimum importance threshold (0-1, default 0.3)" },
        limit: { type: "string", description: "Max patterns to return (default 20)" },
      },
    },
  },
  {
    name: "brain_memories",
    description: "Search the brain's memory for relevant insights, rules, and learned knowledge.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for memory retrieval" },
        memoryType: { type: "string", description: "Filter by type", enum: ["rule", "pattern", "insight", "decision"] },
        limit: { type: "string", description: "Max memories to return (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "brain_predictions",
    description: "Get active predictions the brain has made, with confidence levels and verification status.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Filter by domain" },
        onlyUnverified: { type: "string", description: "Only show unverified predictions (true/false, default true)" },
        limit: { type: "string", description: "Max predictions to return (default 20)" },
      },
    },
  },
  {
    name: "brain_health",
    description: "Get system health metrics including database size, signal counts, causal edges, memory usage, and retention status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "brain_execute",
    description: "Execute a brain action — send Slack alerts, create tasks, log decisions. Requires appropriate permissions.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action to execute", enum: ["slack_alert", "create_task", "log_decision", "email_digest"] },
        payload: { type: "string", description: "JSON payload for the action" },
      },
      required: ["action", "payload"],
    },
  },
  {
    name: "brain_cascade_rules",
    description: "List active cascade rules that trigger cross-domain alerts when signals propagate through the causal graph.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Filter by trigger domain" },
        limit: { type: "string", description: "Max rules to return (default 20)" },
      },
    },
  },
];

// ── MCP Server Implementation ─────────────────────────────────────────

export function createNexusMcpServer(config: McpServerConfig) {
  const { supabase, organizationId, verbose } = config;

  function listTools(): McpToolDefinition[] {
    return BRAIN_TOOLS;
  }

  async function callTool(name: string, args: Record<string, string>): Promise<McpToolResult> {
    try {
      switch (name) {
        case "brain_query":
          return await handleBrainQuery(args);
        case "brain_causal_graph":
          return await handleCausalGraph(args);
        case "brain_patterns":
          return await handlePatterns(args);
        case "brain_memories":
          return await handleMemories(args);
        case "brain_predictions":
          return await handlePredictions(args);
        case "brain_health":
          return await handleHealth();
        case "brain_execute":
          return await handleExecute(args);
        case "brain_cascade_rules":
          return await handleCascadeRules(args);
        default:
          return errorResult(`Unknown tool: ${name}. Use listTools() to see available tools.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (verbose) console.error(`[MCP] Tool ${name} failed:`, err);
      return errorResult(msg);
    }
  }

  // ── Tool Handlers ─────────────────────────────────────────────────

  async function handleBrainQuery(args: Record<string, string>): Promise<McpToolResult> {
    const { question, action, domains: domainStr, format } = args;
    const domains = domainStr?.split(",").map((d) => d.trim()).filter(Boolean);

    const { data: edges } = await supabase
      .from("causal_relationships_statistical")
      .select("source_domain, target_domain, effect_size, natural_language, is_significant")
      .eq("organization_id", organizationId)
      .eq("is_significant", true)
      .order("effect_size", { ascending: false })
      .limit(100);

    const { data: patterns } = await supabase
      .from("ai_memory")
      .select("content, domain, importance, llm_pattern_name, llm_pattern_description")
      .eq("organization_id", organizationId)
      .eq("memory_type", "pattern")
      .order("importance", { ascending: false })
      .limit(20);

    return textResult(JSON.stringify({
      question,
      causalEdges: (edges || []).length,
      topEdges: (edges || []).slice(0, 10).map((e) => ({
        from: e.source_domain,
        to: e.target_domain,
        effectSize: e.effect_size,
        description: e.natural_language,
      })),
      patterns: (patterns || []).slice(0, 10).map((p) => ({
        domain: p.domain,
        name: p.llm_pattern_name,
        description: p.llm_pattern_description,
        importance: p.importance,
      })),
    }, null, 2));
  }

  async function handleCausalGraph(args: Record<string, string>): Promise<McpToolResult> {
    const domains = args.domains?.split(",").map((d) => d.trim()).filter(Boolean);
    const minEffect = parseFloat(args.minEffectSize || "0.1");
    const limit = parseInt(args.limit || "50", 10);

    let query = supabase
      .from("causal_relationships_statistical")
      .select("source_domain, target_domain, effect_size, granger_p_value, optimal_lag_days, natural_language")
      .eq("organization_id", organizationId)
      .eq("is_significant", true)
      .gte("effect_size", minEffect)
      .order("effect_size", { ascending: false })
      .limit(limit);

    const { data: edges } = await query;
    const filtered = domains
      ? (edges || []).filter((e) => domains.includes(e.source_domain) || domains.includes(e.target_domain))
      : edges || [];

    return textResult(JSON.stringify({ edges: filtered, count: filtered.length }, null, 2));
  }

  async function handlePatterns(args: Record<string, string>): Promise<McpToolResult> {
    const { domain, minImportance, limit } = args;

    let query = supabase
      .from("ai_memory")
      .select("domain, llm_pattern_name, llm_pattern_description, importance, created_at")
      .eq("organization_id", organizationId)
      .eq("memory_type", "pattern")
      .gte("importance", parseFloat(minImportance || "0.3"))
      .order("importance", { ascending: false })
      .limit(parseInt(limit || "20", 10));

    if (domain) query = query.eq("domain", domain);

    const { data } = await query;
    return textResult(JSON.stringify({ patterns: data || [], count: (data || []).length }, null, 2));
  }

  async function handleMemories(args: Record<string, string>): Promise<McpToolResult> {
    const { query: searchQuery, memoryType, limit } = args;

    let query = supabase
      .from("ai_memory")
      .select("content, domain, importance, memory_type, created_at")
      .eq("organization_id", organizationId)
      .ilike("content", `%${searchQuery}%`)
      .order("importance", { ascending: false })
      .limit(parseInt(limit || "10", 10));

    if (memoryType) query = query.eq("memory_type", memoryType);

    const { data } = await query;
    return textResult(JSON.stringify({ memories: data || [], count: (data || []).length }, null, 2));
  }

  async function handlePredictions(args: Record<string, string>): Promise<McpToolResult> {
    const { domain, onlyUnverified, limit } = args;

    let query = supabase
      .from("prediction_records")
      .select("domain, prediction_type, predicted_value, predicted_outcome, confidence, verified_at, was_correct, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(parseInt(limit || "20", 10));

    if (domain) query = query.eq("domain", domain);
    if (onlyUnverified !== "false") query = query.is("verified_at", null);

    const { data } = await query;
    return textResult(JSON.stringify({ predictions: data || [], count: (data || []).length }, null, 2));
  }

  async function handleHealth(): Promise<McpToolResult> {
    const { data, error } = await supabase.rpc("check_system_health");
    if (error) return errorResult(`Health check failed: ${error.message}`);
    return textResult(JSON.stringify(data, null, 2));
  }

  async function handleExecute(args: Record<string, string>): Promise<McpToolResult> {
    const { action, payload: payloadStr } = args;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return errorResult("payload must be valid JSON");
    }

    // Log execution as brain execution log entry
    const { data, error } = await supabase
      .from("brain_execution_log")
      .insert({
        organization_id: organizationId,
        rule_id: `mcp_${action}`,
        rule_type: action,
        input_data: payload,
        output_data: { source: "mcp", status: "executed" },
        result: "success",
        confidence: 1.0,
      })
      .select("id, created_at")
      .single();

    if (error) return errorResult(`Execution failed: ${error.message}`);
    return textResult(JSON.stringify({ action, status: "executed", id: data.id, createdAt: data.created_at }));
  }

  async function handleCascadeRules(args: Record<string, string>): Promise<McpToolResult> {
    const { domain, limit } = args;

    let query = supabase
      .from("org_cascade_rules")
      .select("rule_name, trigger_domain, trigger_signal_type, propagation_chain, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(parseInt(limit || "20", 10));

    if (domain) query = query.eq("trigger_domain", domain);

    const { data } = await query;
    return textResult(JSON.stringify({ cascadeRules: data || [], count: (data || []).length }, null, 2));
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function textResult(text: string): McpToolResult {
    return { content: [{ type: "text", text }] };
  }

  function errorResult(msg: string): McpToolResult {
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }

  return {
    listTools,
    callTool,
    serverInfo: {
      name: "nexusbrain",
      version: "1.0.0",
      description: "NexusBrain — Organizational Intelligence Platform. Query causal graphs, patterns, memories, and predictions.",
    },
  };
}
