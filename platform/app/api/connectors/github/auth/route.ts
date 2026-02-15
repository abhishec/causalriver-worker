import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrgId } from '@/lib/org-helpers';

/**
 * GET /api/connectors/github/auth
 *
 * Initiates GitHub OAuth flow - redirects user to GitHub authorization
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 400 }
      );
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: 'GitHub OAuth not configured' },
        { status: 500 }
      );
    }

    const scopes = [
      'repo', // Full repo access
      'read:org',
      'read:user',
    ].join(' ');

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/connectors/github/callback`;

    const state = `${orgId}:${user.id}:${Date.now()}`;

    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error('GitHub OAuth init error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate OAuth' },
      { status: 500 }
    );
  }
}
