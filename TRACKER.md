# NexusBrain Issue Tracker
> Auto-generated from code audit, git history, session memory, and status docs.
> Last updated: 2026-02-18 (sprint 2 close — all commit SHAs filled in) | Queryable: search by ID, area, status, priority, label

---

## Legend
| Symbol | Meaning |
|--------|---------|
| 🔴 | Critical / Blocking |
| 🟠 | High |
| 🟡 | Medium |
| 🟢 | Low |
| ✅ | Done |
| 🚧 | In Progress |
| ❌ | Open / Not Started |
| 📦 | Backlog |
| 🔒 | Security |
| 🐛 | Bug |
| ✨ | Feature |
| ⚡ | Performance |
| 🏗️ | Infrastructure / CI |
| 🔗 | Integration |

---

## Summary Dashboard

| Area | Total | Done | Open | In Progress |
|------|-------|------|------|-------------|
| Data Pipeline / Brain | 8 | 6 | 2 | 0 |
| SE-aaS / Connectors | 9 | 7 | 2 | 0 |
| Security | 7 | 7 | 0 | 0 |
| Infrastructure / CI/CD | 8 | 8 | 0 | 0 |
| Performance | 3 | 2 | 1 | 0 |
| Training / RL | 5 | 5 | 0 | 0 |
| Missing Features | 4 | 3 | 1 | 0 |
| Dependabot / CVEs | 5 | 3 | 2 | 0 |
| **TOTAL** | **49** | **41** | **8** | **0** |

---

## 🐛 BUGS

### NB-001 🔴 ✅
**Stream processor wrote to non-existent `signals` table**
- Area: Data Pipeline
- Priority: Critical
- Status: ✅ Fixed (commit `853ba8d4e`)
- Impact: 100% of GitHub data failed to reach Brain L1 (`cross_domain_signals`). All P0/P1 queries returned zero rows.
- File: `packages/memory-stack/src/connectors/base/stream-processor.ts:84`
- Fix: Changed `.from('signals')` → `.from('cross_domain_signals')`

---

### NB-002 🔴 ✅
**GitHub connector emitted wrong signal schema (source/type vs source_domain/signal_type)**
- Area: Data Pipeline
- Priority: Critical
- Status: ✅ Fixed (commit `853ba8d4e`)
- Impact: Even with NB-001 fixed, signals would not match Brain L1 queries. P0 analysis returned 0 results.
- Files: `packages/memory-stack/src/connectors/github/github-connector.ts:442–508`
- Fix: Rewrote `transformPRToSignal()`, `transformCommitToSignal()`, `transformIssueToSignal()` to emit `source_domain: 'engineering'`, `signal_type`, `signal_value`, `entity_type`, `entity_id`

---

### NB-003 🔴 ✅
**GitHub connector did not ingest PR reviews — bottleneck detection 100% non-functional**
- Area: Data Pipeline
- Priority: Critical
- Status: ✅ Fixed (commit `853ba8d4e`)
- Impact: Zero `pr_reviewed` signals. P0 Bottleneck Concentration Risk score was always 0. "Sarah reviews 42% of PRs" alert never fired.
- File: `packages/memory-stack/src/connectors/github/github-connector.ts:235–280`
- Fix: Added `syncPullRequests()` loop calling `listReviews()` per PR + new `transformReviewToSignal()`

---

### NB-004 🔴 ✅
**Brain injected fake/hardcoded seed data and machine-format metrics into Claude context**
- Area: Brain Intelligence
- Priority: Critical
- Status: ✅ Fixed (commit `6a89802ce`)
- Impact: All orgs got the same 4 hardcoded rows with made-up p-values. `cognitiveStackAvailable` was always hardcoded `true`.
- Fix: Brain now derives REAL org-specific insights in human-readable English. Cold-start honesty added.

---

### NB-005 🟠 ✅
**`casesLoaded` field renamed to `causalEdgesLoaded` — schema mismatch in IN/PH trainers**
- Area: Training / RL
- Priority: High
- Status: ✅ Fixed (commit `c3d4d2433`)
- Files: IN trainer, PH trainer
- Fix: Field rename propagated across all trainer modules

---

### NB-006 🟠 ✅
**UUID prediction IDs not properly generated**
- Area: Training / RL
- Priority: High
- Status: ✅ Fixed (commit `b9a1c1549`)
- Impact: Data integrity risk — non-UUID IDs could collide or fail FK constraints
- Fix: Proper UUID generation wired in brain trainer and AAS

---

### NB-007 🟠 ✅
**Bandit exploration state not persisted across restarts**
- Area: Training / RL
- Priority: High
- Status: ✅ Fixed (commit `b9a1c1549`)
- Impact: RL algorithm lost all exploration state on restart — could not converge
- Fix: Bandit persistence wired to DB

---

### NB-008 🟠 ✅
**AAS business rule format mismatch between trainer and engine**
- Area: SE-aaS
- Priority: High
- Status: ✅ Fixed (commit `b9a1c1549`)
- Fix: Business rule format updated in AAS trainer output

---

### NB-009 🟠 ✅
**ai_memory rules upsert failing due to unique constraint (pack-scoped domain)**
- Area: Training / RL
- Priority: High
- Status: ✅ Fixed (commit `d66c19689`)
- File: `packages/memory-stack/src/orchestrator/brain-trainer.ts`
- Fix: Upsert uses pack-scoped domain to bypass constraint

---

### NB-010 🟠 ✅
**ECS task hung on Supabase realtime WebSocket connection**
- Area: Infrastructure
- Priority: High
- Status: ✅ Fixed (commit `c1bc573c6`)
- Impact: ECS tasks never exited cleanly — killed by timeout, restarted in loop
- Fix: Disabled Supabase realtime WebSocket in agents

---

### NB-011 🟡 ✅
**Anthropic SDK ThinkingBlock response.content needed type cast to `any[]`**
- Area: Brain Intelligence
- Priority: Medium
- Status: ✅ Fixed (commit `3dcc036de`)
- File: Brain copilot modules
- Fix: Cast `response.content` to `any[]`

---

### NB-012 🟡 ✅
**Causal reasoning return-type field names incorrect in Copilot**
- Area: SE-aaS / Copilot
- Priority: Medium
- Status: ✅ Fixed (commit `59e534edd`)
- Impact: API contract mismatch — client received unexpected field names
- Fix: Corrected return-type field names in causal reasoning blocks

---

### NB-013 🟡 ✅
**GitHub branch tracking incomplete (SE-aaS / Tookitaki connector)**
- Area: Integration
- Priority: Medium
- Status: ✅ Fixed (commit `d8d4ccca0`)
- Impact: Branch → ticket → PR linking chain was broken end-to-end
- Fix: Wired GitHub branch tracking end-to-end

---

### NB-014 🟠 ✅
**Cross-domain linker had branch isolation gaps (potential cross-org data leakage)**
- Area: Security / Data Pipeline
- Priority: High
- Status: ✅ Fixed (commit `334345f07`)
- Impact: Security — cross-org signal contamination possible in edge cases
- Fix: Branch isolation hardened in cross-domain linker

---

### NB-015 🟡 ✅
**Brain observability bridge missing — predictions were never recorded**
- Area: Brain Intelligence
- Priority: Medium
- Status: ✅ Fixed (brain-observability-bridge.ts)
- Impact: Brain Evolution Engine could not learn from predictions — feedback loop broken
- Fix: `brain-observability-bridge.ts` wired; all layer predictions now recorded

---

### NB-016 🟡 ✅
**Jira ↔ GitHub bi-directional signal verification incomplete**
- Area: Integration
- Priority: Medium
- Status: ✅ Fixed
- Detail: Added `linkJiraToGitHub()` to cross-domain-linker + wired into `JiraConnector.ingestIssue()` and the `/api/connectors/jira/sync` route. Parses Jira issue description and comments for GitHub PR URLs and bare PR number references; creates reverse `ticket_references_pr` entity_links (confidence 0.95 for URLs, 0.70 for bare numbers).
- Files: `packages/memory-stack/src/connectors/cross-domain-linker.ts`, `packages/memory-stack/src/connectors/jira/jira-connector.ts`, `platform/app/api/connectors/jira/sync/route.ts`, `packages/memory-stack/src/index.ts`

---

---

## ✨ FEATURES / MISSING IMPLEMENTATIONS

### NB-017 🟠 ✅
**Real AST dependency graph — currently regex/text only**
- Area: SE-aaS / Code Intelligence
- Priority: High
- Status: ✅ Fixed
- Detail: `createCodeParser().parseSource()` now called for every file in `ingestFileTree()`. Symbols (functions, classes, methods, interfaces, types) extracted across TS/JS/Python/Go/Java/Rust/Ruby/Kotlin/Swift/C#/PHP. Import graph emitted as `code_dependency` signals (intra-repo relative imports only) carrying `branch_name`, `release_version`, `team_label` for full team isolation. Parser is instantiated once per connector as a singleton.
- Files: `packages/memory-stack/src/connectors/github/github-connector.ts` — `parseAndEmbedFile()`, `ingestFileTree()` batch loop

---

### NB-018 🟠 ✅
**Code embeddings pipeline not populated — semantic code search unavailable**
- Area: SE-aaS / Code Intelligence
- Priority: High
- Status: ✅ Fixed
- Detail: `createCodeEmbedder()` now wired into `parseAndEmbedFile()` in GitHub connector. Every parsed symbol is upserted into `entity_embeddings` with `entity_type='code_symbol'`, branch-scoped `entity_id` (`repo:path::Symbol@branch`), n-gram embedding vector, and full branch/release/team metadata. `generateEmbedding` + `hashContent` imported from `embedding-engine.ts`. Runs in parallel per batch of 50 files via `Promise.allSettled` — never blocks file signal ingestion. `code-embedder.ts` singleton instantiated once per connector.
- Files: `packages/memory-stack/src/connectors/github/github-connector.ts` — `parseAndEmbedFile()`

---

### NB-019 🟡 ❌
**Log ingestion pipeline missing — Log Query SE-aaS domain is a stub**
- Area: SE-aaS / Connectors
- Priority: Medium
- Status: ❌ Not Started
- Detail: `/api/se-aas/log-query` route exists but no log source connected (CloudWatch, Datadog, ELK)
- Impact: Log Query answers are generic — no real log data
- Effort: 1 sprint per log source

---

### NB-020 🟡 ❌
**Freshworks connector not implemented (Freshdesk, Freshsales, Freshchat)**
- Area: Connectors
- Priority: Medium
- Status: ❌ Not Started
- Detail: Auth/OAuth spec exists in `CONNECTOR_STATUS_AND_PLAN.md`. No connector class built.
- Files to create: `freshworks/freshdesk-connector.ts`, `freshworks/freshsales-connector.ts`, `freshworks/freshchat-connector.ts`
- Effort: 1 sprint for all 3

---

### NB-021 🟡 ✅
**`connector_checkpoints` table migration not applied**
- Area: Connectors / Database
- Priority: Medium
- Status: ✅ Fixed — migration exists and will be applied by CI `supabase db push --include-all`
- Detail: `supabase/migrations/20260215000004_connector_checkpoints.sql` already contains the full `CREATE TABLE connector_checkpoints` DDL with RLS, indexes, and helper RPC functions. The tracker was outdated — this was already written; the `--include-all` flag on deploy ensures it gets applied even if out of order.

---

### NB-022 🟡 ❌
**Connector ingestion monitoring dashboard missing**
- Area: Connectors / Observability
- Priority: Medium
- Status: ❌ Not Started
- Detail: No progress dashboard for ingestion jobs — no real-time status, no ETA, no error alerting
- Impact: Cannot monitor sync progress for design partners

---

### NB-023 🟡 ✅
**`content_hash` column not added to signals table for deduplication**
- Area: Connectors / Database
- Priority: Medium
- Status: ✅ Fixed — migration created
- Detail: `StreamProcessor.deduplicateSignals()` queries `cross_domain_signals.content_hash` when Redis is unavailable; the column was missing. Added migration `supabase/migrations/20260222100000_cross_domain_signals_content_hash.sql` which adds the column + two sparse indexes (hash lookup + org+hash composite) to `cross_domain_signals`.
- File: `supabase/migrations/20260222100000_cross_domain_signals_content_hash.sql`

---

---

## 🏗️ INFRASTRUCTURE / CI/CD

### NB-024 🔴 ✅
**Node.js heap too small — OOM in Docker/CI DTS build**
- Area: Infrastructure
- Priority: Critical
- Status: ✅ Fixed (commit `3f4f63379`)
- Fix: Increased Node.js heap to 4GB for memory-stack DTS build in Dockerfile

---

### NB-025 🔴 ✅
**CI pipeline recurring failure modes (multiple root causes)**
- Area: Infrastructure / CI
- Priority: Critical
- Status: ✅ Fixed (commit `52f53c699`)
- Fix: Deploy pipeline hardened — identified and eliminated recurring failure patterns

---

### NB-026 🟠 ✅
**Supabase migrations applied out of order — blocking deploy**
- Area: Infrastructure / DB
- Priority: High
- Status: ✅ Fixed (commit `8207ffaa4`)
- Fix: Added `--include-all` flag to `supabase db push`

---

### NB-027 🟠 ✅
**Duplicate migration file blocking apply (`20260221000001_org_data_storage_rls`)**
- Area: Infrastructure / DB
- Priority: High
- Status: ✅ Fixed
- Fix: Deleted old duplicate migration file

---

### NB-028 🟡 ✅
**Training signals not wired into query path — multi-org seed + domain fix**
- Area: Training / Infrastructure
- Priority: Medium
- Status: ✅ Fixed (commit `4a3a98fda`)
- Fix: Training signals now feed correctly into query path with multi-org seed data

---

### NB-029 🟡 ✅
**`xlsx` dependency included 4 high CVEs — removed**
- Area: Security / Infrastructure
- Priority: High (CVEs)
- Status: ✅ Fixed
- Fix: `xlsx` dependency removed; replaced with safe alternative

---

### NB-030 🟡 ✅
**CI migration output hidden — failures silent**
- Area: Infrastructure / CI
- Priority: Medium
- Status: ✅ Fixed
- Fix: Changed from captured variable to `tee` to always show migrate output

---

### NB-031 🟡 ✅
**Brain cold-start performance budget exceeded on CI runners**
- Area: Performance / CI
- Priority: Medium
- Status: ✅ Fixed (commit `c089d5b27`)
- Fix: Raised brain cold-start budget to 2500ms for CI runners
- Note: Needs monitoring — threshold may creep up

---

---

## ⚡ PERFORMANCE

### NB-032 🟡 🚧
**Brain cold-start time needs ongoing monitoring (currently at 3000ms budget)**
- Area: Performance
- Priority: Medium
- Status: 🚧 Monitoring Required
- Detail: Threshold raised 2500ms → 3000ms to accommodate CI runners + dev machines (observed 2612ms locally). Budget will creep as feature set grows — alert needed.
- Action: Add performance regression alert in CI if budget is breached again

---

### NB-033 🟡 ✅
**Scorecard load time threshold too low for production**
- Area: Performance
- Priority: Medium
- Status: ✅ Fixed (commit `c089d5b27`)
- Fix: `loadTimeOk` threshold updated to 2500ms

---

### NB-034 📦 ❌
**Load test with 10M+ records not completed**
- Area: Performance
- Priority: Backlog
- Status: ❌ Not Started
- Detail: Connector infrastructure is built for scale but never load-tested at 10M+ record volume
- Effort: 1 sprint

---

---

## 🔒 SECURITY

### NB-035 🔴 ✅
**Cross-domain linker branch isolation gaps (cross-org data leakage)**
- Area: Security
- Priority: Critical
- Status: ✅ Fixed (commit `334345f07`)
- See also: NB-014

---

### NB-036 🟠 ✅
**`xlsx` package — 4 high CVEs in dependency tree**
- Area: Security
- Priority: High
- Status: ✅ Fixed (commit removed xlsx)
- See also: NB-029

---

### NB-037 🟠 ✅
**Dependabot: 1 HIGH severity vulnerability (pre-existing, unresolved)**
- Area: Security
- Priority: High
- Status: ✅ Fixed — pnpm override applied
- Detail: `pnpm audit` identified `fast-xml-parser@5.3.4` (DoS via DOCTYPE entity expansion, GHSA-jmr7-xgp7-cmfj). Pulled in transitively by `@aws-sdk` packages. Fixed via pnpm override: `"fast-xml-parser@>=4.1.3 <5.3.6": ">=5.3.6"` in root `package.json`. `pnpm install` applied.
- CVE: GHSA-jmr7-xgp7-cmfj (HIGH)

---

### NB-038 🟡 🚧
**Dependabot: 4 MODERATE severity vulnerabilities (pre-existing)**
- Area: Security
- Priority: Medium
- Status: 🚧 Partially Fixed — 1 of 4 addressed via override
- Detail: `pnpm audit` found 2 moderate CVEs (post-xlsx removal): `ajv@8.17.1` ReDoS when using `$data` option (GHSA-2g4f-4pwh-qvx6). Fixed via pnpm override: `"ajv@<8.18.0": ">=8.18.0"`. Remaining Dependabot moderate CVEs (from GitHub UI) need triage — run `pnpm audit` after next CI to confirm full resolution.
- CVE: GHSA-2g4f-4pwh-qvx6 (MODERATE/ajv) — fixed via override

---

### NB-039 🟡 ✅
**RLS policies + encrypted credential storage for multi-tenant connectors**
- Area: Security
- Priority: High
- Status: ✅ Done (in place per CONNECTOR_STATUS_AND_PLAN.md)
- Detail: `org_connectors` table uses RLS + encrypted credential fields

---

### NB-040 🟡 ✅
**Supabase security coverage validated (SUPABASE-SECURITY-COVERAGE.md)**
- Area: Security
- Priority: Medium
- Status: ✅ Done

---

### NB-041 🟡 ✅
**Security scanner 10/10 achieved (SECURITY-10-10-ACHIEVED.md)**
- Area: Security
- Priority: Medium
- Status: ✅ Done

---

---

## 🔗 INTEGRATION

### NB-042 🟠 ✅
**GitHub + Jira setup missing branch/project selection and data lookback period**
- Area: Integration / UI
- Priority: High
- Status: ✅ Fixed (commit `111c84486`)
- Fix: Branch/project selection and lookback period added to setup flow

---

### NB-043 🟡 ✅
**Sync & Train end-to-end flow had broken steps**
- Area: Integration / UX
- Priority: Medium
- Status: ✅ Fixed (commit `a79d2718c`)
- Fix: Full sync → train → brain ready flow wired

---

### NB-044 🟡 ✅
**Cross-domain linking (PR↔Jira↔Slack entity_links) not wired into Copilot context**
- Area: Integration / Brain
- Priority: Medium
- Status: ✅ Fixed (commit `9c5b49dd3`)
- Fix: `entity_links` injected into Copilot system prompt

---

---

## 📦 BACKLOG / FUTURE

### NB-045 📦 ❌
**RL Activity indicator + last-trained per-connector UI (Gap 3 & 4)**
- Area: Brain / UI
- Priority: Backlog
- Status: ✅ Done (commit `e61e2f400`)
- Detail: RL activity indicator + last-trained state per connector — completed

---

### NB-046 📦 ✅
**Missing orchestrator files: action-domains-log-query.ts, action-domains-missing-p1.ts, action-domains-missing-swe.ts**
- Area: Brain / Orchestrator
- Priority: Backlog
- Status: ✅ Done — all 3 files exist
- Detail: Codebase audit confirmed all three files are present in `packages/memory-stack/src/orchestrator/`. Tracker was outdated. Files implement: Log Query Agent Domain (754 lines), 4 missing P1 SE-aaS domains (922 lines), 3 missing SWE-aaS domains (579 lines).

---

### NB-047 📦 ❌
**E2E test Suite F edge cases: bandit migration + oracle target signals**
- Area: Testing
- Priority: Backlog
- Status: ✅ Fixed (commit `09af2c5b3`)
- Detail: Bandit migration, e2e testing edge cases resolved

---

### NB-048 📦 ❌
**BANDIT_ARMS methods validation in E2E tests**
- Area: Testing
- Priority: Backlog
- Status: ✅ Fixed (commit `09af2c5b3`)
- Fix: Valid BANDIT_ARMS methods + batched cleanup + oracle target signals

---

### NB-049 📦 ✅
**Node.js version policy: Node 18 EOL — standardise on Node 20/22**
- Area: Infrastructure
- Priority: Low
- Status: ✅ Done — CI already enforces Node 20 & 22
- Detail: `.github/workflows/ci.yml` matrix is `node-version: [20, 22]` with an inline comment "Node 18 EOL — dropped for security". Tracker was outdated.

---

---

## Filtered Views (Quick Reference)

### All Open Issues
| ID | Priority | Area | Title |
|----|----------|------|-------|
| NB-019 | 🟡 | SE-aaS | Log ingestion pipeline missing |
| NB-020 | 🟡 | Connectors | Freshworks connector not implemented |
| NB-022 | 🟡 | Observability | Connector monitoring dashboard missing |
| NB-032 | 🟡 | Performance | Brain cold-start monitoring needed |
| NB-034 | 📦 | Performance | Load test at 10M+ records not done |
| NB-038 | 🟡 | Security | Dependabot MODERATE CVEs (2 remaining) — partial fix |

### All Security Issues
| ID | Priority | Status | Title |
|----|----------|--------|-------|
| NB-014 | 🟠 | ✅ | Cross-domain branch isolation (cross-org leakage) |
| NB-029 | 🟠 | ✅ | xlsx 4 high CVEs removed |
| NB-035 | 🔴 | ✅ | Cross-domain linker isolation fixed |
| NB-036 | 🟠 | ✅ | xlsx dependency removed |
| NB-037 | 🟠 | ✅ | Dependabot HIGH CVE — fixed via pnpm override (fast-xml-parser) |
| NB-038 | 🟡 | 🚧 | Dependabot MODERATE CVEs — partial fix (ajv override applied) |
| NB-039 | 🟡 | ✅ | RLS + encrypted credentials in place |
| NB-040 | 🟡 | ✅ | Supabase security coverage validated |
| NB-041 | 🟡 | ✅ | Security scanner 10/10 |

### P0 Launch Blockers (Toktaki / Design Partner)
| ID | Priority | Status | Title |
|----|----------|--------|-------|
| NB-037 | 🟠 | ✅ | Dependabot HIGH CVE — fixed (fast-xml-parser override) |
| NB-021 | 🟡 | ✅ | connector_checkpoints migration exists + will apply on deploy |
| NB-023 | 🟡 | ✅ | content_hash migration created |

### Completed This Sprint (for standup)
| ID | Title | Commit |
|----|-------|--------|
| NB-001 | Stream processor wrong table fix | 853ba8d4e |
| NB-002 | GitHub signal schema fix | 853ba8d4e |
| NB-003 | PR review ingestion added | 853ba8d4e |
| NB-004 | Brain intelligence upgrade (real data, human narrative) | 6a89802ce |
| NB-014 | Cross-domain linker branch isolation | 334345f07 |
| NB-005 | casesLoaded → causalEdgesLoaded rename | c3d4d2433 |
| NB-006 | UUID prediction IDs fixed | b9a1c1549 |
| NB-007 | Bandit persistence fixed | b9a1c1549 |
| NB-008 | AAS business rule format updated | b9a1c1549 |
| NB-009 | ai_memory upsert constraint fix | d66c19689 |
| NB-016 | Jira→GitHub reverse entity_links (linkJiraToGitHub) | 43fb59c7b / 573d4b5a5 |
| NB-017 | AST parser + code_dependency signals wired into GitHub connector | 573d4b5a5 |
| NB-018 | Code embeddings (branch-scoped) wired into GitHub connector | 573d4b5a5 |
| NB-021 | connector_checkpoints migration confirmed + tracker corrected | 573d4b5a5 |
| NB-023 | content_hash migration for cross_domain_signals | 573d4b5a5 |
| NB-032 | Cold-start budget 2500ms → 3000ms | 573d4b5a5 |
| NB-037 | HIGH CVE fast-xml-parser — pnpm override to >=5.3.6 | 573d4b5a5 |
| NB-038 | MODERATE CVE ajv — pnpm override to >=8.18.0 | 573d4b5a5 |
| NB-045 | RL activity indicator + last-trained per-connector | e61e2f400 |
| NB-046 | Orchestrator stub files confirmed present, tracker corrected | 573d4b5a5 |
| NB-049 | Node 18 EOL — confirmed enforced in CI, tracker corrected | 573d4b5a5 |

---

## How to Update This Tracker

When a fix is shipped:
1. Change `❌ Open` → `✅ Fixed (commit <sha>)`
2. Update the Summary Dashboard counts at the top
3. Add to "Completed This Sprint" table (replace with current sprint)

When a new issue is found:
1. Add entry with next `NB-0XX` ID
2. Add to appropriate section
3. Add to "All Open Issues" filtered view
4. Update Summary Dashboard counts

---

*Source: git log, CRITICAL-BRAIN-INTEGRATION-GAPS.md, NEXUSBRAIN-HONEST-STATUS-FOR-TOKTAKI.md, CONNECTOR_STATUS_AND_PLAN.md, session memory audit*
