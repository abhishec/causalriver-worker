# NexusBrain Observability Dashboard Architecture

**Dual-Dashboard System: Per-Org + Core Admin**

## Overview

The observability framework requires **TWO separate dashboard systems** with different access patterns, aggregation levels, and purposes:

1. **Per-Organization Dashboards** — Each org sees ONLY their brain's health and performance
2. **Core Admin Dashboard** — Platform team sees ALL orgs aggregated + core brain health

---

## Architecture Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐          ┌──────────────────┐            │
│  │   ORG A Brain   │          │  ORG B Brain     │            │
│  │                 │          │                  │            │
│  │  obs_* tables   │          │  obs_* tables    │            │
│  │  (org_id = A)   │          │  (org_id = B)    │            │
│  └────────┬────────┘          └────────┬─────────┘            │
│           │                             │                       │
│           └──────────┬──────────────────┘                       │
│                      │                                           │
│           ┌──────────▼─────────────┐                           │
│           │  Supabase PostgreSQL   │                           │
│           │  (18 obs_* tables)     │                           │
│           │  RLS: org_id filter    │                           │
│           └──────────┬─────────────┘                           │
│                      │                                           │
│        ┌─────────────┴────────────────┐                        │
│        │                              │                        │
│        ▼                              ▼                        │
│  ┌───────────────┐            ┌──────────────────┐            │
│  │  PER-ORG      │            │  CORE ADMIN      │            │
│  │  DASHBOARD    │            │  DASHBOARD       │            │
│  │  (Grafana)    │            │  (Grafana)       │            │
│  │               │            │                  │            │
│  │  - 15 Layers  │            │  - Global View   │            │
│  │  - Own Data   │            │  - All Orgs      │            │
│  │  - RLS Filter │            │  - Aggregates    │            │
│  └───────────────┘            │  - Core Brain    │            │
│                                └──────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Per-Organization Dashboards

### Purpose
Each organization gets a **dedicated dashboard** showing ONLY their brain's health, performance, and learning progress.

### Access Control
- **RLS (Row Level Security)** enforces org_id filtering at the database level
- Users see ONLY their organization's data
- No cross-org data leakage possible

### Dashboard URL Pattern
```
https://nexusbrain.grafana.net/org/{org_id}/brain-health
```

### Dashboard Components

#### 📊 **Panel 1: Brain Health Score (0-100)**
**Purpose**: Single-number health score across all 15 layers

**Data Source**:
```sql
SELECT AVG(health_score) as overall_health
FROM obs_layer_health
WHERE organization_id = $org_id
  AND snapshot_at > NOW() - INTERVAL '24 hours'
```

**Visualization**: Gauge (0-100)
- 80-100: Green (Healthy)
- 50-79: Yellow (Degraded)
- 0-49: Red (Critical)

---

#### 📋 **Panel 2: Layer-by-Layer Status**
**Purpose**: Show health of each of the 15 layers

**Data Source**:
```sql
SELECT
  layer_number,
  layer_name,
  health_score,
  is_healthy,
  record_count,
  gaps_count
FROM (
  SELECT DISTINCT ON (layer_number)
    layer_number,
    layer_name,
    health_score,
    is_healthy,
    gaps_count,
    0 as record_count  -- Will join with actual counts
  FROM obs_layer_health
  WHERE organization_id = $org_id
  ORDER BY layer_number, snapshot_at DESC
) latest
ORDER BY layer_number
```

**Visualization**: Table
```
| Layer | Name                  | Health | Records | Gaps | Status  |
|-------|-----------------------|--------|---------|------|---------|
| L1    | Signal Ingestion      | 95     | 1,234   | 0    | ✅ Healthy |
| L2    | Entity Resolution     | 88     | 567     | 0    | ✅ Healthy |
| L3    | Semantic Memory       | 92     | 890     | 0    | ✅ Healthy |
| L4    | Causal Graph          | 75     | 23      | 2    | ⚠️  Degraded |
| L5    | Pattern Learning      | 0      | 0       | 1    | ❌ Empty |
| L6    | Agent Orchestration   | 82     | 15      | 1    | ✅ Healthy |
| L7    | Connector Sync        | 90     | 8       | 0    | ✅ Healthy |
| L8    | Deep Dreaming         | 0      | 0       | 0    | ⭕ Empty |
| L9    | Hierarchical Memory   | 0      | 0       | 0    | ⭕ Empty |
| L10   | Curiosity Engine      | 0      | 0       | 0    | ⭕ Empty |
| L11   | Self-Modifying Cog    | 0      | 0       | 0    | ⭕ Empty |
| L12   | Intelligence Mesh     | 0      | 0       | 0    | ⭕ Empty |
| L13   | Causal Imagination    | 0      | 0       | 0    | ⭕ Empty |
| L14   | Theory of Mind        | 0      | 0       | 0    | ⭕ Empty |
| L15   | Temporal Consciousness| 0      | 0       | 0    | ⭕ Empty |
```

---

#### 🔄 **Panel 3: Feedback Loop Performance**
**Purpose**: Show prediction accuracy over time

**Data Source**:
```sql
SELECT
  DATE(verified_at) as date,
  COUNT(*) as total_predictions,
  SUM(CASE WHEN was_correct THEN 1 ELSE 0 END) as correct_predictions,
  AVG(CASE WHEN was_correct THEN 1.0 ELSE 0.0 END) as accuracy
FROM obs_feedback_loops
WHERE organization_id = $org_id
  AND verified_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(verified_at)
ORDER BY date
```

**Visualization**: Time series line chart
- X-axis: Date
- Y-axis: Accuracy (0-100%)
- Threshold line at 70% (target accuracy)

---

#### 🌙 **Panel 4: Consolidation Runs**
**Purpose**: Track nightly brain sleep performance

**Data Source**:
```sql
SELECT
  started_at,
  status,
  signals_in_window,
  new_relationships,
  edges_strengthened,
  edges_pruned,
  total_duration_ms / 1000 as duration_sec
FROM obs_consolidation_cycles
WHERE organization_id = $org_id
ORDER BY started_at DESC
LIMIT 30
```

**Visualization**: Table + Bar chart
- Table: Last 7 consolidation runs
- Bar chart: Discoveries per run over time

---

#### 💰 **Panel 5: Cost Analysis**
**Purpose**: Track LLM token usage and cost

**Data Source**:
```sql
SELECT
  DATE(created_at) as date,
  SUM(cost_usd) as total_cost,
  SUM(tokens_consumed) as total_tokens
FROM (
  SELECT created_at, cost_usd, tokens_consumed FROM obs_semantic_operations WHERE organization_id = $org_id
  UNION ALL
  SELECT created_at, cost_usd, tokens_consumed FROM obs_agent_executions WHERE organization_id = $org_id
) combined
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date
```

**Visualization**: Stacked bar chart
- X-axis: Date
- Y-axis: Cost ($USD)
- Stacks: Semantic operations vs Agent executions

---

#### ⏱️ **Panel 6: Performance Metrics**
**Purpose**: Track operation latencies across layers

**Data Source** (example for L4):
```sql
SELECT
  calculation_type,
  AVG(calculation_latency_ms) as avg_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY calculation_latency_ms) as p95_latency,
  MAX(calculation_latency_ms) as max_latency,
  COUNT(*) as operation_count
FROM obs_causal_calculations
WHERE organization_id = $org_id
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY calculation_type
```

**Visualization**: Heatmap or table
```
| Operation | Avg Latency | P95 Latency | Max Latency | Count |
|-----------|-------------|-------------|-------------|-------|
| granger   | 1,850ms     | 3,200ms     | 5,400ms     | 123   |
| discovery | 4,200ms     | 7,800ms     | 12,000ms    | 8     |
```

---

#### ❌ **Panel 7: Failures & Errors**
**Purpose**: Track failed operations for troubleshooting

**Data Source**:
```sql
SELECT
  layer_number,
  operation_type,
  COUNT(*) as error_count,
  ARRAY_AGG(DISTINCT error_message) as error_messages
FROM (
  SELECT 6 as layer_number, agent_type as operation_type, error_message
  FROM obs_agent_executions
  WHERE organization_id = $org_id AND status = 'failed'
  UNION ALL
  SELECT 7 as layer_number, connector_type as operation_type, unnest(error_messages) as error_message
  FROM obs_connector_operations
  WHERE organization_id = $org_id AND errors_count > 0
) failures
GROUP BY layer_number, operation_type
ORDER BY error_count DESC
LIMIT 10
```

**Visualization**: Table with drill-down

---

### Dashboard Refresh Rate
- **Default**: 5 minutes
- **On-Demand**: User can manually refresh
- **Auto-refresh**: Every 5 minutes for live monitoring

---

## 2. Core Admin Dashboard

### Purpose
Platform team dashboard showing **ALL organizations aggregated** + core brain health + cross-org comparisons.

### Access Control
- **Admin-only** access via Grafana RBAC
- **No RLS** — queries across all org_ids
- Service role credentials with full access

### Dashboard URL
```
https://nexusbrain.grafana.net/admin/global-brain-health
```

### Dashboard Components

#### 🌍 **Panel 1: Global Brain Health**
**Purpose**: Health across ALL organizations

**Data Source**:
```sql
SELECT
  COUNT(DISTINCT organization_id) as total_orgs,
  AVG(health_score) as avg_health_score,
  SUM(CASE WHEN health_score >= 80 THEN 1 ELSE 0 END) as healthy_orgs,
  SUM(CASE WHEN health_score >= 50 AND health_score < 80 THEN 1 ELSE 0 END) as degraded_orgs,
  SUM(CASE WHEN health_score < 50 THEN 1 ELSE 0 END) as critical_orgs
FROM (
  SELECT DISTINCT ON (organization_id)
    organization_id,
    AVG(health_score) as health_score
  FROM obs_layer_health
  WHERE snapshot_at > NOW() - INTERVAL '24 hours'
  GROUP BY organization_id, snapshot_at
  ORDER BY organization_id, snapshot_at DESC
) latest_per_org
```

**Visualization**: Stat panels
```
┌─────────────┬──────────────┬───────────────┬──────────────┐
│ Total Orgs  │ Avg Health   │ Healthy Orgs  │ Critical Orgs│
│    247      │     82/100   │     201       │      12      │
└─────────────┴──────────────┴───────────────┴──────────────┘
```

---

#### 📊 **Panel 2: Per-Layer Health Across All Orgs**
**Purpose**: See which layers are struggling globally

**Data Source**:
```sql
SELECT
  layer_number,
  layer_name,
  COUNT(DISTINCT organization_id) as orgs_with_data,
  AVG(health_score) as avg_health,
  AVG(record_count) as avg_records,
  SUM(gaps_count) as total_gaps
FROM (
  SELECT DISTINCT ON (organization_id, layer_number)
    organization_id,
    layer_number,
    layer_name,
    health_score,
    gaps_count,
    0 as record_count
  FROM obs_layer_health
  WHERE snapshot_at > NOW() - INTERVAL '24 hours'
  ORDER BY organization_id, layer_number, snapshot_at DESC
) latest
GROUP BY layer_number, layer_name
ORDER BY layer_number
```

**Visualization**: Table
```
| Layer | Name                  | Orgs Active | Avg Health | Total Gaps |
|-------|-----------------------|-------------|------------|------------|
| L1    | Signal Ingestion      | 247         | 92         | 12         |
| L2    | Entity Resolution     | 247         | 89         | 8          |
| L4    | Causal Graph          | 201         | 76         | 152        |
| L8    | Deep Dreaming         | 5           | 68         | 3          |
| L15   | Temporal Consciousness| 2           | 45         | 1          |
```

---

#### 🏆 **Panel 3: Top/Bottom Organizations**
**Purpose**: Identify best and worst performing orgs

**Data Source**:
```sql
-- Top 10 healthiest orgs
SELECT
  organization_id,
  AVG(health_score) as avg_health,
  COUNT(DISTINCT layer_number) as active_layers
FROM (
  SELECT DISTINCT ON (organization_id, layer_number)
    organization_id,
    layer_number,
    health_score
  FROM obs_layer_health
  WHERE snapshot_at > NOW() - INTERVAL '24 hours'
    AND health_score > 0
  ORDER BY organization_id, layer_number, snapshot_at DESC
) latest
GROUP BY organization_id
ORDER BY avg_health DESC
LIMIT 10
```

**Visualization**: Two tables side-by-side
```
TOP 10 ORGS                     BOTTOM 10 ORGS
| Org ID   | Health | Layers   | Org ID   | Health | Layers |
|----------|--------|----------|----------|--------|--------|
| org-001  | 98     | 15/15    | org-142  | 34     | 3/15   |
| org-025  | 96     | 14/15    | org-089  | 42     | 5/15   |
```

---

#### 🔥 **Panel 4: Global Failure Heatmap**
**Purpose**: See where failures are happening across all orgs

**Data Source**:
```sql
SELECT
  layer_number,
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as failure_count
FROM (
  SELECT 6 as layer_number, created_at FROM obs_agent_executions WHERE status = 'failed'
  UNION ALL
  SELECT 7 as layer_number, created_at FROM obs_connector_operations WHERE errors_count > 0
) failures
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY layer_number, hour
ORDER BY hour, layer_number
```

**Visualization**: Heatmap
```
          Mon  Tue  Wed  Thu  Fri  Sat  Sun
L1        ░░░  ░░░  ░░░  ░░░  ░░░  ░░░  ░░░  (0-10 failures)
L2        ░░░  ░░░  ░░░  ░░░  ░░░  ░░░  ░░░
L4        ░░░  ▓▓▓  ▓▓▓  ░░░  ░░░  ░░░  ░░░  (10-50 failures)
L6        ███  ███  ▓▓▓  ▓▓▓  ░░░  ░░░  ░░░  (50+ failures)
L7        ▓▓▓  ▓▓▓  ░░░  ░░░  ░░░  ░░░  ░░░
```

---

#### 💎 **Panel 5: Core Brain Health**
**Purpose**: Monitor the shared core brain (org_id = core)

**Data Source**:
```sql
SELECT
  layer_number,
  layer_name,
  health_score,
  record_count
FROM (
  SELECT DISTINCT ON (layer_number)
    layer_number,
    layer_name,
    health_score,
    0 as record_count
  FROM obs_layer_health
  WHERE organization_id = '00000000-0000-4000-a000-000000000001'  -- Core brain
    AND snapshot_at > NOW() - INTERVAL '24 hours'
  ORDER BY layer_number, snapshot_at DESC
) latest
ORDER BY layer_number
```

**Visualization**: Table with special highlighting
```
CORE BRAIN STATUS
| Layer | Name                  | Health | Records | Status      |
|-------|-----------------------|--------|---------|-------------|
| L1    | Signal Ingestion      | 99     | 125M    | ⭐ Excellent |
| L2    | Entity Resolution     | 98     | 42M     | ⭐ Excellent |
| L4    | Causal Graph          | 95     | 8,456   | ✅ Healthy   |
```

---

#### 💰 **Panel 6: Global Cost Tracking**
**Purpose**: Track total LLM costs across all orgs

**Data Source**:
```sql
SELECT
  DATE(created_at) as date,
  SUM(cost_usd) as total_cost,
  COUNT(DISTINCT organization_id) as orgs_consuming
FROM (
  SELECT created_at, cost_usd, organization_id FROM obs_semantic_operations WHERE cost_usd > 0
  UNION ALL
  SELECT created_at, cost_usd, organization_id FROM obs_agent_executions WHERE cost_usd > 0
) combined
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date
```

**Visualization**: Line chart with cost projection
- Y-axis: Total cost ($USD)
- Trend line: Projected monthly cost

---

#### 🔬 **Panel 7: Feature Adoption**
**Purpose**: Track which cognitive layers orgs are using

**Data Source**:
```sql
SELECT
  layer_number,
  layer_name,
  COUNT(DISTINCT organization_id) as orgs_using,
  ROUND(COUNT(DISTINCT organization_id) * 100.0 / (SELECT COUNT(DISTINCT organization_id) FROM obs_layer_health), 1) as adoption_pct
FROM obs_layer_health
WHERE snapshot_at > NOW() - INTERVAL '7 days'
  AND record_count > 0
GROUP BY layer_number, layer_name
ORDER BY layer_number
```

**Visualization**: Bar chart
```
Adoption Rate by Layer
┌────────────────────────────────────────────┐
│ L1  ██████████████████████████████ 100%    │
│ L2  ██████████████████████████████ 100%    │
│ L3  █████████████████████████████  98%     │
│ L4  ███████████████████████        81%     │
│ L5  ██████████████                 56%     │
│ L6  ████████████████████           74%     │
│ L7  ██████████████████████████     92%     │
│ L8  ██                             2%      │
│ L9  █                              1%      │
│ L10 ░                              0%      │
│ L11-L15 ░                          0%      │
└────────────────────────────────────────────┘
```

---

### Admin Dashboard Refresh Rate
- **Default**: 1 minute (more frequent than per-org)
- **Auto-refresh**: Every 1 minute
- **Alerts**: Real-time PagerDuty integration for critical issues

---

## 3. Implementation Details

### 3.1 Grafana Setup

**Per-Org Dashboards**:
```yaml
# grafana-per-org-template.json
{
  "dashboard": {
    "title": "Brain Health - {{org_name}}",
    "uid": "brain-health-{{org_id}}",
    "templating": {
      "list": [
        {
          "name": "org_id",
          "type": "constant",
          "current": {
            "value": "{{org_id}}"
          }
        }
      ]
    },
    "panels": [
      // 7 panels defined above
    ]
  }
}
```

**Core Admin Dashboard**:
```yaml
# grafana-admin-dashboard.json
{
  "dashboard": {
    "title": "Global Brain Health - Admin",
    "uid": "admin-global-brain",
    "permissions": {
      "role": "Admin"
    },
    "panels": [
      // 7 panels defined above
    ]
  }
}
```

### 3.2 Provisioning System

Create a dashboard provisioner that auto-generates per-org dashboards:

```typescript
// dashboard-provisioner.ts
async function provisionDashboardsForOrg(orgId: string, orgName: string) {
  const template = await fs.readFile('grafana-per-org-template.json', 'utf8');
  const dashboard = template
    .replace(/{{org_id}}/g, orgId)
    .replace(/{{org_name}}/g, orgName);

  await grafanaAPI.createDashboard({
    dashboard: JSON.parse(dashboard),
    folderId: 'org-dashboards',
    overwrite: true,
  });

  console.log(`✅ Provisioned dashboard for ${orgName} (${orgId})`);
}

// Run on org creation
EventBus.on('organization:created', async (org) => {
  await provisionDashboardsForOrg(org.id, org.name);
});
```

### 3.3 Database Connection

**Supabase → Grafana**:
```yaml
# grafana-datasource.yaml
apiVersion: 1
datasources:
  - name: NexusBrain-Supabase
    type: postgres
    url: supabase-db.supabase.co:5432
    database: postgres
    user: grafana_reader
    secureJsonData:
      password: $GRAFANA_DB_PASSWORD
    jsonData:
      sslmode: require
      postgresVersion: 1400  # PostgreSQL 14
      timescaledb: false
```

Create a **read-only Grafana user**:
```sql
CREATE ROLE grafana_reader WITH LOGIN PASSWORD 'secure-password';
GRANT CONNECT ON DATABASE postgres TO grafana_reader;
GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_reader;
```

### 3.4 Alerts & Notifications

**Per-Org Alerts** (sent to org admins):
```yaml
# alert-rules-per-org.yaml
- alert: BrainHealthDegraded
  expr: avg_over_time(health_score[5m]) < 70
  for: 15m
  labels:
    severity: warning
    organization_id: "{{org_id}}"
  annotations:
    summary: "Brain health degraded for {{org_name}}"
    description: "Overall health score dropped below 70"

- alert: LayerEmpty
  expr: record_count == 0 AND gaps_count > 0
  for: 1h
  labels:
    severity: warning
    organization_id: "{{org_id}}"
  annotations:
    summary: "Layer {{layer_name}} has no data"
```

**Admin Alerts** (sent to platform team):
```yaml
# alert-rules-admin.yaml
- alert: GlobalBrainFailureSpike
  expr: rate(failure_count[5m]) > 100
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Global failure rate spiking"
    pagerduty_key: nexusbrain-oncall

- alert: CoreBrainDegraded
  expr: core_brain_health < 80
  for: 10m
  labels:
    severity: critical
  annotations:
    summary: "Core brain health degraded"
```

---

## 4. Deployment Plan

### Phase 1: Foundation (Week 1)
- [ ] Set up Grafana instance (Grafana Cloud or self-hosted)
- [ ] Create read-only database user
- [ ] Configure Supabase datasource in Grafana
- [ ] Deploy core admin dashboard
- [ ] Test queries against production data

### Phase 2: Per-Org Dashboards (Week 2)
- [ ] Create dashboard template JSON
- [ ] Build dashboard provisioning service
- [ ] Provision dashboards for existing orgs (247 orgs)
- [ ] Add dashboard URL to org settings page
- [ ] Test RLS enforcement

### Phase 3: Alerts & Monitoring (Week 3)
- [ ] Configure per-org alert rules
- [ ] Configure admin alert rules
- [ ] Set up PagerDuty integration
- [ ] Set up Slack integration for per-org alerts
- [ ] Test alert delivery

### Phase 4: Optimization & Polish (Week 4)
- [ ] Add caching layer for expensive queries
- [ ] Optimize query performance (materialized views)
- [ ] Add dashboard annotations for consolidation runs
- [ ] Create user documentation
- [ ] Train support team

---

## 5. Cost Estimation

### Grafana Cloud Pricing
- **Free Tier**: 10,000 series, 3 users
- **Pro**: $8/user/month + $0.15/series/month
- **Estimate for 247 orgs**:
  - Series: ~500 per org × 247 = 123,500 series
  - Cost: $18,525/month ($0.15 × 123,500)
  - Users: 10 admins × $8 = $80/month
  - **Total: ~$18,600/month**

### Self-Hosted Alternative
- **Infrastructure**: AWS EC2 + RDS
  - Grafana server: t3.large ($60/month)
  - TimescaleDB for metrics: db.t3.large ($120/month)
  - **Total: ~$180/month** (97% cost savings)

**Recommendation**: Start with **self-hosted** for cost savings, migrate to Grafana Cloud if scaling issues.

---

## 6. Security Considerations

### Per-Org Dashboard Security
1. **RLS Enforcement**: All queries MUST include `WHERE organization_id = $org_id`
2. **No Direct DB Access**: Users access dashboards only, not raw DB
3. **Session Tokens**: Short-lived JWT tokens for Grafana auth
4. **Audit Logging**: Track who viewed which dashboard when

### Admin Dashboard Security
1. **Role-Based Access**: Only platform admins can access
2. **MFA Required**: Multi-factor auth for admin users
3. **IP Whitelist**: Restrict to VPN or office IPs
4. **Audit Logging**: All admin dashboard views logged

---

## Summary

The dual-dashboard architecture provides:

✅ **Per-Org Dashboards**: 247 org-specific dashboards with RLS isolation
✅ **Core Admin Dashboard**: Single global view for platform team
✅ **Complete Coverage**: All 15 layers tracked with health scores
✅ **Cost Optimized**: Self-hosted option saves 97% vs Grafana Cloud
✅ **Secure**: RLS + RBAC + MFA + audit logging
✅ **Automated**: Auto-provision dashboards on org creation

**Next Step**: Implement Phase 1 (Foundation) and deploy core admin dashboard.
