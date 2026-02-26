/**
 * OpenClaw Trigger API — Proxy copilot messages through the OpenClaw daemon
 * ===========================================================================
 *
 * POST /api/openclaw/trigger
 *   Sends a message to the OpenClaw daemon's agent via WebSocket or webhook.
 *   Returns an SSE stream in the same format as copilot/chat:
 *     data: {"text":"..."}\n\n
 *     data: {"agentStep":{...}}\n\n
 *     data: {"agentStatus":{...}}\n\n
 *     data: [DONE]\n\n
 *
 *   Auth: Supabase session + org membership (same pattern as copilot/chat)
 *
 *   Body: {
 *     message: string,            // The user's message / command
 *     organizationId?: string,    // defaults to CORE_WORKSPACE_ID
 *     sessionKey?: string,        // optional session key for conversation continuity
 *     agentId?: string,           // optional: target a specific agent
 *   }
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CORE_WORKSPACE_ID } from "@/lib/workspace-helpers";
import { gatewayManager, triggerOpenClawAgent } from "@/lib/openclaw/gateway-client";
import type { AgentStreamEvent } from "@/lib/openclaw/gateway-client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
      message,
      organizationId,
      sessionKey,
      agentId,
    } = body as {
      message?: string;
      organizationId?: string;
      sessionKey?: string;
      agentId?: string;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "message is required (non-empty string)" },
        { status: 400 }
      );
    }

    const workspaceId = organizationId;
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

    // ── Check gateway exists ──────────────────────────────────────
    const conn = gatewayManager.getConnection(workspaceId);
    if (!conn) {
      return NextResponse.json(
        { error: "No OpenClaw gateway configured. Connect one via the Connectors page." },
        { status: 404 }
      );
    }

    // ── Stream agent response as SSE ──────────────────────────────
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const agentStream = triggerOpenClawAgent({
            orgId: workspaceId,
            message: message.trim(),
            sessionKey,
            agentId,
          });

          for await (const event of agentStream) {
            if (event === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            } else {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
              );
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`)
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
        }
      },
    });

    // ── Return SSE response ──────────────────────────────────────
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable Nginx buffering
      },
    });
  } catch (error: unknown) {
    logger.error("[OpenClaw/Trigger] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
