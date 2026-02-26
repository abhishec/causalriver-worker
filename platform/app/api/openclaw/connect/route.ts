/**
 * OpenClaw Connect API — Register a new gateway connection
 * ==========================================================
 *
 * POST /api/openclaw/connect
 *   Registers (or updates) an OpenClaw Gateway for the current org.
 *   Connects via WebSocket to the gateway and returns the live status.
 *
 *   Auth: Supabase session + org membership (same pattern as copilot/chat)
 *
 *   Body: {
 *     gatewayUrl: string,       // e.g. "wss://openclaw.mycompany.dev:18789"
 *     authToken: string,        // Bearer token for gateway auth
 *     organizationId: string,   // required — workspace scoping enforced
 *     webhookUrl?: string,      // optional callback URL for async events
 *     webhookToken?: string,    // optional token for webhook auth
 *   }
 *
 *   Response: { success: true, status: GatewayStatus }
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { gatewayManager } from "@/lib/openclaw/gateway-client";
import type { GatewayConfig } from "@/lib/openclaw/gateway-client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse body ───────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const {
      gatewayUrl,
      authToken,
      organizationId,
      webhookUrl,
      webhookToken,
    } = body as {
      gatewayUrl?: string;
      authToken?: string;
      organizationId?: string;
      webhookUrl?: string;
      webhookToken?: string;
    };

    if (!gatewayUrl || typeof gatewayUrl !== "string") {
      return NextResponse.json(
        { error: "gatewayUrl is required (string)" },
        { status: 400 }
      );
    }

    if (!authToken || typeof authToken !== "string") {
      return NextResponse.json(
        { error: "authToken is required (string)" },
        { status: 400 }
      );
    }

    // Basic URL validation
    try {
      new URL(gatewayUrl);
    } catch {
      return NextResponse.json(
        { error: "gatewayUrl must be a valid URL" },
        { status: 400 }
      );
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }
    const workspaceId = organizationId;

    // ── Validate membership ──────────────────────────────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id, role, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    // Platform admins can connect for any org
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

    // Only owners, admins, and platform admins can register connectors
    const allowedRoles = ["owner", "admin"];
    const isAdmin = adminCheck?.is_platform_admin === true;
    const hasMemberRole = membership && allowedRoles.includes(membership.role as string);

    if (!isAdmin && !hasMemberRole) {
      return NextResponse.json(
        { error: "Only owners and admins can register connectors" },
        { status: 403 }
      );
    }

    // ── Register gateway ─────────────────────────────────────────
    const config: GatewayConfig = {
      gatewayUrl: gatewayUrl.replace(/\/+$/, ""), // strip trailing slashes
      authToken,
      orgId: workspaceId,
      ...(webhookUrl ? { webhookUrl } : {}),
      ...(webhookToken ? { webhookToken } : {}),
    };

    const conn = await gatewayManager.registerGateway(workspaceId, config);
    const status = conn.getStatus();

    // ── Persist in org_connectors (fire-and-forget) ───────────────
    const service = await createServiceClient();
    service
      .from("org_connectors")
      .upsert(
        {
          organization_id: workspaceId,
          connector_type: "openclaw",
          instance_name: "default",
          display_name: "OpenClaw",
          status: status.connected ? "active" : "pending",
          config: {
            gatewayUrl: config.gatewayUrl,
            authToken: config.authToken,
            ...(config.webhookUrl ? { webhookUrl: config.webhookUrl } : {}),
            ...(config.webhookToken ? { webhookToken: config.webhookToken } : {}),
          },
          last_sync_at: status.connected ? new Date().toISOString() : null,
          error_message: status.connected ? null : (status.error || null),
        },
        { onConflict: "organization_id,connector_type,instance_name" }
      )
      .then(({ error: e }: { error: unknown }) => { if (e) logger.warn("[OpenClaw/Connect] upsert org_connectors failed:", e); }, (e: unknown) => { logger.warn("[OpenClaw/Connect] upsert org_connectors rejected:", e); });

    // ── Log platform event ───────────────────────────────────────
    service
      .from("platform_events")
      .insert({
        organization_id: workspaceId,
        user_id: user.id,
        event_type: "openclaw_gateway_connected",
        details: {
          gatewayUrl: config.gatewayUrl,
          connected: status.connected,
          services: status.servicesRunning,
        },
      })
      .then(({ error: e }: { error: unknown }) => { if (e) logger.warn("[OpenClaw/Connect] platform_events insert failed:", e); }, (e: unknown) => { logger.warn("[OpenClaw/Connect] platform_events insert rejected:", e); });

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error: unknown) {
    logger.error("[OpenClaw/Connect] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
