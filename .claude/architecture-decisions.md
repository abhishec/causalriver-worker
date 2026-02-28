# BrainOS — Architecture Decision Record (ADR)

> Permanent log of every architectural decision made.
> Compiled from 7 hours of Q&A (2026-03-01).
> This file is the source of truth. Queue tasks + MEMORY.md derive from this.

---

## ENTITIES & DATA MODEL

### ADR-001: AI Worker is a permanent entity, NOT a job
- **Decision:** AI Worker = row in `ai_workers` table. Persists independently. NOT an agent_queue row.
- **Reason:** Workers have identity, history, copilot, agents. Jobs are ephemeral executions.
- **Schema:** `id, organization_id, name, description, service_type (nullable), status, created_by, created_at`

### ADR-002: Agent is task-scoped, lives under a Worker
- **Decision:** Agent = row in `agents` table. Lives under one AI Worker. Persists as history.
- **Reason:** Agents are named, reusable ("PR Reviewer"). Task-scoped but not disposable.
- **Schema:** `id, ai_worker_id (FK), organization_id, name, purpose, status, created_by (user/planner/orchestrator), created_at, completed_at, result JSONB`

### ADR-003: Job = agent_queue row, links to Worker + Agent
- **Decision:** `agent_queue` gets two new nullable FKs: `ai_worker_id`, `agent_id`. Null = legacy row.
- **Reason:** Every job traces to which worker ran it and which agent requested it.
- **Migration compat:** Legacy rows (null ai_worker_id) are pre-worker-era history. Never shown on worker pages.

### ADR-004: Brain is per Workspace, NOT per Worker
- **Decision:** L25-L29 brain context is per organization_id, shared by all workers in that workspace.
- **Reason:** Brain signals (infra health, service health, RL patterns) reflect workspace state.
- **What IS per-worker:** conversation history, ai_memory, prediction_records (with ai_worker_id column).

### ADR-005: Connectors are per Workspace (shared)
- **Decision:** connector_instances scoped to organization_id. All workers in workspace share same GitHub/Jira tokens.
- **Reason:** OAuth credentials belong to the workspace. Re-auth per worker = terrible UX.

### ADR-006: Service subscription per Workspace, assignment per Worker
- **Decision:** `workspace_service_subscriptions` tracks what workspace has paid for. Admin assigns service to specific worker via `ai_workers.service_type`.
- **Reason:** Billing is workspace-level. Expertise is worker-level.
- **Schema:** `id, organization_id, service_type (se-aas|aas|pm-aas), status, activated_at`

### ADR-007: Conversations scoped per Worker
- **Decision:** `conversations` table has `ai_worker_id` FK. History is per worker, not global.
- **Schema:** `id, organization_id, ai_worker_id, context_id (uuid, unique), title, created_at, last_message_at, expires_at`
- **Messages:** stored in `ai_memory` with `memory_type='conversation'`, `context_id`, `ai_worker_id`.

### ADR-008: API keys are per Worker
- **Decision:** `api_keys` table has `ai_worker_id` FK. External callers authenticate to a specific worker.
- **Reason:** Scoped access. A2A caller gets access to exactly one worker, not the whole workspace.

---

## BRAIN LAYERS

### ADR-009: Brain Layer Map (L25-L29) — CONFIRMED
```
L25 = Infrastructure Signals (CloudWatch/Datadog, all agent health)
L26 = Process Intelligence (FSM/HITL state — always present, not service-conditional)
L27 = SE-aaS (optional service layer)
L28 = AaaS (optional service layer)
L29 = PM-aaS (optional service layer)
```
- **service_health table:** service_type IN ('process-intelligence','se-aas','aas','pm-aas')
- **WRONG (old):** L26=SE-aaS, L27=AaaS, L28=PM-aaS (3 layers only)
- **Fix queued:** task `23493f75`

---

## SERVICES & CAPABILITIES

### ADR-010: Exactly 3 Services
- **Decision:** SE-aaS, AaaS, PM-aaS. That's it.
- **Process Intelligence:** cross-cutting capability (L26 in brain). NOT a 4th service.
- **lib/bpaas/:** internal FSM machinery. Never exposed as service.
- **No /api/process/ routes.** Process templates triggered via `process_definition` field in job payloads only.

### ADR-011: AI Worker without any service is fully capable
- **Decision:** A worker with no service_type can still: use Brain, Copilot, create Agents, run FSM process templates.
- **Services add:** domain-specific templates (pod-match, incident-diagnosis, typology-analysis, etc.)

---

## EXECUTION

### ADR-012: Cognitive Planner runs per AI Worker
- **Decision:** Cognitive cycle cron loops through `ai_workers` (not orgs). Runs planner for each worker separately.
- **Assigns jobs to:** specific `ai_worker_id` — creates `agents` row (created_by='planner') then `agent_queue` row.
- **LRU:** most-overdue worker scheduled first. Cap: 50 workers/cron. Per-worker 20s timeout.
- **WRONG (old):** planner ran per org/workspace.

### ADR-013: A2A targets specific Worker
- **Decision:** Caller passes `ai_worker_id` in A2A request body. Job created under that worker.
- **Auth:** Bearer API key → lookup `api_keys` → get `ai_worker_id` → scope to that worker.
- **Fast domains:** sync 200 response. Long/FSM: async 202 + SSE stream.

### ADR-014: Agents persist as history
- **Decision:** Agent rows never deleted on task completion. `status` = active → completed → archived.
- **Named agents:** ("PR Reviewer") reusable. Auto-named planner agents: "pod-match-2026-03-01".
- **created_by:** 'user' | 'planner' | 'orchestrator'

### ADR-015: Legacy jobs use null ai_worker_id
- **Decision:** Existing `agent_queue` rows get `ai_worker_id=null`. They are pre-worker-era history.
- **Never shown** on any AI Worker page. Accessible only via global admin log.

### ADR-016: Bootstrap fires on Worker creation, not Workspace creation
- **Decision:** When user creates a new AI Worker, background provisioning job fires: federation pull → connector seed → prediction_records seed → ai_memory bootstrap.
- **Does NOT:** auto-create ai_workers row. User creates the worker. Bootstrap runs after.

### ADR-017: Process templates triggered via payload only
- **Decision:** No `/api/process/[templateType]` routes. Process templates run when `process_definition` is in any SE-aaS/AaaS/PM-aaS job payload.
- **Reason:** Process Intelligence is infrastructure, not a user-facing service entry point.

---

## KNOWLEDGE & LEARNING

### ADR-018: pgvector already enabled
- **Decision:** `CREATE EXTENSION vector` exists in first migration. `extensions.vector(1536)` in use.
- **federated_knowledge table:** uses `extensions.vector(1536)` — no extra setup needed.

### ADR-019: Knowledge extraction pipeline
- **Decision:** After every execution with quality >= 0.65 → Haiku extracts 1-2 insights → `federated_knowledge`.
- **Types:** universal (organization_id=null, 3+ workspaces match) | workspace-specific (organization_id=orgId).
- **Workspace-specific overrides federated** with statistical framing ("we see X more than Y").
- **Federation:** weekly cron promotes insights with source_workspace_count >= 3 to universal.

### ADR-020: RL tracking is per Worker
- **Decision:** `prediction_records` and `cross_domain_signals` get `ai_worker_id` column (nullable, null=legacy).
- **getDomainThreshold():** filters by ai_worker_id when available — per-worker thresholds more accurate.

---

## UI & NAVIGATION

### ADR-021: /workspace is the Mission Control (new entry point)
- **Decision:** `/workspace` replaces `/dashboard/overview` as the primary landing page after login.
- **Shows:** real-time grid of all AI Workers. SSE live updates every 5s. Status, running job, quality per card.
- **Login redirect:** always → `/workspace`.
- **Old redirects:** /copilot → /workspace. /dashboard → /workspace.

### ADR-022: AI Worker Command Page (/ai-worker/[id]) — Full redesign
- **Decision:** Full redesign of existing page. Tabs: **Chat | Agents | Jobs | Brain | Keys**.
- **No sidebar** on worker page. Uses `(cockpit)` route group.
- **Header:** BrainOS logo → /workspace | breadcrumb | worker switcher dropdown | service badge | status.
- **Worker switcher:** dropdown lists all ai_workers in workspace. Switch = navigate to /ai-worker/[id].
- **Warm stone theme:** bg-background text-foreground (NOT bg-[#0a0a0a] text-white).
- **Worker name:** from ai_workers DB table, NOT localStorage.

### ADR-023: Sidebar simplified to 4 items
- **Decision:** AI Workers | Brain | Connectors | Settings.
- **All old items removed:** SE-aaS, AaaS, PM-aaS, Copilot, Agents, Overview, Early Warning, etc.
- **Workspace selector stays** at top of sidebar (unchanged).

### ADR-024: /brain = Workspace-level brain overview
- **Decision:** Dedicated page for admins/power users. Shows L25-L29 detail, learning velocity, federated knowledge, per-domain quality trends.
- **Reason:** Mission control shows workers. Brain page shows the engine behind them.

### ADR-025: Old dashboard pages deleted entirely (clean break)
- **Decision:** Delete all deprecated route files. No redirects for old pages. Clean break.
- **Keep:** /connectors, /settings, /admin, /workspace, /brain.

### ADR-026: Worker page has no sidebar
- **Decision:** (cockpit) layout = no sidebar. Just header with worker switcher + breadcrumb.
- **Reason:** Worker page is a focused command center. Sidebar would distract.

---

## PARALLEL BUILD STRATEGY

### Task Execution Waves (safe parallel execution via git worktrees)

**WAVE 1 — Foundation (must complete first, merge before Wave 2):**
- DB migrations: `10b1ad49` + `0044edbc` + `0058a162`
- Brain layer reorder: `23493f75`
- Bugs: `06927db4` + `27f57998` + `252345f5`
- CSS fix: `0f6282a7`
- RL propagation: `099ef706`

**WAVE 2 — APIs (after Wave 1 merged):**
- Worker creation: `04870c01` + `0035b4cf`
- A2A hybrid: `0cf6a1b5`
- Agent creation fix: `160f9d67`
- API keys: `09dfed36`
- Cognitive planner: `2b54de3b` + `176b14df` + `31250dd9`

**WAVE 3 — UI (after Wave 2 merged):**
- Mission control: `248e01b0`
- Worker command page: `0408924c` + `2867277f`
- Sidebar + cleanup: `0087b9c6` + `01968bd0`
- Brain page: `1638161d`

**WAVE 4 — Intelligence (can run parallel with Wave 3):**
- Knowledge pipeline: `095fb133`
- 5-phase executor: `0e549b5c`
- Worker-to-worker: `1b627eac`

**CTO AUDIT AGENTS (continuous, per wave):**
- CTO-A: Reads built code → checks against this ADR for drift
- CTO-B: Runs `npx tsc --noEmit` after every merge — zero tolerance for TS errors

**DEPLOY GUARD AGENTS:**
- Build guard: runs `pnpm turbo build --filter=platform` after Wave 3
- Deploy verifier: checks Amplify job status after push to main

---

## OPEN BUILDER DECISIONS (CTO calls, no user input needed)
1. `ai_workers.id` format: **UUID** (standard). Old `aw_seaas_*` URLs were placeholder.
2. `agents` table: include `result JSONB` column for agent output storage.
3. `conversations` messages: stored in `ai_memory` (memory_type='conversation') — no separate messages table.
4. Migration ordering: ai_workers → agents → conversations → agent_queue FKs. Always in this order.
