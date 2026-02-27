/**
 * OpenClaw Services API — List and manage running OpenClaw services
 * ==================================================================
 *
 * GET /api/openclaw/services?organizationId=xxx
 *   Lists all running OpenClaw services for the org (reinforcement loop
 *   daemons, proactive services, etc.) via gateway RPC.
 *
 *   Auth: Supabase session + org membership (same pattern as copilot/chat)
 *
 *   Response: { services: ServiceInfo[] }
 *
 * PATCH /api/openclaw/services
 *   Trigger, start, or stop a specific OpenClaw service via gateway RPC.
 *
 *   Body: {
 *     organizationId?: string,
 *     serviceId: string,
 *     action: "trigger" | "start" | "stop",
 *   }
 *
 *   Response: { success: true, serviceId: string, result: unknown }
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { gatewayManager } from "@/lib/openclaw/gateway-client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ============================================================================
// Known NexusBrain services — human-readable names
// ============================================================================

const SERVICE_NAMES: Record<string, string> = {
  "nexusbrain-outcome-collector": "Outcome Collector",
  "nexusbrain-feedback-agent": "Feedback Agent",
  "nexusbrain-anomaly-watchdog": "Anomaly Watchdog",
  "nexusbrain-consolidation-runner": "Consolidation Runner",
  "nexusbrain-signal-harvester": "Signal Harvester",
  "nexusbrain-tech-debt-alarm": "Tech Debt Alarm",
  "nexusbrain-reconciliation-runner": "Reconciliation Runner",
  "nexusbrain-cash-flow-prophet": "Cash Flow Prophet",
};

// ============================================================================
// GET — List all running services
// ============================================================================

export async function GET(request: NextRequest) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    // ── Resolve org ──────────────────────────────────────────────
    const params = request.nextUrl.searchParams;
    const workspaceId = params.get("organizationId");
    if (!workspaceId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

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

    // ── Get connection ────────────────────────────────────────────
    const conn = gatewayManager.getConnection(workspaceId);

    if (!conn || !conn.isConnected()) {
      // Return service IDs from the status (if any are known)
      const status = gatewayManager.getStatus(workspaceId);
      const services = status.servicesRunning.map((id: string) => ({
        id,
        name: SERVICE_NAMES[id] || id,
        status: "unknown" as const,
        lastRun: null,
        nextRun: null,
        stats: {},
      }));

      return NextResponse.json({
        services,
        source: "status_cache",
        message: !conn
          ? "No OpenClaw gateway configured for this organization"
          : "Gateway not currently connected",
      });
    }

    // ── Query services via RPC ───────────────────────────────────
    try {
      const rpcResult = await conn.send("nexusbrain.services", {}) as {
        services?: Array<{
          id: string;
          status: string;
          lastRun?: string;
          nextRun?: string;
          runCount?: number;
          stats?: Record<string, unknown>;
        }>;
      };

      const services = (rpcResult?.services || []).map((svc) => ({
        id: svc.id,
        name: SERVICE_NAMES[svc.id] || svc.id,
        status: svc.status || "unknown",
        lastRun: svc.lastRun || null,
        nextRun: svc.nextRun || null,
        runCount: svc.runCount || 0,
        stats: svc.stats || {},
      }));

      return NextResponse.json({ services });
    } catch (rpcError) {
      // Fallback to status data if RPC fails
      const status = conn.getStatus();
      const services = status.servicesRunning.map((id: string) => ({
        id,
        name: SERVICE_NAMES[id] || id,
        status: "unknown" as const,
        lastRun: null,
        nextRun: null,
        stats: {},
      }));

      return NextResponse.json({ services, source: "health_fallback" });
    }
  } catch (error: unknown) {
    logger.error("[OpenClaw/Services] GET Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ============================================================================
// PATCH — Trigger, start, or stop a service
// ============================================================================

export async function PATCH(request: NextRequest) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

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
      serviceId,
      action,
      organizationId,
    } = body as {
      serviceId?: string;
      action?: string;
      organizationId?: string;
    };

    if (!serviceId || typeof serviceId !== "string") {
      return NextResponse.json(
        { error: "serviceId is required (string)" },
        { status: 400 }
      );
    }

    const validActions = ["trigger", "start", "stop"];
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }
    const workspaceId = organizationId;

    // ── Validate membership ──────────────────────────────────────
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id, role, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    // Platform admins can manage any org
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

    // Only owners, admins, and platform admins can toggle services
    const allowedRoles = ["owner", "admin"];
    const isAdmin = adminCheck?.is_platform_admin === true;
    const hasMemberRole = membership && allowedRoles.includes(membership.role as string);

    if (!isAdmin && !hasMemberRole) {
      return NextResponse.json(
        { error: "Only owners and admins can manage services" },
        { status: 403 }
      );
    }

    // ── Get connection ────────────────────────────────────────────
    const conn = gatewayManager.getConnection(workspaceId);

    if (!conn || !conn.isConnected()) {
      return NextResponse.json(
        { error: "No active OpenClaw gateway connection" },
        { status: 404 }
      );
    }

    // ── Send RPC to trigger/start/stop ────────────────────────────
    const rpcMethodMap: Record<string, string> = {
      trigger: "nexusbrain.trigger",
      start: "services.start",
      stop: "services.stop",
    };

    try {
      const result = await conn.send(rpcMethodMap[action], { serviceId });

      return NextResponse.json({
        success: true,
        serviceId,
        action,
        result,
      });
    } catch (rpcError) {
      logger.error("[OpenClaw/Services] RPC Error:", rpcError);
      return NextResponse.json(
        {
          error: `Failed to ${action} service`,
        },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    logger.error("[OpenClaw/Services] PATCH Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
