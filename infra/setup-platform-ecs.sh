#!/bin/bash
# Setup AWS ECS infrastructure for NexusBrain Platform (no Docker needed)
# Docker build will happen via GitHub Actions

set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="848269696611"
CLUSTER_NAME="nexusbrain-cluster"

echo "🏗️  NexusBrain Platform - AWS Infrastructure Setup"
echo "===================================================="
echo ""

# Step 1: Create ECS cluster
echo "📦 Step 1: Creating ECS cluster..."
aws ecs create-cluster \
  --cluster-name "${CLUSTER_NAME}" \
  --region "${REGION}" \
  2>/dev/null && echo "   ✅ Cluster created" || echo "   ℹ️  Cluster already exists"

# Step 2: Create execution role if it doesn't exist
echo ""
echo "🔐 Step 2: Setting up IAM role..."
ROLE_EXISTS=$(aws iam get-role --role-name ecsTaskExecutionRole 2>/dev/null || echo "")
if [ -z "$ROLE_EXISTS" ]; then
  cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

  aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document file:///tmp/trust-policy.json

  aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

  echo "   ✅ IAM role created"
else
  echo "   ℹ️  IAM role already exists"
fi

# Step 3: Create CloudWatch log group
echo ""
echo "📝 Step 3: Creating CloudWatch log group..."
aws logs create-log-group \
  --log-group-name "/ecs/nexusbrain-platform" \
  --region "${REGION}" \
  2>/dev/null && echo "   ✅ Log group created" || echo "   ℹ️  Log group already exists"

# Step 4: Setup VPC and Security Group
echo ""
echo "🌐 Step 4: Setting up networking..."

VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=is-default,Values=true" \
  --query 'Vpcs[0].VpcId' \
  --output text \
  --region "${REGION}")

echo "   Using VPC: ${VPC_ID}"

# Create security group
SG_EXISTS=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=nexusbrain-platform-sg" \
  --query 'SecurityGroups[0].GroupId' \
  --output text \
  --region "${REGION}" 2>/dev/null || echo "")

if [ -z "$SG_EXISTS" ] || [ "$SG_EXISTS" == "None" ]; then
  SG_ID=$(aws ec2 create-security-group \
    --group-name nexusbrain-platform-sg \
    --description "Security group for NexusBrain platform" \
    --vpc-id "${VPC_ID}" \
    --region "${REGION}" \
    --query 'GroupId' \
    --output text)
  echo "   ✅ Security group created: ${SG_ID}"
else
  SG_ID=$SG_EXISTS
  echo "   ℹ️  Security group already exists: ${SG_ID}"
fi

# Allow inbound traffic on port 3000
aws ec2 authorize-security-group-ingress \
  --group-id "${SG_ID}" \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0 \
  --region "${REGION}" \
  2>/dev/null || echo "   ℹ️  Port 3000 already open"

# Allow inbound traffic on port 80
aws ec2 authorize-security-group-ingress \
  --group-id "${SG_ID}" \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --region "${REGION}" \
  2>/dev/null || echo "   ℹ️  Port 80 already open"

echo ""
echo "✅ Infrastructure setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Add AWS credentials to GitHub Secrets:"
echo "      - AWS_ACCESS_KEY_ID"
echo "      - AWS_SECRET_ACCESS_KEY"
echo ""
echo "   2. Push code to trigger deployment:"
echo "      git push origin main"
echo ""
echo "   3. Monitor deployment:"
echo "      https://github.com/abhishec/nexus-intelligence/actions"
echo ""
echo "ℹ️  The GitHub Action will:"
echo "   - Build Docker image"
echo "   - Push to ECR"
echo "   - Deploy to ECS"
echo "   - Provide the public URL"
echo ""
