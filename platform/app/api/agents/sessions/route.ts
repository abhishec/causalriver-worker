/**
 * /api/agents/sessions
 *
 * POST — Create a new interactive agent session
 * GET  — List active sessions for an organization
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  createAgentSession,
  listActiveSessions,
} from "@/lib/agents/session-manager";

export const dynamic = "force-dynamic";

// ── POST /api/agents/sessions ─────────────────────────────────────────────────
// Body: { organizationId, aiWorkerId?, agentType, sessionName, knowledgeScope? }
// Returns: { sessionId }

export async function POST(request: NextRequest) {
  try {
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

    // Parse body
    let body: {
      organizationId?: string;
      aiWorkerId?: string;
      agentType?: string;
      sessionName?: string;
      knowledgeScope?: { documentIds?: string[]; ingestionJobIds?: string[] };
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { organizationId, aiWorkerId, agentType, sessionName, knowledgeScope } = body;

    if (!organizationId || !agentType || !sessionName) {
      return NextResponse.json(
        { error: "Missing required fields: organizationId, agentType, sessionName" },
        { status: 400 }
      );
    }

    // Verify org membership
    const admin = getAdminClient();
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await createAgentSession(supabase, {
      organizationId,
      aiWorkerId,
      agentType,
      sessionName,
      knowledgeScope,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    logger.warn("[/api/agents/sessions POST] Session created", {
      sessionId: result.sessionId,
      organizationId,
      agentType,
    });

    return NextResponse.json({ sessionId: result.sessionId }, { status: 201 });
  } catch (err) {
    logger.error("[/api/agents/sessions POST] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── GET /api/agents/sessions ──────────────────────────────────────────────────
// Query params: organizationId (required), aiWorkerId (optional)
// Returns: { sessions: Array<{ id, agentType, sessionName, turnCount, status, createdAt }> }

export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const aiWorkerId = searchParams.get("aiWorkerId") ?? undefined;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing required query param: organizationId" },
        { status: 400 }
      );
    }

    // Verify org membership
    const admin = getAdminClient();
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sessions = await listActiveSessions(supabase, organizationId, aiWorkerId);

    return NextResponse.json({ sessions });
  } catch (err) {
    logger.error("[/api/agents/sessions GET] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
