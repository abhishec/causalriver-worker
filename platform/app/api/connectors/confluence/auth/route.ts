export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceId } from '@/lib/workspace-helpers';
import { randomBytes } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * GET /api/connectors/confluence/auth
 *
 * Initiates Confluence OAuth 2.0 flow - redirects user to Atlassian authorization.
 * Confluence shares the same Atlassian OAuth infrastructure as Jira (same client_id).
 * Key difference: scopes include read:confluence-content.all and read:confluence-space.summary.
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
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 400 }
      );
    }

    // 3. Get OAuth credentials (org-level or platform-level)
    // Confluence uses the same Atlassian OAuth app as Jira — same client_id
    const { data: orgOAuthData } = await supabase.rpc('get_org_oauth_credentials', {
      p_organization_id: workspaceId,
      p_connector_type: 'confluence',
    });

    let clientId: string;
    let scopes: string;

    if (orgOAuthData) {
      // Org has custom OAuth app
      clientId = (orgOAuthData as Record<string, string>).client_id;
      scopes = ((orgOAuthData as Record<string, string[]>).scopes || []).join(' ');
    } else {
      // Use platform credentials — Confluence shares the Jira OAuth app (same Atlassian app)
      clientId = process.env.CONFLUENCE_CLIENT_ID || process.env.JIRA_CLIENT_ID || '';
      scopes = [
        'read:confluence-content.all',
        'read:confluence-space.summary',
        'read:confluence-user',
        'offline_access', // for refresh token
      ].join(' ');
    }

    if (!clientId) {
      return NextResponse.json(
        { error: 'Confluence OAuth not configured (no platform or org credentials). Set CONFLUENCE_CLIENT_ID or JIRA_CLIENT_ID.' },
        { status: 500 }
      );
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/connectors/confluence/callback`;

    const nonce = randomBytes(16).toString('hex');
    const state = `${workspaceId}:${user.id}:${Date.now()}:${nonce}`;

    const authUrl = new URL('https://auth.atlassian.com/authorize');
    authUrl.searchParams.set('audience', 'api.atlassian.com');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('prompt', 'consent');

    return NextResponse.redirect(authUrl.toString());
  } catch (error: unknown) {
    logger.error('Confluence OAuth init error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Failed to initiate OAuth' },
      { status: 500 }
    );
  }
}
