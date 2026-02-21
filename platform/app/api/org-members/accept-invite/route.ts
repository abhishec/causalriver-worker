import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/org-members/accept-invite
 * Accept an invitation and join the org.
 *
 * Body: { token: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token } = await request.json();
    if (!token)
      return NextResponse.json(
        { error: "Invitation token is required" },
        { status: 400 }
      );

    // Look up invitation using service client (to bypass RLS for token lookup)
    const service = await createServiceClient();
    const { data: invitation, error: lookupError } = await service
      .from("org_invitations")
      .select("id, organization_id, invitee_email, role, status, expires_at, inviter_id")
      .eq("token", token)
      .single();

    if (lookupError || !invitation)
      return NextResponse.json(
        { error: "Invalid invitation token" },
        { status: 404 }
      );

    // Validate invitation state
    if (invitation.status !== "pending")
      return NextResponse.json(
        { error: `Invitation has already been ${invitation.status}` },
        { status: 410 }
      );

    if (new Date(invitation.expires_at) < new Date())
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 410 }
      );

    // Verify email matches
    if (
      invitation.invitee_email.toLowerCase() !== user.email?.toLowerCase()
    )
      return NextResponse.json(
        {
          error: `This invitation was sent to ${invitation.invitee_email}. You are logged in as ${user.email}.`,
        },
        { status: 403 }
      );

    // Check if already a member
    const { data: existingMember } = await service
      .from("org_members")
      .select("id")
      .eq("organization_id", invitation.organization_id)
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      // Already a member — mark invitation as accepted
      await service
        .from("org_invitations")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", invitation.id);

      return NextResponse.json({
        success: true,
        orgId: invitation.organization_id,
        alreadyMember: true,
      });
    }

    // Add to org_members
    const { error: joinError } = await service.from("org_members").insert({
      organization_id: invitation.organization_id,
      user_id: user.id,
      role: invitation.role,
      invited_by: invitation.inviter_id,
    });

    if (joinError)
      return NextResponse.json({ error: joinError.message }, { status: 500 });

    // Mark invitation as accepted
    await service
      .from("org_invitations")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", invitation.id);

    // Sync customer_members — ensure the user has a customer-level membership
    // so the customer→org chain is complete for getCurrentWorkspaceId() resolution.
    const { data: orgData } = await service
      .from("organizations")
      .select("customer_id")
      .eq("id", invitation.organization_id)
      .single();

    if (orgData?.customer_id) {
      await service.from("customer_members").upsert(
        {
          customer_id: orgData.customer_id,
          user_id: user.id,
          role: invitation.role,
          primary_org_id: invitation.organization_id,
        },
        { onConflict: "customer_id,user_id", ignoreDuplicates: true }
      );
    }

    return NextResponse.json({
      success: true,
      orgId: invitation.organization_id,
    });
  } catch (err) {
    logger.error("[org-members/accept-invite] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
