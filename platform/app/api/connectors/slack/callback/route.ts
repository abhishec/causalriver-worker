export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { logger } from "@/lib/logger";

/**
 * GET /api/connectors/slack/callback
 *
 * Handles Slack OAuth callback - exchanges code for access token
 * and stores credentials in org_connectors table
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // 1. Handle OAuth errors
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

    // 2. Parse state to get org_id
    const parts = state.split(':');
    if (parts.length < 3) {
      return NextResponse.redirect(
        new URL('/connectors?error=invalid_state', request.url)
      );
    }
    const [orgId, userId, timestamp] = parts;

    // Verify state is recent (within 10 minutes)
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) {
      return NextResponse.redirect(
        new URL('/connectors?error=invalid_state', request.url)
      );
    }
    const stateAge = Date.now() - ts;
    if (stateAge > 10 * 60 * 1000) {
      return NextResponse.redirect(
        new URL('/connectors?error=expired_state', request.url)
      );
    }

    // 3. Verify user is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.redirect(
        new URL('/login', request.url)
      );
    }

    // Verify caller is a member of the org from the state
    const { data: orgMembership } = await supabase
      .from('org_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!orgMembership) {
      return NextResponse.redirect(new URL('/connectors?error=forbidden', request.url));
    }

    // 4. Get OAuth credentials (org-level or platform-level)
    const service = await createServiceClient();
    const { data: orgOAuthData } = await service.rpc('get_org_oauth_credentials', {
      p_organization_id: orgId,
      p_connector_type: 'slack',
    });

    let clientId: string;
    let clientSecret: string;

    if (orgOAuthData) {
      // Use org-level credentials
      clientId = orgOAuthData.client_id;
      clientSecret = orgOAuthData.client_secret;
    } else {
      // Use platform credentials
      clientId = process.env.SLACK_CLIENT_ID || '';
      clientSecret = process.env.SLACK_CLIENT_SECRET || '';
    }

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/connectors?error=oauth_not_configured', request.url)
      );
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/connectors/slack/callback`;

    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      logger.error('Slack OAuth error:', {
        error: tokenData.error,
      });
      return NextResponse.redirect(
        new URL(`/connectors?error=${encodeURIComponent(tokenData.error ?? 'oauth_error')}`, request.url)
      );
    }

    // 5. Store credentials in database

    const credentials = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
      bot_user_id: tokenData.bot_user_id,
      app_id: tokenData.app_id,
    };

    const metadata = {
      team_id: tokenData.team?.id,
      team_name: tokenData.team?.name,
      workspace_url: `https://${tokenData.team?.domain}.slack.com`,
      authed_user_id: tokenData.authed_user?.id,
      connected_at: new Date().toISOString(),
      connected_by: user.id,
    };

    // Use the store_connector_credentials function
    const slackInstanceName = tokenData.team?.name || 'default';

    const { data: connectorId, error: storeError } = await service.rpc(
      'store_connector_credentials',
      {
        p_organization_id: orgId,
        p_connector_type: 'slack',
        p_credentials: credentials,
        p_metadata: metadata,
        p_instance_name: slackInstanceName,
      }
    );

    if (storeError) {
      logger.error('Failed to store Slack credentials:', storeError);

      // Fallback: direct insert/update if function doesn't exist yet
      const { error: fallbackError } = await service
        .from('org_connectors')
        .upsert({
          organization_id: orgId,
          connector_type: 'slack',
          instance_name: slackInstanceName,
          display_name: tokenData.team?.name || 'Slack',
          status: 'active',
          credentials,
          metadata,
          config: {
            team_name: tokenData.team?.name,
            workspace_url: `https://${tokenData.team?.domain}.slack.com`,
          },
        }, {
          onConflict: 'organization_id,connector_type,instance_name'
        });

      if (fallbackError) {
        return NextResponse.redirect(
          new URL('/connectors?error=storage_failed', request.url)
        );
      }
    }

    // 6. Success! Redirect back to connectors page
    return NextResponse.redirect(
      new URL('/connectors?success=slack_connected', request.url)
    );
  } catch (error: unknown) {
    logger.error('Slack callback error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.redirect(
      new URL('/connectors?error=auth_failed', request.url)
    );
  }
}
