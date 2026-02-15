#!/bin/bash
# Deploy NexusBrain using AWS App Runner (No Docker Build Required!)
set -e

echo "═══════════════════════════════════════════════════════════════"
echo "NexusBrain - AWS App Runner Deployment"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "✅ App Runner will auto-build from your GitHub repository"
echo "✅ No local Docker required"
echo "✅ Auto-scaling built-in"
echo ""

# Get AWS account info
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")

echo "📋 AWS Configuration:"
echo "  Account: $AWS_ACCOUNT"
echo "  Region: $AWS_REGION"
echo ""

# Step 1: Create GitHub connection for App Runner
echo "Step 1: Setting up GitHub connection..."
echo ""
echo "⚠️  IMPORTANT: You need to create a GitHub connection first."
echo ""
echo "Run this command and follow the browser prompts:"
echo ""
echo "aws apprunner create-connection \\"
echo "  --connection-name nexusbrain-github \\"
echo "  --provider-type GITHUB \\"
echo "  --region $AWS_REGION"
echo ""
echo "After creating the connection, you'll receive a ConnectionArn."
echo "The AWS Console will guide you through GitHub OAuth."
echo ""
read -p "Press Enter after you've created the connection and have the ARN..."

read -p "Paste your GitHub Connection ARN: " GITHUB_CONNECTION_ARN

if [ -z "$GITHUB_CONNECTION_ARN" ]; then
    echo "❌ Connection ARN is required"
    exit 1
fi

# Step 2: Get GitHub repo
read -p "Enter your GitHub repository (e.g., username/nexusbrain): " GITHUB_REPO

if [ -z "$GITHUB_REPO" ]; then
    echo "❌ GitHub repository is required"
    exit 1
fi

# Step 3: Deploy with CDK
echo ""
echo "Step 2: Deploying infrastructure with CDK..."
echo ""

cd "$(dirname "$0")/cdk"

# Update bin/nexusbrain.ts to use App Runner stack
cat > bin/nexusbrain.ts <<EOF
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NexusBrainAppRunnerStack } from '../lib/nexusbrain-apprunner-stack';

const app = new cdk.App();

new NexusBrainAppRunnerStack(app, 'NexusBrainProduction', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  stackName: 'nexusbrain-production',
  environment: 'production',
  githubRepo: '$GITHUB_REPO',
  githubBranch: 'main',
  instanceCpu: '2 vCPU',
  instanceMemory: '4 GB',
  redisCacheNodeType: 'cache.t3.medium',
});
EOF

# Install dependencies
pnpm install

# Bootstrap CDK (if needed)
echo "Bootstrapping CDK..."
cdk bootstrap

# Deploy
echo ""
echo "🚀 Deploying App Runner service..."
echo "   This will take 5-10 minutes..."
echo ""

cdk deploy NexusBrainProduction --require-approval never --outputs-file outputs.json

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ ✅ ✅ DEPLOYMENT SUCCESSFUL! ✅ ✅ ✅"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Show outputs
if [ -f outputs.json ]; then
    SERVICE_URL=$(jq -r '.NexusBrainProduction.ServiceUrl' outputs.json)
    HEALTH_URL=$(jq -r '.NexusBrainProduction.HealthEndpoint' outputs.json)

    echo "🌐 Service URL: $SERVICE_URL"
    echo "🏥 Health Check: $HEALTH_URL"
    echo ""
    echo "Test with:"
    echo "  curl $HEALTH_URL"
    echo ""
fi

echo "📊 App Runner will now:"
echo "  1. Clone your GitHub repo"
echo "  2. Build the application automatically"
echo "  3. Deploy and start the service"
echo "  4. Auto-scale as needed"
echo ""
echo "Monitor deployment in AWS Console:"
echo "https://console.aws.amazon.com/apprunner/home?region=$AWS_REGION"
echo ""
