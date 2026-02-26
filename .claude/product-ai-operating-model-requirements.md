# AI-Augmented Product Operating Model: Build Requirements
## Tookitaki FinCense Product Team
**Date**: February 2026 | **Version**: 1.0

---

## Executive Summary

Tookitaki's FinCense platform addresses financial crime compliance for banks and financial institutions by combining rule-based detection with an AI-native typology library. The Product Team responsible for evolving FinCense operates under significant cognitive load: managing a complex regulatory typology corpus, fielding client escalations, writing compliance-grade requirements, analyzing alert quality across diverse customer deployments, and responding to competitive RFPs — all simultaneously. This document defines the build requirements for an AI-Augmented Product Operating Model that deploys 11 purpose-built agents across a 12-month roadmap to structurally relieve that load.

The operating model is not a chatbot layer. Each agent is a discrete workflow automation that reads from and writes to Tookitaki's existing knowledge systems — Jira, Confluence, Slack, GitHub, and the AFC (Anti-Financial Crime) typology library — to perform specific, high-frequency product team tasks with minimal human intervention. The agents are tiered by value and build complexity: P0 agents solve the highest-pain, most immediate problems (requirements documentation, alert quality analysis, and typology research), while P3 agents address longer-horizon strategic workflows.

Infrastructure decisions made in the P0 phase are deliberately foundational. The vector database, connector mesh, and curated knowledge layer built for the first three agents will underpin every subsequent agent in the roadmap. This means the P0 build is not three isolated tools — it is the platform on which the remaining eight agents run. Investment in getting P0 right, including knowledge curation discipline and connector reliability, directly determines the velocity and quality of P1 through P3 delivery.

---

## Agent Tier Overview

| # | Agent | Tier | Primary User | Core Capability |
|---|-------|------|-------------|-----------------|
| 1 | Requirement Documentation Agent | P0 | Product Manager | Drafts structured PRDs and user stories from raw input |
| 2 | Alert Quality Analyzer | P0 | Product Manager / Implementation | Diagnoses alert noise, false positive patterns against typology baselines |
| 3 | Scenario Research Agent (AFC Typologies) | P0 | Product Manager / Compliance SME | Synthesizes typology intelligence for scenario design and tuning guidance |
| 4 | PRD Impact Analyzer | P1 | Product Manager | Scores a PRD change against downstream engineering and compliance impact |
| 5 | Product Gap Intelligence | P1 | Product Manager | Surfaces gaps between client requests, competitor capabilities, and roadmap |
| 6 | Meeting Digest Agent | P1 | Product Team | Converts meeting recordings/transcripts into structured action items and decisions |
| 7 | RFP Response Agent | P2 | Product Manager / Sales | Drafts RFP responses grounded in FinCense capability documentation |
| 8 | Roadmap Trade-off Agent | P2 | Product Manager / Leadership | Quantifies trade-off options across roadmap items using effort, risk, and client impact |
| 9 | Client Escalation Risk Predictor | P2 | Product Manager / CS | Predicts escalation risk based on open tickets, deployment health, and sentiment signals |
| 10 | Slides Agent | P3 | Product Manager | Generates structured slide decks from PRDs, retros, and roadmap documents |
| 11 | Competitive Strategy Agent | P3 | Product Manager / Leadership | Monitors competitive landscape and generates strategic positioning recommendations |

---

## P0 Agents: Build Now (Months 1-3)

### 1. Requirement Documentation Agent

**Purpose**
Product managers at Tookitaki spend a disproportionate amount of time translating verbal briefs, client feedback threads, and Slack discussions into structured, engineering-ready PRDs. This agent automates the first-draft generation step, producing a compliant PRD skeleton — including problem statement, user stories, acceptance criteria, and regulatory context — from unstructured inputs. The output is not a final document; it is a high-quality draft that the PM iterates on, reducing time-to-PRD from days to hours.

**Core Capability**
Accepts unstructured input (voice note transcript, Slack thread, bullet list, meeting notes) and returns a structured PRD following Tookitaki's template. Automatically cross-references the AFC typology library to insert relevant regulatory and typology context where applicable. Tags open questions for PM review. Writes directly to Confluence as a draft page under the relevant product area space.

**Build Timeline**: 5-6 weeks

**Infrastructure Dependencies**
- Vector database (Pinecone or pgvector) for semantic search over historical PRDs and Confluence documents
- Confluence connector (read + write) via Atlassian REST API
- Jira connector (read) to pull linked tickets and epic context
- Slack connector (read) for input ingestion from designated channels
- LLM: Sonnet for drafting; Haiku for classification and tagging

**Data Requirements**
- Minimum 50 historical PRDs indexed in vector store as few-shot examples
- Tookitaki PRD template (Confluence page) as the schema reference
- AFC typology library (all IDs) indexed and retrievable by keyword and fincrime category
- Confluence space structure map so the agent knows where to create draft pages

**Build vs. Buy Decision**
Build on BrainOS. Off-the-shelf document generation tools (e.g., Notion AI, Atlassian Intelligence) do not have access to the AFC typology library, cannot enforce Tookitaki's PRD schema, and cannot wire into the broader agent mesh. The core differentiation is the typology-aware context injection, which requires a custom retrieval pipeline.

**Risk Flags**
- Regulatory accuracy risk: if the agent pulls an incorrect typology reference into a PRD, downstream engineering builds to the wrong spec. Mitigation: all typology references must include the business ID and be flagged as "agent-suggested — verify before sign-off."
- Template drift: if the PRD template changes in Confluence without updating the agent prompt, output quality degrades silently. Mitigation: pin the template version and alert on Confluence page edits to the template.
- Input quality dependency: garbage-in-garbage-out is especially acute here. Mitigation: define minimum viable input format (at least a problem statement + target user) and reject inputs below threshold with a structured prompt back to the PM.

**Acceptance Criteria**
- [ ] Agent produces a PRD draft in under 3 minutes from a 200-word input
- [ ] Output conforms to Tookitaki PRD template structure (all required sections present)
- [ ] At least one relevant AFC typology is referenced where the input touches transaction monitoring or AML
- [ ] Draft is created as a Confluence page in the correct space with "DRAFT - Agent Generated" label
- [ ] Open questions are explicitly flagged in a dedicated section
- [ ] PM can edit and publish the draft without reformatting

---

### 2. Alert Quality Analyzer

**Purpose**
False positive rates in AML transaction monitoring are a persistent operational burden for FinCense clients. Investigators spend the majority of their time clearing alerts that the system should never have generated. The Alert Quality Analyzer ingests alert data exports from client deployments and diagnoses quality patterns — by typology, by customer segment, by rule threshold — giving the Product Team actionable signal for scenario tuning guidance and product roadmap prioritization.

**Core Capability**
Accepts alert export files (CSV or structured JSON) from FinCense deployments. Segments alerts by typology ID, maps them against the expected behavioral pattern for each typology, and surfaces anomalies: typologies with disproportionate false positive rates, threshold configurations that are systematically miscalibrated, and customer segments (e.g., young customers, elderly customers) generating unexpected alert volumes. Produces a structured quality report with per-typology breakdown and prioritized tuning recommendations.

The agent operates directly against FinCense's live typology set. Key typologies in scope for alert quality analysis include:

- **AML-219** (Transaction inconsistent with young customer's age) and **AML-228** (Transactions inconsistent with elder customer's age): These age-based behavioral typologies require contextual customer segmentation. Alert noise here typically signals that the customer age banding parameters are misconfigured relative to the bank's actual customer demographics.
- **AML-141** and **AML-146** (Activity monitoring — transaction inconsistencies over specified period): Time-windowed activity typologies where the lookback period and baseline calibration are the primary noise drivers. High false positive rates here warrant investigation of the baseline transaction volume assumed for the customer segment.
- **AML-137**, **AML-150**, **AML-144** (Single money-out above threshold) and **AML-139**, **AML-143** (Single money-in above threshold): Threshold-based typologies where the dollar thresholds are the direct lever. These are structurally simple but generate high alert volumes at FIs with large retail customer bases if thresholds are not calibrated to the institution's transaction distribution.
- **AML-1706** (Laundering cyber fraud proceeds via e-wallet transactions and incoming transfers from high-risk jurisdictions): A more complex typology combining channel (e-wallet), transaction pattern, and jurisdiction risk. False positives here are harder to diagnose and usually require correlation with the institution's jurisdiction risk scoring configuration.

**Build Timeline**: 6-8 weeks (longer due to alert data schema normalization complexity)

**Infrastructure Dependencies**
- Vector database for typology library retrieval (shared with Agent 1)
- File ingestion pipeline: support CSV and JSON alert exports; schema normalization layer to handle variations across FinCense deployment versions
- Typology indicator data from AFC library (all risk indicators per typology ID)
- LLM: Haiku for pattern classification; Sonnet for narrative report generation

**Data Requirements**
- Alert export schema documentation for all supported FinCense versions
- Ground truth labels for a sample of alerts (true positive / false positive) from at least two client deployments for calibration
- All risk indicators for in-scope typologies (IDs 219, 228, 141, 146, 137, 150, 144, 139, 143, 1706) retrieved from AFC library
- Threshold configuration data per typology per deployment (sourced from FinCense config)

**Build vs. Buy Decision**
Build on BrainOS. No commercial alert analytics tool understands the AFC typology schema or the FinCense alert data format. Vendors like Napier or Quantexa offer analytics modules but require deep integration work that would exceed a build-from-scratch timeline and would not produce a typology-aware output.

**Risk Flags**
- Client data sensitivity: alert data contains PII and transaction details. The agent pipeline must operate in an environment that meets the data handling requirements of each client's DPA. Mitigation: deploy agent in client-scoped compute environment; no alert data leaves the client's data boundary.
- Schema version fragmentation: FinCense alert export formats may differ across client versions. Mitigation: build a schema normalization layer as a first-class component, not an afterthought. Version-test against the three most common FinCense deployment versions before launch.
- Confirmation bias in recommendations: the agent may surface tuning recommendations that optimize for reducing alert volume rather than reducing false positives specifically. Mitigation: require ground truth labels in the input or explicitly caveat all recommendations as "volume-based, not precision-based" when ground truth is absent.

**Acceptance Criteria**
- [ ] Agent successfully ingests and normalizes alert exports from at least 3 different FinCense deployment schema versions
- [ ] Per-typology false positive rate is computed and ranked for all 10 in-scope typology IDs
- [ ] Agent correctly identifies threshold miscalibration for the money-in/money-out typologies (137, 150, 144, 139, 143) when test data includes known miscalibration
- [ ] Age-based typology alerts (219, 228) are correctly segmented by customer age band
- [ ] Output report is structured (JSON + human-readable summary), not a free-text blob
- [ ] No client PII appears in the output report or agent logs

---

### 3. Scenario Research Agent (AFC Typologies)

**Purpose**
When a client requests a new AML detection scenario or asks why an existing typology is not catching a specific pattern, the Product Team must research the AFC typology library, cross-reference regulatory guidance, and synthesize an authoritative response. This process currently takes hours of manual research. The Scenario Research Agent automates typology intelligence synthesis: given a fincrime pattern description or a typology ID, it returns a comprehensive research brief covering the typology definition, associated risk indicators, relevant regulatory references, and recommended configuration parameters.

**Core Capability**
Accepts a query in natural language ("what typologies cover structuring via e-wallets?") or by typology ID, and returns a structured research brief. The agent searches across the full AFC typology library, retrieves all associated risk indicators, cross-references any available regulatory corpus (FATF guidance, MAS notices, FinCEN advisories), and synthesizes a brief that a Product Manager can use directly in a client response or scenario design document.

The current live typology set confirms that the majority of FinCense's detection coverage is concentrated in AML with threshold-based rules (typologies 137, 139, 143, 144, 150) and activity monitoring patterns (141, 146), with age-based behavioral overlays (219, 228) and emerging cyber-fraud vectors (1706). The Scenario Research Agent must surface this pattern — that coverage skews toward structural/threshold detection and may have gaps in behavioral and network-based patterns — when clients ask about detection breadth.

**Build Timeline**: 4-5 weeks (shortest P0 build; primarily a retrieval + synthesis pipeline over existing data)

**Infrastructure Dependencies**
- Vector database with full AFC typology library indexed (shared with Agents 1 and 2)
- Risk indicator data per typology (via AFC MCP tool)
- Optional: regulatory corpus (FATF typologies report, jurisdiction-specific AML notices) indexed as a separate vector namespace
- LLM: Sonnet for synthesis and brief generation; Haiku for retrieval scoring

**Data Requirements**
- All typology records from the AFC library indexed with business ID, name, fincrime type, and associated indicators
- Risk indicator list per typology (retrieved via `getIndicators` by typologyId)
- Full data model per typology (retrieved via `getFullDataModel`) for configuration parameter guidance
- Regulatory document corpus (PDF ingestion pipeline for FATF, MAS, FinCEN PDFs — at minimum 20 core documents)

**Build vs. Buy Decision**
Build on BrainOS. The AFC typology library is proprietary Tookitaki data that no commercial RAG product has access to. The core value of this agent is grounded synthesis over internal knowledge, which requires a custom retrieval pipeline. No off-the-shelf product delivers this.

**Risk Flags**
- Hallucinated regulatory references: LLMs will fabricate plausible-sounding FATF guidance if the regulatory corpus is sparse. Mitigation: all regulatory references in the output must be grounded in retrieved documents with source citation. If no grounded reference exists, the agent must state "no regulatory reference found in corpus" rather than generating one.
- Typology coverage gaps presented as completeness: the agent must not imply FinCense covers all fincrime patterns when queried about detection breadth. Mitigation: explicitly scope all responses to "coverage within the AFC library as of [index date]" and flag the index date in every output.
- Staleness: the AFC typology library evolves. If the vector index is not refreshed, research briefs will reference outdated typology definitions. Mitigation: scheduled weekly re-index of the typology library; index date watermark on all outputs.

**Acceptance Criteria**
- [ ] Agent returns a structured brief for any query referencing a valid AFC typology ID within 60 seconds
- [ ] Brief includes: typology name, fincrime type, business ID, associated risk indicators, and recommended configuration notes
- [ ] Natural language queries (e.g., "e-wallet laundering patterns") correctly surface typology 1706 and related indicators
- [ ] All regulatory references are grounded in retrieved documents; no unsourced regulatory claims in output
- [ ] Index date watermark is present on every output
- [ ] Agent correctly surfaces the threshold-heavy concentration of current typology coverage when queried about detection breadth

---

## P1 Agents: Months 3-6

### 4. PRD Impact Analyzer

**Purpose**
Every change to FinCense's detection engine has downstream consequences: engineering effort, compliance re-certification, impact on existing client deployments, and potential changes to the typology library. PMs currently assess this impact informally and inconsistently. The PRD Impact Analyzer reads a PRD and returns a structured impact score across four dimensions: engineering complexity, compliance re-certification risk, client deployment impact (how many live deployments are affected), and typology library coverage change.

**Core Capability**
Ingests a Confluence PRD URL or document. Extracts the proposed change. Cross-references the current FinCense codebase architecture (via GitHub connector), the list of live client deployments and their configured typologies (via CRM or deployment registry), and the compliance certification status. Returns a scored impact matrix with a recommended review tier (standard, compliance review required, architecture review required).

**Build Timeline**: 5-7 weeks

**Infrastructure Dependencies**
- GitHub connector (read) for codebase architecture reference
- Confluence connector (read) for PRD ingestion — shared with Agent 1
- Deployment registry or CRM connector (read) for live client configuration data
- LLM: Sonnet for impact reasoning; Haiku for extraction and classification

**Data Requirements**
- FinCense module dependency map (which modules affect which typologies)
- Live client deployment configurations (which typologies and thresholds are active per client)
- Compliance certification scope documentation
- Historical PRD change log with post-hoc impact actuals (for calibration)

**Build vs. Buy Decision**
Build. No commercial impact analysis tool understands FinCense's module-to-typology dependency structure. Linear, Jira Advanced, and similar tools offer dependency tracking but not semantic impact reasoning over PRD text.

**Risk Flags**
- Incomplete dependency map leads to missed impact flags. Mitigation: treat the dependency map as a living document with engineering ownership; block agent deployment until the map covers all core detection modules.
- PMs may treat impact scores as definitive rather than indicative, reducing human review. Mitigation: all scores are labeled "AI estimate — requires human sign-off for compliance review tier decisions."

**Acceptance Criteria**
- [ ] Impact matrix generated for any Confluence PRD URL in under 5 minutes
- [ ] Correctly identifies compliance re-certification risk for changes touching typology definitions in a test scenario
- [ ] Client deployment impact count is accurate within 10% against manually verified count
- [ ] Review tier recommendation matches human expert assessment in 80% of test cases
- [ ] All scores are labeled as estimates with explicit human sign-off requirement

---

### 5. Product Gap Intelligence

**Purpose**
Client requests, support tickets, and competitor feature announcements all signal gaps in FinCense's current capabilities. This intelligence is currently scattered across Jira, Slack, Intercom, and informal conversations. The Product Gap Intelligence agent aggregates these signals, clusters them by theme, maps them against the current roadmap, and surfaces the top unaddressed gaps ranked by frequency, client weight, and competitive urgency.

**Core Capability**
Runs on a weekly cadence. Reads new Jira tickets tagged as feature requests, Slack messages in designated channels (e.g., #client-feedback, #product), and optionally Intercom conversation summaries. Clusters requests using semantic similarity. Maps clusters against the current roadmap items. Outputs a weekly gap report: top 10 unaddressed gaps, estimated demand weight, roadmap coverage status, and competitive urgency flag where a known competitor has shipped the capability.

**Build Timeline**: 5-6 weeks

**Infrastructure Dependencies**
- Jira connector (read) — shared
- Slack connector (read) — shared
- Vector database for semantic clustering — shared
- Optional: Intercom or Zendesk connector for support ticket ingestion
- LLM: Haiku for clustering and classification; Sonnet for gap synthesis report

**Data Requirements**
- 6 months of historical Jira feature request tickets for initial clustering calibration
- Roadmap items exported from Jira or Productboard as structured data
- Competitor capability list (manually curated, updated quarterly)

**Build vs. Buy Decision**
Partial buy. Productboard and Pendo offer feedback aggregation with roadmap mapping. Evaluate Productboard AI features first. If they cover 70% of the use case, configure Productboard rather than building a custom agent. Build the competitive urgency flag layer on top regardless, as no commercial tool has FinCrime-specific competitive intelligence.

**Risk Flags**
- Loudest clients dominate gap ranking if weighting is purely frequency-based. Mitigation: weight by client ACV and strategic tier, not raw request count.
- Competitor capability flags may be stale if the competitive list is not maintained. Mitigation: assign a quarterly competitor list review owner; agent must display data freshness date on all competitive flags.

**Acceptance Criteria**
- [ ] Weekly report generated automatically without manual trigger
- [ ] Top 10 gap clusters are semantically coherent (validated by PM review of first 4 weekly reports)
- [ ] Roadmap coverage status is accurate for 90% of gaps in test set
- [ ] Competitive urgency flags include source and date for every claim
- [ ] Report delivered to a designated Slack channel or Confluence page on schedule

---

### 6. Meeting Digest Agent

**Purpose**
The Product Team participates in a high volume of client calls, internal syncs, and cross-functional reviews. Converting these into structured decisions and action items is a manual, time-consuming task. The Meeting Digest Agent automates this: given a meeting transcript or recording, it extracts decisions made, action items with owners, open questions, and product signals (feature requests, pain points, concerns) — and writes them to the appropriate Jira tickets and Confluence pages.

**Core Capability**
Accepts a meeting transcript (text) or audio recording (via transcription service). Classifies content by type: decision, action item, open question, product signal. Assigns owners to action items where mentioned. Creates or updates Jira tickets for action items. Appends a structured digest to the relevant Confluence meeting notes page. Flags product signals to the Product Gap Intelligence agent input queue.

**Build Timeline**: 4-5 weeks

**Infrastructure Dependencies**
- Transcription service integration (AssemblyAI or Whisper API) for audio input
- Jira connector (read + write) — shared
- Confluence connector (read + write) — shared
- LLM: Haiku for classification; Sonnet for structured digest generation

**Data Requirements**
- Meeting template structure in Confluence (to determine where to append digest)
- Jira project keys and issue type schema for action item ticket creation
- Speaker identification data (optional — improves owner assignment accuracy)

**Build vs. Buy Decision**
Partial buy. Evaluate Otter.ai for Teams or Fireflies.ai first — both offer structured meeting summaries with action item extraction. If either integrates with Jira and Confluence satisfactorily, configure the commercial tool and add only the product signal routing layer as a custom build. Full custom build only if commercial tools fail the Jira/Confluence integration requirement.

**Risk Flags**
- Misattributed action item owners creates accountability confusion. Mitigation: all owner assignments are marked "inferred" and require explicit confirmation in the Jira ticket before the ticket moves to In Progress.
- Product signals routed to gap intelligence queue may duplicate existing requests. Mitigation: deduplication check against existing Jira feature request tickets before creating new entries.

**Acceptance Criteria**
- [ ] Digest generated from a 60-minute meeting transcript in under 3 minutes
- [ ] Decisions, action items, open questions, and product signals are correctly classified in 85% of test cases
- [ ] Jira tickets created for all action items with correct project key and issue type
- [ ] Owner assignment accuracy above 80% where owner is explicitly named in transcript
- [ ] Product signals successfully routed to gap intelligence input queue

---

## P2 Agents: Months 6-9

### 7. RFP Response Agent

**Purpose**
Responding to RFPs is one of the highest-stakes, most time-consuming product tasks. Responses require accurate, defensible claims about FinCense capabilities. The RFP Response Agent drafts responses to individual RFP questions by retrieving relevant capability documentation, typology coverage data, and past approved RFP responses — producing a draft that the PM and Sales team can review and finalize.

**Core Capability**
Accepts an RFP question (or full RFP document) and retrieves the most relevant FinCense capability documentation, typology library coverage evidence, and approved prior responses from a curated RFP response library. Drafts a structured response for each question. Flags questions where no grounded evidence exists (do not fabricate capability claims). Outputs a review-ready document with source citations for every claim.

**Build Timeline**: 6-8 weeks

**Infrastructure Dependencies**
- Vector database with curated RFP response library, capability docs, and typology coverage evidence — dedicated namespace
- Confluence connector (read) for capability documentation
- LLM: Sonnet for response drafting; strict retrieval-augmented generation with no fabrication fallback

**Data Requirements**
- Minimum 30 approved historical RFP responses, curated and indexed
- FinCense capability matrix (structured, maintained)
- Typology coverage map (which typologies, which fincrime types, which jurisdictions)

**Build vs. Buy Decision**
Build on BrainOS. Loopio and Responsive (RFP tools) offer response libraries with search but lack AFC typology grounding and FinCrime-specific retrieval. Configure Responsive for response library management; build the typology-aware retrieval and drafting layer on BrainOS.

**Risk Flags**
- Hallucinated capability claims in RFPs create legal and reputational risk. Mitigation: strict RAG-only mode — agent may not generate claims without a retrieved source. Unfounded questions must be flagged explicitly, not answered with best-guess content.
- Stale capability documentation leads to outdated claims. Mitigation: capability matrix has a mandatory quarterly review owner; agent displays document freshness date on all retrieved sources.

**Acceptance Criteria**
- [ ] Every claim in output is grounded in a retrieved source with citation
- [ ] Questions without grounded evidence are explicitly flagged as "No source found — requires manual response"
- [ ] Draft response time under 10 minutes for a 20-question RFP
- [ ] Source document dates are displayed for all citations
- [ ] 90% of claims validated as accurate by PM review in pilot

---

### 8. Roadmap Trade-off Agent

**Purpose**
Roadmap prioritization decisions require balancing client demand, engineering effort, strategic fit, compliance risk, and competitive urgency. These trade-offs are currently made in ad-hoc spreadsheets and meetings. The Roadmap Trade-off Agent structures this analysis: given a set of roadmap candidates, it scores each on a consistent rubric and generates a ranked recommendation with explicit trade-off rationale.

**Core Capability**
Accepts a list of roadmap candidates (Jira epics or manual input). Scores each on: client demand weight (from gap intelligence), engineering effort estimate (from Jira story points or engineering input), compliance re-certification risk (from PRD Impact Analyzer output), strategic fit (manual tag), competitive urgency (from gap intelligence competitive flags). Generates a ranked list with a one-paragraph trade-off rationale per item. Highlights tension pairs (e.g., "Item A has highest client demand but also highest compliance risk").

**Build Timeline**: 5-6 weeks (depends on PRD Impact Analyzer and Gap Intelligence being operational)

**Infrastructure Dependencies**
- Jira connector (read) — shared
- Output feeds from Agents 4 and 5 (PRD Impact Analyzer, Gap Intelligence)
- LLM: Sonnet for trade-off reasoning

**Risk Flags**
- Scoring rubric gaming: teams may over-tag items to score higher. Mitigation: rubric weights are set by leadership and locked; agent flags items with unusual score profiles for human review.
- Sequential dependency on P1 agents means this agent cannot be built until Agents 4 and 5 are operational.

**Acceptance Criteria**
- [ ] Ranked output generated for any set of 5-20 roadmap candidates
- [ ] Trade-off rationale is specific, not generic (references actual scores and tension pairs)
- [ ] Output format is compatible with import into Productboard or Jira roadmap view

---

### 9. Client Escalation Risk Predictor

**Purpose**
Client escalations are costly and often predictable in hindsight. Patterns — rising open ticket counts, unresolved alert quality complaints, unanswered emails, deployment health degradation — precede formal escalations by weeks. The Client Escalation Risk Predictor monitors these signals and generates a weekly risk score per client, allowing the Product and CS teams to intervene proactively.

**Core Capability**
Reads open Jira tickets per client, Slack message sentiment in client channels, deployment health metrics, and time-since-last-touchpoint data. Computes a weekly escalation risk score per client (Low / Medium / High / Critical). Surfaces the top 3 risk drivers for each high/critical client. Posts weekly digest to a designated Slack channel.

**Build Timeline**: 6-7 weeks

**Infrastructure Dependencies**
- Jira connector (read) — shared
- Slack connector (read) — shared
- Deployment health metrics API or database connector
- CRM connector (read) for relationship health signals
- LLM: Haiku for signal extraction; Sonnet for risk scoring rationale

**Risk Flags**
- False high-risk flags cause CS fatigue and desensitization. Mitigation: calibrate model against 6 months of historical escalation data before production deployment; set precision target above 70%.
- Client confidentiality: escalation risk data must not be shared outside authorized internal channels. Mitigation: output is posted only to an access-controlled internal Slack channel.

**Acceptance Criteria**
- [ ] Weekly risk scores generated for all active clients without manual trigger
- [ ] Top 3 risk drivers are specific and actionable (not generic)
- [ ] Historical backtesting shows 70%+ precision on High/Critical classifications
- [ ] Output restricted to designated access-controlled Slack channel

---

## P3 Agents: Months 9-12

### 10. Slides Agent

**Purpose**
Product Managers spend significant time reformatting content from PRDs, retros, and roadmap documents into presentation decks for executive reviews, client briefings, and board updates. The Slides Agent automates this: given a source document (PRD, roadmap export, retro), it generates a structured slide outline with recommended content per slide, which the PM populates into a presentation tool.

**Core Capability**
Accepts a Confluence document URL or pasted content. Identifies the document type (PRD, roadmap, retro, research brief). Applies the appropriate slide template logic (executive summary slide, problem/solution flow, timeline, key metrics). Outputs a structured JSON slide outline, or optionally populates a Google Slides template via API.

**Build Timeline**: 4-5 weeks

**Infrastructure Dependencies**
- Confluence connector (read) — shared
- Optional: Google Slides API connector
- LLM: Haiku for structure extraction; Sonnet for slide content generation

**Risk Flags**
- Slides Agent output quality is highly dependent on source document quality. Poorly structured PRDs produce incoherent slide outlines. Mitigation: gate Slides Agent on Requirement Documentation Agent adoption — if PRDs are consistently agent-generated from Agent 1, Slides Agent input quality is baseline-consistent.

**Acceptance Criteria**
- [ ] Slide outline generated from any Confluence PRD in under 2 minutes
- [ ] Outline contains correct number of slides for document type (5-8 for PRD, 3-5 for retro)
- [ ] No hallucinated metrics or data points — all numbers sourced from input document

---

### 11. Competitive Strategy Agent

**Purpose**
Maintaining awareness of competitor moves — new typology coverage, regulatory certifications, product announcements, partnership deals — is essential for FinCense positioning but is manually intensive. The Competitive Strategy Agent monitors defined competitor sources and generates a monthly competitive brief with positioning recommendations relative to FinCense's current capabilities.

**Core Capability**
Monitors a curated set of competitor web sources, LinkedIn, and regulatory certification announcements on a weekly crawl. Extracts product and capability signals. Maps signals against FinCense's capability matrix. Generates a monthly brief: new competitor capabilities, certification gaps, positioning statements, and recommended product responses.

**Build Timeline**: 6-8 weeks

**Infrastructure Dependencies**
- Web crawler / RSS monitor for competitor sources
- FinCense capability matrix (shared with Agent 7)
- LLM: Haiku for signal extraction; Sonnet for positioning synthesis

**Risk Flags**
- Competitive intelligence drawn from public sources may be incomplete or misleading. Mitigation: all competitor claims are labeled with source URL and date; no competitive claim is presented as confirmed without a cited source.
- Positioning recommendations may not account for confidential roadmap items. Mitigation: agent has read access to internal roadmap data to factor planned capabilities into recommendations.

**Acceptance Criteria**
- [ ] Monthly brief generated automatically covering all configured competitor sources
- [ ] Every competitor capability claim includes source URL and date
- [ ] Positioning recommendations reference both current FinCense capabilities and planned roadmap items
- [ ] Brief delivered to designated Slack channel or Confluence page on schedule

---

## 12-Month Build Sequence

| Month | Agent | Status | Key Milestone |
|-------|-------|--------|---------------|
| 1 | Infrastructure: vector DB + connectors (Jira, Confluence, Slack) | Build | Connector mesh live |
| 1-2 | Scenario Research Agent (#3) | Build | AFC typology library indexed; research briefs operational |
| 2-3 | Requirement Documentation Agent (#1) | Build | PRD drafts live in Confluence |
| 3-4 | Alert Quality Analyzer (#2) | Build | Alert quality reports operational for first pilot client |
| 4-5 | Meeting Digest Agent (#6) | Build | Digests posting to Confluence + Jira |
| 5-6 | PRD Impact Analyzer (#4) | Build | Impact scores live for all new PRDs |
| 6-7 | Product Gap Intelligence (#5) | Build | Weekly gap reports live |
| 7-8 | RFP Response Agent (#7) | Build | First pilot RFP response drafted by agent |
| 8-9 | Roadmap Trade-off Agent (#8) | Build | First scored roadmap recommendation delivered |
| 9-10 | Client Escalation Risk Predictor (#9) | Build | Weekly risk scores live for all active clients |
| 10-11 | Slides Agent (#10) | Build | Slide outlines from PRDs operational |
| 11-12 | Competitive Strategy Agent (#11) | Build | Monthly competitive brief live |

---

## Infrastructure Requirements

### Vector Database
**Recommended**: Pinecone (managed, serverless tier) or pgvector on Supabase if BrainOS already operates a Supabase instance.

Namespaces required:
- `typology-library`: Full AFC typology corpus, indexed by business ID, name, fincrime type, indicators
- `prd-history`: Historical PRDs from Confluence, chunked at section level
- `rfp-library`: Approved RFP responses, indexed by question category and capability area
- `regulatory-corpus`: FATF typologies, MAS notices, FinCEN advisories — 20+ documents minimum
- `gap-intelligence`: Jira feature requests and Slack product signals, rolling 6-month window

Estimated index size at launch: 500K-2M vectors. Pinecone serverless handles this within free/starter tier.

### Connector Requirements

| Connector | Agents | Access Level | Priority |
|-----------|--------|-------------|----------|
| Confluence | 1, 2, 4, 6, 7, 10, 11 | Read + Write | P0 |
| Jira | 1, 4, 5, 6, 8, 9 | Read + Write | P0 |
| Slack | 5, 6, 9, 11 | Read + Post | P0 |
| GitHub | 4 | Read | P1 |
| Google Slides | 10 | Write | P3 |
| CRM (Salesforce / HubSpot) | 9 | Read | P2 |
| Transcription API (AssemblyAI) | 6 | API call | P1 |

All connectors must be authenticated via OAuth 2.0 service accounts, not personal user tokens, to ensure session continuity and auditability.

### Knowledge Layer

The knowledge layer is the highest-risk dependency in the entire roadmap. An agent is only as good as the data it retrieves from. The following curation tasks are prerequisites to each agent tier:

- **Before P0 launch**: AFC typology library fully indexed; minimum 50 historical PRDs in vector store; PRD template pinned in Confluence
- **Before P1 launch**: FinCense module dependency map complete; live client deployment configuration registry available; 6 months of Jira feature requests indexed
- **Before P2 launch**: 30+ curated RFP responses indexed; FinCense capability matrix complete and maintained; 6 months of historical escalation data available for calibration

**Knowledge curation ownership must be assigned before the first agent goes live.** Unowned knowledge bases degrade and produce unreliable agent outputs within 60-90 days.

### Model Tier Requirements Per Agent

| Agent | Extraction / Classification | Synthesis / Generation | Notes |
|-------|----------------------------|----------------------|-------|
| 1 – Req Documentation | Haiku | Sonnet | Sonnet needed for PRD-quality prose |
| 2 – Alert Quality Analyzer | Haiku | Sonnet | Report narrative requires Sonnet |
| 3 – Scenario Research | Haiku | Sonnet | Synthesis over retrieved docs |
| 4 – PRD Impact Analyzer | Haiku | Sonnet | Impact reasoning requires Sonnet |
| 5 – Gap Intelligence | Haiku | Haiku | Clustering and ranking; Sonnet only for weekly summary |
| 6 – Meeting Digest | Haiku | Sonnet | Digest generation requires Sonnet |
| 7 – RFP Response | Haiku | Sonnet | Strict RAG; Sonnet for response quality |
| 8 – Roadmap Trade-off | Haiku | Sonnet | Trade-off rationale requires Sonnet |
| 9 – Escalation Predictor | Haiku | Haiku | Scoring is structured; Sonnet only for risk narrative |
| 10 – Slides Agent | Haiku | Sonnet | Slide content generation |
| 11 – Competitive Strategy | Haiku | Sonnet | Positioning synthesis |

Opus is not required for any agent in this roadmap. All tasks are retrieval-augmented generation or structured analysis — well within Sonnet's capability envelope.

---

## Build vs. Buy Analysis

| Agent | Decision | Recommended Vendor (if Buy/Hybrid) | Rationale |
|-------|----------|------------------------------------|-----------|
| 1 – Req Documentation | Build | — | Typology-aware context injection requires custom retrieval; no commercial tool has AFC library access |
| 2 – Alert Quality Analyzer | Build | — | FinCense alert schema is proprietary; no commercial tool supports it |
| 3 – Scenario Research | Build | — | AFC typology library is proprietary; core value is internal knowledge retrieval |
| 4 – PRD Impact Analyzer | Build | — | FinCense module-to-typology dependency map is internal; no commercial tool models it |
| 5 – Gap Intelligence | Hybrid | **Productboard** (feedback aggregation + roadmap mapping) | Build competitive urgency flag layer on top of Productboard AI; avoid rebuilding feedback aggregation |
| 6 – Meeting Digest | Hybrid | **Fireflies.ai** or **Otter.ai for Teams** | Evaluate commercial tools for transcription + basic digest; build only the product signal routing and Jira/Confluence write layer |
| 7 – RFP Response | Hybrid | **Responsive** (RFP library management) | Use Responsive for response library curation and search; build typology-grounded drafting layer on BrainOS |
| 8 – Roadmap Trade-off | Build | — | Requires output feeds from Agents 4 and 5; no commercial tool integrates across this data model |
| 9 – Escalation Risk Predictor | Build | — | Requires FinCense-specific deployment health data; no commercial CS health tool has this signal |
| 10 – Slides Agent | Build | — | Simple RAG-to-structure task; commercial tools (Beautiful.ai, Gamma) do not read from Confluence programmatically at required fidelity |
| 11 – Competitive Strategy | Hybrid | **Crayon** or **Klue** (competitive intelligence platforms) | Use Crayon/Klue for web monitoring and signal capture; build the FinCense capability mapping and positioning synthesis layer on BrainOS |

---

## Risk Register

| Risk | Agents Affected | Severity | Mitigation |
|------|----------------|----------|-----------|
| Hallucination in RFP or regulatory outputs — agent fabricates capability claims or regulatory references | 7 (RFP), 3 (Scenario Research) | Critical | Strict RAG-only mode for Agents 3 and 7; all claims must have retrieved source; unfounded questions flagged explicitly rather than answered generatively |
| Knowledge curation ownership unassigned — vector indices go stale within 60-90 days | All agents | High | Assign named owner per knowledge namespace before P0 launch; quarterly review cadence mandatory; agent outputs display data freshness date |
| Client alert data mishandled — PII in alert exports processed outside client data boundary | 2 (Alert Quality Analyzer) | Critical | Agent 2 must deploy in client-scoped compute environment; no alert data crosses client data boundary; data handling reviewed against each client's DPA before pilot |
| Data discipline gaps in PRD history — inconsistent historical PRDs produce low-quality few-shot examples | 1 (Req Documentation) | Medium | Curate and quality-review minimum 50 PRDs before indexing; reject structurally inconsistent documents from the index |
| Scoring rubric gaming on roadmap prioritization | 8 (Roadmap Trade-off) | Medium | Rubric weights locked by leadership; agent flags outlier score profiles for human review |
| Competitive intelligence currency — competitor claims become stale between monthly briefs | 11 (Competitive Strategy) | Medium | All competitive claims include source URL and crawl date; flag claims older than 90 days |
| Sequential agent dependency failures — P2 agents depend on P1 agents being operational | 8 (depends on 4, 5) | Medium | P2 agents cannot enter build phase until their P1 dependencies have passed acceptance criteria; track in project plan |
| Connector authentication fragility — personal OAuth tokens expire silently | All agents using connectors | High | All connectors use service account OAuth 2.0; set token expiry alerts; test connector health weekly |
| False high-risk escalation scores causing CS fatigue | 9 (Escalation Risk Predictor) | Medium | Backtest against 6 months of historical data; target 70%+ precision before production; human review required for all Critical-tier clients before outreach |
| PRD template drift — template changes in Confluence silently degrade Agent 1 output | 1 (Req Documentation) | Low | Pin template version; Confluence edit webhook alerts the agent pipeline owner |

---

## Acceptance Criteria Per Agent

### Agent 1 — Requirement Documentation Agent
- [ ] PRD draft generated from 200-word input in under 3 minutes
- [ ] All required template sections present in output
- [ ] Relevant AFC typology referenced where input touches AML/transaction monitoring
- [ ] Draft created in Confluence with "DRAFT - Agent Generated" label
- [ ] Open questions flagged in dedicated section

### Agent 2 — Alert Quality Analyzer
- [ ] Ingests and normalizes exports from 3+ FinCense schema versions
- [ ] Per-typology false positive rate computed for all 10 in-scope typology IDs (137, 139, 141, 143, 144, 146, 150, 219, 228, 1706)
- [ ] Threshold miscalibration correctly identified for money-in/out typologies in test data
- [ ] Age-based alerts (219, 228) segmented by customer age band
- [ ] No client PII in output report or logs

### Agent 3 — Scenario Research Agent
- [ ] Structured brief returned for any AFC typology ID within 60 seconds
- [ ] Brief includes: name, fincrime type, business ID, risk indicators, configuration notes
- [ ] Natural language query for e-wallet laundering surfaces typology 1706
- [ ] All regulatory references grounded in retrieved documents
- [ ] Index date watermark on every output

### Agent 4 — PRD Impact Analyzer
- [ ] Impact matrix generated from Confluence PRD URL in under 5 minutes
- [ ] Compliance re-certification risk correctly flagged for typology-definition changes
- [ ] Client deployment impact count accurate within 10%
- [ ] Review tier recommendation matches expert assessment in 80% of test cases

### Agent 5 — Product Gap Intelligence
- [ ] Weekly report generated automatically
- [ ] Top 10 gap clusters are semantically coherent
- [ ] Roadmap coverage status accurate for 90% of gaps
- [ ] Competitive urgency flags include source and date
- [ ] Report delivered to Slack/Confluence on schedule

### Agent 6 — Meeting Digest Agent
- [ ] Digest from 60-minute transcript generated in under 3 minutes
- [ ] Decisions, action items, open questions, product signals classified at 85% accuracy
- [ ] Jira tickets created for all action items
- [ ] Owner assignment accuracy above 80% where owner named in transcript

### Agent 7 — RFP Response Agent
- [ ] Every claim grounded in retrieved source with citation
- [ ] Unanswered questions explicitly flagged as "No source found"
- [ ] 20-question RFP drafted in under 10 minutes
- [ ] 90% of claims validated accurate by PM in pilot

### Agent 8 — Roadmap Trade-off Agent
- [ ] Ranked output for 5-20 roadmap candidates
- [ ] Trade-off rationale references actual scores and tension pairs
- [ ] Output compatible with Productboard or Jira roadmap import

### Agent 9 — Client Escalation Risk Predictor
- [ ] Weekly risk scores for all active clients without manual trigger
- [ ] Top 3 risk drivers specific and actionable
- [ ] 70%+ precision on High/Critical in historical backtest
- [ ] Output restricted to access-controlled Slack channel

### Agent 10 — Slides Agent
- [ ] Slide outline from Confluence PRD in under 2 minutes
- [ ] Correct slide count for document type (5-8 for PRD, 3-5 for retro)
- [ ] No hallucinated metrics — all numbers sourced from input document

### Agent 11 — Competitive Strategy Agent
- [ ] Monthly brief generated automatically
- [ ] Every competitor claim includes source URL and date
- [ ] Positioning recommendations reference both current capabilities and planned roadmap
- [ ] Brief delivered to designated channel on schedule

---

## Infrastructure Checklist

**Pre-P0 Launch (must be complete before first agent goes live)**
- [ ] Vector database provisioned (Pinecone serverless or pgvector on Supabase)
- [ ] Five vector namespaces created: typology-library, prd-history, rfp-library, regulatory-corpus, gap-intelligence
- [ ] AFC typology library fully indexed in typology-library namespace (all business IDs, names, fincrime types, indicators)
- [ ] Minimum 50 historical PRDs curated and indexed in prd-history namespace
- [ ] PRD template pinned in Confluence; template version recorded in agent config
- [ ] Confluence service account OAuth 2.0 configured with read + write scope
- [ ] Jira service account OAuth 2.0 configured with read + write scope
- [ ] Slack bot configured with read scope for designated channels + post scope for output channels
- [ ] Knowledge curation owner assigned per namespace with quarterly review commitment

**Pre-P1 Launch**
- [ ] GitHub service account OAuth 2.0 configured with read scope
- [ ] FinCense module-to-typology dependency map created and reviewed by engineering
- [ ] Live client deployment configuration registry accessible via API or structured export
- [ ] 6 months of Jira feature requests indexed in gap-intelligence namespace
- [ ] AssemblyAI or Whisper API key configured for transcription

**Pre-P2 Launch**
- [ ] 30+ approved RFP responses curated and indexed in rfp-library namespace
- [ ] FinCense capability matrix created, reviewed, and indexed
- [ ] CRM service account configured (Salesforce or HubSpot) with read scope
- [ ] 6 months of historical escalation data exported and available for Agent 9 calibration

**Pre-P3 Launch**
- [ ] Google Slides API service account configured (optional, for Agent 10)
- [ ] Competitive intelligence platform configured (Crayon or Klue) with BrainOS webhook integration
- [ ] All P0-P2 agents passing acceptance criteria and in stable operation

**Ongoing (post-launch)**
- [ ] Weekly vector index refresh for typology-library namespace scheduled
- [ ] Monthly knowledge curation review scheduled for all namespaces
- [ ] Connector token health check automated (weekly)
- [ ] Agent output quality review scheduled (monthly, per agent)
- [ ] Model cost monitoring dashboard live (Haiku vs. Sonnet usage per agent)
