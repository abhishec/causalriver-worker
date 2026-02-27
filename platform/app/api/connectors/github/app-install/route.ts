export const dynamic = "force-dynamic";
/**
 * GET /api/connectors/github/app-install
 *
 * GitHub App install flow — org-level access in < 3 clicks.
 * Redirects the user to the GitHub App installation page.
 * After installation GitHub redirects back with ?installation_id=...&setup_action=install
 * which is handled by the existing /callback route (or the /app-install/callback below).
 *
 * Advantages over OAuth PAT flow:
 * - Org-level access (all repos) with a single "Install" click
 * - Automatic token rotation via GitHub App installation tokens
 * - No user credentials stored — only installation_id
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { randomBytes } from "crypto";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
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

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const appSlug = process.env.GITHUB_APP_SLUG;
    if (!appSlug) {
      // Fallback to OAuth flow if App not configured
      return NextResponse.redirect(
        new URL(`/api/connectors/github/auth`, request.url)
      );
    }

    const nonce = randomBytes(16).toString("hex");
    const state = `${workspaceId}:${user.id}:${Date.now()}:${nonce}`;

    // Store state in a short-lived cookie so we can verify on callback
    const installUrl = new URL(
      `https://github.com/apps/${appSlug}/installations/new`
    );
    installUrl.searchParams.set("state", state);

    const response = NextResponse.redirect(installUrl.toString());
    response.cookies.set("gh_app_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    return response;
  } catch (error) {
    logger.error("[GitHub App Install] Error:", error);
    return NextResponse.json({ error: "Failed to initiate App install" }, { status: 500 });
  }
}
