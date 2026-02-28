/**
 * A2A Tasks — POST /api/a2a/tasks, GET /api/a2a/tasks
 * =====================================================
 * Implements the Agent-to-Agent (A2A) task submission and listing endpoints.
 *
 * POST — Submit a new A2A task. Creates an agent_queue row with agent_type='a2a'.
 * GET  — List A2A tasks for an organization (paginated).
 *
 * Auth: Bearer token — accepts SE_AAS_WORKER_SECRET (M2M) or valid Supabase JWT.
 *
 * Reference: https://google.github.io/A2A/specification/
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── A2A skill → SE-aaS domain mapping ─────────────────────────────────────
// Translates the A2A skill IDs from the agent card to the internal domain
// identifiers used by the SE-aaS domain executor.
const SKILL_TO_DOMAIN: Record<string, string> = {
  "pod-match": "pod-match",
  "early-warning": "early-warning",
  "scope-creep": "scope-creep",
  "delivery-health": "delivery-intelligence",
  // Process Engine templates — available to any workspace regardless of service activation.
  // Routes to agent_type='bpaas' (not 'a2a') so process-jobs Phase 5 picks them up.
  "hr-offboarding":           "hr_offboarding",
  "procurement":              "procurement",
  "order-management":         "order_management",
  "expense-approval":         "expense_approval",
  "customer-onboarding":      "customer_onboarding",
  "insurance-claim":          "insurance_claim",
  "invoice-reconciliation":   "invoice_reconciliation",
  "sla-breach-escalation":    "sla_breach_escalation",
  "travel-rebooking":         "travel_rebooking",
  "compliance-audit":         "compliance_audit",
  "subscription-migration":   "subscription_migration",
  "dispute-resolution":       "dispute_resolution",
  "financial-close":          "financial_close",
  "product-workflow":         "product_workflow",
  "ar-collections":           "ar_collections",
  "incident-response":        "incident_response",
  "qbr-preparation":          "qbr_preparation",
};

// Domains that route to agent_type='bpaas' (Process Engine) instead of 'a2a'
const BPAAS_DOMAINS = new Set([
  "hr_offboarding",
  "procurement",
  "order_management",
  "expense_approval",
  "customer_onboarding",
  "insurance_claim",
  "invoice_reconciliation",
  "sla_breach_escalation",
  "travel_rebooking",
  "compliance_audit",
  "subscription_migration",
  "dispute_resolution",
  "financial_close",
  "product_workflow",
  "ar_collections",
  "incident_response",
  "qbr_preparation",
]);

const VALID_SKILLS = new Set(Object.keys(SKILL_TO_DOMAIN));

// ── Auth helper ─────────────────────────────────────────────────────────────

/**
 * Authenticate an A2A request.
 * Accepts: SE_AAS_WORKER_SECRET (M2M) OR a valid Supabase JWT (user auth).
 * Returns the user ID on success, or null on failure.
 */
async function authenticateA2A(
  request: NextRequest
): Promise<{ userId: string; isWorker: boolean } | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return null;

  // 1. Accept SE_AAS_WORKER_SECRET (machine-to-machine auth)
  const workerSecret = process.env.SE_AAS_WORKER_SECRET;
  if (workerSecret && token === workerSecret) {
    return { userId: "a2a-worker", isWorker: true };
  }

  // 2. Accept valid Supabase JWT (user auth)
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      return { userId: data.user.id, isWorker: false };
    }
  } catch {
    // Supabase client may throw on Lambda cold start — fall through to reject
  }

  return null;
}

// ── POST — Submit a new A2A task ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateA2A(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
      skill?: string;
      message?: { role: string; parts: Array<{ text: string }> };
      organizationId?: string;
      sessionId?: string;
      /** Multi-turn context ID — groups related A2A tasks into a conversation thread */
      context_id?: string;
      /** Alias for context_id (camelCase variant) */
      contextId?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { skill, message, organizationId, sessionId } = body;

    // Multi-turn context support — optional, preserves backward compatibility
    const contextId = body.context_id ?? body.contextId ?? null;

    // Validate required fields
    if (!skill) {
      return NextResponse.json(
        { error: "Missing required field: skill" },
        { status: 400 }
      );
    }

    if (!VALID_SKILLS.has(skill)) {
      return NextResponse.json(
        {
          error: `Unknown skill: ${skill}. Valid skills: ${Array.from(VALID_SKILLS).join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing required field: organizationId" },
        { status: 400 }
      );
    }

    if (!message?.parts?.length) {
      return NextResponse.json(
        { error: "Missing required field: message.parts" },
        { status: 400 }
      );
    }

    // Extract the user's text from the A2A message parts
    const userText = message.parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();

    if (!userText) {
      return NextResponse.json(
        { error: "message.parts must contain at least one text part" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    // For non-worker auth, verify org membership
    if (!auth.isWorker) {
      const { data: membership } = await admin
        .from("org_members")
        .select("role")
        .eq("user_id", auth.userId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const taskSessionId = sessionId ?? crypto.randomUUID();
    const domainType = SKILL_TO_DOMAIN[skill];

    // Process Engine skills use agent_type='bpaas' so process-jobs Phase 5 picks them up.
    // All other A2A skills use agent_type='a2a'.
    const agentType = BPAAS_DOMAINS.has(domainType) ? "bpaas" : "a2a";

    // Build job payload — context_id is optional (omitted when null for backward compat)
    const jobPayload: Record<string, unknown> = {
      skill,
      message,
      userText,
      sessionId: taskSessionId,
      userId: auth.userId,
      source: "a2a",
      ...(contextId ? { context_id: contextId } : {}),
    };

    // Insert A2A task into agent_queue
    const { data: job, error: insertError } = await admin
      .from("agent_queue")
      .insert({
        organization_id: organizationId,
        agent_type: agentType,
        task_type: domainType,
        priority: 5,
        payload: jobPayload,
        status: "pending",
      })
      .select("id, created_at")
      .single();

    if (insertError || !job) {
      logger.error("[A2A /tasks POST] Failed to insert agent_queue row", {
        error: insertError?.message,
        organizationId,
        skill,
      });
      return NextResponse.json(
        { error: "Failed to submit task" },
        { status: 500 }
      );
    }

    logger.warn(`[A2A /tasks POST] Task submitted: ${job.id} skill=${skill} org=${organizationId}${contextId ? ` context=${contextId}` : ""}`);

    // Return A2A-compliant task submission response
    return NextResponse.json(
      {
        id: job.id,
        sessionId: taskSessionId,
        ...(contextId ? { context_id: contextId } : {}),
        status: {
          state: "submitted",
          timestamp: job.created_at,
        },
        skill,
        organizationId,
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    logger.error("[A2A /tasks POST] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── GET — List A2A tasks for an organization ─────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateA2A(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const organizationId = params.get("organizationId");
    const limit = Math.min(parseInt(params.get("limit") ?? "20"), 100);
    const offset = Math.max(parseInt(params.get("offset") ?? "0"), 0);
    const status = params.get("status"); // optional filter
    // Multi-turn: filter by context_id to retrieve all tasks in a conversation thread
    const contextId = params.get("context_id"); // optional filter

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing required query param: organizationId" },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    // For non-worker auth, verify org membership
    if (!auth.isWorker) {
      const { data: membership } = await admin
        .from("org_members")
        .select("role")
        .eq("user_id", auth.userId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Query agent_queue for A2A tasks belonging to this org
    let query = admin
      .from("agent_queue")
      .select(
        "id, task_type, status, payload, result, error_message, created_at, started_at, completed_at",
        { count: "exact" }
      )
      .eq("agent_type", "a2a")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    // Filter by context_id — only returns tasks that belong to this multi-turn thread
    if (contextId) {
      query = query.contains("payload", { context_id: contextId });
    }

    const { data: jobs, error, count } = await query;

    if (error) {
      logger.error("[A2A /tasks GET] Query failed", { error: error.message });
      return NextResponse.json({ error: "Failed to list tasks" }, { status: 500 });
    }

    // Map agent_queue rows to A2A TaskStatus format
    const tasks = (jobs ?? []).map((job) => mapJobToA2ATask(job));

    return NextResponse.json({
      tasks,
      pagination: {
        total: count ?? 0,
        limit,
        offset,
        hasMore: (count ?? 0) > offset + limit,
      },
    });
  } catch (err: unknown) {
    logger.error("[A2A /tasks GET] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map an agent_queue row to A2A-compliant TaskStatus object.
 *
 * agent_queue.status → A2A state mapping:
 *   pending   → submitted
 *   waiting   → submitted
 *   running   → working
 *   success   → completed
 *   error     → failed
 *   suspended → input-required  (HITL decision gate)
 */
export function mapJobToA2ATask(job: {
  id: string;
  task_type: string;
  status: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}) {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const sessionId = (payload.sessionId as string) ?? null;
  const skill = (payload.skill as string) ?? job.task_type;
  // Multi-turn: surface context_id from payload so callers can group related tasks
  const contextId = (payload.context_id as string) ?? null;

  const a2aState = mapStatusToA2AState(job.status);

  // Build state transition history
  const history: Array<{ state: string; timestamp: string }> = [
    { state: "submitted", timestamp: job.created_at },
  ];
  if (job.started_at) {
    history.push({ state: "working", timestamp: job.started_at });
  }
  if (job.completed_at) {
    history.push({ state: a2aState, timestamp: job.completed_at });
  }

  // Build artifacts from result
  const artifacts: Array<{ parts: Array<{ text: string }> }> = [];
  if (job.result && a2aState === "completed") {
    artifacts.push({
      parts: [{ text: JSON.stringify(job.result) }],
    });
  }
  if (job.error_message && a2aState === "failed") {
    artifacts.push({
      parts: [{ text: job.error_message }],
    });
  }

  // HITL: if suspended, add the escalation question as an artifact
  if (a2aState === "input-required") {
    const checkpointData = job.result as Record<string, unknown> | null;
    const question =
      checkpointData?.escalation_question as string ?? "Human input required to continue";
    const approvalUrl = `https://platform.usebrainos.com/agents?taskId=${job.id}`;
    artifacts.push({
      parts: [
        {
          text: JSON.stringify({
            inputRequired: true,
            question,
            approvalUrl,
            taskId: job.id,
          }),
        },
      ],
    });
  }

  return {
    id: job.id,
    sessionId,
    ...(contextId ? { context_id: contextId } : {}),
    skill,
    status: {
      state: a2aState,
      timestamp: job.completed_at ?? job.started_at ?? job.created_at,
    },
    artifacts,
    history,
  };
}

/**
 * Map internal agent_queue status to A2A state string.
 */
export function mapStatusToA2AState(
  status: string
): "submitted" | "working" | "completed" | "failed" | "input-required" {
  switch (status) {
    case "pending":
    case "waiting":
      return "submitted";
    case "running":
      return "working";
    case "success":
      return "completed";
    case "error":
      return "failed";
    case "suspended":
      return "input-required";
    default:
      return "submitted";
  }
}
