/**
 * Company Jarvis — Synthetic Customer Data Generator
 *
 * Generates 50 customer accounts with health scores, usage metrics, and 350+
 * support tickets for an APAC AML software company. Includes deliberately
 * seeded anomalies (silent churn signals, passive dissatisfaction, urgent
 * renewal risks, missed expansion opportunities) that the brain should detect.
 */

import type { CustomerData, CustomerAccount, SupportTicket, HealthScore, Country } from './types';
import type { HubSpotData } from './types';
import { CUSTOMER_COMPANIES, PRODUCT_MODULES, REGULATORY_BODIES, EMPLOYEES, rand, pick } from './constants';

// ─── Helpers ────────────────────────────────────────────────────────────────

let ticketCounter = 0;
function nextTicketId(): string { return `TKT-${String(++ticketCounter).padStart(5, '0')}`; }

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function iso(d: Date): string { return d.toISOString().split('T')[0]; }

function pickN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function weightedPick<T>(items: readonly T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

// ─── CSM Assignment by Country ──────────────────────────────────────────────

const CSM_BY_COUNTRY: Record<Country, string> = {
  SG: 'Darren Koh',
  MY: 'Hafizah Ibrahim',
  TW: 'Lisa Huang',
  AU: 'Emma Wilson',
  PH: 'Paolo Mendoza',
};

// ─── Support Ticket Templates ───────────────────────────────────────────────

type TicketCategory =
  | 'false_positive_tuning'
  | 'api_integration'
  | 'report_generation'
  | 'performance'
  | 'regulatory_update'
  | 'user_management'
  | 'data_feed'
  | 'billing';

const TICKET_CATEGORIES: TicketCategory[] = [
  'false_positive_tuning',
  'api_integration',
  'report_generation',
  'performance',
  'regulatory_update',
  'user_management',
  'data_feed',
  'billing',
];

const TICKET_SUBJECTS: Record<TicketCategory, string[]> = {
  false_positive_tuning: [
    'Alert threshold producing too many false positives for PEP screening',
    'Sanctions screening flagging common names with 95%+ match score',
    'Transaction monitoring generating excessive low-risk alerts',
    'Fuzzy matching algorithm too aggressive on entity resolution',
    'PEP list update causing spike in false positives for domestic transfers',
    'Need to tune name matching sensitivity for local language characters',
    'Watchlist screening false positives tripled after latest list update',
    'Customer onboarding KYC checks flagging legitimate beneficial owners',
    'Alert suppression rules not applying correctly for repeat transactions',
    'False positive rate for adverse media screening exceeds 70%',
  ],
  api_integration: [
    'API timeout during batch sanctions check',
    'Webhook delivery failures for real-time alert notifications',
    'REST API returning 500 errors on bulk entity screening',
    'OAuth token refresh failing intermittently in production',
    'SFTP data ingestion job stalling on large transaction files',
    'API rate limiting blocking critical screening operations',
    'Batch API endpoint not returning paginated results correctly',
    'Real-time screening API latency exceeds SLA during peak hours',
    'Integration with core banking system dropping transactions',
    'API response payload missing required fields for downstream systems',
  ],
  report_generation: [
    'Q3 regulatory report missing transaction categories',
    'Monthly STR filing report formatting incorrect for regulatory submission',
    'Custom dashboard not reflecting correct time zone for APAC reports',
    'Automated compliance report failing to generate for audit period',
    'Executive summary report shows stale data from previous quarter',
    'CTR report generation timeout for large transaction volumes',
    'Regulatory filing export not compliant with latest template revision',
    'Scheduled report delivery via email stopped working',
    'Cross-border transaction report missing correspondent bank details',
    'Ad-hoc investigation report export truncating case notes',
  ],
  performance: [
    'Transaction monitoring latency spike during end-of-day batch processing',
    'Dashboard loading time exceeds 30 seconds for large portfolios',
    'Real-time screening response time degraded to 5s+ average',
    'Memory consumption increasing steadily — potential leak detected',
    'Database query timeout on historical transaction analysis',
    'Batch processing job taking 8+ hours instead of expected 2',
    'Concurrent user limit causing session drops during peak usage',
    'Alert queue backlog growing faster than processing capacity',
    'Search functionality extremely slow for entity name lookups',
    'System unresponsive during scheduled sanctions list reload',
  ],
  regulatory_update: [
    'Need urgent update for new MAS Notice 626 requirements',
    'BNM anti-money laundering policy directive changes not reflected',
    'FSC updated threshold reporting requirements — system needs update',
    'AUSTRAC reporting format changed — export template outdated',
    'BSP circular on enhanced due diligence not supported in workflow',
    'New FATF grey list additions not reflected in risk scoring',
    'Cross-border wire transfer reporting threshold decreased — need update',
    'Updated PEP definition scope requires configuration change',
    'Regulatory calendar alerts not triggering for upcoming filing deadlines',
    'Beneficial ownership transparency requirements need new data fields',
  ],
  user_management: [
    'Unable to assign investigation cases to new compliance analysts',
    'Role-based access control not restricting sensitive STR data correctly',
    'SSO integration failing for users on new identity provider',
    'Bulk user provisioning from HR system not syncing correctly',
    'Two-factor authentication locked out multiple compliance officers',
    'Audit trail not capturing user actions for specific modules',
    'User permission changes not propagating across all microservices',
    'Deactivated user accounts still showing in case assignment dropdown',
  ],
  data_feed: [
    'Daily sanctions list feed from provider not updating since last Tuesday',
    'PEP database sync showing stale records from 30+ days ago',
    'Customer risk rating data feed missing records for new accounts',
    'Transaction data ingestion dropping records with special characters',
    'External watchlist provider API credentials expired — feed stopped',
    'Real-time market data feed latency causing stale risk calculations',
    'Adverse media feed returning duplicate entries flooding alert queue',
    'Customer master data sync delay causing screening on outdated profiles',
  ],
  billing: [
    'Invoice does not reflect recently upgraded module subscription',
    'Usage-based billing calculations seem incorrect for API call volume',
    'Contract renewal terms differ from what was agreed with sales team',
    'Need itemized breakdown of overage charges for last quarter',
    'Discount code from partnership agreement not applied to invoice',
    'Billing contact details need to be updated for next invoice cycle',
  ],
};

// ─── Support Ticket Assignees (from CS team) ────────────────────────────────

const SUPPORT_ASSIGNEES = EMPLOYEES
  .filter(e => e.department === 'Customer Success')
  .map(e => e.name);

// ─── Main Generator ─────────────────────────────────────────────────────────

export function generateCustomerData(hubspotData: HubSpotData, startDate?: Date): CustomerData {
  ticketCounter = 0;

  const now = startDate ?? new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  // ── Step 1: Determine customer companies from closed_won deals ──────────

  const closedWonDeals = hubspotData.deals.filter(d => d.stage === 'closed_won');
  const closedWonCompanyNames = new Set(closedWonDeals.map(d => d.companyName));

  // Find matching CUSTOMER_COMPANIES entries for closed_won deals
  const customerCompaniesFromDeals = CUSTOMER_COMPANIES.filter(cc =>
    closedWonCompanyNames.has(cc.name)
  );

  // Supplement with more companies if we don't have 50 yet
  const remainingCompanies = CUSTOMER_COMPANIES.filter(cc =>
    !closedWonCompanyNames.has(cc.name)
  );

  const supplementCount = Math.max(0, 50 - customerCompaniesFromDeals.length);
  const shuffledRemaining = [...remainingCompanies].sort(() => Math.random() - 0.5);
  const supplementCompanies = shuffledRemaining.slice(0, supplementCount);

  const allCustomerCompanies = [...customerCompaniesFromDeals, ...supplementCompanies].slice(0, 50);

  // ── Step 2: Contract date generation ────────────────────────────────────

  // Spread contract starts over 2+ years (oldest 2020, newest recent months)
  const contractStartDates: Date[] = [];
  for (let i = 0; i < allCustomerCompanies.length; i++) {
    const fraction = i / (allCustomerCompanies.length - 1);
    // Oldest: Jan 2020, newest: ~2 months ago
    const earliest = new Date('2020-01-15');
    const latest = new Date(now);
    latest.setMonth(latest.getMonth() - 2);
    const ms = earliest.getTime() + fraction * (latest.getTime() - earliest.getTime());
    // Add some jitter (+-60 days)
    const jitter = (Math.random() - 0.5) * 60 * 24 * 60 * 60 * 1000;
    contractStartDates.push(new Date(clamp(ms + jitter, earliest.getTime(), latest.getTime())));
  }

  // ── Step 3: Health score distribution ───────────────────────────────────

  // ~10% critical, ~15% at_risk, ~25% neutral, ~35% healthy, ~15% champion
  const healthBuckets: HealthScore[] = [];
  for (let i = 0; i < allCustomerCompanies.length; i++) {
    healthBuckets.push(
      weightedPick<HealthScore>(
        ['critical', 'at_risk', 'neutral', 'healthy', 'champion'] as const,
        [10, 15, 25, 35, 15]
      )
    );
  }

  // ── Step 4: Build customer accounts ─────────────────────────────────────

  const accounts: CustomerAccount[] = [];
  const accountIdMap: Map<string, CustomerAccount> = new Map();

  for (let i = 0; i < allCustomerCompanies.length; i++) {
    const cc = allCustomerCompanies[i];
    const accountId = `CUST-${String(i + 1).padStart(4, '0')}`;
    const contractStart = contractStartDates[i];

    // Contract value based on tier
    let contractValue: number;
    switch (cc.size) {
      case 'enterprise':
        contractValue = Math.round(rand(150_000, 450_000));
        break;
      case 'growth':
        contractValue = Math.round(rand(60_000, 180_000));
        break;
      case 'starter':
        contractValue = Math.round(rand(25_000, 80_000));
        break;
    }

    // Annual renewals: contract start + 12 months, rolling
    const contractEnd = addMonths(contractStart, 12);
    // Calculate current renewal date (move forward in 12-month increments until it's in the future)
    let renewalDate = new Date(contractEnd);
    while (renewalDate < now) {
      renewalDate = addMonths(renewalDate, 12);
    }

    // Products: 2-5 modules from PRODUCT_MODULES
    const moduleCount = cc.size === 'enterprise'
      ? Math.floor(rand(3, 5))
      : cc.size === 'growth'
        ? Math.floor(rand(2, 4))
        : Math.floor(rand(2, 3));
    const products = pickN(PRODUCT_MODULES.map(m => m.name), moduleCount);

    // Assign health score — enterprise customers tend healthy/champion
    let healthScore: HealthScore;
    if (cc.size === 'enterprise' && Math.random() < 0.6) {
      healthScore = weightedPick<HealthScore>(
        ['neutral', 'healthy', 'champion'] as const,
        [20, 50, 30]
      );
    } else if (cc.size === 'starter' && Math.random() < 0.4) {
      healthScore = weightedPick<HealthScore>(
        ['critical', 'at_risk', 'neutral', 'healthy'] as const,
        [20, 30, 30, 20]
      );
    } else {
      healthScore = healthBuckets[i];
    }

    // Numeric health score derived from label
    let healthScoreNumeric: number;
    switch (healthScore) {
      case 'critical': healthScoreNumeric = Math.round(rand(5, 25)); break;
      case 'at_risk': healthScoreNumeric = Math.round(rand(26, 45)); break;
      case 'neutral': healthScoreNumeric = Math.round(rand(46, 65)); break;
      case 'healthy': healthScoreNumeric = Math.round(rand(66, 85)); break;
      case 'champion': healthScoreNumeric = Math.round(rand(86, 100)); break;
    }

    // NPS: biased positive (median ~45), at-risk get negative
    let npsScore: number;
    if (healthScore === 'critical') {
      npsScore = Math.round(rand(-60, -10));
    } else if (healthScore === 'at_risk') {
      npsScore = Math.round(rand(-20, 25));
    } else if (healthScore === 'neutral') {
      npsScore = Math.round(rand(15, 50));
    } else if (healthScore === 'healthy') {
      npsScore = Math.round(rand(40, 75));
    } else {
      npsScore = Math.round(rand(65, 100));
    }

    // CSAT: 1.0-5.0, biased 3.5-4.5, at-risk 2.0-3.0
    let csatScore: number;
    if (healthScore === 'critical') {
      csatScore = rand(1.5, 2.5);
    } else if (healthScore === 'at_risk') {
      csatScore = rand(2.0, 3.0);
    } else if (healthScore === 'neutral') {
      csatScore = rand(3.0, 3.8);
    } else if (healthScore === 'healthy') {
      csatScore = rand(3.5, 4.5);
    } else {
      csatScore = rand(4.2, 5.0);
    }
    csatScore = Math.round(csatScore * 10) / 10;

    // Usage metrics
    let apiCallsMonthly: number;
    let usersActive: number;
    switch (cc.size) {
      case 'enterprise':
        apiCallsMonthly = Math.round(rand(50_000, 500_000));
        usersActive = Math.round(rand(20, 100));
        break;
      case 'growth':
        apiCallsMonthly = Math.round(rand(10_000, 50_000));
        usersActive = Math.round(rand(5, 20));
        break;
      case 'starter':
        apiCallsMonthly = Math.round(rand(1_000, 10_000));
        usersActive = Math.round(rand(2, 5));
        break;
    }

    const alertsProcessed = Math.round(apiCallsMonthly * rand(0.6, 0.8));
    const loginFrequency = Math.round(rand(3, 25));
    const featureAdoptionPct = Math.round(rand(40, 95));

    // Last active date: most within 7 days, at-risk ones 15-30 days ago
    let lastActiveDaysAgo: number;
    if (healthScore === 'critical') {
      lastActiveDaysAgo = Math.round(rand(20, 45));
    } else if (healthScore === 'at_risk') {
      lastActiveDaysAgo = Math.round(rand(15, 30));
    } else {
      lastActiveDaysAgo = Math.round(rand(0, 7));
    }
    const lastActiveDate = new Date(now);
    lastActiveDate.setDate(lastActiveDate.getDate() - lastActiveDaysAgo);

    // Churn risk: derived from health score inverse + renewal proximity + usage
    const renewalDaysAway = daysBetween(now, renewalDate);
    const renewalProximityFactor = renewalDaysAway < 60 ? 30 : renewalDaysAway < 120 ? 15 : 0;
    const usageTrendFactor = lastActiveDaysAgo > 14 ? 20 : lastActiveDaysAgo > 7 ? 10 : 0;
    const baseChurnRisk = 100 - healthScoreNumeric;
    const churnRisk = clamp(Math.round(baseChurnRisk * 0.5 + renewalProximityFactor + usageTrendFactor), 0, 100);

    // Expansion potential: derived from module count vs available, usage, NPS
    const moduleGap = PRODUCT_MODULES.length - products.length;
    const moduleGapFactor = (moduleGap / PRODUCT_MODULES.length) * 40;
    const usageGrowthFactor = featureAdoptionPct > 70 ? 25 : featureAdoptionPct > 50 ? 15 : 5;
    const npsFactor = npsScore > 50 ? 20 : npsScore > 20 ? 10 : 0;
    const expansionPotential = clamp(Math.round(moduleGapFactor + usageGrowthFactor + npsFactor + rand(-5, 10)), 0, 100);

    // Primary contact: pick a name from hubspot contacts or generate one
    const hubspotContact = hubspotData.contacts.find(c => c.company === cc.name);
    const primaryContact = hubspotContact
      ? `${hubspotContact.firstName} ${hubspotContact.lastName}`
      : `${pick(['James', 'Sarah', 'David', 'Michelle', 'Andrew', 'Linda', 'Robert', 'Emily'])} ${pick(['Tan', 'Lim', 'Wong', 'Chen', 'Lee', 'Kim', 'Park', 'Wang'])}`;

    const account: CustomerAccount = {
      id: accountId,
      name: cc.name,
      country: cc.country,
      industry: cc.industry,
      contractValue,
      contractStartDate: iso(contractStart),
      contractEndDate: iso(renewalDate),
      renewalDate: iso(renewalDate),
      healthScore,
      healthScoreNumeric,
      npsScore,
      csatScore,
      primaryContact,
      csm: CSM_BY_COUNTRY[cc.country],
      tier: cc.size,
      products,
      usageMetrics: {
        apiCallsMonthly,
        alertsProcessed,
        usersActive,
        loginFrequency,
        featureAdoptionPct,
        lastActiveDate: iso(lastActiveDate),
      },
      churnRisk,
      expansionPotential,
      regulatoryBody: REGULATORY_BODIES[cc.country],
    };

    accounts.push(account);
    accountIdMap.set(cc.name, account);
  }

  // ── Step 5: Inject anomalies ────────────────────────────────────────────

  injectAnomalies(accounts, now);

  // ── Step 6: Generate 350+ support tickets ───────────────────────────────

  const tickets = generateTickets(accounts, now, twelveMonthsAgo);

  // ── Step 7: Compute ticket summary ──────────────────────────────────────

  const totalOpen = tickets.filter(t => t.status === 'open').length;
  const totalResolved = tickets.filter(t => t.status === 'resolved').length;
  const resolvedTickets = tickets.filter(t => t.resolutionTimeHours !== null);
  const avgResolutionHours = resolvedTickets.length > 0
    ? Math.round((resolvedTickets.reduce((sum, t) => sum + (t.resolutionTimeHours ?? 0), 0) / resolvedTickets.length) * 100) / 100
    : 0;
  const escalatedCount = tickets.filter(t => t.status === 'escalated').length;
  const escalationRate = Math.round((escalatedCount / tickets.length) * 10000) / 10000;

  const byPriority: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const t of tickets) {
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
    byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
  }

  const ticketSummary = {
    totalOpen,
    totalResolved,
    avgResolutionHours,
    escalationRate,
    byPriority,
    byCategory,
  };

  // ── Step 8: Compute health distribution ─────────────────────────────────

  const healthDistribution: Record<HealthScore, number> = {
    critical: 0,
    at_risk: 0,
    neutral: 0,
    healthy: 0,
    champion: 0,
  };
  for (const a of accounts) {
    healthDistribution[a.healthScore]++;
  }

  // ── Step 9: Compute NRR metrics ─────────────────────────────────────────

  const totalACV = accounts.reduce((sum, a) => sum + a.contractValue, 0);
  const grossRetentionRate = rand(0.88, 0.94);
  const netRevenueRetention = rand(1.08, 1.18);
  const churnRate = rand(0.06, 0.12);

  // Expansion revenue: champions and healthy accounts with high expansion potential
  const expansionAccounts = accounts.filter(a => a.expansionPotential > 60);
  const expansionRevenue = Math.round(
    expansionAccounts.reduce((sum, a) => sum + a.contractValue * rand(0.1, 0.35), 0)
  );

  // Contraction revenue: at-risk and critical accounts
  const contractionAccounts = accounts.filter(a => a.healthScore === 'critical' || a.healthScore === 'at_risk');
  const contractionRevenue = Math.round(
    contractionAccounts.reduce((sum, a) => sum + a.contractValue * rand(0.05, 0.2), 0)
  );

  const nrrMetrics = {
    grossRetentionRate: Math.round(grossRetentionRate * 10000) / 10000,
    netRevenueRetention: Math.round(netRevenueRetention * 10000) / 10000,
    churnRate: Math.round(churnRate * 10000) / 10000,
    expansionRevenue,
    contractionRevenue,
  };

  return {
    accounts,
    tickets,
    ticketSummary,
    healthDistribution,
    nrrMetrics,
  };
}

// ─── Anomaly Injection ──────────────────────────────────────────────────────

function injectAnomalies(accounts: CustomerAccount[], now: Date): void {
  // Anomaly 1: 2 enterprise customers with declining usage but health score still "neutral"
  // (silent churn signal — apiCalls dropped 40%+ but health hasn't updated)
  const enterpriseAccounts = accounts.filter(a => a.tier === 'enterprise' && a.healthScore !== 'critical');
  const silentChurnCandidates = pickN(enterpriseAccounts, 2);
  for (const acct of silentChurnCandidates) {
    acct.healthScore = 'neutral';
    acct.healthScoreNumeric = Math.round(rand(50, 60));
    // Show dramatically reduced usage — the "40% drop" is implicit in the low numbers
    // for an enterprise account that should be doing 50K-500K calls
    acct.usageMetrics.apiCallsMonthly = Math.round(rand(15_000, 30_000));
    acct.usageMetrics.alertsProcessed = Math.round(acct.usageMetrics.apiCallsMonthly * rand(0.5, 0.65));
    acct.usageMetrics.loginFrequency = Math.round(rand(2, 5));
    acct.usageMetrics.featureAdoptionPct = Math.round(rand(30, 45));
    // Last active relatively recent so it doesn't trigger other alerts
    const lastActive = new Date(now);
    lastActive.setDate(lastActive.getDate() - Math.round(rand(3, 8)));
    acct.usageMetrics.lastActiveDate = iso(lastActive);
  }

  // Anomaly 2: 1 champion customer (DBS Bank) whose NPS dropped from 80 to 30
  // but submitted 0 tickets — passive dissatisfaction
  const dbsAccount = accounts.find(a => a.name === 'DBS Bank');
  if (dbsAccount) {
    dbsAccount.healthScore = 'champion';
    dbsAccount.healthScoreNumeric = Math.round(rand(86, 92));
    dbsAccount.npsScore = 30; // Dropped from expected 80+ to 30
    dbsAccount.csatScore = 3.2; // Also dipped
    // Keep usage high so it still looks like a champion on paper
    dbsAccount.usageMetrics.apiCallsMonthly = Math.round(rand(300_000, 450_000));
    dbsAccount.usageMetrics.alertsProcessed = Math.round(dbsAccount.usageMetrics.apiCallsMonthly * 0.75);
    dbsAccount.usageMetrics.usersActive = Math.round(rand(60, 90));
    dbsAccount.usageMetrics.loginFrequency = Math.round(rand(18, 25));
    dbsAccount.usageMetrics.featureAdoptionPct = Math.round(rand(80, 92));
    dbsAccount.tier = 'enterprise';
    dbsAccount.contractValue = Math.round(rand(350_000, 450_000));
  }

  // Anomaly 3: 3 customers with renewal in next 60 days and healthScore < 50
  // (urgent renewal risk)
  const renewalRiskCandidates = accounts.filter(
    a => a.healthScore !== 'critical' && !silentChurnCandidates.includes(a) && a !== dbsAccount
  );
  const renewalRiskAccounts = pickN(renewalRiskCandidates, 3);
  for (const acct of renewalRiskAccounts) {
    // Set renewal to within 60 days
    const daysUntilRenewal = Math.round(rand(10, 55));
    const renewalDate = new Date(now);
    renewalDate.setDate(renewalDate.getDate() + daysUntilRenewal);
    acct.renewalDate = iso(renewalDate);
    acct.contractEndDate = iso(renewalDate);

    // Set health below 50
    acct.healthScore = weightedPick<HealthScore>(
      ['critical', 'at_risk'] as const,
      [30, 70]
    );
    acct.healthScoreNumeric = Math.round(rand(15, 45));
    acct.npsScore = Math.round(rand(-30, 20));
    acct.csatScore = Math.round(rand(1.8, 2.8) * 10) / 10;
    acct.churnRisk = Math.round(rand(70, 95));

    // Degraded usage
    const lastActive = new Date(now);
    lastActive.setDate(lastActive.getDate() - Math.round(rand(10, 25)));
    acct.usageMetrics.lastActiveDate = iso(lastActive);
    acct.usageMetrics.loginFrequency = Math.round(rand(1, 4));
    acct.usageMetrics.featureAdoptionPct = Math.round(rand(25, 45));
  }

  // Anomaly 4: 1 customer (Maybank) using 3 modules, eligible for 6,
  // but CSM hasn't engaged in 60+ days
  const maybankAccount = accounts.find(a => a.name === 'Maybank');
  if (maybankAccount) {
    // Ensure exactly 3 modules
    maybankAccount.products = pickN(PRODUCT_MODULES.map(m => m.name), 3);
    maybankAccount.tier = 'enterprise';
    maybankAccount.contractValue = Math.round(rand(200_000, 350_000));
    maybankAccount.healthScore = 'healthy';
    maybankAccount.healthScoreNumeric = Math.round(rand(68, 78));
    maybankAccount.npsScore = Math.round(rand(45, 65));
    maybankAccount.csatScore = Math.round(rand(3.5, 4.2) * 10) / 10;
    // High expansion potential because of module gap
    maybankAccount.expansionPotential = Math.round(rand(75, 90));
    // Usage is decent — not a churn risk, just a missed opportunity
    maybankAccount.usageMetrics.apiCallsMonthly = Math.round(rand(120_000, 250_000));
    maybankAccount.usageMetrics.alertsProcessed = Math.round(maybankAccount.usageMetrics.apiCallsMonthly * 0.72);
    maybankAccount.usageMetrics.usersActive = Math.round(rand(35, 60));
    maybankAccount.usageMetrics.loginFrequency = Math.round(rand(12, 18));
    maybankAccount.usageMetrics.featureAdoptionPct = Math.round(rand(55, 70));
    // CSM last engaged 60+ days ago (reflected in lastActiveDate being recent
    // but the CSM engagement gap is implicit — the brain should notice
    // Maybank is healthy, uses only 3/6 modules, and expansion potential is high
    // but there's no recent CSM activity)
  }
}

// ─── Ticket Generation ──────────────────────────────────────────────────────

function generateTickets(
  accounts: CustomerAccount[],
  now: Date,
  startDate: Date,
): SupportTicket[] {
  const tickets: SupportTicket[] = [];

  // Target 350+ tickets distributed across accounts
  // More tickets for enterprise, fewer for starter
  // At-risk and critical accounts generate more tickets proportionally
  const targetTotal = 380;
  const ticketWeights = accounts.map(a => {
    let weight = 1;
    if (a.tier === 'enterprise') weight *= 3;
    else if (a.tier === 'growth') weight *= 2;

    if (a.healthScore === 'critical') weight *= 2;
    else if (a.healthScore === 'at_risk') weight *= 1.5;
    return weight;
  });

  const totalWeight = ticketWeights.reduce((s, w) => s + w, 0);
  const ticketsPerAccount = ticketWeights.map(w =>
    Math.max(1, Math.round((w / totalWeight) * targetTotal))
  );

  // Exception: DBS Bank (anomaly 2) should have 0 tickets in recent months
  const dbsIndex = accounts.findIndex(a => a.name === 'DBS Bank');

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const count = ticketsPerAccount[i];

    for (let j = 0; j < count; j++) {
      // For DBS, only generate old tickets (>6 months ago)
      let createdDate: Date;
      if (i === dbsIndex && dbsIndex !== -1) {
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        createdDate = randomDate(startDate, sixMonthsAgo);
      } else {
        createdDate = randomDate(startDate, now);
      }

      // Category
      const category = pick(TICKET_CATEGORIES);

      // Priority distribution: 50% medium, 25% low, 20% high, 5% critical
      const priority = weightedPick(
        ['low', 'medium', 'high', 'critical'] as const,
        [25, 50, 20, 5]
      );

      // Status: 70% resolved, 15% in_progress, 10% open, 5% escalated
      const status = weightedPick(
        ['resolved', 'in_progress', 'open', 'escalated'] as const,
        [70, 15, 10, 5]
      );

      // Subject: pick from templates
      const subjectOptions = TICKET_SUBJECTS[category];
      const subject = pick(subjectOptions);

      // Resolution time based on priority (in hours)
      let resolutionTimeHours: number | null = null;
      let resolvedDate: string | null = null;

      if (status === 'resolved') {
        switch (priority) {
          case 'low': resolutionTimeHours = rand(24, 72); break;
          case 'medium': resolutionTimeHours = rand(4, 24); break;
          case 'high': resolutionTimeHours = rand(1, 8); break;
          case 'critical': resolutionTimeHours = rand(0.5, 4); break;
        }
        resolutionTimeHours = Math.round(resolutionTimeHours * 100) / 100;
        const resolvedDateObj = new Date(createdDate);
        resolvedDateObj.setTime(resolvedDateObj.getTime() + resolutionTimeHours * 60 * 60 * 1000);
        resolvedDate = iso(resolvedDateObj);
      }

      // Assignee
      const assignee = pick(SUPPORT_ASSIGNEES);

      tickets.push({
        id: nextTicketId(),
        customerId: account.id,
        customerName: account.name,
        createdDate: iso(createdDate),
        resolvedDate,
        category,
        priority,
        subject,
        status,
        resolutionTimeHours,
        assignee,
      });
    }
  }

  // Sort tickets by created date
  tickets.sort((a, b) => a.createdDate.localeCompare(b.createdDate));

  return tickets;
}
