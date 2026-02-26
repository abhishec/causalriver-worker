export const dynamic = "force-dynamic";
/**
 * GET  /api/connectors/writeback/rules
 * POST /api/connectors/writeback/rules
 *
 * Manage connector write-back rules for the current org.
 *
 * GET response:  { rules: WritebackRule[], total: number }
 * POST response: { rule: WritebackRule }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { requireOrgRole } from "@/lib/auth/check-org-role";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DomainType =
  | "pod-match"
  | "scope-creep"
  | "early-warning"
  | "incident-diagnosis"
  | "pr-review"
  | "delivery-intelligence";

export type ConnectorType = "slack" | "jira" | "github";

export type ActionType =
  | "post_message"
  | "create_ticket"
  | "create_issue"
  | "add_pr_comment";

export interface WritebackRule {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  domain_type: DomainType;
  connector_type: ConnectorType;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  condition_filter: Record<string, unknown> | null;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Required fields for creating a new rule
const REQUIRED_FIELDS: Array<keyof WritebackRule> = [
  "name",
  "domain_type",
  "connector_type",
  "action_type",
  "action_config",
];

const VALID_DOMAIN_TYPES: DomainType[] = [
  "pod-match",
  "scope-creep",
  "early-warning",
  "incident-diagnosis",
  "pr-review",
  "delivery-intelligence",
];

const VALID_CONNECTOR_TYPES: ConnectorType[] = ["slack", "jira", "github"];

const VALID_ACTION_TYPES: ActionType[] = [
  "post_message",
  "create_ticket",
  "create_issue",
  "add_pr_comment",
];

// ---------------------------------------------------------------------------
// GET /api/connectors/writeback/rules
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest) {
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
      return NextResponse.json({ rules: [], total: 0 }, { status: 200 });
    }

    const { data, error } = await supabase
      .from("connector_writeback_rules")
      .select(
        "id, organization_id, name, description, domain_type, connector_type, action_type, action_config, condition_filter, enabled, created_by, created_at, updated_at"
      )
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.warn("[writeback/rules/GET] Query error:", error.message);
      return NextResponse.json({ rules: [], total: 0 }, { status: 200 });
    }

    const rules = data ?? [];
    return NextResponse.json({ rules, total: rules.length });
  } catch (err) {
    logger.error("[writeback/rules/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/connectors/writeback/rules
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: "No workspace found" }, { status: 403 });
    }

    // Only admin or owner may create write-back rules
    const { allowed } = await requireOrgRole(supabase, user.id, workspaceId, ["admin", "owner"]);
    if (!allowed) {
      return NextResponse.json(
        { error: "Only workspace admins can manage write-back rules" },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate required fields
    for (const field of REQUIRED_FIELDS) {
      if (body[field] === undefined || body[field] === null || body[field] === "") {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    const {
      name,
      description,
      domain_type,
      connector_type,
      action_type,
      action_config,
      condition_filter,
      enabled,
    } = body as {
      name: string;
      description?: string;
      domain_type: DomainType;
      connector_type: ConnectorType;
      action_type: ActionType;
      action_config: Record<string, unknown>;
      condition_filter?: Record<string, unknown> | null;
      enabled?: boolean;
    };

    // Validate enum fields
    if (!VALID_DOMAIN_TYPES.includes(domain_type)) {
      return NextResponse.json(
        {
          error: `Invalid domain_type. Must be one of: ${VALID_DOMAIN_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!VALID_CONNECTOR_TYPES.includes(connector_type)) {
      return NextResponse.json(
        {
          error: `Invalid connector_type. Must be one of: ${VALID_CONNECTOR_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!VALID_ACTION_TYPES.includes(action_type)) {
      return NextResponse.json(
        {
          error: `Invalid action_type. Must be one of: ${VALID_ACTION_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (typeof action_config !== "object" || Array.isArray(action_config)) {
      return NextResponse.json(
        { error: "action_config must be a JSON object" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("connector_writeback_rules")
      .insert({
        organization_id: workspaceId,
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        domain_type,
        connector_type,
        action_type,
        action_config,
        condition_filter: condition_filter ?? null,
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        created_by: user.id,
        created_at: now,
        updated_at: now,
      })
      .select(
        "id, organization_id, name, description, domain_type, connector_type, action_type, action_config, condition_filter, enabled, created_by, created_at, updated_at"
      )
      .single();

    if (insertError || !inserted) {
      logger.error("[writeback/rules/POST] Insert error:", insertError?.message);
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to create rule" },
        { status: 500 }
      );
    }

    logger.warn(
      `[writeback/rules/POST] Created rule "${inserted.name}" (${inserted.id}) for org ${workspaceId}`
    );

    return NextResponse.json({ rule: inserted }, { status: 201 });
  } catch (err) {
    logger.error("[writeback/rules/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
