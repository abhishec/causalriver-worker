export const dynamic = "force-dynamic";
/**
 * POST /api/connectors/setup
 *
 * Generic API-key connector setup. Accepts any API-key-based connector type,
 * validates the required fields are present, and upserts the org_connectors row.
 *
 * Body: { connectorType: string, credentials: Record<string, string> }
 *
 * Used by ConnectorSetupCard for all non-OAuth connectors (Freshdesk API key,
 * HubSpot, Notion, Datadog, Stripe, etc.).
 */
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { CONNECTOR_AUTH_MAP } from "@/lib/connectors/connector-auth-map";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { connectorType: string; credentials: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { connectorType, credentials } = body;

  if (!connectorType || typeof connectorType !== "string") {
    return NextResponse.json({ error: "connectorType required" }, { status: 400 });
  }
  if (!credentials || typeof credentials !== "object") {
    return NextResponse.json({ error: "credentials required" }, { status: 400 });
  }

  const authConfig = CONNECTOR_AUTH_MAP[connectorType];
  if (!authConfig) {
    return NextResponse.json({ error: `Unknown connector type: ${connectorType}` }, { status: 400 });
  }
  if (authConfig.authMethod === "oauth") {
    return NextResponse.json({ error: `${connectorType} uses OAuth — use the OAuth flow instead` }, { status: 400 });
  }

  // Validate required fields are present (non-empty)
  const requiredFields = authConfig.fields ?? [];
  for (const field of requiredFields) {
    const val = credentials[field.key];
    if (!val || typeof val !== "string" || val.trim() === "") {
      return NextResponse.json(
        { error: `Field "${field.label}" is required` },
        { status: 400 }
      );
    }
  }

  try {
    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    // Check if connector already exists
    const { data: existing } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", workspaceId)
      .eq("connector_type", connectorType)
      .eq("instance_name", "default")
      .maybeSingle();

    const now = new Date().toISOString();
    const row = {
      organization_id: workspaceId,
      connector_type: connectorType,
      instance_name: "default",
      display_name: authConfig.displayName,
      status: "pending" as const,
      credentials,
      config: {},
      metadata: {
        connected_at: now,
        connected_by: user.id,
        connection_method: "api_key",
      },
      signals_count: 0,
    };

    if (existing) {
      const { error } = await service
        .from("org_connectors")
        .update({
          status: "pending",
          credentials,
          metadata: row.metadata,
          error_message: null,
        })
        .eq("id", existing.id);

      if (error) throw error;
    } else {
      const { error } = await service
        .from("org_connectors")
        .insert(row);

      if (error) throw error;
    }

    return NextResponse.json({ success: true, connectorType, displayName: authConfig.displayName });
  } catch (err) {
    logger.error("[connectors/setup] Error:", err);
    return NextResponse.json({ error: "Failed to save connector" }, { status: 500 });
  }
}
