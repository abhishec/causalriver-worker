# Org Creation Agent — Complete Guide
**The Brain That Builds Brains**

---

## 🎯 Overview

The **Org Creation Agent** is a meta-agent that creates fully-wired, production-ready organization databases with ALL 93+ brain subsystems connected, autonomous learning enabled, Core Brain federation, and copilot ready.

**Key Features**:
- ✅ 100% brain connectivity (93+ systems)
- ✅ Core Brain federation (receives global knowledge)
- ✅ Autonomous learning (9-step cycle every 6 hours)
- ✅ Continuous learning (real-time graph updates)
- ✅ Calibration feedback loop (prediction→outcome→recalibration)
- ✅ Motor command engine (executable domain actions)
- ✅ Growth mechanisms (scheduled consolidation, calibration reviews)
- ✅ CTO-level health verification with scorecard
- ✅ Can create new orgs OR fix existing orgs

---

## 🚀 Quick Start

### Create New Organization

#### Interactive Mode (Recommended for First Time)
```bash
npx tsx scripts/run-org-agent.ts create
```

You'll be prompted for:
- Organization name (e.g., "Sales Intelligence")
- URL slug (e.g., "sales-intel")
- Industry (e.g., "SaaS", "E-commerce")
- Primary use case (e.g., "Sales forecasting", "Finance tracking")
- Connectors (e.g., "hubspot,slack,stripe")
- Autonomous learning (Y/n)
- ECS schedule (optional)

#### Command-Line Mode (Automated)
```bash
npx tsx scripts/run-org-agent.ts create \
  --name="Sales Intelligence" \
  --slug="sales-intel" \
  --industry="SaaS" \
  --purpose="Sales forecasting and pipeline intelligence" \
  --connectors="hubspot,stripe,slack" \
  --schedule="0 2 * * *"
```

### Fix Existing Organization

#### Fix Specific Org
```bash
npx tsx scripts/run-org-agent.ts fix \
  --org-id="22222222-2222-4000-a000-222222222222" \
  --reinit-brain \
  --reset-learning \
  --rebuild-graph \
  --recalibrate \
  --full-audit
```

#### Fix All Jarvis Orgs
```bash
npx tsx scripts/run-org-agent.ts fix-all-jarvis
```

This will automatically fix:
- Company Jarvis (`22222222-2222-4000-a000-222222222222`)
- Slack Jarvis (if dedicated org ID)
- Finance Jarvis (if dedicated org ID)
- Developer Jarvis (if persistent org ID)

---

## 📊 What Gets Created

### Step-by-Step Process

#### **Step 1: Create Organization Record**
- Inserts into `organizations` table
- Sets `plan`, `industry`, `purpose`, `settings`
- Generates unique org ID if not provided

#### **Step 2: Initialize ALL Brain Regions (93+ Systems)**
Uses `comprehensive-brain-init.ts` to wire:
- **Learning Systems (29)**: Bayesian Updater, Embedding Tuner, Contrastive Learner, Autonomous Learner, Brain Trainer, etc.
- **Orchestration Systems (42)**: Consolidation Engine, DMN, Impact Scorer, Attention Manager, Motor Commands, Calibration Loop, etc.
- **Causality Systems (36)**: Causal Graph Builder, Counterfactual Engine, Domain Transfer Learner, Temporal Forecaster, etc.
- **Persistence Systems (5)**: Supabase Repository, Cost Tracker, etc.
- **Bridge Systems (9)**: Patterns→Agents, Outcome→Feedback, EventBus→Causal, etc.
- **Core Infrastructure (20+)**: Embedding Engine, Semantic Search, Entity Resolution, Expertise Graph, etc.
- **Connectors (19)**: Slack, GitHub, HubSpot, Stripe, etc.

**Target**: >90% (>84/93 systems initialized)

#### **Step 3: Enable Autonomous Learning**
Creates `createAutonomousLearner` instance with:
- 9-step learning cycle:
  1. Discover (causal discovery)
  2. Detect (anomaly detection)
  3. Extract (pattern detection)
  4. Convert (to TrainingPacks)
  5. Train (brain trainer)
  6. Validate (significance tests)
  7. Promote (patterns→rules)
  8. Feedback (calibration)
  9. Evaluate (maturity)
- Config:
  - `autoPromoteConfidence`: 0.7
  - `minPatternObservations`: 5
  - `evaluateMaturity`: true
  - `lookbackDays`: 90

#### **Step 4: Enable Continuous Learning**
Creates `createContinuousLearner` instance with:
- Real-time graph updates (not batch)
- Accuracy-weighted decay (slower decay for high-performing edges)
- Config:
  - `minEventsForUpdate`: 100
  - `evidenceDecayFactor`: 0.95
  - `edgeRemovalThreshold`: 0.1 (p-value)
  - `edgeAdditionThreshold`: 0.05
  - `accuracyDecayThreshold`: 0.6
  - `accuracyDecayReduction`: 0.5 (50% slower decay)

#### **Step 5: Enable Calibration Feedback Loop**
Creates `createCalibrationFeedbackLoop` instance with:
- Prediction→Outcome matching
- Brier score calculation
- Expected Calibration Error (ECE)
- Calibration bias detection (over/under confident)
- Recalibration adjustments per domain

#### **Step 6: Enable Core Brain Federation** ⭐ **NEW**
- Verifies Core Brain org exists (`00000000-0000-4000-a000-000000000001`)
- Creates `federation_config` entry
- Pulls initial knowledge from Core Brain using `createUpstreamPromoter`
- Configures:
  - `auto_pull_enabled`: true
  - `auto_promote_confidence`: 0.75
  - `pull_frequency_hours`: 24
- **CRITICAL**: Without this, org won't receive global intelligence from Core Brain

#### **Step 7: Register Motor Commands**
Creates `createMotorCommandEngine` instance and registers default commands based on connectors:
- HubSpot: `hubspot.update_deal_stage`
- Slack: `slack.post_message`
- Stripe: `stripe.create_invoice`
- GitHub: `github.create_issue`
- etc.

#### **Step 8: 100% Brain Connectivity Audit** ⭐ **NEW**
Verifies ALL critical systems are wired:
- ✅ Autonomous Learner
- ✅ Continuous Learner
- ✅ Calibration Loop
- ✅ Motor Engine
- ✅ Brain Trainer
- ✅ Causal Graph Builder
- ✅ Event Bus
- ✅ Impact Scorer
- ✅ Attention Manager
- ✅ Context Manager
- ✅ Domain Action Engine
- ✅ Consolidation Engine
- ✅ Background Insight Engine (DMN)

Flags issues as warnings if any system is missing.

#### **Step 9: Configure Connectors**
For each connector in request:
- Inserts into `org_connectors` table
- Sets `status`: 'pending_auth' (requires OAuth/API key setup)
- Stores `config`, `signals_count`

#### **Step 10: Seed Initial Training Data** (if provided)
- Inserts signals via `storeConnectorSignals`
- Trains brain via `createBrainTrainer` with provided TrainingPacks

#### **Step 11: Enable Brain Growth Mechanisms** ⭐ **NEW**
Schedules ongoing brain improvement:
- **Autonomous Learning**: Every 6 hours (`0 */6 * * *`)
  - Runs 9-step cycle automatically
- **Consolidation**: Weekly on Sunday 2 AM UTC (`0 2 * * 0`)
  - Prunes weak edges, consolidates patterns
- **Calibration Review**: Weekly on Monday 3 AM UTC (`0 3 * * 1`)
  - Reviews prediction accuracy, recalibrates
- **Real-Time Signal Processing**: Enabled
  - Processes signals as they arrive (batch size: 100)

All stored in `scheduled_jobs` table.

#### **Step 12: Register to Agent Network**
- Creates dedicated training agent for this org
- Agent name: `{slug}-agent` (e.g., `sales-intel-agent`)
- Registered to global agent registry

#### **Step 13: Setup ECS Runner** (if schedule provided)
- Inserts into `scheduled_agents` table
- Configures CPU/memory requirements
- Sets ECS schedule (cron format)

#### **Step 14: CTO Final Sign-Off - Brain Connectivity Scorecard** ⭐ **NEW**

Calculates weighted score:

| Component | Weight | Criteria |
|-----------|--------|----------|
| Brain Regions | 30% | `brainRegionsInitialized / 93 * 30` |
| Autonomous Learning | 20% | Enabled = 20, Disabled = 0 |
| Continuous Learning | 20% | Enabled = 20, Disabled = 0 |
| Calibration Loop | 15% | Enabled = 15, Disabled = 0 |
| Core Brain Federation | 15% | Enabled = 15, Disabled = 0 |

**CTO Verdict**:
- **≥90**: 🎉 **APPROVED** — Brain is production-ready
- **70-89**: ⚠️ **CONDITIONAL** — Brain operational but needs fixes
- **<70**: ❌ **REJECTED** — Brain not ready for production

**Sample Output**:
```
Brain Connectivity Scorecard: 95/100
  ├─ Brain Regions (30%):         27.4/30
  ├─ Autonomous Learning (20%):   20/20
  ├─ Continuous Learning (20%):   20/20
  ├─ Calibration Loop (15%):      15/15
  └─ Core Brain Federation (15%): 15/15

🎉 CTO SIGN-OFF: APPROVED — Brain is production-ready
```

#### **Step 15: Next Steps & Documentation**
Provides:
- Copilot query command
- Dashboard URL
- Connector authentication instructions
- Agent run commands

---

## 🔧 Fix Mode

The agent can also **repair existing orgs** with multiple fix options:

### Fix Options

| Flag | What It Does |
|------|--------------|
| `--reinit-brain` | Reinitialize all 93+ brain regions |
| `--reset-learning` | Reset autonomous learning (clear state, restart) |
| `--rebuild-graph` | Delete and rebuild causal graph from signals |
| `--recalibrate` | Recalculate prediction accuracy, update calibration |
| `--reconnect-connectors` | Reset connectors to 'pending_auth' for re-OAuth |
| `--full-audit` | Run comprehensive health audit on all tables |

### Example Fix Commands

#### Fix Company Jarvis
```bash
npx tsx scripts/run-org-agent.ts fix \
  --org-id="22222222-2222-4000-a000-222222222222" \
  --reinit-brain \
  --recalibrate \
  --full-audit
```

#### Fix Broken Causal Graph
```bash
npx tsx scripts/run-org-agent.ts fix \
  --org-id="22222222-2222-4000-a000-222222222222" \
  --rebuild-graph
```

#### Reconnect All Connectors
```bash
npx tsx scripts/run-org-agent.ts fix \
  --org-id="22222222-2222-4000-a000-222222222222" \
  --reconnect-connectors
```

---

## 📋 Command-Line Flags

### Create Flags

| Flag | Required | Description | Example |
|------|----------|-------------|---------|
| `--name` | Yes* | Organization name | `"Sales Intelligence"` |
| `--slug` | Yes* | URL slug | `"sales-intel"` |
| `--industry` | No | Industry/vertical | `"SaaS"` |
| `--purpose` | No | Primary use case | `"Sales forecasting"` |
| `--connectors` | Yes* | Comma-separated connectors | `"hubspot,slack,stripe"` |
| `--schedule` | No | ECS cron schedule | `"0 2 * * 0"` |
| `--cpu` | No | ECS CPU units | `"2048"` (2 vCPU) |
| `--memory` | No | ECS memory MB | `"8192"` (8 GB) |
| `--no-autonomous-learning` | No | Disable autonomous learning | (flag only) |

*Required only if not using interactive mode

### Fix Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--org-id` | Yes | Organization ID to fix |
| `--reinit-brain` | No | Reinitialize brain regions |
| `--reset-learning` | No | Reset autonomous learning |
| `--rebuild-graph` | No | Rebuild causal graph |
| `--recalibrate` | No | Recalibrate accuracy |
| `--reconnect-connectors` | No | Reset connector auth |
| `--full-audit` | No | Run health audit |

---

## 🔌 Supported Connectors

### **Data Sources**
- `slack` - Team communication
- `hubspot` - CRM (deals, contacts, companies)
- `github` - Code, PRs, issues, CI/CD
- `stripe` - Payments, subscriptions
- `xero` - Accounting, invoices
- `volopay` - Corporate cards, expenses
- `google-docs` - Internal documents
- `jira` - Project management, issues
- `pagerduty` - Incident management
- `linear` - Issue tracking
- `notion` - Knowledge base
- `intercom` - Customer support chat
- `zendesk` - Support tickets
- `salesforce` - CRM (enterprise)

### **Databases** (direct connectors)
- `postgresql` - SQL database
- `mongodb` - NoSQL database

### **Custom**
- `rest-api` - Generic REST API connector

---

## 📊 Expected Output

### Successful Creation

```
═══════════════════════════════════════════════════════════════
  CREATING ORGANIZATION: Sales Intelligence
═══════════════════════════════════════════════════════════════

CREATE: Org ID: 12345678-1234-4000-a000-123456789012
CREATE: ✓ Organization "Sales Intelligence" created

INITIALIZING COMPREHENSIVE BRAIN (93+ SYSTEMS)
BRAIN: ✓ 91 brain systems initialized
BRAIN:   Learning: 28
BRAIN:   Orchestration: 40
BRAIN:   Causality: 34
BRAIN:   Persistence: 5
BRAIN:   Bridges: 9
BRAIN:   Core Infrastructure: 18
BRAIN:   Connectors: 15

ENABLING AUTONOMOUS LEARNING
LEARN: ✓ Autonomous learner initialized
LEARN:   9-Step Cycle: Discover → Detect → Extract → Convert → Train → Validate → Promote → Feedback → Evaluate

ENABLING CONTINUOUS LEARNING
LEARN: ✓ Continuous learner initialized
LEARN:   Real-time graph updates enabled
LEARN:   Accuracy-weighted decay enabled

ENABLING CALIBRATION FEEDBACK LOOP
CALIBRATION: ✓ Calibration loop initialized
CALIBRATION:   Prediction → Outcome → Recalibration
CALIBRATION:   Brier score + ECE tracking enabled

ENABLING CORE BRAIN FEDERATION
FEDERATION: ✓ Federation enabled with Core Brain
FEDERATION:   Pulled: 47 patterns, 132 causal edges
FEDERATION:   Auto-pull: every 24 hours
FEDERATION:   Auto-promote threshold: 0.75 confidence

REGISTERING MOTOR COMMANDS
MOTOR: ✓ 3 motor commands registered

CTO AUDIT: 100% BRAIN CONNECTIVITY CHECK
AUDIT: Critical Systems Check: 13/13 wired
AUDIT: Brain Regions: 97.8% initialized (91/93)
AUDIT: ✅ 100% BRAIN CONNECTIVITY VERIFIED

CONFIGURING CONNECTORS
CONNECTOR: ✓ hubspot configured
CONNECTOR: ✓ slack configured
CONNECTOR: ✓ stripe configured

ENABLING BRAIN GROWTH MECHANISMS
GROWTH: ✓ Autonomous learning scheduled (every 6 hours)
GROWTH: ✓ Consolidation scheduled (weekly)
GROWTH: ✓ Calibration review scheduled (weekly)
GROWTH: ✓ Real-time signal processing enabled

FINAL CTO SIGN-OFF: COMPREHENSIVE HEALTH CHECK
HEALTH: Overall Status: HEALTHY
HEALTH:   - All systems operational

HEALTH: Brain Connectivity Scorecard: 97/100
HEALTH:   ├─ Brain Regions (30%):         29.3/30
HEALTH:   ├─ Autonomous Learning (20%):   20/20
HEALTH:   ├─ Continuous Learning (20%):   20/20
HEALTH:   ├─ Calibration Loop (15%):      15/15
HEALTH:   └─ Core Brain Federation (15%): 15/15

HEALTH: 🎉 CTO SIGN-OFF: APPROVED — Brain is production-ready

NEXT STEPS & DOCUMENTATION
NEXT:   - Query copilot: npx tsx scripts/query-org.ts 12345678-1234-4000-a000-123456789012 "What should I know?"
NEXT:   - View dashboard: http://localhost:3000/orgs/sales-intel
NEXT:   - Authenticate connectors: hubspot, slack, stripe
NEXT:   - Run autonomous learning: npx tsx scripts/run-autonomous-learning.ts 12345678-1234-4000-a000-123456789012

COMPLETE: Organization created in 12.3s

═══════════════════════════════════════════════════════════════
  ✅ ORG CREATION COMPLETE
═══════════════════════════════════════════════════════════════

Organization: Sales Intelligence
Org ID:       12345678-1234-4000-a000-123456789012
Brain Systems: 91/93+
Autonomous Learning: ✓
Continuous Learning: ✓
Calibration Loop: ✓
Motor Commands: 3
Connectors: hubspot, slack, stripe
Copilot Ready: ✓
Health: HEALTHY
```

---

## 🏥 Health Status Meanings

| Status | Score Range | Meaning |
|--------|-------------|---------|
| **healthy** | 90-100 | All systems operational, production-ready |
| **degraded** | 70-89 | Operational but with warnings, may need fixes |
| **critical** | 0-69 | Not production-ready, immediate action required |

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Brain regions <90% | System initialization failures | Check logs, retry with `--reinit-brain` |
| Autonomous learning disabled | Config set to `false` | Recreate with `enableAutonomousLearning: true` |
| Federation not enabled | Core Brain not found | Seed Core Brain first via `scripts/seed-core-brain.ts` |
| Connectivity issues | Missing brain systems | Run `--reinit-brain` fix |

---

## 🔄 Workflow Examples

### Example 1: Create Sales Intelligence Org

```bash
# Interactive creation
npx tsx scripts/run-org-agent.ts create

# Prompts:
Organization name: Sales Intelligence
URL slug: sales-intel
Industry: SaaS
Primary use case: Sales forecasting and pipeline intelligence
Connectors: hubspot,slack,stripe
Enable autonomous learning? Y
ECS schedule: 0 2 * * *

# Result: Org created with ID, ready for copilot
```

### Example 2: Fix Company Jarvis

```bash
# Full repair
npx tsx scripts/run-org-agent.ts fix \
  --org-id="22222222-2222-4000-a000-222222222222" \
  --reinit-brain \
  --reset-learning \
  --rebuild-graph \
  --recalibrate \
  --full-audit

# Result: All systems reinitialized, health restored
```

### Example 3: Batch Fix All Jarvis Orgs

```bash
# Fixes Company, Slack, Finance, Developer Jarvis
npx tsx scripts/run-org-agent.ts fix-all-jarvis

# Result: All Jarvis orgs repaired in one command
```

---

## 🧪 Testing Your Org

After creation, test the org:

### 1. Query Copilot
```bash
npx tsx scripts/query-org.ts <org-id> "What should I know?"
```

### 2. Check Database
```sql
SELECT * FROM organizations WHERE id = '<org-id>';
SELECT COUNT(*) FROM causal_relationships_statistical WHERE organization_id = '<org-id>';
SELECT COUNT(*) FROM ai_memory WHERE organization_id = '<org-id>';
```

### 3. Verify Federation
```sql
SELECT * FROM federation_config WHERE organization_id = '<org-id>';
```

### 4. Check Scheduled Jobs
```sql
SELECT * FROM scheduled_jobs WHERE organization_id = '<org-id>';
```

### 5. Run Health Audit
```bash
npx tsx scripts/run-org-agent.ts fix \
  --org-id="<org-id>" \
  --full-audit
```

---

## 📖 Architecture

```
org-creation-agent.ts
  ├── createOrganization()
  │   ├── Step 1: Create org record
  │   ├── Step 2: Initialize 93+ brain systems
  │   ├── Step 3: Enable autonomous learning
  │   ├── Step 4: Enable continuous learning
  │   ├── Step 5: Enable calibration loop
  │   ├── Step 6: Enable Core Brain federation ⭐
  │   ├── Step 7: Register motor commands
  │   ├── Step 8: 100% connectivity audit ⭐
  │   ├── Step 9: Configure connectors
  │   ├── Step 10: Seed initial data
  │   ├── Step 11: Enable growth mechanisms ⭐
  │   ├── Step 12: Register to agent network
  │   ├── Step 13: Setup ECS runner
  │   ├── Step 14: CTO final sign-off ⭐
  │   └── Step 15: Next steps
  │
  └── fixOrganization()
      ├── Reinitialize brain regions
      ├── Reset autonomous learning
      ├── Rebuild causal graph
      ├── Recalibrate accuracy
      ├── Reconnect connectors
      └── Full health audit

run-org-agent.ts (CLI)
  ├── loadEnv()
  ├── promptForOrgCreation() (interactive)
  ├── parseCreateArgs() (CLI mode)
  ├── parseFixArgs()
  ├── createOrg()
  ├── fixOrg()
  └── fixAllJarvis()
```

---

## 🎓 Best Practices

### 1. Always Use Interactive Mode First
Interactive mode helps you understand what's being configured.

### 2. Enable Core Brain Federation
Without federation, your org won't receive global intelligence.

### 3. Review Health Scorecard
Aim for ≥90/100 before going to production.

### 4. Set ECS Schedule for Production
Automated runs ensure brain keeps learning.

### 5. Authenticate Connectors Promptly
Org can't ingest signals until connectors are authenticated.

### 6. Monitor Scheduled Jobs
Check `scheduled_jobs` table to verify jobs are running.

### 7. Run Health Audits Regularly
```bash
npx tsx scripts/run-org-agent.ts fix --org-id=<id> --full-audit
```

### 8. Fix Issues Immediately
Don't let degraded orgs stay degraded — fix them.

---

## ❓ FAQ

**Q: Can I create an org without autonomous learning?**
A: Yes, use `--no-autonomous-learning` flag. But NOT recommended — the brain won't improve over time.

**Q: What if Core Brain doesn't exist?**
A: Run `npx tsx scripts/seed-core-brain.ts` first to create it.

**Q: Can I add more connectors later?**
A: Yes, manually insert into `org_connectors` table or recreate org.

**Q: How do I know if federation is working?**
A: Check `federation_config` table for `last_pull_at` timestamp.

**Q: What if scorecard is <90?**
A: Run fix command with appropriate flags to repair issues.

**Q: Can I use custom org IDs?**
A: Yes, pass `--id=<uuid>` when creating (must be valid UUID).

**Q: How often does autonomous learning run?**
A: Every 6 hours by default (configurable in `scheduled_jobs`).

**Q: Can I disable growth mechanisms?**
A: Not recommended, but you can delete rows from `scheduled_jobs` table.

---

**Last Updated**: 2026-02-14
**Agent Version**: 1.0.0
**Author**: Claude Sonnet 4.5 (CTO Mode)
