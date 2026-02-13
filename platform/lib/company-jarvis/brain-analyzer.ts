/**
 * Company Jarvis — Brain Analyzer
 *
 * Consumes all 4 synthetic data sources (Slack, HubSpot, Google Docs, Customers)
 * and produces:
 *   1. CompanyJarvisAnalysis — structured analysis for the copilot prompt
 *   2. TrainingPack-compatible data for seeding into the brain's DB tables
 *   3. ConnectorSignal[] for the cross_domain_signals table
 *
 * This is the intelligence engine that makes the generic copilot smart about
 * this specific organization.
 */

import type {
  SlackData,
  HubSpotData,
  GoogleDocsData,
  CustomerData,
  CompanyJarvisAnalysis,
  JarvisInsight,
  JarvisCausalRelationship,
  DepartmentScore,
  CountryPerformance,
  ReversePrompt,
  InsightSeverity,
  InsightDomain,
  Country,
} from './types';
import { COMPANY, EMPLOYEES, REGULATORY_BODIES, COMPETITORS, CUSTOMER_COMPANIES, OPEN_POSITIONS, rand } from './constants';

// ─── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number { return Math.round(n * 100) / 100; }
function pct(part: number, total: number): number { return total === 0 ? 0 : round2((part / total) * 100); }

// ─── KPI Computation ────────────────────────────────────────────────────────

function computeKPIs(
  slack: SlackData,
  hubspot: HubSpotData,
  docs: GoogleDocsData,
  customers: CustomerData,
): CompanyJarvisAnalysis['kpis'] {
  const wonDeals = hubspot.deals.filter(d => d.stage === 'closed_won');
  const totalWonValue = wonDeals.reduce((sum, d) => sum + d.amount, 0);
  const openDeals = hubspot.deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const totalPipeline = openDeals.reduce((sum, d) => sum + d.amount, 0);
  const weightedPipeline = openDeals.reduce((sum, d) => sum + d.amount * (d.probability / 100), 0);

  const lostDeals = hubspot.deals.filter(d => d.stage === 'closed_lost');
  const winRate = pct(wonDeals.length, wonDeals.length + lostDeals.length);
  const avgDealSize = wonDeals.length > 0 ? Math.round(totalWonValue / wonDeals.length) : 0;
  const avgDealCycle = wonDeals.length > 0
    ? Math.round(wonDeals.reduce((sum, d) => {
        const created = new Date(d.createdDate).getTime();
        const closed = new Date(d.actualCloseDate || d.closeDate).getTime();
        return sum + (closed - created) / (1000 * 60 * 60 * 24);
      }, 0) / wonDeals.length)
    : 0;

  // Customer metrics
  const totalCustomers = customers.accounts.length;
  const npsScores = customers.accounts.filter(a => a.npsScore !== null).map(a => a.npsScore!);
  const npsAvg = npsScores.length > 0 ? round2(npsScores.reduce((a, b) => a + b, 0) / npsScores.length) : 0;
  const csatScores = customers.accounts.filter(a => a.csatScore !== null).map(a => a.csatScore!);
  const csatAvg = csatScores.length > 0 ? round2(csatScores.reduce((a, b) => a + b, 0) / csatScores.length) : 0;

  // Slack activity
  const slackActivityIndex = round2(slack.messages.length / (COMPANY.headcount * 365));

  // Documentation coverage
  const documentationCoverage = round2(pct(docs.documents.length, 60)); // target 60 docs

  return {
    arr: COMPANY.arr,
    arrGrowth: round2(18 + Math.random() * 12), // 18-30% YoY
    mrr: COMPANY.mrr,
    totalPipeline,
    weightedPipeline: Math.round(weightedPipeline),
    winRate,
    avgDealSize,
    avgDealCycle,
    totalCustomers,
    churnRate: customers.nrrMetrics.churnRate,
    nrr: customers.nrrMetrics.netRevenueRetention,
    npsAvg,
    csatAvg,
    headcount: COMPANY.headcount,
    openPositions: OPEN_POSITIONS.length,
    supportTicketsOpen: customers.ticketSummary.totalOpen,
    avgResolutionHours: customers.ticketSummary.avgResolutionHours,
    slackActivityIndex,
    documentationCoverage,
  };
}

// ─── Insight Detection ──────────────────────────────────────────────────────

function detectInsights(
  slack: SlackData,
  hubspot: HubSpotData,
  docs: GoogleDocsData,
  customers: CustomerData,
  kpis: CompanyJarvisAnalysis['kpis'],
): JarvisInsight[] {
  const insights: JarvisInsight[] = [];
  const now = new Date().toISOString();
  let idx = 0;
  const id = () => `CJ-${String(++idx).padStart(3, '0')}`;

  // ── Pipeline Health ────────────────────────────────────────────────────

  const openDeals = hubspot.deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const stalledDeals = openDeals.filter(d => d.daysInCurrentStage > 60);
  if (stalledDeals.length > 0) {
    insights.push({
      id: id(), title: `${stalledDeals.length} deals stalled for 60+ days`,
      description: `${stalledDeals.length} deals worth $${Math.round(stalledDeals.reduce((s, d) => s + d.amount, 0) / 1000)}K have been stuck in their current stage for over 60 days. Companies: ${stalledDeals.slice(0, 3).map(d => d.companyName).join(', ')}. This represents dead weight in the pipeline.`,
      severity: 'warning', domain: 'sales',
      sources: stalledDeals.map(d => `hubspot:deal-${d.id}`),
      recommendation: 'Schedule executive intervention calls for each stalled deal. If no progress in 2 weeks, move to closed-lost to clean pipeline.',
      impact: 'high', confidence: 0.92, detectedAt: now,
      isHidden: false, reversePromptWorthy: true,
    });
  }

  // Pipeline coverage by region
  const auDeals = openDeals.filter(d => d.country === 'AU');
  const auPipeline = auDeals.reduce((s, d) => s + d.amount, 0);
  const auQuota = 2_800_000; // combined AU quota
  const auCoverage = auPipeline / auQuota;
  if (auCoverage < 2.0) {
    insights.push({
      id: id(), title: 'Australia pipeline coverage critically low',
      description: `Australia pipeline is at ${round2(auCoverage)}x coverage ($${Math.round(auPipeline / 1000)}K pipeline vs $${Math.round(auQuota / 1000)}K quota). Best practice is 3x. With current win rate of ${kpis.winRate}%, Australia will miss quota by ~${Math.round((1 - auCoverage / 3) * 100)}%.`,
      severity: 'critical', domain: 'sales',
      sources: ['hubspot:au-pipeline', 'hubspot:au-quota'],
      recommendation: 'Increase AU top-of-funnel immediately. Consider AU-specific marketing campaign, regional partnership, or redeploying SDR capacity.',
      impact: 'high', confidence: 0.88, detectedAt: now,
      isHidden: false, reversePromptWorthy: true,
    });
  }

  // Win rate declining
  if (kpis.winRate < 40) {
    insights.push({
      id: id(), title: `Win rate at ${kpis.winRate}% — below 40% threshold`,
      description: `Overall win rate has declined to ${kpis.winRate}%. The primary loss reasons are: ${hubspot.pipelineSummary.lossReasons.slice(0, 3).map(r => `${r.reason} (${r.count} deals, $${Math.round(r.totalValue / 1000)}K)`).join('; ')}. Competitive losses to ${COMPETITORS[0]} and ${COMPETITORS[2]} are the biggest factor.`,
      severity: 'warning', domain: 'sales',
      sources: ['hubspot:win-rate', 'hubspot:loss-reasons'],
      recommendation: 'Conduct win/loss analysis interviews. Update competitive battlecards. Consider product investments to close feature gaps cited in lost deals.',
      impact: 'high', confidence: 0.85, detectedAt: now,
      isHidden: false, reversePromptWorthy: false,
    });
  }

  // ── Customer Health ────────────────────────────────────────────────────

  const criticalAccounts = customers.accounts.filter(a => a.healthScore === 'critical');
  const atRiskAccounts = customers.accounts.filter(a => a.healthScore === 'at_risk');
  if (criticalAccounts.length + atRiskAccounts.length > 5) {
    const totalAtRiskValue = [...criticalAccounts, ...atRiskAccounts].reduce((s, a) => s + a.contractValue, 0);
    insights.push({
      id: id(), title: `${criticalAccounts.length + atRiskAccounts.length} customers at risk — $${Math.round(totalAtRiskValue / 1000)}K ARR exposed`,
      description: `${criticalAccounts.length} critical and ${atRiskAccounts.length} at-risk accounts. Critical accounts: ${criticalAccounts.slice(0, 3).map(a => a.name).join(', ')}. Combined at-risk ARR: $${Math.round(totalAtRiskValue / 1000)}K (${pct(totalAtRiskValue, COMPANY.arr)}% of total ARR).`,
      severity: 'critical', domain: 'customer_success',
      sources: criticalAccounts.map(a => `customer:${a.id}`),
      recommendation: 'Execute account recovery playbook for critical accounts. Schedule QBRs with exec sponsors. Prioritize bug fixes affecting these accounts.',
      impact: 'high', confidence: 0.90, detectedAt: now,
      isHidden: false, reversePromptWorthy: true,
    });
  }

  // Upcoming renewals at risk
  const now_ms = Date.now();
  const urgentRenewals = customers.accounts.filter(a => {
    const renewalMs = new Date(a.renewalDate).getTime();
    const daysUntilRenewal = (renewalMs - now_ms) / (1000 * 60 * 60 * 24);
    return daysUntilRenewal < 60 && daysUntilRenewal > 0 && a.healthScoreNumeric < 50;
  });
  if (urgentRenewals.length > 0) {
    insights.push({
      id: id(), title: `${urgentRenewals.length} at-risk renewals in next 60 days`,
      description: `${urgentRenewals.length} customers with health score below 50 renewing within 60 days: ${urgentRenewals.map(a => `${a.name} ($${Math.round(a.contractValue / 1000)}K, health: ${a.healthScoreNumeric}/100)`).join('; ')}. Total at-risk renewal value: $${Math.round(urgentRenewals.reduce((s, a) => s + a.contractValue, 0) / 1000)}K.`,
      severity: 'critical', domain: 'customer_success',
      sources: urgentRenewals.map(a => `customer:${a.id}`),
      recommendation: 'Assign executive sponsors immediately. Prepare retention offers. Address open support tickets as priority.',
      impact: 'high', confidence: 0.93, detectedAt: now,
      isHidden: false, reversePromptWorthy: true,
    });
  }

  // Silent churn signal (usage declining but health score not reflecting it yet)
  const decliningUsage = customers.accounts.filter(a =>
    a.healthScore !== 'critical' && a.healthScore !== 'at_risk' && a.churnRisk > 60
  );
  if (decliningUsage.length > 0) {
    insights.push({
      id: id(), title: 'Silent churn signal detected — usage declining for seemingly healthy accounts',
      description: `${decliningUsage.length} accounts show declining API usage or login frequency but their health scores haven't caught up yet: ${decliningUsage.slice(0, 3).map(a => `${a.name} (health: ${a.healthScore}, churn risk: ${a.churnRisk}%)`).join('; ')}. These are early warning signals that traditional metrics miss.`,
      severity: 'warning', domain: 'customer_success',
      sources: decliningUsage.map(a => `customer:${a.id}`),
      recommendation: 'Proactively reach out to these accounts. Offer health check calls. Review their product usage patterns for feature adoption gaps.',
      impact: 'high', confidence: 0.78, detectedAt: now,
      isHidden: true, reversePromptWorthy: true,
    });
  }

  // NRR trending
  if (customers.nrrMetrics.netRevenueRetention < 110) {
    insights.push({
      id: id(), title: `NRR at ${customers.nrrMetrics.netRevenueRetention}% — below 110% benchmark`,
      description: `Net Revenue Retention is ${customers.nrrMetrics.netRevenueRetention}%. Gross retention: ${customers.nrrMetrics.grossRetentionRate}%. Expansion revenue: $${Math.round(customers.nrrMetrics.expansionRevenue / 1000)}K. Contraction: $${Math.round(customers.nrrMetrics.contractionRevenue / 1000)}K. For a Series A company targeting Series B, NRR should be >115%.`,
      severity: 'warning', domain: 'customer_success',
      sources: ['customer:nrr-metrics'],
      recommendation: 'Increase expansion efforts: identify accounts using <3 modules and create upsell playbook. Reduce churn by addressing top 3 cancellation reasons.',
      impact: 'high', confidence: 0.86, detectedAt: now,
      isHidden: false, reversePromptWorthy: false,
    });
  }

  // ── Engineering & Slack Signals ────────────────────────────────────────

  // Burnout/frustration detection from Slack
  const frustratedMsgs = slack.messages.filter(m => m.sentiment === 'frustrated');
  const engFrustrated = frustratedMsgs.filter(m => m.channelName === 'engineering');
  if (engFrustrated.length > 15) {
    insights.push({
      id: id(), title: 'Engineering team showing elevated frustration signals',
      description: `${engFrustrated.length} frustrated-sentiment messages detected in #engineering over the past 12 months (${pct(engFrustrated.length, slack.messages.filter(m => m.channelName === 'engineering').length)}% of engineering messages). Key topics: ${[...new Set(engFrustrated.flatMap(m => m.topics || []))].slice(0, 5).join(', ')}. This correlates with the employee engagement survey showing engineering at 3.3/5.`,
      severity: 'warning', domain: 'people',
      sources: ['slack:#engineering', 'google-docs:engagement-survey'],
      recommendation: 'Schedule skip-level 1:1s. Address technical debt allocation in sprint planning. Review engineering career progression framework.',
      impact: 'medium', confidence: 0.75, detectedAt: now,
      isHidden: true, reversePromptWorthy: true,
    });
  }

  // Sales-Engineering tension
  const tensionTopics = slack.messages.filter(m =>
    (m.topics || []).some(t => t.includes('sales-engineering-tension'))
  );
  if (tensionTopics.length > 0) {
    insights.push({
      id: id(), title: 'Sales-Engineering alignment issue detected in Slack',
      description: `Multiple messages in #engineering reference frustration with sales commitments made without engineering input. Sales is promising features with timelines that engineering cannot meet. This pattern has appeared ${tensionTopics.length} times in the past year.`,
      severity: 'warning', domain: 'cross_domain',
      sources: ['slack:#engineering', 'slack:#product'],
      recommendation: 'Implement a mandatory product-sales-engineering alignment meeting before any customer commitment. Create a shared roadmap visible to sales.',
      impact: 'high', confidence: 0.82, detectedAt: now,
      isHidden: true, reversePromptWorthy: true,
    });
  }

  // Attrition risk
  const attritionMsgs = slack.messages.filter(m =>
    (m.topics || []).some(t => t.includes('attrition-risk'))
  );
  if (attritionMsgs.length > 0) {
    insights.push({
      id: id(), title: 'Engineer attrition risk detected from communication patterns',
      description: `Communication pattern analysis shows signals of potential attrition: references to competitor opportunities, career growth frustration, and workload concerns. Combined with the engagement survey (engineering: 3.3/5), this suggests 2-4 engineers may be considering leaving within the next 6 months.`,
      severity: 'critical', domain: 'people',
      sources: ['slack:#engineering', 'google-docs:engagement-survey', 'google-docs:attrition-risk'],
      recommendation: 'Immediate retention conversations with key engineers. Consider equity refresh grants. Address top frustration drivers: technical debt allocation, career progression, and work-life balance.',
      impact: 'high', confidence: 0.72, detectedAt: now,
      isHidden: true, reversePromptWorthy: true,
    });
  }

  // Taiwan team morale
  const twMsgs = slack.messages.filter(m =>
    (m.topics || []).some(t => t.includes('taiwan-ignored'))
  );
  if (twMsgs.length > 0) {
    insights.push({
      id: id(), title: 'Taiwan team feeling underserved — localization and attention gap',
      description: `Multiple signals from TW team across Slack channels indicating frustration with SG-centric product decisions. Taiwan-specific features (FSC reporting, Mandarin UI) have been deprioritized repeatedly. This is correlated with: TW engagement score 3.1/5 (lowest in company), 2 competitive losses in TW citing localization, and declining customer health for TW accounts.`,
      severity: 'warning', domain: 'people',
      sources: ['slack:#apac-regional', 'slack:#engineering', 'google-docs:engagement-survey', 'hubspot:tw-deals'],
      recommendation: 'Prioritize Taiwan localization sprint. Schedule Rajesh + Sarah visit to TW office. Assign dedicated PM for APAC localization roadmap.',
      impact: 'high', confidence: 0.85, detectedAt: now,
      isHidden: true, reversePromptWorthy: true,
    });
  }

  // ── Strategic Insights from Docs ──────────────────────────────────────

  // Competitive gap
  const compDocs = docs.documents.filter(d => d.category === 'competitive_analysis');
  if (compDocs.length > 0) {
    insights.push({
      id: id(), title: 'Competitive feature gap contributing to deal losses',
      description: `Competitive analysis documents identify feature gaps in: AI-powered alert triage, enterprise UX, and multi-jurisdiction reporting. These same gaps are cited in ${hubspot.pipelineSummary.lossReasons.filter(r => r.reason.includes('feature') || r.reason.includes('competitor')).length} lost deals. Napier AI and NICE Actimize are ahead in these areas.`,
      severity: 'warning', domain: 'strategy',
      sources: compDocs.map(d => `google-docs:${d.id}`).concat(['hubspot:loss-reasons']),
      recommendation: 'Accelerate AI triage feature (currently Q3 target — pull to Q1/Q2). Invest in enterprise UX overhaul. Close SOC 2 Type II gap.',
      impact: 'high', confidence: 0.80, detectedAt: now,
      isHidden: false, reversePromptWorthy: true,
    });
  }

  // Product-sales misalignment from docs
  const meetingDocs = docs.documents.filter(d =>
    d.category === 'meeting_notes' &&
    d.keyInsights.some(i => i.toLowerCase().includes('misalign') || i.toLowerCase().includes('tension') || i.toLowerCase().includes('gap'))
  );
  if (meetingDocs.length > 0) {
    insights.push({
      id: id(), title: 'Product roadmap misaligned with sales commitments',
      description: `Meeting notes reveal recurring tension between product roadmap and sales promises. ${meetingDocs.length} meeting notes reference this issue. The AI alert triage feature is being promised for Q1 but earliest realistic ship date is Q3 — a 6-month gap that will damage customer trust.`,
      severity: 'warning', domain: 'cross_domain',
      sources: meetingDocs.map(d => `google-docs:${d.id}`).concat(['slack:#product', 'slack:#sales']),
      recommendation: 'Create a single source of truth for customer commitments. Require VP Product sign-off on any delivery timeline shared with customers.',
      impact: 'high', confidence: 0.83, detectedAt: now,
      isHidden: true, reversePromptWorthy: true,
    });
  }

  // ── Positive Insights ─────────────────────────────────────────────────

  if (kpis.arrGrowth > 20) {
    insights.push({
      id: id(), title: `ARR growing at ${kpis.arrGrowth}% YoY — strong momentum`,
      description: `Company Jarvis ARR is at $${round2(COMPANY.arr / 1_000_000)}M, growing ${kpis.arrGrowth}% year-over-year. MRR: $${Math.round(COMPANY.mrr / 1000)}K. This growth rate, if sustained, positions well for Series B fundraising.`,
      severity: 'positive', domain: 'sales',
      sources: ['hubspot:arr-growth'],
      recommendation: 'Maintain growth investment but watch burn rate. Document growth drivers for Series B deck.',
      impact: 'high', confidence: 0.95, detectedAt: now,
      isHidden: false, reversePromptWorthy: false,
    });
  }

  const champAccounts = customers.accounts.filter(a => a.healthScore === 'champion');
  if (champAccounts.length > 5) {
    insights.push({
      id: id(), title: `${champAccounts.length} champion customers — strong advocacy base`,
      description: `${champAccounts.length} accounts are in champion status: ${champAccounts.slice(0, 5).map(a => a.name).join(', ')}. These represent $${Math.round(champAccounts.reduce((s, a) => s + a.contractValue, 0) / 1000)}K in ARR and are candidates for case studies, referrals, and expansion.`,
      severity: 'positive', domain: 'customer_success',
      sources: champAccounts.map(a => `customer:${a.id}`),
      recommendation: 'Launch customer advocacy program. Request referrals from top champions. Publish 2-3 new case studies this quarter.',
      impact: 'medium', confidence: 0.90, detectedAt: now,
      isHidden: false, reversePromptWorthy: false,
    });
  }

  // Sort by severity: critical first, then warning, info, positive
  const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return insights;
}

// ─── Reverse Prompt Generation ──────────────────────────────────────────

function generateReversePrompts(
  slack: SlackData,
  hubspot: HubSpotData,
  docs: GoogleDocsData,
  customers: CustomerData,
  insights: JarvisInsight[],
): ReversePrompt[] {
  const prompts: ReversePrompt[] = [];
  let idx = 0;
  const rpId = () => `RP-${String(++idx).padStart(3, '0')}`;

  // Hidden insights become reverse prompts
  const hiddenInsights = insights.filter(i => i.isHidden && i.reversePromptWorthy);
  for (const insight of hiddenInsights) {
    prompts.push({
      id: rpId(),
      category: mapInsightToCategory(insight),
      title: insight.title,
      description: insight.description,
      severity: insight.severity,
      evidence: insight.sources,
      suggestedAction: insight.recommendation,
      urgency: insight.severity === 'critical' ? 'immediate' : insight.severity === 'warning' ? 'this_week' : 'this_month',
    });
  }

  // Additional reverse prompts from cross-domain correlation
  prompts.push({
    id: rpId(),
    category: 'missed_opportunity',
    title: 'Expansion revenue leaving money on the table',
    description: `${customers.accounts.filter(a => a.expansionPotential > 70).length} customers have high expansion potential but CSMs haven't initiated upsell conversations. These accounts are using an average of 2.5 modules out of 6 available. Estimated missed expansion revenue: $${Math.round(customers.accounts.filter(a => a.expansionPotential > 70).reduce((s, a) => s + a.contractValue * 0.4, 0) / 1000)}K/year.`,
    severity: 'warning',
    evidence: ['customer:expansion-potential', 'customer:module-usage'],
    suggestedAction: 'Create expansion playbook targeting accounts with >70% expansion potential. Set CSM OKRs on expansion revenue.',
    urgency: 'this_month',
  });

  prompts.push({
    id: rpId(),
    category: 'strategic_tension',
    title: 'India expansion debate creating leadership friction',
    description: 'CEO is pushing for India entry while COO, CTO, and VP Sales advocate deepening existing APAC markets first. This unresolved disagreement is visible in leadership channel discussions and the India feasibility study. The team needs a clear decision to avoid paralysis.',
    severity: 'info',
    evidence: ['slack:#leadership', 'google-docs:india-expansion'],
    suggestedAction: 'Schedule a structured strategy session with a decision framework. Define clear go/no-go criteria for India with a deadline.',
    urgency: 'this_month',
  });

  return prompts;
}

function mapInsightToCategory(insight: JarvisInsight): ReversePrompt['category'] {
  if (insight.domain === 'people') return 'people_risk';
  if (insight.domain === 'customer_success') return 'customer_risk';
  if (insight.domain === 'strategy') return 'competitive_threat';
  if (insight.domain === 'cross_domain') return 'strategic_tension';
  return 'hidden_issue';
}

// ─── Department Scoring ─────────────────────────────────────────────────

function scoreDepartments(
  slack: SlackData,
  hubspot: HubSpotData,
  customers: CustomerData,
): DepartmentScore[] {
  const departments = ['Engineering', 'Sales', 'Customer Success', 'Product', 'Marketing', 'Operations'];

  return departments.map(dept => {
    const deptMessages = slack.messages.filter(m => {
      const emp = EMPLOYEES.find(e => e.slackId === m.userId);
      return emp?.department === dept;
    });
    const frustrated = deptMessages.filter(m => m.sentiment === 'frustrated' || m.sentiment === 'negative').length;
    const total = deptMessages.length;
    const moraleScore = total > 0 ? Math.max(20, Math.round(100 - (frustrated / total) * 300)) : 50;

    let velocity = 65;
    let alignment = 70;
    const risks: string[] = [];
    const highlights: string[] = [];

    switch (dept) {
      case 'Engineering':
        velocity = 58; // Lower due to tech debt and firefighting
        alignment = 55; // Misaligned with sales promises
        risks.push('Technical debt accumulation', 'Attrition risk for 2-4 engineers', 'Sprint velocity declining');
        highlights.push('Successfully shipped v2.8', 'Zero downtime deployments');
        break;
      case 'Sales':
        velocity = 72;
        alignment = 65;
        risks.push('Australia pipeline coverage at 1.5x', 'Win rate below 40%', 'Stalled deals in negotiation');
        highlights.push(`Pipeline at $${Math.round(hubspot.pipelineSummary.totalPipeline / 1000)}K`, 'Strong SG market presence');
        break;
      case 'Customer Success':
        velocity = 62;
        alignment = 75;
        risks.push('Ticket backlog 3x normal', `${customers.accounts.filter(a => a.healthScore === 'critical').length} critical accounts`, 'NPS declining');
        highlights.push(`${customers.accounts.filter(a => a.healthScore === 'champion').length} champion accounts`, 'Onboarding process improved');
        break;
      case 'Product':
        velocity = 55;
        alignment = 50; // Major misalignment with sales
        risks.push('Roadmap-sales disconnect', 'Feature backlog growing', 'Competitive gaps widening');
        highlights.push('User research program active', 'AI triage spec completed');
        break;
      case 'Marketing':
        velocity = 70;
        alignment = 72;
        risks.push('MQL-to-SQL conversion below target', 'Brand awareness low in Australia');
        highlights.push('Webinar program generating leads', 'SEO rankings improving');
        break;
      case 'Operations':
        velocity = 75;
        alignment = 80;
        risks.push('Multi-office coordination challenges');
        highlights.push('Office expansions on track', 'IT infrastructure stable');
        break;
    }

    const overallScore = Math.round((moraleScore + velocity + alignment) / 3);

    return { department: dept, overallScore, morale: moraleScore, velocity, alignment, risks, highlights };
  });
}

// ─── Country Performance ────────────────────────────────────────────────

function computeCountryPerformance(
  hubspot: HubSpotData,
  customers: CustomerData,
): CountryPerformance[] {
  const countries: Country[] = ['SG', 'MY', 'TW', 'AU', 'PH'];
  const countryNames: Record<Country, string> = { SG: 'Singapore', MY: 'Malaysia', TW: 'Taiwan', AU: 'Australia', PH: 'Philippines' };

  return countries.map(c => {
    const countryCustomers = customers.accounts.filter(a => a.country === c);
    const countryDeals = hubspot.deals.filter(d => d.country === c);
    const wonDeals = countryDeals.filter(d => d.stage === 'closed_won');
    const lostDeals = countryDeals.filter(d => d.stage === 'closed_lost');
    const openDeals = countryDeals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
    const npsScores = countryCustomers.filter(a => a.npsScore !== null).map(a => a.npsScore!);
    const headcount = EMPLOYEES.filter(e => e.country === c).length;

    const arr = countryCustomers.reduce((s, a) => s + a.contractValue, 0);
    const winRate = wonDeals.length + lostDeals.length > 0
      ? pct(wonDeals.length, wonDeals.length + lostDeals.length)
      : 0;
    const churnRate = countryCustomers.length > 0
      ? pct(countryCustomers.filter(a => a.healthScore === 'critical').length, countryCustomers.length)
      : 0;

    // Regulatory risk assessment
    let regulatoryRisk: 'low' | 'medium' | 'high' = 'medium';
    if (c === 'TW') regulatoryRisk = 'high'; // FSC tightening + localization gaps
    if (c === 'SG') regulatoryRisk = 'low'; // MAS well understood
    if (c === 'AU') regulatoryRisk = 'high'; // AUSTRAC strict + product gaps

    const keyIssues: string[] = [];
    if (c === 'TW') keyIssues.push('Localization gap', 'Team morale concern', 'FSC reporting not native');
    if (c === 'AU') keyIssues.push('Low pipeline coverage', 'Losing to NICE Actimize', 'SOC 2 Type II needed');
    if (c === 'MY') keyIssues.push('BNM regulatory changes', 'Growing competition from Tookitaki');
    if (c === 'PH') keyIssues.push('Early market — building awareness', 'BSP digital bank regulations expanding TAM');
    if (c === 'SG') keyIssues.push('Market maturing — need differentiation', 'Enterprise deals getting larger');

    return {
      country: c,
      countryName: countryNames[c],
      arr,
      customerCount: countryCustomers.length,
      dealPipeline: openDeals.reduce((s, d) => s + d.amount, 0),
      winRate,
      avgDealSize: wonDeals.length > 0 ? Math.round(wonDeals.reduce((s, d) => s + d.amount, 0) / wonDeals.length) : 0,
      headcount,
      churnRate,
      npsAvg: npsScores.length > 0 ? round2(npsScores.reduce((a, b) => a + b, 0) / npsScores.length) : 0,
      regulatoryRisk,
      keyIssues,
    };
  });
}

// ─── Causal Relationships ───────────────────────────────────────────────

function buildCausalRelationships(): JarvisCausalRelationship[] {
  return [
    {
      source: 'Engineering Velocity', target: 'Customer Satisfaction',
      effectSize: 0.45, lagDays: 30,
      description: 'When engineering ships faster with fewer bugs, customer satisfaction improves within 30 days as issues get resolved and features delivered.',
      confidence: 0.82, evidenceSources: ['slack:#engineering', 'customer:csat', 'customer:tickets'],
    },
    {
      source: 'Sales Hiring', target: 'Pipeline Growth',
      effectSize: 0.55, lagDays: 90,
      description: 'New sales reps typically take 90 days to ramp. Each new rep adds ~$1.2M annual pipeline capacity.',
      confidence: 0.78, evidenceSources: ['hubspot:pipeline', 'hubspot:sales-reps'],
    },
    {
      source: 'Customer Churn', target: 'ARR Growth',
      effectSize: -0.65, lagDays: 0,
      description: 'Every 1% increase in churn directly reduces ARR growth. Current churn is consuming expansion gains.',
      confidence: 0.92, evidenceSources: ['customer:churn', 'customer:nrr'],
    },
    {
      source: 'Employee Attrition (Eng)', target: 'Engineering Velocity',
      effectSize: -0.40, lagDays: 45,
      description: 'When engineers leave, velocity drops within 45 days as remaining team absorbs workload and loses domain knowledge.',
      confidence: 0.75, evidenceSources: ['slack:#engineering', 'google-docs:attrition-risk'],
    },
    {
      source: 'Marketing Spend', target: 'Pipeline Growth',
      effectSize: 0.35, lagDays: 21,
      description: 'Marketing campaigns generate MQLs within 2-3 weeks. $1 of marketing generates approximately $3.5 of pipeline.',
      confidence: 0.70, evidenceSources: ['slack:#marketing', 'hubspot:pipeline'],
    },
    {
      source: 'Product Launch', target: 'Win Rate',
      effectSize: 0.30, lagDays: 14,
      description: 'New product features improve competitive positioning within 2 weeks as sales teams leverage them in active deals.',
      confidence: 0.68, evidenceSources: ['slack:#product', 'hubspot:win-rate'],
    },
    {
      source: 'Support Ticket Volume', target: 'Customer Churn',
      effectSize: 0.50, lagDays: 60,
      description: 'Sustained increase in support tickets precedes churn by ~60 days. Each unresolved P1 ticket increases churn probability by 8%.',
      confidence: 0.85, evidenceSources: ['customer:tickets', 'customer:churn'],
    },
    {
      source: 'Regulatory Deadline', target: 'Deal Velocity',
      effectSize: 0.60, lagDays: -30,
      description: 'Deals accelerate 30 days before regulatory deadlines as compliance urgency drives faster procurement decisions.',
      confidence: 0.80, evidenceSources: ['hubspot:deals', 'slack:#sales'],
    },
    {
      source: 'False Positive Rate', target: 'Customer Satisfaction',
      effectSize: -0.55, lagDays: 7,
      description: 'Increases in false positive rates impact customer satisfaction within a week. Each 10% increase in false positives correlates with 0.3 NPS decline.',
      confidence: 0.88, evidenceSources: ['customer:csat', 'customer:tickets', 'slack:#cs-support'],
    },
    {
      source: 'Team Morale (Slack Sentiment)', target: 'Engineering Velocity',
      effectSize: 0.38, lagDays: 14,
      description: 'Slack sentiment analysis shows that team morale predicts sprint velocity 2 weeks ahead. Frustrated teams deliver 25% less.',
      confidence: 0.65, evidenceSources: ['slack:#engineering', 'slack:#general'],
    },
    {
      source: 'Competitive Loss Rate', target: 'Product Roadmap Priority',
      effectSize: 0.48, lagDays: 30,
      description: 'Competitive losses trigger product roadmap re-prioritization within a month, especially when the same feature gap causes multiple losses.',
      confidence: 0.72, evidenceSources: ['hubspot:loss-reasons', 'slack:#product', 'google-docs:competitive-analysis'],
    },
    {
      source: 'APAC Regulatory Changes', target: 'Pipeline Growth',
      effectSize: 0.42, lagDays: 60,
      description: 'New regulatory requirements in APAC markets create urgency for AML compliance solutions, growing pipeline within 2 months.',
      confidence: 0.76, evidenceSources: ['slack:#apac-regional', 'hubspot:pipeline', 'google-docs:regulatory'],
    },
  ];
}

// ─── Blind Spots ────────────────────────────────────────────────────────

function detectBlindSpots(
  hubspot: HubSpotData,
  customers: CustomerData,
  docs: GoogleDocsData,
  slack: SlackData,
): CompanyJarvisAnalysis['blindSpots'] {
  return [
    {
      area: 'Product-Loss Reason Alignment',
      description: 'Top 3 lost deal reasons (competitive feature gap, pricing, missing enterprise features) are not reflected in the current product roadmap priorities. There is a disconnect between why we lose and what we are building.',
      evidence: ['hubspot:loss-reasons', 'google-docs:product-roadmap', 'slack:#product'],
      suggestedInvestigation: 'Map each lost deal reason to a specific product initiative. Identify gaps where there is no corresponding roadmap item.',
    },
    {
      area: 'Taiwan Market Coverage',
      description: 'Taiwan has 12 customers but no dedicated CSM and no product manager focused on Taiwan-specific needs. The TW engineering team raises localization issues regularly but they are not prioritized.',
      evidence: ['customer:tw-accounts', 'slack:#apac-regional', 'google-docs:engagement-survey'],
      suggestedInvestigation: 'Review Taiwan customer health trends, CSM assignment, and product localization backlog.',
    },
    {
      area: 'Competitive Intelligence Gap',
      description: 'No competitive intelligence has been shared in Slack for 3 months despite 4 competitive losses in the same period. The competitive analysis docs are 6+ months old.',
      evidence: ['slack:#sales', 'hubspot:competitive-losses', 'google-docs:competitive-analysis'],
      suggestedInvestigation: 'Revive competitive intelligence program. Assign ownership. Update battlecards quarterly.',
    },
    {
      area: 'Customer Expansion Untapped',
      description: `${customers.accounts.filter(a => a.products.length <= 3 && a.healthScore === 'healthy').length} healthy customers are using 3 or fewer modules but could benefit from 5-6. No systematic expansion motion exists.`,
      evidence: ['customer:module-usage', 'customer:expansion-potential'],
      suggestedInvestigation: 'Create expansion playbook with CSM-driven module adoption paths per customer segment.',
    },
  ];
}

// ─── Monthly Trends ─────────────────────────────────────────────────────

function computeMonthlyTrends(
  hubspot: HubSpotData,
  customers: CustomerData,
  slack: SlackData,
  startDate: Date,
): CompanyJarvisAnalysis['monthlyTrends'] {
  const trends: CompanyJarvisAnalysis['monthlyTrends'] = [];
  const baseArr = COMPANY.arr * 0.75; // Start 12 months ago at 75% of current

  for (let m = 0; m < 12; m++) {
    const monthDate = new Date(startDate);
    monthDate.setMonth(monthDate.getMonth() + m);
    const monthStr = monthDate.toISOString().slice(0, 7);
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    // ARR grows ~2% per month with variance
    const arrGrowthFactor = 1 + (0.015 + Math.random() * 0.01);
    const arr = Math.round(baseArr * Math.pow(arrGrowthFactor, m + 1));

    // Deals won this month
    const monthDeals = hubspot.deals.filter(d => {
      if (d.stage !== 'closed_won' || !d.actualCloseDate) return false;
      const closeDate = new Date(d.actualCloseDate);
      return closeDate >= monthStart && closeDate <= monthEnd;
    });

    // Slack activity
    const monthMessages = slack.messages.filter(msg => {
      const msgDate = new Date(msg.timestamp);
      return msgDate >= monthStart && msgDate <= monthEnd;
    });

    // Support tickets
    const monthTickets = customers.tickets.filter(t => {
      const ticketDate = new Date(t.createdDate);
      return ticketDate >= monthStart && ticketDate <= monthEnd;
    });

    // Customer count grows
    const customerCount = Math.round(35 + m * 1.5 + Math.random() * 2);

    // NPS varies
    const npsAvg = Math.round(35 + Math.random() * 30 + (m > 7 ? -8 : 0)); // drops after month 8 release

    // Churn value varies
    const churnValue = Math.round(rand(20000, 80000) * (m > 7 ? 1.5 : 1)); // higher after botched release

    trends.push({
      month: monthStr,
      arr,
      newDeals: monthDeals.length || Math.floor(rand(2, 6)),
      closedWonValue: monthDeals.reduce((s, d) => s + d.amount, 0) || Math.round(rand(150000, 400000)),
      churnValue,
      customerCount,
      npsAvg,
      slackActivity: monthMessages.length,
      supportTickets: monthTickets.length || Math.floor(rand(20, 40)),
    });
  }

  return trends;
}

// ─── Bottom Line ────────────────────────────────────────────────────────

function generateBottomLine(
  kpis: CompanyJarvisAnalysis['kpis'],
  insights: JarvisInsight[],
  reversePrompts: ReversePrompt[],
): string {
  const criticalCount = insights.filter(i => i.severity === 'critical').length;
  const hiddenCount = reversePrompts.length;

  return `Company Jarvis is at $${round2(COMPANY.arr / 1_000_000)}M ARR growing ${kpis.arrGrowth}% YoY with ${kpis.totalCustomers} customers across 5 APAC markets. ` +
    `The growth trajectory is strong but under pressure from ${criticalCount} critical issues: declining win rate (${kpis.winRate}%), ` +
    `customer health deterioration (NRR: ${kpis.nrr}%), and engineering team stress signals. ` +
    `${hiddenCount} hidden issues detected through cross-domain analysis — including Taiwan team morale problems, ` +
    `sales-engineering misalignment, and untapped expansion revenue. ` +
    `Australia pipeline coverage (1.5x vs 3x target) is the most urgent revenue risk. ` +
    `Series B readiness requires: NRR above 115%, sustained 40%+ growth, and burn rate discipline. ` +
    `The company has the market position and product to succeed, but operational execution gaps need immediate attention.`;
}

// ─── Main Analysis Function ─────────────────────────────────────────────

export function analyzeCompanyData(
  slack: SlackData,
  hubspot: HubSpotData,
  docs: GoogleDocsData,
  customers: CustomerData,
  startDate?: Date,
): CompanyJarvisAnalysis {
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const kpis = computeKPIs(slack, hubspot, docs, customers);
  const insights = detectInsights(slack, hubspot, docs, customers, kpis);
  const reversePrompts = generateReversePrompts(slack, hubspot, docs, customers, insights);
  const departmentScores = scoreDepartments(slack, hubspot, customers);
  const countryPerformance = computeCountryPerformance(hubspot, customers);
  const causalRelationships = buildCausalRelationships();
  const blindSpots = detectBlindSpots(hubspot, customers, docs, slack);
  const monthlyTrends = computeMonthlyTrends(hubspot, customers, slack, start);
  const bottomLine = generateBottomLine(kpis, insights, reversePrompts);

  return {
    generatedAt: new Date().toISOString(),
    kpis,
    insights,
    reversePrompts,
    departmentScores,
    countryPerformance,
    causalRelationships,
    blindSpots,
    monthlyTrends,
    bottomLine,
  };
}

// ─── Training Pack Export ───────────────────────────────────────────────
// Converts analysis into the TrainingPack format expected by createBrainTrainer()

export interface CompanyJarvisTrainingPack {
  id: string;
  title: string;
  source: string;
  industry: string;
  domains: string[];
  causalChains: Array<{
    source: string;
    target: string;
    metric: string;
    effectSize: number;
    lagDays: number;
    pValue: number;
  }>;
  businessRules: Array<{
    title: string;
    entityType: string;
    when: { logic: 'AND' | 'OR'; conditions: Array<{ field: string; operator: string; value: number }> };
    then: Array<{ type: string; severity: string }>;
    naturalLanguage: string;
    priority: number;
  }>;
  cascades: Array<{
    source: string;
    target: string;
    type: string;
    severity: string;
    keywords: { source: string[]; target: string[] };
    reasonTemplate: string;
  }>;
  patterns: Array<{
    name: string;
    domains: string[];
    description: string;
    observed: number;
    expected: number;
    total: number;
  }>;
  outcomes: Array<{
    predicted: string;
    predictedConfidence: number;
    actual: string;
    wasCorrect: boolean;
    sourceDomain: string;
    targetDomain: string;
  }>;
  narrative: string;
  confidence: number;
  tags: string[];
  version: string;
  author: string;
}

export function buildTrainingPacks(analysis: CompanyJarvisAnalysis): CompanyJarvisTrainingPack[] {
  const packs: CompanyJarvisTrainingPack[] = [];

  // Pack 1: Cross-domain causal relationships
  packs.push({
    id: 'company-jarvis-causal-v1',
    title: 'Company Jarvis — Cross-Domain Causal Intelligence',
    source: 'Company Jarvis Synthetic Data (Slack + HubSpot + Docs + Customer)',
    industry: 'AML Compliance Software',
    domains: ['finance', 'cs', 'engineering', 'revenue', 'product', 'people'],
    causalChains: analysis.causalRelationships.map(cr => ({
      source: cr.source.toLowerCase().replace(/\s+/g, '_'),
      target: cr.target.toLowerCase().replace(/\s+/g, '_'),
      metric: cr.target.toLowerCase().replace(/\s+/g, '_'),
      effectSize: cr.effectSize,
      lagDays: Math.abs(cr.lagDays),
      pValue: round2(0.001 + (1 - cr.confidence) * 0.05),
    })),
    businessRules: [
      {
        title: 'Low pipeline coverage → revenue miss',
        entityType: 'region',
        when: { logic: 'AND', conditions: [{ field: 'revenue.pipeline_coverage', operator: '<', value: 2.0 }] },
        then: [{ type: 'alert', severity: 'critical' }],
        naturalLanguage: 'When pipeline coverage drops below 2x quota, the region will miss revenue targets.',
        priority: 200,
      },
      {
        title: 'Customer health critical + renewal within 60 days → churn imminent',
        entityType: 'customer',
        when: { logic: 'AND', conditions: [
          { field: 'cs.health_score', operator: '<', value: 40 },
          { field: 'cs.days_to_renewal', operator: '<', value: 60 },
        ]},
        then: [{ type: 'alert', severity: 'critical' }],
        naturalLanguage: 'Customers with health score below 40 renewing within 60 days have 80% churn probability.',
        priority: 250,
      },
      {
        title: 'Engineering frustration + competitor mention → attrition risk',
        entityType: 'employee',
        when: { logic: 'AND', conditions: [
          { field: 'people.sentiment_score', operator: '<', value: 3.0 },
          { field: 'people.competitor_mentions', operator: '>', value: 2 },
        ]},
        then: [{ type: 'alert', severity: 'high' }],
        naturalLanguage: 'Engineers expressing frustration and mentioning competitors are likely evaluating external opportunities.',
        priority: 180,
      },
      {
        title: 'Support ticket spike → NPS decline forecast',
        entityType: 'company',
        when: { logic: 'AND', conditions: [{ field: 'cs.open_tickets', operator: '>', value: 30 }] },
        then: [{ type: 'alert', severity: 'high' }],
        naturalLanguage: 'When open support tickets exceed 30, expect NPS decline within 60 days.',
        priority: 160,
      },
      {
        title: 'Sales promise without product sign-off → delivery risk',
        entityType: 'deal',
        when: { logic: 'AND', conditions: [
          { field: 'product.roadmap_gap_months', operator: '>', value: 3 },
        ]},
        then: [{ type: 'alert', severity: 'high' }],
        naturalLanguage: 'Customer commitments exceeding product roadmap by 3+ months create trust and churn risk.',
        priority: 170,
      },
    ],
    cascades: [
      {
        source: 'engineering', target: 'cs',
        type: 'impacts', severity: 'high',
        keywords: { source: ['bug', 'incident', 'release', 'deploy'], target: ['ticket', 'escalation', 'false positive'] },
        reasonTemplate: 'Engineering {source_metric} caused customer support {target_metric} increase',
      },
      {
        source: 'cs', target: 'revenue',
        type: 'blocks', severity: 'critical',
        keywords: { source: ['churn', 'health', 'nps'], target: ['arr', 'expansion', 'renewal'] },
        reasonTemplate: 'Customer health decline ({source_metric}) blocks revenue growth ({target_metric})',
      },
      {
        source: 'people', target: 'engineering',
        type: 'impacts', severity: 'high',
        keywords: { source: ['attrition', 'morale', 'burnout'], target: ['velocity', 'quality', 'delivery'] },
        reasonTemplate: 'People risk ({source_metric}) degrades engineering capacity ({target_metric})',
      },
      {
        source: 'product', target: 'revenue',
        type: 'enables', severity: 'medium',
        keywords: { source: ['feature', 'launch', 'roadmap'], target: ['win rate', 'pipeline', 'deal'] },
        reasonTemplate: 'Product improvements ({source_metric}) drive revenue growth ({target_metric})',
      },
    ],
    patterns: [
      { name: 'Regulatory Deadline Sales Acceleration', domains: ['revenue', 'macro'], description: 'AML deals accelerate 30-60 days before regulatory deadlines', observed: 28, expected: 12, total: 100 },
      { name: 'Post-Release Customer Escalation', domains: ['engineering', 'cs'], description: 'Major releases trigger support ticket spikes for 2-3 weeks', observed: 8, expected: 2, total: 12 },
      { name: 'Taiwan Team Isolation Pattern', domains: ['people', 'product'], description: 'Remote engineering teams feeling disconnected from HQ decisions', observed: 15, expected: 5, total: 50 },
      { name: 'Competitive Loss Cluster', domains: ['revenue', 'product'], description: 'Competitive losses cluster around specific feature gaps, not pricing', observed: 10, expected: 4, total: 25 },
    ],
    outcomes: [
      { predicted: 'Engineering velocity decline', predictedConfidence: 0.75, actual: 'Engineering velocity decline', wasCorrect: true, sourceDomain: 'people', targetDomain: 'engineering' },
      { predicted: 'Customer churn increase', predictedConfidence: 0.80, actual: 'Customer churn increase', wasCorrect: true, sourceDomain: 'cs', targetDomain: 'revenue' },
      { predicted: 'Pipeline growth from marketing', predictedConfidence: 0.65, actual: 'Pipeline growth moderate', wasCorrect: true, sourceDomain: 'marketing', targetDomain: 'revenue' },
    ],
    narrative: analysis.bottomLine,
    confidence: 0.85,
    tags: ['aml', 'apac', 'saas', 'compliance', 'cross-domain'],
    version: '1.0',
    author: 'Company Jarvis Brain Analyzer',
  });

  // Pack 2: Insight-derived rules (from specific findings)
  packs.push({
    id: 'company-jarvis-insights-v1',
    title: 'Company Jarvis — Operational Intelligence Rules',
    source: 'Cross-domain insight analysis',
    industry: 'AML Compliance Software',
    domains: ['cs', 'revenue', 'people', 'engineering'],
    causalChains: [
      { source: 'false_positive_rate', target: 'customer_satisfaction', metric: 'nps', effectSize: -0.55, lagDays: 7, pValue: 0.005 },
      { source: 'engineering_morale', target: 'sprint_velocity', metric: 'points_completed', effectSize: 0.38, lagDays: 14, pValue: 0.02 },
      { source: 'competitive_loss_rate', target: 'product_priority', metric: 'roadmap_shift', effectSize: 0.48, lagDays: 30, pValue: 0.01 },
    ],
    businessRules: [
      {
        title: 'Silent churn detection',
        entityType: 'customer',
        when: { logic: 'AND', conditions: [
          { field: 'cs.api_calls_trend', operator: '<', value: -0.3 },
          { field: 'cs.health_score', operator: '>', value: 50 },
        ]},
        then: [{ type: 'alert', severity: 'high' }],
        naturalLanguage: 'Accounts with declining usage but stable health scores are exhibiting silent churn — reach out proactively.',
        priority: 190,
      },
      {
        title: 'Regional market neglect',
        entityType: 'region',
        when: { logic: 'AND', conditions: [
          { field: 'people.engagement_score', operator: '<', value: 3.5 },
          { field: 'cs.customer_count', operator: '>', value: 8 },
        ]},
        then: [{ type: 'alert', severity: 'high' }],
        naturalLanguage: 'Regional teams with low engagement and significant customer base risk becoming underperforming markets.',
        priority: 175,
      },
    ],
    cascades: [
      {
        source: 'revenue', target: 'people',
        type: 'impacts', severity: 'medium',
        keywords: { source: ['quota', 'miss', 'pipeline'], target: ['morale', 'retention'] },
        reasonTemplate: 'Revenue pressure ({source_metric}) impacts team morale ({target_metric})',
      },
    ],
    patterns: [
      { name: 'Champion Account Expansion Opportunity', domains: ['cs', 'revenue'], description: 'Champion customers using <4 modules have 70% expansion success rate', observed: 12, expected: 5, total: 20 },
    ],
    outcomes: [],
    narrative: `Company Jarvis operational intelligence reveals ${analysis.insights.filter(i => i.severity === 'critical').length} critical and ${analysis.insights.filter(i => i.severity === 'warning').length} warning-level insights across sales, customer success, engineering, and people domains. The most actionable finding is the cross-domain correlation between engineering release quality and customer health deterioration.`,
    confidence: 0.80,
    tags: ['operational', 'cross-domain', 'aml'],
    version: '1.0',
    author: 'Company Jarvis Brain Analyzer',
  });

  return packs;
}

// ─── Signal Export ───────────────────────────────────────────────────────
// Converts key metrics into ConnectorSignal format for cross_domain_signals table

export interface CompanyJarvisSignal {
  source_domain: string;
  signal_type: string;
  signal_value: number;
  signal_timestamp: Date;
  entity_type: string;
  entity_id: string;
  signal_metadata: Record<string, unknown>;
}

export function buildSignals(
  analysis: CompanyJarvisAnalysis,
  hubspot: HubSpotData,
  customers: CustomerData,
  startDate: Date,
): CompanyJarvisSignal[] {
  const signals: CompanyJarvisSignal[] = [];

  // Monthly KPI signals
  for (const trend of analysis.monthlyTrends) {
    const monthDate = new Date(trend.month + '-15');

    signals.push(
      { source_domain: 'revenue', signal_type: 'monthly_arr', signal_value: trend.arr, signal_timestamp: monthDate, entity_type: 'company', entity_id: 'company-jarvis', signal_metadata: { month: trend.month, currency: 'USD' } },
      { source_domain: 'revenue', signal_type: 'deals_closed', signal_value: trend.newDeals, signal_timestamp: monthDate, entity_type: 'company', entity_id: 'company-jarvis', signal_metadata: { month: trend.month } },
      { source_domain: 'revenue', signal_type: 'closed_won_value', signal_value: trend.closedWonValue, signal_timestamp: monthDate, entity_type: 'company', entity_id: 'company-jarvis', signal_metadata: { month: trend.month, currency: 'USD' } },
      { source_domain: 'cs', signal_type: 'churn_value', signal_value: trend.churnValue, signal_timestamp: monthDate, entity_type: 'company', entity_id: 'company-jarvis', signal_metadata: { month: trend.month, currency: 'USD' } },
      { source_domain: 'cs', signal_type: 'customer_count', signal_value: trend.customerCount, signal_timestamp: monthDate, entity_type: 'company', entity_id: 'company-jarvis', signal_metadata: { month: trend.month } },
      { source_domain: 'cs', signal_type: 'nps_average', signal_value: trend.npsAvg, signal_timestamp: monthDate, entity_type: 'company', entity_id: 'company-jarvis', signal_metadata: { month: trend.month } },
      { source_domain: 'engineering', signal_type: 'slack_activity', signal_value: trend.slackActivity, signal_timestamp: monthDate, entity_type: 'company', entity_id: 'company-jarvis', signal_metadata: { month: trend.month } },
      { source_domain: 'cs', signal_type: 'support_tickets', signal_value: trend.supportTickets, signal_timestamp: monthDate, entity_type: 'company', entity_id: 'company-jarvis', signal_metadata: { month: trend.month } },
    );
  }

  // Deal signals
  for (const deal of hubspot.deals) {
    const stageValue: Record<string, number> = { prospecting: 0.1, discovery: 0.3, proposal: 0.5, negotiation: 0.7, closed_won: 1.0, closed_lost: 0 };
    signals.push({
      source_domain: 'revenue',
      signal_type: 'deal_stage',
      signal_value: stageValue[deal.stage] || 0,
      signal_timestamp: new Date(deal.createdDate),
      entity_type: 'deal',
      entity_id: deal.id,
      signal_metadata: { name: deal.name, company: deal.companyName, amount: deal.amount, stage: deal.stage, country: deal.country },
    });
  }

  // Customer health signals
  for (const account of customers.accounts) {
    signals.push({
      source_domain: 'cs',
      signal_type: 'health_score',
      signal_value: account.healthScoreNumeric,
      signal_timestamp: new Date(),
      entity_type: 'customer',
      entity_id: account.id,
      signal_metadata: { name: account.name, country: account.country, tier: account.tier, contractValue: account.contractValue },
    });
  }

  // Country performance signals
  for (const country of analysis.countryPerformance) {
    signals.push(
      { source_domain: 'revenue', signal_type: 'country_arr', signal_value: country.arr, signal_timestamp: new Date(), entity_type: 'region', entity_id: country.country, signal_metadata: { country: country.countryName } },
      { source_domain: 'revenue', signal_type: 'country_pipeline', signal_value: country.dealPipeline, signal_timestamp: new Date(), entity_type: 'region', entity_id: country.country, signal_metadata: { country: country.countryName } },
      { source_domain: 'revenue', signal_type: 'country_win_rate', signal_value: country.winRate, signal_timestamp: new Date(), entity_type: 'region', entity_id: country.country, signal_metadata: { country: country.countryName } },
    );
  }

  // Department score signals
  for (const dept of analysis.departmentScores) {
    signals.push({
      source_domain: 'people',
      signal_type: 'department_score',
      signal_value: dept.overallScore,
      signal_timestamp: new Date(),
      entity_type: 'department',
      entity_id: dept.department.toLowerCase().replace(/\s+/g, '-'),
      signal_metadata: { department: dept.department, morale: dept.morale, velocity: dept.velocity, alignment: dept.alignment },
    });
  }

  return signals;
}
