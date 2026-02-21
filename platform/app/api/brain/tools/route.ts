/**
 * Brain Tool Definitions + Execution API — MCP / OpenAI Function Calling / Claude Tools
 *
 * GET  /api/brain/tools — Returns tool schemas for any agent framework
 * POST /api/brain/tools — Execute a tool by name (MCP-compatible tool invocation)
 *
 * These tool definitions follow the OpenAI function calling format, which is
 * compatible with Claude's tool_use, LangChain, CrewAI, and other frameworks.
 *
 * The POST endpoint uses the NexusBrain MCP Server from @nexus-ai/memory-stack
 * to actually execute tools — connecting the previously orphaned MCP server to
 * a live API endpoint.
 *
 * Auth: Supabase session OR API key (Bearer nxb_...)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/api-key-auth";
import { checkRateLimit, hashKey, setRateLimitHeaders } from "@/lib/rate-limiter";
import { corsHeaders, checkSessionRateLimit, parseAndValidateBody } from "@/lib/security-middleware";
import { CORE_WORKSPACE_ID } from "@/lib/workspace-helpers";

export const dynamic = 'force-dynamic';

const NEXUS_BRAIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "nexus_brain_query",
      description:
        "Query the Brain OS causal knowledge graph. Returns causal relationships, " +
        "patterns, impact analysis, and cascade paths for any business domain. " +
        "Use this to understand WHY things happen in an organization — root causes, " +
        "downstream effects, and cross-domain cascades.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The business question to analyze (e.g., 'What drives customer churn?' or 'Why is revenue declining?')",
          },
          domains: {
            type: "array",
            items: { type: "string" },
            description: "Optional: filter to specific domains (finance, growth, cs, marketing, product, strategy, engineering, people, revenue)",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nexus_brain_forecast",
      description:
        "Generate a causal forecast using the brain's trained knowledge graph. " +
        "Returns predicted values with confidence intervals, driver analysis, and " +
        "the causal reasoning behind the prediction. The forecast uses real " +
        "effect sizes and lag days discovered by the brain's 3-paradigm causal discovery engine (Parametric APEX + Structural PC/VarLiNGAM + Information-Theoretic Transfer Entropy, resolved by a Bayesian judge).",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "What to forecast (e.g., 'Forecast revenue for next quarter' or 'Predict churn trend for 6 months')",
          },
          entityState: {
            type: "object",
            description: "Optional: current metrics for context (e.g., { arr: 5000000, churnRate: 0.08, nps: 42 })",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nexus_brain_simulate",
      description:
        "Run a counterfactual simulation ('what-if' analysis) through the causal graph. " +
        "Traces cascade effects across domains and estimates impact timeline. " +
        "Example: 'What if we increase pricing 15%?' → traces through churn, revenue, " +
        "support load, and estimates total business impact over time.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The what-if scenario to simulate (e.g., 'What if we cut marketing spend by 30%?')",
          },
          entityState: {
            type: "object",
            description: "Optional: current metrics for baseline (e.g., { monthlyMarketingSpend: 50000, cac: 120 })",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nexus_brain_diagnose",
      description:
        "Diagnose a business anomaly or problem using root cause analysis through " +
        "the causal graph. Identifies upstream causes, triggered business rules, " +
        "and recommends corrective actions with an execution playbook.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The problem to diagnose (e.g., 'Why did support costs spike 40% this month?')",
          },
          entityState: {
            type: "object",
            description: "Optional: current metrics that show the problem (e.g., { supportCostMonthly: 45000, ticketVolume: 1200 })",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nexus_brain_explain",
      description:
        "Get a detailed causal explanation for a business concept or relationship. " +
        "Uses the brain's discovered causal edges with real statistical evidence " +
        "(effect sizes, p-values, lag days) to explain HOW things are connected.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "What to explain (e.g., 'How does engineering velocity affect revenue?' or 'Explain the relationship between NPS and churn')",
          },
        },
        required: ["question"],
      },
    },
  },
];

export async function GET() {
  return NextResponse.json({
    name: "Brain OS",
    version: "1.0.0",
    description:
      "Causal intelligence engine that understands organizations as living systems. " +
      "Trained on cross-domain signals with 3-paradigm causal discovery (APEX + PC/VarLiNGAM + Transfer Entropy). " +
      "Query, forecast, simulate, diagnose, and explain any business question.",
    tools: NEXUS_BRAIN_TOOLS,
    endpoint: "/api/brain/tools",
    auth: {
      type: "bearer",
      description: "Use API key: Authorization: Bearer nxb_...",
    },
    usage: {
      note: "POST to /api/brain/tools with { toolName, arguments } to execute a tool.",
      example: {
        method: "POST",
        url: "/api/brain/tools",
        headers: { Authorization: "Bearer nxb_your_key_here", "Content-Type": "application/json" },
        body: { toolName: "brain_query", arguments: { question: "What drives customer churn?" } },
      },
    },
  });
}

/**
 * POST /api/brain/tools — Execute a brain tool via the MCP Server
 *
 * Body: {
 *   toolName: string,        // e.g., "brain_query", "brain_causal_graph", "brain_patterns"
 *   arguments: object,       // Tool-specific arguments
 *   organizationId?: string, // Optional org override
 * }
 *
 * Returns the MCP tool result.
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    let workspaceId: string | null = null;
    let userId: string | null = null;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      userId = user.id;
      const sessionRL = checkSessionRateLimit(user.id, "/api/brain/tools");
      if (!sessionRL.allowed) {
        return NextResponse.json(
          { error: "Too many requests. Please slow down." },
          { status: 429, headers: { ...corsHeaders(request), "Retry-After": "60" } }
        );
      }
    } else {
      const authHeader = request.headers.get("authorization");
      const apiKeyResult = await validateApiKey(authHeader);
      if (apiKeyResult) {
        if (!apiKeyResult.permissions.includes("read")) {
          return NextResponse.json({ error: "API key lacks read permission" }, { status: 403 });
        }
        workspaceId = apiKeyResult.organizationId;

        const rawKey = authHeader!.replace("Bearer ", "");
        const rateLimitResult = await checkRateLimit(
          hashKey(rawKey),
          apiKeyResult.rateLimitPerMinute
        );
        if (!rateLimitResult.allowed) {
          const res = NextResponse.json(
            { error: rateLimitResult.error, retryAfter: rateLimitResult.resetAt.toISOString() },
            { status: 429 }
          );
          setRateLimitHeaders(res.headers, rateLimitResult, apiKeyResult.rateLimitPerMinute);
          return res;
        }
      } else {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // ── Parse body ───────────────────────────────────────────────────
    const bodyResult = await parseAndValidateBody(request);
    if ("error" in bodyResult) {
      return NextResponse.json({ error: bodyResult.error }, { status: 400, headers: corsHeaders(request) });
    }

    const { toolName, arguments: toolArgs, organizationId } = bodyResult.data as {
      toolName: string;
      arguments: Record<string, unknown>;
      organizationId?: string;
    };

    if (!toolName || typeof toolName !== "string") {
      return NextResponse.json({ error: "toolName is required" }, { status: 400 });
    }

    // Resolve org
    if (!workspaceId) {
      workspaceId = organizationId || null;
      if (!workspaceId && userId) {
        const { data: membership } = await supabase
          .from("org_members")
          .select("organization_id")
          .eq("user_id", userId)
          .order("joined_at", { ascending: true })
          .limit(1)
          .single();
        workspaceId = membership?.organization_id || CORE_WORKSPACE_ID;
      }
    }

    if (!workspaceId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    // Validate org membership when user explicitly provides an org
    if (userId && organizationId) {
      const { data: toolsMembership } = await supabase
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("organization_id", workspaceId)
        .single();

      if (!toolsMembership) {
        const { data: toolsAdmin } = await supabase
          .from("org_members")
          .select("is_platform_admin")
          .eq("user_id", userId)
          .eq("is_platform_admin", true)
          .limit(1)
          .single();

        if (!toolsAdmin) {
          return NextResponse.json(
            { error: "Not a member of this organization" },
            { status: 403 }
          );
        }
      }
    }

    // ── MCP Server: Execute tool ─────────────────────────────────────
    const { createNexusMcpServer } = await import("@nexus-ai/memory-stack");
    const mcpServer = createNexusMcpServer({
      supabase,
      organizationId: workspaceId,
    });

    const result = await mcpServer.callTool(toolName, (toolArgs || {}) as Record<string, string>);

    return NextResponse.json({
      toolName,
      result,
      organizationId: workspaceId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
