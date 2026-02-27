export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * GET /api/connectors/jira/callback
 *
 * Handles Jira OAuth callback and stores credentials
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/connectors?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/connectors?error=invalid_callback', request.url)
      );
    }

    const parts = state.split(':');
    // State format: orgId:userId:timestamp:nonce
    // Require all 4 mandatory parts; nonce must be present and non-empty to
    // prevent state replay attacks across sessions within the 10-minute window.
    if (parts.length < 4) {
      return NextResponse.redirect(
        new URL('/connectors?error=invalid_state', request.url)
      );
    }
    const [orgId, userId, timestamp, nonce] = parts;
    if (!nonce || nonce.length < 8) {
      return NextResponse.redirect(
        new URL('/connectors?error=invalid_state', request.url)
      );
    }
    const ts = parseInt(timestamp, 10);

    if (isNaN(ts) || Date.now() - ts > 10 * 60 * 1000) {
      return NextResponse.redirect(
        new URL('/connectors?error=expired_state', request.url)
      );
    }

    let supabase: Awaited<ReturnType<typeof createClient>>;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    let user = null;
    try {
      const { data: _routeAuthData } = await supabase.auth.getUser();
      user = _routeAuthData.user;
    } catch {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (!user || user.id !== userId) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Verify the authenticated user belongs to the org extracted from state
    const { data: orgMembership } = await supabase
      .from('org_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!orgMembership) {
      return NextResponse.redirect(new URL('/connectors?error=forbidden', request.url));
    }

    // Get OAuth credentials (org-level or platform-level)
    const service = await createServiceClient();
    const { data: orgOAuthData } = await service.rpc('get_org_oauth_credentials', {
      p_organization_id: orgId,
      p_connector_type: 'jira',
    });

    let clientId: string;
    let clientSecret: string;

    if (orgOAuthData) {
      // Use org-level credentials
      clientId = orgOAuthData.client_id;
      clientSecret = orgOAuthData.client_secret;
    } else {
      // Use platform credentials
      clientId = process.env.JIRA_CLIENT_ID || '';
      clientSecret = process.env.JIRA_CLIENT_SECRET || '';
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/connectors/jira/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/connectors?error=oauth_not_configured', request.url)
      );
    }

    const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      logger.error('Jira OAuth error:', {
        error: tokenData.error,
        error_description: tokenData.error_description,
        status: tokenResponse.status,
      });
      return NextResponse.redirect(
        new URL(`/connectors?error=${encodeURIComponent(tokenData.error ?? 'oauth_error')}`, request.url)
      );
    }

    // Get accessible resources (Jira sites)
    const resourcesResponse = await fetch(
      'https://api.atlassian.com/oauth/token/accessible-resources',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json',
        },
      }
    );

    if (!resourcesResponse.ok) {
      logger.error('[Jira callback] accessible-resources failed:', resourcesResponse.status);
      return NextResponse.redirect(
        new URL('/connectors?error=jira_no_sites', request.url)
      );
    }

    const resources = await resourcesResponse.json();
    if (!Array.isArray(resources) || resources.length === 0) {
      logger.error('[Jira callback] No accessible Jira sites found');
      return NextResponse.redirect(
        new URL('/connectors?error=jira_no_sites', request.url)
      );
    }
    const primarySite = resources[0]; // Use first available site

    // Store credentials — reuse the same service client created above
    const serviceForStore = service;

    const credentials = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      scope: tokenData.scope,
    };

    const metadata = {
      cloud_id: primarySite?.id,
      site_url: primarySite?.url,
      site_name: primarySite?.name,
      available_sites: resources,
      connected_at: new Date().toISOString(),
      connected_by: user.id,
    };

    const { error: storeError } = await serviceForStore
      .from('org_connectors')
      .upsert({
        organization_id: orgId,
        connector_type: 'jira',
        instance_name: primarySite?.name || 'default',
        display_name: primarySite?.name || 'Jira',
        status: 'active',
        credentials,
        metadata,
        config: {
          site_name: primarySite?.name,
          site_url: primarySite?.url,
        },
      }, {
        onConflict: 'organization_id,connector_type,instance_name'
      });

    if (storeError) {
      logger.error('Failed to store Jira credentials:', storeError);
      return NextResponse.redirect(
        new URL('/connectors?error=storage_failed', request.url)
      );
    }

    return NextResponse.redirect(
      new URL('/connectors?success=jira_connected', request.url)
    );
  } catch (error: unknown) {
    logger.error('Jira callback error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.redirect(
      new URL('/connectors?error=auth_failed', request.url)
    );
  }
}
