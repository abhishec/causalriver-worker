export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * GET /api/org-members?orgId=xxx
 * List all members of an organization (requires membership).
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId");
    if (!orgId)
      return NextResponse.json(
        { error: "orgId is required" },
        { status: 400 }
      );

    // Verify membership (RLS will enforce, but let's check role too)
    const { data: myMembership } = await supabase
      .from("org_members")
      .select("role, is_platform_admin")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    if (!myMembership) {
      // Check platform admin
      const { data: admin } = await supabase
        .from("org_members")
        .select("is_platform_admin")
        .eq("user_id", user.id)
        .eq("is_platform_admin", true)
        .limit(1)
        .single();
      if (!admin)
        return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Fetch members with user details via service client (needs auth.users access)
    const service = await createServiceClient();
    const { data: members, error } = await service
      .from("org_members")
      .select("id, user_id, role, is_platform_admin, joined_at, invited_by")
      .eq("organization_id", orgId)
      .order("joined_at", { ascending: true });

    if (error)
      return NextResponse.json({ error: "Internal error" }, { status: 500 });

    // Get user emails for all members
    const userIds = members?.map((m) => m.user_id) || [];
    void userIds; // used implicitly via listUsers below
    const { data: authUsers } =
      await service.auth.admin.listUsers({ perPage: 100 });

    const userMap = new Map<string, { email: string; name: string }>();
    authUsers?.users?.forEach((u) => {
      userMap.set(u.id, {
        email: u.email || "",
        name:
          u.user_metadata?.full_name ||
          u.user_metadata?.name ||
          u.email?.split("@")[0] ||
          "Unknown",
      });
    });

    const enriched = (members || []).map((m) => ({
      ...m,
      email: userMap.get(m.user_id)?.email || "",
      name: userMap.get(m.user_id)?.name || "",
      invited_by_name: m.invited_by ? (userMap.get(m.invited_by)?.name || userMap.get(m.invited_by)?.email || null) : null,
    }));

    // Also fetch pending invitations
    const { data: invitations } = await supabase
      .from("org_invitations")
      .select("id, invitee_email, role, status, created_at, expires_at")
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      members: enriched,
      pendingInvitations: invitations || [],
      myRole: myMembership?.role || "admin",
    });
  } catch (err) {
    logger.error("[org-members GET] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/org-members
 * Change a member's role.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { memberId, role, orgId } = await request.json();
    if (!memberId || !role || !orgId)
      return NextResponse.json(
        { error: "memberId, role, and orgId are required" },
        { status: 400 }
      );

    // Verify caller is owner/admin
    const { data: myMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    if (!myMembership || !["owner", "admin"].includes(myMembership.role))
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });

    // Validate role value to prevent privilege escalation
    const ALLOWED_ROLES = ["owner", "admin", "member", "viewer"];
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(", ")}` }, { status: 400 });
    }
    // Only owners can assign the owner role
    if (role === "owner" && myMembership.role !== "owner") {
      return NextResponse.json({ error: "Only owners can assign the owner role" }, { status: 403 });
    }

    // Update (RLS will enforce additional constraints)
    const { error } = await supabase
      .from("org_members")
      .update({ role })
      .eq("id", memberId)
      .eq("organization_id", orgId);

    if (error)
      return NextResponse.json({ error: "Internal error" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[org-members PATCH] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/org-members
 * Remove a member from the org.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { memberId, orgId } = await request.json();
    if (!memberId || !orgId)
      return NextResponse.json(
        { error: "memberId and orgId are required" },
        { status: 400 }
      );

    // Verify caller is owner/admin OR is removing themselves
    const { data: deleteMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    if (!deleteMembership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Non-admin/owner can only remove themselves
    if (!["owner", "admin"].includes(deleteMembership.role)) {
      const { data: targetMember } = await supabase
        .from("org_members")
        .select("user_id")
        .eq("id", memberId)
        .eq("organization_id", orgId)
        .single();
      if (!targetMember || targetMember.user_id !== user.id) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }
    }

    const { error } = await supabase
      .from("org_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", orgId);

    if (error)
      return NextResponse.json({ error: "Internal error" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[org-members DELETE] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
