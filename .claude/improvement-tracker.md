# BrainOS Improvement Tracker

> Every fix, feature, and improvement tracked here with PR links.
> Updated after every merged PR. This is the living record of what we built and why.

---

## Tracking Rules
- Every change = a PR (no direct commits to main from G1 onwards)
- PR title format: `[Brain3/Brain4/Fix/Audit] short description`
- Each entry: what we fixed, why it matters, PR link, commit hash

---

## Brain 3.0 — Direct Commits (pre-PR workflow)

| # | Commit | What | Why it matters |
|---|--------|------|----------------|
| 1 | `c800d1442` | Health check inline Supabase client | Fixed production "No workspaces found" — Amplify SSM env var baked as literal `"undefined"` |
| 2 | `2a3ec36bb` | GABA stall signal -0.3 → -0.5 + planner config | Ambiguous signal threshold caused stuck domains to not be detected |
| 3 | `c38c3cf9c` | delivery-intelligence routing fix | Domain was silently routed to wrong handler — corrupted RL signals |
| 4 | `335097efe` | quality_score → confidence rename + extractProcessTemplates() | Wrong column name caused silent empty results in 3 federation files |
| 5 | `ecf784370` | Universal FSM capability | Any agent_type job can now opt into FSM execution via payload flag |
| 6 | `b00150576` | Service Health Table + L26/L27/L28 decoupling | Brain layers no longer query domain tables directly — services write to service_health, brain reads from it |

## Brain 3.0 — PRs (Phase 5-8)

| # | PR | Branch | What | Status |
|---|-----|--------|------|--------|
| 7 | TBD | `brain3/phase-5-rl-state-signals` | RL State-Level Signals — computeProcessQuality + per-state domain strings | 🔄 Building |
| 8 | TBD | `brain3/phase-6-process-memory` | Cognitive planner Phase 1g — process bottleneck learning from service_health | 🔄 Building |
| 9 | TBD | `brain3/phase-7-process-adaptation` | AlphaEvolve fitness scoring — process-evolver.ts | ⏳ Pending |
| 10 | TBD | `brain3/phase-8-predictive-intel` | Predictive escalation — process-predictor.ts + RLVR capstone | ⏳ Pending |

## Brain 4.0 — PRs (G1-G9)

| # | PR | Branch | What | Status |
|---|-----|--------|------|--------|
| 11 | TBD | `brain4/g1-3service-architecture` | Remove BPaaS silo + 3-service brain restructure | ⏳ Pending |
| 12 | TBD | `brain4/g2-federation-parity` | All 3 services federate (SE-aaS + AaaS + Process Engine) | ⏳ Pending |
| 13 | TBD | `brain4/g3-mutate-writeback` | MUTATE state wires FSM to writeback-dispatcher.ts | ⏳ Pending |
| 14 | TBD | `brain4/g4-agent-card-manifest` | Self-describing agent card via capabilities-manifest.json | ⏳ Pending |
| 15 | TBD | `brain4/g5-smart-router` | Smart router everywhere — no direct LLM calls bypassing orchestrator | ⏳ Pending |
| 16 | TBD | `brain4/g6-online-gradient-descent` | Full RL + online gradient descent at every FSM state | ⏳ Pending |
| 17 | TBD | `brain4/g7-schema-drift-resilience` | Schema drift resilience + context rot filter | ⏳ Pending |
| 18 | TBD | `brain4/g8-task-intent-classifier` | Task intent classifier (renamed from crm-classifier) + privacy firewall | ⏳ Pending |
| 19 | TBD | `brain4/g9-answer-format-token-budget` | Answer format discipline + token budget + context_id multi-turn | ⏳ Pending |

## Audit + Competition Hardening — PRs

| # | PR | Branch | What | Status |
|---|-----|--------|------|--------|
| 20 | TBD | `audit/round1-cto-architecture` | CTO architecture audit fixes | ⏳ Pending |
| 21 | TBD | `audit/round2-rl-quality` | RL learning quality fixes | ⏳ Pending |
| 22 | TBD | `audit/round3-fsm-capabilities` | FSM + capabilities audit fixes | ⏳ Pending |
| 23 | TBD | `audit/round4-staff-eng-review` | Staff engineer code review fixes | ⏳ Pending |
| 24 | TBD | `audit/round5-competition-readiness` | AgentX competition readiness | ⏳ Pending |

## A2A Benchmark Wrapper

| # | PR | Branch | What | Status |
|---|-----|--------|------|--------|
| 25 | TBD | `a2a/benchmark-wrapper` | A2A wrapper → green agent → AWS → benchmark results | ⏳ Pending |

---

## Key Metrics (update after each PR)

| Metric | Baseline | Current | Target |
|--------|----------|---------|--------|
| TypeScript errors | ? | 0 | 0 |
| RL signal coverage | ~40% (task-level only) | ~60% (state-level Phase 5) | 100% |
| FSM templates | 15 | 15 | 15 (all 10/10) |
| Brain layers (L1-L28) | 28 | 28 | 28 all populated |
| AgentX score | TBD | TBD | Top 10 |
| Stubs in codebase | TBD (audit running) | TBD | 0 |

---

## Why PRs Matter
- **Reviewability**: Every change has a diff — easy to catch regressions
- **Traceability**: PR description explains the WHY, not just the what
- **Rollback**: Bad PR can be reverted cleanly
- **Competition audit trail**: Judges can see the progression of intelligence improvements
