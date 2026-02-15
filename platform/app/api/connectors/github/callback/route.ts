import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

/**
 * GET /api/connectors/github/callback
 *
 * Handles GitHub OAuth callback and stores credentials
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

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

    const [orgId, userId, timestamp] = state.split(':');

    if (Date.now() - parseInt(timestamp) > 10 * 60 * 1000) {
      return NextResponse.redirect(
        new URL('/admin/connectors?error=expired_state', request.url)
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Get OAuth credentials (org-level or platform-level)
    const service = await createServiceClient();
    const { data: orgOAuthData } = await service.rpc('get_org_oauth_credentials', {
      p_organization_id: orgId,
      p_connector_type: 'github',
    });

    let clientId: string;
    let clientSecret: string;

    if (orgOAuthData) {
      // Use org-level credentials
      clientId = orgOAuthData.client_id;
      clientSecret = orgOAuthData.client_secret;
    } else {
      // Use platform credentials
      clientId = process.env.GITHUB_CLIENT_ID || '';
      clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
    }

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/admin/connectors?error=oauth_not_configured', request.url)
      );
    }

    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('GitHub OAuth error:', tokenData);
      return NextResponse.redirect(
        new URL(`/admin/connectors?error=${tokenData.error}`, request.url)
      );
    }

    // Get user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const githubUser = await userResponse.json();

    // Store credentials
    const serviceForStore = await createServiceClient();

    const credentials = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      scope: tokenData.scope,
    };

    const metadata = {
      github_user_id: githubUser.id,
      github_login: githubUser.login,
      github_name: githubUser.name,
      github_avatar: githubUser.avatar_url,
      github_profile: githubUser.html_url,
      connected_at: new Date().toISOString(),
      connected_by: user.id,
    };

    const { error: storeError } = await serviceForStore
      .from('org_connectors')
      .upsert({
        organization_id: orgId,
        connector_type: 'github',
        status: 'active',
        credentials,
        metadata,
        config: {
          github_login: githubUser.login,
          github_name: githubUser.name,
        },
      }, {
        onConflict: 'organization_id,connector_type'
      });

    if (storeError) {
      console.error('Failed to store GitHub credentials:', storeError);
      return NextResponse.redirect(
        new URL('/admin/connectors?error=storage_failed', request.url)
      );
    }

    return NextResponse.redirect(
      new URL('/admin/connectors?success=github_connected', request.url)
    );
  } catch (error: any) {
    console.error('GitHub callback error:', error);
    return NextResponse.redirect(
      new URL(`/admin/connectors?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}
