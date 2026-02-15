#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NexusBrain Platform — ECS Service + ALB Setup
# ═══════════════════════════════════════════════════════════════
#
# Creates an always-on ECS Fargate service behind an Application
# Load Balancer to serve the Next.js platform dashboard.
#
# This is SEPARATE from setup-ecs.sh (which creates scheduled tasks
# for brain agents). The platform needs:
#   - ALB (public HTTP endpoint)
#   - ECS Service (always running, auto-restarts)
#   - Target Group (health-checked)
#   - Security Group (port 80 inbound)
#
# Prerequisites:
#   - AWS CLI configured (account 848269696611)
#   - ECR repo 'nexusbrain-platform' exists with :latest image
#   - Secrets stored in SSM (run store-secrets.sh first)
#   - ECS cluster 'nexusbrain-training' exists (run setup-ecs.sh first)
#
# Usage: ./infra/setup-platform.sh
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="848269696611"
CLUSTER_NAME="nexusbrain-training"
ECR_REPO="nexusbrain-platform"
SERVICE_NAME="nexusbrain-platform-service"
TASK_FAMILY="nexusbrain-platform-web"
LOG_GROUP="/ecs/nexusbrain-training"
EXEC_ROLE="arn:aws:iam::${ACCOUNT_ID}:role/nexusbrain-ecs-execution-role"

# Use the existing subnets and security group from the training cluster
SUBNET_1="subnet-0194ccd240a8a61c2"
SUBNET_2="subnet-0b43aa002353e79d9"

echo "============================================"
echo "  NexusBrain Platform — ECS + ALB Setup"
echo "  Account: ${ACCOUNT_ID}"
echo "  Region:  ${REGION}"
echo "============================================"
echo ""

# ─── Step 1: Get or Create VPC + Security Groups ──────────────
echo ">>> Step 1: Setting up networking..."

# Get the VPC ID from the subnet
VPC_ID=$(aws ec2 describe-subnets \
  --subnet-ids "${SUBNET_1}" \
  --region "${REGION}" \
  --query 'Subnets[0].VpcId' \
  --output text)

echo "    VPC: ${VPC_ID}"

# Create ALB security group (allows HTTP from internet)
ALB_SG=$(aws ec2 create-security-group \
  --group-name "nexusbrain-platform-alb-sg" \
  --description "ALB security group for NexusBrain Platform" \
  --vpc-id "${VPC_ID}" \
  --region "${REGION}" \
  --query 'GroupId' \
  --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=nexusbrain-platform-alb-sg" \
    --region "${REGION}" \
    --query 'SecurityGroups[0].GroupId' \
    --output text)

echo "    ALB Security Group: ${ALB_SG}"

# Allow HTTP inbound on ALB
aws ec2 authorize-security-group-ingress \
  --group-id "${ALB_SG}" \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --region "${REGION}" 2>/dev/null || echo "    (HTTP ingress rule already exists)"

# Create ECS task security group (allows traffic from ALB only)
TASK_SG=$(aws ec2 create-security-group \
  --group-name "nexusbrain-platform-task-sg" \
  --description "ECS task security group for NexusBrain Platform" \
  --vpc-id "${VPC_ID}" \
  --region "${REGION}" \
  --query 'GroupId' \
  --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=nexusbrain-platform-task-sg" \
    --region "${REGION}" \
    --query 'SecurityGroups[0].GroupId' \
    --output text)

echo "    Task Security Group: ${TASK_SG}"

# Allow traffic from ALB to task on port 3000
aws ec2 authorize-security-group-ingress \
  --group-id "${TASK_SG}" \
  --protocol tcp \
  --port 3000 \
  --source-group "${ALB_SG}" \
  --region "${REGION}" 2>/dev/null || echo "    (ALB→Task ingress rule already exists)"

# ─── Step 2: Create Application Load Balancer ─────────────────
echo ""
echo ">>> Step 2: Creating Application Load Balancer..."

ALB_ARN=$(aws elbv2 create-load-balancer \
  --name "nexusbrain-platform" \
  --subnets "${SUBNET_1}" "${SUBNET_2}" \
  --security-groups "${ALB_SG}" \
  --scheme internet-facing \
  --type application \
  --region "${REGION}" \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text 2>/dev/null || \
  aws elbv2 describe-load-balancers \
    --names "nexusbrain-platform" \
    --region "${REGION}" \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text)

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "${ALB_ARN}" \
  --region "${REGION}" \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

echo "    ALB ARN: ${ALB_ARN}"
echo "    ALB DNS: ${ALB_DNS}"

# ─── Step 3: Create Target Group ──────────────────────────────
echo ""
echo ">>> Step 3: Creating Target Group..."

TG_ARN=$(aws elbv2 create-target-group \
  --name "nexusbrain-platform-tg" \
  --protocol HTTP \
  --port 3000 \
  --vpc-id "${VPC_ID}" \
  --target-type ip \
  --health-check-protocol HTTP \
  --health-check-path "/api/health" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region "${REGION}" \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text 2>/dev/null || \
  aws elbv2 describe-target-groups \
    --names "nexusbrain-platform-tg" \
    --region "${REGION}" \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text)

echo "    Target Group: ${TG_ARN}"

# ─── Step 4: Create ALB Listener ──────────────────────────────
echo ""
echo ">>> Step 4: Creating ALB Listener (HTTP:80 → platform:3000)..."

LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn "${ALB_ARN}" \
  --protocol HTTP \
  --port 80 \
  --default-actions "Type=forward,TargetGroupArn=${TG_ARN}" \
  --region "${REGION}" \
  --query 'Listeners[0].ListenerArn' \
  --output text 2>/dev/null || \
  aws elbv2 describe-listeners \
    --load-balancer-arn "${ALB_ARN}" \
    --region "${REGION}" \
    --query 'Listeners[0].ListenerArn' \
    --output text)

echo "    Listener: ${LISTENER_ARN}"

# ─── Step 5: Register Platform Task Definition ────────────────
echo ""
echo ">>> Step 5: Registering platform task definition..."

aws ecs register-task-definition \
  --family "${TASK_FAMILY}" \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu "512" \
  --memory "1024" \
  --execution-role-arn "${EXEC_ROLE}" \
  --container-definitions "[
    {
      \"name\": \"nexusbrain-platform\",
      \"image\": \"${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest\",
      \"essential\": true,
      \"portMappings\": [
        {
          \"containerPort\": 3000,
          \"protocol\": \"tcp\"
        }
      ],
      \"environment\": [
        {\"name\": \"PORT\", \"value\": \"3000\"},
        {\"name\": \"NODE_ENV\", \"value\": \"production\"},
        {\"name\": \"HOSTNAME\", \"value\": \"0.0.0.0\"}
      ],
      \"secrets\": [
        {\"name\": \"SUPABASE_URL\", \"valueFrom\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL\"},
        {\"name\": \"SUPABASE_SERVICE_ROLE_KEY\", \"valueFrom\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY\"},
        {\"name\": \"SUPABASE_ANON_KEY\", \"valueFrom\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_ANON_KEY\"},
        {\"name\": \"NEXT_PUBLIC_SUPABASE_URL\", \"valueFrom\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL\"},
        {\"name\": \"NEXT_PUBLIC_SUPABASE_ANON_KEY\", \"valueFrom\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_ANON_KEY\"},
        {\"name\": \"ANTHROPIC_API_KEY\", \"valueFrom\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/ANTHROPIC_API_KEY\"},
        {\"name\": \"OPENAI_API_KEY\", \"valueFrom\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/OPENAI_API_KEY\"},
        {\"name\": \"GITHUB_TOKEN\", \"valueFrom\": \"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/GITHUB_TOKEN\"}
      ],
      \"logConfiguration\": {
        \"logDriver\": \"awslogs\",
        \"options\": {
          \"awslogs-group\": \"${LOG_GROUP}\",
          \"awslogs-region\": \"${REGION}\",
          \"awslogs-stream-prefix\": \"platform\"
        }
      },
      \"healthCheck\": {
        \"command\": [\"CMD-SHELL\", \"curl -f http://localhost:3000/api/health || exit 1\"],
        \"interval\": 30,
        \"timeout\": 5,
        \"retries\": 3,
        \"startPeriod\": 60
      },
      \"stopTimeout\": 30
    }
  ]" \
  --region "${REGION}" > /dev/null

echo "    Task definition registered: ${TASK_FAMILY}"

# ─── Step 6: Create ECS Service ───────────────────────────────
echo ""
echo ">>> Step 6: Creating ECS Service..."

aws ecs create-service \
  --cluster "${CLUSTER_NAME}" \
  --service-name "${SERVICE_NAME}" \
  --task-definition "${TASK_FAMILY}" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_1},${SUBNET_2}],securityGroups=[${TASK_SG}],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=${TG_ARN},containerName=nexusbrain-platform,containerPort=3000" \
  --health-check-grace-period-seconds 120 \
  --deployment-configuration "maximumPercent=200,minimumHealthyPercent=100" \
  --region "${REGION}" > /dev/null 2>/dev/null && \
  echo "    Service created: ${SERVICE_NAME}" || \
  echo "    Service already exists — forcing new deployment..."

# Force new deployment if service already exists
aws ecs update-service \
  --cluster "${CLUSTER_NAME}" \
  --service "${SERVICE_NAME}" \
  --force-new-deployment \
  --region "${REGION}" > /dev/null 2>/dev/null || true

# ─── Done ─────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Platform Deployment Complete!"
echo "============================================"
echo ""
echo "  ALB DNS:    http://${ALB_DNS}"
echo "  Health:     http://${ALB_DNS}/api/health"
echo "  Cluster:    ${CLUSTER_NAME}"
echo "  Service:    ${SERVICE_NAME}"
echo "  Task:       ${TASK_FAMILY}"
echo ""
echo "  The service will take 1-2 minutes to start."
echo "  Monitor at: https://console.aws.amazon.com/ecs/home?region=${REGION}#/clusters/${CLUSTER_NAME}/services/${SERVICE_NAME}"
echo ""
