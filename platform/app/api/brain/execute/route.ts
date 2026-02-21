/**
 * Brain Execution API — The brain's "hands" (Motor Cortex)
 *
 * POST /api/brain/execute
 *
 * This endpoint enables the brain to ACT through motor commands.
 * It validates proposed actions against the causal model and executes them.
 *
 * V2: Now uses BrainCommander with enableMotorCommands=true for unified execution.
 *
 * Supported actions:
 *   - slack_alert: Post a brain insight to Slack
 *   - email_digest: Send brain insights via email
 *   - create_task: Create a task (returns structured task)
 *   - log_decision: Log a decision to the brain's decision journal
 *   - github_pr_comment: Post comment on GitHub PR
 *   - jira_issue: Create Jira issue
 *
 * Auth: Supabase session OR API key with 'execute' permission
 *
 * Body: {
 *   command: string,           // Natural language command: "Post this to Slack: X"
 *   action?: string,            // Optional explicit action type
 *   organizationId?: string,
 *   payload?: object,           // Action-specific data
 * }
 */

import { createClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/api-key-auth";
import { checkRateLimit, hashKey, setRateLimitHeaders } from "@/lib/rate-limiter";
import { corsHeaders, checkSessionRateLimit, parseAndValidateBody } from "@/lib/security-middleware";
import { NextRequest, NextResponse } from "next/server";
import { CORE_WORKSPACE_ID } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    let workspaceId: string | null = null;
    let userId: string | null = null;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      userId = user.id;
      // Session rate limit for browser users
      const sessionRL = checkSessionRateLimit(user.id, "/api/brain/execute");
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
        if (!apiKeyResult.permissions.includes("execute")) {
          return NextResponse.json({ error: "API key lacks execute permission" }, { status: 403 });
        }
        workspaceId = apiKeyResult.organizationId;

        // ── Enforce rate limit ──────────────────────────────────────
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

    // ── Parse & validate body ─────────────────────────────────────────
    const bodyResult = await parseAndValidateBody(request);
    if ("error" in bodyResult) {
      return NextResponse.json({ error: bodyResult.error }, { status: 400, headers: corsHeaders(request) });
    }

    const { command, action, organizationId, payload } = bodyResult.data as {
      command?: string;
      action?: string;
      organizationId?: string;
      payload?: Record<string, unknown>;
    };

    // Either command or action is required
    if (!command && !action) {
      return NextResponse.json(
        { error: "Either 'command' (natural language) or 'action' (explicit type) is required" },
        { status: 400 }
      );
    }

    workspaceId = workspaceId || organizationId || null;

    // Resolve org if not provided
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

    if (!workspaceId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    // Validate org membership
    if (userId) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("organization_id", workspaceId)
        .single();

      if (!membership) {
        const { data: admin } = await supabase
          .from("org_members")
          .select("is_platform_admin")
          .eq("user_id", userId)
          .eq("is_platform_admin", true)
          .limit(1)
          .single();
        if (!admin) {
          return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
        }
      }
    }

    // ── Brain Commander with Motor Commands enabled ───────────────────
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured. Contact your administrator." },
        { status: 503 }
      );
    }

    const { createBrainCommander } = await import("@nexus-ai/memory-stack");
    const commander = createBrainCommander({
      supabase,
      organizationId: workspaceId,
      anthropicApiKey,
      enableActions: true,
      enableMotorCommands: true, // KEY: Enable motor command execution
    });

    // Build the command string
    const commandStr = command || `Execute action: ${action} with payload: ${JSON.stringify(payload || {})}`;

    // Execute through brain commander
    const result = await commander.command(commandStr, {
      userId: userId || undefined,
      action,
      entityState: payload,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Brain command failed" },
        { status: 500 }
      );
    }

    // ── Build response ────────────────────────────────────────────────
    const response: Record<string, unknown> = {
      success: true,
      organizationId: workspaceId,
      dispatch: {
        route: result.dispatch.route,
        intent: result.dispatch.intent,
        domains: result.dispatch.domains,
        confidence: result.dispatch.confidence,
      },
      timing: result.timing,
    };

    // Motor commands executed
    if (result.motorCommands && result.motorCommands.length > 0) {
      response.motorCommands = result.motorCommands;
      response.commandsExecuted = result.motorCommands.length;
    }

    // Artifact from action engine
    if (result.artifact) {
      response.artifact = result.artifact;
    }

    // Cognitive stack reasoning (if available)
    if (result.cognitiveStack) {
      response.cognitiveStack = {
        narrative: (result.cognitiveStack as any).narrative,
        healthSummary: (result.cognitiveStack as any).healthSummary,
      };
    }

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    logger.error("[BrainExecute] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/brain/execute — Health check (auth required)
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    name: "Brain OS Motor Execution API",
    version: "2.0.0",
    status: "operational",
  });
}
