export const dynamic = "force-dynamic";
/**
 * GET /api/connectors/status?workspaceId=xxx
 *
 * Lightweight connector status endpoint — returns connector type, display name,
 * status, signals count, and last sync. No credentials returned.
 *
 * Used by ConnectorStatusStrip on the AI Worker page.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getConnectorDisplayName } from "@/lib/connectors/connector-auth-map";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  try {
    // Verify user belongs to this workspace
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("organization_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const service = await createServiceClient();
    const { data: rows, error } = await service
      .from("org_connectors")
      .select("connector_type, status, signals_count, last_sync_at, display_name")
      .eq("organization_id", workspaceId)
      .order("connector_type");

    if (error) throw error;

    const connectors = (rows ?? []).map((row: {
      connector_type: string;
      status: string;
      signals_count: number | null;
      last_sync_at: string | null;
      display_name: string | null;
    }) => ({
      type: row.connector_type,
      displayName: row.display_name || getConnectorDisplayName(row.connector_type),
      status: row.status,
      signalsCount: row.signals_count ?? 0,
      lastSync: row.last_sync_at,
    }));

    return NextResponse.json({ connectors });
  } catch (err) {
    logger.error("[connectors/status] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
