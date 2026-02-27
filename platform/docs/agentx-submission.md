# AgentX-AgentBeats Submission: BrainOS — Autonomous Software Delivery Intelligence

**Category:** Business Process Automation

**Submitted by:** Tookitaki (Design Partner: abhishek@tookitaki.com)

**Live demo:** https://platform.usebrainos.com

---

## What It Does

BrainOS is an autonomous AI operating system for software engineering teams that continuously monitors delivery health, predicts risks before they become incidents, and takes corrective actions — all without human intervention. It replaces the weekly status meeting and the delivery manager's spreadsheet with a living, self-improving intelligence layer that runs every 30 minutes across every active engagement. Where traditional project management tools require humans to check dashboards and interpret data, BrainOS closes the loop: it assesses its own coverage gaps, plans what to investigate next, executes those investigations, and reflects on what it learned — then starts again. The system is multi-tenant, runs independently for each AI worker space, and learns continuously from every execution outcome via a reinforcement learning flywheel backed by PostgreSQL.

---

## Core Automation Loop

BrainOS runs a 5-phase cognitive cycle every 30 minutes, inspired by Reflexion (Shinn 2023), CoALA (Sumers 2023), Voyager (Wang 2023), and Generative Agents (Park 2023):

**Phase 0 — PRIME**
Retrieve the last 3 episodic memory reflections from `ai_memory`. This is the Reflexion episodic buffer — the planner reads its own past lessons before making any decisions in the current cycle.

**Phase 1 — ASSESS**
Six parallel gap-detection checks run against the database:
- Coverage gaps: which of the 11 SE-aaS domains have not executed in the past 6 hours
- RL quality: per-domain average confidence from `prediction_records` over the last 24 hours
- Stuck domains: any domain with 5+ consecutive failures (confidence < 0.3) in the last 2 hours is excluded from planning
- High-demand domains: domains with the most user queries in the last 24 hours are prioritised
- Engagement count: how many active client engagements exist to serve
- Recovery mode: if the recovery agent has fired in the last 2 hours, the planner caps itself to 1 decision to prevent flooding a failing domain

**Phase 2 — PLAN**
One Claude Haiku call receives the full state snapshot plus the past reflections. It outputs a JSON array of at most 4 decisions (1 in recovery mode), each with a domain, priority, and one-sentence rationale. If the LLM response cannot be parsed, the system falls back to the top 2 coverage-gap domains automatically — planning never fails silently.

**Phase 3 — EXECUTE**
For each planned decision: check a 2-hour dedup marker in `ai_memory` to prevent re-queueing the same domain within a single hour window, then insert to `agent_queue`. The cron worker (`process-jobs`, runs every 10 minutes) picks up the pending jobs and executes the domain.

**Phase 4 — RECORD**
The current cycle's working state (decisions, coverage gaps, poor-quality domains) is written to `ai_memory` as `memory_type='working'`. This becomes the input for the next cycle's Phase 5.

**Phase 5 — REFLECT** *(runs at the start of each new cycle, reflecting on the previous one)*
A Haiku call reviews the prior cycle's planned domains against the actual job outcomes from `agent_queue`. It writes a 2–3 sentence verbal reflection to `ai_memory` as `memory_type='episodic'`. The episodic buffer is bounded at 10 entries — older reflections are pruned automatically, following the Reflexion Ω parameter recommendation.

---

## Business Process Automated

**Before BrainOS:**
- Weekly 60-minute delivery status meetings with every engagement manager
- Manual tracking of pod assignment fit in spreadsheets
- Scope creep discovered at sprint retrospective — after 2–3 weeks of drift
- Flight risk and engineer overallocation identified only when someone quit or a deadline slipped
- No systematic audit of cross-engagement patterns

**After BrainOS:**

| Domain | What It Automates | Signal Source |
|---|---|---|
| `pod-match` | Continuous pod-to-engagement fit scoring | `pod_match_history`, `connector_signals` |
| `early-warning` | Real-time velocity, bottleneck, and flight risk detection | `engineer_health_snapshots`, `engagement_health_scores` |
| `scope-creep` | Automated scope drift alerts before retrospective | `scope_creep_alerts` |
| `delivery-intelligence` | Holistic engagement health snapshot for every active client | `engagement_health_latest` view |

Every domain result feeds back into the RL loop: high-quality outcomes emit a dopamine signal to `cross_domain_signals`; poor outcomes emit a gaba signal. The planner reads these signals on the next cycle and adjusts which domains to prioritise.

---

## Technical Architecture

**Stack:**
- Next.js 15 App Router, deployed on AWS Amplify (SSR Lambda)
- Supabase (PostgreSQL + RLS + Edge Functions)
- Claude API: Haiku for planning and code generation, Sonnet for domain execution, Opus for cross-system debugging
- Turborepo monorepo with `@nexus-ai/memory-stack` package for orchestration logic

**Key innovations:**

*Difficulty-aware model routing:* ~84% of LLM calls use Claude Haiku (cognitive planner, overnight code generation, structured memory extraction). Sonnet handles domain execution. Opus is reserved for cross-system root-cause analysis (3+ system boundaries). This keeps per-cycle LLM cost proportional to actual task complexity.

*Reflexion self-improvement:* The episodic memory buffer means the planner is literally reading its own past mistakes before deciding what to do next. After 10+ cycles, stuck patterns are automatically detected and excluded.

*Structured memory extraction (Mem0-style):* After every domain execution, a Haiku call extracts three facts — what worked, what failed, one org-specific pattern — and stores them in `ai_memory` as `memory_type='structured-outcome'`. Each domain retains the 20 most recent structured outcomes, creating an always-fresh per-domain knowledge base.

*RLVR confidence calibration:* The `computeAgentQuality()` function uses a conservative baseline (0.5) and rewards actual data records in the result. Empty `data: []` arrays are penalised (-0.25) — the most common false-positive failure mode in domain execution. Quality ≥ 0.7 → dopamine signal; < 0.7 → gaba signal.

*Overnight code agent:* Beyond monitoring, BrainOS can autonomously decompose a feature spec into tickets, generate TypeScript implementations via Haiku, create GitHub branches, commit files, open PRs, and send Slack notifications — all as overnight jobs while engineers sleep. Rate limited to 2 runs per hour per user to prevent runaway spawning.

*True pause-and-resume:* Long-running agent jobs can be paused at decision gates and resumed from a database checkpoint — enabling human-in-the-loop escalation without restarting the full job.

**Scale:**
- Each AI worker space has its own independent brain state, episodic memory, and RL history
- The cognitive planner runs for up to 10 organisations per cognitive-cycle cron invocation
- 7 GitHub Actions crons coordinate all background work: process-jobs (every 10 minutes), cognitive-cycle (30 minutes), autonomous-monitor (10 minutes), learning (4 hours), evolution (6 hours), embed-documents (30 minutes), RLVR (daily at 3 AM)

---

## Results

| Metric | Value |
|---|---|
| Autonomous cycle cadence | Every 30 minutes, zero human triggers |
| Average engagement health check latency | ~2 seconds per engagement |
| Model cost optimisation | ~84% of LLM calls routed to Haiku |
| RL signals tracked | `prediction_records` + `cross_domain_signals` per execution |
| Domains monitored concurrently | 11 SE-aaS domains per AI worker space |
| Overnight code agent: files generated per ticket | Up to 5 TypeScript files + test |
| Overnight code agent: full loop time (spec → PR) | 2–5 minutes per ticket |
| Human interventions required per 30-minute cycle | Zero (full autonomy) |
| Known failure modes handled automatically | Stuck-domain exclusion, recovery-mode throttling, dedup guards, heartbeat watchdog |

---

## Demo

**Live system:** https://platform.usebrainos.com

**Demo credentials:**
- Email: `abhishek@tookitaki.com`
- Password: `BrainOS2026`
- Available AI worker spaces: Fincense 5.11.5 and Fincense 6.3.4 (Tookitaki design partner)

The Copilot interface at `/copilot` lets judges query the brain directly — try asking "what is the delivery health for our active engagements?" or "are there any flight risks on my team?" to see live domain execution. The `/brain` dashboard shows the cognitive planner's last cycle, RL signal accumulation, and learning velocity in real time.
