#!/bin/bash

# Apply database migrations using Supabase PostgREST
set -e

SUPABASE_URL="${SUPABASE_URL:-https://zmlqvuzoodcgmkgkivfw.supabase.co}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

echo "🚀 Applying database migrations to Supabase..."
echo ""

# Migration 1: OAuth Connector Credentials
echo "📄 Applying migration: 20260215000003_oauth_connector_credentials.sql"
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/query" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d @<(cat supabase/migrations/20260215000003_oauth_connector_credentials.sql | jq -Rs '{query: .}')

echo "✅ Migration 1 applied"
echo ""

# Migration 2: Connector Checkpoints
echo "📄 Applying migration: 20260215000004_connector_checkpoints.sql"
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/query" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d @<(cat supabase/migrations/20260215000004_connector_checkpoints.sql | jq -Rs '{query: .}')

echo "✅ Migration 2 applied"
echo ""

echo "🎉 All migrations applied successfully!"
