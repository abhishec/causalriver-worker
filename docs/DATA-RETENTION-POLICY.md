# Data Retention Policy

**Effective Date:** 2025-02-14
**Last Updated:** 2025-02-14
**Version:** 1.0.0

---

## Overview

This policy defines how NexusBrain handles data retention and deletion to comply with GDPR, CCPA, and other data protection regulations.

---

## Data Categories & Retention Periods

### 1. User Account Data

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| **User profile** (name, email) | Account lifetime + 30 days | Contract performance |
| **Authentication data** | Account lifetime + 30 days | Contract performance |
| **Organization membership** | Account lifetime + 30 days | Contract performance |

**Deletion trigger:** 30 days after account deletion request

---

### 2. AI & Memory Data

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| **AI memory** (`ai_memory` table) | Account lifetime + 30 days | Contract performance |
| **Brain causal edges** | Account lifetime + 30 days | Contract performance |
| **Learning state** | Account lifetime + 30 days | Contract performance |
| **DMN insights** | Account lifetime + 30 days | Contract performance |
| **Prediction outcomes** | Account lifetime + 30 days | Contract performance |

**Deletion trigger:** 30 days after account deletion or explicit user request

---

### 3. System & Operational Data

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| **LLM cost logs** | 12 months | Legitimate interest (billing) |
| **Embedding cache** | 7 days (TTL) | Legitimate interest (performance) |
| **Temporal memory state** | 7 days (TTL) | Legitimate interest (performance) |
| **Calibration metrics** | 90 days | Legitimate interest (quality) |
| **Brain daily snapshots** | 90 days | Legitimate interest (backup) |
| **Fast path cache** | 7 days (TTL) | Legitimate interest (performance) |

**Deletion trigger:** Automated based on age

---

### 4. Audit & Compliance Data

| Data Type | Retention Period | Legal Basis |
|-----------|------------------|-------------|
| **Audit logs** | 7 years | Legal obligation (SOC2, GDPR) |
| **Security scan results** | 90 days | Legal obligation (security) |
| **Connector signals** | 12 months | Contract performance |
| **API access logs** | 90 days | Legal obligation (security) |

**Deletion trigger:** Automated archive after retention period

---

## Automated Data Cleanup

### Implementation

**Database Function:**
```sql
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS TABLE(deleted_records JSONB) AS $$
DECLARE
  v_deleted JSONB;
  v_deleted_ai_memory INTEGER;
  v_deleted_cost_logs INTEGER;
  v_deleted_cache INTEGER;
BEGIN
  -- 1. Delete user data 30 days after account deletion
  DELETE FROM ai_memory
  WHERE organization_id IN (
    SELECT id FROM organizations
    WHERE deleted_at < NOW() - INTERVAL '30 days'
  );
  GET DIAGNOSTICS v_deleted_ai_memory = ROW_COUNT;

  -- 2. Delete old cost logs (12 months)
  DELETE FROM llm_cost_log
  WHERE timestamp < NOW() - INTERVAL '12 months';
  GET DIAGNOSTICS v_deleted_cost_logs = ROW_COUNT;

  -- 3. Delete old cache entries (7 days)
  DELETE FROM embedding_cache_state
  WHERE last_accessed < NOW() - INTERVAL '7 days';

  DELETE FROM temporal_memory_state
  WHERE last_accessed < NOW() - INTERVAL '7 days';

  DELETE FROM fast_path_cache
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_deleted_cache = ROW_COUNT;

  -- 4. Archive old audit logs (move to cold storage after 1 year)
  -- Implementation depends on your archive strategy

  -- Return summary
  v_deleted := jsonb_build_object(
    'ai_memory', v_deleted_ai_memory,
    'cost_logs', v_deleted_cost_logs,
    'cache', v_deleted_cache,
    'timestamp', NOW()
  );

  RETURN QUERY SELECT v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION cleanup_old_data() TO service_role;
```

**Scheduled Execution:**
```sql
-- Schedule daily cleanup at 3 AM UTC
SELECT cron.schedule(
  'cleanup-old-data-daily',
  '0 3 * * *',
  $$SELECT cleanup_old_data()$$
);
```

---

## User Rights

### Right to Erasure (GDPR Article 17)

Users can request complete data deletion at any time:

**Process:**
1. User submits deletion request via account settings
2. Account marked as `deleted_at = NOW()`
3. After 30-day grace period, `cleanup_old_data()` permanently deletes:
   - All AI memory and embeddings
   - All learning state
   - All causal relationships
   - All personal data

**Retention exceptions:**
- Audit logs (7 years - legal requirement)
- Aggregated anonymous analytics (no PII)

**Implementation:**
```sql
-- Mark account for deletion
UPDATE organizations
SET deleted_at = NOW()
WHERE id = $1;

-- After 30 days, cleanup_old_data() will permanently delete
```

### Right to Data Portability (GDPR Article 20)

Users can export all their data:

**Includes:**
- User profile
- AI memory entries
- Brain causal graph
- Learning state
- Organization data
- Cost logs

**Format:** JSON or CSV
**Delivery:** Download link or email
**Timeline:** Within 30 days of request

---

## Data Minimization

We only collect and retain data necessary for:
1. Providing the NexusBrain service
2. Improving AI performance
3. Billing and analytics
4. Legal compliance

**Principles:**
- ✅ No collection of unnecessary personal data
- ✅ Automatic expiration of temporary data
- ✅ Regular review of retention periods
- ✅ Encryption at rest and in transit

---

## Backup & Archive Strategy

### Hot Data (Active)
- **Storage:** Primary PostgreSQL database
- **Backup:** Daily snapshots (30-day retention)
- **Encryption:** AES-256

### Warm Data (Recent)
- **Storage:** Extended PostgreSQL or S3
- **Retention:** 90 days
- **Access:** On-demand

### Cold Data (Archive)
- **Storage:** S3 Glacier
- **Retention:** 7 years (audit logs only)
- **Access:** Rare, compliance requests only

---

## Geographic Data Storage

**Primary Region:** US East (Virginia)
**Backup Region:** US West (Oregon)

**GDPR Compliance:**
- EU users: Data can be stored in EU region (upon request)
- Data transfer safeguards: Standard Contractual Clauses (SCCs)

---

## Data Breach Response

In case of data breach:

**Timeline:**
- Detection → 24 hours: Internal notification
- 24-72 hours: Supervisory authority notification (if required)
- 72 hours: User notification (if high risk)

**Process:**
1. Contain and investigate breach
2. Assess impact and affected users
3. Notify authorities if required (GDPR Article 33)
4. Notify affected users if required (GDPR Article 34)
5. Document breach and remediation

---

## Compliance Verification

### Automated Checks
```sql
-- Verify no orphaned data exists
SELECT COUNT(*) FROM ai_memory
WHERE organization_id NOT IN (SELECT id FROM organizations);

-- Check for old data that should be deleted
SELECT COUNT(*) FROM llm_cost_log
WHERE timestamp < NOW() - INTERVAL '12 months';

-- Verify cleanup function ran successfully
SELECT * FROM cron.job_run_details
WHERE jobname = 'cleanup-old-data-daily'
ORDER BY start_time DESC
LIMIT 10;
```

### Manual Audits
- **Frequency:** Quarterly
- **Reviewer:** Data Protection Officer
- **Documentation:** Audit reports stored for 7 years

---

## Policy Updates

**Review Frequency:** Annually or when:
- Regulations change (GDPR, CCPA updates)
- New data types are collected
- Retention periods need adjustment
- User feedback requires changes

**Notification:** Users notified 30 days before policy changes take effect

---

## Contact

**Data Protection Officer:**
Email: privacy@nexusbrain.com
Address: [Company Address]

**User Requests:**
- Data export: privacy@nexusbrain.com
- Data deletion: account settings or privacy@nexusbrain.com
- Questions: privacy@nexusbrain.com

---

## Appendix A: Database Tables & Retention

| Table Name | Retention Period | Auto-Delete |
|------------|------------------|-------------|
| `ai_memory` | Account + 30 days | ✅ Yes |
| `connector_signals` | 12 months | ✅ Yes |
| `brain_causal_edges` | Account + 30 days | ✅ Yes |
| `learning_state` | Account + 30 days | ✅ Yes |
| `dmn_insights` | Account + 30 days | ✅ Yes |
| `consolidation_sessions` | Account + 30 days | ✅ Yes |
| `prediction_outcomes` | Account + 30 days | ✅ Yes |
| `cascade_alerts` | 90 days | ✅ Yes |
| `contributor_expertise` | Account + 30 days | ✅ Yes |
| `org_members` | Account + 30 days | ✅ Yes |
| `organizations` | Permanent (anonymized) | ❌ No |
| `api_keys` | Account + 30 days | ✅ Yes |
| `llm_cost_log` | 12 months | ✅ Yes |
| `embedding_cache_state` | 7 days (TTL) | ✅ Yes |
| `temporal_memory_state` | 7 days (TTL) | ✅ Yes |
| `calibration_metrics` | 90 days | ✅ Yes |
| `brain_daily_snapshots` | 90 days | ✅ Yes |
| `fast_path_cache` | 7 days (TTL) | ✅ Yes |
| `audit_log` | 7 years | ❌ No (legal) |

---

**Document Control:**
- Version: 1.0.0
- Created: 2025-02-14
- Next Review: 2026-02-14
- Owner: Security Team / DPO
- Status: Active
