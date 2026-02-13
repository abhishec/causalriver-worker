/**
 * Synthetic HubSpot CRM Data Generator — Company Jarvis
 *
 * Generates 12 months of realistic CRM data for an APAC AML software company
 * (~$10M ARR). 55 customer companies, 220 contacts, 110 deals across pipeline
 * stages, sales rep performance metrics, and computed pipeline summary.
 *
 * Includes injected anomalies: stalled negotiations, champion departures,
 * churn threats, weak AU pipeline coverage, and slow TW deal cycles.
 *
 * Pure functions, typed returns, no async — mirrors synthetic-volopay.ts pattern.
 */

import type {
  HubSpotData,
  HubSpotDeal,
  HubSpotContact,
  HubSpotCompany,
  SalesRep,
  DealStage,
  DealActivity,
  Country,
} from './types';

import {
  CUSTOMER_COMPANIES,
  SALES_REP_DEFS,
  PRODUCT_MODULES,
  COMPETITORS,
  REGULATORY_BODIES,
  rand,
  pick,
} from './constants';

// ─── Country-Appropriate Name Pools ──────────────────────────────────────────

const FIRST_NAMES: Record<Country, string[]> = {
  SG: [
    'Wei Lin', 'Jun Wei', 'Priya', 'Ahmad', 'Mei Ling', 'Ravi', 'Siew Ling',
    'Deepak', 'Nicole', 'Kai Wen', 'Hui Min', 'Arun', 'Sze Ying', 'Farhan',
    'Li Wei', 'Kavitha', 'Chee Keong', 'Nurul', 'Zhiming', 'Ananya',
  ],
  MY: [
    'Nurul Hafizah', 'Lim Chee Keong', 'Ahmad Faizal', 'Siti Aisyah', 'Wei Jie',
    'Mohd Rizal', 'Mei Fong', 'Ismail', 'Hui Wen', 'Zulkifli',
    'Syahirah', 'Cheng Wei', 'Farah', 'Kah Wai', 'Azizah',
    'Jia Xin', 'Hakim', 'Puteri', 'Boon Keat', 'Yasmin',
  ],
  TW: [
    'Yu-Ting', 'Jia-Wen', 'Hsiu-Mei', 'Ming-Hao', 'Shu-Fen', 'Cheng-Han',
    'Wei-Lin', 'Pei-Shan', 'Zhi-Wei', 'Mei-Hua', 'Hsin-Yi', 'Jun-Kai',
    'Ya-Wen', 'Bo-Wen', 'Shu-Hui', 'Yi-Chen', 'Jing-Wen', 'Kai-Ting',
    'Xin-Yi', 'Wen-Hao',
  ],
  AU: [
    'James', 'Jennifer', 'Michael', 'Sarah', 'David', 'Emma', 'Daniel',
    'Jessica', 'Matthew', 'Lauren', 'Andrew', 'Rebecca', 'Thomas', 'Rachel',
    'Christopher', 'Megan', 'Nathan', 'Olivia', 'Benjamin', 'Stephanie',
  ],
  PH: [
    'Maria', 'Juan Carlos', 'Angela', 'Jose', 'Fatima', 'Miguel', 'Patricia',
    'Rafael', 'Christina', 'Paolo', 'Isabelle', 'Marco', 'Carmela', 'Gabriel',
    'Sofia', 'Andres', 'Bianca', 'Enrique', 'Daniela', 'Antonio',
  ],
};

const LAST_NAMES: Record<Country, string[]> = {
  SG: [
    'Tan', 'Lim', 'Sharma', 'bin Hassan', 'Ong', 'Kumar', 'Chua', 'Patel',
    'Ang', 'Teo', 'Goh', 'Menon', 'Wong', 'Nair', 'Ho', 'Das',
  ],
  MY: [
    'bin Abdullah', 'binti Rahman', 'Tan', 'Lim', 'bin Mohd', 'binti Ismail',
    'Chong', 'Lee', 'bin Yusof', 'binti Zainal', 'Ng', 'Wong',
    'bin Harun', 'binti Hussin', 'Ooi', 'Chin',
  ],
  TW: [
    'Chen', 'Wang', 'Lin', 'Huang', 'Tsai', 'Wu', 'Chang', 'Liu',
    'Yang', 'Hsu', 'Lai', 'Cheng', 'Kuo', 'Ho', 'Chou', 'Liao',
  ],
  AU: [
    'Morrison', 'Wu', 'Thompson', 'Zhang', 'Williams', 'Nguyen', 'Brown',
    'Patel', 'Smith', 'Chen', 'Wilson', 'O\'Brien', 'Taylor', 'Singh',
    'Anderson', 'Lee',
  ],
  PH: [
    'Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres',
    'Villanueva', 'Ramos', 'Dela Cruz', 'Gonzales', 'Aquino',
    'Fernandez', 'Castillo', 'Domingo', 'Rivera',
  ],
};

const CONTACT_ROLES = [
  'Head of Compliance',
  'MLRO',
  'CTO',
  'CFO',
  'VP Risk',
  'Head of AML Operations',
  'Chief Risk Officer',
  'Compliance Manager',
  'Director of Financial Crime',
  'VP Technology',
] as const;

const LEAD_SOURCES = [
  'Conference (Money20/20 Asia)',
  'Inbound Website',
  'LinkedIn Outreach',
  'Referral',
  'Partner Channel',
  'Regulatory Event',
  'Content Download',
  'Webinar Attendee',
] as const;

const LOSS_REASONS = [
  'chose competitor',
  'budget frozen',
  'regulatory delay',
  'building in-house',
] as const;

const ACTIVITY_DESCRIPTIONS: Record<DealActivity['type'], string[]> = {
  call: [
    'Discovery call — discussed current AML pain points',
    'Follow-up call — reviewed transaction monitoring requirements',
    'Call with compliance team — discussed regulatory deadlines',
    'Technical scoping call — API integration requirements',
    'Executive sponsor call — budget and timeline alignment',
    'Quarterly review call — discussed expansion opportunities',
  ],
  email: [
    'Sent product overview deck and case studies',
    'Shared ROI analysis for automated screening',
    'Followed up on proposal — awaiting internal review',
    'Sent compliance regulation summary for their jurisdiction',
    'Shared technical documentation and API specs',
    'Sent competitive comparison matrix',
  ],
  meeting: [
    'On-site meeting with compliance leadership team',
    'Workshop — mapped current AML workflow gaps',
    'Meeting with CTO and engineering team on integration',
    'Stakeholder alignment meeting with CFO and Head of Risk',
    'Joint meeting with regulatory affairs team',
    'Partnership strategy discussion with VP Risk',
  ],
  demo: [
    'Live demo — Transaction Monitoring module with real scenarios',
    'Demo — KYC/CDD automation workflow for onboarding',
    'Technical deep-dive — PEP & Sanctions Screening engine',
    'Demo — Risk Scoring Engine with custom rule builder',
    'End-to-end platform demo for evaluation committee',
    'POC results review — showed 78% false positive reduction',
  ],
  proposal_sent: [
    'Sent formal proposal — 3-year enterprise license',
    'Sent revised proposal with volume discount',
    'Submitted RFP response with technical architecture',
    'Sent SOW for phased implementation approach',
    'Proposal sent with regulatory compliance guarantees',
  ],
  contract_sent: [
    'Sent MSA and order form for legal review',
    'Sent revised contract with updated SLA terms',
    'Contract sent — includes data residency addendum',
    'Final contract sent with negotiated payment terms',
    'Sent executed contract — pending counter-signature',
  ],
};

const ACTIVITY_OUTCOMES: Record<DealActivity['type'], string[]> = {
  call: [
    'Positive — moving forward with evaluation',
    'Needs follow-up — waiting for internal alignment',
    'Scheduled product demo for next week',
    'Identified additional stakeholders to involve',
    'Champion confirmed budget availability',
    'Discussed competitive landscape — we are shortlisted',
  ],
  email: [
    'Opened — no reply yet',
    'Replied — requesting demo',
    'Forwarded to compliance committee',
    'Positive feedback on ROI numbers',
    'No response — will follow up next week',
    'Acknowledged — reviewing internally',
  ],
  meeting: [
    'Strong engagement — requested proposal',
    'Need to address data residency concerns',
    'Aligned on implementation timeline',
    'Budget approved by CFO — moving to procurement',
    'Identified blocker — legacy system migration',
    'Positive — invited to present to board',
  ],
  demo: [
    'Very impressed — requested sandbox access',
    'Questions on scalability for their volume',
    'Positive feedback from compliance team',
    'Compared favorably to current solution',
    'Requested customization for local regulations',
    'POC approved — starting next month',
  ],
  proposal_sent: [
    'Under review by procurement',
    'Requested pricing adjustment',
    'Feedback expected within 2 weeks',
    'Legal review in progress',
    'Counter-proposal received — negotiating terms',
  ],
  contract_sent: [
    'Legal reviewing — expected 1-2 weeks',
    'Minor redlines received — addressing this week',
    'Counter-signed — deal closed!',
    'Delayed — legal flagged data residency clause',
    'Signed — implementation kickoff scheduled',
  ],
};

// ─── Stage Configuration ────────────────────────────────────────────────────

interface StageConfig {
  stage: DealStage;
  count: number;
  amountMin: number;
  amountMax: number;
  probability: number;
  minDaysInStage: number;
  maxDaysInStage: number;
}

const STAGE_CONFIGS: StageConfig[] = [
  { stage: 'prospecting', count: 20, amountMin: 50_000, amountMax: 200_000, probability: 0.10, minDaysInStage: 5, maxDaysInStage: 30 },
  { stage: 'discovery', count: 15, amountMin: 100_000, amountMax: 350_000, probability: 0.25, minDaysInStage: 10, maxDaysInStage: 45 },
  { stage: 'proposal', count: 12, amountMin: 150_000, amountMax: 400_000, probability: 0.50, minDaysInStage: 14, maxDaysInStage: 60 },
  { stage: 'negotiation', count: 8, amountMin: 200_000, amountMax: 500_000, probability: 0.75, minDaysInStage: 10, maxDaysInStage: 40 },
  { stage: 'closed_won', count: 35, amountMin: 80_000, amountMax: 500_000, probability: 1.00, minDaysInStage: 0, maxDaysInStage: 0 },
  { stage: 'closed_lost', count: 15, amountMin: 60_000, amountMax: 400_000, probability: 0.00, minDaysInStage: 0, maxDaysInStage: 0 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function subtractDays(d: Date, days: number): Date {
  return addDays(d, -days);
}

function randomDate(from: Date, to: Date): Date {
  const diff = to.getTime() - from.getTime();
  return new Date(from.getTime() + Math.random() * diff);
}

function getDealAmount(size: 'enterprise' | 'growth' | 'starter'): number {
  switch (size) {
    case 'enterprise': return rand(200_000, 500_000);
    case 'growth': return rand(80_000, 200_000);
    case 'starter': return rand(40_000, 100_000);
  }
}

function generateActivities(
  createdDate: Date,
  stage: DealStage,
  daysInStage: number,
  isStalled: boolean,
): DealActivity[] {
  const activityTypes: DealActivity['type'][] = ['call', 'email', 'meeting', 'demo', 'proposal_sent', 'contract_sent'];
  const count = Math.round(rand(3, 8));
  const activities: DealActivity[] = [];

  // Determine available activity types based on stage progression
  const stageProgression: Record<DealStage, DealActivity['type'][]> = {
    prospecting: ['call', 'email'],
    discovery: ['call', 'email', 'meeting', 'demo'],
    proposal: ['call', 'email', 'meeting', 'demo', 'proposal_sent'],
    negotiation: ['call', 'email', 'meeting', 'proposal_sent', 'contract_sent'],
    closed_won: activityTypes,
    closed_lost: ['call', 'email', 'meeting', 'demo', 'proposal_sent'],
  };

  const allowedTypes = stageProgression[stage];
  const endDate = isStalled
    ? subtractDays(new Date(), Math.round(rand(45, 90)))
    : new Date();

  const activityWindow = Math.max(1, Math.round((endDate.getTime() - createdDate.getTime()) / (24 * 60 * 60 * 1000)));

  for (let i = 0; i < count; i++) {
    const type = pick(allowedTypes);
    const dayOffset = Math.round(rand(0, activityWindow));
    const actDate = addDays(createdDate, dayOffset);
    const descriptions = ACTIVITY_DESCRIPTIONS[type];
    const outcomes = ACTIVITY_OUTCOMES[type];

    activities.push({
      date: dateStr(actDate),
      type,
      description: pick(descriptions),
      outcome: pick(outcomes),
    });
  }

  // Sort by date ascending
  activities.sort((a, b) => a.date.localeCompare(b.date));
  return activities;
}

function pickProducts(): string {
  const core = PRODUCT_MODULES.filter(m => m.tier === 'core');
  const addons = PRODUCT_MODULES.filter(m => m.tier === 'addon');

  // Always include 1-2 core products, 0-2 addons
  const coreCount = Math.round(rand(1, 2));
  const addonCount = Math.round(rand(0, 2));

  const selected: string[] = [];
  const corePool = [...core];
  for (let i = 0; i < coreCount && corePool.length > 0; i++) {
    const idx = Math.floor(Math.random() * corePool.length);
    selected.push(corePool[idx].name);
    corePool.splice(idx, 1);
  }
  const addonPool = [...addons];
  for (let i = 0; i < addonCount && addonPool.length > 0; i++) {
    const idx = Math.floor(Math.random() * addonPool.length);
    selected.push(addonPool[idx].name);
    addonPool.splice(idx, 1);
  }

  return selected.join(', ');
}

function getSalesRepForCountry(country: Country): { id: string; name: string } {
  const reps = SALES_REP_DEFS.filter(r => r.region === country);
  if (reps.length === 0) {
    // Fallback to SG reps
    const sgReps = SALES_REP_DEFS.filter(r => r.region === 'SG');
    const rep = pick(sgReps);
    return { id: rep.id, name: rep.name };
  }
  const rep = pick(reps);
  return { id: rep.id, name: rep.name };
}

function generateContactName(country: Country, usedNames: Set<string>): { firstName: string; lastName: string } {
  let attempts = 0;
  while (attempts < 50) {
    const firstName = pick(FIRST_NAMES[country]);
    const lastName = pick(LAST_NAMES[country]);
    const full = `${firstName} ${lastName}`;
    if (!usedNames.has(full)) {
      usedNames.add(full);
      return { firstName, lastName };
    }
    attempts++;
  }
  // Fallback with unique suffix
  const firstName = pick(FIRST_NAMES[country]);
  const lastName = pick(LAST_NAMES[country]);
  const suffix = String(Math.floor(Math.random() * 100));
  const full = `${firstName} ${lastName} ${suffix}`;
  usedNames.add(full);
  return { firstName, lastName: `${lastName} ${suffix}` };
}

function generateWebsite(companyName: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .substring(0, 20);
  return `https://www.${slug}.com`;
}

function generatePhone(country: Country): string {
  const prefixes: Record<Country, string> = {
    SG: '+65 ',
    MY: '+60 ',
    TW: '+886 ',
    AU: '+61 ',
    PH: '+63 ',
  };
  const digits = String(Math.floor(Math.random() * 90000000 + 10000000));
  return `${prefixes[country]}${digits.substring(0, 4)} ${digits.substring(4)}`;
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export function generateHubSpotData(startDate?: Date): HubSpotData {
  const now = new Date();
  const start = startDate || new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const usedContactNames = new Set<string>();

  // ── 1. Build Companies (55) ───────────────────────────────────────────────

  const companies: HubSpotCompany[] = CUSTOMER_COMPANIES.map((cc, i) => ({
    id: `COMP-${String(i + 1).padStart(3, '0')}`,
    name: cc.name,
    industry: cc.industry,
    country: cc.country,
    employeeCount: cc.employeeCount,
    annualRevenue: cc.annualRevenue,
    regulatoryBody: REGULATORY_BODIES[cc.country],
    amlMaturityLevel: cc.amlMaturity,
    website: generateWebsite(cc.name),
  }));

  // ── 2. Build Contacts (220 — 2-4 per company) ────────────────────────────

  const contacts: HubSpotContact[] = [];
  let contactId = 1;

  for (const company of companies) {
    const contactCount = Math.round(rand(2, 4));
    const usedRoles = new Set<string>();

    for (let c = 0; c < contactCount; c++) {
      const { firstName, lastName } = generateContactName(company.country, usedContactNames);
      let role: string;
      do {
        role = pick([...CONTACT_ROLES]);
      } while (usedRoles.has(role) && usedRoles.size < CONTACT_ROLES.length);
      usedRoles.add(role);

      const emailDomain = company.name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '')
        .substring(0, 15);

      const lastContactDaysAgo = Math.round(rand(1, 90));

      contacts.push({
        id: `CON-${String(contactId++).padStart(4, '0')}`,
        firstName,
        lastName,
        email: `${firstName.toLowerCase().replace(/[\s-]/g, '.')}.${lastName.toLowerCase().replace(/[\s-]/g, '.')}@${emailDomain}.com`,
        phone: generatePhone(company.country),
        company: company.name,
        companyId: company.id,
        role,
        country: company.country,
        lastContactDate: dateStr(subtractDays(now, lastContactDaysAgo)),
        leadSource: pick([...LEAD_SOURCES]),
      });
    }
  }

  // ── 3. Build Deals (110) ──────────────────────────────────────────────────

  const deals: HubSpotDeal[] = [];
  let dealId = 1;

  // Track which companies have been used per stage to distribute across companies
  const companyDealCounts: Record<string, number> = {};

  // Anomaly tracking
  let stalledNegotiationCount = 0;
  let championLeftCount = 0;
  let maybankChurnInjected = false;

  for (const config of STAGE_CONFIGS) {
    for (let d = 0; d < config.count; d++) {
      // Pick a company, preferring those with fewer deals
      let company: HubSpotCompany;
      const sortedByUsage = [...companies].sort(
        (a, b) => (companyDealCounts[a.id] || 0) - (companyDealCounts[b.id] || 0)
      );

      // For certain anomalies, pick specific companies
      let isStalled = false;
      let isChampionLeft = false;
      let isMaybankChurn = false;

      // Stalled negotiation anomaly (3 deals)
      if (config.stage === 'negotiation' && stalledNegotiationCount < 3 && d < 3) {
        isStalled = true;
        stalledNegotiationCount++;
      }

      // Champion left anomaly (2 deals in active pipeline)
      if ((config.stage === 'proposal' || config.stage === 'discovery') && championLeftCount < 2 && d === 0) {
        isChampionLeft = true;
        championLeftCount++;
      }

      // Maybank churn threat (attach to a Maybank deal)
      if (config.stage === 'negotiation' && !maybankChurnInjected && d === config.count - 1) {
        const maybankComp = companies.find(c => c.name === 'Maybank');
        if (maybankComp) {
          company = maybankComp;
          isMaybankChurn = true;
          maybankChurnInjected = true;
        } else {
          company = pick(sortedByUsage.slice(0, 15));
        }
      } else {
        // Pick from top 15 least-used to spread deals
        company = pick(sortedByUsage.slice(0, 15));
      }

      companyDealCounts[company.id] = (companyDealCounts[company.id] || 0) + 1;

      // Find contacts for this company
      const companyContacts = contacts.filter(c => c.companyId === company.id);
      const primaryContact = companyContacts.length > 0
        ? pick(companyContacts)
        : contacts[0]; // fallback

      // Sales rep for the country
      const rep = getSalesRepForCountry(company.country);

      // Company size from CUSTOMER_COMPANIES
      const ccDef = CUSTOMER_COMPANIES.find(cc => cc.name === company.name);
      const companySize = ccDef?.size || 'growth';

      // Amount based on company size and stage
      let amount: number;
      if (config.stage === 'closed_won' || config.stage === 'closed_lost') {
        amount = getDealAmount(companySize);
      } else {
        // Clamp to stage range but respect company size
        const sizeAmount = getDealAmount(companySize);
        amount = Math.max(config.amountMin, Math.min(config.amountMax, sizeAmount));
      }

      // Dates
      let createdDate: Date;
      let closeDate: Date;
      let actualCloseDate: string | null = null;
      let daysInCurrentStage: number;

      if (config.stage === 'closed_won') {
        // Historical wins spread over 12 months
        createdDate = randomDate(start, subtractDays(now, 30));
        const cycleDays = company.country === 'TW'
          ? Math.round(rand(120, 240)) // TW deals have 2x longer cycle
          : Math.round(rand(60, 120));
        closeDate = addDays(createdDate, cycleDays);
        if (closeDate > now) closeDate = subtractDays(now, Math.round(rand(5, 30)));
        actualCloseDate = dateStr(closeDate);
        daysInCurrentStage = 0;
      } else if (config.stage === 'closed_lost') {
        createdDate = randomDate(start, subtractDays(now, 20));
        const cycleDays = Math.round(rand(30, 150));
        closeDate = addDays(createdDate, cycleDays);
        if (closeDate > now) closeDate = subtractDays(now, Math.round(rand(5, 15)));
        actualCloseDate = dateStr(closeDate);
        daysInCurrentStage = 0;
      } else {
        // Active deals
        const maxDaysAgo = config.stage === 'prospecting' ? 45
          : config.stage === 'discovery' ? 90
          : config.stage === 'proposal' ? 120
          : 150; // negotiation
        createdDate = subtractDays(now, Math.round(rand(10, maxDaysAgo)));

        if (isStalled) {
          // Stalled deal: 90+ days in negotiation, no activity in 45+ days
          createdDate = subtractDays(now, Math.round(rand(90, 180)));
          daysInCurrentStage = Math.round(rand(90, 140));
        } else {
          daysInCurrentStage = Math.round(rand(config.minDaysInStage, config.maxDaysInStage));
        }

        // Close date is expected future close
        const remainingDays = config.stage === 'negotiation' ? rand(5, 30)
          : config.stage === 'proposal' ? rand(20, 60)
          : config.stage === 'discovery' ? rand(30, 90)
          : rand(45, 120);
        closeDate = addDays(now, Math.round(remainingDays));
      }

      // Competitor involved
      let competitorInvolved: string | null = null;
      if (Math.random() < 0.35) {
        competitorInvolved = pick([...COMPETITORS]);
      }
      if (isMaybankChurn) {
        competitorInvolved = 'Napier AI';
      }

      // Loss reason
      let lostReason: string | null = null;
      if (config.stage === 'closed_lost') {
        lostReason = pick([...LOSS_REASONS]);
      }

      // Notes
      const notes: string[] = [];
      if (isStalled) {
        notes.push('ALERT: Deal stalled — no activity recorded in 45+ days. Last engagement was a proposal review that went silent.');
        notes.push('Multiple follow-up attempts unanswered. May need executive escalation.');
      }
      if (isChampionLeft) {
        notes.push(`WARNING: Customer champion (${primaryContact.firstName} ${primaryContact.lastName}) has left the organization. Need to re-establish relationships with new stakeholders.`);
        notes.push('Internal restructuring reported — new Head of Compliance expected to start next month.');
      }
      if (isMaybankChurn) {
        notes.push('CRITICAL: Maybank actively evaluating Napier AI as replacement. Their Head of Compliance expressed dissatisfaction with our alert tuning capabilities.');
        notes.push('Renewal at risk — contract expires in 3 months. Napier AI offering 20% discount on 3-year commitment.');
        notes.push('Escalated to VP Sales. Need product team to demo new ML-based threshold tuning feature ASAP.');
      }
      if (notes.length === 0) {
        const genericNotes = [
          `${company.name} is evaluating AML solutions for ${REGULATORY_BODIES[company.country]} compliance.`,
          `Key requirement: ${pick(['real-time transaction monitoring', 'automated STR filing', 'PEP screening with fuzzy matching', 'risk scoring with ML capabilities', 'regulatory reporting automation'])}.`,
        ];
        notes.push(...genericNotes);
      }

      // Activities
      const activities = generateActivities(createdDate, config.stage, daysInCurrentStage, isStalled);

      // Deal name
      const product = pickProducts();
      const dealName = `${company.name} — ${product.split(',')[0].trim()}`;

      deals.push({
        id: `DEAL-${String(dealId++).padStart(4, '0')}`,
        name: dealName,
        companyId: company.id,
        companyName: company.name,
        contactId: primaryContact.id,
        contactName: `${primaryContact.firstName} ${primaryContact.lastName}`,
        stage: config.stage,
        amount: Math.round(amount),
        currency: 'USD',
        probability: config.probability,
        createdDate: dateStr(createdDate),
        closeDate: dateStr(closeDate),
        actualCloseDate,
        ownerId: rep.id,
        ownerName: rep.name,
        country: company.country,
        product,
        competitorInvolved,
        lostReason,
        daysInCurrentStage,
        notes,
        activities,
      });
    }
  }

  // ── Anomaly: Australia pipeline coverage at 1.5x ──────────────────────────
  // Ensure AU deals in active pipeline are relatively small in value
  const auActiveDeals = deals.filter(
    d => d.country === 'AU' && !['closed_won', 'closed_lost'].includes(d.stage)
  );
  // Reduce AU active deal amounts to create weak coverage
  for (const deal of auActiveDeals) {
    deal.amount = Math.round(deal.amount * 0.6); // Shrink AU pipeline deals
    if (deal.notes.length === 0 || !deal.notes.some(n => n.includes('ALERT'))) {
      deal.notes.push('NOTE: AU pipeline coverage below target (1.5x vs 3x required). Need to accelerate prospecting in AUSTRAC-regulated accounts.');
    }
  }

  // ── Anomaly: Taiwan deals have 2x longer cycle ────────────────────────────
  const twActiveDeals = deals.filter(
    d => d.country === 'TW' && !['closed_won', 'closed_lost'].includes(d.stage)
  );
  for (const deal of twActiveDeals) {
    deal.daysInCurrentStage = Math.round(deal.daysInCurrentStage * 2);
    if (!deal.notes.some(n => n.includes('FSC'))) {
      deal.notes.push('NOTE: Extended deal cycle due to FSC regulatory review requirements and multi-layer approval processes in Taiwanese financial institutions.');
    }
  }

  // ── 4. Build Sales Rep Performance ────────────────────────────────────────

  const salesReps: SalesRep[] = SALES_REP_DEFS.map(def => {
    const repDeals = deals.filter(d => d.ownerId === def.id);
    const wonDeals = repDeals.filter(d => d.stage === 'closed_won');
    const lostDeals = repDeals.filter(d => d.stage === 'closed_lost');
    const activeDeals = repDeals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));

    const closedWonValue = wonDeals.reduce((sum, d) => sum + d.amount, 0);
    const pipelineValue = activeDeals.reduce((sum, d) => sum + d.amount, 0);
    const totalClosed = wonDeals.length + lostDeals.length;
    const winRate = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) / 100 : 0;

    // Average deal cycle from won deals
    const cycles = wonDeals.map(d => {
      const created = new Date(d.createdDate);
      const closed = new Date(d.actualCloseDate || d.closeDate);
      return Math.round((closed.getTime() - created.getTime()) / (24 * 60 * 60 * 1000));
    });
    const avgCycle = cycles.length > 0
      ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length)
      : 0;

    return {
      id: def.id,
      name: def.name,
      email: `${def.name.toLowerCase().replace(/[\s-]/g, '.')}@companyjarvis.com`,
      region: def.region,
      quota: def.quota,
      totalDeals: repDeals.length,
      pipeline: pipelineValue,
      closedWon: closedWonValue,
      closedLost: lostDeals.reduce((sum, d) => sum + d.amount, 0),
      winRate,
      avgDealCycle: avgCycle,
    };
  });

  // ── 5. Compute Pipeline Summary ───────────────────────────────────────────

  const activeDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const wonDeals = deals.filter(d => d.stage === 'closed_won');
  const lostDeals = deals.filter(d => d.stage === 'closed_lost');

  const totalPipeline = activeDeals.reduce((sum, d) => sum + d.amount, 0);
  const weightedPipeline = activeDeals.reduce((sum, d) => sum + d.amount * d.probability, 0);
  const allClosedDeals = [...wonDeals, ...lostDeals];
  const avgDealSize = allClosedDeals.length > 0
    ? Math.round(allClosedDeals.reduce((s, d) => s + d.amount, 0) / allClosedDeals.length)
    : 0;

  // Average deal cycle from won deals
  const wonCycles = wonDeals.map(d => {
    const created = new Date(d.createdDate);
    const closed = new Date(d.actualCloseDate || d.closeDate);
    return Math.round((closed.getTime() - created.getTime()) / (24 * 60 * 60 * 1000));
  });
  const avgDealCycle = wonCycles.length > 0
    ? Math.round(wonCycles.reduce((a, b) => a + b, 0) / wonCycles.length)
    : 0;

  // Stage conversion rates
  const stageCounts: Record<DealStage, number> = {
    prospecting: deals.filter(d => d.stage === 'prospecting').length,
    discovery: deals.filter(d => d.stage === 'discovery').length,
    proposal: deals.filter(d => d.stage === 'proposal').length,
    negotiation: deals.filter(d => d.stage === 'negotiation').length,
    closed_won: wonDeals.length,
    closed_lost: lostDeals.length,
  };

  const totalDealsEver = deals.length;
  const stageConversion: Record<DealStage, number> = {
    prospecting: totalDealsEver > 0 ? Math.round((stageCounts.prospecting / totalDealsEver) * 10000) / 100 : 0,
    discovery: totalDealsEver > 0 ? Math.round(((totalDealsEver - stageCounts.prospecting) / totalDealsEver) * 10000) / 100 : 0,
    proposal: totalDealsEver > 0 ? Math.round(((stageCounts.proposal + stageCounts.negotiation + stageCounts.closed_won + stageCounts.closed_lost) / totalDealsEver) * 10000) / 100 : 0,
    negotiation: totalDealsEver > 0 ? Math.round(((stageCounts.negotiation + stageCounts.closed_won + stageCounts.closed_lost) / totalDealsEver) * 10000) / 100 : 0,
    closed_won: totalDealsEver > 0 ? Math.round((stageCounts.closed_won / totalDealsEver) * 10000) / 100 : 0,
    closed_lost: totalDealsEver > 0 ? Math.round((stageCounts.closed_lost / totalDealsEver) * 10000) / 100 : 0,
  };

  const totalClosedCount = wonDeals.length + lostDeals.length;
  const winRate = totalClosedCount > 0
    ? Math.round((wonDeals.length / totalClosedCount) * 10000) / 100
    : 0;

  // Loss reason aggregation
  const lossReasonMap: Record<string, { count: number; totalValue: number }> = {};
  for (const deal of lostDeals) {
    const reason = deal.lostReason || 'unknown';
    if (!lossReasonMap[reason]) {
      lossReasonMap[reason] = { count: 0, totalValue: 0 };
    }
    lossReasonMap[reason].count++;
    lossReasonMap[reason].totalValue += deal.amount;
  }
  const lossReasons = Object.entries(lossReasonMap).map(([reason, data]) => ({
    reason,
    count: data.count,
    totalValue: Math.round(data.totalValue),
  }));

  const pipelineSummary: HubSpotData['pipelineSummary'] = {
    totalPipeline: Math.round(totalPipeline),
    weightedPipeline: Math.round(weightedPipeline),
    avgDealSize,
    avgDealCycle,
    stageConversion,
    winRate,
    lossReasons,
  };

  return {
    contacts,
    companies,
    deals,
    salesReps,
    pipelineSummary,
  };
}
