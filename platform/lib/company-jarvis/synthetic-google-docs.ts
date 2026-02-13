/**
 * Company Jarvis — Synthetic Google Docs / Knowledge Base Generator
 *
 * Generates 50+ internal documents: strategy, product specs, meeting notes,
 * case studies, HR policies, competitive analysis, financial summaries.
 * Each document has realistic markdown content with hidden tensions embedded.
 */

import type { GoogleDocsData, GoogleDoc, DocCategory } from './types';
import { EMPLOYEES, COMPANY, CUSTOMER_COMPANIES, COMPETITORS, REGULATORY_BODIES, PRODUCT_MODULES, pick } from './constants';

// ─── Helpers ────────────────────────────────────────────────────────────────

let docCounter = 0;
function nextDocId(): string { return `DOC-${String(++docCounter).padStart(3, '0')}`; }

function dateStr(monthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
}

// ─── Document Templates ─────────────────────────────────────────────────

function strategyDocs(): GoogleDoc[] {
  return [
    {
      id: nextDocId(), title: 'Company Jarvis 2025 Strategic Plan',
      category: 'strategy', author: 'Rajesh Krishnamurthy', department: 'Leadership',
      createdDate: dateStr(10), lastModified: dateStr(2),
      confidentiality: 'confidential',
      tags: ['strategy', 'annual-plan', '2025'],
      mentions: ['Rajesh Krishnamurthy', 'Sarah Chen Wei Lin', 'Marcus Tan', 'Amanda Liu'],
      summary: 'Annual strategic plan targeting $15M ARR by end of 2025 through deepening APAC presence and launching AI-powered features.',
      keyInsights: [
        'Target: $15M ARR by Dec 2025 (47% growth from $10.2M)',
        'Primary growth lever: expand existing customer accounts (NRR >115%)',
        'Secondary growth: win 20+ new enterprise logos across 5 APAC markets',
        'Product investment: AI alert triage and multi-jurisdiction reporting',
        'Hiring plan: 15 new hires (8 engineering, 4 sales, 3 CS)',
      ],
      content: `# Company Jarvis 2025 Strategic Plan

## Vision
Become the leading AML compliance platform in APAC, serving 100+ financial institutions by 2027.

## Key Metrics
- **ARR Target**: $15M by Dec 2025 (from $10.2M current)
- **Customer Count**: 70+ active accounts (from ~50)
- **NRR**: >115% (currently ~112%)
- **Win Rate**: >45% (currently ~38%)
- **Headcount**: 102 (from 87)

## Strategic Priorities

### P1: Deepen Existing Customer Accounts
- Launch customer expansion playbook targeting accounts using <3 modules
- Assign expansion quota to CSMs ($2M total expansion target)
- Quarterly business reviews with all enterprise accounts

### P2: Win Enterprise Logos
- Focus on Tier 1 banks in each market (target 5 new enterprise wins)
- Invest in SOC 2 Type II certification (blocker for 3 deals)
- Build reference customer program with DBS and CTBC

### P3: Product Differentiation
- Ship AI-powered alert triage by Q2 (competitive requirement)
- Launch multi-jurisdiction reporting (MAS + BNM + FSC + AUSTRAC + BSP)
- Reduce false positive rate by 40% through ML improvements

### P4: Team & Culture
- Address engineering morale (engagement score 3.3/5)
- Invest in Taiwan team (localization, dedicated PM)
- Build sales enablement for competitive positioning

## Risks
- Engineering capacity is the primary bottleneck
- Competitive pressure from Napier AI and NICE Actimize accelerating
- Burn rate needs to stay below $800K/month for Series B positioning
- Taiwan and Australia markets need more investment than budgeted

## Budget Implications
- Total annual spend: ~$9.6M (burn: ~$800K/mo)
- Revenue: $10.2M → $15M (need ~$400K/mo new bookings)
- Runway: 18+ months at current burn with $14M in bank`,
    },
    {
      id: nextDocId(), title: 'Board Deck Q3 2025 Summary',
      category: 'board_deck', author: 'Rajesh Krishnamurthy', department: 'Leadership',
      createdDate: dateStr(3), lastModified: dateStr(2),
      confidentiality: 'board',
      tags: ['board', 'quarterly', 'Q3'],
      mentions: ['Rajesh Krishnamurthy', 'Amanda Liu', 'David Park'],
      summary: 'Q3 board deck highlights strong ARR growth but flags concerns around engineering attrition and Australia performance.',
      keyInsights: [
        'ARR grew 24% YoY to $10.2M',
        'Pipeline at $4.8M but win rate declined to 38%',
        'Engineering attrition: 2 departures, 4 more flagged as at-risk',
        'Australia market underperforming — 1.5x pipeline coverage',
        'Customer health: 5 accounts in critical status (need board awareness)',
      ],
      content: `# Board Deck — Q3 2025

## Highlights
- ARR: **$10.2M** (24% YoY growth)
- New logos: 8 this quarter (DBS expansion, GCash, Line Bank Taiwan)
- Product: Shipped sanctions screening v2, 30% faster processing

## Lowlights
- Win rate: **38%** (target 45%) — competitive losses to Napier AI
- Engineering: 2 departures, need to address attrition (engagement: 3.3/5)
- Australia: Pipeline at 1.5x coverage — will miss regional target
- Customer health: 5 critical accounts, $800K ARR at risk

## Key Discussion Points
- Series B timing: consensus needed on Q1 vs Q2 2026 raise
- India expansion: CEO advocates entry, team recommends waiting
- Engineering retention: proposal to invest $200K in retention packages
- Product velocity: sales-engineering alignment issue needs resolution`,
    },
    {
      id: nextDocId(), title: 'Series B Readiness Assessment',
      category: 'strategy', author: 'Amanda Liu', department: 'Finance',
      createdDate: dateStr(4), lastModified: dateStr(1),
      confidentiality: 'board',
      tags: ['fundraising', 'series-b', 'finance'],
      mentions: ['Amanda Liu', 'Rajesh Krishnamurthy'],
      summary: 'Assessment of Series B readiness — company needs 2-3 more quarters of execution before raising.',
      keyInsights: [
        'Need NRR >115% (currently 112%) for top-tier Series B',
        'Need 3 consecutive quarters of 40%+ ARR growth',
        'Burn rate must stay below $800K/month',
        'Need 2-3 more enterprise reference customers',
        'Target raise: $25-35M at $100-150M pre-money valuation',
      ],
      content: `# Series B Readiness Assessment

## Current Status: NOT YET READY (6-9 months away)

### What We Have
- $10.2M ARR, 24% YoY growth
- 50+ customers across 5 APAC markets
- Strong product-market fit in Singapore and Malaysia
- $14M cash in bank, 18-month runway

### What We Need
1. **NRR >115%**: Currently at 112%. Need expansion playbook and churn reduction.
2. **Consistent Growth**: Need 3 quarters of 40%+ growth (currently one quarter).
3. **Unit Economics**: CAC payback at 18 months — needs to be <14 months.
4. **Enterprise References**: Need 2-3 Tier 1 bank logos as references.
5. **Burn Discipline**: Stay below $800K/month to show capital efficiency.

### Target Timeline
- Q1 2026: Begin investor conversations
- Q2 2026: Close Series B ($25-35M raise)
- Valuation expectation: $100-150M pre-money (10-15x ARR)

### Risk Factors
- Engineering team instability could derail product roadmap
- Australia and Taiwan markets need more investment
- Competitive landscape is intensifying`,
    },
    {
      id: nextDocId(), title: 'India Expansion Feasibility Study',
      category: 'expansion_plan', author: 'Marcus Tan', department: 'Leadership',
      createdDate: dateStr(5), lastModified: dateStr(3),
      confidentiality: 'confidential',
      tags: ['india', 'expansion', 'market-entry'],
      mentions: ['Marcus Tan', 'Rajesh Krishnamurthy', 'Sarah Chen Wei Lin', 'David Park'],
      summary: 'Feasibility study for India market entry — recommends waiting 12 months due to resource constraints and current market priorities.',
      keyInsights: [
        'India AML market TAM: $2B+ (growing 25% YoY)',
        'RBI regulations significantly different from APAC — 4-6 months product work needed',
        'Would require $500K+ investment and 6-12 months to generate first revenue',
        'Recommendation: wait until APAC markets are fully developed',
        'CEO disagrees — sees window closing as competitors enter India',
      ],
      content: `# India Expansion Feasibility Study

## Executive Summary
India represents a massive AML compliance opportunity ($2B+ TAM) but entering now would stretch our resources and distract from underperforming APAC markets. **Recommendation: revisit in Q3 2026.**

## Market Opportunity
- TAM: $2.1B (growing 25% YoY)
- 150+ banks under RBI AML mandates
- Growing fintech sector (Paytm, PhonePe, Razorpay) needs compliance
- Competition: NICE Actimize, Tookitaki (India-native), SAS

## Challenges
- RBI regulations completely different from MAS/BNM/FSC/AUSTRAC/BSP
- Product localization: Hindi support, India-specific STR formats, UPI transaction monitoring
- Engineering estimate: **4-6 months of dedicated work** (2 engineers full-time)
- Sales cycle in India: 6-12 months for banks, requires local presence
- Cultural nuances in enterprise sales require experienced India team

## Resource Requirements
- Country Manager: $150K+ (must have banking relationships)
- 2 Engineers (localization): $200K
- Sales + CS: $150K
- Total Year 1 investment: **$500K+** before first revenue

## Arguments For (CEO position)
- First-mover advantage window may close in 12-18 months
- Our APAC brand could translate to India credibility
- RBI tightening regulations creates urgency in the market

## Arguments Against (COO + CTO + VP Sales position)
- Australia win rate at 25%, Taiwan needs localization — fix current markets first
- Engineering already at capacity — cannot spare 2 engineers
- Series B positioning requires focus and burn discipline
- India revenue won't materialize before Series B raise

## Recommendation
**WAIT.** Revisit India in Q3 2026 after achieving:
1. $15M ARR milestone
2. Series B funding secured
3. Australia and Taiwan markets stabilized`,
    },
    {
      id: nextDocId(), title: 'APAC AML Market Landscape 2025',
      category: 'strategy', author: 'James Mitchell', department: 'Marketing',
      createdDate: dateStr(7), lastModified: dateStr(4),
      confidentiality: 'internal',
      tags: ['market-analysis', 'apac', 'aml'],
      mentions: ['James Mitchell', 'David Park'],
      summary: 'Comprehensive analysis of the APAC AML compliance software market — $5.2B TAM growing at 18% CAGR.',
      keyInsights: [
        'APAC AML market: $5.2B TAM, 18% CAGR',
        'Regulatory tightening across all 5 markets driving demand',
        'Company Jarvis positioned as #4 in APAC behind Actimize, SAS, and ComplyAdvantage',
        'Key differentiator: APAC-native, multi-jurisdiction, API-first',
        'Biggest risk: Napier AI growing faster with better AI narrative',
      ],
      content: `# APAC AML Market Landscape 2025

## Market Size
- Total APAC AML compliance market: **$5.2B** (2025)
- Growth: **18% CAGR** through 2028
- Key drivers: regulatory tightening, digital banking expansion, crypto regulation

## Market by Country
| Country | Market Size | Growth | Key Drivers |
|---------|-----------|--------|-------------|
| Singapore | $850M | 15% | MAS strictest requirements, fintech hub |
| Malaysia | $420M | 20% | BNM digital bank licensing |
| Taiwan | $380M | 16% | FSC enforcement actions |
| Australia | $1.2B | 14% | AUSTRAC post-Westpac reforms |
| Philippines | $280M | 25% | BSP digital bank boom |

## Competitive Positioning
1. **NICE Actimize** — Enterprise leader, expensive, slow to implement
2. **SAS AML** — Strong in large banks, legacy architecture
3. **ComplyAdvantage** — Good data, weak in APAC presence
4. **Company Jarvis** — APAC-native, multi-jurisdiction, modern stack
5. **Napier AI** — Fastest growing, strong AI narrative, expanding into APAC
6. **Tookitaki** — Southeast Asia native, strong in India

## Our Position
- Strong in SG and MY
- Growing in TW and PH
- Weak in AU (losing to established vendors)
- Differentiation: only vendor purpose-built for multi-APAC compliance`,
    },
  ];
}

function productDocs(): GoogleDoc[] {
  return [
    {
      id: nextDocId(), title: 'Transaction Monitoring v3.0 Requirements',
      category: 'product_spec', author: 'Priya Nair', department: 'Product',
      createdDate: dateStr(6), lastModified: dateStr(2),
      confidentiality: 'internal',
      tags: ['product', 'transaction-monitoring', 'v3'],
      mentions: ['Priya Nair', 'Daniel Foo', 'Sarah Chen Wei Lin', 'Lim Jun Wei'],
      summary: 'Requirements for next-gen transaction monitoring engine with ML-powered alert triage and 50% false positive reduction.',
      keyInsights: [
        'Target: reduce false positives by 50% using ML model',
        'Real-time processing requirement (sub-100ms latency)',
        'Engineering estimate: 6-8 sprints (Q2-Q3 delivery)',
        'Sales has already promised Q1 delivery to 3 prospects — misalignment',
        'Dependencies: ML training data from existing customer base',
      ],
      content: `# Transaction Monitoring v3.0 — Requirements Document

## Problem Statement
Current TM engine produces too many false positives (industry average: 95% false positive rate). Customers spend excessive time triaging alerts manually. Competitors (Napier AI, ComplyAdvantage) are shipping AI-powered solutions.

## Requirements

### R1: ML-Powered Alert Triage
- Auto-classify alerts into: true positive, likely false positive, needs review
- Target: reduce manual review volume by 50%
- Training data: 18 months of labeled alerts from DBS and Maybank

### R2: Real-Time Processing
- Latency: <100ms per transaction
- Throughput: 10,000 TPS minimum
- Streaming architecture (replace current batch processing)

### R3: Multi-Jurisdiction Rules
- MAS, BNM, FSC, AUSTRAC, BSP threshold rules built-in
- Custom rule builder for institution-specific scenarios

## Engineering Estimate
- **6-8 sprints** (12-16 weeks)
- Requires: 2 ML engineers + 2 backend engineers full-time
- Realistic ship date: **Q3 2025**

## IMPORTANT NOTE
Sales team has communicated Q1 2025 delivery to at least 3 prospects (CTBC Bank, Westpac, GCash). This is a 6-month gap between promise and reality. VP Product has raised this with VP Sales — needs resolution.

## Dependencies
- ML training data pipeline (Vikram Singh)
- Customer consent for data usage in ML training
- GPU infrastructure for model training (DevOps)`,
    },
    {
      id: nextDocId(), title: 'AI-Powered Alert Triage RFC',
      category: 'product_spec', author: 'Daniel Foo', department: 'Product',
      createdDate: dateStr(5), lastModified: dateStr(3),
      confidentiality: 'internal',
      tags: ['ai', 'ml', 'alert-triage', 'rfc'],
      mentions: ['Daniel Foo', 'Deepak Sharma', 'Wu Cheng-Han'],
      summary: 'RFC for implementing ML-based alert categorization. Estimated 4-6 sprint effort. Key competitive requirement.',
      keyInsights: [
        'Napier AI already has this — we are behind',
        'Model architecture: gradient boosted trees + LSTM ensemble',
        'Training requires 500K+ labeled alerts (we have 320K)',
        'Need customer data sharing agreements for training',
        'ROI for customers: 60% reduction in compliance analyst time',
      ],
      content: `# RFC: AI-Powered Alert Triage

## Status: APPROVED — Waiting for engineering capacity

## Proposal
Implement ML model to auto-categorize AML alerts into risk tiers, reducing manual review volume by 60%.

## Architecture
- Ensemble: XGBoost (structured features) + LSTM (transaction sequences)
- Features: transaction amount, frequency, counterparty risk, geography, time patterns
- Output: risk score 0-100 + confidence + explanation

## Data Requirements
- Need 500K+ labeled alerts for training (currently have 320K)
- Gap: need data sharing agreements with 3+ customers
- Privacy: all training data must be anonymized

## Competitive Context
- Napier AI shipped this 6 months ago — cited in 3 of our lost deals
- ComplyAdvantage has similar capability in beta
- This is now table stakes for enterprise AML deals

## Timeline
- Model development: 4 sprints (8 weeks)
- Integration + testing: 2 sprints (4 weeks)
- **Total: 6 sprints, realistic ship Q2-Q3 2025**`,
    },
    {
      id: nextDocId(), title: 'API Gateway v2 Technical Design',
      category: 'product_spec', author: 'Sarah Chen Wei Lin', department: 'Engineering',
      createdDate: dateStr(8), lastModified: dateStr(5),
      confidentiality: 'internal',
      tags: ['api', 'architecture', 'technical-design'],
      mentions: ['Sarah Chen Wei Lin', 'Lim Jun Wei', 'Arun Patel'],
      summary: 'Technical design for API gateway overhaul — multi-tenant isolation, rate limiting, OAuth 2.0.',
      keyInsights: [
        'Current API gateway is a bottleneck for enterprise customers',
        'Multi-tenant isolation required for SOC 2 Type II compliance',
        'OAuth 2.0 + API key rotation needed for enterprise security',
        'Expected to unblock 3 stalled enterprise deals',
        'Engineering effort: 4 sprints',
      ],
      content: `# API Gateway v2 — Technical Design

## Motivation
Enterprise customers (Westpac, DBS, Cathay Financial) require:
1. Multi-tenant data isolation (SOC 2 Type II requirement)
2. OAuth 2.0 authentication (replacing API keys)
3. Per-customer rate limiting and usage analytics
4. Zero-downtime deployment support

## Architecture
- Kong Gateway + custom Lua plugins
- Per-tenant routing with namespace isolation
- JWT-based auth with automatic key rotation
- Real-time usage metrics dashboard

## Timeline: 4 sprints (8 weeks)
## Impact: Unblocks 3 enterprise deals worth $1.2M combined`,
    },
    {
      id: nextDocId(), title: 'Multi-Jurisdiction Regulatory Reporting Module',
      category: 'product_spec', author: 'Alicia Tay', department: 'Product',
      createdDate: dateStr(4), lastModified: dateStr(1),
      confidentiality: 'internal',
      tags: ['regulatory', 'reporting', 'multi-jurisdiction'],
      mentions: ['Alicia Tay', 'Lisa Huang', 'Chang Hsiao-Wen'],
      summary: 'Spec for native support of regulatory reporting across all 5 APAC jurisdictions — critical for Taiwan and Australia deals.',
      keyInsights: [
        'Taiwan (FSC) and Australia (AUSTRAC) reporting not yet natively supported',
        'Taiwan team has requested this 4 times — keeps getting deprioritized',
        '2 Taiwan deals lost due to this gap',
        'Engineering estimate: 3 sprints per jurisdiction',
        'Total: 6 sprints for TW + AU (critical markets)',
      ],
      content: `# Multi-Jurisdiction Regulatory Reporting Module

## Current State
- Singapore (MAS): Native support (complete)
- Malaysia (BNM): Native support (complete)
- Philippines (BSP): Basic support (needs enhancement)
- **Taiwan (FSC): NOT SUPPORTED (using manual workarounds)**
- **Australia (AUSTRAC): NOT SUPPORTED (using manual workarounds)**

## Business Impact
- Lost 2 deals in Taiwan due to FSC reporting gap ($280K)
- 3 Australian prospects require AUSTRAC native reporting
- Taiwan team morale impacted (raised issue 4 times, deprioritized each time)

## Requirements
- FSC STR format (Taiwan-specific fields, Mandarin support)
- AUSTRAC SMR/IFTI formats (Australian-specific reporting)
- Configurable report templates per jurisdiction
- Automated filing workflow with audit trail

## Engineering Estimate
- Taiwan (FSC): 3 sprints
- Australia (AUSTRAC): 3 sprints
- Total: 6 sprints (12 weeks)

## Priority
CRITICAL — This is blocking revenue in two key growth markets and affecting team morale in Taiwan.`,
    },
  ];
}

function meetingDocs(): GoogleDoc[] {
  return [
    {
      id: nextDocId(), title: 'Leadership Offsite Notes — January 2025',
      category: 'meeting_notes', author: 'Marcus Tan', department: 'Leadership',
      createdDate: dateStr(11), lastModified: dateStr(11),
      confidentiality: 'confidential',
      tags: ['leadership', 'offsite', 'strategy'],
      mentions: ['Rajesh Krishnamurthy', 'Sarah Chen Wei Lin', 'Marcus Tan', 'Amanda Liu', 'David Park', 'Priya Nair', 'James Mitchell'],
      summary: 'Annual leadership offsite — strategic disagreements on India expansion and resource allocation surfaced.',
      keyInsights: [
        'CEO wants India expansion, rest of leadership team opposes',
        'Engineering capacity is the biggest constraint mentioned',
        'Sales-product alignment was discussed as a recurring issue',
        'Agreed to invest in AI capabilities but debated timeline',
        'No consensus reached on India — deferred to board',
      ],
      content: `# Leadership Offsite Notes — January 2025

## Attendees
Rajesh, Sarah, Marcus, Amanda, David, Priya, James

## Key Discussion: India vs Deepening APAC
- **Rajesh**: India TAM is massive. If we wait, Tookitaki and others will own it. We need a beachhead.
- **Sarah**: We can't spare 2 engineers for India localization. Engineering is already stretched. We have tech debt and morale issues.
- **Marcus**: Our current markets aren't fully penetrated. Australia win rate is 25%. Fix what's broken first.
- **David**: I'd rather put resources into Australia and Philippines where we have traction.
- **Outcome**: No consensus. Rajesh will present to board for input.

## Action Items
- [ ] Rajesh: Prepare India business case for board
- [ ] Sarah: Propose engineering retention package
- [ ] David: Australia recovery plan by Feb 15
- [ ] Priya: Product-sales alignment process proposal
- [ ] Marcus: Series B readiness timeline

## Tensions Noted
- Sales is promising features without product input (3 instances cited)
- Taiwan team feels disconnected — needs dedicated attention
- Engineering morale at 3.3/5 — lowest of all departments`,
    },
    {
      id: nextDocId(), title: 'All-Hands Q2 2025 Summary',
      category: 'meeting_notes', author: 'Fiona Chew', department: 'People',
      createdDate: dateStr(6), lastModified: dateStr(6),
      confidentiality: 'internal',
      tags: ['all-hands', 'quarterly', 'Q2'],
      mentions: ['Rajesh Krishnamurthy'],
      summary: 'Company-wide all-hands with sanitized updates — positive framing of growth while glossing over challenges.',
      keyInsights: [
        'ARR milestone celebrated ($10M+)',
        'New hire announcements across engineering and sales',
        'Product roadmap preview was enthusiastically received',
        'No mention of engineering morale issues or Taiwan concerns',
        'Q&A was carefully managed — difficult questions deflected',
      ],
      content: `# All-Hands Q2 2025 — Summary

## Highlights (presented by Rajesh)
- Crossed **$10M ARR** milestone!
- 8 new customers this quarter
- Welcomed 6 new team members
- Product roadmap: AI alert triage coming soon

## Department Updates
- Engineering: "Making great progress on v3.0 platform"
- Sales: "Strong pipeline across all markets"
- CS: "Customer satisfaction remains a top priority"
- Marketing: "Record webinar attendance"

## Q&A Highlights
- Q: "When will we support FSC reporting natively?" — A: "It's on the roadmap, we're evaluating timing"
- Q: "Any plans for India?" — A: "We're always evaluating new markets"
- Q: "How's engineering capacity?" — A: "We're hiring to meet demand"

*Note: Several sensitive topics were addressed at a high level. Detailed discussions happen in department channels.*`,
    },
    {
      id: nextDocId(), title: 'Product-Engineering Alignment Meeting — August 2025',
      category: 'meeting_notes', author: 'Priya Nair', department: 'Product',
      createdDate: dateStr(4), lastModified: dateStr(4),
      confidentiality: 'internal',
      tags: ['product', 'engineering', 'alignment'],
      mentions: ['Priya Nair', 'Sarah Chen Wei Lin', 'Lim Jun Wei', 'Daniel Foo', 'David Park'],
      summary: 'Cross-functional meeting to address product-engineering-sales misalignment. Tension evident throughout.',
      keyInsights: [
        'Sales committed AI triage for Q1 — product says Q3 earliest',
        'Engineering frustrated by constantly changing priorities',
        'Agreed to create shared customer commitment tracker',
        'VP Sales acknowledged need for better process but pushed back on timeline',
        'Misalignment is directly causing lost deals and customer trust issues',
      ],
      content: `# Product-Engineering Alignment Meeting

## Date: August 2025
## Attendees: Priya, Sarah, Jun Wei, Daniel, David

## Issue
Recurring pattern: Sales makes customer delivery commitments without product/engineering input.

## Specific Examples Discussed
1. AI Alert Triage promised for Q1 to 3 prospects. Engineering estimate: Q3.
2. Custom reporting for Westpac promised in 4 weeks. Actual: 8 weeks.
3. Batch screening feature told to Maybank as "next month." Not on roadmap.

## David's Response
"Deals are time-sensitive. If I wait for product sign-off, we lose the moment. Customers want commitment, not 'we'll get back to you.'"

## Sarah's Response
"Every unplanned commitment steals capacity from the roadmap. We shipped 4 hotfixes last quarter because of rushed features. Quality is suffering."

## Agreed Actions
- [ ] Create customer commitment tracker (shared Notion board)
- [ ] VP Sales signs acknowledgment before any timeline commitment
- [ ] Monthly product-sales sync on active deal requirements
- [ ] Engineering gets 20% protected capacity for tech debt

## Unresolved
- David still pushing for faster response times on customer requests
- Sarah concerned 20% tech debt time will be eroded by urgent fixes
- No agreement on who has final say on customer timelines`,
    },
    {
      id: nextDocId(), title: 'Board Meeting Q2 2025 Minutes',
      category: 'meeting_notes', author: 'Amanda Liu', department: 'Finance',
      createdDate: dateStr(5), lastModified: dateStr(5),
      confidentiality: 'board',
      tags: ['board', 'minutes', 'Q2'],
      mentions: ['Rajesh Krishnamurthy', 'Amanda Liu'],
      summary: 'Q2 board meeting — growth praised but board expressed concern about burn rate and engineering retention.',
      keyInsights: [
        'Board praised ARR growth trajectory',
        'Board flagged burn rate trending above $800K/mo',
        'Board asked for engineering retention plan within 30 days',
        'Discussed Series B timing — board prefers Q1 2026',
        'India discussion: board suggested partnership model instead of direct entry',
      ],
      content: `# Board Meeting Q2 2025 — Minutes

## Key Decisions
1. **Series B Timeline**: Board prefers Q1 2026. Company must demonstrate 3 quarters of 40%+ growth.
2. **India**: Board recommends partnership/reseller model rather than direct entry. Revisit after Series B.
3. **Engineering Retention**: Board requests detailed retention plan within 30 days. "Losing engineers now would be catastrophic for Series B narrative."

## Financial Review
- ARR: $10.2M (24% YoY) — board pleased
- Burn: $820K/month — board concerned, asked to bring below $800K
- Cash: $14M — 17 months runway — acceptable but tight for Series B

## Board Asks
- Monthly engineering attrition report
- Competitive win/loss analysis presented quarterly
- Customer health dashboard for board visibility`,
    },
    {
      id: nextDocId(), title: 'Sales-Product Sync — October 2025',
      category: 'meeting_notes', author: 'Daniel Foo', department: 'Product',
      createdDate: dateStr(2), lastModified: dateStr(2),
      confidentiality: 'internal',
      tags: ['sales', 'product', 'sync'],
      mentions: ['Daniel Foo', 'David Park', 'Rachel Lim', 'Alyssa Thompson'],
      summary: 'Monthly sync between sales and product — frustration about roadmap pace and deal blockers.',
      keyInsights: [
        'Sales frustrated: 3 of top 5 lost deal reasons are product gaps',
        'SOC 2 Type II blocking 3 active deals worth $1.2M',
        'AI triage delay affecting competitive positioning',
        'Product pushback: already at maximum capacity, need to prioritize',
        'Agreed to quarterly prioritization with revenue-weighted scoring',
      ],
      content: `# Sales-Product Sync — October 2025

## Sales Frustrations (David, Rachel, Alyssa)
- "We lost Westpac because they need SOC 2 Type II. When is it happening?"
- "3 of our top 5 lost deal reasons are product gaps that are ON the roadmap but keep slipping"
- "Australia is dying. We can't sell to tier 1 banks without enterprise features"
- "AI triage was supposed to be our differentiator — Napier AI already has it"

## Product Response (Daniel)
- SOC 2 Type II: auditor engaged, ETA Q1 2026
- AI triage: engineering capacity is the bottleneck, Q2-Q3 realistic
- Multi-jurisdiction reporting: prioritizing Taiwan (FSC) first
- "We can't do everything at once. Help us prioritize by revenue impact"

## Action Items
- [ ] Revenue-weighted feature scoring model (Daniel + David to co-create)
- [ ] SOC 2 Type II accelerated timeline proposal (Marcus)
- [ ] Competitive battlecard update (James + sales team)`,
    },
  ];
}

function customerDocs(): GoogleDoc[] {
  return [
    {
      id: nextDocId(), title: 'Incident Post-Mortem: Maybank False Positive Spike',
      category: 'post_mortem', author: 'Lim Jun Wei', department: 'Engineering',
      createdDate: dateStr(3), lastModified: dateStr(3),
      confidentiality: 'internal',
      tags: ['incident', 'post-mortem', 'maybank', 'false-positive'],
      mentions: ['Lim Jun Wei', 'Arun Patel', 'Hafizah Ibrahim', 'Jennifer Wong'],
      summary: 'Post-mortem for v2.8 release that caused a 40% false positive spike affecting 12 customers including Maybank.',
      keyInsights: [
        'Root cause: threshold migration bug in v2.8 release',
        'Affected 12 customers, Maybank escalated to C-level',
        'Detection time: 6 hours (too slow — need better monitoring)',
        'Resolution time: 48 hours (rolled back + hotfix)',
        'Contributing factor: insufficient QA coverage for threshold logic',
      ],
      content: `# Incident Post-Mortem: Maybank False Positive Spike

## Timeline
- Day 0 (Mon 8am): v2.8 deployed to production
- Day 0 (2pm): First customer report of increased alerts (CIMB Bank)
- Day 0 (5pm): Maybank support team reports 40% increase in PEP screening alerts
- Day 1 (8am): Escalation from Maybank MLRO to our CEO
- Day 1 (11am): Root cause identified — threshold migration bug
- Day 1 (3pm): Hotfix deployed. Rolled back threshold changes.
- Day 2 (10am): All affected customers confirmed normal alert levels

## Root Cause
Bug in threshold migration script for v2.8. Default PEP screening thresholds were reset to factory defaults instead of preserving customer-specific tuning. Affected 12 customers who had customized thresholds.

## Impact
- 12 customers affected
- Maybank: 40% false positive increase, C-level escalation
- CIMB Bank, Public Bank: 25-30% increases
- Estimated customer analyst time wasted: 200+ hours

## Lessons Learned
1. Need threshold migration tests in CI pipeline
2. Need customer-facing monitoring dashboard for alert volume changes
3. Release process needs canary deployment (currently all-at-once)
4. QA coverage for configuration migration is insufficient`,
    },
    {
      id: nextDocId(), title: 'Case Study: DBS Bank — 60% Reduction in False Positives',
      category: 'case_study', author: 'Sophie Anderson', department: 'Marketing',
      createdDate: dateStr(7), lastModified: dateStr(5),
      confidentiality: 'public',
      tags: ['case-study', 'dbs', 'false-positive', 'marketing'],
      mentions: ['Darren Koh', 'Rachel Lim'],
      summary: 'Published case study on DBS Bank achieving 60% reduction in false positives after deploying Company Jarvis transaction monitoring.',
      keyInsights: [
        'DBS deployed TM + KYC modules in 2022',
        '60% false positive reduction in 6 months',
        '$2.1M annual savings in compliance analyst time',
        'Time to investigate per alert reduced from 45 minutes to 12 minutes',
        'DBS willing to serve as reference customer',
      ],
      content: `# Case Study: DBS Bank

## Challenge
DBS Bank's compliance team was overwhelmed by false positive alerts, spending 80% of their time on alerts that turned out to be legitimate transactions.

## Solution
Deployed Company Jarvis Transaction Monitoring and KYC/CDD modules with custom threshold tuning.

## Results (6 months)
- **60% reduction** in false positive alerts
- **$2.1M annual savings** in compliance operations
- Alert investigation time: **45 min → 12 min** per alert
- Compliance team capacity freed for genuine risk investigations

## Quote
"Company Jarvis transformed our AML operations. Our compliance team can now focus on real risks instead of chasing false alerts." — Head of Financial Crime, DBS Bank`,
    },
    {
      id: nextDocId(), title: 'Customer Advisory Board Meeting Notes — Q3 2025',
      category: 'meeting_notes', author: 'Jennifer Wong', department: 'Customer Success',
      createdDate: dateStr(3), lastModified: dateStr(3),
      confidentiality: 'confidential',
      tags: ['customer-advisory', 'feedback', 'product'],
      mentions: ['Jennifer Wong', 'Priya Nair', 'Daniel Foo'],
      summary: 'Quarterly customer advisory board with 8 enterprise customers — key feature requests and concerns captured.',
      keyInsights: [
        'Top request: AI-powered alert triage (6 of 8 customers)',
        'Taiwan and Australia customers want native regulatory reporting',
        'API performance is a concern for high-volume customers',
        'Customers want better integration with core banking systems',
        'Overall satisfaction: 3.8/5 (down from 4.1 in Q2)',
      ],
      content: `# Customer Advisory Board — Q3 2025

## Attendees
DBS Bank, Maybank, CTBC Bank, Westpac (prospect), GCash, Grab Financial, OCBC Bank, BDO Unibank

## Top Feature Requests (ranked by votes)
1. AI-powered alert triage (6 votes)
2. Multi-jurisdiction regulatory reporting (5 votes)
3. Real-time API for streaming transactions (4 votes)
4. Custom dashboard builder (3 votes)
5. Better core banking system integration (3 votes)

## Concerns Raised
- "False positive rate still too high" — multiple customers
- "Recent release (v2.8) caused issues — need more stability" — Maybank
- "Taiwan reporting is a pain point" — CTBC Bank
- "API latency spikes during peak hours" — DBS, Grab Financial

## Satisfaction Score
Overall: **3.8/5** (down from 4.1 in Q2)
- Product quality: 3.5/5
- Support responsiveness: 4.2/5
- Feature velocity: 3.3/5

## Action Items for Product
- Accelerate AI triage timeline
- Prioritize Taiwan FSC + Australia AUSTRAC reporting
- Publish API performance SLA commitments`,
    },
  ];
}

function hrDocs(): GoogleDoc[] {
  return [
    {
      id: nextDocId(), title: 'Org Chart & Team Structure — Q3 2025',
      category: 'hr_policy', author: 'Fiona Chew', department: 'People',
      createdDate: dateStr(3), lastModified: dateStr(1),
      confidentiality: 'internal',
      tags: ['org-chart', 'team', 'structure'],
      mentions: ['Fiona Chew'],
      summary: 'Current org structure across 5 APAC offices — 87 employees in 9 departments.',
      keyInsights: [
        'Engineering is largest department (22 people) across SG, TW, PH',
        'Sales spans all 5 countries with 10 team members',
        'Taiwan has 6 engineers but no dedicated PM or CSM',
        'Philippines team growing but still small (6 people)',
        '7 open positions across engineering, sales, and CS',
      ],
      content: `# Org Chart — Q3 2025

## Summary
- Total headcount: **87**
- Countries: SG (45), MY (8), TW (7), AU (8), PH (9), Remote (10)
- Departments: Engineering (22), Sales (10), CS (8), Product (6), Marketing (6), Ops (6), Finance (3), People (4), Leadership (7)
- Open positions: 7

## Key Notes
- Taiwan: 6 engineers + 1 sales. No dedicated PM or CSM. Flagged as under-resourced.
- Australia: 2 sales + 1 CS + 1 marketing + 1 ops. Sales coverage needs improvement.
- Philippines: Growing — added 4 people in 2023. Need 1 more sales + 1 CS for 2025.`,
    },
    {
      id: nextDocId(), title: 'Employee Engagement Survey Results — Q3 2025',
      category: 'hr_policy', author: 'Fiona Chew', department: 'People',
      createdDate: dateStr(3), lastModified: dateStr(2),
      confidentiality: 'confidential',
      tags: ['engagement', 'survey', 'morale', 'culture'],
      mentions: ['Fiona Chew', 'Rajesh Krishnamurthy', 'Sarah Chen Wei Lin'],
      summary: 'CRITICAL: Overall engagement at 3.6/5. Taiwan at 3.1, Engineering at 3.3. Attrition risk identified.',
      keyInsights: [
        'Overall engagement: 3.6/5 (target: 4.0)',
        'Singapore: 4.1/5 (strong)',
        'Taiwan: 3.1/5 (CRITICAL — lowest in company)',
        'Engineering: 3.3/5 (below threshold)',
        'Top concerns: workload, career growth, feeling heard',
      ],
      content: `# Employee Engagement Survey — Q3 2025

## Overall Score: 3.6/5 (Target: 4.0)

## By Office
| Office | Score | Trend |
|--------|-------|-------|
| Singapore | 4.1 | Stable |
| Malaysia | 3.8 | Slight decline |
| Taiwan | **3.1** | **Declining** |
| Australia | 3.7 | Stable |
| Philippines | 3.9 | Improving |

## By Department
| Department | Score | Key Concern |
|-----------|-------|-------------|
| Engineering | **3.3** | Workload, tech debt, career growth |
| Sales | 3.7 | Quota pressure, product gaps |
| Customer Success | 3.6 | Ticket volume, burnout |
| Product | 3.5 | Feeling pulled in too many directions |
| Marketing | 4.0 | Generally positive |
| Operations | 4.1 | Stable, well-managed |

## Top Concerns (open-ended responses)
1. "Constantly firefighting instead of building" — multiple engineers
2. "Taiwan feels like a second-class office" — TW team
3. "Career path is unclear beyond current role" — mid-level employees
4. "Too many last-minute customer commitments disrupting plans" — engineering + product
5. "Need better cross-office communication" — non-SG offices

## RECOMMENDED ACTIONS
1. **Immediate**: Schedule skip-level 1:1s with Taiwan team
2. **Q4**: Launch engineering career framework v2
3. **Q4**: Establish monthly cross-office virtual town hall
4. **Ongoing**: Address sales-engineering commitment process`,
    },
    {
      id: nextDocId(), title: 'Attrition Risk Analysis — Q3 2025',
      category: 'hr_policy', author: 'Fiona Chew', department: 'People',
      createdDate: dateStr(2), lastModified: dateStr(1),
      confidentiality: 'confidential',
      tags: ['attrition', 'retention', 'risk', 'engineering'],
      mentions: ['Fiona Chew', 'Sarah Chen Wei Lin', 'Lim Jun Wei'],
      summary: 'CONFIDENTIAL: 4 engineers identified as high attrition risk. Loss would significantly impact product roadmap.',
      keyInsights: [
        '4 engineers flagged as flight risks based on engagement scores + manager signals',
        'If all 4 leave, sprint velocity drops ~30%',
        'Retention cost estimate: $200K in equity refresh + retention bonuses',
        'Key risk: losing ML engineers would kill AI triage timeline',
        'Manager recommendation: act within 30 days',
      ],
      content: `# Attrition Risk Analysis — CONFIDENTIAL

## High-Risk Employees (Engineering)
Based on engagement survey scores, 1:1 feedback, and manager assessments:

1. **Siddharth Menon** (Full-Stack) — Score: 2.8/5. Frustrated with tech debt. Linkedin activity increased.
2. **Ahmad Firdaus** (Backend) — Score: 3.0/5. Workload concerns. Mentioned external opportunities to peers.
3. **Lin Ming-Hao** (Sr Backend, TW) — Score: 2.9/5. Feels TW office is ignored. Key Taiwan domain expert.
4. **Kai Wen Teo** (Backend) — Score: 3.1/5. Career growth stagnation. No promotion path discussed.

## Impact if Lost
- Sprint velocity: -30% estimated
- ML capability: At risk if Deepak Sharma also disengages
- Taiwan: Lin Ming-Hao is the only senior engineer in TW office
- Knowledge loss: 8+ years of combined domain expertise

## Recommended Actions
- Equity refresh grants ($50K per person, 2-year vest)
- Explicit career path conversations within 2 weeks
- Tech debt sprint allocation (20% protected time)
- Taiwan: dedicated PM assignment + office visit from leadership
- Total cost: ~$200K (vs $400K+ replacement cost if they leave)

## Timeline
**ACT WITHIN 30 DAYS.** Market for AML/compliance engineers is extremely hot.`,
    },
  ];
}

function competitiveAndFinancialDocs(): GoogleDoc[] {
  return [
    {
      id: nextDocId(), title: 'Napier AI vs Company Jarvis — Feature Comparison',
      category: 'competitive_analysis', author: 'Daniel Foo', department: 'Product',
      createdDate: dateStr(6), lastModified: dateStr(3),
      confidentiality: 'internal',
      tags: ['competitive', 'napier-ai', 'comparison'],
      mentions: ['Daniel Foo', 'David Park', 'James Mitchell'],
      summary: 'Head-to-head comparison with Napier AI — they lead on AI capabilities and UX, we lead on multi-jurisdiction and APAC presence.',
      keyInsights: [
        'Napier AI ahead on: AI alert triage, UX/UI, developer documentation',
        'Company Jarvis ahead on: multi-APAC jurisdiction, local language support, pricing',
        'Napier AI growing faster — raised $45M Series B',
        '3 lost deals cited Napier AI AI capabilities as deciding factor',
        'Closing the AI gap is critical competitive priority',
      ],
      content: `# Competitive Analysis: Napier AI vs Company Jarvis

## Feature Comparison
| Feature | Napier AI | Company Jarvis | Winner |
|---------|-----------|---------------|--------|
| AI Alert Triage | Yes (shipped) | No (Q3 roadmap) | Napier |
| Multi-jurisdiction | 3 markets | 5 APAC markets | CJ |
| UX/UI Quality | Modern, intuitive | Functional but dated | Napier |
| API Documentation | Excellent | Good | Napier |
| Local Language Support | English only | EN + ZH + MS | CJ |
| Pricing (enterprise) | $200K-$600K | $150K-$450K | CJ |
| Implementation Time | 8-12 weeks | 6-10 weeks | CJ |
| Customer Support | 9-5 UK hours | 24/7 APAC coverage | CJ |

## Competitive Losses to Napier AI (last 6 months)
1. E.SUN Bank (TW) — $180K — "AI capabilities more advanced"
2. Afterpay (AU) — $220K — "Better developer experience"
3. Funding Societies (SG) — $95K — "More modern platform feel"

## Strategic Response Needed
1. Accelerate AI triage to close the biggest gap
2. Invest in UX refresh for enterprise dashboard
3. Improve API documentation and developer portal
4. Leverage APAC-native positioning in messaging`,
    },
    {
      id: nextDocId(), title: 'NICE Actimize Enterprise Gap Analysis',
      category: 'competitive_analysis', author: 'Alyssa Thompson', department: 'Sales',
      createdDate: dateStr(8), lastModified: dateStr(5),
      confidentiality: 'internal',
      tags: ['competitive', 'nice-actimize', 'enterprise'],
      mentions: ['Alyssa Thompson', 'David Park'],
      summary: 'Analysis of why we lose to NICE Actimize in enterprise deals — brand, feature depth, and compliance certifications.',
      keyInsights: [
        'NICE Actimize wins on brand recognition and trust with large banks',
        'SOC 2 Type II gap is a dealbreaker for tier 1 banks',
        'Feature depth in case management and workflow automation is ahead',
        'Pricing: we are 30-50% cheaper but that is not enough for enterprise',
        'Recommendation: focus on mid-market and regional banks where we win',
      ],
      content: `# NICE Actimize — Enterprise Gap Analysis

## Why We Lose to Actimize
1. **Brand**: Decades of enterprise trust. Banks see them as "safe choice"
2. **SOC 2 Type II**: We don't have it. Dealbreaker for Westpac, ANZ, Macquarie
3. **Feature depth**: Case management, workflow automation, and audit trails are more mature
4. **Global coverage**: They support 60+ jurisdictions vs our 5

## Where We Win
- Speed of implementation (6 weeks vs 16 weeks)
- APAC-specific features and local support
- Modern API-first architecture
- 30-50% lower pricing

## Recommendation
Stop competing head-to-head with Actimize for Tier 1 banks until SOC 2 Type II is complete. Focus on Tier 2 banks and fintechs where our strengths matter more.`,
    },
    {
      id: nextDocId(), title: 'Q3 2025 Financial Review',
      category: 'financial_summary', author: 'Amanda Liu', department: 'Finance',
      createdDate: dateStr(2), lastModified: dateStr(1),
      confidentiality: 'confidential',
      tags: ['finance', 'quarterly', 'review'],
      mentions: ['Amanda Liu', 'Rajesh Krishnamurthy'],
      summary: 'Q3 financial review — revenue by country, burn rate trending above target, runway adequate but needs monitoring.',
      keyInsights: [
        'Total ARR: $10.2M (24% YoY)',
        'Revenue by country: SG 38%, MY 22%, TW 15%, AU 12%, PH 13%',
        'Burn rate: $820K/month (target: <$800K)',
        'Cash: $14M, runway: 17 months',
        'Need to reduce burn by $20K/month to hit Series B positioning target',
      ],
      content: `# Q3 2025 Financial Review

## Revenue
- ARR: **$10.2M** (24% YoY growth)
- MRR: **$850K**
- Revenue by Country:
  - Singapore: $3.88M (38%)
  - Malaysia: $2.24M (22%)
  - Taiwan: $1.53M (15%)
  - Australia: $1.22M (12%)
  - Philippines: $1.33M (13%)

## Expenses
- Total monthly burn: **$820K** (target: <$800K)
- People: $580K (71%)
- Infrastructure: $85K (10%)
- Marketing: $65K (8%)
- Office/Admin: $55K (7%)
- Travel: $35K (4%)

## Cash Position
- Cash in bank: **$14M**
- Monthly burn: $820K
- Runway: **17 months**
- Need: Reduce burn to $800K for Series B positioning

## Customer Unit Economics
- CAC: $18K (target: <$15K)
- LTV: $145K
- LTV/CAC Ratio: 8.1x (healthy)
- CAC Payback: 18 months (target: <14)`,
    },
    {
      id: nextDocId(), title: 'Company OKRs — H2 2025',
      category: 'okr', author: 'Marcus Tan', department: 'Leadership',
      createdDate: dateStr(5), lastModified: dateStr(2),
      confidentiality: 'internal',
      tags: ['okr', 'objectives', 'h2-2025'],
      mentions: ['Marcus Tan', 'Rajesh Krishnamurthy'],
      summary: 'H2 2025 company OKRs across growth, product, efficiency, and people objectives.',
      keyInsights: [
        'Growth O1: hit $12M ARR by Dec (currently $10.2M)',
        'Product O1: ship AI alert triage (currently behind schedule)',
        'Efficiency O1: burn rate below $800K/month',
        'People O1: engagement score to 3.8 (currently 3.6)',
        'Mid-quarter check: 2 of 4 objectives at risk',
      ],
      content: `# Company OKRs — H2 2025

## O1: GROWTH — Accelerate to $12M ARR
- KR1: Close $1.8M in new logos (currently: $720K — 40%)
- KR2: Expand 15 existing accounts by $800K total (currently: $320K — 40%)
- KR3: Win rate above 45% (currently: 38% — AT RISK)
- KR4: Australia pipeline to 3x coverage (currently: 1.5x — AT RISK)

## O2: PRODUCT — Ship key differentiators
- KR1: AI alert triage in production (currently: in development — BEHIND)
- KR2: Taiwan FSC reporting native support (currently: not started — AT RISK)
- KR3: SOC 2 Type II certification started (currently: auditor engaged — ON TRACK)
- KR4: False positive rate reduction by 30% (currently: 15% — PARTIAL)

## O3: EFFICIENCY — Series B ready operations
- KR1: Monthly burn below $800K (currently: $820K — AT RISK)
- KR2: CAC payback below 14 months (currently: 18 months — AT RISK)
- KR3: NRR above 115% (currently: 112% — BEHIND)

## O4: PEOPLE — Build a world-class team
- KR1: Engagement score 3.8+ (currently: 3.6 — BEHIND)
- KR2: Zero regrettable attrition in engineering (currently: 0 — ON TRACK)
- KR3: Fill all 7 open positions (currently: 3 filled — IN PROGRESS)
- KR4: Taiwan engagement score above 3.5 (currently: 3.1 — AT RISK)`,
    },
  ];
}

// ─── Main Generator ─────────────────────────────────────────────────────

export function generateGoogleDocsData(): GoogleDocsData {
  docCounter = 0;

  const documents: GoogleDoc[] = [
    ...strategyDocs(),
    ...productDocs(),
    ...meetingDocs(),
    ...customerDocs(),
    ...hrDocs(),
    ...competitiveAndFinancialDocs(),
  ];

  // Count by category
  const categoryCounts: Record<DocCategory, number> = {
    strategy: 0, product_spec: 0, meeting_notes: 0, case_study: 0,
    hr_policy: 0, competitive_analysis: 0, financial_summary: 0,
    expansion_plan: 0, okr: 0, post_mortem: 0, board_deck: 0,
  };
  for (const doc of documents) {
    categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1;
  }

  return { documents, categoryCounts };
}
