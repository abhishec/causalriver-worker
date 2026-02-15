# Memory Genesis Demo - Testing Guide

**Status**: Ready to test with real Supabase credentials
**Last Updated**: February 15, 2026

---

## Quick Start (5 Minutes) 🚀

### Step 1: Set Environment Variables

```bash
# Get these from your Supabase project dashboard
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key-here"
```

**Where to find these:**
1. Go to https://supabase.com/dashboard
2. Select your project (or create a new one)
3. Go to Settings → API
4. Copy "Project URL" → `SUPABASE_URL`
5. Copy "anon public" key → `SUPABASE_ANON_KEY`

---

### Step 2: Test Supabase Connection

```bash
npm run demo:memory-genesis:test
```

**Expected Output:**
```
✓ Environment variables are set
  SUPABASE_URL: https://abcdefgh.supabase...
  SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIs...

🔌 Testing Supabase connection...
✓ Successfully connected to Supabase
✓ Table "cross_domain_signals" exists

📝 Testing repository operations...
✓ Successfully inserted test signal
✓ Successfully retrieved 1 signal(s)
✓ Cleaned up test data

✅ All Supabase tests passed!
```

**If you see errors:**

#### Error: "relation does not exist"
```
❌ Table "cross_domain_signals" does not exist

Please run the database migrations first:
   npm run db:migrate
```
**Fix**: You need to create the database tables. Run:
```bash
npm run db:migrate
```

Or manually create the table via Supabase SQL Editor:
```sql
CREATE TABLE cross_domain_signals (
  id BIGSERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value NUMERIC,
  signal_timestamp TIMESTAMPTZ,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_org_time
  ON cross_domain_signals(organization_id, created_at);
```

#### Error: "Invalid API key"
```
❌ Failed to connect to Supabase: Invalid API key
```
**Fix**: Double-check your `SUPABASE_ANON_KEY`. Make sure you copied the full key.

---

### Step 3: Run Quick Demo (30 Days)

```bash
npm run demo:memory-genesis:quick
```

**Expected Runtime**: 2-3 minutes

**Expected Output:**
```
================================================================================
🧠 MEMORY GENESIS COMPETITION 2026 - NEXUSBRAIN DEMO
================================================================================

Demonstrating: NexusBrain as Long-Term Memory OS

Simulation: 30 days of organizational activity
Organization: memory_genesis_demo_org

────────────────────────────────────────────────────────────────────────────────
PHASE 1: SIMULATING ORGANIZATIONAL ACTIVITY + BRAIN SLEEP
────────────────────────────────────────────────────────────────────────────────

📅 Day 1/30
✅ Generated 5 signals for day 1

🌙 Night 1: Brain entering sleep mode (consolidation)...
✨ Consolidation complete!
   - New causal relationships: 0
   - Lost relationships: 0
   - Patterns discovered: 0
   - Anomalies detected: 0

📅 Day 2/30
...

🌙 Night 7: Brain entering sleep mode (consolidation)...
✨ Consolidation complete!
   - New causal relationships: 3
   - Patterns discovered: 2
   - Anomalies detected: 1

   📊 Sample discoveries:
      engineering.github causes customer_success.freshdesk with 2-day lag
      marketing.hubspot causes sales.hubspot with 7-day lag
...
```

**What to check:**
- ✅ Signals are being generated each day (5-6 signals per day)
- ✅ Consolidation runs nightly
- ✅ After ~7 days, causal relationships start being discovered
- ✅ No errors about missing tables or connection issues

---

### Step 4: Run Full Demo (90 Days) - Optional

```bash
npm run demo:memory-genesis
```

**Expected Runtime**: 8-12 minutes

**Why run the full demo:**
- More causal relationships discovered (20+ vs 5-10)
- Better demonstration of memory consolidation over time
- Multi-hop reasoning becomes more meaningful
- Shows long-term memory persistence

**When to run:**
- Before recording the demo video
- For final submission testing
- To generate impressive screenshots

---

## Troubleshooting 🔧

### Demo runs but no causal relationships found

**Symptoms:**
```
📖 Memory retrieval: Found 0 causal chains leading to support tickets
   (No causal chains discovered yet - consolidation needs more time)
```

**Causes:**
1. Demo ran for less than 7 days (not enough data)
2. Consolidation didn't run (check logs for consolidation steps)
3. Signals weren't inserted (check Supabase dashboard)

**Fix:**
```bash
# Run at least 30 days
export DEMO_DAYS=30
npm run demo:memory-genesis:quick

# Or check if signals exist in Supabase
# Go to Supabase Dashboard → Table Editor → cross_domain_signals
# Filter by organization_id = 'memory_genesis_demo_org'
```

---

### Out of memory error

**Symptoms:**
```
FATAL ERROR: Reached heap limit Allocation failed
```

**Cause**: Running 90-day demo on machine with limited RAM

**Fix:**
```bash
# Run shorter demo
export DEMO_DAYS=30
npm run demo:memory-genesis:quick

# Or increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" npm run demo:memory-genesis
```

---

### Consolidation takes too long

**Symptoms:**
```
🌙 Night 45: Brain entering sleep mode (consolidation)...
[hangs for 10+ minutes]
```

**Cause**: Too many signals accumulated, causal discovery is slow

**Fix:**
```bash
# Reduce consolidation lookback window
# Edit demo-script.ts line 184:
discoveryLookbackDays: 30  # Change from 90 to 30
```

---

## Demo Output Verification ✓

After running the demo, verify these key outputs:

### Phase 1: Consolidation
- [x] 30-90 nightly consolidation cycles completed
- [x] Causal relationships discovered (after ~7 days)
- [x] Sample discoveries shown in output

### Phase 2: Multi-Session Memory
- [x] Causal graph loaded from database
- [x] Multiple nodes and edges reported
- [x] Causal chains found (engineering → customer_success)
- [x] Explanations generated with confidence percentages

### Phase 3: Prediction Reinforcement
- [x] Prediction recorded
- [x] Outcome simulated
- [x] Bayesian update reported
- [x] Confidence increase shown (0.75 → 0.82)

### Phase 4: Federated Memory
- [x] ORG brain explained
- [x] CORE brain explained
- [x] Knowledge percolation process described

---

## Next Steps After Testing 📹

Once the demo runs successfully:

### 1. Record Demo Video (Due: Feb 22)

**Setup:**
- Clean terminal with good font size (16pt+)
- Screen recording software ready (QuickTime, OBS, ScreenFlow)
- Script ready (see VIDEO_SCRIPT.md)

**Recording checklist:**
- [ ] Terminal visible and readable
- [ ] Audio quality tested
- [ ] Demo runs without errors
- [ ] Time: 5-7 minutes total
- [ ] Segments: Intro (1min) + Demo (4min) + Wrap-up (2min)

### 2. Prepare Submission Package (Due: Feb 26)

**Files to include:**
- [x] `demo-script.ts` - Working demo
- [x] `ARCHITECTURE.md` - Technical docs
- [x] `README.md` - Quick start
- [x] `SUBMISSION_SUMMARY.md` - Executive summary
- [ ] `demo-video.mp4` - Recorded video
- [ ] GitHub repository link

### 3. Final Submission (Due: Feb 28)

**Before submitting:**
- [ ] All tests pass
- [ ] Video uploaded (YouTube/Vimeo unlisted)
- [ ] Code repository public
- [ ] Google Form completed
- [ ] Confirmation email received

---

## Support 💬

**If you encounter issues:**

1. **Check this guide** - Most common issues are covered
2. **Check logs** - Error messages usually explain the problem
3. **Check Supabase dashboard** - Verify tables and data exist
4. **Email**: abhishek@monetiz3.com

**Competition deadline**: February 28, 2026 (13 days remaining!)

---

**Last Updated**: February 15, 2026
**Status**: ✅ Demo script fixed and ready to test
**Next Action**: Run `npm run demo:memory-genesis:test`
