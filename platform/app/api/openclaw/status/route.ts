/**
 * OpenClaw Status API — Gateway connection status for the current org
 * ====================================================================
 *
 * GET /api/openclaw/status?organizationId=xxx
 *   Returns the OpenClaw gateway connection state, registered services,
 *   last-seen timestamp, and reinforcement loop service health.
 *
 *   Auth: Supabase session + org membership (same pattern as copilot/chat)
 *
 *   Response: GatewayStatus
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CORE_WORKSPACE_ID } from "@/lib/workspace-helpers";
import { gatewayManager } from "@/lib/openclaw/gateway-client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Resolve org ──────────────────────────────────────────────
    const params = request.nextUrl.searchParams;
    const workspaceId = params.get("organizationId") || CORE_WORKSPACE_ID;

    // ── Validate membership ──────────────────────────────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    // Platform admins can access any org
    const { data: adminCheck } = !membership
      ? await supabase
          .from("org_members")
          .select("is_platform_admin")
          .eq("user_id", user.id)
          .eq("is_platform_admin", true)
          .limit(1)
          .maybeSingle()
      : { data: null };

    if (!membership && !adminCheck) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // ── Get gateway status ────────────────────────────────────────
    const status = gatewayManager.getStatus(workspaceId);

    return NextResponse.json(status);
  } catch (error: unknown) {
    logger.error("[OpenClaw/Status] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
