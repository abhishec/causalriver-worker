#!/bin/bash
# Deploy NexusBrain Platform to AWS ECS
# This deploys the Next.js app as a containerized web server

set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="848269696611"
ECR_REPO="nexusbrain-platform"
CLUSTER_NAME="nexusbrain-cluster"
SERVICE_NAME="nexusbrain-platform-service"
TASK_FAMILY="nexusbrain-platform"

echo "🚀 NexusBrain Platform Deployment"
echo "======================================"
echo ""

# Step 1: Create ECR repository for platform
echo "📦 Step 1: Creating ECR repository..."
aws ecr create-repository \
  --repository-name "${ECR_REPO}" \
  --region "${REGION}" \
  --image-scanning-configuration scanOnPush=true \
  2>/dev/null && echo "   ✅ ECR repo created" || echo "   ℹ️  ECR repo already exists"

# Step 2: Build Docker image
echo ""
echo "🔨 Step 2: Building Docker image..."
cd "$(dirname "$0")/.."
docker build \
  -t "${ECR_REPO}:latest" \
  -f platform/Dockerfile \
  .

# Step 3: Tag and push to ECR
echo ""
echo "⬆️  Step 3: Pushing image to ECR..."
aws ecr get-login-password --region "${REGION}" | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

docker tag "${ECR_REPO}:latest" "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest"
docker push "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest"

echo "   ✅ Image pushed to ECR"

# Step 4: Create ECS cluster if it doesn't exist
echo ""
echo "🏗️  Step 4: Setting up ECS cluster..."
aws ecs create-cluster \
  --cluster-name "${CLUSTER_NAME}" \
  --region "${REGION}" \
  2>/dev/null && echo "   ✅ Cluster created" || echo "   ℹ️  Cluster already exists"

# Step 5: Create task definition
echo ""
echo "📋 Step 5: Creating ECS task definition..."
cat > /tmp/platform-task-def.json << EOF
{
  "family": "${TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "platform",
      "image": "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "NEXT_PUBLIC_SUPABASE_URL",
          "value": "https://zmlqvuzoodcgmkgkivfw.supabase.co"
        },
        {
          "name": "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzE3ODUsImV4cCI6MjA4NjEwNzc4NX0.bSWsqP217_9Fm01XWPBq-sfHH2d4n2h-MooBNWp2jJc"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/nexusbrain-platform",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "platform"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition \
  --cli-input-json file:///tmp/platform-task-def.json \
  --region "${REGION}" > /dev/null

echo "   ✅ Task definition registered"

# Step 6: Create CloudWatch log group
echo ""
echo "📝 Step 6: Creating CloudWatch log group..."
aws logs create-log-group \
  --log-group-name "/ecs/nexusbrain-platform" \
  --region "${REGION}" \
  2>/dev/null && echo "   ✅ Log group created" || echo "   ℹ️  Log group already exists"

# Step 7: Create or update service
echo ""
echo "🌐 Step 7: Creating ECS service..."

# Check if service exists
SERVICE_EXISTS=$(aws ecs describe-services \
  --cluster "${CLUSTER_NAME}" \
  --services "${SERVICE_NAME}" \
  --region "${REGION}" \
  --query 'services[0].status' \
  --output text 2>/dev/null || echo "MISSING")

if [ "$SERVICE_EXISTS" == "ACTIVE" ]; then
  echo "   🔄 Service exists, updating..."
  aws ecs update-service \
    --cluster "${CLUSTER_NAME}" \
    --service "${SERVICE_NAME}" \
    --task-definition "${TASK_FAMILY}" \
    --force-new-deployment \
    --region "${REGION}" > /dev/null
  echo "   ✅ Service updated"
else
  echo "   🆕 Creating new service..."

  # Get default VPC and subnets
  VPC_ID=$(aws ec2 describe-vpcs \
    --filters "Name=is-default,Values=true" \
    --query 'Vpcs[0].VpcId' \
    --output text \
    --region "${REGION}")

  SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=${VPC_ID}" \
    --query 'Subnets[*].SubnetId' \
    --output text \
    --region "${REGION}" | tr '\t' ',')

  # Create security group
  SG_ID=$(aws ec2 create-security-group \
    --group-name nexusbrain-platform-sg \
    --description "Security group for NexusBrain platform" \
    --vpc-id "${VPC_ID}" \
    --region "${REGION}" \
    --query 'GroupId' \
    --output text 2>/dev/null || \
    aws ec2 describe-security-groups \
      --filters "Name=group-name,Values=nexusbrain-platform-sg" \
      --query 'SecurityGroups[0].GroupId' \
      --output text \
      --region "${REGION}")

  # Allow inbound traffic on port 3000
  aws ec2 authorize-security-group-ingress \
    --group-id "${SG_ID}" \
    --protocol tcp \
    --port 3000 \
    --cidr 0.0.0.0/0 \
    --region "${REGION}" \
    2>/dev/null || echo "   ℹ️  Security group rule already exists"

  # Create service
  aws ecs create-service \
    --cluster "${CLUSTER_NAME}" \
    --service-name "${SERVICE_NAME}" \
    --task-definition "${TASK_FAMILY}" \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SG_ID}],assignPublicIp=ENABLED}" \
    --region "${REGION}" > /dev/null

  echo "   ✅ Service created"
fi

# Step 8: Get service URL
echo ""
echo "🎉 Deployment complete!"
echo "======================================"
echo ""
echo "⏳ Waiting for task to start (this may take 1-2 minutes)..."
sleep 30

# Get public IP of running task
TASK_ARN=$(aws ecs list-tasks \
  --cluster "${CLUSTER_NAME}" \
  --service-name "${SERVICE_NAME}" \
  --region "${REGION}" \
  --query 'taskArns[0]' \
  --output text)

if [ "$TASK_ARN" != "None" ] && [ ! -z "$TASK_ARN" ]; then
  ENI_ID=$(aws ecs describe-tasks \
    --cluster "${CLUSTER_NAME}" \
    --tasks "${TASK_ARN}" \
    --region "${REGION}" \
    --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
    --output text)

  if [ ! -z "$ENI_ID" ]; then
    PUBLIC_IP=$(aws ec2 describe-network-interfaces \
      --network-interface-ids "${ENI_ID}" \
      --region "${REGION}" \
      --query 'NetworkInterfaces[0].Association.PublicIp' \
      --output text)

    echo ""
    echo "✅ Platform deployed successfully!"
    echo ""
    echo "🌐 Your platform is running at:"
    echo "   http://${PUBLIC_IP}:3000"
    echo ""
    echo "📊 Monitor your deployment:"
    echo "   https://console.aws.amazon.com/ecs/home?region=${REGION}#/clusters/${CLUSTER_NAME}/services/${SERVICE_NAME}/tasks"
    echo ""
  fi
fi

echo "ℹ️  Note: It may take 1-2 minutes for the container to fully start."
echo ""
