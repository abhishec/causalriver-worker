#!/bin/bash
# NexusBrain ECS Fargate Setup Script
# Creates all AWS infrastructure for brain training
#
# Prerequisites:
#   - AWS CLI configured with correct account (848269696611)
#   - Docker installed
#   - Secrets already stored in SSM (run store-secrets.sh first)
#
# Usage: ./infra/setup-ecs.sh

set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="848269696611"
CLUSTER_NAME="nexusbrain-training"
ECR_REPO="nexusbrain-trainer"
LOG_GROUP="/ecs/nexusbrain-training"
EXEC_ROLE_NAME="nexusbrain-ecs-execution-role"
EVENTS_ROLE_NAME="nexusbrain-eventbridge-role"

echo "============================================"
echo "  NexusBrain ECS Fargate Setup"
echo "  Account: ${ACCOUNT_ID}"
echo "  Region:  ${REGION}"
echo "============================================"
echo ""

# ─── Step 1: Create ECR Repository ───────────────────────────────
echo ">>> Step 1: Creating ECR Repository..."
aws ecr create-repository \
  --repository-name "${ECR_REPO}" \
  --region "${REGION}" \
  --image-scanning-configuration scanOnPush=true \
  2>/dev/null && echo "    ECR repo created: ${ECR_REPO}" || echo "    ECR repo already exists"

# ─── Step 2: Create ECS Cluster ──────────────────────────────────
echo ""
echo ">>> Step 2: Creating ECS Cluster..."
aws ecs create-cluster \
  --cluster-name "${CLUSTER_NAME}" \
  --region "${REGION}" \
  2>/dev/null && echo "    Cluster created: ${CLUSTER_NAME}" || echo "    Cluster already exists"

# ─── Step 3: Create CloudWatch Log Group ─────────────────────────
echo ""
echo ">>> Step 3: Creating CloudWatch Log Group..."
aws logs create-log-group \
  --log-group-name "${LOG_GROUP}" \
  --region "${REGION}" \
  2>/dev/null && echo "    Log group created: ${LOG_GROUP}" || echo "    Log group already exists"

# Set log retention to 30 days (save costs)
aws logs put-retention-policy \
  --log-group-name "${LOG_GROUP}" \
  --retention-in-days 30 \
  --region "${REGION}" 2>/dev/null
echo "    Log retention set to 30 days"

# ─── Step 4: Create ECS Task Execution Role ──────────────────────
echo ""
echo ">>> Step 4: Creating ECS Task Execution Role..."

# Trust policy for ECS
cat > /tmp/ecs-trust-policy.json << 'TRUST'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
TRUST

aws iam create-role \
  --role-name "${EXEC_ROLE_NAME}" \
  --assume-role-policy-document file:///tmp/ecs-trust-policy.json \
  2>/dev/null && echo "    Role created: ${EXEC_ROLE_NAME}" || echo "    Role already exists"

# Attach managed policy for ECR pull + CloudWatch logs
aws iam attach-role-policy \
  --role-name "${EXEC_ROLE_NAME}" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" \
  2>/dev/null

# Create inline policy for SSM Parameter Store access
cat > /tmp/ssm-policy.json << POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameters",
        "ssm:GetParameter"
      ],
      "Resource": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/*"
    }
  ]
}
POLICY

aws iam put-role-policy \
  --role-name "${EXEC_ROLE_NAME}" \
  --policy-name "nexusbrain-ssm-read" \
  --policy-document file:///tmp/ssm-policy.json \
  2>/dev/null
echo "    SSM read policy attached"

# ─── Step 5: Create EventBridge Role ─────────────────────────────
echo ""
echo ">>> Step 5: Creating EventBridge Role..."

cat > /tmp/events-trust-policy.json << 'TRUST'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "events.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
TRUST

aws iam create-role \
  --role-name "${EVENTS_ROLE_NAME}" \
  --assume-role-policy-document file:///tmp/events-trust-policy.json \
  2>/dev/null && echo "    Role created: ${EVENTS_ROLE_NAME}" || echo "    Role already exists"

# Allow EventBridge to run ECS tasks
cat > /tmp/events-ecs-policy.json << POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:RunTask"
      ],
      "Resource": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::${ACCOUNT_ID}:role/${EXEC_ROLE_NAME}"
    }
  ]
}
POLICY

aws iam put-role-policy \
  --role-name "${EVENTS_ROLE_NAME}" \
  --policy-name "nexusbrain-run-ecs-tasks" \
  --policy-document file:///tmp/events-ecs-policy.json \
  2>/dev/null
echo "    ECS run-task policy attached"

# ─── Step 6: Get Default VPC + Subnets ──────────────────────────
echo ""
echo ">>> Step 6: Getting VPC networking info..."

DEFAULT_VPC=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region "${REGION}")
echo "    Default VPC: ${DEFAULT_VPC}"

SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${DEFAULT_VPC}" --query "Subnets[*].SubnetId" --output text --region "${REGION}")
SUBNET_ARRAY=$(echo "${SUBNETS}" | tr '\t' ',' | sed 's/,$//')
echo "    Subnets: ${SUBNET_ARRAY}"

# Get or create security group for brain tasks
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=nexusbrain-training-sg" "Name=vpc-id,Values=${DEFAULT_VPC}" \
  --query "SecurityGroups[0].GroupId" --output text --region "${REGION}" 2>/dev/null)

if [ "${SG_ID}" = "None" ] || [ -z "${SG_ID}" ]; then
  SG_ID=$(aws ec2 create-security-group \
    --group-name "nexusbrain-training-sg" \
    --description "Security group for NexusBrain training tasks - outbound only" \
    --vpc-id "${DEFAULT_VPC}" \
    --query "GroupId" --output text \
    --region "${REGION}")
  echo "    Created security group: ${SG_ID}"

  # Allow all outbound (needed for Supabase, APIs)
  # Revoke default inbound (tasks don't need inbound)
  aws ec2 revoke-security-group-ingress \
    --group-id "${SG_ID}" \
    --protocol all \
    --source-group "${SG_ID}" \
    --region "${REGION}" 2>/dev/null || true
else
  echo "    Security group exists: ${SG_ID}"
fi

# ─── Step 7: Register Task Definitions ───────────────────────────
echo ""
echo ">>> Step 7: Registering ECS Task Definitions..."

ECR_IMAGE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest"
EXEC_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${EXEC_ROLE_NAME}"

# --- Trainer Task Definition ---
cat > /tmp/task-trainer.json << TASKDEF
{
  "family": "nexusbrain-trainer",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "4096",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-trainer",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "trainer" },
        { "name": "TRAINER_MODE", "value": "once" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" },
        { "name": "ANTHROPIC_API_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/ANTHROPIC_API_KEY" },
        { "name": "FRED_API_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/FRED_API_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "trainer"
        }
      },
      "stopTimeout": 120
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-trainer.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-trainer (1 vCPU, 4GB)"

# --- Consolidation Task Definition ---
cat > /tmp/task-consolidation.json << TASKDEF
{
  "family": "nexusbrain-consolidation",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "4096",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-consolidation",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "consolidation" },
        { "name": "CONSOLIDATION_MODE", "value": "once" },
        { "name": "CONSOLIDATE_ALL_ORGS", "value": "true" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" },
        { "name": "FRED_API_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/FRED_API_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "consolidation"
        }
      },
      "stopTimeout": 120
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-consolidation.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-consolidation (1 vCPU, 4GB)"

# --- DMN Scan Task Definition ---
cat > /tmp/task-dmn.json << TASKDEF
{
  "family": "nexusbrain-dmn",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "2048",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-dmn",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "dmn" },
        { "name": "DMN_MODE", "value": "once" },
        { "name": "SCAN_ALL_ORGS", "value": "true" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "dmn"
        }
      },
      "stopTimeout": 60
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-dmn.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-dmn (0.5 vCPU, 2GB)"

# --- Benchmark Task Definition ---
# LongMemEval benchmark runner: 2 vCPU, 8GB for parallel observer workers
# Manual trigger only (no schedule) — run via: ./infra/run-task.sh benchmark
cat > /tmp/task-benchmark.json << TASKDEF
{
  "family": "nexusbrain-benchmark",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "8192",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-benchmark",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "benchmark" },
        { "name": "BENCHMARK_METHOD", "value": "observational" },
        { "name": "BENCHMARK_VARIANT", "value": "s" },
        { "name": "BENCHMARK_MAX_WORKERS", "value": "10" }
      ],
      "secrets": [
        { "name": "OPENAI_API_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/OPENAI_API_KEY" },
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "benchmark"
        }
      },
      "stopTimeout": 300
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-benchmark.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-benchmark (2 vCPU, 8GB)"

# --- Git Code Trainer Task Definition ---
# Pulls data from 20 major GitHub repos and trains the core brain on engineering patterns
# 2 vCPU, 8GB RAM (I/O heavy: paginated GitHub API calls + large dataset processing)
# Weekly schedule (Sunday 2 AM UTC) — also supports manual trigger via: ./infra/run-task.sh git-trainer
cat > /tmp/task-git-trainer.json << TASKDEF
{
  "family": "nexusbrain-git-trainer",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "8192",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-git-trainer",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "git-trainer" },
        { "name": "GIT_TRAINER_DRY_RUN", "value": "false" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" },
        { "name": "GITHUB_TOKEN", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/GITHUB_TOKEN" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "git-trainer"
        }
      },
      "stopTimeout": 120
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-git-trainer.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-git-trainer (2 vCPU, 8GB)"

# --- Cost Agent Task Definition ---
# Autonomous cost monitoring: LLM costs, AWS costs, budget enforcement, anomaly detection
# 0.5 vCPU, 1GB RAM (lightweight — mostly Supabase queries + optional AWS Cost Explorer call)
# Daily schedule (3 AM UTC) — also supports manual trigger via: ./infra/run-task.sh cost-agent
cat > /tmp/task-cost-agent.json << TASKDEF
{
  "family": "nexusbrain-cost-agent",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-cost-agent",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "cost-agent" },
        { "name": "COST_AGENT_MODE", "value": "once" },
        { "name": "COST_LOOKBACK_DAYS", "value": "30" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "cost-agent"
        }
      },
      "stopTimeout": 60
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-cost-agent.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-cost-agent (0.5 vCPU, 1GB)"

# --- Weekly Brain Scan Task Definition ---
# 11-region brain scan + benchmarks (Sachs, ALARM, SaaS, Cascade, Anomaly) + stale edge pruning
# 1 vCPU, 4GB RAM — runs benchmark suite in-process
# Weekly schedule (Sunday 4 AM UTC) — also supports manual trigger via: ./infra/run-task.sh weekly
cat > /tmp/task-weekly.json << TASKDEF
{
  "family": "nexusbrain-weekly",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "4096",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-weekly",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "weekly" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "weekly"
        }
      },
      "stopTimeout": 300
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-weekly.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-weekly (1 vCPU, 4GB)"

# --- Monthly Deep Analysis Task Definition ---
# Full historical causal discovery on ALL data + auto-generate training packs + growth report
# 2 vCPU, 8GB RAM — processes ALL historical signals, memory-intensive
# Monthly schedule (1st of month 3 AM UTC) — also supports manual trigger via: ./infra/run-task.sh monthly
cat > /tmp/task-monthly.json << TASKDEF
{
  "family": "nexusbrain-monthly",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "8192",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-monthly",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "monthly" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" },
        { "name": "ANTHROPIC_API_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/ANTHROPIC_API_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "monthly"
        }
      },
      "stopTimeout": 600
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-monthly.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-monthly (2 vCPU, 8GB)"

# --- Federation Agent Task Definition ---
# Bidirectional Core ↔ Org brain knowledge federation
# 1 vCPU, 4GB RAM — cross-brain queries + knowledge syncing
# Every 6h schedule — also supports manual trigger via: ./infra/run-task.sh federation
cat > /tmp/task-federation.json << TASKDEF
{
  "family": "nexusbrain-federation",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "4096",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-federation",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "federation" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "federation"
        }
      },
      "stopTimeout": 120
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-federation.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-federation (1 vCPU, 4GB)"

# --- Security Hardening Agent Task Definition ---
# Continuous security vulnerability detection and automated patching
# 2 vCPU, 8GB RAM — scans dependencies, configs, and code patterns
# Daily schedule (4 AM UTC) — also supports manual trigger via: ./infra/run-task.sh security
cat > /tmp/task-security.json << TASKDEF
{
  "family": "nexusbrain-security",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "8192",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-security",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "security" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" },
        { "name": "GITHUB_TOKEN", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/GITHUB_TOKEN" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "security"
        }
      },
      "stopTimeout": 300
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-security.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-security (2 vCPU, 8GB)"

# --- Benchmark Optimizer Task Definition ---
# Python-based benchmark optimization (tunes hyperparameters for causal discovery)
# 1 vCPU, 4GB RAM — runs Python optimization loops
# Manual trigger only — run via: ./infra/run-task.sh benchmark-optimizer
cat > /tmp/task-benchmark-optimizer.json << TASKDEF
{
  "family": "nexusbrain-benchmark-optimizer",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "4096",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${EXEC_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "brain-benchmark-optimizer",
      "image": "${ECR_IMAGE}",
      "essential": true,
      "environment": [
        { "name": "BRAIN_PROCESS", "value": "benchmark-optimizer" },
        { "name": "OPTIMIZER_MODE", "value": "quick" },
        { "name": "OPTIMIZER_SAMPLE", "value": "50" }
      ],
      "secrets": [
        { "name": "SUPABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_URL" },
        { "name": "SUPABASE_SERVICE_ROLE_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/nexusbrain/SUPABASE_SERVICE_ROLE_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "benchmark-optimizer"
        }
      },
      "stopTimeout": 300
    }
  ]
}
TASKDEF

aws ecs register-task-definition --cli-input-json file:///tmp/task-benchmark-optimizer.json --region "${REGION}" > /dev/null
echo "    Registered: nexusbrain-benchmark-optimizer (1 vCPU, 4GB)"

# ─── Step 8: Create EventBridge Scheduled Rules ──────────────────
echo ""
echo ">>> Step 8: Creating EventBridge Scheduled Rules..."

EVENTS_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${EVENTS_ROLE_NAME}"

# Pick first two subnets for task networking
SUBNET1=$(echo "${SUBNETS}" | awk '{print $1}')
SUBNET2=$(echo "${SUBNETS}" | awk '{print $2}')

# --- Trainer: Every 6 hours ---
aws events put-rule \
  --name "nexusbrain-trainer-schedule" \
  --schedule-expression "cron(0 0,6,12,18 * * ? *)" \
  --state ENABLED \
  --description "Run NexusBrain autonomous trainer every 6 hours" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-trainer.json << TARGET
[
  {
    "Id": "nexusbrain-trainer-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-trainer",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-trainer-schedule" \
  --targets file:///tmp/target-trainer.json \
  --region "${REGION}" > /dev/null
echo "    Trainer: Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)"

# --- Consolidation: Daily at 2 AM UTC ---
aws events put-rule \
  --name "nexusbrain-consolidation-schedule" \
  --schedule-expression "cron(0 2 * * ? *)" \
  --state ENABLED \
  --description "Run NexusBrain brain consolidation daily at 2 AM UTC" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-consolidation.json << TARGET
[
  {
    "Id": "nexusbrain-consolidation-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-consolidation",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-consolidation-schedule" \
  --targets file:///tmp/target-consolidation.json \
  --region "${REGION}" > /dev/null
echo "    Consolidation: Daily at 2:00 AM UTC"

# --- DMN Scan: Every 4 hours ---
aws events put-rule \
  --name "nexusbrain-dmn-schedule" \
  --schedule-expression "cron(0 0,4,8,12,16,20 * * ? *)" \
  --state ENABLED \
  --description "Run NexusBrain DMN scan every 4 hours" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-dmn.json << TARGET
[
  {
    "Id": "nexusbrain-dmn-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-dmn",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-dmn-schedule" \
  --targets file:///tmp/target-dmn.json \
  --region "${REGION}" > /dev/null
echo "    DMN Scan: Every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)"

# --- Git Code Trainer: Weekly Sunday 2 AM UTC ---
aws events put-rule \
  --name "nexusbrain-git-trainer-schedule" \
  --schedule-expression "cron(0 2 ? * SUN *)" \
  --state ENABLED \
  --description "Run NexusBrain Git Code Trainer weekly on Sunday at 2 AM UTC" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-git-trainer.json << TARGET
[
  {
    "Id": "nexusbrain-git-trainer-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-git-trainer",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-git-trainer-schedule" \
  --targets file:///tmp/target-git-trainer.json \
  --region "${REGION}" > /dev/null
echo "    Git Trainer: Weekly Sunday at 2:00 AM UTC"

# --- Cost Agent: Daily at 3 AM UTC (after consolidation at 2 AM) ---
aws events put-rule \
  --name "nexusbrain-cost-agent-schedule" \
  --schedule-expression "cron(0 3 * * ? *)" \
  --state ENABLED \
  --description "Run NexusBrain cost agent daily at 3 AM UTC" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-cost-agent.json << TARGET
[
  {
    "Id": "nexusbrain-cost-agent-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-cost-agent",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-cost-agent-schedule" \
  --targets file:///tmp/target-cost-agent.json \
  --region "${REGION}" > /dev/null
echo "    Cost Agent: Daily at 3:00 AM UTC"

# --- Benchmark: Weekly Sunday 5 AM UTC ---
aws events put-rule \
  --name "nexusbrain-benchmark-schedule" \
  --schedule-expression "cron(0 5 ? * SUN *)" \
  --state ENABLED \
  --description "Run NexusBrain LongMemEval benchmark weekly on Sunday at 5 AM UTC" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-benchmark.json << TARGET
[
  {
    "Id": "nexusbrain-benchmark-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-benchmark",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-benchmark-schedule" \
  --targets file:///tmp/target-benchmark.json \
  --region "${REGION}" > /dev/null
echo "    Benchmark: Weekly Sunday at 5:00 AM UTC"

# --- Weekly Brain Scan: Sunday 4 AM UTC ---
aws events put-rule \
  --name "nexusbrain-weekly-schedule" \
  --schedule-expression "cron(0 4 ? * SUN *)" \
  --state ENABLED \
  --description "Run NexusBrain 11-region brain scan weekly on Sunday at 4 AM UTC" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-weekly.json << TARGET
[
  {
    "Id": "nexusbrain-weekly-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-weekly",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-weekly-schedule" \
  --targets file:///tmp/target-weekly.json \
  --region "${REGION}" > /dev/null
echo "    Weekly Scan: Sunday at 4:00 AM UTC"

# --- Monthly Deep Analysis: 1st of month 3 AM UTC ---
aws events put-rule \
  --name "nexusbrain-monthly-schedule" \
  --schedule-expression "cron(0 3 1 * ? *)" \
  --state ENABLED \
  --description "Run NexusBrain monthly deep analysis on the 1st of each month at 3 AM UTC" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-monthly.json << TARGET
[
  {
    "Id": "nexusbrain-monthly-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-monthly",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-monthly-schedule" \
  --targets file:///tmp/target-monthly.json \
  --region "${REGION}" > /dev/null
echo "    Monthly Analysis: 1st of each month at 3:00 AM UTC"

# --- Federation Agent: Every 6 hours (offset from trainer) ---
aws events put-rule \
  --name "nexusbrain-federation-schedule" \
  --schedule-expression "cron(0 1,7,13,19 * * ? *)" \
  --state ENABLED \
  --description "Run NexusBrain Federation Agent every 6 hours (Core ↔ Org knowledge sync)" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-federation.json << TARGET
[
  {
    "Id": "nexusbrain-federation-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-federation",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-federation-schedule" \
  --targets file:///tmp/target-federation.json \
  --region "${REGION}" > /dev/null
echo "    Federation: Every 6 hours (01:00, 07:00, 13:00, 19:00 UTC)"

# --- Security Hardening Agent: Daily at 4 AM UTC ---
aws events put-rule \
  --name "nexusbrain-security-schedule" \
  --schedule-expression "cron(0 4 * * ? *)" \
  --state ENABLED \
  --description "Run NexusBrain Security Hardening Agent daily at 4 AM UTC" \
  --region "${REGION}" > /dev/null

cat > /tmp/target-security.json << TARGET
[
  {
    "Id": "nexusbrain-security-target",
    "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
    "RoleArn": "${EVENTS_ROLE_ARN}",
    "EcsParameters": {
      "TaskDefinitionArn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/nexusbrain-security",
      "TaskCount": 1,
      "LaunchType": "FARGATE",
      "NetworkConfiguration": {
        "awsvpcConfiguration": {
          "Subnets": ["${SUBNET1}", "${SUBNET2}"],
          "SecurityGroups": ["${SG_ID}"],
          "AssignPublicIp": "ENABLED"
        }
      },
      "PlatformVersion": "LATEST"
    }
  }
]
TARGET

aws events put-targets \
  --rule "nexusbrain-security-schedule" \
  --targets file:///tmp/target-security.json \
  --region "${REGION}" > /dev/null
echo "    Security: Daily at 4:00 AM UTC"

# ─── Done ─────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Setup Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Store secrets:      ./infra/store-secrets.sh"
echo "  2. Build & push:       ./infra/push-image.sh"
echo "  3. Run any agent:      ./infra/run-task.sh <process>"
echo ""
echo "Full Agent Schedule (11 agents + 1 optimizer, 12 ECS task defs):"
echo "  ┌──────────────────────────┬────────────────────────────────────────┬──────────┐"
echo "  │ Agent                    │ Schedule                               │ CPU/Mem  │"
echo "  ├──────────────────────────┼────────────────────────────────────────┼──────────┤"
echo "  │ Autonomous Trainer       │ Every 6h (0,6,12,18 UTC)               │ 1/4 GB   │"
echo "  │ Federation Agent         │ Every 6h offset (1,7,13,19 UTC)        │ 1/4 GB   │"
echo "  │ DMN Scan                 │ Every 4h (0,4,8,12,16,20 UTC)          │ 0.5/2 GB │"
echo "  │ Proactive Intelligence   │ Every 4h offset (1,5,9,13,17,21 UTC)   │ 0.5/1 GB │"
echo "  │ Brain Consolidation      │ Daily 2 AM UTC                         │ 2/8 GB   │"
echo "  │ Cost Agent               │ Daily 3 AM UTC                         │ 0.5/1 GB │"
echo "  │ Security Hardening       │ Daily 4 AM UTC                         │ 2/8 GB   │"
echo "  │ Git Code Trainer         │ Sunday 2 AM UTC                        │ 2/8 GB   │"
echo "  │ Weekly Brain Scan        │ Sunday 4 AM UTC                        │ 1/4 GB   │"
echo "  │ Benchmark                │ Sunday 5 AM UTC                        │ 2/8 GB   │"
echo "  │ Monthly Deep Analysis    │ 1st of month 3 AM UTC                  │ 2/8 GB   │"
echo "  │ Benchmark Optimizer      │ Manual only (Python)                   │ 1/4 GB   │"
echo "  └──────────────────────────┴────────────────────────────────────────┴──────────┘"
echo ""
echo "View logs:"
echo "  aws logs tail ${LOG_GROUP} --follow --region ${REGION}"
