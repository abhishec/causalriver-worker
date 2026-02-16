# Runbook: Data Gaps - No Signals Received

**Alert**: `DataGapDetected`
**Severity**: Warning
**Trigger**: No signals from source domain for 2+ hours

---

## Symptoms

- No recent signals from specific data source
- Layer health degradation for L1 (Signal Ingestion)
- Incomplete data for causal discovery
- Stale dashboards and predictions

---

## Investigation Steps

### 1. Identify Affected Domains

```sql
SELECT
  source_domain,
  COUNT(*) as signal_count,
  MAX(ingested_at) as last_signal,
  EXTRACT(EPOCH FROM (NOW() - MAX(ingested_at)))/3600 as hours_since_last
FROM obs_signal_ingestion
WHERE organization_id = '<org-id>'
  AND ingested_at > NOW() - INTERVAL '7 days'
GROUP BY source_domain
ORDER BY hours_since_last DESC;
```

**Alert threshold**: `hours_since_last > 2`

### 2. Check Connector Status

```sql
SELECT
  connector_type,
  status,
  records_fetched,
  records_processed,
  records_failed,
  error_message,
  started_at,
  completed_at
FROM obs_connector_operations
WHERE organization_id = '<org-id>'
  AND connector_type IN (
    SELECT DISTINCT source_domain FROM obs_signal_ingestion
    WHERE organization_id = '<org-id>'
  )
ORDER BY started_at DESC
LIMIT 20;
```

### 3. Review Connector Logs

```bash
# View connector logs
docker logs -f nexus-connector-<connector-type> --since 1h

# Or via kubectl
kubectl logs -f deployment/nexus-connector-<connector-type> --since=1h
```

---

## Common Causes & Resolutions

### Cause 1: Connector Authentication Failed

**Symptoms**:
- Error: "401 Unauthorized" or "403 Forbidden"
- Last successful sync > 24h ago
- `status = 'failed'` in `obs_connector_operations`

**Resolution**:
1. Check API token expiration:
   ```sql
   SELECT connector_type, auth_token_expires_at
   FROM connectors
   WHERE organization_id = '<org-id>'
     AND auth_token_expires_at < NOW() + INTERVAL '7 days';
   ```

2. **If token expired**:
   - Navigate to Settings → Integrations
   - Click "Reconnect" for affected connector
   - Complete OAuth flow

3. **If token valid but failing**:
   - Check if API permissions changed on data source
   - Verify API key/token is correct
   - Test manually:
     ```bash
     curl -H "Authorization: Bearer <token>" \
       https://api.<source>.com/v1/test
     ```

4. Restart connector after re-authentication:
   ```bash
   POST /api/connectors/<connector-id>/restart
   ```

---

### Cause 2: Rate Limiting

**Symptoms**:
- Error: "429 Too Many Requests"
- Connector succeeding but fetching 0 records
- Intermittent failures

**Resolution**:
1. Check rate limit status:
   ```sql
   SELECT
     connector_type,
     COUNT(*) FILTER (WHERE error_message LIKE '%429%') as rate_limit_errors,
     COUNT(*) as total_syncs
   FROM obs_connector_operations
   WHERE organization_id = '<org-id>'
     AND started_at > NOW() - INTERVAL '24 hours'
   GROUP BY connector_type;
   ```

2. **If rate limited**:
   - **Immediate**: Wait for rate limit reset (usually 1 hour)
   - **Short-term**: Reduce sync frequency:
     ```sql
     UPDATE connectors
     SET sync_interval_minutes = sync_interval_minutes * 2
     WHERE connector_type = '<type>'
       AND organization_id = '<org-id>';
     ```
   - **Long-term**: Upgrade API plan with data source

3. Implement exponential backoff (already in code):
   ```typescript
   const retryAfter = parseInt(response.headers.get('Retry-After') || '3600');
   await sleep(retryAfter * 1000);
   ```

---

### Cause 3: No New Data at Source

**Symptoms**:
- Connector succeeding with `records_fetched = 0`
- No errors
- Data source genuinely inactive

**Resolution**:
1. Verify data source has activity:
   - Log into source platform manually
   - Check if any new records exist

2. **If source is inactive**:
   - This is expected behavior (e.g., weekend, holiday)
   - Reduce alert sensitivity:
     ```sql
     -- Increase gap threshold from 2h to 24h for low-activity sources
     UPDATE alert_thresholds
     SET data_gap_hours = 24
     WHERE source_domain IN ('weekend_only_source');
     ```

3. **If source has data but connector missing it**:
   - Check connector date filter logic
   - Verify incremental sync cursor is correct:
     ```sql
     SELECT connector_type, last_sync_cursor, last_sync_at
     FROM connectors
     WHERE organization_id = '<org-id>';
     ```
   - Reset cursor to re-sync:
     ```sql
     UPDATE connectors
     SET last_sync_cursor = NULL  -- Triggers full re-sync
     WHERE connector_type = '<type>'
       AND organization_id = '<org-id>';
     ```

---

### Cause 4: Connector Service Down

**Symptoms**:
- All connectors failing for multiple orgs
- Error: "Connection timeout" or "Service unavailable"
- Platform-wide issue

**Resolution**:
1. Check connector service health:
   ```bash
   # Check if service is running
   kubectl get pods -l app=nexus-connector

   # Check service health endpoint
   curl https://connectors.nexusbrain.ai/health
   ```

2. **If service down**:
   - Check incident status page
   - Review Kubernetes events:
     ```bash
     kubectl get events --sort-by='.lastTimestamp' | grep connector
     ```
   - Restart service:
     ```bash
     kubectl rollout restart deployment/nexus-connector
     ```

3. **If widespread outage**:
   - Page on-call engineer
   - Check #incidents Slack channel
   - Update status page

---

### Cause 5: Data Quarantine

**Symptoms**:
- Signals arriving but not being processed
- High `is_quarantined = true` count
- Low quality scores

**Resolution**:
1. Check quarantined signals:
   ```sql
   SELECT
     source_domain,
     signal_type,
     COUNT(*) as quarantined_count,
     STRING_AGG(DISTINCT quality_flags::TEXT, ', ') as reasons
   FROM obs_signal_ingestion
   WHERE organization_id = '<org-id>'
     AND ingested_at > NOW() - INTERVAL '24 hours'
     AND is_quarantined = true
   GROUP BY source_domain, signal_type
   ORDER BY quarantined_count DESC;
   ```

2. **Common quarantine reasons**:
   - **"invalid_schema"**: Signal doesn't match expected schema
   - **"missing_required_fields"**: Required fields null/empty
   - **"duplicate"**: Exact duplicate signal
   - **"quality_score_low"**: Quality < 0.3 threshold

3. **Fix schema issues**:
   ```typescript
   // Update signal transformation logic
   function transformSignal(rawSignal: any): Signal {
     return {
       source_domain: rawSignal.domain || 'unknown',
       signal_type: rawSignal.type || 'generic',
       entity_type: rawSignal.entity_type, // Required!
       entity_id: rawSignal.entity_id,     // Required!
       // ... ensure all required fields present
     };
   }
   ```

4. **Reprocess quarantined signals**:
   ```sql
   UPDATE signals
   SET is_quarantined = false
   WHERE id IN (
     SELECT id FROM obs_signal_ingestion
     WHERE is_quarantined = true
       AND quality_flags @> '["invalid_schema"]'
       AND ingested_at > NOW() - INTERVAL '7 days'
   );
   ```

---

## Manual Data Backfill

If data gap is historical (not ongoing):

### 1. Trigger Manual Sync

```bash
POST /api/connectors/<connector-id>/sync
{
  "organizationId": "<org-id>",
  "startDate": "2026-02-15T00:00:00Z",
  "endDate": "2026-02-17T00:00:00Z",
  "forceFullSync": true
}
```

### 2. Monitor Backfill Progress

```sql
SELECT
  connector_type,
  records_fetched,
  records_processed,
  status,
  started_at,
  completed_at
FROM obs_connector_operations
WHERE organization_id = '<org-id>'
  AND started_at > NOW() - INTERVAL '1 hour'
ORDER BY started_at DESC;
```

### 3. Verify Signals Filled

```sql
SELECT
  DATE_TRUNC('hour', ingested_at) as hour,
  source_domain,
  COUNT(*) as signal_count
FROM obs_signal_ingestion
WHERE organization_id = '<org-id>'
  AND ingested_at BETWEEN '2026-02-15' AND '2026-02-17'
GROUP BY hour, source_domain
ORDER BY hour ASC, source_domain;
```

---

## Prevention

### 1. Proactive Monitoring

Set up alerts for:
- **No signals > 2h**: Early warning
- **Connector failures > 3**: Authentication issues
- **Rate limit errors > 10/hour**: Need to upgrade API plan
- **Quarantine rate > 5%**: Schema changes at source

### 2. Connector Health Checks

```typescript
// Run every 15 minutes
async function checkConnectorHealth() {
  const connectors = await getActiveConnectors(organizationId);

  for (const connector of connectors) {
    const lastSync = await getLastSync(connector.id);

    // Alert if last sync > 4 hours ago
    if (Date.now() - lastSync.completed_at > 4 * 60 * 60 * 1000) {
      await alert({
        severity: 'warning',
        message: `Connector ${connector.type} hasn't synced in 4+ hours`,
      });
    }
  }
}
```

### 3. Redundant Data Sources

For critical domains, configure multiple connectors:
- **Primary**: Real-time webhook
- **Backup**: Polling API every 15 min
- **Fallback**: Daily CSV import

---

## Related Runbooks

- [Layer Health Degradation](./layer-health-degradation.md)
- [Consolidation Failures](./consolidation-failures.md)
- [High Error Rate](./high-error-rate.md)
