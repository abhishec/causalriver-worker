export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace-helpers';
import { randomBytes } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * GET /api/connectors/github/auth
 *
 * Initiates GitHub OAuth flow - redirects user to GitHub authorization
 */
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
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 400 }
      );
    }

    // Get OAuth credentials (org-level or platform-level)
    const { data: orgOAuthData } = await supabase.rpc('get_org_oauth_credentials', {
      p_organization_id: workspaceId,
      p_connector_type: 'github',
    });

    let clientId: string;
    let scopes: string;

    if (orgOAuthData) {
      // Org has custom OAuth app
      clientId = orgOAuthData.client_id;
      scopes = (orgOAuthData.scopes || []).join(' ');
    } else {
      // Use platform credentials
      clientId = process.env.GITHUB_CLIENT_ID || '';
      scopes = [
        'repo', // Full repo access
        'read:org',
        'read:user',
      ].join(' ');
    }

    if (!clientId) {
      return NextResponse.json(
        { error: 'GitHub OAuth not configured (no platform or org credentials)' },
        { status: 500 }
      );
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/connectors/github/callback`;

    const nonce = randomBytes(16).toString('hex');
    // If returnMode=popup is set, append 'popup' to state so the callback
    // returns HTML with postMessage instead of a redirect (for onboarding inline flow)
    const returnMode = request.nextUrl.searchParams.get('returnMode');
    const state = `${workspaceId}:${user.id}:${Date.now()}:${nonce}${returnMode === 'popup' ? ':popup' : ''}`;

    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    logger.error('GitHub OAuth init error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth' },
      { status: 500 }
    );
  }
}
