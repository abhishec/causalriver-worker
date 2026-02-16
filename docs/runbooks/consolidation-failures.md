# Runbook: Brain Consolidation Failures

**Alert**: `ConsolidationFailed`
**Severity**: Critical
**Trigger**: Consolidation run status = 'failed'

---

## Symptoms

- Brain consolidation cycles failing
- No new causal edges discovered
- Predictions not being generated
- Knowledge graph not updating

---

## Investigation Steps

### 1. Identify Failed Runs

```sql
SELECT
  consolidation_run_id,
  organization_id,
  is_core_brain,
  status,
  error_message,
  started_at,
  completed_at,
  signals_in_window
FROM obs_consolidation_cycles
WHERE status = 'failed'
  AND started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC
LIMIT 10;
```

### 2. Analyze Error Patterns

```sql
SELECT
  error_message,
  COUNT(*) as occurrence_count,
  MIN(started_at) as first_seen,
  MAX(started_at) as last_seen
FROM obs_consolidation_cycles
WHERE status = 'failed'
  AND started_at > NOW() - INTERVAL '7 days'
GROUP BY error_message
ORDER BY occurrence_count DESC;
```

### 3. Check Signal Availability

```sql
-- Verify signals exist for consolidation window
SELECT
  COUNT(*) as signal_count,
  MIN(ingested_at) as earliest_signal,
  MAX(ingested_at) as latest_signal
FROM obs_signal_ingestion
WHERE organization_id = '<org-id>'
  AND ingested_at > NOW() - INTERVAL '48 hours';
```

**Expected**: At least 50 signals for meaningful consolidation.

### 4. Review Recent Successful Runs

```sql
SELECT
  consolidation_run_id,
  signals_in_window,
  causal_edges_discovered,
  patterns_found,
  accuracy_score,
  total_duration_ms,
  completed_at
FROM obs_consolidation_cycles
WHERE organization_id = '<org-id>'
  AND status = 'success'
ORDER BY completed_at DESC
LIMIT 5;
```

Compare with failed runs to identify differences.

---

## Common Errors & Resolutions

### Error: "Insufficient signals for causal discovery"

**Cause**: < 50 signals in 48h window

**Resolution**:
1. Check connector status:
   ```sql
   SELECT connector_type, status, records_fetched, completed_at
   FROM obs_connector_operations
   WHERE organization_id = '<org-id>'
   ORDER BY completed_at DESC
   LIMIT 10;
   ```

2. **If connectors failing**: See [Layer Health Degradation](./layer-health-degradation.md)
3. **If connectors succeeding but low volume**:
   - Verify data source has activity
   - Check connector configuration (filters, date ranges)
   - Consider reducing consolidation frequency to weekly

---

### Error: "Database connection timeout"

**Cause**: Database overload or network issues

**Resolution**:
1. Check database connection pool:
   ```sql
   SELECT COUNT(*) as active_connections
   FROM pg_stat_activity
   WHERE state != 'idle';
   ```
   **Alert if > 90 (max: 100)**

2. Check for long-running queries:
   ```sql
   SELECT
     pid,
     now() - pg_stat_activity.query_start AS duration,
     query,
     state
   FROM pg_stat_activity
   WHERE state != 'idle'
     AND now() - pg_stat_activity.query_start > interval '5 minutes'
   ORDER BY duration DESC;
   ```

3. **If pool exhausted**: Kill idle connections:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
     AND state_change < NOW() - INTERVAL '10 minutes';
   ```

4. **If network issues**: Check Supabase status page

---

### Error: "Causal discovery timeout"

**Cause**: Too many domains or signals causing combinatorial explosion

**Resolution**:
1. Check domain count:
   ```sql
   SELECT COUNT(DISTINCT source_domain) as unique_domains
   FROM obs_signal_ingestion
   WHERE organization_id = '<org-id>'
     AND ingested_at > NOW() - INTERVAL '48 hours';
   ```

   **If > 20 domains**: Consider domain filtering or sampling

2. Adjust discovery parameters:
   ```typescript
   // In consolidation config
   {
     discoveryLookbackDays: 90, // Reduce to 30
     minObservations: 5,        // Increase to 10
     maxDomains: 15,            // Add domain limit
   }
   ```

3. Enable sampling for large datasets:
   - Sample 10% of signals for discovery
   - Run full discovery weekly instead of daily

---

### Error: "Memory limit exceeded"

**Cause**: Large dataset causing OOM

**Resolution**:
1. Check consolidation run size:
   ```sql
   SELECT
     AVG(signals_in_window) as avg_signals,
     MAX(signals_in_window) as max_signals,
     AVG(total_duration_ms) as avg_duration
   FROM obs_consolidation_cycles
   WHERE organization_id = '<org-id>'
     AND started_at > NOW() - INTERVAL '7 days';
   ```

2. **If max_signals > 50,000**: Enable batching:
   ```typescript
   // Process in 10k batches
   const batchSize = 10000;
   for (let offset = 0; offset < totalSignals; offset += batchSize) {
     await processSignalBatch(offset, batchSize);
   }
   ```

3. Increase Node.js heap size:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm run consolidation
   ```

---

### Error: "Agent execution failed"

**Cause**: Downstream agent failures blocking consolidation

**Resolution**:
1. Identify failing agents:
   ```sql
   SELECT agent_type, COUNT(*) as failures
   FROM obs_agent_executions
   WHERE organization_id = '<org-id>'
     AND started_at > NOW() - INTERVAL '24 hours'
     AND status = 'failed'
   GROUP BY agent_type;
   ```

2. See [High Error Rate](./high-error-rate.md) runbook

3. **Temporary workaround**: Disable failing agents in consolidation config:
   ```typescript
   {
     enabledAgents: ['pattern_analyzer'], // Exclude failing agents
   }
   ```

---

## Manual Retry

### Retry Failed Consolidation

```bash
# Via CLI
npm run consolidation:retry -- --org-id=<org-id> --run-id=<run-id>

# Via API
POST /api/consolidation/retry
{
  "organizationId": "<org-id>",
  "consolidationRunId": "<run-id>"
}
```

### Force New Consolidation Run

```bash
npm run consolidation:run -- --org-id=<org-id> --force
```

---

## Monitoring

Set up alerts for:
- **Failure rate > 10%** over 24h
- **3 consecutive failures** for same org
- **Zero successful runs** in 48h

---

## Prevention

1. **Capacity planning**:
   - Monitor signals/day trend
   - Scale database before hitting limits
   - Add more consolidation workers for high-volume orgs

2. **Graceful degradation**:
   - Implement timeouts (max 30 min per run)
   - Fall back to simpler algorithms if advanced discovery fails
   - Skip agents if they consistently fail

3. **Regular testing**:
   - Weekly dry-run with max expected data volume
   - Load testing with 2x normal volume
   - Chaos engineering (kill random services during consolidation)

---

## Related Runbooks

- [Layer Health Degradation](./layer-health-degradation.md)
- [Performance Degradation](./performance-degradation.md)
- [Data Gaps](./data-gaps.md)
