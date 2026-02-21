# 🔐 OAuth Multi-Tenant Connector Setup

## Step 1: Apply Database Migration

**Open Supabase Dashboard SQL Editor** and run this SQL:

```sql
-- Add OAuth credential columns
ALTER TABLE org_connectors
  ADD COLUMN IF NOT EXISTS credentials JSONB,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_org_connector_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER org_connectors_updated_at
  BEFORE UPDATE ON org_connectors
  FOR EACH ROW
  EXECUTE FUNCTION update_org_connector_timestamp();

-- Credential management functions
CREATE OR REPLACE FUNCTION get_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credentials JSONB;
BEGIN
  SELECT credentials INTO v_credentials
  FROM org_connectors
  WHERE organization_id = p_organization_id
    AND connector_type = p_connector_type
    AND status = 'active';
  RETURN v_credentials;
END;
$$;

CREATE OR REPLACE FUNCTION store_connector_credentials(
  p_organization_id UUID,
  p_connector_type TEXT,
  p_credentials JSONB,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_connector_id UUID;
BEGIN
  INSERT INTO org_connectors (
    organization_id,
    connector_type,
    credentials,
    metadata,
    status
  )
  VALUES (
    p_organization_id,
    p_connector_type,
    p_credentials,
    p_metadata,
    'active'
  )
  ON CONFLICT (organization_id, connector_type)
  DO UPDATE SET
    credentials = p_credentials,
    metadata = p_metadata,
    status = 'active',
    error_message = NULL
  RETURNING id INTO v_connector_id;
  RETURN v_connector_id;
END;
$$;

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_connectors_unique
  ON org_connectors (organization_id, connector_type);

-- Grants
GRANT EXECUTE ON FUNCTION get_connector_credentials(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION store_connector_credentials(UUID, TEXT, JSONB, JSONB) TO authenticated;
```

## Step 2: Test Migration

Run:
```bash
pnpm run test:migration
```

## Step 3: Configure OAuth Apps

### Slack OAuth App
1. Go to https://api.slack.com/apps
2. Create new app → "From scratch"
3. App Name: "NexusBrain"
4. Development Workspace: Your workspace
5. OAuth & Permissions:
   - Redirect URLs: `https://YOUR_DOMAIN/api/connectors/slack/callback`
   - Scopes:
     - `channels:history`
     - `channels:read`
     - `users:read`
     - `team:read`
6. Copy: Client ID, Client Secret

### Jira OAuth App
1. Go to https://developer.atlassian.com/console/myapps/
2. Create → OAuth 2.0 integration
3. Settings:
   - Redirect URL: `https://YOUR_DOMAIN/api/connectors/jira/callback`
   - Permissions: `read:jira-work`, `read:jira-user`
4. Copy: Client ID, Secret

### GitHub OAuth App
1. Go to https://github.com/settings/developers
2. New OAuth App
3. Settings:
   - Homepage: `https://YOUR_DOMAIN`
   - Callback: `https://YOUR_DOMAIN/api/connectors/github/callback`
4. Copy: Client ID, Client Secret

## Step 4: Add to Environment

```bash
# .env.local (platform)
NEXT_PUBLIC_APP_URL=http://localhost:3000

SLACK_CLIENT_ID=your-slack-client-id
SLACK_CLIENT_SECRET=your-slack-client-secret

JIRA_CLIENT_ID=your-jira-client-id
JIRA_CLIENT_SECRET=your-jira-client-secret

GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

## Step 5: Deploy & Test

The complete OAuth flow is now ready:

1. User clicks "Connect Slack" in dashboard
2. Redirected to Slack OAuth
3. Approves permissions
4. Redirected back with code
5. Backend exchanges code for token
6. Token stored encrypted in `org_connectors.credentials`
7. Background jobs use per-org tokens

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Platform (Next.js)                              │
│  /admin/connectors                              │
│  - Connect Slack Button                         │
│  - Connect Jira Button                          │
│  - Connect GitHub Button                        │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  OAuth Flow (API Routes)                        │
│  /api/connectors/slack/auth → Redirect to Slack │
│  /api/connectors/slack/callback → Store token   │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Database (org_connectors)                      │
│  org_id + connector_type + credentials (JSONB)  │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Ingestion Engine                                │
│  Pulls tokens from DB per org                   │
│  Fetches data using org's credentials           │
└─────────────────────────────────────────────────┘
```
