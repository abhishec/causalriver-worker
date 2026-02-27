import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/slack
 *
 * Validate and store a Slack connector for the current org.
 *
 * Body: {
 *   webhookUrl:       string   — Slack incoming webhook URL
 *   channelName:      string   — Default Slack channel (e.g. #general)
 *   botToken?:        string   — Optional bot token for richer integration
 *   displayName?:     string   — Optional human-readable name for this connector
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Workspace membership
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // 3. Parse body
    const body = await request.json();
    const { webhookUrl, channelName, botToken, displayName } = body as {
      webhookUrl: string;
      channelName?: string;
      botToken?: string;
      displayName?: string;
    };

    if (!webhookUrl) {
      return NextResponse.json({ error: "webhookUrl is required" }, { status: 400 });
    }

    // 4. Validate webhook URL format
    if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
      return NextResponse.json(
        { error: "webhookUrl must be a valid Slack webhook URL (https://hooks.slack.com/...)" },
        { status: 400 }
      );
    }

    // 5. Store in org_connectors
    const service = await createServiceClient();
    const instanceName = channelName ? channelName.replace(/^#/, "") : "default";

    const credentials: Record<string, any> = { webhook_url: webhookUrl };
    if (botToken) credentials.bot_token = botToken;

    const config = {
      webhook_url: webhookUrl,
      default_channel: channelName || "#general",
      has_bot_token: !!botToken,
    };

    const metadata = {
      channel_name: channelName || null,
      connected_at: new Date().toISOString(),
      connection_method: "webhook",
    };

    // Upsert to handle re-connections
    const { data: existing } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "slack")
      .eq("instance_name", instanceName)
      .maybeSingle();

    let connectorId: string;

    if (existing) {
      const { error } = await service
        .from("org_connectors")
        .update({
          status: "active",
          display_name: displayName || instanceName,
          config,
          credentials,
          metadata,
          error_message: null,
        })
        .eq("id", existing.id);
      if (error) throw error;
      connectorId = existing.id;
    } else {
      const { data: inserted, error } = await service
        .from("org_connectors")
        .insert({
          organization_id: workspaceId,
          connector_type: "slack",
          instance_name: instanceName,
          display_name: displayName || instanceName,
          status: "active",
          config,
          credentials,
          metadata,
          signals_count: 0,
        })
        .select("id")
        .maybeSingle();
      if (error || !inserted) throw error || new Error("Insert returned no rows");
      connectorId = inserted.id;
    }

    return NextResponse.json({ success: true, connector_id: connectorId });
  } catch (err: any) {
    logger.error("[integrations/slack/POST]", err);
    return NextResponse.json({ error: "Failed to connect Slack. Please check your webhook URL and try again." }, { status: 500 });
  }
}
