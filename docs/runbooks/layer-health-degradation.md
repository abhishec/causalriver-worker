# Runbook: Layer Health Degradation

**Alert**: `BrainLayerDegraded`
**Severity**: Warning
**Trigger**: Layer health score < 50 for 5+ minutes

---

## Symptoms

- Layer health score dropping below 50
- Increased error rates in specific brain layer
- Potential data quality issues
- User-facing features may be degraded

---

## Investigation Steps

### 1. Identify the Degraded Layer

```sql
SELECT
  layer_number,
  layer_name,
  health_score,
  gaps_detected,
  operations_count,
  avg_latency_ms,
  error_rate,
  snapshot_at
FROM obs_layer_health
WHERE organization_id = '<org-id>'
  AND health_score < 50
ORDER BY snapshot_at DESC
LIMIT 10;
```

**What to look for**:
- Which layer is degraded? (L1-L15)
- How severe? (health_score value)
- Is it trending down or stable?
- Any gaps detected?

### 2. Check Recent Errors

**For L1 (Signal Ingestion)**:
```sql
SELECT
  source_domain,
  signal_type,
  COUNT(*) as error_count,
  COUNT(*) FILTER (WHERE is_quarantined = true) as quarantined_count,
  AVG(quality_score) as avg_quality
FROM obs_signal_ingestion
WHERE organization_id = '<org-id>'
  AND ingested_at > NOW() - INTERVAL '1 hour'
GROUP BY source_domain, signal_type
ORDER BY error_count DESC;
```

**For L4 (Causal)**:
```sql
SELECT
  calculation_type,
  source_domain,
  target_domain,
  COUNT(*) as total_calculations,
  AVG(calculation_duration_ms) as avg_duration,
  COUNT(*) FILTER (WHERE is_significant = true) as significant_count
FROM obs_causal_calculations
WHERE organization_id = '<org-id>'
  AND calculated_at > NOW() - INTERVAL '1 hour'
GROUP BY calculation_type, source_domain, target_domain
ORDER BY total_calculations DESC;
```

**For L6 (Agents)**:
```sql
SELECT
  agent_type,
  status,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration,
  STRING_AGG(DISTINCT error_message, ', ') as errors
FROM obs_agent_executions
WHERE organization_id = '<org-id>'
  AND started_at > NOW() - INTERVAL '1 hour'
GROUP BY agent_type, status
ORDER BY count DESC;
```

### 3. Check for Data Gaps

```sql
SELECT
  source_domain,
  COUNT(*) as signal_count,
  MAX(ingested_at) as last_signal,
  EXTRACT(EPOCH FROM (NOW() - MAX(ingested_at)))/3600 as hours_since_last
FROM obs_signal_ingestion
WHERE organization_id = '<org-id>'
  AND ingested_at > NOW() - INTERVAL '24 hours'
GROUP BY source_domain
ORDER BY hours_since_last DESC;
```

**Look for domains with `hours_since_last > 2`**.

### 4. Review Performance Metrics

```sql
SELECT
  layer_number,
  layer_name,
  avg_latency_ms,
  operations_count,
  error_rate
FROM obs_layer_health
WHERE organization_id = '<org-id>'
  AND snapshot_at > NOW() - INTERVAL '6 hours'
ORDER BY snapshot_at DESC, layer_number ASC;
```

---

## Common Causes & Resolutions

### Layer 1 (Signal Ingestion) - Health < 50

**Cause**: Connector failures or API rate limits

**Resolution**:
1. Check connector authentication:
   ```sql
   SELECT connector_type, status, error_message
   FROM obs_connector_operations
   WHERE organization_id = '<org-id>'
     AND started_at > NOW() - INTERVAL '24 hours'
     AND status = 'failed';
   ```

2. Verify API tokens haven't expired
3. Check rate limiting:
   - Review connector logs for "429 Too Many Requests"
   - Reduce sync frequency if needed
4. Restart failed connectors:
   ```bash
   # Via admin panel or API
   POST /api/connectors/<connector-id>/restart
   ```

---

### Layer 4 (Causal) - Health < 50

**Cause**: Insufficient data for causal discovery

**Resolution**:
1. Check signal volume:
   ```sql
   SELECT COUNT(*) FROM obs_signal_ingestion
   WHERE organization_id = '<org-id>'
     AND ingested_at > NOW() - INTERVAL '7 days';
   ```

2. **If < 100 signals**: Wait for more data accumulation
3. **If > 1000 signals**: Check causal discovery errors:
   ```sql
   SELECT error_message, COUNT(*)
   FROM obs_causal_calculations
   WHERE organization_id = '<org-id>'
     AND calculated_at > NOW() - INTERVAL '24 hours'
     AND is_significant = false
   GROUP BY error_message;
   ```

4. Adjust discovery parameters if needed (in consolidation config)

---

### Layer 6 (Agents) - Health < 50

**Cause**: High agent failure rate (>5%)

**Resolution**:
1. Identify failing agents:
   ```sql
   SELECT agent_type, COUNT(*) as failures, STRING_AGG(DISTINCT error_message, '; ')
   FROM obs_agent_executions
   WHERE organization_id = '<org-id>'
     AND started_at > NOW() - INTERVAL '1 hour'
     AND status = 'failed'
   GROUP BY agent_type
   ORDER BY failures DESC;
   ```

2. **Common agent errors**:
   - **"API rate limit"**: Wait 1 hour for OpenAI rate limit reset
   - **"Context length exceeded"**: Reduce input context size
   - **"Invalid API key"**: Rotate API keys in settings
   - **"Timeout"**: Increase agent timeout config

3. Retry failed agents:
   ```bash
   # Via API
   POST /api/agents/retry-failed?org_id=<org-id>&hours=1
   ```

---

## Escalation

**If health doesn't recover within 30 minutes**:
1. Check #platform-alerts Slack channel for related incidents
2. Review system-wide health:
   ```sql
   SELECT AVG(health_score) as global_health
   FROM obs_layer_health
   WHERE snapshot_at > NOW() - INTERVAL '1 hour';
   ```
3. **If global_health < 50**: Page on-call engineer
4. **If org-specific**: Notify customer success team

---

## Prevention

- Set up monitoring for:
  - Connector health checks every 15 minutes
  - API token expiration warnings (7 days before)
  - Signal volume anomalies (drop > 50%)
- Regular data quality reviews
- Proactive connector auth refresh

---

## Related Runbooks

- [Data Gaps](./data-gaps.md)
- [Consolidation Failures](./consolidation-failures.md)
- [High Error Rate](./high-error-rate.md)
