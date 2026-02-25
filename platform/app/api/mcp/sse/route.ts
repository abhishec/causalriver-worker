/**
 * MCP SSE Endpoint — NexusBrain Brain-as-a-Service
 * =================================================
 *
 * Exposes 15 Brain tools via the Model Context Protocol (MCP) over
 * Server-Sent Events (SSE). Any MCP-compatible agent framework
 * (OpenClaw, Claude Code, Cursor, OpenHands, LangGraph, etc.)
 * can connect and use the Brain as an intelligence layer.
 *
 * Protocol:
 *   GET  /api/mcp/sse           → SSE stream (tool discovery + responses)
 *   POST /api/mcp/sse           → JSON-RPC tool invocations
 *
 * Auth:
 *   Authorization: Bearer nxb_<key>
 *
 * Tools (15):
 *   Core:   brain_query, brain_forecast, brain_simulate, brain_diagnose, brain_explain
 *   SE-aaS: brain_pr_review, brain_test_generate, brain_impact_analysis, brain_jira_context
 *   AAAS:   brain_accounting_statements, brain_accounting_reconcile, brain_accounting_tax,
 *           brain_accounting_anomaly, brain_accounting_audit
 *   Action: brain_execute (GitHub/Jira/Slack motor commands)
 */

import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-key-auth";
import { checkRateLimit, hashKey, setRateLimitHeaders } from "@/lib/rate-limiter";
import { createServiceClient } from "@/lib/supabase/server";
import { checkWorkspaceResources, incrementResource, decrementResource } from "@/lib/workspace-resource-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for long-running tools

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

// In-memory session store — maps sessionId to transport state.
// In a single Vercel function instance, this persists across requests
// within the same invocation. For distributed deployments, replace with Redis.
const sessions = new Map<
  string,
  {
    organizationId: string;
    permissions: string[];
    messageEndpoint: string;
    createdAt: number;
  }
>();

// Clean up stale sessions every 5 minutes
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

const _cleanupTimer = setInterval(cleanupSessions, 5 * 60 * 1000);
if (typeof _cleanupTimer === "object" && "unref" in _cleanupTimer) { (_cleanupTimer as NodeJS.Timeout).unref(); }

// ============================================================================
// AUTH HELPER
// ============================================================================

async function authenticateRequest(
  request: NextRequest
): Promise<
  | { organizationId: string; permissions: string[]; rateLimitPerMinute: number; rawKey: string }
  | { error: string; status: number }
> {
  // Check query param first (SSE connections can't set headers easily)
  const authHeader =
    request.headers.get("authorization") ||
    (request.nextUrl.searchParams.get("api_key")
      ? `Bearer ${request.nextUrl.searchParams.get("api_key")}`
      : null);

  if (!authHeader || !authHeader.startsWith("Bearer nxb_")) {
    return { error: "Unauthorized. Provide: Authorization: Bearer nxb_<key>", status: 401 };
  }

  const result = await validateApiKey(authHeader);
  if (!result) {
    return { error: "Invalid API key", status: 401 };
  }

  if (!result.permissions.includes("read")) {
    return { error: "API key lacks 'read' permission", status: 403 };
  }

  const rawKey = authHeader.replace("Bearer ", "");
  const rl = await checkRateLimit(hashKey(rawKey), result.rateLimitPerMinute);
  if (!rl.allowed) {
    return { error: rl.error || "Rate limit exceeded", status: 429 };
  }

  return { ...result, rawKey };
}

// ============================================================================
// GET — SSE Connection (MCP Protocol)
// ============================================================================

/**
 * Establishes an SSE connection. The client receives:
 * 1. An `endpoint` event with the POST URL for sending messages
 * 2. JSON-RPC responses to tool calls (sent via POST)
 *
 * This implements the MCP SSE transport protocol:
 * - Client GETs this endpoint to establish SSE stream
 * - Server sends `endpoint` event with message URL
 * - Client POSTs JSON-RPC messages to that URL
 * - Server sends responses back over the SSE stream
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Week 7: Check org resource limits before allowing new connection
  try {
    const service = await createServiceClient();
    const resourceCheck = await checkWorkspaceResources(service, auth.organizationId, "mcp_connection");
    if (!resourceCheck.ok) {
      return NextResponse.json(
        { error: resourceCheck.reason },
        { status: 429 }
      );
    }
    // Increment active connection count
    await incrementResource(service, auth.organizationId, "mcp_connection");
  } catch {
    // Non-fatal: resource guard not available
  }

  // Generate session ID
  const sessionId = crypto.randomUUID();
  const messageEndpoint = `/api/mcp/sse?sessionId=${sessionId}`;

  // Store session
  sessions.set(sessionId, {
    organizationId: auth.organizationId,
    permissions: auth.permissions,
    messageEndpoint,
    createdAt: Date.now(),
  });

  // Periodic cleanup
  cleanupSessions();

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send the message endpoint event (MCP SSE protocol)
      controller.enqueue(
        encoder.encode(`event: endpoint\ndata: ${messageEndpoint}\n\n`)
      );

      // Send server info as first message
      const serverInfo = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {
          serverInfo: {
            name: "nexusbrain",
            version: "1.0.0",
          },
          capabilities: {
            tools: { listChanged: false },
          },
        },
      };
      controller.enqueue(
        encoder.encode(`event: message\ndata: ${JSON.stringify(serverInfo)}\n\n`)
      );

      // Keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30_000);

      // Store the controller and cleanup in session for POST handler to use
      (sessions.get(sessionId) as any)._controller = controller;
      (sessions.get(sessionId) as any)._keepAlive = keepAlive;
    },
    cancel() {
      const session = sessions.get(sessionId) as any;
      if (session?._keepAlive) clearInterval(session._keepAlive);
      sessions.delete(sessionId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      // CORS for external agents
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

// ============================================================================
// POST — JSON-RPC Message Handler (MCP Protocol)
// ============================================================================

export async function POST(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  // If no session, authenticate directly (stateless mode)
  let workspaceId: string;
  let permissions: string[];
  let controller: ReadableStreamDefaultController | null = null;

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    workspaceId = session.organizationId;
    permissions = session.permissions;
    controller = (session as any)._controller || null;
  } else {
    // Stateless mode: authenticate from header
    const auth = await authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    workspaceId = auth.organizationId;
    permissions = auth.permissions;
  }

  // Parse JSON-RPC request
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null },
      { status: 400 }
    );
  }

  const { method, params, id } = body;

  // Route JSON-RPC methods
  let response: any;
  try {
    switch (method) {
      case "initialize":
        response = handleInitialize(id);
        break;
      case "tools/list":
        response = handleToolsList(id);
        break;
      case "tools/call":
        // Week 7: Check daily tool call limit
        try {
          const svc = await createServiceClient();
          const toolCheck = await checkWorkspaceResources(svc, workspaceId, "tool_call");
          if (!toolCheck.ok) {
            response = {
              jsonrpc: "2.0",
              error: { code: -32000, message: toolCheck.reason || "Tool call limit reached" },
              id,
            };
            break;
          }
          await incrementResource(svc, workspaceId, "tool_call");
        } catch {
          // Non-fatal: resource guard not available
        }
        response = await handleToolCall(id, params, workspaceId, permissions);
        break;
      case "ping":
        response = { jsonrpc: "2.0", result: {}, id };
        break;
      default:
        response = {
          jsonrpc: "2.0",
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        };
    }
  } catch (err) {
    response = {
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : "Internal error",
      },
      id,
    };
  }

  // If we have an SSE controller, also push the response over SSE
  if (controller) {
    try {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`event: message\ndata: ${JSON.stringify(response)}\n\n`)
      );
    } catch {
      // SSE stream may have closed — that's OK
    }
  }

  return NextResponse.json(response, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

// ============================================================================
// OPTIONS — CORS preflight
// ============================================================================

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// ============================================================================
// JSON-RPC HANDLERS
// ============================================================================

function handleInitialize(id: string | number) {
  return {
    jsonrpc: "2.0",
    result: {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: "nexusbrain",
        version: "1.0.0",
      },
    },
    id,
  };
}

function handleToolsList(id: string | number) {
  return {
    jsonrpc: "2.0",
    result: { tools: BRAIN_MCP_TOOLS },
    id,
  };
}

async function handleToolCall(
  id: string | number,
  params: { name: string; arguments?: Record<string, unknown> },
  organizationId: string,
  permissions: string[]
) {
  const { name, arguments: args = {} } = params;

  // Permission check for write tools
  if (name === "brain_execute" && !permissions.includes("execute_motor_commands") && !permissions.includes("write")) {
    return {
      jsonrpc: "2.0",
      result: {
        content: [{ type: "text", text: "Error: API key lacks 'execute_motor_commands' permission for brain_execute" }],
        isError: true,
      },
      id,
    };
  }

  // Find and execute the tool
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return {
      jsonrpc: "2.0",
      result: {
        content: [{ type: "text", text: `Error: Unknown tool '${name}'. Use tools/list to discover available tools.` }],
        isError: true,
      },
      id,
    };
  }

  try {
    const result = await handler(args, organizationId);
    return {
      jsonrpc: "2.0",
      result: {
        content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
      },
      id,
    };
  } catch (err) {
    return {
      jsonrpc: "2.0",
      result: {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : "Tool execution failed"}` }],
        isError: true,
      },
      id,
    };
  }
}

// ============================================================================
// TOOL DEFINITIONS (MCP Format)
// ============================================================================

const BRAIN_MCP_TOOLS = [
  // ── Core Brain Tools (5) ────────────────────────────────────────────
  {
    name: "brain_query",
    description:
      "Query the Brain OS causal knowledge graph. Returns causal relationships, patterns, and impact analysis. Use to understand WHY things happen — root causes, downstream effects, cross-domain cascades.",
    inputSchema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "Business question to analyze (e.g., 'What drives customer churn?')" },
        domains: { type: "string", description: "Comma-separated domain filter (finance,engineering,cs,marketing)" },
      },
      required: ["question"],
    },
  },
  {
    name: "brain_forecast",
    description:
      "Generate a causal forecast using the brain's trained knowledge graph. Returns predicted values with confidence intervals and the causal reasoning behind predictions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "What to forecast (e.g., 'Forecast revenue next quarter')" },
        entityState: { type: "object", description: "Current metrics for context (e.g., { arr: 5000000, churnRate: 0.08 })" },
      },
      required: ["question"],
    },
  },
  {
    name: "brain_simulate",
    description:
      "Run a counterfactual simulation ('what-if') through the causal graph. Traces cascade effects across domains and estimates impact timeline.",
    inputSchema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "Scenario to simulate (e.g., 'What if we increase pricing 15%?')" },
        entityState: { type: "object", description: "Current metrics for baseline" },
      },
      required: ["question"],
    },
  },
  {
    name: "brain_diagnose",
    description:
      "Diagnose a business anomaly using root cause analysis through the causal graph. Identifies upstream causes and recommends corrective actions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "Problem to diagnose (e.g., 'Why did support costs spike 40%?')" },
        entityState: { type: "object", description: "Current metrics showing the problem" },
      },
      required: ["question"],
    },
  },
  {
    name: "brain_explain",
    description:
      "Get a detailed causal explanation for how business concepts are connected, with real statistical evidence (effect sizes, p-values, lag days).",
    inputSchema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "What to explain (e.g., 'How does engineering velocity affect revenue?')" },
      },
      required: ["question"],
    },
  },

  // ── SE-aaS Tools (4) ───────────────────────────────────────────────
  {
    name: "brain_pr_review",
    description:
      "Brain-augmented code review with causal cascade business impact analysis. Analyzes PR against the brain's knowledge of past incidents, code ownership, and business impact.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repo: { type: "string", description: "Repository name (e.g., 'product-amls')" },
        prNumber: { type: "number", description: "Pull request number" },
        branch: { type: "string", description: "Target branch (e.g., 'release/6.3.4')" },
        code: { type: "string", description: "Code diff or content to review (alternative to prNumber)" },
      },
      required: [],
    },
  },
  {
    name: "brain_test_generate",
    description:
      "Generate comprehensive test suites from code analysis — edge cases, boundary conditions, negative paths. Brain-augmented with learned patterns about common defects.",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Code to generate tests for" },
        language: { type: "string", description: "Programming language (typescript, python, go, etc.)" },
        framework: { type: "string", description: "Test framework (jest, pytest, go test, etc.)" },
        branch: { type: "string", description: "Git branch for code intelligence context" },
      },
      required: ["code"],
    },
  },
  {
    name: "brain_impact_analysis",
    description:
      "Blast radius analysis tracing dependency graph paths. Shows what breaks if you change X, with risk scoring and affected services.",
    inputSchema: {
      type: "object" as const,
      properties: {
        entity: { type: "string", description: "What to analyze impact for (file path, service name, API endpoint)" },
        changeDescription: { type: "string", description: "Description of the proposed change" },
        branch: { type: "string", description: "Git branch for codebase context" },
      },
      required: ["entity"],
    },
  },
  {
    name: "brain_jira_context",
    description:
      "Get full context for a Jira issue enriched with Brain intelligence — related PRs, past incidents, causal risks, code ownership patterns, and suggested approach.",
    inputSchema: {
      type: "object" as const,
      properties: {
        issueKey: { type: "string", description: "Jira issue key (e.g., 'JIRA-1234', 'FIN-9800')" },
      },
      required: ["issueKey"],
    },
  },

  // ── AAAS Tools (5) ─────────────────────────────────────────────────
  {
    name: "brain_accounting_statements",
    description:
      "Generate financial statements — P&L, Balance Sheet, Cash Flow. GAAP/IFRS-compliant with period comparison, Brain causal intelligence overlay, and anomaly detection.",
    inputSchema: {
      type: "object" as const,
      properties: {
        statementType: { type: "string", description: "Type: 'pl' (P&L), 'balance-sheet', 'cash-flow', or 'all'", default: "all" },
        period: { type: "object", description: "Period: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }" },
        jurisdiction: { type: "string", description: "Jurisdiction code (default: SG for Singapore SFRS)", default: "SG" },
      },
    },
  },
  {
    name: "brain_accounting_reconcile",
    description:
      "Bank-to-book matching, variance identification, 3-way reconciliation across sub-ledgers. Brain-augmented with causal pattern detection for recurring discrepancies.",
    inputSchema: {
      type: "object" as const,
      properties: {
        period: { type: "object", description: "Period: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }" },
        accounts: { type: "string", description: "Comma-separated account codes to reconcile (or 'all')" },
      },
    },
  },
  {
    name: "brain_accounting_tax",
    description:
      "Tax compliance analysis — GST F5 computation, multi-jurisdiction compliance checks, deferred tax tracking. Brain intelligence detects input tax anomalies.",
    inputSchema: {
      type: "object" as const,
      properties: {
        period: { type: "object", description: "Period: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }" },
        jurisdiction: { type: "string", description: "Jurisdiction (default: SG)", default: "SG" },
        taxType: { type: "string", description: "Tax type: 'gst', 'income', 'withholding', or 'all'", default: "gst" },
      },
    },
  },
  {
    name: "brain_accounting_anomaly",
    description:
      "Detect unusual transaction patterns using Benford's Law, outlier detection, trend breaks. Brain L4 causal intelligence explains WHY anomalies occurred.",
    inputSchema: {
      type: "object" as const,
      properties: {
        period: { type: "object", description: "Period: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }" },
        sensitivity: { type: "string", description: "Detection sensitivity: 'low', 'medium', 'high'", default: "medium" },
      },
    },
  },
  {
    name: "brain_accounting_audit",
    description:
      "Audit-ready workpaper generation, control testing documentation, sampling evidence packages. Brain intelligence scores audit risk per account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        period: { type: "object", description: "Period: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }" },
        scope: { type: "string", description: "Audit scope: 'full', 'revenue', 'expenses', 'balance-sheet'", default: "full" },
      },
    },
  },

  // ── Action Tool (1) ────────────────────────────────────────────────
  {
    name: "brain_execute",
    description:
      "Execute real actions via Brain motor commands: create GitHub PRs, transition Jira issues, send Slack messages, trigger CI/CD. Requires 'execute_motor_commands' permission.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description:
            "Action type: github_create_pr, github_create_issue, github_trigger_workflow, " +
            "jira_create_issue, jira_update_issue, jira_transition_issue, jira_add_comment, " +
            "slack_send_message, slack_post_to_channel, email_send, webhook_call, " +
            "deploy_to_staging, trigger_ci_build, run_test_suite",
        },
        payload: {
          type: "object",
          description: "Action-specific payload. Examples: { repo: 'x', branch: 'y', title: 'z' } for github_create_pr",
        },
        confidence: {
          type: "number",
          description: "Confidence score (0-1). >= 0.7 auto-executes, >= 0.35 needs approval, < 0.35 dry-run only",
        },
      },
      required: ["action", "payload"],
    },
  },
];

// ============================================================================
// TOOL HANDLERS — Bridge MCP tools to existing NexusBrain infrastructure
// ============================================================================

type ToolHandler = (
  args: Record<string, unknown>,
  organizationId: string
) => Promise<unknown>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // ── Core Brain Tools ────────────────────────────────────────────────
  brain_query: async (args, orgId) => {
    const { createNexusMcpServer } = await import("@nexus-ai/memory-stack");
    const supabase = await createServiceClient();
    const server = createNexusMcpServer({ supabase, organizationId: orgId });
    const result = await server.callTool("brain_query", {
      question: String(args.question || ""),
      domains: String(args.domains || ""),
    });
    return JSON.parse(result.content[0]?.text || "{}");
  },

  brain_forecast: async (args, orgId) => {
    const { createNexusMcpServer } = await import("@nexus-ai/memory-stack");
    const supabase = await createServiceClient();
    const server = createNexusMcpServer({ supabase, organizationId: orgId });
    const result = await server.callTool("brain_query", {
      question: String(args.question || ""),
      action: "forecast",
    });
    return JSON.parse(result.content[0]?.text || "{}");
  },

  brain_simulate: async (args, orgId) => {
    const { createNexusMcpServer } = await import("@nexus-ai/memory-stack");
    const supabase = await createServiceClient();
    const server = createNexusMcpServer({ supabase, organizationId: orgId });
    const result = await server.callTool("brain_query", {
      question: String(args.question || ""),
      action: "simulate",
    });
    return JSON.parse(result.content[0]?.text || "{}");
  },

  brain_diagnose: async (args, orgId) => {
    const { createNexusMcpServer } = await import("@nexus-ai/memory-stack");
    const supabase = await createServiceClient();
    const server = createNexusMcpServer({ supabase, organizationId: orgId });
    const result = await server.callTool("brain_query", {
      question: String(args.question || ""),
      action: "diagnose",
    });
    return JSON.parse(result.content[0]?.text || "{}");
  },

  brain_explain: async (args, orgId) => {
    const { createNexusMcpServer } = await import("@nexus-ai/memory-stack");
    const supabase = await createServiceClient();
    const server = createNexusMcpServer({ supabase, organizationId: orgId });
    const result = await server.callTool("brain_query", {
      question: String(args.question || ""),
      action: "explain",
    });
    return JSON.parse(result.content[0]?.text || "{}");
  },

  // ── SE-aaS Tools ────────────────────────────────────────────────────
  brain_pr_review: async (args, orgId) => {
    const { executeDomain } = await import("@/lib/se-aas/domain-executor");
    const supabase = await createServiceClient();
    const { result, artifactId } = await executeDomain(supabase, {
      domainType: "pr-review",
      request: {
        repo: args.repo,
        prNumber: args.prNumber,
        branch: args.branch,
        code: args.code,
      },
      organizationId: orgId,
      userId: "mcp-agent",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
    return { ...result, artifactId };
  },

  brain_test_generate: async (args, orgId) => {
    const { executeDomain } = await import("@/lib/se-aas/domain-executor");
    const supabase = await createServiceClient();
    const { result, artifactId } = await executeDomain(supabase, {
      domainType: "test-case-generator",
      request: {
        code: args.code,
        language: args.language || "typescript",
        framework: args.framework || "jest",
        branch: args.branch,
      },
      organizationId: orgId,
      userId: "mcp-agent",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
    return { ...result, artifactId };
  },

  brain_impact_analysis: async (args, orgId) => {
    const { executeDomain } = await import("@/lib/se-aas/domain-executor");
    const supabase = await createServiceClient();
    const { result, artifactId } = await executeDomain(supabase, {
      domainType: "impact-analysis",
      request: {
        entity: args.entity,
        changeDescription: args.changeDescription,
        branch: args.branch,
      },
      organizationId: orgId,
      userId: "mcp-agent",
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
    return { ...result, artifactId };
  },

  brain_jira_context: async (args, orgId) => {
    const supabase = await createServiceClient();
    const issueKey = String(args.issueKey || "");

    // 1. Fetch Jira ticket details via the jarvis handler pattern
    let ticketData: any = null;
    try {
      const jiraBaseUrl = process.env.JIRA_BASE_URL;
      const jiraEmail = process.env.JIRA_EMAIL;
      const jiraApiToken = process.env.JIRA_API_TOKEN;

      if (jiraBaseUrl && jiraEmail && jiraApiToken) {
        const jiraAuth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString("base64");
        const res = await fetch(
          `${jiraBaseUrl}/rest/api/3/issue/${issueKey}?expand=renderedFields,names`,
          { headers: { Authorization: `Basic ${jiraAuth}`, Accept: "application/json" } }
        );
        if (res.ok) {
          const raw = await res.json();
          ticketData = {
            key: raw.key,
            summary: raw.fields?.summary,
            description: raw.fields?.description?.content
              ?.map((block: any) =>
                block.content?.map((c: any) => c.text).join("") || ""
              )
              .join("\n") || raw.renderedFields?.description || "",
            status: raw.fields?.status?.name,
            priority: raw.fields?.priority?.name,
            assignee: raw.fields?.assignee?.displayName,
            reporter: raw.fields?.reporter?.displayName,
            issueType: raw.fields?.issuetype?.name,
            components: raw.fields?.components?.map((c: any) => c.name) || [],
            labels: raw.fields?.labels || [],
            created: raw.fields?.created,
            updated: raw.fields?.updated,
          };
        }
      }
    } catch {
      // Jira not configured — return brain context only
    }

    // 2. Get Brain context for this issue
    const projectKey = issueKey.split("-")[0];

    const [edgesResult, patternsResult, memoriesResult] = await Promise.all([
      supabase
        .from("causal_relationships_statistical")
        .select("source_domain, target_domain, effect_size, natural_language")
        .eq("organization_id", orgId)
        .eq("is_significant", true)
        .order("effect_size", { ascending: false })
        .limit(10),
      supabase
        .from("ai_memory")
        .select("content, domain, importance, llm_pattern_name")
        .eq("organization_id", orgId)
        .eq("memory_type", "pattern")
        .order("importance", { ascending: false })
        .limit(5),
      supabase
        .from("ai_memory")
        .select("content, domain, importance")
        .eq("organization_id", orgId)
        .ilike("content", `%${projectKey}%`)
        .order("importance", { ascending: false })
        .limit(5),
    ]);

    return {
      issue: ticketData || { key: issueKey, error: "Jira not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN." },
      brainContext: {
        causalEdges: (edgesResult.data || []).map((e) => ({
          from: e.source_domain,
          to: e.target_domain,
          effectSize: e.effect_size,
          description: e.natural_language,
        })),
        patterns: (patternsResult.data || []).map((p) => ({
          name: p.llm_pattern_name,
          domain: p.domain,
          importance: p.importance,
        })),
        relatedMemories: (memoriesResult.data || []).map((m) => ({
          content: m.content,
          domain: m.domain,
          importance: m.importance,
        })),
      },
    };
  },

  // ── AAAS Tools ──────────────────────────────────────────────────────
  brain_accounting_statements: async (args, orgId) => {
    return executeAasTool("statements", args, orgId);
  },

  brain_accounting_reconcile: async (args, orgId) => {
    return executeAasTool("reconcile", args, orgId);
  },

  brain_accounting_tax: async (args, orgId) => {
    return executeAasTool("tax", args, orgId);
  },

  brain_accounting_anomaly: async (args, orgId) => {
    return executeAasTool("anomaly", args, orgId);
  },

  brain_accounting_audit: async (args, orgId) => {
    return executeAasTool("audit", args, orgId);
  },

  // ── Action Tool ─────────────────────────────────────────────────────
  brain_execute: async (args, orgId) => {
    const { createMotorCommandEngine } = await import("@nexus-ai/memory-stack");
    const supabase = await createServiceClient();
    const action = String(args.action || "");
    const payload = (args.payload || {}) as Record<string, unknown>;
    const confidence = Number(args.confidence ?? 0.5);

    // Create motor command engine with approval gate
    const engine = createMotorCommandEngine({
      autoExecuteThreshold: 0.7,
      maxCommandsPerBatch: 5,
      verbose: false,
      onCommandExecuted: async (cmd: any, result: any) => {
        // Log execution result to brain for learning
        await supabase.from("brain_execution_log").insert({
          organization_id: orgId,
          rule_id: `mcp_${action}`,
          rule_type: action,
          input_data: { ...payload, commandId: cmd.id },
          output_data: { source: "mcp-sse", confidence, result: result.status, response: result.response },
          result: result.success ? "success" : "failed",
          confidence,
        });
      },
    });

    // Load org connectors and register them
    const { data: connectors } = await supabase
      .from("org_connectors")
      .select("connector_type, config, status")
      .eq("organization_id", orgId)
      .eq("status", "active");

    // Register available connectors (the engine uses a connector registry pattern)
    // The connectors are already pre-registered in createMotorCommandEngine via
    // createConnectorRegistry(). For now, we execute with the default registry.
    // Production wiring to real GitHub/Jira/Slack connectors uses the org's
    // connector configs loaded above.

    // Build the motor command
    const command = {
      id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actionType: action as any,
      target: String(payload.target || payload.channel || payload.repo || payload.project || ""),
      parameters: payload,
      confidence,
      approvalMode: confidence >= 0.7 ? "auto" as const : confidence >= 0.35 ? "requires_approval" as const : "dry_run" as const,
      priority: "medium" as const,
      targetDomains: [action.split("_")[0]], // e.g., "github" from "github_create_pr"
      evidence: `MCP agent invoked brain_execute with confidence ${confidence}`,
      sourceArtifactType: "mcp-sse",
      expectedImpact: String(payload.description || payload.title || action),
      createdAt: new Date().toISOString(),
      timeoutMs: 30_000,
      maxRetries: 1,
    };

    // Execute the command through the motor engine
    const result = await engine.executeCommand(command);

    // Log to brain_execution_log
    await supabase.from("brain_execution_log").insert({
      organization_id: orgId,
      rule_id: `mcp_${action}`,
      rule_type: action,
      input_data: payload,
      output_data: {
        source: "mcp-sse",
        confidence,
        motorResult: {
          status: result.status,
          success: result.success,
          durationMs: result.durationMs,
        },
      },
      result: result.success ? "success" : result.status,
      confidence,
    });

    return {
      status: result.status,
      success: result.success,
      message: result.success
        ? `Action '${action}' executed successfully in ${result.durationMs}ms.`
        : `Action '${action}' ${result.status}: ${result.error || "See execution log."}`,
      executionId: command.id,
      action,
      response: result.response,
      durationMs: result.durationMs,
    };
  },
};

// ============================================================================
// AAAS HELPER — Loads GL data and executes accounting agent
// ============================================================================

async function executeAasTool(
  action: string,
  args: Record<string, unknown>,
  organizationId: string
): Promise<unknown> {
  const supabase = await createServiceClient();

  // Load GL transactions for this org (from Xero connector data)
  const { data: transactions } = await supabase
    .from("gl_transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("date", { ascending: false })
    .limit(10000);

  if (!transactions?.length) {
    return {
      error: "No GL transactions found. Connect Xero via the Connectors page first.",
      action,
    };
  }

  const { executeAccountingAgent } = await import("@/lib/aas/domain-executor");
  const result = await executeAccountingAgent(supabase, {
    action: action as any,
    organizationId,
    userId: "mcp-agent",
    transactions,
    period: args.period as any,
    jurisdiction: String(args.jurisdiction || "SG"),
  });

  return {
    ...result.result,
    agentName: result.agentName,
    timing: result.timing,
    brainMetadata: result.brainMetadata,
  };
}
