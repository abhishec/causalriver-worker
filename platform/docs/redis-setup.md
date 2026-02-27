# Redis Setup (Optional — enables 8-hour+ jobs)

## Without Redis (default — works today)

Without Redis, BrainOS uses the **Lambda Chain Pattern**:

- Jobs are stored in Supabase `agent_queue`
- Each Lambda invocation runs for up to **75 seconds**
- When the 75s budget is nearly exhausted, the agent saves a `DeepCheckpoint`
  (full conversation history + completed work) and creates a child "continuation" job
- The next `process-jobs` cron tick (every 10 min) picks up the child job
- Maximum effective duration: **~30 minutes** (20 chain hops × 75s)

No infrastructure changes required — this works today on AWS Amplify.

## With Redis (enables 8-hour+ jobs)

When `REDIS_URL` is set, BrainOS automatically switches to **BullMQ**:

- Jobs are stored in Redis and processed by long-lived worker processes
- No Lambda kill ceiling — workers manage their own lifecycle
- Jobs can run for **hours without interruption**
- Built-in retry, delay, priority, and dead-letter queue

### Setup

1. Provision a Redis instance:
   - **AWS ElastiCache** (recommended for production): `redis://your-elasticache-endpoint:6379`
   - **Redis Cloud** (managed): `rediss://user:pass@host:6380`
   - **Local dev**: `redis://localhost:6379`

2. Set the environment variable:
   ```
   REDIS_URL=redis://your-redis-endpoint:6379
   ```
   - In Amplify Console: Apps → platform → Environment variables → Add variable
   - The variable must be in the `env` block in `platform/next.config.ts` to be
     available in Lambda runtime (see Amplify SSR gotcha in CLAUDE.md)

3. No code changes required — `getQueueBackend()` in `lib/brain/queue-backend.ts`
   auto-detects the env var and routes accordingly.

### Worker deployment

With Redis, you also need a long-running worker process to process jobs.
Add a worker Dockerfile/ECS task that runs:

```typescript
import { createWorkerPool } from '@nexus-ai/memory-stack/infra/worker-pool';
// Worker setup — see packages/memory-stack/src/infra/worker-pool.ts
```

Until the worker is deployed, BullMQ jobs will queue in Redis but not be processed.
The Supabase fallback is always safe to use for production until the worker is ready.

## Queue Backend Summary

| Setup | Max Duration | Infrastructure | Code Path |
|-------|-------------|----------------|-----------|
| No REDIS_URL | ~30 min | None (Supabase only) | `enqueueSupabase()` in queue-backend.ts |
| REDIS_URL set | Unlimited | Redis + Worker process | `enqueueBullMQ()` in queue-backend.ts |
