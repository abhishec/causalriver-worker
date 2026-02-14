# Organization Database Verification Guide
**Step-by-Step Testing & Validation**

---

## 🎯 Quick Verification Checklist

Run these commands to verify each org DB is working:

```bash
# 1. Company Jarvis
npx tsx scripts/seed-company-jarvis.ts --verify

# 2. Finance Jarvis (manual check - no dedicated verify)
# Check if synthetic data generates without errors
npx tsx -e "import { getFinanceData } from './platform/lib/finance-jarvis'; console.log(getFinanceData().analysis.insights.length)"

# 3. Slack Jarvis (check dataset generation)
npx tsx scripts/slack-jarvis/generate-dataset.ts | grep "Dataset complete"

# 4. Developer Jarvis (quick health check)
npx tsx packages/memory-stack/src/demo/developer-jarvis.ts --help

# 5. Core Brain (check for org record)
# (Requires Supabase query - see Database Queries section below)
```

---

## 1️⃣ Company Jarvis Verification

### Step 1: Verify Existing Data
```bash
cd /path/to/NexusBrain
npx tsx scripts/seed-company-jarvis.ts --verify
```

**Expected Output**:
```
Verifying Company Jarvis data in Supabase...
  Org ID: 22222222-2222-4000-a000-222222222222

  Organization: Company Jarvis (company-jarvis) [enterprise]
  causal_relationships_statistical      47
  ai_memory                              45
  org_cascade_rules                      12
  cross_domain_signals                   1847
  prediction_records                     8
  connector_sync_log                     1
  org_connectors                         4
```

### Step 2: Clean + Reseed (if needed)
```bash
# WARNING: This deletes all Company Jarvis data
npx tsx scripts/seed-company-jarvis.ts --clean

# Then reseed
npx tsx scripts/seed-company-jarvis.ts
```

**Expected Output**:
```
Step 1: Creating organization...
  Organization "Company Jarvis" created/updated.

Step 2: Generating synthetic data...
  Generated in 1234ms:
    Slack: 500 messages, 12 channels
    HubSpot: 150 deals, 300 contacts
    Docs: 25 documents
    Customers: 87 accounts, 234 tickets
    Insights: 18 (3 critical)
    Reverse prompts: 5
    Causal relationships: 12
    Department scores: 7
    Country performance: 5

Step 3: Training brain...
  Training packs: 8
  [OK] Sales Pipeline Dynamics
       Edges: 8 | Rules: 4 | Cascades: 2 | Outcomes: 1
  [OK] Customer Success Cascade
       Edges: 6 | Rules: 3 | Cascades: 2 | Outcomes: 2
  ...

  Training summary:
    Causal edges:    47
    Business rules:  23
    Cascade rules:   12
    Outcomes:        8
    Errors:          0

Step 4: Inserting signals...
  Generated 1847 signals
  Inserted 1847/1847 signals (0 batch errors)

Step 5: Creating connector records...
  Slack: active (500 records)
  HubSpot: active (600 records)
  Google Docs: active (25 records)
  Customer Platform: active (321 records)

Step 6: Logging sync...
  Sync logged: 1234ms, 1847 signals

================================================================
  Company Jarvis Brain Setup COMPLETE
  Org: 22222222-2222-4000-a000-222222222222

  The brain is now seeded with:
  - 500 Slack messages across 12 channels
  - 150 CRM deals, 300 contacts
  - 25 internal documents
  - 87 customer accounts, 234 support tickets
  - 18 cross-domain insights
  - 5 reverse prompts
  - 12 causal relationships

  Ready for copilot queries via /api/copilot/chat
================================================================
```

### Step 3: Query the Brain
```bash
npx tsx scripts/query-company-jarvis.ts "What are the top 3 things I should know?"
```

**Expected Output**:
```
Intent: business_overview | Domains: sales, cs, product | Confidence: 0.85
Regions used: causalDAG, multiHopReasoner, explanationGenerator

────────────────────────────────────────────────────────────────

[Streaming response from Claude...]

Based on the comprehensive data across your organization, here are the top 3 critical priorities:

1. **Taiwan Pipeline Stalled — $2.3M at Risk**
   Your Taiwan pipeline has 8 deals worth $2.3M that have been sitting in "Negotiation" stage for 45+ days. This represents 23% of your total weighted pipeline. The primary blocker is competitor involvement (TrustWave in 6 of 8 deals). The causal analysis shows that deals stalled in Negotiation for 45+ days have a 78% probability of converting to "closed_lost".

   **Action**: Immediate executive engagement on the Taipei Financial Services deal ($450K) and assign your Taiwan country manager to conduct competitive displacement workshops this week.

2. **Customer Success Team Morale Critical — Churn Risk Cascade**
   Slack sentiment analysis shows 12 frustrated messages from the CS team in the last 30 days, with topics centered on "tooling gaps" and "reactive firefighting". Your causal graph indicates that CS team frustration leads to increased churn risk with a 60-day lag (effect size: +0.45, p=0.003). You currently have 8 at-risk accounts worth $890K in ARR.

   **Action**: Schedule a CS retrospective this week to identify tooling gaps. Consider pulling forward the Q2 CS platform investment.

3. **Product-Sales Misalignment on Enterprise Features**
   There's tension between #sales and #product channels around enterprise feature commitments. 5 deals are blocked waiting for SSO + audit logs, but Product says Q3 at earliest. This is creating a revenue-velocity drag (avg deal cycle: 127 days vs. target 90 days).

   **Action**: Executive sync between CRO and CPO to align on enterprise roadmap priorities or find workarounds for these 5 deals.

────────────────────────────────────────────────────────────────
```

---

## 2️⃣ Finance Jarvis Verification

### Step 1: Check Data Generation
```bash
# Quick test: Generate data and count insights
npx tsx -e "
import { getFinanceData } from './platform/lib/finance-jarvis';
const data = getFinanceData();
console.log('Finance Jarvis Data Generated:');
console.log('  Insights:', data.analysis.insights.length);
console.log('  Forecasts:', data.analysis.cashFlowForecast.length);
console.log('  Spend breakdown:', data.analysis.spendBreakdown.length);
console.log('  Department risks:', data.analysis.departmentRiskScores.length);
console.log('  Runway days:', data.analysis.runwayProjection.daysRemaining);
"
```

**Expected Output**:
```
Finance Jarvis Data Generated:
  Insights: 12
  Forecasts: 3
  Spend breakdown: 7
  Department risks: 7
  Runway days: 487
```

### Step 2: Run Finance Jarvis CLI
```bash
npx tsx scripts/run-finance-jarvis.ts "What's our runway at current burn?"
```

**Expected Output**:
```
Finance Jarvis — CFO Financial Intelligence

Connected to Supabase: https://xxx.supabase.co
Org ID: (using synthetic cache)

─────────────────────────────────────────────────────

[Streaming response from Claude...]

Based on current financial data:

**Runway: 487 days (16.2 months)**

At your current monthly burn rate of $428K:
- Cash on hand: $6.85M
- Monthly revenue: $850K
- Monthly expenses: $1.28M
- Net burn: $428K/month

**Scenario Analysis**:

Best case (+20% revenue growth):
  Runway: 642 days (21.4 months)

Worst case (-15% revenue, +10% expenses):
  Runway: 312 days (10.4 months)

**Top Burn Contributors**:
1. Engineering: $187K/mo (43.7%)
2. Sales & Marketing: $98K/mo (22.9%)
3. G&A: $76K/mo (17.8%)

**Recommendations**:
- Engineering burn is elevated due to recent hiring (5 new engineers in Q4)
- Consider slowing hiring velocity in Q1 if ARR growth <15% QoQ
- Sales efficiency is strong (CAC payback: 14 months vs. industry avg 18)

─────────────────────────────────────────────────────
```

### Step 3: Test Dashboard (optional)
```bash
# Start the platform dev server
cd platform
npm run dev

# Visit: http://localhost:3000/finance-jarvis
```

---

## 3️⃣ Slack Jarvis Verification

### Step 1: Generate Dataset
```bash
npx tsx scripts/slack-jarvis/generate-dataset.ts
```

**Expected Output**:
```
─────────────────────────────────────────────────────
  Slack Jarvis — Synthetic Dataset Generator
─────────────────────────────────────────────────────

  Org ID:     22222222-2222-4000-a000-222222222222
  Seed:       12345
  Time Range: 2025-02-14 → 2026-02-14 (365 days)

Generating messages...
  ✓ 500 messages across 12 channels
  ✓ Sentiment distribution: positive: 150, neutral: 200, negative: 100, frustrated: 40, celebration: 10
  ✓ Topic coverage: 20 unique topics

Dataset complete
  Output: scripts/slack-jarvis/dataset.json
```

### Step 2: Ingest & Train
```bash
npx tsx scripts/slack-jarvis/ingest-and-train.ts
```

**Expected Output**:
```
─────────────────────────────────────────────────────
  Slack Jarvis — Ingest & Train Pipeline
─────────────────────────────────────────────────────

Step 1: Loading synthetic dataset...
  ✓ Loaded 500 messages from dataset.json

Step 2: Creating organization...
  ✓ Organization "Slack Jarvis" created/updated

Step 3: Generating signals from messages...
  ✓ Generated 500 signals

Step 4: Inserting signals...
  ✓ Inserted 500/500 signals (0 batch errors)

Step 5: Training brain with self-knowledge packs...
  Loading self-knowledge packs...
  ✓ Training pack: Slack Team Dynamics
       Edges: 4 | Rules: 6 | Cascades: 3 | Outcomes: 2

  Training summary:
    Causal edges:    4
    Business rules:  6
    Cascade rules:   3
    Outcomes:        2
    Errors:          0

Step 6: Creating connector record...
  ✓ Slack: active (500 messages)

Step 7: Logging sync...
  ✓ Sync logged: 1234ms, 500 signals

─────────────────────────────────────────────────────
  Slack Jarvis Brain Setup COMPLETE
  Org: 22222222-2222-4000-a000-222222222222

  Ready for copilot queries
─────────────────────────────────────────────────────
```

### Step 3: Test Copilot
```bash
npx tsx scripts/slack-jarvis/copilot-test.ts
```

**Expected Query**: "What's the team sentiment in #engineering?"

---

## 4️⃣ Developer Jarvis Verification

### Step 1: Test with Public Repo (No Token)
```bash
# This will fail gracefully and show you the prompts
npx tsx packages/memory-stack/src/demo/developer-jarvis.ts
```

**Expected Output** (Interactive):
```
════════════════════════════════════════════════════════════════
  🤖 DEVELOPER JARVIS — Code Intelligence Pipeline
════════════════════════════════════════════════════════════════

GitHub Token: [waiting for input]
```

### Step 2: Test with Real Repo (Token Required)
```bash
# Get a GitHub token from: https://github.com/settings/tokens
export GITHUB_TOKEN=ghp_xxxYOURTOKENxxx

# Test with a small public repo
npx tsx packages/memory-stack/src/demo/developer-jarvis.ts \
  --repo=vercel/next.js
```

**Expected Output**:
```
════════════════════════════════════════════════════════════════
  🤖 DEVELOPER JARVIS — Code Intelligence Pipeline
════════════════════════════════════════════════════════════════

  ═══ Phase 1: Connecting to GitHub ═══

  ✓ Connected to vercel/next.js
    JavaScript | 125,432 stars | 26,789 forks | 1,234.5 MB
    Default branch: canary | Private: false

  ═══ Phase 2: Syncing Engineering Signals ═══

    Fetching PRs, reviews, CI/CD, issues, commits...
  ✓ 2,847 signals synced
    PRs: 487 | Reviews: 1,234 | CI: 892 | Issues: 234

  ═══ Phase 3: Code Intelligence Pipeline ═══

    Fetching file tree... 12,345 files found
    500 code files detected, processing 500
    Parsing: 500/500 (100%) — 8,234 symbols
    Building dependency graph... 1,234 edges, 567 entities
    Building expertise graph... 234 entries, 89 contributors
    Building collaboration graph... 456 edges, 89 contributors
  ✓ Pipeline complete: 500 files, 8,234 symbols

  ═══ Phase 4: Training Brain ═══

  ✓ Brain trained: 87 rules, 132 causal edges, 64 patterns

════════════════════════════════════════════════════════════════
  🤖 DEVELOPER JARVIS — vercel/next.js
════════════════════════════════════════════════════════════════

  500 files | 8,234 symbols | 1,234 dep edges | 2,847 signals
  Pipeline loaded in 45,678ms

  Type a question, or /help for commands. Ctrl+C to exit.

  jarvis> How does routing work?

[Use case: onboarding]

📖 Onboarding Intelligence

  Repository: vercel/next.js
  Language: JavaScript | Stars: 125,432
  Files indexed: 500 | Symbols: 8,234
  Dependency edges: 1,234 | Entities: 567

  Most critical files (highest fan-in):
    packages/next/src/server/router.ts — 45 dependents
    packages/next/src/shared/lib/router/router.ts — 38 dependents
    packages/next/src/client/router.ts — 32 dependents
    ...

  Language breakdown:
    TypeScript: 387 files
    JavaScript: 89 files
    ...

  jarvis> /health

════════════════════════════════════════════════════════════════
  DEVELOPER JARVIS — HEALTH REPORT: vercel/next.js
════════════════════════════════════════════════════════════════

  CODE HEALTH:
    Files indexed:    500 / 12,345
    Symbols:          8,234
    Dep edges:        1,234 across 567 entities
    Circular deps:    3 ⚠ NEEDS FIX

  TEAM HEALTH:
    Contributors:     89
    Expertise edges:  234 across 45 topics
    Cross-team:       456 reviews | Density: 0.078

  CI/CD HEALTH:
    Runs: 892 | Failures: 89 (10.0%)
    ⚠ ELEVATED

  SIGNAL PIPELINE:
    Total signals: 2,847
    PRs: 487 | Reviews: 1,234
    CI runs: 892 | Issues: 234

  BRAIN KNOWLEDGE:
    Rules: 87 | Causal edges: 132 | Patterns: 64

════════════════════════════════════════════════════════════════
```

---

## 5️⃣ Core Brain Verification

### Method 1: Check via Company Jarvis Query
```bash
# Company Jarvis queries both its own org + Core Brain
npx tsx scripts/query-company-jarvis.ts "Show me causal relationships"
```

The query script explicitly loads from both orgs:
```typescript
const orgIds = [COMPANY_JARVIS_ORG_ID, CORE_ORG_ID];
```

### Method 2: Direct Supabase Query (if you have access)
```sql
-- Check if Core Brain org exists
SELECT id, name, slug, plan, is_core_brain
FROM organizations
WHERE id = '00000000-0000-4000-a000-000000000001';

-- Check Core Brain causal edges
SELECT COUNT(*) as edge_count
FROM causal_relationships_statistical
WHERE organization_id = '00000000-0000-4000-a000-000000000001';

-- Check Core Brain rules
SELECT COUNT(*) as rule_count
FROM ai_memory
WHERE organization_id = '00000000-0000-4000-a000-000000000001'
  AND memory_type = 'rule';
```

---

## 📊 Database Queries for Manual Verification

If you have direct Supabase access (via SQL Editor or psql):

### List All Orgs
```sql
SELECT
  id,
  name,
  slug,
  plan,
  is_core_brain,
  created_at
FROM organizations
ORDER BY created_at DESC;
```

### Company Jarvis Stats
```sql
-- Causal edges
SELECT COUNT(*) FROM causal_relationships_statistical
WHERE organization_id = '22222222-2222-4000-a000-222222222222';

-- Rules
SELECT COUNT(*) FROM ai_memory
WHERE organization_id = '22222222-2222-4000-a000-222222222222'
  AND memory_type = 'rule';

-- Patterns
SELECT COUNT(*) FROM ai_memory
WHERE organization_id = '22222222-2222-4000-a000-222222222222'
  AND memory_type = 'pattern';

-- Signals
SELECT COUNT(*) FROM cross_domain_signals
WHERE organization_id = '22222222-2222-4000-a000-222222222222';

-- Cascades
SELECT COUNT(*) FROM org_cascade_rules
WHERE organization_id = '22222222-2222-4000-a000-222222222222';

-- Connectors
SELECT connector_type, status, signals_count
FROM org_connectors
WHERE organization_id = '22222222-2222-4000-a000-222222222222';
```

### Check Learning Activity
```sql
-- Recent causal discoveries
SELECT
  source_domain,
  target_domain,
  effect_size,
  granger_p_value,
  optimal_lag_days,
  natural_language
FROM causal_relationships_statistical
WHERE organization_id = '22222222-2222-4000-a000-222222222222'
  AND is_significant = true
ORDER BY created_at DESC
LIMIT 10;

-- Recent signals
SELECT
  source_domain,
  signal_type,
  signal_timestamp,
  entity_type
FROM cross_domain_signals
WHERE organization_id = '22222222-2222-4000-a000-222222222222'
ORDER BY signal_timestamp DESC
LIMIT 20;
```

---

## 🧪 Test Queries for Each Jarvis

### Company Jarvis
```bash
# Business overview
npx tsx scripts/query-company-jarvis.ts "What are the top 3 things I should know?"

# Specific domains
npx tsx scripts/query-company-jarvis.ts "Why is Taiwan pipeline stalled?"
npx tsx scripts/query-company-jarvis.ts "Which teams are frustrated?"
npx tsx scripts/query-company-jarvis.ts "What's the churn risk?"

# Causal queries
npx tsx scripts/query-company-jarvis.ts "How does win rate affect churn?"
npx tsx scripts/query-company-jarvis.ts "What causes pipeline velocity to drop?"
```

### Finance Jarvis
```bash
npx tsx scripts/run-finance-jarvis.ts "What's our runway?"
npx tsx scripts/run-finance-jarvis.ts "Which departments are overspending?"
npx tsx scripts/run-finance-jarvis.ts "Show me cash flow forecast for next 90 days"
npx tsx scripts/run-finance-jarvis.ts "What's our CAC payback period?"
npx tsx scripts/run-finance-jarvis.ts "Unit economics breakdown"
```

### Slack Jarvis
```bash
# (After ingest-and-train)
npx tsx scripts/slack-jarvis/copilot-test.ts

# Example queries to test manually:
# "What's the team sentiment in #engineering?"
# "Which topics are causing frustration?"
# "Is there tension between sales and product?"
```

### Developer Jarvis
```bash
# Interactive mode
GITHUB_TOKEN=ghp_xxx npx tsx packages/memory-stack/src/demo/developer-jarvis.ts

# Built-in commands (type these in the CLI):
/help          # Show all commands
/stats         # Repository stats
/health        # Full health report
/busfactor     # Bus factor analysis
/cycles        # Circular dependencies
/cascade       # Engineering cascade
/hubs          # Most-depended-on files

# Natural language queries:
"How does auth work?"
"What breaks if I change utils.ts?"
"Who knows about the payment system?"
"Show me the engineering cascade"
```

---

## ✅ Success Criteria

Each org DB is considered **healthy** if:

### Company Jarvis
- ✅ Org exists in `organizations` table
- ✅ 40+ causal edges in DB
- ✅ 20+ rules in `ai_memory`
- ✅ 10+ cascades in `org_cascade_rules`
- ✅ 1,500+ signals in `cross_domain_signals`
- ✅ 4 connectors in `org_connectors` (Slack, HubSpot, Docs, Customers)
- ✅ Queries return coherent, context-aware responses

### Finance Jarvis
- ✅ Synthetic data generates without errors
- ✅ 10+ insights in analysis
- ✅ 3 cash flow forecasts (30/60/90 day)
- ✅ 7 department breakdowns
- ✅ Runway calculation works
- ✅ Queries return financial intelligence

### Slack Jarvis
- ✅ Dataset generates 500+ messages
- ✅ Sentiment distribution looks realistic
- ✅ Signals ingested successfully
- ✅ Self-knowledge packs train successfully
- ✅ Queries return team dynamics insights

### Developer Jarvis
- ✅ Connects to GitHub API
- ✅ Syncs signals (PRs, reviews, CI, issues)
- ✅ Parses source code (symbols, imports, exports)
- ✅ Builds 3 graphs (Knowledge Dep, Expertise, Collaboration)
- ✅ Loads TRAINING_LIBRARY in-memory
- ✅ Interactive CLI responds to queries

### Core Brain
- ✅ Org exists with `is_core_brain = true`
- ✅ Company Jarvis queries successfully federate Core Brain data
- ✅ (Future) Patterns promoted from org brains appear in Core

---

## 🐛 Troubleshooting

### Issue: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
**Fix**: Ensure `platform/.env.local` exists with:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
ANTHROPIC_API_KEY=sk-ant-xxx
```

### Issue: "Cannot connect to DB directly"
**Fix**: Database queries require either:
1. Supabase SQL Editor (web UI)
2. Connection string in format: `postgres://postgres:[password]@db.[project].supabase.co:5432/postgres`

### Issue: Company Jarvis returns "No causal edges found"
**Fix**: Run seed script:
```bash
npx tsx scripts/seed-company-jarvis.ts
```

### Issue: Developer Jarvis "GitHub API 401"
**Fix**: Check token:
```bash
# Test token validity
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user
```

### Issue: Finance Jarvis "Module not found"
**Fix**: Ensure you're in the right directory:
```bash
cd /path/to/NexusBrain
# Not inside platform/
```

---

**Last Updated**: 2026-02-14
**Next Steps**: See `ORG-DB-EVALUATION.md` for full architecture details
