/**
 * GET /api/connectors/google-drive/auth
 *
 * Initiates Google Drive OAuth 2.0 flow.
 * Redirects the user to Google's authorization endpoint with the
 * drive.readonly scope. The callback route exchanges the code for tokens.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID     — OAuth 2.0 client ID from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET — OAuth 2.0 client secret (used in callback)
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { randomBytes } from "crypto";
import { logger } from "@/lib/logger";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// Static captures for Lambda SSR (webpack DefinePlugin inlines static member access only)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    user = authData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID) {
      logger.warn("[google-drive/auth] GOOGLE_CLIENT_ID not configured");
      return NextResponse.json(
        { error: "Google Drive OAuth not configured (missing GOOGLE_CLIENT_ID)" },
        { status: 500 },
      );
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const redirectUri = `${origin}/api/connectors/google-drive/callback`;

    // State encodes workspace + user + timestamp + nonce for CSRF protection.
    // Same format as GitHub connector: orgId:userId:timestamp:nonce[:popup]
    const nonce = randomBytes(16).toString("hex");
    const returnMode = request.nextUrl.searchParams.get("returnMode");
    const state = [
      workspaceId,
      user.id,
      Date.now().toString(),
      nonce,
      ...(returnMode === "popup" ? ["popup"] : []),
    ].join(":");

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set(
      "scope",
      [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ].join(" "),
    );
    authUrl.searchParams.set("state", state);
    // Request offline access so we receive a refresh_token
    authUrl.searchParams.set("access_type", "offline");
    // Force consent screen on every auth so refresh_token is always returned
    authUrl.searchParams.set("prompt", "consent");

    logger.warn("[google-drive/auth] Redirecting to Google OAuth", {
      workspaceId,
      userId: user.id,
    });

    return NextResponse.redirect(authUrl.toString());
  } catch (err: unknown) {
    logger.error("[google-drive/auth] OAuth init error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to initiate OAuth" }, { status: 500 });
  }
}
