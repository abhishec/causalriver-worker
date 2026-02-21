# Deploy to AWS via GitHub Actions (No Local Docker Required)

## Overview

This method deploys NexusBrain to AWS using GitHub Actions CI/CD pipeline. **No local Docker installation required** - everything builds and deploys in the cloud.

---

## Step 1: Configure AWS Credentials in GitHub

### 1.1 Create IAM User for GitHub Actions

```bash
# Login to AWS Console
# Go to: IAM → Users → Create User
# Username: github-actions-nexusbrain
# Attach policy: AdministratorAccess (or create custom policy)
# Create access keys → Download CSV
```

### 1.2 Add Secrets to GitHub Repository

1. Go to your GitHub repository: https://github.com/YOUR_USERNAME/NexusBrain
2. Navigate to: `Settings` → `Secrets and variables` → `Actions`
3. Click `New repository secret` and add:

| Secret Name | Value | Source |
|-------------|-------|--------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key | From IAM user CSV |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key | From IAM user CSV |
| `SLACK_WEBHOOK_URL` | (Optional) Slack webhook | For deployment notifications |

---

## Step 2: Deploy Infrastructure (CloudFormation)

### Option A: Via AWS Console (Easiest)

1. **Open AWS CloudFormation Console:**
   - https://console.aws.amazon.com/cloudformation/

2. **Create Stack:**
   - Click `Create stack` → `With new resources`
   - Choose `Upload a template file`
   - Upload: `infrastructure/aws-deployment.yml`
   - Click `Next`

3. **Specify Stack Details:**
   - **Stack name:** `production-nexusbrain-infrastructure`
   - **Parameters:**
     - Environment: `production`
     - SupabaseURL: `https://zmlqvuzoodcgmkgkivfw.supabase.co`
     - SupabaseServiceRoleKey: `[paste from .env]`
     - OrganizationID: `org-nexusbrain-core`
     - AnthropicAPIKey: `[paste from .env]`
     - OpenAIAPIKey: `[paste from .env]`
     - SlackBotToken: `[paste from .env or leave empty]`
     - JiraHost: `[paste from .env or leave empty]`
     - JiraEmail: `[paste from .env or leave empty]`
     - JiraAPIToken: `[paste from .env or leave empty]`
     - GitHubToken: `[paste from .env]`
     - GitHubRepos: `[paste from .env or leave empty]`
   - Click `Next`

4. **Configure Stack Options:**
   - Tags (optional): Key=`Project`, Value=`NexusBrain`
   - Click `Next`

5. **Review:**
   - Check `I acknowledge that AWS CloudFormation might create IAM resources`
   - Click `Submit`

6. **Wait for Completion:**
   - Status will change from `CREATE_IN_PROGRESS` to `CREATE_COMPLETE`
   - Duration: ~10-15 minutes

### Option B: Via AWS CLI

```bash
# Load environment variables
source .env

# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file infrastructure/aws-deployment.yml \
  --stack-name production-nexusbrain-infrastructure \
  --parameter-overrides \
      Environment=production \
      SupabaseURL="$SUPABASE_URL" \
      SupabaseServiceRoleKey="$SUPABASE_SERVICE_ROLE_KEY" \
      OrganizationID="$ORGANIZATION_ID" \
      AnthropicAPIKey="$ANTHROPIC_API_KEY" \
      OpenAIAPIKey="$OPENAI_API_KEY" \
      SlackBotToken="${SLACK_BOT_TOKEN:-}" \
      JiraHost="${JIRA_HOST:-}" \
      JiraEmail="${JIRA_EMAIL:-}" \
      JiraAPIToken="${JIRA_API_TOKEN:-}" \
      GitHubToken="${GITHUB_TOKEN:-}" \
      GitHubRepos="${GITHUB_REPOS:-}" \
  --capabilities CAPABILITY_IAM \
  --region us-east-1

# Check status
aws cloudformation describe-stacks \
  --stack-name production-nexusbrain-infrastructure \
  --query 'Stacks[0].StackStatus'
```

---

## Step 3: Deploy Application via GitHub Actions

### 3.1 Push Code to GitHub

```bash
# Ensure you're on main branch
git checkout main

# Add and commit any changes
git add .
git commit -m "Deploy to AWS production"

# Push to GitHub (this triggers deployment)
git push origin main
```

### 3.2 Monitor Deployment

1. Go to GitHub repository → `Actions` tab
2. You'll see workflow: `Deploy to AWS Production`
3. Click on the running workflow to see live logs

**Pipeline Stages:**
1. ✅ Pre-Deployment Validation (~2 min)
   - Run tests
   - TypeScript compilation
   - Security scan

2. ✅ Build & Push Docker Image (~5 min)
   - Build image in GitHub Actions
   - Push to Amazon ECR

3. ✅ Deploy to AWS ECS (~5 min)
   - Update ECS task definition
   - Deploy new version
   - Zero-downtime deployment

4. ✅ Post-Deployment Health Check (~1 min)
   - Wait for stabilization
   - Run health checks
   - Verify endpoints

5. ✅ Notification
   - Deployment summary
   - Slack notification (if configured)

**Total Duration:** ~15 minutes

---

## Step 4: Verify Deployment

### 4.1 Get Load Balancer URL

```bash
# Via AWS CLI
aws cloudformation describe-stacks \
  --stack-name production-nexusbrain-infrastructure \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text
```

**Or via AWS Console:**
1. Go to CloudFormation → Stacks
2. Click `production-nexusbrain-infrastructure`
3. Go to `Outputs` tab
4. Find `LoadBalancerDNS` value

### 4.2 Test Endpoints

```bash
# Replace [ALB-DNS] with your Load Balancer DNS
ALB_DNS="production-nexusbr-LoadBala-xyz.us-east-1.elb.amazonaws.com"

# Health check
curl "http://$ALB_DNS/api/health"

# Expected response:
# {"status":"pass","checks":{"database":{"status":"pass","latencyMs":45},"redis":{"status":"pass","latencyMs":2}}}

# Brain status
curl "http://$ALB_DNS/api/brain/status?organizationId=org-nexusbrain-core"
```

---

## Step 5: Post-Deployment Configuration

### 5.1 View Application Logs

```bash
# Via AWS CLI
aws logs tail /ecs/production-nexusbrain --follow

# Or via AWS Console
# CloudWatch → Log groups → /ecs/production-nexusbrain
```

### 5.2 Monitor ECS Service

```bash
# Check service status
aws ecs describe-services \
  --cluster production-nexusbrain-cluster \
  --services production-nexusbrain-service \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Deployments:deployments[0].status}'
```

### 5.3 Setup Custom Domain (Optional)

1. **Get Load Balancer DNS** (from Step 4.1)

2. **Create CNAME Record:**
   - Go to your DNS provider (Route 53, Cloudflare, etc.)
   - Create CNAME record:
     - Name: `nexusbrain.yourdomain.com`
     - Value: `[Load Balancer DNS]`
     - TTL: 300

3. **Request SSL Certificate** (for HTTPS):
   ```bash
   aws acm request-certificate \
     --domain-name nexusbrain.yourdomain.com \
     --validation-method DNS \
     --region us-east-1
   ```

4. **Add DNS Validation Record** (shown in ACM console)

5. **Update ALB to use HTTPS** (requires CloudFormation update)

---

## Continuous Deployment

### Automatic Deployments

Every push to `main` branch will:
1. Trigger GitHub Actions workflow
2. Build new Docker image
3. Push to ECR
4. Deploy to ECS
5. Run health checks
6. Send notifications

### Manual Deployment

```bash
# Via GitHub CLI (if installed)
gh workflow run deploy-production.yml

# Or via GitHub web interface
# Go to Actions → Deploy to AWS Production → Run workflow
```

---

## Troubleshooting

### Issue: GitHub Actions Fails at "Deploy to Amazon ECS"

**Cause:** ECS task definition doesn't exist yet (first deployment)

**Solution:**
```bash
# Create initial task definition manually
aws ecs register-task-definition \
  --cli-input-json file://infrastructure/task-definition.json
```

### Issue: Health Check Fails

**Cause:** Application not responding on port 3000

**Solution:**
```bash
# Check ECS task logs
aws logs tail /ecs/production-nexusbrain --since 10m

# Check task status
aws ecs describe-tasks \
  --cluster production-nexusbrain-cluster \
  --tasks $(aws ecs list-tasks --cluster production-nexusbrain-cluster --query 'taskArns[0]' --output text)
```

### Issue: Out of Memory

**Cause:** Task memory too low (default 4096 MB)

**Solution:**
```bash
# Update CloudFormation stack with higher memory
aws cloudformation update-stack \
  --stack-name production-nexusbrain-infrastructure \
  --use-previous-template \
  --parameters ParameterKey=TaskMemory,ParameterValue=8192 \
  --capabilities CAPABILITY_IAM
```

---

## Rollback

### Rollback to Previous Deployment

```bash
# List recent task definitions
aws ecs list-task-definitions \
  --family-prefix production-nexusbrain \
  --sort DESC \
  --max-items 5

# Update service to previous revision
aws ecs update-service \
  --cluster production-nexusbrain-cluster \
  --service production-nexusbrain-service \
  --task-definition production-nexusbrain:[PREVIOUS_REVISION]
```

---

## Summary

**✅ What You Get:**
- NexusBrain running on AWS ECS Fargate
- Redis ElastiCache for 10M+ signal scale
- Auto-scaling (2-10 instances)
- High availability (multi-AZ)
- Zero-downtime deployments
- Automated CI/CD via GitHub Actions
- CloudWatch monitoring and logging

**✅ No Local Dependencies:**
- Docker build happens in GitHub Actions
- No local Docker installation required
- No local services needed
- Everything runs on AWS

**✅ Cost:**
- ~$180/month for production infrastructure
- No upfront costs
- Pay only for what you use

**Next Steps:**
1. Run initial data ingestion (once deployed)
2. Setup incremental sync schedule
3. Configure custom domain + SSL
4. Setup CloudWatch alarms
5. Share endpoints with design partner

---

**Need Help?**
- Check GitHub Actions logs for deployment issues
- Check CloudWatch logs for application errors
- Check ECS console for service status
- Email: support@nexusbrain.ai
