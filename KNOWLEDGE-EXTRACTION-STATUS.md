# 🔍 Knowledge Extraction - What's Actually Wired

**Date:** February 15, 2026
**Status:** ⚠️ **PARTIALLY WIRED**

---

## 🎯 **The Truth About "Wired"**

You asked: **"What do you mean it's not wired?"**

Let me clarify EXACTLY what's wired vs not wired:

---

## ✅ **What IS Wired (Working Now)**

### **1. Basic Consolidation (Edge Function)** ✅

**Location:** `supabase/functions/scheduled-jobs/index.ts`

**What it does:**
```typescript
async function runConsolidationJob() {
  1. Run maintenance (verification, weights, decay, etc.) ✅
  2. Create brain health snapshot ✅
  3. Run federation ✅

  return {
    status: 'success',
    mode: 'light_consolidation'
  };
}
```

**Accessible via:**
```bash
pnpm run job:consolidation  # Calls Edge Function
```

**What it DOES populate:**
- ✅ predictions (via verification)
- ✅ causal_relationships (via weights)
- ✅ weight_history
- ✅ brain_health_history

**What it DOES NOT populate:**
- ❌ concepts
- ❌ entities
- ❌ semantic_relationships
- ❌ patterns
- ❌ insights
- ❌ All other layers 8-15 tables

---

### **2. Full Consolidation (Node.js Script)** ✅ EXISTS

**Location:** `scripts/brain-consolidation-runner.ts`

**What it does:**
```typescript
const brain = createBrainPipeline({
  supabase,
  organizationId,
  cognitiveStack: { enabled: true }
});

const report = await brain.runFullCycle();
// This DOES run the cognitive stack (L3-L15)
// This DOES extract knowledge
// This DOES populate layers 8-15
```

**How to run:**
```bash
tsx scripts/brain-consolidation-runner.ts
```

**What it populates:**
- ✅ Everything from basic consolidation
- ✅ concepts ← THIS!
- ✅ entities ← THIS!
- ✅ semantic_relationships ← THIS!
- ✅ patterns ← THIS!
- ✅ insights ← THIS!
- ✅ All layers 8-15 ← THIS!

---

## ❌ **What is NOT Wired**

### **The Full Consolidation is NOT Called Automatically**

**Problem:**

When you run:
```bash
pnpm run job:consolidation
```

It calls the **Edge Function** (light consolidation), NOT the **Node.js script** (full consolidation).

**Why?**

1. **Edge Functions can't import Node.js packages**
   - Edge Functions run in Deno
   - Can't import `@nexus-ai/memory-stack`
   - Can only run what's in the Edge Function file

2. **No scheduled job for full consolidation**
   - The cron jobs call Edge Functions
   - Full consolidation script exists but isn't scheduled
   - Must be run manually

3. **No bridge between them**
   - Edge Function doesn't call Node.js script
   - Node.js script doesn't run automatically
   - They're separate systems

---

## 🔄 **Current Architecture**

### **What Happens Now:**

```
Cron Schedule (Hourly/Daily)
     ↓
Edge Function: scheduled-jobs
     ↓
runConsolidationJob()
     ↓
Light Consolidation ONLY
     ↓
Layers 1-7 populated ✅
Layers 8-15 stay empty ❌
```

### **What SHOULD Happen:**

```
Cron Schedule (Daily)
     ↓
Trigger Full Consolidation
     ↓
Node.js Script: brain-consolidation-runner.ts
     ↓
createBrainPipeline() → runFullCycle()
     ↓
Cognitive Stack runs
     ↓
Layers 1-7 populated ✅
Layers 8-15 populated ✅
```

---

## 🔧 **What "Wiring" Means**

### **Option A: Call Node.js from Edge Function** ❌ Can't Do

```typescript
// This DOESN'T work in Deno Edge Functions:
import { createBrainPipeline } from '@nexus-ai/memory-stack';
```

**Why:** Deno can't import Node.js packages

---

### **Option B: Deploy Node.js as Microservice** ✅ Possible

```
Edge Function → HTTP call → Lambda/Cloud Run
                              ↓
                    brain-consolidation-runner.ts
                              ↓
                    Full cognitive stack runs
```

**Pros:** Full functionality
**Cons:** More infrastructure

---

### **Option C: Rewrite Extraction in SQL** ✅ Possible

```sql
-- Create PostgreSQL functions
CREATE FUNCTION extract_concepts(org_id UUID) ...
CREATE FUNCTION extract_entities(org_id UUID) ...
CREATE FUNCTION extract_patterns(org_id UUID) ...
```

**Pros:** Works in Edge Functions
**Cons:** Limited capabilities

---

### **Option D: Add npm Script to Trigger Full Consolidation** ✅ Easiest

```json
{
  "scripts": {
    "job:consolidation": "tsx scripts/run-scheduled-job.ts consolidation",
    "job:full-consolidation": "tsx scripts/brain-consolidation-runner.ts"
  }
}
```

**Then manually run:**
```bash
pnpm run job:full-consolidation
```

**Pros:** Works immediately
**Cons:** Not automatic (must run manually)

---

## 📊 **Current vs Full Capability**

### **With Current Edge Function (Light Consolidation):**

✅ Signal processing
✅ Prediction tracking
✅ Causal discovery
✅ Weight updates
✅ Evidence decay
✅ Health snapshots
❌ Knowledge extraction
❌ Concept identification
❌ Pattern recognition
❌ Semantic understanding
❌ Insight generation

**Coverage:** Layers 1-7 only

---

### **With Full Node.js Consolidation:**

✅ Everything above, PLUS:
✅ Knowledge extraction
✅ Concept identification
✅ Entity recognition
✅ Semantic relationships
✅ Pattern discovery
✅ Hypothesis generation
✅ Insight synthesis
✅ Strategic recommendations

**Coverage:** Layers 1-15 complete

---

## 🎯 **What I Mean by "Not Wired"**

### **The full consolidation engine EXISTS but:**

1. ❌ Not called by Edge Function
2. ❌ Not in cron schedule
3. ❌ Not running automatically
4. ❌ Must be triggered manually

### **To make it "wired" means:**

1. ✅ Make it run automatically (scheduled)
2. ✅ Connect it to Edge Functions (somehow)
3. ✅ Ensure it populates layers 8-15
4. ✅ Make it accessible to agents

---

## 🚀 **Immediate Solutions**

### **Quick Fix (Works Now):**

Add command to package.json:
```json
"job:full-consolidation": "tsx scripts/brain-consolidation-runner.ts"
```

Run manually:
```bash
pnpm run job:full-consolidation
```

**This WILL populate layers 8-15!**

---

### **Better Fix (Automatic):**

Deploy as Cloud Run/Lambda:
```
1. Deploy brain-consolidation-runner.ts as microservice
2. Add HTTP endpoint
3. Call from Edge Function
4. Include in cron schedule
```

**This makes it fully automatic!**

---

### **Best Fix (Native):**

Rewrite key extraction in SQL:
```sql
-- Extract concepts from signals
CREATE FUNCTION extract_concepts_from_signals(...)

-- Call from Edge Function
await supabase.rpc('extract_concepts_from_signals', { org_id });
```

**This runs natively in Supabase!**

---

## ✅ **Final Answer**

### **What IS wired:**
- ✅ Basic consolidation (layers 1-7)
- ✅ Can run via Edge Function
- ✅ Scheduled in cron

### **What is NOT wired:**
- ❌ Full consolidation (layers 8-15)
- ❌ Knowledge extraction
- ❌ Not automatic/scheduled

### **What exists but isn't connected:**
- ✅ Full consolidation code (brain-consolidation-runner.ts)
- ✅ Knowledge extraction code (memory-stack package)
- ❌ But not callable from Edge Functions
- ❌ But not in cron schedule

---

## 🎯 **So When I Said "Wire Up"**

I meant:

1. **Make full consolidation accessible**
   - Either via microservice
   - Or via SQL functions
   - Or via manual npm script

2. **Schedule it to run automatically**
   - Add to cron
   - Or call from Edge Function
   - Or run via external scheduler

3. **Ensure it populates layers 8-15**
   - Test that it works
   - Verify tables get data
   - Confirm extraction happens

---

**Right now:** Code exists, but not connected/automatic
**After wiring:** Code runs automatically and populates knowledge graph

**Does this clarify what I meant?**
