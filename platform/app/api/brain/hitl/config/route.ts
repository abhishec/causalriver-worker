/**
 * GET /api/brain/hitl/config
 * POST /api/brain/hitl/config
 *
 * Admin-only endpoint to read and update the HITL (Human-in-the-Loop) gate
 * configuration for the authenticated org.
 *
 * EU AI Act Article 14 — human oversight is opt-out by default for high-risk
 * AI operations. Admins/owners may adjust gate types and thresholds per org.
 *
 * POST body:
 *   {
 *     enabled?: boolean,
 *     gateTypes?: GateType[],
 *     confidenceThreshold?: number
 *   }
 *
 * Response (both GET and POST):
 *   { success: true, config: HitlGateConfig }
 *
 * Config is persisted in ai_memory:
 *   domain='brain-config', memory_type='hitl-config'
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import {
  getOrgHitlConfig,
  type HitlGateConfig,
  type GateType,
} from "@/lib/brain/hitl-gate";

// Valid gate type values (mirrors the GateType union in hitl-gate.ts)
const VALID_GATE_TYPES: GateType[] = [
  "high_confidence_action",
  "overnight_agent",
  "low_confidence",
  "policy_override",
];

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function authenticate() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { error: "Unauthorized", status: 401 } as const;
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return { error: "Unauthorized", status: 401 } as const;
  }
  if (!user) {
    return { error: "Unauthorized", status: 401 } as const;
  }

  let organizationId: string | null = null;
  try {
    organizationId = await getCurrentWorkspaceId();
  } catch {
    return { error: "Unauthorized", status: 401 } as const;
  }
  if (!organizationId) {
    return { error: "No workspace found", status: 401 } as const;
  }

  return { supabase, user, organizationId } as const;
}

async function requireAdminRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organizationId: string
): Promise<boolean> {
  try {
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    return !!membership && ["owner", "admin"].includes(membership.role);
  } catch {
    return false;
  }
}

// ── GET /api/brain/hitl/config ────────────────────────────────────────────────

export async function GET() {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, organizationId } = auth;

  try {
    const config = await getOrgHitlConfig(supabase, organizationId);
    return NextResponse.json({ success: true, config });
  } catch (err) {
    logger.warn("[hitl/config GET] Failed to load config", {
      orgId: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to load HITL config" },
      { status: 500 }
    );
  }
}

// ── POST /api/brain/hitl/config ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await authenticate();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user, organizationId } = auth;

  // Only org owners and admins may change HITL settings
  const isAdmin = await requireAdminRole(supabase, user.id, organizationId);
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Insufficient permissions — owner or admin role required" },
      { status: 403 }
    );
  }

  // ── Parse and validate body ───────────────────────────────────────────────
  let body: {
    enabled?: boolean;
    gateTypes?: string[];
    confidenceThreshold?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.enabled !== undefined &&
    typeof body.enabled !== "boolean"
  ) {
    return NextResponse.json(
      { error: "'enabled' must be a boolean" },
      { status: 400 }
    );
  }

  if (body.gateTypes !== undefined) {
    if (!Array.isArray(body.gateTypes)) {
      return NextResponse.json(
        { error: "'gateTypes' must be an array" },
        { status: 400 }
      );
    }
    const invalid = body.gateTypes.filter(
      (g) => !VALID_GATE_TYPES.includes(g as GateType)
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid gate types: ${invalid.join(", ")}. Valid types: ${VALID_GATE_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }
  }

  if (
    body.confidenceThreshold !== undefined &&
    (typeof body.confidenceThreshold !== "number" ||
      body.confidenceThreshold < 0 ||
      body.confidenceThreshold > 1)
  ) {
    return NextResponse.json(
      { error: "'confidenceThreshold' must be a number between 0 and 1" },
      { status: 400 }
    );
  }

  // ── Load current config and merge patch ──────────────────────────────────
  const currentConfig = await getOrgHitlConfig(supabase, organizationId);

  const updatedConfig: HitlGateConfig = {
    enabled: body.enabled !== undefined ? body.enabled : currentConfig.enabled,
    gateTypes:
      body.gateTypes !== undefined
        ? (body.gateTypes as GateType[])
        : currentConfig.gateTypes,
    confidenceThreshold:
      body.confidenceThreshold !== undefined
        ? body.confidenceThreshold
        : currentConfig.confidenceThreshold,
  };

  // ── Persist to ai_memory ─────────────────────────────────────────────────
  try {
    const { error: upsertErr } = await supabase.from("ai_memory").upsert(
      {
        organization_id: organizationId,
        domain: "brain-config",
        memory_type: "hitl-config",
        content: JSON.stringify(updatedConfig),
        importance: 1.0,
        last_accessed: new Date().toISOString(),
      },
      {
        onConflict: "organization_id,domain,memory_type",
      }
    );

    if (upsertErr) {
      logger.warn("[hitl/config POST] Failed to upsert config", {
        orgId: organizationId,
        error: upsertErr.message,
      });
      return NextResponse.json(
        { error: "Failed to save HITL config" },
        { status: 500 }
      );
    }

    logger.warn("[hitl/config POST] HITL config updated", {
      orgId: organizationId,
      updatedBy: user.id,
      config: updatedConfig,
    });

    return NextResponse.json({ success: true, config: updatedConfig });
  } catch (err) {
    logger.warn("[hitl/config POST] Unexpected error", {
      orgId: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
