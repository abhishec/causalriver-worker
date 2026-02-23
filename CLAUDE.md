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

## Command Center Operating Rules

### Model Selection
- **Opus**: Complex debugging (framework internals, multi-file architectural issues, deep root-cause analysis)
- **Sonnet**: Standard implementation tasks, feature work, code reviews
- **Haiku**: Quick lookups, simple file reads, status checks, queue operations

### Debugging Protocol
1. **Test resource constraints FIRST** — memory (`--max-old-space-size`), disk space, file descriptors, CPU. These cause silent failures that mimic code bugs.
2. **Verify outputs, not just exit codes** — "Compiled successfully" can still produce incomplete artifacts. Always check manifests, bundles, generated files.
3. **3-attempt circuit breaker** — If the same class of fix fails 3 times, STOP. Step back, list all hypotheses, rank by likelihood, and test the simplest one first.
4. **Flag time sink early** — If 20+ minutes on the same issue with no progress, tell the user and propose a structured diagnostic plan before continuing.

### Prompt Improvement
- Before executing a queued task, rewrite the prompt to be specific, actionable, and include acceptance criteria.
- After completing a task, note what the original prompt was missing that caused wasted effort.
- Log new patterns to `.claude/case-log.md` after every resolved debugging session.

### Continuous Learning (Reinforcement Loop)

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
   - Whether the right model was used
   - What the prompt was missing
8. If a mistake was repeated from a past case, add a **bold warning** to the case log entry

## Project Structure

- **Monorepo**: pnpm workspaces + turborepo
- **Platform**: Next.js 15.3.3 (App Router) at `/platform`
- **Packages**: `@nexus-ai/memory-stack`, `@nexus-ai/domain-agents`, `@nexus-ai/openclaw-plugin`
- **Database**: Supabase (PostgreSQL + RLS + Edge Functions)
- **Build**: `pnpm turbo build --filter=platform`
- **Node linker**: hoisted (`node-linker=hoisted` in `.npmrc`)

## Key Conventions

- TypeScript strict mode
- Next.js App Router (all routes in `app/` directory, no Pages Router)
- Supabase RLS on all tables — every new table MUST have RLS policies
- `useSearchParams()`, `useParams()`, `usePathname()` return possibly null in Next.js 15 — always use optional chaining
- Console methods: only `console.warn` and `console.error` allowed (ESLint rule)
- Logger: use `import { logger } from "@/lib/logger"` for all logging
- API routes: always validate auth with `supabase.auth.getUser()` and scope queries to `organization_id`
- Migrations: add to `supabase/migrations/` with timestamp prefix `YYYYMMDDHHMMSS_description.sql`
