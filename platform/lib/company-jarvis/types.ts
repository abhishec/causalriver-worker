/**
 * Company Jarvis — Type Definitions
 *
 * All TypeScript interfaces for the 4 data sources (Slack, HubSpot, Google Docs,
 * Customers) and the brain analysis output. Shared across all generators and the
 * copilot adapter.
 */

// ─── Common ─────────────────────────────────────────────────────────────────

export type Country = 'SG' | 'MY' | 'TW' | 'AU' | 'PH';

export const COUNTRY_NAMES: Record<Country, string> = {
  SG: 'Singapore',
  MY: 'Malaysia',
  TW: 'Taiwan',
  AU: 'Australia',
  PH: 'Philippines',
};

// ─── Slack Types ────────────────────────────────────────────────────────────

export interface SlackUser {
  id: string;
  name: string;
  displayName: string;
  email: string;
  department: string;
  role: string;
  country: Country;
  isActive: boolean;
}

export interface SlackReaction {
  emoji: string;
  users: string[];
  count: number;
}

export interface SlackMessage {
  id: string;
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
  threadId: string | null;
  reactions: SlackReaction[];
  isEdited: boolean;
  mentions: string[];
  sentiment?: 'positive' | 'neutral' | 'negative' | 'frustrated';
  topics?: string[];
}

export interface SlackChannel {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isPrivate: boolean;
  messageCount: number;
}

export interface SlackData {
  users: SlackUser[];
  channels: SlackChannel[];
  messages: SlackMessage[];
}

// ─── HubSpot / CRM Types ───────────────────────────────────────────────────

export type DealStage =
  | 'prospecting'
  | 'discovery'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export type IndustryType = 'bank' | 'fintech' | 'payment_processor' | 'crypto_exchange' | 'insurance';

export interface HubSpotContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  companyId: string;
  role: string;
  country: Country;
  lastContactDate: string;
  leadSource: string;
}

export interface HubSpotCompany {
  id: string;
  name: string;
  industry: IndustryType;
  country: Country;
  employeeCount: number;
  annualRevenue: number;
  regulatoryBody: string;
  amlMaturityLevel: 'basic' | 'intermediate' | 'advanced';
  website: string;
}

export interface DealActivity {
  date: string;
  type: 'call' | 'email' | 'meeting' | 'demo' | 'proposal_sent' | 'contract_sent';
  description: string;
  outcome: string;
}

export interface HubSpotDeal {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  contactId: string;
  contactName: string;
  stage: DealStage;
  amount: number;
  currency: string;
  probability: number;
  createdDate: string;
  closeDate: string;
  actualCloseDate: string | null;
  ownerId: string;
  ownerName: string;
  country: Country;
  product: string;
  competitorInvolved: string | null;
  lostReason: string | null;
  daysInCurrentStage: number;
  notes: string[];
  activities: DealActivity[];
}

export interface SalesRep {
  id: string;
  name: string;
  email: string;
  region: Country;
  quota: number;
  totalDeals: number;
  pipeline: number;
  closedWon: number;
  closedLost: number;
  winRate: number;
  avgDealCycle: number;
}

export interface HubSpotData {
  contacts: HubSpotContact[];
  companies: HubSpotCompany[];
  deals: HubSpotDeal[];
  salesReps: SalesRep[];
  pipelineSummary: {
    totalPipeline: number;
    weightedPipeline: number;
    avgDealSize: number;
    avgDealCycle: number;
    stageConversion: Record<DealStage, number>;
    winRate: number;
    lossReasons: Array<{ reason: string; count: number; totalValue: number }>;
  };
}

// ─── Google Docs / Knowledge Base Types ─────────────────────────────────────

export type DocCategory =
  | 'strategy'
  | 'product_spec'
  | 'meeting_notes'
  | 'case_study'
  | 'hr_policy'
  | 'competitive_analysis'
  | 'financial_summary'
  | 'expansion_plan'
  | 'okr'
  | 'post_mortem'
  | 'board_deck';

export interface GoogleDoc {
  id: string;
  title: string;
  category: DocCategory;
  author: string;
  createdDate: string;
  lastModified: string;
  content: string;
  summary: string;
  tags: string[];
  mentions: string[];
  department: string;
  confidentiality: 'public' | 'internal' | 'confidential' | 'board';
  keyInsights: string[];
}

export interface GoogleDocsData {
  documents: GoogleDoc[];
  categoryCounts: Record<DocCategory, number>;
}

// ─── Customer Data Types ────────────────────────────────────────────────────

export type HealthScore = 'critical' | 'at_risk' | 'neutral' | 'healthy' | 'champion';

export interface SupportTicket {
  id: string;
  customerId: string;
  customerName: string;
  createdDate: string;
  resolvedDate: string | null;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'escalated';
  resolutionTimeHours: number | null;
  assignee: string;
}

export interface CustomerAccount {
  id: string;
  name: string;
  country: Country;
  industry: IndustryType;
  contractValue: number;
  contractStartDate: string;
  contractEndDate: string;
  renewalDate: string;
  healthScore: HealthScore;
  healthScoreNumeric: number;
  npsScore: number | null;
  csatScore: number | null;
  primaryContact: string;
  csm: string;
  tier: 'enterprise' | 'growth' | 'starter';
  products: string[];
  usageMetrics: {
    apiCallsMonthly: number;
    alertsProcessed: number;
    usersActive: number;
    loginFrequency: number;
    featureAdoptionPct: number;
    lastActiveDate: string;
  };
  churnRisk: number;
  expansionPotential: number;
  regulatoryBody: string;
}

export interface CustomerData {
  accounts: CustomerAccount[];
  tickets: SupportTicket[];
  ticketSummary: {
    totalOpen: number;
    totalResolved: number;
    avgResolutionHours: number;
    escalationRate: number;
    byPriority: Record<string, number>;
    byCategory: Record<string, number>;
  };
  healthDistribution: Record<HealthScore, number>;
  nrrMetrics: {
    grossRetentionRate: number;
    netRevenueRetention: number;
    churnRate: number;
    expansionRevenue: number;
    contractionRevenue: number;
  };
}

// ─── Brain Analyzer Output Types ────────────────────────────────────────────

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive';
export type InsightDomain =
  | 'sales'
  | 'engineering'
  | 'product'
  | 'customer_success'
  | 'marketing'
  | 'people'
  | 'strategy'
  | 'operations'
  | 'cross_domain';

export interface JarvisInsight {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  domain: InsightDomain;
  sources: string[];
  recommendation: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  detectedAt: string;
  isHidden: boolean;
  reversePromptWorthy: boolean;
}

export interface JarvisCausalRelationship {
  source: string;
  target: string;
  effectSize: number;
  lagDays: number;
  description: string;
  confidence: number;
  evidenceSources: string[];
}

export interface DepartmentScore {
  department: string;
  overallScore: number;
  morale: number;
  velocity: number;
  alignment: number;
  risks: string[];
  highlights: string[];
}

export interface CountryPerformance {
  country: Country;
  countryName: string;
  arr: number;
  customerCount: number;
  dealPipeline: number;
  winRate: number;
  avgDealSize: number;
  headcount: number;
  churnRate: number;
  npsAvg: number;
  regulatoryRisk: 'low' | 'medium' | 'high';
  keyIssues: string[];
}

export interface ReversePrompt {
  id: string;
  category: 'hidden_issue' | 'strategic_tension' | 'people_risk' | 'customer_risk' | 'competitive_threat' | 'missed_opportunity';
  title: string;
  description: string;
  severity: InsightSeverity;
  evidence: string[];
  suggestedAction: string;
  urgency: 'immediate' | 'this_week' | 'this_month' | 'strategic';
}

export interface CompanyJarvisAnalysis {
  generatedAt: string;

  kpis: {
    arr: number;
    arrGrowth: number;
    mrr: number;
    totalPipeline: number;
    weightedPipeline: number;
    winRate: number;
    avgDealSize: number;
    avgDealCycle: number;
    totalCustomers: number;
    churnRate: number;
    nrr: number;
    npsAvg: number;
    csatAvg: number;
    headcount: number;
    openPositions: number;
    supportTicketsOpen: number;
    avgResolutionHours: number;
    slackActivityIndex: number;
    documentationCoverage: number;
  };

  insights: JarvisInsight[];
  reversePrompts: ReversePrompt[];
  departmentScores: DepartmentScore[];
  countryPerformance: CountryPerformance[];
  causalRelationships: JarvisCausalRelationship[];

  blindSpots: Array<{
    area: string;
    description: string;
    evidence: string[];
    suggestedInvestigation: string;
  }>;

  monthlyTrends: Array<{
    month: string;
    arr: number;
    newDeals: number;
    closedWonValue: number;
    churnValue: number;
    customerCount: number;
    npsAvg: number;
    slackActivity: number;
    supportTickets: number;
  }>;

  bottomLine: string;
}
