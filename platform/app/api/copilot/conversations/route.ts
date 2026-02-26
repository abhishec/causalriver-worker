import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/copilot/conversations?workspaceId=<uuid>
 * List the current user's conversations for the given workspace.
 *
 * Also accepts legacy ?orgId=<uuid> query param for backward compat.
 *
 * Uses admin client for all DB queries — the conversations table has RLS
 * policies that reference org_members, which has infinite recursion.
 */
export async function GET(req: NextRequest) {
  try {
    // Isolate createClient() so env var failures return 401, never 500
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Accept both workspaceId (new) and orgId (legacy)
    const workspaceId = req.nextUrl.searchParams.get("workspaceId") || req.nextUrl.searchParams.get("orgId");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    // Verify workspace membership (uses admin client to bypass RLS recursion)
    const member = await verifyWorkspaceMembership(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("conversations")
      .select("id, title, service_mode, created_at, updated_at, metadata")
      .eq("org_id", workspaceId)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json({ conversations: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Failed to list conversations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/copilot/conversations
 * Create or update a conversation.
 */
export async function POST(req: NextRequest) {
  try {
    // Isolate createClient() so env var failures return 401, never 500
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    // Accept both workspaceId (new) and orgId (legacy)
    const workspaceId = body.workspaceId || body.orgId;
    const { title, serviceMode, messages, conversationId } = body as {
      title?: string;
      serviceMode?: string;
      messages?: unknown[];
      conversationId?: string;
    };

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    // Verify workspace membership (uses admin client to bypass RLS recursion)
    const member = await verifyWorkspaceMembership(user.id, workspaceId as string);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminClient();

    if (conversationId) {
      // Update existing conversation
      const { data, error } = await admin
        .from("conversations")
        .update({
          title: title || "New conversation",
          service_mode: serviceMode || "general",
          messages: messages || [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .eq("org_id", workspaceId as string)
        .select("id")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
      }
      return NextResponse.json({ id: data?.id ?? conversationId });
    }

    // Create new conversation
    const { data, error } = await admin
      .from("conversations")
      .insert({
        org_id: workspaceId,
        user_id: user.id,
        title: title || "New conversation",
        service_mode: serviceMode || "general",
        messages: messages || [],
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Failed to save conversation" },
      { status: 500 }
    );
  }
}
