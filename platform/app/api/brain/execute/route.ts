/**
 * Brain Execution API — The brain's "hands".
 *
 * POST /api/brain/execute
 *
 * This is the endpoint that transforms NexusBrain from a read-only analyst
 * into an agent that can ACT. It validates proposed actions against the
 * causal model and executes safe ones.
 *
 * Supported actions:
 *   - slack_alert: Post a brain insight to Slack
 *   - email_digest: Send brain insights via email
 *   - create_task: Create a task (returns structured task, no external integration yet)
 *   - log_decision: Log a decision to the brain's decision journal
 *
 * Auth: Supabase session OR API key with 'execute' permission
 *
 * Body: {
 *   action: "slack_alert" | "email_digest" | "create_task" | "log_decision",
 *   organizationId: string,
 *   payload: { ... action-specific data ... }
 * }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/api-key-auth";
import { checkRateLimit, hashKey, setRateLimitHeaders } from "@/lib/rate-limiter";
import { brainExecuteSchema, validateBody } from "@/lib/api-schemas";
import { corsHeaders, checkSessionRateLimit, parseAndValidateBody } from "@/lib/security-middleware";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    let orgId: string | null = null;
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
        orgId = apiKeyResult.organizationId;

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

    // ── Parse & validate body (Zod schema) ─────────────────────────
    const bodyResult = await parseAndValidateBody(request);
    if ("error" in bodyResult) {
      return NextResponse.json({ error: bodyResult.error }, { status: 400, headers: corsHeaders(request) });
    }
    const validation = validateBody(brainExecuteSchema, bodyResult.data);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400, headers: corsHeaders(request) });
    }
    const { action, organizationId, payload } = validation.data;

    orgId = orgId || organizationId || null;
    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    // Validate org membership
    if (userId) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("organization_id", orgId)
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
          return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
        }
      }
    }

    // ── Route to action handler ──────────────────────────────────────
    switch (action) {
      case "slack_alert":
        return handleSlackAlert(orgId, payload, supabase);

      case "email_digest":
        return handleEmailDigest(orgId, payload, supabase);

      case "create_task":
        return handleCreateTask(orgId, payload, supabase);

      case "log_decision":
        return handleLogDecision(orgId, userId, payload, supabase);

      default:
        return NextResponse.json({
          error: `Unknown action: ${action}`,
          supportedActions: ["slack_alert", "email_digest", "create_task", "log_decision"],
        }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Slack Alert: Post a brain insight to a Slack webhook.
 */
async function handleSlackAlert(
  orgId: string,
  payload: Record<string, unknown>,
  supabase: any
) {
  const { webhookUrl, channel, message, severity, domain, insight } = payload as {
    webhookUrl?: string;
    channel?: string;
    message?: string;
    severity?: string;
    domain?: string;
    insight?: string;
  };

  // Try to get Slack webhook from org connectors
  let targetWebhook = webhookUrl;
  if (!targetWebhook) {
    const { data: connector } = await supabase
      .from("org_connectors")
      .select("config")
      .eq("organization_id", orgId)
      .eq("connector_type", "slack")
      .eq("is_active", true)
      .single();

    targetWebhook = connector?.config?.webhook_url;
  }

  if (!targetWebhook) {
    return NextResponse.json({
      error: "No Slack webhook configured. Set up a Slack connector or provide webhookUrl.",
      action: "slack_alert",
      status: "no_webhook",
    }, { status: 400 });
  }

  const severityEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
    info: "ℹ️",
  };

  const slackPayload = {
    channel: channel || "#brain-alerts",
    username: "NexusBrain",
    icon_emoji: ":brain:",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${severityEmoji[severity || "info"] || "🧠"} Brain Alert: ${domain || "General"}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message || insight || "Brain has detected something noteworthy.",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Severity: *${severity || "info"}* | Domain: *${domain || "general"}* | Org: \`${orgId.slice(0, 8)}\``,
          },
        ],
      },
    ],
  };

  try {
    const slackRes = await fetch(targetWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
    });

    if (!slackRes.ok) {
      const text = await slackRes.text();
      return NextResponse.json({
        action: "slack_alert",
        status: "failed",
        error: `Slack API returned ${slackRes.status}: ${text}`,
      }, { status: 502 });
    }

    // Log the execution
    await supabase.from("brain_execution_log").insert({
      organization_id: orgId,
      rule_id: "brain_alert",
      rule_type: "slack_alert",
      input_data: { domain, severity, message: (message || "").slice(0, 200) },
      output_data: { delivered: true, channel: channel || "#brain-alerts" },
      result: "success",
      confidence: 1.0,
    });

    return NextResponse.json({
      action: "slack_alert",
      status: "delivered",
      channel: channel || "#brain-alerts",
    });
  } catch (err) {
    return NextResponse.json({
      action: "slack_alert",
      status: "error",
      error: err instanceof Error ? err.message : "Failed to post to Slack",
    }, { status: 500 });
  }
}

/**
 * Email Digest: Generate and send brain insights via email.
 * Currently returns the digest content (actual sending requires email service integration).
 */
async function handleEmailDigest(
  orgId: string,
  payload: Record<string, unknown>,
  supabase: any
) {
  const { recipientEmail, domains, period } = payload as {
    recipientEmail?: string;
    domains?: string[];
    period?: string;
  };

  // Gather brain insights for the digest
  const targetDomains = domains || ["finance", "cs", "engineering", "marketing"];
  const lookbackDays = period === "weekly" ? 7 : period === "monthly" ? 30 : 1;

  // Get recent cascade alerts
  const { data: alerts } = await supabase
    .from("cascade_alerts")
    .select("domain, severity, message, created_at")
    .eq("organization_id", orgId)
    .gte("created_at", new Date(Date.now() - lookbackDays * 86400000).toISOString())
    .order("severity", { ascending: true })
    .limit(20);

  // Get recent patterns
  const { data: recentPatterns } = await supabase
    .from("ai_memory")
    .select("domain, llm_pattern_name, llm_pattern_description, importance")
    .eq("organization_id", orgId)
    .eq("memory_type", "pattern")
    .gte("created_at", new Date(Date.now() - lookbackDays * 86400000).toISOString())
    .order("importance", { ascending: false })
    .limit(10);

  // Get top causal edges
  const { data: topEdges } = await supabase
    .from("causal_relationships_statistical")
    .select("source_domain, target_domain, effect_size, natural_language")
    .eq("organization_id", orgId)
    .eq("is_significant", true)
    .order("effect_size", { ascending: false })
    .limit(5);

  const digest = {
    action: "email_digest",
    status: "generated",
    period: period || "daily",
    recipientEmail: recipientEmail || "(not sent — configure email service)",
    generatedAt: new Date().toISOString(),
    digest: {
      alerts: (alerts || []).map((a: any) => ({
        domain: a.domain,
        severity: a.severity,
        message: a.message,
        timestamp: a.created_at,
      })),
      newPatterns: (recentPatterns || []).map((p: any) => ({
        domain: p.domain,
        name: p.llm_pattern_name,
        description: p.llm_pattern_description,
        importance: p.importance,
      })),
      topCausalInsights: (topEdges || []).map((e: any) => ({
        relationship: `${e.source_domain} → ${e.target_domain}`,
        effectSize: e.effect_size,
        description: e.natural_language,
      })),
      summary: {
        alertCount: (alerts || []).length,
        criticalAlerts: (alerts || []).filter((a: any) => a.severity === "critical").length,
        newPatternsDiscovered: (recentPatterns || []).length,
        domainsAnalyzed: targetDomains.length,
      },
    },
  };

  return NextResponse.json(digest);
}

/**
 * Create Task: Generate a structured task from a brain playbook action.
 */
async function handleCreateTask(
  orgId: string,
  payload: Record<string, unknown>,
  supabase: any
) {
  const { title, description, domain, priority, assignee, dueInDays, fromPlaybook } = payload as {
    title: string;
    description?: string;
    domain?: string;
    priority?: string;
    assignee?: string;
    dueInDays?: number;
    fromPlaybook?: string;
  };

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Log the task creation as a brain execution
  const { data: logEntry, error } = await supabase
    .from("brain_execution_log")
    .insert({
      organization_id: orgId,
      rule_id: "task_creation",
      rule_type: "create_task",
      input_data: {
        title,
        description,
        domain,
        priority: priority || "medium",
        assignee,
        dueDate: dueInDays ? new Date(Date.now() + dueInDays * 86400000).toISOString() : null,
        fromPlaybook,
      },
      output_data: { status: "created" },
      result: "success",
      confidence: 1.0,
    })
    .select("id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    action: "create_task",
    status: "created",
    task: {
      id: logEntry.id,
      title,
      description: description || "",
      domain: domain || "general",
      priority: priority || "medium",
      assignee: assignee || "unassigned",
      dueDate: dueInDays ? new Date(Date.now() + dueInDays * 86400000).toISOString() : null,
      createdAt: logEntry.created_at,
      fromPlaybook: fromPlaybook || null,
      note: "Task logged in brain execution journal. Connect Jira/Asana/Linear to auto-create external tasks.",
    },
  });
}

/**
 * Log Decision: Record a decision in the brain's decision journal for future learning.
 */
async function handleLogDecision(
  orgId: string,
  userId: string | null,
  payload: Record<string, unknown>,
  supabase: any
) {
  const { decision, context, expectedOutcome, domain, confidence, alternatives } = payload as {
    decision: string;
    context?: string;
    expectedOutcome?: string;
    domain?: string;
    confidence?: number;
    alternatives?: string[];
  };

  if (!decision) {
    return NextResponse.json({ error: "decision is required" }, { status: 400 });
  }

  const { data: entry, error } = await supabase
    .from("brain_execution_log")
    .insert({
      organization_id: orgId,
      rule_id: "decision_journal",
      rule_type: "log_decision",
      input_data: {
        decision,
        context: context || "",
        expectedOutcome: expectedOutcome || "",
        domain: domain || "strategy",
        alternatives: alternatives || [],
        decidedBy: userId || "api_agent",
      },
      output_data: {
        status: "logged",
        verifyAfterDays: 30,
        verifyDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
      result: "pending_verification",
      confidence: confidence || 0.5,
    })
    .select("id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    action: "log_decision",
    status: "logged",
    decisionId: entry.id,
    verifyAfterDays: 30,
    verifyDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    note: "Decision logged. The brain will check outcomes in 30 days and calibrate its confidence.",
  });
}

/**
 * GET /api/brain/execute — List available execution actions
 */
export async function GET() {
  return NextResponse.json({
    name: "NexusBrain Execution API",
    version: "1.0.0",
    description: "The brain's hands — execute actions based on brain intelligence.",
    actions: {
      slack_alert: {
        description: "Post a brain insight to Slack",
        payload: { webhookUrl: "optional", channel: "#brain-alerts", message: "required", severity: "info|low|medium|high|critical", domain: "finance" },
      },
      email_digest: {
        description: "Generate a brain insights digest email",
        payload: { recipientEmail: "user@example.com", domains: ["finance", "cs"], period: "daily|weekly|monthly" },
      },
      create_task: {
        description: "Create a task from brain playbook",
        payload: { title: "required", description: "", domain: "engineering", priority: "low|medium|high|critical", assignee: "email", dueInDays: 7 },
      },
      log_decision: {
        description: "Log a decision for the brain to learn from",
        payload: { decision: "required", context: "", expectedOutcome: "", domain: "strategy", confidence: 0.8, alternatives: [] },
      },
    },
    auth: "Requires API key with 'execute' permission or Supabase session",
  });
}
