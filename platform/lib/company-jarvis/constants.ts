/**
 * Company Jarvis — Constants & Reference Data
 *
 * Company profile, employee directory (87 people with culturally accurate APAC names),
 * customer companies, Slack channels, sales reps, competitors, and regulatory bodies.
 * All synthetic generators import from here to ensure data consistency.
 */

import type { Country, IndustryType } from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export { rand, pick };

// ─── Company Profile ────────────────────────────────────────────────────────

export const COMPANY = {
  name: 'Company Jarvis',
  legalName: 'Company Jarvis Pte Ltd',
  founded: 2019,
  hq: 'Singapore' as const,
  arr: 10_200_000,
  mrr: 850_000,
  headcount: 87,
  countries: ['SG', 'MY', 'TW', 'AU', 'PH'] as Country[],
  product: 'AML Compliance Platform',
  modules: [
    'Transaction Monitoring',
    'KYC/CDD Automation',
    'PEP & Sanctions Screening',
    'STR/CTR Filing',
    'Risk Scoring Engine',
    'Regulatory Reporting',
  ] as const,
  fundingStage: 'Series A' as const,
  lastFunding: 15_000_000,
  investors: ['Sequoia Southeast Asia', 'Vertex Ventures'],
};

// ─── Regulatory Bodies ──────────────────────────────────────────────────────

export const REGULATORY_BODIES: Record<Country, string> = {
  SG: 'MAS (Monetary Authority of Singapore)',
  MY: 'BNM (Bank Negara Malaysia)',
  TW: 'FSC (Financial Supervisory Commission)',
  AU: 'AUSTRAC (Australian Transaction Reports and Analysis Centre)',
  PH: 'BSP (Bangko Sentral ng Pilipinas)',
};

// ─── Competitors ────────────────────────────────────────────────────────────

export const COMPETITORS = [
  'Napier AI',
  'ComplyAdvantage',
  'NICE Actimize',
  'SAS AML',
  'Oracle Financial Crime',
  'Tookitaki',
] as const;

// ─── AML Terminology ────────────────────────────────────────────────────────

export const AML_TERMS = [
  'KYC', 'CDD', 'EDD', 'STR', 'CTR', 'PEP', 'sanctions screening',
  'transaction monitoring', 'risk scoring', 'beneficial ownership',
  'adverse media', 'watchlist', 'regulatory filing', 'suspicious activity',
  'false positive', 'alert triage', 'case management', 'threshold tuning',
  'name matching', 'fuzzy matching', 'entity resolution',
] as const;

// ─── Departments ────────────────────────────────────────────────────────────

export const DEPARTMENTS = [
  'Engineering',
  'Sales',
  'Customer Success',
  'Product',
  'Marketing',
  'Operations',
  'Leadership',
  'Finance',
  'People',
] as const;

// ─── Employee Directory (87 employees) ──────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  country: Country;
  slackId: string;
  startDate: string;
  isManager: boolean;
  isLeadership: boolean;
}

export const EMPLOYEES: Employee[] = [
  // ── Leadership (7) ──────────────────────────────────────────────────────
  { id: 'E001', name: 'Rajesh Krishnamurthy', email: 'rajesh@companyjarvis.com', department: 'Leadership', role: 'CEO & Co-Founder', country: 'SG', slackId: 'U001', startDate: '2019-03-01', isManager: true, isLeadership: true },
  { id: 'E002', name: 'Sarah Chen Wei Lin', email: 'sarah.chen@companyjarvis.com', department: 'Leadership', role: 'CTO & Co-Founder', country: 'SG', slackId: 'U002', startDate: '2019-03-01', isManager: true, isLeadership: true },
  { id: 'E003', name: 'Marcus Tan', email: 'marcus.tan@companyjarvis.com', department: 'Leadership', role: 'COO', country: 'SG', slackId: 'U003', startDate: '2020-06-15', isManager: true, isLeadership: true },
  { id: 'E004', name: 'Amanda Liu', email: 'amanda.liu@companyjarvis.com', department: 'Finance', role: 'CFO', country: 'SG', slackId: 'U004', startDate: '2021-01-10', isManager: true, isLeadership: true },
  { id: 'E005', name: 'David Park', email: 'david.park@companyjarvis.com', department: 'Sales', role: 'VP Sales', country: 'SG', slackId: 'U005', startDate: '2021-04-01', isManager: true, isLeadership: true },
  { id: 'E006', name: 'Priya Nair', email: 'priya.nair@companyjarvis.com', department: 'Product', role: 'VP Product', country: 'SG', slackId: 'U006', startDate: '2021-08-01', isManager: true, isLeadership: true },
  { id: 'E007', name: 'James Mitchell', email: 'james.mitchell@companyjarvis.com', department: 'Marketing', role: 'VP Marketing', country: 'AU', slackId: 'U007', startDate: '2022-01-15', isManager: true, isLeadership: true },

  // ── Engineering — Singapore (12) ────────────────────────────────────────
  { id: 'E010', name: 'Lim Jun Wei', email: 'junwei.lim@companyjarvis.com', department: 'Engineering', role: 'Engineering Manager', country: 'SG', slackId: 'U010', startDate: '2020-01-15', isManager: true, isLeadership: false },
  { id: 'E011', name: 'Arun Patel', email: 'arun.patel@companyjarvis.com', department: 'Engineering', role: 'Senior Backend Engineer', country: 'SG', slackId: 'U011', startDate: '2020-03-01', isManager: false, isLeadership: false },
  { id: 'E012', name: 'Mei Ling Ong', email: 'meiling.ong@companyjarvis.com', department: 'Engineering', role: 'Senior Frontend Engineer', country: 'SG', slackId: 'U012', startDate: '2020-07-01', isManager: false, isLeadership: false },
  { id: 'E013', name: 'Deepak Sharma', email: 'deepak.sharma@companyjarvis.com', department: 'Engineering', role: 'ML Engineer', country: 'SG', slackId: 'U013', startDate: '2021-02-01', isManager: false, isLeadership: false },
  { id: 'E014', name: 'Kai Wen Teo', email: 'kaiwen.teo@companyjarvis.com', department: 'Engineering', role: 'Backend Engineer', country: 'SG', slackId: 'U014', startDate: '2021-09-01', isManager: false, isLeadership: false },
  { id: 'E015', name: 'Ravi Kumar', email: 'ravi.kumar@companyjarvis.com', department: 'Engineering', role: 'DevOps Engineer', country: 'SG', slackId: 'U015', startDate: '2022-01-15', isManager: false, isLeadership: false },
  { id: 'E016', name: 'Nicole Ang', email: 'nicole.ang@companyjarvis.com', department: 'Engineering', role: 'QA Lead', country: 'SG', slackId: 'U016', startDate: '2022-04-01', isManager: false, isLeadership: false },
  { id: 'E017', name: 'Siddharth Menon', email: 'sid.menon@companyjarvis.com', department: 'Engineering', role: 'Full-Stack Engineer', country: 'SG', slackId: 'U017', startDate: '2022-08-01', isManager: false, isLeadership: false },
  { id: 'E018', name: 'Yuki Tanaka', email: 'yuki.tanaka@companyjarvis.com', department: 'Engineering', role: 'Security Engineer', country: 'SG', slackId: 'U018', startDate: '2023-01-15', isManager: false, isLeadership: false },
  { id: 'E019', name: 'Ahmad Firdaus', email: 'ahmad.firdaus@companyjarvis.com', department: 'Engineering', role: 'Backend Engineer', country: 'SG', slackId: 'U019', startDate: '2023-06-01', isManager: false, isLeadership: false },
  { id: 'E020', name: 'Jasmine Chua', email: 'jasmine.chua@companyjarvis.com', department: 'Engineering', role: 'Frontend Engineer', country: 'SG', slackId: 'U020', startDate: '2023-09-01', isManager: false, isLeadership: false },
  { id: 'E021', name: 'Vikram Singh', email: 'vikram.singh@companyjarvis.com', department: 'Engineering', role: 'Data Engineer', country: 'SG', slackId: 'U021', startDate: '2024-01-15', isManager: false, isLeadership: false },

  // ── Engineering — Taiwan (6) ────────────────────────────────────────────
  { id: 'E025', name: 'Chen Yu-Ting', email: 'yuting.chen@companyjarvis.com', department: 'Engineering', role: 'Engineering Manager (TW)', country: 'TW', slackId: 'U025', startDate: '2021-06-01', isManager: true, isLeadership: false },
  { id: 'E026', name: 'Lin Ming-Hao', email: 'minghao.lin@companyjarvis.com', department: 'Engineering', role: 'Senior Backend Engineer', country: 'TW', slackId: 'U026', startDate: '2021-09-01', isManager: false, isLeadership: false },
  { id: 'E027', name: 'Wang Jia-Wen', email: 'jiawen.wang@companyjarvis.com', department: 'Engineering', role: 'Frontend Engineer', country: 'TW', slackId: 'U027', startDate: '2022-03-01', isManager: false, isLeadership: false },
  { id: 'E028', name: 'Huang Zhi-Wei', email: 'zhiwei.huang@companyjarvis.com', department: 'Engineering', role: 'Backend Engineer', country: 'TW', slackId: 'U028', startDate: '2022-09-01', isManager: false, isLeadership: false },
  { id: 'E029', name: 'Tsai Shu-Fen', email: 'shufen.tsai@companyjarvis.com', department: 'Engineering', role: 'QA Engineer', country: 'TW', slackId: 'U029', startDate: '2023-02-01', isManager: false, isLeadership: false },
  { id: 'E030', name: 'Wu Cheng-Han', email: 'chenghan.wu@companyjarvis.com', department: 'Engineering', role: 'ML Engineer', country: 'TW', slackId: 'U030', startDate: '2023-07-01', isManager: false, isLeadership: false },

  // ── Engineering — Philippines (4) ───────────────────────────────────────
  { id: 'E033', name: 'Juan Carlos Reyes', email: 'jc.reyes@companyjarvis.com', department: 'Engineering', role: 'Senior Full-Stack Engineer', country: 'PH', slackId: 'U033', startDate: '2022-06-01', isManager: false, isLeadership: false },
  { id: 'E034', name: 'Maria Santos', email: 'maria.santos@companyjarvis.com', department: 'Engineering', role: 'Backend Engineer', country: 'PH', slackId: 'U034', startDate: '2023-01-15', isManager: false, isLeadership: false },
  { id: 'E035', name: 'Rizal Dela Cruz', email: 'rizal.delacruz@companyjarvis.com', department: 'Engineering', role: 'Frontend Engineer', country: 'PH', slackId: 'U035', startDate: '2023-06-01', isManager: false, isLeadership: false },
  { id: 'E036', name: 'Angela Bautista', email: 'angela.bautista@companyjarvis.com', department: 'Engineering', role: 'QA Engineer', country: 'PH', slackId: 'U036', startDate: '2023-11-01', isManager: false, isLeadership: false },

  // ── Sales — Multi-region (10) ──────────────────────────────────────────
  { id: 'E040', name: 'Rachel Lim', email: 'rachel.lim@companyjarvis.com', department: 'Sales', role: 'Senior Account Executive', country: 'SG', slackId: 'U040', startDate: '2021-06-01', isManager: false, isLeadership: false },
  { id: 'E041', name: 'Brandon Chia', email: 'brandon.chia@companyjarvis.com', department: 'Sales', role: 'Account Executive', country: 'SG', slackId: 'U041', startDate: '2022-03-01', isManager: false, isLeadership: false },
  { id: 'E042', name: 'Nurul Aisyah', email: 'nurul.aisyah@companyjarvis.com', department: 'Sales', role: 'Account Executive (MY)', country: 'MY', slackId: 'U042', startDate: '2022-06-01', isManager: false, isLeadership: false },
  { id: 'E043', name: 'Chong Wei Keat', email: 'weikeat.chong@companyjarvis.com', department: 'Sales', role: 'Senior Account Executive (MY)', country: 'MY', slackId: 'U043', startDate: '2021-11-01', isManager: false, isLeadership: false },
  { id: 'E044', name: 'Chang Hsiao-Wen', email: 'hsiaowen.chang@companyjarvis.com', department: 'Sales', role: 'Account Executive (TW)', country: 'TW', slackId: 'U044', startDate: '2022-09-01', isManager: false, isLeadership: false },
  { id: 'E045', name: 'Alyssa Thompson', email: 'alyssa.thompson@companyjarvis.com', department: 'Sales', role: 'Senior Account Executive (AU)', country: 'AU', slackId: 'U045', startDate: '2022-01-15', isManager: false, isLeadership: false },
  { id: 'E046', name: 'Michael Zhang', email: 'michael.zhang@companyjarvis.com', department: 'Sales', role: 'Account Executive (AU)', country: 'AU', slackId: 'U046', startDate: '2023-03-01', isManager: false, isLeadership: false },
  { id: 'E047', name: 'Fatima Gutierrez', email: 'fatima.gutierrez@companyjarvis.com', department: 'Sales', role: 'Account Executive (PH)', country: 'PH', slackId: 'U047', startDate: '2023-01-15', isManager: false, isLeadership: false },
  { id: 'E048', name: 'Kevin Ng', email: 'kevin.ng@companyjarvis.com', department: 'Sales', role: 'SDR Manager', country: 'SG', slackId: 'U048', startDate: '2022-08-01', isManager: true, isLeadership: false },
  { id: 'E049', name: 'Syahirah Binti Rahman', email: 'syahirah@companyjarvis.com', department: 'Sales', role: 'SDR', country: 'MY', slackId: 'U049', startDate: '2023-06-01', isManager: false, isLeadership: false },

  // ── Customer Success (8) ───────────────────────────────────────────────
  { id: 'E050', name: 'Jennifer Wong', email: 'jennifer.wong@companyjarvis.com', department: 'Customer Success', role: 'CS Director', country: 'SG', slackId: 'U050', startDate: '2021-03-01', isManager: true, isLeadership: false },
  { id: 'E051', name: 'Darren Koh', email: 'darren.koh@companyjarvis.com', department: 'Customer Success', role: 'Senior CSM', country: 'SG', slackId: 'U051', startDate: '2021-09-01', isManager: false, isLeadership: false },
  { id: 'E052', name: 'Hafizah Ibrahim', email: 'hafizah@companyjarvis.com', department: 'Customer Success', role: 'CSM (MY)', country: 'MY', slackId: 'U052', startDate: '2022-06-01', isManager: false, isLeadership: false },
  { id: 'E053', name: 'Lisa Huang', email: 'lisa.huang@companyjarvis.com', department: 'Customer Success', role: 'CSM (TW)', country: 'TW', slackId: 'U053', startDate: '2022-09-01', isManager: false, isLeadership: false },
  { id: 'E054', name: 'Emma Wilson', email: 'emma.wilson@companyjarvis.com', department: 'Customer Success', role: 'CSM (AU)', country: 'AU', slackId: 'U054', startDate: '2022-04-01', isManager: false, isLeadership: false },
  { id: 'E055', name: 'Paolo Mendoza', email: 'paolo.mendoza@companyjarvis.com', department: 'Customer Success', role: 'CSM (PH)', country: 'PH', slackId: 'U055', startDate: '2023-03-01', isManager: false, isLeadership: false },
  { id: 'E056', name: 'Tan Siew Ling', email: 'siewling.tan@companyjarvis.com', department: 'Customer Success', role: 'Support Engineer', country: 'SG', slackId: 'U056', startDate: '2023-01-15', isManager: false, isLeadership: false },
  { id: 'E057', name: 'Arjun Das', email: 'arjun.das@companyjarvis.com', department: 'Customer Success', role: 'Support Engineer', country: 'SG', slackId: 'U057', startDate: '2023-09-01', isManager: false, isLeadership: false },

  // ── Product (6) ────────────────────────────────────────────────────────
  { id: 'E060', name: 'Daniel Foo', email: 'daniel.foo@companyjarvis.com', department: 'Product', role: 'Senior Product Manager', country: 'SG', slackId: 'U060', startDate: '2021-11-01', isManager: false, isLeadership: false },
  { id: 'E061', name: 'Alicia Tay', email: 'alicia.tay@companyjarvis.com', department: 'Product', role: 'Product Manager', country: 'SG', slackId: 'U061', startDate: '2022-07-01', isManager: false, isLeadership: false },
  { id: 'E062', name: 'Ryan Goh', email: 'ryan.goh@companyjarvis.com', department: 'Product', role: 'Product Designer', country: 'SG', slackId: 'U062', startDate: '2022-10-01', isManager: false, isLeadership: false },
  { id: 'E063', name: 'Carmen Lee', email: 'carmen.lee@companyjarvis.com', department: 'Product', role: 'UX Researcher', country: 'SG', slackId: 'U063', startDate: '2023-04-01', isManager: false, isLeadership: false },
  { id: 'E064', name: 'Hiroshi Nakamura', email: 'hiroshi.nakamura@companyjarvis.com', department: 'Product', role: 'Technical Writer', country: 'SG', slackId: 'U064', startDate: '2023-08-01', isManager: false, isLeadership: false },
  { id: 'E065', name: 'Ananya Bhat', email: 'ananya.bhat@companyjarvis.com', department: 'Product', role: 'Product Analyst', country: 'SG', slackId: 'U065', startDate: '2024-02-01', isManager: false, isLeadership: false },

  // ── Marketing (6) ──────────────────────────────────────────────────────
  { id: 'E070', name: 'Sophie Anderson', email: 'sophie.anderson@companyjarvis.com', department: 'Marketing', role: 'Content Marketing Manager', country: 'AU', slackId: 'U070', startDate: '2022-04-01', isManager: false, isLeadership: false },
  { id: 'E071', name: 'Natasha Ong', email: 'natasha.ong@companyjarvis.com', department: 'Marketing', role: 'Digital Marketing Specialist', country: 'SG', slackId: 'U071', startDate: '2022-09-01', isManager: false, isLeadership: false },
  { id: 'E072', name: 'Chris Lau', email: 'chris.lau@companyjarvis.com', department: 'Marketing', role: 'Events Manager', country: 'SG', slackId: 'U072', startDate: '2023-02-01', isManager: false, isLeadership: false },
  { id: 'E073', name: 'Maya Rizal', email: 'maya.rizal@companyjarvis.com', department: 'Marketing', role: 'Marketing Coordinator (MY)', country: 'MY', slackId: 'U073', startDate: '2023-06-01', isManager: false, isLeadership: false },
  { id: 'E074', name: 'Ben Taylor', email: 'ben.taylor@companyjarvis.com', department: 'Marketing', role: 'Demand Gen Specialist', country: 'AU', slackId: 'U074', startDate: '2023-09-01', isManager: false, isLeadership: false },
  { id: 'E075', name: 'Isabelle Tan', email: 'isabelle.tan@companyjarvis.com', department: 'Marketing', role: 'Brand Designer', country: 'SG', slackId: 'U075', startDate: '2024-01-15', isManager: false, isLeadership: false },

  // ── Operations & Finance (6) ───────────────────────────────────────────
  { id: 'E080', name: 'Michelle Teo', email: 'michelle.teo@companyjarvis.com', department: 'Operations', role: 'Operations Manager', country: 'SG', slackId: 'U080', startDate: '2021-06-01', isManager: true, isLeadership: false },
  { id: 'E081', name: 'Karen Ho', email: 'karen.ho@companyjarvis.com', department: 'Finance', role: 'Finance Manager', country: 'SG', slackId: 'U081', startDate: '2022-01-15', isManager: false, isLeadership: false },
  { id: 'E082', name: 'Ahmad Zaidi', email: 'ahmad.zaidi@companyjarvis.com', department: 'Operations', role: 'Office Manager (MY)', country: 'MY', slackId: 'U082', startDate: '2022-09-01', isManager: false, isLeadership: false },
  { id: 'E083', name: 'Grace Lim', email: 'grace.lim@companyjarvis.com', department: 'Finance', role: 'Accountant', country: 'SG', slackId: 'U083', startDate: '2023-03-01', isManager: false, isLeadership: false },
  { id: 'E084', name: 'Tom Nguyen', email: 'tom.nguyen@companyjarvis.com', department: 'Operations', role: 'IT Administrator', country: 'AU', slackId: 'U084', startDate: '2023-06-01', isManager: false, isLeadership: false },
  { id: 'E085', name: 'Anna Cruz', email: 'anna.cruz@companyjarvis.com', department: 'Operations', role: 'Office Coordinator (PH)', country: 'PH', slackId: 'U085', startDate: '2023-09-01', isManager: false, isLeadership: false },

  // ── People / HR (4) ────────────────────────────────────────────────────
  { id: 'E088', name: 'Fiona Chew', email: 'fiona.chew@companyjarvis.com', department: 'People', role: 'Head of People', country: 'SG', slackId: 'U088', startDate: '2021-11-01', isManager: true, isLeadership: false },
  { id: 'E089', name: 'Putri Aminah', email: 'putri.aminah@companyjarvis.com', department: 'People', role: 'HR Business Partner', country: 'MY', slackId: 'U089', startDate: '2022-08-01', isManager: false, isLeadership: false },
  { id: 'E090', name: 'Samantha Lee', email: 'samantha.lee@companyjarvis.com', department: 'People', role: 'Talent Acquisition', country: 'SG', slackId: 'U090', startDate: '2023-04-01', isManager: false, isLeadership: false },
  { id: 'E091', name: 'Diana Reyes', email: 'diana.reyes@companyjarvis.com', department: 'People', role: 'People Operations', country: 'PH', slackId: 'U091', startDate: '2023-11-01', isManager: false, isLeadership: false },
];

// ─── Slack Channels ─────────────────────────────────────────────────────────

export const SLACK_CHANNELS = [
  { id: 'C001', name: 'engineering', description: 'Engineering team discussions, deployments, incidents', memberCount: 28, isPrivate: false },
  { id: 'C002', name: 'sales', description: 'Sales updates, deal reviews, competitive intel', memberCount: 15, isPrivate: false },
  { id: 'C003', name: 'cs-support', description: 'Customer success and support coordination', memberCount: 12, isPrivate: false },
  { id: 'C004', name: 'leadership', description: 'Leadership team discussions', memberCount: 7, isPrivate: true },
  { id: 'C005', name: 'product', description: 'Product roadmap, features, user research', memberCount: 18, isPrivate: false },
  { id: 'C006', name: 'marketing', description: 'Campaigns, events, content, demand gen', memberCount: 10, isPrivate: false },
  { id: 'C007', name: 'general', description: 'Company-wide announcements and watercooler', memberCount: 87, isPrivate: false },
  { id: 'C008', name: 'apac-regional', description: 'Cross-country updates and regional coordination', memberCount: 30, isPrivate: false },
] as const;

// ─── Customer Companies (55) ────────────────────────────────────────────────

export interface CustomerCompanyDef {
  name: string;
  country: Country;
  industry: IndustryType;
  size: 'enterprise' | 'growth' | 'starter';
  employeeCount: number;
  annualRevenue: number;
  regulatoryBody: string;
  amlMaturity: 'basic' | 'intermediate' | 'advanced';
}

export const CUSTOMER_COMPANIES: CustomerCompanyDef[] = [
  // ── Singapore (14) ─────────────────────────────────────────────────────
  { name: 'DBS Bank', country: 'SG', industry: 'bank', size: 'enterprise', employeeCount: 33000, annualRevenue: 14_500_000_000, regulatoryBody: 'MAS', amlMaturity: 'advanced' },
  { name: 'OCBC Bank', country: 'SG', industry: 'bank', size: 'enterprise', employeeCount: 30000, annualRevenue: 11_200_000_000, regulatoryBody: 'MAS', amlMaturity: 'advanced' },
  { name: 'Grab Financial Group', country: 'SG', industry: 'fintech', size: 'enterprise', employeeCount: 8000, annualRevenue: 2_100_000_000, regulatoryBody: 'MAS', amlMaturity: 'intermediate' },
  { name: 'Singtel Dash', country: 'SG', industry: 'payment_processor', size: 'growth', employeeCount: 500, annualRevenue: 180_000_000, regulatoryBody: 'MAS', amlMaturity: 'intermediate' },
  { name: 'Aspire Financial', country: 'SG', industry: 'fintech', size: 'growth', employeeCount: 350, annualRevenue: 85_000_000, regulatoryBody: 'MAS', amlMaturity: 'basic' },
  { name: 'Nium', country: 'SG', industry: 'payment_processor', size: 'growth', employeeCount: 1200, annualRevenue: 420_000_000, regulatoryBody: 'MAS', amlMaturity: 'intermediate' },
  { name: 'Funding Societies', country: 'SG', industry: 'fintech', size: 'growth', employeeCount: 400, annualRevenue: 95_000_000, regulatoryBody: 'MAS', amlMaturity: 'basic' },
  { name: 'Coinhako', country: 'SG', industry: 'crypto_exchange', size: 'starter', employeeCount: 80, annualRevenue: 25_000_000, regulatoryBody: 'MAS', amlMaturity: 'basic' },
  { name: 'Independent Reserve SG', country: 'SG', industry: 'crypto_exchange', size: 'starter', employeeCount: 45, annualRevenue: 18_000_000, regulatoryBody: 'MAS', amlMaturity: 'basic' },
  { name: 'Great Eastern Life', country: 'SG', industry: 'insurance', size: 'enterprise', employeeCount: 5000, annualRevenue: 7_800_000_000, regulatoryBody: 'MAS', amlMaturity: 'intermediate' },
  { name: 'Income Insurance', country: 'SG', industry: 'insurance', size: 'growth', employeeCount: 1800, annualRevenue: 3_200_000_000, regulatoryBody: 'MAS', amlMaturity: 'intermediate' },
  { name: 'StashAway', country: 'SG', industry: 'fintech', size: 'starter', employeeCount: 200, annualRevenue: 45_000_000, regulatoryBody: 'MAS', amlMaturity: 'basic' },
  { name: 'Endowus', country: 'SG', industry: 'fintech', size: 'starter', employeeCount: 120, annualRevenue: 32_000_000, regulatoryBody: 'MAS', amlMaturity: 'basic' },
  { name: 'Fazz Financial', country: 'SG', industry: 'fintech', size: 'growth', employeeCount: 600, annualRevenue: 150_000_000, regulatoryBody: 'MAS', amlMaturity: 'intermediate' },

  // ── Malaysia (11) ──────────────────────────────────────────────────────
  { name: 'Maybank', country: 'MY', industry: 'bank', size: 'enterprise', employeeCount: 43000, annualRevenue: 12_000_000_000, regulatoryBody: 'BNM', amlMaturity: 'advanced' },
  { name: 'CIMB Bank', country: 'MY', industry: 'bank', size: 'enterprise', employeeCount: 36000, annualRevenue: 9_800_000_000, regulatoryBody: 'BNM', amlMaturity: 'advanced' },
  { name: 'Public Bank', country: 'MY', industry: 'bank', size: 'enterprise', employeeCount: 18000, annualRevenue: 6_500_000_000, regulatoryBody: 'BNM', amlMaturity: 'intermediate' },
  { name: 'Touch n Go eWallet', country: 'MY', industry: 'payment_processor', size: 'growth', employeeCount: 800, annualRevenue: 220_000_000, regulatoryBody: 'BNM', amlMaturity: 'intermediate' },
  { name: 'Boost', country: 'MY', industry: 'fintech', size: 'growth', employeeCount: 400, annualRevenue: 75_000_000, regulatoryBody: 'BNM', amlMaturity: 'basic' },
  { name: 'BigPay', country: 'MY', industry: 'fintech', size: 'starter', employeeCount: 180, annualRevenue: 35_000_000, regulatoryBody: 'BNM', amlMaturity: 'basic' },
  { name: 'Luno Malaysia', country: 'MY', industry: 'crypto_exchange', size: 'starter', employeeCount: 100, annualRevenue: 28_000_000, regulatoryBody: 'BNM', amlMaturity: 'intermediate' },
  { name: 'RHB Bank', country: 'MY', industry: 'bank', size: 'enterprise', employeeCount: 14000, annualRevenue: 4_200_000_000, regulatoryBody: 'BNM', amlMaturity: 'intermediate' },
  { name: 'Allianz Malaysia', country: 'MY', industry: 'insurance', size: 'growth', employeeCount: 2500, annualRevenue: 1_800_000_000, regulatoryBody: 'BNM', amlMaturity: 'basic' },
  { name: 'GXBank', country: 'MY', industry: 'fintech', size: 'starter', employeeCount: 250, annualRevenue: 15_000_000, regulatoryBody: 'BNM', amlMaturity: 'basic' },
  { name: 'Versa', country: 'MY', industry: 'fintech', size: 'starter', employeeCount: 50, annualRevenue: 8_000_000, regulatoryBody: 'BNM', amlMaturity: 'basic' },

  // ── Taiwan (10) ────────────────────────────────────────────────────────
  { name: 'CTBC Bank', country: 'TW', industry: 'bank', size: 'enterprise', employeeCount: 25000, annualRevenue: 8_500_000_000, regulatoryBody: 'FSC', amlMaturity: 'advanced' },
  { name: 'Cathay Financial Holdings', country: 'TW', industry: 'bank', size: 'enterprise', employeeCount: 50000, annualRevenue: 15_000_000_000, regulatoryBody: 'FSC', amlMaturity: 'advanced' },
  { name: 'E.SUN Bank', country: 'TW', industry: 'bank', size: 'enterprise', employeeCount: 9000, annualRevenue: 3_200_000_000, regulatoryBody: 'FSC', amlMaturity: 'intermediate' },
  { name: 'Taishin Bank', country: 'TW', industry: 'bank', size: 'growth', employeeCount: 7000, annualRevenue: 2_800_000_000, regulatoryBody: 'FSC', amlMaturity: 'intermediate' },
  { name: 'Line Bank Taiwan', country: 'TW', industry: 'fintech', size: 'growth', employeeCount: 300, annualRevenue: 60_000_000, regulatoryBody: 'FSC', amlMaturity: 'basic' },
  { name: 'Street Pay', country: 'TW', industry: 'payment_processor', size: 'starter', employeeCount: 80, annualRevenue: 20_000_000, regulatoryBody: 'FSC', amlMaturity: 'basic' },
  { name: 'MaiCoin', country: 'TW', industry: 'crypto_exchange', size: 'starter', employeeCount: 60, annualRevenue: 15_000_000, regulatoryBody: 'FSC', amlMaturity: 'basic' },
  { name: 'Fubon Financial', country: 'TW', industry: 'bank', size: 'enterprise', employeeCount: 35000, annualRevenue: 12_000_000_000, regulatoryBody: 'FSC', amlMaturity: 'intermediate' },
  { name: 'SinoPac Financial', country: 'TW', industry: 'bank', size: 'growth', employeeCount: 8000, annualRevenue: 2_500_000_000, regulatoryBody: 'FSC', amlMaturity: 'intermediate' },
  { name: 'Rakuten Bank Taiwan', country: 'TW', industry: 'fintech', size: 'starter', employeeCount: 150, annualRevenue: 30_000_000, regulatoryBody: 'FSC', amlMaturity: 'basic' },

  // ── Australia (10) ─────────────────────────────────────────────────────
  { name: 'Westpac', country: 'AU', industry: 'bank', size: 'enterprise', employeeCount: 40000, annualRevenue: 18_000_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'advanced' },
  { name: 'ANZ Bank', country: 'AU', industry: 'bank', size: 'enterprise', employeeCount: 38000, annualRevenue: 16_500_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'advanced' },
  { name: 'Macquarie Group', country: 'AU', industry: 'bank', size: 'enterprise', employeeCount: 19000, annualRevenue: 12_800_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'advanced' },
  { name: 'Afterpay (Block)', country: 'AU', industry: 'fintech', size: 'growth', employeeCount: 1500, annualRevenue: 900_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'intermediate' },
  { name: 'Airwallex', country: 'AU', industry: 'payment_processor', size: 'growth', employeeCount: 1200, annualRevenue: 500_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'intermediate' },
  { name: 'Swyftx', country: 'AU', industry: 'crypto_exchange', size: 'starter', employeeCount: 200, annualRevenue: 65_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'basic' },
  { name: 'Judo Bank', country: 'AU', industry: 'bank', size: 'growth', employeeCount: 700, annualRevenue: 350_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'intermediate' },
  { name: 'Tyro Payments', country: 'AU', industry: 'payment_processor', size: 'growth', employeeCount: 600, annualRevenue: 280_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'intermediate' },
  { name: 'Zip Co', country: 'AU', industry: 'fintech', size: 'growth', employeeCount: 800, annualRevenue: 400_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'basic' },
  { name: 'CoinSpot', country: 'AU', industry: 'crypto_exchange', size: 'starter', employeeCount: 90, annualRevenue: 35_000_000, regulatoryBody: 'AUSTRAC', amlMaturity: 'basic' },

  // ── Philippines (10) ───────────────────────────────────────────────────
  { name: 'BDO Unibank', country: 'PH', industry: 'bank', size: 'enterprise', employeeCount: 28000, annualRevenue: 5_200_000_000, regulatoryBody: 'BSP', amlMaturity: 'intermediate' },
  { name: 'BPI (Bank of the Philippine Islands)', country: 'PH', industry: 'bank', size: 'enterprise', employeeCount: 22000, annualRevenue: 4_100_000_000, regulatoryBody: 'BSP', amlMaturity: 'intermediate' },
  { name: 'UnionBank of the Philippines', country: 'PH', industry: 'bank', size: 'enterprise', employeeCount: 5000, annualRevenue: 1_800_000_000, regulatoryBody: 'BSP', amlMaturity: 'intermediate' },
  { name: 'GCash (Mynt)', country: 'PH', industry: 'fintech', size: 'growth', employeeCount: 2000, annualRevenue: 650_000_000, regulatoryBody: 'BSP', amlMaturity: 'intermediate' },
  { name: 'Maya (PayMaya)', country: 'PH', industry: 'fintech', size: 'growth', employeeCount: 1000, annualRevenue: 350_000_000, regulatoryBody: 'BSP', amlMaturity: 'basic' },
  { name: 'Coins.ph', country: 'PH', industry: 'crypto_exchange', size: 'starter', employeeCount: 200, annualRevenue: 45_000_000, regulatoryBody: 'BSP', amlMaturity: 'basic' },
  { name: 'Metrobank', country: 'PH', industry: 'bank', size: 'enterprise', employeeCount: 15000, annualRevenue: 3_500_000_000, regulatoryBody: 'BSP', amlMaturity: 'intermediate' },
  { name: 'Security Bank', country: 'PH', industry: 'bank', size: 'growth', employeeCount: 5000, annualRevenue: 1_200_000_000, regulatoryBody: 'BSP', amlMaturity: 'basic' },
  { name: 'Tonik Digital Bank', country: 'PH', industry: 'fintech', size: 'starter', employeeCount: 300, annualRevenue: 25_000_000, regulatoryBody: 'BSP', amlMaturity: 'basic' },
  { name: 'PDAX', country: 'PH', industry: 'crypto_exchange', size: 'starter', employeeCount: 80, annualRevenue: 15_000_000, regulatoryBody: 'BSP', amlMaturity: 'basic' },
];

// ─── Sales Rep Definitions ──────────────────────────────────────────────────

export const SALES_REP_DEFS = [
  { id: 'SR01', employeeId: 'E005', name: 'David Park', region: 'SG' as Country, quota: 2_500_000 },
  { id: 'SR02', employeeId: 'E040', name: 'Rachel Lim', region: 'SG' as Country, quota: 1_800_000 },
  { id: 'SR03', employeeId: 'E041', name: 'Brandon Chia', region: 'SG' as Country, quota: 1_200_000 },
  { id: 'SR04', employeeId: 'E043', name: 'Chong Wei Keat', region: 'MY' as Country, quota: 1_500_000 },
  { id: 'SR05', employeeId: 'E042', name: 'Nurul Aisyah', region: 'MY' as Country, quota: 1_000_000 },
  { id: 'SR06', employeeId: 'E044', name: 'Chang Hsiao-Wen', region: 'TW' as Country, quota: 1_200_000 },
  { id: 'SR07', employeeId: 'E045', name: 'Alyssa Thompson', region: 'AU' as Country, quota: 1_800_000 },
  { id: 'SR08', employeeId: 'E046', name: 'Michael Zhang', region: 'AU' as Country, quota: 1_000_000 },
  { id: 'SR09', employeeId: 'E047', name: 'Fatima Gutierrez', region: 'PH' as Country, quota: 800_000 },
] as const;

// ─── Product Modules with Pricing ───────────────────────────────────────────

export const PRODUCT_MODULES = [
  { name: 'Transaction Monitoring', basePrice: 120_000, tier: 'core' },
  { name: 'KYC/CDD Automation', basePrice: 80_000, tier: 'core' },
  { name: 'PEP & Sanctions Screening', basePrice: 60_000, tier: 'core' },
  { name: 'STR/CTR Filing', basePrice: 40_000, tier: 'addon' },
  { name: 'Risk Scoring Engine', basePrice: 50_000, tier: 'addon' },
  { name: 'Regulatory Reporting', basePrice: 35_000, tier: 'addon' },
] as const;

// ─── Department to Channel Mapping ──────────────────────────────────────────

export const DEPT_CHANNELS: Record<string, string[]> = {
  Engineering: ['engineering', 'general', 'product'],
  Sales: ['sales', 'general', 'apac-regional'],
  'Customer Success': ['cs-support', 'general', 'sales'],
  Product: ['product', 'engineering', 'general'],
  Marketing: ['marketing', 'general', 'sales'],
  Operations: ['general', 'apac-regional'],
  Finance: ['general', 'leadership'],
  Leadership: ['leadership', 'general', 'engineering', 'sales', 'product'],
  People: ['general', 'leadership'],
};

// ─── Open Positions (for KPI tracking) ──────────────────────────────────────

export const OPEN_POSITIONS = [
  { role: 'Senior Backend Engineer', department: 'Engineering', country: 'SG' as Country },
  { role: 'ML Engineer', department: 'Engineering', country: 'TW' as Country },
  { role: 'Account Executive', department: 'Sales', country: 'AU' as Country },
  { role: 'Account Executive', department: 'Sales', country: 'PH' as Country },
  { role: 'CSM', department: 'Customer Success', country: 'TW' as Country },
  { role: 'DevOps Engineer', department: 'Engineering', country: 'SG' as Country },
  { role: 'Product Manager', department: 'Product', country: 'SG' as Country },
] as const;
