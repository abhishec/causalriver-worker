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
import { CORE_ORG_ID } from "@/lib/org-helpers";
import { gatewayManager } from "@/lib/openclaw/gateway-client";

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
    const orgId = params.get("organizationId") || CORE_ORG_ID;

    // ── Validate membership ──────────────────────────────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    // Platform admins can access any org
    const { data: adminCheck } = !membership
      ? await supabase
          .from("org_members")
          .select("is_platform_admin")
          .eq("user_id", user.id)
          .eq("is_platform_admin", true)
          .limit(1)
          .single()
      : { data: null };

    if (!membership && !adminCheck) {
      return NextResponse.json(
        { error: "You are not a member of this organization" },
        { status: 403 }
      );
    }

    // ── Get gateway status ────────────────────────────────────────
    const status = gatewayManager.getStatus(orgId);

    return NextResponse.json(status);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[OpenClaw/Status] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
