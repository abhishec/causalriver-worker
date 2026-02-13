/**
 * NexusBrain Integration — Domain Metric Knowledge Bridge
 *
 * Bridges the NexusBrain causality engine to domain agents by providing
 * each agent with rich, domain-specific metric knowledge including:
 *   - Known causal relationships (upstream drivers, downstream effects)
 *   - Metric interaction patterns
 *   - Forecasting insights and lag structures
 *   - Confounder warnings and analysis caveats
 *
 * This knowledge is injected into agent prompts via `metricKnowledge` so
 * LLMs can reason about causal mechanisms rather than surface correlations.
 *
 * Self-contained: no imports from memory-stack packages. All knowledge is
 * statically defined here for the domain-agents package boundary.
 *
 * @example
 * ```typescript
 * import { getMetricKnowledgeForDomain } from "./nexus-brain-integration.ts";
 * const knowledge = getMetricKnowledgeForDomain('finance');
 * // Returns markdown-formatted causal knowledge for the finance domain
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

interface CausalRelationship {
  /** The upstream metric or factor */
  source: string;
  /** The downstream metric or factor */
  target: string;
  /** Direction of the effect */
  direction: "positive" | "negative" | "complex";
  /** Typical lag in days before effect manifests */
  lagDays: number;
  /** Estimated effect size (0-1 scale, how much variance explained) */
  effectSize: number;
  /** Human-readable explanation of the mechanism */
  mechanism: string;
}

interface MetricPattern {
  /** Pattern name */
  name: string;
  /** Which metrics are involved */
  metrics: string[];
  /** What the pattern means */
  description: string;
  /** When this pattern typically appears */
  conditions: string;
  /** What action to consider */
  implication: string;
}

interface ConfounderWarning {
  /** The relationship that appears causal */
  apparentCause: string;
  /** The apparent effect */
  apparentEffect: string;
  /** The hidden confounder */
  confounder: string;
  /** Why this matters */
  explanation: string;
}

interface DomainKnowledge {
  /** Domain identifier */
  domain: string;
  /** Display name */
  displayName: string;
  /** Role this domain plays in the organization */
  role: string;
  /** Key metrics this domain tracks */
  keyMetrics: string[];
  /** Known causal drivers (what drives this domain's metrics) */
  upstreamCauses: CausalRelationship[];
  /** Known downstream effects (what this domain's metrics drive) */
  downstreamEffects: CausalRelationship[];
  /** Intra-domain causal relationships */
  internalCausalChains: CausalRelationship[];
  /** Known metric interaction patterns */
  patterns: MetricPattern[];
  /** Forecasting insights */
  forecastingInsights: string[];
  /** Confounder warnings */
  confounderWarnings: ConfounderWarning[];
  /** Key risks to monitor */
  keyRisks: string[];
}

// ============================================================================
// DOMAIN KNOWLEDGE MAPS
// ============================================================================

const FINANCE_KNOWLEDGE: DomainKnowledge = {
  domain: "finance",
  displayName: "Finance (CFO)",
  role: "Financial health monitoring, cash management, collections, and unit economics oversight",
  keyMetrics: [
    "ARR", "MRR", "Gross Margin", "Net Burn", "Cash Runway (months)",
    "DSO (Days Sales Outstanding)", "Rule of 40", "LTV/CAC Ratio",
    "Burn Multiple", "Working Capital Ratio", "Revenue per Employee",
    "EBITDA Margin", "Quick Ratio", "CAC Payback (months)",
  ],
  upstreamCauses: [
    {
      source: "New Logo Bookings (Revenue)",
      target: "ARR Growth",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.65,
      mechanism: "New deals convert to recognized revenue after contract signing and onboarding, typically within 30 days",
    },
    {
      source: "Expansion Bookings (AM)",
      target: "Net Revenue Retention",
      direction: "positive",
      lagDays: 15,
      effectSize: 0.55,
      mechanism: "Upsells and cross-sells from existing accounts directly increase NRR and ARR without new CAC",
    },
    {
      source: "Logo Churn Rate (CS)",
      target: "Cash Flow",
      direction: "negative",
      lagDays: 60,
      effectSize: 0.45,
      mechanism: "Customer churn reduces recurring cash inflows with 60-day lag due to billing cycles and contract terms",
    },
    {
      source: "Client Health Score (CS)",
      target: "DSO",
      direction: "negative",
      lagDays: 45,
      effectSize: 0.35,
      mechanism: "Unhealthy clients delay payments; health score drops precede payment delinquency by ~45 days",
    },
    {
      source: "Project Delivery Delays (Services)",
      target: "Revenue Recognition",
      direction: "negative",
      lagDays: 30,
      effectSize: 0.30,
      mechanism: "Delayed milestones defer revenue recognition and can trigger payment holdbacks",
    },
    {
      source: "Marketing Spend Efficiency",
      target: "CAC Payback",
      direction: "negative",
      lagDays: 90,
      effectSize: 0.40,
      mechanism: "Inefficient marketing spend increases CAC, extending payback period and reducing cash efficiency",
    },
  ],
  downstreamEffects: [
    {
      source: "Cash Runway",
      target: "Hiring Capacity (People)",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.70,
      mechanism: "Cash constraints immediately affect headcount planning and hiring velocity",
    },
    {
      source: "DSO Increase",
      target: "Working Capital Stress",
      direction: "negative",
      lagDays: 7,
      effectSize: 0.60,
      mechanism: "Rising DSO directly reduces available working capital, creating operational pressure",
    },
    {
      source: "Gross Margin Decline",
      target: "Engineering Investment",
      direction: "negative",
      lagDays: 30,
      effectSize: 0.45,
      mechanism: "Margin compression leads to reduced R&D budgets, affecting product roadmap execution",
    },
  ],
  internalCausalChains: [
    {
      source: "Overdue AR",
      target: "DSO",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.85,
      mechanism: "Overdue invoices are the primary mechanical driver of DSO increases",
    },
    {
      source: "DSO",
      target: "Cash Runway",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.50,
      mechanism: "Higher DSO traps cash in receivables, reducing available runway",
    },
    {
      source: "Gross Margin",
      target: "Rule of 40",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.50,
      mechanism: "Gross margin is a direct component of Rule of 40 (growth + profitability)",
    },
  ],
  patterns: [
    {
      name: "Payment Delinquency Cascade",
      metrics: ["Client Health Score", "NPS", "Invoice Payment", "DSO"],
      description: "Health score drops predict NPS declines, which predict payment delays, which inflate DSO",
      conditions: "Health score drops > 15 points in 30 days",
      implication: "Intervene at health score stage; once payment delays start, collection costs increase 3x",
    },
    {
      name: "Expansion Revenue Efficiency",
      metrics: ["NRR", "Expansion Bookings", "ARR Growth", "LTV/CAC"],
      description: "Strong NRR (>110%) signals efficient growth because expansion has near-zero CAC",
      conditions: "NRR consistently above 110% over 3+ quarters",
      implication: "Shift more budget from new logo acquisition to AM-driven expansion",
    },
    {
      name: "Burn Multiple Warning",
      metrics: ["Net Burn", "Net New ARR", "Burn Multiple"],
      description: "Burn multiple (net burn / net new ARR) above 2x signals inefficient growth",
      conditions: "Burn multiple > 2x for 2+ consecutive quarters",
      implication: "Review all spend categories; typically hiring or marketing efficiency is the root cause",
    },
  ],
  forecastingInsights: [
    "ARR forecasts should incorporate pipeline-weighted bookings with a 30-day revenue recognition lag",
    "Cash flow forecasts must model DSO seasonality: Q4 payments often slip into Q1 due to client budget cycles",
    "Gross margin forecasts should account for services revenue mix: higher services % compresses margin",
    "When forecasting runway, model the worst-case DSO scenario (90th percentile) not the average",
    "Collection efficiency drops during client org changes; monitor client-side stakeholder transitions",
  ],
  confounderWarnings: [
    {
      apparentCause: "Collection calls",
      apparentEffect: "Faster payment",
      confounder: "Client fiscal year-end",
      explanation: "Payments often accelerate at client fiscal year-end regardless of collection efforts. Attributing payment to collections overstates collection team effectiveness",
    },
    {
      apparentCause: "High ARR Growth",
      apparentEffect: "Strong Financial Health",
      confounder: "Cash burn rate",
      explanation: "Companies can show strong ARR growth while burning cash unsustainably. Always evaluate growth alongside burn multiple and runway",
    },
  ],
  keyRisks: [
    "Customer concentration risk: if top 3 clients represent > 30% of ARR, churn of any one creates material impact",
    "DSO creep above 60 days signals systemic collection issues, not individual client problems",
    "Declining gross margin may indicate underpricing or services overdelivery, not just cost increases",
    "Late invoice generation (> 5 days after milestone) mechanically delays payment by the same amount",
  ],
};

const CS_KNOWLEDGE: DomainKnowledge = {
  domain: "cs",
  displayName: "Customer Success (VP CS)",
  role: "Client health monitoring, churn prevention, NPS management, and adoption oversight",
  keyMetrics: [
    "Health Score (composite)", "NPS", "CSAT", "Logo Churn Rate",
    "Revenue Churn Rate", "NRR (Net Revenue Retention)", "GRR (Gross Revenue Retention)",
    "Time to Value", "Product Adoption %", "Support Ticket Volume",
    "Ticket Resolution Time", "Escalation Rate", "QBR Completion Rate",
  ],
  upstreamCauses: [
    {
      source: "Product Feature Delays (Product)",
      target: "Client Health Score",
      direction: "negative",
      lagDays: 30,
      effectSize: 0.40,
      mechanism: "Missed feature commitments erode client trust and reduce health scores within 30 days of missed deadline",
    },
    {
      source: "Onboarding Quality (Services)",
      target: "Time to Value",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.55,
      mechanism: "Strong onboarding execution directly accelerates client time-to-value, setting the foundation for long-term health",
    },
    {
      source: "Engineering Reliability (Engineering)",
      target: "Support Ticket Volume",
      direction: "negative",
      lagDays: 3,
      effectSize: 0.50,
      mechanism: "Platform incidents and bugs generate support tickets within 1-3 days of occurrence",
    },
    {
      source: "AM Relationship Depth (AM)",
      target: "NPS",
      direction: "positive",
      lagDays: 60,
      effectSize: 0.35,
      mechanism: "Consistent AM engagement and proactive account management improve NPS over 60-day relationship cycles",
    },
    {
      source: "Invoice Disputes (Finance)",
      target: "Client Health Score",
      direction: "negative",
      lagDays: 7,
      effectSize: 0.25,
      mechanism: "Billing disputes create friction that rapidly degrades the client relationship",
    },
  ],
  downstreamEffects: [
    {
      source: "Client Health Score Drop",
      target: "Churn Probability",
      direction: "positive",
      lagDays: 90,
      effectSize: 0.70,
      mechanism: "Health score below 40 is the strongest single predictor of churn within 90 days",
    },
    {
      source: "NPS Decline",
      target: "Expansion Revenue (AM)",
      direction: "negative",
      lagDays: 45,
      effectSize: 0.45,
      mechanism: "Low NPS clients are 3x less likely to approve expansion deals; detractors actively block upsells",
    },
    {
      source: "Logo Churn",
      target: "ARR (Finance)",
      direction: "negative",
      lagDays: 30,
      effectSize: 0.80,
      mechanism: "Each churned client directly reduces ARR by their contract value, impacting financial forecasts",
    },
    {
      source: "Support Ticket Escalations",
      target: "Engineering Priority (Engineering)",
      direction: "positive",
      lagDays: 7,
      effectSize: 0.35,
      mechanism: "Repeated escalations force engineering to reprioritize roadmap toward stability fixes",
    },
  ],
  internalCausalChains: [
    {
      source: "Product Adoption %",
      target: "Health Score",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.55,
      mechanism: "Feature adoption is the strongest leading indicator of health score; low adoption predicts health decline",
    },
    {
      source: "Health Score",
      target: "NPS",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.60,
      mechanism: "Sustained health score changes predict NPS shifts at the next survey cycle",
    },
    {
      source: "Support Response Time",
      target: "CSAT",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.50,
      mechanism: "Response time above SLA directly reduces CSAT scores for that interaction",
    },
  ],
  patterns: [
    {
      name: "Silent Churn Signal",
      metrics: ["Login Frequency", "Feature Usage", "Support Tickets", "Health Score"],
      description: "Usage decline without support tickets is the most dangerous churn signal: the client has stopped trying",
      conditions: "Usage drops > 40% over 30 days with zero support tickets filed",
      implication: "Trigger proactive executive outreach immediately; silent disengagement has higher churn conversion than vocal complaints",
    },
    {
      name: "Post-Implementation Dip",
      metrics: ["Health Score", "CSAT", "Time Since Go-Live"],
      description: "Health scores commonly dip 10-20 points in the 30-60 day window after go-live as initial excitement fades and real-world friction emerges",
      conditions: "Go-live completed within last 30-60 days",
      implication: "This dip is normal and expected; intensify CSM engagement during this window rather than escalating",
    },
    {
      name: "NPS-to-Churn Waterfall",
      metrics: ["NPS Score", "Detractor Status", "Renewal Date", "Churn"],
      description: "NPS detractors (score < 7) with renewals within 90 days churn at 4x the rate of promoters",
      conditions: "NPS < 7 AND renewal within 90 days",
      implication: "Assign senior CSM and schedule executive sponsor meeting before renewal negotiation begins",
    },
  ],
  forecastingInsights: [
    "Health score trends over 60 days are more predictive than point-in-time scores; use rolling averages",
    "Churn forecasts should weight Q1 renewals higher: clients renewing in Q1 were sold in Q1 prior year during budget flush and may have inflated expectations",
    "NPS forecasts lag health score changes by ~30 days; use health score as leading indicator",
    "Seasonal support ticket spikes (January, post-summer) should be baselined separately from structural increases",
    "Multi-product clients churn at 40% lower rates; track product penetration as a churn risk factor",
  ],
  confounderWarnings: [
    {
      apparentCause: "CSM Activity Volume",
      apparentEffect: "Health Score Improvement",
      confounder: "Client Growth Phase",
      explanation: "Growing clients naturally improve in health metrics. CSM activity correlates with health improvement but the client's own growth trajectory may be the true driver",
    },
    {
      apparentCause: "Low Support Tickets",
      apparentEffect: "Client Satisfaction",
      confounder: "Client Disengagement",
      explanation: "Zero tickets can mean high satisfaction OR complete disengagement. Always cross-reference with usage data before interpreting ticket volume",
    },
  ],
  keyRisks: [
    "Champion departure: when the primary advocate leaves the client org, health can drop 30+ points within 60 days",
    "Competitive displacement often starts with a pilot in a secondary team before affecting the main contract",
    "Multi-year contracts mask churn risk; monitor usage and satisfaction throughout, not just near renewal",
    "Health score inflation from CSM gaming: ensure health score components include objective usage data, not just subjective CSM assessments",
  ],
};

const REVENUE_KNOWLEDGE: DomainKnowledge = {
  domain: "revenue",
  displayName: "Revenue / Sales (VP Sales)",
  role: "New logo pipeline management, deal velocity optimization, quota attainment, and sales efficiency",
  keyMetrics: [
    "Pipeline Value", "Pipeline Coverage Ratio", "Win Rate",
    "Average Deal Size", "Sales Cycle Length (days)", "Stage Conversion Rates",
    "Quota Attainment %", "New Logo Bookings", "Pipeline Velocity",
    "Stale Deal Count", "Demo-to-Close Rate", "CAC (New Logo)",
  ],
  upstreamCauses: [
    {
      source: "Marketing Qualified Leads (Marketing)",
      target: "Pipeline Value",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.55,
      mechanism: "MQLs entering pipeline convert to qualified opportunities within 14 days of handoff, directly driving pipeline value",
    },
    {
      source: "Product Capability Gaps (Product)",
      target: "Win Rate",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.35,
      mechanism: "Missing competitive features cause deal losses during evaluation; impact is immediate on win rate",
    },
    {
      source: "Engineering Reliability (Engineering)",
      target: "Deal Velocity",
      direction: "positive",
      lagDays: 7,
      effectSize: 0.25,
      mechanism: "Reliable demo environments and documented uptime SLAs accelerate technical evaluations",
    },
    {
      source: "Sales Headcount (People)",
      target: "Pipeline Generation",
      direction: "positive",
      lagDays: 120,
      effectSize: 0.60,
      mechanism: "New AEs require 90-120 day ramp before generating meaningful pipeline; hiring plans must lead quota targets by a quarter",
    },
    {
      source: "Customer References (CS)",
      target: "Win Rate",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.30,
      mechanism: "Strong customer references and case studies increase win rates by providing social proof during evaluation",
    },
  ],
  downstreamEffects: [
    {
      source: "New Logo Bookings",
      target: "ARR Growth (Finance)",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.65,
      mechanism: "Closed-won deals become recognized ARR after contract execution and initial onboarding",
    },
    {
      source: "New Clients Won",
      target: "Services Backlog (Services)",
      direction: "positive",
      lagDays: 7,
      effectSize: 0.50,
      mechanism: "Every new client creates implementation demand, adding to services delivery pipeline",
    },
    {
      source: "Deal Overcommitment",
      target: "Client Health (CS)",
      direction: "negative",
      lagDays: 90,
      effectSize: 0.40,
      mechanism: "Sales overcommitting on features or timelines creates expectation gaps that degrade health scores post-implementation",
    },
  ],
  internalCausalChains: [
    {
      source: "Pipeline Coverage",
      target: "Quota Attainment",
      direction: "positive",
      lagDays: 90,
      effectSize: 0.70,
      mechanism: "Pipeline coverage below 3x reliably predicts quota miss; this is the single most predictive operational metric",
    },
    {
      source: "Stage Conversion Rate",
      target: "Win Rate",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.65,
      mechanism: "Conversion rates at each stage compound to determine overall win rate",
    },
    {
      source: "Deal Age in Stage",
      target: "Win Probability",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.45,
      mechanism: "Deals stale in a stage > 14 days have declining win probability; at 30+ days, win rate drops below 15%",
    },
  ],
  patterns: [
    {
      name: "Hockey Stick Quarter",
      metrics: ["Monthly Bookings", "Quarter End", "Discount Rate"],
      description: "Over 50% of quarterly bookings closing in the final 2 weeks, often with elevated discounts",
      conditions: "End-of-quarter compression ratio > 2.5x",
      implication: "Indicates pipeline quality issues; deals are being pushed rather than pulled. Discounting erodes ACV and signals process problems",
    },
    {
      name: "Pipeline Starvation",
      metrics: ["Pipeline Coverage", "New Opportunity Creation", "Quota"],
      description: "Pipeline coverage drops below 2.5x with declining new opportunity creation rate",
      conditions: "Pipeline coverage < 2.5x AND new opps down > 20% MoM",
      implication: "Quota miss is nearly certain in 60-90 days; activate marketing demand programs and SDR campaigns immediately",
    },
    {
      name: "Win Rate Divergence",
      metrics: ["Win Rate by Rep", "Team Average Win Rate"],
      description: "Individual rep win rates diverging > 2 standard deviations from team mean",
      conditions: "Rep win rate > 2 sigma from mean over 30+ day window",
      implication: "High performers should be studied for replicable practices; low performers need coaching intervention within 2 weeks",
    },
  ],
  forecastingInsights: [
    "Pipeline coverage of 3x is the minimum for reliable forecasting; below 3x, expect a 70%+ chance of quota miss",
    "New AE ramp: budget zero productivity for month 1, 25% for month 2, 50% for month 3, 75% for month 4",
    "Deal stage aging: if a deal sits in any stage > 21 days, apply a 50% haircut to its forecast value",
    "Seasonal patterns: enterprise deals slow in July-August and December; SMB deals accelerate at quarter-end",
    "Forecast accuracy improves when weighted by stage AND deal age, not stage alone",
  ],
  confounderWarnings: [
    {
      apparentCause: "More Sales Activities",
      apparentEffect: "Higher Win Rates",
      confounder: "Deal Quality at Entry",
      explanation: "High-activity reps may appear to win more, but the true driver is often better deal qualification at pipeline entry. Activity volume without quality is noise",
    },
    {
      apparentCause: "Discounting",
      apparentEffect: "Faster Close",
      confounder: "Buyer Urgency",
      explanation: "Deals that close with discounts may have closed at full price anyway if buyer urgency was high. Discounting may be destroying margin without accelerating velocity",
    },
  ],
  keyRisks: [
    "Single-threaded deals (one contact) fail at 3x the rate of multi-threaded deals; track contact depth",
    "Pipeline created in final month of quarter rarely closes that quarter; it inflates next quarter coverage",
    "Competitive losses cluster: if 3+ deals lost to same competitor in 30 days, a systematic response is needed",
    "Enterprise deals with no executive sponsor identified by Stage 3 close at < 10%",
  ],
};

const AM_KNOWLEDGE: DomainKnowledge = {
  domain: "am",
  displayName: "Account Management (VP AM)",
  role: "Expansion revenue, renewal management, account growth, and strategic account planning",
  keyMetrics: [
    "Net Revenue Retention (NRR)", "Gross Revenue Retention (GRR)",
    "Expansion ARR", "Renewal Rate", "Upsell Pipeline",
    "Cross-Sell Penetration", "Contract Value Growth",
    "Multi-Product Adoption", "Account Penetration %",
    "Renewal Forecast Accuracy", "Logo Retention Rate",
  ],
  upstreamCauses: [
    {
      source: "Client Health Score (CS)",
      target: "Renewal Probability",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.65,
      mechanism: "Healthy clients (score > 70) renew at 95%+; unhealthy clients (< 40) renew at < 50%",
    },
    {
      source: "Product Feature Delivery (Product)",
      target: "Expansion Opportunity",
      direction: "positive",
      lagDays: 45,
      effectSize: 0.40,
      mechanism: "New features create upsell triggers; clients adopt new modules/capabilities within 45 days of release",
    },
    {
      source: "Services Delivery Quality (Services)",
      target: "Account Satisfaction",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.45,
      mechanism: "Successful project delivery builds trust that directly enables expansion conversations",
    },
    {
      source: "Payment History (Finance)",
      target: "Renewal Risk",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.30,
      mechanism: "Clients with overdue payment patterns are signaling budget or priority issues that affect renewal likelihood",
    },
  ],
  downstreamEffects: [
    {
      source: "Expansion Bookings",
      target: "NRR (Finance)",
      direction: "positive",
      lagDays: 15,
      effectSize: 0.70,
      mechanism: "Expansion revenue is the primary driver of NRR above 100%; each expansion directly improves net retention",
    },
    {
      source: "Renewal Churn",
      target: "ARR (Finance)",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.85,
      mechanism: "Non-renewals directly reduce ARR by the full contract value on the renewal date",
    },
    {
      source: "Multi-Product Adoption",
      target: "Client Stickiness (CS)",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.55,
      mechanism: "Clients using 3+ products churn at 60% lower rates; deeper adoption creates switching costs",
    },
  ],
  internalCausalChains: [
    {
      source: "QBR Completion",
      target: "Expansion Pipeline",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.40,
      mechanism: "Well-executed QBRs surface growth opportunities within 30 days; missed QBRs leave expansion revenue on the table",
    },
    {
      source: "Contract Utilization",
      target: "Renewal Risk",
      direction: "negative",
      lagDays: 60,
      effectSize: 0.50,
      mechanism: "Clients using < 50% of contracted capacity are 3x more likely to downsize at renewal",
    },
  ],
  patterns: [
    {
      name: "Expansion Window",
      metrics: ["Health Score", "Product Adoption", "Contract Anniversary"],
      description: "The 60-90 day window before contract anniversary is the optimal expansion conversation timing",
      conditions: "Health score > 65 AND product adoption > 60% AND renewal within 90 days",
      implication: "Initiate expansion discussion now; waiting until renewal negotiation reduces upsell success by 40%",
    },
    {
      name: "Contraction Signal",
      metrics: ["Usage Decline", "Support Escalations", "Stakeholder Changes"],
      description: "Usage declining + escalations rising + champion departure predicts contraction or churn at renewal",
      conditions: "Any 2 of 3 signals active simultaneously",
      implication: "Shift from expansion to retention mode; assign executive sponsor and develop save plan",
    },
  ],
  forecastingInsights: [
    "Renewal forecast accuracy improves dramatically when weighted by health score: healthy accounts forecast at 95% confidence, at-risk at 50%",
    "Expansion revenue takes 2 quarters to ramp from initial conversation to booking; start pipeline early",
    "Multi-year deal renewals have 15% higher retention rates than annual; consider contract structure in forecasting",
    "Net contraction (downsell at renewal) is often a precursor to full churn within 12 months; treat as a churn signal",
  ],
  confounderWarnings: [
    {
      apparentCause: "AM Outreach Frequency",
      apparentEffect: "Expansion Revenue",
      confounder: "Client Growth Stage",
      explanation: "Fast-growing clients expand naturally. AM outreach correlates with expansion but the client's own business growth is often the underlying cause",
    },
  ],
  keyRisks: [
    "Auto-renewal clauses can mask churn intent: client may not actively cancel but will churn at next opportunity",
    "Expansion in one product line can mask contraction in another; track net expansion per product",
    "Champion risk: 60% of churns follow within 6 months of primary contact departure",
    "Price increase sensitivity varies by segment: SMB tolerates < 5% annual; enterprise accepts up to 10% if value demonstrated",
  ],
};

const SERVICES_KNOWLEDGE: DomainKnowledge = {
  domain: "services",
  displayName: "Services (VP Services)",
  role: "Implementation delivery, project management, resource utilization, and go-live execution",
  keyMetrics: [
    "Project On-Time Delivery %", "Resource Utilization %",
    "Time to Go-Live (days)", "Milestone Completion Rate",
    "Project Margin", "Backlog (hours)", "CSAT (post-project)",
    "Change Order Rate", "Resource Allocation Coverage",
    "Active Projects per PM", "Delayed Project Count",
  ],
  upstreamCauses: [
    {
      source: "New Deal Volume (Revenue)",
      target: "Services Backlog",
      direction: "positive",
      lagDays: 7,
      effectSize: 0.60,
      mechanism: "New client wins create implementation demand within a week of contract signing",
    },
    {
      source: "Product Complexity (Product)",
      target: "Implementation Duration",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.45,
      mechanism: "Complex product configurations extend implementation timelines; each additional module adds 20-30% to project duration",
    },
    {
      source: "Headcount (People)",
      target: "Resource Utilization",
      direction: "complex",
      lagDays: 90,
      effectSize: 0.50,
      mechanism: "New consultants require 90-day ramp; understaffing drives utilization above sustainable levels (>85%), overstaffing drops margin",
    },
    {
      source: "Client Data Readiness",
      target: "Project Timeline",
      direction: "negative",
      lagDays: 14,
      effectSize: 0.55,
      mechanism: "Client delays in providing data, access, or decisions account for 60% of project delays",
    },
  ],
  downstreamEffects: [
    {
      source: "Go-Live Success",
      target: "Client Health (CS)",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.60,
      mechanism: "Clean go-lives set the foundation for strong client health; botched implementations create health debt that persists for quarters",
    },
    {
      source: "Project Delays",
      target: "Revenue Recognition (Finance)",
      direction: "negative",
      lagDays: 30,
      effectSize: 0.40,
      mechanism: "Milestone-based billing means delays defer revenue; significant delays may trigger contract penalties",
    },
    {
      source: "Resource Overload",
      target: "Employee Attrition (People)",
      direction: "positive",
      lagDays: 90,
      effectSize: 0.35,
      mechanism: "Sustained utilization above 85% leads to burnout and attrition within 90 days",
    },
  ],
  internalCausalChains: [
    {
      source: "Scope Creep",
      target: "Project Margin",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.60,
      mechanism: "Unmanaged scope changes consume hours without additional billing, directly eroding project margin",
    },
    {
      source: "PM-to-Project Ratio",
      target: "Delivery Quality",
      direction: "negative",
      lagDays: 14,
      effectSize: 0.45,
      mechanism: "PMs managing > 5 active projects simultaneously show 30% higher delay rates",
    },
  ],
  patterns: [
    {
      name: "Resource Crunch Cycle",
      metrics: ["Backlog", "Utilization", "Hiring Pipeline", "Attrition"],
      description: "High backlog drives overutilization, which drives attrition, which increases backlog further",
      conditions: "Utilization > 85% AND attrition > 15% annualized",
      implication: "Break the cycle by hiring ahead of demand or strategically delaying non-critical projects",
    },
    {
      name: "Implementation-to-Health Handoff Gap",
      metrics: ["Go-Live Date", "CSM Assignment", "Health Score"],
      description: "A gap of > 14 days between go-live and CSM engagement creates a health score dip",
      conditions: "CSM not assigned or inactive within 14 days of go-live",
      implication: "Formalize handoff process with mandatory CSM overlap during final implementation sprint",
    },
  ],
  forecastingInsights: [
    "Resource demand forecasts should model new bookings pipeline at 60% conversion with 90-day ramp-up for each new consultant",
    "Project duration estimates should add 25% buffer for client-caused delays (historical data shows this is the median overrun)",
    "Services revenue is front-loaded in implementation; forecast the taper as projects shift from implementation to support",
    "Seasonal patterns: project kickoffs slow in December and August; backlog builds during these periods",
  ],
  confounderWarnings: [
    {
      apparentCause: "More Resources",
      apparentEffect: "Faster Delivery",
      confounder: "Brooks's Law",
      explanation: "Adding people to a late project makes it later. Resource additions have a 30-day productivity drag before contributing positively",
    },
  ],
  keyRisks: [
    "Key person dependency: projects with a single expert create single points of failure",
    "Fixed-price projects with scope creep can turn negative margin; monitor change orders weekly",
    "Client delays are the #1 cause of missed go-lives but are often underreported to avoid blame",
    "Resource utilization is a lagging indicator; monitor backlog-to-capacity ratio as the leading signal",
  ],
};

const MARKETING_KNOWLEDGE: DomainKnowledge = {
  domain: "marketing",
  displayName: "Marketing (VP Marketing)",
  role: "Demand generation, lead pipeline, brand awareness, CAC optimization, and go-to-market execution",
  keyMetrics: [
    "Marketing Qualified Leads (MQLs)", "SQL Conversion Rate",
    "CAC (Customer Acquisition Cost)", "Magic Number",
    "Pipeline Contribution %", "Website Traffic", "Content Engagement",
    "Campaign ROI", "Brand Awareness Score", "Paid vs Organic Mix",
    "PLG Revenue %", "Lead Velocity Rate", "Marketing-Sourced Pipeline",
  ],
  upstreamCauses: [
    {
      source: "Product-Market Fit (Product)",
      target: "Organic Demand",
      direction: "positive",
      lagDays: 90,
      effectSize: 0.50,
      mechanism: "Strong PMF drives word-of-mouth and organic demand, reducing reliance on paid acquisition over 90 days",
    },
    {
      source: "Marketing Budget (Finance)",
      target: "Campaign Volume",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.60,
      mechanism: "Budget allocation directly controls campaign capacity; changes take 30 days to translate to pipeline impact",
    },
    {
      source: "Customer Success Stories (CS)",
      target: "Content Effectiveness",
      direction: "positive",
      lagDays: 45,
      effectSize: 0.30,
      mechanism: "Real customer outcomes power case studies and social proof that improve conversion rates",
    },
  ],
  downstreamEffects: [
    {
      source: "MQL Volume",
      target: "Sales Pipeline (Revenue)",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.55,
      mechanism: "MQLs convert to sales opportunities within 14 days of qualification and handoff to SDRs",
    },
    {
      source: "CAC Increase",
      target: "Unit Economics (Finance)",
      direction: "negative",
      lagDays: 30,
      effectSize: 0.45,
      mechanism: "Rising CAC degrades LTV/CAC ratio and extends payback period, directly impacting financial efficiency metrics",
    },
    {
      source: "Brand Awareness",
      target: "Inbound Pipeline Quality",
      direction: "positive",
      lagDays: 180,
      effectSize: 0.35,
      mechanism: "Brand investment has long time horizons (6+ months) but compounds: strong brands have 2x higher inbound conversion rates",
    },
  ],
  internalCausalChains: [
    {
      source: "Content Quality",
      target: "Organic Traffic",
      direction: "positive",
      lagDays: 60,
      effectSize: 0.40,
      mechanism: "SEO content takes 60-90 days to rank and drive organic traffic; this is the most cost-efficient channel over time",
    },
    {
      source: "Lead Scoring Accuracy",
      target: "SQL Conversion Rate",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.50,
      mechanism: "Better lead scoring directly improves MQL-to-SQL conversion by filtering out low-intent leads",
    },
  ],
  patterns: [
    {
      name: "CAC Creep",
      metrics: ["CAC", "Paid Spend", "Organic %", "Market Saturation"],
      description: "Steady CAC increase over 3+ quarters indicates market saturation or channel fatigue",
      conditions: "CAC up > 10% QoQ for 3 consecutive quarters",
      implication: "Shift budget from saturated paid channels to content/community/PLG motions; test new channels before existing ones fully fatigue",
    },
    {
      name: "Pipeline Source Shift",
      metrics: ["Marketing-Sourced %", "Sales-Sourced %", "Partner-Sourced %"],
      description: "Marketing pipeline contribution declining while total pipeline grows indicates sales team is compensating",
      conditions: "Marketing pipeline % declining for 2+ quarters",
      implication: "Investigate channel performance; may need strategy pivot from inbound to ABM or vice versa",
    },
  ],
  forecastingInsights: [
    "MQL forecasts should model channel-specific conversion rates; aggregate rates mask underperforming channels",
    "Paid channel diminishing returns: each 20% budget increase typically yields only 12-15% more leads (logarithmic curve)",
    "Content marketing ROI compounds over time but takes 6-9 months to mature; do not evaluate content programs on 90-day windows",
    "Marketing-sourced pipeline has a 45-day lag from campaign launch to qualified opportunity creation",
  ],
  confounderWarnings: [
    {
      apparentCause: "Last-Touch Campaign",
      apparentEffect: "Deal Won",
      confounder: "Multi-Touch Attribution",
      explanation: "Last-touch attribution overstates the impact of bottom-funnel campaigns. Deals are influenced by 7-12 touches across multiple channels; removing awareness campaigns may collapse the entire funnel",
    },
    {
      apparentCause: "More Marketing Spend",
      apparentEffect: "More Revenue",
      confounder: "Market Conditions",
      explanation: "Revenue growth during favorable market conditions may be attributed to marketing spend increases that were not the primary driver",
    },
  ],
  keyRisks: [
    "Over-reliance on a single paid channel (often Google or LinkedIn) creates fragility; diversify to 3+ channels",
    "MQL quality inflation: if SQL conversion drops while MQL volume rises, scoring criteria may have drifted",
    "Brand damage from customer experience issues cascades faster through social channels than marketing can respond",
    "Privacy regulation changes (cookie deprecation, GDPR enforcement) can degrade targeting effectiveness with little warning",
  ],
};

const PEOPLE_KNOWLEDGE: DomainKnowledge = {
  domain: "people",
  displayName: "People (VP People / HR)",
  role: "Talent acquisition, retention, culture, organizational design, and workforce planning",
  keyMetrics: [
    "Headcount (Current vs Plan)", "Attrition Rate (Annualized)",
    "Time to Hire (days)", "Offer Acceptance Rate",
    "Revenue per Employee", "Employee Engagement Score",
    "Manager-to-IC Ratio", "Training Completion %",
    "Internal Mobility Rate", "Diversity Metrics",
    "Compensation Competitiveness %", "Regrettable Attrition Rate",
  ],
  upstreamCauses: [
    {
      source: "Cash Runway (Finance)",
      target: "Hiring Plan",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.70,
      mechanism: "Runway constraints directly limit hiring velocity; < 12 months runway typically triggers hiring freeze",
    },
    {
      source: "Resource Overutilization (Services)",
      target: "Burnout / Attrition",
      direction: "positive",
      lagDays: 90,
      effectSize: 0.45,
      mechanism: "Sustained overwork drives burnout and regrettable attrition with a 90-day lag",
    },
    {
      source: "Revenue Growth Rate",
      target: "Headcount Growth Need",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.55,
      mechanism: "Revenue growth creates proportional (or greater) demand for customer-facing headcount",
    },
    {
      source: "Compensation Benchmarks (Market)",
      target: "Offer Acceptance Rate",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.50,
      mechanism: "Below-market compensation (< 75th percentile for tech) reduces offer acceptance rates significantly",
    },
  ],
  downstreamEffects: [
    {
      source: "Key Departures",
      target: "Project Delivery (Services)",
      direction: "negative",
      lagDays: 14,
      effectSize: 0.55,
      mechanism: "Critical employee departures disrupt projects within 2 weeks; knowledge transfer is rarely complete",
    },
    {
      source: "Hiring Velocity",
      target: "Pipeline Generation (Revenue)",
      direction: "positive",
      lagDays: 120,
      effectSize: 0.45,
      mechanism: "New sales hires take 90-120 days to ramp; hiring velocity directly forecasts pipeline capacity 4 months out",
    },
    {
      source: "Engineering Attrition",
      target: "Product Velocity (Product)",
      direction: "negative",
      lagDays: 30,
      effectSize: 0.60,
      mechanism: "Engineering departures reduce sprint velocity and create knowledge gaps that take months to fill",
    },
    {
      source: "Culture Health",
      target: "Employer Brand (Marketing)",
      direction: "positive",
      lagDays: 90,
      effectSize: 0.30,
      mechanism: "Strong internal culture generates positive Glassdoor reviews and employee advocacy that aids recruiting and brand",
    },
  ],
  internalCausalChains: [
    {
      source: "Manager Quality",
      target: "Team Attrition",
      direction: "negative",
      lagDays: 90,
      effectSize: 0.55,
      mechanism: "People leave managers, not companies. Manager effectiveness is the strongest predictor of team retention",
    },
    {
      source: "Onboarding Quality",
      target: "New Hire Productivity",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.45,
      mechanism: "Structured onboarding reduces time-to-productivity by 40% compared to unstructured approaches",
    },
  ],
  patterns: [
    {
      name: "Attrition Cascade",
      metrics: ["Departure Count", "Team Sentiment", "Subsequent Departures"],
      description: "Departures cluster: one senior departure triggers 2-3 additional departures within 90 days",
      conditions: "2+ departures from the same team within 30 days",
      implication: "Initiate immediate retention interventions for remaining team members; schedule 1:1s with flight-risk individuals",
    },
    {
      name: "Hiring-Revenue Lag",
      metrics: ["Sales Headcount", "Pipeline", "Revenue"],
      description: "Revenue impact of sales hiring has a 4-6 month lag; hiring pauses create revenue gaps 2 quarters later",
      conditions: "Sales hiring freeze or slowdown",
      implication: "Model the revenue impact of hiring changes 2 quarters forward; do not cut sales hiring based on current quarter performance",
    },
  ],
  forecastingInsights: [
    "Attrition forecasts should use rolling 90-day regrettable attrition rate, not annual totals which mask trends",
    "Each senior engineering departure costs 6-12 months of productivity when accounting for recruitment, onboarding, and knowledge transfer",
    "Hiring plan forecasts must model interview-to-offer conversion (typically 15-20%) and offer acceptance rates (typically 70-85%)",
    "Compensation adjustments have a 6-month half-life on retention impact; one-time adjustments without structural fixes fail",
  ],
  confounderWarnings: [
    {
      apparentCause: "Compensation Increase",
      apparentEffect: "Reduced Attrition",
      confounder: "Market Conditions",
      explanation: "Attrition may drop during market downturns regardless of compensation changes. Attributing retention to pay raises during a downturn overstates their impact",
    },
  ],
  keyRisks: [
    "Key-person risk in specialized roles (data engineering, security) is acute in small/mid-size companies",
    "Remote work policy changes are a top-3 driver of voluntary attrition in tech companies",
    "Diversity metrics that only track hiring fail to catch retention disparities across demographics",
    "Rapid hiring (> 30% headcount growth per quarter) dilutes culture and overwhelms onboarding capacity",
  ],
};

const PRODUCT_KNOWLEDGE: DomainKnowledge = {
  domain: "product",
  displayName: "Product (VP Product)",
  role: "Product roadmap execution, feature delivery, adoption tracking, and competitive positioning",
  keyMetrics: [
    "Feature Delivery On-Time %", "Product Adoption Rate",
    "Feature Usage (DAU/MAU by feature)", "Time to Adopt (days post-release)",
    "Roadmap Completion %", "Customer-Requested Features Delivered",
    "Technical Debt Ratio", "Release Cadence",
    "Feature Impact Score", "Activation Rate", "Stickiness Ratio (DAU/MAU)",
  ],
  upstreamCauses: [
    {
      source: "Engineering Velocity (Engineering)",
      target: "Feature Delivery",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.65,
      mechanism: "Sprint velocity directly determines how many features ship per cycle; velocity drops delay the entire roadmap",
    },
    {
      source: "Customer Feedback (CS)",
      target: "Roadmap Prioritization",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.40,
      mechanism: "Customer feedback aggregated from CS informs which features get prioritized, shaping the next quarter roadmap",
    },
    {
      source: "Competitive Pressure (Market)",
      target: "Roadmap Urgency",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.30,
      mechanism: "Competitive feature gaps create urgency that can override planned roadmap sequence",
    },
    {
      source: "Technical Debt (Engineering)",
      target: "Feature Delivery Speed",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.40,
      mechanism: "Accumulated technical debt slows new feature development by requiring workarounds and regression testing",
    },
  ],
  downstreamEffects: [
    {
      source: "Feature Delays",
      target: "Client Health (CS)",
      direction: "negative",
      lagDays: 30,
      effectSize: 0.40,
      mechanism: "Clients waiting for committed features experience trust erosion when deadlines slip",
    },
    {
      source: "Feature Delays",
      target: "Expansion Revenue (AM)",
      direction: "negative",
      lagDays: 45,
      effectSize: 0.35,
      mechanism: "Delayed features block upsell conversations that depend on new capabilities",
    },
    {
      source: "New Feature Launch",
      target: "Marketing Campaign Material",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.30,
      mechanism: "Feature launches provide content hooks for marketing campaigns and product marketing narratives",
    },
    {
      source: "Product Adoption",
      target: "Client Stickiness (CS)",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.55,
      mechanism: "Higher feature adoption creates switching costs and value realization that reduce churn risk",
    },
  ],
  internalCausalChains: [
    {
      source: "Feature Scope",
      target: "Delivery Timeline",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.60,
      mechanism: "Scope expansion without timeline adjustment is the primary cause of delivery delays",
    },
    {
      source: "Release Quality",
      target: "Adoption Rate",
      direction: "positive",
      lagDays: 7,
      effectSize: 0.50,
      mechanism: "Buggy releases suppress adoption; users who encounter bugs in first session have 70% lower adoption rates",
    },
  ],
  patterns: [
    {
      name: "Feature Adoption Cliff",
      metrics: ["Adoption Rate", "Days Since Release", "Documentation Quality"],
      description: "Features that do not reach 20% adoption within 30 days rarely achieve mainstream adoption",
      conditions: "Adoption < 20% at day 30 post-release",
      implication: "Invest in onboarding flows, in-app guidance, and CSM enablement rather than building the next feature",
    },
    {
      name: "Roadmap Debt Spiral",
      metrics: ["Technical Debt", "Sprint Velocity", "Feature Delays", "Customer Complaints"],
      description: "Skipping debt reduction to ship features creates a spiral: velocity drops, more delays, more pressure to skip debt work",
      conditions: "Technical debt allocations < 20% of sprint capacity for 3+ sprints",
      implication: "Enforce minimum 20% sprint allocation to technical debt; short-term velocity loss prevents long-term roadmap collapse",
    },
  ],
  forecastingInsights: [
    "Feature delivery forecasts should add 30% buffer for integration testing and edge cases; engineering estimates are systematically optimistic",
    "Adoption forecasts should model by persona: power users adopt in week 1, mainstream in weeks 4-6, laggards need CSM push",
    "Roadmap velocity forecasts should account for team composition: junior-heavy teams ship 40% less than senior-balanced teams",
    "Cross-feature dependencies are the hidden driver of delays; map dependency chains before committing dates",
  ],
  confounderWarnings: [
    {
      apparentCause: "More Features Shipped",
      apparentEffect: "Higher Customer Satisfaction",
      confounder: "Feature Quality and Relevance",
      explanation: "Shipping more features does not linearly increase satisfaction. Irrelevant or poorly designed features create clutter and support burden. Quality and relevance matter more than volume",
    },
  ],
  keyRisks: [
    "Feature parity pressure from sales can hijack the roadmap from strategic priorities to tactical requests",
    "Platform stability is invisible until it fails; reserve capacity for reliability even when feature pressure is high",
    "Mobile/API product investment often trails web, creating a growing capability gap that compounds over time",
    "Multi-tenant architecture shortcuts create scaling risks that emerge suddenly at 10x usage thresholds",
  ],
};

const ANALYST_KNOWLEDGE: DomainKnowledge = {
  domain: "analyst",
  displayName: "Analyst (Cross-Domain Intelligence)",
  role: "Cross-domain pattern detection, causal chain analysis, statistical insight synthesis, and strategic recommendation generation",
  keyMetrics: [
    "Cross-Domain Correlation Count", "Causal Chain Depth",
    "Pattern Confidence Score", "Insight Actionability Rating",
    "Cascade Path Length", "Anomaly Detection Count",
    "Dollar Impact of Discoveries", "Recommendation Adoption Rate",
  ],
  upstreamCauses: [
    {
      source: "All Domain Outputs",
      target: "Pattern Detection Quality",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.70,
      mechanism: "Analyst quality depends on completeness and accuracy of domain agent outputs; missing domains create blind spots",
    },
    {
      source: "Historical Data Depth",
      target: "Statistical Confidence",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.55,
      mechanism: "More historical data points increase statistical significance of discovered patterns and causal relationships",
    },
  ],
  downstreamEffects: [
    {
      source: "Cross-Domain Insights",
      target: "Executive Decision Quality",
      direction: "positive",
      lagDays: 7,
      effectSize: 0.50,
      mechanism: "Analyst discoveries surface hidden connections that enable better executive prioritization within a week",
    },
    {
      source: "Causal Chain Identification",
      target: "Root Cause Resolution Speed",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.45,
      mechanism: "Identified causal chains direct domain teams to root causes rather than symptoms, halving resolution time",
    },
  ],
  internalCausalChains: [
    {
      source: "Data Completeness",
      target: "Insight Quality",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.65,
      mechanism: "Missing data domains produce incomplete analysis; cross-domain patterns require all domains reporting",
    },
  ],
  patterns: [
    {
      name: "Domino Risk Chain",
      metrics: ["Service Delays", "Client Health", "Payment Delays", "Churn"],
      description: "Services delay -> CS health drop -> Payment delay -> Churn. This 4-step cascade has a 120-day total lag",
      conditions: "Services delays affecting > 3 clients simultaneously",
      implication: "Intervene at the earliest stage possible; cost of intervention increases 5x at each subsequent stage",
    },
    {
      name: "Growth-Efficiency Paradox",
      metrics: ["ARR Growth Rate", "Burn Multiple", "Sales Efficiency", "NRR"],
      description: "Companies optimizing for growth often degrade efficiency metrics, but the best outcomes come from growth AND efficiency",
      conditions: "ARR growth > 50% but burn multiple > 2x",
      implication: "Identify which growth investments have positive ROI vs. which are subsidizing uneconomic growth; not all ARR is equal",
    },
    {
      name: "Seasonal Blindness",
      metrics: ["Q4 Bookings", "Q1 Collections", "Q1 Churn"],
      description: "Q4 bookings rush creates Q1 hangover: rushed implementations, support overload, and collection delays",
      conditions: "Q4 bookings > 2x average quarter",
      implication: "Plan Q1 capacity for implementation and CS surge; forecast Q1 cash collection conservatively",
    },
  ],
  forecastingInsights: [
    "Cross-domain forecasts should propagate uncertainty: a revenue forecast that depends on marketing MQLs should compound both confidence intervals",
    "Cascade path analysis shows that CS health is the most frequent intermediary between operational issues and financial outcomes",
    "The strongest cross-domain signal in SaaS: Services NPS -> CS Health Score -> Renewal Rate -> ARR Retention (r-squared = 0.72)",
    "Multi-domain anomalies (3+ domains showing simultaneous deviations) indicate systemic issues, not coincidence",
  ],
  confounderWarnings: [
    {
      apparentCause: "Domain A Metric Change",
      apparentEffect: "Domain B Metric Change",
      confounder: "Seasonal or Market Conditions",
      explanation: "Cross-domain correlations discovered during seasonal shifts or market changes may not be causal. Validate with Granger causality tests using at least 90 days of data across multiple market conditions",
    },
    {
      apparentCause: "Single Point-in-Time Correlation",
      apparentEffect: "Causal Relationship",
      confounder: "Common Cause (Third Variable)",
      explanation: "Two metrics moving together at one point in time is not evidence of causation. Look for consistent temporal precedence (A changes BEFORE B) with adequate lag structure",
    },
  ],
  keyRisks: [
    "Over-fitting: patterns found in 6 months of data may not generalize; require at least 12 months for structural claims",
    "Survivorship bias: analyzing only current clients misses patterns from churned clients that could be most informative",
    "Simpson's paradox: aggregate trends can reverse when segmented by client size, industry, or cohort",
    "Alert fatigue: too many cross-domain alerts without prioritization causes executives to ignore all of them",
  ],
};

const ENGINEERING_KNOWLEDGE: DomainKnowledge = {
  domain: "engineering",
  displayName: "Engineering (VP Engineering / CTO)",
  role: "Platform reliability, development velocity, technical architecture, and engineering efficiency",
  keyMetrics: [
    "Sprint Velocity (story points)", "Deployment Frequency",
    "Lead Time for Changes", "Change Failure Rate",
    "Mean Time to Recovery (MTTR)", "Uptime / SLA Adherence",
    "Bug Escape Rate", "Technical Debt Index",
    "Code Review Turnaround", "Incident Count (P0/P1)",
    "Test Coverage %", "Infrastructure Cost per User",
  ],
  upstreamCauses: [
    {
      source: "Headcount (People)",
      target: "Sprint Velocity",
      direction: "positive",
      lagDays: 90,
      effectSize: 0.50,
      mechanism: "New engineers require 60-90 day ramp; short-term velocity may drop as existing engineers mentor new hires",
    },
    {
      source: "Product Scope Changes (Product)",
      target: "Sprint Disruption",
      direction: "negative",
      lagDays: 3,
      effectSize: 0.40,
      mechanism: "Mid-sprint scope changes create context switching costs that reduce velocity by 20-30%",
    },
    {
      source: "Technical Debt Accumulation",
      target: "Development Velocity",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.45,
      mechanism: "Every percentage point of technical debt index reduces effective velocity; debt compounds exponentially",
    },
    {
      source: "Incident Response Load",
      target: "Feature Development Time",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.35,
      mechanism: "On-call and incident response consumes engineering time that would otherwise go to feature work",
    },
  ],
  downstreamEffects: [
    {
      source: "Platform Incidents",
      target: "Client Health (CS)",
      direction: "negative",
      lagDays: 1,
      effectSize: 0.50,
      mechanism: "Outages and degradations immediately generate support tickets and erode client trust",
    },
    {
      source: "Sprint Velocity",
      target: "Feature Delivery (Product)",
      direction: "positive",
      lagDays: 14,
      effectSize: 0.65,
      mechanism: "Engineering velocity is the primary constraint on product roadmap delivery speed",
    },
    {
      source: "API/Integration Quality",
      target: "Implementation Speed (Services)",
      direction: "positive",
      lagDays: 7,
      effectSize: 0.35,
      mechanism: "Well-documented, reliable APIs reduce implementation effort and client integration timelines",
    },
    {
      source: "Deployment Reliability",
      target: "Sales Demo Quality (Revenue)",
      direction: "positive",
      lagDays: 0,
      effectSize: 0.25,
      mechanism: "Reliable demo environments prevent embarrassing failures during prospect evaluations",
    },
  ],
  internalCausalChains: [
    {
      source: "Test Coverage",
      target: "Change Failure Rate",
      direction: "negative",
      lagDays: 0,
      effectSize: 0.55,
      mechanism: "Higher test coverage catches regressions before deployment, directly reducing change failure rate",
    },
    {
      source: "Deployment Frequency",
      target: "Lead Time for Changes",
      direction: "negative",
      lagDays: 7,
      effectSize: 0.40,
      mechanism: "More frequent deployments with smaller batch sizes reduce lead time and risk per deployment",
    },
  ],
  patterns: [
    {
      name: "Incident-Debt Spiral",
      metrics: ["Incident Count", "Technical Debt", "Sprint Allocation to Debt", "Velocity"],
      description: "High incident counts consume time that should go to debt reduction, which increases incidents further",
      conditions: "P0/P1 incidents > 3/month AND debt allocation < 15%",
      implication: "Declare a stability sprint: freeze features for one sprint and focus entirely on reliability and debt reduction",
    },
    {
      name: "10x Engineer Departure Signal",
      metrics: ["Top Contributor", "PR Volume", "Knowledge Concentration", "Bus Factor"],
      description: "If a single engineer accounts for > 25% of meaningful PRs, their departure would be catastrophic",
      conditions: "Contributor concentration > 25% for any single engineer",
      implication: "Mandate knowledge sharing, pair programming, and documentation for concentrated knowledge areas",
    },
  ],
  forecastingInsights: [
    "Sprint velocity forecasts should use trailing 6-sprint average, not the best sprint; optimistic baselines create chronic under-delivery",
    "DORA metrics (deployment frequency, lead time, change failure rate, MTTR) are the strongest predictors of engineering health",
    "Infrastructure cost grows sub-linearly with users until architecture thresholds; forecast step-function increases at 10x/100x user milestones",
    "Team productivity follows a U-curve with team size: optimal team size is 5-7; above 9, coordination overhead degrades output",
  ],
  confounderWarnings: [
    {
      apparentCause: "More Deployments",
      apparentEffect: "More Incidents",
      confounder: "Deployment Quality and Size",
      explanation: "Smaller, more frequent deployments actually reduce risk. If incident rate rises with deployment frequency, the issue is deployment quality, not frequency itself",
    },
    {
      apparentCause: "Lines of Code",
      apparentEffect: "Productivity",
      confounder: "Code Quality and Impact",
      explanation: "LOC is not a productivity metric. Refactoring that removes code may create more value than new code. Measure outcomes, not output volume",
    },
  ],
  keyRisks: [
    "Knowledge silos: if only one engineer understands a critical system, the bus factor is 1 and risk is extreme",
    "Security vulnerabilities in dependencies can force emergency engineering work that disrupts all other priorities",
    "Cloud cost overruns often surprise finance; engineering must own and forecast infrastructure spend",
    "Monolith-to-microservice transitions can stall mid-way, creating the worst of both worlds (complexity without benefits)",
  ],
};

const EXECUTIVE_KNOWLEDGE: DomainKnowledge = {
  domain: "executive",
  displayName: "Executive (CEO/COO)",
  role: "Cross-functional strategy synthesis, board-level prioritization, organizational alignment, and risk oversight",
  keyMetrics: [
    "ARR", "ARR Growth Rate", "NRR", "Burn Multiple",
    "Rule of 40", "Cash Runway (months)", "Gross Margin",
    "Revenue per Employee", "CAC Payback Period",
    "Logo Churn Rate", "Pipeline Coverage", "Employee Engagement",
    "Cross-Domain Risk Score", "Strategic Initiative Progress",
  ],
  upstreamCauses: [
    {
      source: "All Domain Performance",
      target: "Company Health",
      direction: "complex",
      lagDays: 30,
      effectSize: 0.80,
      mechanism: "Executive metrics are the synthesis of all domain outputs; no single domain drives executive outcomes in isolation",
    },
    {
      source: "Market Conditions",
      target: "Growth Rate",
      direction: "complex",
      lagDays: 90,
      effectSize: 0.35,
      mechanism: "Macroeconomic conditions affect pipeline velocity, client budgets, and hiring markets with a 90-day lag",
    },
  ],
  downstreamEffects: [
    {
      source: "Strategic Decisions",
      target: "Resource Allocation (All Domains)",
      direction: "complex",
      lagDays: 14,
      effectSize: 0.70,
      mechanism: "Executive strategy decisions cascade to all domains through budget, headcount, and priority allocation",
    },
    {
      source: "Board Directives",
      target: "Operational Focus",
      direction: "complex",
      lagDays: 30,
      effectSize: 0.50,
      mechanism: "Board-level strategy shifts take 30 days to operationalize across the organization",
    },
  ],
  internalCausalChains: [
    {
      source: "Cross-Domain Alignment",
      target: "Execution Velocity",
      direction: "positive",
      lagDays: 30,
      effectSize: 0.55,
      mechanism: "When all domains share priorities, organizational friction drops and execution accelerates measurably",
    },
  ],
  patterns: [
    {
      name: "Rule of 40 Decomposition",
      metrics: ["ARR Growth %", "EBITDA Margin %", "Rule of 40 Score"],
      description: "Rule of 40 can be achieved through many growth/profitability combinations. The composition matters for valuation",
      conditions: "Any company tracking Rule of 40",
      implication: "Growth-weighted Rule of 40 (e.g., 35% growth + 5% margin) is valued 2-3x higher than profit-weighted (5% growth + 35% margin) by investors",
    },
    {
      name: "Organizational Whiplash",
      metrics: ["Strategic Priority Changes", "Employee Engagement", "Execution Quality"],
      description: "Changing strategic priorities more than once per quarter creates organizational whiplash that degrades execution",
      conditions: "Strategy direction changes > 1 per quarter",
      implication: "Commit to quarterly strategic themes and resist mid-quarter pivots unless existential; execution requires stability",
    },
    {
      name: "Cross-Silo Cascade Risk",
      metrics: ["Services Delays", "CS Health", "Collection Delays", "ARR Churn"],
      description: "The most dangerous risks traverse 3+ domains; no single VP sees the full chain",
      conditions: "3+ domain alerts simultaneously active",
      implication: "Institute weekly cross-functional stand-up when multi-domain alerts fire; break information silos",
    },
  ],
  forecastingInsights: [
    "Executive forecasts should be probability-weighted scenarios (best/base/worst), not single-point estimates",
    "The largest forecasting error source is not data quality but organizational optimism bias; apply 10-15% haircut to bottom-up forecasts",
    "Board metrics should be presented with trailing 4-quarter trend, not just QoQ, to separate signal from noise",
    "Cross-domain cascade risks amplify through the organization: a 10% issue in one domain can become a 25% impact in downstream domains",
  ],
  confounderWarnings: [
    {
      apparentCause: "Management Actions",
      apparentEffect: "Metric Improvement",
      confounder: "Mean Reversion",
      explanation: "Metrics that are unusually bad tend to improve naturally (regression to mean). Attributing improvement to management interventions launched during bad periods overstates leadership impact",
    },
    {
      apparentCause: "Hiring More People",
      apparentEffect: "Faster Execution",
      confounder: "Coordination Overhead",
      explanation: "Beyond certain thresholds, adding people creates more coordination overhead than productive output. Monitor revenue-per-employee alongside headcount growth",
    },
  ],
  keyRisks: [
    "Customer concentration: top 5 clients representing > 25% of ARR creates existential risk",
    "Single product dependency: companies without a second product face growth ceiling and competitive vulnerability",
    "Executive team gaps: missing VP-level leadership in any domain creates an organizational blind spot",
    "Board-management misalignment on growth vs profitability priorities creates strategic paralysis",
  ],
};

// ============================================================================
// KNOWLEDGE MAP REGISTRY
// ============================================================================

const DOMAIN_KNOWLEDGE_MAP: Record<string, DomainKnowledge> = {
  finance: FINANCE_KNOWLEDGE,
  cs: CS_KNOWLEDGE,
  revenue: REVENUE_KNOWLEDGE,
  am: AM_KNOWLEDGE,
  services: SERVICES_KNOWLEDGE,
  marketing: MARKETING_KNOWLEDGE,
  people: PEOPLE_KNOWLEDGE,
  product: PRODUCT_KNOWLEDGE,
  analyst: ANALYST_KNOWLEDGE,
  engineering: ENGINEERING_KNOWLEDGE,
  executive: EXECUTIVE_KNOWLEDGE,
};

// ============================================================================
// FORMATTER
// ============================================================================

function formatCausalRelationship(rel: CausalRelationship): string {
  const directionSymbol = rel.direction === "positive" ? "(+)" : rel.direction === "negative" ? "(-)" : "(~)";
  const effectPct = (rel.effectSize * 100).toFixed(0);
  return `- ${rel.source} -> ${rel.target} ${directionSymbol} | effect: ${effectPct}%, lag: ${rel.lagDays}d\n  Mechanism: ${rel.mechanism}`;
}

function formatPattern(pattern: MetricPattern): string {
  return `- **${pattern.name}** [${pattern.metrics.join(", ")}]\n  ${pattern.description}\n  Trigger: ${pattern.conditions}\n  Action: ${pattern.implication}`;
}

function formatConfounder(warning: ConfounderWarning): string {
  return `- CAUTION: "${warning.apparentCause} -> ${warning.apparentEffect}" may be confounded by "${warning.confounder}"\n  ${warning.explanation}`;
}

function formatDomainKnowledge(knowledge: DomainKnowledge): string {
  const sections: string[] = [];

  // Header
  sections.push(`## Metric Knowledge: ${knowledge.displayName}`);
  sections.push(`**Role:** ${knowledge.role}`);
  sections.push("");

  // Key Metrics
  sections.push("### Key Metrics");
  sections.push(knowledge.keyMetrics.map((m) => `- ${m}`).join("\n"));
  sections.push("");

  // Upstream Causal Drivers
  if (knowledge.upstreamCauses.length > 0) {
    sections.push("### Upstream Causal Drivers (What Drives This Domain)");
    sections.push("These are factors from other domains that causally influence this domain's metrics.");
    sections.push(knowledge.upstreamCauses.map(formatCausalRelationship).join("\n\n"));
    sections.push("");
  }

  // Downstream Effects
  if (knowledge.downstreamEffects.length > 0) {
    sections.push("### Downstream Effects (What This Domain Drives)");
    sections.push("Changes in this domain's metrics cascade to these downstream outcomes.");
    sections.push(knowledge.downstreamEffects.map(formatCausalRelationship).join("\n\n"));
    sections.push("");
  }

  // Internal Causal Chains
  if (knowledge.internalCausalChains.length > 0) {
    sections.push("### Internal Causal Chains");
    sections.push("Causal relationships between metrics within this domain.");
    sections.push(knowledge.internalCausalChains.map(formatCausalRelationship).join("\n\n"));
    sections.push("");
  }

  // Patterns
  if (knowledge.patterns.length > 0) {
    sections.push("### Known Metric Patterns");
    sections.push(knowledge.patterns.map(formatPattern).join("\n\n"));
    sections.push("");
  }

  // Forecasting Insights
  if (knowledge.forecastingInsights.length > 0) {
    sections.push("### Forecasting Insights");
    sections.push(knowledge.forecastingInsights.map((f) => `- ${f}`).join("\n"));
    sections.push("");
  }

  // Confounder Warnings
  if (knowledge.confounderWarnings.length > 0) {
    sections.push("### Confounder Warnings (Correlation vs Causation)");
    sections.push("These relationships APPEAR causal but may be confounded. Exercise caution.");
    sections.push(knowledge.confounderWarnings.map(formatConfounder).join("\n\n"));
    sections.push("");
  }

  // Key Risks
  if (knowledge.keyRisks.length > 0) {
    sections.push("### Key Risks to Monitor");
    sections.push(knowledge.keyRisks.map((r) => `- ${r}`).join("\n"));
    sections.push("");
  }

  return sections.join("\n");
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get markdown-formatted metric knowledge for a specific domain.
 *
 * Returns a comprehensive knowledge context containing:
 * - Key causal relationships (upstream causes and downstream effects)
 * - Known metric interaction patterns
 * - Forecasting insights
 * - Confounder warnings (correlation vs causation caveats)
 * - Key risks to monitor
 *
 * This output is designed to be injected into LLM prompts as grounding
 * context so domain agents can reason about causal mechanisms rather
 * than surface-level correlations.
 *
 * @param domain - The domain identifier (e.g., 'finance', 'cs', 'revenue')
 * @returns Markdown-formatted string with domain metric knowledge
 */
export function getMetricKnowledgeForDomain(domain: string): string {
  // Normalize domain name
  const normalizedDomain = domain.toLowerCase().trim();

  // Handle aliases
  const domainAliases: Record<string, string> = {
    "account-management": "am",
    "account_management": "am",
    "customer-success": "cs",
    "customer_success": "cs",
    "sales": "revenue",
    "hr": "people",
    "human-resources": "people",
    "ceo": "executive",
    "coo": "executive",
    "cfo": "finance",
    "cto": "engineering",
    "vp-sales": "revenue",
    "vp-cs": "cs",
    "vp-engineering": "engineering",
    "vp-product": "product",
    "vp-marketing": "marketing",
    "vp-people": "people",
    "vp-services": "services",
    "vp-am": "am",
  };

  const resolvedDomain = domainAliases[normalizedDomain] || normalizedDomain;
  const knowledge = DOMAIN_KNOWLEDGE_MAP[resolvedDomain];

  if (!knowledge) {
    return `## Metric Knowledge: ${domain}\n\nNo specialized metric knowledge available for domain "${domain}". Available domains: ${Object.keys(DOMAIN_KNOWLEDGE_MAP).join(", ")}.\n\nApply general causal reasoning principles:\n- Look for temporal precedence (A changes before B)\n- Distinguish correlation from causation\n- Consider confounders and common causes\n- Validate patterns with sufficient sample size (90+ days of data)\n`;
  }

  return formatDomainKnowledge(knowledge);
}

/**
 * Get the list of all domains that have metric knowledge available.
 */
export function getAvailableDomains(): string[] {
  return Object.keys(DOMAIN_KNOWLEDGE_MAP);
}

/**
 * Get raw domain knowledge object for programmatic use.
 * Returns undefined if domain is not found.
 */
export function getDomainKnowledgeRaw(domain: string): DomainKnowledge | undefined {
  const normalizedDomain = domain.toLowerCase().trim();
  return DOMAIN_KNOWLEDGE_MAP[normalizedDomain];
}
