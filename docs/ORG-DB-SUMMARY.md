# Organization Database Quick Reference
**NexusBrain Learning Architecture At-A-Glance**

---

## 🧠 The 4 Jarvis Variants

| Jarvis | Role | Org ID | Data Sources | Maturity |
|--------|------|--------|--------------|----------|
| **Company** | CEO Chief of Staff | `2222...2222` | Slack, HubSpot, Docs, Customers | L3-L4 |
| **Finance** | CFO Intelligence | (synthetic cache) | Xero, Volopay | L2-L3 |
| **Slack** | Comms Intelligence | `2222...2222` | Slack messages, sentiment | L3 |
| **Developer** | Engineering Intel | `jarvis-{repo}` | GitHub, source code | L2 |
| **Core** | Global Federation | `0000...0001` | All org knowledge | L4-L5 |

---

## 📊 Training Evidence

### Company Jarvis
```
✅ 47 causal edges
✅ 23 business rules
✅ 12 cascade rules
✅ 1,847 signals ingested
✅ Full autonomous learning enabled
```

### Finance Jarvis
```
✅ Cash flow forecasting
✅ Runway projections
✅ Burn rate analysis
⚠️ No TrainingPacks yet (opportunity)
```

### Slack Jarvis
```
✅ Self-knowledge packs
✅ Sentiment analysis
✅ Team dynamics tracking
✅ Frustration → churn cascades
```

### Developer Jarvis
```
✅ 132 causal edges (in-memory)
✅ 87 rules
✅ 64 patterns
⚠️ No persistence (Tier 1 only)
```

---

## 🔄 How They Learn

### 1️⃣ Autonomous Learning Cycle (9 Steps)
```
DISCOVER → DETECT → EXTRACT → CONVERT → TRAIN →
VALIDATE → PROMOTE → FEEDBACK → EVALUATE
```
**Runs**: Automatically on signal ingestion
**Location**: `packages/memory-stack/src/learning/autonomous-learner.ts`

### 2️⃣ Continuous Learning (Real-Time)
```
Event arrives → Buffer → Granger test → Update edge weight → Apply decay
```
**Runs**: On every signal
**Location**: `packages/memory-stack/src/causality/continuous-learner.ts`

### 3️⃣ Calibration Feedback Loop
```
Prediction → Deadline → Outcome → Compare → Adjust confidence
```
**Runs**: When predictions resolve
**Location**: `packages/memory-stack/src/orchestrator/calibration-feedback-loop.ts`

### 4️⃣ Federation (Cross-Org)
```
Org discovers pattern → Validate → Approve → Promote to Core → All orgs benefit
```
**Runs**: On high-confidence discoveries (≥0.7)
**Location**: `packages/memory-stack/src/federation/`

---

## 🚀 Quick Start Commands

### Company Jarvis
```bash
# Seed the org + data
npx tsx scripts/seed-company-jarvis.ts

# Query the brain
npx tsx scripts/query-company-jarvis.ts "What should I know about my company?"

# Verify data
npx tsx scripts/seed-company-jarvis.ts --verify
```

### Finance Jarvis
```bash
# Setup (one-time)
npx tsx scripts/setup-finance-jarvis.ts

# Run queries
npx tsx scripts/run-finance-jarvis.ts "What's our runway?"

# Dashboard
open http://localhost:3000/finance-jarvis
```

### Slack Jarvis
```bash
# Generate dataset
npx tsx scripts/slack-jarvis/generate-dataset.ts

# Ingest + train
npx tsx scripts/slack-jarvis/ingest-and-train.ts

# Test copilot
npx tsx scripts/slack-jarvis/copilot-test.ts
```

### Developer Jarvis
```bash
# Interactive CLI
GITHUB_TOKEN=ghp_xxx npx tsx packages/memory-stack/src/demo/developer-jarvis.ts

# Specific repo
npx tsx packages/memory-stack/src/demo/developer-jarvis.ts \
  --token=ghp_xxx \
  --repo=calcom/cal.com
```

---

## 📁 File Locations

### Company Jarvis
- **Library**: `platform/lib/company-jarvis/`
- **Seed**: `scripts/seed-company-jarvis.ts`
- **Query**: `scripts/query-company-jarvis.ts`

### Finance Jarvis
- **Library**: `platform/lib/finance-jarvis/`
- **Setup**: `scripts/setup-finance-jarvis.ts`
- **Runner**: `scripts/run-finance-jarvis.ts`

### Slack Jarvis
- **Scripts**: `scripts/slack-jarvis/`
  - `generate-dataset.ts`
  - `ingest-and-train.ts`
  - `self-knowledge-packs.ts`
  - `copilot-test.ts`

### Developer Jarvis
- **CLI**: `packages/memory-stack/src/demo/developer-jarvis.ts`
- **Graphs**: `packages/memory-stack/src/core/`
  - `knowledge-dependency-graph.ts`
  - `expertise-graph.ts`
  - `collaboration-graph.ts`

### Core Learning
- **Brain Trainer**: `packages/memory-stack/src/learning/brain-trainer.ts`
- **Autonomous Learner**: `packages/memory-stack/src/learning/autonomous-learner.ts`
- **Continuous Learner**: `packages/memory-stack/src/causality/continuous-learner.ts`
- **Calibration Loop**: `packages/memory-stack/src/orchestrator/calibration-feedback-loop.ts`

---

## 🎯 Maturity Levels

| Level | Description | Evidence |
|-------|-------------|----------|
| **L1** Initial | Basic signals, no causal | - |
| **L2** Repeatable | Causal graph exists | Developer Jarvis |
| **L3** Defined | Patterns + rules firing | Company, Slack, Finance (low) |
| **L4** Managed | Active anomaly + cascades | Company Jarvis (high) |
| **L5** Optimizing | Autonomous + high accuracy | Core Brain |

---

## 🔧 Immediate Opportunities

### 1. Separate Slack Jarvis Org ID
**Current**: Shares `2222...2222` with Company Jarvis
**Target**: Dedicated org ID for Slack-only data

### 2. Finance TrainingPacks
**Current**: Analysis only, no causal training
**Target**: Export cash flow → causal chains → Core Brain

### 3. Developer Jarvis Persistence
**Current**: In-memory only (Tier 1)
**Target**: Add org DB option for persistent learning

### 4. Maturity Dashboard
**Current**: No UI for learning velocity
**Target**: Charts showing discoveries/week, prediction accuracy

### 5. Auto-Federation
**Current**: Manual promotion only
**Target**: Auto-promote high-confidence patterns to Core

---

## 📈 Key Metrics to Track

### Per Org
- **Causal edges**: Count, diversity, significance
- **Patterns detected**: Frequency, validation rate
- **Rules firing**: Activation rate, accuracy
- **Predictions**: Total, resolved, accuracy
- **Anomalies**: Detected, severity distribution
- **Learning velocity**: Discoveries per week

### Federation
- **Patterns promoted**: Count, approval score
- **Cross-org applicability**: How many orgs benefit
- **Core Brain growth**: Edges, rules, patterns added
- **Conflict rate**: Rejected promotions

---

## 🧪 Testing Queries

### Company Jarvis
```
"What are the top 3 things I should know right now?"
"Why is Taiwan pipeline stalled?"
"Which teams are frustrated?"
"What's the churn risk for Enterprise customers?"
```

### Finance Jarvis
```
"What's our runway at current burn?"
"Which departments are overspending?"
"Show me cash flow forecast for next 90 days"
"What's our CAC payback period?"
```

### Slack Jarvis
```
"What's the team sentiment in #engineering?"
"Which topics are causing frustration?"
"Is there tension between sales and product?"
```

### Developer Jarvis
```
"How does auth work?"
"What breaks if I change utils.ts?"
"Who knows about the payment system?"
"Show me the bus factor"
"What's the engineering cascade?"
```

---

## 🎓 Key Concepts

### TrainingPack
Structured business knowledge the brain learns from:
- **Causal chains**: X → Y (effect size, lag)
- **Rules**: When conditions → then actions
- **Cascades**: Domain ripple effects
- **Patterns**: Statistical evidence
- **Outcomes**: Prediction/actual pairs

### Causal Edge
A discovered relationship between domains:
- **Source domain**: Where cause originates
- **Target domain**: What gets affected
- **Effect size**: Magnitude (-1 to +1)
- **Lag days**: Time delay for effect
- **p-value**: Statistical significance
- **Knockout score**: Counterfactual evidence

### Calibration
How well the brain's confidence matches reality:
- **Brier score**: Overall accuracy (0 = perfect)
- **ECE**: Confidence vs. actual accuracy gap
- **Calibration bias**: Over/under confident

### Federation
Cross-org knowledge sharing:
- Org discovers pattern → validate → approve → promote to Core
- All orgs benefit from federated knowledge
- No single org's noise pollutes others

---

**Last Updated**: 2026-02-14
**Full Report**: See `docs/ORG-DB-EVALUATION.md`
