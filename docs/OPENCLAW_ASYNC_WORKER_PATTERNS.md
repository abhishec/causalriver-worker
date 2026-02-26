# OpenClaw Async Worker Patterns — Applied to BrainOS

## Source: "CLIs Beat MCP for AI Agents" (Peter Steinberger / OpenClaw)
## Applied: 2026-02-27

---

## Core Thesis

The central argument in Steinberger's article is that CLIs are a superior interface for AI agents compared to Model Context Protocol (MCP) for most real-world use cases. CLIs provide a well-defined stdin/stdout contract that is universally composable, testable in isolation, debuggable with standard tooling, and invokable by any system — not just MCP-aware AI frameworks. MCP, by contrast, implies a live, stateful RPC session that adds protocol overhead, requires specific client support, and conflates the concerns of transport, discovery, and execution into a single coupled layer.

The corollary for async AI workers is equally important: agents doing real work (code review, test generation, incident diagnosis) should not block on a synchronous RPC call. They should submit to a queue, return a job ID immediately, and let a polling or push mechanism deliver the result when ready. This is the classic producer/consumer pattern applied to AI. Any architecture that forces the AI caller to maintain a live connection for the duration of a long-running task is fighting the grain of both HTTP and LLM execution.

---

## BrainOS Architecture Assessment

### What We Do Right

1. **Async-first job queue for heavy tasks.** `platform/lib/se-aas/job-queue.ts` and `platform/lib/se-aas/job-worker.ts` implement exactly the pattern Steinberger advocates: insert a row into `agent_queue`, return a `jobId`, and drain the queue via `GET /api/cron/process-jobs` on a 2-minute schedule. Users never block on a 60-second domain execution.

2. **Domain weight stratification.** The `HEAVY_DOMAINS` set in `platform/lib/se-aas/job-worker.ts` (incident-diagnosis, tdd-code-generator, pr-review, etc.) separates compute-expensive tasks from fast synchronous ones. The cron endpoint accepts `?type=light|heavy|mixed`, meaning heavy-domain workers can be scaled independently without blocking light-domain throughput — exactly what you want in a multi-tenant async worker pool.

3. **Per-org backpressure.** The `MAX_RUNNING_PER_ORG = 3` guard in `job-worker.ts` prevents one tenant from monopolising the worker fleet. This is a correct queue design pattern that CLI-based systems often omit.

4. **Composable output contract via `cross_domain_signals`.** Brain RL feedback (`platform/lib/brain/agent-rl.ts`) emits quality signals to `cross_domain_signals` and `prediction_records` regardless of which domain produced the result. This is analogous to a well-defined stdout contract: every domain executor produces a structured quality signal that downstream learning systems can consume without knowing which domain ran.

5. **Fire-and-forget side effects.** RL outcome recording (`recordJobOutcome`), write-back dispatch (`checkAndQueueWriteback`), and orchestration unblocking (`checkAndStartWaitingJobs`) are all called with `.catch(() => {})` — they cannot block or fail the primary job result. This is the async equivalent of a CLI writing to stderr without affecting stdout.

6. **Recovery Agent.** `platform/lib/brain/recovery-agent.ts` wraps every domain execution so that empty or failed results trigger a structured retry before surfacing an error. This is the job queue equivalent of a CLI's non-zero exit code handler with automatic fallback.

7. **Sync/async domain registry.** `DOMAIN_MAP` in `platform/lib/se-aas/domain-executor.ts` tags each domain with `sync: true|false`. Fast domains (sql-analyzer, data-lineage, pod-match) can skip the queue and execute inline; slow domains go async. This is the right heuristic: treat the queue as an escape valve for heavy work, not as mandatory overhead for all invocations.

---

### What Could Be Improved

1. **MCP SSE endpoint uses in-memory session state (`platform/app/api/mcp/sse/route.ts`, lines 41-49).** The `sessions` Map lives in-process on a Lambda instance. On AWS Amplify (multi-instance SSR Lambda), a POST `/api/mcp/sse?sessionId=X` may land on a different instance than the GET that created session X, making the SSE controller unreachable. The comment at line 43 acknowledges this: "For distributed deployments, replace with Redis." This is the canonical MCP live-session brittleness that Steinberger warns about. The stateless POST mode (lines 235-242) already works correctly, but the SSE streaming path is fragile at scale.

2. **OpenClaw Gateway uses a persistent WebSocket (`platform/lib/openclaw/gateway-client.ts`).** The gateway-client maintains a long-lived WebSocket connection per org in the `GatewayManager` singleton. On Lambda, singletons do not persist reliably between invocations — a cold start silently drops the connection. The `triggerOpenClawAgent` async generator in `gateway-client.ts` then fails silently at the point where it expects the connection to be live. This is the architectural tension Steinberger identifies: live RPC sessions are incompatible with stateless serverless runtimes. A webhook-first or polling-first fallback (already partially implemented via `webhookUrl` in `GatewayConfig`) should be the primary path, not the fallback.

3. **No CLI entrypoint for domain executors.** The `platform/scripts/` directory has health-check scripts, seed scripts, and diagnostic utilities, but no script that lets you invoke a domain executor directly from the terminal. This means the only way to test a domain (e.g., `pod-match` or `tdd-code-generator`) is via an HTTP API call, which requires a running server, a valid Supabase session, and a real `organizationId`. A thin CLI wrapper around `executeDomain` would make local development, debugging, and regression testing significantly faster — and aligns exactly with Steinberger's composability argument.

---

## Applied Patterns

### Pattern 1: Async Job Queue (We Have This — Correctly Implemented)

`agent_queue` (PostgreSQL table) acts as the durable message queue. `submitJob` inserts a pending row with `priority`, `task_type`, and a JSON `payload`. `GET /api/cron/process-jobs` drains pending rows by calling `processSeAaSJobs`, which claims each job (status `→ running`), executes the domain, and updates the job to `success` or `error` with the result stored in `result` (JSONB) and as a separate artifact in `se_aas_artifacts`.

This correctly decouples the job producer (the copilot chat route or the MCP tool handler) from the job consumer (the cron worker). The producer returns a `jobId` to the caller immediately. The caller polls `GET /api/se-aas/status?jobId=X` or waits for SSE push. No live connection is needed during execution.

Relevant files:
- `platform/lib/se-aas/job-queue.ts` — `submitJob`, `getJobStatus`, `executeAndCompleteJob`, `saveArtifact`
- `platform/lib/se-aas/job-worker.ts` — `processSeAaSJobs`, `classifyDomainWeight`
- `platform/app/api/cron/process-jobs/route.ts` — cron endpoint, returns 200 even on error to prevent thundering herd

### Pattern 2: CLI-testable Executors (Gap — Currently Requires HTTP Stack)

The domain executor interface (`executeDomain` in `platform/lib/se-aas/domain-executor.ts`) takes a plain TypeScript object (`ExecuteDomainParams`) and returns a plain result. It has no HTTP-specific dependencies — it accepts a Supabase client, a domain type string, and a request object. This means wrapping it in a CLI script is mechanically straightforward.

Current state: the only way to invoke a domain is through:
- `POST /api/copilot/chat` (sync, copilot-triggered)
- `POST /api/agents/create` → `agent_queue` → cron worker
- `POST /api/mcp/sse` (MCP tool call)

None of these are invocable from a terminal without a running Next.js server. A script like `platform/scripts/run-domain.ts` that accepts `--domain pod-match --org <uuid> --payload '{...}'` would let engineers test domains without spinning up the full platform — consistent with Steinberger's "CLIs are testable" principle.

### Pattern 3: Composable Brain Signals (We Have This)

`cross_domain_signals` acts as the universal output bus for RL feedback. Every domain execution — regardless of which executor path ran it (cron worker, MCP tool, copilot inline, agent composer) — feeds quality signals into the same `cross_domain_signals` table via `recordJobOutcome` in `platform/lib/rl/outcome-recorder.ts` and `recordAgentOutcome` in `platform/lib/brain/agent-rl.ts`.

This is the correct architectural equivalent of a CLI's stdout contract: the signal schema is fixed (`signal_type`, `signal_strength`, `domain`, `organization_id`, `payload`), and the RL consumer (`/api/brain/rl-status`, `/api/brain/learning-stats`) reads from it without caring how the signal was produced. Adding a new domain or a new execution path does not require changes to the RL consumer — only the signal emitter needs to call `recordJobOutcome`.

---

## Recommendations

1. **Replace in-memory MCP sessions with a stateless POST-only mode (`platform/app/api/mcp/sse/route.ts`).** Remove the `sessions` Map. The stateless path at lines 235-242 already works correctly. External agents that need streaming should use the OpenClaw gateway (WebSocket), not MCP SSE. If SSE streaming is kept, move session state to a KV store (Supabase `kv_store` table or Upstash Redis) so it survives across Lambda instances. The current implementation silently drops responses in multi-instance deployments, which is worse than no streaming at all.

2. **Make the OpenClaw Gateway webhook-first, WebSocket-second (`platform/lib/openclaw/gateway-client.ts`).** On Lambda cold starts the WebSocket singleton is gone. The `webhookUrl` field in `GatewayConfig` is already wired but only used as a fallback. Invert the priority: if `webhookUrl` is configured, use webhook delivery as the primary path and only attempt WebSocket if the webhook fails. This makes the integration stateless (the Lambda posts to the customer's webhook URL and returns) rather than stateful (the Lambda holds a live WebSocket connection that dies on cold start).

3. **Add `platform/scripts/run-domain.ts` — a CLI entrypoint for SE-aaS domain executors.** This script should accept `--domain <name>`, `--org <uuid>`, `--payload <json>`, and `--user <id>`. It should import `executeDomain` directly, create a Supabase service client using env vars, call `executeDomain`, and print the result as JSON to stdout. This enables:
   - Local domain testing without a running server
   - CI regression tests for domain behavior
   - Debugging specific payloads against production data (with read-only service key)
   - Aligns with the CLI composability principle from the article

---

## What NOT to Change

- **The `sync: true` domain flag.** Domains like `sql-analyzer` and `data-lineage` execute in milliseconds and correctly bypass the queue for inline execution. The Steinberger thesis does NOT say "always use a queue" — it says "don't use live RPC for long-running tasks." Fast synchronous domains are fine as inline calls. The current dual-path (sync inline vs async queue) is the correct design.

- **The MCP SSE endpoint's existence.** Despite the stateless-session problem, exposing Brain tools via MCP is the right product decision: Claude Code, Cursor, and other MCP-compatible tools can use the Brain directly without bespoke integrations. The fix is the session storage, not the protocol. MCP is appropriate here because BrainOS is a *tool provider*, not an *agent runtime* — it does not need to initiate or coordinate multi-step agent workflows, it just responds to tool calls.

- **The OpenClaw WebSocket gateway architecture.** The gateway is correct in concept: customer machines run a local daemon (OpenClaw), and BrainOS connects to it to relay agent events. The problem is not the WebSocket protocol but the Lambda singleton pattern. On a persistent server (EC2, dedicated container) the WebSocket gateway works exactly as intended. The fix is the cold-start resilience, not the protocol.

- **Fire-and-forget RL recording.** `recordJobOutcome` is intentionally non-blocking. Making it awaited would add 50-200ms to every job completion for a pure observability write. The current pattern (`.catch(() => {})`) is correct — RL signals are important but never on the critical path of job delivery.
