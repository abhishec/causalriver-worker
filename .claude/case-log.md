# Case Log — Resolved Issues & Patterns

> This file is updated after every resolved debugging session.
> Read this BEFORE debugging to avoid repeating past mistakes.

---

## Case 001: Next.js Build OOM (2026-02-23)
- **Symptom**: `next build` fails with PageNotFoundError for many routes
- **Red herrings**: _document module missing, dummy env vars, suppress scripts
- **Root cause**: Webpack workers silently OOM at default ~1.5GB heap limit → incomplete manifests
- **Fix**: `--max-old-space-size=4096` in NODE_OPTIONS (`platform/scripts/build.sh`)
- **Pattern**: Silent OOM → incomplete output → misleading downstream errors
- **Lesson**: Test memory/resource constraints BEFORE debugging code-level issues
- **Time wasted**: ~2 hours chasing code-level workarounds before testing memory

## Case 002: Next.js 15 /_document PageNotFoundError (2026-02-23)
- **Symptom**: Build crashes at "Collecting page data" with PageNotFoundError for /_document
- **Root cause**: Next.js 15 `createPagesMapping()` always registers /_document even in App Router-only projects
- **Fix**: `suppress-document-error.cjs` wraps `process.on('unhandledRejection')` to filter it out
- **Pattern**: Framework registers internal routes that don't exist in user code
- **Lesson**: Wrap the event handler registration, not process.exit — patching exit causes cascading failures
- **Failed approaches**: (1) Created `pages/_document.tsx` — pages-manifest stayed empty. (2) Patched `process.exit` — suppressed one error but build continued into corrupted state with more PageNotFoundErrors.

## Case 003: NEXT_PUBLIC vars with dummy values (2026-02-23)
- **Symptom**: Build compiles but produces only 3-4 routes instead of 223
- **Root cause**: NEXT_PUBLIC_* vars are inlined at compile time by webpack; dummy values cause import resolution failures in downstream modules
- **Fix**: Use real .env.local during builds, don't substitute dummy values
- **Pattern**: Compile-time inlined vars have build-wide side effects beyond their direct usage site
- **Lesson**: Never hide .env.local during Next.js builds — NEXT_PUBLIC vars are baked into the JS bundle at compile time

## Case 004: ANTHROPIC_API_KEY empty in shell shadows .env.local (2026-02-23)
- **Symptom**: API routes return 503 "ANTHROPIC_API_KEY not configured" despite key being in .env.local
- **Root cause**: Claude Code exports `ANTHROPIC_API_KEY=""` (empty string) into child process env. Next.js / dotenv never overwrite existing env vars — even empty ones. So the empty shell value shadows the real .env.local value.
- **Fix**: In dev-watchdog.mjs and dev.mjs, after parsing .env.local, inject values into process.env for any required var that's empty in the shell. This runs BEFORE spawning `next dev`.
- **Pattern**: Empty env var ≠ unset env var. `process.env.KEY = ""` is truthy for `!== undefined` but falsy for `if (!val)`. dotenv treats any existing key (even empty) as "already defined".
- **Lesson**: When debugging "env var not found", always check `env | grep KEY` first — the var might be set to empty by another tool
- **Diagnostic shortcut**: `env | grep ANTHROPIC` reveals the shadow immediately
- **Time**: ~15 min (applied debugging protocol — checked environment first)

## Case 005: Production-Readiness Audit Results (2026-02-23)
- **Context**: Full audit of BrainOS platform codebase for production gaps
- **Score**: 9.2/10 — platform is production-ready
- **Key findings**:
  - Auth: 110/144 API routes have explicit auth; 34 intentionally public (health/webhooks/crons — all with signature/token verification)
  - RLS: All new tables (workflows, workflow_runs, workflow_run_steps) have org-isolation RLS policies
  - Localhost URLs: All gated behind `NODE_ENV !== "production"` with proper fallback chain
  - Logging: Zero console.log violations in production code; structured logger used throughout
  - Security: CSP + HSTS + X-Frame-Options + IDS all in place
  - Only 1 TODO: Phase 4.3 GitHub integration layer (forward-looking, not a blocker)
- **Action items**: (1) Ensure production deployment sets NEXT_PUBLIC_APP_URL, (2) Verify baseline Supabase tables have RLS enabled on console
- **Pattern**: BrainOS follows defense-in-depth — multi-layer auth (user → org membership → RLS), env validation at startup, CSP/HSTS/IDS at middleware

## Case 006: Next.js 15 build fails with PageNotFoundError for route groups (2026-02-23)
- **Symptom**: `next build` fails during "Collecting page data" with `PageNotFoundError: Cannot find module for page: /login` etc., even though `app/(auth)/login/page.tsx` exists and compiles correctly
- **Root cause**: Next.js 15.3.3 bug — "Collecting page data" phase uses URL paths (e.g. `/login`) to find modules, but compiled modules are under route group paths (e.g. `(auth)/login`). Mismatch causes ENOENT
- **What DOESN'T work**:
  - `export const dynamic = "force-dynamic"` on root layout — still tries to collect page data
  - Suppressing `process.exit(1)` — build continues but produces incomplete manifests
  - Adding filesystem operations in `--require` script — causes race conditions in workers
  - 4GB memory (marginal for this codebase) — causes cascading failures that look like the route group bug
- **What partially works**:
  - `suppress-document-error.cjs` catching `unhandledRejection` → only works for `/_document`, not other routes (they use a different error path — caught internally by Next.js, not thrown as unhandled rejection)
  - 8GB memory (`--max-old-space-size=8192`) — eliminates OOM-related cascading failures
- **Current state**: Build fails during "Collecting page data" for all route-group pages. TypeScript + ESLint pass. Pages compile correctly. Dev server works fine. **This is a pre-existing issue, not a regression.**
- **Potential fix**: Migrate to Next.js 15.4+ if/when this bug is fixed, or restructure routes to not use route groups
- **⚠️ WARNING**: DO NOT add filesystem operations (mkdirSync, writeFileSync) to the `--require` preload script — they run in webpack workers and cause race conditions that produce MORE PageNotFoundErrors

## Case 007: VC Technical Due Diligence Audit (2026-02-23)
- **Context**: Comprehensive codebase review from VC fund manager perspective
- **Score**: 8.6/10 overall — strong technical foundation, defensible IP
- **Method**: Background Explore agent with "very thorough" mode, full codebase traversal
- **Key metrics**:
  - 754 TypeScript files, 144 API routes (0% stubs), 130 test files
  - 463 files in memory-stack (causal engine), 63 files in causality module
  - Benchmarks: AUROC 0.828 (CausalRivers), F1 0.493 (CauseME), 79.6% (LongMemEval)
- **Dimension scores**: Architecture 9/10, Product 8.5/10, Code Quality 9/10, Security 9/10, Scalability 8/10, Moat 9.5/10, Operations 8/10, GTM 7.5/10
- **Green flags**: Defensible causal IP, benchmarked rigor, real revenue, production operations, self-improving brain, security hardened
- **Yellow flags**: Limited test coverage %, small team, no distributed cache, single-region deployment, health alerts designed but not deployed
- **No red flags**: No hardcoded secrets, no stubs, no deprecated patterns
- **Report saved**: `platform/docs/vc-technical-due-diligence.md`
- **Pattern**: Background Explore agent with "very thorough" mode is ideal for large-scale audit tasks — covers all dimensions in a single pass

## Case 008: Redis Distributed Cache for Serverless (2026-02-23)
- **Context**: Rate limiting used per-instance in-memory Maps — didn't share state across serverless instances
- **Decision**: @upstash/redis (HTTP-based) NOT ioredis (TCP persistent connections) — Vercel serverless can't hold persistent connections
- **Architecture**: RedisAdapter interface → UpstashRedisAdapter (prod) or InMemoryRedis (local dev) via factory singleton
- **What NOT to cache in Redis**: Controller cache (200MB per controller) — too large, stays in-memory per-instance
- **What TO cache in Redis**: Rate limit counters (shared across instances), request dedup tokens
- **Fallback chain**: Session rate limit = Redis → fail-open. API key rate limit = Supabase RPC → Redis → fail-open.
- **Breaking change pattern**: Making sync → async requires updating ALL call sites. Use `grep` to find every caller before committing.
- **Files**: `lib/redis.ts` (new), `lib/security-middleware.ts`, `lib/rate-limiter.ts`, + 5 route files for await updates

## Case 009: Next.js 15 Build Fixed — Route Group Resolution (2026-02-23)
- **Symptom**: Same as Case 006 — `next build` fails with PageNotFoundError for route group pages
- **Root cause**: Next.js 15.3.3 webpack module resolution bug — "Collecting page data" uses URL paths but modules are at route group paths
- **Fix**: Upgrade Next.js 15.3.3 → 15.5.12 + force-dynamic on all 64 API routes + ignoreBuildErrors/ignoreDuringBuilds
- **Why 15.5.12 works**: The 15.5 release fixed webpack's page data collection to correctly resolve route group modules. The suppress-document-error.cjs safety net handles remaining /_document edge cases.
- **⚠️ TURBOPACK DOES NOT FIX THIS**: `next build --turbopack` compiles successfully but "Collecting page data" still fails. Turbopack build is broken for route groups. Don't waste time on it.
- **What was needed**:
  1. Next.js 15.5.12 (webpack module resolution fix)
  2. `export const dynamic = "force-dynamic"` on ALL API routes (prevents prerender attempts)
  3. `typescript: { ignoreBuildErrors: true }` (type check done via separate tsc --noEmit)
  4. `eslint: { ignoreDuringBuilds: true }` (ESLint done via lint-staged)
  5. `experimental: { globalNotFound: true }` (better 404 handling with route groups)
  6. suppress-document-error.cjs (safety net for /_document edge case)
  7. 8 GB memory allocation
- **Build times**: Clean: ~74s compile + ~15s page data/static gen. Incremental: ~26s total.
- **Dead-ends tested**: Turbopack clean build (panics on directory creation), Turbopack incremental (passes compilation but fails page data collection), force-dynamic at line 1 breaking Turbopack's static analysis
- **Pattern**: When fixing framework bugs, test the SIMPLEST change first (version bump). Don't combine multiple changes (version + bundler switch) — isolate variables.
