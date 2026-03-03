/**
 * /api/agents/sessions/[id]
 *
 * GET — Get session details including recent turns
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getSessionContext, completeSession } from "@/lib/agents/session-manager";

export const dynamic = "force-dynamic";

// ── GET /api/agents/sessions/[id] ─────────────────────────────────────────────
// Returns full session context including the last 10 turns

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
    }

    // Auth
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the session to verify ownership before returning context
    const admin = getAdminClient();
    const { data: sessionRow, error: sessionFetchError } = await admin
      .from("agent_sessions")
      .select("organization_id")
      .eq("id", sessionId)
      .single();

    if (sessionFetchError || !sessionRow) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Verify org membership
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", sessionRow.organization_id as string)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sessionContext = await getSessionContext(supabase, sessionId);

    if (!sessionContext) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ session: sessionContext });
  } catch (err) {
    logger.error("[/api/agents/sessions/[id] GET] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH /api/agents/sessions/[id] ──────────────────────────────────────────
// Body: { action: "complete" }
// Marks a session as completed

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
    }

    // Auth
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { action?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body.action !== "complete") {
      return NextResponse.json(
        { error: "Unsupported action. Supported: 'complete'" },
        { status: 400 }
      );
    }

    // Verify ownership via admin client
    const admin = getAdminClient();
    const { data: sessionRow } = await admin
      .from("agent_sessions")
      .select("organization_id")
      .eq("id", sessionId)
      .single();

    if (!sessionRow) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", sessionRow.organization_id as string)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const success = await completeSession(supabase, sessionId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to complete session" },
        { status: 500 }
      );
    }

    logger.warn("[/api/agents/sessions/[id] PATCH] Session completed", { sessionId });

    return NextResponse.json({ success: true, sessionId });
  } catch (err) {
    logger.error("[/api/agents/sessions/[id] PATCH] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
