#!/bin/bash
# Add AWS credentials to GitHub Secrets for ECS deployment

set -e

echo "🔐 Adding AWS Credentials to GitHub Secrets"
echo "============================================"
echo ""

# Get AWS credentials
AWS_ACCESS_KEY=$(aws configure get aws_access_key_id)
AWS_SECRET_KEY=$(aws configure get aws_secret_access_key)

echo "📋 AWS Credentials found:"
echo "   Access Key: ${AWS_ACCESS_KEY:0:8}***"
echo "   Secret Key: ***${AWS_SECRET_KEY: -4}"
echo ""

# Check if gh is authenticated
if ! gh auth status >/dev/null 2>&1; then
  echo "🔑 GitHub CLI not authenticated. Logging in..."
  gh auth login
fi

echo ""
echo "📤 Adding secrets to GitHub repository..."

# Add AWS_ACCESS_KEY_ID
echo "$AWS_ACCESS_KEY" | gh secret set AWS_ACCESS_KEY_ID

# Add AWS_SECRET_ACCESS_KEY
echo "$AWS_SECRET_KEY" | gh secret set AWS_SECRET_ACCESS_KEY

echo ""
echo "✅ Secrets added successfully!"
echo ""
echo "🚀 Triggering deployment workflow..."
gh workflow run deploy-platform-ecs.yml

echo ""
echo "✅ Deployment triggered!"
echo ""
echo "📊 Monitor deployment:"
echo "   https://github.com/abhishec/nexus-intelligence/actions"
echo ""
echo "⏳ Build + Deploy will take ~5-10 minutes"
echo "   You'll get a public IP when it's done!"
echo ""
