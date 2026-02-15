import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrgId } from '@/lib/org-helpers';

/**
 * GET /api/connectors/slack/auth
 *
 * Initiates Slack OAuth flow - redirects user to Slack authorization page
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // 2. Get current organization
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 400 }
      );
    }

    // 3. Get OAuth credentials (org-level or platform-level)
    const { data: orgOAuthData } = await supabase.rpc('get_org_oauth_credentials', {
      p_organization_id: orgId,
      p_connector_type: 'slack',
    });

    // Use org-level credentials if configured, otherwise platform credentials
    let clientId: string;
    let scopes: string;

    if (orgOAuthData) {
      // Org has custom OAuth app
      clientId = orgOAuthData.client_id;
      scopes = (orgOAuthData.scopes || []).join(',');
    } else {
      // Use platform credentials
      clientId = process.env.SLACK_CLIENT_ID || '';
      scopes = [
        'channels:history',
        'channels:read',
        'users:read',
        'team:read',
        'groups:history', // private channels
        'groups:read',
        'im:history', // DMs
        'mpim:history', // group DMs
      ].join(',');
    }

    if (!clientId) {
      return NextResponse.json(
        { error: 'Slack OAuth not configured (no platform or org credentials)' },
        { status: 500 }
      );
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/connectors/slack/callback`;

    // Store state to verify callback
    const state = `${orgId}:${user.id}:${Date.now()}`;

    const authUrl = new URL('https://slack.com/oauth/v2/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    // 4. Redirect to Slack
    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error('Slack OAuth init error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate OAuth' },
      { status: 500 }
    );
  }
}
