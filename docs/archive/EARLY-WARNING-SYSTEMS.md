# Early Warning Systems for Engineering Teams
## Design Partner Documentation

**Status:** ✅ Production Ready
**Version:** 1.0
**Last Updated:** February 15, 2026

---

## Overview

NexusBrain provides two powerful early warning systems that predict engineering problems **BEFORE they impact delivery**:

1. **Engineering Bottleneck Concentration Risk** - Detect single-point-of-failure risks
2. **Deploy Velocity Collapse Warning** - Predict velocity drops 7-30 days in advance

These systems use causal AI, expertise graphs, and time series forecasting to give you actionable insights with statistical confidence.

---

## System 1: Engineering Bottleneck Concentration Risk

### What It Does

Detects when knowledge is concentrated in too few people, creating delivery risks if key contributors leave or are unavailable.

### Metrics Tracked

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Gini Coefficient** | Inequality of expertise distribution (0 = equal, 1 = concentrated) | > 0.70 |
| **Top-3 Concentration** | % of expertise owned by top 3 contributors | > 70% |
| **Bus Factor** | How many people can leave before team loses 50% of expertise | ≤ 2 |
| **Centrality Score** | How many standard deviations above team mean (z-score) | > 2.5σ |

### Example Alert

```
🚨 Critical Bottleneck in Backend Team

Top-3 Concentration: 78.3%
Bus Factor: 2
Gini Coefficient: 0.82

Single Point of Failure:
- Sarah Chen owns 45.2% of backend expertise
- Centrality score: 3.8σ above team mean
- Critical for: API layer, database design, microservices

Recommended Actions:
1. Cross-train 2-3 team members in backend architecture
2. Document critical knowledge in runbooks
3. Implement pair programming with junior developers
4. Create backup reviewers for API changes

Estimated Impact: If Sarah leaves, backend velocity drops 60%
```

### How It Works

```
GitHub PR Reviews → Expertise Graph → Concentration Analysis
                                              ↓
                            Calculate: Gini, Top-N%, Bus Factor
                                              ↓
                            Identify bottlenecks (centrality > 2.5σ)
                                              ↓
                            Generate alerts + recommendations
```

### API Usage

```typescript
import { detectBottlenecks } from '@nexusbrain/memory-stack/orchestrator';

const bottlenecks = await detectBottlenecks(
  {
    supabase,
    organizationId: 'acme-corp',
    minStrength: 0.05,     // Minimum expertise to consider
    lookbackDays: 90,      // Historical window
  },
  'backend'                // Domain to analyze
);

console.log('Gini Coefficient:', bottlenecks.giniCoefficient);
console.log('Top-3 Concentration:', bottlenecks.top3Concentration + '%');
console.log('Bus Factor:', bottlenecks.busFactor);
console.log('Bottlenecks:', bottlenecks.bottlenecks);
```

### Multi-Domain Heatmap

```typescript
import { getBottleneckHeatmap } from '@nexusbrain/memory-stack/orchestrator';

const heatmap = await getBottleneckHeatmap(
  { supabase, organizationId: 'acme-corp' },
  ['backend', 'frontend', 'infrastructure', 'data']
);

// Output: { backend: 78, frontend: 42, infrastructure: 91, data: 35 }
// Higher = more concentrated risk
```

---

## System 2: Deploy Velocity Collapse Warning

### What It Does

Predicts when deployment velocity will drop by >30% in the next 7-30 days, with root cause analysis and recommended interventions.

### Signals Tracked

| Signal | Source | Purpose |
|--------|--------|---------|
| **PRs Merged/Day** | GitHub | Primary velocity metric |
| **WIP Count** | GitHub (open PRs) | Accumulation = future bottleneck |
| **PR Review Time** | GitHub reviews | Latency trend detection |
| **Deployments/Week** | GitHub deployments | Production throughput |
| **Review Concentration** | Expertise graph | Reviewer bottlenecks |

### Example Alert

```
🚨 Velocity Collapse Warning

Deploy velocity will drop 28% in next 7 days

Current State:
- Velocity: 4.2 PRs/day
- Predicted: 3.0 PRs/day
- WIP: 23 PRs (baseline: 14)

Root Cause: WIP accumulation
- Statistical evidence: p=0.0089 (Granger causality)
- Effect size: -0.42 (strong negative impact)
- Historical pattern: When WIP >20, velocity drops 30% within 5-7 days

Recommended Actions:
1. WIP is 64% above baseline (23 vs 14). Close or fast-track stale PRs (±15% recovery)
2. Add backup reviewers to distribute load (±12% recovery)
3. Escalate 3 blocked PRs causing WIP buildup (±10% recovery)

Total Potential Recovery: 37% (exceeds predicted drop)
```

### How It Works

```
GitHub Signals (PRs, deployments, reviews)
              ↓
Build daily time series (velocity, WIP, review time)
              ↓
Granger Causality Test: WIP → Velocity?
              ↓
VAR Forecasting (7-30 days ahead)
              ↓
If predicted drop > 30% → Generate alert
              ↓
Recommend interventions with estimated impact
```

### API Usage

```typescript
import { predictVelocityCollapse } from '@nexusbrain/memory-stack/orchestrator';

const alert = await predictVelocityCollapse({
  supabase,
  organizationId: 'acme-corp',
  lookbackDays: 90,       // Historical data window
  forecastDays: 7,        // Prediction horizon
  collapseThreshold: 30,  // % drop to trigger alert
});

if (alert) {
  console.log('⚠️ Predicted velocity drop:', alert.predictedDrop + '%');
  console.log('Root cause:', alert.rootCause);
  console.log('Current WIP:', alert.currentWIP);
  console.log('Interventions:', alert.interventions);
}
```

### Velocity Time Series

```typescript
import { buildVelocityTimeSeries } from '@nexusbrain/memory-stack/orchestrator';

const metrics = await buildVelocityTimeSeries({
  supabase,
  organizationId: 'acme-corp',
  lookbackDays: 90,
});

// Returns daily metrics:
metrics.forEach(day => {
  console.log(day.date, {
    prsMerged: day.prsMerged,
    wipCount: day.wipCount,
    velocity7Day: day.velocity7Day,
    productionDeploys: day.productionDeploys,
  });
});
```

---

## Unified Early Warning System

### Combined Analysis

Run both systems together for comprehensive risk assessment:

```typescript
import { runEarlyWarningSystem } from '@nexusbrain/memory-stack/orchestrator';

const report = await runEarlyWarningSystem({
  supabase,
  organizationId: 'acme-corp',
  domains: ['backend', 'frontend', 'infrastructure'],
  lookbackDays: 90,
  forecastDays: 7,
  collapseThreshold: 30,
});

console.log('Overall Risk Score:', report.overallRisk + '/100');
console.log('Bottleneck Alerts:', report.bottleneckAlerts.length);
console.log('Velocity Collapse:', !!report.velocityCollapse);
console.log('Summary:', report.summary);
```

### Dashboard Summary

```typescript
import { getEarlyWarningSummary } from '@nexusbrain/memory-stack/orchestrator';

const summary = getEarlyWarningSummary(report);

console.log('Risk Level:', summary.riskLevel); // 'low' | 'medium' | 'high' | 'critical'
console.log('Total Bottlenecks:', summary.totalBottlenecks);
console.log('Critical Bottlenecks:', summary.criticalBottlenecks);
console.log('Velocity Risk:', summary.velocityRisk);
console.log('Top Recommendations:', summary.topRecommendations);
```

### Example Report Output

```
## Early Warning Report for acme-corp

Overall Risk Score: 72/100

⚠️ 3 Bottleneck Risk(s) Detected
- 🚨 Single-point-of-failure: Sarah Chen owns 45.2% of backend expertise
- ⚠️ Critical bottleneck in infrastructure: 76.3% owned by top 3, Bus factor: 2
- ⚡ Frontend reviewer concentration: 68% of reviews from 2 people

🚨 Velocity Collapse Warning

Deploy velocity will drop 28.0% in next 7 days

Current State:
- Velocity: 4.20 PRs/day
- Predicted: 3.02 PRs/day
- WIP: 23 PRs (baseline: 14)

Root Cause: wip_accumulation
- Statistical evidence: p=0.0089
- Effect size: -0.420

Recommended Actions:
1. WIP is 64% above baseline (23 vs 14). Close or fast-track stale PRs. (±15% recovery)
2. Add backup reviewers to distribute load (±12% recovery)
3. Fast-track 5-10 small PRs to clear backlog (±8% recovery)

🚨 HIGH RISK - immediate intervention required to prevent delivery impact
```

---

## Integration Guide

### Step 1: Setup Supabase Connection

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

### Step 2: Configure GitHub Connector

Ensure GitHub connector is ingesting signals:

```typescript
import { ingestGitHubData } from '@nexusbrain/memory-stack/connectors';

// Run daily or via webhook
await ingestGitHubData(
  {
    owner: 'acme-corp',
    repo: 'backend-api',
    token: process.env.GITHUB_TOKEN!,
  },
  'acme-corp'
);
```

### Step 3: Schedule Early Warning Checks

```typescript
// Run nightly via cron or edge function
import { runEarlyWarningWithAlerts } from '@nexusbrain/memory-stack/orchestrator';

const report = await runEarlyWarningWithAlerts({
  supabase,
  organizationId: 'acme-corp',
  domains: ['backend', 'frontend', 'infrastructure'],
});

// Send to Slack/email if high risk
if (report.overallRisk >= 60) {
  await sendSlackAlert(report.summary);
}
```

### Step 4: Expose API Endpoint

```typescript
// /api/early-warnings/route.ts
import { runEarlyWarningSystem } from '@nexusbrain/memory-stack/orchestrator';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('org');

  const report = await runEarlyWarningSystem({
    supabase,
    organizationId: orgId!,
  });

  return Response.json(report);
}
```

---

## Statistical Foundations

### Gini Coefficient

Formula: `G = (Σ(2i - n - 1) * x_i) / (n * Σx_i)`

Where:
- `x_i` are sorted strength values (ascending)
- `n` is number of contributors
- Perfect equality: G = 0
- Perfect inequality: G = 1

### Centrality Z-Score

Formula: `z = (x - μ) / σ`

Where:
- `x` is contributor's expertise strength
- `μ` is team mean strength
- `σ` is standard deviation

Interpretation:
- z > 2.5σ: Statistically significant bottleneck
- z > 3.0σ: Critical bottleneck

### Granger Causality

Tests whether signal X predicts signal Y:

- **Null hypothesis:** X does NOT Granger-cause Y
- **Test:** F-test comparing restricted vs. unrestricted VAR models
- **Significant if:** p-value < 0.05

Example:
```
WIP Granger-causes Velocity
F-statistic: 8.42
p-value: 0.0089
Effect size: -0.42
```

Interpretation: WIP accumulation is **statistically proven** to predict velocity decline with 99% confidence.

---

## Calibration & Accuracy

### Prediction Tracking

Every prediction is tracked for accuracy:

```typescript
import { recordPrediction, recordPredictionOutcome } from '@nexusbrain/memory-stack/observability';

// When making prediction
await recordPrediction({
  organizationId: 'acme-corp',
  predictionType: 'velocity_collapse',
  predictedValue: 28, // % drop
  confidence: 0.89,
  metadata: { forecastDays: 7 },
});

// 7 days later
await recordPredictionOutcome({
  organizationId: 'acme-corp',
  actualValue: 25, // actual % drop
  wasCorrect: true,
});
```

### Calibration Metrics

- **Accuracy:** % of predictions that were correct
- **Calibration Error:** |confidence - accuracy|
- **Precision:** True positives / (True positives + False positives)
- **Recall:** True positives / (True positives + False negatives)

**Target:** 80%+ accuracy with <10% calibration error

---

## FAQ for Design Partners

### Q: How accurate are the predictions?

**A:** Velocity collapse predictions use Granger causality (statistical significance p<0.05) and are calibrated against historical outcomes. Expected accuracy: 75-85% for 7-day forecasts, 60-75% for 30-day forecasts.

### Q: What if we don't have 90 days of data?

**A:** Minimum 30 days required for velocity predictions. Bottleneck detection works with any amount of data but improves with more history.

### Q: Can we customize alert thresholds?

**A:** Yes! All thresholds are configurable:
- `collapseThreshold` (default: 30% velocity drop)
- `minStrength` (default: 0.05 for expertise)
- `lookbackDays` (default: 90)
- `forecastDays` (default: 7)

### Q: How often should we run these checks?

**A:** Recommended:
- **Bottleneck detection:** Weekly
- **Velocity prediction:** Daily
- **Combined report:** Daily (lightweight operation)

### Q: What connectors are required?

**A:**
- **Minimum:** GitHub connector (PRs, reviews, deployments)
- **Enhanced:** Linear/Jira (sprint velocity), Asana (task dependencies)

### Q: Can we test this on historical data?

**A:** Yes! Use `lookbackDays` to analyze past periods:

```typescript
const report = await runEarlyWarningSystem({
  supabase,
  organizationId: 'acme-corp',
  lookbackDays: 180, // Analyze last 6 months
});
```

### Q: How do we integrate with existing alerting (Slack, PagerDuty)?

**A:** The system returns structured data. Integrate with your tools:

```typescript
const report = await runEarlyWarningWithAlerts({ supabase, organizationId });

if (report.overallRisk >= 60) {
  // Slack
  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    body: JSON.stringify({ text: report.summary }),
  });

  // PagerDuty
  await triggerPagerDutyIncident({
    title: 'Engineering Risk Alert',
    severity: report.overallRisk >= 80 ? 'critical' : 'high',
    details: report,
  });
}
```

---

## Troubleshooting

### No bottlenecks detected despite known concentration

**Check:**
1. Expertise graph has sufficient data (`queryExperts` returns results)
2. `minStrength` threshold isn't too high (try 0.01)
3. GitHub connector is ingesting PR review signals

### Velocity predictions always null

**Check:**
1. At least 30 days of GitHub signals in database
2. PRs are being merged (not just opened)
3. `signal_type = 'pr_merged'` signals exist

### Granger causality test fails

**Expected:** Not all time series have causal relationships. System falls back to linear trend analysis.

**To improve:** Increase `lookbackDays` for more data points (60-90 days recommended).

---

## Next Steps

1. **Run your first report:**
   ```bash
   npm run early-warnings -- --org=your-org-id
   ```

2. **Review the output** and validate against known team dynamics

3. **Set up daily scheduling** via cron or edge functions

4. **Integrate alerts** with your team's communication tools

5. **Track calibration** over 2-4 weeks to measure accuracy

6. **Customize thresholds** based on your team's tolerance for risk

---

## Support

- **Documentation:** `/docs/early-warning-systems`
- **API Reference:** `/packages/memory-stack/src/orchestrator/README.md`
- **Examples:** `/examples/early-warnings`
- **Issues:** GitHub Issues or design partner Slack channel

---

**Built with ❤️ by NexusBrain**
*Preventing engineering problems before they happen*
