# NexusBrain AWS Deployment - Step-by-Step Checklist

## ✅ Deployment Status: READY TO EXECUTE

Everything is configured and tested. Follow these steps in order.

---

## Prerequisites (One-Time Setup)

### ☐ Step 1: Install AWS CLI

```bash
# Check if AWS CLI is installed
aws --version

# If not installed:
# macOS: brew install awscli
# Linux: curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && sudo ./aws/install
# Windows: Download from https://aws.amazon.com/cli/
```

### ☐ Step 2: Configure AWS Credentials

```bash
# Run AWS configure
aws configure

# Enter when prompted:
# AWS Access Key ID: [from AWS IAM console]
# AWS Secret Access Key: [from AWS IAM console]
# Default region: us-east-1
# Default output format: json

# Verify
aws sts get-caller-identity
# Should show your AWS account ID
```

---

## Infrastructure Deployment (15-20 minutes)

### ☐ Step 3: Deploy CloudFormation Stack via AWS Console

**Easiest Method - Use AWS Console:**

1. **Open CloudFormation Console:**
   https://console.aws.amazon.com/cloudformation/home?region=us-east-1

2. **Create Stack:**
   - Click `Create stack` → `With new resources (standard)`

3. **Upload Template:**
   - Choose `Upload a template file`
   - Click `Choose file`
   - Upload: `/Users/abhishek/Library/CloudStorage/GoogleDrive-abhishek@monetiz3.com/My Drive/Workspace - Monetize Organisation/02 - Product/NexusBrain/infrastructure/aws-deployment.yml`
   - Click `Next`

4. **Stack Name & Parameters:**
   - **Stack name:** `production-nexusbrain-infrastructure`

   **Copy these values from your .env file:**
   - Environment: `production`
   - SupabaseURL: `https://zmlqvuzoodcgmkgkivfw.supabase.co`
   - SupabaseServiceRoleKey: `[Copy from .env - SUPABASE_SERVICE_ROLE_KEY]`
   - OrganizationID: `org-nexusbrain-core`
   - AnthropicAPIKey: `[Copy from .env - ANTHROPIC_API_KEY]`
   - OpenAIAPIKey: `[Copy from .env - OPENAI_API_KEY]`
   - SlackBotToken: `[Leave empty or copy from .env if you have it]`
   - JiraHost: `[Leave empty or copy from .env if you have it]`
   - JiraEmail: `[Leave empty or copy from .env if you have it]`
   - JiraAPIToken: `[Leave empty or copy from .env if you have it]`
   - GitHubToken: `[Copy from .env - GITHUB_TOKEN]`
   - GitHubRepos: `[Leave empty or enter: owner/repo1,owner/repo2]`

   - Click `Next`

5. **Configure Options:**
   - Tags (optional): Add `Project = NexusBrain`
   - Leave other settings as default
   - Click `Next`

6. **Review:**
   - Scroll to bottom
   - ☑ Check: `I acknowledge that AWS CloudFormation might create IAM resources`
   - Click `Submit`

7. **Wait for Completion:**
   - Status will show `CREATE_IN_PROGRESS`
   - **Wait ~10-15 minutes** for status to change to `CREATE_COMPLETE`
   - Refresh page to see progress

8. **Get Outputs:**
   - Once `CREATE_COMPLETE`, go to `Outputs` tab
   - **Copy these values (you'll need them):**
     - `ECRRepositoryURI`
     - `LoadBalancerDNS`
     - `RedisEndpoint`

---

### ☐ Step 4: Setup GitHub Secrets

1. **Go to GitHub Repository:**
   https://github.com/abhishec/nexus-intelligence

2. **Navigate to Secrets:**
   - Click `Settings` tab
   - Click `Secrets and variables` → `Actions`

3. **Add AWS Credentials:**
   - Click `New repository secret`

   **Add these secrets:**

   | Secret Name | Value |
   |-------------|-------|
   | `AWS_ACCESS_KEY_ID` | [Your AWS access key from Step 2] |
   | `AWS_SECRET_ACCESS_KEY` | [Your AWS secret key from Step 2] |

   *Optional:*
   | `SLACK_WEBHOOK_URL` | [For deployment notifications] |

---

## Application Deployment (10-15 minutes)

### ☐ Step 5: Push to GitHub to Trigger Deployment

```bash
# Navigate to project directory
cd "/Users/abhishek/Library/CloudStorage/GoogleDrive-abhishek@monetiz3.com/My Drive/Workspace - Monetize Organisation/02 - Product/NexusBrain"

# Ensure you're on main branch
git checkout main

# Push to GitHub (this triggers deployment)
git push origin main
```

### ☐ Step 6: Monitor Deployment

1. **Go to GitHub Actions:**
   https://github.com/abhishec/nexus-intelligence/actions

2. **Click on Running Workflow:**
   - Look for `Deploy to AWS Production`
   - Click to see live logs

3. **Watch Progress:**
   - ✅ Pre-Deployment Validation (~2 min)
   - ✅ Build & Push Docker Image (~5 min)
   - ✅ Deploy to AWS ECS (~5 min)
   - ✅ Post-Deployment Health Check (~1 min)
   - ✅ Notification

---

## Verification (5 minutes)

### ☐ Step 7: Test Deployment

```bash
# Replace with your Load Balancer DNS from Step 3.8
ALB_DNS="[paste LoadBalancerDNS here]"

# Test health endpoint
curl "http://$ALB_DNS/api/health"

# Expected response:
# {"status":"pass","checks":{"database":{"status":"pass","latencyMs":45},"redis":{"status":"pass","latencyMs":2}}}

# Test brain status
curl "http://$ALB_DNS/api/brain/status?organizationId=org-nexusbrain-core"
```

### ☐ Step 8: View Logs

```bash
# View application logs
aws logs tail /ecs/production-nexusbrain --follow

# Or via AWS Console:
# CloudWatch → Log groups → /ecs/production-nexusbrain
```

---

## Post-Deployment (Optional)

### ☐ Step 9: Run Initial Data Ingestion

**Option A: Via AWS Console (Execute Command)**

1. Go to ECS Console → Clusters → production-nexusbrain-cluster
2. Click on Service → Tasks tab
3. Click on running task
4. Click `Execute command` button
5. Run: `pnpm ingest:initial`

**Option B: Via AWS CLI**

```bash
# Get task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster production-nexusbrain-cluster \
  --service-name production-nexusbrain-service \
  --query 'taskArns[0]' \
  --output text)

# Execute ingestion
aws ecs execute-command \
  --cluster production-nexusbrain-cluster \
  --task $TASK_ARN \
  --container nexusbrain \
  --interactive \
  --command "/bin/sh"

# Inside container:
pnpm ingest:initial
```

### ☐ Step 10: Setup Custom Domain (Optional)

1. **Get Load Balancer DNS** (from Step 3.8)

2. **Create CNAME in your DNS:**
   - Name: `nexusbrain.yourdomain.com`
   - Value: `[Load Balancer DNS]`
   - TTL: 300

3. **Request SSL Certificate:**
   ```bash
   aws acm request-certificate \
     --domain-name nexusbrain.yourdomain.com \
     --validation-method DNS \
     --region us-east-1
   ```

---

## Monitoring

### ☐ Setup CloudWatch Alarms (Recommended)

```bash
# High CPU alarm
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

# Unhealthy targets alarm
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

## Success Criteria

**✅ Deployment Complete When:**
- [ ] CloudFormation stack status: `CREATE_COMPLETE`
- [ ] GitHub Actions workflow: All checks passed ✅
- [ ] Health endpoint returns: `{"status":"pass"}`
- [ ] Application logs show no errors
- [ ] Redis connected (in health check response)
- [ ] Database connected (in health check response)
- [ ] Load Balancer is accessible

---

## Quick Reference

**Your Values (Fill in as you go):**
```
Stack Name: production-nexusbrain-infrastructure
Region: us-east-1
Load Balancer DNS: ___________________________________________
Redis Endpoint: ___________________________________________
ECR Repository: ___________________________________________

Health Endpoint: http://[ALB-DNS]/api/health
Brain Status: http://[ALB-DNS]/api/brain/status
```

**Useful Commands:**
```bash
# View logs
aws logs tail /ecs/production-nexusbrain --follow

# Check service status
aws ecs describe-services \
  --cluster production-nexusbrain-cluster \
  --services production-nexusbrain-service

# Scale service
aws ecs update-service \
  --cluster production-nexusbrain-cluster \
  --service production-nexusbrain-service \
  --desired-count 4
```

---

## Support

- **Documentation:** `AWS_DEPLOYMENT_GUIDE.md`
- **GitHub Deployment:** `DEPLOY-VIA-GITHUB.md`
- **Deployment Runbook:** `DEPLOYMENT_RUNBOOK.md`

---

**Estimated Total Time:** 30-40 minutes
**Cost:** ~$180/month

**You're ready to deploy!** 🚀
