# Load Testing Suite — NexusBrain 10M+ Scale Validation

**Purpose**: Validate NexusBrain can handle 10M+ signals per organization at production scale.

---

## 📊 Test Suite Overview

| Test | Purpose | Success Criteria | Duration |
|------|---------|------------------|----------|
| **Seed** | Generate 10M test signals | 10M signals created | ~25 min |
| **Test 1** | Signal ingestion rate | 100K signals/hour sustained, p95 <100ms | 4 hours |
| **Test 2** | Causal discovery | 10M signals → DAG <30 min | ~30 min |
| **Test 3** | Query latency | 1000 queries, p95 <10ms | ~5 min |
| **Test 4** | Connector sync | 50 concurrent orgs, <5 min total | ~10 min |
| **Test 5** | Vector search | 1000 queries, p95 <100ms at 10M embeddings | ~5 min |

**Total Duration**: ~5 hours (full suite) or ~10 minutes (quick mode)

---

## 🚀 Quick Start

### Prerequisites

```bash
# 1. Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export REDIS_URL="redis://localhost:6379"

# 2. Ensure database is ready
# - All migrations applied
# - Indexes created (20250227000001_scale_10m_indexes_and_limits.sql)
# - Retention policies active

# 3. Ensure Redis is running
redis-cli ping
# Expected: PONG
```

### Run Quick Validation (10 minutes)

```bash
cd /path/to/NexusBrain
pnpm exec tsx scripts/load-tests/run-all-tests.ts --quick
```

### Run Full Load Test Suite (5 hours)

```bash
cd /path/to/NexusBrain
pnpm exec tsx scripts/load-tests/run-all-tests.ts
```

---

## 📝 Individual Tests

### Seed: Generate 10M Test Signals

**Purpose**: Create realistic test data (10 orgs × 1M signals each)

```bash
# Full: 10M signals across 10 orgs
pnpm exec tsx scripts/load-tests/seed-10m-signals.ts --count 10000000 --orgs 10

# Quick: 100K signals for 1 org
pnpm exec tsx scripts/load-tests/seed-10m-signals.ts --count 100000 --orgs 1
```

**What It Does**:
- Creates 5 domains per org: engineering, sales, revenue, support, marketing
- 90-day time range with realistic patterns (daily/weekly cycles, anomalies, trends)
- Batch inserts (10K signals/batch) for optimal performance

**Expected Output**:
```
  Total signals created: 10,000,000
  Total duration:        23.5 min
  Average rate:          7,092 signals/sec
✅ Ready for load testing!
```

---

### Test 1: Signal Ingestion

**Purpose**: Validate sustained 100K signals/hour ingestion rate

```bash
# Full: 4-hour sustained test
pnpm exec tsx scripts/load-tests/test-1-signal-ingestion.ts --duration 4h --rate 100000

# Quick: 5-minute validation
pnpm exec tsx scripts/load-tests/test-1-signal-ingestion.ts --duration 5m --rate 100000
```

**Success Criteria**:
- ✅ p50 latency: <50ms
- ✅ p95 latency: <100ms
- ✅ p99 latency: <200ms
- ✅ Error rate: 0%

**What It Tests**:
- Dual-write performance (connector_signals + cross_domain_signals)
- Database write throughput
- Connection pooling under load
- Memory stability over 4 hours

---

### Test 2: Causal Discovery

**Purpose**: Validate brain can process 10M signals in <30 minutes

```bash
pnpm exec tsx scripts/load-tests/test-2-causal-discovery.ts --org 00000000-0000-4000-a000-000000000000
```

**Success Criteria**:
- ✅ Completion time: <30 minutes
- ✅ Memory usage: <16GB
- ✅ CPU usage: <80% average
- ✅ Causal edges discovered: >1000

**What It Tests**:
- 3-Paradigm causal discovery (APEX + PC + VarLiNGAM + Transfer Entropy)
- Bayesian Judge resolution at scale
- Pattern mining (Apriori + PrefixSpan)
- Database query performance with 10M rows

---

### Test 3: Query Latency

**Purpose**: Validate sub-10ms queries at 10M+ scale

```bash
# Full: 1000 random queries
pnpm exec tsx scripts/load-tests/test-3-query-latency.ts --queries 1000

# Quick: 100 queries
pnpm exec tsx scripts/load-tests/test-3-query-latency.ts --queries 100
```

**Success Criteria**:
- ✅ p50 latency: <5ms
- ✅ p95 latency: <10ms
- ✅ p99 latency: <20ms
- ✅ Error rate: 0%

**Query Types Tested**:
1. **Domain time-series**: `getSignalsByDomain()` with 2-day window
2. **Causal graph traversal**: `getSignificantRelationships()` top 100
3. **Entity lookup**: `getSignalsByEntity()` with 1-day window
4. **Recent signals**: Last 1 hour, sorted by timestamp

**What It Tests**:
- Composite index performance (org_id, source_domain, created_at)
- Query planner effectiveness
- Connection pool under concurrent load
- Cache hit rates

---

## 📊 Interpreting Results

### Test Passed ✅

```
┌────────────────────────────────────────────────────────────────────┐
│ LOAD TEST 3: Query Latency — PASSED ✅                             │
└────────────────────────────────────────────────────────────────────┘

  Latency Distribution:
    min:  1.23ms
    p50:  3.45ms ✅
    p95:  8.12ms ✅
    p99:  15.67ms ✅
    max:  42.11ms

✅ TEST PASSED: Query latency meets performance targets at 10M scale
```

**Action**: Proceed to next test.

---

### Test Failed ❌

```
┌────────────────────────────────────────────────────────────────────┐
│ LOAD TEST 3: Query Latency — FAILED ❌                             │
└────────────────────────────────────────────────────────────────────┘

  Latency Distribution:
    p50:  12.34ms ❌ FAIL (target: <5ms)
    p95:  45.67ms ❌ FAIL (target: <10ms)

❌ TEST FAILED: Performance criteria not met
   Review bottlenecks:
   - p50 too high (12.34ms) - check composite indexes
   - p95 too high (45.67ms) - check query planner
```

**Action**: Investigate bottlenecks.

---

## 🔍 Troubleshooting

### Slow Signal Ingestion (Test 1)

**Symptom**: p95 latency >100ms

**Diagnosis**:
```sql
-- Check write lock contention
SELECT * FROM pg_stat_activity WHERE state = 'active' AND wait_event_type IS NOT NULL;

-- Check connection pool usage
SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active';
```

**Fixes**:
- Increase Supabase connection pool: `max_connections = 500` (default: 100)
- Batch inserts: Use 10K signals/batch instead of 1K
- Check disk I/O: `iostat -x 1` (target: <80% utilization)

---

### Slow Causal Discovery (Test 2)

**Symptom**: Duration >30 minutes

**Diagnosis**:
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check table bloat
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Fixes**:
- VACUUM ANALYZE: `VACUUM ANALYZE cross_domain_signals;`
- Increase `work_mem`: `SET work_mem = '256MB';` (default: 4MB)
- Check index usage: `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;`

---

### Slow Queries (Test 3)

**Symptom**: p95 latency >10ms

**Diagnosis**:
```sql
-- EXPLAIN ANALYZE slow query
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM cross_domain_signals
WHERE organization_id = '...' AND source_domain = 'engineering.github'
  AND created_at > NOW() - INTERVAL '2 days'
ORDER BY created_at DESC LIMIT 1000;
```

**Expected Plan** (using composite index):
```
Limit  (cost=0.56..142.34 rows=1000 width=...)
  ->  Index Scan using idx_signals_org_domain_time on cross_domain_signals
        Index Cond: (organization_id = '...' AND source_domain = 'engineering.github' AND created_at > ...)
```

**Bad Plan** (sequential scan):
```
Limit  (cost=0.00..142342.34 rows=1000 width=...)
  ->  Seq Scan on cross_domain_signals  ❌ SLOW!
        Filter: (organization_id = '...' AND source_domain = 'engineering.github' AND created_at > ...)
```

**Fixes**:
- Rebuild index: `REINDEX INDEX idx_signals_org_domain_time;`
- Update statistics: `ANALYZE cross_domain_signals;`
- Increase `random_page_cost`: `SET random_page_cost = 1.1;` (SSD-optimized)

---

## 📈 Benchmarking Results (Expected)

### Target Hardware

- **Database**: Supabase Pro (4 vCPU, 8GB RAM, 200GB SSD)
- **Orchestrator**: AWS Fargate (4 vCPU, 16GB RAM)
- **Redis**: Upstash (1GB, serverless)

### Expected Results

| Test | Metric | Target | Typical Result |
|------|--------|--------|----------------|
| **Test 1** | p95 latency | <100ms | ~75ms |
| **Test 1** | Throughput | 100K/hour | 105K/hour |
| **Test 2** | Duration | <30 min | ~22 min |
| **Test 2** | Memory | <16GB | ~12GB |
| **Test 2** | Edges | >1000 | ~2,500 |
| **Test 3** | p95 latency | <10ms | ~7ms |
| **Test 3** | p99 latency | <20ms | ~14ms |

---

## 🚧 Known Limitations

1. **Vector Search (Test 5)**: Not yet implemented (planned for Week 2)
2. **Connector Sync (Test 4)**: Not yet implemented (planned for Week 2)
3. **Supabase Free Tier**: May hit rate limits (upgrade to Pro for full testing)
4. **pg_cron**: Not available on Supabase Free tier (retention jobs manual)

---

## 📝 Report Generation

After running the full suite, a report is saved:

```
load-test-report-1234567890.txt
```

**Example Report**:
```
┌────────────────────────────────────────────────────────────────────┐
│ LOAD TEST SUITE REPORT — ALL PASSED ✅                             │
└────────────────────────────────────────────────────────────────────┘

  Mode:              Full Load Testing
  Total duration:    302.5 min (5.04 hours)
  Tests run:         5
  Tests passed:      5
  Tests failed:      0

  Test Results:

    1. Seed 10M Test Signals
       Status:     ✅ PASS
       Duration:   23.2 min

    2. Test 1: Signal Ingestion
       Status:     ✅ PASS
       Duration:   240.1 min

    3. Test 2: Causal Discovery
       Status:     ✅ PASS
       Duration:   21.8 min

    4. Test 3: Query Latency
       Status:     ✅ PASS
       Duration:   4.7 min

✅ ALL TESTS PASSED

   NexusBrain is READY for 10M+ scale production deployment!
```

---

## 🎯 Next Steps After Testing

### If All Tests Pass ✅

1. **Review logs**: Check for warnings, slow queries
2. **Profile queries**: Run `SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;`
3. **Document results**: Update `docs/CTO_FIXES_COMPLETE.md` with actual numbers
4. **Proceed to Week 3**: Production hardening (OAuth, APM, rate limiting)

### If Any Test Fails ❌

1. **Review failure logs**: Check test output for specific error
2. **Run EXPLAIN ANALYZE**: Profile slow queries
3. **Check resources**: Memory, CPU, disk I/O, connection pool
4. **Fix bottleneck**: Apply fixes from Troubleshooting section
5. **Re-run failed test**: `pnpm exec tsx scripts/load-tests/test-X-...`
6. **Re-run full suite**: After all fixes confirmed

---

**Last Updated**: 2026-02-16
**Maintained By**: Engineering Leadership
