# NexusBrain Production Deployment Runbook

## Overview

This runbook provides **step-by-step instructions** for deploying NexusBrain to production for design partner environments. Follow each section sequentially to ensure zero-downtime deployment.

**Target Audience:** DevOps, SREs, Platform Engineers
**Estimated Time:** 1-2 hours (first deployment)
**Prerequisites:** Access to Supabase, Redis Cloud, Vercel (or AWS/GCP)

---

## Pre-Deployment Checklist

- [ ] Production Supabase project created
- [ ] Redis Cloud instance provisioned (recommended for 10M+ scale)
- [ ] All API tokens generated (Slack, Jira, GitHub)
- [ ] SSL certificates configured
- [ ] DNS records updated (if custom domain)
- [ ] Team has access to monitoring dashboards
- [ ] Rollback plan reviewed

---

## Step 1: Environment Setup

### 1.1 Create Production `.env` File

```bash
# Copy example and edit with production values
cp .env.example .env.production
```

Edit `.env.production` with these **required** values:

```bash
# Supabase (REQUIRED)
SUPABASE_URL=https://your-production-project.supabase.co
SUPABASE_KEY=your-production-service-role-key

# Organization (REQUIRED)
ORGANIZATION_ID=org-design-partner-name

# Node Environment
NODE_ENV=production
```

### 1.2 Add Redis Configuration (Highly Recommended)

For 10M+ signal scale, Redis is **critical**:

```bash
# Redis Cloud (or self-hosted)
REDIS_URL=redis://default:password@redis-12345.c1.us-east-1.ec2.cloud.redislabs.com:12345
```

**Redis Setup:**
```bash
# Option 1: Redis Cloud (recommended for production)
1. Go to https://redis.com/try-free/
2. Create new database (30MB free tier OK for testing, upgrade for production)
3. Copy connection URL
4. Paste into REDIS_URL env var

# Option 2: Self-hosted Redis (Docker)
docker run -d --name nexus-redis \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:7-alpine redis-server --appendonly yes

# Then set: REDIS_URL=redis://localhost:6379
```

### 1.3 Add Connector Tokens

**Slack:**
```bash
SLACK_BOT_TOKEN=xoxb-your-production-bot-token
```

**Jira:**
```bash
JIRA_HOST=https://your-company.atlassian.net
JIRA_EMAIL=service-account@your-company.com
JIRA_API_TOKEN=your-jira-api-token
```

**GitHub:**
```bash
GITHUB_TOKEN=ghp_your-production-token
GITHUB_REPOS=org/repo1,org/repo2,org/repo3
```

### 1.4 Validate Environment

```bash
# Run validation (will exit if errors found)
pnpm tsx packages/memory-stack/src/config/env-validation.ts
```

Expected output:
```
✅ Environment validation passed

   Organization: org-design-partner
   Supabase: https://xxx.supabase.co
   Redis: ENABLED
   Connectors: Slack, Jira, GitHub
```

---

## Step 2: Database Migrations

### 2.1 Review Pending Migrations

```bash
# Check which migrations will run
supabase db diff
```

### 2.2 Run Migrations (Production)

```bash
# Connect to production Supabase
supabase link --project-ref your-production-ref

# Apply all pending migrations
supabase db push

# Verify migration success
supabase db diff --schema public
# Should output: "No schema changes detected"
```

**Critical:** If migrations fail:
1. **DO NOT** retry without rollback
2. Check `supabase/migrations/rollback/` for down scripts
3. Contact team before proceeding

### 2.3 Verify Database Schema

```bash
# Run schema validation
pnpm verify:db

# Expected output:
# ✅ signals table exists
# ✅ causal_edges table exists
# ✅ long_term_memory table exists
# ... (20+ tables)
```

---

## Step 3: Build & Deploy Application

### 3.1 Build Platform

```bash
# Clean previous builds
pnpm clean

# Install dependencies
pnpm install --frozen-lockfile

# Build all packages
pnpm build
```

**Verify build success:**
- No TypeScript errors
- All packages built successfully
- Output in `dist/` directories

### 3.2 Deploy to Vercel (Option 1)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to production
vercel --prod

# Set environment variables in Vercel dashboard
vercel env add SUPABASE_URL production
vercel env add SUPABASE_KEY production
# ... (repeat for all env vars)
```

### 3.3 Deploy to AWS/GCP (Option 2)

**Using Docker:**

```bash
# Build Docker image
docker build -t nexusbrain:latest .

# Tag for registry
docker tag nexusbrain:latest your-registry/nexusbrain:v1.0.0

# Push to registry
docker push your-registry/nexusbrain:v1.0.0

# Deploy to ECS/GKE/Cloud Run
# (Use your existing container orchestration platform)
```

**Environment variables:** Load from AWS Secrets Manager / GCP Secret Manager

---

## Step 4: Initial Data Ingestion

### 4.1 Run Design Partner Data Load

```bash
# Ensure environment is validated first
source .env.production

# Start initial ingestion (all sources)
pnpm ingest:initial

# Monitor progress
tail -f logs/batch-ingestion.log
```

**Expected Duration:**
- 1M signals: ~10-20 minutes
- 10M signals: ~1-2 hours

**What to Monitor:**
- Batch processing rate (signals/sec)
- Redis memory usage (should stay < 100MB for dedup)
- Supabase connection pool (should stay < 80%)
- Error count (should be < 1% of total signals)

### 4.2 Verify Ingestion Success

```sql
-- Connect to Supabase SQL Editor
-- Check total signal count
SELECT COUNT(*) FROM signals WHERE organization_id = 'org-design-partner';

-- Check signals by source
SELECT source_domain, COUNT(*) as count
FROM signals
WHERE organization_id = 'org-design-partner'
GROUP BY source_domain
ORDER BY count DESC;

-- Expected results:
-- slack: 1M-10M
-- jira: 500k+
-- github: 500k+
```

---

## Step 5: Start Brain Orchestrator

### 5.1 Enable Continuous Learning

```bash
# Start brain orchestrator in continuous mode
pnpm start:production

# Or use systemd/supervisor for auto-restart:
```

**Systemd Service File** (`/etc/systemd/system/nexusbrain.service`):

```ini
[Unit]
Description=NexusBrain Orchestrator
After=network.target

[Service]
Type=simple
User=nexusbrain
WorkingDirectory=/opt/nexusbrain
EnvironmentFile=/opt/nexusbrain/.env.production
ExecStart=/usr/bin/pnpm start:production
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable nexusbrain
sudo systemctl start nexusbrain
sudo systemctl status nexusbrain
```

### 5.2 Verify Orchestrator Health

```bash
# Check health endpoint
curl https://your-domain.com/api/health

# Expected response:
{
  "status": "pass",
  "checks": {
    "database": { "status": "pass", "latencyMs": 45 },
    "redis": { "status": "pass", "latencyMs": 2 }
  }
}
```

---

## Step 6: Setup Monitoring & Alerts

### 6.1 Configure Health Checks

**Kubernetes:**
```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

**AWS ALB:**
```bash
aws elbv2 create-target-group \
  --name nexusbrain-tg \
  --health-check-path /api/health \
  --health-check-interval-seconds 30
```

### 6.2 Setup Alerts

**Example (Datadog):**
```bash
# Add Datadog API key to env
DATADOG_API_KEY=your-datadog-api-key

# Alerts to create:
# 1. Health check failing for > 2 minutes
# 2. Error rate > 5% for 5 minutes
# 3. Supabase connection pool > 80%
# 4. Redis memory > 90%
# 5. Ingestion job failed
```

---

## Step 7: Incremental Sync Schedule

### 7.1 Setup Cron Jobs

```bash
# Edit crontab
crontab -e

# Add incremental sync jobs
*/15 * * * * cd /opt/nexusbrain && pnpm ingest:incremental --sources slack >> /var/log/nexus-slack.log 2>&1
0 * * * * cd /opt/nexusbrain && pnpm ingest:incremental --sources jira >> /var/log/nexus-jira.log 2>&1
0 */6 * * * cd /opt/nexusbrain && pnpm ingest:incremental --sources github >> /var/log/nexus-github.log 2>&1
```

### 7.2 Verify Cron Execution

```bash
# Check recent cron logs
grep CRON /var/log/syslog | tail -20

# Check ingestion logs
tail -f /var/log/nexus-slack.log
```

---

## Step 8: Smoke Tests

### 8.1 Test API Endpoints

```bash
# Health check
curl https://your-domain.com/api/health

# Brain consolidation status
curl https://your-domain.com/api/brain/status

# Query causal edges
curl -X POST https://your-domain.com/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "support_tickets",
    "limit": 10
  }'
```

### 8.2 Test Motor Commands

```bash
# Send test Slack message (verify connector works)
curl -X POST https://your-domain.com/api/motor/execute \
  -H "Content-Type: application/json" \
  -d '{
    "actionType": "slack_send_message",
    "target": "#test-channel",
    "payload": {
      "text": "NexusBrain deployment test - please ignore"
    }
  }'
```

### 8.3 Verify Learning Cycle

```bash
# Trigger manual consolidation
pnpm job:consolidation

# Check brain health
pnpm check:production

# Expected output:
# ✅ Brain health: HEALTHY
# ✅ Total signals: 10,234,567
# ✅ Causal edges: 45,678
# ✅ Active agents: 13
```

---

## Step 9: Handoff to Design Partner

### 9.1 Provide Access

- [ ] Share dashboard URL
- [ ] Create user accounts
- [ ] Grant org-level permissions
- [ ] Share API keys (if needed)

### 9.2 Training Session

**Topics to cover:**
1. How to interpret causal insights
2. How to query the brain via API
3. How to add custom signals
4. How to configure alerts
5. How to trigger manual consolidation

### 9.3 Documentation Links

- **API Reference:** [Link to OpenAPI docs]
- **User Guide:** [Link to user guide]
- **Troubleshooting:** [Link to troubleshooting guide]
- **Support:** support@nexusbrain.ai

---

## Step 10: Post-Deployment Monitoring (24 hours)

### 10.1 Monitor Key Metrics

**First Hour:**
- [ ] Health endpoint returns 200 OK
- [ ] No critical errors in logs
- [ ] Database connections stable
- [ ] Redis memory stable

**First 24 Hours:**
- [ ] Incremental sync jobs running successfully
- [ ] Brain consolidation completing without errors
- [ ] API latency < 500ms p95
- [ ] Error rate < 1%

### 10.2 Performance Baseline

Record these metrics for future comparison:
```
Metric                    | Baseline Value
--------------------------|---------------
Total Signals            | 10,234,567
Avg Query Latency        | 124ms
Ingestion Rate           | 850 signals/sec
Memory Usage (App)       | 512MB
Memory Usage (Redis)     | 87MB
Database Connections     | 12/20
```

---

## Rollback Procedure

**If deployment fails or critical issues occur:**

### Option 1: Rollback Application

```bash
# Vercel
vercel rollback

# AWS/GCP
kubectl rollout undo deployment/nexusbrain

# Docker
docker tag your-registry/nexusbrain:v0.9.0 nexusbrain:latest
docker service update nexusbrain
```

### Option 2: Rollback Database Migrations

```bash
# Navigate to rollback directory
cd supabase/migrations/rollback

# Apply rollback for latest migration
psql $DATABASE_URL -f 20250226000002_rollback.sql

# Verify rollback success
supabase db diff
```

### Option 3: Emergency Shutdown

```bash
# Stop brain orchestrator
systemctl stop nexusbrain

# Stop ingestion jobs
crontab -e  # Comment out all lines

# Keep database online (queries still work)
```

---

## Troubleshooting

### Issue: Migrations Fail

**Symptoms:** `supabase db push` returns errors

**Solution:**
1. Check migration SQL syntax
2. Verify no concurrent migrations running
3. Check database disk space
4. Review rollback migrations
5. Contact Supabase support if persists

---

### Issue: Ingestion Slow

**Symptoms:** < 100 signals/sec processing rate

**Solution:**
1. Check Supabase connection pool limit
2. Increase `maxConcurrent` in batch-ingestion-engine.ts
3. Verify Redis is enabled (critical for dedup performance)
4. Check network latency to Supabase
5. Upgrade Supabase tier if needed

---

### Issue: Redis Out of Memory

**Symptoms:** `OOM` errors in Redis logs

**Solution:**
1. Check memory usage: `redis-cli INFO memory`
2. Increase Redis instance size
3. Reduce dedup TTL from 7 days to 1 day
4. Clear old keys: `redis-cli FLUSHDB` (CAUTION: clears all cache)

---

### Issue: Health Check Failing

**Symptoms:** `/api/health` returns 503

**Solution:**
1. Check database connectivity: `psql $DATABASE_URL -c "SELECT 1"`
2. Check Redis connectivity: `redis-cli PING`
3. Review application logs for errors
4. Verify environment variables loaded correctly
5. Restart application if needed

---

## Support Contacts

**Deployment Issues:**
- Email: devops@nexusbrain.ai
- Slack: #design-partner-support
- On-call: +1-XXX-XXX-XXXX

**Database Issues:**
- Supabase Support: support@supabase.com
- Docs: https://supabase.com/docs

**Redis Issues:**
- Redis Cloud Support: support@redis.com
- Docs: https://redis.io/docs

---

## Success Criteria

Deployment is considered **successful** when:

- ✅ All health checks passing for 24 hours
- ✅ Initial data ingestion completed (10M+ signals)
- ✅ Incremental sync jobs running every 15min/1h/6h
- ✅ Brain consolidation completing successfully
- ✅ API endpoints responding < 500ms p95
- ✅ Error rate < 1%
- ✅ Design partner can query causal insights
- ✅ Motor commands executing successfully
- ✅ No critical alerts firing

---

**Version:** 1.0.0
**Last Updated:** 2025-02-26
**Maintained By:** NexusBrain Platform Team
