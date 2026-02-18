# NexusBrain - Complete Use Case Library

**All Capabilities for Design Partners**

This document contains every use case NexusBrain supports, with real examples of questions you can ask and the responses you'll receive.

---

## Use Case Index

1. [Impact Analysis](#use-case-1-impact-analysis) - "What breaks if I change this?"
2. [Expert Finding](#use-case-2-expert-finding) - "Who knows about X?"
3. [Technical Debt Analysis](#use-case-3-technical-debt-analysis) - "What should we fix?"
4. [Automated Code Review](#use-case-4-automated-code-review) - PR analysis
5. [Onboarding Support](#use-case-5-onboarding-support) - "Where do I start?"
6. [Incident Response](#use-case-6-incident-response) - "What's causing this error?"
7. [Architecture Understanding](#use-case-7-architecture-understanding) - "How does this work?"
8. [Code Review Assistance](#use-case-8-code-review-assistance) - "Review this PR"
9. [Knowledge Transfer](#use-case-9-knowledge-transfer) - "Plan handoff"
10. [Predictive Analysis](#use-case-10-predictive-analysis) - "What if we refactor?"
11. [Branch-Scoped Code Intelligence](#use-case-11-branch-scoped-code-intelligence) - "What's the state of the 6.3.4 release?" ⭐ NEW
12. [Cross-Branch Impact Analysis](#use-case-12-cross-branch-impact-analysis) - "Do our two releases conflict?" ⭐ NEW

---

## Use Case 1: Impact Analysis

**Question**: "What will break if I change this file?"

**When to Use**:
- Before refactoring
- Before deprecating code
- Planning releases
- Risk assessment

**Example**:
```
Question: "What will be affected if UserService.scala is modified?"

AI Response:
IMPACT ANALYSIS - UserService.scala

DIRECTLY AFFECTED: 23 files
├─ AuthController.scala → Calls UserService.authenticate()
├─ SessionManager.scala → Uses UserService.getUser()
├─ OrderController.scala → Indirect dependency
└─ [20 more files...]

RISK SCORE: 0.72 (HIGH)
CRITICAL PATH: YES (authentication)
TEST COVERAGE: 78%

RECOMMENDATIONS:
1. Create feature flag for rollout
2. Add integration tests
3. Plan 2-week testing period

Query time: 3 seconds
```

---

## Use Case 2: Expert Finding

**Question**: "Who knows about this system/feature?"

**When to Use**:
- Need code reviewer
- Incident response
- Mentoring
- Knowledge gaps

**Example**:
```
Question: "Who knows the most about Akka actor supervision?"

AI Response:
TOP EXPERTS:

1. Alice Chen ⭐ RECOMMENDED
   Expertise: 8.5/10
   - 23 commits to supervision code
   - 12 PR reviews
   - Last active: 2 days ago
   Contact: @alice on Slack

2. Bob Kumar
   Expertise: 6.2/10
   - 15 commits
   - 8 PR reviews

KNOWLEDGE RISK:
If Alice leaves → 6 week transfer to Bob needed

Query time: 1 second
```

---

## Use Case 3: Technical Debt Analysis

**Question**: "What technical debt should we prioritize?"

**When to Use**:
- Sprint planning
- Quarterly planning
- Quality initiatives
- Before releases

**Example**:
```
Question: "Audit our codebase for technical debt"

AI Response:
TECHNICAL DEBT AUDIT

TOTAL: 156 issues
ESTIMATED PAYOFF: 12 weeks

CRITICAL (3 issues):

1. UserActor.scala - Score: 8.7/10
   - God object: 1,200 lines
   - Complexity: 85 (should be <15)
   - Impact: 23 dependent files
   - Fix: Split into 3 actors
   - Effort: 2 weeks

2. LegacyPaymentService.scala - Score: 7.9/10
   - Deprecated Stripe API (EOL in 3 months!)
   - Risk: Payment failures
   - Effort: 1 week

[Full prioritized list...]

Query time: 5 minutes
```

---

## Use Case 4: Automated Code Review

**What It Does**: Automatically analyzes every PR

**When It Happens**: Every PR submission (automatic)

**What It Checks**:
- Best practices
- Breaking changes
- Impact analysis
- Suggested reviewers

**Example PR Comment**:
```
🤖 NexusBrain Code Review - PR #3456

SUMMARY:
- Files changed: 5
- Risk score: 0.65 (MEDIUM-HIGH)
- Breaking changes: 1 detected

CHECKS:
✅ Type annotations present
⚠️  Missing supervision strategy
❌ No tests for new logic

BREAKING CHANGES:
⚠️  PaymentService.processPayment signature changed
   Will break: OrderController.scala:123

SUGGESTED REVIEWERS:
1. @bob-kumar (OrderActor expert)

Review time: 12 seconds
```

---

## Use Case 5: Onboarding Support

**Question**: "How do I learn this codebase?"

**When to Use**:
- New engineer first day
- Switching teams
- Learning new component

**Example**:
```
Question: "I'm new to this codebase. Create a learning plan."

AI Response:
PERSONALIZED 3-WEEK ONBOARDING PLAN

WEEK 1: FOUNDATION
Day 1-2: Core Setup
- Read: Application.scala, Routes.scala
- Run: sbt test
- Exercise: Add health check endpoint

Day 3-5: Domain Models
- Read: models/User.scala, models/Order.scala
- Exercise: Add field to User model

[Week 2 & 3 details...]

YOUR MENTOR: Bob Kumar (@bob)
FIRST TASK: Issue #234 "Add logging"

Query time: 2 seconds
```

---

## Use Case 6: Incident Response

**Question**: "What's causing this production error?"

**When to Use**:
- Production incidents
- Complex bugs
- Root cause analysis

**Example**:
```
Question: "PaymentService is throwing ActorInitializationException. What could cause this?"

AI Response:
INCIDENT ANALYSIS

POTENTIAL ROOT CAUSES (ranked):

1. Database Connection Failure (85% match)
   Evidence:
   - PaymentService requires DB in constructor
   - PR #892 changed DB config (2 days ago)
   - 3 similar incidents in last 6 months

   DIAGNOSTIC STEPS:
   1. Check DB connection pool
   2. Verify connection string
   3. Test DB connectivity

   QUICK FIX: Rollback PR #892

2. Missing Supervision Strategy (60% match)
   [Details...]

WHO CAN HELP:
- Alice Chen (expert, online now)
- Bob Kumar (backup)

BLAST RADIUS: 5,000 users affected

Query time: 5 seconds
```

---

## Use Case 7: Architecture Understanding

**Question**: "How does this system work?"

**When to Use**:
- Learning features
- Documentation
- Architecture review

**Example**:
```
Question: "Explain how authentication works from login to session"

AI Response:
AUTHENTICATION FLOW

STEP 1: User Submits Login
POST /api/auth/login → LoginController.login()

STEP 2: Validate Credentials
AuthService.authenticate(email, password)
- Lookup user: UserRepository.findByEmail()
- Verify password: BCrypt.checkpw()

STEP 3: Generate Token
TokenService.generateToken(user)
- Algorithm: JWT with RS256
- Expiry: 24 hours

STEP 4: Create Session
SessionActor ! CreateSession(userId, token)
- Store in Redis
- TTL: 24 hours

STEP 5: Return Token
Response: {token, expiresIn, user}

[Full flow with all 7 steps + diagrams...]

Query time: 3 seconds
```

---

## Use Case 8: Code Review Assistance

**Question**: "Review this code for issues"

**When to Use**:
- Before submitting PR
- During review
- Learning best practices

**Example**:
```
Question: "Review PR #3456 for potential issues"

AI Response:
CODE REVIEW - PR #3456

OVERALL: GOOD with minor improvements

✅ STRENGTHS:
- Well-structured retry logic
- Good test coverage (85%)
- Clear documentation

⚠️  ISSUES TO ADDRESS:

Line 89: Synchronous DB call
❌ Blocks actor thread
Fix: Use Future instead of Await.result()

Missing circuit breaker
⚠️  Risk: Cascading failures
Fix: Add Akka Circuit Breaker

[Detailed review with code suggestions...]

RECOMMENDED REVIEWERS:
1. @alice (primary)
2. @david (optional)

Query time: 15 seconds
```

---

## Use Case 9: Knowledge Transfer

**Question**: "Plan knowledge handoff"

**When to Use**:
- Team member leaving
- Role transitions
- Succession planning

**Example**:
```
Question: "Alice is leaving in 6 weeks. Plan knowledge transfer."

AI Response:
KNOWLEDGE TRANSFER PLAN - Alice Chen

RISK LEVEL: HIGH

CRITICAL AREAS:
1. Akka Supervision (Alice: 9.2/10, Next: Bob 5.1/10)
   - 12 files at risk
   - Transfer time: 4-6 weeks
   - Plan: Documentation + Pair programming

2. Event Sourcing (Alice: 8.7/10, Next: David 6.5/10)
   - 8 files at risk
   - Transfer time: 3-4 weeks

WEEK-BY-WEEK PLAN:
Week 1: Documentation
Week 2-4: Pair programming
Week 5-6: Validation

SUCCESS METRICS:
- Bob scores 8/10 on quiz
- Zero incidents first month

[Detailed 6-week plan...]

Query time: 8 seconds
```

---

## Use Case 10: Predictive Analysis

**Question**: "What if we make this change?"

**When to Use**:
- Planning refactors
- Architecture decisions
- Estimating effort

**Example**:
```
Question: "What would happen if we refactor authentication to OAuth2?"

AI Response:
OAUTH2 REFACTOR IMPACT

SCOPE: LARGE (45 files, 3 teams)

BACKEND: 25 files
- AuthService.scala → Complete rewrite
- SessionActor.scala → State changes
[Details...]

FRONTEND: 12 files
- LoginPage.tsx → OAuth2 flow
[Details...]

ESTIMATED EFFORT:
- Backend: 4 sprints (8 weeks)
- Frontend: 2 sprints (4 weeks)
- Testing: 1 sprint (2 weeks)
- TOTAL: 14 weeks

MIGRATION STRATEGY:
Sprint 1-2: Dual auth (old + new)
Sprint 3-4: Gradual migration
Sprint 5: Cleanup

RISKS:
- All login flows affected
- Schema changes (hard to rollback)

RECOMMENDATION: Proceed with phased rollout

Query time: 6 seconds
```

---

---

## Use Case 11: Branch-Scoped Code Intelligence

**Question**: "Analyse the 6.3.4 branch — what's changed, what's at risk, who owns what?"

**When to Use**:
- Before a release cut-off
- Sprint review gates
- Cross-branch risk assessment
- When two parallel release trains are running

**What Makes This Different**:
NexusBrain indexes every file on every tracked branch separately. When you select `6.3.4` in the branch selector, every answer — code review, impact analysis, expert finding — is scoped to the exact symbol versions on that branch. It is not a generic "your codebase" answer; it is branch-aware, commit-aware intelligence.

**Example**:
```
Branch selected: 6.3.4
Question: "What has changed on 6.3.4 since branching from 6.3.3,
           and what is the blast radius before the Apr 7 release?"

AI Response:
BRANCH INTELLIGENCE — 6.3.4 vs 6.3.3

DELTA SUMMARY
├─ Commits since branch point: 147
├─ Files changed: 89 files across 12 modules
├─ Authors: Bao (38%), Ravi (27%), Mayank (19%), Nitish (11%), Ganesh (5%)
└─ Net change: +4,201 lines / -1,847 lines

HIGH-RISK MODULES (brain causal scoring):
1. auth/SessionManager.scala — Risk: CRITICAL
   - Changed by: Bao (PR #312), Ravi (PR #318)
   - Downstream dependents: 31 files
   - Test coverage: 61% (was 78% on 6.3.3) — REGRESSION
   - Linked Jira tickets: PROJ-1204 (open blocker), PROJ-1198

2. PaymentOrchestrator.scala — Risk: HIGH
   - Changed by: Mayank (PR #321)
   - Blast radius: 14 files
   - Breaking API change detected (method signature changed)
   - Recommended reviewer: Ganesh (12 historical commits, highest expertise)

3. EventBus.scala — Risk: MEDIUM
   - Changed by: Nitish (PR #309)
   - No breaking changes, but 3 circular imports introduced

JIRA CORRELATION:
- 23 Jira tickets linked to PRs on this branch
- 4 tickets marked "Done" but linked PR has unresolved review comments
- 2 critical path tickets (PROJ-1204, PROJ-1211) have no linked PR yet

RELEASE READINESS: 67% — not ready for Apr 7 without:
1. Auth test coverage restored to ≥75%
2. PaymentOrchestrator API change verified by downstream teams
3. PROJ-1204 resolved or deferred

Query time: 4 seconds
```

---

## Use Case 12: Cross-Branch Impact Analysis

**Question**: "Does what we're building in 6.3.4 conflict with the 5.11.5 enterprise release?"

**When to Use**:
- Two parallel release trains running simultaneously
- Enterprise fork and main branch diverging
- Merge planning between streams
- Understanding cumulative risk across all active releases

**What Makes This Different**:
Most tools show you one branch at a time. NexusBrain tracks all active branches simultaneously and understands the causal relationships between them — not just file-level diffs, but semantic changes (function renames, API signature changes, shared schema evolution).

**Example**:
```
Question: "We have two parallel releases — 6.3.4 (Apr 7) and 5.11.5 enterprise
           (Drop 1: Feb 26, Drop 2: Mar 15). What conflicts or shared risks exist
           between these two release trains?"

AI Response:
CROSS-BRANCH INTELLIGENCE — 6.3.4 ∩ 5.11.5

SHARED COMPONENT CONFLICTS (6 detected):

1. AuthService.authenticate() — CRITICAL CONFLICT
   - 6.3.4 (Bao, PR #312): Changed token expiry from 24h → 8h
   - 5.11.5 (Sandeep, PR #089): Added OAuth2 refresh token path
   - PROBLEM: If 5.11.5-Drop1 ships Feb 26, enterprise clients will have
     OAuth2 refresh on 8h tokens — untested combination
   - RECOMMENDATION: Cross-team sync required before Feb 26

2. database/migrations/v47_schema.sql — HIGH CONFLICT
   - 6.3.4: Adds nullable column `user.last_mfa_at`
   - 5.11.5: Adds non-null column `user.last_mfa_at` with default
   - PROBLEM: Forward-incompatible schema — 5.11.5 clients cannot be
     upgraded to 6.3.4 without a data migration
   - RECOMMENDATION: Align migration in a pre-release coordination sprint

3. EventBus message format — MEDIUM
   - 6.3.4 adds new event type `session.mfa_bypass`
   - 5.11.5 does not consume it — safe for now but monitor

TEAM COORDINATION GAPS:
- No Jira link exists between 6.3.4 team (Bao et al) and 5.11.5 team (Sandeep et al)
  for the 6 shared conflicts above
- Suggested: Create coordination tickets before 5.11.5 Drop 1 (Feb 26)

RELEASE TIMELINE RISK:
5.11.5 Drop 1 (Feb 26) → at risk if AuthService conflict not resolved
5.11.5 Drop 2 (Mar 15) → schema migration conflict could push to Apr
6.3.4 (Apr 7)          → timeline safe if schema aligned by mid-March

RECOMMENDED OWNERS FOR SYNC:
- Bao (6.3.4 auth lead) ↔ Sandeep (5.11.5 auth lead)
- Mayank (6.3.4 schema) ↔ Doan (5.11.5 migrations)

Query time: 6 seconds
```

---

## Quick Reference

**Most Common Questions**:

```bash
# Impact analysis
"What breaks if I change [file]?"

# Expert finding
"Who knows about [system/feature]?"

# Tech debt
"What technical debt should we prioritize?"

# How things work
"Explain how [feature] works"

# Debugging
"[Error message]. What could cause this and who can help?"

# Code review
"Review PR #[number] for issues"

# Planning
"What's the impact of [change]?"

# Onboarding
"I'm new to [component]. Where do I start?"

# Branch intelligence (NEW — select branch in Copilot first)
"What has changed on [branch] and what's the release risk?"
"Analyse all PRs on the 6.3.4 branch before the Apr 7 cut-off"

# Cross-branch analysis (NEW — two parallel release trains)
"Do our 6.3.4 and 5.11.5 releases have any conflicts?"
"What shared components are touched by both teams?"
```

**Query Tips**:

✅ **Be Specific**: "Explain payment flow from OrderController to StripeClient"
❌ **Too Vague**: "How does payment work?"

✅ **Include Context**: "Error started after PR #892, what changed?"
❌ **No Context**: "It's broken"

✅ **Ask Focused Questions**: "What are top 3 issues in PaymentService?"
❌ **Too Broad**: "What's wrong with the code?"

---

**End of Use Case Library**

Need help? Ask NexusBrain anything!
