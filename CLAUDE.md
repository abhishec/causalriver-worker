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
