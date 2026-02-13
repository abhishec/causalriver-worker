/**
 * Brain Health Monitoring API
 *
 * GET /api/brain/health
 *   Public endpoint (no auth required) — returns basic liveness.
 *
 * GET /api/brain/health?detail=true
 *   Requires platform admin session — returns full system health
 *   including database size, table sizes, brain stats, retention status.
 *
 * This powers monitoring dashboards, alerting, and operational awareness.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const detail = request.nextUrl.searchParams.get("detail") === "true";

  // Basic liveness check (no auth required)
  if (!detail) {
    return NextResponse.json({
      status: "ok",
      service: "nexusbrain",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  }

  // Detailed health requires platform admin
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check platform admin
    const service = await createServiceClient();
    const { data: adminCheck } = await service
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .limit(1)
      .single();

    if (!adminCheck) {
      return NextResponse.json({ error: "Platform admin required" }, { status: 403 });
    }

    // Call the system health RPC
    const { data: health, error } = await service.rpc("check_system_health");

    if (error) {
      return NextResponse.json({
        status: "degraded",
        error: error.message,
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

    // Augment with platform-level metrics
    const { data: recentErrors } = await service
      .from("brain_execution_log")
      .select("id")
      .eq("status", "error")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    const { count: activeKeys } = await service
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    const { count: pendingInvites } = await service
      .from("org_invitations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    return NextResponse.json({
      ...health,
      platform: {
        errors_24h: recentErrors?.length ?? 0,
        active_api_keys: activeKeys ?? 0,
        pending_invitations: pendingInvites ?? 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      status: "error",
      message: err instanceof Error ? err.message : "Health check failed",
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
