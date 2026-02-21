# 🧠 UNIFIED BRAIN ARCHITECTURE - ONE INTEGRATED SYSTEM

**Date**: February 14, 2026
**Status**: **ARCHITECTURE COMPLETE**
**Principle**: **ONE BRAIN - NO REDUNDANT SYSTEMS**

---

## ✅ The Problem (What We Fixed)

### Before: THREE DISCONNECTED SYSTEMS ❌

We had **three overlapping systems** that appeared separate:

1. **Jarvis** (demo/jarvis-query.ts) - Code intelligence queries
2. **Copilot Framework** (copilot-framework.ts) - Generic Claude wrapper
3. **Brain Architecture** (brain-context-builder.ts) - Unified intelligence

**Problems:**
- Redundant functionality
- No clear integration path
- Confusion about which system to use
- Risk of multiple "wrong paths"
- Not scalable architecture

### After: ONE UNIFIED BRAIN ✅

**Natural Language Query Router** - THE BRAIN'S MOUTH

```
User Question (Natural Language)
         ↓
   Natural Language Query Router  ← THE SINGLE ENTRY POINT
   (Intent Detection + Domain Extraction)
         ↓
   ┌─────────────────────────────────────┐
   │  Complexity Assessment              │
   │  Simple → Fast Query                │
   │  Complex → Action Domain            │
   │  Very Complex → Agent               │
   └─────────────────────────────────────┘
         ↓
   Brain Context Builder
   (Causal Graph + Patterns + Rules)
         ↓
   Action Domain Execution
   (Motor Cortex: forecast, diagnose, etc.)
         ↓
   Copilot Framework
   (3-layer prompt + Claude streaming)
         ↓
   Quality Gate Validation
   (Grounding + Citation check)
         ↓
   Natural Language Answer + Citations
```

---

## 🎯 THE UNIFIED ARCHITECTURE

### **7 Layers - One Integrated Brain**

```
L7: User Interface (CLI, API, Chat)
         ↓
L6: Natural Language Query Router ← NEW! (Phase 3)
    (THE BRAIN'S MOUTH - Single NL entry point)
         ↓
L5: Copilot Framework
    (Broca-Wernicke Language Network - Claude streaming + memory)
         ↓
L4: Action Domain Registry
    (Motor Cortex - 28 Brodmann areas: forecast, diagnose, etc.)
         ↓
L3: Brain Context Builder
    (Prefrontal Cortex - Intent detection + context assembly)
         ↓
L2: Brain Regions
    (Specialized modules: causal graph, patterns, rules, LLM amplifier)
         ↓
L1: Knowledge Graphs
    (Dependency graph, expertise graph, collaboration graph)
         ↓
L0: Raw Data
    (Code, PRs, commits, metrics, events)
```

---

## 🔄 How It Works - Three Routes

### **Route 1: Fast Query** (Simple Lookups)

**Examples:**
- "What is the current MRR?"
- "How many engineers do we have?"
- "What's the latest deployment?"

**Flow:**
```
Question → Intent Detection → Fast Path
         ↓
No heavy processing (skip action domains)
         ↓
Direct lookup from context
         ↓
Claude formats answer
         ↓
Return immediately (< 500ms)
```

**Threshold**: Complexity ≤ 3

---

### **Route 2: Action Domain** (Complex Reasoning)

**Examples:**
- "What happens if we increase marketing spend by 20%?"
- "Which PRs have the highest technical debt risk?"
- "How would changing pricing affect churn?"

**Flow:**
```
Question → Intent Detection → Action Domain Path
         ↓
Build full brain context (causal graph + patterns + rules)
         ↓
Execute action domain (forecast, diagnose, etc.)
         ↓
Action domain returns structured data + insights
         ↓
Build 3-layer copilot prompt with domain data
         ↓
Claude streams response with citations
         ↓
Quality gate validates grounding
         ↓
Return answer + citations + confidence
```

**Threshold**: 3 < Complexity < 8

---

### **Route 3: Agent** (Autonomous Execution)

**Examples:**
- "Analyze the entire codebase and create a refactoring plan"
- "Build a predictive model for churn based on all data"
- "Investigate why revenue dropped and propose fixes"

**Flow:**
```
Question → Intent Detection → Agent Path
         ↓
Autonomous agent orchestration
         ↓
Multi-step reasoning with brain-agent-fusion
         ↓
Complex multi-domain execution
         ↓
Return comprehensive plan + analysis
```

**Threshold**: Complexity ≥ 8

---

## 🧩 Component Integration

### **1. Natural Language Query Router** (NEW - Phase 3)

**File**: `orchestrator/natural-language-query-router.ts`

**Role**: THE BRAIN'S MOUTH - Single entry point for all natural language

**Responsibilities:**
- ✅ Accept user question in natural language
- ✅ Detect intent (forecast, diagnose, compare, etc.)
- ✅ Extract domains (code, finance, people, growth)
- ✅ Assess complexity (fast query vs action domain vs agent)
- ✅ Route to appropriate execution path
- ✅ Integrate conversation memory
- ✅ Return grounded response with citations

**Example Usage:**
```typescript
import { createNaturalLanguageQueryRouter } from '@nexus-ai/memory-stack';

const router = createNaturalLanguageQueryRouter({
  brainContextBuilder,
  actionDomainRegistry,
  copilotInstance,
});

const result = await router.route({
  question: "What happens if event-bus.ts fails?",
  conversationId: "conv_123",
  userId: "user_tooktiaki_dev1",
});

console.log(result.answer); // Natural language response
console.log(result.confidence); // 0.9
console.log(result.route); // "action_domain"
console.log(result.citations); // Grounding sources
```

---

### **2. Brain Context Builder**

**File**: `orchestrator/brain-context-builder.ts`

**Role**: PREFRONTAL CORTEX - Executive function + context assembly

**Integration Points:**
- ✅ Called by Natural Language Query Router for intent detection
- ✅ Provides full brain context to action domains
- ✅ Loads causal edges, patterns, rules from trained knowledge
- ✅ Normalizes entity state across domains

**What It Provides:**
```typescript
const context = await brainContextBuilder.build({
  domains: ['code', 'people'],
  intent: 'diagnose',
  includeTrainedKnowledge: true,
  includeCausalEdges: true,
  includePatterns: true,
});

// Returns:
{
  causalEdges: [...], // From causal_edges table
  patterns: [...],    // From pattern_memory table
  rules: [...],       // From rules_engine table
  persona: {...},     // Domain-specific persona
  conversationHistory: [...], // Previous turns
}
```

---

### **3. Action Domain Registry**

**File**: `orchestrator/action-domain-registry.ts`

**Role**: MOTOR CORTEX - Execution of brain functions

**28 Brodmann Areas (Action Domains):**
- forecast, simulate, explain-causal, diagnose, compare, monitor
- recommend, optimize, audit, correlate, alert, comply
- predict, allocate, route, escalate, triage, learn
- adapt, consolidate, federate, cascade, backtest, experiment
- arbitrate, orchestrate, meta-reason, self-critique

**Integration Points:**
- ✅ Called by Natural Language Query Router for complex queries
- ✅ Receives full brain context from Brain Context Builder
- ✅ Executes domain-specific logic (forecast MRR, diagnose issue, etc.)
- ✅ Returns structured data + insights to Copilot Framework

**Example:**
```typescript
const result = await actionDomainRegistry.execute('diagnose', {
  input: { query: "Why did MRR drop?" },
  brain: fullBrainContext,
});

// Returns:
{
  success: true,
  confidence: 0.9,
  data: { causalFactors: [...], impactAnalysis: {...} },
  insights: ["Key driver: Churn increased 15%", ...],
  recommendations: ["Reduce churn via...", ...],
}
```

---

### **4. Copilot Framework**

**File**: `orchestrator/copilot-framework.ts`

**Role**: BROCA-WERNICKE LANGUAGE NETWORK - Claude streaming + memory

**Integration Points:**
- ✅ Called by Natural Language Query Router for response generation
- ✅ Receives structured data from action domains
- ✅ Builds 3-layer prompt (data → analysis → output templates)
- ✅ Streams responses from Claude via SSE
- ✅ Maintains conversation memory (LRU + TTL eviction)
- ✅ Validates responses via quality gates

**Example:**
```typescript
const prompt = buildCopilotPrompt(
  domainAdapter,
  'diagnose',
  actionDomainResult
);

const stream = await copilotInstance.chat(userQuestion, {
  conversationId: 'conv_123',
  systemPrompt: prompt,
});

// Streams Claude response with:
// - Grounded data (from action domain)
// - Citations (from brain context)
// - Structured output (from templates)
```

---

## 🔍 What Happened to Jarvis?

### **Jarvis is NOT Deleted - It's Integrated**

**Before:**
- Jarvis was a **standalone demo** (jarvis-query.ts)
- Hardcoded 20 queries (q1-q20)
- Direct graph access
- CLI-only interface

**After:**
- Jarvis **logic** moves into **Code Comprehension Action Domain**
- Jarvis **queries** become **unit tests** for code domain
- **Natural Language Query Router** replaces hardcoded CLI
- **Copilot Framework** provides streaming + memory

**Migration Path:**

```typescript
// OLD (Jarvis demo):
npx tsx jarvis-query.ts q1
// Hardcoded: "Event bus is throwing errors. What is affected?"

// NEW (Unified Brain):
const result = await router.route({
  question: "What is affected if event bus throws errors?",
});
// Routes through: NL Router → Brain Context → Code Domain → Copilot
```

**Key Difference:**
- ❌ Before: Hardcoded query strings → direct graph queries
- ✅ After: Natural language → intent detection → action domain → grounded response

---

## 📊 Comparison: Old vs New

| Feature | Old (Jarvis Demo) | New (Unified Brain) |
|---------|-------------------|---------------------|
| **Entry Point** | CLI script | Natural Language Query Router |
| **Query Type** | Hardcoded (q1-q20) | Natural language (any question) |
| **Intent Detection** | None (preset) | Brain Context Builder |
| **Domain Support** | Code only | All domains (code, finance, people, etc.) |
| **Conversation Memory** | None | Copilot Framework (LRU + TTL) |
| **Response Format** | Text logs | Streamed Claude + citations |
| **Quality Gates** | None | Grounding validation |
| **Scalability** | Not scalable | Fully scalable (multi-domain) |

---

## 🎓 Usage for Tooktiaki

### **Example 1: Code Impact Query**

```typescript
import { createNaturalLanguageQueryRouter } from '@nexus-ai/memory-stack';

const router = createNaturalLanguageQueryRouter(config);

const result = await router.route({
  question: "What breaks if UserService.scala is modified?",
  userId: "user_tooktiaki_dev1",
  scope: {
    repositories: ["tooktiaki/tooktiaki-core"],
  },
});

console.log(result.answer);
// "If UserService.scala is modified, it will affect 23 files including:
//  - AuthController.scala (direct dependency)
//  - UserRepository.scala (called by UserService)
//  - SessionManager.scala (uses user authentication)
//  Impact radius: 23 files, Risk score: 0.72 (high)"

console.log(result.citations);
// [
//   { source: "Causal: UserService → AuthController", type: "causal_edge", ... },
//   { source: "Pattern: Authentication Flow", type: "pattern", ... }
// ]
```

---

### **Example 2: Team Expertise Query**

```typescript
const result = await router.route({
  question: "Who knows the most about Akka actors in our codebase?",
  userId: "user_tooktiaki_admin",
});

console.log(result.answer);
// "Based on code contributions and reviews:
//  1. Alice (strength: 8.5) - 23 commits, 12 reviews
//  2. Bob (strength: 6.2) - 15 commits, 8 reviews
//  3. Carol (strength: 3.1) - 7 commits, 4 reviews
//
//  Alice has the most expertise in Akka actors, particularly in:
//  - UserActor.scala
//  - NotificationActor.scala
//  - SupervisorStrategy patterns"
```

---

### **Example 3: Predictive Query**

```typescript
const result = await router.route({
  question: "What would happen if we refactor the authentication system?",
  userId: "user_tooktiaki_dev1",
});

console.log(result.answer);
// "Refactoring the authentication system would:
//  - Affect 45 files across 3 domains (web, api, mobile)
//  - Require updates to 8 Akka actors
//  - Impact 12 Play controllers
//  - Estimated effort: 3-4 sprints
//  - Risk: HIGH (critical path, many dependencies)
//
//  Recommendations:
//  1. Create feature flag for gradual rollout
//  2. Implement dual authentication during transition
//  3. Update all dependent services simultaneously
//  4. Plan for 2-week testing period"
```

---

## ✅ Benefits of Unified Architecture

### **1. No Redundancy**
- ✅ ONE entry point for natural language (not 3)
- ✅ ONE brain context builder (not scattered)
- ✅ ONE action domain registry (not duplicated)
- ✅ ONE copilot framework (not multiple wrappers)

### **2. Scalable**
- ✅ Add new domains without changing router
- ✅ Add new action domains without changing copilot
- ✅ Add new intents without hardcoding queries

### **3. Maintainable**
- ✅ Clear separation of concerns
- ✅ Each layer has one responsibility
- ✅ No circular dependencies
- ✅ Easy to test (mock brain context, test domains)

### **4. Extensible**
- ✅ New domains plug in via Brain Context Builder
- ✅ New action domains register in Action Domain Registry
- ✅ New prompts extend Copilot Framework templates
- ✅ No code changes to Natural Language Query Router

---

## 📦 Files in Unified Architecture

### **Core Integration Files**

1. **`orchestrator/natural-language-query-router.ts`** (NEW - Phase 3)
   - THE BRAIN'S MOUTH
   - Single entry point for all natural language
   - Routes to fast query / action domain / agent

2. **`orchestrator/brain-context-builder.ts`** (Existing)
   - PREFRONTAL CORTEX
   - Intent detection + domain extraction
   - Loads causal edges, patterns, rules

3. **`orchestrator/action-domain-registry.ts`** (Existing)
   - MOTOR CORTEX
   - 28 Brodmann areas (action domains)
   - Executes brain functions

4. **`orchestrator/copilot-framework.ts`** (Existing)
   - BROCA-WERNICKE LANGUAGE NETWORK
   - Claude streaming + conversation memory
   - 3-layer prompts + quality gates

### **Supporting Files**

5. **`orchestrator/brain-commander.ts`** (Existing)
   - Routes complex queries through dispatch assessor
   - Determines execution path

6. **`orchestrator/brain-agent-fusion.ts`** (Existing)
   - Agent orchestration for autonomous execution

7. **`demo/jarvis-query.ts`** (Existing - Demo Only)
   - Standalone demo showing graph capabilities
   - NOT part of production architecture
   - Used for examples and documentation

---

## 🚀 Deployment for Tooktiaki

**What Tooktiaki Gets:**

```typescript
// ONE unified API for all natural language queries
const router = createNaturalLanguageQueryRouter({
  brainContextBuilder: tooktakiBrain,
  actionDomainRegistry: tooktakiDomains,
  copilotInstance: tooktakiCopilot,
});

// Works for ALL domains:
await router.route({ question: "Code: What breaks if X changes?" });
await router.route({ question: "People: Who knows about Akka?" });
await router.route({ question: "Finance: What if MRR grows 20%?" });
await router.route({ question: "Growth: Why did churn increase?" });

// ONE architecture - scales to ANY domain
```

---

## ✅ SUMMARY

### **ONE UNIFIED BRAIN ARCHITECTURE**

**Principle**: No redundant systems, no multiple paths, ONE integrated brain.

**Components**:
1. ✅ **Natural Language Query Router** - THE BRAIN'S MOUTH (single NL entry)
2. ✅ **Brain Context Builder** - PREFRONTAL CORTEX (intent + context)
3. ✅ **Action Domain Registry** - MOTOR CORTEX (execution)
4. ✅ **Copilot Framework** - LANGUAGE NETWORK (Claude + memory)

**Result**: Clean, scalable, maintainable architecture for Tooktiaki and all future customers.

---

*Built with 🧠 by the NexusBrain team*
*Unified architecture completed: February 14, 2026*
*Status: ONE BRAIN - NO REDUNDANT SYSTEMS* ✅
