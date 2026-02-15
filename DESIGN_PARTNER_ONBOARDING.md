# Design Partner Onboarding Guide

## Overview

NexusBrain is architected to handle **10M+ signals at scale** for enterprise design partners with:
- **1-10M Slack messages** (initial load + incremental sync)
- **500k+ Jira pages** (issues, comments, custom fields)
- **500k+ GitHub files** (entire codebase)

This guide walks through the initial setup and data ingestion process.

---

## Architecture Highlights

### Production-Grade Connectors
All connectors are built for enterprise reliability:

| Connector | Rate Limit | Features |
|-----------|------------|----------|
| **Slack** | 50 req/sec | Circuit breaker, Redis dedup, batch (100/batch), exponential retry |
| **Jira** | 10 req/sec | Circuit breaker, Redis cache, batch (50/batch), exponential retry |
| **GitHub** | 5000/hour | Circuit breaker, Redis cache, GraphQL batching, exponential retry |

### Batch Ingestion Engine
- **Chunked Processing:** 1000 signals/batch
- **Parallel Execution:** 10 concurrent batches
- **Memory Efficient:** Streaming with automatic chunk processing
- **Resume Capability:** Checkpoints every 10 batches (via Redis)
- **Deduplication:** 7-day Redis cache for signal uniqueness
- **Progress Tracking:** Real-time stats + job status

---

## Prerequisites

### 1. Environment Variables

Create a `.env` file in the project root:

```bash
# Supabase (required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ORGANIZATION_ID=org-your-design-partner

# Redis (optional but HIGHLY recommended for scale)
REDIS_URL=redis://localhost:6379

# Slack (for Slack ingestion)
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Jira (for Jira ingestion)
JIRA_HOST=https://yourcompany.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-api-token

# GitHub (for GitHub ingestion)
GITHUB_TOKEN=ghp_your-personal-access-token
GITHUB_REPOS=owner/repo1,owner/repo2,owner/repo3
```

### 2. Database Setup

Run Supabase migrations:

```bash
# Ensure you have supabase CLI installed
supabase db push
```

This creates the necessary tables:
- `signals` - Core signal storage (10M+ rows supported)
- `causal_edges` - Discovered causal relationships
- `long_term_memory` - Consolidated patterns
- `prediction_tracker` - Calibration loop predictions
- `brain_health_history` - System health snapshots

### 3. Redis Setup (Optional but Recommended)

For 10M+ scale, Redis is **critical** for:
- Deduplication (avoid re-processing signals)
- Checkpoints (resume failed jobs)
- Connector caching (reduce API calls)

```bash
# Local Redis (development)
docker run -d -p 6379:6379 redis:alpine

# Or use Redis Cloud (production)
# Set REDIS_URL to your cloud instance
```

---

## Initial Data Load

### Full Ingestion (All Sources)

Load all data from Slack, Jira, and GitHub:

```bash
pnpm ingest:initial
```

This will:
1. Fetch all Slack messages from all channels
2. Fetch all Jira issues + comments from all projects
3. Fetch all GitHub files from configured repos
4. Process in parallel with 10 concurrent batches
5. Save checkpoints every 10 batches for resume capability

**Expected Duration:**
- 1M signals: ~10-20 minutes
- 10M signals: ~1-2 hours (depending on network + Supabase throughput)

### Source-Specific Ingestion

Ingest from a single source:

```bash
# Slack only (1-10M messages)
pnpm ingest:slack

# Jira only (500k+ pages)
pnpm ingest:jira

# GitHub only (500k+ files)
pnpm ingest:github
```

---

## Incremental Updates

After initial load, run incremental syncs to capture new data:

```bash
pnpm ingest:incremental
```

This uses cursors/timestamps to only fetch data created since the last run.

**Recommended Schedule:**
- **Slack:** Every 15 minutes (near real-time)
- **Jira:** Every 1 hour (issue updates)
- **GitHub:** Every 6 hours (code changes)

Set up cron jobs:

```bash
# Add to crontab
*/15 * * * * cd /path/to/nexusbrain && pnpm ingest:incremental --sources slack
0 * * * * cd /path/to/nexusbrain && pnpm ingest:incremental --sources jira
0 */6 * * * cd /path/to/nexusbrain && pnpm ingest:incremental --sources github
```

---

## Monitoring & Troubleshooting

### Check Ingestion Progress

```bash
# View logs during ingestion
tail -f logs/batch-ingestion.log
```

### Resume Failed Jobs

If an ingestion job fails (network issue, rate limit, etc.), resume from checkpoint:

```bash
pnpm ingest:resume job_1234567890
```

The job will continue from the last successful batch.

### Health Checks

Check connector health:

```bash
# Verify all connectors are operational
pnpm check:production
```

### Database Metrics

Query signal counts:

```sql
-- Total signals ingested
SELECT COUNT(*) FROM signals WHERE organization_id = 'org-your-design-partner';

-- Signals by source
SELECT source_domain, COUNT(*) as count
FROM signals
WHERE organization_id = 'org-your-design-partner'
GROUP BY source_domain
ORDER BY count DESC;

-- Recent signals (last 24h)
SELECT source_domain, signal_type, COUNT(*) as count
FROM signals
WHERE organization_id = 'org-your-design-partner'
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY source_domain, signal_type
ORDER BY count DESC;
```

---

## Performance Optimization

### For 10M+ Signal Scale

1. **Enable Redis** (required for dedup + checkpoints)
2. **Increase Supabase connection pool:**
   ```typescript
   // In supabase-repository.ts
   const supabase = createClient(url, key, {
     db: { pool: { max: 20 } }, // Default is 10
   });
   ```
3. **Tune batch size** based on network:
   ```bash
   # Faster network? Increase batch size
   tsx scripts/run-batch-ingestion.ts --batch-size 2000 --sources slack
   ```
4. **Monitor Supabase metrics:**
   - Database size (ensure < 80% capacity)
   - Connection pool usage (< 80%)
   - Query performance (add indexes if slow)

### Recommended Indexes

Add these indexes for query performance:

```sql
-- Signals table (for fast filtering)
CREATE INDEX idx_signals_org_source ON signals(organization_id, source_domain);
CREATE INDEX idx_signals_timestamp ON signals(timestamp DESC);
CREATE INDEX idx_signals_entity ON signals(entity_type, entity_id);

-- Causal edges (for graph queries)
CREATE INDEX idx_causal_edges_org ON causal_edges(organization_id);
CREATE INDEX idx_causal_edges_domains ON causal_edges(from_domain, to_domain);
```

---

## Architecture Scalability

### Current Capacity
- **Signals:** 10M+ (tested)
- **Concurrent batches:** 10
- **Throughput:** ~500-1000 signals/sec

### Scaling Beyond 10M

If you need to scale beyond 10M signals:

1. **Horizontal scaling:** Deploy multiple ingestion workers
2. **Partitioning:** Shard signals table by `organization_id`
3. **Caching:** Add Redis cluster for distributed dedup
4. **Queue:** Use message queue (RabbitMQ/SQS) for batch coordination

Contact us for enterprise scaling guidance.

---

## Support

### Common Issues

**Problem:** Rate limit errors from Slack/Jira/GitHub
- **Solution:** Connectors include automatic retry with exponential backoff. Check logs for retry status.

**Problem:** Out of memory during ingestion
- **Solution:** Reduce `--batch-size` or `--max-concurrent` parameters.

**Problem:** Supabase connection timeouts
- **Solution:** Increase connection pool size or upgrade Supabase tier.

**Problem:** Duplicate signals in database
- **Solution:** Enable Redis for deduplication (`REDIS_URL` env var).

### Contact

For design partner support:
- **Email:** support@nexusbrain.ai
- **Slack:** #design-partners channel
- **Docs:** https://docs.nexusbrain.ai

---

## Next Steps

After initial ingestion completes:

1. **Verify signal count** matches expected (Slack messages + Jira issues + GitHub files)
2. **Run brain consolidation** to discover causal patterns:
   ```bash
   pnpm job:consolidation
   ```
3. **Enable continuous learning** with scheduled agents:
   ```bash
   # Start brain orchestrator in continuous mode
   pnpm start:production
   ```
4. **Query causal insights:**
   ```sql
   SELECT * FROM causal_edges
   WHERE organization_id = 'org-your-design-partner'
     AND causality_score > 0.8
   ORDER BY causality_score DESC
   LIMIT 100;
   ```

Welcome to NexusBrain! 🧠
