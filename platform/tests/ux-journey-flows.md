# BrainOS — End-to-End UX Journey Test Flows

**Version**: 1.0
**Date**: 2026-03-03
**Purpose**: Automated UI testing spec covering 10 distinct user personas and feature flows.
**Base URL**: `https://platform.usebrainos.com`
**Test Auth**: `abhishek@tookitaki.com` / `BrainOS2026`

---

## Notation

- `CLICK` — left-click the identified element
- `TYPE` — type text into the focused input
- `EXPECT` — assertion that must be true to continue
- `BUG` — known or suspected defect; record pass/fail status
- `WAIT` — wait up to N seconds for condition before failing

---

## Flow 1 — First-Time Setup: Worker Card Edit + Connector Add + GitHub Install

**Persona**: New user setting up their first workspace
**Goal**: Rename a worker, change its service, add a GitHub connector, and verify the install flow reaches production
**Session state**: Logged in, at least 2 AI Workers exist in workspace

### Steps

**Step 1.1 — Navigate to Mission Control**
- Navigate to `/workspace`
- EXPECT: Page title reads "Mission Control"
- EXPECT: AI Worker grid is visible with at least one `WorkerCard`
- EXPECT: Each card shows worker name, status dot (green = active), and optional service badge (SE-aaS / AaaS / PM-aaS)
- EXPECT: "+ New Worker" button is visible in the top-right header
- BUG: Cards are purely links — there is NO edit icon, rename button, or three-dot menu on each card. A user cannot rename or change service type without navigating to a separate create flow.

**Step 1.2 — Attempt inline rename (BUG CONFIRM)**
- Hover over any WorkerCard
- EXPECT: No edit controls appear on hover
- BUG CONFIRM: `WorkerCard` renders as a `<Link>` only (`href="/ai-worker/${worker.id}"`). There is no pencil icon, no right-click context menu, no long-press rename affordance. PASS criteria = bug is acknowledged. FAIL criteria = some edit UI appears but doesn't work.

**Step 1.3 — Create Worker as workaround for rename**
- CLICK the "+ New Worker" button
- EXPECT: Browser navigates to `/ai-worker/create`
- EXPECT: Form shows three fields: "Worker name" (required), "Description" (optional), "Service activation" (optional dropdown)
- EXPECT: Header shows "← Mission Control" back-link
- EXPECT: Service dropdown options are: "No service (Brain + Copilot only)", "SE-aaS — Software Engineering Intelligence", "AaaS — Accounting & Financial Intelligence", "PM-aaS — Product Management Intelligence"

**Step 1.4 — Fill in create worker form**
- CLICK "Worker name" input
- TYPE `Test Worker Renamed`
- CLICK "Description" textarea
- TYPE `Test worker created during UX flow testing`
- CLICK "Service activation" dropdown
- SELECT `SE-aaS — Software Engineering Intelligence`
- EXPECT: Selected value shows "SE-aaS — Software Engineering Intelligence"
- CLICK "Create AI Worker" button
- EXPECT: Button shows "Creating..." while submitting
- WAIT 5s for redirect
- EXPECT: Browser navigates to `/ai-worker/<new-worker-id>`
- EXPECT: Header shows "BrainOS / Test Worker Renamed"
- EXPECT: Service badge shows "SE-AAS" or "se-aas" in orange

**Step 1.5 — Verify connector status strip on new worker page**
- EXPECT: Below the tab navigation there is a connector status strip
- EXPECT: Strip shows "No connectors" and an "Add one →" link
- CLICK "Add one →" link
- EXPECT: Browser navigates to `/connectors`
- BUG: After navigating to `/connectors` there is NO link back to the originating AI worker. There is no "← Back to Test Worker Renamed" breadcrumb. Only the sidebar navigation is available.

**Step 1.6 — Verify connectors page has no back-to-worker link**
- EXPECT: Page header shows "Connectors" or similar
- BUG CONFIRM: No "← Back to [WorkerName]" button is visible anywhere on `/connectors`. User loses context of which worker they were configuring. PASS = bug confirmed and documented. FAIL = a back-to-worker link is present.

**Step 1.7 — Locate GitHub connector and click Connect**
- Scroll through the connector list to find the GitHub connector card
- EXPECT: GitHub card shows an icon, description, and a "Connect" or "Add" button
- CLICK "Connect" (or "Add") on the GitHub card
- EXPECT: A modal opens — either the GitHubSetupModal or a redirect begins

**Step 1.8 — GitHub App install flow (PAT path if App not configured)**
- If GitHubSetupModal opens with step "choose":
  - EXPECT: Modal shows options to authenticate (App install button or PAT/token option)
  - CLICK the "Use Personal Access Token" option (or equivalent)
  - EXPECT: A token input field appears
  - TYPE a test PAT token (e.g. `ghp_testtoken123` — will fail validation, this tests the error path)
  - TYPE a repo URL in the format `https://github.com/org/repo`
  - CLICK "Validate" or "Connect"
  - WAIT 5s
  - EXPECT: Error message appears (invalid token) — NOT a blank page or uncaught exception
  - BUG: GitHub App install path uses GitHub's OAuth app registration. If `GITHUB_APP_SLUG` env var is configured but the GitHub App's callback URL points to `localhost:3001` in the GitHub App settings, the redirect from GitHub will fail in production. This cannot be tested via UI alone — must verify `NEXT_PUBLIC_APP_URL` is set to production domain in Amplify env vars.

**Step 1.9 — GitHub: repo URL specification missing (BUG CONFIRM)**
- Even when token validates successfully in a real scenario:
  - EXPECT: Modal step "branches" appears after validation
  - EXPECT: User can select which branches to track
  - BUG: There is no explicit "repo URL" field shown before connecting. The modal accepts `repoUrl` as a single URL in Step 1 but does NOT expose a list-view of connected repos or allow the user to specify additional repo URLs as a named, labeled list. The `additionalRepos` state exists in `GitHubSetupModal.tsx` but the UI for adding them may not be clearly discoverable. Record whether an "Add additional repo" input is visible.

**Step 1.10 — Return to worker after connector setup**
- After closing the modal (success or cancel):
  - Navigate manually to `/workspace`
  - CLICK the "Test Worker Renamed" card
  - EXPECT: Connector status strip now shows the GitHub connector (if connected) OR still shows "No connectors"
  - EXPECT: Clicking a connector pill in the strip navigates to `/connectors`

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| `/workspace` loads with worker grid | Grid renders with cards | Blank page, error, spinner > 5s |
| "Create Worker" form works | Redirects to new worker page | Form submission error or no redirect |
| Worker page connector strip shows "Add one" | Link visible | Strip absent |
| `/connectors` loads | Page renders | 404 or crash |
| Navigating back from `/connectors` to worker requires manual nav | Expected (bug confirmed) | Back-link exists (bug resolved) |
| GitHub modal opens | Modal visible | Nothing happens |
| Invalid PAT shows error, not crash | Error message in modal | White screen or uncaught JS error |

---

## Flow 2 — Power User: Jira Multi-Instance Setup

**Persona**: Power user managing two separate Jira instances (e.g. different client projects)
**Goal**: Connect two Jira instances to the same workspace
**Session state**: Logged in, on `/connectors`

### Steps

**Step 2.1 — Navigate to connectors page**
- Navigate to `/connectors`
- EXPECT: Page renders with a list of available connector types
- EXPECT: Jira appears in the list with a description and connect button

**Step 2.2 — Connect first Jira instance**
- CLICK "Connect" on the Jira card
- EXPECT: `JiraSetupModal` opens at step "credentials"
- EXPECT: Three input fields visible: "Jira site URL", "Email", "API Token"
- CLICK "Jira site URL" input
- TYPE `https://company-alpha.atlassian.net`
- CLICK "Email" input
- TYPE `test@company-alpha.com`
- CLICK "API Token" input
- TYPE `fake-token-alpha-12345` (will fail validation — testing error path)
- CLICK "Connect" or "Validate" button
- WAIT 8s
- EXPECT: Either a validation error appears in the modal, OR mock success proceeds to step "projects"
- EXPECT: Error message is human-readable, NOT a raw JSON dump or stack trace
- BUG: If the token is invalid, the modal should show a clear error. Confirm no uncaught exception in console.

**Step 2.3 — Close modal and attempt second Jira instance**
- CLICK "Cancel" or close the modal
- EXPECT: Modal closes, connectors page is intact
- Locate the Jira card again
- BUG: Inspect whether the Jira card now shows "Connected" (from any previous connection) or still shows "Connect"
- If already connected: look for an "Add another" or "+ Add Instance" button
- BUG CONFIRM: There is likely NO "Add another Jira instance" button. The connector card either shows "Connected" (single instance) or "Connect" (unconnected). There is no multi-instance affordance visible. Record what UI is actually shown.

**Step 2.4 — Try comma-separated domains workaround**
- If the Jira site URL field accepts input, try entering two domains comma-separated: `company-alpha.atlassian.net,company-beta.atlassian.net`
- CLICK validate
- EXPECT: Either graceful handling of multi-domain input OR a clear single-domain error (not a crash)
- BUG: No validation message clarifies whether multiple instances are supported via comma separation. This is a UX gap.

**Step 2.5 — Verify existing Jira connector count in strip**
- Navigate to `/ai-worker/<any-worker-id>`
- EXPECT: Connector status strip at top of page
- If Jira was connected in a prior session: EXPECT: Jira pill visible with status dot
- CLICK the Jira pill
- EXPECT: Navigates to `/connectors`
- EXPECT: Jira section shows instance count (1 instance) and last sync time

**Step 2.6 — Trigger manual Jira sync**
- On `/connectors`, locate the connected Jira instance
- CLICK "Sync" or "Sync now" button if present
- WAIT 10s
- EXPECT: Sync progress indicator appears (IngestionProgress component)
- EXPECT: "Last synced" timestamp updates
- BUG: If no sync button exists on the connectors page, document the absence.

**Step 2.7 — Check sync progress via IngestionProgress component**
- EXPECT: While syncing, a progress bar shows `progressPct` percentage
- EXPECT: `signalsIngested` counter increments
- EXPECT: Progress completes and shows final ingested count
- EXPECT: No page reload required to see progress updates

**Step 2.8 — Attempt Jira connector deletion to reset**
- Locate the delete or disconnect button for the Jira connector
- EXPECT: A confirmation dialog or prompt appears before deletion
- CLICK "Cancel" — do NOT actually delete
- EXPECT: Connector instance remains in list

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| Jira modal opens with correct fields | Fields visible | Modal blank or wrong fields |
| Invalid token shows error in modal | Error message | Crash or empty modal |
| Modal closes cleanly | Page intact | Freeze or white screen |
| Multi-instance add button exists | Button found | No button (bug confirmed) |
| Manual sync triggers progress bar | Bar visible | Button missing or no feedback |
| Sync completes without page reload | Timestamp updates in-place | Page reload required |

---

## Flow 3 — Admin User: API Key Generation and Worker Assignment

**Persona**: Admin user creating API keys for external integrations
**Goal**: Generate an API key for an AI Worker and verify the key can be copied
**Session state**: Logged in, on the worker page of an existing worker

### Steps

**Step 3.1 — Navigate to a specific worker**
- Navigate to `/workspace`
- CLICK any AI Worker card
- EXPECT: Browser navigates to `/ai-worker/<workerId>`
- EXPECT: Header shows "BrainOS / <WorkerName>"
- EXPECT: Five tabs are visible: Chat | Agents | Jobs | Brain | Keys

**Step 3.2 — Click the Keys tab**
- CLICK "Keys" tab
- EXPECT: Active tab indicator (border-b-2 border-primary) moves to "Keys"
- EXPECT: Page shows either existing API keys or an empty state
- EXPECT: A "Key name" input field is visible
- EXPECT: A "Create key" button (or equivalent) is visible

**Step 3.3 — Create a new API key**
- CLICK the key name input
- TYPE `Test Integration Key`
- CLICK "Create key" button (or press Enter)
- EXPECT: Button shows loading state ("Creating..." or spinner) during submission
- WAIT 5s
- EXPECT: A new key row appears in the table
- EXPECT: The raw key value is displayed ONCE in a highlighted banner with a "Copy" button
- EXPECT: Banner shows text like "Copy this key — it will not be shown again"

**Step 3.4 — Copy the raw key**
- CLICK "Copy" button on the key reveal banner
- EXPECT: Clipboard receives the key value (cannot be directly asserted in automated tests — verify via console)
- EXPECT: Copy button changes to "Copied!" or equivalent confirmation

**Step 3.5 — Dismiss the key banner**
- CLICK "Dismiss" or "X" on the raw key banner
- EXPECT: Banner disappears
- EXPECT: The key row remains in the table showing only the `key_prefix` (e.g. `brn_xxx...`)
- EXPECT: The full key is NOT shown again anywhere on the page

**Step 3.6 — Verify key table columns**
- EXPECT: Table shows columns: Name | Key prefix | Last used | Created | Status (active/revoked)
- EXPECT: "Test Integration Key" row is visible
- EXPECT: "Last used" is "Never" or a dash for a freshly created key
- EXPECT: Status is "Active"

**Step 3.7 — Create a second key with empty name (validation test)**
- Leave the key name input EMPTY
- CLICK "Create key" button
- EXPECT: Button is DISABLED (since `!newKeyName.trim()` guard exists in the component)
- EXPECT: No API call is made
- BUG: If the button is not visually disabled, check whether clicking it silently fails or shows an error.

**Step 3.8 — Create a key and then attempt to revoke it**
- CLICK key name input, TYPE `Key To Revoke`
- CLICK "Create key"
- WAIT 5s for key to appear
- Locate a "Revoke" button for the new key row
- BUG: Document whether a Revoke button exists in the Keys tab UI. If absent, note that users have no way to revoke keys via the UI.
- If Revoke exists: CLICK it, EXPECT a confirmation dialog, CLICK Cancel

**Step 3.9 — Switch to a different worker using the worker switcher**
- In the header, locate the worker name dropdown (the `<select>` element showing current worker name)
- CLICK the dropdown
- EXPECT: All workers in the workspace appear as `<option>` elements
- SELECT a different worker from the dropdown
- EXPECT: Browser navigates to `/ai-worker/<other-workerId>`
- EXPECT: Header updates to show the new worker's name
- EXPECT: Keys tab (if still active) reloads with the new worker's keys

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| Keys tab renders | Input + table visible | Blank or crash |
| Key creation succeeds | Raw key banner visible | Error or no response |
| Raw key shown exactly once | Banner appears then dismisses | Key shown repeatedly or not at all |
| Empty name blocks submission | Button disabled | API call made with empty name |
| Worker switcher dropdown works | Navigation to other worker | Dropdown broken or no navigation |

---

## Flow 4 — Copilot: SE-aaS Domain Gating and "Check All Connections" Command

**Persona**: SE-aaS user querying delivery intelligence via Copilot
**Goal**: Verify that SE-aaS domain functions are properly gated by service activation, and that "check all connections" triggers a sync agent
**Session state**: Logged in, on an AI Worker page where service_type is NULL (no service)

### Steps

**Step 4.1 — Navigate to a worker with NO service activated**
- Navigate to `/workspace`
- Identify a worker card that shows NO service badge (no "SE-aaS", "AaaS", or "PM-aaS" badge)
- CLICK that card
- EXPECT: Worker page loads
- EXPECT: Header shows the worker name with NO orange service badge

**Step 4.2 — Open Chat tab**
- CLICK "Chat" tab (should be default)
- EXPECT: CopilotChat component renders
- EXPECT: Message input field is visible and focusable

**Step 4.3 — Query a delivery intelligence domain (should be gated)**
- CLICK the message input
- TYPE `show me early warning signals for all engagements`
- Press Enter or CLICK the send button
- WAIT 10s for response
- EXPECT: Response does NOT execute the delivery-intelligence domain and return raw health data
- BUG: Per codebase analysis, the copilot chat route does NOT gate SE-aaS domain execution by worker `service_type`. It executes SE-aaS domains (early-warning, delivery-intelligence, pod-match, scope-creep) based on the LLM classifier's routing decision, regardless of whether the worker has `service_type = 'se-aas'`. A worker with NO service activation can trigger SE-aaS domain functions. This is the specific bug to verify.
- EXPECT (DESIRED): Response should say something like "This worker does not have SE-aaS activated. To access delivery intelligence, enable SE-aaS service for this worker."
- EXPECT (ACTUAL/BUG): Response may return actual delivery intelligence data, or at minimum attempt domain routing.

**Step 4.4 — Check what the copilot actually returns**
- Record the exact response text
- If the response contains data from `engagement_health_scores`, `pod_match_history`, `engineer_health_snapshots`, or similar SE-aaS tables: BUG CONFIRMED — domain gating is absent
- If the response says service not activated: BUG RESOLVED

**Step 4.5 — Query "check all connections"**
- TYPE `check all connections`
- Press Enter
- WAIT 15s for response
- EXPECT (DESIRED): Copilot responds by triggering a sync agent that calls `/api/connectors/sync-all`
- EXPECT (DESIRED): Response includes confirmation like "Triggering connector sync..." or an AgentCreatedCard appears
- BUG: Per analysis, "check all connections" as a phrase has no specific handling in the copilot chat route. The LLM classifier may route it as a general question or fail to detect sync intent. Document the actual response.

**Step 4.6 — Query "begin training"**
- TYPE `begin training`
- Press Enter
- WAIT 15s
- EXPECT (DESIRED): Copilot triggers an async brain training job (calls `/api/brain/consolidation` or equivalent), shows a spinner or AgentCreatedCard, and returns "Brain training started — this runs in the background"
- BUG: "begin training" has no dedicated handler in the chat route. The Brain tab's "Run Consolidation" button calls `/api/brain/consolidation` via a direct UI action — but there is no copilot chat handler that parses "begin training" intent. Document actual response.

**Step 4.7 — Switch to an SE-aaS worker and repeat domain query**
- In the worker switcher dropdown, SELECT a worker that has `SE-aaS` service badge
- CLICK "Chat" tab
- TYPE `show me early warning signals for all engagements`
- Press Enter
- WAIT 15s
- EXPECT: Response includes actual delivery intelligence data (if connector data exists)
- EXPECT: If no connector data: response says data not available, not a crash

**Step 4.8 — Test Cmd+K overlay**
- Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
- EXPECT: A copilot overlay opens (if Cmd+K is wired)
- BUG: Note whether Cmd+K opens an overlay or does nothing. Per codebase: `/copilot` redirects to `/workspace`. There may be a Cmd+K shortcut listener. Document its behavior.

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| Non-service worker copilot blocks SE-aaS domains | "Service not activated" response | Domain executes and returns data (bug) |
| "check all connections" triggers sync | Sync agent created or sync confirmed | Generic response, no action taken |
| "begin training" triggers async training | Job queued or confirmation | Generic response, no training started |
| SE-aaS worker CAN access delivery intelligence | Data returned (or "no data" gracefully) | Crash or error 500 |

---

## Flow 5 — Brain Tab: IQ Score, RL Signals, and Consolidation

**Persona**: Technical user monitoring brain training and learning metrics
**Goal**: Verify Brain tab shows real data, consolidation button works, and metrics update
**Session state**: Logged in, on any AI Worker page

### Steps

**Step 5.1 — Navigate to a worker Brain tab**
- Navigate to `/workspace`
- CLICK any active AI Worker card
- EXPECT: Worker page loads
- CLICK "Brain" tab
- EXPECT: Brain tab becomes active (border-b-2 underline indicator)
- EXPECT: Loading skeleton appears while data fetches (animated pulse divs)

**Step 5.2 — Verify Brain Intelligence card**
- WAIT 5s for brain data to load
- EXPECT: "Brain Intelligence" section header is visible
- EXPECT: Brain IQ score is displayed (a number 0-100) in large text with "IQ" label
- EXPECT: A progress bar fills to the IQ score percentage
- EXPECT: Four metrics are visible: "Signals (24h)", "Learning velocity", "Improvement", "Signals/hr"
- BUG: If IQ = 0 and all metrics = 0, check whether `/api/brain/rl-status?workerId=<id>` returns valid data. Log the raw API response.

**Step 5.3 — Verify Worker Health card**
- EXPECT: A second card shows "Worker Health" or equivalent label
- EXPECT: Metrics include: Running jobs, Pending jobs, Succeeded (1h), Failed (1h)
- EXPECT: Numbers are integers (not NaN or undefined)

**Step 5.4 — Verify Memory Tiers card**
- EXPECT: A "Memory Tiers" or "Tier Stats" section is visible
- EXPECT: Three tier counts are shown: Tier 1 (hot), Tier 2 (warm), Tier 3 (cold)
- EXPECT: Numbers are non-negative integers

**Step 5.5 — Click "Run Consolidation" button**
- Locate the "Run Consolidation" or "Begin Training" button in the Brain tab
- EXPECT: Button is enabled (not disabled/greyed out)
- CLICK the button
- EXPECT: Button text changes to loading state ("Consolidating..." or spinner)
- EXPECT: Button becomes disabled during processing
- WAIT 15s
- EXPECT: A success message appears: "Done — N patterns consolidated" or "Consolidation failed"
- EXPECT: Tier 3 count updates if patterns were promoted
- EXPECT: Message auto-dismisses after ~5 seconds

**Step 5.6 — Double-click prevention on consolidation**
- CLICK "Run Consolidation" button
- Immediately CLICK it again before response
- EXPECT: Only ONE API call is made (the `isConsolidating` guard prevents double-fire)
- BUG: If two consolidation API calls are logged in the network tab simultaneously, the guard is broken.

**Step 5.7 — Verify "Learning" indicator in header**
- If `learningVelocity > 0`: EXPECT an orange pulsing dot with "Learning" text in the header
- If `learningVelocity === 0`: EXPECT the indicator is absent (not shown)
- BUG: If "Learning" indicator shows persistently regardless of actual learning velocity, the condition check is broken.

**Step 5.8 — Navigate to workspace Brain overview**
- Navigate to `/brain`
- EXPECT: Page loads without 404
- EXPECT: Workspace-level brain overview shows causal graph, layer health, signal timeline
- EXPECT: No crash or blank page
- BUG: If `/brain` shows a blank page or 404, the workspace brain route is broken.

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| Brain tab loads with data | IQ number + metrics visible | Blank, skeleton stuck, or all zeros |
| Worker health shows integers | Numbers render | NaN or "undefined" visible |
| Consolidation button triggers API | Success/fail message appears | No response, or button stays disabled |
| Double-click prevention works | Single API call | Two simultaneous calls |
| `/brain` route loads | Page renders | 404 or blank |

---

## Flow 6 — Jobs Tab: Long-Running Agent Monitoring

**Persona**: Technical ops user monitoring async agent jobs
**Goal**: Verify Jobs tab shows real-time job status, statuses update live, and error states display properly
**Session state**: Logged in, on a worker with at least some job history

### Steps

**Step 6.1 — Navigate to Jobs tab**
- Navigate to `/workspace`
- CLICK an AI Worker card that shows a blue pulsing dot (running job indicator)
- CLICK "Jobs" tab
- EXPECT: Jobs tab activates
- EXPECT: If jobs exist, a table renders with columns: Task type | Agent type | Status | Priority | Created
- EXPECT: If no jobs, empty state shows "No jobs yet" with subtitle

**Step 6.2 — Verify job table data**
- EXPECT: Each row shows:
  - Task type: humanized (hyphens removed, title-cased) — e.g. "Delivery Intelligence" not "delivery-intelligence"
  - Agent type: lowercase label (e.g. "se-aas")
  - Status: colored badge — running (blue/accent), pending (amber), success (green), error (red)
  - Priority: "normal" or "high"
  - Created: relative time (e.g. "5m ago", "2h ago")
- BUG: If task_type or agent_type is NULL in the database, the cell must show "—" not crash.

**Step 6.3 — Verify real-time updates**
- EXPECT: The Jobs tab listens to Supabase `postgres_changes` on `agent_queue` table
- With a running job visible: wait 30 seconds
- EXPECT: If a running job completes, its status row updates from "running" to "success" or "error" WITHOUT a page refresh
- EXPECT: The Brain data (IQ score in header) also refreshes every 30s
- BUG: If the real-time subscription is not working, job statuses will be stale. Verify no errors in browser console about Supabase channel subscription.

**Step 6.4 — Refresh button**
- CLICK the "Refresh" button in the Jobs tab header
- EXPECT: Jobs list reloads
- EXPECT: "Refresh" button is clickable and has a hover state
- BUG: If clicking Refresh causes the loading skeleton to appear but then the list is empty despite jobs existing, the fetch is failing silently.

**Step 6.5 — Verify error job display**
- If a job with status "error" exists in the list:
  - EXPECT: Row is rendered with red status badge
  - EXPECT: No column for "error_message" is visible in the table (it exists in the data model but is not rendered as a column)
  - BUG: The `error_message` field is fetched from the API but not displayed to the user. Users cannot see WHY a job failed from the Jobs tab.

**Step 6.6 — Navigate between workers and check job isolation**
- In the header worker switcher, SELECT a different worker
- EXPECT: Jobs tab reloads showing only jobs for the new worker
- EXPECT: Jobs from the previous worker are NOT visible
- BUG: If `organization_id` scoping is correct but `ai_worker_id` scoping is absent, all org jobs may appear for all workers.

**Step 6.7 — Trigger a new job via Copilot and watch it appear in Jobs**
- CLICK "Chat" tab
- TYPE `analyze all recent commits for velocity issues`
- Press Enter
- WAIT 5s
- CLICK "Jobs" tab
- EXPECT: A new job row appears with status "pending" or "running"
- EXPECT: Job type reflects the copilot-triggered action (e.g. "Se Aas" or similar)

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| Jobs table renders with correct columns | All 5 columns visible | Missing columns or crash |
| NULL task_type shows "—" | Dash rendered | "undefined" or crash |
| Real-time status update without refresh | Status changes in-place | Requires manual refresh |
| Refresh button works | List reloads | Spinner stuck or empty list |
| Worker switching isolates jobs | Only current worker's jobs shown | All org jobs shown |

---

## Flow 7 — Agents Tab: Agent Creation via Copilot and Inspection

**Persona**: Product user creating and monitoring persistent agents
**Goal**: Create an agent via Copilot natural language, verify it appears in the Agents tab, and check its state
**Session state**: Logged in, on a worker with SE-aaS or any service activated

### Steps

**Step 7.1 — Navigate to Chat tab**
- Navigate to `/workspace`
- CLICK a worker that has an active service badge
- CLICK "Chat" tab
- EXPECT: CopilotChat renders with message input

**Step 7.2 — Request agent creation via Copilot**
- CLICK message input
- TYPE `create a weekly delivery health monitoring agent that runs every Monday at 9am`
- Press Enter
- WAIT 20s
- EXPECT: Copilot response includes an `AgentCreatedCard` component OR a text confirmation of agent creation
- EXPECT: Card shows: agent name, "Brain: Active", "RL: Enabled", "Memory: Tracking" indicators
- BUG: If the LLM classifier does NOT detect "create-agent" intent for this input, no agent is created. Document what the copilot actually returns.

**Step 7.3 — Switch to Agents tab**
- CLICK "Agents" tab
- EXPECT: Agents tab activates
- EXPECT: If the agent was created, it appears in the table immediately OR within 5s of clicking Agents tab (due to `fetchAgents()` on tab change)

**Step 7.4 — Verify agent table columns**
- EXPECT: Table shows columns: Name | Purpose | Status | Created by | Created
- EXPECT: Agent row shows:
  - Name: the agent name from `AgentCreatedCard` or a generated name
  - Purpose: brief description or "—"
  - Status: "pending", "running", or "active" with colored badge
  - Created by: "copilot" or "user"
  - Created: relative time

**Step 7.5 — Verify Refresh button on Agents tab**
- CLICK "Refresh" button in the Agents tab header
- EXPECT: Agent list reloads
- EXPECT: Existing agents are still shown

**Step 7.6 — Create a second agent directly**
- CLICK "Chat" tab
- TYPE `create a daily Jira ticket summary agent`
- Press Enter
- WAIT 20s
- CLICK "Agents" tab
- CLICK "Refresh"
- EXPECT: Two agents are now visible in the table

**Step 7.7 — Verify agent isolation between workers**
- Use the worker switcher to navigate to a DIFFERENT worker
- CLICK "Agents" tab
- EXPECT: The agents created in Step 7.2 and Step 7.6 are NOT visible (they belong to the original worker)
- EXPECT: Empty state "No agents yet" or the different worker's own agents

**Step 7.8 — Empty state display**
- Navigate to `/ai-worker/create`, create a brand new worker with NO prior activity
- CLICK "Agents" tab
- EXPECT: Empty state shows agent icon SVG + "No agents yet" + "Agents created by Copilot or the planner will appear here"

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| Copilot detects "create agent" intent | AgentCreatedCard shown | Generic response, no agent |
| Agent appears in Agents tab | Row visible after creation | Table empty or 500 error |
| Agent has correct columns | All 5 columns populated | Missing data or crash |
| Worker isolation works | Other worker shows own agents | Agents bleed between workers |
| Empty state renders | SVG + text visible | Blank div |

---

## Flow 8 — Slack Connector: OAuth Flow and Status Verification

**Persona**: Team lead connecting Slack for signal ingestion
**Goal**: Initiate the Slack OAuth flow, verify the redirect works, and check connector status
**Session state**: Logged in, on `/connectors`

### Steps

**Step 8.1 — Navigate to connectors page**
- Navigate to `/connectors`
- EXPECT: Page renders with connector tiles/list
- EXPECT: Slack connector tile is visible with name "Slack" and domain label

**Step 8.2 — Click Connect on Slack**
- CLICK "Connect" button on the Slack connector tile
- EXPECT: Browser is redirected to Slack OAuth authorization URL (Slack's domain)
- EXPECT: URL format: `https://slack.com/oauth/v2/authorize?client_id=...&scope=...&redirect_uri=...`
- EXPECT: `redirect_uri` parameter in the URL = `https://platform.usebrainos.com/api/connectors/slack/callback` (NOT localhost)
- BUG: If `redirect_uri` contains `localhost:3001`, the OAuth flow will fail in production. Check the exact URL.

**Step 8.3 — Verify callback URL is production**
- Read the `redirect_uri` parameter from the Slack authorization URL
- EXPECT: `redirect_uri` = `https://platform.usebrainos.com/api/connectors/slack/callback`
- BUG: `NEXT_PUBLIC_APP_URL` must be set in Amplify env to production domain. If unset, the code falls back to `request.nextUrl.origin` which should be correct in a production Lambda, but verify.

**Step 8.4 — Simulate callback after authorization (requires real Slack app)**
- This step requires actual Slack OAuth credentials. In automated testing, simulate the callback:
- Navigate to `/api/connectors/slack/callback?code=test_code&state=invalid_state`
- EXPECT: Response is a redirect to `/connectors?error=...` with a human-readable error (not a 500)

**Step 8.5 — Verify error handling on callback**
- EXPECT: After simulated invalid callback, browser lands on `/connectors?error=<message>`
- EXPECT: Error message is displayed to the user (toast, banner, or URL param shown in UI)
- BUG: If the `/connectors` page does NOT read `?error=` query param and display it, the user sees a blank connectors page with no explanation of what went wrong.

**Step 8.6 — Check connector instances list**
- On `/connectors`, scroll to the "Connected" or "Active Connectors" section
- EXPECT: If Slack is already connected (from a prior session), it appears with:
  - Status dot: green (active), amber (pending), or red (error)
  - Last synced timestamp
  - Signal count
- EXPECT: The `instanceName` or `displayName` is shown (e.g. "Slack — Workspace Name")

**Step 8.7 — Verify status strip on worker page reflects Slack**
- Navigate to `/ai-worker/<workerId>`
- EXPECT: If Slack connector is active, a "Slack" pill appears in the connector status strip
- EXPECT: Pill color matches connector status (emerald dot = active, red dot = error)
- CLICK the Slack pill
- EXPECT: Navigates to `/connectors`

**Step 8.8 — Test connector health endpoint**
- Navigate to `/api/connectors/health` (GET)
- EXPECT: JSON response with health data for all connectors
- EXPECT: No 401 error (user is authenticated)
- EXPECT: Response includes connector type, status, and last_sync_at for each connector

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| Slack OAuth redirect initiates | Browser goes to slack.com/oauth | Nothing happens or 500 |
| redirect_uri is production URL | `platform.usebrainos.com` in URI | `localhost:3001` in URI (bug) |
| Invalid callback returns readable error | Error in UI | 500 or blank page |
| Connected Slack shows in strip | Pill visible on worker page | Strip empty despite active connector |
| Health endpoint responds | JSON with connector data | 401 or 500 |

---

## Flow 9 — Multi-Worker Scenario: Worker Switcher and Context Isolation

**Persona**: Admin managing two workers for different clients (e.g. Fincense 5.11.5 and Fincense 6.3.4)
**Goal**: Verify that switching workers changes all context (name, history, brain data, API keys) and that no data bleeds between workers
**Session state**: Logged in, two AI Workers exist in workspace (matching Tookitaki demo setup)

### Steps

**Step 9.1 — Navigate to first worker**
- Navigate to `/workspace`
- EXPECT: Both "Fincense 5.11.5" and "Fincense 6.3.4" (or equivalent two workers) appear as cards
- CLICK the first worker card (e.g. "Fincense 5.11.5")
- EXPECT: URL is `/ai-worker/<worker1-id>`
- EXPECT: Header dropdown shows "Fincense 5.11.5" (or first worker name) selected

**Step 9.2 — Send a message in Chat tab of Worker 1**
- CLICK "Chat" tab
- TYPE `what is the current sprint velocity?`
- Press Enter
- WAIT 10s for response
- EXPECT: Response appears in the chat thread

**Step 9.3 — Switch to Worker 2 via dropdown**
- In the header, CLICK the worker name dropdown (the `<select>` element)
- EXPECT: Dropdown shows all workers in the workspace
- SELECT "Fincense 6.3.4" (or the second worker)
- EXPECT: Browser navigates to `/ai-worker/<worker2-id>`
- EXPECT: Header updates to show "Fincense 6.3.4"
- EXPECT: Chat tab is now EMPTY (new conversation — no history from Worker 1)
- BUG: If Worker 1's conversation history appears in Worker 2's chat, conversation isolation is broken.

**Step 9.4 — Verify Brain data is separate per worker**
- CLICK "Brain" tab on Worker 2
- WAIT 5s for data
- Note the Brain IQ score for Worker 2
- Switch back to Worker 1 via the dropdown
- CLICK "Brain" tab on Worker 1
- WAIT 5s
- Note the Brain IQ score for Worker 1
- EXPECT: The two IQ scores may differ (they are worker-scoped via `?workerId=` on `/api/brain/rl-status`)
- BUG: If both workers show identical IQ scores regardless of their actual usage, the `workerId` scoping is not being applied.

**Step 9.5 — Verify API keys are separate per worker**
- On Worker 1: CLICK "Keys" tab, note the key names
- Switch to Worker 2: CLICK "Keys" tab
- EXPECT: Worker 2 shows its own keys (or empty state)
- EXPECT: Worker 1's keys do NOT appear for Worker 2
- BUG: API keys are fetched from `/api/ai-workers/<workerId>/keys` — scoped by workerId. Verify the URL changes correctly when worker switches.

**Step 9.6 — Verify jobs are separate per worker**
- On Worker 1: CLICK "Jobs" tab, note job count and task types
- Switch to Worker 2: CLICK "Jobs" tab
- EXPECT: Job list is different (or empty if Worker 2 has no jobs)
- EXPECT: No overlap of Worker 1's jobs in Worker 2's view

**Step 9.7 — Verify agent list is separate per worker**
- On Worker 1: CLICK "Agents" tab, note agent names
- Switch to Worker 2: CLICK "Agents" tab
- EXPECT: Agent list is different
- EXPECT: Worker 1's agents do not appear under Worker 2

**Step 9.8 — Create new worker from within the worker switcher**
- In the header worker switcher dropdown, look for a "Create New Worker" option
- BUG: The `<select>` dropdown in the header lists all workers via `allWorkers.map()` but does NOT include a "Create New Worker" option (the MEMORY.md spec says it should). Document whether this option exists.
- If absent: manually navigate to `/ai-worker/create` as workaround

**Step 9.9 — Verify worker status dot in header**
- On an "active" worker: EXPECT green status dot in header right side
- On an "inactive" worker: EXPECT grey/muted status dot
- EXPECT: Status text next to dot shows "active" or "inactive"

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| Worker switcher changes URL | URL updates to new workerId | URL unchanged |
| Chat history is isolated per worker | Empty chat on switch | Previous worker's messages visible (bug) |
| Brain IQ can differ between workers | Different or zero-vs-nonzero | Always identical values |
| API keys isolated | Worker 2 shows own keys | Worker 1's keys visible |
| "Create New Worker" in switcher | Option present | Option absent (bug) |

---

## Flow 10 — Demo/Sales: Full Onboarding Journey from Fresh Login

**Persona**: Sales engineer running a live demo for a prospect
**Goal**: Complete a full walkthrough from login to first connector sync to first copilot insight in under 5 minutes
**Session state**: Fresh browser session (cleared cookies) — start from `/`

### Steps

**Step 10.1 — Navigate to root and verify redirect**
- Navigate to `https://platform.usebrainos.com/`
- EXPECT: Redirect to `/` login page or `/workspace` if already logged in
- EXPECT: If not logged in, a Supabase Auth UI or custom login form is shown

**Step 10.2 — Log in**
- Enter email: `abhishek@tookitaki.com`
- Enter password: `BrainOS2026`
- CLICK "Sign in" or "Login" button
- WAIT 5s
- EXPECT: Redirect to `/workspace` (NOT `/copilot` or `/dashboard` — those redirect to `/workspace`)
- EXPECT: Mission Control page shows "Mission Control" header and AI Worker grid

**Step 10.3 — Verify login redirect chain**
- Navigate to `/copilot`
- EXPECT: Redirect to `/workspace` (not a 404 or copilot full-screen UI)
- Navigate to `/dashboard`
- EXPECT: Redirect to `/workspace`
- BUG: If either `/copilot` or `/dashboard` renders its own page instead of redirecting, the redirect is not configured.

**Step 10.4 — Select a demo worker**
- On `/workspace`, locate the "Fincense 5.11.5" worker card
- EXPECT: Card shows "SE-aaS" blue badge (if service is activated)
- EXPECT: Card shows 7d quality score (green = 80%+, amber = 60-79%, red = below 60%)
- CLICK the card
- EXPECT: Navigates to `/ai-worker/<fincense-5-11-5-id>`

**Step 10.5 — Show connector status strip**
- EXPECT: Connector status strip is visible below the header
- EXPECT: At least one connector pill (e.g. GitHub, Jira) is visible with green status dot
- EXPECT: Strip is horizontally scrollable if there are many connectors

**Step 10.6 — Deliver a demo copilot query**
- CLICK "Chat" tab
- TYPE `what is the delivery health for all active engagements?`
- Press Enter
- WAIT 20s
- EXPECT: Copilot responds with delivery health data (since SE-aaS is activated)
- EXPECT: Response is formatted (not raw JSON) — human-readable narrative
- EXPECT: No 500 error or raw stack trace in response
- BUG: If the response is empty, check `/api/copilot/chat` logs and verify `deliveryIntelligenceResult` is injected into the system prompt.

**Step 10.7 — Trigger an agent from copilot**
- TYPE `create a daily engagement health monitoring agent`
- Press Enter
- WAIT 20s
- EXPECT: `AgentCreatedCard` appears in the chat with agent details
- EXPECT: CLICK "Agents" tab — new agent appears in list

**Step 10.8 — Show Brain overview**
- CLICK "Brain" tab
- EXPECT: Brain IQ score is visible and > 0 (since training has run)
- EXPECT: Signals (24h) shows a non-zero count
- EXPECT: No loading skeleton stuck in place

**Step 10.9 — Navigate to workspace Brain page**
- CLICK the "BrainOS" logo/link in the header
- EXPECT: Navigates to `/workspace`
- From sidebar (if available on `/workspace`): CLICK "Brain"
- EXPECT: Navigates to `/brain`
- EXPECT: Brain page shows causal graph or L25-L29 layer health signals
- EXPECT: Page does NOT crash or show blank

**Step 10.10 — Verify sidebar navigation (dashboard shell)**
- From `/workspace` or `/brain`, check the sidebar
- EXPECT: Sidebar links: AI Workers (→ `/workspace`) | Brain (→ `/brain`) | Connectors (→ `/connectors`) | Settings
- EXPECT: Old sidebar items (from pre-redesign) are NOT present: no "Dashboard", no "Copilot" standalone link
- BUG: If old sidebar items like "/dashboard/overview" or "/copilot" appear in sidebar, the nav cleanup is incomplete.

**Step 10.11 — Check "Active Learning" indicator in sidebar**
- EXPECT: If `learningVelocity > 0`, a pulsing orange pill labeled "Active Learning" appears in the sidebar
- EXPECT: Sidebar polls every 30s to update this indicator
- EXPECT: Indicator disappears when learningVelocity drops to 0

**Step 10.12 — Navigate to connectors and show last sync time**
- Navigate to `/connectors`
- EXPECT: "Last brain trained" or "Last synced" timestamp is visible somewhere on the page
- EXPECT: If `lastBrainTrainedAt` is non-null, it shows a human-readable relative time
- EXPECT: "Brain Training" section (if present) shows a "Begin Training" button
- BUG: The `lastBrainTrainedAt` prop is passed to `ConnectorsClient` — verify it is rendered visibly in the UI rather than only used internally.

**Step 10.13 — Verify no console errors during full demo flow**
- Open browser devtools
- Check the Console tab for errors
- EXPECT: Zero red console errors (console.error calls)
- EXPECT: At most informational console.warn messages (which are allowed per ESLint rules)
- BUG: Any `console.error` with a stack trace that appeared during this flow is a bug to log.

### PASS/FAIL Criteria

| Check | PASS | FAIL |
|---|---|---|
| Login → `/workspace` redirect | `/workspace` after login | `/dashboard` or `/copilot` renders |
| `/copilot` redirects to `/workspace` | `/workspace` shown | Copilot renders as standalone |
| Demo copilot query returns data | Formatted narrative response | Empty, 500, or raw JSON |
| AgentCreatedCard appears for agent creation | Card rendered | Generic text only |
| Brain tab shows non-zero IQ for trained worker | IQ > 0 | IQ = 0 with data present |
| `/brain` workspace page loads | Causal graph or layer health visible | Blank or 404 |
| No console.error during full demo | Clean console | Red errors present |

---

## Appendix A — Bug Registry (Pre-populated from Flow 1 Analysis)

| Bug ID | Severity | Location | Description | Confirmed |
|---|---|---|---|---|
| BUG-001 | Medium | `/workspace` WorkerCard | No inline edit for worker name or service type from Mission Control | Confirmed |
| BUG-002 | Medium | `/connectors` | No "Back to Worker" link after navigating from worker connector strip | Confirmed |
| BUG-003 | High | GitHub App Install | App may be registered with `localhost:3001` callback URL in GitHub App settings | To verify |
| BUG-004 | Medium | JiraSetupModal | No "Add another Jira instance" button — single instance only | To verify |
| BUG-005 | Medium | GitHubSetupModal | Repo URL can be entered in step 1 but additional repos UI is not clearly discoverable | Confirmed |
| BUG-006 | High | Copilot chat route | SE-aaS domain functions (delivery-intelligence, early-warning) execute regardless of worker service_type | Confirmed |
| BUG-007 | High | Copilot chat route | "check all connections" phrase has no dedicated handler — does not trigger sync agent | Confirmed |
| BUG-008 | High | Copilot chat route | "begin training" phrase has no dedicated handler — does not trigger brain training | Confirmed |
| BUG-009 | Low | Jobs Tab | `error_message` field fetched but not displayed — users cannot see job failure reason | Confirmed |
| BUG-010 | Low | Worker switcher | Header `<select>` dropdown does not include "Create New Worker" option | To verify |
| BUG-011 | Low | `/connectors` page | `lastBrainTrainedAt` prop may not be rendered visibly in connector page UI | To verify |

---

## Appendix B — API Endpoints Under Test

| Endpoint | Method | Used In |
|---|---|---|
| `/api/workspace/workers` | GET | Flow 1, 9, 10 — Mission Control worker grid |
| `/api/ai-workers` | GET / POST | Flow 1, 2, 9 — Worker list + create |
| `/api/ai-workers/<id>` | GET | Flow 3, 9 — Individual worker data |
| `/api/ai-workers/<id>/keys` | GET / POST | Flow 3 — API key management |
| `/api/brain/rl-status?workerId=<id>` | GET | Flow 5, 9 — RL metrics per worker |
| `/api/brain/worker-health?workerId=<id>` | GET | Flow 5 — Health metrics |
| `/api/brain/consolidation` | POST | Flow 5 — Brain training trigger |
| `/api/brain/evolution?organizationId=<id>` | GET | Flow 5 — Brain IQ score |
| `/api/connectors/status?workspaceId=<id>` | GET | Flow 1, 8 — Connector status strip |
| `/api/connectors/sync-all` | POST | Flow 4 — Sync agent trigger |
| `/api/connectors/health` | GET | Flow 8 — Connector health |
| `/api/connectors/github/app-install` | GET | Flow 1 — GitHub App install initiation |
| `/api/connectors/github/app-install/callback` | GET | Flow 1 — GitHub install completion |
| `/api/connectors/jira/connect` | POST | Flow 2 — Jira connection |
| `/api/connectors/slack/auth` | GET | Flow 8 — Slack OAuth start |
| `/api/connectors/slack/callback` | GET | Flow 8 — Slack OAuth completion |
| `/api/copilot/chat` | POST | Flow 4, 7, 10 — Chat responses (SSE) |
| `/api/agents/create` | POST | Flow 7 — Agent creation from copilot |

---

## Appendix C — Environment Checklist Before Running Tests

Before executing these flows in production, verify:

1. `NEXT_PUBLIC_APP_URL` = `https://platform.usebrainos.com` (not localhost) in Amplify env
2. `GITHUB_APP_SLUG` is set AND GitHub App's callback URL in GitHub App settings = `https://platform.usebrainos.com/api/connectors/github/app-install/callback`
3. Slack App's redirect URI = `https://platform.usebrainos.com/api/connectors/slack/callback`
4. Jira OAuth app's redirect URI = `https://platform.usebrainos.com/api/connectors/jira/callback`
5. At least 2 AI Workers exist: `9f338d96-...` (Fincense 5.11.5) and `aa286f56-...` (Fincense 6.3.4)
6. At least one connector (GitHub or Jira) is in "active" state for signal ingestion to work
7. Brain has been trained at least once (some signals in `federated_knowledge` table)
