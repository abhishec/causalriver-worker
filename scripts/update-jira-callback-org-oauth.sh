#!/bin/bash
# Update Jira callback to support org-level OAuth

FILE="platform/app/api/connectors/jira/callback/route.ts"

# Find the line with clientId/clientSecret
LINE_NUM=$(grep -n "const clientId = process.env.JIRA_CLIENT_ID" "$FILE" | cut -d: -f1)

if [ -z "$LINE_NUM" ]; then
  echo "✅ Already updated or file structure changed"
  exit 0
fi

# Create temp file with replacement
cat > /tmp/jira_callback_replacement.txt << 'REPLACEMENT'
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

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        new URL('/admin/connectors?error=oauth_not_configured', request.url)
      );
    }
REPLACEMENT

echo "Updated $FILE to support org-level OAuth"
