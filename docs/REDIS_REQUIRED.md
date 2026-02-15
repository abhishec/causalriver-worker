# Redis: Required Dependency for NexusBrain

**Status**: ✅ **REQUIRED** for production deployments

## Why Redis is Required

NexusBrain uses Redis for critical production features:

### 1. **Circuit Breaker State Persistence** 🔴
- **Without Redis**: Circuit breaker state lost on orchestrator restart
- **Impact**: Repeated failures can overwhelm external APIs (JIRA, Slack) after restart
- **Location**: `packages/memory-stack/src/connectors/{jira,slack}-connector-production.ts`

### 2. **Message Deduplication** 🔴
- **Without Redis**: Duplicate Slack messages, duplicate JIRA issues created
- **Impact**: User confusion, API rate limit exhaustion, data integrity issues
- **Location**: `slack-connector-production.ts` lines 168-184

### 3. **Fast-Path Query Cache** 🟡
- **Without Redis**: Query latency increases 5-10x on repeated queries
- **Impact**: Slower dashboard loads, degraded UX
- **Location**: `packages/memory-stack/src/orchestrator/fast-path-compiler.ts`

### 4. **Connector Sync Cursors** 🟡
- **Without Redis**: Fallback to database-only cursor storage (higher latency)
- **Impact**: Slower connector sync resume, minor performance degradation
- **Location**: `packages/memory-stack/src/connectors/base/checkpoint-manager.ts`

## Production Deployment

### Environment Variable

```bash
# Required in production
export REDIS_URL="redis://user:password@your-redis-host:6379"

# For Redis with TLS (AWS ElastiCache, Upstash, etc.)
export REDIS_URL="rediss://user:password@your-redis-host:6380"
```

### Recommended Redis Providers

| Provider | Use Case | Pricing |
|----------|----------|---------|
| **Upstash** | Serverless, low-traffic orgs | Free tier: 10K commands/day |
| **AWS ElastiCache** | Production, high-traffic | $0.017/hour (cache.t3.micro) |
| **Redis Cloud** | Managed, multi-cloud | Free tier: 30MB |
| **DigitalOcean Managed Redis** | Simple setup | $15/month (1GB) |

### Docker Compose Setup (Development)

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  nexusbrain:
    image: nexusbrain:latest
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy

volumes:
  redis_data:
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        volumeMounts:
        - name: redis-storage
          mountPath: /data
      volumes:
      - name: redis-storage
        persistentVolumeClaim:
          claimName: redis-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

## Health Check

The brain orchestrator automatically validates Redis on startup:

```typescript
// scripts/brain-orchestrator.ts
async start() {
  await this.checkRedisHealth(); // FAILS if Redis unavailable
  // ... rest of initialization
}
```

**Behavior**:
- ✅ **Production**: Fails startup if Redis unavailable (prevents silent data loss)
- ⚠️ **Development**: Logs warning, continues without Redis (degraded mode)

## Monitoring

### Key Metrics to Track

1. **Connection Pool Health**
   ```bash
   redis-cli INFO clients
   # connected_clients: should match expected load
   ```

2. **Memory Usage**
   ```bash
   redis-cli INFO memory
   # used_memory_human: track growth over time
   ```

3. **Hit Rate** (Cache Effectiveness)
   ```bash
   redis-cli INFO stats
   # keyspace_hits / (keyspace_hits + keyspace_misses)
   # Target: >80%
   ```

4. **Eviction Events** (Memory Pressure)
   ```bash
   redis-cli INFO stats
   # evicted_keys: should be 0 in production
   ```

### Alerts to Configure

| Metric | Threshold | Severity |
|--------|-----------|----------|
| Redis Down | Connection failure | 🔴 CRITICAL |
| Memory Usage | >80% of max | 🟡 WARNING |
| Cache Hit Rate | <70% | 🟡 WARNING |
| Evictions | >0/min | 🟠 MODERATE |

## Scaling Guidelines

### Small Deployment (1-10 orgs)
- **Instance**: 1GB RAM, single node
- **Config**: `maxmemory-policy allkeys-lru`
- **Expected Keys**: ~100K keys
- **Memory**: ~200MB

### Medium Deployment (10-100 orgs)
- **Instance**: 4GB RAM, single node with persistence
- **Config**: `maxmemory-policy allkeys-lru`, `save 900 1`
- **Expected Keys**: ~1M keys
- **Memory**: ~800MB

### Large Deployment (100+ orgs)
- **Instance**: Redis Cluster (3+ nodes, 8GB RAM each)
- **Config**: Cluster mode, persistence, automatic failover
- **Expected Keys**: ~10M keys
- **Memory**: ~4GB per node

## Troubleshooting

### "REDIS_URL not set"
```bash
# Check environment
echo $REDIS_URL

# Set for local development
export REDIS_URL="redis://localhost:6379"

# Verify Redis is running
redis-cli ping
# Expected: PONG
```

### "Redis connection timeout"
```bash
# Check Redis is listening
netstat -an | grep 6379

# Test connection
redis-cli -h <host> -p <port> ping

# Check firewall rules
# AWS: Security group must allow inbound on 6379
# GCP: Firewall rule must allow tcp:6379
```

### "Redis PING failed"
```bash
# Check Redis server is running
sudo systemctl status redis

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log

# Restart Redis
sudo systemctl restart redis
```

## Security Best Practices

1. **Never expose Redis publicly**
   - Bind to private IP: `bind 127.0.0.1` or VPC IP
   - Use firewall rules to restrict access

2. **Enable authentication**
   ```bash
   # Redis config
   requirepass <strong-password>

   # Connection URL
   redis://:password@host:6379
   ```

3. **Use TLS in production**
   ```bash
   # Redis 6+ supports TLS natively
   rediss://user:password@host:6380
   ```

4. **Disable dangerous commands**
   ```bash
   # Redis config
   rename-command FLUSHDB ""
   rename-command FLUSHALL ""
   rename-command CONFIG ""
   ```

## FAQ

### Can I run NexusBrain without Redis?

**Short answer**: Not in production.

**Long answer**:
- Development: Yes, with degraded performance (no cache, no deduplication)
- Production: No — circuit breakers, message deduplication are critical

### What happens if Redis goes down mid-operation?

The system gracefully degrades:
- ✅ Brain continues running (in-memory circuit breakers activate)
- ❌ Message deduplication stops (risk of duplicates)
- ❌ Fast-path cache misses (slower queries)
- ⚠️ Connectors may send duplicate alerts

**Recovery**: When Redis comes back, the system automatically reconnects.

### How much Redis memory do I need?

**Formula**:
```
Memory (MB) = (Orgs × 10MB) + (Signals/day × 0.001MB)
```

**Example**:
- 50 orgs
- 1M signals/day
- Memory: (50 × 10) + (1,000,000 × 0.001) = 500 + 1000 = **1.5 GB**

Add 50% buffer for safety: **2.25 GB**

### Can I use Redis Cluster?

Yes! For large deployments (100+ orgs), use Redis Cluster:

```bash
# Connection URL (cluster mode)
export REDIS_URL="redis://node1:6379,node2:6379,node3:6379"
```

NexusBrain's Redis client (`ioredis`) supports cluster mode automatically.

---

**Need help?** Open an issue: https://github.com/nexusbrain/issues
