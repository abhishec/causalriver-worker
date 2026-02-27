export const dynamic = "force-dynamic";
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
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

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
      .maybeSingle();

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
      .maybeSingle();

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
      return NextResponse.json({ error: "Failed to join" }, { status: 500 });

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
      .maybeSingle();

    if (orgData?.customer_id) {
      // Sync customer_members — wrapped in try/catch for resilience
      // if customer_members table doesn't exist, invitation still succeeds
      try {
        const { data: existingCustMember } = await service
          .from("customer_members")
          .select("id")
          .eq("customer_id", orgData.customer_id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existingCustMember) {
          const { error: insertError } = await service.from("customer_members").insert({
            customer_id: orgData.customer_id,
            user_id: user.id,
            role: invitation.role,
            primary_org_id: invitation.organization_id,
          });
          if (insertError) {
            logger.warn("[org-members/accept-invite] customer_members sync failed:", insertError.message);
          }
        }
      } catch {
        logger.warn("[org-members/accept-invite] customer_members not available — invitation accepted without customer sync");
      }
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
