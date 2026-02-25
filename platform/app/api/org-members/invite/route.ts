export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/org-members/invite
 * Create an invitation for a new member to join the org.
 *
 * Body: { email: string, role: string, orgId: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const email = body.email;
    const role = body.role;
    const organizationId = body.orgId || body.organizationId;

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !EMAIL_RE.test(email))
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    if (!organizationId)
      return NextResponse.json(
        { error: "orgId is required" },
        { status: 400 }
      );

    const inviteRole = role || "member";
    if (!["admin", "member", "viewer"].includes(inviteRole))
      return NextResponse.json(
        { error: "Invalid role. Must be admin, member, or viewer" },
        { status: 400 }
      );

    // Verify caller is owner/admin of the org
    const { data: myMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (!myMembership || !["owner", "admin"].includes(myMembership.role))
      return NextResponse.json(
        { error: "Only org owners and admins can invite members" },
        { status: 403 }
      );

    // Check for existing pending invitation
    const { data: existingInvite } = await supabase
      .from("org_invitations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("invitee_email", email.toLowerCase())
      .eq("status", "pending")
      .single();

    if (existingInvite)
      return NextResponse.json(
        { error: "An invitation is already pending for this email" },
        { status: 409 }
      );

    // Create the invitation (RLS policy allows org owners/admins)
    const { data: invitation, error } = await supabase
      .from("org_invitations")
      .insert({
        organization_id: organizationId,
        inviter_id: user.id,
        invitee_email: email.toLowerCase(),
        role: inviteRole,
      })
      .select("id, token, invitee_email, role, created_at, expires_at")
      .single();

    if (error)
      return NextResponse.json({ error: "Internal error" }, { status: 500 });

    // Build invite URL
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://platform.usebrainos.com";

    const inviteUrl = `${origin}/invite/${invitation.token}`;

    return NextResponse.json({
      invitation,
      inviteUrl,
      message: `Invitation created. Share this link: ${inviteUrl}`,
    });
  } catch (err) {
    logger.error("[org-members/invite POST] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/org-members/invite?inviteId=xxx
 * Revoke a pending invitation.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const inviteId = searchParams.get("inviteId");
    if (!inviteId)
      return NextResponse.json(
        { error: "inviteId is required" },
        { status: 400 }
      );

    // Get the invite to find the org
    const { data: invite } = await supabase
      .from("org_invitations")
      .select("id, organization_id, status")
      .eq("id", inviteId)
      .single();

    if (!invite)
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

    if (invite.status !== "pending")
      return NextResponse.json(
        { error: "Can only revoke pending invitations" },
        { status: 400 }
      );

    // Verify caller is owner/admin
    const { data: myMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", invite.organization_id)
      .single();

    if (!myMembership || !["owner", "admin"].includes(myMembership.role))
      return NextResponse.json(
        { error: "Only org owners and admins can revoke invitations" },
        { status: 403 }
      );

    // Delete the invitation
    const { error } = await supabase
      .from("org_invitations")
      .delete()
      .eq("id", inviteId);

    if (error)
      return NextResponse.json({ error: "Internal error" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[org-members/invite DELETE] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
