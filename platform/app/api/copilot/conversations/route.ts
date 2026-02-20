import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyOrgMembership } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/copilot/conversations?orgId=<uuid>
 * List the current user's conversations for the given org.
 *
 * Uses admin client for all DB queries — the conversations table has RLS
 * policies that reference org_members, which has infinite recursion.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  // Verify org membership (uses admin client to bypass RLS recursion)
  const member = await verifyOrgMembership(user.id, orgId);
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("conversations")
    .select("id, title, service_mode, created_at, updated_at, metadata")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversations: data });
}

/**
 * POST /api/copilot/conversations
 * Create or update a conversation.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { orgId, title, serviceMode, messages, conversationId } = body;

  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }

  // Verify org membership (uses admin client to bypass RLS recursion)
  const member = await verifyOrgMembership(user.id, orgId);
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
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ id: data.id });
  }

  // Create new conversation
  const { data, error } = await admin
    .from("conversations")
    .insert({
      org_id: orgId,
      user_id: user.id,
      title: title || "New conversation",
      service_mode: serviceMode || "general",
      messages: messages || [],
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
