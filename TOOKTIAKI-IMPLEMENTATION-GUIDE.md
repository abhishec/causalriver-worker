# 🛠️ NexusBrain Implementation Guide for Tooktiaki

**How to Actually Use the System - Step by Step**

---

## 📋 OVERVIEW

This guide shows you **exactly how** to:
1. Connect your GitHub repos
2. Let AI scan your codebase
3. Start asking questions
4. Use it daily in your workflow

**Time to first query: 35 minutes**

---

## 🚀 PHASE 1: SETUP (Day 1 - 1 Hour)

### **Step 1.1: Install GitHub App** (5 minutes)

**What happens**: NexusBrain reads your code to build knowledge graph

**Actions**:
```bash
# 1. Go to GitHub App installation page
https://github.com/apps/nexusbrain

# 2. Click "Install"

# 3. Select organization
→ Choose: tooktiaki

# 4. Select repositories
→ Choose specific repos:
   ✓ tooktiaki-core (500K lines Scala/Akka)
   ✓ tooktiaki-api (150K lines Play Framework)

# 5. Grant permissions (read-only):
   ✓ Read code
   ✓ Read pull requests
   ✓ Read issues
   ✓ Read commits
   ✗ NO write access (read-only!)

# 6. Click "Install"
```

**Result**: GitHub App installed, ready to scan repos

---

### **Step 1.2: Generate API Key** (2 minutes)

**What happens**: Get your authentication token

**Actions**:
```bash
# 1. Log in to NexusBrain dashboard
https://dashboard.nexusbrain.ai/login

# 2. Navigate to Settings → API Keys

# 3. Click "Generate New Key"
   Name: "Tooktiaki Production"
   Tier: Design Partner (2x quotas)
   Expiry: Never (for pilot)

# 4. Copy your API key
   Format: nb_tooktiaki_xxxxxxxxxxxxxxxxxx

# 5. Store securely
   ⚠️ IMPORTANT: Save to password manager
   ⚠️ Never commit to Git
```

**Result**: You now have `nb_tooktiaki_xxxxxxxxxxxxxxxxxx`

---

### **Step 1.3: Configure Environment** (3 minutes)

**What happens**: Set up local development environment

**Actions**:
```bash
# Add to your ~/.bashrc or ~/.zshrc
export NEXUSBRAIN_API_KEY="nb_tooktiaki_xxxxxxxxxxxxxxxxxx"
export NEXUSBRAIN_ORG_ID="org_tooktiaki_001"

# Or use .env file (recommended)
cat > .env << EOF
NEXUSBRAIN_API_KEY=nb_tooktiaki_xxxxxxxxxxxxxxxxxx
NEXUSBRAIN_ORG_ID=org_tooktiaki_001
NEXUSBRAIN_API_URL=https://api.nexusbrain.ai
EOF

# Reload shell
source ~/.bashrc  # or source ~/.zshrc
```

**Result**: Environment configured, ready to use

---

### **Step 1.4: Install CLI (Optional)** (5 minutes)

**What happens**: Get command-line tool for easy queries

**Actions**:
```bash
# Install via npm
npm install -g @nexusbrain/cli

# Or via Homebrew (Mac)
brew install nexusbrain

# Or via curl (Linux)
curl -fsSL https://get.nexusbrain.ai | sh

# Verify installation
nexus --version
# Output: NexusBrain CLI v1.0.0

# Login
nexus login
# Enter API key: nb_tooktiaki_xxxxxxxxxxxxxxxxxx
# ✓ Logged in as tooktiaki (org_tooktiaki_001)

# Test connection
nexus status
# Output:
# ✓ Connected to NexusBrain
# ✓ Organization: Tooktiaki
# ✓ Tier: Design Partner
# ✓ Quotas: 200 req/min, 200K tokens/day
# ✓ Repos: 2 connected (tooktiaki-core, tooktiaki-api)
```

**Result**: CLI installed and authenticated

---

## 🔍 PHASE 2: CODEBASE SCAN (Automatic - 30 Minutes)

### **Step 2.1: Trigger Scan** (1 minute)

**What happens**: AI reads and analyzes your entire codebase

**Actions**:
```bash
# Automatic scan starts when GitHub App installed
# You can also trigger manually:

nexus scan start

# Output:
# 🔍 Scanning repositories...
# ├─ tooktiaki-core (500,234 lines)
# └─ tooktiaki-api (152,890 lines)
#
# This will take approximately 30 minutes.
# You'll receive email when complete.
```

**What AI Does** (behind the scenes):
1. **Clone repos** (5 min)
   - Downloads latest code from GitHub
   - Checks out all branches

2. **Parse code** (15 min)
   - Parses all `.scala` files
   - Extracts: objects, traits, classes, methods
   - Identifies: Akka actors, Play controllers
   - Calculates: complexity, dependencies

3. **Build graphs** (5 min)
   - **Dependency graph**: What depends on what
   - **Causal graph**: What causes what (from git history)
   - **Expertise graph**: Who knows what (from commits)
   - **Collaboration graph**: Who works with whom

4. **Train brain** (5 min)
   - Learns your patterns (naming conventions, architecture)
   - Identifies common flows (auth, payments, notifications)
   - Maps critical paths

**Result**: Full codebase indexed and ready

---

### **Step 2.2: Verify Scan Complete** (1 minute)

**What happens**: Check that scan finished successfully

**Actions**:
```bash
# Check scan status
nexus scan status

# Output:
# ✓ Scan complete (completed 25 minutes ago)
#
# SUMMARY:
# ├─ Files scanned: 1,234 Scala files
# ├─ Classes found: 856 (objects, traits, classes)
# ├─ Methods found: 6,789
# ├─ Akka actors: 89
# ├─ Play controllers: 56
# ├─ Dependencies: 654 edges
# ├─ Causal edges: 234 edges
# ├─ Contributors: 12 engineers
# └─ Expertise areas: 145 topics
#
# Status: READY FOR QUERIES ✓
```

**Result**: Scan complete, system ready to use

---

## 💬 PHASE 3: DAILY USAGE

### **Usage Method 1: CLI (Fastest)**

**When to use**: Quick questions during development

**Example 1 - Impact Analysis**:
```bash
# Ask question
nexus ask "What breaks if UserService.scala is modified?"

# Output (3 seconds):
Impact Analysis - UserService.scala

DIRECTLY AFFECTED: 23 files
├─ AuthController.scala (calls UserService.authenticate)
│  Location: src/main/scala/controllers/AuthController.scala:45
│  Reason: Direct method call to UserService.authenticate()
│
├─ SessionManager.scala (uses UserService.getUser)
│  Location: src/main/scala/services/SessionManager.scala:78
│  Reason: Fetches user via UserService.getUser()
│
├─ OrderController.scala (via SessionManager - indirect)
│  Location: src/main/scala/controllers/OrderController.scala:123
│  Impact: Indirect dependency through SessionManager
│
└─ ... [20 more files]

AKKA ACTORS IMPACTED: 5 actors
├─ UserActor (parent actor - direct dependency)
├─ SessionActor (child actor)
├─ NotificationActor (event subscriber)
├─ AuthActor (uses authentication flow)
└─ AdminActor (observes user events)

PLAY CONTROLLERS IMPACTED: 8 controllers

RISK ASSESSMENT:
├─ Risk score: 0.72 (HIGH)
├─ Critical path: YES (authentication flow)
├─ Test coverage: 78% (good)
└─ Estimated testing: 2-3 days

RECOMMENDATIONS:
1. Create feature flag for gradual rollout
2. Add integration tests for auth flow
3. Update dependent services simultaneously
4. Plan 2-week testing period

CAUSAL EDGES:
├─ UserService → AuthController (strength: 0.95)
├─ UserService → SessionManager (strength: 0.88)
└─ SessionManager → OrderController (strength: 0.67)

Query time: 2.8 seconds
Confidence: 0.92
```

**Example 2 - Find Expert**:
```bash
nexus ask "Who knows about Akka supervision strategies?"

# Output (1 second):
Top Akka Supervision Experts:

1. Alice Chen ⭐ RECOMMENDED
   Expertise Score: 8.5/10

   Contributions:
   ├─ 23 commits to supervision code
   ├─ 12 PR reviews on Akka actors
   └─ Last active: 2 days ago

   Key Files Owned:
   ├─ SupervisorActor.scala (15 commits)
   ├─ ActorConfig.scala (8 commits)
   └─ BackoffSupervisor.scala (5 commits)

   Notable Work:
   ├─ Implemented BackoffSupervisor for UserActor
   ├─ Fixed escalation bug in NotificationSupervisor
   └─ Authored "Akka Best Practices" doc

   Contact: alice@tooktiaki.com (Slack: @alice)

2. Bob Kumar
   Expertise Score: 6.2/10
   [similar details...]

RECOMMENDATION: Contact Alice Chen for supervision questions

KNOWLEDGE RISK: If Alice leaves, transfer to Bob Kumar
```

**Example 3 - Tech Debt**:
```bash
nexus ask "What's our biggest tech debt?"

# Output (5 seconds):
Technical Debt Priority List (Top 10):

CRITICAL (Fix Immediately):

1. UserActor.scala - Debt Score: 8.7/10
   Issue: God object (1,200 lines, 45 methods)
   Complexity: Cyclomatic 85 (should be <15)
   Impact: 23 dependent files

   Recommendation: Split into 3 actors
   ├─ UserActor (state management)
   ├─ UserValidator (validation logic)
   └─ UserPersistence (database operations)

   Effort: 2 weeks
   ROI: Saves 10 dev hours/month (debugging)
   Value: $15K/year

2. LegacyPaymentService.scala - Debt Score: 7.9/10
   Issue: Deprecated Stripe API v2 (EOL in 3 months!)
   Impact: $50K/month payment processing at risk

   Recommendation: Migrate to Stripe API v3
   Effort: 1 week
   ROI: Prevents payment failures
   Value: $600K/year (risk avoidance)

[... 8 more items ...]

TOTAL DEBT: 156 issues
ESTIMATED PAYOFF: 12 weeks
ANNUAL VALUE: $200K/year
```

---

### **Usage Method 2: API (For Integrations)**

**When to use**: Integrate into your tools (Slack, Jira, dashboards)

**Example - API Call**:
```bash
# Basic query
curl -X POST https://api.nexusbrain.ai/v1/query \
  -H "Authorization: Bearer nb_tooktiaki_xxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What breaks if UserService.scala is modified?",
    "scope": {
      "repositories": ["tooktiaki-core"],
      "branches": ["main", "develop"]
    }
  }'

# Response (JSON):
{
  "answer": "If UserService.scala is modified, it will affect 23 files...",
  "confidence": 0.92,
  "processingTime": 2834,
  "route": "action_domain",
  "data": {
    "affectedFiles": [
      {
        "path": "src/main/scala/controllers/AuthController.scala",
        "reason": "Direct method call to UserService.authenticate()",
        "impact": "high"
      },
      // ... more files
    ],
    "akkaActors": [
      {"name": "UserActor", "impact": "critical"},
      {"name": "SessionActor", "impact": "high"}
    ],
    "riskScore": 0.72
  },
  "citations": [
    {
      "source": "Causal: UserService → AuthController",
      "type": "causal_edge",
      "content": "UserService causes AuthController (strength: 0.95)"
    }
  ]
}
```

**Example - Streaming Response** (for real-time UIs):
```javascript
// JavaScript/TypeScript example
const response = await fetch('https://api.nexusbrain.ai/v1/query/stream', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    question: 'Who knows about Akka supervision?',
  }),
});

const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  // Process streaming chunks
  const chunk = new TextDecoder().decode(value);
  console.log(chunk); // Display in real-time
}
```

---

### **Usage Method 3: Automated Code Review**

**When to use**: Every PR submission (automatic)

**How it works**:
1. Developer submits PR
2. GitHub webhook triggers NexusBrain
3. AI analyzes PR automatically
4. Posts review comments on PR

**Setup** (5 minutes):
```bash
# Enable auto-review in dashboard
nexus config set auto-review true

# Configure review rules
nexus config set review-rules '{
  "require_tests": true,
  "max_complexity": 15,
  "check_breaking_changes": true,
  "suggest_reviewers": true
}'

# Test with a PR
nexus review pr 3456
```

**What you see on PR**:
```
🤖 NexusBrain Code Review - PR #3456

SUMMARY:
├─ Files changed: 5
├─ Lines: +120, -45
├─ Complexity change: +15 ⚠️
└─ Risk score: 0.65 (MEDIUM-HIGH)

CHECKS:
✅ All methods have type annotations
✅ Error handling uses Either (not exceptions)
⚠️  WARNING: OrderActor.scala missing supervision strategy
⚠️  WARNING: PaymentService.scala has synchronous DB call
❌ FAIL: No tests added for new payment logic

IMPACT ANALYSIS:
Downstream files affected: 12
Akka actors affected: 3

BREAKING CHANGES DETECTED:
⚠️  PaymentService.processPayment signature changed
   Will break:
   - OrderController.scala:123
   - CheckoutActor.scala:45

SUGGESTED REVIEWERS:
1. Bob Kumar (OrderActor expert) - REQUIRED
2. Alice Chen (Akka supervision) - OPTIONAL

REVIEW COMMENTS:

📝 OrderActor.scala:45
Consider adding supervision strategy for child actors:

override val supervisorStrategy = OneForOneStrategy() {
  case _: PaymentException => Resume
  case _: Exception => Restart
}

📝 PaymentService.scala:78
Synchronous DB call blocks actor thread. Use Future:

def getPayment(id: String): Future[Payment] =
  db.run(payments.filter(_.id === id).result.headOption)

📝 Missing Tests
Add tests for new payment logic:
- test/PaymentServiceSpec.scala (create new)
- Minimum coverage: 80%
```

---

## 📊 PHASE 4: DAILY WORKFLOWS

### **Workflow 1: Morning Standup**

**Scenario**: Team standup at 9am

**Questions to ask**:
```bash
# 1. What PRs need review today?
nexus ask "What PRs are pending review and who should review them?"

# 2. Any critical bugs overnight?
nexus ask "Show me production errors from last 24 hours and who can fix them"

# 3. What's blocking the team?
nexus ask "Which PRs have dependencies on other PRs?"

# 4. Tech debt this sprint?
nexus ask "What are the top 3 tech debt items we should tackle this sprint?"
```

**Time saved**: 15 minutes → 2 minutes

---

### **Workflow 2: Feature Development**

**Scenario**: Building new "Invoice PDF Generation" feature

**Step-by-step**:
```bash
# 1. Understand existing patterns
nexus ask "How do we generate PDFs in our codebase? Show me examples."

# Output: Points to ReportGeneratorActor.scala as reference

# 2. Check dependencies
nexus ask "What libraries do we use for PDF generation?"

# Output: iText7 library, S3 for storage

# 3. Find similar code
nexus ask "Show me all actors that do async file processing"

# Output: ReportGeneratorActor, EmailActor, FileStorageService

# 4. Get implementation guidance
nexus ask "How should I implement invoice PDF generation in our Scala/Akka architecture?"

# Output: Detailed step-by-step guide (see UC6.2 in use case doc)

# 5. Before coding - impact check
nexus ask "What files will be affected if I add InvoicePDFActor?"

# Output: Shows 5 files to modify, effort estimate

# 6. After coding - submit PR
git push
# → Auto code review triggers

# 7. During review
nexus ask "Who should review my invoice PDF PR?"

# Output: Suggests Alice (built ReportGenerator)
```

**Time saved**: 4 hours research → 30 minutes

---

### **Workflow 3: Incident Response**

**Scenario**: Production error in payment processing

**Step-by-step**:
```bash
# 1. Identify root cause
nexus ask "PaymentService is throwing 'ActorInitializationException'. What could cause this?"

# Output:
# - Missing supervision strategy
# - Database connection failed
# - Stripe API key invalid
# Based on recent changes to PaymentService.scala:89

# 2. Find expert
nexus ask "Who knows about PaymentService and can help debug this?"

# Output: Bob Kumar (15 commits), Alice Chen (8 commits)

# 3. Impact assessment
nexus ask "What user flows are affected by PaymentService being down?"

# Output:
# - Order checkout (CRITICAL)
# - Subscription billing (HIGH)
# - Refund processing (MEDIUM)
# Estimated users affected: 5,000/day

# 4. Find recent changes
nexus ask "What changed in PaymentService in the last 7 days?"

# Output: Points to PR #3442 by Carol (merged 2 days ago)

# 5. Rollback guidance
nexus ask "What's the safest way to rollback PR #3442?"

# Output:
# - Revert commit abc123
# - Will affect 3 files
# - No data migration needed
# - Safe to rollback
```

**Time saved**: 2 hours debugging → 15 minutes

---

### **Workflow 4: Code Review**

**Scenario**: Reviewing PR #3456

**Step-by-step**:
```bash
# 1. Check automated review first
# (Already posted by NexusBrain on PR)

# 2. Deep dive on complex changes
nexus ask "Explain what OrderActor.scala changes do in PR #3456"

# Output: Plain English explanation of state machine changes

# 3. Check for edge cases
nexus ask "What edge cases should I test for the new payment retry logic?"

# Output:
# - Network timeout during retry
# - Stripe API rate limit hit
# - User cancels during retry
# - Payment succeeds but webhook fails

# 4. Verify best practices
nexus ask "Does PR #3456 follow our Akka best practices?"

# Output:
# ✅ Has supervision strategy
# ✅ Uses Future for async
# ⚠️  Missing circuit breaker for Stripe API

# 5. Approve or request changes
# Based on AI insights + your judgment
```

**Time saved**: 2 hours → 30 minutes

---

## 🎯 ADVANCED USAGE

### **Custom Queries**

**Example 1 - Architecture Diagram**:
```bash
nexus ask "Generate a dependency diagram for the authentication system"

# Output: Mermaid diagram
graph TD
  A[LoginController] --> B[AuthService]
  B --> C[UserRepository]
  B --> D[TokenService]
  D --> E[SessionActor]
  E --> F[Redis]

# Copy to Mermaid editor for visualization
```

**Example 2 - Performance Analysis**:
```bash
nexus ask "Which methods in OrderService have the highest complexity and might be performance bottlenecks?"

# Output:
# 1. OrderService.processOrder() - Complexity: 45
#    - 12 database queries (N+1 problem)
#    - Recommendation: Batch loading
#
# 2. OrderService.calculateTotal() - Complexity: 32
#    - Complex tax calculation
#    - Recommendation: Cache tax rates
```

**Example 3 - Migration Planning**:
```bash
nexus ask "We're upgrading from Akka 2.6 to 2.8. What code changes are needed?"

# Output:
# Based on your codebase scan:
#
# BREAKING CHANGES:
# 1. Akka Typed API changes (affects 12 actors)
# 2. Akka Streams API changes (affects 5 files)
# 3. Akka HTTP routing changes (affects 8 controllers)
#
# MIGRATION STEPS:
# 1. Update build.sbt dependencies
# 2. Migrate typed actors (see ActorTypeMigration.md)
# 3. Update stream operators
# 4. Test thoroughly (affected test files: 34)
#
# EFFORT: 2-3 weeks
# RISK: MEDIUM (good test coverage)
```

---

## 🔧 TROUBLESHOOTING

### **Common Issues**

**Issue 1: "No data found for repository"**
```bash
# Check scan status
nexus scan status

# If not scanned, trigger scan
nexus scan start --repo tooktiaki-core

# Wait 30 minutes, then retry query
```

**Issue 2: "Low confidence answer"**
```bash
# If confidence < 0.7, AI is uncertain
# Try rephrasing question more specifically:

# ❌ Vague: "How does auth work?"
# ✅ Specific: "Show me the authentication flow from LoginController to SessionActor"

# ❌ Too broad: "What's our tech debt?"
# ✅ Specific: "What's the tech debt in our payment processing code?"
```

**Issue 3: "API rate limit exceeded"**
```bash
# Check your usage
nexus usage

# Output:
# Today's usage: 187/200 requests
# Tokens used: 195,234/200,000
#
# Rate limit resets in: 4 hours

# Solution: Wait or upgrade quota
```

---

## 📈 MEASURING SUCCESS

### **Track These Metrics**

**Week 1-2**:
```bash
# How many queries per day?
nexus metrics queries

# What's the most common use case?
nexus metrics top-queries

# How accurate are responses?
nexus metrics accuracy
```

**Month 1**:
```bash
# Time saved
nexus metrics time-saved
# Output: 47 hours saved this month

# Incidents prevented
nexus metrics incidents-prevented
# Output: 2 production incidents caught before deploy

# Onboarding time
# (Track manually: New dev time to first PR)
```

**Month 2-3**:
```bash
# ROI calculation
nexus metrics roi

# Output:
# Time saved: $24K (47 hours × $500/hour)
# Incidents prevented: $100K (2 incidents × $50K)
# Total value: $124K
# Cost: $0 (design partner)
# ROI: ∞
```

---

## ✅ SUCCESS CHECKLIST

**Week 1**:
- [ ] GitHub App installed
- [ ] API key generated
- [ ] CLI installed
- [ ] Codebase scanned (100%)
- [ ] First query successful
- [ ] 2-3 pilot users onboarded

**Week 2-3**:
- [ ] 5+ queries per day (per user)
- [ ] Used in daily standup
- [ ] Auto code review enabled
- [ ] First feedback session completed

**Month 2**:
- [ ] Full team onboarded (12 engineers)
- [ ] 20+ queries per day (team total)
- [ ] Prevented 1+ incident
- [ ] Saved 10+ hours this month

**Month 3**:
- [ ] Measured ROI ($100K+ value)
- [ ] Provided testimonial
- [ ] Case study drafted
- [ ] Decided on continued usage

---

## 🆘 SUPPORT

**Getting Help**:
1. **Documentation**: https://docs.nexusbrain.ai
2. **Slack**: #tooktiaki-support (dedicated channel)
3. **Email**: support@nexusbrain.ai
4. **Video tutorials**: https://nexusbrain.ai/tutorials

**Response Times** (Design Partner SLA):
- Critical issues: 2 hours
- High priority: 4 hours
- Normal questions: 24 hours

---

**Ready to start?**

Follow Phase 1 (Setup) and you'll be making your first query in 35 minutes!

**Questions?** Reach out on Slack: #tooktiaki-support

---

*Built with 🧠 by NexusBrain*
*Implementation Guide v1.0*
*Last updated: February 14, 2026*
