/**
 * Brain Agents — Agent Definition Registry
 * ==========================================
 *
 * GET  /api/brain/agents
 *   List all agent definitions for the current workspace.
 *   Query params:
 *     - domain (optional) — filter by task_type / domain
 *     - limit  (optional, default 50)
 *
 * POST /api/brain/agents
 *   Create a new agent definition stored in se_aas_artifacts.
 *   Body: {
 *     name: string,
 *     description?: string,
 *     domain: string,           // one of VALID_TASK_TYPES
 *     trigger?: 'manual' | 'scheduled' | 'event',
 *     schedule?: string,        // cron expression (optional)
 *     requiredInputs?: string[], // list of required context keys
 *     payload?: Record<string,unknown>, // default payload for the domain
 *   }
 */

import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Valid SE-aaS domain types that can be used as task_types ─────────────────
export const VALID_TASK_TYPES = new Set([
  "pod-match",
  "early-warning",
  "scope-creep",
  "delivery-intelligence",
  "pr-review",
  "tdd-code-generator",
  "incident-diagnosis",
  "impact-analysis",
  "sql-analyzer",
  "test-data-generator",
  "design-doc-generator",
  "codebase-qa",
  "architecture-extractor",
  // custom / general
  "custom",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shape an se_aas_artifacts row (domain_type = 'agent-definition') into
 * the canonical AgentDefinition response shape.
 */
function rowToDefinition(row: any) {
  const d = row.artifact_data ?? {};
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: d.name ?? "Unnamed Agent",
    description: d.description ?? "",
    domain: d.domain ?? "custom",
    trigger: d.trigger ?? "manual",
    schedule: d.schedule ?? null,
    requiredInputs: d.requiredInputs ?? [],
    payload: d.defaultPayload ?? {},
    status: d.status ?? "active",
    brainEnabled: d.brainEnabled ?? true,
    rlEnabled: d.rlEnabled ?? true,
    memoryTracking: d.memoryTracking ?? true,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    // Last run info — populated from agent_queue join when available
    lastRun: d.lastRun ?? null,
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Verify membership
    const member = await verifyWorkspaceMembership(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const params = req.nextUrl.searchParams;
    const domain = params.get("domain");
    const limit = Math.min(parseInt(params.get("limit") || "50", 10), 200);

    const admin = getAdminClient();

    // Fetch agent definitions (artifacts with domain_type = 'agent-definition')
    let query = admin
      .from("se_aas_artifacts")
      .select("id, organization_id, job_id, domain_type, artifact_data, metadata, created_by, created_at")
      .eq("organization_id", workspaceId)
      .eq("domain_type", "agent-definition")
      .order("created_at", { ascending: false })
      .limit(limit);

    // Domain filter: look inside artifact_data->>'domain'
    // We filter client-side after fetch since Supabase doesn't support JSONB deep-key filtering
    // in a simple `.eq()` without raw SQL.
    const { data: rows, error } = await query;

    if (error) {
      logger.error("[GET /api/brain/agents] DB error:", error);
      return NextResponse.json({ error: "Failed to list agents" }, { status: 500 });
    }

    let definitions = (rows ?? []).map(rowToDefinition);

    // Deduplicate by name — keep the most recent entry per agent name.
    // Rows are already ordered by created_at DESC so first occurrence wins.
    const seenNames = new Set<string>();
    definitions = definitions.filter((d) => {
      const key = d.name.trim().toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

    // Client-side domain filter if requested
    if (domain) {
      definitions = definitions.filter((d) => d.domain === domain);
    }

    // Fetch last run info from agent_queue for each definition
    // (best-effort: don't fail the request if this query errors)
    try {
      const agentIds = definitions.map((d) => d.id);
      if (agentIds.length > 0) {
        const { data: queueRows } = await admin
          .from("agent_queue")
          .select("id, task_type, status, started_at, completed_at, error_message, result, payload")
          .eq("organization_id", workspaceId)
          .in("agent_type", ["se-aas", "custom", "general"])
          .order("created_at", { ascending: false })
          .limit(agentIds.length * 3);

        if (queueRows && queueRows.length > 0) {
          // Map last run by matching payload.agentDefinitionId or task_type
          const lastRunByDefId = new Map<string, any>();
          for (const row of queueRows) {
            const defId = row.payload?.agentDefinitionId;
            if (defId && !lastRunByDefId.has(defId)) {
              lastRunByDefId.set(defId, {
                status: row.status,
                startedAt: row.started_at,
                completedAt: row.completed_at,
                errorMessage: row.error_message,
              });
            }
          }

          definitions = definitions.map((d) => ({
            ...d,
            lastRun: lastRunByDefId.get(d.id) ?? d.lastRun,
          }));
        }
      }
    } catch {
      // Non-fatal — last run enrichment is best-effort
    }

    return NextResponse.json({
      agents: definitions,
      total: definitions.length,
      validTaskTypes: Array.from(VALID_TASK_TYPES),
    });
  } catch (err) {
    logger.error("[GET /api/brain/agents] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Verify membership
    const member = await verifyWorkspaceMembership(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { name, description, domain, trigger, schedule, requiredInputs, payload } = body as {
      name?: string;
      description?: string;
      domain?: string;
      trigger?: string;
      schedule?: string;
      requiredInputs?: string[];
      payload?: Record<string, unknown>;
    };

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "name is required (min 2 characters)" },
        { status: 400 }
      );
    }

    if (!domain || !VALID_TASK_TYPES.has(domain)) {
      return NextResponse.json(
        {
          error: `domain must be one of: ${Array.from(VALID_TASK_TYPES).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const validTriggers = ["manual", "scheduled", "event"];
    const resolvedTrigger = trigger && validTriggers.includes(trigger) ? trigger : "manual";

    const now = new Date().toISOString();
    const agentId = crypto.randomUUID();

    const admin = getAdminClient();

    const { error: insertError } = await admin.from("se_aas_artifacts").insert({
      id: agentId,
      organization_id: workspaceId,
      job_id: null,
      domain_type: "agent-definition",
      artifact_data: {
        agentId,
        name: name.trim(),
        description: (description ?? "").trim(),
        domain,
        trigger: resolvedTrigger,
        schedule: resolvedTrigger === "scheduled" ? (schedule ?? null) : null,
        requiredInputs: Array.isArray(requiredInputs) ? requiredInputs : [],
        defaultPayload: payload ?? {},
        status: "active",
        brainEnabled: true,
        rlEnabled: true,
        memoryTracking: true,
        createdAt: now,
        createdBy: user.id,
        lastRun: null,
      },
      metadata: {
        source: "management-panel",
        agentVersion: "1.0",
      },
      created_by: user.id,
      created_at: now,
    });

    if (insertError) {
      logger.error("[POST /api/brain/agents] insert error:", insertError);
      return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
    }

    logger.warn(`[POST /api/brain/agents] Agent created: ${name.trim()} (${agentId}) for org ${workspaceId}`);

    return NextResponse.json(
      {
        id: agentId,
        name: name.trim(),
        domain,
        trigger: resolvedTrigger,
        status: "active",
        brainEnabled: true,
        rlEnabled: true,
        memoryTracking: true,
        createdAt: now,
      },
      { status: 201 }
    );
  } catch (err) {
    logger.error("[POST /api/brain/agents] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
