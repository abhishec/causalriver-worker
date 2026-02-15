# AWS Production Deployment Guide

## Overview

This guide provides complete instructions for deploying NexusBrain to AWS with full production infrastructure including:
- **Redis ElastiCache** for 10M+ signal scale
- **ECS Fargate** for containerized deployment
- **Application Load Balancer** for high availability
- **Auto-scaling** (2-10 instances based on CPU)
- **Secrets Manager** for secure credential management
- **CloudWatch** for logging and monitoring

**Estimated Cost:** $150-300/month for production (depending on usage)

---

## Prerequisites

### 1. AWS Account Setup

1. **Create AWS Account** (if you don't have one)
   - Go to https://aws.amazon.com/
   - Sign up for new account
   - Add payment method

2. **Create IAM User with Admin Access**
   ```bash
   # AWS Console → IAM → Users → Create User
   # Attach policy: AdministratorAccess
   # Create access keys → Download CSV
   ```

3. **Install AWS CLI**
   ```bash
   # macOS
   brew install awscli

   # Linux
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install

   # Windows
   msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
   ```

4. **Configure AWS CLI**
   ```bash
   aws configure
   # AWS Access Key ID: [paste from CSV]
   # AWS Secret Access Key: [paste from CSV]
   # Default region: us-east-1
   # Default output format: json
   ```

5. **Verify AWS CLI**
   ```bash
   aws sts get-caller-identity
   # Should show your AWS account ID
   ```

### 2. Docker Setup

```bash
# macOS
brew install --cask docker

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io docker-compose

# Verify
docker --version
```

### 3. Environment Variables

Ensure your `.env` file is configured with all required values:

```bash
# Required
SUPABASE_URL=https://zmlqvuzoodcgmkgkivfw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ORGANIZATION_ID=org-nexusbrain-core
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional (for connectors)
SLACK_BOT_TOKEN=xoxb-...
JIRA_HOST=https://yourcompany.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=...
GITHUB_TOKEN=ghp_...
GITHUB_REPOS=owner/repo1,owner/repo2
```

---

## Deployment Methods

### Option 1: Automated Deployment (Recommended)

**Single Command Deployment:**

```bash
./infrastructure/deploy-aws.sh production
```

This script will:
1. ✅ Validate prerequisites
2. ✅ Deploy CloudFormation stack (VPC, Redis, ECS, ALB)
3. ✅ Build Docker image
4. ✅ Push to ECR
5. ✅ Deploy to ECS
6. ✅ Run health checks
7. ✅ Print deployment summary

**Expected Duration:** 15-20 minutes

---

### Option 2: Manual Deployment (Step-by-Step)

#### Step 1: Deploy Infrastructure

```bash
aws cloudformation deploy \
  --template-file infrastructure/aws-deployment.yml \
  --stack-name production-nexusbrain-infrastructure \
  --parameter-overrides \
      Environment=production \
      SupabaseURL=$SUPABASE_URL \
      SupabaseServiceRoleKey=$SUPABASE_SERVICE_ROLE_KEY \
      OrganizationID=$ORGANIZATION_ID \
      AnthropicAPIKey=$ANTHROPIC_API_KEY \
      OpenAIAPIKey=$OPENAI_API_KEY \
      SlackBotToken=$SLACK_BOT_TOKEN \
      JiraHost=$JIRA_HOST \
      JiraEmail=$JIRA_EMAIL \
      JiraAPIToken=$JIRA_API_TOKEN \
      GitHubToken=$GITHUB_TOKEN \
      GitHubRepos=$GITHUB_REPOS \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

**What gets created:**
- VPC with public/private subnets
- Redis ElastiCache cluster (cache.t3.medium)
- ECS Fargate cluster
- Application Load Balancer
- Auto-scaling configuration (2-10 instances)
- Secrets Manager for credentials
- CloudWatch log groups
- ECR repository

#### Step 2: Get Stack Outputs

```bash
aws cloudformation describe-stacks \
  --stack-name production-nexusbrain-infrastructure \
  --query 'Stacks[0].Outputs' \
  --output table
```

Save these values:
- `ECRRepositoryURI` - For Docker push
- `RedisEndpoint` - Redis connection URL
- `LoadBalancerDNS` - Your application URL

#### Step 3: Build & Push Docker Image

```bash
# Get ECR repository URI
ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name production-nexusbrain-infrastructure \
  --query 'Stacks[0].Outputs[?OutputKey==`ECRRepositoryURI`].OutputValue' \
  --output text)

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_URI

# Build image
docker build -t nexusbrain:latest -f Dockerfile.production .

# Tag image
docker tag nexusbrain:latest $ECR_URI:latest

# Push image
docker push $ECR_URI:latest
```

#### Step 4: Deploy to ECS

```bash
# Update ECS service with new image
aws ecs update-service \
  --cluster production-nexusbrain-cluster \
  --service production-nexusbrain-service \
  --force-new-deployment \
  --region us-east-1

# Wait for deployment to stabilize
aws ecs wait services-stable \
  --cluster production-nexusbrain-cluster \
  --services production-nexusbrain-service \
  --region us-east-1
```

#### Step 5: Verify Deployment

```bash
# Get Load Balancer DNS
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name production-nexusbrain-infrastructure \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text)

# Health check
curl http://$ALB_DNS/api/health

# Expected response:
# {"status":"pass","checks":{"database":{"status":"pass","latencyMs":45}}}
```

---

### Option 3: CI/CD with GitHub Actions (Continuous Deployment)

**Setup:**

1. **Add AWS Credentials to GitHub Secrets**
   - Go to: `Settings → Secrets and variables → Actions`
   - Add secrets:
     - `AWS_ACCESS_KEY_ID`
     - `AWS_SECRET_ACCESS_KEY`
     - `SLACK_WEBHOOK_URL` (optional, for notifications)

2. **Push to Main Branch**
   ```bash
   git add .
   git commit -m "Deploy to production"
   git push origin main
   ```

3. **Monitor Deployment**
   - Go to: `Actions` tab in GitHub
   - Watch the deployment pipeline
   - Deployment takes ~10-15 minutes

**Pipeline Stages:**
1. ✅ Pre-deployment validation (tests, TypeScript compilation)
2. ✅ Docker build & push to ECR
3. ✅ ECS deployment
4. ✅ Health checks
5. ✅ Slack notification

---

## Post-Deployment Configuration

### 1. Configure DNS (Optional but Recommended)

**Create CNAME record pointing to Load Balancer:**

```bash
# Get Load Balancer DNS
aws cloudformation describe-stacks \
  --stack-name production-nexusbrain-infrastructure \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text

# In your DNS provider (e.g., Route 53, Cloudflare):
# Type: CNAME
# Name: nexusbrain.yourdomain.com
# Value: [Load Balancer DNS from above]
```

### 2. Setup SSL Certificate (HTTPS)

```bash
# Request certificate in AWS Certificate Manager
aws acm request-certificate \
  --domain-name nexusbrain.yourdomain.com \
  --validation-method DNS \
  --region us-east-1

# Validate certificate (add DNS record from ACM console)

# Add HTTPS listener to ALB (via CloudFormation or Console)
```

### 3. Run Initial Data Ingestion

**SSH into ECS Task:**

```bash
# Get task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster production-nexusbrain-cluster \
  --service-name production-nexusbrain-service \
  --query 'taskArns[0]' \
  --output text)

# Execute command in task
aws ecs execute-command \
  --cluster production-nexusbrain-cluster \
  --task $TASK_ARN \
  --container nexusbrain \
  --interactive \
  --command "/bin/sh"

# Inside container, run ingestion
pnpm ingest:initial
```

**Or use AWS Lambda for scheduled ingestion (recommended for production):**

Create Lambda function that triggers ingestion via ECS RunTask API.

### 4. Setup CloudWatch Alarms

```bash
# CPU Utilization Alarm
aws cloudwatch put-metric-alarm \
  --alarm-name nexusbrain-high-cpu \
  --alarm-description "Alert when CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# Health Check Alarm
aws cloudwatch put-metric-alarm \
  --alarm-name nexusbrain-unhealthy \
  --alarm-description "Alert when health checks fail" \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2
```

---

## Monitoring & Logs

### View Logs

```bash
# Tail logs (live)
aws logs tail /ecs/production-nexusbrain --follow

# View recent logs
aws logs tail /ecs/production-nexusbrain --since 1h

# Search logs for errors
aws logs filter-log-events \
  --log-group-name /ecs/production-nexusbrain \
  --filter-pattern "ERROR" \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

### CloudWatch Insights Queries

**Error Analysis:**
```sql
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100
```

**Performance Metrics:**
```sql
fields @timestamp, duration
| stats avg(duration), max(duration), p95(duration)
| sort @timestamp desc
```

### View ECS Service Status

```bash
aws ecs describe-services \
  --cluster production-nexusbrain-cluster \
  --services production-nexusbrain-service \
  --query 'services[0].deployments' \
  --output table
```

---

## Scaling & Optimization

### Manual Scaling

```bash
# Scale to 5 instances
aws ecs update-service \
  --cluster production-nexusbrain-cluster \
  --service production-nexusbrain-service \
  --desired-count 5
```

### Auto-Scaling is Enabled by Default

- **Min:** 2 instances
- **Max:** 10 instances
- **Target:** 70% CPU utilization
- **Scale-out:** When CPU > 70% for 1 minute
- **Scale-in:** When CPU < 70% for 5 minutes

### Upgrade Redis for Higher Scale

```bash
# Update CloudFormation parameter
aws cloudformation update-stack \
  --stack-name production-nexusbrain-infrastructure \
  --use-previous-template \
  --parameters \
      ParameterKey=RedisNodeType,ParameterValue=cache.m5.large \
  --capabilities CAPABILITY_IAM
```

**Redis Node Types:**
- `cache.t3.medium` - 3.09 GB ($0.068/hr) - Default
- `cache.m5.large` - 6.38 GB ($0.136/hr) - Recommended for 10M+ signals
- `cache.m5.xlarge` - 12.93 GB ($0.272/hr) - High scale

---

## Costs Breakdown

**Monthly Estimates (us-east-1):**

| Service | Configuration | Cost/Month |
|---------|--------------|------------|
| **ECS Fargate** | 2x 2vCPU, 4GB RAM | ~$100 |
| **Redis ElastiCache** | cache.t3.medium | ~$50 |
| **Application Load Balancer** | Standard | ~$20 |
| **CloudWatch Logs** | 10 GB/month | ~$5 |
| **Data Transfer** | Minimal | ~$5 |
| **Secrets Manager** | 1 secret | ~$0.40 |
| **ECR Storage** | < 1 GB | ~$0.10 |
| **Total** | | **~$180/month** |

**Cost Optimization Tips:**
1. Use Fargate Spot for 70% cost reduction (already configured)
2. Enable S3 Intelligent-Tiering for logs
3. Use Reserved Instances for Redis (up to 60% savings)
4. Set up cost alerts in AWS Budgets

---

## Troubleshooting

### Issue: Deployment Stuck

```bash
# Check ECS events
aws ecs describe-services \
  --cluster production-nexusbrain-cluster \
  --services production-nexusbrain-service \
  --query 'services[0].events[:5]' \
  --output table

# Check task status
aws ecs list-tasks \
  --cluster production-nexusbrain-cluster \
  --service-name production-nexusbrain-service

# Describe specific task
aws ecs describe-tasks \
  --cluster production-nexusbrain-cluster \
  --tasks [TASK_ARN]
```

### Issue: Health Checks Failing

```bash
# Check target health
aws elbv2 describe-target-health \
  --target-group-arn [TARGET_GROUP_ARN]

# Test health endpoint directly from task
curl http://localhost:3000/api/health
```

### Issue: Out of Memory

```bash
# Increase task memory in CloudFormation
# Update TaskDefinition → Memory parameter to 8192 (8GB)

# Or scale out instances
aws ecs update-service \
  --cluster production-nexusbrain-cluster \
  --service production-nexusbrain-service \
  --desired-count 4
```

---

## Rollback Procedure

### Rollback to Previous Deployment

```bash
# List recent task definitions
aws ecs list-task-definitions \
  --family-prefix production-nexusbrain \
  --sort DESC \
  --max-items 5

# Update service to previous task definition
aws ecs update-service \
  --cluster production-nexusbrain-cluster \
  --service production-nexusbrain-service \
  --task-definition production-nexusbrain:[PREVIOUS_REVISION]
```

### Emergency Shutdown

```bash
# Scale to zero
aws ecs update-service \
  --cluster production-nexusbrain-cluster \
  --service production-nexusbrain-service \
  --desired-count 0
```

---

## Cleanup (Delete Everything)

**⚠️ WARNING: This will delete all resources and data!**

```bash
# Delete CloudFormation stack
aws cloudformation delete-stack \
  --stack-name production-nexusbrain-infrastructure

# Wait for deletion
aws cloudformation wait stack-delete-complete \
  --stack-name production-nexusbrain-infrastructure

# Delete ECR images
aws ecr batch-delete-image \
  --repository-name nexusbrain \
  --image-ids imageTag=latest
```

---

## Support & Next Steps

### Production Checklist

- [ ] DNS configured with custom domain
- [ ] SSL certificate added (HTTPS)
- [ ] CloudWatch alarms configured
- [ ] Initial data ingestion completed
- [ ] Incremental sync Lambda scheduled
- [ ] Cost alerts configured in AWS Budgets
- [ ] Team has access to AWS Console
- [ ] Runbook shared with team
- [ ] Monitoring dashboard created

### Additional Resources

- **AWS ECS Documentation:** https://docs.aws.amazon.com/ecs/
- **Redis ElastiCache Best Practices:** https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/BestPractices.html
- **CloudFormation Reference:** https://docs.aws.amazon.com/cloudformation/

### Getting Help

- **Email:** support@nexusbrain.ai
- **Slack:** #infrastructure-support
- **AWS Support:** Open case in AWS Console

---

**Version:** 1.0.0
**Last Updated:** 2025-02-15
**Maintained By:** NexusBrain DevOps Team
