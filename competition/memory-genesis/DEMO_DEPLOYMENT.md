# Demo Deployment Plan - demo.usebrainos.com

**Current Status**: Demo org created, platform ready, needs data ingestion + deployment

---

## 🌐 Domain Structure

### Current Setup
```
platform.usebrainos.com
├── / (dashboard)
├── /brain (causal graph)
├── /copilot (chat interface)
├── /demo/memory-genesis ← NEW DEMO PAGE
└── ... (other routes)
```

### Proposed Setup for Competition

**Option A: Subdomain Redirect** (Recommended)
```
demo.usebrainos.com → Redirects to platform.usebrainos.com/demo/memory-genesis
```

**Option B: Separate Deployment**
```
demo.usebrainos.com → Standalone Next.js app (just demo pages)
platform.usebrainos.com → Full platform (existing)
```

**Recommendation**: Use Option A (subdomain redirect) because:
- ✅ Simpler to maintain (one codebase)
- ✅ Shares authentication & data layer
- ✅ Can leverage existing components
- ✅ Faster to deploy (just add DNS record)

---

## 📋 Current Status Checklist

### Infrastructure ✅
- [x] Demo org created (`00000000-0000-4000-b000-000000000001`)
- [x] Database tables exist
- [x] Supabase connection working
- [ ] Data ingested (NEEDS TO RUN)
- [ ] Consolidation ran (NEEDS TO RUN)

### Platform Code ✅
- [x] Demo page created (`platform/app/(demo)/memory-genesis/page.tsx`)
- [x] UI components ready
- [x] Tab structure built
- [ ] API endpoints (NEEDS TO BE BUILT)
- [ ] Data visualization (NEEDS TO BE BUILT)

### Deployment ⏳
- [ ] Ingest realistic data
- [ ] Run consolidation
- [ ] Create API routes
- [ ] Test locally
- [ ] Deploy to Vercel
- [ ] Setup DNS (demo.usebrainos.com)

---

## 🚀 Immediate Actions (Next 2 Hours)

### Step 1: Ingest Demo Data (15 min)

Run this to actually put data in the demo org:

```bash
cd "/path/to/NexusBrain"

# Set environment
export SUPABASE_URL=https://zmlqvuzoodcgmkgkivfw.supabase.co
export SUPABASE_ANON_KEY=<your-key>

# Run realistic demo with the demo org
export DEMO_DAYS=90
npm run demo:memory-genesis:realistic

# This will:
# 1. Generate 90 days of synthetic data
# 2. Insert into signals table with demo org_id
# 3. Run consolidation cycles
# 4. Discover causal patterns
# 5. Show validation results
```

### Step 2: Verify Data (5 min)

Check Supabase Dashboard:
```
1. Go to: https://supabase.com/dashboard/project/zmlqvuzoodcgmkgkivfw
2. Table Editor → signals
3. Filter: organization_id = '00000000-0000-4000-b000-000000000001'
4. Should see ~50,000 rows
```

### Step 3: Test Platform Locally (10 min)

```bash
cd platform
npm run dev

# Visit: http://localhost:3001/demo/memory-genesis
# Should see demo page with stats
```

### Step 4: Create API Endpoints (30 min)

Create these files in `platform/app/api/demo/`:

```typescript
// stats/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('org') || '00000000-0000-4000-b000-000000000001';

  // Query Supabase for stats
  const stats = await getStats(orgId);

  return Response.json(stats);
}

// causal-graph/route.ts
export async function GET(request: Request) {
  const orgId = '00000000-0000-4000-b000-000000000001';

  // Load causal DAG from database
  const graph = await loadDAGFromDatabase(supabase, orgId);

  // Format for D3.js
  const nodes = Array.from(graph.nodes.values()).map(n => ({
    id: n.id,
    domain: n.domain,
    ...n
  }));

  const links = graph.edges.map(e => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
    ...e
  }));

  return Response.json({ nodes, links });
}

// query/route.ts
export async function POST(request: Request) {
  const { question, maxHops } = await request.json();

  // Use multi-hop reasoner
  const result = await queryBrain(question, maxHops);

  return Response.json(result);
}
```

### Step 5: Deploy to Vercel (15 min)

```bash
# From platform directory
cd platform

# Deploy to Vercel
vercel --prod

# Get deployment URL
# Should be: platform-xyz.vercel.app
```

### Step 6: Setup DNS (5 min)

In your DNS provider (likely Vercel or Cloudflare):

```
Type: CNAME
Name: demo
Value: platform.usebrainos.com
TTL: Auto

Result: demo.usebrainos.com → platform.usebrainos.com/demo/memory-genesis
```

---

## 🎯 Alternative: Quick Demo Setup (If Time is Short)

If you need to demo quickly without full deployment:

### Local Demo
```bash
# 1. Run platform locally
cd platform && npm run dev

# 2. Share screen / record video showing:
http://localhost:3001/demo/memory-genesis

# 3. For competition submission, use:
# - Video recording of local demo
# - Deployed to personal Vercel (free tier)
# - Mention "demo.usebrainos.com coming soon"
```

### Vercel Free Tier
```bash
# Deploy to Vercel preview
vercel

# Get URL like: platform-git-main-yourname.vercel.app
# Share this URL for competition
```

---

## 📊 What Judges Will See

### Landing Page (`demo.usebrainos.com`)

```
🧠 MEMORY GENESIS COMPETITION 2026 - NEXUSBRAIN DEMO

Quick Stats:
┌─────────────────────────────────────┐
│ Total Signals:        52,847        │
│ Causal Edges:         23             │
│ Consolidations:       13             │
│ Discovery Rate:       75%            │
└─────────────────────────────────────┘

Tabs:
• Overview          ← Start here
• Consolidation     ← Brain sleep timeline
• Memory            ← Query interface
• Validation        ← Pattern verification
• Benchmarks        ← CauseMe/CausalRivers results
```

### Interactive Features

1. **Causal Graph Visualization**
   - D3.js force-directed graph
   - Nodes colored by domain
   - Edges sized by confidence
   - Click to explore

2. **Natural Language Query**
   - Input: "Why did churn increase?"
   - Output: Multi-hop causal chains with explanations

3. **Consolidation Timeline**
   - Show each night's discoveries
   - "Day 7: Brain learned X patterns"
   - Click to see details

4. **Validation Dashboard**
   - Expected vs Discovered patterns
   - Success rate: 75%
   - Confidence scores

---

## 🔧 Technical Details

### API Endpoints

Base URL: `https://demo.usebrainos.com/api/demo/`

```
GET  /stats?org=<orgId>
     Returns: { totalSignals, causalEdges, consolidationRuns, discoveryRate }

GET  /causal-graph?org=<orgId>
     Returns: { nodes: [...], links: [...] }

POST /query
     Body: { question: string, maxHops?: number }
     Returns: { paths: [...], explanation: string }

GET  /consolidation-history?org=<orgId>
     Returns: { runs: [...] }

POST /run-consolidation?org=<orgId>
     Returns: SSE stream of consolidation progress
```

### Data Flow

```
User visits demo.usebrainos.com
    ↓
Next.js page: /demo/memory-genesis
    ↓
Fetches: /api/demo/stats
    ↓
Displays: Real-time dashboard
    ↓
User clicks: "View Causal Graph"
    ↓
Fetches: /api/demo/causal-graph
    ↓
Renders: D3.js visualization
    ↓
User asks: "Why did churn increase?"
    ↓
Posts: /api/demo/query
    ↓
Returns: Multi-hop reasoning paths
    ↓
Displays: Interactive explanation
```

---

## 📅 Timeline

**Today (Feb 15, Saturday PM)**:
- ⏳ Ingest data into demo org
- ⏳ Create API endpoints
- ⏳ Test locally

**Tomorrow (Feb 16, Sunday)**:
- Build causal graph viz
- Add query interface
- Test end-to-end

**Monday (Feb 17)**:
- Deploy to Vercel
- Setup demo.usebrainos.com DNS
- Final testing

**This Week**:
- Polish UI
- Add animations
- Optimize performance

**Feb 22**:
- 🎬 Record demo video

**Feb 28**:
- 🎯 Submit to competition

---

## ✅ Ready to Execute?

Next command to run:

```bash
# This will actually ingest the data and run consolidation
cd "/Users/abhishek/Library/CloudStorage/GoogleDrive-abhishek@monetiz3.com/My Drive/Workspace - Monetize Organisation/02 - Product/NexusBrain"

export SUPABASE_URL=https://zmlqvuzoodcgmkgkivfw.supabase.co
export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptbHF2dXpvb2RjZ21rZ2tpdmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MzE3ODUsImV4cCI6MjA4NjEwNzc4NX0.bSWsqP217_9Fm01XWPBq-sfHH2d4n2h-MooBNWp2jJc

# Ingest 90 days of data
npm run demo:memory-genesis:realistic:verbose
```

This will:
1. ✅ Use the existing demo org (`00000000-0000-4000-b000-000000000001`)
2. ✅ Generate 90 days of realistic synthetic data
3. ✅ Insert into Supabase signals table
4. ✅ Run consolidation cycles
5. ✅ Discover causal patterns
6. ✅ Validate against expected relationships
7. ✅ Show you the results

**Want me to run this now?**

---

Last Updated: Feb 15, 2026 @ 2:28 PM
Status: Ready to ingest data
Next: Run realistic demo with demo org
