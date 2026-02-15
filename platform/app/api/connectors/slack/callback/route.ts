import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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
        new URL(`/admin/connectors?error=${error}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/admin/connectors?error=invalid_callback', request.url)
      );
    }

    // 2. Parse state to get org_id
    const [orgId, userId, timestamp] = state.split(':');

    // Verify state is recent (within 10 minutes)
    const stateAge = Date.now() - parseInt(timestamp);
    if (stateAge > 10 * 60 * 1000) {
      return NextResponse.redirect(
        new URL('/admin/connectors?error=expired_state', request.url)
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

    // 4. Exchange code for access token
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/connectors/slack/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/admin/connectors?error=oauth_not_configured', request.url)
      );
    }

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
      console.error('Slack OAuth error:', tokenData);
      return NextResponse.redirect(
        new URL(`/admin/connectors?error=${tokenData.error}`, request.url)
      );
    }

    // 5. Store credentials in database
    const service = await createServiceClient();

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
    const { data: connectorId, error: storeError } = await service.rpc(
      'store_connector_credentials',
      {
        p_organization_id: orgId,
        p_connector_type: 'slack',
        p_credentials: credentials,
        p_metadata: metadata,
      }
    );

    if (storeError) {
      console.error('Failed to store Slack credentials:', storeError);

      // Fallback: direct insert/update if function doesn't exist yet
      const { error: fallbackError } = await service
        .from('org_connectors')
        .upsert({
          organization_id: orgId,
          connector_type: 'slack',
          status: 'active',
          credentials,
          metadata,
          config: {
            team_name: tokenData.team?.name,
            workspace_url: `https://${tokenData.team?.domain}.slack.com`,
          },
        }, {
          onConflict: 'organization_id,connector_type'
        });

      if (fallbackError) {
        return NextResponse.redirect(
          new URL('/admin/connectors?error=storage_failed', request.url)
        );
      }
    }

    // 6. Success! Redirect back to connectors page
    return NextResponse.redirect(
      new URL('/admin/connectors?success=slack_connected', request.url)
    );
  } catch (error: any) {
    console.error('Slack callback error:', error);
    return NextResponse.redirect(
      new URL(`/admin/connectors?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}
