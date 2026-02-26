export const dynamic = "force-dynamic";
/**
 * GET /api/connectors/github/app-install/callback
 *
 * GitHub redirects here after the user installs the GitHub App.
 * URL params: ?installation_id=<id>&setup_action=install&state=<state>
 *
 * Stores the installation_id in org_connectors so getInstallationToken()
 * can exchange it for short-lived repo tokens on every API call.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const installationId = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action");
  const stateParam = searchParams.get("state");

  const redirectBase = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  // Verify state cookie
  const stateCookie = request.cookies.get("gh_app_state")?.value;
  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    logger.warn("[GitHub App Callback] State mismatch");
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("Invalid state — please try again")}`
    );
  }

  if (setupAction === "delete" || !installationId) {
    return NextResponse.redirect(`${redirectBase}/connectors?error=installation_cancelled`);
  }

  // Parse state: orgId:userId:timestamp:nonce
  const parts = stateParam.split(":");
  if (parts.length < 4) {
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("Malformed state")}`
    );
  }
  const [orgId, userId] = parts;

  // Verify timestamp freshness (10 minutes)
  const ts = parseInt(parts[2], 10);
  if (Date.now() - ts > 10 * 60 * 1000) {
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("Install link expired — please try again")}`
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.redirect(`${redirectBase}/login`);
    }

    // Verify that orgId from state belongs to the authenticated user.
    // Prevents CSRF-style attacks where a crafted state targets another org's ID.
    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      logger.warn(`[GitHub App Callback] User ${user.id} is not a member of org ${orgId}`);
      return NextResponse.redirect(
        `${redirectBase}/connectors?error=${encodeURIComponent("Invalid organization — please try again")}`
      );
    }

    const admin = getAdminClient();

    // Fetch installation info from GitHub
    let installationLogin = "";
    let installationAccountType = "";
    try {
      const appId = process.env.GITHUB_APP_ID;
      const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
      if (appId && privateKey) {
        const { sign } = await import("jsonwebtoken");
        const jwt = sign({}, privateKey, {
          algorithm: "RS256",
          issuer: appId,
          expiresIn: "10m",
        });
        const resp = await fetch(
          `https://api.github.com/app/installations/${installationId}`,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          installationLogin = data.account?.login ?? "";
          installationAccountType = data.account?.type ?? "";
        }
      }
    } catch {
      // Non-fatal: we still save the installation_id even without metadata
    }

    // Store installation in org_connectors
    await admin.rpc("store_connector_credentials", {
      p_organization_id: orgId,
      p_connector_type: "github",
      p_credentials: { installation_id: installationId, auth_method: "github_app" },
      p_metadata: {
        installation_id: installationId,
        account_login: installationLogin,
        account_type: installationAccountType,
        connected_at: new Date().toISOString(),
        connected_by: userId,
        auth_method: "github_app",
      },
    });

    logger.info(
      `[GitHub App] Installation ${installationId} stored for org ${orgId} (${installationLogin})`
    );

    const response = NextResponse.redirect(
      `${redirectBase}/connectors?success=github_app_installed`
    );
    // Clear the state cookie
    response.cookies.set("gh_app_state", "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    logger.error("[GitHub App Callback] Error:", error);
    return NextResponse.redirect(
      `${redirectBase}/connectors?error=${encodeURIComponent("Failed to save installation")}`
    );
  }
}
