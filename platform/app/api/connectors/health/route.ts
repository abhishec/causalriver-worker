export const dynamic = "force-dynamic";
/**
 * GET /api/connectors/health
 *
 * Returns connection health for all connectors in the current org.
 * Used by the Connectors page to show last sync time, signal count, and error state.
 *
 * Response: Array<{
 *   id: string;
 *   type: string;
 *   displayName: string | null;
 *   instanceName: string;
 *   status: "active" | "error" | "pending" | "disabled";
 *   lastSyncAt: string | null;
 *   signalsCount: number;
 *   errorMessage: string | null;
 *   authMethod: string | null;  // "github_app" | "oauth" | "api_key" | "basic_auth"
 * }>
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export async function GET() {
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

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json([], { status: 200 });
    }

    const { data, error } = await supabase
      .from("org_connectors")
      .select(
        "id, connector_type, display_name, instance_name, status, last_sync_at, signals_count, error_message, metadata"
      )
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error) {
      logger.warn("[connectors/health] Query error:", error.message);
      return NextResponse.json([], { status: 200 });
    }

    const health = (data ?? []).map((row) => ({
      id: row.id,
      type: row.connector_type,
      displayName: row.display_name ?? null,
      instanceName: row.instance_name ?? "",
      status: row.status ?? "pending",
      lastSyncAt: row.last_sync_at ?? null,
      signalsCount: row.signals_count ?? 0,
      errorMessage: row.error_message ?? null,
      authMethod: (row.metadata as Record<string, unknown>)?.auth_method as string ?? null,
    }));

    return NextResponse.json(health);
  } catch (err) {
    logger.error("[connectors/health] Error:", err);
    return NextResponse.json([], { status: 200 });
  }
}
