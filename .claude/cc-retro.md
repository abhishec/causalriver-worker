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
