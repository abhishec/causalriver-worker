# BrainOS — Claude Code Instructions

## CRITICAL: Task Queue System

**DO NOT execute tasks directly.** This project uses a centralized command center.

When the user gives you a task:
1. Queue it by running:
   ```bash
   claude-queue add -q brainos "PASTE THE USER'S EXACT TASK HERE"
   ```
   For urgent tasks:
   ```bash
   claude-queue add -q brainos -p high "URGENT TASK HERE"
   ```
2. Tell the user: **"Task queued to BrainOS queue. Switch to your command center session to execute it."**
3. **DO NOT** edit any code, run builds, or make changes yourself.
4. **DO NOT** start working on the task — not even "let me take a look first".
5. **DO NOT** plan, research, or audit the codebase. Just queue and stop.

### Why?
Running multiple Claude sessions on the same codebase simultaneously causes:
- Merge conflicts between sessions editing the same files
- Build failures from incompatible changes
- Lost work from sessions overwriting each other

The command center session processes tasks sequentially with build checks between each.

### Queue Commands (reference)
```bash
cq add -q brainos "task description"     # Queue a BrainOS task
cq add -q brainos -p high "urgent task"  # Queue with high priority
cq add -q nexusos "task description"     # Queue a NexusOS task
cq list                                  # See all tasks (both queues)
cq list brainos                          # See BrainOS tasks only
cq status                                # Queue summary
cq kill-others                           # Kill all other Claude sessions
```

---

## Command Center Operating Rules

### Model Selection & Cost Optimization

**Default to the cheapest model that can handle the task.** Cost adds up fast — be aggressive about using Haiku.

#### When to use each model:

| Model | Cost | Use When | Examples |
|-------|------|----------|----------|
| **Haiku** | $$ | Single-file tasks, lookups, simple edits, queue ops, status checks, git operations, reading files, simple search | "Check build status", "Read this file", "Add a try/catch", "Queue this task", "What's in the case log?" |
| **Sonnet** | $$$$ | Multi-file features, standard implementation, code reviews, straightforward debugging | "Add email domain filter", "Write a new API route", "Fix this lint error", "Refactor component" |
| **Opus** | $$$$$$$$ | Cross-system debugging (3+ system boundaries), deep root-cause analysis, architectural decisions with long-term impact | "Why does Amplify Lambda not have env vars?", "Debug infinite RLS recursion", "Design the brain evolution system" |

#### Cost rules (MANDATORY):

1. **Subagents default to Haiku** unless the task requires multi-step reasoning or code generation
2. **Explore agents: ALWAYS Haiku** — they're just searching and reading files
3. **Bash agents: ALWAYS Haiku** — they're running commands
4. **Never use Opus for** git operations, file reads, simple edits, status checks, queue management, build monitoring
5. **Never use Sonnet for** tasks Haiku can handle (single-file edits, lookups, status reports)
6. **Escalate to Opus ONLY when** you've already tried with Sonnet and hit a wall, OR the task crosses 3+ system boundaries (e.g., Amplify + Next.js + Supabase + Lambda)
7. **When spawning parallel subagents**, use the cheapest model per agent based on that agent's specific task — don't use the same model for all of them

#### Cost tracking in retros:

Every retro entry MUST include:
- **Model used**: Which model, and was it the right choice?
- **Model correction**: If the wrong model was used, note what should have been used and WHY
- **Subagent models**: List models used for subagents — were any over-specified?
- **Cost assessment**: "Could this task have been done with a cheaper model?" (yes/no + explanation)

---

## Execution Discipline

### 1. Plan Node Default

**Every task with 3+ steps MUST start with a plan.** No exceptions.

Before writing any code:
1. Write a plan to the todo list with checkable items
2. Each item must be specific and testable (not "fix the bug" but "add try/catch to memberships query that handles missing allowed_email_domains column")
3. Identify which files will be touched — list them explicitly
4. Estimate time (compare against similar past tasks in `cc-retro.md`)
5. Flag risks: "What could go wrong? What's the blast radius?"

For tasks under 3 steps, skip planning and execute directly.

### 2. Subagent Orchestration

Use subagents (Task tool) to keep the main context window clean **and to save cost**:

| Subagent Type | Default Model | When to Use |
|---|---|---|
| **Explore** | **Haiku** | Codebase search, file discovery, architecture questions — use BEFORE planning |
| **Plan** | **Sonnet** | Complex architectural decisions with multiple approaches |
| **Bash** | **Haiku** | Git operations, CLI commands, builds |
| **general-purpose** | **Haiku** (upgrade to Sonnet only if task requires code generation or multi-step reasoning) | Multi-step research, searching for patterns across many files |

**Rules:**
- **Always specify `model: "haiku"` for Explore and Bash agents** — they don't need Sonnet/Opus for searching and running commands
- Launch parallel Explore agents for independent audit scopes (e.g., 3 agents: seed data, cron system, UI flows)
- Never do multi-file search in the main context — spawn an Explore agent (Haiku)
- Subagent results feed into the plan, not the other way around
- If a subagent finds a problem, bring it back to main context for decision-making
- **Cost check**: Before spawning a Sonnet subagent, ask "Could Haiku do this?" — if yes, use Haiku

### 3. Root Cause Mandate

**Never apply a temporary fix.** Always find and fix the root cause.

- If you catch yourself writing a workaround, STOP and ask: "Why does this fail in the first place?"
- Trace the chain: symptom → immediate cause → underlying cause → root cause
- Document the root cause chain in the commit message (see commit `a523629db` for example)
- If the root cause is in infrastructure (Amplify, Supabase, etc.), fix the config AND add code-level resilience

### 4. Blast Radius Minimization

Before making any change, ask: **"What's the smallest change that fixes this?"**

- Prefer adding a try/catch over refactoring the function
- Prefer IF EXISTS guards over assuming table state
- Prefer env var fallbacks over rewriting the config system
- Never touch files that aren't directly related to the fix
- If a fix touches more than 5 files, pause and reconsider the approach

### 5. Verification Before Done

**A task is NOT complete until you can prove it works.** No self-certifying.

Verification checklist (run ALL before marking done):
1. **TypeScript passes**: `npx tsc --noEmit` — zero errors
2. **Lint passes**: `npx next lint --max-warnings 50` — under threshold
3. **Build passes**: `pnpm build` or `pnpm turbo build --filter=platform`
4. **Behavior verified**: Check the actual output, not just the exit code
5. **Staff engineer gate**: "Would a staff engineer approve this PR?" If not, iterate.

For production fixes, additionally:
6. **Production health**: `curl https://platform.usebrainos.com/api/brain/health`
7. **Amplify deploy succeeds**: Check `aws amplify list-jobs` for SUCCEED status
8. **Diagnostic verification**: Hit the relevant endpoint to confirm the fix works

**NEVER mark a task complete if any check fails.** Create a follow-up task instead.

### 6. Autonomous Bug Fixing Protocol

When pointed at failing CI, error logs, or a bug report:

1. **Reproduce first** — confirm you can see the failure (don't trust descriptions alone)
2. **Read the full error** — stack trace, error code, timestamp, affected user/route
3. **Check case-log.md** — have we seen this before? Don't repeat failed fixes
4. **Diagnose before fixing** — use Explore agents, database queries, API calls to understand the state
5. **Fix the root cause** (see Rule 3)
6. **Verify the fix** (see Rule 5)
7. **Log the pattern** — update case-log.md with the new debugging pattern
8. **No hand-holding required** — don't ask the user "should I proceed?" when the next step is obvious. Just do it and report results.

---

## Debugging Protocol

1. **Test resource constraints FIRST** — memory (`--max-old-space-size`), disk space, file descriptors, CPU. These cause silent failures that mimic code bugs.
2. **Verify outputs, not just exit codes** — "Compiled successfully" can still produce incomplete artifacts. Always check manifests, bundles, generated files.
3. **3-attempt circuit breaker** — If the same class of fix fails 3 times, STOP. Step back, list all hypotheses, rank by likelihood, and test the simplest one first.
4. **Flag time sink early** — If 20+ minutes on the same issue with no progress, tell the user and propose a structured diagnostic plan before continuing.
5. **Check production state BEFORE writing migrations** — Always run `supabase migration list --linked` to see what tables/columns actually exist in production. Never assume.
6. **Supabase hosted gotchas** — pgcrypto is in `extensions` schema (`extensions.pgp_sym_encrypt`), ALTER DATABASE requires superuser (use config tables instead), RLS DDL must use IF EXISTS guards.
7. **Amplify SSR gotchas** — Server-only env vars (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) must be inlined via `next.config.ts env` property. Amplify Console env vars are build-time only, NOT available in Lambda runtime.

---

## Prompt Improvement

- Before executing a queued task, rewrite the prompt to be specific, actionable, and include acceptance criteria.
- After completing a task, note what the original prompt was missing that caused wasted effort.
- Log new patterns to `.claude/case-log.md` after every resolved debugging session.

---

## Continuous Learning (Reinforcement Loop)

Every CC session MUST follow this loop:

**On startup:**
1. Read `.claude/case-log.md` — absorb all past patterns and anti-patterns
2. Read `.claude/cc-retro.md` — check recent retrospectives for recurring issues

**Before each task:**
3. Check case log for similar past issues — don't repeat failed approaches
4. Rewrite the user's prompt into a specific, testable task with acceptance criteria
5. Select model (Opus/Sonnet/Haiku) based on task complexity

**After each task:**
6. **Log to case-log.md** if a new debugging pattern was discovered
7. **Log to cc-retro.md** with:
   - What went well (keep doing)
   - What went wrong (stop doing)
   - Time spent vs. estimated
   - **Model used** + was it the right one? (see Model Selection rules)
   - **Subagent models** — list each subagent spawned and its model. Flag any that were over-specified
   - **Cost assessment** — "Could this have been done cheaper?" (yes/no + what model should have been used)
   - What the prompt was missing
8. If a mistake was repeated from a past case, add a **bold warning** to the case log entry

**After ANY correction from the user:**
9. **Immediately update `.claude/case-log.md`** with the lesson learned
10. Tag it with `[USER CORRECTION]` so it gets priority attention on future reads
11. This is how the system compounds — mistake rate drops over time because we actively learn from feedback

---

## Project Structure

- **Monorepo**: pnpm workspaces + turborepo
- **Platform**: Next.js 15.3.3 (App Router) at `/platform`
- **Packages**: `@nexus-ai/memory-stack`, `@nexus-ai/domain-agents`, `@nexus-ai/openclaw-plugin`
- **Database**: Supabase (PostgreSQL + RLS + Edge Functions)
- **Build**: `pnpm turbo build --filter=platform`
- **Node linker**: hoisted (`node-linker=hoisted` in `.npmrc`)
- **Deploy**: AWS Amplify (auto-deploys from `main` branch)
- **CI**: GitHub Actions → lint + test + build + migrate → Amplify auto-deploy

## Key Conventions

- TypeScript strict mode
- Next.js App Router (all routes in `app/` directory, no Pages Router)
- Supabase RLS on all tables — every new table MUST have RLS policies
- `useSearchParams()`, `useParams()`, `usePathname()` return possibly null in Next.js 15 — always use optional chaining
- Console methods: only `console.warn` and `console.error` allowed (ESLint rule)
- Logger: use `import { logger } from "@/lib/logger"` for all logging
- API routes: always validate auth with `supabase.auth.getUser()` and scope queries to `organization_id`
- Migrations: add to `supabase/migrations/` with timestamp prefix `YYYYMMDDHHMMSS_description.sql`
- Every API route that queries optional tables/columns MUST have try/catch — never let a missing column crash the dashboard
- Server-only env vars accessed via `process.env` must have Amplify SSR fallback (see `lib/supabase/server.ts` pattern)

## Simplicity Principle

> "The best code is the code you don't write."

1. **Prefer standard library over dependencies** — Don't add a package for something `Array.prototype` can do
2. **Prefer configuration over code** — A migration is better than a custom migration runner
3. **Prefer deletion over deprecation** — Dead code is worse than no code
4. **Prefer inline over abstraction** — Don't create a util function that's used once
5. **Prefer explicit over clever** — A 5-line if/else is better than a 1-line ternary chain
