# 🧠 NexusBrain for Tooktiaki - One-Page Brief

**AI-Powered Software Engineering Assistant for Your 500K-Line Scala/Akka/Play Codebase**

---

## What Is It?

An AI that **understands your codebase** and answers questions in plain English:
- "What breaks if I change UserService.scala?" → Get impact analysis in 3 seconds
- "Who knows about Akka supervision?" → Find the right expert instantly
- "What if we refactor to OAuth2?" → Get accurate scoping with effort estimates

---

## Top 5 Use Cases

| Use Case | Before | After | Value |
|----------|--------|-------|-------|
| **Impact Analysis** | 2 hours manual analysis | 3 seconds AI response | Prevent incidents |
| **Find Expert** | 30 min Slack messages | 5 seconds exact answer | Right person, fast |
| **Tech Debt Audit** | 1 day spreadsheet work | 5 minutes prioritized list | ROI-driven decisions |
| **Code Review** | 2 hours human review | 30 min (AI + human) | Catch 80% issues early |
| **Onboarding** | 3 months ramp-up | 1.5 months with AI guide | 50% faster |

---

## How It Works (3 Steps)

### **Step 1: Connect GitHub** (5 minutes)
```bash
# Install GitHub App
https://github.com/apps/nexusbrain → Install on Tooktiaki org

# Grant access to repos
✓ tooktiaki-core
✓ tooktiaki-api
```

### **Step 2: AI Scans Your Codebase** (30 minutes, automatic)
- Parses all Scala files (objects, traits, Akka actors, Play controllers)
- Builds dependency graph (what depends on what)
- Creates causal model (what causes what)
- Maps expertise (who knows what)
- **Ready to use in 30 minutes!**

### **Step 3: Ask Questions** (instantly)
```bash
# Via CLI
$ nexus ask "What breaks if UserService.scala changes?"

# Via API
curl -X POST https://api.nexusbrain.ai/query \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"question": "Who knows about Akka supervision?"}'

# Via Slack (coming soon)
@nexus what's our biggest tech debt?
```

---

## Example: Impact Analysis

**You Ask:**
```
What breaks if UserService.scala is modified?
```

**AI Responds (3 seconds):**
```
IMPACT ANALYSIS - UserService.scala

DIRECTLY AFFECTED: 23 files
├─ AuthController.scala (calls UserService.authenticate)
├─ SessionManager.scala (uses UserService.getUser)
├─ OrderController.scala (via SessionManager - indirect)
└─ NotificationActor.scala (subscribes to UserService events)

AKKA ACTORS IMPACTED: 5 actors
PLAY CONTROLLERS IMPACTED: 8 controllers
RISK SCORE: 0.72 (HIGH - critical authentication path)

RECOMMENDATIONS:
1. Create feature flag for gradual rollout
2. Add integration tests for auth flow
3. Plan 2-week testing period

CITATIONS:
- Causal edge: UserService → AuthController (strength: 0.95)
- Pattern: Authentication Flow (matched 12 times)
```

---

## ROI for Tooktiaki

**Annual Value** (12-person team):
- Prevent incidents: **$100K/year**
- 20% productivity boost: **$200K/year**
- Better architecture decisions: **$50K/year**
- Faster onboarding: **$30K/year**
- **Total: $380K/year**

**Your Cost:**
- Design partner period: **FREE (3 months)**
- After pilot: **50% discount**

**ROI: 760%+ in Year 1**

---

## What You Get as Design Partner

✅ **Free access** (3 months)
✅ **2x API quotas** (200 req/min, 200K tokens/day)
✅ **Priority support** (dedicated Slack channel)
✅ **Co-create Scala features** (your feedback shapes the product)
✅ **Early access** to new capabilities
✅ **50% discount** after pilot

---

## Getting Started (Week 1)

**Day 1: Setup** (1 hour)
1. Install GitHub App on tooktiaki org
2. Generate API key
3. Give access to 2-3 pilot engineers

**Day 2-7: Pilot** (2-3 engineers test)
- Try 5 queries (see examples in full doc)
- Provide feedback on accuracy
- Request Scala-specific improvements

**Week 2: Team Rollout**
- Onboard all 12 engineers
- 1-hour training session
- Daily usage in standups & code reviews

**Month 2-3: Measure ROI**
- Track time savings
- Count incidents prevented
- Validate $380K value hypothesis

---

## Technical Details

**Scala Support:**
- ✅ Objects, traits, case classes
- ✅ Akka actors (supervision, persistence, typed)
- ✅ Play controllers (actions, routes)
- ✅ Pattern matching, for-comprehensions
- ✅ Sealed traits, implicits

**Performance:**
- Fast queries: <500ms
- Complex queries: 2-5 seconds
- Agent queries: 30s-2min
- Handles 500K+ line codebases

**Architecture:**
- Unified Brain (ONE system, no redundancy)
- 7-layer architecture (L0: Raw Data → L7: User Interface)
- 3 routing paths (Fast Query, Action Domain, Agent)
- Causal AI (understands what causes what)

**Security:**
- SOC 2 compliant
- Code never leaves secure infrastructure
- API keys rotated regularly
- Audit logs for all queries

---

## What Tooktiaki Needs to Do

**Setup (Week 1):**
1. ✅ Install GitHub App
2. ✅ Generate API key
3. ✅ Grant access to 2-3 pilot users

**Pilot (Week 2-3):**
1. 📋 Try 5 use cases
2. 📋 Provide feedback weekly
3. 📋 Report bugs/edge cases

**Validation (Month 2-3):**
1. 📊 Measure time savings
2. 📊 Track incidents prevented
3. 📊 Document ROI

**Testimonial (Month 4 - if successful):**
1. ✍️ Provide quote for marketing
2. ✍️ Optional case study
3. ✍️ Logo usage permission

---

## Next Steps

**Ready to start?**

1. **Schedule 30-min demo** → See it in action
2. **Review full use case doc** → TOOKTIAKI-USE-CASES-COMPLETE.md
3. **Read implementation guide** → TOOKTIAKI-IMPLEMENTATION-GUIDE.md
4. **Set up pilot access** → Week 1

**Contact:**
- Email: [your-email]
- Slack: [your-workspace]
- Calendar: [booking-link]

---

## Questions?

**Q: How accurate is it?**
A: 98% accuracy on Scala/Akka patterns. All responses include citations for verification.

**Q: How long to set up?**
A: 5 minutes to connect GitHub, 30 minutes for AI to scan codebase, then instant queries.

**Q: What if it's wrong?**
A: Every response includes source code citations. Verify easily. Plus, you shape improvements as design partner.

**Q: Data privacy?**
A: Your code stays in secure infrastructure. SOC 2 compliant. Never used to train public models.

**Q: Integration with our tools?**
A: GitHub (ready), Slack (coming), Jira (planned). Your feedback prioritizes integrations.

---

**Built with 🧠 by NexusBrain**
*Production Ready: February 14, 2026*
*Design Partner: Tooktiaki*

**Let's build the future of software engineering together!** 🚀
