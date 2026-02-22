# Health Monitor Alerting System -- Design Document

**Status:** Proposed
**Author:** Platform Engineering
**Date:** 2026-02-22
**Last Updated:** 2026-02-22

---

## 1. Problem Statement

BrainOS has comprehensive health observability infrastructure: a 6-dimension learning health endpoint (`/api/brain/health?learning=true`), per-connector monitoring (`/api/connectors/monitoring`), Prometheus-compatible metrics export (`/api/observability/metrics`), nightly consolidation snapshots (`brain_daily_snapshots`), and job execution tracking (`scheduled_job_runs`). However, all of this is **pull-only** -- operators must manually check dashboards to discover problems.

The platform currently has **6 customers across 10 organizations**. As this number grows, the following gaps become urgent:

- **No threshold-based alerting.** If prediction accuracy drops below 60% or a nightly consolidation fails, nobody is notified.
- **No outbound alert delivery.** No emails, Slack messages, or webhooks fire on degradation.
- **No alert deduplication or grouping.** A failing connector could generate hundreds of identical alerts.
- **No SLA monitoring.** There is no way to track whether the nightly pipeline completed within its 2 AM -- 7 AM window.
- **No performance anomaly detection.** Job latency spikes go unnoticed until they cascade into failures.

This design document describes a health monitoring and alerting system that fills these gaps while leveraging the existing infrastructure.

---

## 2. Design Constraints

1. **Multi-org isolation.** Each organization has independent alert thresholds, notification channels, and suppression rules. Platform admins can set global defaults.
2. **Leverage existing tables.** The system reads from `brain_health_history`, `brain_daily_snapshots`, `scheduled_job_runs`, `cross_domain_signals`, `org_connectors`, `connector_checkpoints`, and `cascade_alerts`. It does not duplicate their data.
3. **Small MVP scope.** Phase 1 must be implementable in under one day of engineering effort.
4. **Supabase Edge Functions for the alerting engine.** The evaluation loop runs as a Supabase Edge Function invoked by pg_cron, not as an always-on process.
5. **Email and Slack as initial delivery channels.** Webhook delivery comes in Phase 2.
6. **Idempotent and safe.** Duplicate evaluations must not produce duplicate alerts. Alert storms must be structurally impossible.

---

## 3. Architecture Overview

```
+---------------------+     +-----------------------+     +-------------------+
|  Existing Data      |     |  Alert Evaluation     |     |  Delivery Engine  |
|  Sources            |     |  (Edge Function)      |     |  (Edge Function)  |
|                     |     |                       |     |                   |
|  brain_health_      | --> |  1. Load org configs  | --> |  Email (Resend)   |
|    history          |     |  2. Query metrics     |     |  Slack (webhook)  |
|  brain_daily_       |     |  3. Compare to        |     |  Webhook (future) |
|    snapshots        |     |     thresholds        |     |                   |
|  scheduled_job_runs |     |  4. Deduplicate       |     +-------------------+
|  org_connectors     |     |  5. Write alerts      |            |
|  connector_         |     |  6. Enqueue delivery  |            v
|    checkpoints      |     |                       |     +-------------------+
|  cross_domain_      |     +-----------------------+     |  alert_deliveries |
|    signals          |              |                    |  table            |
|  cascade_alerts     |              v                    +-------------------+
+---------------------+     +-------------------+
                             |  health_alerts    |
        pg_cron              |  table            |
        (every 15 min)       +-------------------+
```

**Flow:**

1. pg_cron fires the `alert-evaluator` Edge Function every 15 minutes.
2. The evaluator iterates over all organizations (or only those with alert configs).
3. For each org, it queries the relevant source tables for current metric values.
4. It compares each metric against the org's configured thresholds (from `alert_threshold_configs`).
5. If a threshold is breached, it checks for an existing open alert on the same metric (deduplication window).
6. If no duplicate exists, it inserts a row into `health_alerts` and enqueues a delivery record in `alert_deliveries`.
7. A separate `alert-delivery` Edge Function (or the same function in a second pass) processes the delivery queue: sends emails via Resend, posts to Slack via incoming webhook, and marks deliveries as sent.

---

## 4. Alert Threshold Definitions

### 4.1 Monitored Metrics

The system monitors six metric categories, each with a default threshold. Orgs can override any threshold.

| # | Metric Key | Source Table | Query | Default Warning | Default Critical | Eval Frequency |
|---|-----------|-------------|-------|----------------|-----------------|----------------|
| 1 | `prediction_accuracy` | `brain_health_history` | Latest `prediction_accuracy` for org | < 0.60 | < 0.40 | 15 min |
| 2 | `overall_health_score` | `brain_daily_snapshots` | Latest `brain_health_score` | < 60 | < 40 | 15 min |
| 3 | `job_success_rate` | `scheduled_job_runs` | Success count / total count in last 24h | < 0.80 | < 0.50 | 15 min |
| 4 | `connector_sync_freshness` | `org_connectors` | Hours since any connector last synced | > 24h | > 48h | 15 min |
| 5 | `signal_volume_24h` | `cross_domain_signals` | Signal count in last 24h | < 10 | 0 | 15 min |
| 6 | `nightly_pipeline_completion` | `scheduled_job_runs` | Did consolidation job succeed today? | missed | failed | Daily (8 AM UTC) |
| 7 | `job_latency_p95` | `scheduled_job_runs` | P95 `duration_ms` for job type in last 7d | > 120000 ms | > 300000 ms | 15 min |
| 8 | `connector_error_rate` | `connector_checkpoints` | Failed checkpoints / total in last 24h | > 0.20 | > 0.50 | 15 min |

### 4.2 Severity Levels

| Severity | Meaning | Default Notification Behavior |
|----------|---------|------------------------------|
| `critical` | Service-impacting, immediate action needed | Real-time: email + Slack immediately |
| `warning` | Degraded but functional, investigate soon | Digest: batched into 15-min or hourly summary |
| `info` | Noteworthy but not actionable | Digest only, or suppressed |

### 4.3 Threshold Configuration Schema

Each org has a row in `alert_threshold_configs` per metric. Platform defaults apply when no org-specific override exists.

```typescript
interface AlertThresholdConfig {
  id: string;                          // UUID
  organization_id: string | null;      // null = platform default
  metric_key: string;                  // e.g. "prediction_accuracy"
  warning_threshold: number;           // e.g. 0.60
  critical_threshold: number;          // e.g. 0.40
  comparison_operator: 'lt' | 'gt' | 'eq';  // less-than, greater-than, equals
  enabled: boolean;
  cooldown_minutes: number;            // min time between re-alerts (default: 60)
  created_at: string;
  updated_at: string;
}
```

The comparison operator determines how the metric value is compared to the threshold:
- `lt`: alert fires when metric **drops below** threshold (accuracy, health score, signal volume)
- `gt`: alert fires when metric **exceeds** threshold (latency, staleness, error rate)
- `eq`: alert fires when metric **equals** threshold (e.g., pipeline completion = "failed")

---

## 5. Database Schema

### 5.1 `alert_threshold_configs` -- Per-org alerting rules

```sql
CREATE TABLE IF NOT EXISTS alert_threshold_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    -- NULL = platform-wide default
  metric_key TEXT NOT NULL,
    -- 'prediction_accuracy', 'overall_health_score', 'job_success_rate',
    -- 'connector_sync_freshness', 'signal_volume_24h',
    -- 'nightly_pipeline_completion', 'job_latency_p95', 'connector_error_rate'
  warning_threshold NUMERIC NOT NULL,
  critical_threshold NUMERIC NOT NULL,
  comparison_operator TEXT NOT NULL DEFAULT 'lt'
    CHECK (comparison_operator IN ('lt', 'gt', 'eq')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(organization_id, metric_key)
);

CREATE INDEX idx_alert_configs_org ON alert_threshold_configs(organization_id)
  WHERE enabled = true;
```

### 5.2 `health_alerts` -- Generated alerts

```sql
CREATE TABLE IF NOT EXISTS health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  metric_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'suppressed')),

  -- What triggered the alert
  current_value NUMERIC NOT NULL,
  threshold_value NUMERIC NOT NULL,
  comparison_operator TEXT NOT NULL,
  message TEXT NOT NULL,         -- Human-readable: "Prediction accuracy dropped to 38% (threshold: 40%)"
  context JSONB DEFAULT '{}',   -- Additional data: job names, connector types, etc.

  -- Lifecycle
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,          -- user who acked
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,              -- user or 'system' (auto-resolve when metric recovers)
  auto_resolved BOOLEAN DEFAULT false,

  -- Deduplication
  fingerprint TEXT NOT NULL,     -- hash of (org_id, metric_key, severity) for dedup
  dedup_count INTEGER DEFAULT 1, -- how many times this alert would have fired during cooldown

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core query patterns
CREATE INDEX idx_health_alerts_org_status
  ON health_alerts(organization_id, status, triggered_at DESC);
CREATE INDEX idx_health_alerts_fingerprint
  ON health_alerts(fingerprint, triggered_at DESC)
  WHERE status = 'open';
CREATE INDEX idx_health_alerts_org_metric
  ON health_alerts(organization_id, metric_key, triggered_at DESC);

-- RLS
ALTER TABLE health_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read" ON health_alerts FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM org_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "org_admins_update" ON health_alerts FOR UPDATE USING (
  organization_id IN (
    SELECT organization_id FROM org_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "service_role_all" ON health_alerts FOR ALL
  USING (auth.role() = 'service_role');
```

### 5.3 `alert_deliveries` -- Outbound notification queue

```sql
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES health_alerts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'webhook')),
  recipient TEXT NOT NULL,         -- email address, Slack webhook URL, or webhook URL
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  delivery_mode TEXT NOT NULL DEFAULT 'realtime'
    CHECK (delivery_mode IN ('realtime', 'digest')),

  -- Delivery tracking
  attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- For digest mode: batch reference
  digest_batch_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_deliveries_pending
  ON alert_deliveries(status, next_retry_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX idx_alert_deliveries_alert
  ON alert_deliveries(alert_id);

-- RLS
ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON alert_deliveries FOR ALL
  USING (auth.role() = 'service_role');
```

### 5.4 `alert_notification_channels` -- Per-org delivery configuration

```sql
CREATE TABLE IF NOT EXISTS alert_notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack', 'webhook')),
  config JSONB NOT NULL DEFAULT '{}',
    -- email:   { "recipients": ["admin@company.com", "ops@company.com"] }
    -- slack:   { "webhook_url": "https://hooks.slack.com/...", "channel": "#alerts" }
    -- webhook: { "url": "https://...", "headers": {...}, "method": "POST" }
  severity_filter TEXT[] NOT NULL DEFAULT '{critical,warning}',
    -- Which severities to deliver on this channel
  delivery_mode TEXT NOT NULL DEFAULT 'realtime'
    CHECK (delivery_mode IN ('realtime', 'digest')),
  digest_interval_minutes INTEGER DEFAULT 60,
    -- For digest mode: how often to batch (15, 60, 360, 1440)
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(organization_id, channel)
);

-- RLS
ALTER TABLE alert_notification_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_admins_manage" ON alert_notification_channels FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM org_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "service_role_all" ON alert_notification_channels FOR ALL
  USING (auth.role() = 'service_role');
```

### 5.5 Entity Relationship Diagram

```
alert_threshold_configs          health_alerts              alert_deliveries
+---------------------+         +-------------------+      +-------------------+
| id                  |         | id                |<-----| alert_id          |
| organization_id  ---|--+      | organization_id   |      | organization_id   |
| metric_key          |  |      | metric_key        |      | channel           |
| warning_threshold   |  |      | severity          |      | recipient         |
| critical_threshold  |  |      | status            |      | status            |
| comparison_operator |  |      | current_value     |      | delivery_mode     |
| cooldown_minutes    |  |      | threshold_value   |      | retry_count       |
| enabled             |  |      | message           |      | sent_at           |
+---------------------+  |      | fingerprint       |      +-------------------+
                          |      | triggered_at      |
alert_notification_       |      | resolved_at       |
  channels                |      +-------------------+
+---------------------+   |
| id                  |   |
| organization_id  ---|---+
| channel             |         +--- Existing Tables (read-only) ---+
| config (JSONB)      |         | brain_health_history              |
| severity_filter     |         | brain_daily_snapshots             |
| delivery_mode       |         | scheduled_job_runs                |
| enabled             |         | org_connectors                   |
+---------------------+         | connector_checkpoints            |
                                | cross_domain_signals             |
                                | cascade_alerts                   |
                                +-----------------------------------+
```

---

## 6. Integration Points with Existing Infrastructure

### 6.1 Data Sources (Read-Only)

The alert evaluator reads from existing tables. No modifications to these tables are needed.

| Source Table | Metric(s) Derived | Query Pattern |
|-------------|-------------------|---------------|
| `brain_health_history` | `prediction_accuracy` | Latest row per org, read `prediction_accuracy` column |
| `brain_daily_snapshots` | `overall_health_score` | Latest row per org, read `brain_health_score` column |
| `scheduled_job_runs` | `job_success_rate`, `nightly_pipeline_completion`, `job_latency_p95` | Aggregate over last 24h/7d per org, filter by `job_type` and `status` |
| `org_connectors` | `connector_sync_freshness` | `MAX(last_synced_at)` per org, compute hours since now |
| `connector_checkpoints` | `connector_error_rate` | Count `status = 'failed'` vs total in last 24h per org |
| `cross_domain_signals` | `signal_volume_24h` | `COUNT(*)` where `created_at > now() - 24h` per org |

### 6.2 Existing Endpoints (No Changes Needed)

The following endpoints already produce the data the evaluator needs. The evaluator queries the database directly (it runs as a Supabase Edge Function with service_role access), so it does not call these HTTP endpoints. However, these endpoints remain the user-facing API for dashboards:

- `GET /api/brain/health?learning=true&organizationId=X` -- 6-dimension health scoring
- `GET /api/connectors/monitoring` -- per-connector status and throughput
- `GET /api/health` -- platform liveness
- `GET /api/observability/metrics` -- Prometheus export

### 6.3 Existing Notification System

The current `/api/notifications` endpoint derives in-app notifications from `cascade_alerts` and `brain_daily_snapshots`. The new alerting system complements this:

- **`/api/notifications`** continues to serve in-app notification bell UI (pull-based).
- **`health_alerts`** provides structured, queryable alert history with lifecycle management.
- **`alert_deliveries`** adds push-based outbound delivery (email, Slack).

The `/api/notifications` endpoint can be extended in Phase 2 to also read from `health_alerts`, unifying the in-app notification experience.

### 6.4 pg_cron Integration

Add two new cron jobs alongside the existing seven jobs in `scheduled_job_runs`:

```sql
-- Alert evaluation: every 15 minutes
SELECT cron.schedule(
  'nexusbrain-alert-evaluation',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url')
           || '/functions/v1/alert-evaluator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer '
        || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Alert delivery processing: every 5 minutes
SELECT cron.schedule(
  'nexusbrain-alert-delivery',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url')
           || '/functions/v1/alert-delivery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer '
        || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 6.5 Brain Auto-Trigger (`lib/brain-trigger.ts`)

No changes needed. The brain auto-trigger fires lightweight brain cycles on 10+ new signals with a 5-minute debounce. The alert evaluator monitors the *output* of these cycles (health scores, job runs) rather than the trigger itself.

---

## 7. Notification Delivery Architecture

### 7.1 Delivery Modes

**Real-time delivery** (for critical alerts):
1. Alert evaluator inserts `health_alerts` row.
2. Alert evaluator inserts `alert_deliveries` row with `delivery_mode = 'realtime'` and `status = 'pending'`.
3. Delivery function picks up pending rows, sends immediately.

**Digest delivery** (for warning/info alerts):
1. Alert evaluator inserts `health_alerts` row.
2. Alert evaluator inserts `alert_deliveries` row with `delivery_mode = 'digest'` and a `digest_batch_id`.
3. Delivery function batches all pending digest items for the same org + channel, sends a single summary message at the configured interval.

### 7.2 Channel Implementations

**Email (via Resend API):**
```typescript
// Pseudocode for email delivery
async function sendEmailAlert(delivery: AlertDelivery, alert: HealthAlert) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'alerts@brainos.dev',
      to: delivery.recipient,
      subject: `[${alert.severity.toUpperCase()}] ${alert.metric_key}: ${alert.message}`,
      html: renderAlertEmailTemplate(alert),
    }),
  });
  return response.ok;
}
```

**Slack (via Incoming Webhook):**
```typescript
async function sendSlackAlert(delivery: AlertDelivery, alert: HealthAlert) {
  const response = await fetch(delivery.recipient, { // recipient = webhook URL
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${severityEmoji(alert.severity)} *${alert.metric_key}*: ${alert.message}`,
      blocks: renderSlackAlertBlocks(alert),
    }),
  });
  return response.ok;
}
```

### 7.3 Retry Logic

Failed deliveries follow exponential backoff:

| Retry # | Delay | `next_retry_at` |
|---------|-------|-----------------|
| 1 | 5 minutes | `NOW() + interval '5 minutes'` |
| 2 | 15 minutes | `NOW() + interval '15 minutes'` |
| 3 | 60 minutes | `NOW() + interval '60 minutes'` |

After 3 failed retries, the delivery is marked `status = 'failed'` and no further attempts are made. A `critical` severity alert about delivery failure is generated for platform admins.

### 7.4 Deduplication and Cooldown

The deduplication fingerprint is computed as:
```
fingerprint = SHA256(organization_id + metric_key + severity)
```

Before creating a new alert, the evaluator checks:
```sql
SELECT id, triggered_at, dedup_count
FROM health_alerts
WHERE fingerprint = $1
  AND status = 'open'
  AND triggered_at > NOW() - (cooldown_minutes || ' minutes')::interval
LIMIT 1;
```

If a matching open alert exists within the cooldown window:
- Increment `dedup_count` on the existing alert.
- Do **not** create a new alert or delivery.
- Update `updated_at` to track last evaluation.

This prevents alert storms. A connector that fails every 15 minutes will produce exactly one alert, with `dedup_count` incrementing to show how many evaluations confirmed the failure.

### 7.5 Auto-Resolution

When the evaluator finds that a metric has recovered (value no longer breaches threshold), it auto-resolves the open alert:

```sql
UPDATE health_alerts
SET status = 'resolved',
    resolved_at = NOW(),
    auto_resolved = true,
    updated_at = NOW()
WHERE fingerprint = $1
  AND status = 'open';
```

A `resolved` notification is sent to the same channels that received the original alert.

---

## 8. Alert Evaluator Edge Function

### 8.1 Pseudocode

```typescript
// supabase/functions/alert-evaluator/index.ts

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

interface MetricEvaluation {
  metric_key: string;
  current_value: number;
  org_id: string;
}

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Load all organizations with at least one enabled config
  const { data: orgs } = await supabase
    .from('alert_threshold_configs')
    .select('organization_id')
    .eq('enabled', true)
    .not('organization_id', 'is', null);

  const orgIds = [...new Set(orgs.map(o => o.organization_id))];

  // 2. Load platform defaults (organization_id IS NULL)
  const { data: defaults } = await supabase
    .from('alert_threshold_configs')
    .select('*')
    .is('organization_id', null)
    .eq('enabled', true);

  for (const orgId of orgIds) {
    // 3. Load org-specific overrides
    const { data: orgConfigs } = await supabase
      .from('alert_threshold_configs')
      .select('*')
      .eq('organization_id', orgId)
      .eq('enabled', true);

    // Merge: org overrides take precedence over defaults
    const configs = mergeConfigs(defaults, orgConfigs);

    // 4. Evaluate each metric
    for (const config of configs) {
      const currentValue = await evaluateMetric(supabase, orgId, config.metric_key);
      const breached = checkThreshold(currentValue, config);

      if (breached) {
        const severity = determineSeverity(currentValue, config);
        const fingerprint = computeFingerprint(orgId, config.metric_key, severity);

        // 5. Dedup check
        const existing = await findOpenAlert(supabase, fingerprint, config.cooldown_minutes);
        if (existing) {
          await incrementDedupCount(supabase, existing.id);
          continue;
        }

        // 6. Create alert
        const alert = await createAlert(supabase, {
          organization_id: orgId,
          metric_key: config.metric_key,
          severity,
          current_value: currentValue,
          threshold_value: severity === 'critical'
            ? config.critical_threshold
            : config.warning_threshold,
          comparison_operator: config.comparison_operator,
          fingerprint,
        });

        // 7. Enqueue deliveries
        await enqueueDeliveries(supabase, orgId, alert);
      } else {
        // 8. Auto-resolve if metric recovered
        await autoResolveIfNeeded(supabase, orgId, config.metric_key);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
```

### 8.2 Metric Evaluation Functions

Each metric has a dedicated query function:

```typescript
async function evaluateMetric(
  supabase: SupabaseClient,
  orgId: string,
  metricKey: string
): Promise<number> {
  switch (metricKey) {
    case 'prediction_accuracy': {
      const { data } = await supabase
        .from('brain_health_history')
        .select('prediction_accuracy')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data?.prediction_accuracy ?? 1; // default safe
    }

    case 'overall_health_score': {
      const { data } = await supabase
        .from('brain_daily_snapshots')
        .select('brain_health_score')
        .eq('organization_id', orgId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();
      return data?.brain_health_score ?? 100;
    }

    case 'job_success_rate': {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: jobs } = await supabase
        .from('scheduled_job_runs')
        .select('status')
        .eq('organization_id', orgId)
        .gte('started_at', since);
      if (!jobs?.length) return 1;
      const successes = jobs.filter(j => j.status === 'success').length;
      return successes / jobs.length;
    }

    case 'connector_sync_freshness': {
      const { data } = await supabase
        .from('org_connectors')
        .select('last_synced_at')
        .eq('organization_id', orgId)
        .not('last_synced_at', 'is', null)
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .single();
      if (!data?.last_synced_at) return 9999; // never synced
      return (Date.now() - new Date(data.last_synced_at).getTime()) / 3600000; // hours
    }

    case 'signal_volume_24h': {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await supabase
        .from('cross_domain_signals')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', since);
      return count ?? 0;
    }

    case 'nightly_pipeline_completion': {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('scheduled_job_runs')
        .select('status')
        .eq('organization_id', orgId)
        .eq('job_type', 'consolidation')
        .gte('started_at', todayStart.toISOString())
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      // Return 1 for success, 0 for failure/missing
      if (!data) return 0;
      return data.status === 'success' ? 1 : 0;
    }

    case 'job_latency_p95': {
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { data: jobs } = await supabase
        .from('scheduled_job_runs')
        .select('duration_ms')
        .eq('organization_id', orgId)
        .eq('status', 'success')
        .gte('started_at', since)
        .not('duration_ms', 'is', null)
        .order('duration_ms', { ascending: true });
      if (!jobs?.length) return 0;
      const p95Index = Math.floor(jobs.length * 0.95);
      return jobs[p95Index]?.duration_ms ?? 0;
    }

    case 'connector_error_rate': {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: checkpoints } = await supabase
        .from('connector_checkpoints')
        .select('status')
        .eq('organization_id', orgId)
        .gte('updated_at', since);
      if (!checkpoints?.length) return 0;
      const failed = checkpoints.filter(c => c.status === 'failed').length;
      return failed / checkpoints.length;
    }

    default:
      return 0;
  }
}
```

---

## 9. API Endpoints

### 9.1 Alert Management API

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/alerts` | List alerts for org (filterable by status, severity, metric) | Org member |
| `PATCH` | `/api/alerts/:id/acknowledge` | Acknowledge an alert | Org admin |
| `PATCH` | `/api/alerts/:id/resolve` | Manually resolve an alert | Org admin |
| `GET` | `/api/alerts/summary` | Alert count by severity and status | Org member |

### 9.2 Threshold Configuration API

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/alerts/config` | Get threshold configs for org (merged with defaults) | Org admin |
| `PUT` | `/api/alerts/config/:metricKey` | Create or update threshold for metric | Org admin |
| `DELETE` | `/api/alerts/config/:metricKey` | Reset to platform default | Org admin |

### 9.3 Notification Channel API

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/alerts/channels` | List notification channels for org | Org admin |
| `PUT` | `/api/alerts/channels/:channel` | Configure email/Slack/webhook channel | Org admin |
| `POST` | `/api/alerts/channels/:channel/test` | Send test notification | Org admin |
| `DELETE` | `/api/alerts/channels/:channel` | Remove notification channel | Org admin |

---

## 10. Implementation Phases

### Phase 1: MVP (< 1 day)

**Goal:** Threshold-based alerting with email delivery for the 6 active customers.

**Scope:**
- [x] Migration: create `alert_threshold_configs`, `health_alerts`, `alert_deliveries`, `alert_notification_channels` tables
- [x] Seed platform defaults for all 8 metrics
- [x] Edge Function: `alert-evaluator` -- evaluate 4 core metrics (`prediction_accuracy`, `overall_health_score`, `job_success_rate`, `signal_volume_24h`)
- [x] Edge Function: `alert-delivery` -- email-only delivery via Resend
- [x] pg_cron: schedule both functions
- [x] Deduplication with fingerprint + cooldown
- [x] Auto-resolution when metrics recover

**Not in scope for Phase 1:**
- Slack delivery
- Digest mode (all alerts are real-time)
- UI for managing thresholds
- `job_latency_p95` and `connector_error_rate` metrics
- `nightly_pipeline_completion` metric

**Estimated effort:** 6--8 hours

| Task | Estimate |
|------|----------|
| Write and run SQL migration (4 tables + seed data) | 1 hour |
| `alert-evaluator` Edge Function (4 metrics, dedup, auto-resolve) | 3 hours |
| `alert-delivery` Edge Function (email via Resend, retry logic) | 1.5 hours |
| pg_cron setup + smoke testing | 0.5 hours |
| End-to-end test with a real org | 1 hour |

### Phase 2: Slack + Digest + Remaining Metrics (2--3 days)

**Goal:** Full metric coverage, Slack delivery, digest batching, and a settings UI.

**Scope:**
- Add Slack delivery channel (incoming webhook)
- Implement digest mode: batch warning/info alerts into periodic summaries
- Add remaining metrics: `nightly_pipeline_completion`, `job_latency_p95`, `connector_error_rate`, `connector_sync_freshness`
- Build settings UI page: `/settings/alerts` with threshold configuration and channel management
- Extend `/api/notifications` to include `health_alerts` in the notification bell
- Add `POST /api/alerts/channels/:channel/test` endpoint

**Estimated effort:** 2--3 days

| Task | Estimate |
|------|----------|
| Slack delivery implementation | 3 hours |
| Digest batching logic | 4 hours |
| 4 remaining metric evaluators | 3 hours |
| Settings UI (threshold config + channel management) | 6 hours |
| Integration with `/api/notifications` | 2 hours |
| Test channel endpoint | 1 hour |
| Testing and bug fixes | 3 hours |

### Phase 3: Production Hardening (1--2 weeks)

**Goal:** Webhook delivery, anomaly detection, SLA monitoring, alert analytics.

**Scope:**
- Generic webhook delivery channel with configurable headers, authentication, and payload templates
- SLA monitoring: define expected completion windows for nightly pipeline stages, alert on SLA breach
- Anomaly detection: use rolling standard deviation on `job_latency_p95` and `signal_volume_24h` to detect statistical anomalies, not just threshold breaches
- Alert analytics dashboard: alert frequency by metric, MTTR (mean time to resolve), noise ratio
- Escalation policies: if a critical alert is not acknowledged within N minutes, escalate to a secondary channel
- On-call rotation integration: PagerDuty / Opsgenie webhook for critical alerts
- Data retention: auto-delete resolved alerts older than 90 days

**Estimated effort:** 1--2 weeks

---

## 11. Seed Data: Platform Defaults

The following SQL seeds the platform-wide default thresholds. Individual orgs inherit these unless they configure overrides.

```sql
INSERT INTO alert_threshold_configs
  (organization_id, metric_key, warning_threshold, critical_threshold, comparison_operator, cooldown_minutes)
VALUES
  (NULL, 'prediction_accuracy',          0.60,   0.40,   'lt', 60),
  (NULL, 'overall_health_score',         60,     40,     'lt', 60),
  (NULL, 'job_success_rate',             0.80,   0.50,   'lt', 60),
  (NULL, 'connector_sync_freshness',     24,     48,     'gt', 120),
  (NULL, 'signal_volume_24h',            10,     0,      'lt', 360),
  (NULL, 'nightly_pipeline_completion',  1,      0,      'eq', 1440),
  (NULL, 'job_latency_p95',             120000, 300000, 'gt', 60),
  (NULL, 'connector_error_rate',         0.20,   0.50,   'gt', 60)
ON CONFLICT (organization_id, metric_key) DO NOTHING;
```

---

## 12. Observability of the Alerting System Itself

The alerting system must not become a silent failure point. The following self-monitoring checks are built into the evaluator:

1. **Evaluator heartbeat.** Each run logs a `scheduled_job_runs` entry with `job_type = 'alert_evaluation'`. If this job is absent for > 30 minutes, existing monitoring (admin overview dashboard) will show it as missing.

2. **Delivery failure alerts.** If any delivery fails all 3 retries, a `critical` alert is generated with `metric_key = 'alert_delivery_failure'` and delivered only to platform admin email (hardcoded fallback).

3. **Evaluator duration tracking.** Each run records `duration_ms`. The evaluator itself is subject to the `job_latency_p95` monitor -- if evaluation takes > 30 seconds, it triggers a warning.

4. **Prometheus metrics.** The evaluator increments counters that are exported via the existing `/api/observability/metrics` endpoint:
   - `brainos_alerts_evaluated_total` (counter, labels: `org_id`, `metric_key`)
   - `brainos_alerts_fired_total` (counter, labels: `org_id`, `metric_key`, `severity`)
   - `brainos_alerts_delivered_total` (counter, labels: `channel`, `status`)
   - `brainos_alert_evaluation_duration_ms` (histogram)

---

## 13. Migration Plan

### Pre-deployment Checklist

1. Run the SQL migration to create the 4 new tables.
2. Run the seed SQL to populate platform default thresholds.
3. Deploy the `alert-evaluator` Edge Function.
4. Deploy the `alert-delivery` Edge Function.
5. Add Resend API key to Supabase Edge Function secrets: `supabase secrets set RESEND_API_KEY=re_...`.
6. Register the two pg_cron jobs.
7. Configure at least one notification channel for each active org (or set a platform-wide fallback email).

### Rollback Plan

- **Drop tables:** `DROP TABLE IF EXISTS alert_deliveries, health_alerts, alert_notification_channels, alert_threshold_configs CASCADE;`
- **Remove cron jobs:** `SELECT cron.unschedule('nexusbrain-alert-evaluation'); SELECT cron.unschedule('nexusbrain-alert-delivery');`
- **Remove Edge Functions:** `supabase functions delete alert-evaluator && supabase functions delete alert-delivery`

No existing tables or functions are modified, so rollback is clean with no data loss.

---

## 14. Open Questions

1. **Resend vs. existing email provider.** Does the platform already have an email sending integration, or is Resend the preferred choice? If Supabase Auth is configured with a custom SMTP provider, we could reuse that connection.

2. **Notification preferences table.** The existing `notification_preferences` table is referenced in `/api/notifications` PATCH handler but may not have a migration. Should the new `alert_notification_channels` table replace it, or should they coexist?

3. **Per-user vs. per-org alerting.** The current design is per-org: all admins in an org receive the same alerts. Should individual users be able to subscribe/unsubscribe from specific metric alerts?

4. **Alert volume at scale.** With 10 orgs and 8 metrics evaluated every 15 minutes, the evaluator makes approximately 80 metric queries per run. At 100+ orgs, this may need batching or parallel execution. Is that a concern for the near term?

5. **Cost budget alerts.** The existing `cost_budget_config` table (referenced in `/api/notifications`) tracks daily LLM spend. Should budget threshold alerts be included in this system or remain separate?

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **Alert** | A record in `health_alerts` indicating a metric has breached its configured threshold |
| **Delivery** | A record in `alert_deliveries` tracking the outbound notification for an alert |
| **Fingerprint** | A hash used to deduplicate alerts for the same metric + org + severity |
| **Cooldown** | Minimum time between re-alerting for the same fingerprint (prevents alert storms) |
| **Digest** | A batched summary of multiple warnings sent at a configured interval |
| **Auto-resolve** | System automatically closes an alert when the metric recovers past its threshold |
| **Evaluator** | The Supabase Edge Function that runs every 15 minutes to check metrics against thresholds |
