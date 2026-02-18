# Tookitaki Design Partner — Setup Checklist

> **Purpose:** This checklist must be completed before Tookitaki can generate
> real SE-AAS signals. Until all items are checked, SE-AAS runs on synthetic/OSS
> data only — not Tookitaki's actual code.

---

## Architecture Decision (Resolved)

| Question | Decision | Rationale |
|---|---|---|
| 1 org or 2? | **2 separate workspace-orgs** | 5.11.x enterprise has different velocity, QA gates, and customer constraints from 6.x main. Mixing their signals would pollute both causal graphs. |
| How linked? | **`customer_id` parent** | Both orgs share a `customers` row (Tookitaki) for billing/reporting. No brain state is shared. |
| Federated learning? | **Independent to CORE** | Each org promotes its own deltas to CORE separately. They never share data directly. |

**Org IDs (stable, hardcoded):**

| Workspace | Org ID | Team | Branch | Target |
|---|---|---|---|---|
| 6.x Main Track | `b1000000-0000-4000-a000-000000000001` | Bao / Ravi | `release/6.3.4` | Apr 7 2026 |
| 5.11.x Enterprise | `b2000000-0000-4000-a000-000000000001` | Sandeep / Doan | `release/5.11.5-enterprise` | Feb 26 / Mar 15 2026 |
| Customer (parent) | `a1000000-0000-4000-a000-000000000001` | — | — | — |

---

## Checklist

### Phase 0 — Information Needed from Tookitaki
*These are blockers. Nothing else can proceed without them.*

- [ ] **GitHub repo slug** — e.g. `tookitaki/aml-engine`
  - Is 6.3.4 and 5.11.5-enterprise in the **same repo** (different branches) or different repos?
  - _Answer:_ ______________________

- [ ] **GitHub PAT** — Personal Access Token with `repo` (read) scope
  - Who provides this? (Bao? Ravi? Their DevOps lead?)
  - _Token holder:_ ______________________ _Token provided:_ ☐

- [ ] **Jira project key** — e.g. `TM`, `TKIT`
  - _Answer:_ ______________________

- [ ] **Jira base URL** — e.g. `https://tookitaki.atlassian.net`
  - _Answer:_ ______________________

- [ ] **Jira API token** — from https://id.atlassian.com/manage-profile/security/api-tokens
  - _Token holder:_ ______________________ _Token provided:_ ☐

- [ ] **Team member GitHub logins** (for team velocity tracking)
  - Team 634 (Bao/Ravi): ______________________
  - Team 5115 (Sandeep/Doan): ______________________

- [ ] **Jira fixVersion names** — confirm the exact strings:
  - 6.3.4 release fixVersion: ______________________
  - 5.11.5 enterprise fixVersion: ______________________

---

### Phase 1 — Infrastructure (NexusBrain team)

- [ ] **Run migration** `20260223000001_customers_and_workspaces.sql`
  - Adds `customers` table + `customer_id` column to `organizations`
  - Seeds Tookitaki customer row (`id=a1000000-...`)
  - _Run by:_ ______________________ _Date:_ ______________________

- [ ] **Fill in constants** in `scripts/agents/register-design-partner-tookitaki.ts`
  - `TOOKITAKI_GITHUB_REPO`
  - `TOOKITAKI_GITHUB_TOKEN`
  - `TOOKITAKI_JIRA_BASE_URL`
  - `TOOKITAKI_JIRA_EMAIL`
  - `TOOKITAKI_JIRA_API_TOKEN`
  - `TOOKITAKI_JIRA_PROJECT_KEY`

- [ ] **Dry run** — verify output looks correct, no errors
  ```bash
  npx tsx scripts/agents/register-design-partner-tookitaki.ts --dry-run
  ```

- [ ] **Live run** — provisions orgs, registers connectors, registers releases
  ```bash
  npx tsx scripts/agents/register-design-partner-tookitaki.ts
  ```
  - _Run by:_ ______________________ _Date:_ ______________________
  - _Output — Org IDs confirmed:_ ☐

---

### Phase 2 — Signal Verification (NexusBrain team)

- [ ] **Trigger initial GitHub sync** for both orgs
  - Go to: Admin → Connectors → GitHub → "Sync Now"
  - Do this for org `b1000000-...` (634) AND `b2000000-...` (5115)

- [ ] **Verify signals in Supabase** — run this query for each org:
  ```sql
  SELECT signal_type, branch_name, team_label, COUNT(*)
  FROM cross_domain_signals
  WHERE organization_id = 'b1000000-0000-4000-a000-000000000001'  -- 634
  GROUP BY signal_type, branch_name, team_label
  ORDER BY count DESC
  LIMIT 20;
  ```
  - Team 634 signals present: ☐
  - Team 5115 signals present: ☐

- [ ] **Verify release entities registered**
  ```sql
  SELECT id, release_name, branch_name, team_label, status
  FROM release_entities
  WHERE organization_id IN (
    'b1000000-0000-4000-a000-000000000001',
    'b2000000-0000-4000-a000-000000000001'
  );
  ```
  - 6.3.4 release registered: ☐
  - 5.11.5-enterprise release registered: ☐

- [ ] **Test one SE-AAS domain per org**
  - Run `pr-review` or `impact-analysis` via Copilot for each org
  - Confirm response references real PRs/commits (not synthetic data)
  - Team 634 SE-AAS working on real data: ☐
  - Team 5115 SE-AAS working on real data: ☐

---

### Phase 3 — Design Partner Handoff (NexusBrain + Tookitaki)

- [ ] **Share Copilot access** with Bao/Ravi team
  - Create user accounts → add to org `b1000000-...` as `member`

- [ ] **Share Copilot access** with Sandeep/Doan team
  - Create user accounts → add to org `b2000000-...` as `member`

- [ ] **Walkthrough session** — show each team:
  - Branch selector (NB-053): switching between `release/6.3.4` and `release/6.3.3`
  - SE-AAS domains: PR review, impact analysis, release readiness
  - Early warning: velocity collapse + bottleneck detection

- [ ] **Record `onboarded_at`** in customers table:
  ```sql
  UPDATE customers
  SET onboarded_at = NOW()
  WHERE id = 'a1000000-0000-4000-a000-000000000001';
  ```

---

## Branch Specificity Reference

| Field | Team 634 (Bao/Ravi) | Team 5115 (Sandeep/Doan) |
|---|---|---|
| Release | 6.3.4 | 5.11.5-enterprise |
| Branch | `release/6.3.4` | `release/5.11.5-enterprise` |
| Base branch | `release/6.3.3` | `release/5.11.4.3` |
| Base released | Feb 6 2026 (final drop Feb 20) | — |
| Target date | Apr 7 2026 | Feb 26 (drop 1), Mar 15 (drop 2) |
| Jira fixVersion | 6.3.4 *(confirm)* | 5.11.5 *(confirm)* |
| Org ID | `b1000000-0000-4000-a000-000000000001` | `b2000000-0000-4000-a000-000000000001` |

---

## Why 2 Orgs Don't Pollute Each Other

This is the key architecture guarantee. Here's exactly why it works:

```
Tookitaki Customer (a1000000-...)
   ├── Org: tookitaki-634  (b1000000-...)
   │     ├── causal_relationships_statistical  WHERE org_id = b1000000
   │     ├── cross_domain_signals              WHERE org_id = b1000000
   │     ├── ai_memory                         WHERE org_id = b1000000
   │     └── → CORE brain (delta only, anonymised, clipped ±0.15)
   │
   └── Org: tookitaki-5115 (b2000000-...)
         ├── causal_relationships_statistical  WHERE org_id = b2000000
         ├── cross_domain_signals              WHERE org_id = b2000000
         ├── ai_memory                         WHERE org_id = b2000000
         └── → CORE brain (delta only, anonymised, clipped ±0.15)

customer_id = a1000000 is ONLY used for:
  - Billing / plan management
  - Admin dashboard grouping ("show me all Tookitaki workspaces")
  - The customer_workspaces SQL view

customer_id is NEVER used in:
  - Any brain query
  - Any causal graph write
  - Any signal ingestion
  - Any federated learning path
```

The two orgs are as isolated as two completely unrelated companies.
The `customer_id` is purely a human-readable grouping label.

---

*Last updated: Feb 2026 — NexusBrain Product Team*
