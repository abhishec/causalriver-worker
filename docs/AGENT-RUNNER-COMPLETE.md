# Agent Runner — COMPLETE ✅

**Status**: 9/9 agents FULLY WIRED and ORCHESTRATED
**Date**: 2026-02-14
**Orchestrator**: Brain Orchestrator (Central Nervous System)

---

## 🎯 Executive Summary

**ALL 9 PRODUCTION AGENTS** are now:
- ✅ Using ManusNativeAgent V6 template
- ✅ Auto-registered to globalRegistry on import
- ✅ Imported in brain-orchestrator.ts
- ✅ Have defined schedules (cron expressions)
- ✅ Have motor command implementations
- ✅ Wired to ALL 93+ brain systems
- ✅ Part of unified orchestration loop

**NO LOOSE AGENTS.** Every agent is discovered, scheduled, and executed by the Brain Orchestrator.

---

## 🧠 Brain Orchestrator Architecture

### What It Does

The **Brain Orchestrator** is the Central Nervous System that coordinates all training agents:

1. **Agent Discovery** — Auto-discovers all registered agents via globalRegistry
2. **Schedule Management** — Runs agents based on their cron schedules
3. **Execution Routing** — Executes agents in-process (future: child ECS tasks for large agents)
4. **Brain Health Monitoring** — Tracks health of all brain regions via BrainPipeline
5. **Motor Command Execution** — Flushes queued motor commands after agent runs
6. **Calibration Updates** — Updates agent prediction accuracy based on feedback
7. **Inter-Agent Communication** — Agents can call other agents via AgentRegistry

### How It Works

```typescript
// 1. Import all agents (they auto-register on import)
import './agents/autonomous-trainer';
import './agents/brain-consolidation';
import './agents/brain-dmn';
// ... etc

// 2. Brain Orchestrator discovers them
const agents = globalRegistry.list();
// → Returns all 9 agents

// 3. Orchestrator checks schedules
const dueAgents = await this.getAgentsDueForExecution();
// → Returns agents whose cron schedule says "run now"

// 4. Execute each due agent
for (const agent of dueAgents) {
  await this.executeAgent(agent);
  // → Runs agent.run() with full brain access
}

// 5. Post-processing
await this.flushMotorCommands();     // Execute Slack/GitHub/Jira actions
await this.updateCalibration();      // Recalibrate low-accuracy agents
await this.healthCheck();            // Monitor brain health
```

---

## 📊 All 9 Production Agents

### 1. Autonomous Trainer ✅
- **Schedule**: `0 */6 * * *` (Every 6 hours)
- **Brain Region**: Sensory Cortex (Region #10)
- **Function**: Public data learning (FRED, GitHub, Wikipedia, etc.)
- **Motor Commands**: Slack notifications on training completion
- **File**: `scripts/agents/autonomous-trainer.ts`

### 2. Brain Consolidation ✅
- **Schedule**: `0 2 * * *` (Daily at 2 AM UTC)
- **Brain Region**: Default Mode Network (DMN / Region #8)
- **Function**: 10-step brain sleep cycle (causal discovery, pruning, strengthening, federation)
- **Motor Commands**: Slack (discoveries), GitHub (critical anomalies)
- **File**: `scripts/agents/brain-consolidation.ts`

### 3. Brain DMN ✅
- **Schedule**: `0 0,4,8,12,16,20 * * *` (Every 4 hours: midnight, 4 AM, 8 AM, 12 PM, 4 PM, 8 PM)
- **Brain Region**: Default Mode Network (DMN)
- **Function**: Background insight scanning (unexpected correlations, cascades, knowledge gaps)
- **Motor Commands**: Slack (high-importance insights), Email (critical insights)
- **File**: `scripts/agents/brain-dmn.ts`

### 4. Cost Agent ✅
- **Schedule**: `0 3 * * *` (Daily at 3 AM UTC)
- **Brain Region**: Hypothalamus (Cost Tracker)
- **Function**: LLM cost monitoring + AWS Cost Explorer
- **Motor Commands**: Slack (budget violations, cost spikes)
- **File**: `scripts/agents/cost-agent.ts`

### 5. Benchmark ✅
- **Schedule**: `0 5 * * 0` (Sunday at 5 AM UTC)
- **Brain Region**: Cerebellum (Benchmark Evaluator)
- **Function**: LongMemEval + CauseMe benchmark suite
- **Motor Commands**: Slack (accuracy improvements), GitHub (regressions)
- **File**: `scripts/agents/benchmark.ts`

### 6. Git Code Trainer ✅
- **Schedule**: `0 2 * * 0` (Sunday at 2 AM UTC)
- **Brain Region**: Cerebellum (Code Intelligence)
- **Function**: Trains on 27 major open-source repos (100k+ stars)
- **Motor Commands**: GitHub issues (training completion), Slack (major runs)
- **File**: `scripts/agents/git-code-trainer-v6.ts`

### 7. Weekly Brain Scan ✅
- **Schedule**: `0 4 * * 0` (Sunday at 4 AM UTC)
- **Brain Region**: Cerebellum (Brain Health Monitor)
- **Function**: 11-region brain scan + pruning + performance evaluation
- **Motor Commands**: Slack (health summary), GitHub (critical issues)
- **File**: `scripts/agents/weekly-brain-scan.ts`

### 8. Monthly Deep Analysis ✅
- **Schedule**: `0 3 1 * *` (1st of month at 3 AM UTC)
- **Brain Region**: Hippocampus (Long-Term Memory)
- **Function**: Full historical causal discovery + trend analysis
- **Motor Commands**: Slack (monthly insights), Email (executive briefing)
- **File**: `scripts/agents/monthly-deep-analysis.ts`

### 9. Proactive Intelligence ✅
- **Schedule**: `0 1,5,9,13,17,21 * * *` (Every 4 hours offset: 1 AM, 5 AM, 9 AM, 1 PM, 5 PM, 9 PM)
- **Brain Region**: Amygdala (Threat Detection)
- **Function**: Proactive alerting (anomalies, risks, opportunities)
- **Motor Commands**: Slack (high-priority alerts), Email (critical threats)
- **File**: `scripts/agents/proactive-intelligence.ts`

---

## 🔄 Orchestrator Execution Flow

### Continuous Mode (Production)

```bash
# Start orchestrator (runs forever)
pnpm exec tsx scripts/brain-orchestrator.ts
```

**What happens:**

1. **Agent Discovery** (startup)
   - Imports all 9 agent files
   - Agents auto-register to globalRegistry on import
   - Orchestrator discovers all 9 agents
   - Registers agents to brain's AgentRegistry

2. **Initial Health Check**
   - Checks brain health (all regions)
   - Logs degraded/critical regions

3. **Continuous Loop** (runs forever)
   - **Health Check Job** (every 5 min)
     - Monitors brain health
     - Logs status

   - **Agent Schedule Check Job** (every 1 hour)
     - Checks which agents are due based on cron schedules
     - Executes due agents
     - Flushes motor commands
     - Updates calibration metrics

4. **Graceful Shutdown** (on SIGINT/SIGTERM)
   - Stops cron jobs
   - Finishes current operations
   - Exits cleanly

### One-Time Mode (Testing)

```bash
# Run once and exit
ORCHESTRATOR_MODE=once pnpm exec tsx scripts/brain-orchestrator.ts
```

**What happens:**
1. Discovers all agents
2. Runs initial health check
3. Executes all due agents ONCE
4. Exits

---

## 🚀 AWS Deployment

### ECS Fargate Service

**Recommended Architecture**: Single long-running orchestrator service

```
ECS Service: brain-orchestrator
  ├─ Task Definition: nexusbrain-orchestrator
  ├─ vCPU: 4 (4096)
  ├─ Memory: 16 GB (16384 MB)
  ├─ Container: brain-orchestrator-container
  │   ├─ Image: <ECR_REPO>/brain-orchestrator:latest
  │   ├─ Environment: ORCHESTRATOR_MODE=continuous
  │   ├─ Environment: SUPABASE_URL=<from SSM>
  │   ├─ Environment: SUPABASE_SERVICE_ROLE_KEY=<from SSM>
  │   ├─ Environment: SLACK_BOT_TOKEN=<from SSM>
  │   ├─ Environment: GITHUB_TOKEN=<from SSM>
  │   └─ Command: ["node", "scripts/brain-orchestrator.js"]
  └─ Scheduling: N/A (always running, self-scheduling)
```

**Cost Estimate**: ~$70-90/month (vs $100+ for 9 separate ECS tasks)

### Alternative: EventBridge + Lambda (Not Recommended)

While you COULD use EventBridge to trigger individual agents via Lambda, this is **NOT recommended** because:

❌ More expensive (9 separate Lambda invocations every few hours)
❌ No central health monitoring
❌ No inter-agent communication
❌ No motor command batching
❌ More complex infrastructure (9 separate EventBridge rules)

The Brain Orchestrator provides:
✅ Central nervous system coordination
✅ Unified health monitoring
✅ Motor command batching
✅ Calibration feedback loop
✅ Inter-agent communication
✅ Single deployment artifact

---

## 🔍 Agent Auto-Wiring Guarantee

### Pattern

Every agent follows this pattern:

```typescript
// scripts/agents/my-agent.ts

export class MyAgent extends ManusNativeAgent {
  readonly name = 'my-agent';
  readonly version = '1.0.0';
  readonly description = 'Agent description';
  readonly brainRegion = 'Brain Region';
  readonly neurologicalFunction = 'Function';

  async fetch() { /* ... */ }
  async convert(data) { /* ... */ }
  protected async generateMotorCommands(result) { /* ... */ }
}

// ── Self-Registration: Auto-register to globalRegistry on import ──
import { createClient } from '@supabase/supabase-js';
import { globalRegistry } from '../agent-framework/agent-registry';

globalRegistry.register({
  name: 'my-agent',
  description: 'Agent description',
  version: '1.0.0',
  factory: (config) => {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    return new MyAgent(supabase, config.organizationId, { verbose: config.verbose });
  },
  schedule: '0 2 * * *',  // Cron expression
  resourceRequirements: { cpu: '1024', memory: '4096' },
  tags: ['training', 'custom'],
});
```

### Orchestrator Import

```typescript
// scripts/brain-orchestrator.ts

import './agents/my-agent';  // Auto-registers on import!
```

**That's it!** The agent is now:
- ✅ Fully wired to ALL 93+ brain systems
- ✅ Auto-registered to globalRegistry
- ✅ Discoverable by Brain Orchestrator
- ✅ Scheduled for execution
- ✅ Has motor commands, calibration, brain pipeline

---

## 🧪 Testing Agent Wiring

### Verify All Agents Are Registered

```bash
pnpm exec tsx -e "
import './scripts/agents/autonomous-trainer';
import './scripts/agents/brain-consolidation';
import './scripts/agents/brain-dmn';
import './scripts/agents/cost-agent';
import './scripts/agents/benchmark';
import './scripts/agents/git-code-trainer-v6';
import './scripts/agents/weekly-brain-scan';
import './scripts/agents/monthly-deep-analysis';
import './scripts/agents/proactive-intelligence';
import { globalRegistry } from './scripts/agent-framework/agent-registry';

const agents = globalRegistry.list();
console.log('Registered agents:', agents.length);
for (const agent of agents) {
  console.log(\`  - \${agent.name} v\${agent.version} [\${agent.schedule}]\`);
}
"
```

**Expected output**:
```
Registered agents: 9
  - autonomous-trainer v6.0.0 [0 */6 * * *]
  - brain-consolidation v6.0.0 [0 2 * * *]
  - brain-dmn v6.0.0 [0 0,4,8,12,16,20 * * *]
  - cost-agent v6.0.0 [0 3 * * *]
  - benchmark v6.0.0 [0 5 * * 0]
  - git-code-trainer v6.0.0 [0 2 * * 0]
  - weekly-brain-scan v6.0.0 [0 4 * * 0]
  - monthly-deep-analysis v6.0.0 [0 3 1 * *]
  - proactive-intelligence v6.0.0 [0 1,5,9,13,17,21 * * *]
```

### Run Orchestrator in Test Mode

```bash
ORCHESTRATOR_MODE=once pnpm exec tsx scripts/brain-orchestrator.ts
```

**Expected output**:
```
════════════════════════════════════════════════════════════════════════
  BRAIN ORCHESTRATOR START
════════════════════════════════════════════════════════════════════════

════════════════════════════════════════════════════════════════════════
  AGENT DISCOVERY
════════════════════════════════════════════════════════════════════════
[ORCHESTRATOR] [DISCOVERY] Found 9 registered agent(s)
[ORCHESTRATOR] [DISCOVERY]   ✓ autonomous-trainer v6.0.0 [0 */6 * * *] (1024 CPU, 4096 MB)
[ORCHESTRATOR] [DISCOVERY]   ✓ brain-consolidation v6.0.0 [0 2 * * *] (2048 CPU, 8192 MB)
[ORCHESTRATOR] [DISCOVERY]   ✓ brain-dmn v6.0.0 [0 0,4,8,12,16,20 * * *] (1024 CPU, 4096 MB)
...
[ORCHESTRATOR] [DISCOVERY] All agents registered in AgentRegistry ✓

════════════════════════════════════════════════════════════════════════
  AGENT SCHEDULE CHECK
════════════════════════════════════════════════════════════════════════
[ORCHESTRATOR] [SCHEDULE] 2 agent(s) due for execution
[ORCHESTRATOR] [EXECUTE] Running agent: brain-dmn
[ORCHESTRATOR] [EXECUTE] Agent brain-dmn completed in 12.3s (47 signals, 5 packs, 0 errors)
...
```

---

## 📈 Monitoring

### Brain Health

The orchestrator monitors brain health every 5 minutes:

```
[ORCHESTRATOR] [HEALTH] Overall: HEALTHY
[ORCHESTRATOR] [HEALTH] ✓ All brain regions healthy
```

If issues are detected:
```
[ORCHESTRATOR] [HEALTH] Overall: DEGRADED
[ORCHESTRATOR] [HEALTH] ⚠️  2 degraded, 1 critical regions
```

### Agent Execution Logs

Each agent run is logged:

```
[ORCHESTRATOR] [EXECUTE] Running agent: autonomous-trainer
[ORCHESTRATOR] [EXECUTE] Agent autonomous-trainer completed in 45.2s (1234 signals, 17 packs, 0 errors)
```

Failures are also logged:

```
[ORCHESTRATOR] [EXECUTE] ERROR: Agent cost-agent failed after 2.1s
  Supabase connection timeout
```

### Calibration Warnings

Low-accuracy agents are recalibrated:

```
[ORCHESTRATOR] [CALIBRATION] ⚠️  Agent proactive-intelligence accuracy is low (65.3%), recalibrating...
```

---

## 🎯 Key Benefits

### Before (Random ECS Tasks)
- ❌ 7 separate ECS task definitions
- ❌ 7 separate EventBridge rules
- ❌ No coordination between agents
- ❌ No health monitoring
- ❌ No motor command batching
- ❌ No calibration loop
- ❌ Cost: ~$100+/month

### After (Brain Orchestrator)
- ✅ Single ECS service
- ✅ Self-scheduling (no EventBridge needed)
- ✅ Central nervous system coordination
- ✅ Brain health monitoring
- ✅ Motor command batching
- ✅ Calibration feedback loop
- ✅ Inter-agent communication
- ✅ Cost: ~$70-90/month (30% savings)

---

## ✅ Conclusion

**ALL 9 AGENTS ARE FULLY WIRED** and orchestrated by the Brain Orchestrator.

**No loose agents running around.** Every agent:
- Uses ManusNativeAgent V6 template
- Auto-registers to globalRegistry on import
- Is discovered and executed by Brain Orchestrator
- Has access to ALL 93+ brain systems
- Can execute motor commands
- Tracks prediction accuracy via calibration loop
- Is part of a unified, neurologically-inspired architecture

**The brain can now GROW properly** with a central nervous system coordinating all subsystems.
