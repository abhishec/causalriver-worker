# AI-Augmented Product Operating Model — Build Requirements
## For: Tookitaki FinCense Product Team
## Date: 2026-02-27

---

## Overview

This document specifies the build requirements for an AI-Augmented Product Operating Model tailored to the Tookitaki FinCense product team. FinCense is a financial crime detection platform serving AML compliance, transaction monitoring, and typology-based risk detection for regulated financial institutions. The product team requires intelligent agents that can track delivery health, plan roadmaps, assess release risk, align stakeholders, and plan capacity — all informed by live data from GitHub, Jira, Confluence, and FinCense-specific signal sources. The 11 agents are organized into 4 priority tiers (P0–P3) and mapped to real BrainOS domain executors, database tables, and API endpoints already running in production. Build estimates assume two engineers with access to BrainOS infrastructure; agents that leverage existing domain executors have significantly lower build cost than net-new agents.

---

## Agent Inventory by Priority Tier

### P0 — Core Intelligence (Must-have for launch)

These 3 agents deliver immediate value with the highest confidence, because they map directly to production BrainOS PM-aaS domains that are already executing in `platform/lib/pm-aas/domain-executor.ts`.

---

#### Agent 1: Sprint Health Monitor
- **What it does**: Analyzes active sprint velocity, identifies blockers, and issues a go/at-risk/blocked health signal for FinCense sprints each Monday.
- **BrainOS domain**: `pm-aas/sprint-health` (domain executor: `executePmDomain`, model: `claude-haiku-4-5-20251001`)
- **Data dependencies**:
  - `connector_signals` (source_type='jira', entity_type='issue') — active sprint tickets, story points, status
  - `scope_creep_alerts` — unplanned work added mid-sprint
  - `engineer_health_snapshots` — per-developer velocity_index, overallocation_flag
  - `engagement_health_scores` — engagement-level health_score, computed_at
  - `org_connectors` (connector_type='jira') — OAuth credentials for live Jira sync
- **Build estimate**:
  - Backend wiring (Jira connector sync → sprint-health domain): **2 days**
  - UI (SprintHealthCard component + weekly digest SSE): **1 day**
  - Total: **3 days**
- **Integration point**: `POST /api/copilot/chat` with PM-aaS route resolution → `executePmDomain({ domainType: 'sprint-health', request: { sprintData, team } })` → artifact saved to `se_aas_artifacts` with `domain_type='pm-aas.sprint-health'`
- **Risk**: Low — domain is fully built and deployed; only Jira connector configuration is required per workspace
- **Success metric**: Sprint health score correlation with actual on-time delivery rate > 0.70 (measured retrospectively over 4 sprints); P90 query latency < 3s

---

#### Agent 2: Capacity Planner
- **What it does**: Computes team capacity vs planned work for the upcoming sprint and flags over-allocation before sprint planning, so FinCense PMs can right-size commitments.
- **BrainOS domain**: `pm-aas/capacity-planner` (domain executor: `executePmDomain`, model: `claude-haiku-4-5-20251001`)
- **Data dependencies**:
  - `connector_signals` (source_type='jira') — story point estimates, assignees, sprint backlog
  - `engineer_health_snapshots` — overallocation_flag, velocity_index, review_burden (flight risk as proxy for attrition risk)
  - `connector_signals` (source_type='github') — PR review burden per engineer (feeds into available capacity)
  - `engagements` — engagement_name, pod_name, status for context
- **Build estimate**:
  - Backend (capacity data assembly from connector_signals + engineer_health_snapshots): **1.5 days**
  - UI (CapacityPlannerCard): **1 day**
  - Total: **2.5 days**
- **Integration point**: `POST /api/copilot/chat` → `resolvePmAasRoute()` → `executePmDomain({ domainType: 'capacity-planner', request: { team, plannedWork, sprintLength } })` → SSE delivers `pmAasResult` to frontend
- **Risk**: Low — domain built; medium data-quality risk if Jira story points are inconsistently estimated by the FinCense team (common in AML feature work that has unclear scope)
- **Success metric**: Over-allocation alerts fire before sprint start with 80%+ precision (measured as: alert fired AND sprint velocity actually dropped below 80% of plan)

---

#### Agent 3: Release Risk Assessor
- **What it does**: Generates a go/no-go/conditional-go recommendation for each FinCense release with a risk score, readiness checklist, and rollback plan draft.
- **BrainOS domain**: `pm-aas/release-risk` (domain executor: `executePmDomain`, model: `claude-sonnet-4-6`)
- **Data dependencies**:
  - `connector_signals` (source_type='github') — open PRs, unmerged branches, CI failure rate from entity_id
  - `connector_signals` (source_type='jira') — open bugs, regression tickets, release-tagged issues
  - `scope_creep_alerts` — alerts with estimated_delay_days
  - `se_aas_artifacts` (domain_type='pm-aas.sprint-health') — most recent sprint health for release branch sprint
  - `prediction_records` — historical release-risk domain accuracy (was_correct field) for calibration
- **Build estimate**:
  - Backend (release-risk domain assembly — GitHub + Jira composite): **2 days**
  - UI (ReleaseRiskCard with go/no-go badge + checklist): **1.5 days**
  - Write-back rule (post recommendation to Slack #releases channel): **0.5 day**
  - Total: **4 days**
- **Integration point**: `POST /api/copilot/chat` → `executePmDomain({ domainType: 'release-risk', request: { releaseContext, releaseDate, features } })` → artifact written to `se_aas_artifacts` → write-back to Slack via `connector_writeback_rules` (domain_type='pm-aas.release-risk', connector_type='slack')
- **Risk**: Medium — accuracy depends on completeness of GitHub PR labels and Jira release-fix-version tagging; FinCense team must enforce ticket hygiene for the model to be reliable
- **Success metric**: Recall@High-Risk > 0.85 (when agent flags high risk, actual release incident rate within 72 hours is tracked); false alarm rate < 20%

---

### P1 — Enhanced Intelligence

These 4 agents extend core PM intelligence with roadmap planning, backlog prioritization, stakeholder communication, and delivery tracking. Two are built domains; two require moderate additional data wiring for the FinCense typology domain context.

---

#### Agent 4: Roadmap Planner
- **What it does**: Generates a quarterly roadmap organized by themes (e.g., typology coverage expansion, platform scalability, compliance reporting) given product goals and current backlog state.
- **BrainOS domain**: `pm-aas/roadmap-planner` (domain executor: `executePmDomain`, model: `claude-sonnet-4-6`)
- **Data dependencies**:
  - `connector_signals` (source_type='jira') — epics, initiatives, labels including typology IDs (e.g., 'typology-100', 'aml-sanctions')
  - `causal_relationships_statistical` — learned causal edges between feature delivery and customer health outcomes (brain context injection via `getBrainContext()`)
  - `org_causal_patterns` — past delivery patterns (what sized initiatives slip, what succeeds)
  - `se_aas_artifacts` (domain_type='pm-aas.capacity-planner') — team capacity baseline for effort feasibility
  - External: FinCense typology library API (optional enrichment — typology IDs mapped to regulatory urgency)
- **Build estimate**:
  - Backend (roadmap-planner domain + Jira epic sync): **2 days**
  - FinCense typology label mapping (Jira epic labels → typology catalog): **1.5 days**
  - UI (RoadmapPlannerCard with quarterly theme grid): **2 days**
  - Total: **5.5 days**
- **Integration point**: `POST /api/copilot/chat` → `resolvePmAasRoute()` → `executePmDomain({ domainType: 'roadmap-planner', request: { goals, timeframe, context } })` → artifact saved; brain context from `getBrainContext(supabase, organizationId)` injects causal priors
- **Risk**: Medium — roadmap quality is highly sensitive to input quality; if Jira epics lack descriptions or acceptance criteria, the LLM roadmap will be generic. Brain context priming mitigates this over time as patterns accumulate.
- **Success metric**: PM adoption rate > 60% (PMs reference AI roadmap in planning sessions); roadmap theme accuracy (stakeholder-rated relevance > 4/5 on post-planning survey)

---

#### Agent 5: Backlog Prioritizer (WSJF-Scored)
- **What it does**: Scores and ranks the FinCense product backlog using Weighted Shortest Job First (WSJF), incorporating regulatory urgency for AML/sanctions typologies as a business value multiplier.
- **BrainOS domain**: `pm-aas/backlog-prioritizer` (domain executor: `executePmDomain`, model: `claude-sonnet-4-6`)
- **Data dependencies**:
  - `connector_signals` (source_type='jira') — backlog items with story points, labels, priority field, epic link
  - External: FinCense typology API — regulatory urgency score per typology (e.g., sanctions = critical, structuring = high)
  - `causal_relationships_statistical` — which Jira label patterns historically led to customer escalations
  - `engagement_health_scores` — customer health_score by engagement (feeds business value: unhealthy customers get regulatory features bumped)
  - `brain_case_log` — past cases where backlog misordering caused delivery failures
- **Build estimate**:
  - Backend (backlog-prioritizer + typology urgency enrichment): **2 days**
  - WSJF scoring calibration for FinCrime context: **1 day**
  - UI (BacklogPrioritizerCard with ranked list + score breakdown): **1.5 days**
  - Total: **4.5 days**
- **Integration point**: `POST /api/copilot/chat` → `executePmDomain({ domainType: 'backlog-prioritizer', request: { items, criteria: 'wsjf+regulatory-urgency' } })` → SSE delivers `pmAasResult`; artifact at `se_aas_artifacts` with `domain_type='pm-aas.backlog-prioritizer'`
- **Risk**: Medium — WSJF scoring requires consistent story point estimation and well-labeled Jira tickets. Typology API integration adds an external dependency (Medium risk: API availability).
- **Success metric**: WSJF rank correlation with PM manual priority > 0.75 (Spearman); backlog prioritization time reduced by 40% vs baseline (measured in sprint planning duration)

---

#### Agent 6: Stakeholder Alignment Generator
- **What it does**: Drafts executive updates, board-level summaries, and customer-facing progress reports for FinCense engagements, tailored by audience (internal exec vs. bank CTO vs. regulator).
- **BrainOS domain**: `pm-aas/stakeholder-alignment` (domain executor: `executePmDomain`, model: `claude-sonnet-4-6`)
- **Data dependencies**:
  - `engagement_health_latest` (VIEW over `engagement_health_scores`) — health_score, engagement_id, computed_at
  - `se_aas_artifacts` — recent sprint-health, release-risk, and delivery-intelligence artifacts for the engagement (assembled as context)
  - `connector_signals` (source_type='jira') — completed features in period, open bugs, milestone status
  - `engagements` — client_name, engagement_name, pod_name for audience framing
  - `copilot_response_feedback` — helpful/not-helpful signals on past stakeholder drafts (RL loop calibration)
- **Build estimate**:
  - Backend (multi-artifact context assembly for stakeholder-alignment domain): **2 days**
  - Audience profile system (bank exec vs. regulator vs. internal): **1 day**
  - UI (StakeholderUpdateCard with copy-to-clipboard + email draft): **1.5 days**
  - Write-back (optional: post summary to Slack #client-updates): **0.5 day**
  - Total: **5 days**
- **Integration point**: `POST /api/copilot/chat` → `executePmDomain({ domainType: 'stakeholder-alignment', request: { audience, context, format: 'executive-update' } })` → artifact at `se_aas_artifacts`; write-back via `connector_writeback_rules`
- **Risk**: Medium — output quality depends on context richness; drafts need human review before sending to regulators or bank clients (enforce via UI with "review before send" gate). Not a risk for the technical build, but a governance requirement.
- **Success metric**: Draft acceptance rate > 70% (PM sends draft with < 2 edits); stakeholder satisfaction score on monthly survey > 4/5

---

#### Agent 7: Delivery Intelligence Tracker
- **What it does**: Provides a real-time health snapshot across all active FinCense engagements — flight risk engineers, scope creep alerts, pod health, and engagement risk level.
- **BrainOS domain**: `delivery-intelligence` (SE-aaS domain executor in `platform/lib/se-aas/domain-executor.ts` via `podMatchDomain`; supplemented by `/api/se-aas/engagement-health`)
- **Data dependencies**:
  - `engagement_health_latest` (VIEW) — health_score, engagement_id, computed_at
  - `engineer_health_snapshots` — github_login, velocity_index, review_burden, flight_risk_score, overallocation_flag
  - `scope_creep_alerts` — alerts, severity, affected_epics, estimated_delay_days
  - `pod_match_history` — recommended_pod_name, confidence
  - `connector_signals` (source_type='github') — PR merge rate, commit velocity
- **Build estimate**:
  - Backend (delivery-intelligence already built; wire to PM-aaS copilot context): **1 day**
  - UI (DeliveryIntelligenceDashboard panel — already partially exists): **1 day**
  - Total: **2 days** (lowest cost because infrastructure is already live)
- **Integration point**: `GET /api/se-aas/engagement-health?organizationId=X` → returns engagement health snapshot; also available via `POST /api/copilot/chat` with 'delivery-intelligence' domain routing → SSE delivers `deliveryIntelligenceResult` to frontend
- **Risk**: Low — fully built infrastructure; risk is data freshness (GitHub/Jira connector sync cadence must be <= 1 hour for health scores to be actionable)
- **Success metric**: Engagement health scores computed for 100% of active engagements within 1 hour of sprint events; delivery risk alerts have >75% precision (alert fired AND engagement actually slips)

---

### P2 — Advanced Automation

These 4 agents introduce AI-driven automation beyond analysis — writing to external systems, detecting FinCrime-specific delivery patterns, and generating feature impact assessments. They require more significant data pipeline work.

---

#### Agent 8: Feature Impact Analyzer (FinCrime Context-Aware)
- **What it does**: Assesses business impact, engineering effort, regulatory risk, and dependency chain for any proposed FinCense feature — including AML typology coverage impact (which typologies the feature affects, what detection accuracy change is expected).
- **BrainOS domain**: `pm-aas/feature-impact` (domain executor: `executePmDomain`, model: `claude-sonnet-4-6`)
- **Data dependencies**:
  - `connector_signals` (source_type='jira' AND source_type='github') — feature ticket, linked PRs, related epics
  - External: FinCense typology library — typology coverage matrix (which typologies are affected by this feature)
  - `causal_relationships_statistical` — causal edge weights between feature delivery and detection accuracy changes (must be seeded from FinCense historical release data)
  - `se_aas_artifacts` (domain_type='pm-aas.release-risk') — past release risk for related feature areas
  - `prediction_records` — historical feature-impact domain confidence for calibration
- **Build estimate**:
  - Backend (feature-impact domain + typology coverage enrichment): **2.5 days**
  - Typology impact matrix seeding (historical data import from FinCense system): **2 days**
  - UI (FeatureImpactCard with typology coverage delta visualization): **2 days**
  - Total: **6.5 days**
- **Integration point**: `POST /api/copilot/chat` → `executePmDomain({ domainType: 'feature-impact', request: { feature, scope: 'fincense-typology-matrix' } })` → artifact at `se_aas_artifacts`; brain context injection includes typology causal edges
- **Risk**: High — typology coverage impact is a novel data pipeline that doesn't exist yet; requires manual seeding of historical release-to-accuracy data from FinCense analytics team. Model accuracy risk: LLM cannot reliably predict detection accuracy without quantitative calibration data.
- **Success metric**: Feature impact score correlation with actual post-release typology detection accuracy change > 0.60 (measured over 3 releases); effort estimate within ±20% of actual delivery time for 70% of features

---

#### Agent 9: Early Warning System (Delivery + Compliance Risk)
- **What it does**: Proactively detects velocity collapse, engineer flight risk, and compliance-delivery conflicts (e.g., a regulatory deadline at risk due to scope creep or resourcing) and issues alerts before a sprint ends.
- **BrainOS domain**: `early-warning` (SE-aaS domain executor via `podMatchDomain` + `/api/se-aas/engagement-health`; extends existing early-warning infrastructure)
- **Data dependencies**:
  - `engineer_health_snapshots` — velocity_index, review_burden, flight_risk_score (queried by: `SELECT * FROM engineer_health_snapshots WHERE organization_id = $1 ORDER BY computed_at DESC`)
  - `engagement_health_scores` — health_score trend over last 4 periods (time-series velocity collapse detection)
  - `scope_creep_alerts` — severity, estimated_delay_days (cross-referenced with regulatory deadline calendar)
  - `connector_signals` (source_type='jira') — blocked tickets count, days-in-status > threshold
  - External: FinCense regulatory calendar (compliance deadlines per engagement — must be provided as structured Jira milestone data or manual configuration)
  - `cross_domain_signals` — gaba signals (domain failure patterns) to detect systemic delivery problems
- **Build estimate**:
  - Backend (early-warning already built; add compliance deadline cross-reference): **2 days**
  - Regulatory calendar ingestion (Jira milestone labels → deadline events): **1.5 days**
  - Write-back rule (Slack alert to #delivery-risks when severity >= high): **0.5 day**
  - UI (EarlyWarningPanel — exists; extend with compliance risk dimension): **1 day**
  - Total: **5 days**
- **Integration point**: `POST /api/copilot/chat` with 'early-warning' domain → existing SE-aaS delivery path → `deliveryIntelligenceResult` SSE; write-back via `connector_writeback_rules` (domain_type='early-warning', connector_type='slack')
- **Risk**: Medium — compliance deadline data depends on Jira milestone hygiene and manual configuration per engagement; velocity collapse detection is already proven in the SE-aaS system
- **Success metric**: Early warning fires >= 5 days before actual sprint miss for 80% of detected cases; false positive rate < 15%; Slack alert click-through rate > 40% (indicates alerts are actionable)

---

#### Agent 10: Automated Jira Ticket Generator (from Brain Artifacts)
- **What it does**: After any FinCense AI analysis (sprint health, scope creep, release risk), automatically creates well-structured Jira tickets for the recommended actions — saving PMs 30+ minutes of ticket-writing per cycle.
- **BrainOS domain**: Not a query domain — this is a **Voice/write-back agent** using the existing write-back dispatcher in `platform/lib/connectors/writeback-dispatcher.ts`
- **Data dependencies**:
  - `se_aas_artifacts` — artifact_data from sprint-health, scope-creep, release-risk, early-warning domains (read by write-back dispatcher)
  - `connector_writeback_rules` — org-specific rules defining: which domain triggers ticket creation, which Jira project, ticket template
  - `org_connectors` (connector_type='jira') — OAuth token for Jira API write access
  - `writeback_queue` — pending Jira create-issue actions (max 3 retries, exponential backoff)
  - `agent_writeback_log` — immutable audit trail per Jira ticket created (MAS compliance requirement)
- **Build estimate**:
  - Backend (extend writeback-dispatcher with pm-aas domain types): **1.5 days**
  - Jira ticket template system (per domain type: sprint-health → action item ticket, scope-creep → escalation ticket): **2 days**
  - Admin UI (write-back rule configuration for PM-aaS domains): **1 day**
  - Total: **4.5 days**
- **Integration point**: After `executePmDomain()` saves artifact → `checkAndQueueWriteback()` reads `connector_writeback_rules` → inserts to `writeback_queue` → `/api/cron/process-writeback` (every 5min) calls Jira `POST /rest/api/3/issue` → logs to `agent_writeback_log`
- **Risk**: Medium — Jira project key configuration and ticket template design require per-engagement setup; Jira API rate limits (10 requests/second) need throttling for bulk ticket creation. Write-back dispatcher already handles retry/backoff.
- **Success metric**: Jira ticket creation success rate > 95%; PM reports 30+ minutes saved per sprint cycle (user survey); zero unauthorized ticket creation incidents (enforced by write-back governance model)

---

#### Agent 11: Scope Creep Detector (FinCrime-Aware)
- **What it does**: Detects unplanned scope additions in active FinCense sprints and estimates delay impact, with awareness of which scope additions are regulatory non-negotiables vs. optional enhancements — so PMs can make informed trade-off decisions.
- **BrainOS domain**: `scope-creep` (SE-aaS domain, already built; extend with FinCrime scope classification layer)
- **Data dependencies**:
  - `scope_creep_alerts` — existing alerts with severity, affected_epics, estimated_delay_days
  - `connector_signals` (source_type='jira') — mid-sprint ticket additions (entity_id comparison: tickets added after sprint start date)
  - External: FinCense typology regulatory priority matrix — maps typology IDs to regulatory urgency (mandatory vs. discretionary)
  - `causal_relationships_statistical` — causal edges: scope additions of type X → delay of Y days (learned from historical sprints)
  - `engagement_health_scores` — engagement context for impact framing
- **Build estimate**:
  - Backend (scope-creep already built; add FinCrime scope classifier): **2 days**
  - Typology priority matrix integration: **1 day**
  - UI (ScopeCreepCard — extend existing with mandatory/discretionary classification): **1 day**
  - Total: **4 days**
- **Integration point**: `/api/se-aas/engagement-health` returns `scope_creep_alerts`; also accessible via `POST /api/copilot/chat` with 'scope-creep' domain → SSE delivers `deliveryIntelligenceResult`; scope classification enrichment runs server-side in domain executor
- **Risk**: Medium — regulatory vs. discretionary scope classification requires FinCense domain expertise to seed the typology priority matrix; incorrect classification inverts the agent's value. One-time expert calibration session required at onboarding.
- **Success metric**: Scope creep detected within 24 hours of mid-sprint ticket addition for 90% of cases; delay estimate accuracy within ±15% of actual delay for 70% of detected cases; PM uses scope classification to make scope trade-off decision in 60% of alerts

---

### P3 — Future Expansion

These agents require significant new infrastructure (vector embeddings, external API integrations, new data pipelines) and are not viable until P0+P1 are stable and generating training data.

---

#### Agent 12 (Future): Confluence Knowledge Graph (Regulatory Documentation Intelligence)
- **What it does**: Ingests Confluence pages (product specs, MAS compliance docs, typology design documents) and answers PM questions against the living knowledge base — "Which typologies are impacted by MAS Notice 655 amendment?"
- **BrainOS domain**: Net-new domain `knowledge-graph` (not yet built)
- **Data dependencies**: Confluence API (page content), pgvector extension for semantic search, `connector_signals` (source_type='confluence' — not yet implemented)
- **Build estimate**: **15–20 days** (new connector + pgvector + retrieval domain)
- **Integration point**: New connector `/api/connectors/confluence/sync` + new SE-aaS domain `knowledge-graph` in `DOMAIN_MAP`
- **Risk**: High — pgvector integration is explicitly listed as a gap in BRAINOS_ARCHITECTURE.md ("Gap identified: Dedicated PDF chunking + vector embedding is not yet a first-class feature")
- **Success metric**: Recall@3 > 0.80 on test queries against Confluence knowledge base; answer latency < 5s

---

#### Agent 13 (Future): Cross-Engagement Pattern Intelligence
- **What it does**: Federated learning across all FinCense engagements (different bank customers) to surface delivery patterns — "Banks with 3+ typologies in scope have 40% higher scope creep rate in Q1 regulatory cycles" — without exposing raw customer data.
- **BrainOS domain**: Extended `delivery-intelligence` with federated CORE Brain priors; reads `causal_relationships_statistical` with IS_CORE_PRIOR flag
- **Data dependencies**: `causal_relationships_statistical` (CORE Brain federated patterns from `computeAndPromoteCausalDeltas()`); requires minimum 3 active AI Worker Spaces (FinCense engagements) feeding the CORE
- **Build estimate**: **8–10 days** (federation already built; requires PM-aaS domain extension to consume CORE patterns)
- **Risk**: High — requires multiple active engagements producing RL signals; insufficient data volume in early deployment makes cross-engagement patterns unreliable
- **Success metric**: CORE priors improve first-sprint prediction accuracy by >10% vs. cold-start baseline (A/B test on new engagement onboarding)

---

## BrainOS Integration Summary

| Agent | BrainOS API | Data Source | Domain Status |
|---|---|---|---|
| Sprint Health Monitor | `POST /api/copilot/chat` (pm-aas/sprint-health) | `connector_signals` (Jira), `engineer_health_snapshots` | Built |
| Capacity Planner | `POST /api/copilot/chat` (pm-aas/capacity-planner) | `connector_signals` (Jira+GitHub), `engineer_health_snapshots` | Built |
| Release Risk Assessor | `POST /api/copilot/chat` (pm-aas/release-risk) | `connector_signals` (GitHub+Jira), `scope_creep_alerts` | Built |
| Roadmap Planner | `POST /api/copilot/chat` (pm-aas/roadmap-planner) | `connector_signals` (Jira), `causal_relationships_statistical` | Built |
| Backlog Prioritizer | `POST /api/copilot/chat` (pm-aas/backlog-prioritizer) | `connector_signals` (Jira), typology API (external) | Built (partial: typology enrichment missing) |
| Stakeholder Alignment | `POST /api/copilot/chat` (pm-aas/stakeholder-alignment) | `engagement_health_latest`, `se_aas_artifacts` | Built |
| Delivery Intelligence | `GET /api/se-aas/engagement-health` | `engagement_health_latest`, `engineer_health_snapshots`, `scope_creep_alerts` | Built |
| Feature Impact Analyzer | `POST /api/copilot/chat` (pm-aas/feature-impact) | `connector_signals`, typology matrix (external) | Built (partial: typology matrix not seeded) |
| Early Warning System | `POST /api/copilot/chat` (early-warning) | `engineer_health_snapshots`, `scope_creep_alerts`, compliance calendar | Built (partial: compliance deadline source missing) |
| Jira Ticket Generator | `/api/cron/process-writeback` (write-back dispatcher) | `se_aas_artifacts`, `connector_writeback_rules`, `writeback_queue` | Built |
| Scope Creep Detector | `POST /api/copilot/chat` (scope-creep) | `scope_creep_alerts`, `connector_signals` (Jira) | Built (partial: FinCrime classification layer missing) |
| Confluence Knowledge Graph | Net-new `/api/connectors/confluence/sync` | Confluence API, pgvector | Not built |
| Cross-Engagement Patterns | Extended `delivery-intelligence` | `causal_relationships_statistical` (CORE priors) | Partial (federation built; PM-aaS consumption not wired) |

---

## Build Roadmap

Assumes 2 engineers (1 backend-focused, 1 full-stack). Jira and GitHub connectors must be configured and syncing before any PM-aaS domain can produce useful output.

### Week 1: Foundation + P0 Agents (10 days of work, 5 calendar days with 2 engineers)

**Day 1–2: Connector Setup**
- Configure Jira OAuth connector for Tookitaki FinCense workspace (`org_connectors` row, credentials_encrypted)
- Configure GitHub connector for FinCense repos
- Verify `connector_signals` population: `SELECT COUNT(*) FROM connector_signals WHERE source_type IN ('jira', 'github') AND organization_id = '<workspace>'`
- Set brain_readiness_threshold to 10 in `ai_workspace.orchestratorConfig.brainReadinessMinIq`

**Day 3–4: P0 Agent Activation**
- Sprint Health Monitor: wire Jira sprint data into `sprint-health` domain request; test via copilot chat
- Capacity Planner: assemble team capacity from `engineer_health_snapshots` + Jira; test output quality
- Verify artifacts appear in `se_aas_artifacts` with domain_type 'pm-aas.sprint-health' and 'pm-aas.capacity-planner'

**Day 5: P0 Release Risk + Write-back**
- Release Risk Assessor: configure for upcoming FinCense release; test go/no-go output
- Configure Slack write-back rule for release risk alerts (domain_type='pm-aas.release-risk')
- End-of-week: all 3 P0 agents live in demo workspace; PM team does acceptance test

### Week 2: P1 Agents (10 days of work, 5 calendar days)

**Day 6–7: Roadmap Planner + Delivery Intelligence**
- Roadmap Planner: map Jira epics to FinCrime themes; run roadmap generation for Q2 2026 planning
- Delivery Intelligence Tracker: verify engagement_health_latest view returning current data; wire dashboard panel

**Day 8–9: Backlog Prioritizer + Stakeholder Alignment**
- Backlog Prioritizer: begin typology urgency label mapping (Jira label 'typology-100' → urgency: 'high'); initial WSJF calibration
- Stakeholder Alignment: build multi-artifact context assembly (pull last 3 sprint-health artifacts as context); test executive summary generation

**Day 10: P1 QA + Integration Testing**
- End-to-end test all P1 agents via Copilot chat
- Verify RL signals flowing: `SELECT COUNT(*) FROM cross_domain_signals WHERE domain LIKE 'pm-aas%' AND created_at > NOW() - INTERVAL '1 day'`
- Brain evolution check: `SELECT intelligence_score, computed_at FROM brain_evolution_snapshots ORDER BY computed_at DESC LIMIT 5`

### Week 3: P2 Agents (10 days of work, 5 calendar days)

**Day 11–12: Feature Impact Analyzer**
- Feature Impact: scope typology coverage enrichment; initiate historical data import from FinCense analytics team (2-day async task — start early)
- Build FeatureImpactCard UI component

**Day 13–14: Early Warning + Scope Creep Extensions**
- Early Warning: add regulatory deadline cross-reference via Jira milestone labels
- Scope Creep: build FinCrime mandatory/discretionary classifier; seed typology priority matrix

**Day 15: Jira Ticket Generator**
- Write-back dispatcher: add pm-aas domain types to `connector_writeback_rules` schema
- Build 3 Jira ticket templates (sprint-health action item, scope-creep escalation, release-risk blocker)
- Test full pipeline: copilot query → artifact → writeback_queue → Jira ticket created → agent_writeback_log entry

### Week 4: Stabilization + P3 Scoping (5 calendar days)

**Day 16–17: Production Hardening**
- Monitor RL signal quality: verify dopamine:gaba ratio > 70:30 for PM-aaS domains
- Fix any silent failures in `se_aas_artifacts` inserts (check `agent_queue` for failed jobs)
- Review `brain_evolution_snapshots.intelligence_score` trend — should be increasing

**Day 18–19: P3 Scoping**
- Spike: Confluence connector design (auth flow, page content extraction, chunking strategy)
- Evaluate pgvector extension availability in hosted Supabase (Singapore region)
- Document typology knowledge graph requirements with FinCense product team

**Day 20: Demo + Retrospective**
- Live demo of all 11 agents to Tookitaki stakeholders
- Collect PM adoption metrics (which agents used, frequency, helpful/not-helpful ratings)
- Document patterns in `.claude/case-log.md` for BrainOS reinforcement loop

---

## Risk Register

### Risk 1: Jira Data Quality (Probability: High | Impact: High)
**Description**: FinCense Jira tickets frequently lack story point estimates, proper epic links, and typology labels. All 7 PM-aaS agents depend on Jira connector_signals quality. Low-quality tickets produce low-confidence outputs that erode PM trust.

**Mitigation**:
- Pre-launch data audit: query `connector_signals WHERE source_type='jira'` and compute percentage of tickets with story_points, epic_link, labels populated in signal_data JSONB
- Require minimum 80% ticket completeness before activating backlog-prioritizer and capacity-planner
- Add data quality score to every PM-aaS artifact in metadata JSONB so PMs see confidence calibrated to data quality
- Work with FinCense PM lead to enforce Jira hygiene standards for 2 sprints before launch

### Risk 2: Typology API Availability (Probability: Medium | Impact: High)
**Description**: Feature Impact Analyzer, Backlog Prioritizer, and Scope Creep Detector all require enrichment from the FinCense typology library (typology IDs → regulatory urgency scores). If this API is not available or not structured, 3 of 11 agents degrade to generic mode.

**Mitigation**:
- Treat typology enrichment as a graceful enhancement, not a hard dependency: agents work without it, returning lower-confidence results
- Export typology priority matrix to a static JSON config file in the FinCense workspace settings as fallback
- Timeline: request typology API access in Week 1 in parallel with connector setup; fallback config ready by Day 8

### Risk 3: RL Cold-Start Accuracy (Probability: High | Impact: Medium)
**Description**: The BrainOS brain needs 10+ signals (`brain_readiness_threshold`) before context priming kicks in. In the first 1–2 sprints, PM-aaS domain outputs will be generic (not brain-augmented). PMs trying the system in Week 1 may get lower-quality responses that don't reflect FinCense-specific patterns.

**Mitigation**:
- Set `brain_readiness_threshold` to minimum (5) for the first 2 weeks to accelerate brain activation
- Pre-seed `org_causal_patterns` with FinCense-specific patterns from the Tookitaki SE team (known delivery patterns: regulatory deadlines cause scope creep in Q1, etc.)
- Communicate expectation to PMs: "The brain improves each sprint — Week 4 outputs will be significantly richer than Week 1"
- Monitor: `SELECT signal_count FROM ai_workspace WHERE organization_id = '<workspace_id>'` daily

### Risk 4: Regulatory Write-Back Governance (Probability: Low | Impact: Critical)
**Description**: Automated Jira ticket creation and Slack message posting in a FinCrime compliance environment carries regulatory risk. If an AI-generated ticket contains incorrect compliance guidance (e.g., incorrect typology regulatory status) and is acted upon, it could create audit exposure for the bank customer.

**Mitigation**:
- All write-back rules require explicit admin activation (enforced by `writeback_enabled` flag in `ai_workspace` and RBAC check in `/api/connectors/writeback/rules`)
- Add "AI-Generated — Requires Review" label to all Jira tickets created by Agent 10
- condition_filter on all PM-aaS write-back rules: `{ "riskScore": { "lte": 0.5 } }` — only low-risk outputs trigger automation; high-risk outputs require human review
- agent_writeback_log provides immutable audit trail per MAS TRM compliance requirement
- Executive communication: AI generates; human decides — write-back is a draft, not an action

### Risk 5: Multi-Engagement Data Isolation (Probability: Low | Impact: Critical)
**Description**: The FinCense workspace serves multiple bank customers as separate engagements. Any cross-engagement data leakage (e.g., Bank A's delivery signals appearing in Bank B's recommendations) would be a serious compliance incident.

**Mitigation**:
- RLS on all tables is the primary defense: `organization_id` scoping is enforced at DB layer for connector_signals, scope_creep_alerts, engineer_health_snapshots, se_aas_artifacts
- CORE Brain federation uses only anonymous statistical patterns (causal edge weights, numbers only) — no raw org data crosses
- Audit quarterly: `SELECT DISTINCT organization_id FROM se_aas_artifacts WHERE created_at > NOW() - INTERVAL '90 days'` — verify no cross-org artifact bleed
- CORE_WORKSPACE_ID anti-pattern: verify `grep -r "CORE_WORKSPACE_ID" platform/app/api/` returns zero non-import results (documented vulnerability pattern in BrainOS memory)

---

*Document owner: BrainOS Command Center*
*Last updated: 2026-02-27*
*Status: Ready for PM team review*
