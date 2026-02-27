# BrainOS Engineering Notes

> Synthesised from codebase analysis. Append new findings below with date headers.

---

## Amplify Deployment: Build Requirements and Failure Modes

*Source: `platform/amplify.yml`, `platform/scripts/build.sh`, `platform/next.config.ts`*

### Build Sequence

The Amplify build runs two stages as defined in `amplify.yml`:

**preBuild:**
1. Install pnpm 9 globally
2. From the repo root: `pnpm install --frozen-lockfile`
3. Build the `@nexus-ai/memory-stack` package: `pnpm --filter @nexus-ai/memory-stack run build`

**build:**
1. Run `pnpm build` inside `platform/` — this invokes `scripts/build.sh` which wraps `npx next build --experimental-app-only`

**Cache paths** (used across builds to speed up deploys):
- `.next/cache/**/*`
- `node_modules/**/*`
- `../node_modules/**/*` (monorepo root)
- `../packages/memory-stack/dist/**/*`

### Memory Requirements

The build script sets:
```
NODE_OPTIONS="--max-old-space-size=8192"
```
8 GB heap is required. Builds on instances with less RAM will OOM silently during the webpack bundling phase — the process dies without a useful error message. This is especially likely with heavy packages (`recharts`, `framer-motion`, `shiki`, `@supabase/supabase-js`, `xlsx`) that are tree-shaken via `experimental.optimizePackageImports`.

### Known Failure Mode: Next.js 15.5 Route Group Page Data Collection Bug

Next.js 15.5 App Router crashes during the "Collecting page data" phase for route groups (`(auth)`, `(dashboard)`). Since all pages use `force-dynamic` or `"use client"`, this phase is irrelevant — runtime rendering is unaffected.

`build.sh` handles this explicitly:
1. Captures `next build` output to a temp file
2. If exit code is non-zero, checks: did compilation succeed? Does `build-manifest.json` exist? Does `.next/server/app/` exist?
3. If all three pass → exits 0 ("build accepted, compilation passed")
4. Also generates `BUILD_ID` manually if the page data phase crashed before creating it

This means Amplify will report a successful build even when `next build` exits non-zero — which is intentional and correct for this specific known bug.

### Critical Environment Variables

All server-only env vars must be inlined in `next.config.ts` `env` block. Amplify Console env vars are **build-time only** — they are not available in the Lambda runtime. Without inlining, all server routes silently receive `undefined` for these values.

Currently inlined (as of the current `next.config.ts`):

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role DB access (bypasses RLS) |
| `ANTHROPIC_API_KEY` | Claude API |
| `OPENAI_API_KEY` | OpenAI embeddings |
| `CRON_SECRET` | Authenticates GitHub Actions cron calls |
| `SE_AAS_WORKER_SECRET` | SE-aaS worker auth |
| `AWS_S3_BUCKET_NAME`, `AWS_S3_REGION` | Document storage |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | AWS credentials |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis rate limiter (falls back to in-memory if missing) |
| `GITHUB_APP_SLUG`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth connector |
| `FRESHDESK_CLIENT_ID`, `FRESHDESK_CLIENT_SECRET` | Freshdesk connector |
| `CREDENTIAL_ENCRYPTION_KEY` | Connector credential encryption |
| `CONFLUENCE_WEBHOOK_SECRET` | Confluence HMAC validation |

**Adding a new server-only env var** requires two steps: (1) set it in Amplify Console, and (2) add it to the `env` block in `next.config.ts`. Skipping step 2 means production Lambda gets `undefined` — no build error, just silent runtime failures.

### Native Module Handling

`@nexus-ai/memory-stack`, `tree-sitter`, and `pdf-parse` are in `serverExternalPackages`. They must **not** be added to `transpilePackages` — webpack would try to bundle their native `.node` binaries for the browser. The `noop-loader.js` handles `.node` files for both webpack and Turbopack.

### The 500 → 401 Lambda Pattern

Any API route that calls `createClient()`, `supabase.auth.getUser()`, or `createServiceClient()` must wrap each call in its own `try/catch` returning 401. All three can throw independently during a Lambda cold start when env vars are missing. A single top-level try/catch is insufficient.

---

## Overnight Agent System: Lessons and Architecture

*Source: `platform/lib/agents/overnight-executor.ts`, `platform/app/api/agents/overnight/route.ts`*

### What the Overnight Agent Does

The overnight agent is a two-layer system:

**Layer 1 — Orchestrator** (`POST /api/agents/overnight`):
1. Authenticates user and resolves workspace
2. Loads GitHub connector credentials from `org_connectors` (hard fail if missing)
3. Optionally loads Slack connector credentials (non-fatal if missing)
4. Calls `/api/agents/decompose-spec` to break the spec into tickets
5. If decomposition returns 0 tickets, creates one fallback ticket from the raw spec
6. Fetches brain context summary for code generation hints
7. Creates a parent job in `agent_queue` (`status: 'running'`)
8. Creates one child `code-agent` job per ticket (`status: 'pending'`)
9. Marks parent job `success`, records RL outcome (quality = `childJobsCreated / ticketCount`)
10. Returns immediately — does not wait for child jobs to execute

**Layer 2 — Code Agent Executor** (`executeCodeAgentJob` in `overnight-executor.ts`):
Called by `process-jobs` cron when it finds a `task_type: 'code-agent'` pending job.

1. Starts a 30-second heartbeat to prevent the stale-job watchdog from killing the job (code-agent jobs take 2–5 minutes)
2. Generates a branch name: `agent/<slugified-title>-<timestamp-base36>`
3. Calls Claude Haiku (`claude-haiku-4-5-20251001`, max 8192 tokens) with a system prompt that includes the ticket details and brain context
4. Parses the JSON file array from Haiku's response (strips markdown fences if present)
5. Runs optional OpenClaw static analysis on the generated files (non-fatal, 15s timeout)
6. Creates the GitHub branch (hard failure — records RL quality=0 and returns if this fails)
7. Commits files to the branch (hard failure — records RL quality=0.1 if this fails)
8. Opens a PR with a structured body (hard failure — records RL quality=0.2 if this fails)
9. Looks up the most recent committer and requests a review (non-fatal, 30s timeout)
10. Sends a Slack block-kit notification (non-fatal)
11. Records RL outcome: quality=0.8 for successful PR, quality=0.3 for partial success

### What Works Well

- **Graceful degradation at every step.** If Haiku fails to generate files, the agent commits a markdown placeholder (`agent-notes/<title>.md`) so the PR exists and a human can implement it manually. The overall loop doesn't abort.
- **Tiered RL quality scores.** Branch creation failure = 0.0, commit failure = 0.1, PR failure = 0.2, success = 0.8. This gives meaningful signal to the RL planner about where in the pipeline things broke.
- **Heartbeat prevents false watchdog kills.** Without the heartbeat, the stale-job watchdog would kill any job running longer than 120 seconds. The heartbeat writes a timestamp every 30 seconds, giving 3 grace beats for a 2–5 minute code-agent job.
- **Brain context injected into codegen.** The orchestrator calls `getBrainContext()` and passes the `contextSummary` string into every child job's payload. Haiku can then match existing codebase patterns when generating files.
- **Parent/child job tracking.** `parent_job_id` FK on `agent_queue` lets `/api/brain/worker-health` report the full tree: one orchestrator job with N child code-agent jobs.

### Rate Limits

The `/api/agents/overnight` endpoint is rate-limited in `security-middleware.ts`:

```
SESSION_RATE_LIMITS["/api/agents/overnight"] = 2     // max 2 requests
SESSION_RATE_WINDOWS["/api/agents/overnight"] = 3600 // per 3600 seconds (1 hour)
```

This means 2 overnight runs per user per hour. The limit prevents runaway spawning: each overnight run can create N child code-agent jobs, each of which creates a GitHub branch and PR. Without rate limiting, a single user could flood the `agent_queue` and exhaust the GitHub API rate limit.

The route also sets `maxDuration = 300` (5 minutes) for the Lambda timeout, since decompose-spec is an internal fetch that can take time.

### Known Failure Modes

| Failure | Severity | Behaviour |
|---|---|---|
| No active GitHub connector | Hard fail | Returns 400 with message to reconnect |
| GitHub `access_token` missing from credentials | Hard fail | Returns 400 |
| Branch creation fails (network, 422 already exists) | Hard fail | Records RL quality=0, returns error result |
| File commit fails | Hard fail | Records RL quality=0.1, leaves orphan branch |
| PR creation fails | Hard fail | Records RL quality=0.2, leaves branch + commits |
| `decompose-spec` returns 0 tickets | Soft fallback | Creates one ticket from raw spec text |
| Haiku generates invalid JSON | Soft fallback | Commits placeholder markdown file |
| OpenClaw analysis fails | Non-fatal | Logs warning, continues |
| Slack notification fails | Non-fatal | Logs warning, continues |
| Review request fails | Non-fatal | Logs warning, continues |
| `getBrainContext()` throws | Non-fatal | Code generation proceeds without context |

### RL Integration

The overnight system feeds into the same RL flywheel as SE-aaS domains:

- **Parent orchestrator job**: `domain: 'overnight-orchestrator'`, quality = fraction of tickets that got child jobs queued
- **Each child code-agent job**: `domain: 'code-agent'`, quality = 0.0–0.8 depending on how far through the pipeline it got

These outcomes land in `prediction_records` and emit dopamine/gaba signals to `cross_domain_signals`. The cognitive planner's Phase 1b reads `prediction_records` for quality assessment, but **will not autonomously schedule overnight or code-agent jobs** — these are explicitly listed in the planner's system prompt as user-triggered-only domains:

> "IMPORTANT: These domains are user-triggered ONLY — do NOT schedule them: code-agent, overnight-orchestrator, spec-decomposition"

### How to Add a New Overnight Job Type

1. Add a new `task_type` value in the child job insert in `overnight/route.ts`
2. Add a handler branch in `process-jobs/route.ts` Phase 3 (where it checks `task_type === 'code-agent'`)
3. Record RL outcome via `recordAgentOutcome()` at the end
4. If the job can run longer than 120 seconds, add a heartbeat via `startJobHeartbeat()` / `stopJobHeartbeat()`
5. Do NOT add the new `task_type` to the cognitive planner's domain list unless it should run autonomously
