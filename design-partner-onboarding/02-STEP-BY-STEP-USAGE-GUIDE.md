# NexusBrain - Step-by-Step Usage Guide

**Complete Guide from Installation to Daily Usage**

---

## Table of Contents

1. [Initial Setup (Day 1)](#initial-setup)
2. [After AI Scans Your Code](#after-scan)
3. [Daily Usage Workflows](#daily-workflows)
4. [All Use Cases with Examples](#all-use-cases)
5. [Advanced Features](#advanced-features)
6. [Troubleshooting](#troubleshooting)

---

## Initial Setup (Day 1)

### Step 1: Install GitHub App (5 minutes)

**1.1 Navigate to Installation Page**
```
https://github.com/apps/nexusbrain
```

**1.2 Click "Install" or "Configure"**

**1.3 Select Your Organization**
- Choose your GitHub organization from dropdown
- If you don't see it, check organization permissions

**1.4 Select Repositories**

Option A - All Repositories:
```
○ All repositories
```

Option B - Specific Repositories (Recommended):
```
● Only select repositories
  ✓ your-main-backend
  ✓ your-api-service
  ✓ your-frontend
```

**1.5 Review Permissions**

The app requests READ-ONLY access to:
- ✅ Repository contents (code)
- ✅ Pull requests
- ✅ Issues
- ✅ Commit history
- ❌ NO write access
- ❌ NO secrets access

**1.6 Click "Install & Authorize"**

**Result**: You'll see confirmation message
```
✓ NexusBrain installed successfully
→ AI will now scan your repositories (takes ~30 minutes)
→ You'll receive email when ready
```

---

### Step 2: Get Your API Key (2 minutes)

**2.1 Check Your Email**

You'll receive:
```
Subject: Welcome to NexusBrain - Your API Key

Your API Key: nb_org_xxxxxxxxxxxxxxxxxxxxxxxx

Save this securely - you'll need it to authenticate.
```

**2.2 Store API Key Securely**

Option A - Environment Variable (Recommended):
```bash
# Add to ~/.bashrc or ~/.zshrc
export NEXUSBRAIN_API_KEY="nb_org_xxxxxxxxxxxxxxxxxxxxxxxx"

# Reload shell
source ~/.bashrc  # or source ~/.zshrc
```

Option B - .env File:
```bash
# Create .env file in your project
echo 'NEXUSBRAIN_API_KEY=nb_org_xxxxxxxxxxxxxxxxxxxxxxxx' > .env

# ⚠️ Add to .gitignore!
echo '.env' >> .gitignore
```

**⚠️ IMPORTANT**: Never commit API keys to Git!

---

### Step 3: Install CLI Tool (Optional, 5 minutes)

**3.1 Install via npm**
```bash
npm install -g @nexusbrain/cli
```

Or via Homebrew (Mac):
```bash
brew install nexusbrain
```

Or via curl (Linux):
```bash
curl -fsSL https://get.nexusbrain.ai | sh
```

**3.2 Verify Installation**
```bash
nexus --version
```

Expected output:
```
NexusBrain CLI v1.0.0
```

**3.3 Login**
```bash
nexus login
```

It will prompt:
```
? Enter your API key: [paste nb_org_xxxxxxxxxxxxxxxxxxxxxxxx]
```

Expected output:
```
✓ Logged in successfully
✓ Organization: [Your Org Name]
✓ Repositories connected: 3
```

**3.4 Test Connection**
```bash
nexus status
```

Expected output:
```
✓ Connected to NexusBrain
✓ Repositories: 3 connected
  - your-main-backend (scanning...)
  - your-api-service (scanning...)
  - your-frontend (scanning...)

✓ Scan status: In Progress (45% complete)
  Estimated time remaining: 12 minutes
```

---

## After AI Scans Your Code

### What Happens During the Scan (30 minutes automatic)

**Phase 1: Code Parsing** (15 minutes)
```
[████████████░░░░░░░░] 60% - Parsing Scala files...
Files processed: 1,234 / 2,045
Classes found: 856
Methods found: 6,789
```

The AI is:
- Reading all source files
- Identifying classes, methods, functions
- Calculating complexity metrics
- Finding Akka actors, Play controllers (for Scala)

**Phase 2: Graph Building** (10 minutes)
```
[████████████████░░░░] 80% - Building knowledge graphs...
Dependencies mapped: 654 edges
Contributors analyzed: 12 engineers
```

The AI is:
- Creating dependency graph (what imports what)
- Building causal graph (from git history)
- Mapping expertise (who wrote what)
- Finding collaboration patterns

**Phase 3: Pattern Learning** (5 minutes)
```
[████████████████████] 100% - Learning complete!
Architecture patterns: 23 identified
Naming conventions: 8 detected
Common workflows: 15 mapped
```

The AI is:
- Identifying your architecture patterns
- Learning naming conventions
- Mapping common workflows

---

### Verify Scan Complete

**Check via CLI**:
```bash
nexus scan status
```

Expected output when complete:
```
✓ Scan Complete!

SUMMARY:
├─ Files scanned: 2,045 files
├─ Languages detected: Scala (87%), Java (10%), Other (3%)
├─ Classes found: 856
├─ Methods found: 6,789
├─ Akka actors: 89
├─ Play controllers: 56
├─ Dependencies: 654 edges
├─ Causal relationships: 234 edges
├─ Contributors: 12 engineers
└─ Expertise areas: 145 topics

Status: READY FOR QUERIES ✓

Next step: Try your first query!
  $ nexus ask "What are the main components of this codebase?"
```

**Check via Email**:
You'll receive:
```
Subject: NexusBrain - Scan Complete! Ready to Use

Your codebase has been analyzed:
- 2,045 files processed
- 89 Akka actors identified
- 12 engineers mapped

Try your first query:
https://app.nexusbrain.ai/query
```

---

## Daily Usage Workflows

### Method 1: CLI (Fastest for Developers)

**Basic Query**:
```bash
nexus ask "What breaks if I change UserService.scala?"
```

**Query with Scope**:
```bash
# Limit to specific repo
nexus ask "Who knows about payment processing?" --repo backend-api

# Limit to specific branch
nexus ask "What changed recently?" --branch develop

# Both
nexus ask "Show me recent bugs" --repo backend --branch main
```

**Get Citations**:
```bash
nexus ask "How does authentication work?" --with-citations
```

**Output Format Options**:
```bash
# JSON output (for scripts)
nexus ask "List all actors" --format json

# Markdown output (for docs)
nexus ask "Explain the architecture" --format markdown

# Plain text (default)
nexus ask "What's the biggest technical debt?"
```

---

### Method 2: API (For Integrations)

**Basic Query**:
```bash
curl -X POST https://api.nexusbrain.ai/v1/query \
  -H "Authorization: Bearer $NEXUSBRAIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What breaks if UserService.scala changes?"
  }'
```

**Response Format**:
```json
{
  "answer": "If UserService.scala is modified, it will affect 23 files including...",
  "confidence": 0.92,
  "processingTime": 2834,
  "route": "action_domain",
  "data": {
    "affectedFiles": [
      {
        "path": "src/main/scala/controllers/AuthController.scala",
        "reason": "Direct method call to UserService.authenticate()",
        "impact": "high",
        "lineNumbers": [45, 67, 89]
      }
    ],
    "riskScore": 0.72
  },
  "citations": [
    {
      "source": "UserService.scala:45",
      "type": "code_reference",
      "content": "def authenticate(email: String, password: String): Future[User]"
    }
  ]
}
```

**Query with Options**:
```bash
curl -X POST https://api.nexusbrain.ai/v1/query \
  -H "Authorization: Bearer $NEXUSBRAIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Who knows about Akka supervision?",
    "scope": {
      "repositories": ["backend-api"],
      "branches": ["main", "develop"]
    },
    "options": {
      "includeCitations": true,
      "maxResults": 10,
      "confidenceThreshold": 0.7
    }
  }'
```

---

### Method 3: Automated PR Reviews

**How It Works** (Automatic):

1. **Developer submits PR**
   ```bash
   git push origin feature/add-payment-retry
   # PR #3456 created automatically
   ```

2. **GitHub webhook triggers NexusBrain** (automatic)

3. **AI analyzes PR** (takes 10-30 seconds):
   - Checks best practices
   - Detects breaking changes
   - Analyzes impact
   - Suggests reviewers

4. **AI posts comment on PR** (automatic):

```markdown
🤖 **NexusBrain Code Review - PR #3456**

## Summary
- Files changed: 5
- Lines: +120, -45
- Complexity change: +15 ⚠️
- Risk score: 0.65 (MEDIUM-HIGH)

## Checks
✅ All methods have type annotations
✅ Error handling uses Either (not exceptions)
⚠️  WARNING: OrderActor.scala missing supervision strategy
⚠️  WARNING: PaymentService.scala has synchronous DB call
❌ FAIL: No tests added for new payment logic

## Impact Analysis
Downstream files affected: 12
Akka actors affected: 3 (OrderActor, PaymentActor, RetryActor)

## Breaking Changes Detected
⚠️  PaymentService.processPayment signature changed
     Will break:
     - OrderController.scala:123
     - CheckoutActor.scala:45

## Suggested Reviewers
1. **@bob-kumar** (OrderActor expert) - REQUIRED
2. **@alice-chen** (Akka supervision) - OPTIONAL

## Review Comments

📝 **OrderActor.scala:45**
Consider adding supervision strategy for child actors:
\`\`\`scala
override val supervisorStrategy = OneForOneStrategy() {
  case _: PaymentException => Resume
  case _: Exception => Restart
}
\`\`\`

📝 **PaymentService.scala:78**
Synchronous DB call blocks actor thread. Use Future:
\`\`\`scala
def getPayment(id: String): Future[Payment] =
  db.run(payments.filter(_.id === id).result.headOption)
\`\`\`

---
*Analyzed in 12.3 seconds | Confidence: 0.89*
```

**Enable/Disable Auto-Review**:
```bash
# Enable for all PRs
nexus config set auto-review true

# Disable
nexus config set auto-review false

# Enable only for specific repos
nexus config set auto-review-repos "backend-api,frontend"
```

---

## All Use Cases with Examples

### Use Case 1: Impact Analysis

**Question**: "What will break if I change this file?"

**When to use**:
- Before refactoring
- Before merging large PRs
- Before deprecating code
- Planning releases

**Example 1 - Simple Impact**:
```bash
nexus ask "What breaks if UserService.scala is modified?"
```

**Response**:
```
IMPACT ANALYSIS - UserService.scala

DIRECTLY AFFECTED: 23 files
├─ AuthController.scala
│  → Calls: UserService.authenticate()
│  → Line: 45
│  → Impact: HIGH (authentication flow)
│
├─ SessionManager.scala
│  → Calls: UserService.getUser(), UserService.updateUser()
│  → Lines: 78, 92, 115
│  → Impact: HIGH (session management)
│
├─ OrderController.scala
│  → Indirect dependency via SessionManager
│  → Impact: MEDIUM
│
└─ [20 more files...]

AKKA ACTORS IMPACTED: 5 actors
├─ UserActor (parent - direct dependency)
├─ SessionActor (child actor)
├─ NotificationActor (event subscriber)
├─ AuthActor (uses auth flow)
└─ AdminActor (observes user events)

PLAY CONTROLLERS: 8 controllers depend on this

RISK ASSESSMENT:
├─ Risk score: 0.72 (HIGH)
├─ Critical path: YES (authentication)
├─ Test coverage: 78% (good)
└─ Estimated testing: 2-3 days

RECOMMENDATIONS:
1. Create feature flag for gradual rollout
2. Add integration tests for auth flow
3. Update dependent services simultaneously
4. Plan 2-week testing period

CAUSAL EDGES (what causes what):
├─ UserService → AuthController (strength: 0.95)
├─ UserService → SessionManager (strength: 0.88)
└─ SessionManager → OrderController (strength: 0.67)
```

**Example 2 - Refactoring Impact**:
```bash
nexus ask "What's the impact of splitting OrderService.scala into smaller files?"
```

**Response**:
```
REFACTORING IMPACT - OrderService.scala

FILES IMPORTING OrderService: 15 files
├─ OrderController.scala: 7 import statements
├─ PaymentProcessor.scala: 3 import statements
├─ ShippingManager.scala: 2 import statements
└─ [12 more files...]

SUGGESTED SPLIT STRATEGY:

1. OrderService (core business logic)
   Keep: order creation, validation, state management
   Imports unchanged: 10 files continue using this

2. OrderValidator (validation logic) → NEW FILE
   Extract: validation methods (8 methods)
   Files needing update: 3 files
   Import change: OrderService → OrderValidator

3. OrderRepository (data access) → NEW FILE
   Extract: database operations (5 methods)
   Files needing update: 5 files
   Import change: OrderService → OrderRepository

MIGRATION STRATEGY:
Phase 1: Create new files with extracted code
Phase 2: Keep facade in OrderService (backward compatible)
Phase 3: Update 8 importing files (one by one)
Phase 4: Remove facade after 1 sprint

ESTIMATED EFFORT: 2-3 days
RISK LEVEL: MEDIUM (test coverage: 82%)

BENEFITS:
- Reduced complexity: 85 → 30 per file
- Better separation of concerns
- Easier testing
- Faster onboarding
```

---

### Use Case 2: Expert Finding

**Question**: "Who knows about this system/feature?"

**When to use**:
- Need code review
- Incident response
- Knowledge transfer
- Mentoring assignments

**Example 1 - Find Expert**:
```bash
nexus ask "Who knows the most about Akka supervision strategies?"
```

**Response**:
```
AKKA SUPERVISION EXPERTS (Top 3)

1. Alice Chen ⭐ RECOMMENDED
   Expertise Score: 8.5/10

   CONTRIBUTIONS:
   ├─ Commits: 23 to supervision code
   ├─ PR Reviews: 12 on Akka actors
   ├─ Last Active: 2 days ago
   └─ Response Time: Usually < 4 hours

   KEY FILES OWNED:
   ├─ SupervisorActor.scala (15 commits, 89% ownership)
   ├─ ActorConfig.scala (8 commits, 67% ownership)
   └─ BackoffSupervisor.scala (5 commits, 45% ownership)

   NOTABLE WORK:
   ├─ Implemented BackoffSupervisor for UserActor
   ├─ Fixed escalation bug in NotificationSupervisor
   └─ Authored "Akka Best Practices" doc (internal wiki)

   CONTACT: alice@company.com | Slack: @alice

2. Bob Kumar
   Expertise Score: 6.2/10

   CONTRIBUTIONS:
   ├─ Commits: 15 to actor hierarchy
   ├─ PR Reviews: 8
   └─ Last Active: 1 week ago

   KEY FILES:
   └─ OrderSupervisor.scala (12 commits)

   NOTABLE WORK:
   ├─ Added OneForOneStrategy to OrderActor
   └─ Migrated actors to typed actors (PR #2341)

3. Carol Martinez
   Expertise Score: 3.1/10

   CONTRIBUTIONS:
   ├─ Commits: 7 to actor testing
   └─ PR Reviews: 4

   SPECIALIZATION: Testing supervision strategies

RECOMMENDATION: Contact Alice Chen for supervision questions

KNOWLEDGE RISK:
⚠️  If Alice leaves, knowledge transfer to Bob would take 4-6 weeks
   Recommendation: Pair programming sessions now

COLLABORATION NETWORK:
Alice ←→ Bob (12 PR reviews together)
Bob ←→ Carol (5 pair programming sessions)
```

**Example 2 - Team Expertise Map**:
```bash
nexus ask "Show me expertise distribution across the team"
```

**Response**:
```
TEAM EXPERTISE MAP

HIGH EXPERTISE AREAS (well-covered):
✅ REST API Development
   Experts: Alice (9.1), David (8.5), Eve (7.8)
   Coverage: EXCELLENT

✅ Database/Slick
   Experts: Bob (8.9), Frank (8.2), Alice (7.5)
   Coverage: EXCELLENT

MEDIUM EXPERTISE AREAS (acceptable):
⚠️  Akka Actors
   Experts: Alice (8.5), Bob (6.2)
   Coverage: MODERATE (bus factor: 2)

⚠️  Event Sourcing
   Expert: Alice (8.7)
   Coverage: WEAK (bus factor: 1)

LOW EXPERTISE AREAS (risky):
❌ Akka Streams
   Expert: Carol (4.5)
   Coverage: WEAK (limited knowledge)

❌ GraphQL Integration
   Expert: David (5.1)
   Coverage: WEAK (recent addition)

KNOWLEDGE GAPS (no experts):
🚨 Kubernetes Deployment (ops-only knowledge)
🚨 Monitoring/Alerting Setup (external team)

RECOMMENDATIONS:
1. URGENT: Document event sourcing (Alice only expert)
2. HIGH: Grow Akka Streams expertise (training needed)
3. MEDIUM: Cross-train on GraphQL (David + others)
```

---

### Use Case 3: Technical Debt Analysis

**Question**: "What technical debt should we fix?"

**When to use**:
- Sprint planning
- Quarterly planning
- Before major releases
- Quality initiatives

**Example 1 - Overall Audit**:
```bash
nexus ask "Audit our codebase for technical debt"
```

**Response**:
```
TECHNICAL DEBT AUDIT

TOTAL DEBT: 156 issues identified
ESTIMATED PAYOFF: 12 weeks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL (Fix Immediately) - 3 issues

1. UserActor.scala - Debt Score: 8.7/10
   ISSUE: God object antipattern
   ├─ Lines: 1,200 (should be <300)
   ├─ Methods: 45 (should be <20)
   ├─ Cyclomatic Complexity: 85 (should be <15)
   └─ Dependencies: 23 files depend on this

   IMPACT:
   ├─ Bugs: 12 bugs in last 6 months (2/month avg)
   ├─ PR Review Time: 3.5 hours avg (vs 1.2h for other files)
   └─ Onboarding Confusion: Mentioned in 8/10 onboarding sessions

   RECOMMENDATION:
   Split into 3 actors:
   ├─ UserActor (state management only)
   ├─ UserValidator (validation logic)
   └─ UserPersistence (database operations)

   ESTIMATED EFFORT: 2 weeks
   EXPECTED BENEFIT:
   ├─ 60% reduction in bugs (12 → 5 per 6 months)
   ├─ 50% faster PR reviews (3.5h → 1.8h)
   └─ 30% faster onboarding for this component

2. LegacyPaymentService.scala - Debt Score: 7.9/10
   ISSUE: Deprecated API (Stripe v2, EOL in 3 months!)
   ├─ API Version: v2 (deprecated since 2024)
   ├─ Dependencies: 15 files use this service
   └─ Test Coverage: 45% (below threshold)

   RISK:
   🚨 Stripe v2 shutdown: June 2026 (3 months!)
   🚨 Security vulnerabilities in deprecated API
   🚨 Missing features (SCA, 3DS2)

   RECOMMENDATION:
   Migrate to Stripe API v3
   ├─ Update PaymentService.scala
   ├─ Add 3DS2 support
   └─ Increase test coverage to 80%

   ESTIMATED EFFORT: 1 week
   EXPECTED BENEFIT:
   ├─ Prevent service disruption (June 2026)
   ├─ Improved security (PCI DSS compliance)
   └─ Access to new features

3. SessionManager.scala - Debt Score: 7.1/10
   ISSUE: Synchronous database calls (blocking)
   ├─ Blocking calls: 8 methods
   ├─ P95 latency: 300ms (should be <50ms)
   └─ Throughput: 50 req/sec (vs 500 req/sec theoretical)

   RECOMMENDATION:
   Convert to async using Akka Streams
   ├─ Replace blocking DB calls with Future
   ├─ Add connection pool tuning
   └─ Implement circuit breaker

   ESTIMATED EFFORT: 3 days
   EXPECTED BENEFIT:
   ├─ 85% latency reduction (300ms → 45ms)
   ├─ 10x throughput increase (50 → 500 req/sec)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HIGH PRIORITY - 12 issues

[Showing top 3]

4. OrderRepository.scala - Score: 6.5/10
   ISSUE: N+1 query problem
   Impact: 12 DB queries per order fetch
   Fix: Add batch loading
   Effort: 2 days

5. NotificationActor.scala - Score: 6.2/10
   ISSUE: Missing circuit breaker
   Impact: Cascading failures on email outage
   Fix: Add Akka Circuit Breaker
   Effort: 1 day

6. ConfigService.scala - Score: 5.9/10
   ISSUE: Hardcoded configuration
   Impact: Environment-specific deploys
   Fix: Use Typesafe Config
   Effort: 2 days

... [9 more high-priority issues]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEBT BY CATEGORY:

Complexity (45 issues):
├─ God objects: 3 files
├─ Long methods: 23 methods >50 lines
└─ High cyclomatic complexity: 19 files >15

Code Smells (34 issues):
├─ Duplicate code: 8 blocks
├─ Long parameter lists: 12 methods
└─ Feature envy: 14 cases

Performance (18 issues):
├─ N+1 queries: 6 cases
├─ Missing indexes: 7 tables
└─ Inefficient algorithms: 5 methods

Architecture (22 issues):
├─ Missing circuit breakers: 8 services
├─ Synchronous calls: 10 methods
└─ Circular dependencies: 4 packages

Testing (37 issues):
├─ Low coverage: 23 files <50%
├─ Missing integration tests: 9 flows
└─ Flaky tests: 5 tests

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDED SPRINT PLAN:

Sprint 1 (Week 1-2): Critical Issues
├─ Fix UserActor god object (2 weeks)
├─ Migrate LegacyPaymentService (1 week - parallel)
└─ Expected: 50% bug reduction, API compliance

Sprint 2 (Week 3-4): Performance
├─ Fix SessionManager blocking calls (3 days)
├─ Fix OrderRepository N+1 (2 days)
├─ Add missing circuit breakers (3 days)
└─ Expected: 10x performance improvement

Sprint 3+ (Week 5-12): Systematic cleanup
├─ Address remaining HIGH issues
├─ Improve test coverage
└─ Refactor complex methods
```

---

### Use Case 4: Onboarding Support

**Question**: "How do I learn this codebase?"

**When to use**:
- New engineer first day
- Switching teams
- Learning new component
- Understanding architecture

**Example**:
```bash
nexus ask "I'm new to this codebase. Create a learning plan for me."
```

**Response**:
```
PERSONALIZED ONBOARDING PLAN

Welcome! This 3-week plan will help you become productive.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WEEK 1: FOUNDATION
Goal: Understand architecture and run the system

DAY 1-2: Core Setup & Architecture
Morning:
├─ ✓ Set up dev environment (setup-guide.md)
├─ ✓ Clone repo and run tests
└─ ✓ Read: README.md, ARCHITECTURE.md

Afternoon:
├─ Read these files (in order):
│  1. Application.scala (entry point, 150 lines)
│  2. Routes.scala (HTTP routing, 200 lines)
│  3. DatabaseConfig.scala (DB setup, 100 lines)
│  └─ ApplicationController.scala (base controller, 80 lines)
│
└─ Exercise: Add a new health check endpoint

DAY 3-4: Domain Models
Morning:
├─ Read domain model files:
│  1. models/User.scala (core entity)
│  2. models/Order.scala (business logic)
│  3. models/Payment.scala (financial)
│
└─ Draw entity relationship diagram

Afternoon:
├─ Run test suite: `sbt test`
├─ Pick one model and trace through tests
└─ Exercise: Add a new field to User model (with tests)

DAY 5: Review & Questions
├─ Review week 1 learnings
├─ Prepare questions list
├─ 1:1 with mentor (Bob Kumar @bob)
└─ Try NexusBrain: Ask any questions about code!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WEEK 2: AKKA ACTOR SYSTEM
Goal: Understand actor-based architecture

DAY 6-8: Actor Fundamentals
Core actors to study:
1. UserActor.scala
   ├─ Simple actor (good starting point)
   ├─ Message handling patterns
   └─ State management
   Exercise: Add logging to each message handler

2. SupervisorActor.scala
   ├─ Supervision strategies
   ├─ Actor hierarchy
   └─ Error handling
   Exercise: Trace what happens when UserActor fails

3. SessionActor.scala
   ├─ Persistent actor pattern
   ├─ Event sourcing basics
   └─ Snapshot management
   Exercise: Add a new event type

Resources:
├─ Watch: "Akka at [Company]" (internal video, 30 min)
├─ Read: Akka docs - Supervision
└─ Pair with: Alice Chen (Akka expert) - 1 hour session

DAY 9-10: Advanced Patterns
Study:
├─ NotificationActor.scala (circuit breaker pattern)
├─ OrderActor.scala (FSM pattern)
└─ PaymentActor.scala (ask pattern)

Exercise:
Build a simple actor that:
├─ Receives messages
├─ Makes async calls
├─ Handles failures
└─ Write tests using TestKit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WEEK 3: PLAY FRAMEWORK & FIRST PR
Goal: Ship your first feature

DAY 11-13: Play Controllers
Study:
1. controllers/HomeController.scala
2. controllers/api/OrderController.scala
3. conf/routes (routing configuration)

Key patterns:
├─ Action composition
├─ JSON serialization (play-json)
├─ Error handling
└─ Async responses

Exercise:
Create a new API endpoint:
POST /api/v1/hello {"name": "World"}
→ Returns: {"message": "Hello, World!"}

DAY 14-15: First Real Contribution
Pick a "good-first-issue":
├─ Recommended: Issue #234 "Add logging to OrderService"
├─ Or: Issue #189 "Update error messages"
└─ Or: Issue #201 "Add validation to UserInput"

Process:
1. Read issue description
2. Ask questions in #engineering
3. Create feature branch
4. Make changes + tests
5. Submit PR (NexusBrain will auto-review!)
6. Address review comments
7. Ship it! 🚀

Your Mentor: Bob Kumar
├─ Slack: @bob
├─ 1:1s: Tuesdays 2pm
└─ Available for questions: 9am-5pm

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY FILES BY PRIORITY

Must Read (Week 1):
├─ Application.scala ★★★★★
├─ Routes.scala ★★★★★
├─ DatabaseConfig.scala ★★★★
├─ models/User.scala ★★★★★
└─ models/Order.scala ★★★★

Should Read (Week 2):
├─ actors/UserActor.scala ★★★★★
├─ actors/SupervisorActor.scala ★★★★
├─ actors/SessionActor.scala ★★★★
└─ ActorPatterns.md (internal doc) ★★★★★

Can Read Later (Week 3+):
├─ All controller files
├─ Service layer files
└─ Infrastructure code

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARCHITECTURE OVERVIEW

Our system follows this structure:

HTTP Request
    ↓
Play Controller (validates, routes)
    ↓
Actor System (business logic)
    ├─ UserActor
    ├─ OrderActor
    └─ PaymentActor
    ↓
Repository Layer (database)
    ↓
PostgreSQL

Key Patterns:
├─ CQRS: Commands vs Queries separated
├─ Event Sourcing: All changes as events
├─ Actor Supervision: Self-healing system
└─ Circuit Breakers: Fault tolerance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMON GOTCHAS (Learn from others' mistakes!)

⚠️  DON'T block in actors
Bad:  val result = Await.result(future, 5.seconds)
Good: future.pipeTo(sender())

⚠️  DON'T forget supervision strategies
Every parent actor needs:
override val supervisorStrategy = OneForOneStrategy() { ... }

⚠️  DON'T use Try/Catch in actors
Let it fail! Supervisor will handle it.

⚠️  DO write tests for everything
Minimum 80% coverage enforced by CI

⚠️  DO use type-safe config
Never hardcode values, use: config.getString("db.url")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUCCESS METRICS

Week 1:
✓ Dev environment working
✓ Tests passing locally
✓ Understand 5 core files
✓ Complete 1 exercise

Week 2:
✓ Understand actor system
✓ Complete 3 actor exercises
✓ Pair session with mentor
✓ Ask smart questions!

Week 3:
✓ Submit first PR
✓ Pass code review
✓ Merge to main
✓ Ship something! 🎉

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RESOURCES

Documentation:
├─ Internal Wiki: https://wiki.company.com
├─ API Docs: https://api-docs.company.com
└─ Architecture Diagrams: /docs/architecture/

Videos:
├─ "Akka at [Company]" (30 min)
├─ "Our Event Sourcing Implementation" (45 min)
└─ "Debugging Production Issues" (20 min)

Slack Channels:
├─ #engineering-help (ask anything!)
├─ #akka-users (actor questions)
├─ #onboarding (other new engineers)
└─ #wins (celebrate your PRs!)

People:
├─ Mentor: Bob Kumar (@bob)
├─ Akka Expert: Alice Chen (@alice)
├─ Architecture: David Park (@david)
└─ Your Manager: [Name]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT STEPS

1. Save this plan to a file
2. Set up 1:1 with Bob (your mentor)
3. Start Day 1 activities
4. Ask questions in #onboarding
5. Use NexusBrain anytime: `nexus ask "..."`

Welcome to the team! 🚀
```

---

### Use Case 5: Incident Response

**Question**: "What's causing this production error?"

**When to use**:
- Production incidents
- Debugging complex issues
- Root cause analysis
- Finding who can help

**Example**:
```bash
nexus ask "PaymentService is throwing ActorInitializationException. What could cause this and who can help?"
```

**Response**:
```
INCIDENT ANALYSIS - PaymentService ActorInitializationException

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

POTENTIAL ROOT CAUSES (ranked by likelihood):

1. Database Connection Failure (85% match) 🔴 MOST LIKELY

   EVIDENCE:
   ├─ PaymentService requires DB in constructor:
   │  File: PaymentService.scala:23
   │  Code: class PaymentService(db: Database)
   │
   ├─ Recent change to database config:
   │  PR #892 by Carol Martinez (merged 2 days ago)
   │  Changed: connection pool settings
   │  Files: application.conf:45-52
   │
   └─ Historical pattern:
       3 similar incidents in last 6 months
       All caused by DB connection issues

   DIAGNOSTIC STEPS:
   1. Check DB connection pool:
      $ tail -f logs/application.log | grep "HikariPool"
   2. Verify connection string:
      $ cat /config/application.conf | grep "db.url"
   3. Test DB connectivity:
      $ nc -zv db-prod.company.com 5432

   QUICK FIX:
   Rollback PR #892 if DB connection is root cause

2. Missing Supervision Strategy (60% match) ⚠️  POSSIBLE

   EVIDENCE:
   ├─ Child actors created without supervisor:
   │  File: PaymentService.scala:45-67
   │  Missing: supervisorStrategy definition
   │
   └─ Pattern in error message:
       "ActorInitializationException" often indicates
       supervision misconfiguration

   DIAGNOSTIC STEPS:
   1. Check if child actors are failing:
      Search logs for: "PaymentProcessorActor" failures
   2. Review supervision hierarchy:
      $ nexus ask "Show me supervision hierarchy for PaymentService"

   FIX:
   Add supervision strategy:
   ```scala
   override val supervisorStrategy = OneForOneStrategy() {
     case _: PaymentException => Restart
     case _: Exception => Escalate
   }
   ```

3. Stripe API Configuration (40% match) ⚠️  LESS LIKELY

   EVIDENCE:
   ├─ External API call in actor initialization:
   │  File: PaymentService.scala:30
   │  Code: stripeClient = new StripeClient(apiKey)
   │
   └─ API keys loaded from environment

   DIAGNOSTIC STEPS:
   1. Verify Stripe API key:
      $ env | grep STRIPE_API_KEY
   2. Test Stripe connectivity:
      $ curl https://api.stripe.com/v1/charges \
        -u $STRIPE_API_KEY:

   FIX:
   Check environment variables in production

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHO CAN HELP (Experts ranked):

1. Alice Chen ⭐ CONTACT FIRST
   Expertise: PaymentService (8.5/10)

   ├─ 15 commits to PaymentService.scala
   ├─ Fixed similar issue 3 months ago (PR #654)
   ├─ Last active: 1 day ago
   └─ Usually responds in: < 30 minutes

   Contact: alice@company.com | Slack: @alice
   Current: Online 🟢

2. Bob Kumar
   Expertise: Akka Actors (7.2/10)

   ├─ 8 PR reviews on payment code
   ├─ Expert in actor supervision
   └─ Last active: 2 hours ago

   Contact: bob@company.com | Slack: @bob
   Current: Offline (back at 2pm)

3. Carol Martinez (Author of recent change)
   Recent: Changed DB config in PR #892

   ├─ May have context on DB changes
   └─ Last active: 30 minutes ago

   Contact: carol@company.com | Slack: @carol
   Current: Online 🟢

RECOMMENDATION:
1. Message Alice immediately (she's online)
2. CC Carol (recent DB change author)
3. Bob as backup if Alice unavailable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECENT CHANGES (Last 7 days):

PR #892 - "Update database connection pool" ⚠️  SUSPICIOUS
├─ Author: Carol Martinez
├─ Merged: 2 days ago
├─ Files: application.conf (DB config)
├─ Changes:
│  - connection-pool-size: 20 → 10 (REDUCED!)
│  - connection-timeout: 30s → 10s (REDUCED!)
│  └─ max-lifetime: 1800s → 600s (REDUCED!)
│
└─ Timing: Incident started ~6 hours after merge

PR #887 - "Add payment retry logic"
├─ Author: Bob Kumar
├─ Merged: 5 days ago
├─ Files: PaymentService.scala
└─ Risk: Low (no initialization changes)

RECOMMENDATION:
Strong correlation with PR #892
→ Rollback DB config changes as first step

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BLAST RADIUS (What's affected):

CRITICAL SERVICES DOWN:
🔴 Order checkout (uses PaymentService)
🔴 Subscription billing (uses PaymentService)
🔴 Refund processing (uses PaymentService)

ESTIMATED USERS AFFECTED:
├─ Active checkouts: ~200 users/hour
├─ Daily subscriptions: ~50 renewals/day
└─ Total potential impact: 5,000 users/day

USER-FACING SYMPTOMS:
├─ "Payment processing failed" errors
├─ Checkout button disabled
└─ Subscription renewal failures

BUSINESS IMPACT:
├─ Revenue at risk: ~$50K/day
├─ Customer support tickets: +30/hour
└─ SLA breach: YES (target: 99.9% uptime)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDED ACTIONS (in order):

IMMEDIATE (Next 5 minutes):
1. ✓ Contact Alice Chen (expert)
2. ✓ Check database connection logs
3. ✓ Verify DB connection pool not exhausted

SHORT-TERM (Next 30 minutes):
4. If DB issue confirmed:
   → Rollback PR #892 (revert DB config)
   → Deploy to production
   → Monitor for 15 minutes

5. If not DB issue:
   → Enable debug logging for PaymentService
   → Collect stack traces
   → Review with Alice

LONG-TERM (After incident):
6. Post-mortem meeting
7. Add monitoring for ActorInitializationException
8. Add database connection alerts
9. Update runbook with this scenario

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RUNBOOK LINKS:

├─ Rollback Procedure: https://wiki.company.com/runbooks/rollback
├─ Database Debugging: https://wiki.company.com/runbooks/db-debug
├─ Actor Troubleshooting: https://wiki.company.com/runbooks/akka
└─ Incident Response: https://wiki.company.com/runbooks/incidents

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIMILAR PAST INCIDENTS:

Incident #234 (3 months ago):
├─ Error: Same - ActorInitializationException
├─ Cause: DB connection pool exhausted
├─ Fix: Increased pool size
├─ Resolution time: 45 minutes
└─ Resolved by: Alice Chen

Incident #187 (6 months ago):
├─ Error: Similar - Actor startup failure
├─ Cause: Missing environment variable
├─ Fix: Added STRIPE_API_KEY to prod
└─ Resolution time: 2 hours

PATTERN: 90% of PaymentService initialization errors
         are database-related

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next: Message Alice immediately!
Sample message:

"@alice PaymentService down with ActorInitializationException.
 Likely DB connection issue from PR #892 (2 days ago).
 Affected: 5K users/day, $50K revenue at risk.
 Can you help debug? I'm looking at DB connection logs now."
```

---

### Use Case 6: Code Architecture Understanding

**Question**: "How does this system/feature work?"

**When to use**:
- Understanding data flows
- Learning new features
- Documentation
- Architecture reviews

**Example**:
```bash
nexus ask "Explain how our authentication system works from login to session management"
```

**Response**:
```
AUTHENTICATION SYSTEM ARCHITECTURE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OVERVIEW

Authentication flow: Login → Validation → Token → Session → Access Control

Components involved: 7 components
├─ LoginController (entry point)
├─ AuthService (validation logic)
├─ UserRepository (user lookup)
├─ TokenService (JWT generation)
├─ SessionActor (session state)
├─ SessionManager (session lifecycle)
└─ AuthFilter (request authentication)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP-BY-STEP FLOW

1. USER SUBMITS LOGIN

   HTTP POST /api/auth/login
   {
     "email": "user@example.com",
     "password": "********"
   }

   ↓ Handled by:
   LoginController.login()
   File: controllers/api/LoginController.scala:23

2. VALIDATE CREDENTIALS

   LoginController calls:
   └─> AuthService.authenticate(email, password)
       File: services/AuthService.scala:45

   AuthService.authenticate() does:
   ├─ Lookup user: UserRepository.findByEmail(email)
   │  └─> Query: SELECT * FROM users WHERE email = ?
   │
   ├─ Verify password: BCrypt.checkpw(password, user.passwordHash)
   │  └─> Uses: BCrypt with 12 rounds
   │
   └─ Return: Either[AuthError, User]

   Possible outcomes:
   ├─ Success: User found, password matches → Right(user)
   ├─ InvalidCredentials: Wrong password → Left(InvalidCredentials)
   ├─ UserNotFound: Email doesn't exist → Left(UserNotFound)
   └─ AccountLocked: Too many attempts → Left(AccountLocked)

3. GENERATE SESSION TOKEN

   On successful auth:
   └─> TokenService.generateToken(user)
       File: services/TokenService.scala:34

   Token generation:
   ├─ Algorithm: JWT with RS256 (RSA signature)
   ├─ Claims:
   │  - sub: user.id
   │  - email: user.email
   │  - roles: user.roles
   │  - iat: current timestamp
   │  - exp: now + 24 hours
   │
   ├─ Signing: RSA private key (from config)
   └─ Output: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

4. CREATE SESSION STATE

   TokenService calls:
   └─> SessionActor ! CreateSession(userId, token)
       File: actors/SessionActor.scala:67

   SessionActor (Akka persistent actor):
   ├─ Persists event: SessionCreated(userId, token, timestamp)
   ├─ Updates state: active sessions map
   ├─ Stores in: Redis (for fast lookup)
   │  Key: session:{userId}
   │  Value: {token, createdAt, expiresAt}
   │  TTL: 24 hours
   │
   └─ Sends: SessionCreated event to SessionManager

5. RETURN TOKEN TO CLIENT

   Response:
   HTTP 200 OK
   {
     "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
     "expiresIn": 86400,
     "user": {
       "id": "user_123",
       "email": "user@example.com",
       "name": "John Doe"
     }
   }

   Client stores token (usually in localStorage)

6. SUBSEQUENT AUTHENTICATED REQUESTS

   Client sends:
   GET /api/orders
   Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

   ↓ Intercepted by:
   AuthFilter (Play Framework filter)
   File: filters/AuthFilter.scala:28

   AuthFilter.apply() does:
   ├─ Extract token from Authorization header
   ├─ Validate token:
   │  └─> TokenService.validateToken(token)
   │      ├─ Verify signature (RSA public key)
   │      ├─ Check expiration
   │      └─ Return: Either[TokenError, Claims]
   │
   ├─ If valid:
   │  └─> Add user to request context
   │      request.withAttrs(UserAttr -> user)
   │
   └─ If invalid:
       └─> Return 401 Unauthorized

7. SESSION LIFECYCLE MANAGEMENT

   SessionManager (background actor):
   File: actors/SessionManager.scala:89

   Responsibilities:
   ├─ Monitor active sessions
   ├─ Clean up expired sessions (every 1 hour)
   ├─ Track concurrent sessions per user (max 5)
   ├─ Send session expiry warnings (2 hours before)
   └─ Emit metrics (active_sessions gauge)

   Cleanup process:
   ScheduledTask (every hour):
   ├─ Query Redis: SCAN sessions with TTL < 0
   ├─ For each expired session:
   │  └─> SessionActor ! SessionExpired(userId)
   │      ├─ Persist event
   │      ├─ Remove from Redis
   │      └─ Update metrics
   │
   └─> Emit: session_cleanups counter

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECURITY MECHANISMS

Password Hashing:
├─ Algorithm: BCrypt
├─ Rounds: 12 (configurable)
├─ Salt: Random per user
└─ Storage: users.password_hash column

Token Signing:
├─ Algorithm: RS256 (RSA with SHA-256)
├─ Key Size: 2048 bits
├─ Private Key: Stored in config (encrypted)
├─ Public Key: Embedded in app (for verification)
└─ Rotation: Every 90 days (automated)

Session Storage:
├─ Primary: Redis (in-memory, fast)
├─ Backup: PostgreSQL (persistence)
├─ Encryption: TLS in transit
└─ TTL: 24 hours (auto-expire)

Rate Limiting:
├─ Login attempts: 5 per 15 minutes per IP
├─ Token validation: 100 per minute per token
├─ Implementation: Redis counters
└─ Response: 429 Too Many Requests

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FAILURE MODES & HANDLING

1. Wrong Password
   ├─ Response: 401 Unauthorized
   ├─ Message: "Invalid credentials"
   ├─ Rate Limit: Increment attempt counter
   └─ Logging: INFO level (no sensitive data)

2. Account Locked (>5 failed attempts)
   ├─ Response: 403 Forbidden
   ├─ Message: "Account locked. Try again in 15 minutes"
   ├─ Unlock: Automatic after 15 minutes
   └─ Notification: Email to user

3. Token Expired
   ├─ Response: 401 Unauthorized
   ├─ Message: "Token expired"
   ├─ Client Action: Request new token (refresh)
   └─ UX: Redirect to login

4. Redis Down (session store)
   ├─ Fallback: Query PostgreSQL (slower)
   ├─ Circuit Breaker: After 5 failures
   ├─ Response Time: 50ms → 200ms
   └─ Alert: PagerDuty notification

5. Database Down (user lookup)
   ├─ Retry: 3 attempts with exponential backoff
   ├─ Cache: Use cached user data if available
   ├─ Circuit Breaker: After 10 failures
   └─ Response: 503 Service Unavailable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DATA FLOW DIAGRAM

```
┌──────────┐                                    ┌─────────────┐
│  Client  │───1. POST /auth/login───────────> │   Login     │
│          │   {email, password}                │ Controller  │
└──────────┘                                    └─────────────┘
                                                       │
                                                       │ 2. authenticate()
                                                       ↓
                                                ┌─────────────┐
                                                │    Auth     │
                                                │   Service   │
                                                └─────────────┘
                                                       │
                                          ┌────────────┼────────────┐
                                          │            │            │
                                    3a. findByEmail  3b. checkPassword
                                          │            │
                                          ↓            ↓
                                    ┌──────────┐  ┌─────────┐
                                    │   User   │  │  BCrypt │
                                    │Repository│  │         │
                                    └──────────┘  └─────────┘
                                          │
                                          │ 4. User
                                          ↓
                                    ┌─────────────┐
                                    │   Token     │──5. JWT
                                    │  Service    │
                                    └─────────────┘
                                          │
                                          │ 6. CreateSession
                                          ↓
                                    ┌─────────────┐
                                    │   Session   │──7. Store
                                    │   Actor     │
                                    └─────────────┘
                                          │
                                          ↓
                                    ┌─────────────┐
                                    │    Redis    │
                                    │  (Sessions) │
                                    └─────────────┘
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEY FILES

Entry Points:
├─ controllers/api/LoginController.scala
│  Main login endpoint
│  Lines: 23-67
│
└─ filters/AuthFilter.scala
   Validates all authenticated requests
   Lines: 28-89

Core Logic:
├─ services/AuthService.scala
│  Credential validation
│  Lines: 45-123
│
├─ services/TokenService.scala
│  JWT generation/validation
│  Lines: 34-178
│
└─ actors/SessionActor.scala
   Session state management
   Lines: 67-245

Data Access:
└─ repositories/UserRepository.scala
   User lookup and updates
   Lines: 89-156

Configuration:
├─ conf/application.conf
│  ├─ auth.bcrypt.rounds = 12
│  ├─ auth.token.expiry = 24h
│  ├─ auth.rateLimit.attempts = 5
│  └─ auth.rateLimit.window = 15m
│
└─ conf/routes
   HTTP routing configuration

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MONITORING & METRICS

Prometheus Metrics:
├─ auth_login_attempts_total (counter)
│  Labels: status=[success|failure], reason=[...]
│
├─ auth_login_duration_seconds (histogram)
│  Measures end-to-end login time
│
├─ auth_active_sessions (gauge)
│  Current number of active sessions
│
├─ auth_token_validations_total (counter)
│  Token validation attempts
│
└─ auth_session_expirations_total (counter)
   Session cleanups

Logging:
├─ Login attempts: INFO level
├─ Failed logins: WARN level
├─ Account lockouts: ERROR level
└─ Token validation errors: WARN level

Alerts:
├─ Login failure rate >20%: CRITICAL
├─ Average login time >2s: WARNING
├─ Redis connection failures: CRITICAL
└─ Database connection failures: CRITICAL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TESTING STRATEGY

Unit Tests:
├─ AuthService.scala: 23 tests
│  ├─ Valid credentials
│  ├─ Invalid credentials
│  ├─ Account locked
│  └─ Edge cases
│
├─ TokenService.scala: 18 tests
│  ├─ Token generation
│  ├─ Token validation
│  ├─ Expiry handling
│  └─ Signature verification
│
└─ SessionActor.scala: 15 tests
   ├─ Session creation
   ├─ Session expiry
   └─ Concurrent sessions

Integration Tests:
├─ Full auth flow: 12 tests
│  ├─ End-to-end login
│  ├─ Token usage
│  └─ Session lifecycle
│
└─ Security tests: 8 tests
   ├─ Rate limiting
   ├─ Brute force protection
   └─ Token tampering

Load Tests:
├─ Login throughput: 100 req/sec
├─ Token validation: 1000 req/sec
└─ Session lookups: 500 req/sec

Coverage: 87% (target: 80%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EVOLUTION HISTORY

v1.0 (2023-01):
├─ Basic username/password auth
├─ Sessions in PostgreSQL
└─ No rate limiting

v2.0 (2023-06):
├─ JWT tokens added
├─ Redis for session storage
└─ Rate limiting implemented

v3.0 (2024-01):
├─ BCrypt password hashing
├─ RSA token signing
└─ Account lockout mechanism

Current (v3.2):
├─ Actor-based session management
├─ Circuit breakers for resilience
└─ Comprehensive monitoring

Planned (v4.0 - Q2 2026):
├─ OAuth2/OIDC support
├─ Multi-factor authentication
└─ Biometric authentication

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHO TO CONTACT

Authentication Expert:
├─ Alice Chen (@alice)
│  Expert in AuthService and TokenService
│  15 commits, 8 PR reviews
│
└─ David Park (@david)
   Session management and actors
   12 commits to SessionActor

For Questions:
├─ #auth-security (Slack channel)
├─ Authentication Runbook: https://wiki.company.com/auth
└─ Security Team: security@company.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RELATED SYSTEMS

OAuth2 (Planned):
├─ Status: Design phase
├─ Target: Q2 2026
└─ Owner: David Park

Password Reset:
├─ Controller: PasswordResetController.scala
├─ Flow: Email → Token → Reset
└─ Expert: Alice Chen

Email Verification:
├─ Controller: EmailVerificationController.scala
├─ Actor: VerificationActor.scala
└─ Expert: Bob Kumar

Two-Factor Auth (Planned):
├─ Status: Backlog
├─ Priority: P1
└─ Estimate: 3 sprints
```

---

### Use Case 7: Code Review Assistance

**Question**: "Review this code/PR for issues"

**When to use**:
- Before submitting PR
- During code review
- Learning best practices
- Quality checks

**Example**:
```bash
nexus ask "Review PR #3456 for potential issues and best practices"
```

**Response**:
```
CODE REVIEW - PR #3456

PR Title: "Add payment retry logic with exponential backoff"
Author: Bob Kumar
Files Changed: 5
Lines: +120, -45

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUMMARY

Overall Assessment: GOOD with minor improvements needed

✅ Strengths:
├─ Well-structured retry logic
├─ Good error handling with Either
├─ Comprehensive test coverage (85%)
└─ Clear documentation in code

⚠️  Areas for Improvement:
├─ Missing supervision strategy in one actor
├─ Synchronous DB call in critical path
├─ Could benefit from circuit breaker
└─ Minor: Some methods could use more descriptive names

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DETAILED ANALYSIS

FILE 1: PaymentService.scala
Changes: +85 lines, -30 lines
Complexity Change: +15 (was 45, now 60)

✅ GOOD PATTERNS:

Lines 45-67: Retry logic implementation
```scala
def processPayment(order: Order): Future[Either[PaymentError, Payment]] = {
  retryWithBackoff(
    attempt = () => stripeClient.charge(order.amount),
    maxRetries = 3,
    initialDelay = 1.second
  )
}
```
✓ Clean implementation
✓ Uses Future for async
✓ Good separation of concerns

Lines 78-92: Error handling
```scala
result match {
  case Right(payment) =>
    logger.info(s"Payment successful: ${payment.id}")
    Right(payment)
  case Left(PaymentDeclined(reason)) =>
    logger.warn(s"Payment declined: $reason")
    Left(PaymentDeclined(reason))
  case Left(error) =>
    logger.error(s"Payment failed: $error")
    Left(error)
}
```
✓ Comprehensive error cases
✓ Appropriate logging levels
✓ Type-safe with Either

⚠️  ISSUES TO ADDRESS:

Line 89: Synchronous database call
```scala
val payment = Await.result(db.savePayment(paymentData), 5.seconds)
```
❌ Blocking call in async context
❌ Defeats purpose of using Future
❌ Can cause thread pool exhaustion

RECOMMENDATION:
```scala
// Don't use Await - keep it async
db.savePayment(paymentData).map { payment =>
  // Continue async chain
  notifyPaymentSuccess(payment)
}
```

Lines 45-120: Missing circuit breaker
Current: Calls Stripe API directly
Risk: If Stripe is down, requests pile up

RECOMMENDATION:
```scala
import akka.pattern.CircuitBreaker

val breaker = new CircuitBreaker(
  scheduler = system.scheduler,
  maxFailures = 5,
  callTimeout = 10.seconds,
  resetTimeout = 1.minute
)

def processPayment(order: Order) = {
  breaker.withCircuitBreaker {
    stripeClient.charge(order.amount)
  }.recover {
    case _: CircuitBreakerOpenException =>
      Left(ServiceUnavailable("Payment service temporarily unavailable"))
  }
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE 2: PaymentActor.scala
Changes: +45 lines, -10 lines

⚠️  CRITICAL ISSUE:

Missing supervision strategy
```scala
class PaymentActor extends Actor {
  // Creating child actors without supervision!
  val retryActor = context.actorOf(Props[RetryActor], "retry")
  val notificationActor = context.actorOf(Props[NotificationActor], "notification")

  def receive = {
    case ProcessPayment(order) => ...
  }
}
```

❌ No supervisorStrategy defined
❌ Child actors will use default (restart on any exception)
❌ May not be appropriate for payment failures

RECOMMENDATION:
```scala
class PaymentActor extends Actor {

  // Add explicit supervision strategy
  override val supervisorStrategy = OneForOneStrategy(
    maxNrOfRetries = 3,
    withinTimeRange = 1.minute
  ) {
    case _: PaymentDeclinedException =>
      // Don't restart on declined payments - this is expected
      Resume

    case _: StripeApiException =>
      // Restart on API errors - might be transient
      Restart

    case _: Exception =>
      // Escalate unexpected errors to parent
      Escalate
  }

  val retryActor = context.actorOf(Props[RetryActor], "retry")
  val notificationActor = context.actorOf(Props[NotificationActor], "notification")

  def receive = {
    case ProcessPayment(order) => ...
  }
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE 3: RetryActor.scala
Changes: +30 lines (new file)

✅ EXCELLENT IMPLEMENTATION:

Exponential backoff logic:
```scala
def calculateDelay(attempt: Int): FiniteDuration = {
  val delay = initialDelay * math.pow(2, attempt).toLong
  val jitter = Random.nextDouble() * 0.3 * delay
  FiniteDuration((delay + jitter).toLong, TimeUnit.MILLISECONDS)
}
```
✓ Exponential backoff: 1s, 2s, 4s, 8s...
✓ Jitter added (prevents thundering herd)
✓ Well-documented

Minor suggestion (Line 45):
```scala
// Consider making max delay configurable
val maxDelay = 30.seconds // Currently hardcoded
```

RECOMMENDATION:
```scala
// Load from config
val maxDelay = config.getDuration("payment.retry.maxDelay", 30.seconds)
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE 4: PaymentServiceSpec.scala
Changes: +55 lines

✅ GOOD TEST COVERAGE:

Test categories:
├─ Happy path: Payment succeeds first try ✓
├─ Retry logic: Payment succeeds on retry 2 ✓
├─ Max retries: Payment fails after 3 retries ✓
├─ Declined payment: No retry on decline ✓
├─ Network error: Retries on network failure ✓
└─ Timeout: Handles timeout correctly ✓

Coverage: 85% (above 80% threshold) ✓

⚠️  MISSING TESTS:

1. Circuit breaker behavior
   - Test when breaker opens
   - Test when breaker closes
   - Test fallback behavior

2. Concurrent payment processing
   - Multiple payments at once
   - Thread safety

3. Edge cases:
   - Retry delay calculation edge cases
   - Max delay boundary
   - Very large amounts

RECOMMENDATION:
Add these 8 tests to reach 95% coverage

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FILE 5: application.conf
Changes: +10 lines

✅ GOOD CONFIGURATION:

```hocon
payment {
  retry {
    maxAttempts = 3
    initialDelay = 1 second
    maxDelay = 30 seconds
  }

  stripe {
    timeout = 10 seconds
  }
}
```

✓ Sensible defaults
✓ Well-organized
✓ Clear naming

Minor: Consider adding:
```hocon
payment {
  circuit-breaker {
    max-failures = 5
    call-timeout = 10 seconds
    reset-timeout = 1 minute
  }
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPACT ANALYSIS

Downstream Effects:
├─ OrderController.scala: Uses PaymentService
│  Impact: MEDIUM (need to handle new error cases)
│
├─ CheckoutActor.scala: Calls PaymentService
│  Impact: LOW (already handles payment failures)
│
└─ SubscriptionBillingActor.scala: Monthly charges
   Impact: HIGH (needs circuit breaker awareness)

BREAKING CHANGES: None detected ✓

New Error Cases:
Applications using PaymentService should handle:
├─ ServiceUnavailable (circuit breaker open)
├─ MaxRetriesExceeded (new error type)
└─ RetryScheduled (informational)

RECOMMENDATION:
Document new error cases in API docs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEST PRACTICES CHECK

✅ Follows team conventions:
├─ Scala style guide compliance
├─ Error handling with Either
├─ Async with Future
├─ Actor patterns
└─ Test coverage >80%

✅ Security:
├─ No hardcoded secrets
├─ Logging doesn't expose sensitive data
└─ Input validation present

✅ Performance:
├─ Non-blocking operations (except Line 89 - fix this!)
├─ Efficient retry logic
└─ Bounded retries (prevents infinite loops)

⚠️  Could improve:
├─ Add circuit breaker (recommended)
├─ Fix synchronous DB call (required)
├─ Add supervision strategy (required)
└─ More edge case tests (nice-to-have)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPLEXITY METRICS

Before PR:
├─ PaymentService.scala: Complexity 45
├─ Total methods: 12
└─ Average method length: 15 lines

After PR:
├─ PaymentService.scala: Complexity 60 (+15)
├─ Total methods: 15 (+3)
└─ Average method length: 18 lines (+3)

Assessment:
⚠️  Complexity increased but still acceptable (threshold: 70)
✓ Methods stayed reasonably sized (<25 lines)
✓ New complexity is justified (retry logic)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUGGESTED REVIEWERS

Primary Reviewer (REQUIRED):
└─ Alice Chen (@alice)
   Expertise: PaymentService (8.5/10), Akka actors (8.5/10)
   Reason: Owns PaymentService.scala, expert in actor supervision

Secondary Reviewer (OPTIONAL):
└─ David Park (@david)
   Expertise: Retry patterns (7.2/10)
   Reason: Implemented similar retry logic in OrderService

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ACTION ITEMS FOR AUTHOR

REQUIRED (before merge):
1. ❌ Fix synchronous DB call (Line 89 in PaymentService.scala)
   Make it async: db.savePayment(...).map { ... }

2. ❌ Add supervision strategy to PaymentActor
   See recommendation above

RECOMMENDED (before merge):
3. ⚠️  Add circuit breaker to Stripe API calls
   Prevents cascading failures

4. ⚠️  Add 8 missing tests
   Circuit breaker, concurrency, edge cases

5. ⚠️  Make maxDelay configurable
   Move from hardcoded to config file

NICE-TO-HAVE (can do in follow-up PR):
6. 💡 Add monitoring metrics
   - payment_retry_attempts_total
   - payment_circuit_breaker_state
   - payment_processing_duration

7. 💡 Document new error cases
   Update API documentation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OVERALL RECOMMENDATION

Status: APPROVE with changes required

The PR implements a solid retry mechanism with good test coverage.
However, there are 2 critical issues that must be fixed:

1. Synchronous DB call (defeats async architecture)
2. Missing supervision strategy (could cause unexpected behavior)

Once these are addressed, this PR will be ready to merge.

Estimated time to address issues: 2-3 hours

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next steps:
1. Address required issues (1-2 above)
2. Request re-review from @alice
3. Merge after approval
```

---

### Use Case 8: Knowledge Transfer Planning

**Question**: "Plan knowledge transfer for departing team member"

**When to use**:
- Team member leaving
- Role transitions
- Succession planning
- Risk mitigation

**Example**:
```bash
nexus ask "Alice Chen is leaving in 6 weeks. What knowledge needs to be transferred and how should we do it?"
```

**Response**:
```
KNOWLEDGE TRANSFER PLAN - Alice Chen

Timeline: 6 weeks
Risk Level: HIGH (critical expertise areas)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALICE'S EXPERTISE PROFILE

Overall Expertise Score: 8.7/10 (Top 2% of team)

Contributions:
├─ Commits: 287 (12% of codebase)
├─ PR Reviews: 156 (active reviewer)
├─ Last Active: Yesterday
└─ Tenure: 2.5 years

Core Areas:
├─ Akka Actor Supervision: 9.2/10 ⭐ CRITICAL
├─ Event Sourcing: 8.7/10 ⭐ CRITICAL
├─ Payment Integration: 8.5/10 ⭐ CRITICAL
├─ Authentication System: 7.8/10
└─ Performance Optimization: 7.2/10

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL KNOWLEDGE AREAS

Area 1: Akka Actor Supervision (RISK: HIGH)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Knowledge Level: Alice is ONLY expert
├─ Alice: 9.2/10
├─ Next best: Bob (5.1/10) - Significant gap!
└─ Bus factor: 1 ⚠️  SINGLE POINT OF FAILURE

Files at Risk: 12 supervision-related files
├─ SupervisorActor.scala (89% Alice's code)
├─ ActorConfig.scala (67% Alice's code)
├─ BackoffSupervisor.scala (78% Alice's code)
└─ 9 more files...

What could go wrong:
├─ Supervision strategy bugs (hard to debug)
├─ Actor hierarchy misconfigurations
├─ Escalation failures
└─ Memory leaks from improper actor cleanup

Recent Incidents Resolved by Alice:
├─ Feb 2026: Fixed actor restart loop (8 hours downtime)
├─ Dec 2025: Debugged memory leak in SessionActor
└─ Oct 2025: Corrected supervision in PaymentActor

TRANSFER PLAN:

Week 1-2: Documentation
├─ Alice documents:
│  - Supervision patterns used in codebase
│  - Common pitfalls and how to avoid them
│  - Debugging guide for actor issues
│  - Decision tree for choosing strategies
│
└─ Deliverables:
   - "Actor Supervision Guide" (wiki page)
   - "Troubleshooting Runbook" (runbook)
   - Architecture diagram with supervision hierarchy

Week 3-4: Pair Programming
├─ Bob shadows Alice on:
│  - Next supervision-related PR
│  - Live debugging session (simulated failure)
│  - Code walkthrough of critical actors
│
└─ Exercises:
   - Bob implements new supervised actor (with Alice review)
   - Bob debugs test scenario (Alice observes)

Week 5-6: Validation
├─ Bob takes ownership:
│  - Reviews all supervision PRs this week
│  - Debugs production issue (if any)
│  - Teaches another engineer (validates understanding)
│
└─ Knowledge quiz:
   - Alice asks Bob 10 supervision questions
   - Must score 8/10 to pass

Estimated Transfer Time: 4-6 weeks FULL transfer
Recommended: Start immediately!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Area 2: Event Sourcing (RISK: HIGH)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Knowledge Level: Alice primary, David secondary
├─ Alice: 8.7/10
├─ David: 6.5/10 (decent fallback)
└─ Bus factor: 2 (better than Area 1)

Files at Risk: 8 event sourcing files
├─ EventStore.scala (Alice: 78% ownership)
├─ EventSourcingActor.scala (Alice: 65%)
└─ 6 more files...

Complexity:
├─ CQRS implementation (complex pattern)
├─ Event replay logic (tricky to debug)
├─ Snapshot management (performance critical)
└─ Schema evolution (needs careful planning)

TRANSFER PLAN:

Week 1-2: Document & Video
├─ Alice creates:
│  - "Event Sourcing at [Company]" guide
│  - Video walkthrough (30 min recording)
│  - Common issues and solutions
│
└─ David reviews and asks questions

Week 3-4: Pair Sessions
├─ 2-hour deep dive with David
├─ Walk through recent event schema migration
└─ David implements new event type (with Alice review)

Week 5: Handoff
├─ David owns EventStore.scala
├─ David reviews all event sourcing PRs
└─ Alice available for questions

Estimated Transfer Time: 3-4 weeks
Risk after transfer: MEDIUM (David can handle)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Area 3: Payment Integration (RISK: MEDIUM)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Knowledge Level: Shared with Carol
├─ Alice: 8.5/10
├─ Carol: 7.8/10 (close!)
└─ Bus factor: 2 (acceptable)

Files:
├─ PaymentService.scala (Alice: 60%, Carol: 30%)
├─ StripeClient.scala (Alice: 55%, Carol: 35%)
└─ 5 more files...

TRANSFER PLAN:

Week 1: Documentation
├─ Alice documents:
│  - Stripe API integration details
│  - Payment flow diagrams
│  - Error handling strategies
│
└─ Carol reviews

Week 2-3: Knowledge Gaps
├─ Identify what Carol doesn't know
├─ 1-hour session to fill gaps
└─ Carol takes full ownership

Estimated Transfer Time: 2 weeks
Risk after transfer: LOW (Carol ready)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AREAS WITH LOW RISK

✅ Authentication System
   David (7.9/10) can take over
   Transfer time: 1 week

✅ REST API Development
   Multiple experts: David (8.5), Eve (7.8)
   No transfer needed

✅ Database/Slick
   Bob (8.9) is primary expert
   No transfer needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OVERALL TRANSFER TIMELINE

Week 1 (Documentation Sprint):
├─ Mon-Tue: Alice writes supervision guide
├─ Wed-Thu: Alice writes event sourcing guide
├─ Fri: Alice records video walkthroughs
└─ Deliverable: 3 wiki pages, 2 videos

Week 2 (Review & Questions):
├─ Bob/David review documentation
├─ Prepare questions list
├─ 2-hour Q&A session with Alice
└─ Deliverable: Clarified documentation

Week 3 (Hands-On - Supervision):
├─ Bob shadows Alice on supervision work
├─ Pair programming: 8 hours this week
├─ Bob implements test actor (Alice reviews)
└─ Deliverable: Bob's first supervised actor

Week 4 (Hands-On - Event Sourcing):
├─ David deep dive with Alice
├─ Review event schema evolution
├─ David implements new event type
└─ Deliverable: David's first event migration

Week 5 (Ownership Transition):
├─ Bob reviews all supervision PRs
├─ David owns event sourcing PRs
├─ Carol takes full payment ownership
└─ Alice in "advisor" role (not primary)

Week 6 (Validation & Final Handoff):
├─ Knowledge quiz for Bob (supervision)
├─ David handles event sourcing issue solo
├─ Final Q&A session
└─ Alice's last day

Post-Departure:
├─ Alice available via email (1 month)
├─ Bob/David can reach out with questions
└─ Monthly check-in (optional)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDED TEAM ASSIGNMENTS

After Alice leaves:

Akka Actor Supervision:
├─ Primary: Bob Kumar (after training)
├─ Backup: Carol Martinez (learn from Bob)
└─ Consultant: External Akka expert (if needed)

Event Sourcing:
├─ Primary: David Park
├─ Backup: Bob Kumar
└─ Paired ownership (both review each other's PRs)

Payment Integration:
├─ Primary: Carol Martinez
├─ Backup: Bob Kumar
└─ Fully transferred ✓

Authentication:
├─ Primary: David Park (already owns this)
└─ No change needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RISK MITIGATION

Immediate Actions (This Week):
1. ❌ START supervision knowledge transfer NOW
   (Don't wait - this is critical!)

2. ❌ Record Alice's next debugging session
   (Live problem-solving is invaluable)

3. ❌ Create "Ask Alice Anything" doc
   (Team submits questions, Alice answers in writing)

Medium-Term (Month 1-2):
4. ⚠️  Hire Akka consultant (2-day workshop)
   Validate Bob's supervision knowledge

5. ⚠️  Cross-train Carol on event sourcing
   Reduce David as single point of failure

6. ⚠️  Document all Alice's code with extra comments
   Future maintainability

Long-Term (Month 3-6):
7. 💡 Build team expertise in Akka
   Send Bob/David to Akka training

8. 💡 Hire another Akka-experienced engineer
   Reduce bus factor to 3+

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUCCESS METRICS

Week 2:
✓ Documentation complete (3 guides, 2 videos)
✓ Team has reviewed and asked questions

Week 4:
✓ Bob completed 1 supervision PR solo
✓ David completed 1 event sourcing task solo

Week 6:
✓ Bob scored 8/10 on supervision quiz
✓ David handled event issue without Alice
✓ Carol fully owns payments

Month 3 (Post-Departure):
✓ Zero production incidents from knowledge gaps
✓ Bob/David confident in their areas
✓ Team velocity unchanged

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ESTIMATED IMPACT

Best Case (Full Transfer Success):
├─ Knowledge successfully transferred
├─ Bob becomes supervision expert (6 months)
├─ David solid on event sourcing
└─ Team velocity: -5% temporary dip, recovers in 2 months

Likely Case (Partial Transfer):
├─ 80% knowledge transferred
├─ Some areas need external help initially
├─ Team velocity: -15% for 3 months
└─ Full recovery in 6 months

Worst Case (Poor Transfer):
├─ <50% knowledge transferred
├─ Production incidents from supervision issues
├─ Need to hire Akka consultant ($$$)
├─ Team velocity: -30% for 6 months
└─ Recovery time: 9-12 months

RECOMMENDATION:
Invest heavily in transfer NOW to avoid worst case!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ACTION ITEMS

For Alice:
├─ Week 1: Write documentation (supervision, event sourcing, payments)
├─ Week 2-4: Pair programming sessions (8 hours/week)
├─ Week 5-6: Advisor role, validate team readiness
└─ Post-departure: Email availability (1 month)

For Bob:
├─ Week 1: Review supervision documentation
├─ Week 2-4: Shadow Alice, practice supervision
├─ Week 5: Take ownership of supervision PRs
└─ Week 6: Pass knowledge quiz (8/10 required)

For David:
├─ Week 1: Review event sourcing documentation
├─ Week 3-4: Deep dive with Alice
├─ Week 5: Own event sourcing PRs
└─ Week 6: Handle production event issue solo

For Carol:
├─ Week 1-2: Review payment documentation
├─ Week 3: Session with Alice to fill gaps
├─ Week 4+: Full ownership of payments
└─ No quiz needed (already expert-level)

For Manager:
├─ Week 1: Approve knowledge transfer plan
├─ Week 1: Free up Bob/David time (reduce other work)
├─ Week 4: Check progress, adjust if needed
├─ Week 6: Validate readiness before Alice leaves
└─ Month 1-3: Monitor team velocity and incidents

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FINAL RECOMMENDATION

Alice leaving creates HIGH RISK in 2 areas:
1. Akka Actor Supervision (Bob needs 4-6 weeks training)
2. Event Sourcing (David needs 3-4 weeks training)

SUCCESS DEPENDS ON:
├─ ✓ Starting transfer THIS WEEK (don't delay!)
├─ ✓ Dedicating Bob/David time (reduce other work)
├─ ✓ Comprehensive documentation from Alice
├─ ✓ Validation via quiz/real work (not just theory)
└─ ✓ Post-departure support (Alice available via email)

With proper execution of this plan:
→ 85% chance of smooth transition
→ Team velocity recovers in 2-3 months
→ Knowledge successfully retained

Without this plan:
→ 60% chance of production incidents
→ 6-9 months to full recovery
→ May need to hire expensive consultants

RECOMMENDATION: Execute this plan starting Monday!
```

---

## Advanced Features

### Feature 1: Custom Queries with Filters

**Filter by Repository**:
```bash
nexus ask "What's the tech debt?" --repo backend-api
```

**Filter by Branch**:
```bash
nexus ask "What changed recently?" --branch develop
```

**Filter by File Pattern**:
```bash
nexus ask "Show me all actors" --files "**/*Actor.scala"
```

**Filter by Time Range**:
```bash
nexus ask "What bugs were introduced?" --since "2024-01-01" --until "2024-02-01"
```

**Combine Filters**:
```bash
nexus ask "Who worked on payments?" \
  --repo backend-api \
  --branch main \
  --files "**/payment/**" \
  --since "last 30 days"
```

---

### Feature 2: Batch Queries

**Query Multiple Things**:
```bash
nexus batch << EOF
What breaks if UserService changes?
Who knows about Akka supervision?
What's our biggest tech debt?
Show recent bugs
EOF
```

**Save Results**:
```bash
nexus batch --output results.json << EOF
List all actors
Show expertise map
Audit technical debt
EOF
```

---

### Feature 3: Export & Reporting

**Export Impact Analysis**:
```bash
nexus ask "What breaks if X changes?" --format json > impact.json
```

**Generate Weekly Report**:
```bash
nexus report weekly \
  --start "last Monday" \
  --end "today" \
  --output weekly-report.pdf
```

**Export Expertise Map**:
```bash
nexus ask "Show team expertise" --format markdown > expertise.md
```

---

### Feature 4: Saved Queries (Favorites)

**Save Frequently Used Queries**:
```bash
# Save a query
nexus save-query "tech-debt" \
  "What's our biggest technical debt in backend?"

# Run saved query
nexus run-query tech-debt

# List saved queries
nexus list-queries
```

---

## Troubleshooting

### Issue 1: "No data found for repository"

**Symptoms**:
```
Error: No data found for repository "backend-api"
```

**Cause**: Repository not scanned yet

**Fix**:
```bash
# Check scan status
nexus scan status

# Trigger scan manually
nexus scan start --repo backend-api

# Wait for completion (~30 min)
```

---

### Issue 2: "Low confidence answer"

**Symptoms**:
```
Answer: ...
Confidence: 0.45 (LOW)
```

**Cause**: Query too vague or insufficient data

**Fix**:
```bash
# ❌ Too vague
nexus ask "How does auth work?"

# ✅ More specific
nexus ask "Show me the authentication flow from LoginController to SessionActor, with all files involved"

# ❌ Too broad
nexus ask "What's wrong with the code?"

# ✅ Focused
nexus ask "What are the top 3 complexity issues in PaymentService.scala?"
```

---

### Issue 3: "API rate limit exceeded"

**Symptoms**:
```
Error: Rate limit exceeded (100 requests/minute)
Please try again in 45 seconds
```

**Fix**:
```bash
# Check usage
nexus usage

# Wait for reset
# Or upgrade quota (for heavy users)
```

---

### Issue 4: Slow Queries

**Symptoms**: Query takes >30 seconds

**Possible Causes**:
1. Very complex question (agent-level)
2. Large result set
3. First query after scan (cache warming)

**Optimization**:
```bash
# Use more specific queries
nexus ask "What breaks in OrderService?" --files "OrderService.scala"

# Instead of
nexus ask "What breaks in the entire codebase?"
```

---

### Issue 5: Outdated Results

**Symptoms**: Results don't reflect recent code changes

**Fix**:
```bash
# Trigger incremental scan
nexus scan update

# Or full rescan
nexus scan start --force

# Usually updates within 5 minutes
```

---

## Tips for Effective Usage

### Tip 1: Be Specific

**❌ Vague**:
- "How does this work?"
- "Is this good?"
- "What should I do?"

**✅ Specific**:
- "Explain the payment flow from OrderController to StripeClient"
- "Review PaymentService.scala for best practices violations"
- "What's the safest way to refactor UserActor given its 23 dependencies?"

---

### Tip 2: Use Context

**Include relevant details**:
```
"I'm seeing ActorInitializationException in PaymentService.
The error started 6 hours ago after PR #892 was merged.
What could be the root cause and who can help?"
```

Much better than:
```
"PaymentService is broken, help!"
```

---

### Tip 3: Iterate

**Start broad, then narrow**:
```bash
# Step 1: Overview
nexus ask "What are the main components of the payment system?"

# Step 2: Drill down
nexus ask "Explain how PaymentService handles retries"

# Step 3: Specific question
nexus ask "What happens if Stripe API times out during payment?"
```

---

### Tip 4: Verify Citations

**Always check sources**:
```
AI says: "UserService has 23 dependencies"

Citation: [UserService.scala:15-89]
          [Dependency analysis based on import statements]

→ Click through and verify manually
```

---

### Tip 5: Provide Feedback

**Help improve accuracy**:
```bash
# Thumbs up/down on results
nexus feedback --query-id abc123 --rating good

# Report incorrect information
nexus feedback --query-id abc123 --rating wrong \
  --comment "Actually only 20 dependencies, not 23"
```

---

**End of Step-by-Step Usage Guide**

For more help:
- CLI: `nexus --help`
- Documentation: https://docs.nexusbrain.ai
- Support: #design-partner-support (Slack)
