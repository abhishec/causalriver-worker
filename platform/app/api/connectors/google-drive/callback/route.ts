/**
 * GET /api/connectors/google-drive/callback
 *
 * Google Drive OAuth 2.0 callback handler.
 *
 * Flow:
 *   1. Validate state parameter (CSRF protection — orgId:userId:timestamp:nonce)
 *   2. Exchange authorization code for access_token + refresh_token
 *   3. Fetch user profile from Google
 *   4. Upsert credentials into org_connectors table
 *   5. Redirect to /connectors?connected=google_drive
 *
 * Supports popup mode (state includes 5th part "popup") for inline
 * onboarding OAuth — returns HTML with postMessage instead of redirect.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// Static captures for Lambda SSR
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// ── Popup mode helper ──────────────────────────────────────────────────────

function popupHtml(type: string, error?: string, payload?: Record<string, unknown>): string {
  const message = JSON.stringify({ type, error, ...payload })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  return `<!DOCTYPE html>
<html><head><title>Connecting…</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage(${message}, window.location.origin);
  }
  window.close();
</script>
<p style="font-family:system-ui;color:#a1a1aa;text-align:center;margin-top:40vh">
  Connected — this window will close automatically.
</p>
</body></html>`;
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error");

    // Google returned an error (e.g. user denied access)
    if (oauthError) {
      logger.warn("[google-drive/callback] OAuth error from Google", { error: oauthError });
      return NextResponse.redirect(
        new URL(`/connectors?error=${encodeURIComponent(oauthError)}`, request.url),
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/connectors?error=invalid_callback", request.url),
      );
    }

    // ── State validation ────────────────────────────────────────────────────
    // Format: orgId:userId:timestamp:nonce[:popup]
    const parts = state.split(":");
    if (parts.length < 4) {
      return NextResponse.redirect(
        new URL("/connectors?error=invalid_state", request.url),
      );
    }

    const [orgId, userId, timestamp, nonce] = parts;
    const isPopup = parts.length >= 5 && parts[4] === "popup";

    if (!nonce || nonce.length < 8) {
      return NextResponse.redirect(
        new URL("/connectors?error=invalid_state", request.url),
      );
    }

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Date.now() - ts > 10 * 60 * 1000) {
      // State expired (> 10 minutes)
      return NextResponse.redirect(
        new URL("/connectors?error=expired_state", request.url),
      );
    }

    // ── Session validation ──────────────────────────────────────────────────
    let supabase: Awaited<ReturnType<typeof createClient>>;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    let user = null;
    try {
      const { data: authData } = await supabase.auth.getUser();
      user = authData.user;
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    if (!user || user.id !== userId) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Verify user is a member of the org in the state
    const { data: orgMembership } = await supabase
      .from("org_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!orgMembership) {
      return NextResponse.redirect(
        new URL("/connectors?error=forbidden", request.url),
      );
    }

    // ── OAuth credentials check ─────────────────────────────────────────────
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      logger.warn("[google-drive/callback] Google OAuth credentials not configured");
      const errorUrl = "/connectors?error=oauth_not_configured";
      if (isPopup) {
        return new NextResponse(popupHtml("google_drive-error", "OAuth not configured"), {
          headers: { "Content-Type": "text/html" },
        });
      }
      return NextResponse.redirect(new URL(errorUrl, request.url));
    }

    // ── Token exchange ──────────────────────────────────────────────────────
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const redirectUri = `${origin}/api/connectors/google-drive/callback`;

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      logger.error("[google-drive/callback] Token exchange failed", {
        error: tokenData.error,
        description: tokenData.error_description,
      });
      const errorParam = encodeURIComponent(tokenData.error ?? "token_exchange_failed");
      if (isPopup) {
        return new NextResponse(popupHtml("google_drive-error", tokenData.error ?? "token_exchange_failed"), {
          headers: { "Content-Type": "text/html" },
        });
      }
      return NextResponse.redirect(
        new URL(`/connectors?error=${errorParam}`, request.url),
      );
    }

    // ── Fetch Google user profile ───────────────────────────────────────────
    const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = await profileResponse.json() as {
      id?: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    // ── Store credentials ───────────────────────────────────────────────────
    const service = await createServiceClient();

    const credentials = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      token_type: tokenData.token_type ?? "Bearer",
      expires_in: tokenData.expires_in ?? 3600,
      // Store token acquisition time so we know when to refresh
      acquired_at: new Date().toISOString(),
    };

    const metadata = {
      google_user_id: profile.id ?? null,
      google_email: profile.email ?? null,
      google_name: profile.name ?? null,
      google_avatar: profile.picture ?? null,
      connected_at: new Date().toISOString(),
      connected_by: user.id,
    };

    const { error: storeError } = await service
      .from("org_connectors")
      .upsert(
        {
          organization_id: orgId,
          connector_type: "google_drive",
          instance_name: profile.email ?? "default",
          display_name: profile.name ?? profile.email ?? "Google Drive",
          status: "active",
          credentials,
          metadata,
          config: {
            google_email: profile.email,
            google_name: profile.name,
          },
        },
        { onConflict: "organization_id,connector_type,instance_name" },
      );

    if (storeError) {
      logger.error("[google-drive/callback] Failed to store credentials", {
        error: storeError.message,
        orgId,
      });
      if (isPopup) {
        return new NextResponse(popupHtml("google_drive-error", "Failed to store credentials"), {
          headers: { "Content-Type": "text/html" },
        });
      }
      return NextResponse.redirect(
        new URL("/connectors?error=storage_failed", request.url),
      );
    }

    logger.warn("[google-drive/callback] Google Drive connected successfully", {
      orgId,
      email: profile.email,
    });

    if (isPopup) {
      return new NextResponse(
        popupHtml("google_drive-connected", undefined, {
          email: profile.email,
          name: profile.name,
          avatar: profile.picture,
        }),
        { headers: { "Content-Type": "text/html" } },
      );
    }

    return NextResponse.redirect(
      new URL("/connectors?connected=google_drive", request.url),
    );
  } catch (err: unknown) {
    logger.error("[google-drive/callback] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.redirect(
      new URL("/connectors?error=auth_failed", request.url),
    );
  }
}
