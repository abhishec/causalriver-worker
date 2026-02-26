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

  // Verify timestamp freshness
  const ts = parseInt(parts[2], 10);
  if (Date.now() - ts > 10 * 60 * 1000) {
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("OAuth link expired — please try again")}`
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.redirect(`${redirectBase}/login`);
    }

    const clientId = process.env.FRESHDESK_CLIENT_ID;
    const clientSecret = process.env.FRESHDESK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${redirectBase}/connectors?error=${encodeURIComponent("Freshdesk OAuth not configured")}`
      );
    }

    const redirectUri = `${redirectBase}/api/connectors/freshworks/callback`;

    // Exchange code for tokens
    const tokenResp = await fetch(`https://${freshdeskDomain}/auth/oauth/token`, {
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
      const profileResp = await fetch(`https://${freshdeskDomain}/api/v2/agents/me`, {
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
        domain: freshdeskDomain,
        auth_method: "oauth",
      },
      p_metadata: {
        domain: freshdeskDomain,
        agent_email: agentEmail,
        agent_name: agentName,
        auth_method: "oauth",
        connected_at: new Date().toISOString(),
        connected_by: userId,
      },
    });

    logger.info(
      `[Freshworks OAuth] Connected for org ${orgId} — domain: ${freshdeskDomain}`
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
