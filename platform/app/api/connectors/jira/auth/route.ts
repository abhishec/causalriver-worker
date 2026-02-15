import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrgId } from '@/lib/org-helpers';

/**
 * GET /api/connectors/jira/auth
 *
 * Initiates Jira OAuth 2.0 flow - redirects user to Atlassian authorization
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // 2. Get organization
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 400 }
      );
    }

    // 3. Build Atlassian OAuth URL
    const clientId = process.env.JIRA_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: 'Jira OAuth not configured' },
        { status: 500 }
      );
    }

    const scopes = [
      'read:jira-work',
      'read:jira-user',
      'offline_access', // for refresh token
    ].join(' ');

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/connectors/jira/callback`;

    const state = `${orgId}:${user.id}:${Date.now()}`;

    const authUrl = new URL('https://auth.atlassian.com/authorize');
    authUrl.searchParams.set('audience', 'api.atlassian.com');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('prompt', 'consent');

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error('Jira OAuth init error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate OAuth' },
      { status: 500 }
    );
  }
}
