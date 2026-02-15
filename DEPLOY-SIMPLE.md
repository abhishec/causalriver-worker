# NexusBrain - One-Click AWS Deployment

## ✅ Simple 3-Step Deployment (Fully AWS-Driven)

### Step 1: Add AWS Credentials to GitHub Secrets

1. Go to your GitHub repository: https://github.com/abhishec/nexus-intelligence
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Add these secrets:
   - `AWS_ACCESS_KEY_ID` - Your AWS access key
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret key

### Step 2: Push to GitHub

```bash
cd /Users/abhishek/Library/CloudStorage/GoogleDrive-abhishek@monetiz3.com/My\ Drive/Workspace\ -\ Monetize\ Organisation/02\ -\ Product/NexusBrain

# Add all changes
git add .

# Commit
git commit -m "Add GitHub Actions deployment workflow"

# Push to main branch
git push origin main
```

### Step 3: Watch It Deploy!

GitHub Actions will automatically:
1. ✅ Build Docker image (in GitHub, not locally!)
2. ✅ Push to AWS ECR
3. ✅ Deploy infrastructure with CDK
4. ✅ Start ECS service

**View progress:** https://github.com/abhishec/nexus-intelligence/actions

---

## 🎯 What Gets Deployed

| Resource | Type | Purpose |
|----------|------|---------|
| **VPC** | Multi-AZ | Network isolation |
| **Redis** | ElastiCache t3.medium | Signal caching & deduplication |
| **ECS Cluster** | Fargate | Container orchestration |
| **ALB** | Load Balancer | Traffic routing & health checks |
| **Secrets** | Secrets Manager | Encrypted credentials |
| **Auto-scaling** | 2-10 instances | Scale based on CPU (70%) |

---

## 📊 After Deployment

Once GitHub Actions completes (8-12 minutes), check the outputs:

```bash
# Get your deployment URL
cd infrastructure/cdk
cat outputs.json
```

Test health endpoint:
```bash
curl http://[ALB-DNS]/api/health
```

---

## 🔄 Future Updates

Any time you push to `main` branch:
- Docker image rebuilds automatically
- ECS service updates with new image
- Zero downtime deployment!

---

## 🆘 Troubleshooting

**If GitHub Actions fails:**
1. Check AWS credentials are correct
2. Ensure ECR repository exists: `aws ecr describe-repositories --repository-names nexusbrain --region us-east-1`
3. View detailed logs in GitHub Actions tab

**If ECS service fails to start:**
1. Check CloudWatch logs: `/ecs/production-nexusbrain`
2. Verify environment variables in Secrets Manager
3. Check health endpoint is responding

---

## 💰 Cost Estimate

Monthly cost (production):
- ECS Fargate (2 vCPU, 4GB): ~$40-60
- Redis (t3.medium): ~$40
- NAT Gateway: ~$32
- ALB: ~$16
- **Total: ~$130-150/month**

With Fargate Spot (70% cost reduction):
- **Total: ~$60-80/month**

---

## ✅ You're Done!

Everything is now **fully AWS-driven**:
- ✅ No local Docker required
- ✅ Auto-builds from GitHub
- ✅ Auto-scales as you grow
- ✅ One command to deploy: `git push`

Welcome to production! 🚀
