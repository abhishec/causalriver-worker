#!/bin/bash
# Store NexusBrain secrets in AWS SSM Parameter Store
# Run this before pushing the Docker image
#
# Usage: ./infra/store-secrets.sh

set -euo pipefail

REGION="us-east-1"

echo "============================================"
echo "  NexusBrain Secret Store (SSM Parameter Store)"
echo "============================================"
echo ""
echo "This script will ask for your secrets and store them securely in AWS."
echo "Press Enter to skip optional secrets."
echo ""

store_secret() {
  local name=$1
  local value=$2
  local description=$3

  if [ -z "${value}" ]; then
    echo "    Skipped: /nexusbrain/${name} (empty)"
    return
  fi

  aws ssm put-parameter \
    --name "/nexusbrain/${name}" \
    --type "SecureString" \
    --value "${value}" \
    --description "${description}" \
    --overwrite \
    --region "${REGION}" > /dev/null 2>&1

  echo "    Stored: /nexusbrain/${name}"
}

# ─── Required Secrets ────────────────────────────────────────────
echo "─── Required Secrets ───"
echo ""

read -rp "SUPABASE_URL (e.g. https://xyz.supabase.co): " SUPABASE_URL
store_secret "SUPABASE_URL" "${SUPABASE_URL}" "Supabase project URL"

read -rsp "SUPABASE_SERVICE_ROLE_KEY: " SUPABASE_SERVICE_ROLE_KEY
echo ""
store_secret "SUPABASE_SERVICE_ROLE_KEY" "${SUPABASE_SERVICE_ROLE_KEY}" "Supabase service role key"

# ─── Optional Secrets ────────────────────────────────────────────
echo ""
echo "─── Optional Secrets (press Enter to skip) ───"
echo ""

read -rsp "ANTHROPIC_API_KEY (for LLM training): " ANTHROPIC_API_KEY
echo ""
store_secret "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY}" "Anthropic API key for LLM distillation"

read -rp "FRED_API_KEY (economic data, default: DEMO_KEY): " FRED_API_KEY
FRED_API_KEY="${FRED_API_KEY:-DEMO_KEY}"
store_secret "FRED_API_KEY" "${FRED_API_KEY}" "FRED API key for economic data"

read -rsp "SLACK_BOT_TOKEN (xoxb-...): " SLACK_BOT_TOKEN
echo ""
store_secret "SLACK_BOT_TOKEN" "${SLACK_BOT_TOKEN}" "Slack bot token for connector"

read -rsp "HUBSPOT_API_KEY (pat-...): " HUBSPOT_API_KEY
echo ""
store_secret "HUBSPOT_API_KEY" "${HUBSPOT_API_KEY}" "HubSpot API key for connector"

read -rsp "STRIPE_API_KEY (sk_live_...): " STRIPE_API_KEY
echo ""
store_secret "STRIPE_API_KEY" "${STRIPE_API_KEY}" "Stripe API key for connector"

read -rsp "GITHUB_TOKEN (ghp_...): " GITHUB_TOKEN
echo ""
store_secret "GITHUB_TOKEN" "${GITHUB_TOKEN}" "GitHub token for connector"

read -rp "GITHUB_OWNER: " GITHUB_OWNER
store_secret "GITHUB_OWNER" "${GITHUB_OWNER}" "GitHub org/owner for connector"

read -rp "GITHUB_REPO: " GITHUB_REPO
store_secret "GITHUB_REPO" "${GITHUB_REPO}" "GitHub repo name for connector"

read -rp "SLACK_WEBHOOK_URL (for notifications): " SLACK_WEBHOOK_URL
store_secret "SLACK_WEBHOOK_URL" "${SLACK_WEBHOOK_URL}" "Slack webhook for training notifications"

echo ""
echo "============================================"
echo "  Secrets stored in SSM Parameter Store"
echo "============================================"
echo ""
echo "Verify with:"
echo "  aws ssm get-parameters-by-path --path /nexusbrain/ --region ${REGION} --query 'Parameters[*].Name'"
