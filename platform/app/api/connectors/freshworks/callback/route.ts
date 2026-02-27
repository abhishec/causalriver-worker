export const dynamic = "force-dynamic";
/**
 * GET /api/connectors/freshworks/callback
 *
 * Freshdesk redirects here after OAuth authorization.
 * Exchanges the code for an access_token and stores credentials in org_connectors.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const redirectBase = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  // Verify state cookie
  const stateCookie = request.cookies.get("fw_oauth_state")?.value;
  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    logger.warn("[Freshworks Callback] State mismatch");
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("Invalid state — please try again")}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("OAuth cancelled")}`
    );
  }

  // Parse state: orgId:userId:timestamp:nonce:domain
  const parts = stateParam.split(":");
  if (parts.length < 5) {
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("Malformed state")}`
    );
  }
  const [orgId, userId] = parts;
  // domain may contain dots so take everything after the 4th colon
  const freshdeskDomain = parts.slice(4).join(":");

  // Re-validate domain from state against the same allowlist used in /auth.
  // Without this check an attacker could craft a state with an arbitrary domain
  // and trigger an SSRF fetch to an internal host.
  const cleanedDomain = freshdeskDomain.trim().toLowerCase().replace(/^https?:\/\//, "");
  if (
    !cleanedDomain ||
    (!cleanedDomain.endsWith(".freshdesk.com") && !cleanedDomain.endsWith(".freshservice.com"))
  ) {
    logger.warn("[Freshworks Callback] Domain in state failed allowlist check:", cleanedDomain);
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("Invalid domain in state — please try again")}`
    );
  }

  // Verify timestamp freshness
  const ts = parseInt(parts[2], 10);
  if (Date.now() - ts > 10 * 60 * 1000) {
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("OAuth link expired — please try again")}`
    );
  }

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

    // Verify that orgId from state belongs to the authenticated user.
    // Prevents CSRF-style attacks where a crafted state targets another org's ID.
    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      logger.warn(`[Freshworks Callback] User ${user.id} is not a member of org ${orgId}`);
      return NextResponse.redirect(
        `${redirectBase}/connectors?error=${encodeURIComponent("Invalid organization — please try again")}`
      );
    }

    const clientId = process.env.FRESHDESK_CLIENT_ID;
    const clientSecret = process.env.FRESHDESK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${redirectBase}/connectors?error=${encodeURIComponent("Freshdesk OAuth not configured")}`
      );
    }

    const redirectUri = `${redirectBase}/api/connectors/freshworks/callback`;

    // Exchange code for tokens — use cleanedDomain (allowlist-validated) to prevent SSRF
    const tokenResp = await fetch(`https://${cleanedDomain}/auth/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text().catch(() => "");
      logger.error("[Freshworks Callback] Token exchange failed:", errText);
      return NextResponse.redirect(
        `${redirectBase}/connectors?error=${encodeURIComponent("Failed to exchange OAuth code")}`
      );
    }

    const tokenData = await tokenResp.json();
    const accessToken: string = tokenData.access_token;
    const refreshToken: string | undefined = tokenData.refresh_token;

    // Fetch agent info to populate display metadata
    let agentEmail = "";
    let agentName = "";
    try {
      const profileResp = await fetch(`https://${cleanedDomain}/api/v2/agents/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileResp.ok) {
        const profile = await profileResp.json();
        agentEmail = profile.contact?.email ?? "";
        agentName = profile.contact?.name ?? "";
      }
    } catch {
      // Non-fatal: metadata is cosmetic
    }

    const admin = getAdminClient();
    await admin.rpc("store_connector_credentials", {
      p_organization_id: orgId,
      p_connector_type: "freshdesk",
      p_credentials: {
        access_token: accessToken,
        ...(refreshToken ? { refresh_token: refreshToken } : {}),
        domain: cleanedDomain,
        auth_method: "oauth",
      },
      p_metadata: {
        domain: cleanedDomain,
        agent_email: agentEmail,
        agent_name: agentName,
        auth_method: "oauth",
        connected_at: new Date().toISOString(),
        connected_by: userId,
      },
    });

    logger.info(
      `[Freshworks OAuth] Connected for org ${orgId} — domain: ${cleanedDomain}`
    );

    const response = NextResponse.redirect(
      `${redirectBase}/connectors?success=freshdesk_connected`
    );
    response.cookies.set("fw_oauth_state", "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    logger.error("[Freshworks Callback] Error:", error);
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("Failed to connect Freshdesk")}`
    );
  }
}
