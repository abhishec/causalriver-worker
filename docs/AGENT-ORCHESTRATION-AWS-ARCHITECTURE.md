# 🧠 Agent Orchestration as Core Brain Subsystem — AWS Architecture

**Date**: 2026-02-14
**Scope**: Redesign agents from "random ECS tasks" to "neurological brain subsystems"
**Goal**: Aspirational architecture where agents are **orchestrated**, not **scattered**

---

## 🎯 ARCHITECTURAL VISION

### **Current State** (Random 7 Agents ❌)
```
┌──────────────────────────────────────────────────────┐
│  AWS ECS Fargate (7 separate task definitions)      │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ trainer  │  │   dmn    │  │  cost-   │          │
│  │ (6h)     │  │  (4h)    │  │  agent   │          │
│  └──────────┘  └──────────┘  │  (24h)   │          │
│                               └──────────┘          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │consolid  │  │  bench-  │  │  git-    │          │
│  │ (24h)    │  │  mark    │  │  trainer │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                      │
│  NO orchestration, NO coordination, NO brain health │
└──────────────────────────────────────────────────────┘
```

**Problems**:
- ❌ Agents don't know about each other
- ❌ No centralized orchestration
- ❌ Can't compose agents (Manus workforce pattern)
- ❌ No brain health monitoring
- ❌ Manual ECS task scheduling (cron expressions scattered)
- ❌ Agents can't execute motor commands (read-only)

---

### **V5.1 Target State** (Brain Subsystem Architecture ✅)
```
┌─────────────────────────────────────────────────────────────┐
│  BRAIN ORCHESTRATOR (Single ECS Service + EventBridge)     │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  BrainPipeline (Orchestrator)                         │ │
│  │  ─────────────────────────────────────────────────   │ │
│  │  • AgentRegistry (discovers all agents)              │ │
│  │  • MotorCommandEngine (agents can ACT)               │ │
│  │  • CalibrationFeedbackLoop (agents improve)          │ │
│  │  • BrainHealthMonitor (tracks all regions)           │ │
│  │  • Cross-Agent Orchestration (compose workflows)     │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  NEUROLOGICAL SUBSYSTEMS (Agents as Brain Regions)         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Sensory Cortex     │  trainer-agent (6h)           │   │
│  │  Sleep Cycle        │  consolidation-agent (24h)    │   │
│  │  Default Mode Net   │  dmn-agent (4h)               │   │
│  │  Hypothalamus       │  cost-agent (24h)             │   │
│  │  Code Intelligence  │  git-trainer-agent (weekly)   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  All agents:                                                │
│  ✅ Auto-register to AgentRegistry                         │
│  ✅ Execute MotorCommands (Slack, Jira, GitHub)            │
│  ✅ Feed CalibrationLoop (prediction → outcome → improve)  │
│  ✅ Report to BrainHealthMonitor                           │
│  ✅ Composable (agents call other agents)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ AWS INFRASTRUCTURE DESIGN

### **Option 1: Single Orchestrator ECS Service** (Recommended ✅)

**Architecture**:
```
┌─────────────────────────────────────────────────────────┐
│  EventBridge (Scheduler)                                │
│  ────────────────────────────────────────────────────  │
│  • brain-orchestrator-tick (every 1 hour)              │
│    → Triggers: OrchestrationEngine.runScheduledAgents() │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│  ECS Fargate: brain-orchestrator (single long-running) │
│  ────────────────────────────────────────────────────  │
│  Task Definition:                                       │
│    CPU: 4096 (4 vCPU)                                   │
│    Memory: 16384 (16 GB)                                │
│    Container: nexusbrain-orchestrator:latest            │
│    Command: ["tsx", "scripts/brain-orchestrator.ts"]   │
│                                                         │
│  Runs:                                                  │
│    1. AgentRegistry.discover() — finds all agents      │
│    2. AgentScheduler.tick() — checks schedules         │
│    3. AgentRunner.execute() — runs due agents          │
│    4. BrainHealthMonitor.report() — health dashboard   │
│    5. MotorCommandEngine.flush() — execute actions     │
│    6. CalibrationLoop.update() — improve agents        │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│  Agent Execution (in-process or child tasks)           │
│  ────────────────────────────────────────────────────  │
│  Option A: In-process (import + run)                   │
│    → Fast, single container, simpler                   │
│  Option B: Child ECS tasks (spawn new task per agent)  │
│    → Isolated, parallel, more resilient                │
└─────────────────────────────────────────────────────────┘
```

**Pros**:
- ✅ Single point of orchestration
- ✅ Agents can call other agents (in-process composition)
- ✅ Centralized brain health monitoring
- ✅ Simplified deployment (one ECS service)
- ✅ Cost-effective (single container vs 7 containers)

**Cons**:
- ⚠️ Single point of failure (mitigated by ECS auto-restart)
- ⚠️ Memory constraints (16 GB shared across agents)

**Cost**: ~$100/month (4 vCPU, 16 GB, 24/7)

---

### **Option 2: Event-Driven Serverless** (Alternative)

**Architecture**:
```
┌─────────────────────────────────────────────────────────┐
│  EventBridge (Scheduler)                                │
│  ────────────────────────────────────────────────────  │
│  • trainer-agent-schedule (every 6h)                   │
│  • consolidation-agent-schedule (daily 2 AM)           │
│  • dmn-agent-schedule (every 4h)                       │
│  • cost-agent-schedule (daily 3 AM)                    │
│  • git-trainer-schedule (weekly Sun 2 AM)              │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│  Lambda (Orchestrator): brain-agent-router              │
│  ────────────────────────────────────────────────────  │
│  Receives EventBridge trigger →                         │
│    1. Parse event (which agent to run)                 │
│    2. Spawn ECS Fargate task for that agent            │
│    3. Wait for completion                              │
│    4. Update AgentRegistry + BrainHealth               │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│  ECS Fargate (One-Shot Tasks)                          │
│  ────────────────────────────────────────────────────  │
│  • trainer-agent (2 vCPU, 8 GB, ~42 min)               │
│  • consolidation-agent (2 vCPU, 8 GB, ~25 min)         │
│  • dmn-agent (1 vCPU, 4 GB, ~8 min)                    │
│  • cost-agent (0.5 vCPU, 2 GB, ~2 min)                 │
│  • git-trainer-agent (2 vCPU, 8 GB, ~60 min)           │
└─────────────────────────────────────────────────────────┘
```

**Pros**:
- ✅ Agent isolation (one failure doesn't crash others)
- ✅ Parallel execution (all agents can run concurrently)
- ✅ Pay-per-use (no idle costs)

**Cons**:
- ❌ No inter-agent communication (agents are isolated)
- ❌ Complex orchestration (Lambda → ECS → wait → update)
- ❌ Cold starts (Lambda + ECS task spawn)

**Cost**: ~$30-50/month (pay-per-use, cheaper for low frequency)

---

### **Option 3: Hybrid (Orchestrator + On-Demand Tasks)** (Best of Both ✅)

**Architecture**:
```
┌─────────────────────────────────────────────────────────┐
│  ECS Fargate: brain-orchestrator (long-running)        │
│  ────────────────────────────────────────────────────  │
│  Runs:                                                  │
│    • AgentScheduler (checks schedules every 1 hour)    │
│    • BrainHealthMonitor (reports every 5 min)          │
│    • MotorCommandEngine (executes queued commands)     │
│    • CalibrationLoop (updates agent accuracy)          │
│                                                         │
│  Small agents (dmn, cost) → Run in-process             │
│  Large agents (trainer, git) → Spawn child ECS tasks   │
└─────────────────────────────────────────────────────────┘
            ↓ (small agents)
┌─────────────────────────────────────────────────────────┐
│  In-Process Execution                                   │
│  ────────────────────────────────────────────────────  │
│  const agent = new DMNAgent(config);                   │
│  await agent.run();                                     │
└─────────────────────────────────────────────────────────┘
            ↓ (large agents)
┌─────────────────────────────────────────────────────────┐
│  Child ECS Tasks (On-Demand)                           │
│  ────────────────────────────────────────────────────  │
│  await ecsClient.runTask({                             │
│    taskDefinition: 'trainer-agent',                    │
│    launchType: 'FARGATE',                              │
│  });                                                    │
└─────────────────────────────────────────────────────────┘
```

**Pros**:
- ✅ Small agents run fast (in-process, no spawn overhead)
- ✅ Large agents isolated (parallel, no memory constraints)
- ✅ Centralized orchestration (agents know about each other)
- ✅ Cost-optimized (only spawn heavy agents when needed)

**Cons**:
- ⚠️ Hybrid complexity (two execution paths)

**Cost**: ~$70/month (orchestrator 24/7 + on-demand tasks)

---

## 📊 RECOMMENDED ARCHITECTURE: **HYBRID**

**Why Hybrid Wins**:
1. **Best Developer Experience** — AgentRegistry, MotorCommands, Calibration all in one place
2. **Cost-Optimized** — Small agents in-process, large agents on-demand
3. **Composable** — Agents can call other agents (Manus workforce pattern)
4. **Resilient** — Large agents isolated, orchestrator auto-restarts
5. **Aspirational** — Aligns with "brain as unified system" vision

---

## 🏗️ IMPLEMENTATION: Brain Orchestrator Service

### **Infrastructure as Code** (CDK)

```typescript
// infra/brain-orchestrator-stack.ts
export class BrainOrchestratorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC for all brain infrastructure ──
    const vpc = new ec2.Vpc(this, 'BrainVPC', {
      maxAzs: 2,
      natGateways: 1,
    });

    // ── ECS Cluster for brain services ──
    const cluster = new ecs.Cluster(this, 'BrainCluster', {
      vpc,
      clusterName: 'nexusbrain-cluster',
    });

    // ── Task Definition: Brain Orchestrator ──
    const orchestratorTask = new ecs.FargateTaskDefinition(this, 'OrchestratorTask', {
      cpu: 4096,  // 4 vCPU
      memoryLimitMiB: 16384,  // 16 GB
    });

    orchestratorTask.addContainer('orchestrator', {
      image: ecs.ContainerImage.fromRegistry('nexusbrain-orchestrator:latest'),
      command: ['tsx', 'scripts/brain-orchestrator.ts'],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'brain-orchestrator' }),
      environment: {
        NODE_ENV: 'production',
        ORCHESTRATOR_MODE: 'continuous',
      },
      secrets: {
        SUPABASE_URL: ecs.Secret.fromSecretsManager(supabaseSecret, 'url'),
        SUPABASE_SERVICE_ROLE_KEY: ecs.Secret.fromSecretsManager(supabaseSecret, 'key'),
        ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(llmSecret, 'anthropic_key'),
      },
    });

    // ── ECS Service: Long-Running Orchestrator ──
    const orchestratorService = new ecs.FargateService(this, 'OrchestratorService', {
      cluster,
      taskDefinition: orchestratorTask,
      desiredCount: 1,  // Single orchestrator
      assignPublicIp: true,
    });

    // ── EventBridge: Health Check (every 5 min) ──
    new events.Rule(this, 'HealthCheckRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.EcsTask({
        cluster,
        taskDefinition: orchestratorTask,
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      })],
    });

    // ── Task Definitions: On-Demand Agents ──
    const trainerTask = new ecs.FargateTaskDefinition(this, 'TrainerTask', {
      cpu: 2048,
      memoryLimitMiB: 8192,
    });
    trainerTask.addContainer('trainer', {
      image: ecs.ContainerImage.fromRegistry('nexusbrain-trainer:latest'),
      command: ['tsx', 'scripts/autonomous-trainer-runner.ts'],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'trainer' }),
    });

    const gitTrainerTask = new ecs.FargateTaskDefinition(this, 'GitTrainerTask', {
      cpu: 2048,
      memoryLimitMiB: 8192,
    });
    gitTrainerTask.addContainer('git-trainer', {
      image: ecs.ContainerImage.fromRegistry('nexusbrain-trainer:latest'),
      command: ['tsx', 'scripts/git-code-trainer-runner.ts'],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'git-trainer' }),
    });
  }
}
```

---

## 🔄 AGENT LIFECYCLE IN ORCHESTRATOR

### **Brain Orchestrator Main Loop**

```typescript
// scripts/brain-orchestrator.ts
import { createBrainOrchestrator } from './agent-framework/brain-orchestrator';

async function main() {
  const orchestrator = createBrainOrchestrator({
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    organizationId: '00000000-0000-4000-a000-000000000001',
    mode: 'continuous',  // Run forever
    healthCheckIntervalMs: 5 * 60 * 1000,  // 5 min
    agentScheduleCheckIntervalMs: 60 * 60 * 1000,  // 1 hour
  });

  // Discover all agents (auto-registered)
  await orchestrator.discoverAgents();

  // Start orchestration loop
  await orchestrator.start();
}

main();
```

### **Agent Discovery**

```typescript
// Agents auto-register on import
import './agents/autonomous-trainer';  // Registers "trainer"
import './agents/brain-consolidation';  // Registers "consolidation"
import './agents/brain-dmn';  // Registers "dmn"
import './agents/cost-agent';  // Registers "cost-agent"
import './agents/git-code-trainer';  // Registers "git-trainer"

const agentRegistry = createAgentRegistry({ supabase, organizationId });
const agents = await agentRegistry.listAllAgents();
// → [
//     { name: 'trainer', schedule: '0 */6 * * *', brainRegion: 'Sensory Cortex' },
//     { name: 'consolidation', schedule: '0 2 * * *', brainRegion: 'Sleep Cycle' },
//     { name: 'dmn', schedule: '0 */4 * * *', brainRegion: 'Default Mode Network' },
//     { name: 'cost-agent', schedule: '0 3 * * *', brainRegion: 'Hypothalamus' },
//     { name: 'git-trainer', schedule: '0 2 * * 0', brainRegion: 'Code Intelligence' },
//   ]
```

### **Agent Execution Decision**

```typescript
// Every hour, orchestrator checks which agents are due
const dueAgents = await orchestrator.getAgentsDueForExecution();

for (const agent of dueAgents) {
  // Check agent size (in-process vs child task)
  if (agent.estimatedMemoryMB < 2048) {
    // Small agent → run in-process
    await orchestrator.runAgentInProcess(agent.name);
  } else {
    // Large agent → spawn child ECS task
    await orchestrator.runAgentAsChildTask(agent.name, {
      cpu: agent.resourceRequirements.cpu,
      memory: agent.resourceRequirements.memory,
    });
  }
}
```

---

## 🎯 MIGRATION PLAN: CURRENT → V5.1

### **Phase 1: Build Orchestrator Infrastructure** (Week 1)
1. Create `scripts/brain-orchestrator.ts` — main loop
2. Create `agent-framework/brain-orchestrator.ts` — orchestration engine
3. Deploy `brain-orchestrator` ECS service (CDK)
4. Verify orchestrator can discover agents

### **Phase 2: Migrate Agents to V5.1 Template** (Week 2-3)
1. Migrate `autonomous-trainer` → `ManusNativeAgent`
2. Migrate `brain-consolidation` → `ManusNativeAgent`
3. Migrate `brain-dmn` → `ManusNativeAgent`
4. Migrate `cost-agent` → `ManusNativeAgent`
5. Migrate `git-code-trainer` → `ManusNativeAgent`

### **Phase 3: Wire Manus Capabilities** (Week 4)
1. Enable MotorCommandEngine for all agents
2. Define motor commands per agent (Slack, Jira, GitHub)
3. Wire CalibrationFeedbackLoop
4. Test end-to-end: agent → train → motor command → Slack notification

### **Phase 4: Cutover to Orchestrator** (Week 5)
1. Disable old EventBridge schedules
2. Enable orchestrator EventBridge schedule
3. Monitor for 48 hours
4. Delete old task definitions

---

## ✅ SUCCESS METRICS

### **Before (Random 7 Agents)**
- 7 separate ECS task definitions
- 0 inter-agent communication
- 0 motor commands executed
- 0 calibration feedback
- Manual schedule management (7 cron expressions)

### **After (V5.1 Orchestrator)**
- 1 orchestrator + 5 agents (auto-discovered)
- 100% inter-agent communication (composable)
- Motor commands executed (Slack, Jira, GitHub)
- Calibration feedback loop (agents improve over time)
- Automatic schedule management (AgentRegistry)

---

## 🚀 CONCLUSION

The **Hybrid Orchestrator** architecture transforms agents from:
- ❌ **Random ECS tasks** → ✅ **Neurological brain subsystems**
- ❌ **Scattered schedules** → ✅ **Unified orchestration**
- ❌ **Read-only data processors** → ✅ **Actionable Manus agents**
- ❌ **No self-improvement** → ✅ **Calibration feedback loop**

**Cost**: ~$70/month (vs $100+ for 7 separate tasks)
**Developer Experience**: 10x better (AgentRegistry, MotorCommands, Calibration)
**Architecture**: Truly aspirational (brain as unified system)

**Next Action**: Build `scripts/brain-orchestrator.ts` and deploy to ECS.
