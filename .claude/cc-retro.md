# Command Center Retrospectives

> Updated after every task. Read on startup to avoid repeating mistakes.

---

## Retro 001: Fix next build failure (2026-02-23)
- **Task**: `04ef5b72` — Fix pre-existing /_document build failure
- **Time**: ~3 hours across 3 sessions (should have been ~45 min)
- **Model used**: Sonnet (should have been Opus for deep Next.js internals)
- **What went well**:
  - Eventually found the true root cause (OOM, not code)
  - Created a robust 3-part fix that handles all edge cases
  - Good documentation in build.sh comments
- **What went wrong**:
  - Spent ~2 hours on code-level workarounds before testing memory
  - Created/deleted pages/_document.tsx (wasted iteration)
  - Patched process.exit before trying the cleaner process.on approach
  - Hid .env.local with dummy vars — caused a different failure
  - Didn't flag to user that I was going in circles
- **Prompt was missing**: "Check resource constraints (memory, disk) first before debugging code"
- **Rule added**: Debugging Protocol #1 — test resource constraints FIRST
- **Model correction**: Should have used Opus once the debugging went past the second failed attempt

## Retro 002: Debug ANTHROPIC_API_KEY undefined (2026-02-23)
- **Task**: `349236ad` — Debug and fix ANTHROPIC_API_KEY returns undefined in /api routes
- **Time**: ~15 min (estimated 15 min — on target)
- **Model used**: Sonnet (correct — straightforward env var debugging)
- **What went well**:
  - Applied debugging protocol: checked environment (`env | grep ANTHROPIC`) early
  - Found root cause in 3 steps: explore → test dotenv with debug → check shell env
  - Fixed all 3 dev scripts (dev-watchdog.mjs, dev.mjs, doctor.mjs) comprehensively
  - Verified fix works end-to-end (health endpoint returns healthy)
- **What went wrong**: Nothing significant
- **Prompt was missing**: Original prompt didn't mention shell env shadowing — but the debugging protocol caught it
- **RL improvement**: The debugging protocol from Retro 001 paid off — checking environment first saved hours
