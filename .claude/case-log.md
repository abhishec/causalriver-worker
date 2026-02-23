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
