# BrainOS — 10 Deep User Flow QA Checklist

> Test against: platform.usebrainos.com
> Credentials: abhishek@tookitaki.com / BrainOS2026
> Workers: Fincense 5.11.5 (9f338d96) | Fincense 6.3.4 (aa286f56)

---

## Bug Status (B1–B10) — All Fixed ✅

| Bug | Fix | Status |
|-----|-----|--------|
| B1 | WorkerCard pencil icon → edit modal (rename + service type) | ✅ workspace-mission-control.tsx |
| B2 | Settings sidebar → '← Mission Control' link to /workspace | ✅ settings-client.tsx |
| B3 | GitHub callback uses NEXT_PUBLIC_APP_URL (not localhost) | ✅ github/auth/route.ts |
| B4 | Jira multi-instance via multiInstanceTypes Set | ✅ connectors-client.tsx |
| B5 | Post-OAuth: repo URL captured in github/setup/route.ts | ✅ |
| B6 | SE-aaS/AaaS/PM-aaS gated by worker.service_type | ✅ chat/route.ts:1069-1071 |
| B7 | "check all connections" → fires /api/connectors/sync-all | ✅ chat/route.ts:4657 |
| B8 | "begin training" → fires /api/brain/consolidation | ✅ chat/route.ts (added this session) |
| B9 | ThemeToggle locked to light — setTheme always coerces to "light" | ✅ theme-context.tsx (added this session) |
| B10 | Navigation: Worker↔Settings↔Mission Control all wired | ✅ |

---

## Flow 1 — New User: Rename Worker + Change Service + Add GitHub
**URL:** /workspace → worker card hover → pencil icon
**Steps:**
1. [ ] Hover WorkerCard → pencil icon appears
2. [ ] Click pencil → EditWorkerModal opens with current name + service type
3. [ ] Rename worker → save → card updates in grid
4. [ ] Change service type to SE-aaS → save → worker page reflects service
5. [ ] Go to Settings → Connectors → GitHub tab → install GitHub App
6. [ ] Complete OAuth — NOT redirected to localhost:3001
7. [ ] Return to worker → GitHub pill visible in ConnectorStatusStrip

**Acceptance:** Name persists in DB, service badge updates, GitHub pill appears, zero console errors.

---

## Flow 2 — Power User: Multi-Jira Setup
**URL:** /connectors
**Steps:**
1. [ ] Click "Connect Jira" → OAuth/API key form for first instance (Client A)
2. [ ] Complete setup → Jira-A appears in connector grid
3. [ ] Click "Connect Jira" again → new instance form opens
4. [ ] Complete for Client B (different subdomain) → Jira-B added
5. [ ] Both pills visible in /ai-worker connector strip
6. [ ] Trigger sync on each — separate sync status shown per instance

**Acceptance:** 2 separate Jira entries in org_connectors, each syncs independently.

---

## Flow 3 — Admin: API Key Lifecycle
**URL:** /ai-worker/[id] → Keys tab
**Steps:**
1. [ ] Open Keys tab → click "Generate Key"
2. [ ] Full key shown once in reveal field → copy it
3. [ ] Navigate away and back → key masked (only last 4 chars)
4. [ ] Switch to different worker → Keys tab is EMPTY (isolation)
5. [ ] Revoke a key → key disappears from list

**Acceptance:** Keys isolated per worker, revocation works, no cross-worker leakage.

---

## Flow 4 — Copilot: Service Gating + Sync + Training
**URL:** /ai-worker/[worker-with-no-service]
**Steps:**
1. [ ] On worker with no service → ask "show pod health" → gets "service not activated" (NOT real data)
2. [ ] Type "check all connections" → sync-started SSE event visible
3. [ ] Type "begin training" → brain training confirmation message appears
4. [ ] Switch to Fincense 5.11.5 (SE-aaS worker) → same query returns real structured data

**Acceptance:** Gating works, sync/training intents fire, SE-aaS worker returns real data.

---

## Flow 5 — Brain Tab: IQ + RL Metrics + Consolidation
**URL:** /ai-worker/[id] → Brain tab
**Steps:**
1. [ ] Brain tab shows IQ score (number), signals count, learning velocity
2. [ ] Click "Run Consolidation" → success toast appears
3. [ ] Metrics update after consolidation
4. [ ] Click again immediately → button disabled during run (no duplicate request)
5. [ ] Check header/sidebar for pulsing RL indicator when learningVelocity > 0

**Acceptance:** Consolidation runs once, metrics refresh, no double-fire.

---

## Flow 6 — Jobs Tab: Real-Time Agent Monitoring
**URL:** /ai-worker/[id] → Jobs tab
**Steps:**
1. [ ] Trigger multi-step job via Copilot ("analyze all engagement health")
2. [ ] Switch to Jobs tab → job appears as "pending"
3. [ ] Watch status update to "running" → "completed" WITHOUT page refresh
4. [ ] Error job shows '—' in result column (not crash/undefined)

**Acceptance:** Real-time SSE/polling works, error jobs handled gracefully.

---

## Flow 7 — Agent Creation via Copilot + Agents Tab Isolation
**URL:** /ai-worker/[id] → Chat tab
**Steps:**
1. [ ] Type "create a monitoring agent for pod health"
2. [ ] AgentCreatedCard appears (Brain: Active | RL: Enabled | Memory: Tracking)
3. [ ] Switch to Agents tab → new agent visible
4. [ ] Switch to different worker → agent NOT visible
5. [ ] Create 2nd agent on Worker B → Worker A still shows only its agent

**Acceptance:** Agent creation works, cross-worker isolation enforced.

---

## Flow 8 — Connector Health: Slack OAuth + Status Strip
**URL:** /connectors → Slack
**Steps:**
1. [ ] Initiate Slack OAuth → redirect uses production URL (not localhost)
2. [ ] OAuth completes → Slack pill appears in ConnectorStatusStrip
3. [ ] Click Slack pill → navigates to /connectors (not 404)
4. [ ] GET /api/connectors/health → 200 with valid JSON

**Acceptance:** OAuth works in prod, pill appears, health check passes.

---

## Flow 9 — Multi-Worker Context Isolation (Full Audit)
**URL:** /ai-worker/[workerA] then switch to [workerB]
**Steps:**
1. [ ] Worker A: send message → chat history visible
2. [ ] Open worker switcher → switch to Worker B
3. [ ] Chat history EMPTY (not Worker A's)
4. [ ] Brain IQ score differs (or 0 if no data)
5. [ ] Keys tab shows different keys
6. [ ] Jobs tab shows only Worker B's jobs
7. [ ] Agents tab shows only Worker B's agents

**Acceptance:** All 5 contexts (chat, brain, keys, jobs, agents) isolated per worker.

---

## Flow 10 — Full Demo: Login → Worker → Connect → Train → Insight → Brain
**URL:** Fresh login
**Steps:**
1. [ ] Login → redirects to /workspace (not /dashboard)
2. [ ] Pick Fincense 5.11.5 worker → connector strip shows AWS S3 pill
3. [ ] Ask "show delivery health for all engagements" → structured SE-aaS response
4. [ ] Type "create a scope creep monitoring agent" → AgentCreatedCard appears
5. [ ] Open Brain tab → IQ > 0, signals > 0
6. [ ] Navigate to /brain → workspace-level L25-L29 signals visible
7. [ ] Zero console errors throughout

**Acceptance:** Complete happy path end-to-end, no errors, data is real not mocked.
