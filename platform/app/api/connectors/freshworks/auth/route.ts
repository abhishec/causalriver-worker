export const dynamic = "force-dynamic";
/**
 * GET /api/connectors/freshworks/auth
 *
 * Initiates Freshdesk OAuth 2.0 flow.
 * The user must provide their Freshdesk domain (e.g. acme.freshdesk.com) as a query param:
 *   GET /api/connectors/freshworks/auth?domain=acme.freshdesk.com
 *
 * Flow:
 *   → This route redirects to https://{domain}/auth/oauth/authorize
 *   → User approves on Freshdesk
 *   → Freshdesk redirects to /api/connectors/freshworks/callback?code=...&state=...
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { randomBytes } from "crypto";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const domain = request.nextUrl.searchParams.get("domain");
    if (!domain) {
      return NextResponse.json(
        { error: "domain param required (e.g. acme.freshdesk.com)" },
        { status: 400 }
      );
    }

    // Validate domain is a freshdesk domain (prevent SSRF)
    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "");
    if (!cleanDomain.includes(".freshdesk.com") && !cleanDomain.includes(".freshservice.com")) {
      return NextResponse.json(
        { error: "Domain must be a .freshdesk.com or .freshservice.com domain" },
        { status: 400 }
      );
    }

    const clientId = process.env.FRESHDESK_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: "Freshdesk OAuth not configured" },
        { status: 500 }
      );
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/connectors/freshworks/callback`;
    const nonce = randomBytes(16).toString("hex");
    const state = `${workspaceId}:${user.id}:${Date.now()}:${nonce}:${cleanDomain}`;

    const authUrl = new URL(`https://${cleanDomain}/auth/oauth/authorize`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);

    const response = NextResponse.redirect(authUrl.toString());
    response.cookies.set("fw_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    logger.error("[Freshworks OAuth Init] Error:", error);
    return NextResponse.json({ error: "Failed to initiate OAuth" }, { status: 500 });
  }
}
